import { useState, useEffect, useCallback, useRef } from 'react';
import { attendanceApi } from '../api/attendanceApi';
import type { ZktTransaction, ZktEmployee, ZktSyncState, ZktServerStatus } from '../types';

const POLL_MS = 8_000;
const RETRY_SECS = 30;

export function useZktSync(dateFilter: string) {
    const [serverStatus, setServerStatus] = useState<ZktServerStatus | null>(null);
    const [statusLoading, setStatusLoading] = useState(true);
    const [employees, setEmployees] = useState<ZktEmployee[]>([]);
    const [empLoading, setEmpLoading] = useState(true);
    const [transactions, setTransactions] = useState<ZktTransaction[]>([]);
    const [txnLoading, setTxnLoading] = useState(true);
    const [syncState, setSyncState] = useState<ZktSyncState | null>(null);
    const [newIds, setNewIds] = useState<Set<number>>(new Set());
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [sound, setSound] = useState(false);
    const [retryIn, setRetryIn] = useState(0);
    const [syncingReport, setSyncingReport] = useState(false);

    const prevTxnIds = useRef<Set<number>>(new Set());
    const retryTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // ── Server Status ──────────────────────────────────────────────────────────
    const fetchStatus = useCallback(async () => {
        setStatusLoading(true);
        try {
            const s = await attendanceApi.zkt.getStatus();
            setServerStatus(s);
            if (s.reachable) { setRetryIn(0); if (retryTimer.current) { clearInterval(retryTimer.current); retryTimer.current = null; } }
            else { startRetryCountdown(); }
        } catch { setServerStatus({ reachable: false }); startRetryCountdown(); }
        finally { setStatusLoading(false); }
    }, []);

    function startRetryCountdown() {
        if (retryTimer.current) return;
        setRetryIn(RETRY_SECS);
        retryTimer.current = setInterval(() => {
            setRetryIn((prev) => { if (prev <= 1) { clearInterval(retryTimer.current!); retryTimer.current = null; fetchStatus(); return 0; } return prev - 1; });
        }, 1000);
    }

    // ── Employees ──────────────────────────────────────────────────────────────
    const fetchEmployees = useCallback(async () => {
        setEmpLoading(true);
        try { setEmployees(await attendanceApi.zkt.getEmployees()); }
        catch { /* keep previous */ }
        finally { setEmpLoading(false); }
    }, []);

    // ── Transactions ───────────────────────────────────────────────────────────
    const fetchTransactions = useCallback(async (silent = false) => {
        if (!silent) setTxnLoading(true);
        try {
            const [txns, state] = await Promise.all([
                attendanceApi.zkt.getTransactions(null),
                attendanceApi.zkt.getSyncState(),
            ]);
            const fresh = txns.filter((t) => {
                const d = t.punch_time?.slice(0, 10);
                return d === dateFilter;
            });
            const incoming = new Set(fresh.map((t) => t.id));
            const freshSet = new Set([...incoming].filter((id) => !prevTxnIds.current.has(id)));
            prevTxnIds.current = incoming;
            setTransactions(fresh);
            setNewIds(freshSet);
            setSyncState(state);
            if (freshSet.size > 0 && sound && audioRef.current) {
                audioRef.current.play().catch(() => {});
            }
        } catch { /* keep previous */ }
        finally { if (!silent) setTxnLoading(false); }
    }, [dateFilter, sound]);

    // ── Effects ────────────────────────────────────────────────────────────────
    useEffect(() => { fetchStatus(); fetchEmployees(); fetchTransactions(); }, [fetchStatus, fetchEmployees, fetchTransactions]);

    useEffect(() => {
        if (!autoRefresh) return;
        const id = setInterval(() => { fetchStatus(); fetchTransactions(true); }, POLL_MS);
        return () => clearInterval(id);
    }, [autoRefresh, fetchStatus, fetchTransactions]);

    useEffect(() => {
        if (newIds.size === 0) return;
        const t = setTimeout(() => setNewIds(new Set()), 6000);
        return () => clearTimeout(t);
    }, [newIds]);

    useEffect(() => {
        audioRef.current = new Audio('/sounds/punch.mp3');
        return () => { if (retryTimer.current) clearInterval(retryTimer.current); };
    }, []);

    // ── Stats derived from employee + transaction data ─────────────────────────
    const attendedCodes = new Set(transactions.map((t) => t.emp_code));
    const presentCount = attendedCodes.size;
    const totalEmployees = employees.length;
    const absentCount = Math.max(0, totalEmployees - presentCount);

    // ZKT punch_state: "0" = check-in, "1" = check-out
    const lastPunch = (code: string) => transactions.filter((t) => t.emp_code === code).at(-1);
    const stillInCodes = new Set([...attendedCodes].filter((c) => lastPunch(c)?.punch_state === '0'));
    const stillInCount = stillInCodes.size;

    // ── Actions ───────────────────────────────────────────────────────────────
    const handleSyncReport = async () => {
        setSyncingReport(true);
        try { await attendanceApi.zkt.syncReport(dateFilter); await fetchTransactions(); }
        finally { setSyncingReport(false); }
    };

    const refresh = () => { fetchStatus(); fetchTransactions(); };

    return {
        serverStatus, statusLoading, retryIn,
        employees, empLoading,
        transactions, txnLoading, newIds,
        syncState,
        stats: { presentCount, absentCount, totalEmployees, stillInCount, attendedCodes },
        autoRefresh, setAutoRefresh,
        sound, setSound,
        syncingReport,
        actions: { refresh, handleSyncReport },
    };
}
