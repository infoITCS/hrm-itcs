import { useState, useEffect, useRef } from 'react';
import { Fingerprint, Clock, User, Wifi } from 'lucide-react';
import { api } from '../../../utils/api';

interface LivePunchFeedProps {
    location?: string;
    limit?: number;
    refreshKey?: boolean;
    showDeviceInfo?: boolean;
}

interface Punch {
    _id: string;
    employeeId: string;
    machineUserId: string;
    punchTime: string;
    punchStatus: number;
    verifyType: number;
    deviceSN: string;
    location: string;
}

const VERIFY_LABEL: Record<number, string> = {
    0: 'Password',
    1: 'Fingerprint',
    3: 'Card',
    4: 'Face',
    15: 'Face+Finger',
};

const STATUS_LABEL: Record<number, { label: string; color: string }> = {
    0: { label: 'Check In',  color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
    1: { label: 'Check Out', color: 'text-rose-600 bg-rose-50 border-rose-200' },
    2: { label: 'Break Out', color: 'text-amber-600 bg-amber-50 border-amber-200' },
    3: { label: 'Break In',  color: 'text-amber-600 bg-amber-50 border-amber-200' },
    4: { label: 'OT In',     color: 'text-violet-600 bg-violet-50 border-violet-200' },
    5: { label: 'OT Out',    color: 'text-violet-600 bg-violet-50 border-violet-200' },
};

const LivePunchFeed = ({ location, limit = 20, refreshKey, showDeviceInfo = false }: LivePunchFeedProps) => {
    const [punches, setPunches] = useState<Punch[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
    const prevIdsRef = useRef<Set<string>>(new Set());
    const [newIds, setNewIds] = useState<Set<string>>(new Set());

    const token = localStorage.getItem('token');

    const fetchFeed = async () => {
        try {
            const locParam = location ? `&location=${encodeURIComponent(location)}` : '';
            const r = await fetch(`${api.attendanceLiveFeed}?limit=${limit}${locParam}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const d = await r.json();
            if (d.success) {
                const incoming: Punch[] = d.data;
                const prevIds = prevIdsRef.current;
                const freshIds = new Set(incoming.filter(p => !prevIds.has(p._id)).map(p => p._id));
                setNewIds(freshIds);
                prevIdsRef.current = new Set(incoming.map(p => p._id));
                setPunches(incoming);
                setLastUpdated(new Date());
                // Clear highlight after 3 seconds
                if (freshIds.size > 0) {
                    setTimeout(() => setNewIds(new Set()), 3000);
                }
            }
        } catch { /* ignore */ } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFeed();
    }, [location, limit]);

    // Auto-refresh every 15 seconds
    useEffect(() => {
        if (refreshKey === false) return;
        const id = setInterval(fetchFeed, 15_000);
        return () => clearInterval(id);
    }, [refreshKey, location, limit]);

    if (loading) {
        return (
            <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 animate-pulse">
                        <div className="w-10 h-10 rounded-xl bg-slate-100" />
                        <div className="flex-1 space-y-2">
                            <div className="h-3 w-24 bg-slate-100 rounded-full" />
                            <div className="h-3 w-40 bg-slate-100 rounded-full" />
                        </div>
                        <div className="h-6 w-20 bg-slate-100 rounded-lg" />
                    </div>
                ))}
            </div>
        );
    }

    if (!punches.length) {
        return (
            <div className="text-center py-12 text-slate-400">
                <Wifi size={40} className="mx-auto mb-3 text-slate-300" />
                <p className="font-medium">No punch data yet</p>
                <p className="text-sm mt-1">Waiting for device connection…</p>
                <p className="text-xs mt-3 text-slate-300">
                    Configure machine to push to: <code className="bg-slate-100 px-2 py-0.5 rounded text-slate-500 text-xs">/api/attendance/iclock/cdata</code>
                </p>
            </div>
        );
    }

    return (
        <div>
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar">
                {punches.map((p) => {
                    const statusInfo = STATUS_LABEL[p.punchStatus] ?? { label: 'Unknown', color: 'text-slate-600 bg-slate-50 border-slate-200' };
                    const isNew = newIds.has(p._id);

                    return (
                        <div
                            key={p._id}
                            className={`flex items-center gap-4 p-4 rounded-xl border transition-all duration-500 ${
                                isNew
                                    ? 'border-indigo-200 bg-indigo-50/60 shadow-md shadow-indigo-100'
                                    : 'border-slate-100 bg-white hover:bg-slate-50/50'
                            }`}
                        >
                            {/* Icon */}
                            <div className={`p-2.5 rounded-xl shrink-0 ${
                                p.punchStatus === 0
                                    ? 'bg-emerald-100 text-emerald-600'
                                    : p.punchStatus === 1
                                    ? 'bg-rose-100 text-rose-600'
                                    : 'bg-indigo-100 text-indigo-600'
                            }`}>
                                <Fingerprint size={20} />
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-slate-800 text-sm">
                                        {(p as any).employeeName ?? `Employee ${p.employeeId}`}
                                    </span>
                                    {(p as any).employeeName && (
                                        <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono">
                                            {p.employeeId}
                                        </span>
                                    )}
                                    {isNew && (
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full animate-pulse">
                                            NEW
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                                    <span className="flex items-center gap-1">
                                        <Clock size={11} />
                                        {new Date(p.punchTime).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    </span>
                                    <span>{new Date(p.punchTime).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}</span>
                                    <span>{VERIFY_LABEL[p.verifyType] ?? 'Unknown'}</span>
                                    {showDeviceInfo && (
                                        <span className="flex items-center gap-1 text-slate-300">
                                            <Wifi size={10} />
                                            {p.deviceSN} • {p.location}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Status badge */}
                            <span className={`text-xs font-bold px-3 py-1.5 rounded-lg border shrink-0 ${statusInfo.color}`}>
                                {statusInfo.label}
                            </span>
                        </div>
                    );
                })}
            </div>

            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                <span>Showing {punches.length} recent punches</span>
                <span>Last updated: {lastUpdated.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            </div>
        </div>
    );
};

export default LivePunchFeed;
