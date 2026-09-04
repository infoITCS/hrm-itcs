import express, { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import fs from 'fs';
import sanitize from 'sanitize-filename';
import EmployeeRequest from '../models/EmployeeRequest';
import Employee from '../models/Employee';
import AttachmentFile from '../models/AttachmentFile';
import User from '../models/User.model';
import ExpenseClaim from '../models/ExpenseClaim';
import PayrollRun from '../models/PayrollRun';
import LeaveRequest from '../models/LeaveRequest';
import AttendanceRecord from '../models/AttendanceRecord';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { sendEmployeeRequestSubmittedEmail, sendEmployeeRequestStatusEmail } from '../utils/email';
import logger from '../utils/logger';
import { formatEmployeeFullName } from '../utils/nameHelper';

const router = express.Router();

// File upload route for requests
router.post('/upload', authenticate, upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

        const filePath = req.file.path;
        const fileBuffer = fs.readFileSync(filePath);
        
        // Clean up the temp file after reading
        try { fs.unlinkSync(filePath); } catch (e) {}

        const safeFilename = sanitize(req.file.originalname);
        const newAttachmentId = new mongoose.Types.ObjectId();
        
        const authReq = req as AuthRequest;
        const userId = authReq.user?.userId;
        const employee = await Employee.findOne({ userId }).select('employeeId');
        if (!employee) {
            return res.status(400).json({ message: 'Employee profile not found' });
        }

        await AttachmentFile.create({
            _id: newAttachmentId,
            employeeId: employee.employeeId,
            fileData: fileBuffer,
            contentType: req.file.mimetype
        });

        res.status(201).json({
            fileId: newAttachmentId,
            fileName: safeFilename
        });
    } catch (err) {
        next(err);
    }
});

// Download/View file route for requests
router.get('/attachments/:attachmentId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const fileDoc = await AttachmentFile.findById(req.params.attachmentId);
        if (!fileDoc || !fileDoc.fileData) {
            return res.status(404).json({ message: 'Attachment not found' });
        }

        res.set('Content-Type', fileDoc.contentType || 'application/octet-stream');
        res.set('Content-Disposition', `inline; filename="${req.query.name || 'attachment'}"`);
        res.send(fileDoc.fileData);
    } catch (err) {
        next(err);
    }
});

// Fetch current user's PF balance
router.get('/pf-balance', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const userId = authReq.user?.userId;
        const employee = await Employee.findOne({ userId }).select('providentFundBalance');
        if (!employee) {
            return res.status(404).json({ message: 'Employee profile not found' });
        }
        res.json({ pfBalance: employee.providentFundBalance || 0 });
    } catch (err) {
        next(err);
    }
});

// Fetch notifications / pending tasks for the header bell icon
router.get('/notifications', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const role = authReq.user?.role || '';
        const userId = authReq.user?.userId;

        const employee = await Employee.findOne({ userId }).select('employeeId');
        const notifications: any[] = [];

        const isHrOrAdmin = ['admin', 'super-admin', 'hr'].includes(role);
        const isFinanceOnly = role === 'finance';
        const isFinanceOrAdmin = ['admin', 'super-admin', 'finance'].includes(role);
        const isManagerOrAdmin = ['admin', 'super-admin', 'manager'].includes(role);

        // --- Custom Requests / Loans Approver Notifications ---
        let reqQuery: any = null;
        if (role === 'manager' && employee) {
            const directReports = await Employee.find({ 'jobInfo.reportingManager': employee.employeeId }).select('employeeId');
            const reportIds = directReports.map(e => e.employeeId);
            // Managers do not see loan or financial requests (including Loan Pause)
            reqQuery = {
                employeeId: { $in: reportIds },
                status: 'Pending',
                category: { $not: /loan|pf|provident|salary|advance|finance/i },
                requestType: { $not: /loan|pf|provident|salary|advance/i }
            };
        } else if (isHrOrAdmin) {
            // HR and Admins see pending requests (including loans)
            reqQuery = { status: 'Pending' };
        } else if (isFinanceOnly) {
            // Finance only sees non-loan financial requests. Loans are Management/HR exclusive.
            reqQuery = { 
                status: 'Pending',
                $and: [
                    {
                        $or: [
                            { category: { $regex: /finance|pf|provident|salary|advance/i } },
                            { requestType: { $regex: /finance|pf|provident|salary|advance/i } }
                        ]
                    },
                    { category: { $not: /loan/i } },
                    { requestType: { $not: /loan/i } }
                ]
            };
        }

        if (reqQuery) {
            const pendingRequests = await EmployeeRequest.find(reqQuery).sort({ requestedAt: -1 }).limit(10).lean();
            const employeeIds = [...new Set(pendingRequests.map(r => r.employeeId))];
            const employees = await Employee.find({ employeeId: { $in: employeeIds } }).select('employeeId firstName lastName').lean();
            const empMap = employees.reduce((acc: any, emp: any) => {
                acc[emp.employeeId] = emp;
                return acc;
            }, {});

            for (const reqObj of pendingRequests) {
                const emp = empMap[reqObj.employeeId];
                const empName = formatEmployeeFullName(emp, 'Employee');
                const itemLabel = reqObj.requestType || reqObj.category;
                let msg = `Awaiting review for ${itemLabel}.`;
                let title = `Pending: ${itemLabel}`;

                if (reqObj.details?.requestedAmount) {
                    msg = `${empName} requested a ${itemLabel} of Rs. ${reqObj.details.requestedAmount.toLocaleString()}.`;
                } else {
                    const qtyStr = reqObj.details?.quantity ? ` (Qty: ${reqObj.details.quantity})` : '';
                    msg = `${empName} requested ${itemLabel}${qtyStr}.`;
                }

                notifications.push({
                    id: reqObj._id.toString(),
                    title,
                    message: msg,
                    time: reqObj.updatedAt || reqObj.requestedAt,
                    type: 'task',
                    path: '/my-requests/manage'
                });
            }
        }

        // --- Leaves Pending Approvals Notifications ---
        let leaveQuery: any = null;
        if (role === 'manager' && employee) {
            const directReports = await Employee.find({ 'jobInfo.reportingManager': employee.employeeId }).select('employeeId');
            const reportIds = directReports.map(e => e.employeeId);
            leaveQuery = { employeeId: { $in: reportIds }, status: 'Pending' };
        } else if (isHrOrAdmin) {
            leaveQuery = { status: 'Pending' };
        }

        if (leaveQuery) {
            const pendingLeaves = (await LeaveRequest.find(leaveQuery).sort({ createdAt: -1 }).limit(10).lean()) as any[];
            const employeeIds = [...new Set(pendingLeaves.map(l => l.employeeId))];
            const employees = await Employee.find({ employeeId: { $in: employeeIds } }).select('employeeId firstName middleName lastName').lean();
            const empMap = employees.reduce((acc: any, emp: any) => {
                acc[emp.employeeId] = emp;
                return acc;
            }, {});

            for (const leave of pendingLeaves) {
                const emp = empMap[leave.employeeId];
                const empName = formatEmployeeFullName(emp, 'Employee');
                notifications.push({
                    id: leave._id.toString(),
                    title: `Pending Leave: ${leave.type}`,
                    message: `${empName} requested ${leave.totalDays} day(s) from ${new Date(leave.startDate).toLocaleDateString()} to ${new Date(leave.endDate).toLocaleDateString()}.`,
                    time: leave.createdAt,
                    type: 'task',
                    path: '/leave?tab=team-requests'
                });
            }
        }

        // --- Claims Pending Approvals / ERP Tasks ---
        let claimQuery: any = null;
        if (role === 'manager' && employee) {
            claimQuery = {
                status: { $in: ['Pending Team Lead', 'Pending Line Manager'] },
                'approvals': {
                    $elemMatch: {
                        status: 'Pending',
                        assignedToEmployeeId: employee.employeeId
                    }
                }
            };
        } else {
            const statusOrList: any[] = [];
            if (isHrOrAdmin) statusOrList.push({ status: 'Pending HR' });
            if (isFinanceOrAdmin) {
                statusOrList.push({ status: 'Pending Finance' });
                statusOrList.push({ status: 'Approved', erpReferenceId: { $in: [null, ''] } });
            }

            if (statusOrList.length > 0) {
                claimQuery = { $or: statusOrList };
            }
        }

            if (claimQuery) {
                const pendingClaims = await ExpenseClaim.find(claimQuery).sort({ updatedAt: -1 }).limit(10).lean();
                const claimEmpIds = [...new Set(pendingClaims.map(c => c.employeeId))];
                const claimEmployees = await Employee.find({ employeeId: { $in: claimEmpIds } }).select('employeeId firstName middleName lastName').lean();
                const claimEmpMap = claimEmployees.reduce((acc: any, emp: any) => {
                    acc[emp.employeeId] = emp;
                    return acc;
                }, {});

                for (const claim of pendingClaims) {
                    const emp = claimEmpMap[claim.employeeId];
                    const empName = formatEmployeeFullName(emp, 'Employee');
                    let msg = '';
                    let title = '';

                    const isErpTask = claim.status === 'Approved' && !claim.erpReferenceId;
                    if (isErpTask) {
                        title = `ERP Entry Required: Claim`;
                        msg = `Log Rs. ${(claim.approvedTotal || claim.amountAllowed).toLocaleString()} approved ${claim.category} claim for ${empName} in ERP and add ERP ID.`;
                    } else {
                        title = `Pending Approval: ${claim.category} Claim`;
                        msg = `${empName} submitted a ${claim.category} claim of Rs. ${claim.amountRequested.toLocaleString()} for review.`;
                    }

                    notifications.push({
                        id: claim._id.toString(),
                        title,
                        message: msg,
                        time: claim.updatedAt || claim.createdAt,
                        type: 'task',
                        path: isErpTask ? '/claim?tab=history' : '/claim?tab=approvals'
                    });
                }
            }

            // --- Payroll Approvals / ERP Tasks ---
            if (role === 'admin' || role === 'super-admin' || role === 'finance') {
                const pendingPayroll = await PayrollRun.find({
                    $or: [
                        { status: 'Approved' },
                        { status: 'Disbursed', erpReferenceId: { $in: [null, ''] } }
                    ]
                }).sort({ updatedAt: -1 }).limit(5).lean();

                for (const run of pendingPayroll as any[]) {
                    let title = '';
                    let msg = '';
                    if (run.status === 'Approved') {
                        title = `Payroll Disbursement Pending`;
                        msg = `${run.title} is approved. Disburse it and log in ERP.`;
                    } else {
                        title = `ERP Entry Required: Payroll`;
                        msg = `${run.title} disbursed. Log in ERP and write transaction ID.`;
                    }

                    notifications.push({
                        id: run._id.toString(),
                        title,
                        message: msg,
                        time: run.updatedAt || run.createdAt,
                        type: 'task',
                        path: '/payroll'
                    });
                }
            }

        // Employee updates and own pending requests (for employee's own notifications/tasks)
        if (employee) {
            const twentyFourHoursAgo = new Date();
            twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

            // Employee's own pending requests awaiting review
            const pendingEmpRequests = await EmployeeRequest.find({
                employeeId: employee.employeeId,
                status: 'Pending'
            }).sort({ requestedAt: -1 }).limit(5).lean();

            for (const reqObj of pendingEmpRequests) {
                const itemLabel = reqObj.requestType || reqObj.category;
                notifications.push({
                    id: reqObj._id.toString(),
                    title: `Pending Request: ${itemLabel}`,
                    message: `Your request for "${itemLabel}" is awaiting review.`,
                    time: reqObj.updatedAt || reqObj.requestedAt,
                    type: 'task',
                    path: '/my-requests'
                });
            }

            // Employee's own pending leave requests awaiting approval
            const pendingLeaves = (await LeaveRequest.find({
                employeeId: employee.employeeId,
                status: 'Pending'
            }).sort({ createdAt: -1 }).limit(5).lean()) as any[];

            for (const leave of pendingLeaves) {
                notifications.push({
                    id: leave._id.toString(),
                    title: `Pending Leave: ${leave.type}`,
                    message: `Your ${leave.totalDays} day(s) ${leave.type} leave request is awaiting approval.`,
                    time: leave.createdAt,
                    type: 'task',
                    path: '/leave'
                });
            }

            // Employee's own pending expense claims
            const pendingClaims = await ExpenseClaim.find({
                employeeId: employee.employeeId,
                status: { $in: ['Pending Team Lead', 'Pending Line Manager', 'Pending HR', 'Pending Finance'] }
            }).sort({ createdAt: -1 }).limit(5).lean();

            for (const claim of pendingClaims) {
                notifications.push({
                    id: claim._id.toString(),
                    title: `Pending Claim: ${claim.category}`,
                    message: `Your ${claim.category} claim of Rs. ${claim.amountRequested.toLocaleString()} is currently ${claim.status.toLowerCase()}.`,
                    time: claim.updatedAt || claim.createdAt,
                    type: 'task',
                    path: '/claim?tab=mine'
                });
            }

            // Request status updates (Approved/Rejected/Completed in last 24 hours)
            const recentUpdates = await EmployeeRequest.find({
                employeeId: employee.employeeId,
                status: { $in: ['Approved', 'Rejected', 'Completed'] },
                updatedAt: { $gte: twentyFourHoursAgo }
            }).sort({ updatedAt: -1 }).limit(5).lean();

            for (const reqObj of recentUpdates) {
                const itemLabel = reqObj.requestType || reqObj.category;
                const commentStr = reqObj.adminComments ? ` (Comments: "${reqObj.adminComments}")` : '';

                notifications.push({
                    id: reqObj._id.toString(),
                    title: `${itemLabel} Request ${reqObj.status}`,
                    message: `Your request for "${itemLabel}" has been marked as ${reqObj.status.toLowerCase()}.${commentStr}`,
                    time: reqObj.updatedAt,
                    type: reqObj.status === 'Approved' || reqObj.status === 'Completed' ? 'success' : 'alert',
                    path: '/my-requests'
                });
            }

            // Leave status updates (Approved/Rejected in last 24 hours)
            const recentLeaveUpdates = (await LeaveRequest.find({
                employeeId: employee.employeeId,
                status: { $in: ['Approved', 'Rejected'] },
                updatedAt: { $gte: twentyFourHoursAgo }
            }).sort({ updatedAt: -1 }).limit(5).lean()) as any[];

            for (const leave of recentLeaveUpdates) {
                const actionByStr = leave.approvedByName ? ` by ${leave.approvedByName}` : '';
                const noteStr = leave.adminNote ? ` (Note: "${leave.adminNote}")` : '';
                const startStr = new Date(leave.startDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' });
                const endStr = new Date(leave.endDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' });

                notifications.push({
                    id: leave._id.toString(),
                    title: `${leave.type} Leave ${leave.status}`,
                    message: `Your ${leave.type} leave request (${startStr} - ${endStr}) was ${leave.status.toLowerCase()}${actionByStr}.${noteStr}`,
                    time: leave.updatedAt || leave.createdAt,
                    type: leave.status === 'Approved' ? 'success' : 'alert',
                    path: '/leave'
                });
            }

            // Claim status updates (Approved/Declined in last 24 hours)
            const recentClaimUpdates = await ExpenseClaim.find({
                employeeId: employee.employeeId,
                status: { $in: ['Approved', 'Declined'] },
                updatedAt: { $gte: twentyFourHoursAgo }
            }).sort({ updatedAt: -1 }).limit(5).lean();

            for (const claim of recentClaimUpdates) {
                notifications.push({
                    id: claim._id.toString(),
                    title: `${claim.category} Claim ${claim.status === 'Approved' ? 'Approved' : 'Declined'}`,
                    message: claim.status === 'Approved'
                        ? `Your claim of Rs. ${(claim.approvedTotal || claim.amountAllowed).toLocaleString()} has been approved.`
                        : `Your claim of Rs. ${claim.amountRequested.toLocaleString()} has been declined.`,
                    time: claim.updatedAt,
                    type: claim.status === 'Approved' ? 'success' : 'alert',
                    path: '/claim?tab=mine'
                });
            }
        }

        // Sort combined list by time descending
        notifications.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

        res.json(notifications);
    } catch (err) {
        next(err);
    }
});

// Create a new request (Employee)
router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const { category, requestType, details } = req.body;
        const userId = authReq.user?.userId;

        const employee = await Employee.findOne({ userId }).select('employeeId firstName lastName jobInfo');
        if (!employee) {
            return res.status(400).json({ message: 'Employee profile not found for the logged-in user' });
        }

        const isLoan = category === 'Loan' || category === 'Request Loan' || requestType === 'Loan';
        const newRequest = new EmployeeRequest({
            employeeId: employee.employeeId,
            category,
            requestType,
            status: 'Pending',
            details
        });


        if (isLoan) {
            if (details && details.paybackDuration && Number(details.paybackDuration) > 12) {
                return res.status(400).json({ message: 'Loan payback duration cannot exceed 1 year (12 months).' });
            }
        }

        await newRequest.save();

        // Asynchronously notify manager, HR, and admins via email based on request category
        (async () => {
            try {
                let managerEmail: string | undefined;
                const isTeamRequest = category === 'Asset' || category === 'Document' || category === 'HR Document' || category === 'Work From Home (WFH)' || (category || '').includes('WFH');
                if (isTeamRequest && employee.jobInfo?.reportingManager) {
                    const manager = await Employee.findOne({ employeeId: employee.jobInfo.reportingManager }).select('workEmail');
                    if (manager?.workEmail) {
                        managerEmail = manager.workEmail;
                    }
                }

                // HR, Admin, Super-Admin receive (Finance excluded)
                const hrAdmins = await User.find({ role: { $in: ['admin', 'super-admin', 'hr'] } }).select('email');
                const adminEmails = hrAdmins.map(a => a.email).filter(Boolean);

                const recipients: string[] = [];
                if (managerEmail) recipients.push(managerEmail);
                recipients.push(...adminEmails);
                if (process.env.HR_EMAIL) recipients.push(process.env.HR_EMAIL);
                else if (process.env.SMTP_USER) recipients.push(process.env.SMTP_USER);

                const toList = [...new Set(recipients)].join(', ');
                if (toList) {
                    const empName = `${employee.firstName} ${employee.lastName || ''}`.trim();
                    await sendEmployeeRequestSubmittedEmail(toList, empName, category, requestType, details);
                }
            } catch (err: any) {
                logger.error('Failed to send request submitted notification email:', err.message);
            }
        })();

        res.status(201).json(newRequest);
    } catch (err: any) {
        next(err);
    }
});

// Get all requests for the logged-in employee
router.get('/my-requests', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const userId = authReq.user?.userId;
        const employee = await Employee.findOne({ userId }).select('employeeId');
        if (!employee) {
            return res.json([]); // Return empty array if no employee profile
        }

        const requests = await EmployeeRequest.find({ employeeId: employee.employeeId }).sort({ requestedAt: -1 }).lean();
        res.json(requests);
    } catch (err: any) {
        next(err);
    }
});

const getWfhDatesFromRequest = (request: any): string[] => {
    const details = request.details || {};
    if (Array.isArray(details.dates) && details.dates.length > 0) {
        return details.dates.map((d: any) => String(d).split('T')[0]).filter(Boolean);
    }
    if (details.startDate) {
        const start = new Date(details.startDate);
        const end = details.endDate ? new Date(details.endDate) : new Date(details.startDate);
        const dates: string[] = [];
        const cur = new Date(start);
        while (cur <= end) {
            dates.push(cur.toISOString().split('T')[0]);
            cur.setDate(cur.getDate() + 1);
        }
        return dates;
    }
    if (details.wfhDate) {
        return [String(details.wfhDate).split('T')[0]];
    }
    return [];
};

// Cancel a request (Employee)
router.delete('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const userId = authReq.user?.userId;
        const employee = await Employee.findOne({ userId }).select('employeeId');
        if (!employee) {
            return res.status(400).json({ message: 'Employee profile not found' });
        }

        const request = await EmployeeRequest.findOne({ _id: req.params.id, employeeId: employee.employeeId });
        if (!request) {
            return res.status(404).json({ message: 'Request not found' });
        }

        if (request.status !== 'Pending') {
            return res.status(400).json({ message: 'Only Pending requests can be cancelled.' });
        }

        request.status = 'Cancelled';
        await request.save();

        res.json({ message: 'Request cancelled successfully', request });
    } catch (err) {
        next(err);
    }
});

// Get all requests across the company (Admin & Manager)
router.get('/all', authenticate, authorize(['admin', 'super-admin', 'manager', 'hr', 'finance']), async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const role = authReq.user?.role || '';
        const userId = authReq.user?.userId;

        let query = {};

        if (role === 'manager') {
            const managerEmployee = await Employee.findOne({ userId }).select('employeeId');
            if (!managerEmployee) {
                return res.status(404).json({ message: 'Manager employee record not found' });
            }
            // Find employeeIds reporting to this manager
            const directReports = await Employee.find({ 'jobInfo.reportingManager': managerEmployee.employeeId }).select('employeeId');
            const reportIds = directReports.map(e => e.employeeId);
            // Managers do not see any Loan or Financial requests (including Loan Pause)
            query = {
                employeeId: { $in: reportIds },
                category: { $not: /loan|pf|provident|salary|advance|finance/i },
                requestType: { $not: /loan|pf|provident|salary|advance|finance/i }
            };
        } else if (role === 'finance') {
            // Finance role ONLY sees non-loan Financial requests (PF, Salary, Advance, Finance). Loans are Management/HR exclusive.
            query = {
                $and: [
                    {
                        $or: [
                            { category: { $regex: /finance|pf|provident|salary|advance/i } },
                            { requestType: { $regex: /finance|pf|provident|salary|advance/i } }
                        ]
                    },
                    { category: { $not: /loan/i } },
                    { requestType: { $not: /loan/i } }
                ]
            };
        }

        const requests = await EmployeeRequest.find(query).sort({ requestedAt: -1 }).lean();
        
        const employeeIds = [...new Set(requests.map(r => r.employeeId))];
        const employees = await Employee.find({ employeeId: { $in: employeeIds } }).select('employeeId firstName middleName lastName avatar department designation providentFundBalance attachments._id attachments.fileType').lean();
        
        const empMap = employees.reduce((acc: any, emp: any) => {
            acc[emp.employeeId] = emp;
            return acc;
        }, {});

        const enrichedRequests = requests.map(r => ({
            ...r,
            employee: empMap[r.employeeId] || null
        }));

        res.json(enrichedRequests);
    } catch (err: any) {
        next(err);
    }
});

// Toggle or set Payout Status (Paid / Unpaid) for a request (Finance, Admin, Super Admin)
router.patch('/:id/payout-status', authenticate, authorize(['admin', 'super-admin', 'finance']), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { payoutStatus, erpReferenceId, paidAt, remarks } = req.body;
        if (!['Paid', 'Unpaid', 'Included in Payroll'].includes(payoutStatus)) {
            return res.status(400).json({ message: 'Invalid payoutStatus. Must be Paid, Unpaid, or Included in Payroll.' });
        }

        const request = await EmployeeRequest.findById(req.params.id);
        if (!request) {
            return res.status(404).json({ message: 'Request not found' });
        }

        request.payoutStatus = payoutStatus;
        if (payoutStatus === 'Paid') {
            request.paidAt = paidAt ? new Date(paidAt) : new Date();
            if (erpReferenceId) request.erpReferenceId = erpReferenceId.trim();
        } else if (payoutStatus === 'Unpaid') {
            request.paidAt = undefined;
        }

        if (remarks) {
            request.adminComments = remarks.trim();
        }

        request.updatedAt = new Date();
        await request.save();

        res.json({ success: true, message: `Payout status updated to ${payoutStatus}`, request });
    } catch (err) {
        next(err);
    }
});

// Approve or Reject a request (Admin & Manager)
router.patch('/:id/status', authenticate, authorize(['admin', 'super-admin', 'manager', 'hr', 'finance']), async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const { status, adminComments } = req.body;
        const role = authReq.user?.role || '';
        const userId = authReq.user?.userId;
        
        if (!['Pending', 'Pending HR', 'Pending Finance', 'Approved', 'Rejected', 'Completed'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const request = await EmployeeRequest.findById(req.params.id);
        if (!request) {
            return res.status(404).json({ message: 'Request not found' });
        }

        const isLoan = request.category === 'Loan' || request.category === 'Request Loan' || request.requestType === 'Loan';

        // Finance cannot manage or decide on Loans (Management / HR exclusive)
        if (role === 'finance' && isLoan) {
            return res.status(403).json({ message: 'Loans are managed and disbursed exclusively by HR and Management.' });
        }

        // If manager, check if the request belongs to a direct report
        if (role === 'manager') {
            const isFinancialOrLoan = /loan|pf|provident|salary|advance|finance/i.test(request.category || '') ||
                                      /loan|pf|provident|salary|advance|finance/i.test(request.requestType || '');
            if (isFinancialOrLoan) {
                return res.status(403).json({ message: 'Managers are not authorized to decide on loan or financial requests.' });
            }
            const managerEmployee = await Employee.findOne({ userId }).select('employeeId');
            if (!managerEmployee) {
                return res.status(404).json({ message: 'Manager employee record not found' });
            }
            const requestEmployee = await Employee.findOne({ employeeId: request.employeeId }).select('jobInfo.reportingManager');
            if (!requestEmployee || requestEmployee.jobInfo?.reportingManager !== managerEmployee.employeeId) {
                return res.status(403).json({ message: 'You do not have permission to manage this request' });
            }
        }

        request.status = status;

        if (adminComments !== undefined) {
            request.adminComments = adminComments;
        }
        if (req.body.erpReferenceId !== undefined) {
            request.erpReferenceId = req.body.erpReferenceId;
        }
        request.approvedBy = userId;
        request.updatedAt = new Date();

        // ── Auto-Sync Work From Home (WFH) Requests to Attendance Records ──
        const isWfh = (request.category || '').toLowerCase().includes('wfh') ||
                      (request.category || '').toLowerCase().includes('work from home') ||
                      (request.requestType || '').toLowerCase().includes('wfh') ||
                      (request.requestType || '').toLowerCase().includes('work from home') ||
                      Boolean(request.details?.isWfh);

        if (isWfh) {
            const wfhDates = getWfhDatesFromRequest(request);
            if (status === 'Approved') {
                for (const dateStr of wfhDates) {
                    await AttendanceRecord.findOneAndUpdate(
                        { employeeId: request.employeeId, date: dateStr },
                        {
                            $set: {
                                status: 'Present',
                                isWfh: true,
                                note: `Work From Home (Approved Request #${request._id.toString().slice(-6)})`,
                                manuallyAdjusted: true,
                                adjustedBy: `WFH Request (${authReq.user?.email || 'System'})`
                            },
                            $setOnInsert: {
                                location: 'Remote / WFH',
                                workDurationMinutes: 480,
                                lateMinutes: 0,
                                overtimeMinutes: 0
                            }
                        },
                        { upsert: true, new: true }
                    );
                }
            } else if (status === 'Rejected' || status === 'Cancelled') {
                for (const dateStr of wfhDates) {
                    await AttendanceRecord.updateOne(
                        {
                            employeeId: request.employeeId,
                            date: dateStr,
                            note: { $regex: new RegExp(request._id.toString().slice(-6), 'i') }
                        },
                        {
                            $set: {
                                isWfh: false,
                                note: 'WFH Request Cancelled/Rejected'
                            }
                        }
                    );
                }
            }
        }

        // Sync disbursed loan requests directly into Employee.loans array (upon Completed / Paid payout)
        if (isLoan && (status === 'Completed' || req.body.payoutStatus === 'Paid')) {
            request.payoutStatus = 'Paid';
            if (!request.paidAt) request.paidAt = new Date();
            const cat = (request.category || '').toLowerCase();
            const reqType = (request.requestType || '').toLowerCase();
            const isPause = cat.includes('pause') || reqType.includes('pause');

            if (!isPause) {
                const emp = await Employee.findOne({ employeeId: request.employeeId });
                if (emp) {
                    emp.loans = emp.loans || [];
                    const reqIdStr = request._id.toString();
                    const existingLoan = emp.loans.find((l: any) => l.loanId === `LOAN-REQ-${reqIdStr}` || (l.notes && l.notes.includes(reqIdStr)));

                    const reqAmt = Number(request.details?.requestedAmount || 0);
                    const paybackMonths = Number(request.details?.paybackDuration) || 12;
                    const monthlyDeduct = Number(request.details?.recommendedMonthlyDeduction || 0) || Math.ceil(reqAmt / paybackMonths);

                    if (!existingLoan && reqAmt > 0) {
                        emp.loans.push({
                            loanId: `LOAN-REQ-${reqIdStr}`,
                            totalAmount: reqAmt,
                            monthlyInstallment: monthlyDeduct,
                            remainingAmount: reqAmt,
                            status: 'Active',
                            issueDate: new Date(),
                            notes: `Approved Request ${reqIdStr} (${request.requestType || request.category})`
                        } as any);
                        await emp.save();
                    } else if (existingLoan) {
                        existingLoan.status = 'Active';
                        existingLoan.totalAmount = reqAmt;
                        existingLoan.monthlyInstallment = monthlyDeduct;
                        if (existingLoan.remainingAmount === undefined || existingLoan.remainingAmount <= 0) {
                            existingLoan.remainingAmount = reqAmt;
                        }
                        await emp.save();
                    }
                }
            }
        } else if (isLoan && (status === 'Rejected' || status === 'Cancelled')) {
            const reqIdStr = request._id.toString();
            const emp = await Employee.findOne({ employeeId: request.employeeId });
            if (emp && emp.loans) {
                const loan = emp.loans.find((l: any) => l.loanId === `LOAN-REQ-${reqIdStr}` || (l.notes && l.notes.includes(reqIdStr)));
                if (loan) {
                    loan.status = 'Cancelled';
                    loan.remainingAmount = 0;
                    await emp.save();
                }
            }
        }

        await request.save();

        // Asynchronously notify employee via email on status update
        (async () => {
            try {
                const employee = await Employee.findOne({ employeeId: request.employeeId }).select('workEmail personalEmail userId firstName lastName');
                let targetEmail = employee?.workEmail || employee?.personalEmail;
                if (!targetEmail && employee?.userId) {
                    const u = await User.findById(employee.userId).select('email').lean() as any;
                    targetEmail = u?.email;
                }
                if (targetEmail) {
                    const empName = employee ? `${employee.firstName || ''} ${employee.lastName || ''}`.trim() : 'Employee';
                    await sendEmployeeRequestStatusEmail(targetEmail, empName, request.category, request.status, adminComments);
                }
            } catch (err: any) {
                logger.error('Failed to send request status update email:', err.message);
            }
        })();

        res.json(request);
    } catch (err: any) {
        next(err);
    }
});



export default router;
