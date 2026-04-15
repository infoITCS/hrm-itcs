/**
 * WeeklyTrendChart — pure SVG/CSS chart (no external chart library needed).
 * Shows 7-day present / late / absent trend as a smooth area line chart.
 */

interface DayData {
    date: string;
    present: number;
    late: number;
    absent: number;
    incomplete: number;
}

interface WeeklyTrendChartProps {
    data: DayData[];
    loading: boolean;
}

const COLORS = {
    present: '#6366f1',
    late:    '#f59e0b',
    absent:  '#f43f5e',
};

function buildPath(points: [number, number][], smooth = true): string {
    if (points.length < 2) return '';
    if (!smooth) {
        return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
    }
    let d = `M${points[0][0]},${points[0][1]}`;
    for (let i = 1; i < points.length; i++) {
        const [px, py] = points[i - 1];
        const [cx, cy] = points[i];
        const cpx = (px + cx) / 2;
        d += ` C${cpx},${py} ${cpx},${cy} ${cx},${cy}`;
    }
    return d;
}

const WeeklyTrendChart = ({ data, loading }: WeeklyTrendChartProps) => {
    if (loading) {
        return (
            <div className="h-48 flex items-center justify-center">
                <div className="w-full h-32 bg-slate-100 rounded-xl animate-pulse" />
            </div>
        );
    }

    if (!data.length) {
        return (
            <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
                No trend data available yet.
            </div>
        );
    }

    const W = 560;
    const H = 180;
    const PADDING = { top: 20, right: 20, bottom: 36, left: 32 };
    const chartW = W - PADDING.left - PADDING.right;
    const chartH = H - PADDING.top  - PADDING.bottom;

    const allValues = data.flatMap(d => [d.present, d.late, d.absent]);
    const maxVal = Math.max(...allValues, 1);

    const xStep = chartW / (data.length - 1);
    const getY  = (v: number) => PADDING.top + chartH - (v / maxVal) * chartH;
    const getX  = (i: number) => PADDING.left + i * xStep;

    const presentPts: [number, number][] = data.map((d, i) => [getX(i), getY(d.present)]);
    const latePts:    [number, number][] = data.map((d, i) => [getX(i), getY(d.late)]);
    const absentPts:  [number, number][] = data.map((d, i) => [getX(i), getY(d.absent)]);

    const areaPath = (pts: [number, number][]) => {
        const base = `${buildPath(pts)} L${pts[pts.length-1][0]},${PADDING.top + chartH} L${pts[0][0]},${PADDING.top + chartH} Z`;
        return base;
    };

    return (
        <div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 180 }}>
                <defs>
                    <linearGradient id="grad-present" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLORS.present} stopOpacity="0.2" />
                        <stop offset="100%" stopColor={COLORS.present} stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="grad-late" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLORS.late} stopOpacity="0.15" />
                        <stop offset="100%" stopColor={COLORS.late} stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="grad-absent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLORS.absent} stopOpacity="0.15" />
                        <stop offset="100%" stopColor={COLORS.absent} stopOpacity="0" />
                    </linearGradient>
                </defs>

                {/* Grid lines */}
                {[0, 0.25, 0.5, 0.75, 1].map(t => {
                    const y = PADDING.top + (1 - t) * chartH;
                    return (
                        <g key={t}>
                            <line x1={PADDING.left} y1={y} x2={W - PADDING.right} y2={y} stroke="#f1f5f9" strokeWidth="1" />
                            <text x={PADDING.left - 4} y={y + 4} textAnchor="end" fontSize="9" fill="#94a3b8">
                                {Math.round(maxVal * t)}
                            </text>
                        </g>
                    );
                })}

                {/* Area fills */}
                <path d={areaPath(presentPts)} fill="url(#grad-present)" />
                <path d={areaPath(latePts)}    fill="url(#grad-late)" />
                <path d={areaPath(absentPts)}  fill="url(#grad-absent)" />

                {/* Lines */}
                <path d={buildPath(presentPts)} fill="none" stroke={COLORS.present} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d={buildPath(latePts)}    fill="none" stroke={COLORS.late}    strokeWidth="2"   strokeLinecap="round" strokeLinejoin="round" />
                <path d={buildPath(absentPts)}  fill="none" stroke={COLORS.absent}  strokeWidth="2"   strokeLinecap="round" strokeLinejoin="round" />

                {/* Data points */}
                {presentPts.map(([x, y], i) => (
                    <circle key={i} cx={x} cy={y} r="4" fill="white" stroke={COLORS.present} strokeWidth="2.5" />
                ))}

                {/* X-axis labels */}
                {data.map((d, i) => {
                    const x = getX(i);
                    const label = new Date(d.date).toLocaleDateString('en-PK', { weekday: 'short', day: 'numeric' });
                    return (
                        <text key={i} x={x} y={H - 6} textAnchor="middle" fontSize="9.5" fill="#94a3b8" fontWeight="600">
                            {label}
                        </text>
                    );
                })}
            </svg>

            {/* Legend */}
            <div className="flex items-center gap-6 mt-3 justify-center">
                {[
                    { label: 'Present', color: COLORS.present },
                    { label: 'Late',    color: COLORS.late    },
                    { label: 'Absent',  color: COLORS.absent  },
                ].map(l => (
                    <div key={l.label} className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: l.color }} />
                        <span className="text-xs font-semibold text-slate-500">{l.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default WeeklyTrendChart;
