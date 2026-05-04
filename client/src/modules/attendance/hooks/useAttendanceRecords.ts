import { useState, useEffect, useCallback } from 'react';
import { attendanceApi } from '../api/attendanceApi';
import type { AttendanceRecord, PaginationMeta, StatusFilter } from '../types';

export interface RecordOptions {
    date?: string;
    startDate?: string;
    endDate?: string;
    status?: StatusFilter;
    location?: string;
    employeeId?: string;
    page?: number;
    limit?: number;
}

export function useAttendanceRecords(options: RecordOptions, enabled = true) {
    const [data, setData] = useState<AttendanceRecord[]>([]);
    const [pagination, setPagination] = useState<PaginationMeta | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetch = useCallback(async () => {
        if (!enabled) return;
        setLoading(true);
        setError(null);
        try {
            const result = await attendanceApi.getRecords({
                page: options.page || 1,
                limit: options.limit || 25,
                date: options.date,
                startDate: options.startDate,
                endDate: options.endDate,
                status: options.status || undefined,
                location: options.location,
                employeeId: options.employeeId,
            });
            setData(result.data);
            setPagination(result.pagination);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(options), enabled]);

    useEffect(() => { fetch(); }, [fetch]);

    return { data, pagination, loading, error, refresh: fetch };
}
