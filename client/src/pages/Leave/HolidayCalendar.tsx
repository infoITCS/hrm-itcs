import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, MapPin, RefreshCw } from 'lucide-react';
import { api } from '../../utils/api';

interface Holiday {
    _id: string;
    name: string;
    startDate: string;
    endDate: string;
    location?: string;
    isRecurring: boolean;
}

const HolidayCalendar = () => {
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentDate, setCurrentDate] = useState(new Date());

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth(); // 0-indexed

    const token = localStorage.getItem('token');

    const fetchHolidays = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${api.baseURL}/api/holidays`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const result = await res.json();
                setHolidays(result.data || []);
            }
        } catch (err) {
            console.error('Failed to fetch holidays:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHolidays();
    }, []);

    const handlePrevMonth = () => {
        setCurrentDate(new Date(year, month - 1, 1));
    };

    const handleNextMonth = () => {
        setCurrentDate(new Date(year, month + 1, 1));
    };

    // Calendar Math
    const firstDayIndex = new Date(year, month, 1).getDay(); // Sunday = 0
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const prevDays = [];
    for (let i = 0; i < firstDayIndex; i++) {
        prevDays.push(null);
    }

    const currentDays = [];
    for (let d = 1; d <= daysInMonth; d++) {
        currentDays.push(d);
    }

    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    // Filter upcoming holidays for sidebar list
    const upcomingHolidays = holidays.filter(h => {
        const hEndDate = new Date(h.endDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (h.isRecurring) {
            // Check if recurring date this year is today or in future
            const recurringEndThisYear = new Date(today.getFullYear(), hEndDate.getMonth(), hEndDate.getDate());
            return recurringEndThisYear >= today;
        }

        return hEndDate >= today;
    }).sort((a, b) => a.startDate.localeCompare(b.startDate));

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-2">
            {/* Left/Middle Column: Monthly Calendar View */}
            <div className="lg:col-span-8 bg-gradient-to-br from-white to-slate-50/50 rounded-[2rem] border border-slate-100 p-8 shadow-xl shadow-slate-200/20 space-y-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50/50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-2xl shadow-lg shadow-indigo-200">
                            <CalendarIcon size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-800 tracking-tight">Holiday Calendar</h2>
                            <p className="text-sm font-medium text-slate-500">Company-wide observed holidays</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 bg-white rounded-2xl p-1.5 shadow-sm border border-slate-100">
                        <button
                            onClick={handlePrevMonth}
                            className="p-2 hover:bg-slate-50 rounded-xl transition-all text-slate-400 hover:text-indigo-600 active:scale-95"
                        >
                            <ChevronLeft size={18} strokeWidth={3} />
                        </button>
                        <span className="text-base font-black text-slate-700 min-w-[140px] text-center tracking-wide">
                            {monthNames[month]} {year}
                        </span>
                        <button
                            onClick={handleNextMonth}
                            className="p-2 hover:bg-slate-50 rounded-xl transition-all text-slate-400 hover:text-indigo-600 active:scale-95"
                        >
                            <ChevronRight size={18} strokeWidth={3} />
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center min-h-[300px] space-y-3">
                        <div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                        <p className="text-xs text-slate-400 font-bold">Loading calendar...</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Calendar Grid */}
                        <div className="grid grid-cols-7 gap-2 text-center text-xs">
                            {/* Weekday headers */}
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                                <div key={day} className="font-black text-slate-400 uppercase tracking-widest text-[9px] py-2">
                                    {day}
                                </div>
                            ))}

                            {/* Previous month paddings */}
                            {prevDays.map((_, idx) => (
                                <div key={`pad-${idx}`} className="aspect-square bg-slate-50/30 rounded-2xl border border-dashed border-slate-100/50" />
                            ))}

                            {/* Monthly Days */}
                            {currentDays.map(day => {
                                const padMonth = String(month + 1).padStart(2, '0');
                                const padDay = String(day).padStart(2, '0');
                                const dateStr = `${year}-${padMonth}-${padDay}`;
                                
                                // Check if this date falls within any holiday range
                                const dayHolidays = holidays.filter(h => {
                                    if (!h.isRecurring) {
                                        return dateStr >= h.startDate && dateStr <= h.endDate;
                                    } else {
                                        const mdStr = `${padMonth}-${padDay}`;
                                        const startMD = h.startDate.substring(5);
                                        const endMD = h.endDate.substring(5);
                                        if (startMD <= endMD) {
                                            return mdStr >= startMD && mdStr <= endMD;
                                        } else {
                                            // Crosses year boundary (e.g. Dec 31 to Jan 2)
                                            return mdStr >= startMD || mdStr <= endMD;
                                        }
                                    }
                                });

                                const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
                                const hasHoliday = dayHolidays.length > 0;

                                return (
                                    <div
                                        key={day}
                                        className={`aspect-square rounded-[1.25rem] p-2 sm:p-3 flex flex-col justify-between transition-all duration-300 relative group border ${
                                            hasHoliday
                                                ? 'bg-gradient-to-br from-rose-500 to-pink-600 border-transparent text-white shadow-lg shadow-rose-200/50 hover:-translate-y-0.5'
                                                : isToday
                                                    ? 'bg-gradient-to-br from-indigo-600 to-violet-700 border-transparent text-white font-black shadow-lg shadow-indigo-200/50 hover:-translate-y-0.5'
                                                    : 'bg-white border-slate-100 text-slate-600 hover:border-indigo-200 hover:shadow-md hover:-translate-y-0.5'
                                        }`}
                                    >
                                        <span className={`font-black text-left ${hasHoliday || isToday ? 'text-white' : 'text-slate-700'}`}>{day}</span>
                                        {hasHoliday && (
                                            <div className="w-full mt-1">
                                                <span className="block text-[9px] bg-white/20 text-white rounded-lg px-1.5 py-1 truncate text-center font-bold tracking-tight backdrop-blur-sm shadow-sm" title={dayHolidays[0].name}>
                                                    {dayHolidays[0].name}
                                                </span>
                                                {/* Tooltip for overflow or details */}
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 bg-slate-900 text-white text-[10px] font-bold rounded-lg px-2.5 py-1.5 w-max max-w-[180px] shadow-xl text-center leading-normal">
                                                    {dayHolidays.map((h, i) => (
                                                        <div key={i}>
                                                            {h.name}
                                                            {h.location && <span className="block text-[8px] text-rose-300 font-medium">({h.location} only)</span>}
                                                            {h.isRecurring && <span className="block text-[8px] text-emerald-300 font-medium">(Recurring Yearly)</span>}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Right Column: Upcoming Holidays List */}
            <div className="lg:col-span-4 bg-white rounded-[2rem] border border-slate-100 p-8 shadow-xl shadow-slate-200/20 flex flex-col justify-between min-h-[400px]">
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="font-black text-slate-800 text-lg tracking-tight">Upcoming</h3>
                        <button 
                            onClick={fetchHolidays}
                            className="p-2 bg-slate-50 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-xl transition-all active:scale-95"
                            title="Refresh"
                        >
                            <RefreshCw size={16} strokeWidth={3} />
                        </button>
                    </div>

                    {loading ? (
                        <p className="text-sm font-bold text-slate-400 py-10 text-center animate-pulse">Loading list...</p>
                    ) : upcomingHolidays.length > 0 ? (
                        <div className="space-y-4 max-h-[360px] overflow-y-auto pr-2 scrollbar-none">
                            {upcomingHolidays.map((h) => {
                                const hDate = new Date(h.startDate);
                                const dayStr = hDate.toLocaleDateString('en-US', { day: 'numeric' });
                                const monthStr = hDate.toLocaleDateString('en-US', { month: 'short' });
                                
                                return (
                                    <div key={h._id} className="p-4 bg-white hover:bg-slate-50/80 rounded-2xl border border-slate-100 flex gap-4 items-center transition-all group shadow-sm hover:shadow-md cursor-default">
                                        <div className="bg-gradient-to-br from-rose-50 to-pink-50 text-rose-600 rounded-2xl px-3 py-2 text-center min-w-[55px] border border-rose-100/50 group-hover:scale-105 transition-transform shadow-inner shadow-white">
                                            <span className="block text-[10px] uppercase font-black tracking-widest">{monthStr}</span>
                                            <span className="block text-xl font-black leading-none mt-1">{dayStr}</span>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h4 className="font-black text-slate-800 text-sm leading-snug break-words pr-2 capitalize group-hover:text-indigo-600 transition-colors">{h.name}</h4>
                                            <p className="text-[10px] text-slate-400 font-bold mt-1">
                                                {h.startDate === h.endDate ? (
                                                    new Date(h.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                                                ) : (
                                                    `${new Date(h.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${new Date(h.endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
                                                )}
                                            </p>
                                            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                                <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1 whitespace-nowrap">
                                                    <MapPin size={10} className="shrink-0" />
                                                    {h.location || 'All Offices'}
                                                </span>
                                                {h.isRecurring && (
                                                    <span className="text-[9px] bg-emerald-50 text-emerald-600 font-bold px-1 py-0.5 rounded border border-emerald-100">
                                                        Yearly
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-10 bg-slate-50/30 rounded-2xl border border-dashed border-slate-100">
                            <p className="text-xs text-slate-400 font-bold">No upcoming holidays scheduled.</p>
                        </div>
                    )}
                </div>

                <div className="p-3.5 bg-indigo-50/40 border border-indigo-100 rounded-2xl text-[9px] font-bold text-indigo-700 leading-normal mt-6">
                    Company-wide holidays automatically adjust shift attendance, punches, and absence logging tracking systems.
                </div>
            </div>
        </div>
    );
};

export default HolidayCalendar;
