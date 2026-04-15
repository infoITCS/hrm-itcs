import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Activity, UserCheck, UserX, AlertTriangle, Timer,
    RefreshCw, Volume2, VolumeX, Download, Users,
    Zap, BarChart2, Calendar,
} from 'lucide-react';
import zktService from '../../services/zktService';
import type { ZktEmployee, ZktTransaction, ZktServerStatus, ZktSyncState } from '../../services/zktService';
import ZktStatusBanner from './components/ZktStatusBanner';
import ZktTransactionFeed from './components/ZktTransactionFeed';
import ZktEmployeeTable from './components/ZktEmployeeTable';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const POLL_INTERVAL = 5000; // 5 seconds
const RETRY_DELAY   = 15;   // seconds before auto-retry after failure

function useLiveClock() {
    const [now, setNow] = useState(new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);
    return now;
}

function punchBeep() {
    try {
        const ctx  = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type     = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
    } catch { /* browser may block audio context without user gesture */ }
}

function exportToCSV(transactions: ZktTransaction[], employees: ZktEmployee[]) {
    const empMap = new Map(employees.map(e => [e.emp_code, `${e.first_name} ${e.last_name ?? ''}`.trim()]));
    const rows = [
        ['ID', 'Emp Code', 'Name', 'Punch Time', 'State', 'Terminal', 'Area'],
        ...transactions.map(t => [
            t.id,
            t.emp_code,
            empMap.get(t.emp_code) ?? '',
            t.punch_time,
            t.punch_state === '0' ? 'IN' : t.punch_state === '1' ? 'OUT' : t.punch_state,
            t.terminal_sn ?? '',
            t.area_alias ?? '',
        ]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `zkt_transactions_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

interface StatProps { title: string; value: string | number; sub: string; icon: React.ElementType; color: string }

const StatCard = ({ title, value, sub, icon: Icon, color }: StatProps) => {
    const colors: Record<string, string> = {
        emerald: 'bg-emerald-500',
        rose:    'bg-rose-500',
        amber:   'bg-amber-500',
        indigo:  'bg-indigo-500',
    };
    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-start gap-4">
            <div className={`${colors[color] ?? 'bg-slate-500'} p-3 rounded-xl text-white shrink-0`}>
                <Icon size={20} />
            </div>
            <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{title}</p>
                <p className="text-2xl font-extrabold text-slate-800 leading-tight mt-0.5">{value}</p>
                <p className="text-xs text-slate-400 mt-0.5 truncate">{sub}</p>
            </div>
        </div>
    );
};

// ─── Main Dashboard ───────────────────────────────────────────────────────────

type DashTab = 'feed' | 'employees';

const ZktLiveDashboard = () => {
    const now = useLiveClock();

    // ── State ─────────────────────────────────────────────────────────────────
    const [tab, setTab]                         = useState<DashTab>('feed');
    const [sound, setSound]                     = useState(false);
    const [autoRefresh, setAutoRefresh]         = useState(true);

    const [serverStatus, setServerStatus]       = useState<ZktServerStatus | null>(null);
    const [statusLoading, setStatusLoading]     = useState(true);
    const [retryIn, setRetryIn]                 = useState(0);

    const [employees, setEmployees]             = useState<ZktEmployee[]>([]);
    const [empLoading, setEmpLoading]           = useState(true);

    const [transactions, setTransactions]       = useState<ZktTransaction[]>([]);
    const [txnLoading, setTxnLoading]           = useState(true);
    const [newIds, setNewIds]                   = useState<Set<number>>(new Set());
    const [lastId, setLastId]                   = useState<number | null>(null);

    const [syncState, setSyncState]             = useState<ZktSyncState | null>(null);
    const [dateFilter, setDateFilter]           = useState(new Date().toISOString().slice(0, 10));

    const prevSetRef      = useRef<Set<number>>(new Set());
    const retryTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Fetch server status ───────────────────────────────────────────────────
    const fetchStatus = useCallback(async () => {
        setStatusLoading(true);
        try {
            const r = await zktService.getStatus();
            setServerStatus(r.data);
        } catch {
            setServerStatus({ reachable: false, error: 'Connection failed' });
        } finally {
            setStatusLoading(false);
        }
    }, []);

    // ── Fetch sync state ──────────────────────────────────────────────────────
    const fetchSyncState = useCallback(async () => {
        try {
            const r = await zktService.getSyncState();
            setSyncState(r.data);
        } catch { /* ignore */ }
    }, []);

    // ── Fetch employees (once) ────────────────────────────────────────────────
    const fetchEmployees = useCallback(async () => {
        setEmpLoading(true);
        try {
            const r = await zktService.getEmployees();
            setEmployees(r.data ?? []);
        } catch { /* ignore */ } finally {
            setEmpLoading(false);
        }
    }, []);

    // ── Incremental transaction poll ──────────────────────────────────────────
    const fetchTransactions = useCallback(async (fromId: number | null) => {
        try {
            const r       = await zktService.getTransactions(fromId);
            const incoming: ZktTransaction[] = r.data ?? [];
            if (!incoming.length) return;

            const prevSet = prevSetRef.current;
            const freshIds = new Set(incoming.filter(t => !prevSet.has(t.id)).map(t => t.id));

            if (freshIds.size > 0 && sound) punchBeep();

            // Sort by punch_time descending (newest first)
            setTransactions(prev => {
                const merged = [...incoming, ...prev.filter(p => !incoming.some(t => t.id === p.id))];
                merged.sort((a, b) => new Date(b.punch_time).getTime() - new Date(a.punch_time).getTime());
                return merged.slice(0, 500); // cap at 500 entries
            });

            setNewIds(freshIds);
            prevSetRef.current = new Set([...prevSet, ...incoming.map(t => t.id)]);

            // Find new max ID
            const maxId = Math.max(...incoming.map(t => t.id));
            setLastId(prev => (prev == null || maxId > prev) ? maxId : prev);

            // Clear highlight after 3s
            if (freshIds.size > 0) {
                setTimeout(() => setNewIds(new Set()), 3000);
            }
        } catch { /* ignore */ } finally {
            setTxnLoading(false);
        }
    }, [sound]);

    // ── Initial load ──────────────────────────────────────────────────────────
    useEffect(() => {
        fetchStatus();
        fetchEmployees();
        fetchTransactions(null);
        fetchSyncState();
    }, []);

    // ── Auto-poll every 5 seconds ─────────────────────────────────────────────
    useEffect(() => {
        if (!autoRefresh) return;
        const id = setInterval(() => {
            fetchTransactions(lastId);
            fetchSyncState();
        }, POLL_INTERVAL);
        return () => clearInterval(id);
    }, [autoRefresh, lastId, fetchTransactions, fetchSyncState]);

    // ── Status re-check every 30s ─────────────────────────────────────────────
    useEffect(() => {
        const id = setInterval(fetchStatus, 30_000);
        return () => clearInterval(id);
    }, [fetchStatus]);

    // ── Retry countdown when server offline ───────────────────────────────────
    useEffect(() => {
        if (serverStatus?.reachable === false) {
            setRetryIn(RETRY_DELAY);
            retryTimerRef.current = setInterval(() => {
                setRetryIn(prev => {
                    if (prev <= 1) {
                        fetchStatus();
                        return RETRY_DELAY;
                    }
                    return prev - 1;
                });
            }, 1000);
        } else {
            setRetryIn(0);
            if (retryTimerRef.current) clearInterval(retryTimerRef.current);
        }
        return () => { if (retryTimerRef.current) clearInterval(retryTimerRef.current); };
    }, [serverStatus?.reachable]);

    // ── Computed stats ────────────────────────────────────────────────────────
    const todayStr = dateFilter;
    const todayTxns = transactions.filter(t => t.punch_time.startsWith(todayStr));
    const todayInCodes = new Set(
        todayTxns.filter(t => t.punch_state === '0').map(t => t.emp_code)
    );
    const presentCount = todayInCodes.size;
    const absentCount  = Math.max(0, employees.length - presentCount);

    // Late = checked in after 09:00
    const lateCount = todayTxns.filter(t => {
        if (t.punch_state !== '0') return false;
        const h = new Date(t.punch_time).getHours();
        const m = new Date(t.punch_time).getMinutes();
        return h > 9 || (h === 9 && m > 0);
    }).length;

    // Early leaves = checked out before 17:00
    const earlyLeaveCount = todayTxns.filter(t => {
        if (t.punch_state !== '1') return false;
        const h = new Date(t.punch_time).getHours();
        return h < 17;
    }).length;

    return (
        <div className="space-y-6">
            {/* ── Header ── */}
            <div className="rounded-2xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden bg-gradient-to-r from-teal-600 via-cyan-600 to-sky-700">
                <div className="absolute top-0 right-0 w-72 h-72 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />

                <div className="relative z-10 flex flex-col md:flex-row md:items-start justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2.5 bg-white/20 backdrop-blur-sm rounded-xl">
                                <Activity size={22} />
                            </div>
                            <span className="text-sm font-bold uppercase tracking-widest text-white/80">ZKTeco Cloud</span>
                        </div>
                        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Live Attendance Monitor</h2>
                        <p className="text-white/70 text-sm mt-1">
                            192.168.0.74:8081 &nbsp;·&nbsp; Auto-sync every 5s
                        </p>
                    </div>

                    {/* Live clock + controls */}
                    <div className="flex flex-col items-end gap-3">
                        {/* Clock */}
                        <div className="text-right">
                            <div className="text-3xl font-mono font-extrabold tracking-tight tabular-nums">
                                {now.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </div>
                            <div className="text-white/70 text-xs mt-0.5">
                                {now.toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                            </div>
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                            {/* Date filter */}
                            <div className="relative">
                                <Calendar size={14} className="absolute left-2.5 top-3 text-white/70 pointer-events-none" />
                                <input
                                    type="date"
                                    value={dateFilter}
                                    onChange={e => setDateFilter(e.target.value)}
                                    className="pl-8 pr-3 py-2 bg-white/20 backdrop-blur-sm border border-white/30 text-white font-semibold text-xs rounded-xl focus:outline-none focus:ring-2 focus:ring-white/50 [color-scheme:dark]"
                                />
                            </div>

                            {/* Auto-refresh */}
                            <button
                                onClick={() => setAutoRefresh(p => !p)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-xl border font-semibold text-xs transition-all ${
                                    autoRefresh ? 'bg-white/25 border-white/40' : 'bg-white/10 border-white/20 text-white/60'
                                }`}
                            >
                                <RefreshCw size={13} className={autoRefresh ? 'animate-spin [animation-duration:3s]' : ''} />
                                {autoRefresh ? 'Live' : 'Paused'}
                            </button>

                            {/* Sound */}
                            <button
                                onClick={() => setSound(p => !p)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-xl border font-semibold text-xs transition-all ${
                                    sound ? 'bg-white/25 border-white/40' : 'bg-white/10 border-white/20 text-white/60'
                                }`}
                                title={sound ? 'Disable sound alerts' : 'Enable sound alerts'}
                            >
                                {sound ? <Volume2 size={13} /> : <VolumeX size={13} />}
                                {sound ? 'Sound On' : 'Sound Off'}
                            </button>

                            {/* Export */}
                            <button
                                onClick={() => exportToCSV(transactions, employees)}
                                className="flex items-center gap-2 px-3 py-2 bg-white/20 border border-white/30 rounded-xl font-semibold text-xs hover:bg-white/30 transition-all"
                            >
                                <Download size={13} />
                                Export CSV
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Connection status banner ── */}
            <ZktStatusBanner
                reachable={serverStatus?.reachable ?? false}
                latencyMs={serverStatus?.latencyMs}
                error={serverStatus?.error}
                lastSyncAt={syncState?.lastSyncAt}
                totalSynced={syncState?.totalSynced}
                retryIn={retryIn}
                onManualRetry={() => { fetchStatus(); fetchTransactions(lastId); }}
                loading={statusLoading}
            />

            {/* ── Stat Cards ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    title="Present Today"
                    value={empLoading || txnLoading ? '…' : presentCount}
                    sub={`${employees.length > 0 ? Math.round((presentCount / employees.length) * 100) : 0}% of workforce`}
                    icon={UserCheck}
                    color="emerald"
                />
                <StatCard
                    title="Absent Today"
                    value={empLoading || txnLoading ? '…' : absentCount}
                    sub="No check-in recorded"
                    icon={UserX}
                    color="rose"
                />
                <StatCard
                    title="Late Arrivals"
                    value={txnLoading ? '…' : lateCount}
                    sub="Checked in after 09:00"
                    icon={AlertTriangle}
                    color="amber"
                />
                <StatCard
                    title="Early Leaves"
                    value={txnLoading ? '…' : earlyLeaveCount}
                    sub="Checked out before 17:00"
                    icon={Timer}
                    color="indigo"
                />
            </div>

            {/* ── Tabs ── */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex items-center gap-1 p-2 border-b border-slate-100">
                    {([
                        { id: 'feed' as DashTab,      label: 'Live Transaction Feed', icon: Zap    },
                        { id: 'employees' as DashTab, label: 'Employee List',         icon: Users  },
                    ] as { id: DashTab; label: string; icon: React.ElementType }[]).map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                                tab === t.id
                                    ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-sm'
                                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                            }`}
                        >
                            <t.icon size={15} />
                            {t.label}
                        </button>
                    ))}

                    {/* Live indicator */}
                    <div className="ml-auto flex items-center gap-2 pr-2">
                        {autoRefresh && (
                            <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                Live
                            </span>
                        )}
                        <span className="text-xs text-slate-400">
                            {transactions.length} transactions
                        </span>
                    </div>
                </div>

                <div className="p-6">
                    {/* Feed tab */}
                    {tab === 'feed' && (
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                    <Zap size={16} className="text-teal-500" />
                                    Real-Time Punch Feed
                                    <span className="text-xs text-slate-400 font-normal ml-1">
                                        (latest on top · polling every 5s)
                                    </span>
                                </h3>
                                <span className="text-xs text-slate-400">
                                    {todayTxns.length} punches for {dateFilter}
                                </span>
                            </div>
                            <ZktTransactionFeed
                                transactions={dateFilter === new Date().toISOString().slice(0, 10)
                                    ? transactions
                                    : transactions.filter(t => t.punch_time.startsWith(dateFilter))
                                }
                                newIds={newIds}
                                loading={txnLoading}
                            />
                        </div>
                    )}

                    {/* Employees tab */}
                    {tab === 'employees' && (
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                    <Users size={16} className="text-teal-500" />
                                    Employee Directory
                                    <span className="text-xs text-slate-400 font-normal ml-1">
                                        from ZKTeco Cloud
                                    </span>
                                </h3>
                                <button
                                    onClick={fetchEmployees}
                                    disabled={empLoading}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-semibold transition-colors"
                                >
                                    <RefreshCw size={12} className={empLoading ? 'animate-spin' : ''} />
                                    Refresh
                                </button>
                            </div>
                            <ZktEmployeeTable
                                employees={employees}
                                loading={empLoading}
                                todayInCodes={todayInCodes}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* ── Today's stats bar ── */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                    <BarChart2 size={16} className="text-teal-500" />
                    <h3 className="font-bold text-slate-800 text-sm">Today's Summary</h3>
                    <span className="text-xs text-slate-400 font-normal">{todayStr}</span>
                </div>
                <div className="flex flex-wrap gap-4">
                    {[
                        { label: 'Total Punches',  val: todayTxns.length,                              color: 'text-slate-700' },
                        { label: 'Check-Ins',      val: todayTxns.filter(t => t.punch_state === '0').length, color: 'text-emerald-600' },
                        { label: 'Check-Outs',     val: todayTxns.filter(t => t.punch_state === '1').length, color: 'text-rose-600'    },
                        { label: 'Other',          val: todayTxns.filter(t => !['0','1'].includes(t.punch_state)).length, color: 'text-amber-600'  },
                        { label: 'Total Synced',   val: syncState?.totalSynced ?? '…',                  color: 'text-indigo-600' },
                    ].map(s => (
                        <div key={s.label} className="flex flex-col items-center px-4 py-3 bg-slate-50 rounded-xl border border-slate-100 min-w-[90px]">
                            <span className={`text-2xl font-extrabold ${s.color}`}>{s.val}</span>
                            <span className="text-xs text-slate-400 mt-0.5">{s.label}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ZktLiveDashboard;
