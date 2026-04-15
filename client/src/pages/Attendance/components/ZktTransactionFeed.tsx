import { useRef } from 'react';
import { Fingerprint, Clock, ArrowUpCircle, ArrowDownCircle, Wifi } from 'lucide-react';
import type { ZktTransaction } from '../../../services/zktService';

interface ZktTransactionFeedProps {
    transactions: ZktTransaction[];
    newIds: Set<number>;
    loading?: boolean;
}

// punch_state: "0"=IN, "1"=OUT, "2"=Break Out, "3"=Break In, "4"=OT In, "5"=OT Out
const PUNCH_STATE: Record<string, { label: string; color: string; Icon: React.ElementType; dot: string }> = {
    '0': { label: 'IN',       color: 'text-emerald-700 bg-emerald-50 border-emerald-200', Icon: ArrowDownCircle, dot: 'bg-emerald-400' },
    '1': { label: 'OUT',      color: 'text-rose-700 bg-rose-50 border-rose-200',         Icon: ArrowUpCircle,   dot: 'bg-rose-400'    },
    '2': { label: 'Break Out',color: 'text-amber-700 bg-amber-50 border-amber-200',       Icon: ArrowUpCircle,   dot: 'bg-amber-400'   },
    '3': { label: 'Break In', color: 'text-amber-700 bg-amber-50 border-amber-200',       Icon: ArrowDownCircle, dot: 'bg-amber-400'   },
    '4': { label: 'OT In',    color: 'text-violet-700 bg-violet-50 border-violet-200',    Icon: ArrowDownCircle, dot: 'bg-violet-400'  },
    '5': { label: 'OT Out',   color: 'text-violet-700 bg-violet-50 border-violet-200',    Icon: ArrowUpCircle,   dot: 'bg-violet-400'  },
};

const SkeletonRow = () => (
    <div className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 animate-pulse">
        <div className="w-10 h-10 rounded-xl bg-slate-100 shrink-0" />
        <div className="flex-1 space-y-2">
            <div className="h-3 w-28 bg-slate-100 rounded-full" />
            <div className="h-3 w-44 bg-slate-100 rounded-full" />
        </div>
        <div className="h-7 w-16 bg-slate-100 rounded-lg shrink-0" />
    </div>
);

const ZktTransactionFeed = ({ transactions, newIds, loading = false }: ZktTransactionFeedProps) => {
    const feedRef = useRef<HTMLDivElement>(null);

    if (loading) {
        return (
            <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
            </div>
        );
    }

    if (!transactions.length) {
        return (
            <div className="text-center py-14 text-slate-400">
                <Wifi size={40} className="mx-auto mb-3 text-slate-300" />
                <p className="font-semibold">No transactions yet</p>
                <p className="text-sm mt-1">Waiting for ZKTeco Cloud data…</p>
            </div>
        );
    }

    return (
        <div ref={feedRef} className="space-y-2 max-h-[480px] overflow-y-auto pr-1 custom-scrollbar">
            {transactions.map((txn) => {
                const state   = PUNCH_STATE[txn.punch_state] ?? { label: txn.punch_state, color: 'text-slate-600 bg-slate-50 border-slate-200', Icon: Fingerprint, dot: 'bg-slate-400' };
                const isNew   = newIds.has(txn.id);
                const isIn    = txn.punch_state === '0' || txn.punch_state === '3' || txn.punch_state === '4';
                const StateIcon = state.Icon;

                return (
                    <div
                        key={txn.id}
                        className={`flex items-center gap-4 p-4 rounded-xl border transition-all duration-500 ${
                            isNew
                                ? 'border-indigo-200 bg-indigo-50/70 shadow-md shadow-indigo-100 scale-[1.005]'
                                : 'border-slate-100 bg-white hover:bg-slate-50/60'
                        }`}
                    >
                        {/* Icon */}
                        <div className={`p-2.5 rounded-xl shrink-0 ${isIn ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                            <StateIcon size={20} />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-slate-800 text-sm">
                                    {txn.emp_code}
                                </span>
                                {isNew && (
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full animate-pulse">
                                        NEW
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                                <span className="flex items-center gap-1">
                                    <Clock size={11} />
                                    {new Date(txn.punch_time).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                                <span>
                                    {new Date(txn.punch_time).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </span>
                                {txn.area_alias && (
                                    <span className="text-slate-300">· {txn.area_alias}</span>
                                )}
                                {txn.terminal_sn && (
                                    <span className="font-mono text-slate-300 text-[10px]">{txn.terminal_sn}</span>
                                )}
                            </div>
                        </div>

                        {/* Punch badge */}
                        <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${state.color}`}>
                                {state.label}
                            </span>
                            <span className="text-[10px] text-slate-300 font-mono">#{txn.id}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default ZktTransactionFeed;
