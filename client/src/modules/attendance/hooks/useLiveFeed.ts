import { useState, useEffect, useCallback, useRef } from 'react';
import { attendanceApi } from '../api/attendanceApi';
import type { LivePunch } from '../types';

const POLL_INTERVAL_MS = 15_000;

export function useLiveFeed(location?: string, date?: string, enabled = true) {
    const [data, setData] = useState<LivePunch[]>([]);
    const [newIds, setNewIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const prevIdsRef = useRef<Set<string>>(new Set());
    const initialLoadRef = useRef(true);

    const fetch = useCallback(async (silent = false) => {
        if (!enabled) return;
        if (!silent) setLoading(true);
        setError(null);
        try {
            const punches = await attendanceApi.getLiveFeed(location, date);
            const incoming = new Set(punches.map((p) => p._id));
            
            // On initial load, just establish the baseline without highlighting everything as new
            if (initialLoadRef.current) {
                prevIdsRef.current = incoming;
                setData(punches);
                setNewIds(new Set());
                initialLoadRef.current = false;
            } else {
                const fresh = new Set([...incoming].filter((id) => !prevIdsRef.current.has(id)));
                prevIdsRef.current = incoming;
                setData(punches);
                setNewIds(fresh);
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [location, date, enabled]);

    useEffect(() => { fetch(); }, [fetch]);

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

    // Clear highlight after 5s
    useEffect(() => {
        if (newIds.size === 0) return;
        const t = setTimeout(() => setNewIds(new Set()), 5000);
        return () => clearTimeout(t);
    }, [newIds]);

    return { data, newIds, loading, error, refresh: fetch };
}
