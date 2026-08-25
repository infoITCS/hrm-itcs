import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { usePermissions } from '../../hooks/usePermissions';
import { api } from '../../utils/api';
import MyProvidentFund from './MyProvidentFund';
import SalaryPinModal from '../../components/UI/SalaryPinModal';
import { formatEmployeeFullName } from '../../utils/nameHelper';
import {
    Banknote, Search, ChevronDown, ChevronRight, CheckCircle2,
    Clock, XCircle, TrendingUp, Users, BadgeCheck,
    AlertTriangle, FileText, X, CalendarDays, User, Building2,
    Lock, Unlock
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

interface EmpPFData {
    employeeId: string;
    firstName: string;
    middleName?: string;
    lastName: string;
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
const fmtDate = (d: string | undefined) =>
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
const MONTH_SHORT = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Group history entries by year+month for the statement view
function groupByMonth(history: PFEntry[]) {
    const map: Record<string, { year: number; month: number; credits: number; debits: number; entries: PFEntry[] }> = {};
    for (const e of history) {
        const d = new Date(e.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!map[key]) map[key] = { year: d.getFullYear(), month: d.getMonth() + 1, credits: 0, debits: 0, entries: [] };
        if (e.type === 'credit') map[key].credits += e.amount;
        else map[key].debits += e.amount;
        map[key].entries.push(e);
    }
    return Object.values(map).sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month);
}

// Statement Modal
function StatementModal({ emp: initialEmp, isAdmin, onClose, onSuccess }: { emp: EmpPFData; isAdmin: boolean; onClose: () => void; onSuccess: () => void }) {
    const [emp, setEmp] = useState<EmpPFData>(initialEmp);
    const [showAdjustForm, setShowAdjustForm] = useState(false);
    const [amount, setAmount] = useState('');
    const [type, setType] = useState<'credit' | 'debit'>('credit');
    const [periodMonth, setPeriodMonth] = useState('');
    const [periodYear, setPeriodYear] = useState('');
    const [description, setDescription] = useState('');
    const [erpReferenceId, setErpReferenceId] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const history = emp.providentFundHistory || [];
    const months = groupByMonth(history);
    const manualCredits = history.reduce((s, e) => e.type === 'credit' && e.source === 'manual' ? s + e.amount : s, 0);
    const payrollCredits = history.reduce((s, e) => e.type === 'credit' && e.source === 'payroll' ? s + e.amount : s, 0);
    const totalDebits = history.reduce((s, e) => e.type === 'debit' ? s + e.amount : s, 0);
    const historyNet = (manualCredits + payrollCredits) - totalDebits;
    const untrackedOpening = Math.max(0, (emp.providentFundBalance || 0) - historyNet);
    const totalOpeningBalance = manualCredits + untrackedOpening;
    const totalCredits = totalOpeningBalance + payrollCredits;

    const monthsLeft = emp.maturityDate
        ? Math.max(0, (new Date(emp.maturityDate).getFullYear() - new Date().getFullYear()) * 12
            + (new Date(emp.maturityDate).getMonth() - new Date().getMonth()))
        : emp.maturityThresholdMonths;

    const handleDownloadPDF = () => {
        const token = localStorage.getItem('token');
        window.open(`${api.baseURL}/api/employees/${emp.employeeId}/pf-statement-pdf?token=${token}`, '_blank');
    };

    const handleAdjustSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
            setErrorMsg('Please enter a valid positive amount.');
            return;
        }
        if (!description.trim()) {
            setErrorMsg('Please enter a description.');
            return;
        }

        setSubmitting(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.baseURL}/api/employees/${emp.employeeId}/pf-adjust`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    amount: Number(amount),
                    type,
                    description: description.trim(),
                    periodMonth: periodMonth ? Number(periodMonth) : undefined,
                    periodYear: periodYear ? Number(periodYear) : undefined,
                    erpReferenceId: erpReferenceId.trim() || undefined
                })
            });

            const body = await res.json();
            if (res.ok) {
                setEmp(body.employee);
                setAmount('');
                setDescription('');
                setPeriodMonth('');
                setPeriodYear('');
                setErpReferenceId('');
                setShowAdjustForm(false);
                onSuccess(); // Refresh main list
            } else {
                setErrorMsg(body.message || 'Failed to apply adjustment');
            }
        } catch {
            setErrorMsg('Network error occurred.');
        } finally {
            setSubmitting(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-8 px-4 pb-4 overflow-y-auto animate-fadeIn">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden">

                {/* Header */}
                <div className="bg-gradient-to-r from-indigo-600 to-purple-700 px-7 py-6 text-white">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-indigo-200 mb-1">PF Statement</p>
                            <h2 className="text-xl font-black">{formatEmployeeFullName(emp, emp.employeeId)}</h2>
                            <p className="text-indigo-200 text-sm">{emp.designation} • #{emp.employeeId}</p>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Summary cards */}
                    <div className="grid grid-cols-3 gap-3 mt-5">
                        <div className="bg-white/10 rounded-2xl px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-200">Current Balance</p>
                            <p className="text-lg font-black mt-0.5">{fmtPKR(emp.providentFundBalance)}</p>
                        </div>
                        <div className="bg-white/10 rounded-2xl px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-200">Maturity Date</p>
                            <p className="text-base font-black mt-0.5">{fmtDate(emp.maturityDate)}</p>
                            {!emp.isMatured && (
                                <p className="text-[10px] text-indigo-300 mt-0.5">{monthsLeft} month(s) left</p>
                            )}
                        </div>
                        <div className="bg-white/10 rounded-2xl px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-200">Status</p>
                            <p className="text-base font-black mt-0.5">
                                {emp.pfClaimed ? '✅ Claimed' : emp.isMatured ? '🟢 Matured' : '⏳ Pending'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Employee info strip */}
                <div className="flex flex-wrap gap-5 px-7 py-4 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600">
                    <span>Joined: <strong className="text-slate-800">{fmtDate(emp.joiningDate)}</strong></span>
                    <span>Service: <strong className="text-slate-800">{fmtMonths(emp.monthsOfService)}</strong></span>
                    <span>Previous PF Balance: <strong className="text-amber-700">{fmtPKR(totalOpeningBalance)}</strong></span>
                    <span>Payroll Contributions: <strong className="text-blue-600">{fmtPKR(payrollCredits)}</strong></span>
                    <span>Total Debits: <strong className="text-rose-500">{fmtPKR(totalDebits)}</strong></span>
                    {emp.pfClaimed && <span>Claimed on: <strong className="text-slate-800">{fmtDate(emp.pfClaimedAt)}</strong></span>}
                </div>

                {/* Month-wise table */}
                <div className="px-7 py-5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                            <CalendarDays size={14} /> Month-wise PF Statement
                        </h3>
                        <button
                            onClick={handleDownloadPDF}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all flex items-center gap-1.5 border border-indigo-100"
                        >
                            <FileText size={12} /> Download PDF
                        </button>
                    </div>

                    {months.length === 0 ? (
                        <p className="text-center py-10 text-slate-400 italic">No entries yet.</p>
                    ) : (
                        <div className="overflow-x-auto rounded-2xl border border-slate-200">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50 text-xs font-bold text-slate-400 uppercase border-b border-slate-200">
                                        <th className="px-5 py-3 text-left">Month</th>
                                        <th className="px-5 py-3 text-right text-emerald-600">Credits</th>
                                        <th className="px-5 py-3 text-right text-rose-500">Debits</th>
                                        <th className="px-5 py-3 text-right">Net</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {months.map((m, i) => {
                                        const net = m.credits - m.debits;
                                        return (
                                            <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                                                <td className="px-5 py-3 font-semibold text-slate-700">
                                                    {MONTH_NAMES[m.month]} {m.year}
                                                    <span className="ml-2 text-[10px] text-slate-400 font-normal">
                                                        ({m.entries.length} entr{m.entries.length === 1 ? 'y' : 'ies'})
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3 text-right font-bold text-emerald-600">
                                                    {m.credits > 0 ? `+${fmtPKR(m.credits)}` : '-'}
                                                </td>
                                                <td className="px-5 py-3 text-right font-bold text-rose-500">
                                                    {m.debits > 0 ? `-${fmtPKR(m.debits)}` : '-'}
                                                </td>
                                                <td className={`px-5 py-3 text-right font-black ${net >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>
                                                    {net >= 0 ? '+' : '-'}{fmtPKR(Math.abs(net))}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-slate-50 border-t-2 border-slate-200 font-black text-slate-800">
                                        <td className="px-5 py-3 text-xs uppercase tracking-wide text-slate-500">Total</td>
                                        <td className="px-5 py-3 text-right text-emerald-600">+{fmtPKR(totalCredits)}</td>
                                        <td className="px-5 py-3 text-right text-rose-500">-{fmtPKR(totalDebits)}</td>
                                        <td className="px-5 py-3 text-right">{fmtPKR(emp.providentFundBalance)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}

                    {/* Admin Manual Adjustment Section */}
                    {isAdmin && (
                        <div className="mt-6 border-t border-slate-100 pt-6 bg-slate-50/50 p-6 -mx-7 -mb-7">
                            {!showAdjustForm ? (
                                <button
                                    onClick={() => setShowAdjustForm(true)}
                                    className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-sm flex items-center gap-1.5 mx-auto"
                                >
                                    <TrendingUp size={14} /> Add Manual Adjustment
                                </button>
                            ) : (
                                <form onSubmit={handleAdjustSubmit} className="space-y-4 max-w-xl mx-auto bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">Manual PF Adjustment</h4>
                                        <button
                                            type="button"
                                            onClick={() => setShowAdjustForm(false)}
                                            className="text-slate-400 hover:text-slate-600"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>

                                    {errorMsg && (
                                        <p className="text-xs text-rose-500 font-semibold bg-rose-50 px-3 py-2 rounded-lg">{errorMsg}</p>
                                    )}

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Amount (Rs.)</label>
                                            <input
                                                type="number"
                                                required
                                                placeholder="e.g. 5000"
                                                value={amount}
                                                onChange={e => setAmount(e.target.value)}
                                                className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-100 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Type</label>
                                            <select
                                                value={type}
                                                onChange={e => setType(e.target.value as 'credit' | 'debit')}
                                                className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-100 outline-none bg-white"
                                            >
                                                <option value="credit">Credit (Add to balance)</option>
                                                <option value="debit">Debit (Deduct from balance)</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Month (Optional)</label>
                                            <select
                                                value={periodMonth}
                                                onChange={e => setPeriodMonth(e.target.value)}
                                                className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-100 outline-none bg-white"
                                            >
                                                <option value="">Select Month</option>
                                                {MONTH_NAMES.map((name, index) => index > 0 && (
                                                    <option key={index} value={index}>{name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Year (Optional)</label>
                                            <input
                                                type="number"
                                                placeholder={`e.g. ${new Date().getFullYear()}`}
                                                value={periodYear}
                                                onChange={e => setPeriodYear(e.target.value)}
                                                className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-100 outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Description</label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="e.g. Interest Dividend Payout"
                                            value={description}
                                            onChange={e => setDescription(e.target.value)}
                                            className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-100 outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">ERP Transaction ID (Optional)</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. ERP-TXN-776655"
                                            value={erpReferenceId}
                                            onChange={e => setErpReferenceId(e.target.value)}
                                            className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-100 outline-none"
                                        />
                                    </div>

                                    <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
                                        <button
                                            type="button"
                                            onClick={() => setShowAdjustForm(false)}
                                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={submitting}
                                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-all disabled:opacity-60 shadow-sm"
                                        >
                                            {submitting ? 'Applying...' : 'Apply Adjustment'}
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

export default function ProvidentFundReport() {
    const { hasSubAccess } = usePermissions();
    const canSeeCompanyPF = hasSubAccess('provident-fund', 'company-pf');
    const canSeeMyPF = hasSubAccess('provident-fund', 'my-pf');
    const isAdmin = canSeeCompanyPF;

    const [activeTab, setActiveTab] = useState<'my-pf' | 'company-pf'>(() => {
        if (!canSeeMyPF && canSeeCompanyPF) return 'company-pf';
        return 'my-pf';
    });
    const [isFinancialUnlocked, setIsFinancialUnlocked] = useState(false);
    const [showMasterPinModal, setShowMasterPinModal] = useState(false);
    const [data, setData] = useState<EmpPFData[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'all' | 'matured' | 'claimed' | 'pending'>('all');
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [claiming, setClaiming] = useState<string | null>(null);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [claimErpId, setClaimErpId] = useState('');
    const [statement, setStatement] = useState<EmpPFData | null>(null);
    const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

    const showToast = (msg: string, ok: boolean) => {
        setToast({ msg, ok });
        setTimeout(() => setToast(null), 3500);
    };

    const load = useCallback(async () => {
        if (!isAdmin) return;
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.baseURL}/api/employees/pf-report`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) setData(await res.json());
        } catch { /* silent */ } finally {
            setLoading(false);
        }
    }, [isAdmin]);

    useEffect(() => { load(); }, [load]);

    const handleClaim = async (empId: string) => {
        setClaiming(empId);
        setConfirmId(null);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.baseURL}/api/employees/${empId}/pf-claim`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ erpReferenceId: claimErpId.trim() || undefined })
            });
            const body = await res.json();
            if (res.ok) {
                showToast(`PF claimed - ${fmtPKR(body.claimedAmount)}`, true);
                setClaimErpId('');
                load();
            } else {
                showToast(body.message || 'Claim failed', false);
            }
        } catch {
            showToast('Network error', false);
        } finally {
            setClaiming(null);
        }
    };

    const filtered = data.filter(emp => {
        const name = `${formatEmployeeFullName(emp, '')} ${emp.employeeId}`.toLowerCase();
        const matchSearch = name.includes(search.toLowerCase());
        const matchFilter =
            filter === 'all' ? true :
            filter === 'matured' ? (emp.isMatured && !emp.pfClaimed) :
            filter === 'claimed' ? emp.pfClaimed :
            !emp.isMatured;
        return matchSearch && matchFilter;
    });

    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 10;

    useEffect(() => {
        setCurrentPage(1);
    }, [search, filter, activeTab]);

    const paginatedList = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const totalBalance = data.reduce((s, e) => s + e.providentFundBalance, 0);
    const maturedCount = data.filter(e => e.isMatured && !e.pfClaimed).length;
    const claimedCount = data.filter(e => e.pfClaimed).length;

    if (!isAdmin) {
        return <MyProvidentFund />;
    }

    return (
        <div className="space-y-6 animate-fadeIn pb-20">

            {/* Role Tab Switcher for Admin/HR/Finance */}
            {(canSeeCompanyPF && canSeeMyPF) && (
                <div className="flex items-center gap-2 p-1.5 bg-slate-200/60 rounded-2xl w-fit border border-slate-200 shadow-inner mb-2">
                    <button
                        type="button"
                        onClick={() => setActiveTab('my-pf')}
                        className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                            activeTab === 'my-pf'
                                ? 'bg-white text-indigo-700 shadow-md'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
                        }`}
                    >
                        <User size={16} /> My PF Statement
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('company-pf')}
                        className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                            activeTab === 'company-pf'
                                ? 'bg-white text-indigo-700 shadow-md'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
                        }`}
                    >
                        <Building2 size={16} /> Company PF Management
                    </button>
                </div>
            )}

            {activeTab === 'my-pf' ? (
                <MyProvidentFund />
            ) : !isFinancialUnlocked ? (
                <div className="p-8 sm:p-12 bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-100/50 text-center max-w-lg mx-auto my-12 space-y-5 animate-fadeIn">
                    <div className="w-16 h-16 bg-amber-50 ring-8 ring-amber-50/50 rounded-2xl flex items-center justify-center mx-auto text-amber-600">
                        <Lock size={30} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">Company PF Ledger Protected</h3>
                        <p className="text-xs text-slate-500 mt-1.5 max-w-sm mx-auto leading-relaxed">
                            Company-wide Provident Fund balances, maturity disbursements, and dividend distribution require Universal Master Security authorization.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowMasterPinModal(true)}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-indigo-200 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
                    >
                        <Lock size={15} /> Unlock Company PF Ledger
                    </button>
                </div>
            ) : (
                <>
                    <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200/80 px-4 py-2.5 rounded-2xl">
                        <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                            <Unlock size={16} className="text-emerald-600" />
                            <span>Company PF Ledger Unlocked (Master Security Active)</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsFinancialUnlocked(false)}
                            className="px-3 py-1 bg-white hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200 transition-all cursor-pointer flex items-center gap-1"
                        >
                            <Lock size={12} /> Lock
                        </button>
                    </div>

            {/* Statement Modal */}
            {statement && (
                <StatementModal
                    emp={statement}
                    isAdmin={isAdmin}
                    onClose={() => setStatement(null)}
                    onSuccess={load}
                />
            )}

            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl font-semibold text-sm text-white ${
                    toast.ok ? 'bg-emerald-500' : 'bg-rose-500'
                }`}>
                    {toast.ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                    {toast.msg}
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                        <div className="p-2 bg-emerald-100 rounded-xl">
                            <Banknote size={24} className="text-emerald-600" />
                        </div>
                        Provident Fund Management
                    </h1>
                    <p className="text-sm text-slate-500 mt-1 ml-14">
                        Employee PF balances • 36-month maturity from joining date • Monthly contributions
                    </p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {([
                    { label: 'Total PF Pool', value: fmtPKR(totalBalance), Icon: Banknote, bg: 'bg-emerald-50', color: 'text-emerald-600' },
                    { label: 'Matured & Claimable', value: String(maturedCount), Icon: BadgeCheck, bg: 'bg-indigo-50', color: 'text-indigo-600' },
                    { label: 'Already Claimed', value: String(claimedCount), Icon: CheckCircle2, bg: 'bg-slate-100', color: 'text-slate-500' },
                ] as const).map(({ label, value, Icon, bg, color }) => (
                    <div key={label} className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm flex items-center gap-4">
                        <div className={`p-3 rounded-xl ${bg}`}><Icon size={20} className={color} /></div>
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</p>
                            <p className="text-xl font-black text-slate-800">{value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row gap-3 items-center">
                <div className="relative flex-1 w-full">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search by name or employee ID..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-200 outline-none"
                    />
                </div>
                <div className="flex gap-2 flex-wrap">
                    {(['all', 'matured', 'claimed', 'pending'] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${
                                filter === f ? 'bg-indigo-600 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                        >
                            {f === 'all' ? 'All' : f === 'matured' ? 'Matured' : f === 'claimed' ? 'Claimed' : 'Not Matured'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Employee list */}
            {loading ? (
                <div className="text-center py-20">
                    <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="mt-4 text-slate-400 text-sm">Loading PF data...</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20 text-slate-400">
                    <Users size={40} className="mx-auto mb-3 opacity-40" />
                    <p className="font-medium">No employees found</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {paginatedList.map(emp => {
                        const isExpanded = !!expanded[emp.employeeId];
                        const canClaim = emp.isMatured && !emp.pfClaimed && emp.providentFundBalance > 0;
                        const monthsLeft = emp.maturityDate
                            ? Math.max(0, (new Date(emp.maturityDate).getFullYear() - new Date().getFullYear()) * 12
                                + (new Date(emp.maturityDate).getMonth() - new Date().getMonth()))
                            : emp.maturityThresholdMonths;

                        return (
                            <div key={emp.employeeId} className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">

                                {/* Summary row */}
                                <div
                                    className="flex flex-wrap sm:flex-nowrap items-center gap-3 px-4 sm:px-5 py-4 cursor-pointer hover:bg-slate-50/50 transition-colors select-none"
                                    onClick={() => setExpanded(p => ({ ...p, [emp.employeeId]: !p[emp.employeeId] }))}
                                >
                                    <span className="text-slate-400 shrink-0">
                                        {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                    </span>

                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-slate-800 truncate">
                                            {formatEmployeeFullName(emp, emp.employeeId)}
                                            <span className="ml-2 text-xs font-medium text-slate-400">#{emp.employeeId}</span>
                                        </p>
                                        <p className="text-xs text-slate-500 truncate">{emp.designation} • {emp.department}</p>
                                    </div>

                                    {/* Maturity date */}
                                    <div className="text-center hidden md:block min-w-[120px]">
                                        <p className="text-xs text-slate-400 font-medium whitespace-nowrap">Maturity Date</p>
                                        <p className="font-bold text-slate-700 text-xs whitespace-nowrap">{fmtDate(emp.maturityDate)}</p>
                                    </div>

                                    {/* Service */}
                                    <div className="text-center hidden sm:block min-w-[130px]">
                                        <p className="text-xs text-slate-400 font-medium whitespace-nowrap">Service</p>
                                        <p className="font-bold text-slate-700 whitespace-nowrap">{fmtMonths(emp.monthsOfService)}</p>
                                    </div>

                                    {/* Balance */}
                                    <div className="text-center hidden sm:block min-w-[120px]">
                                        <p className="text-xs text-slate-400 font-medium whitespace-nowrap">PF Balance</p>
                                        <p className="font-black text-emerald-600 whitespace-nowrap">{fmtPKR(emp.providentFundBalance)}</p>
                                    </div>

                                    {/* Status badge */}
                                    <div className="shrink-0">
                                        {emp.pfClaimed ? (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200 whitespace-nowrap">
                                                <CheckCircle2 size={12} /> Claimed
                                            </span>
                                        ) : emp.isMatured ? (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-100 whitespace-nowrap">
                                                <BadgeCheck size={12} /> Matured
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-50 text-amber-600 border border-amber-100 whitespace-nowrap">
                                                <Clock size={12} /> {fmtMonths(monthsLeft)} left
                                            </span>
                                        )}
                                    </div>

                                    {/* View Details */}
                                    <div className="shrink-0" onClick={e => e.stopPropagation()}>
                                        <button
                                            onClick={() => setStatement(emp)}
                                            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all flex items-center gap-1"
                                        >
                                            <FileText size={12} /> Statement
                                        </button>
                                    </div>

                                    {/* Claim action */}
                                    <div className="shrink-0" onClick={e => e.stopPropagation()}>
                                        {canClaim ? (
                                            confirmId === emp.employeeId ? (
                                                <div className="flex flex-col gap-1.5 p-2 bg-rose-50 rounded-xl border border-rose-100 max-w-[200px]">
                                                    <span className="text-[10px] text-rose-700 font-bold uppercase leading-none">Confirm Claim?</span>
                                                    <input 
                                                        type="text"
                                                        placeholder="ERP Txn ID (Optional)"
                                                        value={claimErpId}
                                                        onChange={e => setClaimErpId(e.target.value)}
                                                        className="px-2 py-1 text-[10px] border border-rose-200 rounded focus:ring-1 focus:ring-rose-300 outline-none bg-white font-semibold text-slate-800"
                                                    />
                                                    <div className="flex gap-1 justify-end">
                                                        <button
                                                            onClick={() => handleClaim(emp.employeeId)}
                                                            disabled={claiming === emp.employeeId}
                                                            className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] transition-all"
                                                        >
                                                            {claiming === emp.employeeId ? '...' : 'Claim'}
                                                        </button>
                                                        <button
                                                            onClick={() => { setConfirmId(null); setClaimErpId(''); }}
                                                            className="px-2.5 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[10px] transition-all"
                                                        >
                                                            No
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => setConfirmId(emp.employeeId)}
                                                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-sm"
                                                >
                                                    Claim PF
                                                </button>
                                            )
                                        ) : emp.pfClaimed ? (
                                            <span className="text-xs text-slate-400 italic">{fmtDate(emp.pfClaimedAt)}</span>
                                        ) : (
                                            <span title={`Matures on ${fmtDate(emp.maturityDate)}`}>
                                                <AlertTriangle size={16} className="text-amber-400" />
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Expanded raw history */}
                                {isExpanded && (
                                    <div className="border-t border-slate-100 bg-slate-50/30">
                                        <div className="flex gap-6 px-5 py-3 sm:hidden text-sm border-b border-slate-100">
                                            <div><span className="text-slate-400 text-xs">Service: </span><strong>{fmtMonths(emp.monthsOfService)}</strong></div>
                                            <div><span className="text-slate-400 text-xs">Balance: </span><strong className="text-emerald-600">{fmtPKR(emp.providentFundBalance)}</strong></div>
                                            <div><span className="text-slate-400 text-xs">Matures: </span><strong>{fmtDate(emp.maturityDate)}</strong></div>
                                        </div>

                                        {emp.providentFundHistory.length === 0 ? (
                                            <p className="px-5 py-6 text-center text-slate-400 italic text-sm">No contribution history yet.</p>
                                        ) : (
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr className="text-xs font-bold text-slate-400 uppercase border-b border-slate-200/60">
                                                            <th className="px-5 py-2.5 text-left">Date</th>
                                                            <th className="px-5 py-2.5 text-left">Period</th>
                                                            <th className="px-5 py-2.5 text-left">Description</th>
                                                            <th className="px-5 py-2.5 text-center">ERP ID</th>
                                                            <th className="px-5 py-2.5 text-center">Source</th>
                                                            <th className="px-5 py-2.5 text-center">Type</th>
                                                            <th className="px-5 py-2.5 text-right">Amount</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {[...emp.providentFundHistory]
                                                            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                                            .map((entry, idx) => (
                                                                <tr key={idx} className="hover:bg-white transition-colors">
                                                                    <td className="px-5 py-3 text-xs text-slate-400 whitespace-nowrap">{fmtDate(entry.date)}</td>
                                                                    <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap">
                                                                        {entry.periodMonth && entry.periodYear
                                                                            ? `${MONTH_SHORT[entry.periodMonth]} ${entry.periodYear}` : '-'}
                                                                    </td>
                                                                    <td className="px-5 py-3 font-medium text-slate-700">{entry.description}</td>
                                                                    <td className="px-5 py-3 text-center text-xs font-bold text-indigo-600 font-mono">
                                                                        {entry.erpReferenceId || '—'}
                                                                    </td>
                                                                    <td className="px-5 py-3 text-center">
                                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                                                                            entry.source === 'payroll'
                                                                                ? 'bg-blue-50 text-blue-600 border-blue-100'
                                                                                : 'bg-amber-50 text-amber-600 border-amber-100'
                                                                        }`}>{entry.source}</span>
                                                                    </td>
                                                                    <td className="px-5 py-3 text-center">
                                                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                                            entry.type === 'credit'
                                                                                ? 'bg-emerald-50 text-emerald-600'
                                                                                : 'bg-rose-50 text-rose-600'
                                                                        }`}>
                                                                            {entry.type === 'credit' ? <TrendingUp size={10} /> : null}
                                                                            {entry.type === 'credit' ? '+ Credit' : '- Debit'}
                                                                        </span>
                                                                    </td>
                                                                    <td className={`px-5 py-3 text-right font-black whitespace-nowrap ${
                                                                        entry.type === 'credit' ? 'text-emerald-600' : 'text-rose-500'
                                                                    }`}>
                                                                        {entry.type === 'credit' ? '+' : '-'}{fmtPKR(entry.amount)}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}

                                        <div className="flex flex-wrap gap-4 px-5 py-3 border-t border-slate-200/60 text-xs text-slate-500 font-medium">
                                            <span>Joined: <strong className="text-slate-700">{fmtDate(emp.joiningDate)}</strong></span>
                                            <span>Matures: <strong className="text-slate-700">{fmtDate(emp.maturityDate)}</strong></span>
                                            <span>Entries: <strong className="text-slate-700">{emp.providentFundHistory.length}</strong></span>
                                            <span>Balance: <strong className="text-emerald-600">{fmtPKR(emp.providentFundBalance)}</strong></span>
                                            {emp.pfClaimed && <span>Claimed on: <strong>{fmtDate(emp.pfClaimedAt)}</strong></span>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
            </>
            )}

            {/* Universal Master Financial Security Modal */}
            <SalaryPinModal
                isOpen={showMasterPinModal}
                onClose={() => setShowMasterPinModal(false)}
                onSuccess={() => setIsFinancialUnlocked(true)}
                requireMasterPin={true}
                title="Universal Master Security Lock"
                description="Enter the 4-digit Master Financial PIN to access company-wide Provident Fund records."
            />
        </div>
    );
}
