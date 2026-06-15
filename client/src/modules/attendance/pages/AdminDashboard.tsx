/**
 * AdminDashboard.tsx — V2 Attendance Dashboard
 * 
 * Features:
 * - Summary stat cards (On Time, Late, Early Leave, Absent, Still In)
 * - Smart Roster Table: one row per employee showing:
 *     → First punch as Check In
 *     → Last valid punch as Check Out
 *     → Computed status, late minutes, work duration
 * - Sub-tabs: "Monitoring Dashboard" (roster) and "Status Details" (filtered list)
 * - Auto-refresh every 30 seconds
 * - Click stat card → filters the roster by that status
 */
import { useState, useEffect } from 'react';
import {
    Activity, Calendar, MapPin, ChevronDown, RefreshCw,
    UserCheck, UserX, AlertTriangle, Timer, Clock,
    Fingerprint, LogIn, LogOut, Download, User, Zap, Edit2
} from 'lucide-react';
import { useAttendanceSummary } from '../hooks/useAttendanceSummary';
import { useRoster } from '../hooks/useRoster';
import { attendanceApi } from '../api/attendanceApi';
import type { TodayRosterEntry, StatusFilter } from '../types';
import MonthlyInsightsModal from '../components/MonthlyInsightsModal';
import EditAttendanceModal from '../components/EditAttendanceModal';
import SheetPreviewModal from '../components/SheetPreviewModal';
import AlertModal from '../../../components/UI/AlertModal';
import EmployeeDashboard from './EmployeeDashboard';

type Tab = 'overview' | 'personal';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const todayStr = () => new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
const isWeekendDay = (d: string) => { const day = new Date(d + 'T00:00:00Z').getUTCDay(); return day === 0 || day === 6; };
const fmtMins = (m: number) => m > 0 ? `${Math.floor(m / 60)}h ${m % 60}m` : '—';
const fmtTime = (iso?: string) => iso
    ? new Date(iso).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Karachi' })
    : '—';

const STATUS_BADGE: Record<string, string> = {
    Present:       'bg-emerald-100 text-emerald-700',
    Late:          'bg-amber-100 text-amber-700',
    Absent:        'bg-rose-100 text-rose-700',
    'On Leave':    'bg-violet-100 text-violet-700',
    Incomplete:    'bg-indigo-100 text-indigo-700',
    'Missing Checkout': 'bg-rose-100 text-rose-700 border border-rose-200',
    'Early Leave': 'bg-orange-100 text-orange-700',
    'Half-Day':    'bg-yellow-100 text-yellow-700',
    Weekend:       'bg-slate-100 text-slate-500',
    Holiday:       'bg-cyan-100 text-cyan-700',
};

// ─── Stat Card ────────────────────────────────────────────────────────────────
interface StatCardProps { title: string; value: string; subtitle: string; icon: any; colorClass: string; active: boolean; onClick: () => void; }
function StatCard({ title, value, subtitle, icon: Icon, colorClass, active, onClick }: StatCardProps) {
    return (
        <button onClick={onClick} className={`bg-white rounded-2xl border shadow-sm p-5 text-left w-full hover:shadow-md hover:-translate-y-0.5 transition-all group ${active ? 'border-indigo-400 ring-2 ring-indigo-200' : 'border-slate-100'}`}>
            <div className="flex items-start justify-between mb-3">
                <div className={`p-2.5 rounded-xl ${colorClass}`}><Icon size={18} /></div>
                <span className="text-xs font-bold text-slate-400 group-hover:text-slate-500">View →</span>
            </div>
            <div className="text-2xl font-extrabold text-slate-900">{value}</div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-0.5">{title}</div>
            <div className="text-xs text-slate-400 mt-1">{subtitle}</div>
        </button>
    );
}

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ─── Roster Row ───────────────────────────────────────────────────────────────
// ─── Roster Row ───────────────────────────────────────────────────────────────
function RosterRow({ 
    entry, isNew, isPast, onClick, onEdit 
}: { 
    entry: TodayRosterEntry; isNew?: boolean; isPast?: boolean; onClick?: () => void; onEdit?: () => void 
}) {
    const isMissing = entry.status === 'Incomplete' && isPast;
    const statusLabel = isMissing ? 'Missing Checkout' : (entry.status === 'Incomplete' ? 'Still In' : entry.status);
    const statusClass = STATUS_BADGE[statusLabel] || 'bg-slate-100 text-slate-500';
    const showLateFlag = entry.status !== 'Incomplete' && entry.lateMinutes > 0;
    const showEarlyFlag = entry.status === 'Early Leave';
    const [imgError, setImgError] = useState(false);

    // Build full avatar URL if relative
    const avatarUrl = entry.avatar 
        ? (entry.avatar.startsWith('http') ? entry.avatar : `${BASE_URL}${entry.avatar.startsWith('/') ? '' : '/'}${entry.avatar}`)
        : null;

    const clickable = onClick && entry.employeeId && !entry.employeeId.startsWith('unlinked_');

    return (
        <tr 
            onClick={clickable ? onClick : undefined}
            className={`border-b border-slate-50 transition-all duration-500 ${isNew ? 'bg-indigo-50/60' : 'hover:bg-slate-50/50'} ${clickable ? 'cursor-pointer' : ''}`}
        >
            {/* Employee */}
            <td className="py-3 px-4">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold shrink-0 overflow-hidden">
                        {avatarUrl && !imgError ? (
                            <img 
                                src={avatarUrl} 
                                className="w-9 h-9 rounded-full object-cover" 
                                alt="" 
                                onError={() => setImgError(true)}
                            />
                        ) : (
                            entry.employeeName.slice(0, 1).toUpperCase()
                        )}
                    </div>
                    <div className="min-w-0">
                        <div className="font-semibold text-slate-800 text-sm truncate">{entry.employeeName}</div>
                        <div className="text-xs text-slate-400">{entry.employeeId}</div>
                    </div>
                </div>
            </td>
            {/* Check In */}
            <td className="py-3 px-4">
                {entry.checkIn ? (
                    <div className="flex items-center gap-1.5">
                        <LogIn size={13} className="text-emerald-500" />
                        <span className="text-sm font-medium text-slate-700">{fmtTime(entry.checkIn)}</span>
                    </div>
                ) : (
                    <span className="text-xs text-slate-300">—</span>
                )}
            </td>
            {/* Check Out */}
            <td className="py-3 px-4">
                {entry.checkOut ? (
                    <div className="flex items-center gap-1.5">
                        <LogOut size={13} className="text-rose-500" />
                        <span className="text-sm font-medium text-slate-700">{fmtTime(entry.checkOut)}</span>
                    </div>
                ) : entry.checkIn ? (
                    isPast ? (
                        <span className="text-xs text-rose-500 font-bold">Missing</span>
                    ) : (
                        <span className="text-xs text-indigo-500 font-semibold animate-pulse">Still In</span>
                    )
                ) : (
                    <span className="text-xs text-slate-300">—</span>
                )}
            </td>
            {/* Work Hours */}
            <td className="py-3 px-4 text-sm text-slate-600 font-medium">
                {entry.workDurationMinutes > 0 ? fmtMins(entry.workDurationMinutes) : '—'}
            </td>
            {/* Late */}
            <td className="py-3 px-4">
                {entry.lateMinutes > 0 ? (
                    <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">+{entry.lateMinutes}m</span>
                ) : (
                    <span className="text-xs text-slate-300">—</span>
                )}
            </td>
            {/* Status */}
            <td className="py-3 px-4">
                <div className="flex flex-col items-start gap-1.5">
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full ${statusClass}`}>
                        {statusLabel}
                    </span>
                    {(showLateFlag || showEarlyFlag) && (
                        <div className="flex items-center gap-1.5">
                            {showLateFlag && (
                                <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                    Late Arrival
                                </span>
                            )}
                            {showEarlyFlag && (
                                <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">
                                    Left Early
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </td>
            {/* Method */}
            <td className="py-3 px-4 text-xs text-slate-400">{entry.verifyType || '—'}</td>
            {/* Actions */}
            <td className="py-3 px-4 text-right">
                {onEdit && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); onEdit(); }}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Edit Record"
                    >
                        <Edit2 size={14} />
                    </button>
                )}
            </td>
        </tr>
    );
}

// ─── ZKT Status Badge ─────────────────────────────────────────────────────────
function ZktStatusBadge() {
    const [reachable, setReachable] = useState<boolean | null>(null);
    useEffect(() => {
        attendanceApi.zkt.getStatus().then((s) => setReachable(s.reachable)).catch(() => setReachable(false));
        const id = setInterval(() =>
            attendanceApi.zkt.getStatus().then((s) => setReachable(s.reachable)).catch(() => setReachable(false)),
            30_000
        );
        return () => clearInterval(id);
    }, []);
    if (reachable === null) return <div className="w-28 h-6 bg-white/10 animate-pulse rounded-full shrink-0" />;
    return (
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider shrink-0 whitespace-nowrap ${reachable ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-100' : 'bg-rose-500/20 border-rose-400/50 text-rose-100'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${reachable ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
            {reachable ? 'Machine Online' : 'Machine Offline'}
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const [date, setDate] = useState(todayStr());
    const [location, setLocation] = useState<string | undefined>(undefined);
    const [locations, setLocations] = useState<string[]>([]);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [statusFilter, setStatusFilter] = useState<StatusFilter | ''>('');
    const [selectedEmp, setSelectedEmp] = useState<{ id: string; name: string } | null>(null);
    const [editingEmp, setEditingEmp] = useState<TodayRosterEntry | null>(null);
    const [isAutoCloseModalOpen, setIsAutoCloseModalOpen] = useState(false);
    const [previewConfig, setPreviewConfig] = useState<{
        isOpen: boolean;
        title: string;
        subtitle?: string;
        fetchData: () => Promise<string>;
        downloadFileName: string;
    } | null>(null);
    const weekend = isWeekendDay(date);

    const { data: summary, loading, refresh } = useAttendanceSummary(date, location);
    const { data: roster, loading: rosterLoading, refresh: refreshRoster } = useRoster(date, location, true);

    useEffect(() => {
        attendanceApi.getLocations().then(setLocations).catch(() => {});
    }, []);

    useEffect(() => {
        if (!autoRefresh) return;
        const id = setInterval(() => { refresh(true); refreshRoster(true); }, 30_000);
        return () => clearInterval(id);
    }, [autoRefresh, refresh, refreshRoster]);

    // Filter roster by selected status
    const filteredRoster = statusFilter
        ? roster.filter((r) => {
            if (statusFilter === 'OnTime') return ['Present', 'Half-Day'].includes(r.status) && r.lateMinutes === 0;
            if (statusFilter === 'StillIn') return r.status === 'Incomplete';
            if (statusFilter === 'Present') return ['Present', 'Late', 'Half-Day', 'Incomplete'].includes(r.status);
            if (statusFilter === 'Late') return r.status !== 'Incomplete' && (r.lateMinutes || 0) > 0;
            return r.status === statusFilter;
        })
        : roster;

    const handleStatClick = (filter: StatusFilter) => {
        setStatusFilter(prev => prev === filter ? '' : filter as StatusFilter);
    };

    const pct = summary && (summary.totalPresent + summary.totalLate + summary.totalAbsent) > 0
        ? Math.round((summary.totalPresent / (summary.totalPresent + summary.totalLate + summary.totalAbsent)) * 100)
        : 0;

    const tabs = [
        { id: 'overview' as Tab, label: 'Overview',      icon: Activity },
        { id: 'personal' as Tab, label: 'My Attendance', icon: User     },
    ];

    return (
        <div className="space-y-6 animate-[fadeIn_0.4s_ease]">
            {/* ── Tabs Navigation ── */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-2">
                <div className="flex items-center gap-1 p-2 bg-slate-50/50 border-b border-slate-100">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-3 sm:px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                                activeTab === tab.id
                                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md'
                                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                            }`}
                        >
                            <tab.icon size={16} />
                            <span className="hidden sm:inline">{tab.label}</span>
                            <span className="sm:hidden">{tab.id === 'overview' ? 'Overview' : 'My Att.'}</span>
                        </button>
                    ))}
                    <div className="ml-auto pr-2 hidden sm:block">
                        <span className="text-xs font-bold text-slate-400">
                            {new Date().toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </span>
                    </div>
                </div>
            </div>

            {activeTab === 'overview' && (
                <>
            {/* Dashboard Header */}
            <div className="rounded-2xl p-4 sm:p-6 text-white shadow-xl relative overflow-hidden bg-gradient-to-r from-indigo-600 via-purple-600 to-violet-700">
                <div className="absolute top-0 right-0 w-72 h-72 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                <div className="relative z-10 flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Activity size={20} />
                            <span className="text-xs sm:text-sm font-bold uppercase tracking-widest text-white/80">Daily Attendance</span>
                        </div>
                        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">Monitoring Dashboard</h1>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            <p className="text-white/70 text-sm">Live Sync · {location || 'All Locations'}</p>
                            <ZktStatusBadge />
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative">
                            <select value={location || ''} onChange={(e) => setLocation(e.target.value || undefined)}
                                className="appearance-none pl-8 pr-7 py-2 bg-white/20 border border-white/30 text-white text-sm font-semibold rounded-xl focus:outline-none">
                                <option value="" className="text-slate-900">All Locations</option>
                                {locations.map((l) => <option key={l} value={l} className="text-slate-900">{l}</option>)}
                            </select>
                            <MapPin size={14} className="absolute left-2.5 top-2.5 text-white/80 pointer-events-none" />
                            <ChevronDown size={12} className="absolute right-2 top-3 text-white/80 pointer-events-none" />
                        </div>
                        <div className="relative">
                            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                                className="pl-8 pr-2 py-2 bg-white/20 border border-white/30 text-white text-sm font-semibold rounded-xl focus:outline-none [color-scheme:dark]" />
                            <Calendar size={14} className="absolute left-2.5 top-2.5 text-white/80 pointer-events-none" />
                        </div>
                        <button onClick={() => { setAutoRefresh((p) => !p); refresh(); refreshRoster(); }}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-bold transition-all ${autoRefresh ? 'bg-white/25 border-white/40' : 'bg-white/10 border-white/20 text-white/60'}`}>
                            <RefreshCw size={14} className={autoRefresh ? 'animate-spin [animation-duration:3s]' : ''} />
                            <span className="hidden sm:inline">{autoRefresh ? 'Live' : 'Paused'}</span>
                        </button>
                        <button
                            onClick={() => setPreviewConfig({
                                isOpen: true,
                                title: 'Daily Attendance Sheet Preview',
                                subtitle: `Daily report for ${date}`,
                                fetchData: () => attendanceApi.fetchDailyReportCsv(date),
                                downloadFileName: `attendance_all_${date}.csv`
                            })}
                            className="flex items-center gap-1.5 px-3 py-2 bg-white/90 text-indigo-600 rounded-xl text-sm font-bold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all border border-white/50"
                        >
                            <Download size={16} />
                            <span className="hidden sm:inline">Daily Sheet</span>
                        </button>
                        <button 
                            onClick={() => {
                                const monthVal = date.slice(0, 7);
                                setPreviewConfig({
                                    isOpen: true,
                                    title: 'Monthly Attendance Sheet Preview',
                                    subtitle: `Monthly report for ${monthVal}`,
                                    fetchData: () => attendanceApi.fetchMonthlyReportCsv(monthVal),
                                    downloadFileName: `attendance_all_${monthVal}.csv`
                                });
                            }}
                            className="flex items-center gap-1.5 px-3 py-2 bg-white text-indigo-600 rounded-xl text-sm font-bold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all"
                        >
                            <Download size={16} />
                            <span className="hidden sm:inline">Monthly Sheet</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Performance Overview Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
                <StatCard title="On Time" value={loading ? '…' : String(summary?.totalPresent ?? 0)}
                    subtitle={`${pct}% on-time rate`} icon={UserCheck} colorClass="bg-emerald-100 text-emerald-600"
                    active={statusFilter === 'OnTime'} onClick={() => handleStatClick('OnTime')} />
                <StatCard title="Late" value={loading ? '…' : String(summary?.totalLate ?? 0)}
                    subtitle="Arrived after grace" icon={AlertTriangle} colorClass="bg-amber-100 text-amber-600"
                    active={statusFilter === 'Late'} onClick={() => handleStatClick('Late')} />
                <StatCard title="Early Leave" value={loading ? '…' : String(summary?.totalEarlyLeave ?? 0)}
                    subtitle="Left early" icon={Timer} colorClass="bg-orange-100 text-orange-600"
                    active={statusFilter === 'Early Leave'} onClick={() => handleStatClick('Early Leave')} />
                <StatCard title={weekend ? 'Weekend / Off' : 'Absent'} value={loading ? '…' : String(summary?.totalAbsent ?? 0)}
                    subtitle={weekend ? 'Weekly holiday' : 'Not present'} icon={UserX} colorClass="bg-rose-100 text-rose-600"
                    active={statusFilter === 'Absent'} onClick={() => handleStatClick('Absent')} />
                <StatCard title="Still In" value={loading ? '…' : String(summary?.totalIncomplete ?? 0)}
                    subtitle={`Avg: ${fmtMins(summary?.avgWorkMins ?? 0)}`} icon={Clock} colorClass="bg-indigo-100 text-indigo-600"
                    active={statusFilter === 'StillIn'} onClick={() => handleStatClick('StillIn')} />
            </div>

            {/* Table Section */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-5 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                        <Fingerprint size={18} className="text-indigo-500" />
                        <h2 className="font-bold text-slate-800 text-base">
                            {date === todayStr() ? "Today's Attendance" : `Attendance for ${date}`}
                            {statusFilter && (
                                <span className="ml-2 text-xs font-normal text-slate-400">
                                    · Filtered by <button onClick={() => setStatusFilter('')} className="text-indigo-500 hover:underline">
                                        {statusFilter === 'StillIn' ? 'Still In' : statusFilter === 'OnTime' ? 'On Time' : statusFilter}
                                    </button>
                                </span>
                            )}
                        </h2>
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    </div>
                    <div className="flex items-center gap-3">
                        {date !== todayStr() && (
                            <button 
                                onClick={() => setIsAutoCloseModalOpen(true)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-600 border border-amber-200 rounded-lg text-xs font-bold hover:bg-amber-100 transition-colors"
                            >
                                <Zap size={14} />
                                Fix Incomplete
                            </button>
                        )}
                        <span className="text-xs text-slate-400">{filteredRoster.length} employees</span>
                        {statusFilter && (
                            <button onClick={() => setStatusFilter('')} className="text-xs font-bold text-indigo-500 hover:text-indigo-700 transition-colors">
                                Clear Filter ×
                            </button>
                        )}
                    </div>
                </div>

                {rosterLoading ? (
                    <div className="p-8 text-center text-slate-400 animate-pulse">Loading roster...</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50/80 border-b border-slate-100">
                                    <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Employee</th>
                                    <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Check In</th>
                                    <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Check Out</th>
                                    <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Work Hrs</th>
                                    <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Late</th>
                                    <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                    <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Method</th>
                                    <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRoster.map((entry) => (
                                    <RosterRow 
                                        key={entry.employeeId} 
                                        entry={entry} 
                                        isPast={date !== todayStr()} 
                                        onClick={() => setSelectedEmp({ id: entry.employeeId, name: entry.employeeName })}
                                        onEdit={() => setEditingEmp(entry)}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Monthly Insights Sidepanel */}
            {selectedEmp && (
                <MonthlyInsightsModal 
                    employeeId={selectedEmp.id}
                    employeeName={selectedEmp.name}
                    onClose={() => setSelectedEmp(null)}
                />
            )}

            {/* Edit Attendance Modal */}
            <EditAttendanceModal
                isOpen={!!editingEmp}
                onClose={() => setEditingEmp(null)}
                date={date}
                employee={editingEmp}
                onSuccess={() => {
                    refresh();
                    refreshRoster();
                }}
            />

            <AlertModal
                isOpen={isAutoCloseModalOpen}
                onClose={() => setIsAutoCloseModalOpen(false)}
                title="Confirm Auto-Close"
                message={`Auto-close all missing checkouts for ${date}?`}
                type="warning"
                showCancel={true}
                confirmText="Yes, Auto-Close"
                onConfirm={async () => {
                    try {
                        await attendanceApi.admin.autoClose(date);
                        refresh();
                        refreshRoster();
                        setIsAutoCloseModalOpen(false);
                    } catch (err: any) {
                        console.error('[Admin] Auto-close failed:', err);
                        alert(`Failed to auto-close records: ${err.message || 'Unknown error'}`);
                    }
                }}
            />
                </>
            )}

            {activeTab === 'personal' && (
                <div className="p-2">
                    <EmployeeDashboard />
                </div>
            )}

            {previewConfig && (
                <SheetPreviewModal
                    isOpen={previewConfig.isOpen}
                    onClose={() => setPreviewConfig(null)}
                    title={previewConfig.title}
                    subtitle={previewConfig.subtitle}
                    fetchData={previewConfig.fetchData}
                    downloadFileName={previewConfig.downloadFileName}
                />
            )}
        </div>
    );
}
