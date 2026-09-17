import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Banknote,
    Clock,
    Wallet,
    CheckCircle2,
    Calendar,
    History,
    Eye,
    EyeOff,
    PlusCircle,
    HandCoins,
    RefreshCw,
    AlertCircle,
    ArrowRight
} from 'lucide-react';
import { api } from '../../utils/api';

interface IndividualLoanItem {
    loanId: string;
    totalAmount: number;
    remainingAmount: number;
    monthlyInstallment: number;
    status: 'Active' | 'Paid' | 'Suspended';
    issueDate?: string;
    category?: string;
    notes?: string;
    paybackDuration?: number;
}

interface LoanRepaymentItem {
    payslipId: string;
    payslipNo?: string;
    periodMonth: number;
    periodYear: number;
    amount: number;
    date: string;
}

interface MyLoanData {
    summary: {
        totalDisbursed: number;
        remainingBalance: number;
        monthlyInstallment: number;
        status: 'Active' | 'Paid' | 'Suspended' | 'None';
    };
    loans: IndividualLoanItem[];
    repayments: LoanRepaymentItem[];
}

const fmtDate = (d: string | undefined | null) =>
    d ? new Date(d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

const MONTH_NAMES = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const getLoanTitle = (loan: IndividualLoanItem) => {
    if (!loan.category || loan.category.trim().toLowerCase() === 'loan') {
        return 'Company Loan';
    }
    return loan.category;
};

const getLoanSubtitle = (loan: IndividualLoanItem) => {
    // If notes contains internal debug strings or raw MongoDB ObjectIDs, format cleanly
    if (!loan.notes || /updated by admin|zeroed by admin|[0-9a-f]{24}/i.test(loan.notes)) {
        return 'Approved by HR Administration';
    }
    return loan.notes;
};

export default function MyLoans() {
    const navigate = useNavigate();
    const [loanData, setLoanData] = useState<MyLoanData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [hideFigures, setHideFigures] = useState(true);

    const fmtPKR = (n: number) => {
        if (hideFigures) return '••••••••';
        return `Rs. ${(n || 0).toLocaleString('en-PK')}`;
    };

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.baseURL}/api/employees/my-loans`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const body = await res.json();
                setLoanData(body);
            } else {
                const body = await res.json().catch(() => ({}));
                setError(body.message || 'Failed to load your loan details.');
            }
        } catch {
            setError('Network error occurred while fetching loan details.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const totalRepaidAmount = (loanData?.repayments || []).reduce((s, r) => s + r.amount, 0);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-slate-500 font-medium text-sm">Loading your loan records...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 max-w-lg mx-auto text-center space-y-4 bg-white rounded-3xl border border-slate-200/80 shadow-sm mt-10">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
                    <AlertCircle size={24} />
                </div>
                <h3 className="text-lg font-bold text-slate-800">Unable to Load Loans</h3>
                <p className="text-xs text-slate-500">{error}</p>
                <button
                    onClick={loadData}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm shadow-emerald-500/20 cursor-pointer"
                >
                    <RefreshCw size={14} /> Try Again
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-emerald-800 via-teal-800 to-slate-900 rounded-2xl p-4 sm:p-6 text-white shadow-xl relative overflow-hidden">
                <div className="absolute -right-10 -bottom-10 opacity-15 pointer-events-none">
                    <HandCoins size={240} />
                </div>

                <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-medium text-emerald-100 border border-white/15">
                                <Wallet size={14} /> Employee Loan Portal
                            </div>
                            <button
                                type="button"
                                onClick={() => setHideFigures(v => !v)}
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs font-semibold backdrop-blur-md border border-white/20 transition-all shadow-sm active:scale-95 cursor-pointer"
                                title={hideFigures ? 'Show figures' : 'Hide figures'}
                            >
                                {hideFigures ? <Eye size={12} className="text-white/90" /> : <EyeOff size={12} className="text-white/90" />}
                                <span>{hideFigures ? 'Show Figures' : 'Hide Figures'}</span>
                            </button>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
                            My Loans & Salary Deductions
                        </h1>
                        <p className="text-emerald-100 text-xs sm:text-sm max-w-xl">
                            Track your active loan balances, approved loan dates, installment schedules, and monthly payroll deductions.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 shrink-0">
                        <button
                            onClick={() => navigate('/my-requests', { state: { openNew: true } })}
                            className="px-5 py-3 rounded-2xl bg-white text-emerald-800 hover:bg-emerald-50 transition-all font-bold text-xs shadow-lg flex items-center gap-2 group cursor-pointer"
                        >
                            <PlusCircle size={16} className="text-emerald-600 group-hover:scale-110 transition-transform" />
                            Apply for Loan
                        </button>
                    </div>
                </div>
            </div>

            {/* Loan Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Remaining Loan Balance</span>
                        <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <Banknote size={18} />
                        </div>
                    </div>
                    <div className="mt-3">
                        <div className="text-2xl font-black text-emerald-700">{fmtPKR(loanData?.summary.remainingBalance || 0)}</div>
                        <p className="text-[11px] text-slate-500 mt-1 font-medium">Outstanding to be repaid</p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Monthly Installment</span>
                        <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                            <Clock size={18} />
                        </div>
                    </div>
                    <div className="mt-3">
                        <div className="text-2xl font-black text-indigo-700">{fmtPKR(loanData?.summary.monthlyInstallment || 0)}</div>
                        <p className="text-[11px] text-slate-500 mt-1 font-medium">Deducted from monthly payroll</p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Loan Granted</span>
                        <div className="w-9 h-9 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center">
                            <Wallet size={18} />
                        </div>
                    </div>
                    <div className="mt-3">
                        <div className="text-2xl font-black text-slate-900">{fmtPKR(loanData?.summary.totalDisbursed || 0)}</div>
                        <p className="text-[11px] text-slate-500 mt-1 font-medium">Accumulated loans approved</p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Loan Repaid</span>
                        <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                            <CheckCircle2 size={18} />
                        </div>
                    </div>
                    <div className="mt-3">
                        <div className="text-2xl font-black text-amber-700">{fmtPKR(totalRepaidAmount)}</div>
                        <p className="text-[11px] text-slate-500 mt-1 font-medium">{(loanData?.repayments || []).length} monthly deductions</p>
                    </div>
                </div>
            </div>

            {/* Individual Approved Loans Breakdown */}
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">Approved Loans Breakdown</h2>
                        <p className="text-xs text-slate-500 mt-0.5">Details of each loan granted, approval dates, installments, and remaining amounts.</p>
                    </div>
                    <span className="px-3 py-1 bg-slate-100 rounded-full text-xs font-bold text-slate-700">
                        {loanData?.loans.length || 0} Loans
                    </span>
                </div>

                {(!loanData || loanData.loans.length === 0) ? (
                    <div className="p-10 text-center space-y-3 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        <HandCoins size={36} className="mx-auto text-slate-300" />
                        <p className="text-sm font-semibold text-slate-700">No company loans found</p>
                        <p className="text-xs text-slate-400 max-w-sm mx-auto">
                            You currently do not have any active or past company loans. You can submit a new loan application anytime.
                        </p>
                        <button
                            onClick={() => navigate('/my-requests', { state: { openNew: true } })}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer mt-2"
                        >
                            Apply Now <ArrowRight size={13} />
                        </button>
                    </div>
                ) : (
                    <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="bg-slate-50 text-[11px] font-bold text-slate-400 uppercase border-b border-slate-100">
                                    <th className="px-5 py-3">Date Approved</th>
                                    <th className="px-5 py-3">Category / Reference</th>
                                    <th className="px-5 py-3 text-right">Loan Amount</th>
                                    <th className="px-5 py-3 text-right">Monthly Installment</th>
                                    <th className="px-5 py-3 text-right">Remaining Balance</th>
                                    <th className="px-5 py-3 text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loanData.loans.map((loan, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                                        <td className="px-5 py-3.5 font-medium text-slate-800 flex items-center gap-1.5">
                                            <Calendar size={13} className="text-slate-400" />
                                            {fmtDate(loan.issueDate)}
                                        </td>
                                        <td className="px-5 py-3.5 text-slate-600">
                                            <p className="font-bold text-slate-800">{getLoanTitle(loan)}</p>
                                            <p className="text-[11px] text-slate-400 font-medium">{getLoanSubtitle(loan)}</p>
                                        </td>
                                        <td className="px-5 py-3.5 text-right font-bold text-slate-900">{fmtPKR(loan.totalAmount)}</td>
                                        <td className="px-5 py-3.5 text-right font-medium text-slate-700">{fmtPKR(loan.monthlyInstallment)}</td>
                                        <td className="px-5 py-3.5 text-right font-black text-emerald-700">{fmtPKR(loan.remainingAmount)}</td>
                                        <td className="px-5 py-3.5 text-center">
                                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                                                loan.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                                loan.status === 'Paid' ? 'bg-slate-100 text-slate-600' :
                                                'bg-rose-50 text-rose-700'
                                            }`}>
                                                {loan.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Monthly Salary Deductions / Repayments Ledger */}
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">Loan Repayment History</h2>
                        <p className="text-xs text-slate-500 mt-0.5">Record of each month's loan repayment deducted automatically from your salary.</p>
                    </div>
                    <span className="px-3 py-1 bg-slate-100 rounded-full text-xs font-bold text-slate-700">
                        {loanData?.repayments.length || 0} Deductions
                    </span>
                </div>

                {(!loanData || loanData.repayments.length === 0) ? (
                    <div className="p-10 text-center space-y-2 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        <History size={32} className="mx-auto text-slate-300" />
                        <p className="text-sm font-semibold text-slate-600">No salary deductions recorded yet</p>
                        <p className="text-xs text-slate-400 max-w-sm mx-auto">
                            Loan installments are automatically logged here when monthly payrolls are finalized.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="bg-slate-50 text-[11px] font-bold text-slate-400 uppercase border-b border-slate-100">
                                    <th className="px-5 py-3">Payroll Month</th>
                                    <th className="px-5 py-3">Payslip Reference</th>
                                    <th className="px-5 py-3">Deduction Date</th>
                                    <th className="px-5 py-3 text-right">Amount Cut from Salary</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loanData.repayments.map((rep, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                                        <td className="px-5 py-3.5 font-bold text-slate-800">
                                            {MONTH_NAMES[rep.periodMonth] || rep.periodMonth} {rep.periodYear}
                                        </td>
                                        <td className="px-5 py-3.5 font-mono text-slate-600">
                                            {rep.payslipNo || `#${rep.payslipId.slice(-6)}`}
                                        </td>
                                        <td className="px-5 py-3.5 text-slate-600">
                                            {fmtDate(rep.date)}
                                        </td>
                                        <td className="px-5 py-3.5 text-right font-black text-rose-600">
                                            - {fmtPKR(rep.amount)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
