import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../utils/api';
import { formatEmployeeFullName } from '../../utils/nameHelper';
import {
    Banknote, Search, Pencil, Save, X, Loader2, Users, TrendingDown, Wallet,
    Eye, Calendar, History, FileText, ChevronRight, Download, CheckCircle2,
    AlertCircle, RefreshCw, Layers, Check, Edit2, Plus
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
    erpReferenceId?: string;
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

interface MonthlyLoanDeductionItem {
    employeeId: string;
    firstName: string;
    lastName: string;
    department?: string;
    designation?: string;
    payslipId: string;
    payslipNo?: string;
    amountDeducted: number;
    currentLoanBalance: number;
    deductionDate: string;
    repaymentStatus: string;
    loanDeductionErpId?: string;
}

interface MonthlyLoanLedgerResult {
    periodMonth: number;
    periodYear: number;
    payrollRunId?: string;
    payrollTitle?: string;
    payrollStatus?: string;
    totalDeducted: number;
    borrowerCount: number;
    loanDeductionErpId?: string;
    loanDeductionErpStatus: 'Pending' | 'Posted' | 'Reconciled';
    loanDeductionErpNotes?: string;
    loanDeductionErpPostedAt?: string;
    items: MonthlyLoanDeductionItem[];
}

const fmtPKR = (n: number) => `Rs. ${(n || 0).toLocaleString('en-PK')}`;
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const YEARS = [2024, 2025, 2026, 2027, 2028];

export default function LoanManagement() {
    const [viewTab, setViewTab] = useState<'balances' | 'monthly-deductions'>('balances');

    // Tab 1: Balances state
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

    // Tab 2: Monthly Ledger & ERP state
    const now = new Date();
    const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
    const [monthlyLedger, setMonthlyLedger] = useState<MonthlyLoanLedgerResult | null>(null);
    const [loadingLedger, setLoadingLedger] = useState(false);
    const [ledgerSearch, setLedgerSearch] = useState('');

    const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

    // Per-Person ERP ID state
    const [editingErpPayslipId, setEditingErpPayslipId] = useState<string | null>(null);
    const [erpInputVal, setErpInputVal] = useState<string>('');
    const [savingItemErp, setSavingItemErp] = useState<string | null>(null);

    const showToast = (msg: string, ok: boolean) => {
        setToast({ msg, ok });
        setTimeout(() => setToast(null), 3500);
    };

    const handleSaveItemErp = async (payslipId: string) => {
        setSavingItemErp(payslipId);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.admin}/loans/monthly-ledger/item/${payslipId}/erp`, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    erpReferenceId: erpInputVal.trim(),
                }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                showToast(body.message || 'Failed to save employee ERP ID', false);
                return;
            }
            showToast('Employee loan deduction ERP ID saved!', true);
            setMonthlyLedger(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    items: prev.items.map(it => it.payslipId === payslipId ? { ...it, loanDeductionErpId: erpInputVal.trim() } : it),
                };
            });
            setEditingErpPayslipId(null);
            setErpInputVal('');
        } catch {
            showToast('Network error saving employee ERP ID', false);
        } finally {
            setSavingItemErp(null);
        }
    };

    const loadBalances = useCallback(async () => {
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

    const loadMonthlyLedger = useCallback(async (month: number, year: number) => {
        setLoadingLedger(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.admin}/loans/monthly-ledger?month=${month}&year=${year}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data: MonthlyLoanLedgerResult = await res.json();
                setMonthlyLedger(data);
                setMonthlyErpInput(data.loanDeductionErpId || '');
                setMonthlyErpNotes(data.loanDeductionErpNotes || '');
            } else {
                const body = await res.json().catch(() => ({}));
                showToast(body.message || 'Failed to load monthly ledger', false);
            }
        } catch {
            showToast('Network error loading monthly loan ledger', false);
        } finally {
            setLoadingLedger(false);
        }
    }, []);

    useEffect(() => {
        loadBalances();
    }, [loadBalances]);

    useEffect(() => {
        if (viewTab === 'monthly-deductions') {
            loadMonthlyLedger(selectedMonth, selectedYear);
        }
    }, [viewTab, selectedMonth, selectedYear, loadMonthlyLedger]);

    const filtered = rows.filter((r) => {
        const q = search.toLowerCase();
        const name = formatEmployeeFullName(r, r.employeeId).toLowerCase();
        return name.includes(q) || r.employeeId.toLowerCase().includes(q) || (r.department || '').toLowerCase().includes(q);
    });

    const totalOutstanding = filtered.reduce((s, r) => s + (r.remainingBalance || 0), 0);
    const activeCount = filtered.filter((r) => r.status === 'Active').length;

    const filteredMonthlyItems = (monthlyLedger?.items || []).filter((item) => {
        const q = ledgerSearch.toLowerCase();
        const name = formatEmployeeFullName(item, item.employeeId).toLowerCase();
        return name.includes(q) || item.employeeId.toLowerCase().includes(q) || (item.department || '').toLowerCase().includes(q);
    });

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
            await loadBalances();
            if (viewingEmployeeId === editing.employeeId) {
                await openViewDetails(editing.employeeId);
            }
        } catch {
            showToast('Network error saving loan', false);
        } finally {
            setSaving(false);
        }
    };

    const handleSaveMonthlyErp = async () => {
        if (!monthlyErpInput.trim()) {
            showToast('Please enter the ERP Transaction Reference / Voucher ID.', false);
            return;
        }
        setSavingMonthlyErp(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.admin}/loans/monthly-ledger/erp`, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    periodMonth: selectedMonth,
                    periodYear: selectedYear,
                    erpReferenceId: monthlyErpInput.trim(),
                    notes: monthlyErpNotes.trim(),
                }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                showToast(body.message || 'Failed to save monthly ERP ID', false);
                return;
            }
            showToast('Monthly Loan Deduction ERP Reference ID saved successfully!', true);
            await loadMonthlyLedger(selectedMonth, selectedYear);
        } catch {
            showToast('Network error saving monthly ERP ID', false);
        } finally {
            setSavingMonthlyErp(false);
        }
    };

    const exportMonthlyLedgerCsv = () => {
        if (!monthlyLedger || monthlyLedger.items.length === 0) {
            showToast('No deduction records to export for this month.', false);
            return;
        }
        const headers = [
            'Employee ID',
            'Employee Name',
            'Department',
            'Designation',
            'Payslip Ref',
            'Deduction Date',
            'Amount Deducted (PKR)',
            'Current Balance (PKR)',
            'Monthly Loan ERP ID',
            'Payroll Month',
            'Payroll Year'
        ];
        const rows = monthlyLedger.items.map(item => [
            item.employeeId,
            `"${formatEmployeeFullName(item, item.employeeId)}"`,
            `"${item.department || ''}"`,
            `"${item.designation || ''}"`,
            `"${item.payslipNo || item.payslipId}"`,
            item.deductionDate ? new Date(item.deductionDate).toISOString().slice(0, 10) : '',
            item.amountDeducted,
            item.currentLoanBalance,
            `"${item.loanDeductionErpId || monthlyLedger.loanDeductionErpId || ''}"`,
            MONTH_NAMES[selectedMonth],
            selectedYear
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `Monthly_Loan_Deductions_${MONTH_NAMES[selectedMonth]}_${selectedYear}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('CSV export downloaded successfully.', true);
    };

    return (
        <div className="space-y-6 animate-fadeIn pb-16">
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-600 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
                <div className="absolute -right-8 -bottom-8 opacity-10 pointer-events-none">
                    <Banknote size={240} />
                </div>
                <div className="relative z-10 max-w-3xl">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-xs font-semibold mb-3 backdrop-blur-md">
                        <Wallet size={14} /> Super Admin & HR — Loan Operations
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Employee Loans & Monthly Recovery Ledger</h1>
                    <p className="text-emerald-100 text-sm mt-1.5 leading-relaxed">
                        Track employee loan balances, view monthly salary deduction breakdowns post-payroll, and record ERP journal voucher reference IDs for accounting reconciliation.
                    </p>
                </div>
            </div>

            {/* Top Navigation Tabs */}
            <div className="flex bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200/80 w-fit gap-1 shadow-inner">
                <button
                    type="button"
                    onClick={() => setViewTab('balances')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                        viewTab === 'balances'
                            ? 'bg-white text-emerald-700 shadow-sm border border-slate-200/60'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                    }`}
                >
                    <Users size={16} /> Employee Balances
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        viewTab === 'balances' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                    }`}>
                        {rows.length}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => setViewTab('monthly-deductions')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                        viewTab === 'monthly-deductions'
                            ? 'bg-white text-emerald-700 shadow-sm border border-slate-200/60'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                    }`}
                >
                    <Layers size={16} /> Monthly Deductions & ERP
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        viewTab === 'monthly-deductions' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                    }`}>
                        {MONTH_NAMES[selectedMonth]} {selectedYear}
                    </span>
                </button>
            </div>

            {/* VIEW 1: EMPLOYEE BALANCES */}
            {viewTab === 'balances' && (
                <div className="space-y-6">
                    {/* Summary KPI Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Employees Listed</span>
                                <Users size={18} className="text-emerald-600" />
                            </div>
                            <p className="text-2xl font-black text-slate-900 mt-2">{filtered.length}</p>
                        </div>
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Borrowers</span>
                                <TrendingDown size={18} className="text-amber-600" />
                            </div>
                            <p className="text-2xl font-black text-slate-900 mt-2">{activeCount}</p>
                        </div>
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Outstanding</span>
                                <Banknote size={18} className="text-emerald-600" />
                            </div>
                            <p className="text-2xl font-black text-emerald-700 mt-2">{fmtPKR(totalOutstanding)}</p>
                        </div>
                    </div>

                    {/* Table Card */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                            <div className="relative flex-1 max-w-md">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Search by employee name, ID, or department..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-100 outline-none"
                                />
                            </div>
                            <label className="flex items-center gap-2 text-sm font-semibold text-slate-600 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={activeOnly}
                                    onChange={(e) => setActiveOnly(e.target.checked)}
                                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
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
                </div>
            )}

            {/* VIEW 2: MONTHLY PAYROLL DEDUCTIONS & ERP LEDGER */}
            {viewTab === 'monthly-deductions' && (
                <div className="space-y-6">
                    {/* Period Selector & Controls Bar */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                                <Calendar size={14} className="text-emerald-600" /> Select Payroll Month:
                            </span>

                            {/* Month Select */}
                            <select
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                                className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-emerald-200 outline-none cursor-pointer"
                            >
                                {MONTH_NAMES.slice(1).map((m, idx) => (
                                    <option key={idx + 1} value={idx + 1}>{m}</option>
                                ))}
                            </select>

                            {/* Year Select */}
                            <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(Number(e.target.value))}
                                className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-emerald-200 outline-none cursor-pointer"
                            >
                                {YEARS.map((y) => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>

                            <button
                                type="button"
                                onClick={() => {
                                    const d = new Date();
                                    setSelectedMonth(d.getMonth() + 1);
                                    setSelectedYear(d.getFullYear());
                                }}
                                className="px-3 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                            >
                                Current Month
                            </button>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => loadMonthlyLedger(selectedMonth, selectedYear)}
                                disabled={loadingLedger}
                                className="p-2 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
                                title="Refresh data"
                            >
                                <RefreshCw size={16} className={loadingLedger ? 'animate-spin' : ''} />
                            </button>

                            <button
                                type="button"
                                onClick={exportMonthlyLedgerCsv}
                                disabled={!monthlyLedger || monthlyLedger.items.length === 0}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200/80 transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                            >
                                <Download size={14} className="text-slate-600" /> Export CSV
                            </button>
                        </div>
                    </div>

                    {/* KPI Stat Cards for the Selected Month */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                        {/* Total Loan Recovered */}
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Loan Recovered</span>
                                <Banknote size={18} className="text-rose-600" />
                            </div>
                            <p className="text-2xl font-black text-rose-600 mt-2">
                                {fmtPKR(monthlyLedger?.totalDeducted || 0)}
                            </p>
                            <p className="text-[11px] text-slate-400 mt-1">Deducted from {MONTH_NAMES[selectedMonth]} {selectedYear} salaries</p>
                        </div>

                        {/* Deducted Employees Count */}
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Borrowers Deducted</span>
                                <Users size={18} className="text-emerald-600" />
                            </div>
                            <p className="text-2xl font-black text-slate-900 mt-2">
                                {monthlyLedger?.borrowerCount || 0}
                            </p>
                            <p className="text-[11px] text-slate-400 mt-1">Employees with active monthly cut</p>
                        </div>

                        {/* Per-Person ERP Status */}
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Individual ERP IDs</span>
                                {((monthlyLedger?.items || []).filter(i => i.loanDeductionErpId).length === (monthlyLedger?.items?.length || 0) && (monthlyLedger?.items?.length || 0) > 0) ? (
                                    <CheckCircle2 size={18} className="text-emerald-600" />
                                ) : (
                                    <AlertCircle size={18} className="text-amber-500" />
                                )}
                            </div>
                            <div className="mt-2">
                                <span className="text-xl font-black text-slate-900">
                                    {(monthlyLedger?.items || []).filter(i => i.loanDeductionErpId).length} / {monthlyLedger?.items?.length || 0}
                                </span>
                                <p className="text-[11px] text-slate-400 mt-0.5">Individual ERP IDs recorded in table</p>
                            </div>
                        </div>

                        {/* Payroll Status */}
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Payroll Batch Status</span>
                                <FileText size={18} className="text-indigo-600" />
                            </div>
                            <div className="mt-2">
                                <span className="inline-block px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                    {monthlyLedger?.payrollStatus || 'Draft'}
                                </span>
                                <p className="text-[11px] text-slate-400 mt-1 truncate">
                                    {monthlyLedger?.payrollTitle || `${MONTH_NAMES[selectedMonth]} ${selectedYear} Payroll`}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Employee-by-Employee Breakdown Table */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                            <div>
                                <h3 className="font-bold text-slate-900 text-sm">
                                    Employees Deducted in {MONTH_NAMES[selectedMonth]} {selectedYear} ({filteredMonthlyItems.length})
                                </h3>
                                <p className="text-xs text-slate-400">
                                    List of all staff members who had a loan installment deducted in this month's payroll.
                                </p>
                            </div>

                            <div className="relative flex-1 max-w-xs">
                                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Filter by name or ID..."
                                    value={ledgerSearch}
                                    onChange={(e) => setLedgerSearch(e.target.value)}
                                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-100 outline-none"
                                />
                            </div>
                        </div>

                        {loadingLedger ? (
                            <div className="py-16 flex justify-center">
                                <Loader2 className="animate-spin text-emerald-600" size={32} />
                            </div>
                        ) : filteredMonthlyItems.length === 0 ? (
                            <div className="py-16 text-center text-slate-500 text-sm space-y-2">
                                <p className="font-semibold text-slate-600">No salary loan deductions recorded for {MONTH_NAMES[selectedMonth]} {selectedYear}.</p>
                                <p className="text-xs text-slate-400 max-w-md mx-auto">
                                    If this payroll month was just created, make sure payslips have been generated under Payroll Management.
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 text-[11px] font-bold text-slate-400 uppercase border-b border-slate-100">
                                            <th className="px-5 py-3">Employee</th>
                                            <th className="px-5 py-3">Department</th>
                                            <th className="px-5 py-3">Payslip Ref</th>
                                            <th className="px-5 py-3 text-right">Amount Deducted</th>
                                            <th className="px-5 py-3 text-right">Balance After Cut</th>
                                            <th className="px-5 py-3">ERP Voucher</th>
                                            <th className="px-5 py-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredMonthlyItems.map((item) => (
                                            <tr
                                                key={item.employeeId}
                                                className="hover:bg-slate-50/60 transition-colors"
                                            >
                                                <td className="px-5 py-4">
                                                    <p className="font-bold text-slate-800">{formatEmployeeFullName(item, item.employeeId)}</p>
                                                    <p className="text-xs text-slate-400">#{item.employeeId}</p>
                                                </td>
                                                <td className="px-5 py-4 text-slate-600 text-xs">
                                                    <p className="font-medium text-slate-700">{item.department || '—'}</p>
                                                    <p className="text-slate-400">{item.designation || ''}</p>
                                                </td>
                                                <td className="px-5 py-4 font-mono text-xs text-slate-500">
                                                    {item.payslipNo || `#${item.payslipId.slice(-6)}`}
                                                </td>
                                                <td className="px-5 py-4 text-right font-black text-rose-600">
                                                    - {fmtPKR(item.amountDeducted)}
                                                </td>
                                                <td className="px-5 py-4 text-right font-bold text-emerald-700">
                                                    {fmtPKR(item.currentLoanBalance)}
                                                </td>
                                                <td className="px-5 py-4">
                                                    {editingErpPayslipId === item.payslipId ? (
                                                        <div className="flex items-center gap-1.5">
                                                            <input
                                                                type="text"
                                                                value={erpInputVal}
                                                                onChange={(e) => setErpInputVal(e.target.value)}
                                                                placeholder="e.g. ERP-LN-001"
                                                                autoFocus
                                                                className="w-36 px-2.5 py-1 text-xs font-mono font-bold bg-white border border-emerald-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => handleSaveItemErp(item.payslipId)}
                                                                disabled={savingItemErp === item.payslipId}
                                                                className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                                                                title="Save"
                                                            >
                                                                {savingItemErp === item.payslipId ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => { setEditingErpPayslipId(null); setErpInputVal(''); }}
                                                                className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-all cursor-pointer"
                                                                title="Cancel"
                                                            >
                                                                <X size={12} />
                                                            </button>
                                                        </div>
                                                    ) : item.loanDeductionErpId ? (
                                                        <div className="flex items-center gap-2">
                                                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                                {item.loanDeductionErpId}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => { setEditingErpPayslipId(item.payslipId); setErpInputVal(item.loanDeductionErpId || ''); }}
                                                                className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-all cursor-pointer"
                                                                title="Edit ERP ID"
                                                            >
                                                                <Edit2 size={12} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => { setEditingErpPayslipId(item.payslipId); setErpInputVal(''); }}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 transition-all cursor-pointer"
                                                        >
                                                            <Plus size={11} /> Enter ERP ID
                                                        </button>
                                                    )}
                                                </td>
                                                <td className="px-5 py-4 text-right whitespace-nowrap">
                                                    <button
                                                        type="button"
                                                        onClick={() => openViewDetails(item.employeeId)}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200/80 transition-all cursor-pointer"
                                                    >
                                                        <Eye size={12} className="text-slate-500" /> View History
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

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
                                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
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
                                            className={`pb-3 flex items-center gap-2 transition-colors border-b-2 -mb-px cursor-pointer ${
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
                                            className={`pb-3 flex items-center gap-2 transition-colors border-b-2 -mb-px cursor-pointer ${
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
                                                                <th className="px-4 py-2.5">ERP Voucher ID</th>
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
                                                                    <td className="px-4 py-3">
                                                                        {rep.erpReferenceId ? (
                                                                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                                                {rep.erpReferenceId}
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-slate-400 text-[11px]">—</span>
                                                                        )}
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
                                className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
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
                                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
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
                            <button type="button" onClick={() => setEditing(null)} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer">
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
                                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={saveEdit}
                                disabled={saving}
                                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
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
