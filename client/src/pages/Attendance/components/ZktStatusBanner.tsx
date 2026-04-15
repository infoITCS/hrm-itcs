import { Wifi, WifiOff, AlertTriangle, RefreshCw, Clock } from 'lucide-react';

interface ZktStatusBannerProps {
    reachable: boolean;
    latencyMs?: number;
    error?: string;
    lastSyncAt?: string | null;
    totalSynced?: number;
    retryIn?: number;          // seconds until next auto-retry
    onManualRetry?: () => void;
    loading?: boolean;
}

const ZktStatusBanner = ({
    reachable,
    latencyMs,
    error,
    lastSyncAt,
    totalSynced,
    retryIn,
    onManualRetry,
    loading = false,
}: ZktStatusBannerProps) => {
    if (loading) {
        return (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-sm animate-pulse">
                <RefreshCw size={15} className="animate-spin shrink-0" />
                <span>Checking ZKTeco server connection…</span>
            </div>
        );
    }

    if (reachable) {
        return (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
                <Wifi size={15} className="shrink-0 text-emerald-500" />
                <span className="font-semibold">ZKTeco Cloud Connected</span>
                {latencyMs != null && (
                    <span className="text-emerald-500 text-xs">· {latencyMs}ms</span>
                )}
                <span className="ml-auto flex items-center gap-3 text-xs text-emerald-600 font-medium">
                    {totalSynced != null && (
                        <span>{totalSynced.toLocaleString()} records synced</span>
                    )}
                    {lastSyncAt && (
                        <span className="flex items-center gap-1 text-emerald-500">
                            <Clock size={11} />
                            Last sync: {new Date(lastSyncAt).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                    )}
                </span>
            </div>
        );
    }

    return (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
            <WifiOff size={15} className="shrink-0 text-rose-500 mt-0.5" />
            <div className="flex-1 min-w-0">
                <span className="font-semibold block">ZKTeco Server Unreachable</span>
                {error && (
                    <span className="text-xs text-rose-500 block mt-0.5 truncate">
                        <AlertTriangle size={10} className="inline mr-1" />
                        {error}
                    </span>
                )}
                <span className="text-xs text-rose-400 block mt-0.5">
                    Server: 192.168.0.74:8081 · Make sure both devices are on the same network.
                </span>
            </div>
            <div className="ml-auto flex items-center gap-3 shrink-0">
                {retryIn != null && retryIn > 0 && (
                    <span className="text-xs text-rose-400">Retry in {retryIn}s</span>
                )}
                {onManualRetry && (
                    <button
                        onClick={onManualRetry}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-lg text-xs font-semibold transition-colors"
                    >
                        <RefreshCw size={12} />
                        Retry Now
                    </button>
                )}
            </div>
        </div>
    );
};

export default ZktStatusBanner;
