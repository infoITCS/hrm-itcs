// All TypeScript interfaces for the attendance module.
// Components and hooks import from here — never use `any`.

export type AttendanceStatus =
    | 'Present' | 'Absent' | 'Late' | 'Half-Day' | 'Early Leave'
    | 'On Leave' | 'Holiday' | 'Weekend' | 'Incomplete';

export type StatusFilter =
    | AttendanceStatus | 'OnTime' | 'StillIn' | '';

export interface AttendanceSummary {
    totalPresent: number;
    totalLate: number;
    totalAbsent: number;
    totalOnLeave: number;
    totalIncomplete: number;
    totalHalfDay: number;
    totalEarlyLeave: number;
    avgWorkMins: number;
}

export interface AttendanceRecord {
    _id: string;
    employeeId: string;
    employeeName: string;
    date: string;
    location: string;
    checkIn?: string;
    checkOut?: string;
    workDurationMinutes: number;
    status: AttendanceStatus;
    lateMinutes: number;
    overtimeMinutes: number;
    leaveType?: string;
    note?: string;
    isWfh?: boolean;
    manuallyAdjusted: boolean;
    isVirtual?: boolean;
}

export interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
    pages: number;
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
    punchTime: string;
    punchStatus: number;
    deviceSN: string;
    location: string;
    avatar?: string;
    attendanceStatus?: AttendanceStatus;
    lateMinutes: number;
}

/** Smart roster: one row per employee with first-in / last-out */
export interface TodayRosterEntry {
    employeeId: string;
    employeeName: string;
    avatar?: string;
    location: string;
    checkIn?: string;
    checkOut?: string;
    totalPunches: number;
    workDurationMinutes: number;
    lateMinutes: number;
    status: AttendanceStatus;
    verifyType?: string;
    note?: string;
    isWfh?: boolean;
}

export interface ZktTransaction {
    id: number;
    emp_code: string;
    punch_time: string;
    punch_state: string;
    terminal_sn?: string;
    area_alias?: string;
    first_name?: string;
    last_name?: string;
}

export interface ZktEmployee {
    id: number;
    emp_code: string;
    first_name: string;
    last_name: string;
    department?: string;
}

export interface ZktSyncState {
    lastTransactionId: number | null;
    lastSyncAt: string | null;
    totalSynced: number;
}

export interface ZktServerStatus {
    reachable: boolean;
    latencyMs?: number;
    error?: string;
}

export const STATUS_COLORS: Record<Exclude<StatusFilter, ''>, string> = {
    Present:        'emerald',
    Late:           'amber',
    Absent:         'rose',
    'On Leave':     'violet',
    Incomplete:     'indigo',
    'Early Leave':  'orange',
    Weekend:        'slate',
    Holiday:        'cyan',
    'Half-Day':     'yellow',
    OnTime:         'emerald',
    StillIn:        'indigo',
};

export const STATUS_LABELS: Record<Exclude<StatusFilter, ''>, string> = {
    Present:       'On Time',
    Late:          'Late',
    Absent:        'Absent',
    'On Leave':    'On Leave',
    Incomplete:    'Still In',
    'Early Leave': 'Early Leave',
    Weekend:       'Weekend',
    Holiday:       'Holiday',
    'Half-Day':    'Half Day',
    OnTime:        'On Time',
    StillIn:       'Still In',
};

export interface MonthlyDayEntry {
    date: string;
    checkIn?: string;
    checkOut?: string;
    workDurationMinutes: number;
    lateMinutes: number;
    status: AttendanceStatus;
    note?: string;
    isWfh?: boolean;
    isAutoClosed?: boolean;
}

export interface EmployeeMonthlyDetail {
    employeeId: string;
    employeeName: string;
    month: string;
    summary: {
        presentDays: number;
        lateDays: number;
        absentDays: number;
        totalWorkHours: string;
        avgWorkHours: string;
    };
    days: MonthlyDayEntry[];
}
