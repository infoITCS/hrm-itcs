import AttendancePunch from '../models/AttendancePunch';
import AttendanceRecord, { AttendanceStatus } from '../models/AttendanceRecord';
import DeviceLocation from '../models/DeviceLocation';

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
            .lean();

        if (punches.length === 0) return; // Nothing to process

        const allPunchTimes = punches.map(p => p.punchTime);
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

    const records = await AttendanceRecord.find(filter).lean();

    const totalPresent  = records.filter(r => r.status === 'Present').length;
    const totalLate     = records.filter(r => r.status === 'Late').length;
    const totalHalfDay  = records.filter(r => r.status === 'Half-Day').length;
    const totalAbsent   = records.filter(r => r.status === 'Absent').length;
    const totalOnLeave  = records.filter(r => r.status === 'On Leave').length;
    const totalIncomplete = records.filter(r => r.status === 'Incomplete').length;

    const avgWorkMins = records.length
        ? Math.round(records.reduce((acc, r) => acc + r.workDurationMinutes, 0) / records.length)
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
