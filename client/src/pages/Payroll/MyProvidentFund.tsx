import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import {
    PiggyBank, Search, Download,
    BadgeCheck, Clock, CheckCircle2, FileText,
    ArrowUpRight, ArrowDownLeft, Wallet, AlertCircle,
    Eye, EyeOff, Banknote, History, Calendar, PlusCircle,
    Scale, Handshake, ShieldCheck, PenTool, RotateCcw, X,
    ExternalLink, Loader2, BookOpen, Check
} from 'lucide-react';

interface PFEntry {
    amount: number;
    type: 'credit' | 'debit';
    source: 'manual' | 'payroll';
    date: string;
    description: string;
    periodMonth?: number;
    periodYear?: number;
    erpReferenceId?: string;
}

interface MyPFData {
    employeeId: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    designation?: string;
    department?: string;
    joiningDate?: string;
    monthsOfService: number;
    maturityDate?: string;
    providentFundBalance: number;
    providentFundHistory: PFEntry[];
    pfClaimed: boolean;
    pfClaimedAt?: string;
    isMatured: boolean;
    maturityThresholdMonths: number;
    musharakahAgreement?: {
        enrolled: boolean;
        enrolledAt?: string;
        optedOutAt?: string;
        signatureData?: string;
        acknowledgedTerms?: boolean;
        agreementVersion?: string;
    };
}

interface IndividualLoanItem {
    loanId: string;
    totalAmount: number;
    remainingAmount: number;
    monthlyInstallment: number;
    status: 'Active' | 'Paid' | 'Cancelled';
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

const fmtMonths = (totalMonths: number) => {
    const yrs = Math.floor(totalMonths / 12);
    const mos = totalMonths % 12;
    const parts = [];
    if (yrs > 0) parts.push(`${yrs} ${yrs === 1 ? 'year' : 'years'}`);
    if (mos > 0 || yrs === 0) parts.push(`${mos} ${mos === 1 ? 'month' : 'months'}`);
    return parts.join(' ');
};

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

export default function MyProvidentFund() {
    const navigate = useNavigate();
    const [activeView, setActiveView] = useState<'pf' | 'loans'>('pf');
    const [data, setData] = useState<MyPFData | null>(null);
    const [loanData, setLoanData] = useState<MyLoanData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'credit' | 'debit'>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 10;

    const [hideFigures, setHideFigures] = useState(true);

    // Musharakah Agreement States
    const [showOptInModal, setShowOptInModal] = useState(false);
    const [showOptOutModal, setShowOptOutModal] = useState(false);
    const [showAgreementRecordModal, setShowAgreementRecordModal] = useState(false);
    const [musharakahSubmitting, setMusharakahSubmitting] = useState(false);
    const [musharakahFeedback, setMusharakahFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Opt-In Modal Form States
    const [agreedCheckbox, setAgreedCheckbox] = useState(false);
    const [signatureType, setSignatureType] = useState<'draw' | 'type'>('draw');
    const [typedSignature, setTypedSignature] = useState('');
    const [hasDrawnSignature, setHasDrawnSignature] = useState(false);
    const [isDrawing, setIsDrawing] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    const isEnrolledInMusharakah = Boolean(data?.musharakahAgreement?.enrolled);

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const x = clientX - rect.left;
        const y = clientY - rect.top;

        ctx.beginPath();
        ctx.moveTo(x, y);
        setIsDrawing(true);
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const x = clientX - rect.left;
        const y = clientY - rect.top;

        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#0f172a';
        ctx.lineTo(x, y);
        ctx.stroke();
        setHasDrawnSignature(true);
    };

    const stopDrawing = () => {
        setIsDrawing(false);
    };

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHasDrawnSignature(false);
        setTypedSignature('');
    };

    const handleTypedSignatureChange = (val: string) => {
        setTypedSignature(val);
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (val.trim()) {
            ctx.font = 'italic 32px "Brush Script MT", "Segoe Script", "Dancing Script", cursive, serif';
            ctx.fillStyle = '#0f172a';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(val.trim(), canvas.width / 2, canvas.height / 2);
            setHasDrawnSignature(true);
        } else {
            setHasDrawnSignature(false);
        }
    };

    const getSignatureData = (): string => {
        const canvas = canvasRef.current;
        if (!canvas) return '';
        if (signatureType === 'type' && typedSignature.trim()) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.font = 'italic 32px "Brush Script MT", "Segoe Script", "Dancing Script", cursive, serif';
                ctx.fillStyle = '#0f172a';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(typedSignature.trim(), canvas.width / 2, canvas.height / 2);
            }
        }
        return canvas.toDataURL('image/png');
    };

    const handleToggleClick = () => {
        if (isEnrolledInMusharakah) {
            setShowOptOutModal(true);
        } else {
            setAgreedCheckbox(false);
            setHasDrawnSignature(false);
            setSignatureType('draw');
            setTypedSignature(`${data?.firstName || ''} ${data?.lastName || ''}`.trim());
            setShowOptInModal(true);
            setTimeout(() => {
                clearCanvas();
            }, 100);
        }
    };

    const handleOptInSubmit = async () => {
        if (!agreedCheckbox || !hasDrawnSignature) return;
        const sig = getSignatureData();
        if (!sig) return;

        setMusharakahSubmitting(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.baseURL}/api/employees/my-pf/musharakah/opt-in`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    acknowledgedTerms: true,
                    signatureData: sig
                })
            });

            const body = await res.json();
            if (res.ok) {
                setData(prev => prev ? { ...prev, musharakahAgreement: body.musharakahAgreement } : null);
                setShowOptInModal(false);
                setMusharakahFeedback({
                    type: 'success',
                    message: 'Successfully enrolled into Musharakah Profit/Loss Sharing agreement.'
                });
                setTimeout(() => setMusharakahFeedback(null), 6000);
            } else {
                alert(body.message || 'Failed to opt in to Musharakah agreement.');
            }
        } catch {
            alert('A network error occurred while submitting your agreement.');
        } finally {
            setMusharakahSubmitting(false);
        }
    };

    const handleOptOutSubmit = async () => {
        setMusharakahSubmitting(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.baseURL}/api/employees/my-pf/musharakah/opt-out`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const body = await res.json();
            if (res.ok) {
                setData(prev => prev ? { ...prev, musharakahAgreement: body.musharakahAgreement } : null);
                setShowOptOutModal(false);
                setMusharakahFeedback({
                    type: 'success',
                    message: 'You have opted out of Musharakah. Your PF balance has reverted to standard capital-protected status.'
                });
                setTimeout(() => setMusharakahFeedback(null), 6000);
            } else {
                alert(body.message || 'Failed to opt out of Musharakah agreement.');
            }
        } catch {
            alert('A network error occurred while processing opt-out.');
        } finally {
            setMusharakahSubmitting(false);
        }
    };

    const fmtPKR = (n: number) => {
        if (hideFigures) return '••••••••';
        return `Rs. ${(n || 0).toLocaleString('en-PK')}`;
    };

    useEffect(() => {
        setCurrentPage(1);
    }, [search, filterType]);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('token');
            const [pfRes, loanRes] = await Promise.all([
                fetch(`${api.baseURL}/api/employees/my-pf`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }),
                fetch(`${api.baseURL}/api/employees/my-loans`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }).catch(() => null)
            ]);

            if (pfRes.ok) {
                const body = await pfRes.json();
                setData(body);
            } else {
                const body = await pfRes.json().catch(() => ({}));
                setError(body.message || 'Failed to load Provident Fund data.');
            }

            if (loanRes && loanRes.ok) {
                const loanBody = await loanRes.json();
                setLoanData(loanBody);
            }
        } catch {
            setError('Network error occurred while fetching Provident Fund details.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleDownloadPDF = () => {
        if (!data) return;
        const token = localStorage.getItem('token');
        window.open(`${api.baseURL}/api/employees/${data.employeeId}/pf-statement-pdf?token=${token}`, '_blank');
    };

    if (loading) {
        return (
            <div className="min-h-[600px] flex items-center justify-center p-6">
                <div className="text-center space-y-3">
                    <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p className="text-sm font-semibold text-slate-600">Loading your Financial Statement...</p>
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="p-8 max-w-3xl mx-auto">
                <div className="bg-rose-50 border border-rose-200 rounded-3xl p-8 text-center space-y-4 shadow-sm">
                    <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                        <AlertCircle size={24} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800">Account Not Found</h3>
                    <p className="text-sm text-slate-600 max-w-md mx-auto">
                        {error || 'No employee record is linked to your user account. Please contact your HR department for assistance.'}
                    </p>
                    <button
                        onClick={loadData}
                        className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-all"
                    >
                        Retry Loading
                    </button>
                </div>
            </div>
        );
    }

    const history = data.providentFundHistory || [];
    const manualCredits = history.reduce((sum, e) => e.type === 'credit' && e.source === 'manual' ? sum + e.amount : sum, 0);
    const payrollCredits = history.reduce((sum, e) => e.type === 'credit' && e.source === 'payroll' ? sum + e.amount : sum, 0);
    const totalDebits = history.reduce((sum, e) => e.type === 'debit' ? sum + e.amount : sum, 0);
    const historyNet = (manualCredits + payrollCredits) - totalDebits;
    const untrackedOpening = Math.max(0, (data.providentFundBalance || 0) - historyNet);
    const previousBalance = manualCredits + untrackedOpening;

    const monthsLeft = data.maturityDate
        ? Math.max(0, (new Date(data.maturityDate).getFullYear() - new Date().getFullYear()) * 12
            + (new Date(data.maturityDate).getMonth() - new Date().getMonth()))
        : data.maturityThresholdMonths;

    const filteredHistory = history.filter(entry => {
        const matchesSearch =
            entry.description.toLowerCase().includes(search.toLowerCase()) ||
            (entry.erpReferenceId && entry.erpReferenceId.toLowerCase().includes(search.toLowerCase())) ||
            (entry.periodMonth && MONTH_NAMES[entry.periodMonth].toLowerCase().includes(search.toLowerCase())) ||
            (entry.periodYear && entry.periodYear.toString().includes(search));

        const matchesType =
            filterType === 'all' ? true : entry.type === filterType;

        return matchesSearch && matchesType;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const paginatedHistory = filteredHistory.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const totalRepaidAmount = (loanData?.repayments || []).reduce((s, r) => s + r.amount, 0);

    return (
        <div className="space-y-6 animate-fadeIn">
            
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-purple-700 rounded-2xl p-4 sm:p-6 text-white shadow-xl relative overflow-hidden">
                <div className="absolute -right-10 -bottom-10 opacity-15 pointer-events-none">
                    <PiggyBank size={240} />
                </div>

                <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-medium text-indigo-100 border border-white/15">
                                <Wallet size={14} /> My Employee Portal
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
                            {activeView === 'pf' ? 'My Provident Fund Statement' : 'My Loans & Salary Deductions'}
                        </h1>
                        <p className="text-indigo-100 text-xs sm:text-sm max-w-xl">
                            {activeView === 'pf'
                                ? 'Track your monthly payroll contributions, fund growth, maturity status, and official ledger.'
                                : 'View your active loan balances, approved loan dates, and monthly payroll repayment deductions.'}
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 shrink-0">
                        {activeView === 'pf' && (
                            <button
                                onClick={handleDownloadPDF}
                                className="px-5 py-3 rounded-2xl bg-white text-indigo-700 hover:bg-indigo-50 transition-all font-bold text-xs shadow-lg flex items-center gap-2 group"
                            >
                                <Download size={16} className="group-hover:translate-y-0.5 transition-transform" />
                                Download Statement
                            </button>
                        )}

                        <button
                            onClick={() => navigate('/my-requests', { state: { openNew: true } })}
                            className="px-5 py-3 rounded-2xl bg-white/15 hover:bg-white/25 text-white transition-all font-bold text-xs border border-white/20 flex items-center gap-2"
                        >
                            <PlusCircle size={16} />
                            Request New Loan
                        </button>
                    </div>
                </div>
            </div>

            {/* View Selector Tabs */}
            <div className="flex bg-slate-100 p-1.5 rounded-2xl w-fit gap-1 text-xs font-bold shadow-inner">
                <button
                    type="button"
                    onClick={() => setActiveView('pf')}
                    className={`px-5 py-2.5 rounded-xl transition-all flex items-center gap-2 ${
                        activeView === 'pf'
                            ? 'bg-white text-indigo-700 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                    <PiggyBank size={16} /> Provident Fund Ledger
                </button>
                <button
                    type="button"
                    onClick={() => setActiveView('loans')}
                    className={`px-5 py-2.5 rounded-xl transition-all flex items-center gap-2 relative ${
                        activeView === 'loans'
                            ? 'bg-white text-emerald-700 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                    <Banknote size={16} /> My Loans & Deductions
                    {loanData && loanData.summary.remainingBalance > 0 && (
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    )}
                </button>
            </div>

            {activeView === 'loans' ? (
                /* My Loans & Repayment View */
                <div className="space-y-6 animate-fadeIn">
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
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Monthly Salary Cut</span>
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
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Salary Repaid</span>
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
                            <div className="p-10 text-center space-y-2 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                <Banknote size={32} className="mx-auto text-slate-300" />
                                <p className="text-sm font-semibold text-slate-600">No loan records found</p>
                                <p className="text-xs text-slate-400">You do not have any active or past company loans.</p>
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
                                                    <p className="font-bold text-slate-800">{loan.category || 'Loan'}</p>
                                                    <p className="text-[11px] text-slate-400">{loan.notes || loan.loanId}</p>
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
                                <h2 className="text-lg font-bold text-slate-900">Salary Repayment History</h2>
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
            ) : (
                /* Original Provident Fund View */
                <div className="space-y-6 animate-fadeIn">
                    {/* Maturity Status Alert */}
                    {data.pfClaimed ? (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 sm:p-5 flex items-center gap-4 text-emerald-900 shadow-sm">
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                                <CheckCircle2 size={22} />
                            </div>
                            <div className="text-xs sm:text-sm">
                                <span className="font-bold">Fund Disbursed / Claimed: </span>
                                Your Provident Fund has been fully claimed and disbursed on {fmtDate(data.pfClaimedAt)}.
                            </div>
                        </div>
                    ) : data.isMatured ? (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 sm:p-5 flex items-center gap-4 text-emerald-900 shadow-sm">
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                                <BadgeCheck size={22} />
                            </div>
                            <div className="text-xs sm:text-sm">
                                <span className="font-bold">Fund Fully Matured! </span>
                                You have completed {data.monthsOfService} months of continuous service (Threshold: {data.maturityThresholdMonths} months). Your full Provident Fund balance is eligible for payout upon request.
                            </div>
                        </div>
                    ) : (
                        <div className="bg-indigo-50/80 border border-indigo-100 rounded-2xl p-4 sm:p-5 flex items-center gap-4 text-indigo-900 shadow-sm">
                            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                                <Clock size={22} />
                            </div>
                            <div className="text-xs sm:text-sm space-y-0.5">
                                <div className="font-bold">Fund Maturing Progress</div>
                                <div className="text-indigo-700">
                                    Service tenure: <span className="font-semibold">{fmtMonths(data.monthsOfService)}</span>.
                                    {data.maturityDate ? (
                                        <> Estimated maturity date: <span className="font-semibold">{fmtDate(data.maturityDate)}</span> ({monthsLeft} months remaining).</>
                                    ) : (
                                        <> Full maturity requires {data.maturityThresholdMonths} months of service.</>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Musharakah Feedback Toast */}
                    {musharakahFeedback && (
                        <div className={`p-4 rounded-2xl flex items-center justify-between gap-3 text-xs sm:text-sm font-semibold shadow-sm transition-all animate-fadeIn ${
                            musharakahFeedback.type === 'success' 
                                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' 
                                : 'bg-rose-50 border border-rose-200 text-rose-800'
                        }`}>
                            <div className="flex items-center gap-2">
                                <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                                <span>{musharakahFeedback.message}</span>
                            </div>
                            <button onClick={() => setMusharakahFeedback(null)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
                                <X size={14} />
                            </button>
                        </div>
                    )}

                    {/* Musharakah Profit/Loss Sharing Scheme Card */}
                    <div className={`rounded-2xl p-5 sm:p-6 border transition-all shadow-sm ${
                        isEnrolledInMusharakah
                            ? 'bg-gradient-to-r from-emerald-950/5 via-teal-900/5 to-emerald-900/10 border-emerald-300'
                            : 'bg-white border-slate-200/80 hover:border-slate-300'
                    }`}>
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="space-y-2 max-w-2xl">
                                <div className="flex flex-wrap items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 shadow-xs">
                                        <Handshake size={18} />
                                    </div>
                                    <h3 className="text-base sm:text-lg font-bold text-slate-900">
                                        Musharakah Profit/Loss Sharing Agreement
                                    </h3>
                                    {isEnrolledInMusharakah ? (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                            <BadgeCheck size={13} className="text-emerald-600" /> Enrolled (Aqd Active)
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                            <ShieldCheck size={13} className="text-indigo-600" /> Capital-Protected (Qard / Wadiah)
                                        </span>
                                    )}
                                </div>

                                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                                    {isEnrolledInMusharakah
                                        ? `Your eligible Provident Fund balance is actively enrolled in profit/loss sharing under Shariah terms (Formally signed on ${fmtDate(data.musharakahAgreement?.enrolledAt)}). You may toggle off at any time to return to a capital-protected status.`
                                        : 'A Shariah-compliant partnership arrangement between your Provident Fund contribution and the Company’s operating capital. Your balance is currently held as a protected savings deposit.'}
                                </p>

                                <div className="flex flex-wrap items-center gap-4 pt-1 text-xs">
                                    <a
                                        href="/company-policy#provident-fund-musharakah"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                                    >
                                        <BookOpen size={13} /> Review Shariah Policy in HRM Manual <ExternalLink size={12} />
                                    </a>

                                    {isEnrolledInMusharakah && (
                                        <button
                                            type="button"
                                            onClick={() => setShowAgreementRecordModal(true)}
                                            className="inline-flex items-center gap-1.5 font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                                        >
                                            <FileText size={13} /> View Signed Contract Record
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Toggle Switch Component */}
                            <div className="flex items-center gap-3 self-start md:self-center shrink-0 bg-slate-50 border border-slate-200/80 px-4 py-3 rounded-2xl">
                                <div className="text-right">
                                    <div className="text-xs font-bold text-slate-800">
                                        {isEnrolledInMusharakah ? 'Opted In' : 'Opted Out'}
                                    </div>
                                    <div className="text-[11px] text-slate-500 font-medium">
                                        {isEnrolledInMusharakah ? 'Musharakah Active' : 'Protected Deposit'}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={isEnrolledInMusharakah}
                                    onClick={handleToggleClick}
                                    className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                                        isEnrolledInMusharakah ? 'bg-emerald-600' : 'bg-slate-300'
                                    }`}
                                >
                                    <span className="sr-only">Toggle Musharakah Profit/Loss Sharing</span>
                                    <span
                                        aria-hidden="true"
                                        className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                                            isEnrolledInMusharakah ? 'translate-x-7' : 'translate-x-0'
                                        }`}
                                    />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* 4 Summary Cards Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Card 1: Current Balance */}
                        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Current PF Balance</span>
                        <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                            <PiggyBank size={18} />
                        </div>
                    </div>
                    <div className="mt-3">
                        <div className="text-2xl font-black text-slate-900">{fmtPKR(data.providentFundBalance)}</div>
                        <p className="text-[11px] text-slate-500 mt-1 font-medium">Accumulated fund value</p>
                    </div>
                </div>

                {/* Card 2: Previous PF Balance */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Previous PF Balance</span>
                        <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                            <Wallet size={18} />
                        </div>
                    </div>
                    <div className="mt-3">
                        <div className="text-2xl font-black text-amber-700">{fmtPKR(previousBalance)}</div>
                        <p className="text-[11px] text-slate-500 mt-1 font-medium">Opening balance</p>
                    </div>
                </div>

                {/* Card 3: Payroll Contributions */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Payroll Contributions</span>
                        <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <ArrowUpRight size={18} />
                        </div>
                    </div>
                    <div className="mt-3">
                        <div className="text-2xl font-black text-emerald-600">{fmtPKR(payrollCredits)}</div>
                        <p className="text-[11px] text-slate-500 mt-1 font-medium">{history.filter(h => h.source === 'payroll' && h.type === 'credit').length} credit transactions</p>
                    </div>
                </div>

                {/* Card 4: Total Withdrawals */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Withdrawals</span>
                        <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                            <ArrowDownLeft size={18} />
                        </div>
                    </div>
                    <div className="mt-3">
                        <div className="text-2xl font-black text-rose-600">{fmtPKR(totalDebits)}</div>
                        <p className="text-[11px] text-slate-500 mt-1 font-medium">{history.filter(h => h.type === 'debit').length} debit transactions</p>
                    </div>
                </div>
            </div>

            {/* Statement Ledger Section */}
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
                
                {/* Section Header & Filters */}
                <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">Transaction History & Ledger</h2>
                        <p className="text-xs text-slate-500 mt-0.5">Comprehensive history of monthly payroll deductions and fund adjustments.</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                        
                        {/* Search Input */}
                        <div className="relative flex-1 md:w-64">
                            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search ledger entries..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-100 outline-none bg-slate-50/50 focus:bg-white transition-all"
                            />
                        </div>

                        {/* Type Filter */}
                        <select
                            value={filterType}
                            onChange={e => setFilterType(e.target.value as 'all' | 'credit' | 'debit')}
                            className="px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-100 outline-none bg-slate-50/50 font-medium text-slate-700"
                        >
                            <option value="all">All Types</option>
                            <option value="credit">Credits Only (+)</option>
                            <option value="debit">Debits Only (-)</option>
                        </select>
                    </div>
                </div>

                {/* Ledger Table */}
                <div className="overflow-x-auto">
                    {filteredHistory.length === 0 ? (
                        <div className="p-12 text-center space-y-3">
                            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                                <FileText size={22} />
                            </div>
                            <h4 className="text-sm font-bold text-slate-700">No Ledger Entries Found</h4>
                            <p className="text-xs text-slate-500 max-w-sm mx-auto">
                                {search || filterType !== 'all'
                                    ? 'No transactions match your search filter criteria.'
                                    : 'Your Provident Fund transaction history will appear here once payroll processing completes.'}
                            </p>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/80 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                                    <th className="px-6 py-3.5">Date & Period</th>
                                    <th className="px-6 py-3.5">Type & Source</th>
                                    <th className="px-6 py-3.5">Description</th>
                                    <th className="px-6 py-3.5">ERP Ref</th>
                                    <th className="px-6 py-3.5 text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs">
                                {paginatedHistory.map((entry, idx) => {
                                    const isCredit = entry.type === 'credit';
                                    const periodStr = entry.periodMonth && entry.periodYear
                                        ? `${MONTH_NAMES[entry.periodMonth]} ${entry.periodYear}`
                                        : null;

                                    return (
                                        <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                                            
                                            {/* Date & Period */}
                                            <td className="px-6 py-4 font-medium text-slate-800">
                                                <div>{fmtDate(entry.date)}</div>
                                                {periodStr && (
                                                    <div className="text-[10px] font-semibold text-indigo-600 mt-0.5">
                                                        Period: {periodStr}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Type & Source */}
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide flex items-center gap-1 ${
                                                        isCredit
                                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                                                            : 'bg-rose-50 text-rose-700 border border-rose-200/60'
                                                    }`}>
                                                        {isCredit ? <ArrowUpRight size={12} /> : <ArrowDownLeft size={12} />}
                                                        {isCredit ? 'CREDIT' : 'DEBIT'}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 font-semibold uppercase">
                                                        ({entry.source || 'payroll'})
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Description */}
                                            <td className="px-6 py-4 text-slate-700 max-w-xs font-medium truncate">
                                                {entry.description || 'Monthly Provident Fund Contribution'}
                                            </td>

                                            {/* ERP Ref */}
                                            <td className="px-6 py-4 font-mono text-[11px] text-slate-500">
                                                {entry.erpReferenceId ? (
                                                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                                                        {entry.erpReferenceId}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-300">-</span>
                                                )}
                                            </td>

                                            {/* Amount */}
                                            <td className={`px-6 py-4 text-right font-black text-sm ${
                                                isCredit ? 'text-emerald-600' : 'text-rose-600'
                                            }`}>
                                                {isCredit ? '+' : '-'}{fmtPKR(entry.amount)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {filteredHistory.length > pageSize && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-white border-t border-slate-100">
                        <div className="text-xs text-slate-500 font-medium">
                            Showing <span className="font-bold text-slate-700">{(currentPage - 1) * pageSize + 1}</span> to{' '}
                            <span className="font-bold text-slate-700">{Math.min(currentPage * pageSize, filteredHistory.length)}</span> of{' '}
                            <span className="font-bold text-slate-700">{filteredHistory.length}</span> entries
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                Previous
                            </button>
                            {Array.from({ length: Math.ceil(filteredHistory.length / pageSize) }, (_, i) => i + 1)
                                .filter(p => p === 1 || p === Math.ceil(filteredHistory.length / pageSize) || Math.abs(p - currentPage) <= 1)
                                .reduce((acc: (number | string)[], page, index, array) => {
                                    if (index > 0 && page - (array[index - 1] as number) > 1) {
                                        acc.push('...');
                                    }
                                    acc.push(page);
                                    return acc;
                                }, [])
                                .map((item, idx) =>
                                    typeof item === 'number' ? (
                                        <button
                                            key={idx}
                                            onClick={() => setCurrentPage(item)}
                                            className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                                                currentPage === item
                                                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/30'
                                                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                                            }`}
                                        >
                                            {item}
                                        </button>
                                    ) : (
                                        <span key={idx} className="px-1 text-slate-400 text-xs">...</span>
                                    )
                                )}
                            <button
                                onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredHistory.length / pageSize), p + 1))}
                                disabled={currentPage === Math.ceil(filteredHistory.length / pageSize)}
                                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}

                {/* Footer summary bar */}
                <div className="p-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
                    <span>Showing {filteredHistory.length} of {history.length} transactions</span>
                    <span>Calculated Balance: <strong className="text-slate-900 font-bold">{fmtPKR(data.providentFundBalance)}</strong></span>
                </div>

            </div>
            </div>
            )}

            {/* MODAL 1: Musharakah Opt-In Agreement Modal */}
            {showOptInModal && createPortal(
                <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-slate-900/75 backdrop-blur-sm overflow-y-auto animate-fadeIn">
                    <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden my-auto relative max-h-[92vh] flex flex-col">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-emerald-800 via-teal-800 to-emerald-900 text-white p-5 sm:p-6 flex items-start justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
                                    <Scale size={22} className="text-emerald-300" />
                                </div>
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Shariah Agreement</div>
                                    <h3 className="text-lg sm:text-xl font-black">Musharakah Profit/Loss Sharing</h3>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowOptInModal(false)}
                                className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
                            {/* Required Verbatim Shariah Disclosure */}
                            <div className="bg-amber-50 border-2 border-amber-300/80 rounded-2xl p-4 sm:p-5 text-amber-950 shadow-xs">
                                <div className="flex items-center gap-2 font-bold text-amber-900 text-sm mb-1.5">
                                    <AlertCircle size={18} className="text-amber-600 shrink-0" />
                                    <span>Mandatory Disclosure</span>
                                </div>
                                <blockquote className="text-xs sm:text-sm font-semibold leading-relaxed italic text-amber-900 pl-3 border-l-3 border-amber-500">
                                    “Opting in converts (a defined portion of) your PF balance from a protected savings deposit into a risk-bearing capital contribution. Read the details of the policy in the Company’s HRM Policy Manual before accepting.”
                                </blockquote>
                            </div>

                            {/* Shariah Key Points Summary */}
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 text-xs text-slate-700">
                                <div className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                                    <BookOpen size={14} className="text-indigo-600" /> Contract Fundamentals (Aqd Formation)
                                </div>
                                <ul className="list-disc list-inside space-y-1 text-slate-600 leading-relaxed">
                                    <li><b>Offer & Acceptance (Aqd):</b> Your submission constitutes employee offer (<i>Ijab</i>); activation by ITCS constitutes acceptance (<i>Qabul</i>).</li>
                                    <li><b>Capital at Risk:</b> In a loss year, losses are borne against your enrolled Musharakah capital. ITCS does not claim losses beyond your enrolled capital contribution.</li>
                                    <li><b>Protected Balance:</b> Any PF funds not opted into the scheme continue to be held on a capital-protected basis (Qard/Wadiah).</li>
                                    <li><b>Eligibility:</b> Requires matured funds plus a minimum 1-year post-maturity holding period for profit/loss calculation.</li>
                                </ul>
                                <div className="pt-1">
                                    <a
                                        href="/company-policy#provident-fund-musharakah"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1"
                                    >
                                        Read full 5-section policy in Company Manual <ExternalLink size={11} />
                                    </a>
                                </div>
                            </div>

                            {/* Requirement 1: Checkbox Consent */}
                            <div className="space-y-2">
                                <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-200 hover:bg-emerald-50 transition-colors cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={agreedCheckbox}
                                        onChange={e => setAgreedCheckbox(e.target.checked)}
                                        className="mt-0.5 w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                                    />
                                    <span className="text-xs font-semibold text-emerald-950 leading-relaxed">
                                        I confirm that I have read and understood the disclosure and relevant policy in the Company HRM Policy Manual, and formally offer (<i>Ijab</i>) to enter the Musharakah agreement.
                                    </span>
                                </label>
                            </div>

                            {/* Requirement 2: Digital Signature Pad */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs uppercase tracking-wider">
                                        <PenTool size={14} className="text-emerald-700" /> Digital Signature (Aqd Formalization)
                                    </div>
                                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                                        <button
                                            type="button"
                                            onClick={() => { setSignatureType('draw'); clearCanvas(); }}
                                            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                                                signatureType === 'draw' ? 'bg-white shadow-xs text-emerald-800' : 'text-slate-600 hover:text-slate-900'
                                            }`}
                                        >
                                            Draw Signature
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setSignatureType('type'); handleTypedSignatureChange(typedSignature || `${data.firstName} ${data.lastName}`); }}
                                            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                                                signatureType === 'type' ? 'bg-white shadow-xs text-emerald-800' : 'text-slate-600 hover:text-slate-900'
                                            }`}
                                        >
                                            Type Name
                                        </button>
                                    </div>
                                </div>

                                {signatureType === 'type' ? (
                                    <div className="space-y-2">
                                        <input
                                            type="text"
                                            value={typedSignature}
                                            onChange={e => handleTypedSignatureChange(e.target.value)}
                                            placeholder="Type your full legal name"
                                            className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                                        />
                                        <p className="text-[11px] text-slate-500">Preview of your digital signature script:</p>
                                    </div>
                                ) : (
                                    <p className="text-[11px] text-slate-500">Sign with your mouse or fingertip on the canvas below:</p>
                                )}

                                {/* Canvas drawing area */}
                                <div className="relative bg-white border border-slate-300 rounded-2xl overflow-hidden shadow-inner">
                                    <canvas
                                        ref={canvasRef}
                                        width={500}
                                        height={120}
                                        onMouseDown={startDrawing}
                                        onMouseMove={draw}
                                        onMouseUp={stopDrawing}
                                        onMouseLeave={stopDrawing}
                                        onTouchStart={startDrawing}
                                        onTouchMove={draw}
                                        onTouchEnd={stopDrawing}
                                        className="w-full h-[120px] cursor-crosshair touch-none bg-slate-50/50"
                                    />
                                    <div className="absolute bottom-2 left-4 pointer-events-none text-slate-400 text-xs font-mono select-none">
                                        ✕ Sign here
                                    </div>
                                    <button
                                        type="button"
                                        onClick={clearCanvas}
                                        className="absolute top-2 right-2 px-2 py-1 text-[11px] font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all flex items-center gap-1 shadow-xs cursor-pointer"
                                        title="Clear signature"
                                    >
                                        <RotateCcw size={11} /> Clear
                                    </button>
                                </div>

                                {/* Signature Status Badge */}
                                <div className="flex items-center justify-between text-xs">
                                    {hasDrawnSignature ? (
                                        <span className="text-emerald-700 font-bold flex items-center gap-1">
                                            <Check size={14} className="text-emerald-600" /> Digital signature captured
                                        </span>
                                    ) : (
                                        <span className="text-slate-400 font-medium">
                                            * Signature is required to meet Shariah Aqd criteria
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
                            <button
                                type="button"
                                onClick={() => setShowOptInModal(false)}
                                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 transition-colors cursor-pointer"
                            >
                                Cancel / Keep Protected
                            </button>
                            <button
                                type="button"
                                onClick={handleOptInSubmit}
                                disabled={!agreedCheckbox || !hasDrawnSignature || musharakahSubmitting}
                                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold shadow-md shadow-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2 cursor-pointer"
                            >
                                {musharakahSubmitting ? (
                                    <>
                                        <Loader2 size={14} className="animate-spin" /> Formalizing Aqd...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 size={14} /> I Accept (Enter Agreement)
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* MODAL 2: Musharakah Opt-Out Confirmation Modal */}
            {showOptOutModal && createPortal(
                <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-slate-900/75 backdrop-blur-sm overflow-y-auto animate-fadeIn">
                    <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 my-auto relative">
                        <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center">
                            <AlertCircle size={26} />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-lg font-bold text-slate-900">Opt Out of Musharakah Scheme?</h3>
                            <p className="text-xs text-slate-600 leading-relaxed">
                                Are you sure you want to withdraw from the Musharakah Profit/Loss Sharing scheme? Your Provident Fund balance will revert to a capital-protected savings status (structured under Qard/Wadiah per company policy) and will no longer participate in company profit/loss.
                            </p>
                        </div>
                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setShowOptOutModal(false)}
                                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 transition-colors cursor-pointer"
                            >
                                Keep Enrolled
                            </button>
                            <button
                                type="button"
                                onClick={handleOptOutSubmit}
                                disabled={musharakahSubmitting}
                                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                            >
                                {musharakahSubmitting ? <Loader2 size={13} className="animate-spin" /> : null}
                                Confirm Opt-Out
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* MODAL 3: View Signed Agreement Record */}
            {showAgreementRecordModal && data.musharakahAgreement && createPortal(
                <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-slate-900/75 backdrop-blur-sm overflow-y-auto animate-fadeIn">
                    <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden my-auto relative">
                        <div className="bg-gradient-to-r from-emerald-800 to-teal-800 text-white p-5 flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <Scale size={20} className="text-emerald-300" />
                                <h3 className="text-base font-bold">Musharakah Contract Record</h3>
                            </div>
                            <button
                                onClick={() => setShowAgreementRecordModal(false)}
                                className="text-white/70 hover:text-white p-1 cursor-pointer"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-5 space-y-4 text-xs text-slate-700">
                            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                                <div>
                                    <span className="text-slate-400 font-semibold block uppercase text-[10px]">Employee</span>
                                    <span className="font-bold text-slate-900">{data.firstName} {data.lastName}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 font-semibold block uppercase text-[10px]">Employee ID</span>
                                    <span className="font-bold text-slate-900">{data.employeeId}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 font-semibold block uppercase text-[10px]">Contract Formation</span>
                                    <span className="font-bold text-slate-900">{fmtDate(data.musharakahAgreement.enrolledAt)}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 font-semibold block uppercase text-[10px]">Shariah Status</span>
                                    <span className="font-bold text-emerald-700 flex items-center gap-1">
                                        <BadgeCheck size={13} /> Active Musharakah
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-1 bg-amber-50/80 border border-amber-200/80 rounded-xl p-3 text-[11px] text-amber-900 leading-relaxed italic">
                                “Opting in converts (a defined portion of) your PF balance from a protected savings deposit into a risk-bearing capital contribution. Read the details of the policy in the Company’s HRM Policy Manual before accepting.”
                            </div>

                            {data.musharakahAgreement.signatureData && (
                                <div className="space-y-1.5 pt-1">
                                    <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block">Captured Digital Signature</span>
                                    <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-center">
                                        <img
                                            src={data.musharakahAgreement.signatureData}
                                            alt="Employee Digital Signature"
                                            className="max-h-16 object-contain"
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="pt-2 flex justify-end">
                                <button
                                    onClick={() => setShowAgreementRecordModal(false)}
                                    className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
                                >
                                    Close Record
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

        </div>
    );
}
