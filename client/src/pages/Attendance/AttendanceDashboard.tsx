import { useState, useEffect, useCallback } from 'react';
import {
    Clock, UserCheck, UserX, AlertTriangle, Activity,
    Calendar, Filter, RefreshCw, MapPin, ChevronDown, TrendingUp,
    Fingerprint, BarChart2, List, Search, Timer, Zap, Download
} from 'lucide-react';
import { api } from '../../utils/api';
import { usePermissions } from '../../hooks/usePermissions';

// ── Sub-components ──────────────────────────────────────────────────────────
import StatCard from './components/StatCard';
import LivePunchFeed from './components/LivePunchFeed';
import WeeklyTrendChart from './components/WeeklyTrendChart';
import AttendanceTable from './components/AttendanceTable';
import DeptBreakdownChart from './components/DeptBreakdownChart';
import ZktLiveDashboard from './ZktLiveDashboard';

type Tab = 'overview' | 'records' | 'employee' | 'zkt';

const STATUS_COLORS: Record<string, string> = {
    Present:    'bg-emerald-100 text-emerald-700 border-emerald-200',
    Late:       'bg-amber-100 text-amberald-700 border-amber-200',
    Absent:     'bg-rose-100 text-rose-700 border-rose-200',
    'Half-Day': 'bg-orange-100 text-orange-700 border-orange-200',
    Incomplete: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    'On Leave': 'bg-violet-100 text-violet-700 border-violet-200',
    Holiday:    'bg-teal-100 text-teal-700 border-teal-200',
};

const AttendanceDashboard = () => {
    const { role } = usePermissions();
    const isAdmin = role === 'super-admin' || role === 'admin' || role === 'manager';

    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const [locations, setLocations] = useState<string[]>(['All']);
    const [selectedLocation, setSelectedLocation] = useState('All');
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
    const [summary, setSummary] = useState<any>(null);
    const [weeklyData, setWeeklyData] = useState<any[]>([]);
    const [records, setRecords] = useState<any[]>([]);
    const [recordsTotal, setRecordsTotal] = useState(0);
    const [recordsPage, setRecordsPage] = useState(1);
    const [recordsFilter, setRecordsFilter] = useState({ status: '', startDate: '', endDate: '', search: '' });
    const [loadingSummary, setLoadingSummary] = useState(true);
    const [loadingWeekly, setLoadingWeekly] = useState(true);
    const [loadingRecords, setLoadingRecords] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [exporting, setExporting] = useState(false);

    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };

    // ── Fetch locations ──────────────────────────────────────────────────────
    useEffect(() => {
        fetch(api.attendanceLocations, { headers })
            .then(r => r.json())
            .then(d => {
                if (d.success) setLocations(['All', ...d.data]);
            })
            .catch(() => {});
    }, []);

    // ── Fetch today's summary ────────────────────────────────────────────────
    const fetchSummary = useCallback(async () => {
        setLoadingSummary(true);
        try {
            const locParam = selectedLocation !== 'All' ? `&location=${encodeURIComponent(selectedLocation)}` : '';
            const r = await fetch(`${api.attendanceSummary}?date=${selectedDate}${locParam}`, { headers });
            const d = await r.json();
            if (d.success) setSummary(d.data);
        } catch {
            /* network error */
        } finally {
            setLoadingSummary(false);
        }
    }, [selectedDate, selectedLocation]);

    // ── Fetch weekly trend ───────────────────────────────────────────────────
    const fetchWeekly = useCallback(async () => {
        setLoadingWeekly(true);
        try {
            const locParam = selectedLocation !== 'All' ? `&location=${encodeURIComponent(selectedLocation)}` : '';
            const r = await fetch(`${api.attendanceWeekly}?endDate=${selectedDate}${locParam}`, { headers });
            const d = await r.json();
            if (d.success) setWeeklyData(d.data);
        } catch {
            /* ignore */
        } finally {
            setLoadingWeekly(false);
        }
    }, [selectedDate, selectedLocation]);

    // ── Fetch records (table tab) ────────────────────────────────────────────
    const fetchRecords = useCallback(async () => {
        if (activeTab !== 'records') return;
        setLoadingRecords(true);
        try {
            const params = new URLSearchParams({
                page: String(recordsPage),
                limit: '25',
                ...(recordsFilter.status    ? { status: recordsFilter.status } : {}),
                ...(recordsFilter.startDate ? { startDate: recordsFilter.startDate } : { date: selectedDate }),
                ...(recordsFilter.endDate   ? { endDate: recordsFilter.endDate } : {}),
                ...(recordsFilter.search    ? { employeeId: recordsFilter.search } : {}),
                ...(selectedLocation !== 'All' ? { location: selectedLocation } : {}),
            });
            const r = await fetch(`${api.attendanceRecords}?${params}`, { headers });
            const d = await r.json();
            if (d.success) {
                setRecords(d.data);
                setRecordsTotal(d.pagination.total);
            }
        } catch {
            /* ignore */
        } finally {
            setLoadingRecords(false);
        }
    }, [activeTab, recordsPage, recordsFilter, selectedDate, selectedLocation]);

    useEffect(() => { fetchSummary(); fetchWeekly(); }, [fetchSummary, fetchWeekly]);
    useEffect(() => { fetchRecords(); }, [fetchRecords]);

    // Auto-refresh every 30 seconds on overview
    useEffect(() => {
        if (!autoRefresh || activeTab !== 'overview') return;
        const id = setInterval(() => { fetchSummary(); }, 30_000);
        return () => clearInterval(id);
    }, [autoRefresh, activeTab, fetchSummary]);

    const totalPresent  = (summary?.totalPresent  ?? 0) + (summary?.totalLate ?? 0);
    const totalAbsent   = summary?.totalAbsent     ?? 0;
    const totalLate     = summary?.totalLate       ?? 0;
    const totalIncomplete = summary?.totalIncomplete ?? 0;
    const totalHalfDay  = summary?.totalHalfDay    ?? 0;
    const totalTracked  = totalPresent + totalAbsent + totalHalfDay + totalIncomplete + (summary?.totalOnLeave ?? 0);
    const presentPct    = totalTracked > 0 ? Math.round((totalPresent / totalTracked) * 100) : 0;
    const avgWorkHrs    = summary?.avgWorkMins ? `${Math.floor(summary.avgWorkMins / 60)}h ${summary.avgWorkMins % 60}m` : '—';

    const tabs = [
        { id: 'overview' as Tab, label: 'Overview',   icon: BarChart2  },
        { id: 'records'  as Tab, label: 'Records',    icon: List       },
        { id: 'employee' as Tab, label: 'Live Feed',  icon: Activity   },
        { id: 'zkt'      as Tab, label: 'ZKT Cloud',  icon: Zap        },
    ];

    const handleExport = async () => {
        setExporting(true);
        try {
            const params = new URLSearchParams({
                ...(recordsFilter.startDate ? { startDate: recordsFilter.startDate } : { startDate: selectedDate }),
                ...(recordsFilter.endDate   ? { endDate: recordsFilter.endDate } : { endDate: selectedDate }),
                ...(selectedLocation !== 'All' ? { location: selectedLocation } : {}),
                ...(recordsFilter.status ? { status: recordsFilter.status } : {}),
            });
            const r = await fetch(`${api.attendanceExport}?${params}`, { headers });
            if (!r.ok) throw new Error('Export failed');
            
            const blob = await r.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Attendance_${selectedDate}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (err) {
            console.error('Export error:', err);
            alert('Failed to export attendance data.');
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* ── Page Header ── */}
            <div className="rounded-xl min-[992px]:rounded-2xl p-5 sm:p-6 min-[992px]:p-8 text-white shadow-xl relative overflow-hidden bg-gradient-to-r from-indigo-600 via-purple-600 to-violet-700">
                <div className="absolute top-0 right-0 w-72 h-72 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2.5 bg-white/20 backdrop-blur-sm rounded-xl">
                                <Fingerprint size={22} />
                            </div>
                            <span className="text-sm font-bold uppercase tracking-widest text-white/80">Biometric Attendance</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Attendance Dashboard</h1>
                        <p className="text-white/80 text-sm mt-1">
                            ZKTeco SpeedFace V5L &nbsp;•&nbsp; Real-time sync
                        </p>
                    </div>

                    {/* Controls */}
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Location picker */}
                        <div className="relative">
                            <select
                                value={selectedLocation}
                                onChange={e => setSelectedLocation(e.target.value)}
                                className="appearance-none pl-9 pr-8 py-2.5 bg-white/20 backdrop-blur-sm border border-white/30 text-white font-semibold text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-white/50 cursor-pointer"
                            >
                                {locations.map(l => (
                                    <option key={l} value={l} className="text-slate-900 bg-white">{l}</option>
                                ))}
                            </select>
                            <MapPin size={16} className="absolute left-2.5 top-3 text-white/80" />
                            <ChevronDown size={14} className="absolute right-2.5 top-3 text-white/80 pointer-events-none" />
                        </div>

                        {/* Date picker */}
                        <div className="relative">
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={e => setSelectedDate(e.target.value)}
                                className="pl-9 pr-3 py-2.5 bg-white/20 backdrop-blur-sm border border-white/30 text-white font-semibold text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-white/50 [color-scheme:dark]"
                            />
                            <Calendar size={16} className="absolute left-2.5 top-3 text-white/80" />
                        </div>

                        {/* Auto-refresh toggle */}
                        <button
                            onClick={() => { setAutoRefresh(p => !p); fetchSummary(); }}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border font-semibold text-sm transition-all ${autoRefresh ? 'bg-white/25 border-white/40 text-white' : 'bg-white/10 border-white/20 text-white/60'}`}
                        >
                            <RefreshCw size={15} className={autoRefresh ? 'animate-spin [animation-duration:3s]' : ''} />
                            {autoRefresh ? 'Live' : 'Paused'}
                        </button>

                        {/* Export button */}
                        <button
                            onClick={handleExport}
                            disabled={exporting}
                            className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-sm rounded-xl transition-all disabled:opacity-50"
                        >
                            <Download size={15} className={exporting ? 'animate-bounce' : ''} />
                            {exporting ? 'Exporting...' : 'Export CSV'}
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Tabs ── */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex items-center gap-1 p-2 border-b border-slate-100">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                                activeTab === tab.id
                                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm'
                                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                            }`}
                        >
                            <tab.icon size={16} />
                            {tab.label}
                        </button>
                    ))}
                    <div className="ml-auto pr-2 flex items-center gap-2">
                        <span className="text-xs text-slate-400 font-medium">
                            {new Date(selectedDate).toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                    </div>
                </div>

                {/* ── OVERVIEW TAB ── */}
                {activeTab === 'overview' && (
                    <div className="p-6 space-y-6">
                        {/* Stat Cards row */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <StatCard
                                title="Present Today"
                                value={loadingSummary ? '...' : String(totalPresent)}
                                subtitle={`${presentPct}% attendance rate`}
                                icon={UserCheck}
                                color="emerald"
                                trend={presentPct >= 80 ? 'up' : 'down'}
                            />
                            <StatCard
                                title="Late Arrivals"
                                value={loadingSummary ? '...' : String(totalLate)}
                                subtitle="Arrived after grace period"
                                icon={AlertTriangle}
                                color="amber"
                            />
                            <StatCard
                                title="Absent"
                                value={loadingSummary ? '...' : String(totalAbsent)}
                                subtitle="Not marked present"
                                icon={UserX}
                                color="rose"
                            />
                            <StatCard
                                title="Still Working"
                                value={loadingSummary ? '...' : String(totalIncomplete)}
                                subtitle={`Avg work time: ${avgWorkHrs}`}
                                icon={Timer}
                                color="indigo"
                            />
                        </div>

                        {/* Row 2: Quick badges */}
                        <div className="flex flex-wrap gap-3">
                            {[
                                { label: 'On Leave',  val: summary?.totalOnLeave ?? 0, color: 'violet' },
                                { label: 'Half Day',  val: totalHalfDay,               color: 'orange' },
                                { label: 'Tracked',   val: totalTracked,               color: 'slate' },
                            ].map(b => (
                                <div key={b.label} className={`flex items-center gap-2 px-4 py-2 rounded-xl bg-${b.color}-50 border border-${b.color}-100`}>
                                    <span className={`text-lg font-bold text-${b.color}-600`}>{b.val}</span>
                                    <span className={`text-xs font-semibold text-${b.color}-500`}>{b.label}</span>
                                </div>
                            ))}
                        </div>

                        {/* Row 3: Charts + Live Feed */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Weekly Trend */}
                            <div className="lg:col-span-2">
                                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 h-full">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                            <TrendingUp size={18} className="text-indigo-500" />
                                            7-Day Attendance Trend
                                        </h3>
                                    </div>
                                    <WeeklyTrendChart data={weeklyData} loading={loadingWeekly} />
                                </div>
                            </div>

                            {/* Status Breakdown */}
                            <div>
                                <DeptBreakdownChart summary={summary} loading={loadingSummary} />
                            </div>
                        </div>

                        {/* Row 4: Live punch feed */}
                        <div>
                            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                        <Zap size={18} className="text-indigo-500" />
                                        Live Punch Feed
                                        <span className="ml-2 w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
                                    </h3>
                                    <span className="text-xs text-slate-400">Auto-refresh every 30s</span>
                                </div>
                                <LivePunchFeed
                                    location={selectedLocation !== 'All' ? selectedLocation : undefined}
                                    refreshKey={autoRefresh}
                                />
                            </div>
                        </div>

                        {/* Today's records table preview */}
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                    <List size={18} className="text-indigo-500" />
                                    Today's Attendance Records
                                </h3>
                                <button
                                    onClick={() => setActiveTab('records')}
                                    className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
                                >
                                    View All →
                                </button>
                            </div>
                            {summary?.records && (
                                <TodayQuickTable records={summary.records.slice(0, 10)} />
                            )}
                        </div>
                    </div>
                )}

                {/* ── RECORDS TAB ── */}
                {activeTab === 'records' && (
                    <div className="p-6">
                        {/* Filters bar */}
                        <div className="flex flex-wrap gap-3 mb-5">
                            <div className="relative flex-1 min-w-[200px]">
                                <Search size={15} className="absolute left-3 top-3 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Employee ID..."
                                    value={recordsFilter.search}
                                    onChange={e => setRecordsFilter(p => ({ ...p, search: e.target.value }))}
                                    className="pl-9 pr-3 py-2.5 w-full border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                />
                            </div>
                            <input
                                type="date"
                                value={recordsFilter.startDate}
                                onChange={e => setRecordsFilter(p => ({ ...p, startDate: e.target.value }))}
                                className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                            <input
                                type="date"
                                value={recordsFilter.endDate}
                                onChange={e => setRecordsFilter(p => ({ ...p, endDate: e.target.value }))}
                                className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                            <select
                                value={recordsFilter.status}
                                onChange={e => setRecordsFilter(p => ({ ...p, status: e.target.value }))}
                                className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            >
                                <option value="">All Statuses</option>
                                {['Present', 'Late', 'Absent', 'Half-Day', 'Incomplete', 'On Leave'].map(s => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                            <button
                                onClick={() => { setRecordsPage(1); fetchRecords(); }}
                                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors"
                            >
                                <Filter size={15} /> Filter
                            </button>
                        </div>

                        <AttendanceTable
                            records={records}
                            loading={loadingRecords}
                            total={recordsTotal}
                            page={recordsPage}
                            onPageChange={setRecordsPage}
                            onRefresh={fetchRecords}
                            isAdmin={isAdmin}
                        />
                    </div>
                )}

                {/* ── LIVE FEED TAB ── */}
                {activeTab === 'employee' && (
                    <div className="p-6 space-y-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                                <Activity size={20} />
                            </div>
                            <div>
                                <h2 className="font-bold text-slate-800">Live Punch Monitor</h2>
                                <p className="text-sm text-slate-500">All punches from connected devices — refreshes every 15s</p>
                            </div>
                        </div>
                        <LivePunchFeed
                            location={selectedLocation !== 'All' ? selectedLocation : undefined}
                            limit={50}
                            refreshKey={autoRefresh}
                            showDeviceInfo
                        />
                    </div>
                )}

                {/* ── ZKT CLOUD TAB ── */}
                {activeTab === 'zkt' && (
                    <div className="p-6">
                        <ZktLiveDashboard />
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Quick table for today's records in the overview ──────────────────────────
const TodayQuickTable = ({ records }: { records: any[] }) => {
    if (!records.length) {
        return (
            <div className="text-center py-10 text-slate-400">
                <Clock size={40} className="mx-auto mb-3 text-slate-300" />
                <p className="font-medium">No records for this date yet.</p>
                <p className="text-sm mt-1">Punch data will appear here as employees clock in.</p>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-left px-4 py-3 font-semibold text-slate-600">Employee ID</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600">Check In</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600">Check Out</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600">Work Time</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600">Late</th>
                    </tr>
                </thead>
                <tbody>
                    {records.map((r, i) => (
                        <tr key={r._id || i} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-3 font-bold text-slate-800">{r.employeeId}</td>
                            <td className="px-4 py-3 text-slate-600">
                                {r.checkIn ? new Date(r.checkIn).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }) : '—'}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                                {r.checkOut ? new Date(r.checkOut).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }) : '—'}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                                {r.workDurationMinutes > 0
                                    ? `${Math.floor(r.workDurationMinutes / 60)}h ${r.workDurationMinutes % 60}m`
                                    : '—'}
                            </td>
                            <td className="px-4 py-3">
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${STATUS_COLORS[r.status] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                    {r.status}
                                </span>
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                                {r.lateMinutes > 0
                                    ? <span className="text-amber-600 font-semibold">+{r.lateMinutes}m</span>
                                    : <span className="text-emerald-500">On time</span>}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default AttendanceDashboard;
