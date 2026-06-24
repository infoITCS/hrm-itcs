import express, { Request, Response, NextFunction } from 'express';
import EmployeeRequest from '../models/EmployeeRequest';
import Employee from '../models/Employee';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';

const router = express.Router();

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

// Get all requests across the company (Admin only)
router.get('/all', authenticate, authorize(['admin', 'super-admin']), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const requests = await EmployeeRequest.find().sort({ requestedAt: -1 }).lean();
        
        // Populate employee info manually if needed, or we can look it up on the frontend
        // To keep it simple, we'll fetch the basic employee info
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

// Approve or Reject a request (Admin only)
router.patch('/:id/status', authenticate, authorize(['admin', 'super-admin']), async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const { status, adminComments } = req.body;
        
        if (!['Pending', 'Approved', 'Rejected', 'Completed'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const request = await EmployeeRequest.findByIdAndUpdate(
            req.params.id,
            { status, adminComments, approvedBy: authReq.user?.userId },
            { new: true }
        );

        if (!request) {
            return res.status(404).json({ message: 'Request not found' });
        }

        res.json(request);
    } catch (err: any) {
        next(err);
    }
});

export default router;
