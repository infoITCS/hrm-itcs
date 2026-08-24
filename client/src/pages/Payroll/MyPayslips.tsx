import { useState, useEffect, useCallback, useRef } from 'react';
import {
    FileText, Loader2, ChevronDown, ChevronUp,
    TrendingDown, Download,
    CheckCircle2, Clock,
    AlertTriangle, Palmtree,
    Sparkles, Receipt, EyeOff, Lock
} from 'lucide-react';
import axios from 'axios';
import { api } from '../../utils/api';
import { useToast } from '../../contexts/ToastContext';
import SalaryPinModal from '../../components/UI/SalaryPinModal';

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
        startDate?: string;
        endDate?: string;
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
        leaveDays: 0,
    };

    const handleDownloadPdf = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setDownloading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(
                `${api.baseURL}/api/payroll/payslips/${payslip._id}/pdf`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                    responseType: 'blob',
                }
            );

            const blob = new Blob([res.data], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Payslip-${payslip.payslipNo}-${MONTH_NAMES[payslip.periodMonth]}-${payslip.periodYear}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            showToast(`Payslip for ${MONTH_NAMES[payslip.periodMonth]} ${payslip.periodYear} downloaded successfully.`, 'success');
        } catch (err: any) {
            showToast('Failed to download payslip PDF. Please try again.', 'error');
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all overflow-hidden">
            {/* Header / Summary Row */}
            <div
                onClick={() => setExpanded(e => !e)}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer select-none hover:bg-slate-50/60 transition-colors"
            >
                <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-bold shrink-0">
                        <Receipt size={22} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-800 text-base">
                                {MONTH_NAMES[payslip.periodMonth]} {payslip.periodYear}
                            </span>
                            <span className="text-[11px] font-mono font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                                {payslip.payslipNo}
                            </span>
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                                payslip.status === 'Paid'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                                    : 'bg-indigo-50 text-indigo-700 border border-indigo-200/60'
                            }`}>
                                <CheckCircle2 size={11} /> {payslip.status}
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                            <span>Paid via <strong className="font-semibold text-slate-700">{payslip.paymentMethod}</strong></span>
                            {payslip.paidAt && (
                                <>
                                    <span>•</span>
                                    <span>{new Date(payslip.paidAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                </>
                            )}
                        </p>
                    </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-5">
                    <div className="text-right">
                        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Net Salary</p>
                        <p className="text-lg sm:text-xl font-black text-indigo-600">
                            {fmt(payslip.netPay)}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleDownloadPdf}
                            disabled={downloading}
                            className="p-2 rounded-xl bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 transition-colors border border-slate-200/80 cursor-pointer disabled:opacity-50"
                            title="Download PDF Payslip"
                        >
                            {downloading ? <Loader2 size={16} className="animate-spin text-indigo-600" /> : <Download size={16} />}
                        </button>
                        <div className="text-slate-400 p-1">
                            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </div>
                    </div>
                </div>
            </div>

            {/* Expanded Detailed Breakdown */}
            {expanded && (
                <div className="border-t border-slate-100 bg-slate-50/40 p-4 sm:p-6 space-y-5 animate-fadeIn">
                    
                    {/* Attendance Mini Summary Bar */}
                    <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 space-y-2">
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                            <Clock size={13} className="text-indigo-600" /> Attendance Breakdown for Period
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-1">
                            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center">
                                <p className="text-[11px] font-semibold text-slate-500 uppercase">Working Days</p>
                                <p className="text-lg font-black text-slate-800 mt-0.5">{att.workingDays}</p>
                            </div>
                            <div className="bg-emerald-50/60 rounded-xl p-3 border border-emerald-100 text-center">
                                <p className="text-[11px] font-semibold text-emerald-600 uppercase flex items-center justify-center gap-1"><CheckCircle2 size={11} /> Present</p>
                                <p className="text-lg font-black text-emerald-700 mt-0.5">{att.presentDays}</p>
                            </div>
                            <div className="bg-amber-50/60 rounded-xl p-3 border border-amber-100 text-center">
                                <p className="text-[11px] font-semibold text-amber-600 uppercase flex items-center justify-center gap-1"><Clock size={11} /> Late</p>
                                <p className="text-lg font-black text-amber-700 mt-0.5">{att.lateDays}</p>
                            </div>
                            <div className="bg-orange-50/60 rounded-xl p-3 border border-orange-100 text-center">
                                <p className="text-[11px] font-semibold text-orange-600 uppercase flex items-center justify-center gap-1"><TrendingDown size={11} /> Half-Days</p>
                                <p className="text-lg font-black text-orange-700 mt-0.5">{att.halfDays}</p>
                            </div>
                            <div className="bg-rose-50/60 rounded-xl p-3 border border-rose-100 text-center">
                                <p className="text-[11px] font-semibold text-rose-600 uppercase flex items-center justify-center gap-1"><TrendingDown size={11} /> Absents</p>
                                <p className="text-lg font-black text-rose-700 mt-0.5">{att.absentDays}</p>
                            </div>
                            <div className="bg-purple-50/60 rounded-xl p-3 border border-purple-100 text-center">
                                <p className="text-[11px] font-semibold text-purple-600 uppercase flex items-center justify-center gap-1"><Palmtree size={11} /> Leaves</p>
                                <p className="text-lg font-black text-purple-700 mt-0.5">{att.leaveDays}</p>
                            </div>
                        </div>
                    </div>

                    {/* Earnings & Deductions Tables */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <div className="bg-white rounded-xl border border-slate-200/80 p-4 space-y-3">
                            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 border-b pb-2">
                                <Sparkles size={14} className="text-emerald-500" /> Earnings
                            </h4>
                            <div className="space-y-2 text-xs">
                                {payslip.earnings.map((e, i) => (
                                    <div key={i} className="flex justify-between items-center py-1">
                                        <span className="text-slate-600">{e.component}</span>
                                        <span className="font-bold text-slate-800">{fmt(e.amount)}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-between items-center pt-2 font-bold text-sm border-t">
                                <span>Gross Total</span>
                                <span className="text-emerald-600">{fmt(payslip.grossPay)}</span>
                            </div>
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200/80 p-4 space-y-3">
                            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 border-b pb-2">
                                <TrendingDown size={14} className="text-rose-500" /> Deductions
                            </h4>
                            <div className="space-y-2 text-xs">
                                {payslip.deductions.map((d, i) => (
                                    <div key={i} className="flex justify-between items-center py-1">
                                        <span className="text-slate-600">{d.component}</span>
                                        <span className="font-bold text-rose-500">- {fmt(d.amount)}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-between items-center pt-2 font-bold text-sm border-t">
                                <span>Total Deductions</span>
                                <span className="text-rose-500">- {fmt(payslip.totalDeductions)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Net Pay Box */}
                    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-4 border border-indigo-100 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-indigo-900">Net Disbursed Take-Home Pay</p>
                            <p className="text-[11px] text-indigo-700/80 mt-0.5">Calculated as Gross Earnings minus Total Deductions</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xl sm:text-2xl font-black text-indigo-600">
                                {fmt(payslip.netPay)}
                            </p>
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
    // Default to true (masked with asterisks) for privacy
    const [hideSalary, setHideSalary] = useState<boolean>(true);
    const [showPinModal, setShowPinModal] = useState<boolean>(false);
    const lockTimerRef = useRef<any>(null);

    const startAutoLockTimer = () => {
        if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
        lockTimerRef.current = setTimeout(() => {
            setHideSalary(true);
        }, 5 * 60 * 1000); // 5 minutes auto-lock
    };

    useEffect(() => {
        return () => {
            if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
        };
    }, []);

    const handleToggleSalary = () => {
        if (hideSalary) {
            // Currently hidden -> Open 4-digit PIN verification modal
            setShowPinModal(true);
        } else {
            // Currently revealed -> Immediately hide and lock
            if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
            setHideSalary(true);
        }
    };

    const handlePinSuccess = () => {
        setHideSalary(false);
        startAutoLockTimer();
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
        <div className={embedded ? '' : 'space-y-6 animate-fadeIn'}>
            {!embedded && (
                <>
                    {/* Header Banner */}
                    <div className="relative rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-violet-700 text-white p-4 sm:p-6 shadow-xl overflow-hidden">
                        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
                        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-white/90 text-xs font-semibold backdrop-blur-md">
                                        <Sparkles size={13} /> Official Salary Records
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleToggleSalary}
                                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs font-semibold backdrop-blur-md border border-white/20 transition-all shadow-sm active:scale-95 cursor-pointer"
                                        title={hideSalary ? "Click to unlock salary figures with 4-digit PIN" : "Click to mask salary figures"}
                                    >
                                        {hideSalary ? <Lock size={12} className="text-white/90" /> : <EyeOff size={12} className="text-white/90" />}
                                        <span>{hideSalary ? 'Unlock with PIN' : 'Hide Salary'}</span>
                                    </button>
                                </div>
                                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                                    My Payslips & Earnings
                                </h1>
                                <p className="text-white/80 text-sm mt-1 max-w-xl">
                                    View monthly salary statements, attendance deductions, meal allowances, and download official PDF slips.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white/10 p-4 rounded-2xl border border-white/15 backdrop-blur-md shrink-0 w-full md:w-auto">
                                <div className="p-1 sm:p-0">
                                    <p className="text-[10px] sm:text-[11px] font-semibold text-white/80 uppercase tracking-wider whitespace-nowrap">Latest Net Salary</p>
                                    <p className="text-lg sm:text-xl font-black text-white mt-0.5 whitespace-nowrap">
                                        {hideSalary ? '••••••••' : (latestNetPay > 0 ? `PKR ${latestNetPay.toLocaleString()}` : 'N/A')}
                                    </p>
                                </div>
                                <div className="p-1 sm:p-0 border-t sm:border-t-0 sm:border-l border-white/20 sm:pl-4">
                                    <p className="text-[10px] sm:text-[11px] font-semibold text-white/80 uppercase tracking-wider whitespace-nowrap">Total Earned</p>
                                    <p className="text-lg sm:text-xl font-black text-white mt-0.5 whitespace-nowrap">
                                        {hideSalary ? '••••••••' : (ytdTotal > 0 ? `PKR ${ytdTotal.toLocaleString()}` : 'N/A')}
                                    </p>
                                </div>
                                <div className="p-1 sm:p-0 border-t sm:border-t-0 sm:border-l border-white/20 sm:pl-4">
                                    <p className="text-[10px] sm:text-[11px] font-semibold text-white/80 uppercase tracking-wider whitespace-nowrap">Total Payslips</p>
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
                                onClick={handleToggleSalary}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 text-xs font-semibold border border-slate-200/80 transition-all shadow-xs cursor-pointer"
                            >
                                {hideSalary ? <Lock size={13} className="text-indigo-600" /> : <EyeOff size={13} className="text-indigo-600" />}
                                <span>{hideSalary ? 'Unlock with PIN' : 'Hide Salary'}</span>
                            </button>
                            <span className="hidden sm:inline text-xs font-semibold text-slate-400">Click any month to expand full details</span>
                        </div>
                    </div>

                    <div className="space-y-3.5">
                        {payslips.map(ps => <PayslipCard key={ps._id} payslip={ps} hideSalary={hideSalary} />)}
                    </div>
                </div>
            )}

            {/* 4-Digit Salary Security PIN Verification Modal */}
            <SalaryPinModal
                isOpen={showPinModal}
                onClose={() => setShowPinModal(false)}
                onSuccess={handlePinSuccess}
                title="Verify 4-Digit Salary PIN"
                description="Enter your 4-digit PIN to securely view your confidential salary statements."
            />
        </div>
    );
};

export default MyPayslips;
