import { useState, useEffect, useCallback } from 'react';
import { api } from '../../utils/api';
import { formatEmployeeFullName } from '../../utils/nameHelper';
import {
    Banknote, Search, Pencil, Save, X, Loader2, Users, TrendingDown, Wallet,
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

const fmtPKR = (n: number) => `Rs. ${(n || 0).toLocaleString('en-PK')}`;

export default function LoanManagement() {
    const [rows, setRows] = useState<LoanRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [activeOnly, setActiveOnly] = useState(true);
    const [editing, setEditing] = useState<LoanRow | null>(null);
    const [editBalance, setEditBalance] = useState('');
    const [editInstallment, setEditInstallment] = useState('');
    const [saving, setSaving] = useState(false);
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
                        View all employee loan balances in one place. Edit remaining balance and monthly installment — changes apply to the next payroll run.
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
                                    <th className="px-5 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filtered.map((row) => (
                                    <tr key={row.employeeId} className="hover:bg-slate-50/60">
                                        <td className="px-5 py-4">
                                            <p className="font-bold text-slate-800">{formatEmployeeFullName(row, row.employeeId)}</p>
                                            <p className="text-xs text-slate-400">#{row.employeeId}</p>
                                        </td>
                                        <td className="px-5 py-4 text-slate-600">{row.department || row.designation || '—'}</td>
                                        <td className="px-5 py-4 text-right font-medium">{fmtPKR(row.totalDisbursed)}</td>
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
                                        <td className="px-5 py-4 text-right">
                                            <button
                                                type="button"
                                                onClick={() => openEdit(row)}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                                            >
                                                <Pencil size={12} /> Edit
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {editing && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Edit Loan</h3>
                                <p className="text-sm text-slate-500">{formatEmployeeFullName(editing, editing.employeeId)} · #{editing.employeeId}</p>
                            </div>
                            <button type="button" onClick={() => setEditing(null)} className="p-1 text-slate-400 hover:text-slate-600">
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
                </div>
            )}

            {toast && (
                <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold text-white ${toast.ok ? 'bg-emerald-600' : 'bg-rose-600'}`}>
                    {toast.msg}
                </div>
            )}
        </div>
    );
}
