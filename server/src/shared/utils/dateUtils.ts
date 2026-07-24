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

/** If worked more than 5 hours, deduct 60 mins for lunch. */
export function applyLunchDeduction(rawMinutes: number): number {
    return rawMinutes > 5 * 60 ? rawMinutes - 60 : rawMinutes;
}

/** Format a Date to PKT "HH:MM" string for display/notes. */
export function toPKTTimeString(date: Date): string {
    const h = (date.getUTCHours() + 5) % 24;
    const m = date.getUTCMinutes();
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
