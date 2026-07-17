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
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { sendEmployeeRequestSubmittedEmail, sendEmployeeRequestStatusEmail } from '../utils/email';
import logger from '../utils/logger';

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

        if (role === 'admin' || role === 'super-admin' || role === 'manager') {
            // Approver Notifications (Pending Tasks)
            let query: any = { status: 'Pending' };
            if (role === 'manager' && employee) {
                const directReports = await Employee.find({ 'jobInfo.reportingManager': employee.employeeId }).select('employeeId');
                const reportIds = directReports.map(e => e.employeeId);
                // Managers do not see loans/request loans
                query = { employeeId: { $in: reportIds }, status: 'Pending', category: { $nin: ['Loan', 'Request Loan'] } };
            } else if (role === 'admin' || role === 'super-admin') {
                // Admins see pending approvals AND approved loan requests that need ERP ID entry to complete
                query = {
                    $or: [
                        { status: 'Pending' },
                        { status: 'Approved', category: { $in: ['Loan', 'Request Loan'] } }
                    ]
                };
            }

            const pendingRequests = await EmployeeRequest.find(query).sort({ requestedAt: -1 }).limit(10).lean();
            const employeeIds = [...new Set(pendingRequests.map(r => r.employeeId))];
            const employees = await Employee.find({ employeeId: { $in: employeeIds } }).select('employeeId firstName lastName').lean();
            const empMap = employees.reduce((acc: any, emp: any) => {
                acc[emp.employeeId] = emp;
                return acc;
            }, {});

            for (const reqObj of pendingRequests) {
                const emp = empMap[reqObj.employeeId];
                const empName = emp ? `${emp.firstName} ${emp.lastName || ''}` : 'Employee';
                let msg = `Awaiting review for ${reqObj.category}.`;
                let title = `Pending: ${reqObj.category}`;

                if (reqObj.status === 'Approved' && (reqObj.category === 'Loan' || reqObj.category === 'Request Loan')) {
                    title = `ERP Entry Required: ${reqObj.category}`;
                    msg = `Log Rs. ${(reqObj.details?.requestedAmount ?? 0).toLocaleString()} payout for ${empName} in ERP and add ERP ID.`;
                } else if (reqObj.details?.requestedAmount) {
                    msg = `${empName} requested a loan of Rs. ${reqObj.details.requestedAmount.toLocaleString()}.`;
                } else {
                    msg = `${empName} requested ${reqObj.category} (${reqObj.requestType}).`;
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
            } else if (role === 'admin' || role === 'super-admin') {
                claimQuery = {
                    $or: [
                        { status: { $in: ['Pending HR', 'Pending Finance'] } },
                        { status: 'Approved', erpReferenceId: { $in: [null, ''] } }
                    ]
                };
            }

            if (claimQuery) {
                const pendingClaims = await ExpenseClaim.find(claimQuery).sort({ updatedAt: -1 }).limit(10).lean();
                const claimEmpIds = [...new Set(pendingClaims.map(c => c.employeeId))];
                const claimEmployees = await Employee.find({ employeeId: { $in: claimEmpIds } }).select('employeeId firstName lastName').lean();
                const claimEmpMap = claimEmployees.reduce((acc: any, emp: any) => {
                    acc[emp.employeeId] = emp;
                    return acc;
                }, {});

                for (const claim of pendingClaims) {
                    const emp = claimEmpMap[claim.employeeId];
                    const empName = emp ? `${emp.firstName} ${emp.lastName || ''}` : 'Employee';
                    let msg = '';
                    let title = '';

                    if (claim.status === 'Approved' && !claim.erpReferenceId) {
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
                        path: '/claim'
                    });
                }
            }

            // --- Payroll Approvals / ERP Tasks ---
            if (role === 'admin' || role === 'super-admin') {
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
        }

        // Employee updates (their own requests updated in last 7 days)
        if (employee) {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            // Request updates
            const recentUpdates = await EmployeeRequest.find({
                employeeId: employee.employeeId,
                status: { $in: ['Approved', 'Rejected', 'Completed'] },
                updatedAt: { $gte: sevenDaysAgo }
            }).sort({ updatedAt: -1 }).limit(10).lean();

            for (const reqObj of recentUpdates) {
                notifications.push({
                    id: reqObj._id.toString(),
                    title: `${reqObj.category} Request ${reqObj.status}`,
                    message: reqObj.adminComments 
                        ? `Comments: "${reqObj.adminComments}"`
                        : `Your request has been marked as ${reqObj.status.toLowerCase()}.`,
                    time: reqObj.updatedAt,
                    type: reqObj.status === 'Approved' || reqObj.status === 'Completed' ? 'success' : 'alert',
                    path: '/my-requests'
                });
            }

            // Claim updates
            const recentClaimUpdates = await ExpenseClaim.find({
                employeeId: employee.employeeId,
                status: { $in: ['Approved', 'Declined'] },
                updatedAt: { $gte: sevenDaysAgo }
            }).sort({ updatedAt: -1 }).limit(10).lean();

            for (const claim of recentClaimUpdates) {
                notifications.push({
                    id: claim._id.toString(),
                    title: `${claim.category} Claim ${claim.status === 'Approved' ? 'Approved' : 'Declined'}`,
                    message: claim.status === 'Approved'
                        ? `Your claim of Rs. ${(claim.approvedTotal || claim.amountAllowed).toLocaleString()} has been approved.`
                        : `Your claim of Rs. ${claim.amountRequested.toLocaleString()} has been declined.`,
                    time: claim.updatedAt,
                    type: claim.status === 'Approved' ? 'success' : 'alert',
                    path: '/claim'
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

        const newRequest = new EmployeeRequest({
            employeeId: employee.employeeId,
            category,
            requestType,
            details
        });

        await newRequest.save();

        // Asynchronously notify manager and admins via email
        (async () => {
            try {
                let managerEmail: string | undefined;
                if (employee.jobInfo?.reportingManager) {
                    const manager = await Employee.findOne({ employeeId: employee.jobInfo.reportingManager }).select('workEmail');
                    if (manager?.workEmail) {
                        managerEmail = manager.workEmail;
                    }
                }

                const admins = await User.find({ role: { $in: ['admin', 'super-admin'] } }).select('email');
                const adminEmails = admins.map(a => a.email).filter(Boolean);

                const recipients = [];
                if (managerEmail) recipients.push(managerEmail);
                recipients.push(...adminEmails);

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
router.get('/all', authenticate, authorize(['admin', 'super-admin', 'manager']), async (req: Request, res: Response, next: NextFunction) => {
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
            // Managers do not see Loan requests
            query = { employeeId: { $in: reportIds }, category: { $nin: ['Loan', 'Request Loan'] } };
        }

        const requests = await EmployeeRequest.find(query).sort({ requestedAt: -1 }).lean();
        
        const employeeIds = [...new Set(requests.map(r => r.employeeId))];
        const employees = await Employee.find({ employeeId: { $in: employeeIds } }).select('employeeId firstName lastName avatar department designation providentFundBalance').lean();
        
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

// Approve or Reject a request (Admin & Manager)
router.patch('/:id/status', authenticate, authorize(['admin', 'super-admin', 'manager']), async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const { status, adminComments } = req.body;
        const role = authReq.user?.role || '';
        const userId = authReq.user?.userId;
        
        if (!['Pending', 'Approved', 'Rejected', 'Completed'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const request = await EmployeeRequest.findById(req.params.id);
        if (!request) {
            return res.status(404).json({ message: 'Request not found' });
        }

        // If manager, check if the request belongs to a direct report
        if (role === 'manager') {
            if (request.category === 'Loan' || request.category === 'Request Loan') {
                return res.status(403).json({ message: 'Managers are not authorized to decide on loan requests.' });
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

        // If completed Loan, record debit log in Employee's PF history automatically
        if (status === 'Completed' && (request.category === 'Loan' || request.category === 'Request Loan')) {
            const reqAmt = request.details?.requestedAmount ?? 0;
            const emp = await Employee.findOne({ employeeId: request.employeeId });
            if (emp && reqAmt > 0) {
                const alreadyLogged = emp.providentFundHistory?.some((h: any) => h.description.includes(request._id.toString()));
                if (!alreadyLogged) {
                    emp.providentFundBalance = (emp.providentFundBalance || 0) - reqAmt;
                    emp.providentFundHistory = emp.providentFundHistory || [];
                    emp.providentFundHistory.push({
                        amount: reqAmt,
                        type: 'debit',
                        source: 'manual',
                        date: new Date(),
                        description: `Loan Approved Payout (Ref: Request ${request._id})`,
                        erpReferenceId: req.body.erpReferenceId || request.erpReferenceId
                    });
                    await emp.save();
                }
            }
        }

        await request.save();

        // Asynchronously notify employee via email
        (async () => {
            try {
                const employee = await Employee.findOne({ employeeId: request.employeeId }).select('workEmail firstName lastName');
                if (employee?.workEmail) {
                    const empName = `${employee.firstName} ${employee.lastName || ''}`.trim();
                    await sendEmployeeRequestStatusEmail(employee.workEmail, empName, request.category, status, adminComments);
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
