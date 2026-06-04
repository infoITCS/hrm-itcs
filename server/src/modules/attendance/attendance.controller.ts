import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import * as svc from './attendance.service';
import * as repo from './attendance.repository';
import { runZktSync, checkServerStatus, fetchEmployees, fetchTransactions, fetchReport } from '../../services/zktCloudService';
import { generateCSV } from '../../utils/csv';
import { todayPKT } from '../../shared/utils/dateUtils';
import logger from '../../utils/logger';
import type { RecordFilter } from './attendance.types';
import { AttendanceStatus } from '../../models/AttendanceRecord';

const VALID_STATUSES: AttendanceStatus[] = [
    'Present','Absent','Late','Half-Day','Early Leave','On Leave','Holiday','Weekend','Incomplete'
];

// ─── Helper ───────────────────────────────────────────────────────────────────

function buildRecordFilter(req: AuthRequest): RecordFilter {
    const filter: RecordFilter = {};
    const q = req.query as Record<string, string>;

    if (q.date) filter.date = q.date;
    else if (q.startDate && q.endDate) filter.date = { from: q.startDate, to: q.endDate };

    if (q.location) filter.location = q.location;

    if (q.status) {
        if (q.status === 'OnTime') { 
            filter.status = ['Present', 'Half-Day', 'Incomplete']; 
            filter.lateMinutes = { max: 0 }; 
        }
        else if (q.status === 'Present') filter.status = ['Present', 'Late', 'Half-Day', 'Incomplete'];
        else if (q.status === 'Late') filter.lateMinutes = { min: 1 };
        else if (q.status === 'StillIn') filter.status = 'Incomplete';
        else filter.status = q.status as AttendanceStatus;
    }

    // teamScope set by scopeToTeam middleware
    if (req.teamScope !== null && req.teamScope !== undefined) {
        if (req.teamScope.length === 0) { 
            filter.employeeId = []; 
            return filter; 
        }
        if (q.employeeId) {
            filter.employeeId = req.teamScope.includes(q.employeeId) ? q.employeeId : [];
        } else {
            filter.employeeId = req.teamScope;
        }
    } else {
        if (q.employeeId) filter.employeeId = q.employeeId;
    }

    return filter;
}

// ─── Controllers ──────────────────────────────────────────────────────────────

export async function getToday(req: AuthRequest, res: Response) {
    try {
        const location = req.query.location as string | undefined;
        const summary = await svc.getDashboardSummary(todayPKT(), location, req.teamScope);
        res.json({ success: true, data: summary });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function getSummary(req: AuthRequest, res: Response) {
    try {
        const date = (req.query.date as string) || todayPKT();
        const location = req.query.location as string | undefined;
        const summary = await svc.getDashboardSummary(date, location, req.teamScope);
        res.json({ success: true, data: summary });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function getWeekly(req: AuthRequest, res: Response) {
    try {
        const endDate = (req.query.endDate as string) || todayPKT();
        const location = req.query.location as string | undefined;
        const data = await svc.getWeeklyTrend(endDate, location, req.teamScope);
        res.json({ success: true, data });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function getRecords(req: AuthRequest, res: Response) {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 25, 200);

        // Employee role: always scoped to own records
        if (req.user?.role === 'employee') {
            const emp = await repo.findEmployeeByUserId(req.user.userId);
            if (!emp) return res.json({ success: true, data: [], pagination: { page, limit, total: 0, pages: 0 } });
            const filter: RecordFilter = { employeeId: emp.employeeId };
            if (req.query.date) filter.date = req.query.date as string;
            else if (req.query.startDate && req.query.endDate) {
                filter.date = { from: req.query.startDate as string, to: req.query.endDate as string };
            }
            const result = await svc.getAttendanceRecords(filter, page, limit);
            return res.json({ success: true, ...result });
        }

        const filter = buildRecordFilter(req);
        const result = await svc.getAttendanceRecords(filter, page, limit);
        res.json({ success: true, ...result });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function getPunches(req: AuthRequest, res: Response) {
    try {
        const { employeeId, date } = req.query as Record<string, string>;
        if (!employeeId || !date) return res.status(400).json({ success: false, message: 'employeeId and date required' });

        // Authorization: Employee can only see their own punches
        if (req.user?.role === 'employee') {
            const emp = await repo.findEmployeeByUserId(req.user.userId);
            if (!emp || emp.employeeId !== employeeId) {
                return res.status(403).json({ success: false, message: 'Access denied: You can only view your own punches.' });
            }
        }

        const punches = await repo.findPunchesForDay(employeeId, date);
        res.json({ success: true, data: punches });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function updateRecord(req: AuthRequest, res: Response) {
    try {
        const { checkIn, checkOut, status, note } = req.body;
        const record = await repo.findRecordById(req.params.id);
        if (!record) return res.status(404).json({ success: false, message: 'Record not found' });

        // Authorization: only super-admin/admin/manager can modify records
        if (!['super-admin', 'admin', 'manager'].includes(req.user?.role || '')) {
            return res.status(403).json({ success: false, message: 'Access denied: only Admin, Super Admin, or Manager can update records.' });
        }

        if (status && !VALID_STATUSES.includes(status)) {
            return res.status(400).json({ success: false, message: `Invalid status: ${VALID_STATUSES.join(', ')}` });
        }

        // Validate date ordering
        const finalIn = checkIn ? new Date(checkIn) : (record.checkIn ? new Date(record.checkIn) : null);
        const finalOut = checkOut ? new Date(checkOut) : (record.checkOut ? new Date(record.checkOut) : null);
        
        if (finalIn && isNaN(finalIn.getTime())) return res.status(400).json({ success: false, message: 'Invalid checkIn date' });
        if (finalOut && isNaN(finalOut.getTime())) return res.status(400).json({ success: false, message: 'Invalid checkOut date' });

        if (finalIn && finalOut && finalOut <= finalIn) {
            return res.status(400).json({ success: false, message: 'checkOut must be after checkIn' });
        }

        if (note && note.length > 500) {
            return res.status(400).json({ success: false, message: 'Note too long (max 500 chars)' });
        }

        if (checkIn) (record as any).checkIn = new Date(checkIn);
        if (checkOut) (record as any).checkOut = new Date(checkOut);
        if (status) (record as any).status = status;
        if (note !== undefined) (record as any).note = note;

        if ((record as any).checkIn && (record as any).checkOut) {
            (record as any).workDurationMinutes = Math.floor(
                ((record as any).checkOut.getTime() - (record as any).checkIn.getTime()) / 60000
            );
        }
        (record as any).manuallyAdjusted = true;
        (record as any).adjustedBy = req.user?.userId;
        await record.save();
        res.json({ success: true, data: record });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function createManualRecord(req: AuthRequest, res: Response) {
    try {
        const { employeeId, date, checkIn, checkOut, status, note, location } = req.body;
        if (!employeeId || !date) return res.status(400).json({ success: false, message: 'employeeId and date required' });

        if (status && !VALID_STATUSES.includes(status)) {
            return res.status(400).json({ success: false, message: `Invalid status: ${VALID_STATUSES.join(', ')}` });
        }

        const dIn = checkIn ? new Date(checkIn) : null;
        const dOut = checkOut ? new Date(checkOut) : null;

        if (dIn && isNaN(dIn.getTime())) return res.status(400).json({ success: false, message: 'Invalid checkIn date' });
        if (dOut && isNaN(dOut.getTime())) return res.status(400).json({ success: false, message: 'Invalid checkOut date' });

        if (dIn && dOut && dOut <= dIn) {
            return res.status(400).json({ success: false, message: 'checkOut must be after checkIn' });
        }

        const allPunches = [dIn, dOut].filter(Boolean) as Date[];
        const workDurationMinutes = dIn && dOut
            ? Math.max(0, Math.floor((dOut.getTime() - dIn.getTime()) / 60000))
            : 0;

        const record = await repo.upsertRecord(employeeId, date, {
            location: location ?? 'ISB-Office',
            checkIn: dIn ?? undefined,
            checkOut: dOut ?? undefined,
            workDurationMinutes,
            allPunches,
            status: status ?? 'Present',
            note,
            manuallyAdjusted: true,
            adjustedBy: req.user?.userId,
        });
        res.json({ success: true, data: record });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function getLiveFeed(req: AuthRequest, res: Response) {
    try {
        const limit = parseInt(req.query.limit as string) || 20;
        const location = req.query.location as string | undefined;
        const dateStr = (req.query.date as string) || todayPKT();

        const extraFilter: Record<string, any> = {};
        if (location) {
            const devicesInLocation = await repo.findAllDevices() as any[];
            const sns = devicesInLocation.filter((d) => d.locationName === location).map((d) => d.deviceSN);
            extraFilter.deviceSN = { $in: sns };
        }

        const punches = await repo.findRecentPunches(dateStr, limit, extraFilter) as any[];
        const pins = [...new Set(punches.map((p) => String(p.machineUserId)).filter(Boolean))];
        const [hrmEmployees, allDevices] = await Promise.all([
            pins.length > 0 ? repo.findEmployeesByPins(pins) : Promise.resolve([]),
            repo.findAllDevices()
        ]);

        const snToLoc = new Map(allDevices.map(d => [d.deviceSN, d.locationName]));
        const hrmMap = new Map(hrmEmployees.map((e) => [`${e.jobInfo?.workLocation}_${e.biometricPin}`, e]));

        const empIds = [...new Set(punches.map((p) => {
            const punchLoc = snToLoc.get(p.deviceSN) || p.location || location || 'ISB-Office';
            const emp = hrmMap.get(`${punchLoc}_${p.machineUserId}`);
            return emp?.employeeId || p.employeeId;
        }))];
        const recordsForDay = await repo.findRecordsForDate(dateStr, { employeeId: { $in: empIds } }) as any[];
        const recMap = new Map(recordsForDay.map((r) => [r.employeeId, r]));

        const enriched = punches.map((p) => {
            const punchLoc = snToLoc.get(p.deviceSN) || p.location || location || 'ISB-Office';
            const emp = hrmMap.get(`${punchLoc}_${p.machineUserId}`);
            const empId = emp?.employeeId || p.employeeId;
            const rec = recMap.get(empId);
            return {
                ...p,
                location: punchLoc,
                employeeName: p.employeeName || (emp ? `${emp.firstName} ${emp.lastName}` : `User ${p.machineUserId}`),
                avatar: emp?.avatar,
                employeeId: empId,
                attendanceStatus: rec?.status,
                lateMinutes: rec?.lateMinutes || 0,
            };
        });

        res.json({ success: true, data: enriched });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function getTodayRoster(req: AuthRequest, res: Response) {
    try {
        const dateStr = (req.query.date as string) || todayPKT();
        const location = req.query.location as string | undefined;
        const roster = await svc.getTodayRoster(dateStr, location, req.teamScope);
        res.json({ success: true, data: roster });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function getLocations(_req: AuthRequest, res: Response) {
    try {
        const devices = await repo.findAllDevices() as any[];
        const names = [...new Set(devices.map((d) => d.locationName))];
        res.json({ success: true, data: names });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function getDevices(_req: AuthRequest, res: Response) {
    try {
        const devices = await repo.findAllDevices();
        res.json({ success: true, data: devices });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function updateDevice(req: AuthRequest, res: Response) {
    try {
        const device = await repo.upsertDevice(req.params.sn, req.body);
        if (!device) return res.status(404).json({ success: false, message: 'Device not found' });
        res.json({ success: true, data: device });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function exportCSV(req: AuthRequest, res: Response) {
    try {
        const filter = buildRecordFilter(req);
        const { data } = await svc.getAttendanceRecords(filter, 1, 5000);
        const columns = [
            { header: 'Employee ID', key: 'employeeId' },
            { header: 'Date', key: 'date' },
            { header: 'Location', key: 'location' },
            { header: 'Check In', key: 'checkIn' },
            { header: 'Check Out', key: 'checkOut' },
            { header: 'Work Minutes', key: 'workDurationMinutes' },
            { header: 'Status', key: 'status' },
            { header: 'Late (Min)', key: 'lateMinutes' },
            { header: 'OT (Min)', key: 'overtimeMinutes' },
            { header: 'Note', key: 'note' },
        ];
        const csv = generateCSV(data, columns);
        const { startDate, endDate } = req.query as Record<string, string>;
        
        // Sanitize headers to prevent injection
        const sanitize = (val: string) => val.replace(/[^A-Za-z0-9_\-\.]/g, '').slice(0, 20);
        const s = sanitize(startDate || 'Report');
        const e = sanitize(endDate || '');
        const filename = `Attendance_${s}${e ? '_' + e : ''}.csv`;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        res.send(csv);
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

// ─── ZKT Cloud Proxy ──────────────────────────────────────────────────────────

export async function zktGetStatus(_req: AuthRequest, res: Response) {
    try {
        const status = await checkServerStatus();
        res.json({ success: true, data: status });
    } catch (err: any) { res.json({ success: true, data: { reachable: false, error: err.message } }); }
}

export async function zktGetEmployees(_req: AuthRequest, res: Response) {
    try {
        const employees = await fetchEmployees();
        res.json({ success: true, count: employees.length, data: employees });
    } catch (err: any) { res.status(503).json({ success: false, message: err.message }); }
}

export async function zktGetTransactions(req: AuthRequest, res: Response) {
    try {
        const lastId = req.query.last_id ? parseInt(req.query.last_id as string, 10) : null;
        const txns = await fetchTransactions(lastId);
        res.json({ success: true, count: txns.length, data: txns });
    } catch (err: any) { res.status(503).json({ success: false, message: err.message }); }
}

export async function zktGetReport(req: AuthRequest, res: Response) {
    try {
        const { start_date, end_date } = req.query as Record<string, string>;
        if (!start_date || !end_date) return res.status(400).json({ success: false, message: 'start_date and end_date required' });
        const report = await fetchReport(start_date, end_date);
        res.json({ success: true, count: report.length, data: report });
    } catch (err: any) { res.status(503).json({ success: false, message: err.message }); }
}

export async function zktGetSyncState(_req: AuthRequest, res: Response) {
    try {
        const state = await repo.getOrCreateSyncState();
        res.json({ success: true, data: state });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function zktTriggerSync(_req: AuthRequest, res: Response) {
    try {
        const result = await runZktSync();
        res.json({ success: true, data: result });
    } catch (err: any) { res.status(503).json({ success: false, message: err.message }); }
}

export async function zktSyncReport(req: AuthRequest, res: Response) {
    try {
        const date = (req.query.date as string) || todayPKT();
        const count = await svc.syncFromMachineReport(date);
        res.json({ success: true, message: `Synced ${count} records for ${date}` });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function adminAutoClose(req: AuthRequest, res: Response) {
    try {
        const date = (req.query.date as string) || todayPKT();
        const result = await svc.autoCloseIncompleteRecords(date);
        res.json({ success: true, message: `Auto-close complete. Processed: ${result.processed}, Skipped: ${result.skipped}`, data: result });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function getEmployeeMonthly(req: AuthRequest, res: Response) {
    try {
        let { employeeId } = req.params;

        if (employeeId === 'me' || req.user?.role === 'employee') {
            const emp = await repo.findEmployeeByUserId(req.user!.userId);
            if (!emp) return res.status(404).json({ success: false, message: 'Employee profile not found' });
            
            if (req.user?.role === 'employee' && employeeId !== 'me' && employeeId !== emp.employeeId) {
                return res.status(403).json({ success: false, message: 'Access denied: You can only view your own records.' });
            }
            if (employeeId === 'me') employeeId = emp.employeeId;
        }

        const month = (req.query.month as string) || todayPKT().slice(0, 7);
        const data = await svc.getEmployeeMonthlyAttendance(employeeId, month);
        res.json({ success: true, data });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function exportMonthly(req: AuthRequest, res: Response) {
    try {
        let { employeeId } = req.params;

        if (employeeId === 'me' || req.user?.role === 'employee') {
            const emp = await repo.findEmployeeByUserId(req.user!.userId);
            if (!emp) return res.status(404).json({ success: false, message: 'Employee profile not found' });
            
            if (req.user?.role === 'employee' && employeeId !== 'me' && employeeId !== emp.employeeId) {
                return res.status(403).json({ success: false, message: 'Access denied: You can only view your own records.' });
            }
            if (employeeId === 'me') employeeId = emp.employeeId;
        }

        const month = (req.query.month as string) || todayPKT().slice(0, 7);
        const csv = await svc.generateMonthlyCSV(month, employeeId);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=attendance_${employeeId}_${month}.csv`);
        res.status(200).send(csv);
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function exportGlobalMonthly(req: AuthRequest, res: Response) {
    try {
        const month = (req.query.month as string) || todayPKT().slice(0, 7);
        const csv = await svc.generateMonthlyCSV(month);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=attendance_all_${month}.csv`);
        res.status(200).send(csv);
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function exportDaily(req: AuthRequest, res: Response) {
    try {
        let { employeeId } = req.params;

        if (employeeId === 'me' || req.user?.role === 'employee') {
            const emp = await repo.findEmployeeByUserId(req.user!.userId);
            if (!emp) return res.status(404).json({ success: false, message: 'Employee profile not found' });

            if (req.user?.role === 'employee' && employeeId !== 'me' && employeeId !== emp.employeeId) {
                return res.status(403).json({ success: false, message: 'Access denied: You can only view your own records.' });
            }
            if (employeeId === 'me') employeeId = emp.employeeId;
        }

        const date = (req.query.date as string) || todayPKT();
        const csv = await svc.generateDailyCSV(date, employeeId);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=attendance_${employeeId}_${date}.csv`);
        res.status(200).send(csv);
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}

export async function exportGlobalDaily(req: AuthRequest, res: Response) {
    try {
        const date = (req.query.date as string) || todayPKT();
        const csv = await svc.generateDailyCSV(date);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=attendance_all_${date}.csv`);
        res.status(200).send(csv);
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
}
