import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Banknote, Loader2, CheckCircle2, Send,
    PencilLine, Save, X, Plus, Trash2, Users,
    DollarSign, TrendingDown, CreditCard, RefreshCw,
    AlertTriangle,
} from 'lucide-react';
import axios from 'axios';
import { api } from '../../utils/api';
import { usePermissions } from '../../hooks/usePermissions';
import AlertModal from '../../components/UI/AlertModal';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface Earning { component: string; amount: number; type: 'fixed' | 'variable' }
interface Deduction { component: string; amount: number }

interface Payslip {
    _id: string;
    payslipNo: string;
    employeeId: string;
    earnings: Earning[];
    deductions: Deduction[];
    grossPay: number;
    totalDeductions: number;
    netPay: number;
    currency: string;
    status: 'Draft' | 'Finalized';
    paymentMethod: string;
    notes?: string;
    employeeDetails?: {
        firstName: string;
        lastName: string;
        jobInfo?: { designation?: string; department?: string };
        bankDetails?: { accountNumber?: string; bankName?: string };
        avatar?: string;
    };
}

interface PayrollRun {
    _id: string;
    title: string;
    periodMonth: number;
    periodYear: number;
    currency: string;
    status: 'Draft' | 'Approved' | 'Disbursed';
    notes?: string;
    approvedBy?: string;
    approvedAt?: string;
    disbursedAt?: string;
    erpReferenceId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline Payslip Edit Panel
// ─────────────────────────────────────────────────────────────────────────────
const PayslipEditPanel = ({
    payslip, currency, onClose, onSaved,
}: { payslip: Payslip; currency: string; onClose: () => void; onSaved: () => void }) => {
    const [earnings, setEarnings] = useState<Earning[]>(payslip.earnings.map(e => ({ ...e })));
    const [deductions, setDeductions] = useState<Deduction[]>(payslip.deductions.map(d => ({ ...d })));
    const [paymentMethod, setPaymentMethod] = useState(payslip.paymentMethod || 'Bank Transfer');
    const [notes, setNotes] = useState(payslip.notes || '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const grossPay = earnings.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const totalDeductions = deductions.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    const netPay = grossPay - totalDeductions;

    const fmt = (val: number) =>
        new Intl.NumberFormat('en-PK', { style: 'currency', currency, maximumFractionDigits: 0 }).format(val);

    const handleSave = async () => {
        setSaving(true);
        setError('');
        try {
            await axios.put(api.payslip(payslip._id), { earnings, deductions, paymentMethod, notes }, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            });
            onSaved();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to save changes.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
                    <div>
                        <h2 className="text-base font-bold text-slate-800">Edit Payslip</h2>
                        <p className="text-xs text-slate-500">{payslip.employeeDetails?.firstName} {payslip.employeeDetails?.lastName} • {payslip.payslipNo}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
                </div>

                <div className="p-6 space-y-5">
                    {error && <div className="bg-rose-50 text-rose-700 text-sm px-3 py-2 rounded-lg border border-rose-200">{error}</div>}

                    {/* Earnings */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><TrendingDown size={14} className="rotate-180 text-emerald-500" /> Earnings</h3>
                            <button onClick={() => setEarnings(e => [...e, { component: '', amount: 0, type: 'fixed' }])}
                                className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium">
                                <Plus size={13} /> Add
                            </button>
                        </div>
                        <div className="space-y-2">
                            {earnings.map((e, i) => (
                                <div key={i} className="grid grid-cols-5 gap-2 items-center">
                                    <input value={e.component} onChange={ev => setEarnings(arr => arr.map((x, j) => j === i ? { ...x, component: ev.target.value } : x))}
                                        placeholder="Component" className="col-span-2 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                                    <input type="number" value={e.amount} onChange={ev => setEarnings(arr => arr.map((x, j) => j === i ? { ...x, amount: Number(ev.target.value) } : x))}
                                        placeholder="Amount" className="col-span-2 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                                    <button onClick={() => setEarnings(arr => arr.filter((_, j) => j !== i))}
                                        className="p-1.5 text-rose-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 justify-self-center">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Deductions */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><TrendingDown size={14} className="text-rose-500" /> Deductions</h3>
                            <button onClick={() => setDeductions(d => [...d, { component: '', amount: 0 }])}
                                className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium">
                                <Plus size={13} /> Add
                            </button>
                        </div>
                        <div className="space-y-2">
                            {deductions.length === 0 && (
                                <p className="text-xs text-slate-400 italic">No deductions yet. Click Add to enter tax, EOBI, advances etc.</p>
                            )}
                            {deductions.map((d, i) => (
                                <div key={i} className="grid grid-cols-5 gap-2 items-center">
                                    <input value={d.component} onChange={ev => setDeductions(arr => arr.map((x, j) => j === i ? { ...x, component: ev.target.value } : x))}
                                        placeholder="e.g., EOBI" className="col-span-2 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                                    <input type="number" value={d.amount} onChange={ev => setDeductions(arr => arr.map((x, j) => j === i ? { ...x, amount: Number(ev.target.value) } : x))}
                                        placeholder="Amount" className="col-span-2 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                                    <button onClick={() => setDeductions(arr => arr.filter((_, j) => j !== i))}
                                        className="p-1.5 text-rose-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 justify-self-center">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Live totals */}
                    <div className="bg-slate-50 rounded-xl p-4 space-y-1.5 text-sm">
                        <div className="flex justify-between text-slate-600"><span>Gross Pay</span><span className="font-semibold text-emerald-600">{fmt(grossPay)}</span></div>
                        <div className="flex justify-between text-slate-600"><span>Total Deductions</span><span className="font-semibold text-rose-600">- {fmt(totalDeductions)}</span></div>
                        <div className="flex justify-between text-slate-800 font-bold border-t border-slate-200 pt-1.5 mt-1"><span>Net Pay</span><span className="text-indigo-600">{fmt(netPay)}</span></div>
                    </div>

                    {/* Payment method */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Method</label>
                        <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                            <option value="Bank Transfer">Bank Transfer</option>
                            <option value="Cash">Cash</option>
                            <option value="Cheque">Cheque</option>
                        </select>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Notes</label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes..."
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
                    </div>
                </div>

                <div className="flex justify-end gap-2 px-6 pb-5">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
                    <button onClick={handleSave} disabled={saving}
                        className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90 flex items-center gap-2 disabled:opacity-60">
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
const PayrollRunDetail = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { role } = usePermissions();
    const isAdminRole = role === 'admin' || role === 'super-admin';

    const [run, setRun] = useState<PayrollRun | null>(null);
    const [payslips, setPayslips] = useState<Payslip[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [editingPayslip, setEditingPayslip] = useState<Payslip | null>(null);
    const [refreshCounter, setRefreshCounter] = useState(0);
    const [showDisburseModal, setShowDisburseModal] = useState(false);
    const [disburseErpId, setDisburseErpId] = useState('');
    const [alertConfig, setAlertConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type: 'info' | 'success' | 'warning' | 'error' | 'confirm';
        onConfirm?: () => void;
        confirmText?: string;
        showCancel?: boolean;
    }>({
        isOpen: false,
        title: '',
        message: '',
        type: 'info',
    });

    const triggerConfirm = (title: string, message: string, onConfirm: () => void) => {
        setAlertConfig({
            isOpen: true,
            title,
            message,
            type: 'confirm',
            onConfirm,
            confirmText: 'Confirm',
            showCancel: true,
        });
    };

    const triggerError = (title: string, message: string) => {
        setAlertConfig({
            isOpen: true,
            title,
            message,
            type: 'error',
            confirmText: 'OK',
            showCancel: false,
        });
    };

    const fetchData = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        setError(null);
        try {
            const res = await axios.get(api.payrollRun(id), {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            });
            setRun(res.data.run);
            setPayslips(res.data.payslips);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to load payroll run.');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { fetchData(); }, [fetchData, refreshCounter]);

    const authHeader = { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } };

    const handleGenerate = async () => {
        triggerConfirm(
            'Regenerate Payslips?',
            `This will regenerate all payslips from current employee salary components for "${run?.title}". Existing payslips will be replaced. Continue?`,
            async () => {
                setActionLoading('generate');
                try {
                    await axios.post(api.payrollGenerate(id!), {}, authHeader);
                    setRefreshCounter(c => c + 1);
                } catch (err: any) {
                    triggerError('Failed to Generate', err.response?.data?.message || 'Failed to generate payslips.');
                } finally {
                    setActionLoading(null);
                }
            }
        );
    };

    const handleApprove = async () => {
        triggerConfirm(
            'Approve Payroll Run?',
            `Approve "${run?.title}"? All draft payslips will be finalized.`,
            async () => {
                setActionLoading('approve');
                try {
                    await axios.put(api.payrollApprove(id!), {}, authHeader);
                    setRefreshCounter(c => c + 1);
                } catch (err: any) {
                    triggerError('Failed to Approve', err.response?.data?.message || 'Failed to approve.');
                } finally {
                    setActionLoading(null);
                }
            }
        );
    };

    const handleDisburse = () => {
        setShowDisburseModal(true);
    };

    const handleDisburseConfirm = async () => {
        setShowDisburseModal(false);
        setActionLoading('disburse');
        try {
            await axios.put(api.payrollDisburse(id!), { erpReferenceId: disburseErpId.trim() || undefined }, authHeader);
            setDisburseErpId('');
            setRefreshCounter(c => c + 1);
        } catch (err: any) {
            triggerError('Failed to Disburse', err.response?.data?.message || 'Failed to disburse.');
        } finally {
            setActionLoading(null);
        }
    };

    const handleDeleteRun = async () => {
        triggerConfirm(
            'Delete Payroll Run?',
            `Are you sure you want to delete "${run?.title}"? All associated payslips will be permanently deleted. This action cannot be undone.`,
            async () => {
                setActionLoading('delete');
                try {
                    await axios.delete(api.payrollRun(id!), authHeader);
                    navigate('/payroll');
                } catch (err: any) {
                    triggerError('Failed to Delete', err.response?.data?.message || 'Failed to delete payroll run.');
                } finally {
                    setActionLoading(null);
                }
            }
        );
    };

    const fmt = (val: number, cur = run?.currency || 'PKR') =>
        new Intl.NumberFormat('en-PK', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(val);

    const totalGross = payslips.reduce((s, p) => s + p.grossPay, 0);
    const totalDeductions = payslips.reduce((s, p) => s + p.totalDeductions, 0);
    const totalNet = payslips.reduce((s, p) => s + p.netPay, 0);

    if (!isAdminRole) return <div className="p-6 text-rose-600">Access denied.</div>;

    if (loading) return (
        <div className="flex items-center justify-center py-32">
            <Loader2 size={30} className="animate-spin text-indigo-500" />
        </div>
    );

    if (error) return (
        <div className="p-6">
            <div className="bg-rose-50 text-rose-700 rounded-xl px-4 py-3 border border-rose-200 text-sm">{error}</div>
        </div>
    );

    if (!run) return null;

    return (
        <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-start gap-3">
                <button onClick={() => navigate('/payroll')}
                    className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors mt-0.5">
                    <ArrowLeft size={18} />
                </button>
                <div className="flex-1 min-w-0">
                    <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Banknote size={22} className="text-indigo-600 shrink-0" />
                        {run.title}
                    </h1>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            run.status === 'Draft' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                            run.status === 'Approved' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                            'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}>
                            {run.status === 'Approved' ? <CheckCircle2 size={11} /> : run.status === 'Disbursed' ? <Send size={11} /> : null}
                            {run.status}
                        </span>
                        <span className="text-xs text-slate-400">{run.currency}</span>
                        {run.disbursedAt && (
                            <span className="text-xs text-slate-400">
                                Disbursed {new Date(run.disbursedAt).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                        )}
                        {run.erpReferenceId && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                ERP ID: {run.erpReferenceId}
                            </span>
                        )}
                    </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setRefreshCounter(c => c + 1)}
                        className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 border border-slate-200" title="Refresh">
                        <RefreshCw size={15} />
                    </button>
                    {run.status === 'Draft' && (
                        <>
                            <button id="btn-generate-payslips" onClick={handleGenerate} disabled={!!actionLoading}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors disabled:opacity-60">
                                {actionLoading === 'generate' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                                Generate
                            </button>
                            <button id="btn-approve-run" onClick={handleApprove} disabled={!!actionLoading || payslips.length === 0}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90 transition-all disabled:opacity-60">
                                {actionLoading === 'approve' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                Approve
                            </button>
                        </>
                    )}
                    {run.status === 'Approved' && (
                        <button id="btn-disburse-run" onClick={handleDisburse} disabled={!!actionLoading}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 transition-all disabled:opacity-60">
                            <Send size={14} />
                            Mark Disbursed
                        </button>
                    )}
                    {run.status !== 'Disbursed' && (
                        <button id="btn-delete-run" onClick={handleDeleteRun} disabled={!!actionLoading}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors disabled:opacity-60">
                            {actionLoading === 'delete' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            Delete Run
                        </button>
                    )}
                </div>
            </div>

            {/* Payslips empty state */}
            {run.status === 'Draft' && payslips.length === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-amber-700">
                    <AlertTriangle size={16} />
                    No payslips yet. Click <strong>Generate</strong> to auto-create payslips from employee salary components.
                </div>
            )}

            {/* Summary cards */}
            {payslips.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                        <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><Users size={12} /> Employees</p>
                        <p className="text-2xl font-bold text-slate-800">{payslips.length}</p>
                    </div>
                    <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                        <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><DollarSign size={12} /> Gross Pay</p>
                        <p className="text-xl font-bold text-emerald-600">{fmt(totalGross)}</p>
                    </div>
                    <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                        <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><TrendingDown size={12} /> Deductions</p>
                        <p className="text-xl font-bold text-rose-500">{fmt(totalDeductions)}</p>
                    </div>
                    <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100 shadow-sm">
                        <p className="text-xs text-indigo-600 mb-1 flex items-center gap-1"><CreditCard size={12} /> Net Pay</p>
                        <p className="text-xl font-bold text-indigo-700">{fmt(totalNet)}</p>
                    </div>
                </div>
            )}

            {/* Payslips Table */}
            {payslips.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                        <h2 className="text-sm font-bold text-slate-700">Payslips</h2>
                        <span className="text-xs text-slate-400">{payslips.length} employees</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Employee</th>
                                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Payslip No.</th>
                                    <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Gross</th>
                                    <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Deductions</th>
                                    <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Net Pay</th>
                                    {run.status === 'Draft' && <th className="px-5 py-3" />}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {payslips.map(ps => (
                                    <tr key={ps._id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-5 py-3.5">
                                            <p className="font-semibold text-slate-800">
                                                {ps.employeeDetails?.firstName} {ps.employeeDetails?.lastName}
                                            </p>
                                            <p className="text-xs text-slate-400">
                                                {ps.employeeDetails?.jobInfo?.designation} • {ps.employeeId}
                                            </p>
                                        </td>
                                        <td className="px-5 py-3.5 hidden sm:table-cell">
                                            <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{ps.payslipNo}</span>
                                        </td>
                                        <td className="px-5 py-3.5 text-right font-medium text-slate-700">{fmt(ps.grossPay)}</td>
                                        <td className="px-5 py-3.5 text-right hidden md:table-cell text-rose-500">
                                            {ps.totalDeductions > 0 ? `- ${fmt(ps.totalDeductions)}` : '—'}
                                        </td>
                                        <td className="px-5 py-3.5 text-right font-bold text-indigo-700">{fmt(ps.netPay)}</td>
                                        {run.status === 'Draft' && (
                                            <td className="px-5 py-3.5 text-right">
                                                <button
                                                    id={`btn-edit-payslip-${ps._id}`}
                                                    onClick={() => setEditingPayslip(ps)}
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                                    title="Edit payslip"
                                                >
                                                    <PencilLine size={15} />
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Edit Panel */}
            {editingPayslip && (
                <PayslipEditPanel
                    payslip={editingPayslip}
                    currency={run.currency}
                    onClose={() => setEditingPayslip(null)}
                    onSaved={() => { setEditingPayslip(null); setRefreshCounter(c => c + 1); }}
                />
            )}

            {/* Styled Confirmation & Alert Popup */}
            <AlertModal
                isOpen={alertConfig.isOpen}
                onClose={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                onConfirm={alertConfig.onConfirm}
                confirmText={alertConfig.confirmText}
                showCancel={alertConfig.showCancel}
            />

            {/* Styled ERP disburse modal popup */}
            {showDisburseModal && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
                        <div className="flex items-center gap-2.5 text-slate-800">
                            <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
                                <Send size={20} />
                            </div>
                            <div>
                                <h3 className="font-extrabold text-base text-slate-900">Mark as Disbursed?</h3>
                                <p className="text-xs text-slate-500">Confirm salaries have been paid for "{run?.title}".</p>
                            </div>
                        </div>
                        
                        <div className="space-y-1.5">
                            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                                ERP Transaction Reference ID (Optional)
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. ERP-TXN-998877"
                                value={disburseErpId}
                                onChange={e => setDisburseErpId(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 text-slate-800 px-3.5 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all text-xs font-semibold"
                            />
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                            <button
                                onClick={() => { setShowDisburseModal(false); setDisburseErpId(''); }}
                                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-150 text-slate-600 hover:bg-slate-200 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDisburseConfirm}
                                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-all shadow-sm flex items-center gap-1.5"
                            >
                                <Send size={12} /> Confirm Disbursement
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PayrollRunDetail;
