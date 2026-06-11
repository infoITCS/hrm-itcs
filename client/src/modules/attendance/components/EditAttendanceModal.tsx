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

const VALID_STATUSES: AttendanceStatus[] = [
    'Present', 'Absent', 'Late', 'Half-Day', 'Early Leave', 'On Leave', 'Holiday', 'Weekend', 'Incomplete'
];

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
    const [status, setStatus] = useState<AttendanceStatus>('Present');
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

            setStatus(employee.status || 'Present');
            setNote('');
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

            // Sending standard ISO strings ensures correct backend parsing
            const cIn = checkInDateTime ? new Date(checkInDateTime).toISOString() : undefined;
            const cOut = checkOutDateTime ? new Date(checkOutDateTime).toISOString() : undefined;

            await attendanceApi.createManualRecord({
                employeeId: employee.employeeId,
                date,
                checkIn: cIn,
                checkOut: cOut,
                status,
                note,
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-[slideUp_0.3s_ease-out]">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="text-lg font-bold text-slate-800">Edit Attendance Record</h3>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600 rounded-xl transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
                        <div>
                            <div className="font-bold text-slate-800 text-sm">{employee.employeeName}</div>
                            <div className="text-xs text-slate-500">{employee.employeeId} • {date}</div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                <Clock size={12} /> Check In
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <input 
                                    type="date" 
                                    value={checkInDate}
                                    onChange={(e) => setCheckInDate(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                                />
                                <input 
                                    type="time" 
                                    value={checkInTime}
                                    onChange={(e) => setCheckInTime(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                <Clock size={12} /> Check Out
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <input 
                                    type="date" 
                                    value={checkOutDate}
                                    onChange={(e) => setCheckOutDate(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                                />
                                <input 
                                    type="time" 
                                    value={checkOutTime}
                                    onChange={(e) => setCheckOutTime(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status</label>
                        <select 
                            value={status}
                            onChange={(e) => setStatus(e.target.value as AttendanceStatus)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                        >
                            {VALID_STATUSES.map(s => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Adjustment Note</label>
                        <textarea 
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Reason for manual adjustment..."
                            rows={2}
                            maxLength={500}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none"
                        />
                    </div>

                    <div className="pt-4 flex items-center justify-end gap-3">
                        <button 
                            type="button" 
                            onClick={onClose}
                            className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            disabled={loading}
                            className="px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors shadow-md shadow-indigo-200"
                        >
                            {loading ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
