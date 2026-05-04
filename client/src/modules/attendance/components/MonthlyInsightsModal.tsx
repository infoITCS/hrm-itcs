import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    X, Calendar, Clock, AlertCircle, CheckCircle2, 
    Briefcase, ChevronRight, Download
} from 'lucide-react';
import { attendanceApi } from '../api/attendanceApi';
import { STATUS_LABELS } from '../types';
import type { EmployeeMonthlyDetail } from '../types';

// Deterministic class mappings for Tailwind JIT safety
const STATUS_CLASS_MAP: Record<string, string> = {
    Present: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    Late: 'bg-amber-50 text-amber-600 border-amber-100',
    Absent: 'bg-rose-50 text-rose-600 border-rose-100',
    'On Leave': 'bg-violet-50 text-violet-600 border-violet-100',
    Incomplete: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    'Early Leave': 'bg-orange-50 text-orange-600 border-orange-100',
    'Half-Day': 'bg-yellow-50 text-yellow-600 border-yellow-100',
    Weekend: 'bg-slate-50 text-slate-500 border-slate-100',
    Holiday: 'bg-cyan-50 text-cyan-600 border-cyan-100',
};

const COLOR_TEXT_MAP: Record<string, string> = {
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    rose: 'text-rose-600',
    indigo: 'text-indigo-600',
};

// Use native Intl.DateTimeFormat with local time correction for date-only strings
const formatDate = (dateStr: string, options: Intl.DateTimeFormatOptions) => {
    let finalStr = dateStr;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        finalStr = `${dateStr}T00:00:00`;
    }
    return new Intl.DateTimeFormat('en-US', options).format(new Date(finalStr));
};

interface MonthlyInsightsModalProps {
    employeeId: string;
    employeeName: string;
    onClose: () => void;
}

const MonthlyInsightsModal: React.FC<MonthlyInsightsModalProps> = ({ 
    employeeId, 
    employeeName, 
    onClose 
}) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [data, setData] = useState<EmployeeMonthlyDetail | null>(null);
    const modalRef = useRef<HTMLDivElement>(null);
    
    const [currentMonth, setCurrentMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [retryKey, setRetryKey] = useState(0);

    // Escape key listener
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    // Full focus trap
    useEffect(() => {
        if (loading) return;
        
        const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
        const focusableElements = modalRef.current?.querySelectorAll(focusableSelectors);
        
        if (focusableElements && focusableElements.length > 0) {
            (focusableElements[0] as HTMLElement).focus();

            const handleTab = (e: KeyboardEvent) => {
                if (e.key !== 'Tab') return;

                const els = modalRef.current?.querySelectorAll(focusableSelectors);
                if (!els || els.length === 0) return;

                const first = els[0] as HTMLElement;
                const last = els[els.length - 1] as HTMLElement;

                if (e.shiftKey) { // Shift + Tab
                    if (document.activeElement === first) {
                        e.preventDefault();
                        last.focus();
                    }
                } else { // Tab
                    if (document.activeElement === last) {
                        e.preventDefault();
                        first.focus();
                    }
                }
            };

            document.addEventListener('keydown', handleTab);
            return () => document.removeEventListener('keydown', handleTab);
        }
    }, [loading]);

    useEffect(() => {
        const controller = new AbortController();
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await attendanceApi.getEmployeeMonthly(employeeId, currentMonth, { signal: controller.signal });
                if (!controller.signal.aborted) {
                    setData(res);
                }
            } catch (err: any) {
                if (err.name !== 'AbortError') {
                    console.error('Failed to fetch monthly data:', err);
                    setError(err.message || 'Failed to load attendance details');
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        };
        fetchData();
        return () => controller.abort();
    }, [employeeId, currentMonth, retryKey]);

    const handleDownload = async () => {
        if (isDownloading) return;
        setIsDownloading(true);
        try {
            await attendanceApi.downloadMonthlyReport(currentMonth, employeeId);
        } catch (err: any) {
            console.error('Download failed:', err);
            alert(`Download failed: ${err.message || 'Unknown error'}`);
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[60] flex items-center justify-end">
                {/* Backdrop */}
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                />

                {/* Panel */}
                <motion.div 
                    ref={modalRef}
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="modal-title"
                    className="relative h-full w-full max-w-2xl bg-white shadow-2xl flex flex-col focus:outline-none"
                    tabIndex={-1}
                >
                    {/* Header */}
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-indigo-200">
                                {employeeName.charAt(0)}
                            </div>
                            <div>
                                <h2 id="modal-title" className="text-xl font-bold text-slate-800">{employeeName}</h2>
                                <p className="text-sm text-slate-500 flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    Monthly Performance: {currentMonth}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => {
                                    const [y, m] = currentMonth.split('-').map(Number);
                                    const d = new Date(y, m - 2, 1);
                                    const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                                    setCurrentMonth(newMonth);
                                }}
                                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors"
                                aria-label="Previous Month"
                            >
                                <ChevronRight className="h-4 w-4 rotate-180" />
                            </button>
                            <div className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 shadow-sm min-w-[120px] text-center">
                                {formatDate(`${currentMonth}-01`, { month: 'long', year: 'numeric' })}
                            </div>
                            <button 
                                onClick={() => {
                                    const [y, m] = currentMonth.split('-').map(Number);
                                    const d = new Date(y, m, 1);
                                    const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                                    setCurrentMonth(newMonth);
                                }}
                                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors"
                                aria-label="Next Month"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="flex items-center gap-2 ml-auto">
                            <button 
                                onClick={handleDownload}
                                disabled={isDownloading}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-all border border-indigo-100 disabled:opacity-50"
                            >
                                <Download size={14} className={isDownloading ? 'animate-bounce' : ''} />
                                {isDownloading ? 'Downloading...' : 'Monthly Sheet'}
                            </button>
                            <button 
                                onClick={onClose}
                                className="p-2 hover:bg-rose-50 rounded-xl text-slate-400 hover:text-rose-500 transition-all ml-2"
                                aria-label="Close modal"
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-8">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center h-64 space-y-4">
                                <div className="h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                                <p className="text-slate-500 font-medium">Analyzing monthly trends...</p>
                            </div>
                        ) : error ? (
                            <div className="flex flex-col items-center justify-center h-64 space-y-4 text-center">
                                <AlertCircle className="h-12 w-12 text-rose-500" />
                                <div>
                                    <h3 className="text-lg font-bold text-slate-800">Something went wrong</h3>
                                    <p className="text-slate-500 max-w-xs mx-auto mt-1">{error}</p>
                                </div>
                                <button 
                                     onClick={() => setRetryKey(prev => prev + 1)}
                                     className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 hover:scale-105 transition-transform"
                                 >
                                     Try Again
                                 </button>
                            </div>
                        ) : data ? (
                            <>
                                {/* Stats Grid */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                    <StatCard 
                                        label="Present" 
                                        value={data.summary.presentDays} 
                                        icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                                        color="emerald"
                                    />
                                    <StatCard 
                                        label="Late" 
                                        value={data.summary.lateDays} 
                                        icon={<AlertCircle className="h-4 w-4 text-amber-500" />}
                                        color="amber"
                                    />
                                    <StatCard 
                                        label="Absent" 
                                        value={data.summary.absentDays} 
                                        icon={<X className="h-4 w-4 text-rose-500" />}
                                        color="rose"
                                    />
                                    <StatCard 
                                        label="Avg Work" 
                                        value={data.summary.avgWorkHours} 
                                        icon={<Clock className="h-4 w-4 text-indigo-500" />}
                                        color="indigo"
                                    />
                                </div>

                                {/* Summary Box */}
                                <div className="bg-indigo-900 rounded-2xl p-6 text-white shadow-xl shadow-indigo-100 flex items-center justify-between">
                                    <div>
                                        <p className="text-indigo-200 text-sm font-medium mb-1">Total Effort This Month</p>
                                        <h3 className="text-3xl font-bold">{data.summary.totalWorkHours}</h3>
                                    </div>
                                    <div className="h-16 w-16 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-md">
                                        <Briefcase className="h-8 w-8 text-white" />
                                    </div>
                                </div>

                                {/* Table */}
                                <div className="space-y-4">
                                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                        Attendance Log
                                        <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                            {data.days.length} entries
                                        </span>
                                    </h3>
                                    
                                    <div className="space-y-3">
                                        {data.days.map((day) => (
                                            <div 
                                                key={day.date}
                                                className="group flex items-center justify-between p-4 bg-white border border-slate-100 rounded-xl hover:border-indigo-200 hover:shadow-md transition-all cursor-default"
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-bold text-slate-700">
                                                            {formatDate(day.date, { month: 'short', day: '2-digit' })}
                                                        </span>
                                                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                                                            {formatDate(day.date, { weekday: 'long' })}
                                                        </span>
                                                    </div>
                                                    <div className="h-8 w-[1px] bg-slate-100" />
                                                    <div className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-tight border ${STATUS_CLASS_MAP[day.status] || 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                                                        {STATUS_LABELS[day.status]}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-6">
                                                    <div className="hidden sm:flex flex-col items-end">
                                                        <span className="text-xs text-slate-400 font-medium">Work Time</span>
                                                        <span className="text-sm font-semibold text-slate-700">
                                                            {day.workDurationMinutes ? `${Math.floor(day.workDurationMinutes / 60)}h ${day.workDurationMinutes % 60}m` : '--'}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-col items-end min-w-[80px]">
                                                        <span className="text-xs text-slate-400 font-medium">Punches</span>
                                                        <span className="text-xs font-bold text-slate-600">
                                                            {day.checkIn ? new Date(day.checkIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'n/a'}
                                                            {day.checkOut ? ` → ${new Date(day.checkOut).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}` : ''}
                                                        </span>
                                                    </div>
                                                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-400 transition-colors" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="text-center py-20 text-slate-400">
                                No data found for this period.
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

const StatCard = ({ label, value, icon, color }: { label: string, value: string | number, icon: React.ReactNode, color: string }) => (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">{label}</span>
            {icon}
        </div>
        <div className={`text-xl font-bold ${COLOR_TEXT_MAP[color] || 'text-slate-600'}`}>{value}</div>
    </div>
);

export default MonthlyInsightsModal;
