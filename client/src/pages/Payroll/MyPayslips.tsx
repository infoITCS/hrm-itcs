import { useState, useEffect, useCallback } from 'react';
import {
    FileText, Loader2, ChevronDown, ChevronUp,
    DollarSign, TrendingDown, CreditCard, Banknote,
    CheckCircle2, Calendar,
} from 'lucide-react';
import axios from 'axios';
import { api } from '../../utils/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface Earning { component: string; amount: number; type: string }
interface Deduction { component: string; amount: number }

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
// Payslip Detail Accordion
// ─────────────────────────────────────────────────────────────────────────────
const PayslipCard = ({ payslip }: { payslip: Payslip }) => {
    const [expanded, setExpanded] = useState(false);

    const run = payslip.payrollRunId;
    const currency = run?.currency || payslip.currency || 'PKR';

    const fmt = (val: number) =>
        new Intl.NumberFormat('en-PK', { style: 'currency', currency, maximumFractionDigits: 0 }).format(val);

    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {/* Summary row */}
            <button
                id={`payslip-toggle-${payslip._id}`}
                onClick={() => setExpanded(e => !e)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50/60 transition-colors text-left"
            >
                <div className="flex items-center gap-4">
                    <div className="p-2.5 rounded-xl bg-indigo-50">
                        <FileText size={16} className="text-indigo-600" />
                    </div>
                    <div>
                        <p className="font-bold text-slate-800">
                            {MONTH_NAMES[payslip.periodMonth]} {payslip.periodYear}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5 font-mono">{payslip.payslipNo}</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                        <p className="text-xs text-slate-400">Net Pay</p>
                        <p className="font-bold text-indigo-700">{fmt(payslip.netPay)}</p>
                    </div>
                    <span className={`hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                        run?.status === 'Disbursed'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                    }`}>
                        {run?.status === 'Disbursed' && <CheckCircle2 size={11} />}
                        {run?.status || 'Approved'}
                    </span>
                    {expanded ? <ChevronUp size={16} className="text-slate-400 shrink-0" /> : <ChevronDown size={16} className="text-slate-400 shrink-0" />}
                </div>
            </button>

            {/* Expanded detail */}
            {expanded && (
                <div className="border-t border-slate-100 px-5 py-5 space-y-5">
                    {/* Meta */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                        <div className="bg-slate-50 rounded-xl p-3">
                            <p className="text-slate-400 mb-0.5 flex items-center gap-1"><Calendar size={11} /> Period</p>
                            <p className="font-semibold text-slate-700">{MONTH_NAMES[payslip.periodMonth]} {payslip.periodYear}</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-3">
                            <p className="text-slate-400 mb-0.5 flex items-center gap-1"><Banknote size={11} /> Payment</p>
                            <p className="font-semibold text-slate-700">{payslip.paymentMethod}</p>
                        </div>
                        {run?.disbursedAt && (
                            <div className="bg-emerald-50 rounded-xl p-3">
                                <p className="text-emerald-500 mb-0.5 flex items-center gap-1"><CheckCircle2 size={11} /> Disbursed</p>
                                <p className="font-semibold text-emerald-700">
                                    {new Date(run.disbursedAt).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Earnings */}
                    <div>
                        <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                            <DollarSign size={12} className="text-emerald-500" /> Earnings
                        </h4>
                        <div className="space-y-1.5">
                            {payslip.earnings.map((e, i) => (
                                <div key={i} className="flex justify-between text-sm">
                                    <span className="text-slate-600">{e.component}</span>
                                    <span className="font-medium text-slate-800">{fmt(e.amount)}</span>
                                </div>
                            ))}
                            <div className="flex justify-between text-sm border-t border-dashed border-slate-200 pt-1.5 mt-1">
                                <span className="font-semibold text-slate-700">Gross Pay</span>
                                <span className="font-bold text-emerald-600">{fmt(payslip.grossPay)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Deductions */}
                    {payslip.deductions.length > 0 && (
                        <div>
                            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                <TrendingDown size={12} className="text-rose-500" /> Deductions
                            </h4>
                            <div className="space-y-1.5">
                                {payslip.deductions.map((d, i) => (
                                    <div key={i} className="flex justify-between text-sm">
                                        <span className="text-slate-600">{d.component}</span>
                                        <span className="font-medium text-rose-500">- {fmt(d.amount)}</span>
                                    </div>
                                ))}
                                <div className="flex justify-between text-sm border-t border-dashed border-slate-200 pt-1.5 mt-1">
                                    <span className="font-semibold text-slate-700">Total Deductions</span>
                                    <span className="font-bold text-rose-500">- {fmt(payslip.totalDeductions)}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Net Pay highlight */}
                    <div className="bg-indigo-50 rounded-xl px-4 py-3 flex justify-between items-center border border-indigo-100">
                        <span className="font-bold text-indigo-800 flex items-center gap-1.5"><CreditCard size={14} /> Net Pay</span>
                        <span className="text-xl font-black text-indigo-700">{fmt(payslip.netPay)}</span>
                    </div>

                    {payslip.notes && (
                        <p className="text-xs text-slate-500 italic border-t border-slate-100 pt-3">{payslip.notes}</p>
                    )}
                </div>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Component (can be used standalone or embedded in PayrollDashboard)
// ─────────────────────────────────────────────────────────────────────────────
const MyPayslips = ({ embedded = false }: { embedded?: boolean }) => {
    const [payslips, setPayslips] = useState<Payslip[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

    if (loading) return (
        <div className="flex items-center justify-center py-16">
            <Loader2 size={26} className="animate-spin text-indigo-400" />
        </div>
    );

    if (error) return (
        <div className="bg-rose-50 text-rose-700 rounded-xl px-4 py-3 border border-rose-200 text-sm">{error}</div>
    );

    return (
        <div className={embedded ? '' : 'p-4 sm:p-6 max-w-3xl mx-auto space-y-4'}>
            {!embedded && (
                <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <FileText size={22} className="text-indigo-600" /> My Payslips
                </h1>
            )}

            {payslips.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-slate-100">
                    <FileText size={36} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-slate-500 font-medium">No payslips yet</p>
                    <p className="text-slate-400 text-sm mt-1">Your finalized payslips will appear here</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {payslips.map(ps => <PayslipCard key={ps._id} payslip={ps} />)}
                </div>
            )}
        </div>
    );
};

export default MyPayslips;
