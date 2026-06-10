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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-6">
            {/* Left/Middle Column: Monthly Calendar View */}
            <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                            <CalendarIcon size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">Holiday Calendar</h2>
                            <p className="text-xs text-slate-400">View upcoming company-wide holidays</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={handlePrevMonth}
                            className="p-2 hover:bg-slate-100 rounded-xl transition-colors border border-slate-150 text-slate-500"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span className="text-sm font-bold text-slate-700 min-w-[120px] text-center">
                            {monthNames[month]} {year}
                        </span>
                        <button
                            onClick={handleNextMonth}
                            className="p-2 hover:bg-slate-100 rounded-xl transition-colors border border-slate-150 text-slate-500"
                        >
                            <ChevronRight size={16} />
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
                                        className={`aspect-square rounded-2xl border p-2 flex flex-col justify-between transition-all relative group ${
                                            hasHoliday
                                                ? 'bg-rose-50 border-rose-150 text-rose-700 shadow-sm shadow-rose-50/50'
                                                : isToday
                                                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-black'
                                                    : 'bg-white border-slate-100 text-slate-600 hover:bg-slate-50/50'
                                        }`}
                                    >
                                        <span className="font-bold text-left">{day}</span>
                                        {hasHoliday && (
                                            <div className="w-full">
                                                <span className="block text-[8px] bg-rose-600 text-white rounded px-1.5 py-0.5 truncate text-center font-bold tracking-tight shadow-sm hover:scale-105 transition-transform" title={dayHolidays[0].name}>
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
            <div className="lg:col-span-4 bg-white rounded-3xl border border-slate-100 p-6 shadow-sm flex flex-col justify-between min-h-[400px]">
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold text-slate-800 text-sm tracking-tight">Upcoming Holidays</h3>
                        <button 
                            onClick={fetchHolidays}
                            className="p-1.5 hover:bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-lg transition-colors"
                            title="Refresh"
                        >
                            <RefreshCw size={14} />
                        </button>
                    </div>

                    {loading ? (
                        <p className="text-xs text-slate-400 py-6 text-center">Loading list...</p>
                    ) : upcomingHolidays.length > 0 ? (
                        <div className="space-y-3.5 max-h-[360px] overflow-y-auto pr-1">
                            {upcomingHolidays.map((h) => {
                                const hDate = new Date(h.startDate);
                                const dayStr = hDate.toLocaleDateString('en-US', { day: 'numeric' });
                                const monthStr = hDate.toLocaleDateString('en-US', { month: 'short' });
                                
                                return (
                                    <div key={h._id} className="p-3.5 bg-slate-50/50 hover:bg-slate-50 rounded-2xl border border-slate-100 flex gap-3.5 items-center transition-all group">
                                        <div className="bg-rose-50 text-rose-600 rounded-xl px-2.5 py-1.5 text-center min-w-[45px] border border-rose-100 group-hover:scale-105 transition-transform">
                                            <span className="block text-[9px] uppercase font-black tracking-widest">{monthStr}</span>
                                            <span className="block text-base font-black leading-none mt-0.5">{dayStr}</span>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h4 className="font-bold text-slate-700 text-xs truncate capitalize">{h.name}</h4>
                                            <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                                                {h.startDate === h.endDate ? (
                                                    new Date(h.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                                                ) : (
                                                    `${new Date(h.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${new Date(h.endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
                                                )}
                                            </p>
                                            <div className="flex items-center gap-3 mt-1.5">
                                                <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                                                    <MapPin size={10} />
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
