import { AttendanceStatus } from '../../models/AttendanceRecord';

export type { AttendanceStatus };

export interface ShiftConfig {
    shiftStart: string;           // "HH:MM"
    shiftEnd: string;             // "HH:MM"
    graceMinutes: number;
    halfDayThresholdHours: number;
    locationName: string;
    enableLunchDeduction?: boolean;
    lunchDeductionMinutes?: number;
    lunchThresholdHours?: number;
}

export interface DashboardSummary {
    totalPresent: number;
    totalLate: number;
    totalAbsent: number;
    totalOnLeave: number;
    totalIncomplete: number;
    totalHalfDay: number;
    totalEarlyLeave: number;
    avgWorkMins: number;
}

export interface AttendanceRecordDTO {
    _id: string;
    employeeId: string;
    employeeName: string;
    date: string;
    location: string;
    checkIn?: Date | string;
    checkOut?: Date | string;
    workDurationMinutes: number;
    status: AttendanceStatus;
    lateMinutes: number;
    overtimeMinutes: number;
    leaveType?: string;
    note?: string;
    manuallyAdjusted: boolean;
    isVirtual?: boolean;
}

export interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
    pages: number;
}

export interface RecordsPage {
    data: AttendanceRecordDTO[];
    pagination: PaginationMeta;
}

export type IdFilter = string | string[];
export interface DateRange { from: string; to: string; }
export type StatusFilter = AttendanceStatus | AttendanceStatus[] | string;
export interface LateMinutesFilter { min?: number; max?: number; }

export interface RecordFilter {
    employeeId?: IdFilter;
    date?: string | DateRange;
    status?: StatusFilter;
    location?: string;
    lateMinutes?: LateMinutesFilter;
}

export interface WeeklyDay {
    date: string;
    present: number;
    late: number;
    absent: number;
    incomplete: number;
}

export interface LivePunch {
    _id: string;
    employeeId: string;
    employeeName: string;
    punchTime: Date;
    punchStatus: number;
    deviceSN: string;
    location: string;
    avatar?: string;
    attendanceStatus?: AttendanceStatus;
    lateMinutes?: number;
}

/** One row per employee — pre-computed by the server for the "Today" roster view */
export interface TodayRosterEntry {
    employeeId: string;
    employeeName: string;
    avatar?: string;
    location: string;
    checkIn?: string;           // ISO string
    checkOut?: string;          // ISO string (only if valid checkout)
    totalPunches: number;
    workDurationMinutes: number;
    lateMinutes: number;
    status: AttendanceStatus;
    verifyType?: string;        // "Fingerprint", "Face", etc.
}

export interface AutoCloseResult {
    processed: number;
    skipped: number;
    details: { employeeId: string; autoCheckOut: string; status: AttendanceStatus }[];
}

export interface MonthlyDayEntry {
    date: string;
    checkIn?: string;
    checkOut?: string;
    workDurationMinutes: number;
    lateMinutes: number;
    status: AttendanceStatus;
    note?: string;
}

export interface EmployeeMonthlyDetail {
    employeeId: string;
    employeeName: string;
    month: string; // YYYY-MM
    summary: {
        presentDays: number;
        lateDays: number;
        absentDays: number;
        totalWorkHours: string;
        avgWorkHours: string;
    };
    days: MonthlyDayEntry[];
}
