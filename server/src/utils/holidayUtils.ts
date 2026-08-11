import Holiday from '../models/Holiday';

function monthDay(dateStr: string): string {
    return dateStr.slice(5, 10); // MM-DD
}

function addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr + 'T12:00:00.000Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

function datesBetween(start: string, end: string): string[] {
    const out: string[] = [];
    let cur = start;
    while (cur <= end) {
        out.push(cur);
        if (cur === end) break;
        cur = addDays(cur, 1);
    }
    return out;
}

function locationMatches(holidayLocation: string | null | undefined, employeeLocation?: string): boolean {
    if (!holidayLocation) return true;
    if (!employeeLocation) return true;
    return holidayLocation === employeeLocation;
}

function isDateInRecurringHoliday(dateStr: string, startDate: string, endDate: string): boolean {
    const md = monthDay(dateStr);
    const startMd = monthDay(startDate);
    const endMd = monthDay(endDate);
    if (startMd <= endMd) {
        return md >= startMd && md <= endMd;
    }
    return md >= startMd || md <= endMd;
}

function isDateInFixedHoliday(dateStr: string, startDate: string, endDate: string): boolean {
    return dateStr >= startDate && dateStr <= endDate;
}

function holidayAppliesOnDate(
    dateStr: string,
    holiday: { startDate: string; endDate: string; isRecurring?: boolean },
): boolean {
    if (holiday.isRecurring) {
        return isDateInRecurringHoliday(dateStr, holiday.startDate, holiday.endDate);
    }
    return isDateInFixedHoliday(dateStr, holiday.startDate, holiday.endDate);
}

/** Returns holiday name if dateStr is a configured holiday for the location (null = all offices). */
export async function findHolidayForDate(dateStr: string, location?: string): Promise<string | null> {
    const holidays = await Holiday.find().lean();
    for (const h of holidays as any[]) {
        if (!locationMatches(h.location, location)) continue;
        if (holidayAppliesOnDate(dateStr, h)) {
            return h.name;
        }
    }
    return null;
}

/** All holiday dates (and names) falling within [periodStart, periodEnd]. */
export async function getHolidayDatesInPeriod(
    periodStart: string,
    periodEnd: string,
    location?: string,
): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const holidays = await Holiday.find().lean();
    const periodDates = datesBetween(periodStart, periodEnd);

    for (const dateStr of periodDates) {
        for (const h of holidays as any[]) {
            if (!locationMatches(h.location, location)) continue;
            if (holidayAppliesOnDate(dateStr, h)) {
                result.set(dateStr, h.name);
                break;
            }
        }
    }

    return result;
}
