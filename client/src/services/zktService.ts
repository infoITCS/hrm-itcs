/**
 * zktService.ts
 * Typed fetch wrappers for the ZKTeco proxy endpoints on the HRM server.
 * All calls go to /api/attendance/zkt/* — never to 192.168.0.74 directly.
 */
import { api } from '../utils/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ZktEmployee {
    id: number;
    emp_code: string;
    first_name: string;
    last_name: string;
    department: string | null;
    department_name?: string;
    position?: string;
    gender?: string;
    hire_date?: string;
    is_active?: boolean;
}

export interface ZktTransaction {
    id: number;
    emp_code: string;
    punch_time: string;
    punch_state: string;        // "0" = IN, "1" = OUT
    punch_state_display?: string;
    verify_type?: number;
    terminal_sn?: string;
    area_alias?: string;
    upload_time?: string;
    // Enriched fields from machine API
    first_name?: string;
    last_name?: string;
}

export interface ZktReportEntry {
    emp_code: string;
    first_name?: string;
    last_name?: string;
    department?: string;
    punch_time: string;
    punch_state: string;
    punch_state_display?: string;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function authHeader(): Record<string, string> {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
}

async function get<T>(url: string): Promise<T> {
    const res = await fetch(url, { headers: { ...authHeader(), 'Content-Type': 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return res.json();
}

async function post<T>(url: string): Promise<T> {
    const res = await fetch(url, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return res.json();
}

// ─── Service API ──────────────────────────────────────────────────────────────

export const zktService = {
    /** Check if the ZKTeco API server is reachable. */
    getStatus: async (): Promise<{ success: boolean; data: ZktServerStatus }> =>
        get(`${api.zktStatus}`),

    /** Fetch the complete employee list from ZKTeco. */
    getEmployees: async (): Promise<{ success: boolean; count: number; data: ZktEmployee[] }> =>
        get(`${api.zktEmployees}`),

    /**
     * Fetch transactions, optionally from a given ID onwards.
     * Pass lastId to get only new records (incremental poll).
     */
    getTransactions: async (lastId?: number | null, pageSize = 50): Promise<{ success: boolean; count: number; data: ZktTransaction[] }> => {
        const query = new URLSearchParams();
        if (lastId != null) query.set('last_id', String(lastId));
        query.set('page_size', String(pageSize));
        return get(`${api.zktTransactions}?${query.toString()}`);
    },

    /**
     * Fetch transaction report for a date range.
     */
    getReport: async (startDate: string, endDate: string): Promise<{ success: boolean; count: number; data: ZktReportEntry[] }> =>
        get(`${api.zktReport}?start_date=${startDate}&end_date=${endDate}`),

    /** Get the current server-side sync state (lastTransactionId, lastSyncAt, etc.). */
    getSyncState: async (): Promise<{ success: boolean; data: ZktSyncState }> =>
        get(`${api.zktSyncState}`),

    /** Trigger a manual incremental sync from ZKTeco to local DB. */
    triggerSync: async (): Promise<{ success: boolean; data: { newRecords: number; lastTransactionId: number | null } }> =>
        post(`${api.zktSync}`),

    /** Trigger a manual sync from the machine's calculated daily report. */
    triggerReportSync: async (date: string): Promise<{ success: boolean; message: string }> =>
        post(`${api.zktSyncReport}?date=${date}`),
};

export default zktService;
