import { useState, useEffect, useCallback } from 'react';
import { attendanceApi } from '../api/attendanceApi';
import type { AttendanceSummary } from '../types';

export function useAttendanceSummary(date: string, location?: string) {
    const [data, setData] = useState<AttendanceSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetch = useCallback(async (silent = false, signal?: AbortSignal) => {
        if (!silent) setLoading(true);
        setError(null);
        try {
            const summary = await attendanceApi.getSummary(date, location, signal);
            setData(summary);
        } catch (e: any) {
            if (e.name === 'AbortError') return;
            setError(e.message);
        } finally {
            if (!silent && (!signal || !signal.aborted)) setLoading(false);
        }
    }, [date, location]);

    useEffect(() => {
        const controller = new AbortController();
        fetch(false, controller.signal);
        return () => controller.abort();
    }, [fetch]);

    return { data, loading, error, refresh: fetch };
}
