/**
 * zktCloudService.ts
 * All communication with the ZKTeco Cloud REST API (192.168.0.74:8081).
 * Uses native Node.js fetch (no extra dependencies).
 * Called server-side only — browser never touches this API directly.
 */

import AttendancePunch from '../models/AttendancePunch';
import ZktSyncState from '../models/ZktSyncState';
import Employee from '../models/Employee';
import { processEmployeePunches } from './attendanceProcessor';
import logger from '../utils/logger';


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
    // Optional names if enriched
    first_name?: string;
    last_name?: string;
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
    const prefix = process.env.ZKTECO_TOKEN_PREFIX || 'Token';
    const token  = process.env.ZKTECO_API_TOKEN || '';
    
    let authHeader = `${prefix} ${token}`;
    
    // Support Basic Auth or direct token strings based on prefix
    if (prefix === 'Basic' && !token && process.env.BIOTIME_USER) {
        const credentials = Buffer.from(`${process.env.BIOTIME_USER}:${process.env.BIOTIME_PASS}`).toString('base64');
        authHeader = `Basic ${credentials}`;
    } else if (prefix === 'None') {
        authHeader = token;
    }

    return {
        'Authorization': authHeader,
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
    const url = path.startsWith('http') ? path : `${ZKT_URL}${path.startsWith('/') ? '' : '/'}${path}`;
    const res = await fetchWithTimeout(url, timeoutMs);
    
    if (!res.ok) {
        let body = '';
        try { body = await res.text(); } catch { /* ignore */ }
        logger.error(`[ZKT] GET ${path} failed: ${res.status} ${res.statusText}`, body);
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
        logger.error('[ZKT] Unexpected API response from', url, '→', JSON.stringify(d).slice(0, 500));
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
            logger.warn(`[ZKT] Attempt ${attempt + 1} failed: ${(err as any).message}. Retrying in ${delay}ms…`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw lastError;
}

// ─── Public fetch functions ───────────────────────────────────────────────────

export async function checkServerStatus(): Promise<ZktServerStatus> {
    const start = Date.now();
    try {
        // Use a lightweight endpoint with a generous timeout — BioTime can be slow
        await fetchWithTimeout(`${ZKT_URL}/iclock/api/transactions/?page_size=1`, 15000);
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

export async function fetchTransactions(lastId?: number | null, pageSize = 100, followPagination = true): Promise<ZktTransaction[]> {
    return withRetry(async () => {
        const all: ZktTransaction[] = [];
        const params = new URLSearchParams({ 
            page_size: String(pageSize),
            ordering: '-id' // Newest records first (supported by BioTime)
        });
        if (lastId != null) params.set('last_id', String(lastId));
        
        // If the machine ignores 'ordering', we need to find the latest page.
        // We'll fetch the first page to get the total 'count'.
        let nextPath: string | null = `/iclock/api/transactions/?${params.toString()}`;
        const firstPage = await zktGet<ZktPagedResponse<ZktTransaction>>(nextPath);
        assertPagedResponse<ZktTransaction>(firstPage, nextPath);
        
        const totalCount = firstPage.count || 0;
        const totalPages = Math.ceil(totalCount / pageSize);

        // If we have many pages and NO lastId was provided, 
        // we should jump to the LAST page to get today's data.
        if (lastId == null && totalPages > 1) {
            nextPath = `/iclock/api/transactions/?page_size=${pageSize}&page=${totalPages}`;
        } else if (totalPages <= 1 && lastId == null) {
            // Reuse first page if everything fits and no jump needed
            all.push(...getPageItems(firstPage));
            nextPath = null;
        }

        while (nextPath) {
            const data = await zktGet<ZktPagedResponse<ZktTransaction>>(nextPath);
            assertPagedResponse<ZktTransaction>(data, nextPath);
            
            const items = getPageItems(data);
            all.push(...items);
            
            // If we are looking for 'latest' and the API gives us old first, 
            // we don't want to follow 'next' because that goes even further into the past.
            if (lastId == null) break; 

            nextPath = data.next ?? null;
            if (!followPagination) break;
        }

        // Return latest first for the UI
        return all.sort((a, b) => b.id - a.id);
    });
}

/**
 * Enriches a list of transactions with names from the machine's employee list.
 */
export async function enrichTransactionsWithNames(txns: ZktTransaction[]): Promise<ZktTransaction[]> {
    if (txns.length === 0) return txns;

    try {
        const employees = await fetchEmployees();
        const empMap = new Map<string, ZktEmployee>(
            employees.map(e => [String(e.emp_code), e])
        );

        return txns.map(t => {
            const emp = empMap.get(String(t.emp_code));
            if (emp) {
                return {
                    ...t,
                    first_name: emp.first_name,
                    last_name: emp.last_name,
                };
            }
            return t;
        });
    } catch (err: any) {
        logger.error('[ZKT] Failed to enrich transactions with names:', err.message);
        return txns;
    }
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
        logger.warn(
            `[ZKT Sync] ⚠️  ${unmappedPins.length} machine PIN(s) not linked to any HRM employee: [${unmappedPins.join(', ')}]`,
            '\n  → Open the employee profile → set "Biometric PIN" to match the machine PIN.'
        );
    }
    // ────────────────────────────────────────────────────────────────────────────

    let savedCount = 0;
    let maxId      = lastId ?? 0;
    const toProcess = new Set<string>();

    for (const txn of txns) {
        if (txn.id > maxId) maxId = txn.id;

        let punchStatus = parseInt(txn.punch_state ?? '0', 10);
        if (punchStatus === 255) punchStatus = 0; // 255 is generic biometric punch

        const punchTime = new Date(txn.punch_time.replace(' ', 'T'));
        if (isNaN(punchTime.getTime())) continue;

        // Resolve machine PIN → HRM employeeId
        const hrmEmployeeId = pinToHrmId.get(txn.emp_code);
        if (!hrmEmployeeId) {
            logger.warn(`[ZKT Sync] Skipping punch: biometricPin="${txn.emp_code}" not mapped to any HRM employee. Set biometricPin in employee profile.`);
            continue;
        }

        try {
            const dateStr = punchTime.toISOString().slice(0, 10);
            const sn = txn.terminal_sn ?? 'ZKT_CLOUD';

            const existing = await AttendancePunch.findOneAndUpdate(
                { deviceSN: sn, machineUserId: txn.emp_code, punchTime },
                {
                    $setOnInsert: {
                        machineUserId: txn.emp_code,
                        employeeId:    hrmEmployeeId,
                        punchTime,
                        punchStatus,
                        verifyType:    txn.verify_type ?? 15,
                        deviceSN:      sn,
                        location:      txn.area_alias  ?? 'ISB-Office',
                        processed:     false,
                    },
                },
                { upsert: true, new: false }
            );
            if (!existing) {
                savedCount++;
                toProcess.add(`${hrmEmployeeId}|${dateStr}|${sn}`);
            }
        } catch (err: any) {
            if (err.code !== 11000) {
                logger.error('[ZKT Sync] Error saving punch:', err.message);
            }
        }
    }

    state.lastTransactionId = maxId;
    state.lastSyncAt        = new Date();
    state.totalSynced       = (state.totalSynced ?? 0) + savedCount;
    await state.save();

    logger.info(`[ZKT Sync] ✅ Fetched ${txns.length} txns, saved ${savedCount} new. Last ID: ${maxId}`);
    
    // ── Trigger background processing for all affected employee/date pairs ──
    if (toProcess.size > 0) {
        for (const key of toProcess) {
            const [empId, dStr, sn] = key.split('|');
            processEmployeePunches(empId, dStr, sn).catch(err => {
                logger.error(`[ZKT Sync] Background processing failed for ${empId} on ${dStr}:`, err);
            });
        }
    }

    return { newRecords: savedCount, lastTransactionId: maxId, syncedAt: state.lastSyncAt.toISOString() };
}
