import { type LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

type Color = 'emerald' | 'amber' | 'rose' | 'indigo' | 'violet' | 'orange' | 'slate';

interface StatCardProps {
    title: string;
    value: string;
    subtitle?: string;
    icon: LucideIcon;
    color: Color;
    trend?: 'up' | 'down' | 'neutral';
}

const COLOR_MAP: Record<Color, { icon: string; bg: string; border: string; badge: string }> = {
    emerald: { icon: 'text-emerald-600', bg: 'bg-emerald-50',  border: 'border-emerald-100', badge: 'bg-emerald-100 text-emerald-700' },
    amber:   { icon: 'text-amber-600',   bg: 'bg-amber-50',    border: 'border-amber-100',   badge: 'bg-amber-100 text-amber-700'   },
    rose:    { icon: 'text-rose-600',     bg: 'bg-rose-50',     border: 'border-rose-100',    badge: 'bg-rose-100 text-rose-700'     },
    indigo:  { icon: 'text-indigo-600',   bg: 'bg-indigo-50',   border: 'border-indigo-100',  badge: 'bg-indigo-100 text-indigo-700' },
    violet:  { icon: 'text-violet-600',   bg: 'bg-violet-50',   border: 'border-violet-100',  badge: 'bg-violet-100 text-violet-700' },
    orange:  { icon: 'text-orange-600',   bg: 'bg-orange-50',   border: 'border-orange-100',  badge: 'bg-orange-100 text-orange-700' },
    slate:   { icon: 'text-slate-600',    bg: 'bg-slate-50',    border: 'border-slate-100',   badge: 'bg-slate-100 text-slate-700'   },
};

const StatCard = ({ title, value, subtitle, icon: Icon, color, trend }: StatCardProps) => {
    const c = COLOR_MAP[color];
    const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
    const trendColor = trend === 'up' ? 'text-emerald-500' : trend === 'down' ? 'text-rose-500' : 'text-slate-400';

    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200 transition-all duration-300 p-5 group">
            <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-xl ${c.bg} ${c.icon} border ${c.border} group-hover:scale-110 transition-transform duration-300`}>
                    <Icon size={24} strokeWidth={2} />
                </div>
                {trend && (
                    <span className={`flex items-center gap-1 text-xs font-bold ${trendColor}`}>
                        <TrendIcon size={14} />
                    </span>
                )}
            </div>
            <p className="text-slate-500 text-sm font-medium mb-1">{title}</p>
            <h3 className="text-3xl font-bold text-slate-800 tracking-tight mb-1">
                {value === '...' ? (
                    <span className="inline-block w-16 h-8 bg-slate-100 rounded-lg animate-pulse" />
                ) : value}
            </h3>
            {subtitle && (
                <p className="text-xs text-slate-400 font-medium">{subtitle}</p>
            )}
        </div>
    );
};

export default StatCard;
