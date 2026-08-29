import { useState, useEffect } from 'react';
import { X, Clock, AlertTriangle } from 'lucide-react';
import { attendanceApi } from '../api/attendanceApi';
import type { AttendanceStatus, TodayRosterEntry } from '../types';

interface EditAttendanceModalProps {
    isOpen: boolean;
    onClose: () => void;
    date: string;
    employee: TodayRosterEntry | null;
    onSuccess: () => void;
}

/** UI status value — "Present (WFH)" maps to Present + isWfh on save */
type StatusSelectValue = AttendanceStatus | 'Present (WFH)';

const STATUS_OPTIONS: { value: StatusSelectValue; label: string }[] = [
    { value: 'Present', label: 'Present' },
    { value: 'Present (WFH)', label: 'Present (WFH)' },
    { value: 'Late', label: 'Late' },
    { value: 'Half-Day', label: 'Half-Day' },
    { value: 'Early Leave', label: 'Early Leave' },
    { value: 'On Leave', label: 'On Leave' },
    { value: 'Absent', label: 'Absent' },
    { value: 'Holiday', label: 'Holiday' },
    { value: 'Weekend', label: 'Weekend' },
    { value: 'Incomplete', label: 'Incomplete' },
];

const isWfhMarked = (entry?: { isWfh?: boolean; note?: string; status?: AttendanceStatus } | null) =>
    Boolean(entry?.isWfh) || /wfh|work from home/i.test(entry?.note || '');

const toStatusSelectValue = (entry: TodayRosterEntry): StatusSelectValue => {
    if (entry.status === 'Present' && isWfhMarked(entry)) return 'Present (WFH)';
    return entry.status || 'Present';
};

const toLocalIsoString = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function EditAttendanceModal({ isOpen, onClose, date, employee, onSuccess }: EditAttendanceModalProps) {
    const [checkInDate, setCheckInDate] = useState('');
    const [checkInTime, setCheckInTime] = useState('');
    const [checkOutDate, setCheckOutDate] = useState('');
    const [checkOutTime, setCheckOutTime] = useState('');
    const [status, setStatus] = useState<StatusSelectValue>('Present');
    const [note, setNote] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen && employee) {
            const checkInLocal = toLocalIsoString(employee.checkIn);
            const checkOutLocal = toLocalIsoString(employee.checkOut);

            if (checkInLocal) {
                const [d, t] = checkInLocal.split('T');
                setCheckInDate(d);
                setCheckInTime(t);
            } else {
                setCheckInDate(date);
                setCheckInTime('');
            }

            if (checkOutLocal) {
                const [d, t] = checkOutLocal.split('T');
                setCheckOutDate(d);
                setCheckOutTime(t);
            } else {
                setCheckOutDate(date);
                setCheckOutTime('');
            }

            setStatus(toStatusSelectValue(employee));
            setNote(employee.note || '');
            setError('');
        }
    }, [isOpen, employee, date]);

    if (!isOpen || !employee) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const checkInDateTime = checkInDate && checkInTime ? `${checkInDate}T${checkInTime}` : '';
            const checkOutDateTime = checkOutDate && checkOutTime ? `${checkOutDate}T${checkOutTime}` : '';

            const cIn = checkInDateTime ? new Date(checkInDateTime).toISOString() : undefined;
            const cOut = checkOutDateTime ? new Date(checkOutDateTime).toISOString() : undefined;

            const isWfh = status === 'Present (WFH)';
            const attendanceStatus: AttendanceStatus = isWfh ? 'Present' : status;

            await attendanceApi.createManualRecord({
                employeeId: employee.employeeId,
                date,
                checkIn: cIn,
                checkOut: cOut,
                status: attendanceStatus,
                note,
                isWfh,
                location: employee.location
            });

            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to update record');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/50 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out] overscroll-contain"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-md max-h-[92dvh] sm:max-h-[calc(100dvh-2rem)] flex flex-col animate-[slideUp_0.3s_ease-out]"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="edit-attendance-title"
            >
                <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                    <h3 id="edit-attendance-title" className="text-base sm:text-lg font-bold text-slate-800 pr-2">
                        Edit Attendance Record
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600 rounded-xl transition-colors shrink-0"
                        aria-label="Close"
                    >
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
                    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 space-y-4">
                        {error && (
                            <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl text-sm flex items-start gap-2">
                                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                                {error}
                            </div>
                        )}

                        <div className="flex items-center gap-3 p-3 bg-indigo-50/50 rounded-xl border border-indigo-100/50">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold shrink-0">
                                {employee.employeeName.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                                <div className="font-bold text-slate-800 text-sm truncate">{employee.employeeName}</div>
                                <div className="text-xs text-slate-500">{employee.employeeId} • {date}</div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                    <Clock size={12} /> Check In
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                                    <input
                                        type="date"
                                        value={checkInDate}
                                        onChange={(e) => setCheckInDate(e.target.value)}
                                        className="w-full min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                                    />
                                    <input
                                        type="time"
                                        value={checkInTime}
                                        onChange={(e) => setCheckInTime(e.target.value)}
                                        className="w-full min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                    <Clock size={12} /> Check Out
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                                    <input
                                        type="date"
                                        value={checkOutDate}
                                        onChange={(e) => setCheckOutDate(e.target.value)}
                                        className="w-full min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                                    />
                                    <input
                                        type="time"
                                        value={checkOutTime}
                                        onChange={(e) => setCheckOutTime(e.target.value)}
                                        className="w-full min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status</label>
                            <select
                                value={status}
                                onChange={(e) => setStatus(e.target.value as StatusSelectValue)}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                            >
                                {STATUS_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                            {status === 'Present (WFH)' && (
                                <p className="text-xs text-sky-700 mt-1">
                                    Work from home — no meal allowance for this day.
                                </p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Adjustment Note</label>
                            <textarea
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="Optional reason for manual adjustment..."
                                rows={2}
                                maxLength={500}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none"
                            />
                        </div>
                    </div>

                    <div className="shrink-0 px-4 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:py-4 border-t border-slate-100 bg-white flex items-center justify-end gap-2 sm:gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 sm:px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-4 sm:px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors shadow-md shadow-indigo-200"
                        >
                            {loading ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
