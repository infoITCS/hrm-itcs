import { useState, useEffect, useCallback, type ElementType, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, Navigate } from 'react-router-dom';
import {
    Banknote, Plus, RefreshCw, ChevronRight,
    CheckCircle2, Clock, Send, Loader2, X,
    TrendingUp, Users, Download,
} from 'lucide-react';
import axios from 'axios';
import { api } from '../../utils/api';
import { usePermissions } from '../../hooks/usePermissions';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface PayrollRun {
    _id: string;
    title: string;
    periodMonth: number;
    periodYear: number;
    startDate?: string;
    endDate?: string;
    currency: string;
    status: 'Draft' | 'Approved' | 'Disbursed';
    notes?: string;
    payslipCount: number;
    totalNetPay: number;
    createdAt: string;
    disbursedAt?: string;
}

const MONTH_NAMES = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────
const StatusBadge = ({ status }: { status: string }) => {
    const styles: Record<string, string> = {
        Draft: 'bg-amber-50 text-amber-700 border border-amber-200',
        Approved: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
        Disbursed: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    };
    const icons: Record<string, ReactElement> = {
        Draft: <Clock size={12} />,
        Approved: <CheckCircle2 size={12} />,
        Disbursed: <Send size={12} />,
    };
    return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-slate-100 text-slate-600'}`}>
            {icons[status]}
            {status}
        </span>
    );
};

interface StatCardProps {
    icon: ElementType;
    label: string;
    value: string | number;
    color: string;
}

const StatCard = ({ icon: Icon, label, value, color }: StatCardProps) => {
    const colorMap: Record<string, string> = {
        indigo: 'bg-indigo-50 text-indigo-600',
        emerald: 'bg-emerald-50 text-emerald-600',
        amber: 'bg-amber-50 text-amber-600',
        violet: 'bg-violet-50 text-violet-600',
    };
    return (
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex items-center gap-4">
            <div className={`p-3 rounded-xl ${colorMap[color]}`}>
                <Icon size={22} />
            </div>
            <div>
                <p className="text-xs text-slate-500 font-medium">{label}</p>
                <p className="text-xl font-bold text-slate-800">{value}</p>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Create Run Modal
// ─────────────────────────────────────────────────────────────────────────────
const computeDefaultDates = (mStr: string, yStr: string) => {
    const m = Number(mStr);
    const y = Number(yStr);
    if (!m || !y) return { start: '', end: '' };
    const lastDay = new Date(y, m, 0).getDate();
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { start, end };
};

const countWorkingDays = (startStr: string, endStr: string) => {
    if (!startStr || !endStr || startStr > endStr) return 0;
    let count = 0;
    const cur = new Date(startStr + 'T12:00:00.000Z');
    const stop = new Date(endStr + 'T12:00:00.000Z');
    while (cur <= stop) {
        const day = cur.getUTCDay();
        if (day !== 0 && day !== 6) count++;
        cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return count;
};

const CreateRunModal = ({
    onClose, onCreated,
}: { onClose: () => void; onCreated: () => void }) => {
    const now = new Date();
    const [month, setMonth] = useState(String(now.getMonth() + 1));
    const [year, setYear] = useState(String(now.getFullYear()));
    
    const initialDates = computeDefaultDates(String(now.getMonth() + 1), String(now.getFullYear()));
    const [startDate, setStartDate] = useState(initialDates.start);
    const [endDate, setEndDate] = useState(initialDates.end);
    const [currency, setCurrency] = useState('PKR');
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const currentYear = now.getFullYear();
    const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

    const handleMonthChange = (newMonth: string) => {
        setMonth(newMonth);
        const { start, end } = computeDefaultDates(newMonth, year);
        setStartDate(start);
        setEndDate(end);
    };

    const handleYearChange = (newYear: string) => {
        setYear(newYear);
        const { start, end } = computeDefaultDates(month, newYear);
        setStartDate(start);
        setEndDate(end);
    };

    const workingDays = countWorkingDays(startDate, endDate);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!startDate || !endDate) {
            setError('Please select both Start Date and End Date for payroll calculation.');
            return;
        }
        if (startDate > endDate) {
            setError('Start Date must be before or equal to End Date.');
            return;
        }
        setLoading(true);
        try {
            await axios.post(api.payrollRuns, {
                periodMonth: Number(month),
                periodYear: Number(year),
                startDate,
                endDate,
                currency,
                notes: notes.trim() || undefined,
            }, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            });
            onCreated();
        } catch (err: unknown) {
            const message = (err as any)?.response?.data?.message || (err instanceof Error ? err.message : 'Failed to create payroll run.');
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                        <Banknote size={18} className="text-indigo-600" />
                        New Payroll Run
                    </h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
                        <X size={18} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="bg-rose-50 text-rose-700 text-sm px-3 py-2 rounded-lg border border-rose-200">
                            {error}
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Payroll Month</label>
                            <select
                                value={month}
                                onChange={e => handleMonthChange(e.target.value)}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                required
                            >
                                {MONTH_NAMES.slice(1).map((m, i) => (
                                    <option key={i + 1} value={i + 1}>{m}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Payroll Year</label>
                            <select
                                value={year}
                                onChange={e => handleYearChange(e.target.value)}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                required
                            >
                                {years.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Payroll Calculation Date Range */}
                    <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100/80 space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="block text-xs font-bold text-indigo-950 uppercase tracking-wide">
                                Payroll Calculation Period
                            </label>
                            <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                                {workingDays} Working Days
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Start Date (From)</label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={e => setStartDate(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">End Date (To)</label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={e => setEndDate(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono"
                                    required
                                />
                            </div>
                        </div>

                        <p className="text-[11px] text-slate-500 italic">
                            Payroll calculation and working days will be counted from <strong>{startDate || '—'}</strong> to <strong>{endDate || '—'}</strong>.
                        </p>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Currency</label>
                        <select
                            value={currency}
                            onChange={e => setCurrency(e.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        >
                            <option value="PKR">PKR — Pakistani Rupee</option>
                            <option value="USD">USD — US Dollar</option>
                            <option value="AED">AED — UAE Dirham</option>
                            <option value="SAR">SAR — Saudi Riyal</option>
                            <option value="GBP">GBP — British Pound</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Notes (optional)</label>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            rows={2}
                            placeholder="Any notes for this payroll run..."
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                        <button type="button" onClick={onClose}
                            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">
                            Cancel
                        </button>
                        <button type="submit" disabled={loading}
                            className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90 transition-all flex items-center gap-2 disabled:opacity-60 cursor-pointer">
                            {loading ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                            Create Run
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Dashboard
// ─────────────────────────────────────────────────────────────────────────────
const PayrollDashboard = () => {
    const navigate = useNavigate();
    const { role, hasSubAccess } = usePermissions();
    const canSeePayrollRuns = hasSubAccess('payroll', 'payroll-runs');
    const isAdmin = canSeePayrollRuns;

    if (!isAdmin) {
        return <Navigate to="/my-payslips" replace />;
    }

    const [runs, setRuns] = useState<PayrollRun[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [refreshCounter, setRefreshCounter] = useState(0);

    const fetchRuns = useCallback(async () => {
        if (!isAdmin) return;
        setLoading(true);
        setError(null);
        try {
            const res = await axios.get(api.payrollRuns, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            });
            setRuns(res.data);
        } catch (err: unknown) {
            const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to load payroll runs.';
            setError(message);
        } finally {
            setLoading(false);
        }
    }, [isAdmin]);

    useEffect(() => {
        fetchRuns();
    }, [refreshCounter, fetchRuns]);

    const handleCreated = () => {
        setShowCreateModal(false);
        setRefreshCounter(c => c + 1);
    };

    // Stats
    const totalDisbursed = runs.filter(r => r.status === 'Disbursed').reduce((s, r) => s + (r.totalNetPay || 0), 0);
    const drafts = runs.filter(r => r.status === 'Draft').length;
    const approved = runs.filter(r => r.status === 'Approved').length;

    const formatCurrency = (val: number, cur = 'PKR') =>
        new Intl.NumberFormat('en-PK', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(val);

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header Banner */}
            <div className="rounded-2xl p-4 sm:p-6 text-white shadow-xl relative overflow-hidden bg-gradient-to-r from-indigo-600 via-purple-600 to-violet-700">
                <div className="absolute top-0 right-0 w-72 h-72 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2.5 bg-white/20 backdrop-blur-sm rounded-xl">
                                <Banknote size={22} />
                            </div>
                            <span className="text-sm font-bold uppercase tracking-widest text-white/80">Payroll</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Payroll Management</h1>
                        <p className="text-white/80 text-sm mt-1">
                            Manage company payroll runs and employee disbursements
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {isAdmin && (
                            <>
                                <button
                                    onClick={() => setRefreshCounter(c => c + 1)}
                                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold backdrop-blur-sm transition-all border border-white/15 cursor-pointer"
                                    title="Refresh"
                                >
                                    <RefreshCw size={14} />
                                    Refresh
                                </button>
                                <button
                                    id="btn-create-payroll-run"
                                    onClick={() => setShowCreateModal(true)}
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-indigo-700 bg-white hover:bg-indigo-50 transition-all shadow-md active:scale-95 cursor-pointer"
                                >
                                    <Plus size={16} />
                                    New Payroll Run
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Stats — admin only */}
            {isAdmin && (
                <div className="grid grid-cols-1 sm:grid-cols-2 min-[1200px]:grid-cols-4 gap-3">
                    <StatCard icon={TrendingUp} label="Total Runs" value={runs.length} color="indigo" />
                    <StatCard icon={Clock} label="Draft" value={drafts} color="amber" />
                    <StatCard icon={CheckCircle2} label="Approved" value={approved} color="violet" />
                    <StatCard icon={Banknote} label="Total Disbursed" value={formatCurrency(totalDisbursed)} color="emerald" />
                </div>
            )}

            {/* Content */}
            {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 size={28} className="animate-spin text-indigo-500" />
                        </div>
                    ) : error ? (
                        <div className="bg-rose-50 text-rose-700 rounded-xl px-4 py-3 border border-rose-200 text-sm">
                            {error}
                        </div>
                    ) : runs.length === 0 ? (
                        <div className="text-center py-20 bg-white rounded-2xl border border-slate-100">
                            <Banknote size={40} className="mx-auto text-slate-300 mb-3" />
                            <p className="text-slate-500 font-medium">No payroll runs yet</p>
                            <p className="text-slate-400 text-sm mt-1">Create your first payroll run to get started</p>
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90 transition-all"
                            >
                                <Plus size={16} /> New Payroll Run
                            </button>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-100">
                                            <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Period</th>
                                            <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                                            <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Employees</th>
                                            <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Total Net Pay</th>
                                            <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Disbursed</th>
                                            <th className="px-5 py-3.5" />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {runs.map(run => (
                                            <tr
                                                key={run._id}
                                                onClick={() => navigate(`/payroll/runs/${run._id}`)}
                                                className="hover:bg-indigo-50/40 transition-colors cursor-pointer group"
                                            >
                                                <td className="px-5 py-4">
                                                    <p className="font-semibold text-slate-800">{run.title}</p>
                                                    <p className="text-xs text-slate-500 mt-0.5 font-medium">
                                                        {run.startDate && run.endDate ? `${run.startDate} → ${run.endDate}` : run.currency}
                                                    </p>
                                                </td>
                                                <td className="px-5 py-4"><StatusBadge status={run.status} /></td>
                                                <td className="px-5 py-4 hidden sm:table-cell">
                                                    <span className="inline-flex items-center gap-1.5 text-slate-600">
                                                        <Users size={13} className="text-slate-400" />
                                                        {run.payslipCount}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-4 hidden md:table-cell font-medium text-slate-700">
                                                    {formatCurrency(run.totalNetPay, run.currency)}
                                                </td>
                                                <td className="px-5 py-4 hidden lg:table-cell text-slate-500 text-xs">
                                                    {run.disbursedAt
                                                        ? new Date(run.disbursedAt).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
                                                        : '—'}
                                                </td>
                                                 <td className="px-5 py-4 text-right">
                                                     <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                                         <button
                                                             onClick={async () => {
                                                                 try {
                                                                     const token = localStorage.getItem('token');
                                                                     const res = await axios.get(api.payrollBankAdvicePdf(run._id), {
                                                                         headers: { Authorization: `Bearer ${token}` },
                                                                         responseType: 'blob'
                                                                     });
                                                                     const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
                                                                     const link = document.createElement('a');
                                                                     link.href = url;
                                                                     const filename = `Meezan_Bank_Salary_Advice_${(run.title || 'Payroll').replace(/[^a-zA-Z0-9_\-]/g, '_')}.pdf`;
                                                                     link.setAttribute('download', filename);
                                                                     document.body.appendChild(link);
                                                                     link.click();
                                                                     link.remove();
                                                                 } catch (err: any) {
                                                                     alert(err.response?.data?.message || 'Failed to download bank advice PDF.');
                                                                 }
                                                             }}
                                                             className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 transition-colors flex items-center gap-1 shrink-0"
                                                             title="Download Meezan Bank / Corporate Salary Transfer Advice PDF"
                                                         >
                                                             <Download size={13} />
                                                             Bank PDF
                                                         </button>
                                                         <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-500 transition-colors" />
                                                     </div>
                                                 </td>
                                             </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

            {/* Create Run Modal */}
            {showCreateModal && (
                <CreateRunModal onClose={() => setShowCreateModal(false)} onCreated={handleCreated} />
            )}
        </div>
    );
};

export default PayrollDashboard;
