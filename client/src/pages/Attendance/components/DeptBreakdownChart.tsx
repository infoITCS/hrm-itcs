/**
 * DeptBreakdownChart — Donut chart showing today's attendance status breakdown.
 * Pure SVG, no external library.
 */

interface DeptBreakdownChartProps {
    summary: any;
    loading: boolean;
}

const STATUS_CONFIGS = [
    { key: 'totalPresent',    label: 'Present',    color: '#6366f1' },
    { key: 'totalLate',       label: 'Late',        color: '#f59e0b' },
    { key: 'totalAbsent',     label: 'Absent',      color: '#f43f5e' },
    { key: 'totalHalfDay',    label: 'Half-Day',    color: '#f97316' },
    { key: 'totalIncomplete', label: 'Incomplete',  color: '#a78bfa' },
    { key: 'totalOnLeave',    label: 'On Leave',    color: '#8b5cf6' },
];

const DeptBreakdownChart = ({ summary, loading }: DeptBreakdownChartProps) => {
    if (loading) {
        return (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 h-full">
                <div className="h-4 w-32 bg-slate-100 rounded animate-pulse mb-4" />
                <div className="flex justify-center">
                    <div className="w-36 h-36 rounded-full bg-slate-100 animate-pulse" />
                </div>
            </div>
        );
    }

    const items = STATUS_CONFIGS.map(c => ({
        ...c,
        value: summary?.[c.key] ?? 0,
    })).filter(c => c.value > 0);

    const total = items.reduce((s, i) => s + i.value, 0);

    // Build SVG donut slices
    const R = 60;
    const CX = 90;
    const CY = 90;
    const strokeWidth = 22;

    let segments: { color: string; label: string; value: number; offset: number; percent: number }[] = [];
    let cumPct = 0;
    const circumference = 2 * Math.PI * R;

    segments = items.map(item => {
        const percent = total > 0 ? item.value / total : 0;
        const offset  = cumPct;
        cumPct += percent;
        return { ...item, percent, offset };
    });

    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 h-full flex flex-col">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
                <span className="w-3 h-3 rounded-full bg-indigo-500 inline-block" />
                Status Breakdown
            </h3>

            {total === 0 ? (
                <div className="flex-1 flex items-center justify-center text-slate-400 text-sm text-center py-6">
                    <div>
                        <div className="w-16 h-16 rounded-full border-4 border-dashed border-slate-200 mx-auto mb-3" />
                        <p>No data for this date</p>
                    </div>
                </div>
            ) : (
                <>
                    {/* Donut */}
                    <div className="flex justify-center mb-5">
                        <svg width="180" height="180" viewBox="0 0 180 180">
                            {/* Background circle */}
                            <circle cx={CX} cy={CY} r={R} fill="none" stroke="#f1f5f9" strokeWidth={strokeWidth} />

                            {segments.map((seg, i) => (
                                <circle
                                    key={i}
                                    cx={CX}
                                    cy={CY}
                                    r={R}
                                    fill="none"
                                    stroke={seg.color}
                                    strokeWidth={strokeWidth}
                                    strokeDasharray={`${seg.percent * circumference} ${circumference}`}
                                    strokeDashoffset={-seg.offset * circumference}
                                    transform={`rotate(-90 ${CX} ${CY})`}
                                    strokeLinecap="round"
                                    style={{ transition: 'stroke-dasharray 0.4s ease' }}
                                />
                            ))}

                            {/* Center text */}
                            <text x={CX} y={CY - 8} textAnchor="middle" fontSize="22" fontWeight="bold" fill="#1e293b">{total}</text>
                            <text x={CX} y={CY + 12} textAnchor="middle" fontSize="10" fill="#94a3b8" fontWeight="600">TRACKED</text>
                        </svg>
                    </div>

                    {/* Legend */}
                    <div className="space-y-2">
                        {segments.map(seg => (
                            <div key={seg.label} className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                                    <span className="text-slate-600 font-medium">{seg.label}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-slate-800">{seg.value}</span>
                                    <span className="text-xs text-slate-400 w-10 text-right">
                                        {Math.round(seg.percent * 100)}%
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default DeptBreakdownChart;
