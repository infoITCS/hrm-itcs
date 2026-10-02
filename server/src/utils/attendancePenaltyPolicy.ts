/** HR policy: late arrival before 2:00 PM → half-day cut; at/after 2:00 PM → full-day cut */
export const LATE_FULL_DAY_CUTOFF_TIME = '14:00';

export type AttendancePenaltyType = 'half' | 'full';

export interface AttendancePenaltyEvent {
    date: string;
    type: AttendancePenaltyType;
}

/** Map attendance record status to a payroll penalty type, if any. */
export function statusToPenaltyType(status: string): AttendancePenaltyType | null {
    if (status === 'Late' || status === 'Half-Day') return 'half';
    if (status === 'Absent') return 'full';
    return null;
}

/**
 * Compute the number of standard working days (Monday–Friday) in a calendar month.
 * month is 1-indexed (1 = January, 12 = December).
 */
export function getWorkingDaysInMonth(year: number, month: number): number {
    const first = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0));
    const last = new Date(Date.UTC(year, month, 0, 12, 0, 0));
    let count = 0;
    const cur = new Date(first);
    while (cur <= last) {
        const d = cur.getUTCDay();
        if (d !== 0 && d !== 6) count++;
        cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return count > 0 ? count : 22;
}

/**
 * First penalty in the payroll period is exempt; return billable half/full day counts and items.
 */
export function applyFirstPenaltyExemption(penalties: AttendancePenaltyEvent[]): {
    halfDays: number;
    fullDays: number;
    exempted: number;
    billablePenalties: AttendancePenaltyEvent[];
    exemptedPenalty?: AttendancePenaltyEvent;
} {
    const sorted = [...penalties].sort((a, b) => a.date.localeCompare(b.date));
    const billable = sorted.slice(1);
    return {
        halfDays: billable.filter((p) => p.type === 'half').length,
        fullDays: billable.filter((p) => p.type === 'full').length,
        exempted: sorted.length > 0 ? 1 : 0,
        billablePenalties: billable,
        exemptedPenalty: sorted[0],
    };
}

