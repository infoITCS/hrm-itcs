import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../utils/api';
import { formatEmployeeFullName } from '../../utils/nameHelper';
import {
    Banknote, Search, Pencil, Save, X, Loader2, Users, TrendingDown, Wallet,
    Eye, Calendar, History, FileText, ChevronRight
} from 'lucide-react';

interface LoanRow {
    employeeId: string;
    firstName: string;
    lastName: string;
    designation?: string;
    department?: string;
    totalDisbursed: number;
    remainingBalance: number;
    monthlyInstallment: number;
    status: 'Active' | 'Paid' | 'Suspended' | 'None';
    source: 'employee_record' | 'computed';
    loanId?: string;
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

interface EmployeeLoanDetailResult {
    employeeId: string;
    firstName: string;
    lastName: string;
    designation?: string;
    department?: string;
    summary: {
        totalDisbursed: number;
        remainingBalance: number;
        monthlyInstallment: number;
        status: LoanRow['status'];
    };
    loans: IndividualLoanItem[];
    repayments: LoanRepaymentItem[];
}

const fmtPKR = (n: number) => `Rs. ${(n || 0).toLocaleString('en-PK')}`;
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function LoanManagement() {
    const [rows, setRows] = useState<LoanRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [activeOnly, setActiveOnly] = useState(true);

    const [editing, setEditing] = useState<LoanRow | null>(null);
    const [editBalance, setEditBalance] = useState('');
    const [editInstallment, setEditInstallment] = useState('');
    const [saving, setSaving] = useState(false);

    // Detail Modal State
    const [viewingEmployeeId, setViewingEmployeeId] = useState<string | null>(null);
    const [detailData, setDetailData] = useState<EmployeeLoanDetailResult | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [detailTab, setDetailTab] = useState<'loans' | 'repayments'>('loans');

    const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

    const showToast = (msg: string, ok: boolean) => {
        setToast({ msg, ok });
        setTimeout(() => setToast(null), 3500);
    };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.admin}/loans?activeOnly=${activeOnly}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                setRows(await res.json());
            } else {
                const body = await res.json().catch(() => ({}));
                showToast(body.message || 'Failed to load loans', false);
            }
        } catch {
            showToast('Network error loading loan data', false);
        } finally {
            setLoading(false);
        }
    }, [activeOnly]);

    useEffect(() => {
        load();
    }, [load]);

    const filtered = rows.filter((r) => {
        const q = search.toLowerCase();
        const name = formatEmployeeFullName(r, r.employeeId).toLowerCase();
        return name.includes(q) || r.employeeId.toLowerCase().includes(q) || (r.department || '').toLowerCase().includes(q);
    });

    const totalOutstanding = filtered.reduce((s, r) => s + (r.remainingBalance || 0), 0);
    const activeCount = filtered.filter((r) => r.status === 'Active').length;

    const openEdit = (row: LoanRow) => {
        setEditing(row);
        setEditBalance(String(row.remainingBalance ?? 0));
        setEditInstallment(String(row.monthlyInstallment ?? 0));
    };

    const openViewDetails = async (employeeId: string) => {
        setViewingEmployeeId(employeeId);
        setLoadingDetail(true);
        setDetailData(null);
        setDetailTab('loans');
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.admin}/loans/${employeeId}/details`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                setDetailData(await res.json());
            } else {
                showToast('Failed to load loan details', false);
            }
        } catch {
            showToast('Network error loading loan details', false);
        } finally {
            setLoadingDetail(false);
        }
    };

    const saveEdit = async () => {
        if (!editing) return;
        setSaving(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.admin}/loans/${editing.employeeId}`, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    remainingBalance: Number(editBalance),
                    monthlyInstallment: Number(editInstallment),
                }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                showToast(body.message || 'Failed to update loan', false);
                return;
            }
            showToast('Loan updated successfully', true);
            setEditing(null);
            await load();
            if (viewingEmployeeId === editing.employeeId) {
                await openViewDetails(editing.employeeId);
            }
        } catch {
            showToast('Network error saving loan', false);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6 animate-fadeIn pb-16">
            <div className="bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-600 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
                <div className="absolute -right-8 -bottom-8 opacity-10 pointer-events-none">
                    <Banknote size={200} />
                </div>
                <div className="relative z-10">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-xs font-medium mb-3">
                        <Wallet size={14} /> Super Admin — Loan Management
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Employee Loan Balances</h1>
                    <p className="text-emerald-100 text-sm mt-1 max-w-2xl">
                        View and manage employee loans. Click on any employee to view approved loan dates, individual loan breakdowns, and monthly salary deduction logs.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-400 uppercase">Employees Listed</span>
                        <Users size={18} className="text-emerald-600" />
                    </div>
                    <p className="text-2xl font-black text-slate-900 mt-2">{filtered.length}</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-400 uppercase">Active Loans</span>
                        <TrendingDown size={18} className="text-amber-600" />
                    </div>
                    <p className="text-2xl font-black text-slate-900 mt-2">{activeCount}</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-400 uppercase">Total Outstanding</span>
                        <Banknote size={18} className="text-emerald-600" />
                    </div>
                    <p className="text-2xl font-black text-emerald-700 mt-2">{fmtPKR(totalOutstanding)}</p>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                    <div className="relative flex-1 max-w-md">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search by name, ID, or department..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-100 outline-none"
                        />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={activeOnly}
                            onChange={(e) => setActiveOnly(e.target.checked)}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        Active loans only
                    </label>
                </div>

                {loading ? (
                    <div className="py-16 flex justify-center">
                        <Loader2 className="animate-spin text-emerald-600" size={32} />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="py-16 text-center text-slate-500 text-sm">
                        No employee loans found{activeOnly ? ' with an active balance' : ''}.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="bg-slate-50 text-[11px] font-bold text-slate-400 uppercase border-b border-slate-100">
                                    <th className="px-5 py-3">Employee</th>
                                    <th className="px-5 py-3">Department</th>
                                    <th className="px-5 py-3 text-right">Total Disbursed</th>
                                    <th className="px-5 py-3 text-right">Remaining Balance</th>
                                    <th className="px-5 py-3 text-right">Monthly Installment</th>
                                    <th className="px-5 py-3">Status</th>
                                    <th className="px-5 py-3 text-right whitespace-nowrap">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filtered.map((row) => (
                                    <tr
                                        key={row.employeeId}
                                        onClick={() => openViewDetails(row.employeeId)}
                                        className="hover:bg-emerald-50/40 cursor-pointer transition-colors"
                                    >
                                        <td className="px-5 py-4">
                                            <p className="font-bold text-slate-800 flex items-center gap-1.5">
                                                {formatEmployeeFullName(row, row.employeeId)}
                                                <ChevronRight size={14} className="text-slate-300" />
                                            </p>
                                            <p className="text-xs text-slate-400">#{row.employeeId}</p>
                                        </td>
                                        <td className="px-5 py-4 text-slate-600">{row.department || row.designation || '—'}</td>
                                        <td className="px-5 py-4 text-right font-medium text-slate-700">{fmtPKR(row.totalDisbursed)}</td>
                                        <td className="px-5 py-4 text-right font-black text-emerald-700">{fmtPKR(row.remainingBalance)}</td>
                                        <td className="px-5 py-4 text-right font-semibold text-slate-800">{fmtPKR(row.monthlyInstallment)}</td>
                                        <td className="px-5 py-4">
                                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                                                row.status === 'Active' ? 'bg-emerald-50 text-emerald-700' :
                                                row.status === 'Paid' ? 'bg-slate-100 text-slate-500' :
                                                'bg-amber-50 text-amber-700'
                                            }`}>
                                                {row.status}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => openViewDetails(row.employeeId)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200/80 transition-all shadow-xs"
                                                >
                                                    <Eye size={13} className="text-slate-500" /> Details
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => openEdit(row)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all shadow-xs"
                                                >
                                                    <Pencil size={13} className="text-emerald-600" /> Edit
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* View Details Modal */}
            {viewingEmployeeId && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-sm animate-fadeIn overflow-y-auto">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] my-auto flex flex-col overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
                        {/* Modal Header */}
                        <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-start justify-between">
                            <div>
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold mb-2">
                                    <Banknote size={12} /> Loan Ledger Breakdown
                                </div>
                                <h3 className="text-xl font-black">
                                    {detailData ? formatEmployeeFullName(detailData, detailData.employeeId) : 'Employee Loan Details'}
                                </h3>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    #{viewingEmployeeId} · {detailData?.department || detailData?.designation || 'Staff'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setViewingEmployeeId(null)}
                                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="p-6 overflow-y-auto space-y-6 flex-1">
                            {loadingDetail ? (
                                <div className="py-16 flex justify-center">
                                    <Loader2 className="animate-spin text-emerald-600" size={36} />
                                </div>
                            ) : detailData ? (
                                <>
                                    {/* Stat Summary Cards */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Disbursed</p>
                                            <p className="text-base font-bold text-slate-800 mt-1">{fmtPKR(detailData.summary.totalDisbursed)}</p>
                                        </div>
                                        <div className="p-3.5 bg-emerald-50 border border-emerald-100 rounded-2xl">
                                            <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Remaining Balance</p>
                                            <p className="text-base font-black text-emerald-800 mt-1">{fmtPKR(detailData.summary.remainingBalance)}</p>
                                        </div>
                                        <div className="p-3.5 bg-indigo-50 border border-indigo-100 rounded-2xl">
                                            <p className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Monthly Cut</p>
                                            <p className="text-base font-bold text-indigo-800 mt-1">{fmtPKR(detailData.summary.monthlyInstallment)}</p>
                                        </div>
                                        <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-col justify-between">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</p>
                                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase w-fit mt-1 ${
                                                detailData.summary.status === 'Active' ? 'bg-emerald-100 text-emerald-800' :
                                                detailData.summary.status === 'Paid' ? 'bg-slate-200 text-slate-700' :
                                                'bg-amber-100 text-amber-800'
                                            }`}>
                                                {detailData.summary.status}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Tabs */}
                                    <div className="flex border-b border-slate-200 gap-4 text-sm font-bold">
                                        <button
                                            type="button"
                                            onClick={() => setDetailTab('loans')}
                                            className={`pb-3 flex items-center gap-2 transition-colors border-b-2 -mb-px ${
                                                detailTab === 'loans'
                                                    ? 'border-emerald-600 text-emerald-700'
                                                    : 'border-transparent text-slate-400 hover:text-slate-600'
                                            }`}
                                        >
                                            <FileText size={16} /> Individual Loans ({detailData.loans.length})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDetailTab('repayments')}
                                            className={`pb-3 flex items-center gap-2 transition-colors border-b-2 -mb-px ${
                                                detailTab === 'repayments'
                                                    ? 'border-emerald-600 text-emerald-700'
                                                    : 'border-transparent text-slate-400 hover:text-slate-600'
                                            }`}
                                        >
                                            <History size={16} /> Salary Repayments ({detailData.repayments.length})
                                        </button>
                                    </div>

                                    {/* Tab 1: Individual Loans */}
                                    {detailTab === 'loans' && (
                                        <div className="space-y-3">
                                            {detailData.loans.length === 0 ? (
                                                <p className="text-center py-8 text-sm text-slate-400">No individual loan records found.</p>
                                            ) : (
                                                <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                                                    <table className="w-full text-left text-xs">
                                                        <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 border-b border-slate-200">
                                                            <tr>
                                                                <th className="px-4 py-2.5">Date Approved</th>
                                                                <th className="px-4 py-2.5">Loan Ref / Reason</th>
                                                                <th className="px-4 py-2.5 text-right">Loan Amount</th>
                                                                <th className="px-4 py-2.5 text-right">Monthly Cut</th>
                                                                <th className="px-4 py-2.5 text-right">Remaining</th>
                                                                <th className="px-4 py-2.5 text-center">Status</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-100">
                                                            {detailData.loans.map((loan, idx) => (
                                                                <tr key={idx} className="hover:bg-slate-50/60">
                                                                    <td className="px-4 py-3 font-semibold text-slate-700 flex items-center gap-1">
                                                                        <Calendar size={12} className="text-slate-400" />
                                                                        {fmtDate(loan.issueDate)}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-slate-600 max-w-[200px]">
                                                                        <p className="font-bold text-slate-800">{loan.category || 'Loan'}</p>
                                                                        <p className="text-[11px] text-slate-400 truncate">{loan.notes || loan.loanId}</p>
                                                                    </td>
                                                                    <td className="px-4 py-3 text-right font-bold text-slate-800">{fmtPKR(loan.totalAmount)}</td>
                                                                    <td className="px-4 py-3 text-right font-medium text-slate-600">{fmtPKR(loan.monthlyInstallment)}</td>
                                                                    <td className="px-4 py-3 text-right font-black text-emerald-700">{fmtPKR(loan.remainingAmount)}</td>
                                                                    <td className="px-4 py-3 text-center">
                                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                                                            loan.status === 'Active' ? 'bg-emerald-50 text-emerald-700' :
                                                                            loan.status === 'Paid' ? 'bg-slate-100 text-slate-500' :
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
                                    )}

                                    {/* Tab 2: Salary Repayments */}
                                    {detailTab === 'repayments' && (
                                        <div className="space-y-3">
                                            {detailData.repayments.length === 0 ? (
                                                <div className="text-center py-10 space-y-2 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                                                    <History size={32} className="mx-auto text-slate-300" />
                                                    <p className="text-sm font-semibold text-slate-600">No salary deductions recorded yet</p>
                                                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                                                        Monthly loan installments are automatically logged here when monthly payrolls are finalized.
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                                                    <table className="w-full text-left text-xs">
                                                        <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 border-b border-slate-200">
                                                            <tr>
                                                                <th className="px-4 py-2.5">Payroll Month</th>
                                                                <th className="px-4 py-2.5">Payslip Ref</th>
                                                                <th className="px-4 py-2.5">Deduction Date</th>
                                                                <th className="px-4 py-2.5 text-right">Amount Deducted</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-100">
                                                            {detailData.repayments.map((rep, idx) => (
                                                                <tr key={idx} className="hover:bg-slate-50/60">
                                                                    <td className="px-4 py-3 font-bold text-slate-800">
                                                                        {MONTH_NAMES[rep.periodMonth] || rep.periodMonth} {rep.periodYear}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-slate-500 font-mono">
                                                                        {rep.payslipNo || `#${rep.payslipId.slice(-6)}`}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-slate-600">
                                                                        {fmtDate(rep.date)}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-right font-black text-rose-600">
                                                                        - {fmtPKR(rep.amount)}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            ) : null}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                            <button
                                type="button"
                                onClick={() => setViewingEmployeeId(null)}
                                className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                            >
                                Close
                            </button>
                            {detailData && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        const matchingRow = rows.find(r => r.employeeId === detailData.employeeId);
                                        if (matchingRow) {
                                            openEdit(matchingRow);
                                        }
                                    }}
                                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                                >
                                    <Pencil size={12} /> Edit Loan Balance
                                </button>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Edit Loan Modal */}
            {editing && createPortal(
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-sm animate-fadeIn overflow-y-auto">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md my-auto p-6 space-y-4 border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Edit Loan Balance</h3>
                                <p className="text-sm text-slate-500">{formatEmployeeFullName(editing, editing.employeeId)} · #{editing.employeeId}</p>
                            </div>
                            <button type="button" onClick={() => setEditing(null)} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase">Remaining Balance (PKR)</label>
                                <input
                                    type="number"
                                    min={0}
                                    value={editBalance}
                                    onChange={(e) => setEditBalance(e.target.value)}
                                    className="w-full mt-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-100 outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase">Monthly Installment (PKR)</label>
                                <input
                                    type="number"
                                    min={0}
                                    value={editInstallment}
                                    onChange={(e) => setEditInstallment(e.target.value)}
                                    className="w-full mt-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-100 outline-none"
                                />
                            </div>
                        </div>
                        <div className="flex gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setEditing(null)}
                                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={saveEdit}
                                disabled={saving}
                                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
                            >
                                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {toast && createPortal(
                <div className={`fixed bottom-6 right-6 z-[10000] px-4 py-3 rounded-xl shadow-lg text-sm font-semibold text-white ${toast.ok ? 'bg-emerald-600' : 'bg-rose-600'}`}>
                    {toast.msg}
                </div>,
                document.body
            )}
        </div>
    );
}

