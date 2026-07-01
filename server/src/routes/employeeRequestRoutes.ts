import express, { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import fs from 'fs';
import sanitize from 'sanitize-filename';
import EmployeeRequest from '../models/EmployeeRequest';
import Employee from '../models/Employee';
import AttachmentFile from '../models/AttachmentFile';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { upload } from '../middleware/upload';

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

// Create a new request (Employee)
router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const { category, requestType, details } = req.body;
        const userId = authReq.user?.userId;

        const employee = await Employee.findOne({ userId }).select('employeeId');
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
            query = { employeeId: { $in: reportIds } };
        }

        const requests = await EmployeeRequest.find(query).sort({ requestedAt: -1 }).lean();
        
        const employeeIds = [...new Set(requests.map(r => r.employeeId))];
        const employees = await Employee.find({ employeeId: { $in: employeeIds } }).select('employeeId firstName lastName avatar department designation').lean();
        
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
        request.approvedBy = userId;
        request.updatedAt = new Date();

        await request.save();

        res.json(request);
    } catch (err: any) {
        next(err);
    }
});

export default router;
