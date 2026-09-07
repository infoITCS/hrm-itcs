import { useState, useRef, useEffect } from 'react';
import { X, ChevronDown } from 'lucide-react';

interface TimePicker12Props {
    value: string; // "HH:mm" in 24h format, e.g. "16:21" or "09:00" or ""
    onChange: (val: string) => void;
    defaultPeriod?: 'AM' | 'PM';
    presets?: { label: string; time: string }[];
}

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

export const parse24To12 = (time24?: string, defaultPeriod: 'AM' | 'PM' = 'AM') => {
    if (!time24 || !time24.includes(':')) {
        return { hour: '', minute: '', period: defaultPeriod, isSet: false };
    }
    const [hStr, mStr] = time24.split(':');
    const hNum = parseInt(hStr, 10);
    const mNum = parseInt(mStr, 10);

    if (isNaN(hNum) || isNaN(mNum)) {
        return { hour: '', minute: '', period: defaultPeriod, isSet: false };
    }

    const period: 'AM' | 'PM' = hNum >= 12 ? 'PM' : 'AM';
    let h12 = hNum % 12;
    if (h12 === 0) h12 = 12;

    return {
        hour: String(h12).padStart(2, '0'),
        minute: String(mNum).padStart(2, '0'),
        period,
        isSet: true,
    };
};

export const to24Hour = (hour: string, minute: string, period: 'AM' | 'PM'): string => {
    if (!hour || !minute) return '';
    let h = parseInt(hour, 10);
    const m = parseInt(minute, 10);

    if (period === 'PM' && h < 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;

    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export default function TimePicker12({
    value,
    onChange,
    defaultPeriod = 'AM',
    presets = []
}: TimePicker12Props) {
    const parsed = parse24To12(value, defaultPeriod);
    const { hour, minute, period, isSet } = parsed;

    const [isHourOpen, setIsHourOpen] = useState(false);
    const [isMinuteOpen, setIsMinuteOpen] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const hourListRef = useRef<HTMLDivElement>(null);
    const minuteListRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsHourOpen(false);
                setIsMinuteOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Auto-scroll selected item into view when dropdown opens
    useEffect(() => {
        if (isHourOpen && hourListRef.current) {
            const activeEl = hourListRef.current.querySelector('[data-active="true"]') as HTMLElement;
            if (activeEl) {
                activeEl.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [isHourOpen]);

    useEffect(() => {
        if (isMinuteOpen && minuteListRef.current) {
            const activeEl = minuteListRef.current.querySelector('[data-active="true"]') as HTMLElement;
            if (activeEl) {
                activeEl.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [isMinuteOpen]);

    const handleHourChange = (newHour: string) => {
        if (!newHour) {
            onChange('');
            return;
        }
        const m = minute || '00';
        onChange(to24Hour(newHour, m, period));
    };

    const handleMinuteChange = (newMin: string) => {
        const h = hour || (period === 'AM' ? '09' : '06');
        onChange(to24Hour(h, newMin, period));
    };

    const handlePeriodChange = (newPeriod: 'AM' | 'PM') => {
        if (newPeriod === period && isSet) return;
        const h = hour || (newPeriod === 'AM' ? '09' : '06');
        const m = minute || '00';
        onChange(to24Hour(h, m, newPeriod));
    };

    const handleClear = () => {
        onChange('');
        setIsHourOpen(false);
        setIsMinuteOpen(false);
    };

    const handleNow = () => {
        const now = new Date();
        const parts = new Intl.DateTimeFormat('en-US', {
            hour: 'numeric',
            minute: 'numeric',
            hour12: false,
            timeZone: 'Asia/Karachi'
        }).formatToParts(now);

        const h = parts.find(p => p.type === 'hour')?.value.padStart(2, '0') || '09';
        const m = parts.find(p => p.type === 'minute')?.value.padStart(2, '0') || '00';
        onChange(`${h}:${m}`);
        setIsHourOpen(false);
        setIsMinuteOpen(false);
    };

    return (
        <div ref={containerRef} className="space-y-1.5 w-full min-w-0 relative">
            {/* Main 12-Hour Control Bar */}
            <div className={`flex items-center justify-between gap-1 px-2 py-1.5 bg-slate-50 border rounded-xl transition-all w-full min-w-0 ${
                isSet ? 'border-indigo-200 bg-white ring-1 ring-indigo-50 shadow-xs' : 'border-slate-200'
            }`}>
                <div className="flex items-center gap-1 shrink-0">
                    {/* Custom Scrollable Hour Picker */}
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => {
                                setIsHourOpen(!isHourOpen);
                                setIsMinuteOpen(false);
                            }}
                            className={`px-1.5 py-1 bg-white border rounded-lg text-xs font-bold transition-all flex items-center gap-1 w-11 justify-between cursor-pointer ${
                                isHourOpen
                                    ? 'border-indigo-500 ring-2 ring-indigo-100 text-indigo-600'
                                    : 'border-slate-200 hover:border-slate-300 text-slate-800'
                            }`}
                            title="Select Hour"
                        >
                            <span className="text-xs">{hour || '--'}</span>
                            <ChevronDown size={10} className={`text-slate-400 transition-transform duration-200 shrink-0 ${isHourOpen ? 'rotate-180 text-indigo-500' : ''}`} />
                        </button>

                        {/* Scrollable Popover for Hours (Compact & Scrollable) */}
                        {isHourOpen && (
                            <div
                                ref={hourListRef}
                                className="absolute top-full left-0 mt-1 z-50 w-16 bg-white border border-slate-200 rounded-xl shadow-xl max-h-36 overflow-y-auto p-1 space-y-0.5 overscroll-contain animate-[fadeIn_0.15s_ease-out]"
                                style={{ scrollbarWidth: 'thin' }}
                            >
                                <button
                                    type="button"
                                    data-active={!hour}
                                    onClick={() => {
                                        handleHourChange('');
                                        setIsHourOpen(false);
                                    }}
                                    className={`w-full py-1 text-center text-xs font-bold rounded-lg transition-colors ${
                                        !hour ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'
                                    }`}
                                >
                                    --
                                </button>
                                {HOURS.map((h) => {
                                    const isSelected = hour === h;
                                    return (
                                        <button
                                            key={h}
                                            type="button"
                                            data-active={isSelected}
                                            onClick={() => {
                                                handleHourChange(h);
                                                setIsHourOpen(false);
                                            }}
                                            className={`w-full py-1 text-center text-xs font-bold rounded-lg transition-colors ${
                                                isSelected
                                                    ? 'bg-indigo-600 text-white shadow-xs'
                                                    : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-600'
                                            }`}
                                        >
                                            {h}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <span className="font-bold text-slate-400 select-none text-xs px-0.5">:</span>

                    {/* Custom Scrollable Minute Picker */}
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => {
                                setIsMinuteOpen(!isMinuteOpen);
                                setIsHourOpen(false);
                            }}
                            className={`px-1.5 py-1 bg-white border rounded-lg text-xs font-bold transition-all flex items-center gap-1 w-11 justify-between cursor-pointer ${
                                isMinuteOpen
                                    ? 'border-indigo-500 ring-2 ring-indigo-100 text-indigo-600'
                                    : 'border-slate-200 hover:border-slate-300 text-slate-800'
                            }`}
                            title="Select Minute"
                        >
                            <span className="text-xs">{minute || '--'}</span>
                            <ChevronDown size={10} className={`text-slate-400 transition-transform duration-200 shrink-0 ${isMinuteOpen ? 'rotate-180 text-indigo-500' : ''}`} />
                        </button>

                        {/* Scrollable Popover for Minutes (Compact & Scrollable) */}
                        {isMinuteOpen && (
                            <div
                                ref={minuteListRef}
                                className="absolute top-full left-0 mt-1 z-50 w-16 bg-white border border-slate-200 rounded-xl shadow-xl max-h-36 overflow-y-auto p-1 space-y-0.5 overscroll-contain animate-[fadeIn_0.15s_ease-out]"
                                style={{ scrollbarWidth: 'thin' }}
                            >
                                <button
                                    type="button"
                                    data-active={!minute}
                                    onClick={() => {
                                        handleMinuteChange('');
                                        setIsMinuteOpen(false);
                                    }}
                                    className={`w-full py-1 text-center text-xs font-bold rounded-lg transition-colors ${
                                        !minute ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'
                                    }`}
                                >
                                    --
                                </button>
                                {MINUTES.map((m) => {
                                    const isSelected = minute === m;
                                    return (
                                        <button
                                            key={m}
                                            type="button"
                                            data-active={isSelected}
                                            onClick={() => {
                                                handleMinuteChange(m);
                                                setIsMinuteOpen(false);
                                            }}
                                            className={`w-full py-1 text-center text-xs font-bold rounded-lg transition-colors ${
                                                isSelected
                                                    ? 'bg-indigo-600 text-white shadow-xs'
                                                    : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-600'
                                            }`}
                                        >
                                            {m}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* AM / PM Segmented Toggle & Clear */}
                <div className="flex items-center gap-1 shrink-0">
                    <div className="flex bg-slate-200/80 p-0.5 rounded-lg text-[11px] font-black select-none shrink-0">
                        <button
                            type="button"
                            onClick={() => handlePeriodChange('AM')}
                            className={`px-2 py-0.5 rounded-md transition-all font-bold text-[11px] ${
                                period === 'AM' && isSet
                                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-xs'
                                    : period === 'AM' && !isSet
                                    ? 'bg-slate-300 text-slate-700 font-semibold'
                                    : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            AM
                        </button>
                        <button
                            type="button"
                            onClick={() => handlePeriodChange('PM')}
                            className={`px-2 py-0.5 rounded-md transition-all font-bold text-[11px] ${
                                period === 'PM' && isSet
                                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-xs'
                                    : period === 'PM' && !isSet
                                    ? 'bg-slate-300 text-slate-700 font-semibold'
                                    : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            PM
                        </button>
                    </div>

                    {isSet && (
                        <button
                            type="button"
                            onClick={handleClear}
                            className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                            title="Clear time"
                        >
                            <X size={13} />
                        </button>
                    )}
                </div>
            </div>

            {/* Quick Presets Chips */}
            <div className="flex flex-wrap items-center gap-1 pt-0.5">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mr-0.5">Presets:</span>
                {presets.map((p) => {
                    const isActive = value === p.time;
                    return (
                        <button
                            key={p.time}
                            type="button"
                            onClick={() => {
                                onChange(p.time);
                                setIsHourOpen(false);
                                setIsMinuteOpen(false);
                            }}
                            className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-all ${
                                isActive
                                    ? 'bg-indigo-600 text-white shadow-xs'
                                    : 'bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'
                            }`}
                        >
                            {p.label}
                        </button>
                    );
                })}
                <button
                    type="button"
                    onClick={handleNow}
                    className="px-2 py-0.5 rounded-md text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors ml-auto"
                >
                    Now
                </button>
            </div>
        </div>
    );
}
