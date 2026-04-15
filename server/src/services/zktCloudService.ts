/**
 * zktCloudService.ts
 * All communication with the ZKTeco Cloud REST API (192.168.0.74:8081).
 * Uses native Node.js fetch (no extra dependencies).
 * Called server-side only — browser never touches this API directly.
 */

import AttendancePunch from '../models/AttendancePunch';
import ZktSyncState from '../models/ZktSyncState';
import Employee from '../models/Employee';

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
    punch_state: string;
    punch_state_display?: string;
    verify_type?: number;
    terminal_sn?: string;
    area_alias?: string;
    upload_time?: string;
}

export interface ZktReportEntry {
    emp_code: string;
    first_name?: string;
    last_name?: string;
    att_date: string;     // YYYY-MM-DD
    clock_in?: string;    // HH:MM:SS
    clock_out?: string;   // HH:MM:SS
    status: string;       // "Present", "Absent", "Late", etc.
    work_time?: string;   // HH:MM:SS
    exception?: string | null;
}

export interface ZktPagedResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results?: T[];   // BioTime Cloud format
    data?: T[];      // ZKTeco local REST API format (machine firmware)
}

export interface ZktServerStatus {
    reachable: boolean;
    latencyMs?: number;
    error?: string;
}

export interface ZktSyncResult {
    newRecords: number;
    lastTransactionId: number | null;
    syncedAt: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const ZKT_URL   = (process.env.ZKTECO_API_URL  || 'http://192.168.0.74:8081').replace(/\/$/, '');
const ZKT_TOKEN = process.env.ZKTECO_API_TOKEN || '';
const TIMEOUT_MS = 30000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function zktHeaders(): Record<string, string> {
    // Some versions use 'JWT', others use 'Token'. 
    // We'll default to 'Token' but you can change it here if needed.
    const prefix = process.env.ZKTECO_TOKEN_PREFIX || 'Token';
    return {
        'Authorization': `${prefix} ${ZKT_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    };
}

async function fetchWithTimeout(url: string, timeoutMs = TIMEOUT_MS): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            headers: zktHeaders(),
            signal:  controller.signal,
        });
    } finally {
        clearTimeout(timer);
    }
}

async function zktGet<T>(path: string, timeoutMs = TIMEOUT_MS): Promise<T> {
    const url = `${ZKT_URL}${path.startsWith('/') ? '' : '/'}${path}`;
    const res = await fetchWithTimeout(url, timeoutMs);
    
    if (!res.ok) {
        let body = '';
        try { body = await res.text(); } catch { /* ignore */ }
        console.error(`[ZKT] GET ${path} failed: ${res.status} ${res.statusText}`, body);
        throw new Error(`HTTP ${res.status}: ${res.statusText}${body ? ' - ' + body : ''}`);
    }
    return res.json() as Promise<T>;
}

/**
 * Guards that a ZKTeco response is a proper paged list.
 * Accepts both BioTime Cloud (`results`) and ZKTeco local REST (`data`) formats.
 */
function assertPagedResponse<T>(raw: unknown, url: string): asserts raw is ZktPagedResponse<T> {
    if (!raw || typeof raw !== 'object') {
        throw new Error(`ZKTeco: expected paged response object but got ${typeof raw} — ${url}`);
    }
    const d = raw as Record<string, unknown>;
    if (!Array.isArray(d['results']) && !Array.isArray(d['data'])) {
        console.error('[ZKT] Unexpected API response from', url, '→', JSON.stringify(d).slice(0, 500));
        throw new Error(`ZKTeco: response missing "results"/"data" array — ${url} — body: ${JSON.stringify(d).slice(0, 300)}`);
    }
}

/** Normalises both `results` (BioTime) and `data` (local firmware) into one array. */
function getPageItems<T>(page: ZktPagedResponse<T>): T[] {
    return (page.results ?? page.data) as T[];
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            const delay = 500 * Math.pow(2, attempt);
            console.warn(`[ZKT] Attempt ${attempt + 1} failed. Retrying in ${delay}ms…`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw lastError;
}

// ─── Public fetch functions ───────────────────────────────────────────────────

export async function checkServerStatus(): Promise<ZktServerStatus> {
    const start = Date.now();
    try {
        await fetchWithTimeout(`${ZKT_URL}/personnel/api/employees/?page_size=1`, 4000);
        return { reachable: true, latencyMs: Date.now() - start };
    } catch (err: any) {
        return { reachable: false, latencyMs: Date.now() - start, error: err.message };
    }
}

export async function fetchEmployees(): Promise<ZktEmployee[]> {
    return withRetry(async () => {
        const all: ZktEmployee[] = [];
        let nextPath: string | null = `/personnel/api/employees/?page_size=100`;
        
        while (nextPath) {
            const data: unknown = await zktGet<unknown>(nextPath);
            assertPagedResponse<ZktEmployee>(data, nextPath);
            all.push(...getPageItems(data));
            nextPath = data.next ?? null;
        }
        return all;
    });
}

export async function fetchTransactions(lastId?: number | null, pageSize = 100): Promise<ZktTransaction[]> {
    return withRetry(async () => {
        const all: ZktTransaction[] = [];
        const params = new URLSearchParams({ page_size: String(pageSize) });
        if (lastId != null) params.set('last_id', String(lastId));
        
        let nextPath: string | null = `/iclock/api/transactions/?${params.toString()}`;
        while (nextPath) {
            const data: unknown = await zktGet<unknown>(nextPath);
            assertPagedResponse<ZktTransaction>(data, nextPath);
            all.push(...getPageItems(data));
            nextPath = data.next ?? null;
        }
        return all;
    });
}

export async function fetchReport(startDate: string, endDate: string): Promise<ZktReportEntry[]> {
    return withRetry(async () => {
        const all: ZktReportEntry[] = [];
        // NOTE: The endpoint returns pre-calculated status based on machine rules
        let nextPath: string | null = `/att/api/transactionReport/?start_date=${startDate}&end_date=${endDate}&page_size=100`;
        
        while (nextPath) {
            const data: unknown = await zktGet<unknown>(nextPath);
            assertPagedResponse<ZktReportEntry>(data, nextPath);
            all.push(...getPageItems(data));
            nextPath = data.next ?? null;
        }
        return all;
    });
}

// ─── Sync engine ──────────────────────────────────────────────────────────────

export async function runZktSync(): Promise<ZktSyncResult> {
    let state = await ZktSyncState.findOne({ key: 'default' });
    if (!state) state = await ZktSyncState.create({ key: 'default' });

    const lastId = state.lastTransactionId;
    const txns   = await fetchTransactions(lastId ?? undefined);

    if (txns.length === 0) {
        return { newRecords: 0, lastTransactionId: lastId, syncedAt: new Date().toISOString() };
    }

    // ── Build biometricPin → HRM employeeId map (single DB query for entire batch) ──
    const uniquePins = [...new Set(txns.map(t => t.emp_code))];

    const matchedEmployees = await Employee.find(
        { biometricPin: { $in: uniquePins } },
        { employeeId: 1, biometricPin: 1, firstName: 1, lastName: 1 }
    ).lean();

    // e.g. "1" → "ITCS-0042"
    const pinToHrmId = new Map<string, string>(
        matchedEmployees.map(e => [e.biometricPin as string, e.employeeId])
    );

    // Warn about machine PINs with no matching HRM employee profile
    const unmappedPins = uniquePins.filter(p => !pinToHrmId.has(p));
    if (unmappedPins.length > 0) {
        console.warn(
            `[ZKT Sync] ⚠️  ${unmappedPins.length} machine PIN(s) not linked to any HRM employee: [${unmappedPins.join(', ')}]`,
            '\n  → Open the employee profile → set "Biometric PIN" to match the machine PIN.'
        );
    }
    // ────────────────────────────────────────────────────────────────────────────

    let savedCount = 0;
    let maxId      = lastId ?? 0;

    for (const txn of txns) {
        if (txn.id > maxId) maxId = txn.id;

        const punchStatus = parseInt(txn.punch_state ?? '0', 10);
        const punchTime   = new Date(txn.punch_time.replace(' ', 'T'));
        if (isNaN(punchTime.getTime())) continue;

        // Resolve machine PIN → HRM employeeId (falls back to raw pin if not yet mapped)
        const hrmEmployeeId = pinToHrmId.get(txn.emp_code) ?? txn.emp_code;

        try {
            const existing = await AttendancePunch.findOneAndUpdate(
                { deviceSN: txn.terminal_sn ?? 'ZKT_LOCAL', machineUserId: txn.emp_code, punchTime },
                {
                    $setOnInsert: {
                        machineUserId: txn.emp_code,
                        employeeId:    hrmEmployeeId,
                        punchTime,
                        punchStatus,
                        verifyType:    txn.verify_type ?? 15,
                        deviceSN:      txn.terminal_sn ?? 'ZKT_LOCAL',
                        location:      txn.area_alias  ?? 'Main Office',
                        processed:     false,
                    },
                },
                { upsert: true, new: false }
            );
            if (!existing) savedCount++;
        } catch (err: any) {
            if (err.code !== 11000) {
                console.error('[ZKT Sync] Error saving punch:', err.message);
            }
        }
    }

    state.lastTransactionId = maxId;
    state.lastSyncAt        = new Date();
    state.totalSynced       = (state.totalSynced ?? 0) + savedCount;
    await state.save();

    console.log(`[ZKT Sync] ✅ Fetched ${txns.length} txns, saved ${savedCount} new. Last ID: ${maxId}`);
    return { newRecords: savedCount, lastTransactionId: maxId, syncedAt: state.lastSyncAt.toISOString() };
}
