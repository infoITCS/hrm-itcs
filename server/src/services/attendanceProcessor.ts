import AttendancePunch, { IAttendancePunch } from '../models/AttendancePunch';
import AttendanceRecord, { AttendanceStatus } from '../models/AttendanceRecord';
import DeviceLocation from '../models/DeviceLocation';
import LeaveRequest, { LeaveStatus, ILeaveRequest } from '../models/LeaveRequest';
import Holiday, { IHoliday } from '../models/Holiday';
import Employee from '../models/Employee';
import { fetchReport } from './zktCloudService';

// Default shift for Main Office (fallback if no DeviceLocation config exists)
const DEFAULT_SHIFT_START  = '09:00';
const DEFAULT_SHIFT_END    = '18:00';
const DEFAULT_GRACE_MINS   = 15;
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
    const holiday = await Holiday.findOne({
        date: dateStr,
        $or: [{ location: { $exists: false } }, { location: null }, { location }]
    }).lean() as any;
    return holiday?.name || null;
}

/** Check if an employee is on approved leave for a specific date */
export async function checkLeave(employeeId: string, dateStr: string): Promise<string | null> {
    const leave = await LeaveRequest.findOne({
        employeeId,
        startDate: { $lte: dateStr },
        endDate: { $gte: dateStr },
        status: LeaveStatus.APPROVED
    }).lean() as any;
    return leave?.type || null;
}

/**
 * processEmployeePunches — recompute attendance record for one employee on one date.
 * Called after every new punch is saved.
 */
export async function processEmployeePunches(
    employeeId: string,
    dateStr: string,    // "YYYY-MM-DD"
    deviceSN: string
): Promise<void> {
    try {
        // Fetch shift config for this device
        const deviceConfig = await DeviceLocation.findOne({ deviceSN, isActive: true });

        const shiftStart       = deviceConfig?.shiftStart       ?? DEFAULT_SHIFT_START;
        const shiftEnd         = deviceConfig?.shiftEnd         ?? DEFAULT_SHIFT_END;
        const graceMins        = deviceConfig?.graceMinutes     ?? DEFAULT_GRACE_MINS;
        const halfDayHrs       = deviceConfig?.halfDayThresholdHours ?? DEFAULT_HALF_DAY_HRS;
        const locationName     = deviceConfig?.locationName     ?? 'Main Office';

        // Fetch all punches for this employee on this date, sorted chronologically
        const dayStart = new Date(dateStr + 'T00:00:00.000Z');
        const dayEnd   = new Date(dateStr + 'T23:59:59.999Z');

        const punches = await AttendancePunch
            .find({ employeeId, punchTime: { $gte: dayStart, $lte: dayEnd } })
            .sort({ punchTime: 1 })
            .lean() as any[];

        // --- Handle zero punches (Absent / Leave / Holiday / Weekend) ---
        if (punches.length === 0) {
            const holidayName = await checkHoliday(dateStr, locationName);
            const leaveType   = await checkLeave(employeeId, dateStr);
            const weekend     = isWeekend(dateStr);

            let zeroStatus: AttendanceStatus = 'Absent';
            if (holidayName) zeroStatus = 'Holiday';
            else if (leaveType)   zeroStatus = 'On Leave';
            else if (weekend)     zeroStatus = 'Weekend';

            await AttendanceRecord.findOneAndUpdate(
                { employeeId, date: dateStr },
                {
                    $set: {
                        employeeId,
                        date: dateStr,
                        location: locationName,
                        status: zeroStatus,
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
        const checkIn  = allPunchTimes[0];
        const checkOut = allPunchTimes.length > 1 ? allPunchTimes[allPunchTimes.length - 1] : undefined;

        // --- Calculate work duration ---
        let workDurationMinutes = 0;
        if (checkOut) {
            workDurationMinutes = Math.floor(
                (checkOut.getTime() - checkIn.getTime()) / 60000
            );
        }

        // --- Calculate late minutes ---
        const shiftStartTime = buildShiftTime(dateStr, shiftStart);
        let lateMinutes = 0;
        const diffMins = Math.floor((checkIn.getTime() - shiftStartTime.getTime()) / 60000);
        if (diffMins > graceMins) {
            lateMinutes = diffMins;
        }

        // --- Calculate overtime minutes ---
        let overtimeMinutes = 0;
        if (checkOut) {
            const shiftEndTime = buildShiftTime(dateStr, shiftEnd);
            const otDiff = Math.floor((checkOut.getTime() - shiftEndTime.getTime()) / 60000);
            if (otDiff > 0) {
                overtimeMinutes = otDiff;
            }
        }

        // --- Determine status ---
        let status: AttendanceStatus;
        if (!checkOut) {
            status = 'Incomplete'; // Still in office or forgot to check out
        } else if (workDurationMinutes < halfDayHrs * 60) {
            status = 'Half-Day';
        } else if (lateMinutes > 0) {
            status = 'Late';
        } else {
            status = 'Present';
        }

        // --- Upsert AttendanceRecord ---
        await AttendanceRecord.findOneAndUpdate(
            { employeeId, date: dateStr },
            {
                $set: {
                    employeeId,
                    date: dateStr,
                    location: locationName,
                    checkIn,
                    checkOut,
                    workDurationMinutes,
                    status,
                    lateMinutes,
                    overtimeMinutes,
                    allPunches: allPunchTimes,
                }
            },
            { upsert: true, new: true }
        );

        // Mark all processed punches
        await AttendancePunch.updateMany(
            { employeeId, punchTime: { $gte: dayStart, $lte: dayEnd } },
            { $set: { processed: true } }
        );

    } catch (err) {
        console.error(`[AttendanceProcessor] Error processing ${employeeId} on ${dateStr}:`, err);
    }
}

/**
 * getDashboardSummary — aggregate stats for a given date and optional location.
 */
export async function getDashboardSummary(dateStr: string, location?: string) {
    const filter: Record<string, any> = { date: dateStr };
    if (location) filter.location = location;

    const records = await AttendanceRecord.find(filter).lean() as any[];
    const today = new Date().toISOString().slice(0, 10);

    let totalPresent  = records.filter(r => ['Present', 'Late', 'Half-Day', 'Incomplete'].includes(r.status)).length;
    let totalLate     = records.filter(r => r.status === 'Late').length;
    let totalHalfDay  = records.filter(r => r.status === 'Half-Day').length;
    let totalAbsent   = records.filter(r => r.status === 'Absent').length;
    let totalOnLeave  = records.filter(r => r.status === 'On Leave').length;
    let totalIncomplete = records.filter(r => r.status === 'Incomplete').length;

    // --- Live Data Integration for Today ---
    if (dateStr === today) {
        // Find all active employees to calculate a real 'Absent' count
        const activeEmployees = await Employee.find({
            'employmentStatus.status': { $nin: ['Terminated', 'Resigned'] }
        }).select('employeeId').lean();
        
        const totalActive = activeEmployees.length;

        // Find employees who have punched today but don't have a record yet
        const startOfDay = new Date(today + 'T00:00:00.000Z');
        const endOfDay   = new Date(today + 'T23:59:59.999Z');
        const livePunches = await AttendancePunch.distinct('employeeId', {
            punchTime: { $gte: startOfDay, $lte: endOfDay }
        });

        const recordedIds = new Set(records.map(r => r.employeeId));
        let liveExtraPresent = 0;

        for (const empId of livePunches) {
            if (!recordedIds.has(empId)) {
                liveExtraPresent++;
            }
        }

        totalPresent += liveExtraPresent;
        // Absent = Total - (Present + On Leave + Holiday + Record)
        // For a simpler live view, we'll just show the difference
        totalAbsent = Math.max(0, totalActive - (totalPresent + totalOnLeave));
    }

    const avgWorkMins = records.length
        ? Math.round(records.reduce((acc, r) => acc + (r.workDurationMinutes || 0), 0) / records.length)
        : 0;

    return {
        date: dateStr,
        location: location ?? 'All',
        totalPresent,
        totalLate,
        totalHalfDay,
        totalAbsent,
        totalOnLeave,
        totalIncomplete,
        avgWorkMins,
        records,
    };
}

/**
 * processDailyAbsenteeism — runs at the end of the day or via scheduler.
 * Finds all active employees with no attendance records for the date and processes them.
 */
export async function processDailyAbsenteeism(dateStr: string): Promise<number> {
    try {
        console.log(`[AttendanceProcessor] Running absenteeism check for ${dateStr}...`);

        // 1. Get all active employees
        const activeEmployees = await Employee.find({
            'employmentStatus.status': { $nin: ['Terminated', 'Resigned'] }
        }).select('employeeId jobInfo.workLocation').lean();

        // 2. Get existing records for this date
        const existingRecords = await AttendanceRecord.find({ date: dateStr }).select('employeeId').lean();
        const existingIds     = new Set(existingRecords.map(r => r.employeeId));

        // 3. Find employees with NO records
        const missing = activeEmployees.filter(e => !existingIds.has(e.employeeId));

        if (missing.length === 0) return 0;

        console.log(`[AttendanceProcessor] Found ${missing.length} employees with no records. Processing...`);

        // 4. Run processEmployeePunches for each missing employee 
        // (our updated function will handle Leave/Holiday/Absent logic)
        for (const emp of missing) {
            // We pass a dummy deviceSN or use the employee's workLocation to find the right shift/device config
            // For now, "Main Office" default logic inside processEmployeePunches will handle it.
            await processEmployeePunches(emp.employeeId, dateStr, 'SYSTEM-TASK');
        }

        return missing.length;
    } catch (err) {
        console.error('[AttendanceProcessor] Error in absenteeism worker:', err);
        return 0;
    }
}

/**
 * syncFromMachineReport — fetches the pre-calculated report from ZKTeco
 * and merges it with HRM Context (Leaves/Holidays).
 */
export async function syncFromMachineReport(dateStr: string): Promise<number> {
    try {
        console.log(`[AttendanceProcessor] Syncing from machine report for ${dateStr}...`);
        
        // 1. Fetch pre-calculated report from ZKTeco
        const report = await fetchReport(dateStr, dateStr);
        if (report.length === 0) return 0;

        // 2. Build biometricPin → HRM employee mapping
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

            // --- Check HRM Context (Overlay) ---
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
                // Use machine's calculated status
                // Mapping machine strings to our internal enum
                if (entry.status === 'Present') finalStatus = 'Present';
                else if (entry.status === 'Absent')  finalStatus = 'Absent';
                else if (entry.status === 'Late')    finalStatus = 'Late';
                else if (entry.status.includes('Early')) finalStatus = 'Half-Day';
                else finalStatus = 'Present';
            }

            // Convert work_time (HH:MM:SS) to minutes
            let workMins = 0;
            if (entry.work_time) {
                const [h, m] = entry.work_time.split(':').map(Number);
                workMins = (h || 0) * 60 + (m || 0);
            }

            // --- Upsert AttendanceRecord ---
            await AttendanceRecord.findOneAndUpdate(
                { employeeId: hrmEmpId, date: dateStr },
                {
                    $set: {
                        employeeId: hrmEmpId,
                        date: dateStr,
                        status: finalStatus,
                        workDurationMinutes: workMins,
                        note: note || undefined,
                        checkIn:  entry.clock_in  ? new Date(`${dateStr}T${entry.clock_in}`) : undefined,
                        checkOut: entry.clock_out ? new Date(`${dateStr}T${entry.clock_out}`) : undefined,
                        manuallyAdjusted: false,
                    }
                },
                { upsert: true }
            );
            processedCount++;
        }

        return processedCount;
    } catch (err) {
        console.error('[AttendanceProcessor] Error syncing from machine report:', err);
        return 0;
    }
}
