import express, { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { authenticate, AuthRequest } from '../middleware/auth';
import LeaveRequest from '../models/LeaveRequest';
import LeaveBalance from '../models/LeaveBalance';
import LeaveType from '../models/LeaveType';
import Employee from '../models/Employee';
import { processEmployeePunches } from '../services/attendanceProcessor';
import { sendLeaveSubmittedEmail, sendLeaveStatusEmail } from '../utils/email';

const router = express.Router();

/**
 * Sandwich Rule: Calculate leave days between two dates.
 * Weekends (Saturdays/Sundays) are excluded, unless they are "sandwiched"
 * (i.e. preceded by a requested weekday leave and followed by a requested weekday leave within the range).
 */
const getLeaveDaysCountWithSandwich = (start: Date, end: Date, sandwichEnabled: boolean): number => {
    const dates: Date[] = [];
    const cur = new Date(start);
    while (cur <= end) {
        dates.push(new Date(cur));
        cur.setDate(cur.getDate() + 1);
    }

    let count = 0;
    for (let i = 0; i < dates.length; i++) {
        const d = dates[i];
        const dayOfWeek = d.getDay(); // 0 = Sunday, 6 = Saturday
        
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            count++;
        } else if (sandwichEnabled) {
            // Weekend day. Sandwiched if there is a weekday in the request before AND after it.
            let hasBefore = false;
            let hasAfter = false;
            for (let j = 0; j < i; j++) {
                const dayJ = dates[j].getDay();
                if (dayJ !== 0 && dayJ !== 6) {
                    hasBefore = true;
                    break;
                }
            }
            for (let j = i + 1; j < dates.length; j++) {
                const dayJ = dates[j].getDay();
                if (dayJ !== 0 && dayJ !== 6) {
                    hasAfter = true;
                    break;
                }
            }
            if (hasBefore && hasAfter) {
                count++;
            }
        }
    }
    return count;
};

/**
 * Dynamic balancer initialization helper.
 * Self-heals/migrates old hardcoded schemas on the fly.
 */
const ensureBalancesInitialized = (balance: any, activeTypes: any[]): boolean => {
    let modified = false;
    if (!balance.balances) {
        balance.balances = [];
        modified = true;
    }

    // 1. Migrate legacy columns if present
    const legacyKeys = ['annual', 'sick', 'casual'];
    for (const key of legacyKeys) {
        if (balance[key] && balance[key].total !== undefined && !balance.balances.find((b: any) => b.leaveTypeCode === key)) {
            balance.balances.push({
                leaveTypeCode: key,
                total: balance[key].total,
                used: balance[key].used || 0,
                pending: balance[key].pending || 0
            });
            balance[key] = undefined;
            modified = true;
        }
    }

    // 2. Map all active categories
    for (const t of activeTypes) {
        const existing = balance.balances.find((b: any) => b.leaveTypeCode === t.code);
        if (!existing) {
            balance.balances.push({
                leaveTypeCode: t.code,
                total: t.defaultDays,
                used: 0,
                pending: 0
            });
            modified = true;
        }
    }
    return modified;
};

// GET /api/leaves/today - Get all employees on leave today
router.get('/today', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const today = new Date();
        // Get today's date string in YYYY-MM-DD format based on local server time, without UTC shift
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const startOfDayStr = `${year}-${month}-${day}`;
        
        // Find leaves that cover today and are Approved
        const leaves = await LeaveRequest.find({
            status: 'Approved',
            startDate: { $lte: startOfDayStr },
            endDate: { $gte: startOfDayStr }
        }).lean() as any[];

        const employeeIds = [...new Set(leaves.map((l: any) => l.employeeId))];
        const employees = await mongoose.model('Employee').find({ 
            $or: [
                { employeeId: { $in: employeeIds } },
                { _id: { $in: employeeIds.filter((id: string) => id && id.length === 24) } },
                { userId: { $in: employeeIds.filter((id: string) => id && id.length === 24) } }
            ]
        }).select('_id employeeId userId firstName lastName avatar').lean();

        const empMap = new Map();
        const avatarMap = new Map();
        employees.forEach((e: any) => {
            const fullName = `${e.firstName} ${e.lastName}`;
            const avatar = e.avatar;
            if (e.employeeId) empMap.set(e.employeeId, fullName);
            if (e._id) empMap.set(e._id.toString(), fullName);
            if (e.userId) empMap.set(e.userId, fullName);

            if (e.employeeId) avatarMap.set(e.employeeId, avatar);
            if (e._id) avatarMap.set(e._id.toString(), avatar);
            if (e.userId) avatarMap.set(e.userId, avatar);
        });

        const uniqueLeavesMap = new Map();
        leaves.forEach((l: any) => {
            if (!uniqueLeavesMap.has(l.employeeId)) {
                uniqueLeavesMap.set(l.employeeId, l);
            }
        });

        const todayLeaves = Array.from(uniqueLeavesMap.values()).map((l: any) => ({
            id: l._id,
            employeeName: empMap.get(l.employeeId) || 'Unknown',
            avatar: avatarMap.get(l.employeeId),
            type: l.type,
            startDate: l.startDate,
            endDate: l.endDate
        }));

        res.json({ success: true, data: todayLeaves });
    } catch (error) {
        next(error);
    }
});

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

// GET /api/leaves/balances/all - Get leave balances of all employees (Admin only)
router.get('/balances/all', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const user = authReq.user as any;
        if (!['super-admin', 'admin'].includes(user?.role || '')) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const year = Number(req.query.year) || new Date().getFullYear();

        // Fetch all active leave types
        const activeTypes = await LeaveType.find({ isActive: true }).sort({ name: 1 });

        // Fetch all employees
        const employees = await Employee.find().select('userId firstName lastName employeeId email jobInfo');

        // Fetch all leave balances for the given year
        const balances = await LeaveBalance.find({ year });

        // Build list of employees with their balances
        const data = employees.map(emp => {
            const userIdStr = emp.userId?.toString();
            // Find existing balance doc
            let empBalanceDoc = balances.find(b => b.employeeId === userIdStr);
            
            let empBalances = activeTypes.map(type => {
                let balCat = empBalanceDoc?.balances?.find((b: any) => b.leaveTypeCode === type.code);
                return {
                    leaveTypeCode: type.code,
                    leaveTypeName: type.name,
                    total: balCat ? balCat.total : type.defaultDays,
                    used: balCat ? balCat.used : 0,
                    pending: balCat ? balCat.pending : 0,
                    available: balCat 
                        ? Math.max(0, balCat.total - (balCat.used || 0) - (balCat.pending || 0)) 
                        : type.defaultDays
                };
            });

            return {
                employeeId: emp.employeeId,
                userId: emp.userId,
                name: `${emp.firstName} ${emp.lastName}`,
                email: emp.email,
                designation: emp.jobInfo?.designation || 'N/A',
                department: emp.jobInfo?.department || 'N/A',
                balances: empBalances
            };
        });

        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

// GET /api/leaves/balance - Get personal leave balance (with optional query parameter for admins)
router.get('/balance', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const employeeId = authReq.query.employeeId ? String(authReq.query.employeeId) : authReq.user?.userId;
        if (!employeeId) {
            return res.status(400).json({ success: false, message: 'No Employee profile linked to this user' });
        }

        // Only admins can query other users' balances
        if (authReq.user?.role === 'employee' && employeeId !== authReq.user?.userId) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const year = authReq.query.year ? Number(authReq.query.year) : new Date().getFullYear();
        let balance = await LeaveBalance.findOne({ employeeId, year });
        if (!balance) {
            balance = new LeaveBalance({ employeeId, year, balances: [] });
        }

        const activeTypes = await LeaveType.find({ isActive: true });
        const modified = ensureBalancesInitialized(balance, activeTypes);
        if (modified || balance.isNew) {
            await balance.save();
        }

        res.json({ success: true, data: balance });
    } catch (error) {
        next(error);
    }
});

// GET /api/leaves/types - Fetch leave types (active-only by default, returns all for admin)
router.get('/types', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const user = authReq.user as any;
        const isAdmin = ['super-admin', 'admin'].includes(user?.role || '');
        const query: any = {};
        if (!isAdmin || req.query.activeOnly === 'true') {
            query.isActive = true;
        }
        const types = await LeaveType.find(query).sort({ createdAt: 1 });
        res.json({ success: true, data: types });
    } catch (error) {
        next(error);
    }
});

// POST /api/leaves/types - Create a new leave type (Admin only)
router.post('/types', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const user = authReq.user as any;
        if (!['super-admin', 'admin'].includes(user?.role || '')) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        const { name, defaultDays, isPaid, isActive, sandwichRuleEnabled } = req.body;
        if (!name || defaultDays === undefined) {
            return res.status(400).json({ success: false, message: 'Name and defaultDays are required' });
        }

        const code = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        const existing = await LeaveType.findOne({ code });
        if (existing) {
            return res.status(400).json({ success: false, message: `A leave type with name/code '${name}' already exists` });
        }

        const newType = await LeaveType.create({
            name,
            code,
            defaultDays: Number(defaultDays),
            isPaid: isPaid !== false,
            isActive: isActive !== false,
            sandwichRuleEnabled: sandwichRuleEnabled !== false
        });

        res.status(201).json({ success: true, data: newType });
    } catch (error) {
        next(error);
    }
});

// PUT /api/leaves/types/:id - Update leave type details (Admin only)
router.put('/types/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const user = authReq.user as any;
        if (!['super-admin', 'admin'].includes(user?.role || '')) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        const { name, defaultDays, isPaid, isActive, sandwichRuleEnabled } = req.body;
        const leaveType = await LeaveType.findById(req.params.id);
        if (!leaveType) {
            return res.status(404).json({ success: false, message: 'Leave type not found' });
        }

        if (name) {
            leaveType.name = name;
            leaveType.code = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        }
        if (defaultDays !== undefined) {
            leaveType.defaultDays = Number(defaultDays);
        }
        if (isPaid !== undefined) {
            leaveType.isPaid = isPaid;
        }
        if (isActive !== undefined) {
            leaveType.isActive = isActive;
        }
        if (sandwichRuleEnabled !== undefined) {
            leaveType.sandwichRuleEnabled = sandwichRuleEnabled;
        }

        await leaveType.save();
        res.json({ success: true, data: leaveType });
    } catch (error) {
        next(error);
    }
});

// DELETE /api/leaves/types/:id - Soft-delete/deactivate leave type (Admin only)
router.delete('/types/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const user = authReq.user as any;
        if (!['super-admin', 'admin'].includes(user?.role || '')) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        const leaveType = await LeaveType.findById(req.params.id);
        if (!leaveType) {
            return res.status(404).json({ success: false, message: 'Leave type not found' });
        }

        leaveType.isActive = false;
        await leaveType.save();
        res.json({ success: true, message: 'Leave type deactivated successfully' });
    } catch (error) {
        next(error);
    }
});

// PUT /api/leaves/balance/:employeeId - Adjust specific employee's leave balance (Admin only)
router.put('/balance/:employeeId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const user = authReq.user as any;
        if (!['super-admin', 'admin'].includes(user?.role || '')) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        const { employeeId } = req.params;
        const { leaveTypeCode, total } = req.body;
        const year = req.body.year ? Number(req.body.year) : new Date().getFullYear();

        if (!leaveTypeCode || total === undefined) {
            return res.status(400).json({ success: false, message: 'leaveTypeCode and total are required' });
        }

        let balance = await LeaveBalance.findOne({ employeeId, year });
        if (!balance) {
            balance = new LeaveBalance({ employeeId, year, balances: [] });
        }

        const activeTypes = await LeaveType.find({ isActive: true });
        ensureBalancesInitialized(balance, activeTypes);

        const category = balance.balances.find((b: any) => b.leaveTypeCode === leaveTypeCode);
        if (category) {
            category.total = Number(total);
        } else {
            balance.balances.push({
                leaveTypeCode,
                total: Number(total),
                used: 0,
                pending: 0
            });
        }

        balance.markModified('balances');
        await balance.save();

        res.json({ success: true, message: 'Employee leave balance updated successfully', data: balance });
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
        
        if (role === 'manager') {
            const managerEmployee = await mongoose.model('Employee').findOne({ userId });
            
            if (managerEmployee) {
                const directReports = await mongoose.model('Employee').find({ 
                    'jobInfo.reportingManager': managerEmployee.employeeId 
                }).select('employeeId _id userId');

                const directReportIds = directReports.map(emp => emp.userId).filter(Boolean);
                filter.employeeId = { $in: directReportIds };
            } else {
                filter.employeeId = { $in: [] };
            }
        }

        const leaves = await LeaveRequest.find(filter).sort({ createdAt: -1 }).lean() as any[];
        const employeeIds = [...new Set(leaves.map(l => l.employeeId))];
        
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
        const { startDate, endDate, type, reason, duration = 'Full Day', startTime, endTime } = req.body;
        let employeeId = authReq.user?.userId; 
        if (req.body.employeeId) {
            if (!['admin', 'super-admin', 'hr'].includes(authReq.user?.role || '')) {
                return res.status(403).json({ message: 'Forbidden: Cannot apply on behalf of others' });
            }
            employeeId = req.body.employeeId;
        }
        if (!employeeId) return res.status(401).json({ message: 'Unauthorized' });

        const start = new Date(startDate);
        const end = new Date(endDate);
        if (start > end) {
            return res.status(400).json({ message: 'Start date must be before end date' });
        }

        // 1. Validate leave type exists first to know Sandwich toggle
        const requestedTypeCode = type.toLowerCase().trim();
        const leaveType = await LeaveType.findOne({ 
            $or: [
                { name: type },
                { code: requestedTypeCode }
            ],
            isActive: true 
        });
        if (!leaveType) {
            return res.status(400).json({ message: `Invalid or inactive leave type: ${type}` });
        }

        const leaveTypeCode = leaveType.code;

        const sandwichEnabled = leaveType.sandwichRuleEnabled !== false;

        let requestedDurationDays = 1;
        if (duration === 'Half Day - Morning' || duration === 'Half Day - Afternoon') {
            if (start.getTime() !== end.getTime()) {
                return res.status(400).json({ message: 'Partial leaves must be on a single date' });
            }
            requestedDurationDays = 0.5;
        } else if (duration === 'Specify Time') {
            if (start.getTime() !== end.getTime()) {
                return res.status(400).json({ message: 'Specify time leaves must be on a single date' });
            }
            if (!startTime || !endTime) {
                return res.status(400).json({ message: 'Start and end time are required' });
            }
            const [sH, sM] = startTime.split(':').map(Number);
            const [eH, eM] = endTime.split(':').map(Number);
            const diffHours = (eH + eM / 60) - (sH + sM / 60);
            if (diffHours <= 0) return res.status(400).json({ message: 'End time must be after start time' });
            requestedDurationDays = Number((diffHours / 8).toFixed(2));
        }

        const daysRequested = getLeaveDaysCountWithSandwich(start, end, sandwichEnabled);
        if (daysRequested <= 0) {
            return res.status(400).json({ message: 'Leave request must include at least one working day' });
        }

        // 2. Calculate Sandwich/working days per year
        const yearDaysMap = new Map<number, number>();
        const dates: Date[] = [];
        let cur = new Date(start);
        while (cur <= end) {
            dates.push(new Date(cur));
            cur.setDate(cur.getDate() + 1);
        }

        for (let i = 0; i < dates.length; i++) {
            const d = dates[i];
            const dayOfWeek = d.getDay();
            let isSandwiched = false;
            
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                isSandwiched = true;
            } else if (sandwichEnabled) {
                let hasBefore = false;
                let hasAfter = false;
                for (let j = 0; j < i; j++) {
                    if (dates[j].getDay() !== 0 && dates[j].getDay() !== 6) {
                        hasBefore = true;
                        break;
                    }
                }
                for (let j = i + 1; j < dates.length; j++) {
                    if (dates[j].getDay() !== 0 && dates[j].getDay() !== 6) {
                        hasAfter = true;
                        break;
                    }
                }
                if (hasBefore && hasAfter) {
                    isSandwiched = true;
                }
            }

            if (isSandwiched) {
                const year = d.getFullYear();
                let dayDeduction = 1;
                if (duration !== 'Full Day' && dates.length === 1) {
                    dayDeduction = requestedDurationDays;
                }
                yearDaysMap.set(year, (yearDaysMap.get(year) || 0) + dayDeduction);
            }
        }

        // 3. Atomically check balances and reserve pending
        const session = await mongoose.startSession();
        let createdLeave: any = null;
        let totalDeducted = 0;
        try {
            await session.withTransaction(async () => {
                const activeTypes = await LeaveType.find({ isActive: true }).session(session);

                for (const [year, days] of yearDaysMap.entries()) {
                    let balance = await LeaveBalance.findOne({ employeeId, year }).session(session);
                    if (!balance) {
                        balance = new LeaveBalance({ employeeId, year, balances: [] });
                    }

                    ensureBalancesInitialized(balance, activeTypes);

                    const category = balance.balances.find((b: any) => b.leaveTypeCode === leaveTypeCode);
                    if (!category) {
                        throw new Error(`Insufficient balance category for ${type}`);
                    }

                    const available = category.total - (category.used + category.pending);
                    if (available < days) {
                        throw new Error(`Insufficient ${leaveType.name} leave balance for year ${year}. Requested: ${days}, Available: ${available}`);
                    }

                    // Reserve
                    category.pending += days;
                    balance.markModified('balances');
                    await balance.save({ session });
                }

                // Create Request
                for (const days of yearDaysMap.values()) {
                    totalDeducted += days;
                }

                const leaves = await LeaveRequest.create([{
                    employeeId,
                    startDate,
                    endDate,
                    type: leaveType.name,
                    reason,
                    duration,
                    startTime: duration === 'Specify Time' ? startTime : undefined,
                    endTime: duration === 'Specify Time' ? endTime : undefined,
                    totalDays: totalDeducted,
                    status: 'Pending',
                    appliedBy: authReq.user?.userId,
                    appliedOn: new Date()
                }], { session });
                
                createdLeave = leaves[0];
            });

            res.status(201).json({ success: true, message: 'Leave requested successfully', data: createdLeave });

            // Trigger manager notification email asynchronously
            (async () => {
                try {
                    const emp = await Employee.findOne({
                        $or: [
                            { userId: employeeId },
                            { employeeId: employeeId },
                            { _id: employeeId.length === 24 ? employeeId : new mongoose.Types.ObjectId() }
                        ]
                    });
                    if (emp && emp.jobInfo?.reportingManager) {
                        const manager = await Employee.findOne({ employeeId: emp.jobInfo.reportingManager });
                        const managerEmail = manager?.workEmail || manager?.email;
                        if (managerEmail) {
                            await sendLeaveSubmittedEmail(
                                managerEmail,
                                `${emp.firstName} ${emp.lastName}`,
                                leaveType.name,
                                new Date(startDate).toLocaleDateString(),
                                new Date(endDate).toLocaleDateString(),
                                totalDeducted,
                                req.headers.origin as string
                            );
                        }
                    }
                } catch (emailErr) {
                    console.error('[Leave Email] Failed to send submission email to manager:', emailErr);
                }
            })();
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
        const { status, adminNote } = req.body;
        if (!['Approved', 'Rejected'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const leave = await LeaveRequest.findById(req.params.id);
        if (!leave) return res.status(404).json({ message: 'Leave request not found' });
        if (user.userId === leave.employeeId && user.role !== 'super-admin') {
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
                const requestedTypeCode = leave.type.toLowerCase().trim();
                const leaveType = await LeaveType.findOne({ 
                    $or: [{ name: leave.type }, { code: requestedTypeCode }]
                }).session(session);
                const leaveTypeCode = leaveType ? leaveType.code : requestedTypeCode;

                // Calculate days per year
                const yearDaysMap = new Map<number, number>();
                const dates: Date[] = [];
                let cur = new Date(start);
                while (cur <= end) {
                    dates.push(new Date(cur));
                    cur.setDate(cur.getDate() + 1);
                }

                for (let i = 0; i < dates.length; i++) {
                    const d = dates[i];
                    const dayOfWeek = d.getDay();
                    let isSandwiched = false;
                    
                    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                        isSandwiched = true;
                    } else {
                        let hasBefore = false;
                        let hasAfter = false;
                        for (let j = 0; j < i; j++) {
                            if (dates[j].getDay() !== 0 && dates[j].getDay() !== 6) {
                                hasBefore = true;
                                break;
                            }
                        }
                        for (let j = i + 1; j < dates.length; j++) {
                            if (dates[j].getDay() !== 0 && dates[j].getDay() !== 6) {
                                hasAfter = true;
                                break;
                            }
                        }
                        if (hasBefore && hasAfter) {
                            isSandwiched = true;
                        }
                    }

                    if (isSandwiched) {
                        const year = d.getFullYear();
                        let dayDeduction = 1;
                        if (leave.duration && leave.duration !== 'Full Day' && dates.length === 1) {
                            dayDeduction = leave.totalDays || 0.5;
                        }
                        yearDaysMap.set(year, (yearDaysMap.get(year) || 0) + dayDeduction);
                    }
                }

                for (const [year, days] of yearDaysMap.entries()) {
                    const balance = await LeaveBalance.findOne({ employeeId: leave.employeeId, year }).session(session);
                    if (balance) {
                        const category = balance.balances.find((b: any) => b.leaveTypeCode === leaveTypeCode);
                        if (category) {
                            category.pending -= days;
                            if (status === 'Approved') {
                                category.used += days;
                            }
                            balance.markModified('balances');
                            await balance.save({ session });
                        }
                    }
                }

                await leave.save({ session });
            });

            res.json({ success: true, message: `Leave ${status.toLowerCase()} successfully`, data: leave });

            // Trigger employee notification email asynchronously
            (async () => {
                try {
                    const emp = await Employee.findOne({
                        $or: [
                            { userId: leave.employeeId },
                            { employeeId: leave.employeeId },
                            { _id: leave.employeeId.length === 24 ? leave.employeeId : new mongoose.Types.ObjectId() }
                        ]
                    });
                    const employeeEmail = emp?.workEmail || emp?.email;
                    if (employeeEmail) {
                        await sendLeaveStatusEmail(
                            employeeEmail,
                            emp ? `${emp.firstName} ${emp.lastName}` : 'Employee',
                            leave.type,
                            new Date(leave.startDate).toLocaleDateString(),
                            new Date(leave.endDate).toLocaleDateString(),
                            status,
                            adminNote || leave.adminNote,
                            req.headers.origin as string
                        );
                    }
                } catch (emailErr) {
                    console.error('[Leave Email] Failed to send status email to employee:', emailErr);
                }
            })();

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

// PUT /api/leaves/:id/revert-status - Revert/Edit Processed Leave
router.put('/:id/revert-status', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const user = authReq.user;
        if (!user || !['super-admin', 'admin'].includes(user.role)) {
            return res.status(403).json({ message: 'Only admins can revert leave statuses' });
        }
        
        const { status, adminNote } = req.body;
        if (!['Pending', 'Approved', 'Rejected'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const leave = await LeaveRequest.findById(req.params.id);
        if (!leave) return res.status(404).json({ message: 'Leave request not found' });
        
        if (leave.status === status) {
            return res.status(400).json({ message: `Leave is already ${status}` });
        }

        const oldStatus = leave.status;
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                leave.status = status;
                leave.approvedBy = user.userId;
                if (adminNote) leave.adminNote = adminNote;

                const start = new Date(leave.startDate);
                const end = new Date(leave.endDate);
                const requestedTypeCode = leave.type.toLowerCase().trim();
                const leaveType = await LeaveType.findOne({ 
                    $or: [{ name: leave.type }, { code: requestedTypeCode }]
                }).session(session);
                const leaveTypeCode = leaveType ? leaveType.code : requestedTypeCode;

                // Calculate days per year (same sandwich logic)
                const yearDaysMap = new Map<number, number>();
                const dates: Date[] = [];
                let cur = new Date(start);
                while (cur <= end) {
                    dates.push(new Date(cur));
                    cur.setDate(cur.getDate() + 1);
                }

                for (let i = 0; i < dates.length; i++) {
                    const d = dates[i];
                    const dayOfWeek = d.getDay();
                    let isSandwiched = false;
                    
                    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                        isSandwiched = true;
                    } else {
                        let hasBefore = false;
                        let hasAfter = false;
                        for (let j = 0; j < i; j++) {
                            if (dates[j].getDay() !== 0 && dates[j].getDay() !== 6) {
                                hasBefore = true; break;
                            }
                        }
                        for (let j = i + 1; j < dates.length; j++) {
                            if (dates[j].getDay() !== 0 && dates[j].getDay() !== 6) {
                                hasAfter = true; break;
                            }
                        }
                        if (hasBefore && hasAfter) isSandwiched = true;
                    }

                    if (isSandwiched) {
                        const year = d.getFullYear();
                        let dayDeduction = 1;
                        if (leave.duration && leave.duration !== 'Full Day' && dates.length === 1) {
                            dayDeduction = leave.totalDays || 0.5;
                        }
                        yearDaysMap.set(year, (yearDaysMap.get(year) || 0) + dayDeduction);
                    }
                }

                for (const [year, days] of yearDaysMap.entries()) {
                    const balance = await LeaveBalance.findOne({ employeeId: leave.employeeId, year }).session(session);
                    if (balance) {
                        const category = balance.balances.find((b: any) => b.leaveTypeCode === leaveTypeCode);
                        if (category) {
                            // Undo old status
                            if (oldStatus === 'Pending') category.pending -= days;
                            if (oldStatus === 'Approved') category.used -= days;
                            
                            // Apply new status
                            if (status === 'Pending') category.pending += days;
                            if (status === 'Approved') category.used += days;
                            
                            balance.markModified('balances');
                            await balance.save({ session });
                        }
                    }
                }

                await leave.save({ session });
            });

            res.json({ success: true, message: `Leave status successfully reverted to ${status}`, data: leave });

            // Always re-sync attendance if it involves an Approved transition
            if (oldStatus === 'Approved' || status === 'Approved') {
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
                    console.error('[Leave Sync] Error updating attendance on revert:', err);
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

// PUT /api/leaves/:id/cancel - Cancel Leave Request
router.put('/:id/cancel', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const user = authReq.user;
        if (!user) return res.status(401).json({ message: 'Unauthorized' });

        const leave = await LeaveRequest.findById(req.params.id);
        if (!leave) return res.status(404).json({ message: 'Leave request not found' });

        const isOwner = user.userId === leave.employeeId;
        const isManagerOrAdmin = ['super-admin', 'admin', 'manager'].includes(user.role);

        if (!isOwner && !isManagerOrAdmin) {
            return res.status(403).json({ message: 'Forbidden: Cannot cancel this leave request' });
        }

        if (leave.status === 'Cancelled') {
            return res.status(400).json({ message: 'Leave is already cancelled' });
        }

        if (leave.status === 'Rejected') {
            return res.status(400).json({ message: 'Cannot cancel a rejected leave' });
        }

        if (leave.status === 'Approved' && !isManagerOrAdmin) {
            return res.status(403).json({ message: 'Only Admins or Managers can cancel approved leaves' });
        }

        const oldStatus = leave.status;
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                leave.status = 'Cancelled';
                leave.approvedBy = user.userId; // track who performed the cancellation action

                const start = new Date(leave.startDate);
                const end = new Date(leave.endDate);
                const requestedTypeCode = leave.type.toLowerCase().trim();
                const leaveType = await LeaveType.findOne({ 
                    $or: [{ name: leave.type }, { code: requestedTypeCode }]
                }).session(session);
                const leaveTypeCode = leaveType ? leaveType.code : requestedTypeCode;

                // Calculate days per year
                const yearDaysMap = new Map<number, number>();
                const dates: Date[] = [];
                let cur = new Date(start);
                while (cur <= end) {
                    dates.push(new Date(cur));
                    cur.setDate(cur.getDate() + 1);
                }

                for (let i = 0; i < dates.length; i++) {
                    const d = dates[i];
                    const dayOfWeek = d.getDay();
                    let isSandwiched = false;
                    
                    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                        isSandwiched = true;
                    } else {
                        let hasBefore = false;
                        let hasAfter = false;
                        for (let j = 0; j < i; j++) {
                            if (dates[j].getDay() !== 0 && dates[j].getDay() !== 6) {
                                hasBefore = true;
                                break;
                            }
                        }
                        for (let j = i + 1; j < dates.length; j++) {
                            if (dates[j].getDay() !== 0 && dates[j].getDay() !== 6) {
                                hasAfter = true;
                                break;
                            }
                        }
                        if (hasBefore && hasAfter) {
                            isSandwiched = true;
                        }
                    }

                    if (isSandwiched) {
                        const year = d.getFullYear();
                        let dayDeduction = 1;
                        if (leave.duration && leave.duration !== 'Full Day' && dates.length === 1) {
                            dayDeduction = leave.totalDays || 0.5;
                        }
                        yearDaysMap.set(year, (yearDaysMap.get(year) || 0) + dayDeduction);
                    }
                }

                for (const [year, days] of yearDaysMap.entries()) {
                    const balance = await LeaveBalance.findOne({ employeeId: leave.employeeId, year }).session(session);
                    if (balance) {
                        const category = balance.balances.find((b: any) => b.leaveTypeCode === leaveTypeCode);
                        if (category) {
                            if (oldStatus === 'Pending') {
                                category.pending -= days;
                                if (category.pending < 0) category.pending = 0;
                            } else if (oldStatus === 'Approved') {
                                category.used -= days;
                                if (category.used < 0) category.used = 0;
                            }
                            balance.markModified('balances');
                            await balance.save({ session });
                        }
                    }
                }

                await leave.save({ session });
            });

            res.json({ success: true, message: 'Leave cancelled successfully', data: leave });

            // Trigger email notification asynchronously
            (async () => {
                try {
                    const emp = await Employee.findOne({
                        $or: [
                            { userId: leave.employeeId },
                            { employeeId: leave.employeeId },
                            { _id: leave.employeeId.length === 24 ? leave.employeeId : new mongoose.Types.ObjectId() }
                        ]
                    });
                    const employeeEmail = emp?.workEmail || emp?.email;
                    if (employeeEmail) {
                        await sendLeaveStatusEmail(
                            employeeEmail,
                            emp ? `${emp.firstName} ${emp.lastName}` : 'Employee',
                            leave.type,
                            new Date(leave.startDate).toLocaleDateString(),
                            new Date(leave.endDate).toLocaleDateString(),
                            'Cancelled',
                            `Cancelled by ${isOwner ? 'Employee' : 'Admin/Manager'}`,
                            req.headers.origin as string
                        );
                    }
                } catch (emailErr) {
                    console.error('[Leave Email] Failed to send status email to employee:', emailErr);
                }
            })();

            // If it was Approved, re-process employee punches to remove the leave day
            if (oldStatus === 'Approved') {
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
                    console.error('[Leave Sync] Error updating attendance on cancel:', err);
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

// DELETE /api/leaves/:id - Delete Leave Request (Admin/Manager only)
router.delete('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const user = authReq.user;
        if (!user || !['super-admin', 'admin', 'manager'].includes(user.role)) {
            return res.status(403).json({ message: 'Forbidden: Admin/Manager access required' });
        }

        const leave = await LeaveRequest.findById(req.params.id);
        if (!leave) return res.status(404).json({ message: 'Leave request not found' });

        const oldStatus = leave.status;
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                if (oldStatus === 'Pending' || oldStatus === 'Approved') {
                    const start = new Date(leave.startDate);
                    const end = new Date(leave.endDate);
                    const requestedTypeCode = leave.type.toLowerCase().trim();
                    const leaveType = await LeaveType.findOne({ 
                        $or: [{ name: leave.type }, { code: requestedTypeCode }]
                    }).session(session);
                    const leaveTypeCode = leaveType ? leaveType.code : requestedTypeCode;

                    // Calculate days per year
                    const yearDaysMap = new Map<number, number>();
                    const dates: Date[] = [];
                    let cur = new Date(start);
                    while (cur <= end) {
                        dates.push(new Date(cur));
                        cur.setDate(cur.getDate() + 1);
                    }

                    for (let i = 0; i < dates.length; i++) {
                        const d = dates[i];
                        const dayOfWeek = d.getDay();
                        let isSandwiched = false;
                        
                        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                            isSandwiched = true;
                        } else {
                            let hasBefore = false;
                            let hasAfter = false;
                            for (let j = 0; j < i; j++) {
                                if (dates[j].getDay() !== 0 && dates[j].getDay() !== 6) {
                                    hasBefore = true;
                                    break;
                                }
                            }
                            for (let j = i + 1; j < dates.length; j++) {
                                if (dates[j].getDay() !== 0 && dates[j].getDay() !== 6) {
                                    hasAfter = true;
                                    break;
                                }
                            }
                            if (hasBefore && hasAfter) {
                                isSandwiched = true;
                            }
                        }

                        if (isSandwiched) {
                            const year = d.getFullYear();
                            let dayDeduction = 1;
                            if (leave.duration && leave.duration !== 'Full Day' && dates.length === 1) {
                                dayDeduction = leave.totalDays || 0.5;
                            }
                            yearDaysMap.set(year, (yearDaysMap.get(year) || 0) + dayDeduction);
                        }
                    }

                    for (const [year, days] of yearDaysMap.entries()) {
                        const balance = await LeaveBalance.findOne({ employeeId: leave.employeeId, year }).session(session);
                        if (balance) {
                            const category = balance.balances.find((b: any) => b.leaveTypeCode === leaveTypeCode);
                            if (category) {
                                if (oldStatus === 'Pending') {
                                    category.pending -= days;
                                    if (category.pending < 0) category.pending = 0;
                                } else if (oldStatus === 'Approved') {
                                    category.used -= days;
                                    if (category.used < 0) category.used = 0;
                                }
                                balance.markModified('balances');
                                await balance.save({ session });
                            }
                        }
                    }
                }

                // Delete the leave document
                await LeaveRequest.findByIdAndDelete(req.params.id).session(session);
            });

            res.json({ success: true, message: 'Leave request deleted successfully' });

            // If it was Approved, re-process employee punches to remove the leave day
            if (oldStatus === 'Approved') {
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
                    console.error('[Leave Sync] Error updating attendance on delete:', err);
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
