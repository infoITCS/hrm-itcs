import { useState, useEffect, useCallback, useRef } from 'react';
import { attendanceApi } from '../api/attendanceApi';
import type { TodayRosterEntry } from '../types';

const POLL_INTERVAL_MS = 30_000;

export function useRoster(date?: string, location?: string, enabled = true) {
    const [data, setData] = useState<TodayRosterEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const mountedRef = useRef(true);

    const fetch = useCallback(async (silent = false, signal?: AbortSignal) => {
        if (!enabled) return;
        if (!silent) setLoading(true);
        setError(null);
        try {
            const roster = await attendanceApi.getRoster(date, location, signal);
            if (mountedRef.current) setData(roster);
        } catch (e: any) {
            if (e.name === 'AbortError') return;
            if (mountedRef.current) setError(e.message);
        } finally {
            if (mountedRef.current && !silent) setLoading(false);
        }
    }, [date, location, enabled]);

    useEffect(() => {
        mountedRef.current = true;
        const controller = new AbortController();
        fetch(false, controller.signal);
        return () => { 
            mountedRef.current = false; 
            controller.abort();
        };
    }, [fetch]);

    // Auto-poll (pauses in background tabs)
    useEffect(() => {
        if (!enabled) return;
        const id = setInterval(() => {
            if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
                fetch(true);
            }
        }, POLL_INTERVAL_MS);
        return () => clearInterval(id);
    }, [fetch, enabled]);

    return { data, loading, error, refresh: fetch };
}
