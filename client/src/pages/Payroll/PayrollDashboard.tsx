import { useState, useEffect, useCallback, type ElementType, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Banknote, Plus, RefreshCw, ChevronRight,
    CheckCircle2, Clock, Send, Loader2, X,
    TrendingUp, Users, DollarSign, Calendar,
    FileText,
} from 'lucide-react';
import axios from 'axios';
import { api } from '../../utils/api';
import { usePermissions } from '../../hooks/usePermissions';
import MyPayslips from './MyPayslips';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface PayrollRun {
    _id: string;
    title: string;
    periodMonth: number;
    periodYear: number;
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
const CreateRunModal = ({
    onClose, onCreated,
}: { onClose: () => void; onCreated: () => void }) => {
    const now = new Date();
    const [month, setMonth] = useState(String(now.getMonth() + 1));
    const [year, setYear] = useState(String(now.getFullYear()));
    const [currency, setCurrency] = useState('PKR');
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const currentYear = now.getFullYear();
    const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await axios.post(api.payrollRuns, {
                periodMonth: Number(month),
                periodYear: Number(year),
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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
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
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Month</label>
                            <select
                                value={month}
                                onChange={e => setMonth(e.target.value)}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                required
                            >
                                {MONTH_NAMES.slice(1).map((m, i) => (
                                    <option key={i + 1} value={i + 1}>{m}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Year</label>
                            <select
                                value={year}
                                onChange={e => setYear(e.target.value)}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                required
                            >
                                {years.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
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
                            className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90 transition-all flex items-center gap-2 disabled:opacity-60">
                            {loading ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                            Create Run
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Dashboard
// ─────────────────────────────────────────────────────────────────────────────
const PayrollDashboard = () => {
    const navigate = useNavigate();
    const { role } = usePermissions();
    const isAdmin = ['admin', 'super-admin', 'finance', 'hr'].includes(role);

    const [runs, setRuns] = useState<PayrollRun[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [activeTab, setActiveTab] = useState<'runs' | 'my-payslips'>(
        isAdmin ? 'runs' : 'my-payslips'
    );
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
        if (activeTab === 'runs') fetchRuns();
        else setLoading(false);
    }, [activeTab, refreshCounter, fetchRuns]);

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
        <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Banknote size={26} className="text-indigo-600" />
                        Payroll
                    </h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        {isAdmin ? 'Manage payroll runs and employee payslips' : 'View your payslip history'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {isAdmin && activeTab === 'runs' && (
                        <>
                            <button
                                onClick={() => setRefreshCounter(c => c + 1)}
                                className="p-2.5 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors border border-slate-200"
                                title="Refresh"
                            >
                                <RefreshCw size={16} />
                            </button>
                            <button
                                id="btn-create-payroll-run"
                                onClick={() => setShowCreateModal(true)}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90 transition-all shadow-sm"
                            >
                                <Plus size={16} />
                                New Payroll Run
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Stats — admin only */}
            {isAdmin && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <StatCard icon={TrendingUp} label="Total Runs" value={runs.length} color="indigo" />
                    <StatCard icon={Clock} label="Draft" value={drafts} color="amber" />
                    <StatCard icon={CheckCircle2} label="Approved" value={approved} color="violet" />
                    <StatCard icon={DollarSign} label="Total Disbursed" value={formatCurrency(totalDisbursed)} color="emerald" />
                </div>
            )}

            {/* Tabs */}
            {isAdmin && (
                <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
                    {(['runs', 'my-payslips'] as const).map(tab => (
                        <button
                            key={tab}
                            id={`tab-payroll-${tab}`}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                activeTab === tab
                                    ? 'bg-white text-indigo-700 shadow-sm font-semibold'
                                    : 'text-slate-600 hover:text-slate-800'
                            }`}
                        >
                            {tab === 'runs' ? (
                                <span className="flex items-center gap-1.5"><Calendar size={14} /> Payroll Runs</span>
                            ) : (
                                <span className="flex items-center gap-1.5"><FileText size={14} /> My Payslips</span>
                            )}
                        </button>
                    ))}
                </div>
            )}

            {/* Content */}
            {activeTab === 'my-payslips' ? (
                <MyPayslips embedded />
            ) : (
                <>
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
                                                    <p className="text-xs text-slate-400 mt-0.5">{run.currency}</p>
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
                                                    <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-500 transition-colors ml-auto" />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Create Run Modal */}
            {showCreateModal && (
                <CreateRunModal onClose={() => setShowCreateModal(false)} onCreated={handleCreated} />
            )}
        </div>
    );
};

export default PayrollDashboard;
