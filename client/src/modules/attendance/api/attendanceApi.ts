/**
 * attendanceApi.ts — Single file for ALL attendance HTTP calls.
 * No component or hook calls fetch() directly. Everything goes through here.
 * Token is read once here — never in components.
 */
import api from '../../../utils/api';
import type {
    AttendanceSummary, AttendanceRecord, PaginationMeta,
    WeeklyDay, LivePunch, ZktTransaction, ZktEmployee,
    ZktSyncState, ZktServerStatus, TodayRosterEntry,
    EmployeeMonthlyDetail,
} from '../types';

// Use the sanitized baseURL from our central utility to prevent /api/api doubling
const V2 = `${api.baseURL}/api/v2/attendance`;

function token(): string { return localStorage.getItem('token') || ''; }
function headers(): HeadersInit {
    return { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' };
}

async function parseResponse(res: Response): Promise<any> {
    const text = await res.text();
    let json: any;
    try {
        json = JSON.parse(text);
    } catch (e) {
        throw new Error(`HTTP ${res.status}: Failed to parse JSON. Snippet: ${text.substring(0, 100)}`);
    }

    if (!res.ok || !json.success) {
        throw new Error(json.message || `HTTP ${res.status}`);
    }
    return json;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(path, { 
        ...options, 
        headers: { ...headers(), ...options.headers } 
    });

    const json = await parseResponse(res);
    return json.data as T;
}

async function get<T>(path: string, options: RequestInit = {}): Promise<T> {
    return request<T>(path, { ...options, method: 'GET' });
}

async function post<T>(path: string, body?: object, options: RequestInit = {}): Promise<T> {
    return request<T>(path, { 
        ...options, 
        method: 'POST', 
        body: body ? JSON.stringify(body) : undefined 
    });
}

async function put<T>(path: string, body: object, options: RequestInit = {}): Promise<T> {
    return request<T>(path, { 
        ...options, 
        method: 'PUT', 
        body: JSON.stringify(body) 
    });
}

function qs(params: Record<string, string | number | undefined>): string {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== '') p.set(k, String(v));
    }
    return p.toString() ? `?${p.toString()}` : '';
}

export const attendanceApi = {
    // ── Dashboard ──────────────────────────────────────────────────────────────
    getSummary: (date: string, location?: string, signal?: AbortSignal) =>
        get<AttendanceSummary>(`${V2}/summary${qs({ date, location })}`, { signal }),

    getToday: (location?: string, signal?: AbortSignal) =>
        get<AttendanceSummary>(`${V2}/today${qs({ location })}`, { signal }),

    getWeekly: (endDate: string, location?: string, signal?: AbortSignal) =>
        get<WeeklyDay[]>(`${V2}/weekly${qs({ endDate, location })}`, { signal }),

    getLiveFeed: (location?: string, date?: string, limit = 20, signal?: AbortSignal) =>
        get<LivePunch[]>(`${V2}/live-feed${qs({ location, date, limit })}`, { signal }),

    getRoster: (date?: string, location?: string, signal?: AbortSignal) =>
        get<TodayRosterEntry[]>(`${V2}/roster${qs({ date, location })}`, { signal }),

    getEmployeeMonthly: (employeeId: string, month: string, options?: RequestInit) =>
        get<EmployeeMonthlyDetail>(`${V2}/employee/${employeeId}/monthly${qs({ month })}`, options),

    fetchMonthlyReportCsv: async (month: string, employeeId?: string): Promise<string> => {
        const path = employeeId 
            ? `${V2}/employee/${employeeId}/export/monthly` 
            : `${V2}/export/monthly`;
        const res = await fetch(`${path}${qs({ month })}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        if (!res.ok) throw new Error('Failed to fetch monthly report data');
        return await res.text();
    },

    fetchDailyReportCsv: async (date: string, employeeId?: string): Promise<string> => {
        const path = employeeId
            ? `${V2}/employee/${employeeId}/export/daily`
            : `${V2}/export/daily`;
        const res = await fetch(`${path}${qs({ date })}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        if (!res.ok) throw new Error('Failed to fetch daily report data');
        return await res.text();
    },

    downloadMonthlyReport: async (month: string, employeeId?: string) => {
        const path = employeeId 
            ? `${V2}/employee/${employeeId}/export/monthly` 
            : `${V2}/export/monthly`;
        
        const res = await fetch(`${path}${qs({ month })}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        
        if (!res.ok) throw new Error('Download failed');
        
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = employeeId ? `attendance_${employeeId}_${month}.csv` : `attendance_all_${month}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    },

    downloadDailyReport: async (date: string, employeeId?: string) => {
        const path = employeeId
            ? `${V2}/employee/${employeeId}/export/daily`
            : `${V2}/export/daily`;

        const res = await fetch(`${path}${qs({ date })}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });

        if (!res.ok) throw new Error('Download failed');

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = employeeId ? `attendance_${employeeId}_${date}.csv` : `attendance_all_${date}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    },

    // ── Records ────────────────────────────────────────────────────────────────
    getRecords: async (params: Record<string, string | number | undefined>, signal?: AbortSignal): Promise<{ data: AttendanceRecord[]; pagination: PaginationMeta }> => {
        const res = await fetch(`${V2}/records${qs(params)}`, { headers: headers(), signal });
        const json = await parseResponse(res);
        return { data: json.data, pagination: json.pagination };
    },

    updateRecord: (id: string, data: Partial<AttendanceRecord>) =>
        put<AttendanceRecord>(`${V2}/records/${id}`, data),

    createManualRecord: (data: object) =>
        post<AttendanceRecord>(`${V2}/manual`, data),

    selfPunch: () =>
        post<{ message: string }>(`${V2}/punch`),

    exportCSV: async (params: Record<string, string | undefined>) => {
        const res = await fetch(`${V2}/export`, {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify(params)
        });
        
        if (!res.ok) throw new Error('Export failed');
        
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `attendance_export_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    },

    // ── Lists ──────────────────────────────────────────────────────────────────
    getLocations: () => get<string[]>(`${V2}/locations`),

    // ── ZKT Cloud ──────────────────────────────────────────────────────────────
    zkt: {
        getStatus: () => get<ZktServerStatus>(`${V2}/zkt/status`),
        getEmployees: () => get<ZktEmployee[]>(`${V2}/zkt/employees`),
        getTransactions: (lastId?: number | null) =>
            get<ZktTransaction[]>(`${V2}/zkt/transactions${qs({ last_id: lastId ?? undefined })}`),
        getSyncState: () => get<ZktSyncState>(`${V2}/zkt/sync-state`),
        triggerSync: () => post<{ newRecords: number }>(`${V2}/zkt/sync`),
        syncReport: (date: string) => post<{ message: string }>(`${V2}/zkt/sync-report${qs({ date })}`),
    },

    // ── Admin ──────────────────────────────────────────────────────────────────
    admin: {
        autoClose: (date: string) => post<object>(`${V2}/admin/auto-close${qs({ date })}`),
        getDevices: () => get<any[]>(`${V2}/devices`),
        updateDevice: (sn: string, data: any) => put<any>(`${V2}/devices/${sn}`, data),
    },
};
