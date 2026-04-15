import { useState } from 'react';
import {
    ChevronLeft, ChevronRight, RefreshCw, CheckCircle2,
    XCircle, Clock, AlertTriangle, Edit3, Check
} from 'lucide-react';
import { api } from '../../../utils/api';

interface AttendanceTableProps {
    records: any[];
    loading: boolean;
    total: number;
    page: number;
    onPageChange: (p: number) => void;
    onRefresh: () => void;
    isAdmin: boolean;
}

const STATUS_CONFIG: Record<string, { icon: any; color: string; bg: string }> = {
    Present:    { icon: CheckCircle2,  color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
    Late:       { icon: AlertTriangle, color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200'   },
    Absent:     { icon: XCircle,       color: 'text-rose-600',    bg: 'bg-rose-50 border-rose-200'     },
    'Half-Day': { icon: Clock,         color: 'text-orange-600',  bg: 'bg-orange-50 border-orange-200' },
    Incomplete: { icon: Clock,         color: 'text-indigo-600',  bg: 'bg-indigo-50 border-indigo-200' },
    'On Leave': { icon: CheckCircle2,  color: 'text-violet-600',  bg: 'bg-violet-50 border-violet-200' },
};

const fmt = (dateStr?: string, type: 'time' | 'date' = 'time') => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (type === 'time') return d.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' });
};

const fmtMins = (mins: number) => {
    if (!mins) return '—';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
};

const AttendanceTable = ({
    records, loading, total, page, onPageChange, onRefresh, isAdmin
}: AttendanceTableProps) => {
    const [editId, setEditId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<any>({});
    const [saving, setSaving] = useState(false);
    const token = localStorage.getItem('token');
    const LIMIT = 25;
    const totalPages = Math.ceil(total / LIMIT);

    const startEdit = (rec: any) => {
        setEditId(rec._id);
        setEditForm({
            checkIn:  rec.checkIn  ? new Date(rec.checkIn ).toISOString().slice(0, 16) : '',
            checkOut: rec.checkOut ? new Date(rec.checkOut).toISOString().slice(0, 16) : '',
            status:   rec.status,
            note:     rec.note ?? '',
        });
    };

    const saveEdit = async (id: string) => {
        setSaving(true);
        try {
            await fetch(`${api.attendance}/records/${id}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(editForm),
            });
            setEditId(null);
            onRefresh();
        } catch { /* ignore */ } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
                ))}
            </div>
        );
    }

    if (!records.length) {
        return (
            <div className="text-center py-16 text-slate-400">
                <Clock size={44} className="mx-auto mb-3 text-slate-300" />
                <p className="font-semibold text-slate-600">No records found</p>
                <p className="text-sm mt-1">Try adjusting the date range or filters.</p>
            </div>
        );
    }

    return (
        <div>
            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full text-sm min-w-[750px]">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="text-left px-4 py-3 text-slate-600 font-semibold">Emp ID</th>
                            <th className="text-left px-4 py-3 text-slate-600 font-semibold">Date</th>
                            <th className="text-left px-4 py-3 text-slate-600 font-semibold">Location</th>
                            <th className="text-left px-4 py-3 text-slate-600 font-semibold">Check In</th>
                            <th className="text-left px-4 py-3 text-slate-600 font-semibold">Check Out</th>
                            <th className="text-left px-4 py-3 text-slate-600 font-semibold">Work Time</th>
                            <th className="text-left px-4 py-3 text-slate-600 font-semibold">Status</th>
                            <th className="text-left px-4 py-3 text-slate-600 font-semibold">Late</th>
                            <th className="text-left px-4 py-3 text-slate-600 font-semibold">OT</th>
                            {isAdmin && <th className="text-right px-4 py-3 text-slate-600 font-semibold">Actions</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {records.map((rec) => {
                            const isEditing = editId === rec._id;
                            const statusConf = STATUS_CONFIG[rec.status] ?? STATUS_CONFIG['Absent'];
                            const StatusIcon = statusConf.icon;

                            return (
                                <tr key={rec._id} className={`border-b border-slate-50 transition-colors ${isEditing ? 'bg-indigo-50/50' : 'hover:bg-slate-50/50'}`}>
                                    <td className="px-4 py-3 font-bold text-slate-800">{rec.employeeId}</td>
                                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmt(rec.date + 'T00:00:00', 'date')}</td>
                                    <td className="px-4 py-3 text-slate-500 text-xs font-medium">{rec.location ?? '—'}</td>

                                    {/* Check In */}
                                    <td className="px-4 py-3 text-slate-600">
                                        {isEditing ? (
                                            <input type="datetime-local" value={editForm.checkIn}
                                                onChange={e => setEditForm((p: any) => ({ ...p, checkIn: e.target.value }))}
                                                className="border border-indigo-200 rounded-lg px-2 py-1 text-xs w-40" />
                                        ) : (
                                            <span className={rec.lateMinutes > 0 ? 'text-amber-600 font-semibold' : ''}>{fmt(rec.checkIn)}</span>
                                        )}
                                    </td>

                                    {/* Check Out */}
                                    <td className="px-4 py-3 text-slate-600">
                                        {isEditing ? (
                                            <input type="datetime-local" value={editForm.checkOut}
                                                onChange={e => setEditForm((p: any) => ({ ...p, checkOut: e.target.value }))}
                                                className="border border-indigo-200 rounded-lg px-2 py-1 text-xs w-40" />
                                        ) : fmt(rec.checkOut)}
                                    </td>

                                    <td className="px-4 py-3 text-slate-600">{fmtMins(rec.workDurationMinutes)}</td>

                                    {/* Status */}
                                    <td className="px-4 py-3">
                                        {isEditing ? (
                                            <select value={editForm.status}
                                                onChange={e => setEditForm((p: any) => ({ ...p, status: e.target.value }))}
                                                className="border border-indigo-200 rounded-lg px-2 py-1 text-xs">
                                                {['Present', 'Late', 'Absent', 'Half-Day', 'Incomplete', 'On Leave', 'Holiday', 'Weekend'].map(s => (
                                                    <option key={s}>{s}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${statusConf.bg} ${statusConf.color}`}>
                                                <StatusIcon size={11} />
                                                {rec.status}
                                            </span>
                                        )}
                                    </td>

                                    <td className="px-4 py-3">
                                        {rec.lateMinutes > 0
                                            ? <span className="text-amber-600 font-semibold text-xs">+{rec.lateMinutes}m</span>
                                            : <span className="text-emerald-500 text-xs">—</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                        {rec.overtimeMinutes > 0
                                            ? <span className="text-violet-600 font-semibold text-xs">+{rec.overtimeMinutes}m</span>
                                            : <span className="text-slate-300 text-xs">—</span>}
                                    </td>

                                    {/* Actions */}
                                    {isAdmin && (
                                        <td className="px-4 py-3 text-right">
                                            {isEditing ? (
                                                <div className="flex items-center justify-end gap-2">
                                                    <button onClick={() => saveEdit(rec._id)} disabled={saving}
                                                        className="p-1.5 bg-emerald-100 text-emerald-600 rounded-lg hover:bg-emerald-200 transition-colors">
                                                        <Check size={14} />
                                                    </button>
                                                    <button onClick={() => setEditId(null)}
                                                        className="p-1.5 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition-colors">
                                                        ✕
                                                    </button>
                                                </div>
                                            ) : (
                                                <button onClick={() => startEdit(rec)}
                                                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                                                    <Edit3 size={14} />
                                                </button>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                <span className="text-sm text-slate-500">
                    Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total} records
                </span>
                <div className="flex items-center gap-2">
                    <button
                        disabled={page <= 1}
                        onClick={() => onPageChange(page - 1)}
                        className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <span className="text-sm font-semibold text-slate-600 px-2">
                        {page} / {totalPages || 1}
                    </span>
                    <button
                        disabled={page >= totalPages}
                        onClick={() => onPageChange(page + 1)}
                        className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronRight size={16} />
                    </button>
                    <button onClick={onRefresh}
                        className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors ml-1">
                        <RefreshCw size={15} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AttendanceTable;
