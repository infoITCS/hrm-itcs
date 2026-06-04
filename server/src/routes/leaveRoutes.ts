import express, { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { authenticate, AuthRequest } from '../middleware/auth';
import LeaveRequest from '../models/LeaveRequest';
import LeaveBalance from '../models/LeaveBalance';
import { processEmployeePunches } from '../services/attendanceProcessor';

const router = express.Router();

/**
 * Calculate the number of week days between two dates
 */
const getLeaveDaysCount = (start: Date, end: Date) => {
    let count = 0;
    const cur = new Date(start);
    while (cur <= end) {
        const day = cur.getDay();
        if (day !== 0 && day !== 6) { // Exclude Sunday (0) and Saturday (6)
            count++;
        }
        cur.setDate(cur.getDate() + 1);
    }
    return count;
};

// GET /api/leaves/mine - Get personal leave history
router.get('/mine', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const employeeId = authReq.user?.userId;
        if (!employeeId) {
            return res.status(400).json({ success: false, message: 'No Employee profile linked to this user' });
        }

        const leaves = await LeaveRequest.find({ employeeId }).sort({ createdAt: -1 });
        res.json({ success: true, data: leaves });
    } catch (error) {
        next(error);
    }
});

// GET /api/leaves/balance - Get personal leave balance
router.get('/balance', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const employeeId = authReq.user?.userId;
        if (!employeeId) {
            return res.status(400).json({ success: false, message: 'No Employee profile linked to this user' });
        }
        const year = new Date().getFullYear();
        const balance = await LeaveBalance.findOneAndUpdate(
            { employeeId, year },
            { $setOnInsert: { employeeId, year } },
            { upsert: true, new: true, runValidators: true }
        );
        res.json({ success: true, data: balance });
    } catch (error) {
        next(error);
    }
});

// GET /api/leaves/all - Get all leave requests (Admin/Manager)
router.get('/all', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const { role, userId } = authReq.user!;
        if (!['super-admin', 'admin', 'manager'].includes(role)) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        let filter: any = {};
        
        // Managers only see their direct reports
        if (role === 'manager') {
            // 1. Find the current manager's employee record
            const managerEmployee = await mongoose.model('Employee').findOne({ userId });
            
            if (managerEmployee) {
                // 2. Find all direct reports for this manager
                // Note: jobInfo.reportingManager stores the manager's employeeId
                const directReports = await mongoose.model('Employee').find({ 
                    'jobInfo.reportingManager': managerEmployee.employeeId 
                }).select('employeeId _id userId');

                const directReportIds = directReports.map(emp => emp.userId).filter(Boolean);

                // 3. Filter requests to only show those from direct reports
                filter.employeeId = { $in: directReportIds };
            } else {
                // If manager has no employee record, they see nothing by default (safer)
                filter.employeeId = { $in: [] };
            }
        }

        const leaves = await LeaveRequest.find(filter).sort({ createdAt: -1 }).lean() as any[];
        
        // Fetch employee names to display in the list
        const employeeIds = [...new Set(leaves.map(l => l.employeeId))];
        
        // Search by employeeId, _id, or user reference
        const employees = await mongoose.model('Employee').find({ 
            $or: [
                { employeeId: { $in: employeeIds } },
                { _id: { $in: employeeIds.filter(id => id.length === 24) } },
                { userId: { $in: employeeIds.filter(id => id.length === 24) } }
            ]
        }).select('_id employeeId userId firstName lastName avatar').lean();

        const empMap = new Map();
        const avatarMap = new Map();
        const readableIdMap = new Map();
        employees.forEach((e: any) => {
            const fullName = `${e.firstName} ${e.lastName}`;
            const rId = e.employeeId;
            const avatar = e.avatar;
            
            if (e.employeeId) empMap.set(e.employeeId, fullName);
            if (e._id) empMap.set(e._id.toString(), fullName);
            if (e.userId) empMap.set(e.userId, fullName);

            if (e.employeeId) avatarMap.set(e.employeeId, avatar);
            if (e._id) avatarMap.set(e._id.toString(), avatar);
            if (e.userId) avatarMap.set(e.userId, avatar);
            
            if (e.employeeId) readableIdMap.set(e.employeeId, rId);
            if (e._id) readableIdMap.set(e._id.toString(), rId);
            if (e.userId) readableIdMap.set(e.userId, rId);
        });

        const enrichedLeaves = leaves.map(l => ({
            ...l,
            employeeName: empMap.get(l.employeeId) || 'Unknown Employee',
            avatar: avatarMap.get(l.employeeId),
            readableId: readableIdMap.get(l.employeeId) || null
        }));

        res.json({ success: true, data: enrichedLeaves });
    } catch (error) {
        next(error);
    }
});

// POST /api/leaves - Apply for leave
router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const { startDate, endDate, type, reason } = req.body;
        const employeeId = authReq.user?.userId; 
        if (!employeeId) return res.status(401).json({ message: 'Unauthorized' });

        const start = new Date(startDate);
        const end = new Date(endDate);
        if (start > end) {
            return res.status(400).json({ message: 'Start date must be before end date' });
        }

        const daysRequested = getLeaveDaysCount(start, end);
        if (daysRequested <= 0) {
            return res.status(400).json({ message: 'Leave request must include at least one working day' });
        }

        // 1. Split range into years and calculate days per year
        const yearDaysMap = new Map<number, number>();
        let cur = new Date(start);
        while (cur <= end) {
            const day = cur.getDay();
            if (day !== 0 && day !== 6) {
                const year = cur.getFullYear();
                yearDaysMap.set(year, (yearDaysMap.get(year) || 0) + 1);
            }
            cur.setDate(cur.getDate() + 1);
        }

        // 2. Validate sufficient balance for each year
        const typeKey = type.toLowerCase() as 'annual' | 'sick' | 'casual';
        if (!['annual', 'sick', 'casual'].includes(typeKey)) {
            return res.status(400).json({ message: 'Invalid leave type. Annual, Sick, and Casual are allowed.' });
        }

        // Check balances and reserve 'pending' atomically
        const session = await mongoose.startSession();
        let createdLeave: any = null;
        try {
            await session.withTransaction(async () => {
                for (const [year, days] of yearDaysMap.entries()) {
                    const balance = await LeaveBalance.findOneAndUpdate(
                        { employeeId, year },
                        { $setOnInsert: { employeeId, year } },
                        { upsert: true, new: true, session }
                    );

                    const category = balance[typeKey];
                    const available = category.total - (category.used + category.pending);

                    if (available < days) {
                        throw new Error(`Insufficient ${type} leave balance for year ${year}. Requested: ${days}, Available: ${available}`);
                    }

                    // Reserve balance
                    await LeaveBalance.updateOne(
                        { _id: balance._id },
                        { $inc: { [`${typeKey}.pending`]: days } },
                        { session }
                    );
                }

                // 3. Create the Leave Request
                const leaves = await LeaveRequest.create([{
                    employeeId,
                    startDate,
                    endDate,
                    type,
                    reason,
                    status: 'Pending',
                    appliedOn: new Date()
                }], { session });
                
                createdLeave = leaves[0];
            });

            res.status(201).json({ success: true, message: 'Leave requested successfully', data: createdLeave });
        } catch (error: any) {
            return res.status(400).json({ success: false, message: error.message });
        } finally {
            session.endSession();
        }
        return;
    } catch (error) {
        next(error);
    }
});

// PUT /api/leaves/:id/status - Approve or Reject Leave
router.put('/:id/status', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const user = authReq.user;
        if (!user || !['super-admin', 'admin', 'manager'].includes(user.role)) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        const { status, adminNote } = req.body; // 'Approved' or 'Rejected'
        if (!['Approved', 'Rejected'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const leave = await LeaveRequest.findById(req.params.id);
        if (!leave) return res.status(404).json({ message: 'Leave request not found' });
        if (user.userId === leave.employeeId) {
            return res.status(403).json({ message: 'Cannot approve/reject your own leave' });
        }
        if (leave.status !== 'Pending') {
            return res.status(400).json({ message: 'Leave request is already processed' });
        }

        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                leave.status = status;
                leave.approvedBy = user.userId;
                if (adminNote) leave.adminNote = adminNote;

                const start = new Date(leave.startDate);
                const end = new Date(leave.endDate);
                const typeKey = leave.type.toLowerCase();

                // Calculate days per year
                const yearDaysMap = new Map<number, number>();
                let cur = new Date(start);
                while (cur <= end) {
                    const day = cur.getDay();
                    if (day !== 0 && day !== 6) {
                        const year = cur.getFullYear();
                        yearDaysMap.set(year, (yearDaysMap.get(year) || 0) + 1);
                    }
                    cur.setDate(cur.getDate() + 1);
                }

                if (!['annual', 'sick', 'casual'].includes(typeKey)) {
                    throw new Error(`Invalid leave type: ${leave.type}. Balance update skipped.`);
                }

                for (const [year, days] of yearDaysMap.entries()) {
                    const update: any = { $inc: { [`${typeKey}.pending`]: -days } };
                    if (status === 'Approved') {
                        update.$inc[`${typeKey}.used`] = days;
                    }
                    
                    await LeaveBalance.updateOne(
                        { employeeId: leave.employeeId, year },
                        update,
                        { session }
                    );
                }

                await leave.save({ session });
            });

            // Commit success response
            res.json({ success: true, message: `Leave ${status.toLowerCase()} successfully`, data: leave });

            // Post-commit: Update attendance records
            if (status === 'Approved') {
                try {
                    const start = new Date(leave.startDate);
                    const end = new Date(leave.endDate);
                    const cur = new Date(start);
                    while (cur <= end) {
                        const dateStr = cur.toISOString().split('T')[0];
                        await processEmployeePunches(leave.employeeId, dateStr, 'INTERNAL');
                        cur.setDate(cur.getDate() + 1);
                    }
                } catch (err) {
                    console.error('[Leave Sync] Error updating attendance:', err);
                }
            }
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        } finally {
            session.endSession();
        }
    } catch (error) {
        next(error);
    }
});

export default router;
