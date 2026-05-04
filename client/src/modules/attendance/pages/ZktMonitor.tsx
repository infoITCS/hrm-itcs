/**
 * ZktMonitor.tsx — ZKT Cloud ONLY.
 * Shows: server status, transaction feed, employee list.
 * NO overview summary cards. NO HRM record data mixed in.
 */
import { useState, useEffect } from 'react';
import { RefreshCw, Wifi, WifiOff, Users, Activity, Clock, RotateCcw } from 'lucide-react';
import { useZktSync } from '../hooks/useZktSync';

const todayStr = () => new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);

const fmtTime = (iso: string) => {
    try { return new Date(iso).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Karachi' }); }
    catch { return iso; }
};

const PUNCH_STATES: Record<string, { label: string; color: string }> = {
    '0': { label: 'Check In', color: 'bg-emerald-100 text-emerald-700' },
    '1': { label: 'Check Out', color: 'bg-rose-100 text-rose-700' },
    '4': { label: 'OT In', color: 'bg-violet-100 text-violet-700' },
    '5': { label: 'OT Out', color: 'bg-orange-100 text-orange-700' },
};

type TabType = 'transactions' | 'employees';

export default function ZktMonitor({ hideHeader = false, externalDate = '' }: { hideHeader?: boolean; externalDate?: string }) {
    const [date, setDate] = useState(externalDate || todayStr());
    const [tab, setTab] = useState<TabType>('transactions');

    // Sync internal date state with external prop changes
    useEffect(() => {
        if (externalDate && externalDate !== date) {
            setDate(externalDate);
        }
    }, [externalDate]);

    const {
        serverStatus, statusLoading, retryIn,
        employees, empLoading,
        transactions, txnLoading, newIds,
        syncState,
        stats,
        autoRefresh, setAutoRefresh,
        sound, setSound,
        syncingReport,
        actions,
    } = useZktSync(date);

    const isOnline = serverStatus?.reachable;

    return (
        <div className="space-y-5">
            {/* Header */}
            {!hideHeader && (
                <div className="rounded-2xl p-6 text-white bg-gradient-to-r from-slate-800 to-slate-700 shadow-xl">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <Activity size={18} />
                                <span className="text-xs font-bold uppercase tracking-widest text-white/70">ZKTeco Cloud</span>
                            </div>
                            <h1 className="text-2xl font-bold">Machine Monitor</h1>
                        </div>
                        <div className="flex items-center gap-2">
                            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                                className="px-3 py-2 bg-white/10 border border-white/20 text-white text-sm rounded-xl [color-scheme:dark]" />
                            <button onClick={actions.refresh}
                                className="flex items-center gap-1.5 px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-sm font-semibold hover:bg-white/20">
                                <RefreshCw size={14} className={autoRefresh ? 'animate-spin [animation-duration:3s]' : ''} />
                                Refresh
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Status Banner */}
            <div className={`rounded-xl p-4 flex items-center justify-between border ${isOnline ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                <div className="flex items-center gap-3">
                    {isOnline ? <Wifi size={18} className="text-emerald-600" /> : <WifiOff size={18} className="text-rose-600" />}
                    <div>
                        <p className={`font-bold text-sm ${isOnline ? 'text-emerald-800' : 'text-rose-800'}`}>
                            {statusLoading ? 'Checking...' : isOnline ? 'ZKT Server Online' : 'ZKT Server Offline'}
                        </p>
                        {syncState && (
                            <p className="text-xs text-slate-500 mt-0.5">
                                Last sync: {syncState.lastSyncAt ? new Date(syncState.lastSyncAt).toLocaleTimeString('en-PK', { timeZone: 'Asia/Karachi' }) : '—'} · Total synced: {syncState.totalSynced.toLocaleString()}
                            </p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {!isOnline && retryIn > 0 && (
                        <span className="text-xs text-rose-500 font-mono">Retry in {retryIn}s</span>
                    )}
                    <button onClick={() => setAutoRefresh((p) => !p)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${autoRefresh ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-slate-100 border-slate-200 text-slate-500'}`}>
                        {autoRefresh ? 'Auto ON' : 'Auto OFF'}
                    </button>
                    <button onClick={() => setSound((p) => !p)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${sound ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'bg-slate-100 border-slate-200 text-slate-500'}`}>
                        🔔 {sound ? 'On' : 'Off'}
                    </button>
                    <button onClick={actions.handleSyncReport} disabled={syncingReport}
                        className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                        <RotateCcw size={12} className={syncingReport ? 'animate-spin' : ''} />
                        Sync Report
                    </button>
                </div>
            </div>

            {/* Mini Stats */}
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 text-center">
                    <div className="text-2xl font-extrabold text-emerald-600">{stats.presentCount}</div>
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-0.5">Attended</div>
                </div>
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 text-center">
                    <div className="text-2xl font-extrabold text-indigo-600">{stats.stillInCount}</div>
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-0.5">Still In</div>
                </div>
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 text-center">
                    <div className="text-2xl font-extrabold text-slate-700">{stats.totalEmployees}</div>
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-0.5">On Machine</div>
                </div>
            </div>

            {/* Tabs */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="flex gap-1 p-2 bg-slate-50/50 border-b border-slate-100">
                    {(['transactions', 'employees'] as const).map((t) => (
                        <button key={t} onClick={() => setTab(t)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all capitalize ${tab === t ? 'bg-gradient-to-r from-slate-700 to-slate-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>
                            {t === 'transactions' ? <Clock size={14} /> : <Users size={14} />}
                            {t === 'transactions' ? `Feed (${transactions.length})` : `Employees (${employees.length})`}
                        </button>
                    ))}
                </div>

                <div className="p-4">
                    {/* Transaction Feed */}
                    {tab === 'transactions' && (
                        txnLoading ? (
                            <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-slate-100 animate-pulse rounded-xl" />)}</div>
                        ) : transactions.length === 0 ? (
                            <p className="text-center text-slate-400 py-10 text-sm">No transactions for {date}.</p>
                        ) : (
                            <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
                                {transactions.map((t) => {
                                    const ps = PUNCH_STATES[t.punch_state] || { label: t.punch_state, color: 'bg-slate-100 text-slate-500' };
                                    const isNew = newIds.has(t.id);
                                    return (
                                        <div key={t.id} className={`flex items-center gap-3 p-3 rounded-xl transition-all ${isNew ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-slate-50'}`}>
                                            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-xs font-bold shrink-0">
                                                {t.first_name?.slice(0, 1) || t.emp_code.slice(0, 1)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-slate-800 text-sm truncate">
                                                    {t.first_name ? `${t.first_name} ${t.last_name || ''}` : `PIN ${t.emp_code}`}
                                                </div>
                                                <div className="text-xs text-slate-400">{t.area_alias || t.terminal_sn || 'Machine'}</div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <div className="text-sm font-bold text-slate-700">{fmtTime(t.punch_time)}</div>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ps.color}`}>{ps.label}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )
                    )}

                    {/* Employees */}
                    {tab === 'employees' && (
                        empLoading ? (
                            <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-slate-100 animate-pulse rounded-xl" />)}</div>
                        ) : employees.length === 0 ? (
                            <p className="text-center text-slate-400 py-10 text-sm">No employees found on machine.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-100">
                                            <th className="text-left py-2 px-3 text-xs font-bold text-slate-400 uppercase tracking-wide">PIN</th>
                                            <th className="text-left py-2 px-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Name</th>
                                            <th className="text-left py-2 px-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Dept</th>
                                            <th className="text-left py-2 px-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {employees.map((e) => {
                                            const attended = stats.attendedCodes.has(e.emp_code);
                                            return (
                                                <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50">
                                                    <td className="py-2 px-3 font-mono text-xs text-slate-500">{e.emp_code}</td>
                                                    <td className="py-2 px-3 font-semibold text-slate-800">{e.first_name} {e.last_name}</td>
                                                    <td className="py-2 px-3 text-slate-500 text-xs">
                                                        {typeof e.department === 'object' ? (e.department as any).dept_name : (e.department || '—')}
                                                    </td>
                                                    <td className="py-2 px-3">
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${attended ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'}`}>
                                                            {attended ? 'Present' : 'Absent'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )
                    )}
                </div>
            </div>
        </div>
    );
}
