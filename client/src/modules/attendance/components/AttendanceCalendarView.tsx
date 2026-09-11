import { useState } from 'react';
import { 
    AlertTriangle, Clock, 
    Calendar as CalendarIcon, LogIn, LogOut, Info, X, Edit2
} from 'lucide-react';
import type { MonthlyDayEntry, AttendanceStatus } from '../types';

interface AttendanceCalendarViewProps {
    days: MonthlyDayEntry[];
    month: string; // 'YYYY-MM'
    onDayClick?: (day: MonthlyDayEntry) => void;
    canEdit?: boolean;
    employeeName?: string;
}

const fmtMins = (m: number) => m > 0 ? `${Math.floor(m / 60)}h ${m % 60}m` : '—';
const fmtTime = (iso?: string) => iso
    ? new Date(iso).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Karachi' })
    : '—';

const STATUS_CONFIG: Record<string, { bg: string; text: string; border: string; label: string }> = {
    Present:       { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Present' },
    Late:          { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: 'Late' },
    Absent:        { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', label: 'Absent' },
    'On Leave':    { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', label: 'On Leave' },
    Incomplete:    { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', label: 'Incomplete' },
    'Early Leave': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', label: 'Early Leave' },
    'Half-Day':    { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', label: 'Half Day' },
    Weekend:       { bg: 'bg-slate-50', text: 'text-slate-400', border: 'border-slate-100', label: 'Weekend' },
    Holiday:       { bg: 'cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', label: 'Holiday' },
};

export default function AttendanceCalendarView({
    days,
    month,
    onDayClick,
    canEdit = false,
    employeeName,
}: AttendanceCalendarViewProps) {
    const [selectedDay, setSelectedDay] = useState<MonthlyDayEntry | null>(null);

    const [year, monthNum] = month.split('-').map(Number);
    const daysInMonth = new Date(year, monthNum, 0).getDate();
    const firstWeekday = new Date(year, monthNum - 1, 1).getDay(); // 0 = Sunday

    const todayStr = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);

    // Create a map by day string (YYYY-MM-DD)
    const dayMap = new Map<string, MonthlyDayEntry>();
    days.forEach((d) => dayMap.set(d.date, d));

    // Calculate Summary Stats from days
    const stats = {
        present: days.filter(d => d.status === 'Present').length,
        late: days.filter(d => d.status === 'Late' || d.lateMinutes > 0).length,
        absent: days.filter(d => d.status === 'Absent').length,
        halfDay: days.filter(d => d.status === 'Half-Day').length,
        onLeave: days.filter(d => d.status === 'On Leave').length,
        weekend: days.filter(d => d.status === 'Weekend').length,
    };

    const handleSelectDay = (day: MonthlyDayEntry) => {
        setSelectedDay(day);
    };

    const daysList = Array.from({ length: daysInMonth }, (_, i) => {
        const dayNum = i + 1;
        const dateStr = `${month}-${String(dayNum).padStart(2, '0')}`;
        return (
            dayMap.get(dateStr) || {
                date: dateStr,
                workDurationMinutes: 0,
                lateMinutes: 0,
                status: 'Absent' as AttendanceStatus,
            }
        );
    });

    return (
        <div className="space-y-4">
            {/* Quick Status Legend & Counts Bar */}
            <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <CalendarIcon size={16} className="text-indigo-600" />
                    <span className="text-xs font-bold text-slate-700">
                        {employeeName ? `${employeeName}'s Monthly Overview` : 'Monthly Attendance Breakdown'}
                    </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        Present: {stats.present}
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 font-bold">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        Late: {stats.late}
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                        <span className="w-2 h-2 rounded-full bg-rose-500" />
                        Absent: {stats.absent}
                    </span>
                    {stats.halfDay > 0 && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-yellow-50 text-yellow-700 border border-yellow-200 font-bold">
                            <span className="w-2 h-2 rounded-full bg-yellow-500" />
                            Half Day: {stats.halfDay}
                        </span>
                    )}
                    {stats.onLeave > 0 && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 border border-violet-200 font-bold">
                            <span className="w-2 h-2 rounded-full bg-violet-500" />
                            Leave: {stats.onLeave}
                        </span>
                    )}
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-500 border border-slate-200 font-medium">
                        <span className="w-2 h-2 rounded-full bg-slate-400" />
                        Weekend: {stats.weekend}
                    </span>
                </div>
            </div>

            {/* Calendar Grid Container */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-5 overflow-hidden">
                {/* Weekday Headers */}
                <div className="grid grid-cols-7 gap-2 mb-2 text-center">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                        <div key={d} className="text-[11px] font-black uppercase tracking-wider text-slate-400 py-1.5">
                            {d}
                        </div>
                    ))}
                </div>

                {/* Calendar Tiles */}
                <div className="grid grid-cols-7 gap-2">
                    {/* Previous Month Padding */}
                    {Array.from({ length: firstWeekday }).map((_, idx) => (
                        <div
                            key={`pad-prev-${idx}`}
                            className="min-h-[90px] sm:min-h-[105px] bg-slate-50/40 rounded-xl border border-dashed border-slate-100/70 p-2 opacity-40"
                        />
                    ))}

                    {/* Month Days */}
                    {daysList.map((day) => {
                        const dayNumber = parseInt(day.date.split('-')[2], 10);
                        const isToday = day.date === todayStr;
                        const isFuture = day.date > todayStr;
                        const isWeekend = day.status === 'Weekend';
                        const cfg = STATUS_CONFIG[day.status] || {
                            bg: 'bg-slate-50',
                            text: 'text-slate-600',
                            border: 'border-slate-200',
                            label: day.status,
                        };

                        const hasPunches = Boolean(day.checkIn || day.checkOut);

                        return (
                            <button
                                key={day.date}
                                type="button"
                                onClick={() => handleSelectDay(day)}
                                className={`group relative min-h-[90px] sm:min-h-[105px] rounded-xl p-2 text-left transition-all flex flex-col justify-between border ${
                                    isToday
                                        ? 'ring-2 ring-indigo-500 border-indigo-300 bg-indigo-50/20 shadow-xs'
                                        : isWeekend
                                            ? 'bg-slate-50/60 border-slate-100 hover:border-slate-200'
                                            : isFuture
                                                ? 'bg-white border-slate-100 hover:border-slate-200'
                                                : `${cfg.bg} ${cfg.border} hover:shadow-md hover:-translate-y-0.5`
                                } cursor-pointer`}
                            >
                                {/* Tile Header */}
                                <div className="flex items-center justify-between w-full">
                                    <span
                                        className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs font-bold ${
                                            isToday
                                                ? 'bg-indigo-600 text-white shadow-xs'
                                                : isWeekend
                                                    ? 'text-slate-400'
                                                    : 'text-slate-700 group-hover:text-indigo-600'
                                        }`}
                                    >
                                        {dayNumber}
                                    </span>

                                    {day.isWfh && (
                                        <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 border border-sky-200">
                                            WFH
                                        </span>
                                    )}

                                    {day.lateMinutes > 0 && day.status !== 'Weekend' && (
                                        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                                            +{day.lateMinutes}m
                                        </span>
                                    )}
                                </div>

                                {/* Status & Times */}
                                <div className="mt-1 space-y-1 w-full">
                                    <div className="flex items-center justify-between gap-1">
                                        <span
                                            className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md inline-block truncate ${
                                                isWeekend
                                                    ? 'bg-slate-200/60 text-slate-500'
                                                    : isFuture
                                                        ? 'bg-slate-100 text-slate-400'
                                                        : `${cfg.bg} ${cfg.text}`
                                            }`}
                                        >
                                            {isFuture && !hasPunches ? 'Upcoming' : cfg.label}
                                        </span>
                                    </div>

                                    {/* Check-in / Work hours info if working */}
                                    {hasPunches ? (
                                        <div className="text-[10px] text-slate-600 font-medium truncate flex flex-col gap-0.5">
                                            {day.checkIn && (
                                                <div className="flex items-center gap-1 text-emerald-700 truncate">
                                                    <LogIn size={10} className="shrink-0" />
                                                    <span className="truncate">{fmtTime(day.checkIn)}</span>
                                                </div>
                                            )}
                                            {day.checkOut && (
                                                <div className="flex items-center gap-1 text-rose-700 truncate">
                                                    <LogOut size={10} className="shrink-0" />
                                                    <span className="truncate">{fmtTime(day.checkOut)}</span>
                                                </div>
                                            )}
                                            {day.workDurationMinutes > 0 && (
                                                <span className="text-[9px] font-bold text-slate-500 mt-0.5">
                                                    {fmtMins(day.workDurationMinutes)}
                                                </span>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="text-[10px] text-slate-400 italic">
                                            {isWeekend ? 'Off day' : isFuture ? '—' : 'No records'}
                                        </div>
                                    )}
                                </div>
                            </button>
                        );
                    })}

                    {/* Next Month Trailing Padding */}
                    {Array.from({
                        length: (7 - ((firstWeekday + daysInMonth) % 7)) % 7,
                    }).map((_, idx) => (
                        <div
                            key={`pad-next-${idx}`}
                            className="min-h-[90px] sm:min-h-[105px] bg-slate-50/40 rounded-xl border border-dashed border-slate-100/70 p-2 opacity-40"
                        />
                    ))}
                </div>
            </div>

            {/* Selected Day Detail Modal */}
            {selectedDay && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in"
                    onClick={() => setSelectedDay(null)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full p-6 space-y-5 animate-in zoom-in-95"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-start justify-between">
                            <div>
                                <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">
                                    Attendance Details
                                </span>
                                <h3 className="text-lg font-extrabold text-slate-900 mt-0.5">
                                    {new Date(selectedDay.date + 'T00:00:00').toLocaleDateString('en-US', {
                                        weekday: 'long',
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric',
                                    })}
                                </h3>
                            </div>
                            <button
                                onClick={() => setSelectedDay(null)}
                                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Status Card */}
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                            <div>
                                <div className="text-xs text-slate-400 font-bold uppercase tracking-wide">Status</div>
                                <div className="text-base font-extrabold text-slate-800 mt-0.5 flex items-center gap-2">
                                    <span>{selectedDay.status}</span>
                                    {selectedDay.isWfh && (
                                        <span className="text-[10px] font-bold bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full">
                                            Work From Home
                                        </span>
                                    )}
                                </div>
                            </div>
                            <span
                                className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider ${
                                    STATUS_CONFIG[selectedDay.status]?.bg || 'bg-slate-100'
                                } ${STATUS_CONFIG[selectedDay.status]?.text || 'text-slate-600'}`}
                            >
                                {STATUS_CONFIG[selectedDay.status]?.label || selectedDay.status}
                            </span>
                        </div>

                        {/* Punch & Time Breakdown */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-1">
                                    <LogIn size={13} className="text-emerald-500" />
                                    Check In
                                </div>
                                <div className="text-sm font-bold text-slate-800">
                                    {fmtTime(selectedDay.checkIn)}
                                </div>
                            </div>

                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-1">
                                    <LogOut size={13} className="text-rose-500" />
                                    Check Out
                                </div>
                                <div className="text-sm font-bold text-slate-800">
                                    {fmtTime(selectedDay.checkOut)}
                                </div>
                            </div>

                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-1">
                                    <Clock size={13} className="text-indigo-500" />
                                    Work Duration
                                </div>
                                <div className="text-sm font-bold text-slate-800">
                                    {fmtMins(selectedDay.workDurationMinutes)}
                                </div>
                            </div>

                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-1">
                                    <AlertTriangle size={13} className="text-amber-500" />
                                    Late Minutes
                                </div>
                                <div className="text-sm font-bold text-slate-800">
                                    {selectedDay.lateMinutes > 0 ? `+${selectedDay.lateMinutes} mins` : 'None'}
                                </div>
                            </div>
                        </div>

                        {/* Note / System info */}
                        {selectedDay.note && (
                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-2 text-xs text-slate-600">
                                <Info size={14} className="text-slate-400 mt-0.5 shrink-0" />
                                <div>
                                    <span className="font-bold">Note: </span>
                                    {selectedDay.note}
                                </div>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                            {canEdit && onDayClick && (
                                <button
                                    onClick={() => {
                                        const dayToEdit = selectedDay;
                                        setSelectedDay(null);
                                        onDayClick(dayToEdit);
                                    }}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors shadow-xs"
                                >
                                    <Edit2 size={13} />
                                    Edit Record
                                </button>
                            )}
                            <button
                                onClick={() => setSelectedDay(null)}
                                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
