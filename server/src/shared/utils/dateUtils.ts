/**
 * dateUtils.ts — Single source of truth for all timezone/date operations.
 * PKT = UTC+5. All DB values are UTC. All display is PKT.
 * Replace ALL inline setUTCHours(hour - 5, ...) calls with these functions.
 */

/** Convert "HH:MM" PKT string + dateStr into a UTC Date. */
export function pktHHMMtoUtc(dateStr: string, timeStr: string): Date {
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date(`${dateStr}T00:00:00.000Z`);
    d.setUTCHours(h - 5, m, 0, 0);
    return d;
}

/** Convert a PKT date-time string (e.g. "YYYY-MM-DD HH:mm:ss" from machine/BioTime) into a UTC Date. */
export function pktDateTimeToUtc(dateTimeStr: string): Date {
    const clean = dateTimeStr.trim().replace(' ', 'T');
    if (/[zZ]|[+-]\d{2}(:?\d{2})?$/.test(clean)) {
        return new Date(clean);
    }
    return new Date(`${clean}+05:00`);
}

// removed todayPKT and nowPKT wrappers
export function startOfDay(dateStr: string): Date {
    const [y, m, d] = dateStr.split('-').map(Number);
    const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - PKT_OFFSET_MS);
}

export function endOfDay(dateStr: string): Date {
    const [y, m, d] = dateStr.split('-').map(Number);
    const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
    return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - PKT_OFFSET_MS);
}

/** Saturday (6) or Sunday (0) in UTC is weekend. */
export function isWeekend(dateStr: string): boolean {
    const day = new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
    return day === 0 || day === 6;
}

/**
 * The checkout heuristic used throughout the system:
 * A punch only counts as checkout if it is at least
 * 60 minutes after check-in to filter out quick errands or accidental double-taps.
 */
export function isValidCheckout(checkIn: Date, lastPunch: Date, minMinutes = 60): boolean {
    const minutesSinceCheckIn = Math.floor(
        (lastPunch.getTime() - checkIn.getTime()) / 60000
    );
    return minutesSinceCheckIn >= minMinutes;
}

/** Applies configurable lunch deduction based on shift settings. */
export function applyLunchDeduction(
    rawMinutes: number,
    config?: { enableLunchDeduction?: boolean; lunchDeductionMinutes?: number; lunchThresholdHours?: number }
): number {
    const enabled = config?.enableLunchDeduction ?? true;
    if (!enabled) return rawMinutes;

    const mins = config?.lunchDeductionMinutes ?? 60;
    const thresholdMins = (config?.lunchThresholdHours ?? 5) * 60;

    if (rawMinutes > thresholdMins) {
        return Math.max(0, rawMinutes - mins);
    }
    return rawMinutes;
}

/** Format a Date to PKT "HH:MM" string for display/notes. */
export function toPKTTimeString(date: Date): string {
    const h = (date.getUTCHours() + 5) % 24;
    const m = date.getUTCMinutes();
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Filter out rapid duplicate punches within the given threshold (default 60s) */
export function deduplicatePunches(punches: Date[], thresholdSeconds = 60): Date[] {
    const sorted = [...punches].sort((a, b) => a.getTime() - b.getTime());
    const result: Date[] = [];
    for (const p of sorted) {
        if (result.length === 0 || (p.getTime() - result[result.length - 1].getTime()) >= thresholdSeconds * 1000) {
            result.push(p);
        }
    }
    return result;
}

/** Normalize biometric PINs (trim, string/number equivalence, strip leading zeros) */
export function normalizeBiometricPin(pin: unknown): string {
    if (pin == null) return '';
    const str = String(pin).trim();
    if (!str) return '';
    const num = parseInt(str, 10);
    if (!isNaN(num) && String(num) === str.replace(/^0+/, '')) {
        return String(num);
    }
    return str;
}

export interface MatchedShiftResult {
    checkIn?: Date;
    checkOut?: Date;
    lateMinutes: number;
    workDurationMinutes: number;
    overtimeMinutes: number;
    isEarlyLeave: boolean;
    allPunches: Date[];
    offShiftPunches: Date[];
}

/**
 * Robust shift-window punch matching:
 * - Daytime shift (e.g. 09:00 - 18:00):
 *   Valid check-in window: [shiftStart - 3h, shiftStart + 5h] (e.g. 06:00 to 14:00).
 *   Punches outside (e.g. 12:00 AM midnight fun punch) are flagged as off-shift and do NOT hijack check-in.
 * - Overnight shift (e.g. 18:00 - 03:00):
 *   Full 24h cycle: [dateStr 12:00 PM, dateStr + 1 12:00 PM].
 *   Check-in: punch in evening window [shiftStart - 3h, shiftStart + 6h].
 *   Check-out: punch next morning in window [shiftStart + 4h, dateStr + 1 12:00 PM].
 */
export function matchShiftPunches(
    rawPunches: Date[],
    dateStr: string,
    config: {
        shiftStart: string;
        shiftEnd: string;
        graceMinutes?: number;
        isOvernight?: boolean;
        halfDayThresholdHours?: number;
        enableLunchDeduction?: boolean;
        lunchDeductionMinutes?: number;
        lunchThresholdHours?: number;
    }
): MatchedShiftResult {
    const punches = deduplicatePunches(rawPunches);
    const graceMins = config.graceMinutes ?? 30;
    const isOvernight = Boolean(config.isOvernight || config.shiftStart > config.shiftEnd);

    const shiftStartTime = pktHHMMtoUtc(dateStr, config.shiftStart);
    let shiftEndTime = pktHHMMtoUtc(dateStr, config.shiftEnd);
    if (isOvernight) {
        shiftEndTime = new Date(shiftEndTime.getTime() + 24 * 60 * 60 * 1000);
    }

    if (punches.length === 0) {
        return {
            lateMinutes: 0,
            workDurationMinutes: 0,
            overtimeMinutes: 0,
            isEarlyLeave: false,
            allPunches: [],
            offShiftPunches: []
        };
    }

    // Check-In Window boundaries
    const checkInStart = new Date(shiftStartTime.getTime() - 3 * 3600 * 1000);
    const checkInEnd = isOvernight
        ? new Date(shiftStartTime.getTime() + 6 * 3600 * 1000)
        : new Date(shiftStartTime.getTime() + 5 * 3600 * 1000); // 14:00 for 09:00 shift

    const checkInCandidates = punches.filter(p => p.getTime() >= checkInStart.getTime() && p.getTime() < shiftEndTime.getTime());
    const offShiftPunches = punches.filter(p => p.getTime() < checkInStart.getTime());

    let checkIn: Date | undefined = undefined;
    if (checkInCandidates.length > 0) {
        checkIn = checkInCandidates[0];
    } else {
        // Fallback for late arrivals after checkInEnd but before shiftEnd
        const lateArrival = punches.find(p => p.getTime() >= checkInEnd.getTime() && p.getTime() < shiftEndTime.getTime());
        if (lateArrival) {
            checkIn = lateArrival;
        }
    }

    let checkOut: Date | undefined = undefined;
    if (checkIn) {
        // Check-out must be at least 15 minutes after check-in
        const checkoutCandidates = punches.filter(p => p.getTime() - checkIn!.getTime() >= 15 * 60 * 1000);
        if (checkoutCandidates.length > 0) {
            checkOut = checkoutCandidates[checkoutCandidates.length - 1];
        }
    }

    let lateMinutes = 0;
    if (checkIn) {
        const diffMins = Math.floor((checkIn.getTime() - shiftStartTime.getTime()) / 60000);
        lateMinutes = diffMins > graceMins ? diffMins - graceMins : 0;
    }

    let workDurationMinutes = 0;
    let overtimeMinutes = 0;
    let isEarlyLeave = false;

    if (checkIn && checkOut) {
        const rawMins = Math.floor((checkOut.getTime() - checkIn.getTime()) / 60000);
        workDurationMinutes = applyLunchDeduction(rawMins, config);

        const otDiff = Math.floor((checkOut.getTime() - shiftEndTime.getTime()) / 60000);
        if (otDiff > 0) overtimeMinutes = otDiff;

        const earlyDiff = Math.floor((shiftEndTime.getTime() - checkOut.getTime()) / 60000);
        if (earlyDiff > 10) isEarlyLeave = true;
    }

    return {
        checkIn,
        checkOut,
        lateMinutes,
        workDurationMinutes,
        overtimeMinutes,
        isEarlyLeave,
        allPunches: punches,
        offShiftPunches
    };
}
