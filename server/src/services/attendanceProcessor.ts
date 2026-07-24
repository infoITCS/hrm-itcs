import AttendancePunch, { IAttendancePunch } from '../models/AttendancePunch';
import AttendanceRecord, { AttendanceStatus } from '../models/AttendanceRecord';
import DeviceLocation from '../models/DeviceLocation';
import LeaveRequest, { LeaveStatus } from '../models/LeaveRequest';
import Holiday from '../models/Holiday';
import Employee from '../models/Employee';
import WorkShift from '../models/WorkShift';
import { fetchReport } from './zktCloudService';
import { isValidCheckout } from '../shared/utils/dateUtils';
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
    const orConditions: Record<string, unknown>[] = [
        { location: { $exists: false } },
        { location: null }
    ];
    if (location) orConditions.push({ location });

    const holiday = await Holiday.findOne({
        date: dateStr,
        $or: orConditions
    }).lean() as any;
    return holiday?.name || null;
}

/** Check if an employee is on approved leave for a specific date */
export async function checkLeave(employeeId: string, dateStr: string): Promise<string | null> {
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
    return leave?.type || null;
}

/**
 * processEmployeePunches — recompute attendance record for one employee on one date.
 */
export async function processEmployeePunches(
    employeeId: string,
    dateStr: string,
    deviceSN: string
): Promise<void> {
    try {
        let resolvedEmployeeId = employeeId;
        if (employeeId && employeeId.length === 24) {
            const emp = await Employee.findOne({ userId: employeeId }).lean() as any;
            if (emp) resolvedEmployeeId = emp.employeeId;
        }

        const deviceConfig = await DeviceLocation.findOne({ deviceSN, isActive: true });
        
        // [NEW] Multi-Shift Support: Fetch employee's assigned shift
        const employee = await Employee.findOne({ employeeId: resolvedEmployeeId }).populate('jobInfo.shift').lean() as any;
        const empShift = employee?.jobInfo?.shift;

        // Shift Configuration Priority: 1. Employee Shift -> 2. Device Location -> 3. Hardcoded Defaults
        const shiftStart       = empShift?.startTime        ?? deviceConfig?.shiftStart       ?? DEFAULT_SHIFT_START;
        const shiftEnd         = empShift?.endTime          ?? deviceConfig?.shiftEnd         ?? DEFAULT_SHIFT_END;
        const graceMins        = empShift?.graceMinutes     ?? deviceConfig?.graceMinutes     ?? DEFAULT_GRACE_MINS;
        const halfDayHrs       = empShift?.halfDayThreshold ?? deviceConfig?.halfDayThresholdHours ?? DEFAULT_HALF_DAY_HRS;
        const locationName     = deviceConfig?.locationName     ?? 'ISB-Office';

        const dayStart = new Date(dateStr + 'T00:00:00.000Z');
        const dayEnd   = new Date(dateStr + 'T23:59:59.999Z');

        const punches = await AttendancePunch
            .find({ employeeId: resolvedEmployeeId, punchTime: { $gte: dayStart, $lte: dayEnd } })
            .sort({ punchTime: 1 })
            .lean() as any[];

        if (punches.length === 0) {
            const holidayName = await checkHoliday(dateStr, locationName);
            const leaveType   = await checkLeave(resolvedEmployeeId, dateStr);
            const weekend     = isWeekend(dateStr);

            let zeroStatus: AttendanceStatus = 'Absent';
            if (holidayName) zeroStatus = 'Holiday';
            else if (leaveType)   zeroStatus = 'On Leave';
            else if (weekend)     zeroStatus = 'Weekend';

            await AttendanceRecord.findOneAndUpdate(
                { employeeId: resolvedEmployeeId, date: dateStr },
                {
                    $set: {
                        employeeId: resolvedEmployeeId,
                        date: dateStr,
                        location: locationName,
                        status: zeroStatus,
                        shiftStart,
                        shiftEnd,
                        leaveType: leaveType || undefined,
                        isHalfDay: false,
                        note: holidayName || leaveType || (weekend ? 'Weekend' : undefined),
                        workDurationMinutes: 0,
                        lateMinutes: 0,
                        overtimeMinutes: 0,
                        allPunches: [],
                    }
                },
                { upsert: true }
            );
            return;
        }

        const allPunchTimes = punches.map((p: IAttendancePunch) => p.punchTime);
        const checkIn = allPunchTimes[0];
        let checkOut: Date | undefined = undefined;

        if (allPunchTimes.length > 1) {
            const lastPunch = allPunchTimes[allPunchTimes.length - 1];
            if (isValidCheckout(checkIn, lastPunch)) {
                checkOut = lastPunch;
            }
        }

        // Suggestion 3: Check-out grace period (10 minutes)
        const CHECK_OUT_GRACE_MINS = 10;
        const shiftEndTime = buildShiftTime(dateStr, shiftEnd);
        let isEarlyLeave = false;
        if (checkOut) {
            const earlyDiff = Math.floor((shiftEndTime.getTime() - checkOut.getTime()) / 60000);
            if (earlyDiff > CHECK_OUT_GRACE_MINS) {
                isEarlyLeave = true;
            }
        }

        // Suggestion 2: Auto Lunch Deduction (60 mins if worked > 5 hours)
        let workDurationMinutes = 0;
        if (checkOut) {
            let rawMins = Math.floor((checkOut.getTime() - checkIn.getTime()) / 60000);
            // If they spent more than 5 hours in the office, assume 1 hour was for lunch
            if (rawMins > 5 * 60) {
                workDurationMinutes = rawMins - 60;
            } else {
                workDurationMinutes = rawMins;
            }
        }

        const shiftStartTime = buildShiftTime(dateStr, shiftStart);
        let lateMinutes = 0;
        const diffMins = Math.floor((checkIn.getTime() - shiftStartTime.getTime()) / 60000);
        if (diffMins > graceMins) lateMinutes = diffMins - graceMins;

        let overtimeMinutes = 0;
        if (checkOut) {
            const otDiff = Math.floor((checkOut.getTime() - shiftEndTime.getTime()) / 60000);
            if (otDiff > 0) overtimeMinutes = otDiff;
        }

        const leaveType = await checkLeave(resolvedEmployeeId, dateStr);

        // Suggestion 1: Early Leave Status
        let status: AttendanceStatus;
        if (!checkOut) {
            status = 'Incomplete';
        } else if (workDurationMinutes < halfDayHrs * 60) {
            status = leaveType ? 'On Leave' : 'Half-Day';
        } else if (isEarlyLeave) {
            status = 'Early Leave';
        } else if (lateMinutes > 0) {
            status = 'Late';
        } else {
            status = 'Present';
        }

        await AttendanceRecord.findOneAndUpdate(
            { employeeId: resolvedEmployeeId, date: dateStr },
            {
                $set: {
                    employeeId: resolvedEmployeeId,
                    date: dateStr,
                    location: locationName,
                    checkIn,
                    checkOut,
                    shiftStart,
                    shiftEnd,
                    workDurationMinutes,
                    status,
                    lateMinutes,
                    overtimeMinutes,
                    leaveType: leaveType || undefined,
                    isHalfDay: status === 'Half-Day' || (workDurationMinutes > 0 && workDurationMinutes < (halfDayHrs * 60)),
                    allPunches: allPunchTimes,
                }
            },
            { upsert: true, new: true }
        );

        await AttendancePunch.updateMany(
            { employeeId: resolvedEmployeeId, punchTime: { $gte: dayStart, $lte: dayEnd } },
            { $set: { processed: true } }
        );

    } catch (err) {
        logger.error(`[AttendanceProcessor] Error processing ${employeeId} on ${dateStr}:`, err);
    }
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

            const isLate = (record?.lateMinutes ?? 0) > 0 || (live ? live.firstPunch > lateThreshold : false);
            
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
 * syncFromMachineReport — fetches the pre-calculated report from ZKTeco
 */
export async function syncFromMachineReport(dateStr: string): Promise<number> {
    try {
        const report = await fetchReport(dateStr, dateStr);
        if (report.length === 0) return 0;

        const uniquePins = [...new Set(report.map(r => r.emp_code))];
        const matchedEmployees = await Employee.find({
            biometricPin: { $in: uniquePins }
        }).select('employeeId biometricPin').lean();
        
        const pinToHrmId = new Map<string, string>(
            matchedEmployees.map(e => [e.biometricPin as string, e.employeeId])
        );

        let processedCount = 0;

        for (const entry of report) {
            const hrmEmpId = pinToHrmId.get(entry.emp_code);
            if (!hrmEmpId) continue;

            const holidayName = await checkHoliday(dateStr);
            const leaveType   = await checkLeave(hrmEmpId, dateStr);
            const weekend     = isWeekend(dateStr);

            let finalStatus: AttendanceStatus;
            let note = entry.status;

            if (holidayName) {
                finalStatus = 'Holiday';
                note = holidayName;
            } else if (leaveType) {
                finalStatus = 'On Leave';
                note = leaveType;
            } else if (entry.status === 'Absent' && weekend) {
                finalStatus = 'Weekend';
                note = 'Weekend';
            } else {
                if (entry.status === 'Present') finalStatus = 'Present';
                else if (entry.status === 'Absent')  finalStatus = 'Absent';
                else if (entry.status === 'Late')    finalStatus = 'Late';
                else if (entry.status.includes('Early')) finalStatus = 'Half-Day';
                else finalStatus = 'Present';
            }

            let workMins = 0;
            if (entry.work_time) {
                const [h, m] = entry.work_time.split(':').map(Number);
                workMins = (h || 0) * 60 + (m || 0);
            }

            await AttendanceRecord.findOneAndUpdate(
                { employeeId: hrmEmpId, date: dateStr },
                {
                    $set: {
                        employeeId: hrmEmpId,
                        date: dateStr,
                        status: finalStatus,
                        workDurationMinutes: workMins,
                        note: note || undefined,
                        checkIn:  entry.clock_in  ? buildShiftTime(dateStr, entry.clock_in) : undefined,
                        checkOut: entry.clock_out ? buildShiftTime(dateStr, entry.clock_out) : undefined,
                        manuallyAdjusted: false,
                    }
                },
                { upsert: true }
            );
            processedCount++;
        }

        return processedCount;
    } catch (err) {
        logger.error('[AttendanceProcessor] Error syncing from machine report:', err);
        return 0;
    }
}

/**
 * autoCloseIncompleteRecords — handles employees who forgot to clock out.
 */
export async function autoCloseIncompleteRecords(dateStr: string): Promise<{
    processed: number;
    skipped: number;
    details: { employeeId: string; autoCheckOut: string; status: string }[];
}> {
    const incompleteRecords = await AttendanceRecord.find({
        date: dateStr,
        status: 'Incomplete',
        manuallyAdjusted: { $ne: true },
    }).lean() as any[];

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

        const deviceConfig: any = deviceMap.get(record.location);
        const employee = employeeMap.get(record.employeeId);
        const empShift = employee?.jobInfo?.shift;

        const shiftEnd     = empShift?.endTime          ?? deviceConfig?.shiftEnd               ?? DEFAULT_SHIFT_END;
        const halfDayHrs   = empShift?.halfDayThreshold ?? deviceConfig?.halfDayThresholdHours  ?? DEFAULT_HALF_DAY_HRS;
        const shiftStart   = empShift?.startTime        ?? deviceConfig?.shiftStart             ?? DEFAULT_SHIFT_START;
        const graceMins    = empShift?.graceMinutes     ?? deviceConfig?.graceMinutes           ?? DEFAULT_GRACE_MINS;

        const autoCheckOut = buildShiftTime(dateStr, shiftEnd);
        const effectiveCheckOut = autoCheckOut > checkInTime ? autoCheckOut : new Date(checkInTime.getTime() + 30 * 60 * 1000);

        let rawMins = Math.floor((effectiveCheckOut.getTime() - checkInTime.getTime()) / 60000);
        // Apply lunch deduction
        const workDurationMinutes = rawMins > 5 * 60 ? (rawMins - 60) : rawMins;

        const shiftStartTime = buildShiftTime(dateStr, shiftStart);
        const shiftEndTime = buildShiftTime(dateStr, shiftEnd);
        const diffMins = Math.floor((checkInTime.getTime() - shiftStartTime.getTime()) / 60000);
        const lateMinutes = diffMins > graceMins ? (diffMins - graceMins) : 0;

        const earlyDiff = Math.floor((shiftEndTime.getTime() - effectiveCheckOut.getTime()) / 60000);
        const isEarlyLeave = earlyDiff > 10;

        let status: AttendanceStatus;
        if (workDurationMinutes < halfDayHrs * 60) status = 'Half-Day';
        else if (isEarlyLeave) status = 'Early Leave';
        else if (lateMinutes > 0) status = 'Late';
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
                    note: `Auto-closed: no clock-out recorded (assumed ${checkOutStr})`,
                },
            }
        );

        processed++;
        details.push({ employeeId: record.employeeId, autoCheckOut: checkOutStr, status });
    }

    return { processed, skipped, details };
}
