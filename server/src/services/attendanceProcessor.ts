import AttendancePunch, { IAttendancePunch } from '../models/AttendancePunch';
import AttendanceRecord, { AttendanceStatus } from '../models/AttendanceRecord';
import DeviceLocation from '../models/DeviceLocation';
import LeaveRequest, { LeaveStatus } from '../models/LeaveRequest';
import { findHolidayForDate as lookupHolidayForDate } from '../utils/holidayUtils';
import Employee from '../models/Employee';
import WorkShift from '../models/WorkShift';
import { fetchReport } from './zktCloudService';
import { isValidCheckout, applyLunchDeduction, startOfDay, endOfDay } from '../shared/utils/dateUtils';
import logger from '../utils/logger';


// Default shift for ISB-Office (fallback if no DeviceLocation config exists)
const DEFAULT_SHIFT_START  = '09:00';
const DEFAULT_SHIFT_END    = '18:00';
const DEFAULT_GRACE_MINS   = 30;
const DEFAULT_HALF_DAY_HRS = 4;

/** Convert "HH:MM" string + a base Date into a full Date on the same calendar day */
function buildShiftTime(dateStr: string, timeStr: string): Date {
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date(dateStr + 'T00:00:00.000Z');
    // Use local midnight offset to align with PKT (UTC+5)
    d.setUTCHours(h - 5, m, 0, 0); // PKT = UTC+5, so 09:00 PKT = 04:00 UTC
    return d;
}

/** Check if a given date is a weekend (Saturday or Sunday) */
export function isWeekend(dateStr: string): boolean {
    const d = new Date(dateStr + 'T00:00:00.000Z');
    const day = d.getUTCDay(); // 0 = Sunday, 6 = Saturday
    return day === 0 || day === 6;
}

/** Check if a given date is a holiday for the specific location */
export async function checkHoliday(dateStr: string, location?: string): Promise<string | null> {
    return lookupHolidayForDate(dateStr, location);
}

export interface ApprovedLeaveInfo {
    type: string;
    isHalfDay: boolean;
    duration?: string;
}

/** Check if an employee is on approved leave for a specific date */
export async function checkLeave(employeeId: string, dateStr: string): Promise<ApprovedLeaveInfo | null> {
    let readableId = employeeId;
    let userId = employeeId;

    if (employeeId && employeeId.length === 24) {
        const emp = await Employee.findOne({ userId: employeeId }).lean() as any;
        if (emp) readableId = emp.employeeId;
    } else {
        const emp = await Employee.findOne({ employeeId }).lean() as any;
        if (emp && emp.userId) userId = emp.userId;
    }

    const leave = await LeaveRequest.findOne({
        $or: [
            { employeeId: readableId },
            { employeeId: userId }
        ],
        startDate: { $lte: dateStr },
        endDate: { $gte: dateStr },
        status: LeaveStatus.APPROVED
    }).lean() as any;

    if (!leave) return null;

    const isHalf = Boolean(
        (leave.duration && leave.duration.toLowerCase().includes('half')) ||
        leave.totalDays === 0.5
    );

    return {
        type: leave.type,
        isHalfDay: isHalf,
        duration: leave.duration
    };
}

/**
 * processEmployeePunches — recompute attendance record for one employee on one date.
 * Unified with attendance.service.ts
 */
export async function processEmployeePunches(
    employeeId: string,
    dateStr: string,
    deviceSN: string
): Promise<void> {
    const { processEmployeePunches: svcProcess } = await import('../modules/attendance/attendance.service');
    return svcProcess(employeeId, dateStr, deviceSN);
}

/**
 * getDashboardSummary — aggregate stats for a given date and optional location.
 * Optimized for performance and silent refreshes.
 */
export async function getDashboardSummary(dateStr: string, location?: string, managerId?: string) {
    const filter: Record<string, any> = { date: dateStr };
    if (location) filter.location = location;

    // If managerId is provided, resolve their direct reports first
    let directReportIds: string[] | null = null;
    if (managerId) {
        const managedEmployees = await Employee.find({ 
            'jobInfo.reportingManager': managerId,
            isDeleted: { $ne: true }
        }).select('employeeId').lean();
        
        // Use an empty array if no subordinates found, but keep it non-null to signal that filtering is active
        directReportIds = managedEmployees.map(e => e.employeeId);
        filter.employeeId = { $in: directReportIds };
    }

    const records = await AttendanceRecord.find(filter).lean() as any[];

    // Fetch approved leaves for this date to distinguish from Absent
    const approvedLeaves = await LeaveRequest.find({
        startDate: { $lte: dateStr },
        endDate: { $gte: dateStr },
        status: LeaveStatus.APPROVED
    }).lean() as any[];
    const leaveMap = new Map(approvedLeaves.map(l => [l.employeeId, l.type]));

    let totalPresent = 0;
    let totalLate = 0;
    let totalHalfDay = 0;
    let totalEarlyLeave = 0;
    let totalAbsent = 0;
    let totalOnLeave = 0;
    let totalIncomplete = 0;

        const activeEmployeeFilter: Record<string, any> = {
            'employmentStatus.status': { $nin: ['Terminated', 'Resigned'] }
        };
        if (location) activeEmployeeFilter['jobInfo.workLocation'] = location;
        if (directReportIds) activeEmployeeFilter.employeeId = { $in: directReportIds };

        const totalActive = await Employee.countDocuments(activeEmployeeFilter);

        // Fetch location configuration for rules (default to ISB-Office if not specified)
        const config = await DeviceLocation.findOne({ 
            locationName: location || 'ISB-Office',
            isActive: true 
        }).lean() as any;

        const [shour, smin] = (config?.shiftStart || '09:00').split(':').map(Number);
        const grace = config?.graceMinutes ?? 30;

        // Determine Lateness Threshold based on config
        const lateThreshold = new Date(dateStr + 'T00:00:00.000Z');
        lateThreshold.setUTCHours(shour - 5, smin + grace, 0, 0); // Convert to UTC (Assuming PKT is UTC+5)

        const startOfDay = new Date(dateStr + 'T00:00:00.000Z');
        const endOfDay   = new Date(dateStr + 'T23:59:59.999Z');

        const livePunchMatch: Record<string, any> = { punchTime: { $gte: startOfDay, $lte: endOfDay } };
        if (location) livePunchMatch.location = location;
        if (directReportIds) livePunchMatch.employeeId = { $in: directReportIds };

        const livePunches = await AttendancePunch.aggregate([
            { $match: livePunchMatch },
            { $sort: { punchTime: 1 } },
            { $group: { 
                _id: "$employeeId", 
                firstPunch: { $first: "$punchTime" },
                lastPunch: { $last: "$punchTime" },
                count: { $sum: 1 } 
            } }
        ]);

        const recordMap = new Map(records.map((record: any) => [record.employeeId, record]));
        const liveMap = new Map(livePunches.map((punch: any) => [punch._id, punch]));
        const attendanceEmployeeIds = [...new Set([...recordMap.keys(), ...liveMap.keys()])];

        totalPresent = 0;
        totalLate = 0;
        totalEarlyLeave = 0;
        totalIncomplete = 0;
        totalHalfDay = 0;

        for (const employeeId of attendanceEmployeeIds) {
            const record: any = recordMap.get(employeeId);
            const live: any = liveMap.get(employeeId);
            const nonAttendanceStatuses = ['Absent', 'On Leave', 'Holiday', 'Weekend'];

            if (!live && record && nonAttendanceStatuses.includes(record.status)) {
                continue;
            }

            const checkIn = record?.checkIn ?? live?.firstPunch;
            if (!checkIn) continue;

            const isLate = record?.manuallyAdjusted
                ? (record.lateMinutes ?? 0) > 0
                : (new Date(checkIn) > lateThreshold);
            
            // New logic: Check Out must be after 1 PM and >= 60 mins after Check In
            let hasCheckOut = Boolean(record?.checkOut);
            if (!hasCheckOut && live && live.count > 1) {
                const lastPunch = new Date(live.lastPunch);
                if (isValidCheckout(new Date(checkIn), lastPunch)) {
                    hasCheckOut = true;
                }
            }

            const isEarlyLeave = record?.status === 'Early Leave';
            const isHalfDay = record?.status === 'Half-Day' || record?.isHalfDay;
            
            if (isLate) {
                totalLate++;
            } else if (isEarlyLeave) {
                totalEarlyLeave++;
            } else if (!hasCheckOut) {
                totalIncomplete++;
            } else {
                totalPresent++;
            }

            if (isHalfDay) totalHalfDay++;
        }

        const [recordedIdsForAbsent, punchedIdsForAbsent, activeIdsForAbsent] = await Promise.all([
            AttendanceRecord.find(filter).distinct('employeeId'),
            AttendancePunch.distinct('employeeId', livePunchMatch),
            Employee.find(activeEmployeeFilter).distinct('employeeId'),
        ]);

        const presentLikeIds = new Set([...recordedIdsForAbsent, ...punchedIdsForAbsent]);
        
        const weekendDay = isWeekend(dateStr);

        // Virtual classification: Missing employees are either 'Absent' or 'On Leave'
        // On weekends, we don't count missing employees as Absent.
        const virtualAbsentCount = weekendDay 
            ? 0 
            : activeIdsForAbsent.filter((empId: string) => !presentLikeIds.has(empId) && !leaveMap.has(empId)).length;
            
        const virtualOnLeaveCount = activeIdsForAbsent.filter((empId: string) => !presentLikeIds.has(empId) && leaveMap.has(empId)).length;

        const explicitAbsentCount = records.filter(r => r.status === 'Absent' && !liveMap.has(r.employeeId)).length;
        const explicitOnLeaveCount = records.filter(r => r.status === 'On Leave').length;

        totalAbsent = explicitAbsentCount + virtualAbsentCount;
        totalOnLeave = explicitOnLeaveCount + virtualOnLeaveCount;

    const avgWorkMins = records.length
        ? Math.round(records.reduce((acc, r) => acc + (r.workDurationMinutes || 0), 0) / records.length)
        : 0;

    return {
        totalPresent,
        totalLate,
        totalAbsent,
        totalOnLeave,
        totalIncomplete,
        totalHalfDay,
        totalEarlyLeave,
        avgWorkMins,
        records: records.length > 500 ? [] : records
    };
}

/**
 * processDailyAbsenteeism — runs at the end of the day or via scheduler.
 */
export async function processDailyAbsenteeism(dateStr: string): Promise<number> {
    try {
        const activeEmployees = await Employee.find({
            'employmentStatus.status': { $nin: ['Terminated', 'Resigned'] }
        }).select('employeeId jobInfo.workLocation').lean();

        const existingRecords = await AttendanceRecord.find({ date: dateStr }).select('employeeId').lean();
        const existingIds     = new Set(existingRecords.map(r => r.employeeId));

        const missing = activeEmployees.filter(e => !existingIds.has(e.employeeId));

        if (missing.length === 0) return 0;

        for (const emp of missing) {
            await processEmployeePunches(emp.employeeId, dateStr, 'SYSTEM-TASK');
        }

        return missing.length;
    } catch (err) {
        logger.error('[AttendanceProcessor] Error in absenteeism worker:', err);
        return 0;
    }
}

/**
 * syncFromMachineReport — fetches the raw machine punches and synchronizes attendance.
 * Unified with attendance.service.ts
 */
export async function syncFromMachineReport(dateStr: string): Promise<number> {
    const { syncFromMachineReport: svcSync } = await import('../modules/attendance/attendance.service');
    return svcSync(dateStr);
}

/**
 * autoCloseIncompleteRecords — handles employees who forgot to clock out.
 */
export async function autoCloseIncompleteRecords(dateStr?: string): Promise<{
    processed: number;
    skipped: number;
    details: { employeeId: string; autoCheckOut: string; status: string }[];
}> {
    const todayStr = new Date().toISOString().slice(0, 10);
    const queryFilter: any = {
        status: 'Incomplete',
        manuallyAdjusted: { $ne: true },
    };

    if (dateStr) {
        queryFilter.date = dateStr;
    } else {
        queryFilter.date = { $lte: todayStr };
    }

    const incompleteRecords = await AttendanceRecord.find(queryFilter).lean() as any[];

    if (incompleteRecords.length === 0) {
        return { processed: 0, skipped: 0, details: [] };
    }

    const empIds = [...new Set(incompleteRecords.map(r => r.employeeId))];
    const locNames = [...new Set(incompleteRecords.map(r => r.location).filter(Boolean))];

    const [devices, employees] = await Promise.all([
        DeviceLocation.find({ locationName: { $in: locNames }, isActive: true }).lean(),
        Employee.find({ employeeId: { $in: empIds } }).populate('jobInfo.shift').lean() as any
    ]);

    const deviceMap = new Map(devices.map(d => [d.locationName, d]));
    const employeeMap = new Map<string, any>(employees.map((e: any) => [e.employeeId, e]));

    let processed = 0;
    let skipped = 0;
    const details: { employeeId: string; autoCheckOut: string; status: string }[] = [];

    for (const record of incompleteRecords) {
        const checkInTime = record.checkIn instanceof Date ? record.checkIn : new Date(record.checkIn);

        if (!checkInTime || isNaN(checkInTime.getTime())) {
            skipped++;
            continue;
        }

        const recDateStr = record.date || dateStr || todayStr;
        const deviceConfig: any = deviceMap.get(record.location);
        const employee = employeeMap.get(record.employeeId);
        const empShift = employee?.jobInfo?.shift;

        const shiftEnd     = empShift?.endTime          ?? deviceConfig?.shiftEnd               ?? DEFAULT_SHIFT_END;
        const halfDayHrs   = empShift?.halfDayThreshold ?? deviceConfig?.halfDayThresholdHours  ?? DEFAULT_HALF_DAY_HRS;
        const shiftStart   = empShift?.startTime        ?? deviceConfig?.shiftStart             ?? DEFAULT_SHIFT_START;
        const graceMins    = empShift?.graceMinutes     ?? deviceConfig?.graceMinutes           ?? DEFAULT_GRACE_MINS;
        const isOvernight  = shiftStart > shiftEnd;

        let autoCheckOut = buildShiftTime(recDateStr, shiftEnd);
        if (isOvernight) {
            autoCheckOut = new Date(autoCheckOut.getTime() + 24 * 60 * 60 * 1000);
        }

        // If current time is still before the shift end time + buffer (60 mins), skip (employee may still be working)
        const now = new Date();
        if (now.getTime() < autoCheckOut.getTime() + 60 * 60 * 1000) {
            skipped++;
            continue;
        }

        const effectiveCheckOut = autoCheckOut > checkInTime ? autoCheckOut : new Date(checkInTime.getTime() + 30 * 60 * 1000);

        let rawMins = Math.floor((effectiveCheckOut.getTime() - checkInTime.getTime()) / 60000);
        // Apply lunch deduction
        const workDurationMinutes = applyLunchDeduction(rawMins, {
            enableLunchDeduction: empShift?.enableLunchDeduction ?? true,
            lunchDeductionMinutes: empShift?.lunchDeductionMinutes ?? 60,
            lunchThresholdHours: empShift?.lunchThresholdHours ?? 5,
        });

        const shiftStartTime = buildShiftTime(recDateStr, shiftStart);
        let shiftEndTime = buildShiftTime(recDateStr, shiftEnd);
        if (isOvernight) {
            shiftEndTime = new Date(shiftEndTime.getTime() + 24 * 60 * 60 * 1000);
        }
        const diffMins = Math.floor((checkInTime.getTime() - shiftStartTime.getTime()) / 60000);
        const lateMinutes = diffMins > graceMins ? (diffMins - graceMins) : 0;

        const earlyDiff = Math.floor((shiftEndTime.getTime() - effectiveCheckOut.getTime()) / 60000);
        const isEarlyLeave = earlyDiff > 10;

        let status: AttendanceStatus;
        if (diffMins > graceMins) status = 'Late';
        else if (workDurationMinutes < halfDayHrs * 60) status = 'Half-Day';
        else if (isEarlyLeave) status = 'Early Leave';
        else status = 'Present';

        const pkHours = (effectiveCheckOut.getUTCHours() + 5) % 24;
        const pkMinutes = effectiveCheckOut.getUTCMinutes();
        const checkOutStr = `${pkHours.toString().padStart(2, '0')}:${pkMinutes.toString().padStart(2, '0')}`;

        await AttendanceRecord.updateOne(
            { _id: record._id },
            {
                $set: {
                    checkOut: effectiveCheckOut,
                    workDurationMinutes,
                    status,
                    lateMinutes,
                    isAutoClosed: true,
                    note: `Auto Clocked-Out (Missed Clock-Out - Assumed Shift End ${checkOutStr})`,
                },
            }
        );

        processed++;
        details.push({ employeeId: record.employeeId, autoCheckOut: checkOutStr, status });
    }

    return { processed, skipped, details };
}
