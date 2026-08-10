import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import {
    PiggyBank, Search, Download,
    BadgeCheck, Clock, CheckCircle2, FileText,
    ArrowUpRight, ArrowDownLeft, Wallet, AlertCircle
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
}

const fmtPKR = (n: number) => `Rs. ${n.toLocaleString('en-PK')}`;
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
    const [data, setData] = useState<MyPFData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'credit' | 'debit'>('all');

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.baseURL}/api/employees/my-pf`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const body = await res.json();
                setData(body);
            } else {
                const body = await res.json();
                setError(body.message || 'Failed to load Provident Fund data.');
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
                    <p className="text-sm font-semibold text-slate-600">Loading your Provident Fund statement...</p>
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
                    <h3 className="text-lg font-bold text-slate-800">Provident Fund Account Not Found</h3>
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

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
            
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-purple-700 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
                <div className="absolute -right-10 -bottom-10 opacity-15 pointer-events-none">
                    <PiggyBank size={240} />
                </div>

                <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-medium text-indigo-100 border border-white/15">
                            <Wallet size={14} /> My Employee Portal
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-black tracking-tight">My Provident Fund Statement</h1>
                        <p className="text-indigo-100 text-xs sm:text-sm max-w-xl">
                            Track your monthly payroll contributions, fund growth, maturity status, and official ledger.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 shrink-0">
                        <button
                            onClick={handleDownloadPDF}
                            className="px-5 py-3 rounded-2xl bg-white text-indigo-700 hover:bg-indigo-50 transition-all font-bold text-xs shadow-lg flex items-center gap-2 group"
                        >
                            <Download size={16} className="group-hover:translate-y-0.5 transition-transform" />
                            Download PDF Statement
                        </button>

                        <button
                            onClick={() => navigate('/my-requests', { state: { openNew: true } })}
                            className="px-5 py-3 rounded-2xl bg-white/15 hover:bg-white/25 text-white transition-all font-bold text-xs border border-white/20 flex items-center gap-2"
                        >
                            <FileText size={16} />
                            Request Advance
                        </button>
                    </div>
                </div>
            </div>

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
                                {filteredHistory.map((entry, idx) => {
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

                {/* Footer summary bar */}
                <div className="p-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
                    <span>Showing {filteredHistory.length} of {history.length} transactions</span>
                    <span>Calculated Balance: <strong className="text-slate-900 font-bold">{fmtPKR(data.providentFundBalance)}</strong></span>
                </div>
            </div>

        </div>
    );
}
