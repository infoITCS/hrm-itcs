import express, { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { authenticate, AuthRequest } from '../middleware/auth';
import LeaveRequest from '../models/LeaveRequest';
import LeaveBalance from '../models/LeaveBalance';
import LeaveType from '../models/LeaveType';
import AttendanceRecord from '../models/AttendanceRecord';
import Employee from '../models/Employee';
import { User } from '../models/User.model';
import { processEmployeePunches } from '../services/attendanceProcessor';
import { sendLeaveSubmittedEmail, sendLeaveStatusEmail } from '../utils/email';
import { formatEmployeeFullName } from '../utils/nameHelper';

const router = express.Router();

const roundDays = (num: any): number => Math.round((Number(num || 0) + Number.EPSILON) * 100) / 100;

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
 * Universal day count helper accounting for calendar days vs business/sandwich days.
 */
const getLeaveDaysCount = (start: Date, end: Date, leaveType: any): number => {
    if (leaveType?.isCalendarDays) {
        return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
    }
    return getLeaveDaysCountWithSandwich(start, end, leaveType?.sandwichRuleEnabled !== false);
};

/**
 * Calculates days to deduct per calendar year, respecting calendar days, business days, and sandwich rule.
 */
const calculateLeaveDaysPerYear = (
    start: Date,
    end: Date,
    leaveType: any,
    duration?: string,
    durationDeduction?: number
): Map<number, number> => {
    const yearDaysMap = new Map<number, number>();
    const dates: Date[] = [];
    let cur = new Date(start);
    while (cur <= end) {
        dates.push(new Date(cur));
        cur.setDate(cur.getDate() + 1);
    }

    const isCalendar = leaveType?.isCalendarDays === true;
    const sandwichEnabled = leaveType?.sandwichRuleEnabled !== false;

    for (let i = 0; i < dates.length; i++) {
        const d = dates[i];
        const dayOfWeek = d.getDay();
        let shouldCount = false;

        if (isCalendar) {
            shouldCount = true;
        } else if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            shouldCount = true;
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
                shouldCount = true;
            }
        }

        if (shouldCount) {
            const year = d.getFullYear();
            let dayDeduction = 1;
            if (duration && duration !== 'Full Day' && dates.length === 1) {
                dayDeduction = durationDeduction || 0.5;
            }
            yearDaysMap.set(year, (yearDaysMap.get(year) || 0) + dayDeduction);
        }
    }
    return yearDaysMap;
};

/**
 * Maternity Leave Entitlement Calculator:
 * - Married female employees only
 * - Minimum 6 continuous months of service prior to reference date
 * - 1st Child: 180 calendar days
 * - 2nd Child: 120 calendar days
 * - 3rd Child: 90 calendar days
 * - 4th+ Child: 0 paid days
 */
export const getMaternityEntitlement = async (
    employee: any,
    referenceDate: Date = new Date()
): Promise<{ eligible: boolean; reason?: string; childTier: number; entitledDays: number }> => {
    const gender = (employee?.gender || '').trim().toLowerCase();
    const maritalStatus = (employee?.maritalStatus || '').trim().toLowerCase();

    if (gender !== 'female') {
        return { eligible: false, reason: 'Maternity leave is restricted to female employees.', childTier: 0, entitledDays: 0 };
    }
    if (maritalStatus !== 'married') {
        return { eligible: false, reason: 'Maternity leave is restricted to married female employees.', childTier: 0, entitledDays: 0 };
    }

    const joiningDate = employee?.jobInfo?.joiningDate ? new Date(employee.jobInfo.joiningDate) : null;
    if (!joiningDate || isNaN(joiningDate.getTime())) {
        return { eligible: false, reason: 'Employee joining date is missing. At least 6 months continuous service required.', childTier: 0, entitledDays: 0 };
    }

    const sixMonthsAfterJoining = new Date(joiningDate);
    sixMonthsAfterJoining.setMonth(sixMonthsAfterJoining.getMonth() + 6);
    if (referenceDate < sixMonthsAfterJoining) {
        return { eligible: false, reason: 'Minimum 6 months continuous service required to qualify for paid maternity leave.', childTier: 0, entitledDays: 0 };
    }

    const baselineChildCount = (typeof employee.maternityBaselineChildCount === 'number')
        ? employee.maternityBaselineChildCount
        : (employee.dependents?.filter((d: any) => /child|son|daughter/i.test(d.relation || '')).length || 0);

    const lookupIds = [employee.employeeId, employee.userId, employee._id ? String(employee._id) : ''].filter(Boolean);
    const priorApprovedCount = await LeaveRequest.countDocuments({
        employeeId: { $in: lookupIds },
        status: 'Approved',
        type: { $regex: /maternity/i }
    });

    const currentChildTier = baselineChildCount + priorApprovedCount + 1;
    let entitledDays = 0;
    if (currentChildTier === 1) entitledDays = 180;
    else if (currentChildTier === 2) entitledDays = 120;
    else if (currentChildTier === 3) entitledDays = 90;
    else entitledDays = 0;

    return {
        eligible: entitledDays > 0,
        reason: entitledDays === 0 ? 'Paid maternity leave exhausted (maximum 3 children entitlement reached).' : undefined,
        childTier: currentChildTier,
        entitledDays
    };
};

/**
 * Paternity Leave Entitlement:
 * - Married male employees only
 * - 1 week = 7 business days per child
 */
export const getPaternityEntitlement = (employee: any): { eligible: boolean; reason?: string; entitledDays: number } => {
    const gender = (employee?.gender || '').trim().toLowerCase();
    const maritalStatus = (employee?.maritalStatus || '').trim().toLowerCase();

    if (gender !== 'male') {
        return { eligible: false, reason: 'Paternity leave is restricted to male employees.', entitledDays: 0 };
    }
    if (maritalStatus !== 'married') {
        return { eligible: false, reason: 'Paternity leave is restricted to married male employees.', entitledDays: 0 };
    }

    return { eligible: true, entitledDays: 7 };
};

/**
 * Resolves the dynamic quota for a given leave type and employee.
 */
const resolveEmployeeQuotaForType = async (
    type: any,
    emp: any,
    isPermanent: boolean,
    refDate: Date = new Date()
): Promise<number> => {
    if (!type.isPaid) return type.defaultDays || 0;
    const code = type.code;

    if (code === 'maternity') {
        const mat = await getMaternityEntitlement(emp, refDate);
        return mat.entitledDays;
    }
    if (code === 'paternity') {
        const pat = getPaternityEntitlement(emp);
        return pat.entitledDays;
    }

    if (!isPermanent) return 0;
    return type.defaultDays;
};

/**
 * Dynamic balancer initialization helper.
 * Self-heals/migrates old hardcoded schemas on the fly.
 * When isPermanent is false, paid leave quotas are set to 0.
 * Dynamic child-tier and gender restrictions are computed for Maternity & Paternity.
 */
const ensureBalancesInitialized = async (
    balance: any,
    activeTypes: any[],
    isPermanent: boolean = true,
    employee?: any,
    refDate: Date = new Date()
): Promise<boolean> => {
    let modified = false;
    if (!balance.balances) {
        balance.balances = [];
        modified = true;
    }

    // Deduplicate any duplicate leaveTypeCode entries in balance.balances
    if (balance.balances && Array.isArray(balance.balances)) {
        const seenCodes = new Set<string>();
        const uniqueBalances: any[] = [];
        for (const b of balance.balances) {
            const code = b.leaveTypeCode;
            if (!code) continue;
            if (!seenCodes.has(code)) {
                seenCodes.add(code);
                uniqueBalances.push(b);
            } else {
                const existing = uniqueBalances.find(item => item.leaveTypeCode === code);
                if (existing) {
                    existing.total = Math.max(existing.total || 0, b.total || 0);
                    existing.used = Math.max(existing.used || 0, b.used || 0);
                    existing.pending = Math.max(existing.pending || 0, b.pending || 0);
                }
                modified = true;
            }
        }
        if (uniqueBalances.length !== balance.balances.length) {
            balance.balances = uniqueBalances;
            modified = true;
        }
    }

    // 1. Migrate legacy columns if present
    const legacyKeys = ['annual', 'sick', 'casual'];
    for (const key of legacyKeys) {
        if (balance[key] && balance[key].total !== undefined && !balance.balances.find((b: any) => b.leaveTypeCode === key)) {
            balance.balances.push({
                leaveTypeCode: key,
                total: !isPermanent ? 0 : balance[key].total,
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
        const quota = await resolveEmployeeQuotaForType(t, employee, isPermanent, refDate);

        if (!existing) {
            balance.balances.push({
                leaveTypeCode: t.code,
                total: quota,
                used: 0,
                pending: 0
            });
            modified = true;
        } else {
            if (t.code === 'maternity' || t.code === 'paternity') {
                if (existing.total !== quota) {
                    existing.total = quota;
                    modified = true;
                }
            } else if (!isPermanent && t.isPaid !== false && existing.total > 0) {
                existing.total = 0;
                modified = true;
            }
        }
    }

    // 3. Clean any floating point noise from balances
    if (balance.balances && Array.isArray(balance.balances)) {
        for (const b of balance.balances) {
            if (b.total !== undefined) b.total = roundDays(b.total);
            if (b.used !== undefined) b.used = roundDays(b.used);
            if (b.pending !== undefined) b.pending = roundDays(b.pending);
        }
    }

    return modified;
};

/**
 * Resolves all potential database identifiers (employeeId, userId, _id) for an employee.
 * Ensures consistent lookups whether an employee has a login User account or is an unlinked worker.
 */
const resolveEmployeeLookupIds = async (identifier: string, session?: mongoose.ClientSession): Promise<{
    lookupIds: string[];
    canonicalEmployeeId: string;
    employee: any;
}> => {
    if (!identifier) return { lookupIds: [], canonicalEmployeeId: '', employee: null };

    const query: any = {
        $or: [
            { employeeId: identifier },
            { userId: identifier }
        ]
    };
    if (mongoose.isValidObjectId(identifier)) {
        query.$or.push({ _id: identifier });
    }

    let empQuery = Employee.findOne(query);
    if (session) empQuery = empQuery.session(session);
    const employee = await empQuery;

    const lookupIds = new Set<string>([identifier]);
    if (employee) {
        if (employee.employeeId) lookupIds.add(employee.employeeId);
        if (employee.userId) lookupIds.add(employee.userId.toString());
        if (employee._id) lookupIds.add(employee._id.toString());
    }

    const canonicalEmployeeId = employee?.employeeId || identifier;
    return {
        lookupIds: Array.from(lookupIds),
        canonicalEmployeeId,
        employee
    };
};

async function getApproverActionName(userId: string, _role?: string): Promise<string> {
    let approverName = '';
    const approverEmp = await Employee.findOne({
        $or: [
            { userId },
            { employeeId: userId },
            { _id: mongoose.isValidObjectId(userId) ? userId : undefined }
        ].filter(Boolean) as any
    }).select('firstName lastName').lean() as any;

    if (approverEmp && (approverEmp.firstName || approverEmp.lastName)) {
        approverName = `${approverEmp.firstName || ''} ${approverEmp.lastName || ''}`.trim();
    }
    if (!approverName) {
        const userDoc = await User.findById(userId).select('firstName lastName name email role').lean() as any;
        approverName = `${userDoc?.firstName || ''} ${userDoc?.lastName || ''}`.trim() || userDoc?.name || userDoc?.email?.split('@')[0] || 'Administrator';
    }

    return approverName;
}

async function enrichApproverNames(leaves: any[]): Promise<any[]> {
    if (!leaves || leaves.length === 0) return leaves;

    const needsResolutionIds = new Set<string>();
    leaves.forEach(l => {
        if (l.approvedBy) {
            const cleanName = l.approvedByName ? l.approvedByName.replace(/\s*\([^)]*\)$/, '').trim() : '';
            const isPlaceholder = !cleanName || ['ADMIN', 'SUPER-ADMIN', 'MANAGER', 'HR', 'FINANCE'].includes(cleanName.toUpperCase());
            if (isPlaceholder) {
                needsResolutionIds.add(String(l.approvedBy));
            } else {
                l.approvedByName = cleanName;
            }
        }
    });

    if (needsResolutionIds.size === 0) return leaves;

    const idList = Array.from(needsResolutionIds);
    const validObjectIds = idList.filter(id => mongoose.isValidObjectId(id));

    const [employees, users] = await Promise.all([
        Employee.find({
            $or: [
                { userId: { $in: idList } },
                { employeeId: { $in: idList } },
                { _id: { $in: validObjectIds } }
            ]
        }).select('userId employeeId _id firstName lastName').lean() as Promise<any[]>,
        User.find({
            _id: { $in: validObjectIds }
        }).select('_id firstName lastName name email').lean() as Promise<any[]>
    ]);

    const nameMap = new Map<string, string>();

    for (const u of users) {
        const uId = String(u._id);
        const name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.name || u.email?.split('@')[0] || 'Administrator';
        nameMap.set(uId, name);
    }

    for (const emp of employees) {
        const fullName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim();
        if (fullName) {
            if (emp.userId) nameMap.set(String(emp.userId), fullName);
            if (emp.employeeId) nameMap.set(String(emp.employeeId), fullName);
            if (emp._id) nameMap.set(String(emp._id), fullName);
        }
    }

    leaves.forEach(l => {
        if (l.approvedBy) {
            const resolved = nameMap.get(String(l.approvedBy));
            if (resolved) {
                l.approvedByName = resolved;
            } else if (l.approvedByName) {
                l.approvedByName = l.approvedByName.replace(/\s*\([^)]*\)$/, '').trim();
            }
        }
    });

    return leaves;
}

interface CheckLeaveOverlapParams {
    lookupIds: string[];
    startDate: Date;
    endDate: Date;
    duration?: string;
    startTime?: string;
    endTime?: string;
    excludeLeaveId?: any;
    session?: mongoose.ClientSession;
}

async function checkLeaveOverlap({
    lookupIds,
    startDate,
    endDate,
    duration = 'Full Day',
    startTime,
    endTime,
    excludeLeaveId,
    session
}: CheckLeaveOverlapParams): Promise<any | null> {
    if (!lookupIds || lookupIds.length === 0) return null;

    const reqStart = new Date(startDate);
    reqStart.setHours(0, 0, 0, 0);

    const reqEnd = new Date(endDate);
    reqEnd.setHours(23, 59, 59, 999);

    const query: any = {
        employeeId: { $in: lookupIds },
        status: { $in: ['Pending', 'Approved'] },
        startDate: { $lte: reqEnd },
        endDate: { $gte: reqStart }
    };

    if (excludeLeaveId) {
        query._id = { $ne: excludeLeaveId };
    }

    let existingQuery = LeaveRequest.find(query);
    if (session) existingQuery = existingQuery.session(session);
    const overlappingLeaves = await existingQuery.lean() as any[];

    if (!overlappingLeaves || overlappingLeaves.length === 0) {
        return null;
    }

    for (const existing of overlappingLeaves) {
        const isReqSingleDay = reqStart.toISOString().slice(0, 10) === reqEnd.toISOString().slice(0, 10);
        const exStart = new Date(existing.startDate);
        const exEnd = new Date(existing.endDate);
        const isExSingleDay = exStart.toISOString().slice(0, 10) === exEnd.toISOString().slice(0, 10);

        // If either is multi-day, they definitely conflict
        if (!isReqSingleDay || !isExSingleDay) {
            return existing;
        }

        // Both are single-day on the exact same date:
        const existingDuration = existing.duration || 'Full Day';
        const requestedDuration = duration || 'Full Day';

        if (existingDuration === 'Full Day' || requestedDuration === 'Full Day') {
            return existing;
        }

        if (existingDuration === requestedDuration) {
            return existing;
        }

        if (existingDuration === 'Specify Time' && requestedDuration === 'Specify Time') {
            if (existing.startTime && existing.endTime && startTime && endTime) {
                if (startTime < existing.endTime && endTime > existing.startTime) {
                    return existing;
                }
            } else {
                return existing;
            }
        }

        if (existingDuration === 'Specify Time' || requestedDuration === 'Specify Time') {
            return existing;
        }
    }

    return null;
}

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
                { _id: { $in: employeeIds.filter((id: string) => id && mongoose.isValidObjectId(id)) } },
                { userId: { $in: employeeIds.filter((id: string) => id && mongoose.isValidObjectId(id)) } }
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
        const userId = authReq.user?.userId;
        if (!userId) {
            return res.status(400).json({ success: false, message: 'No Employee profile linked to this user' });
        }

        const { lookupIds } = await resolveEmployeeLookupIds(userId);
        const leaves = await LeaveRequest.find({ employeeId: { $in: lookupIds } }).sort({ createdAt: -1 }).lean() as any[];
        const enrichedLeaves = await enrichApproverNames(leaves);
        res.json({ success: true, data: enrichedLeaves });
    } catch (error) {
        next(error);
    }
});

// GET /api/leaves/balances/all - Get leave balances of all employees (Admin/HR only, with optional month filter)
router.get('/balances/all', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const user = authReq.user as any;
        if (!['super-admin', 'admin', 'hr', 'finance'].includes(user?.role || '')) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const year = Number(req.query.year) || new Date().getFullYear();
        const monthQuery = req.query.month !== undefined && req.query.month !== '' && req.query.month !== 'all' 
            ? Number(req.query.month) 
            : null;

        // Fetch all active leave types
        const activeTypes = await LeaveType.find({ isActive: true }).sort({ name: 1 });

        // Fetch all employees
        const employees = await Employee.find().select('userId firstName middleName lastName employeeId workEmail email jobInfo employmentStatus gender maritalStatus dependents maternityBaselineChildCount');

        // Fetch all leave balances for the given year
        const balances = await LeaveBalance.find({ year });

        // If a specific month is requested, fetch approved leave requests and attendance records in that month range
        let monthlyLeaves: any[] = [];
        let monthlyAttendance: any[] = [];
        if (monthQuery && monthQuery >= 1 && monthQuery <= 12) {
            const startOfMonth = new Date(Date.UTC(year, monthQuery - 1, 1, 0, 0, 0));
            const endOfMonth = new Date(Date.UTC(year, monthQuery, 0, 23, 59, 59, 999));
            const startStr = `${year}-${String(monthQuery).padStart(2, '0')}-01`;
            const endDay = new Date(year, monthQuery, 0).getDate();
            const endStr = `${year}-${String(monthQuery).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

            [monthlyLeaves, monthlyAttendance] = await Promise.all([
                LeaveRequest.find({
                    status: 'Approved',
                    startDate: { $lte: endOfMonth },
                    endDate: { $gte: startOfMonth }
                }).lean(),
                AttendanceRecord.find({
                    date: { $gte: startStr, $lte: endStr },
                    status: { $in: ['Late', 'Half-Day', 'Half-Day Leave', 'Absent', 'On Leave'] }
                }).select('employeeId status date').lean()
            ]);
        }

        // Build list of employees with their balances
        const data = employees.map(emp => {
            const empObj = emp as any;
            const userIdStr = empObj.userId?.toString();
            const empIdStr = empObj.employeeId?.toString();
            const rawIdStr = empObj._id?.toString();

            const empStatus = (empObj.employmentStatus?.status || empObj.employmentStatus || '').toString().trim().toLowerCase();
            const isPermanent = empStatus === 'permanent';
            const empGender = (empObj.gender || '').trim().toLowerCase();
            const empMarital = (empObj.maritalStatus || '').trim().toLowerCase();

            // Find existing balance doc matching any identifier (employeeId, userId, or _id)
            let empBalanceDoc = balances.find(b => 
                (empIdStr && b.employeeId === empIdStr) ||
                (userIdStr && b.employeeId === userIdStr) ||
                (rawIdStr && b.employeeId === rawIdStr)
            );
            
            let empBalances = activeTypes.map(type => {
                let isRestrictedForEmp = false;
                if (type.genderRestricted && type.genderRestricted !== 'all' && type.genderRestricted !== empGender) {
                    isRestrictedForEmp = true;
                }
                if (type.maritalStatusRestricted && type.maritalStatusRestricted === 'married' && empMarital !== 'married') {
                    isRestrictedForEmp = true;
                }

                let balCat = empBalanceDoc?.balances?.find((b: any) => b.leaveTypeCode === type.code);
                const rawTotal = balCat ? balCat.total : type.defaultDays;
                const effectiveTotal = (!isPermanent && type.isPaid !== false) || isRestrictedForEmp ? 0 : rawTotal;

                // Calculate month-specific used leaves if monthQuery is active
                let monthUsed = 0;
                if (monthQuery) {
                    if (monthlyLeaves.length > 0) {
                        const empMonthLeaves = monthlyLeaves.filter(l => {
                            const matchesEmp = (empIdStr && l.employeeId === empIdStr) ||
                                               (userIdStr && l.employeeId === userIdStr) ||
                                               (rawIdStr && l.employeeId === rawIdStr) ||
                                               (userIdStr && l.appliedBy === userIdStr);
                            if (!matchesEmp) return false;

                            const lType = (l.type || '').toLowerCase().trim();
                            const tCode = type.code.toLowerCase().trim();
                            const tName = type.name.toLowerCase().trim();
                            return lType === tCode || lType === tName || lType.includes(tCode) || tCode.includes(lType);
                        });

                        monthUsed = empMonthLeaves.reduce((sum, l) => sum + (Number(l.totalDays) || 0), 0);
                    }

                    // Include attendance-based leave deductions in the primary bucket (casual, or annual-leave if no casual)
                    const isPrimary = type.code === 'casual' || (!activeTypes.some(t => t.code === 'casual') && type.code === 'annual-leave');
                    if (isPrimary && monthlyAttendance.length > 0) {
                        const empAtt = monthlyAttendance.filter(r =>
                            (empIdStr && r.employeeId === empIdStr) ||
                            (userIdStr && r.employeeId === userIdStr) ||
                            (rawIdStr && r.employeeId === rawIdStr)
                        );
                        for (const r of empAtt) {
                            const hasFormalLeave = monthlyLeaves.some(l => {
                                const matches = (empIdStr && l.employeeId === empIdStr) ||
                                                (userIdStr && l.employeeId === userIdStr) ||
                                                (rawIdStr && l.employeeId === rawIdStr);
                                if (!matches) return false;
                                const s = new Date(l.startDate).toISOString().slice(0, 10);
                                const e = new Date(l.endDate).toISOString().slice(0, 10);
                                return r.date >= s && r.date <= e;
                            });
                            if (!hasFormalLeave) {
                                if (r.status === 'Late' || r.status === 'Half-Day' || r.status === 'Half-Day Leave') {
                                    monthUsed += 0.5;
                                } else if (r.status === 'On Leave') {
                                    monthUsed += 1.0;
                                }
                            }
                        }
                    }
                }

                const effectiveUsed = roundDays(balCat ? balCat.used : 0);
                const effectivePending = roundDays(balCat ? balCat.pending : 0);
                const effectiveTotalNum = roundDays(effectiveTotal);
                const effectiveMonthUsed = roundDays(monthUsed);
                const availableDays = (!isPermanent && type.isPaid !== false) || isRestrictedForEmp
                    ? 0
                    : roundDays(Math.max(0, effectiveTotalNum - effectiveUsed - effectivePending));

                return {
                    leaveTypeCode: type.code,
                    leaveTypeName: type.name,
                    total: effectiveTotalNum,
                    used: effectiveUsed,
                    monthUsed: effectiveMonthUsed,
                    pending: effectivePending,
                    available: availableDays
                };
            });

            return {
                employeeId: emp.employeeId,
                userId: emp.userId,
                name: formatEmployeeFullName(emp, emp.employeeId),
                email: emp.workEmail || emp.email || '—',
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
        const targetId = authReq.query.employeeId ? String(authReq.query.employeeId) : authReq.user?.userId;
        if (!targetId) {
            return res.status(400).json({ success: false, message: 'No Employee profile linked to this user' });
        }

        // Only admins can query other users' balances
        if (authReq.user?.role === 'employee' && targetId !== authReq.user?.userId) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const { lookupIds, canonicalEmployeeId, employee: targetEmp } = await resolveEmployeeLookupIds(targetId);
        const targetEmpObj = targetEmp as any;
        const empStatus = (targetEmpObj?.employmentStatus?.status || targetEmpObj?.employmentStatus || '').toString().trim().toLowerCase();
        const isPermanent = empStatus === 'permanent';

        const year = authReq.query.year ? Number(authReq.query.year) : new Date().getFullYear();
        
        let balance = await LeaveBalance.findOne({ employeeId: { $in: lookupIds }, year });
        if (!balance) {
            balance = new LeaveBalance({ employeeId: canonicalEmployeeId, year, balances: [] });
        }

        const activeTypes = await LeaveType.find({ isActive: true });
        const modified = await ensureBalancesInitialized(balance, activeTypes, isPermanent, targetEmpObj);
        if (modified || balance.isNew) {
            await balance.save();
        }

        // Return balance filtered to only categories applicable to this employee's profile
        const balanceData = balance.toObject ? balance.toObject() : JSON.parse(JSON.stringify(balance));
        if (targetEmpObj) {
            const empGender = (targetEmpObj.gender || '').trim().toLowerCase();
            const empMarital = (targetEmpObj.maritalStatus || '').trim().toLowerCase();
            const allowedCodes = new Set(
                activeTypes
                    .filter(t => {
                        if (t.genderRestricted && t.genderRestricted !== 'all' && t.genderRestricted !== empGender) return false;
                        if (t.maritalStatusRestricted && t.maritalStatusRestricted === 'married' && empMarital !== 'married') return false;
                        return true;
                    })
                    .map(t => t.code)
            );
            balanceData.balances = (balanceData.balances || []).filter((b: any) => allowedCodes.has(b.leaveTypeCode));
        }

        res.json({ success: true, data: balanceData });
    } catch (error) {
        next(error);
    }
});

// GET /api/leaves/types - Fetch leave types (active-only by default, returns all for admin)
router.get('/types', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const user = authReq.user as any;
        const isAdmin = ['super-admin', 'admin', 'hr', 'finance'].includes(user?.role || '');
        const query: any = { code: { $ne: 'unpaid' } };
        if (!isAdmin || req.query.activeOnly === 'true') {
            query.isActive = true;
        }
        let types = await LeaveType.find(query).sort({ createdAt: 1 });

        // If employeeId is specified (or requester is not managing leave settings), filter types based on target employee profile
        const isForManagement = req.query.forManagement === 'true';
        const targetEmpId = req.query.employeeId ? String(req.query.employeeId) : (!isForManagement ? user?.userId : null);

        if (targetEmpId) {
            const { employee } = await resolveEmployeeLookupIds(targetEmpId);
            if (employee) {
                const empGender = (employee.gender || '').trim().toLowerCase();
                const empMarital = (employee.maritalStatus || '').trim().toLowerCase();
                types = types.filter(t => {
                    if (t.code === 'maternity' && (empGender !== 'female' || empMarital !== 'married')) {
                        return false;
                    }
                    if (t.code === 'paternity' && (empGender !== 'male' || empMarital !== 'married')) {
                        return false;
                    }
                    if (t.genderRestricted && t.genderRestricted !== 'all' && t.genderRestricted !== empGender) {
                        return false;
                    }
                    if (t.maritalStatusRestricted && t.maritalStatusRestricted === 'married' && empMarital !== 'married') {
                        return false;
                    }
                    return true;
                });
            }
        }

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
        if (!['super-admin', 'admin', 'hr', 'finance'].includes(user?.role || '')) {
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
        if (!['super-admin', 'admin', 'hr', 'finance'].includes(user?.role || '')) {
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
        if (!['super-admin', 'admin', 'hr', 'finance'].includes(user?.role || '')) {
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

// PUT /api/leaves/balance/:employeeId - Adjust specific employee's leave balance & starting used days (Admin/HR only)
router.put('/balance/:employeeId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const user = authReq.user as any;
        if (!['super-admin', 'admin', 'hr'].includes(user?.role || '')) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        const { employeeId } = req.params;
        const { leaveTypeCode, total, used, balances: incomingBalances } = req.body;
        const year = req.body.year ? Number(req.body.year) : new Date().getFullYear();

        const { lookupIds, canonicalEmployeeId, employee: balEmp } = await resolveEmployeeLookupIds(employeeId);
        const balEmpObj = balEmp as any;
        const balEmpStatus = (balEmpObj?.employmentStatus?.status || balEmpObj?.employmentStatus || '').toString().trim().toLowerCase();
        const balIsPermanent = balEmpStatus === 'permanent';

        let balance = await LeaveBalance.findOne({ employeeId: { $in: lookupIds }, year });
        if (!balance) {
            balance = new LeaveBalance({ employeeId: canonicalEmployeeId, year, balances: [] });
        }

        const activeTypes = await LeaveType.find({ isActive: true });
        await ensureBalancesInitialized(balance, activeTypes, balIsPermanent, balEmpObj);

        if (Array.isArray(incomingBalances) && incomingBalances.length > 0) {
            for (const b of incomingBalances) {
                if (!b.leaveTypeCode) continue;
                const cat = balance.balances.find((item: any) => item.leaveTypeCode === b.leaveTypeCode);
                if (cat) {
                    if (b.total !== undefined) cat.total = Math.max(0, Number(b.total));
                    if (b.used !== undefined) cat.used = Math.max(0, Number(b.used));
                } else {
                    balance.balances.push({
                        leaveTypeCode: b.leaveTypeCode,
                        total: Math.max(0, Number(b.total || 0)),
                        used: Math.max(0, Number(b.used || 0)),
                        pending: 0
                    });
                }
            }
        } else if (leaveTypeCode) {
            const category = balance.balances.find((b: any) => b.leaveTypeCode === leaveTypeCode);
            if (category) {
                if (total !== undefined) category.total = Math.max(0, Number(total));
                if (used !== undefined) category.used = Math.max(0, Number(used));
            } else {
                balance.balances.push({
                    leaveTypeCode,
                    total: Math.max(0, Number(total || 0)),
                    used: Math.max(0, Number(used || 0)),
                    pending: 0
                });
            }
        } else {
            return res.status(400).json({ success: false, message: 'leaveTypeCode or balances array is required' });
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
            const managerEmployee = await mongoose.model('Employee').findOne({
                $or: [
                    { userId },
                    { _id: mongoose.isValidObjectId(userId) ? userId : undefined },
                    { employeeId: userId }
                ]
            }).select('employeeId _id userId').lean() as any;
            
            if (managerEmployee) {
                const managerIdentifiers = [
                    managerEmployee.employeeId,
                    managerEmployee._id ? String(managerEmployee._id) : '',
                    managerEmployee.userId ? String(managerEmployee.userId) : '',
                    String(userId)
                ].filter(Boolean);

                const directReports = await mongoose.model('Employee').find({ 
                    'jobInfo.reportingManager': { $in: managerIdentifiers } 
                }).select('employeeId _id userId').lean() as any[];

                const directReportIds = new Set<string>();
                directReports.forEach((emp: any) => {
                    if (emp.employeeId) directReportIds.add(String(emp.employeeId));
                    if (emp._id) directReportIds.add(String(emp._id));
                    if (emp.userId) directReportIds.add(String(emp.userId));
                });

                filter.employeeId = { $in: Array.from(directReportIds) };
            } else {
                filter.employeeId = { $in: [] };
            }
        }

        const leaves = await LeaveRequest.find(filter).sort({ createdAt: -1 }).lean() as any[];
        const employeeIds = [...new Set(leaves.map(l => l.employeeId))];
        
        const employees = await mongoose.model('Employee').find({ 
            $or: [
                { employeeId: { $in: employeeIds } },
                { _id: { $in: employeeIds.filter(id => mongoose.isValidObjectId(id)) } },
                { userId: { $in: employeeIds.filter(id => mongoose.isValidObjectId(id)) } }
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

        const fullyEnrichedLeaves = await enrichApproverNames(enrichedLeaves);
        res.json({ success: true, data: fullyEnrichedLeaves });
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

        const targetEmployeeId: string = employeeId;

        const start = new Date(startDate);
        const end = new Date(endDate);
        if (start > end) {
            return res.status(400).json({ message: 'Start date must be before end date' });
        }

        const { lookupIds, canonicalEmployeeId, employee: empDoc } = await resolveEmployeeLookupIds(targetEmployeeId);

        // Check for duplicate / overlapping leave requests
        const conflict = await checkLeaveOverlap({
            lookupIds,
            startDate: start,
            endDate: end,
            duration,
            startTime,
            endTime
        });

        if (conflict) {
            const cStart = new Date(conflict.startDate).toLocaleDateString('en-GB');
            const cEnd = new Date(conflict.endDate).toLocaleDateString('en-GB');
            const dateStr = cStart === cEnd ? cStart : `${cStart} to ${cEnd}`;
            return res.status(400).json({
                success: false,
                message: `You already have an active leave request (${conflict.type} - ${conflict.status}) for ${dateStr}. Duplicate or overlapping leave applications are not permitted.`
            });
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

        // Benefit Lockdown: Paid leave quotas and applications are exclusively for Permanent staff
        const empDocObj = empDoc as any;
        const empStatus = (empDocObj?.employmentStatus?.status || empDocObj?.employmentStatus || '').toString().trim().toLowerCase();
        const isPermanent = empStatus === 'permanent';

        if (!isPermanent) {
            return res.status(403).json({
                success: false,
                message: `Leave benefit (${leaveType.name}) is exclusively available to confirmed Permanent employees.`
            });
        }

        const leaveTypeCode = leaveType.code;

        // Gender & Marital Restrictions Check
        const empGender = (empDocObj?.gender || '').trim().toLowerCase();
        const empMarital = (empDocObj?.maritalStatus || '').trim().toLowerCase();

        if (leaveType.genderRestricted && leaveType.genderRestricted !== 'all' && leaveType.genderRestricted !== empGender) {
            return res.status(403).json({
                success: false,
                message: `${leaveType.name} is exclusively available to ${leaveType.genderRestricted} employees.`
            });
        }

        if (leaveType.maritalStatusRestricted && leaveType.maritalStatusRestricted === 'married' && empMarital !== 'married') {
            return res.status(403).json({
                success: false,
                message: `${leaveType.name} is exclusively available to married employees.`
            });
        }

        if (leaveTypeCode === 'maternity') {
            const matCheck = await getMaternityEntitlement(empDocObj, start);
            if (!matCheck.eligible) {
                return res.status(403).json({
                    success: false,
                    message: matCheck.reason || 'Not eligible for paid maternity leave.'
                });
            }
        }

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

        const daysRequested = getLeaveDaysCount(start, end, leaveType);
        if (daysRequested <= 0) {
            return res.status(400).json({ message: 'Leave request must include at least one valid day' });
        }

        // 2. Calculate days per year
        const yearDaysMap = calculateLeaveDaysPerYear(start, end, leaveType, duration, requestedDurationDays);

        // 3. Atomically check balances and reserve pending
        const session = await mongoose.startSession();
        let createdLeave: any = null;
        let totalDeducted = 0;
        try {
            await session.withTransaction(async () => {
                const activeTypes = await LeaveType.find({ isActive: true }).session(session);

                for (const [year, days] of yearDaysMap.entries()) {
                    let balance = await LeaveBalance.findOne({ employeeId: { $in: lookupIds }, year }).session(session);
                    if (!balance) {
                        balance = new LeaveBalance({ employeeId: canonicalEmployeeId, year, balances: [] });
                    }

                    await ensureBalancesInitialized(balance, activeTypes, isPermanent, empDocObj, start);

                    const category = balance.balances.find((b: any) => b.leaveTypeCode === leaveTypeCode);
                    if (!category) {
                        throw new Error(`Insufficient balance category for ${type}`);
                    }

                    const currentTotal = roundDays(category.total);
                    const currentUsed = roundDays(category.used);
                    const currentPending = roundDays(category.pending);
                    const available = roundDays(Math.max(0, currentTotal - currentUsed - currentPending));
                    if (available < days) {
                        throw new Error(`Insufficient ${leaveType.name} leave balance for year ${year}. Requested: ${days}, Available: ${available}`);
                    }

                    // Reserve
                    category.pending = roundDays(currentPending + days);
                    category.used = currentUsed;
                    category.total = currentTotal;
                    balance.markModified('balances');
                    await balance.save({ session });
                }

                // Create Request
                for (const days of yearDaysMap.values()) {
                    totalDeducted += days;
                }

                const leaves = await LeaveRequest.create([{
                    employeeId: canonicalEmployeeId,
                    startDate,
                    endDate,
                    type: leaveType.name,
                    reason,
                    duration,
                    startTime: duration === 'Specify Time' ? startTime : undefined,
                    endTime: duration === 'Specify Time' ? endTime : undefined,
                    totalDays: roundDays(totalDeducted),
                    status: 'Pending',
                    appliedBy: authReq.user?.userId,
                    appliedOn: new Date()
                }], { session });
                
                createdLeave = leaves[0];
            });

            res.status(201).json({ success: true, message: 'Leave requested successfully', data: createdLeave });

            // Trigger manager & HR notification email asynchronously
            (async () => {
                try {
                    const emp = await Employee.findOne({
                        $or: [
                            { userId: targetEmployeeId },
                            { employeeId: targetEmployeeId },
                            { _id: targetEmployeeId.length === 24 ? targetEmployeeId : new mongoose.Types.ObjectId() }
                        ]
                    });
                    const employeeName = formatEmployeeFullName(emp, 'Employee');
                    
                    // Auto-fetch active HR and Admin emails from database
                    const hrUsers = await User.find({ role: { $in: ['admin', 'super-admin', 'hr'] } }).select('email').lean();
                    const hrEmails = hrUsers.map((u: any) => u.email).filter(Boolean);

                    let managerEmail: string | undefined = undefined;
                    if (emp && emp.jobInfo?.reportingManager) {
                        const manager = await Employee.findOne({ employeeId: emp.jobInfo.reportingManager });
                        managerEmail = manager?.workEmail || manager?.email;
                    }

                    const recipients = Array.from(new Set([...hrEmails, managerEmail, process.env.HR_EMAIL].filter(Boolean) as string[]));
                    const leaveTypeName = leaveType?.name || type;
                    for (const to of recipients) {
                        await sendLeaveSubmittedEmail(
                            to,
                            employeeName,
                            leaveTypeName,
                            new Date(startDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
                            new Date(endDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
                            totalDeducted,
                            reason,
                            req.headers.origin as string
                        );
                    }
                } catch (emailErr) {
                    console.error('[Leave Email] Failed to send submission email:', emailErr);
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

// PUT /api/leaves/:id - Edit pending leave request (Employee / Requester)
router.put('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const user = authReq.user;
        if (!user) return res.status(401).json({ message: 'Unauthorized' });

        const leave = await LeaveRequest.findById(req.params.id);
        if (!leave) return res.status(404).json({ success: false, message: 'Leave request not found' });

        const { lookupIds } = await resolveEmployeeLookupIds(user.userId);
        const isOwner = lookupIds.includes(leave.employeeId) || leave.appliedBy === user.userId;
        const isManagerOrAdmin = ['super-admin', 'admin', 'manager', 'hr', 'finance'].includes(user.role);

        if (!isOwner && !isManagerOrAdmin) {
            return res.status(403).json({ success: false, message: 'Forbidden: Cannot edit this leave request' });
        }

        if (leave.status === 'Approved') {
            return res.status(400).json({ success: false, message: 'Approved leave cannot be edited. You can only cancel this leave request.' });
        }

        if (leave.status !== 'Pending') {
            return res.status(400).json({ success: false, message: `Leave requests in status '${leave.status}' cannot be edited.` });
        }

        const { startDate, endDate, type, reason, duration = 'Full Day', startTime, endTime } = req.body;
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (start > end) {
            return res.status(400).json({ success: false, message: 'Start date must be before end date' });
        }

        const leaveEmployeeLookup = await resolveEmployeeLookupIds(leave.employeeId);
        const conflict = await checkLeaveOverlap({
            lookupIds: leaveEmployeeLookup.lookupIds,
            startDate: start,
            endDate: end,
            duration,
            startTime,
            endTime,
            excludeLeaveId: leave._id
        });

        if (conflict) {
            const cStart = new Date(conflict.startDate).toLocaleDateString('en-GB');
            const cEnd = new Date(conflict.endDate).toLocaleDateString('en-GB');
            const dateStr = cStart === cEnd ? cStart : `${cStart} to ${cEnd}`;
            return res.status(400).json({
                success: false,
                message: `Cannot update: Dates overlap with an existing ${conflict.type} leave (${conflict.status}) for ${dateStr}.`
            });
        }

        const requestedTypeCode = (type || leave.type).toLowerCase().trim();
        const leaveType = await LeaveType.findOne({ 
            $or: [
                { name: type || leave.type },
                { code: requestedTypeCode }
            ],
            isActive: true 
        });
        if (!leaveType) {
            return res.status(400).json({ success: false, message: `Invalid or inactive leave type: ${type || leave.type}` });
        }

        // Benefit Lockdown: Paid leave benefits are exclusively for Permanent staff
        const editEmp = leaveEmployeeLookup.employee as any;
        const editEmpStatus = (editEmp?.employmentStatus?.status || editEmp?.employmentStatus || '').toString().trim().toLowerCase();
        const editIsPermanent = editEmpStatus === 'permanent';

        if (!editIsPermanent) {
            return res.status(403).json({
                success: false,
                message: `Leave benefit (${leaveType.name}) is exclusively available to confirmed Permanent employees.`
            });
        }

        const leaveTypeCode = leaveType.code;

        // Gender & Marital Restrictions Check
        const editGender = (editEmp?.gender || '').trim().toLowerCase();
        const editMarital = (editEmp?.maritalStatus || '').trim().toLowerCase();

        if (leaveType.genderRestricted && leaveType.genderRestricted !== 'all' && leaveType.genderRestricted !== editGender) {
            return res.status(403).json({
                success: false,
                message: `${leaveType.name} is exclusively available to ${leaveType.genderRestricted} employees.`
            });
        }

        if (leaveType.maritalStatusRestricted && leaveType.maritalStatusRestricted === 'married' && editMarital !== 'married') {
            return res.status(403).json({
                success: false,
                message: `${leaveType.name} is exclusively available to married employees.`
            });
        }

        if (leaveTypeCode === 'maternity') {
            const matCheck = await getMaternityEntitlement(editEmp, start);
            if (!matCheck.eligible) {
                return res.status(403).json({
                    success: false,
                    message: matCheck.reason || 'Not eligible for paid maternity leave.'
                });
            }
        }

        let requestedDurationDays = 1;
        if (duration === 'Half Day - Morning' || duration === 'Half Day - Afternoon') {
            if (start.getTime() !== end.getTime()) {
                return res.status(400).json({ success: false, message: 'Partial leaves must be on a single date' });
            }
            requestedDurationDays = 0.5;
        } else if (duration === 'Specify Time') {
            if (start.getTime() !== end.getTime()) {
                return res.status(400).json({ success: false, message: 'Specify time leaves must be on a single date' });
            }
            if (!startTime || !endTime) {
                return res.status(400).json({ success: false, message: 'Start and end time are required' });
            }
            const [sH, sM] = startTime.split(':').map(Number);
            const [eH, eM] = endTime.split(':').map(Number);
            const diffHours = (eH + eM / 60) - (sH + sM / 60);
            if (diffHours <= 0) return res.status(400).json({ success: false, message: 'End time must be after start time' });
            requestedDurationDays = Number((diffHours / 8).toFixed(2));
        }

        const daysRequested = getLeaveDaysCount(start, end, leaveType);
        if (daysRequested <= 0) {
            return res.status(400).json({ success: false, message: 'Leave request must include at least one valid day' });
        }

        // Calculate old days per year for rollback
        const oldStart = new Date(leave.startDate);
        const oldEnd = new Date(leave.endDate);
        const oldRequestedTypeCode = leave.type.toLowerCase().trim();
        const oldLeaveType = await LeaveType.findOne({ $or: [{ name: leave.type }, { code: oldRequestedTypeCode }] });
        const oldTypeCode = oldLeaveType ? oldLeaveType.code : oldRequestedTypeCode;

        const oldYearDaysMap = calculateLeaveDaysPerYear(oldStart, oldEnd, oldLeaveType, leave.duration, leave.totalDays);
        const newYearDaysMap = calculateLeaveDaysPerYear(start, end, leaveType, duration, requestedDurationDays);

        const session = await mongoose.startSession();
        let totalNewDeducted = 0;
        try {
            await session.withTransaction(async () => {
                const activeTypes = await LeaveType.find({ isActive: true }).session(session);
                const { lookupIds: targetLookupIds, canonicalEmployeeId } = leaveEmployeeLookup;

                // 1. Rollback old pending deduction
                for (const [year, days] of oldYearDaysMap.entries()) {
                    let balance = await LeaveBalance.findOne({ employeeId: { $in: targetLookupIds }, year }).session(session);
                    if (balance) {
                        const cat = balance.balances.find((b: any) => b.leaveTypeCode === oldTypeCode);
                        if (cat) {
                            cat.pending = Math.max(0, cat.pending - days);
                            balance.markModified('balances');
                            await balance.save({ session });
                        }
                    }
                }

                // 2. Reserve new pending deduction and validate availability
                for (const [year, days] of newYearDaysMap.entries()) {
                    let balance = await LeaveBalance.findOne({ employeeId: { $in: targetLookupIds }, year }).session(session);
                    if (!balance) {
                        balance = new LeaveBalance({ employeeId: canonicalEmployeeId, year, balances: [] });
                    }
                    await ensureBalancesInitialized(balance, activeTypes, editIsPermanent, editEmp, start);
                    const cat = balance.balances.find((b: any) => b.leaveTypeCode === leaveTypeCode);
                    if (!cat) {
                        throw new Error(`Insufficient balance category for ${leaveType.name}`);
                    }
                    const available = cat.total - (cat.used + cat.pending);
                    if (available < days) {
                        throw new Error(`Insufficient ${leaveType.name} leave balance for year ${year}. Requested: ${days}, Available: ${available}`);
                    }
                    cat.pending += days;
                    balance.markModified('balances');
                    await balance.save({ session });
                }

                for (const days of newYearDaysMap.values()) {
                    totalNewDeducted += days;
                }

                leave.startDate = start;
                leave.endDate = end;
                leave.type = leaveType.name;
                leave.reason = reason;
                leave.duration = duration;
                leave.startTime = duration === 'Specify Time' ? startTime : undefined;
                leave.endTime = duration === 'Specify Time' ? endTime : undefined;
                leave.totalDays = totalNewDeducted;
                leave.updatedAt = new Date();
                await leave.save({ session });
            });

            res.json({ success: true, message: 'Leave request updated successfully', data: leave });
        } catch (error: any) {
            return res.status(400).json({ success: false, message: error.message });
        } finally {
            session.endSession();
        }
    } catch (error) {
        next(error);
    }
});

// PUT /api/leaves/:id/status - Approve or Reject Leave
router.put('/:id/status', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const user = authReq.user;
        if (!user || !['super-admin', 'admin', 'manager', 'hr', 'finance'].includes(user.role)) {
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
        // Also block if this manager submitted the leave on behalf of the employee
        if (leave.appliedBy && leave.appliedBy === user.userId && user.role !== 'super-admin') {
            return res.status(403).json({ message: 'Cannot approve/reject a leave you submitted' });
        }
        if (leave.status !== 'Pending') {
            return res.status(400).json({ message: 'Leave request is already processed' });
        }

        const actionByName = await getApproverActionName(user.userId, user.role);

        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                leave.status = status;
                leave.approvedBy = user.userId;
                leave.approvedByName = actionByName;
                leave.actionAt = new Date();
                if (adminNote) leave.adminNote = adminNote;

                const start = new Date(leave.startDate);
                const end = new Date(leave.endDate);
                const requestedTypeCode = leave.type.toLowerCase().trim();
                const leaveType = await LeaveType.findOne({ 
                    $or: [{ name: leave.type }, { code: requestedTypeCode }]
                }).session(session);
                const leaveTypeCode = leaveType ? leaveType.code : requestedTypeCode;

                // Calculate days per year
                const yearDaysMap = calculateLeaveDaysPerYear(start, end, leaveType, leave.duration, leave.totalDays);

                const { lookupIds } = await resolveEmployeeLookupIds(leave.employeeId, session);

                for (const [year, days] of yearDaysMap.entries()) {
                    const balance = await LeaveBalance.findOne({ employeeId: { $in: lookupIds }, year }).session(session);
                    if (balance) {
                        const category = balance.balances.find((b: any) => b.leaveTypeCode === leaveTypeCode);
                        if (category) {
                            category.pending = Math.max(0, roundDays(category.pending - days));
                            if (status === 'Approved') {
                                category.used = roundDays(category.used + days);
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
                            formatEmployeeFullName(emp, 'Employee'),
                            leave.type,
                            new Date(leave.startDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
                            new Date(leave.endDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
                            status,
                            actionByName,
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
        if (!user || !['super-admin', 'admin', 'hr', 'finance'].includes(user.role)) {
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
            const actionByName = await getApproverActionName(user.userId, user.role);
            await session.withTransaction(async () => {
                leave.status = status;
                leave.approvedBy = user.userId;
                leave.approvedByName = actionByName;
                leave.actionAt = new Date();
                if (adminNote) leave.adminNote = adminNote;

                const start = new Date(leave.startDate);
                const end = new Date(leave.endDate);
                const requestedTypeCode = leave.type.toLowerCase().trim();
                const leaveType = await LeaveType.findOne({ 
                    $or: [{ name: leave.type }, { code: requestedTypeCode }]
                }).session(session);
                const leaveTypeCode = leaveType ? leaveType.code : requestedTypeCode;

                // Calculate days per year
                const yearDaysMap = calculateLeaveDaysPerYear(start, end, leaveType, leave.duration, leave.totalDays);

                const { lookupIds } = await resolveEmployeeLookupIds(leave.employeeId, session);

                for (const [year, days] of yearDaysMap.entries()) {
                    const balance = await LeaveBalance.findOne({ employeeId: { $in: lookupIds }, year }).session(session);
                    if (balance) {
                        const category = balance.balances.find((b: any) => b.leaveTypeCode === leaveTypeCode);
                        if (category) {
                            // Undo old status
                            if (oldStatus === 'Pending') category.pending = Math.max(0, roundDays(category.pending - days));
                            if (oldStatus === 'Approved') category.used = Math.max(0, roundDays(category.used - days));
                            
                            // Apply new status
                            if (status === 'Pending') category.pending = roundDays(category.pending + days);
                            if (status === 'Approved') category.used = roundDays(category.used + days);
                            
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

        const { lookupIds } = await resolveEmployeeLookupIds(user.userId);
        const isOwner = lookupIds.includes(leave.employeeId) || leave.appliedBy === user.userId;
        const isManagerOrAdmin = ['super-admin', 'admin', 'manager', 'hr', 'finance'].includes(user.role);

        if (!isOwner && !isManagerOrAdmin) {
            return res.status(403).json({ message: 'Forbidden: Cannot cancel this leave request' });
        }

        if (leave.status === 'Cancelled') {
            return res.status(400).json({ message: 'Leave is already cancelled' });
        }

        if (leave.status === 'Rejected') {
            return res.status(400).json({ message: 'Cannot cancel a rejected leave' });
        }

        const oldStatus = leave.status;
        const session = await mongoose.startSession();
        try {
            const actionByName = await getApproverActionName(user.userId, user.role);
            await session.withTransaction(async () => {
                leave.status = 'Cancelled';
                leave.approvedBy = user.userId; // track who performed the cancellation action
                leave.approvedByName = actionByName;
                leave.actionAt = new Date();

                const start = new Date(leave.startDate);
                const end = new Date(leave.endDate);
                const requestedTypeCode = leave.type.toLowerCase().trim();
                const leaveType = await LeaveType.findOne({ 
                    $or: [{ name: leave.type }, { code: requestedTypeCode }]
                }).session(session);
                const leaveTypeCode = leaveType ? leaveType.code : requestedTypeCode;

                // Calculate days per year
                const yearDaysMap = calculateLeaveDaysPerYear(start, end, leaveType, leave.duration, leave.totalDays);

                const { lookupIds } = await resolveEmployeeLookupIds(leave.employeeId, session);

                for (const [year, days] of yearDaysMap.entries()) {
                    const balance = await LeaveBalance.findOne({ employeeId: { $in: lookupIds }, year }).session(session);
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
                            formatEmployeeFullName(emp, 'Employee'),
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

                    const { lookupIds } = await resolveEmployeeLookupIds(leave.employeeId, session);

                    for (const [year, days] of yearDaysMap.entries()) {
                        const balance = await LeaveBalance.findOne({ employeeId: { $in: lookupIds }, year }).session(session);
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
