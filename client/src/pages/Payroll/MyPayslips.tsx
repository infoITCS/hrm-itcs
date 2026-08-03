import { useState, useEffect, useCallback } from 'react';
import {
    FileText, Loader2, ChevronDown, ChevronUp,
    TrendingDown, CreditCard, Banknote, Download,
    CheckCircle2, Calendar, ShieldCheck, Clock,
    AlertTriangle, UserCheck, Palmtree, ArrowDownCircle,
    Sparkles, Receipt, Eye, EyeOff
} from 'lucide-react';
import axios from 'axios';
import { api } from '../../utils/api';
import { useToast } from '../../contexts/ToastContext';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface Earning { component: string; amount: number; type: string }
interface Deduction { component: string; amount: number }

interface AttendanceSummary {
    workingDays: number;
    presentDays: number;
    lateDays: number;
    halfDays: number;
    absentDays: number;
    leaveDays: number;
}

interface Payslip {
    _id: string;
    payslipNo: string;
    employeeId: string;
    periodMonth: number;
    periodYear: number;
    currency: string;
    earnings: Earning[];
    deductions: Deduction[];
    grossPay: number;
    totalDeductions: number;
    netPay: number;
    status: string;
    paymentMethod: string;
    paidAt?: string;
    notes?: string;
    attendanceSummary?: AttendanceSummary;
    payrollRunId?: {
        _id: string;
        title: string;
        periodMonth: number;
        periodYear: number;
        status: string;
        disbursedAt?: string;
        currency: string;
    };
}

const MONTH_NAMES = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

// ─────────────────────────────────────────────────────────────────────────────
// Payslip Detail Card
// ─────────────────────────────────────────────────────────────────────────────
const PayslipCard = ({ payslip, hideSalary = false }: { payslip: Payslip; hideSalary?: boolean }) => {
    const [expanded, setExpanded] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const { showToast } = useToast();

    const run = payslip.payrollRunId;
    const currency = run?.currency || payslip.currency || 'PKR';

    const fmt = (val: number) => {
        if (hideSalary) return '••••••••';
        return new Intl.NumberFormat('en-PK', { style: 'currency', currency, maximumFractionDigits: 0 }).format(val);
    };

    const att = payslip.attendanceSummary || {
        workingDays: 0,
        presentDays: 0,
        lateDays: 0,
        halfDays: 0,
        absentDays: 0,
        leaveDays: 0
    };

    const handleDownloadPdf = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setDownloading(true);
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${api.baseURL || ''}/api/payroll/payslips/${payslip._id}/pdf`, {
                headers: { Authorization: `Bearer ${token}` },
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Payslip_${payslip.payslipNo}_${MONTH_NAMES[payslip.periodMonth]}_${payslip.periodYear}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) {
            showToast('Failed to download PDF. Please try again.', 'error');
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
            {/* Header / Summary row */}
            <div
                id={`payslip-toggle-${payslip._id}`}
                onClick={() => setExpanded(e => !e)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setExpanded(prev => !prev); } }}
                role="button"
                tabIndex={0}
                className="w-full flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 text-left bg-gradient-to-r from-white via-slate-50/40 to-indigo-50/20 hover:bg-slate-50 transition-colors gap-3 cursor-pointer"
            >
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-500/20 text-white shrink-0">
                        <FileText size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-bold text-slate-800 text-sm sm:text-base whitespace-nowrap">
                                {MONTH_NAMES[payslip.periodMonth]} {payslip.periodYear}
                            </h3>
                            <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold tracking-wide bg-indigo-50 text-indigo-700 border border-indigo-100 font-mono whitespace-nowrap">
                                {payslip.payslipNo}
                            </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5 whitespace-nowrap">
                            <Calendar size={12} className="text-slate-400 shrink-0" /> Issued: {payslip.paidAt ? new Date(payslip.paidAt).toLocaleDateString() : 'Finalized'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-6 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <div className="text-left sm:text-right">
                        <p className="text-[10px] sm:text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap">Net Take-Home</p>
                        <p className="text-base sm:text-lg font-black text-indigo-700">{fmt(payslip.netPay)}</p>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className={`hidden sm:inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
                            run?.status === 'Disbursed'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}>
                            <CheckCircle2 size={12} />
                            {run?.status || 'Finalized'}
                        </span>

                        <button
                            type="button"
                            onClick={handleDownloadPdf}
                            disabled={downloading}
                            className="p-2.5 rounded-xl bg-slate-100 hover:bg-indigo-600 hover:text-white text-slate-600 transition-all duration-200 shadow-sm"
                            title="Download PDF Payslip"
                        >
                            {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                        </button>

                        <div className="p-1 rounded-lg text-slate-400">
                            {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </div>
                    </div>
                </div>
            </div>

            {/* Expanded details */}
            {expanded && (
                <div className="border-t border-slate-100 p-5 space-y-6 bg-slate-50/30">
                    
                    {/* Meta bar */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-2xs">
                            <span className="text-slate-400 flex items-center gap-1 mb-1 font-medium"><Calendar size={12} className="text-indigo-500" /> Pay Period</span>
                            <span className="font-bold text-slate-700">{MONTH_NAMES[payslip.periodMonth]} {payslip.periodYear}</span>
                        </div>
                        <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-2xs">
                            <span className="text-slate-400 flex items-center gap-1 mb-1 font-medium"><Banknote size={12} className="text-emerald-500" /> Payment Method</span>
                            <span className="font-bold text-slate-700">{payslip.paymentMethod || 'Bank Transfer'}</span>
                        </div>
                        <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-2xs">
                            <span className="text-slate-400 flex items-center gap-1 mb-1 font-medium"><ShieldCheck size={12} className="text-blue-500" /> Disbursed Date</span>
                            <span className="font-bold text-slate-700">
                                {run?.disbursedAt ? new Date(run.disbursedAt).toLocaleDateString() : 'Processed'}
                            </span>
                        </div>
                        <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-2xs flex items-center justify-between">
                            <div>
                                <span className="text-slate-400 flex items-center gap-1 mb-1 font-medium"><Receipt size={12} className="text-purple-500" /> PDF Document</span>
                                <span className="font-bold text-indigo-600">Verified Statement</span>
                            </div>
                            <button
                                type="button"
                                onClick={handleDownloadPdf}
                                disabled={downloading}
                                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs flex items-center gap-1 shadow-sm transition-all"
                            >
                                {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                                PDF
                            </button>
                        </div>
                    </div>

                    {/* Attendance Breakdown Grid */}
                    <div>
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <Clock size={14} className="text-indigo-600" /> Monthly Attendance Summary
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                            <div className="bg-white rounded-xl p-3 border border-slate-100 text-center">
                                <p className="text-[11px] font-semibold text-slate-400 uppercase">Working Days</p>
                                <p className="text-lg font-black text-slate-800 mt-0.5">{att.workingDays}</p>
                            </div>
                            <div className="bg-emerald-50/60 rounded-xl p-3 border border-emerald-100 text-center">
                                <p className="text-[11px] font-semibold text-emerald-600 uppercase flex items-center justify-center gap-1"><UserCheck size={11} /> Present</p>
                                <p className="text-lg font-black text-emerald-700 mt-0.5">{att.presentDays}</p>
                            </div>
                            <div className="bg-amber-50/60 rounded-xl p-3 border border-amber-100 text-center">
                                <p className="text-[11px] font-semibold text-amber-600 uppercase flex items-center justify-center gap-1"><Clock size={11} /> Lates</p>
                                <p className="text-lg font-black text-amber-700 mt-0.5">{att.lateDays}</p>
                            </div>
                            <div className="bg-orange-50/60 rounded-xl p-3 border border-orange-100 text-center">
                                <p className="text-[11px] font-semibold text-orange-600 uppercase flex items-center justify-center gap-1"><AlertTriangle size={11} /> Half-Days</p>
                                <p className="text-lg font-black text-orange-700 mt-0.5">{att.halfDays}</p>
                            </div>
                            <div className="bg-rose-50/60 rounded-xl p-3 border border-rose-100 text-center">
                                <p className="text-[11px] font-semibold text-rose-600 uppercase flex items-center justify-center gap-1"><ArrowDownCircle size={11} /> Absents</p>
                                <p className="text-lg font-black text-rose-700 mt-0.5">{att.absentDays}</p>
                            </div>
                            <div className="bg-purple-50/60 rounded-xl p-3 border border-purple-100 text-center">
                                <p className="text-[11px] font-semibold text-purple-600 uppercase flex items-center justify-center gap-1"><Palmtree size={11} /> Leaves</p>
                                <p className="text-lg font-black text-purple-700 mt-0.5">{att.leaveDays}</p>
                            </div>
                        </div>
                    </div>

                    {/* Earnings & Deductions Tables (Side by Side) */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        
                        {/* Earnings Panel */}
                        <div className="bg-white rounded-xl border border-slate-200/80 p-4 space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                                    <Sparkles size={14} className="text-emerald-500" /> Earnings Breakdown
                                </h4>
                                <span className="text-xs font-bold text-emerald-600">PKR</span>
                            </div>
                            <div className="space-y-2 text-xs">
                                {payslip.earnings.map((e, i) => (
                                    <div key={i} className="flex justify-between items-center py-1 border-b border-slate-50">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-slate-700">{e.component}</span>
                                            {e.type === 'variable' && (
                                                <span className="text-[10px] font-medium bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded">Variable</span>
                                            )}
                                        </div>
                                        <span className="font-bold text-slate-800">{fmt(e.amount)}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-between items-center pt-2 font-bold text-sm text-slate-800 border-t border-slate-200">
                                <span>Gross Earnings</span>
                                <span className="text-emerald-600">{fmt(payslip.grossPay)}</span>
                            </div>
                        </div>

                        {/* Deductions Panel */}
                        <div className="bg-white rounded-xl border border-slate-200/80 p-4 space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                                    <TrendingDown size={14} className="text-rose-500" /> Deductions Breakdown
                                </h4>
                                <span className="text-xs font-bold text-rose-500">PKR</span>
                            </div>
                            <div className="space-y-2 text-xs">
                                {payslip.deductions.length === 0 ? (
                                    <p className="text-slate-400 italic py-2">No deductions recorded for this pay period.</p>
                                ) : (
                                    payslip.deductions.map((d, i) => (
                                        <div key={i} className="flex justify-between items-center py-1 border-b border-slate-50">
                                            <span className="font-medium text-slate-700">{d.component}</span>
                                            <span className="font-bold text-rose-500">- {fmt(d.amount)}</span>
                                        </div>
                                    ))
                                )}
                            </div>
                            <div className="flex justify-between items-center pt-2 font-bold text-sm text-slate-800 border-t border-slate-200">
                                <span>Total Deductions</span>
                                <span className="text-rose-500">- {fmt(payslip.totalDeductions)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Net Take-Home Salary Banner */}
                    <div className="bg-gradient-to-r from-indigo-700 via-purple-700 to-indigo-800 rounded-2xl p-5 text-white flex flex-col sm:flex-row justify-between items-center gap-4 shadow-lg shadow-indigo-500/15">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white shrink-0">
                                <CreditCard size={20} />
                            </div>
                            <div>
                                <p className="text-xs font-medium text-indigo-200 uppercase tracking-wider">Net Take-Home Salary</p>
                                <p className="text-xs text-indigo-100 mt-0.5">Disbursed via {payslip.paymentMethod || 'Bank Transfer'}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <span className="text-2xl sm:text-3xl font-black tracking-tight text-white">{fmt(payslip.netPay)}</span>
                        </div>
                    </div>

                    {payslip.notes && (
                        <div className="bg-amber-50/60 border border-amber-200/60 rounded-xl p-3 text-xs text-amber-800 flex items-start gap-2">
                            <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                            <span>{payslip.notes}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────────────────────────────────────
const MyPayslips = ({ embedded = false }: { embedded?: boolean }) => {
    const [payslips, setPayslips] = useState<Payslip[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [hideSalary, setHideSalary] = useState(() => localStorage.getItem('hideSalary') === 'true');

    const toggleHideSalary = () => {
        setHideSalary(prev => {
            const next = !prev;
            localStorage.setItem('hideSalary', String(next));
            return next;
        });
    };

    const fetchPayslips = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await axios.get(api.payrollMyPayslips, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            });
            setPayslips(res.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to load your payslips.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchPayslips(); }, [fetchPayslips]);

    const latestNetPay = payslips[0]?.netPay || 0;
    const ytdTotal = payslips.reduce((sum, p) => sum + p.netPay, 0);

    if (loading) return (
        <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-indigo-600 mb-3" />
            <p className="text-sm font-semibold text-slate-600">Loading your salary statements...</p>
        </div>
    );

    if (error) return (
        <div className="bg-rose-50 text-rose-700 rounded-2xl p-5 border border-rose-200 text-sm font-medium shadow-sm max-w-2xl mx-auto">
            {error}
        </div>
    );

    return (
        <div className={embedded ? '' : 'p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6'}>
            {!embedded && (
                <>
                    {/* Header Banner */}
                    <div className="relative rounded-3xl bg-gradient-to-r from-indigo-900 via-indigo-800 to-purple-900 text-white p-6 sm:p-8 shadow-xl shadow-indigo-900/10 overflow-hidden">
                        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
                        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-indigo-200 text-xs font-semibold backdrop-blur-md">
                                        <Sparkles size={13} /> Official Salary Records
                                    </div>
                                    <button
                                        type="button"
                                        onClick={toggleHideSalary}
                                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs font-semibold backdrop-blur-md border border-white/20 transition-all shadow-sm active:scale-95 cursor-pointer"
                                        title={hideSalary ? "Click to show salary figures" : "Click to hide salary figures"}
                                    >
                                        {hideSalary ? <EyeOff size={13} className="text-indigo-200" /> : <Eye size={13} className="text-indigo-200" />}
                                        <span>{hideSalary ? 'Show Salary' : 'Hide Salary'}</span>
                                    </button>
                                </div>
                                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                                    My Payslips & Earnings
                                </h1>
                                <p className="text-indigo-200 text-sm mt-1 max-w-xl">
                                    View monthly salary statements, attendance deductions, meal allowances, and download official PDF slips.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white/10 p-4 rounded-2xl border border-white/10 backdrop-blur-md shrink-0 w-full md:w-auto">
                                <div className="p-1 sm:p-0">
                                    <p className="text-[10px] sm:text-[11px] font-semibold text-indigo-200 uppercase tracking-wider whitespace-nowrap">Latest Net Salary</p>
                                    <p className="text-lg sm:text-xl font-black text-white mt-0.5 whitespace-nowrap">
                                        {hideSalary ? '••••••••' : (latestNetPay > 0 ? `PKR ${latestNetPay.toLocaleString()}` : 'N/A')}
                                    </p>
                                </div>
                                <div className="p-1 sm:p-0 border-t sm:border-t-0 sm:border-l border-white/20 sm:pl-4">
                                    <p className="text-[10px] sm:text-[11px] font-semibold text-indigo-200 uppercase tracking-wider whitespace-nowrap">Total Earned</p>
                                    <p className="text-lg sm:text-xl font-black text-white mt-0.5 whitespace-nowrap">
                                        {hideSalary ? '••••••••' : (ytdTotal > 0 ? `PKR ${ytdTotal.toLocaleString()}` : 'N/A')}
                                    </p>
                                </div>
                                <div className="p-1 sm:p-0 border-t sm:border-t-0 sm:border-l border-white/20 sm:pl-4">
                                    <p className="text-[10px] sm:text-[11px] font-semibold text-indigo-200 uppercase tracking-wider whitespace-nowrap">Total Payslips</p>
                                    <p className="text-lg sm:text-xl font-black text-white mt-0.5 whitespace-nowrap">{payslips.length}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {payslips.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-3xl border border-slate-200/80 shadow-sm max-w-xl mx-auto">
                    <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4">
                        <FileText size={32} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800">No Payslips Issued Yet</h3>
                    <p className="text-slate-400 text-sm mt-1 max-w-sm mx-auto">
                        Your finalized monthly salary slips will appear here as soon as payroll is processed by HR.
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex items-center justify-between px-1">
                        <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                            <FileText size={18} className="text-indigo-600" /> Salary History ({payslips.length})
                        </h2>
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={toggleHideSalary}
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 text-xs font-semibold border border-slate-200/80 transition-all shadow-xs cursor-pointer"
                            >
                                {hideSalary ? <EyeOff size={14} className="text-indigo-600" /> : <Eye size={14} className="text-indigo-600" />}
                                <span>{hideSalary ? 'Show Salary' : 'Hide Salary'}</span>
                            </button>
                            <span className="hidden sm:inline text-xs font-semibold text-slate-400">Click any month to expand full details</span>
                        </div>
                    </div>

                    <div className="space-y-3.5">
                        {payslips.map(ps => <PayslipCard key={ps._id} payslip={ps} hideSalary={hideSalary} />)}
                    </div>
                </div>
            )}
        </div>
    );
};

export default MyPayslips;
