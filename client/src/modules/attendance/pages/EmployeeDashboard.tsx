import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../contexts/ToastContext';
import { attendanceApi } from '../api/attendanceApi';
import SheetPreviewModal from '../components/SheetPreviewModal';
import type { EmployeeMonthlyDetail } from '../types';
import {
    Clock, CheckCircle2, AlertTriangle, 
    XCircle, History, ChevronLeft, ChevronRight,
    User, Download, MapPin, LogIn, LogOut, RefreshCw
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtMins = (m: number) => m > 0 ? `${Math.floor(m / 60)}h ${m % 60}m` : '—';
const fmtTime = (iso?: string) => iso
    ? new Date(iso).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Karachi' })
    : '—';

/** Returns local YYYY-MM from a Date object */
const getLocalYearMonth = (date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const STATUS_BADGE: Record<string, string> = {
    Present:       'bg-emerald-100/50 text-emerald-700 border-emerald-200',
    Late:          'bg-amber-100/50 text-amber-700 border-amber-200',
    Absent:        'bg-rose-100/50 text-rose-700 border-rose-200',
    'On Leave':    'bg-violet-100/50 text-violet-700 border-violet-200',
    Incomplete:    'bg-indigo-100/50 text-indigo-700 border-indigo-200',
    'Early Leave': 'bg-orange-100/50 text-orange-700 border-orange-200',
    'Half-Day':    'bg-yellow-100/50 text-yellow-700 border-yellow-200',
    Weekend:       'bg-slate-100/50 text-slate-500 border-slate-200',
    Holiday:       'bg-cyan-100/50 text-cyan-700 border-cyan-200',
};

// ─── Stat Card Component ────────────────────────────────────────────────────────
function StatCard({ title, value, icon: Icon, colorClass }: { title: string; value: string | number; icon: any; colorClass: string }) {
    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-all">
            <div className="flex items-center gap-4">
                <div className={`p-2.5 rounded-xl ${colorClass}`}>
                    <Icon size={20} />
                </div>
                <div>
                    <div className="text-2xl font-extrabold text-slate-800">{value}</div>
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-0.5">{title}</div>
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────
export default function EmployeeDashboard() {
    const { user } = useAuth();
    const { showToast } = useToast();
    
    // Default to current local month YYYY-MM
    const [month, setMonth] = useState(() => getLocalYearMonth(new Date()));
    const [data, setData] = useState<EmployeeMonthlyDetail | null>(null);
    const [loading, setLoading] = useState(Boolean(user?.id));
    const [error, setError] = useState<string | null>(null);
    const [punching, setPunching] = useState(false);
    const [previewConfig, setPreviewConfig] = useState<{
        isOpen: boolean;
        title: string;
        subtitle?: string;
        fetchData: () => Promise<string>;
        downloadFileName: string;
    } | null>(null);

    const loadData = useCallback(async () => {
        if (!user?.id) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const res = await attendanceApi.getEmployeeMonthly('me', month);
            setData(res);
        } catch (err: any) {
            console.error('Failed to load employee attendance:', err);
            setError(err.message || 'Unable to load attendance records. Please check your connection.');
        } finally {
            setLoading(false);
        }
    }, [user?.id, month]);

    const todayStr = () => new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);

    const handleShowPreviewMonthly = () => {
        setPreviewConfig({
            isOpen: true,
            title: 'Monthly Attendance Sheet Preview',
            subtitle: `Monthly report for ${month}`,
            fetchData: () => attendanceApi.fetchMonthlyReportCsv(month, 'me'),
            downloadFileName: `attendance_me_${month}.csv`
        });
    };


    const handlePunch = async () => {
        setPunching(true);
        try {
            await attendanceApi.selfPunch();
            showToast('Punch recorded successfully', 'success');
            await loadData();
        } catch (err: any) {
            console.error('Punch failed:', err);
            showToast(err.message || 'Failed to record punch', 'error');
        } finally {
            setPunching(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handlePrevMonth = () => {
        const [year, monthNum] = month.split('-').map(Number);
        const d = new Date(year, monthNum - 1, 1);
        d.setMonth(d.getMonth() - 1);
        setMonth(getLocalYearMonth(d));
    };

    const handleNextMonth = () => {
        const [year, monthNum] = month.split('-').map(Number);
        const d = new Date(year, monthNum - 1, 1);
        d.setMonth(d.getMonth() + 1);
        setMonth(getLocalYearMonth(d));
    };

    const isCurrentMonth = month === getLocalYearMonth(new Date());
    const [y, mNum] = month.split('-').map(Number);
    const monthLabel = new Date(y, mNum - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const todayVal = todayStr();
    const todayRecord = data?.days.find(d => d.date === todayVal);
    const hasCheckedIn = Boolean(todayRecord?.checkIn);
    const hasCheckedOut = Boolean(todayRecord?.checkOut);
    const isWorking = hasCheckedIn && !hasCheckedOut;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Vibrant Purple Header Section */}
            <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-violet-700 rounded-2xl p-6 sm:p-8 text-white shadow-xl overflow-hidden relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                
                <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="flex items-center gap-5">
                        <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-2xl font-black shadow-lg border border-white/30">
                            {user?.name?.slice(0,1).toUpperCase() || <User size={24} />}
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">Personal Attendance</h1>
                            <p className="text-white/80 text-sm font-medium mt-1 flex items-center gap-1.5">
                                <MapPin size={14} className="text-white/60" />
                                {user?.name || 'Employee Profile'}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {/* Month Navigator */}
                        <div className="flex items-center gap-2 bg-black/10 backdrop-blur-md p-1.5 rounded-xl border border-white/10">
                            <button 
                                onClick={handlePrevMonth} 
                                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                                aria-label="Previous month"
                            >
                                <ChevronLeft size={18} />
                            </button>
                            <div className="px-4 text-sm font-bold tracking-tight min-w-[120px] text-center">
                                {monthLabel}
                            </div>
                            <button 
                                onClick={handleNextMonth} 
                                disabled={isCurrentMonth}
                                aria-label="Next month"
                                aria-disabled={isCurrentMonth}
                                className={`p-2 rounded-lg transition-colors ${isCurrentMonth ? 'opacity-20' : 'hover:bg-white/10'}`}
                            >
                                <ChevronRight size={18} />
                            </button>
                        </div>

                        {/* Live Punch Button */}
                        <button
                            onClick={handlePunch}
                            disabled={punching}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all shadow-xl text-sm border border-white/20 ${
                                isWorking 
                                    ? 'bg-rose-500 hover:bg-rose-600 text-white' 
                                    : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                            } ${punching ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'}`}
                        >
                            {punching ? <RefreshCw size={16} className="animate-spin" /> : isWorking ? <LogOut size={16} /> : <LogIn size={16} />}
                            {punching ? 'Recording...' : isWorking ? 'Check Out' : 'Check In'}
                        </button>

                        <button
                            onClick={handleShowPreviewMonthly}
                            className="flex items-center gap-2 px-5 py-2.5 bg-white text-indigo-600 rounded-xl font-bold transition-all hover:bg-slate-50 active:scale-95 text-sm shadow-xl"
                        >
                            <Download size={16} />
                            Monthly Sheet
                        </button>
                    </div>
                </div>
            </div>
            {/* Content Area */}
            {loading ? (
                <div className="h-64 flex flex-col items-center justify-center gap-4 text-slate-400">
                    <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
                    <p className="font-bold animate-pulse tracking-widest uppercase text-sm">Syncing Records...</p>
                </div>
            ) : error ? (
                <div className="bg-white rounded-2xl border-2 border-dashed border-slate-100 p-12 text-center">
                    <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertTriangle size={32} />
                    </div>
                    <h3 className="text-xl font-extrabold text-slate-800 mb-2">Sync Interrupted</h3>
                    <p className="text-slate-500 max-w-sm mx-auto mb-6 font-medium leading-relaxed">
                        {error}
                    </p>
                    <button 
                        onClick={loadData}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 hover:scale-105 active:scale-95 transition-all"
                    >
                        <RefreshCw size={18} />
                        Retry Sync
                    </button>
                </div>
            ) : data ? (
                <>
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
                        <StatCard title="Present Days" value={data.summary.presentDays} icon={CheckCircle2} colorClass="bg-emerald-50 text-emerald-600" />
                        <StatCard title="Late Arrivals" value={data.summary.lateDays} icon={AlertTriangle} colorClass="bg-amber-50 text-amber-600" />
                        <StatCard title="Absent Days" value={data.summary.absentDays} icon={XCircle} colorClass="bg-rose-50 text-rose-600" />
                        <StatCard title="Work Hours" value={data.summary.totalWorkHours} icon={Clock} colorClass="bg-indigo-50 text-indigo-600" />
                    </div>

                    {/* Detailed Log Table */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-slate-50 text-slate-400 rounded-lg">
                                    <History size={18} />
                                </div>
                                <h2 className="text-lg font-bold text-slate-800">Attendance Log</h2>
                            </div>
                            <span className="text-xs font-bold text-slate-400 bg-slate-50 px-3 py-1 rounded-full">
                                {data.days.length} entries
                            </span>
                        </div>
                        
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-slate-50/50 border-b border-slate-50">
                                        <th className="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider">Date</th>
                                        <th className="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider">Check In</th>
                                        <th className="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider">Check Out</th>
                                        <th className="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                                        <th className="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider">Work Hours</th>
                                        <th className="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-wider">Late</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.days.map((day) => (
                                        <tr key={day.date} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                                            <td className="py-4 px-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-xs font-bold text-indigo-600 border border-slate-100">
                                                        {new Date(day.date + 'T00:00:00').getDate()}
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-semibold text-slate-700">
                                                            {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
                                                        </div>
                                                        <div className="text-[10px] text-slate-400 font-medium">
                                                            {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-4 px-6">
                                                <div className="flex items-center gap-2">
                                                    <LogIn size={13} className="text-emerald-500" />
                                                    <span className="text-sm font-medium text-slate-700">{fmtTime(day.checkIn)}</span>
                                                </div>
                                            </td>
                                            <td className="py-4 px-6">
                                                <div className="flex items-center gap-2">
                                                    <LogOut size={13} className="text-rose-500" />
                                                    <span className="text-sm font-medium text-slate-700">{fmtTime(day.checkOut)}</span>
                                                </div>
                                            </td>
                                            <td className="py-4 px-6">
                                                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${STATUS_BADGE[day.status] || 'bg-slate-100 text-slate-500'}`}>
                                                    {day.status}
                                                </span>
                                            </td>
                                            <td className="py-4 px-6 text-sm font-medium text-slate-600">
                                                {fmtMins(day.workDurationMinutes)}
                                            </td>
                                            <td className="py-4 px-6">
                                                {day.lateMinutes > 0 ? (
                                                    <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">+{day.lateMinutes}m</span>
                                                ) : (
                                                    <span className="text-slate-300">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {data.days.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="py-12 text-center text-slate-400 font-medium">
                                                No attendance records found for this month.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            ) : null}

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
