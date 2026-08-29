/** HR policy: late arrival before 2:00 PM → half-day cut; at/after 2:00 PM → full-day cut */
export const LATE_FULL_DAY_CUTOFF_TIME = '14:00';

export type AttendancePenaltyType = 'half' | 'full';

export interface AttendancePenaltyEvent {
    date: string;
    type: AttendancePenaltyType;
}

/** Map attendance record status to a payroll penalty type, if any. */
export function statusToPenaltyType(status: string): AttendancePenaltyType | null {
    if (status === 'Late') return 'half';
    if (status === 'Half-Day' || status === 'Absent') return 'full';
    return null;
}

/**
 * First penalty in the payroll period is exempt; return billable half/full day counts.
 */
export function applyFirstPenaltyExemption(penalties: AttendancePenaltyEvent[]): {
    halfDays: number;
    fullDays: number;
    exempted: number;
} {
    const sorted = [...penalties].sort((a, b) => a.date.localeCompare(b.date));
    const billable = sorted.slice(1);
    return {
        halfDays: billable.filter((p) => p.type === 'half').length,
        fullDays: billable.filter((p) => p.type === 'full').length,
        exempted: sorted.length > 0 ? 1 : 0,
    };
}
