import { Router, Request, Response } from 'express';
import AttendancePunch from '../models/AttendancePunch';
import AttendanceRecord from '../models/AttendanceRecord';
import DeviceLocation from '../models/DeviceLocation';
import Employee from '../models/Employee';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { processEmployeePunches, getDashboardSummary } from '../services/attendanceProcessor';
import {
    checkServerStatus,
    fetchEmployees,
    fetchTransactions,
    fetchReport,
    runZktSync,
} from '../services/zktCloudService';
import { syncFromMachineReport } from '../services/attendanceProcessor';
import ZktSyncState from '../models/ZktSyncState';
import { generateCSV } from '../utils/csv';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// ZKTeco ADMS endpoints (NO auth — machine talks to these directly)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/attendance/iclock/cdata
 * Heartbeat / configuration request from machine.
 */
router.get('/iclock/cdata', async (req: Request, res: Response) => {
    const SN = (req.query.SN as string) || 'UNKNOWN';
    console.log(`[ADMS] Heartbeat from device: ${SN}`);

    const existing = await DeviceLocation.findOne({ deviceSN: SN });
    if (!existing) {
        await DeviceLocation.create({
            deviceSN: SN,
            locationName: 'Main Office',
            shiftStart: '09:00',
            shiftEnd: '18:00',
            graceMinutes: 15,
            halfDayThresholdHours: 4,
            isActive: true,
        });
        console.log(`[ADMS] Auto-registered new device: ${SN} as "Main Office"`);
    }

    res.set('Content-Type', 'text/plain');
    // ATTLOGStamp=0 tells the machine to send ALL stored attendance records.
    res.send(`GET OPTION FROM: ${SN}\nATTLOGStamp=0\nOPERLOGStamp=9999\nATTPHOTOStamp=9999\nErrorDelay=30\nDelay=10\nTransTimes=00:00;14:05\nTransInterval=1\nTransFlag=TransData AttLog OpLog AttPhoto\nTimeZone=5\nRealtime=1\nEncrypt=0\n`);
});

/**
 * POST /api/attendance/iclock/cdata
 * Machine pushes attendance log data.
 *
 * Supports TWO ATTLOG formats:
 *   Format A (pushver < 2.4):  ATTLOG\tPIN\tDateTime\tStatus\tVerify\t...
 *   Format B (pushver 2.4+):   PIN\tDateTime\tStatus\tVerify\t...\tLogId
 *   SpeedFace V5L sends Format B. Status=255 = generic biometric punch.
 */
router.post('/iclock/cdata', async (req: Request, res: Response) => {
    const SN    = (req.query.SN as string) || 'UNKNOWN';
    const table = (req.query.table as string) || '';

    const rawBody: string = req.body?.toString?.() || '';
    console.log(`[ADMS] POST table=${table} from ${SN} | body preview: ${rawBody.slice(0, 300)}`);

    if (table === 'options') {
        res.set('Content-Type', 'text/plain');
        return res.send('OK\n');
    }

    if (table !== 'ATTLOG') {
        res.set('Content-Type', 'text/plain');
        return res.send('OK: 0\n');
    }

    // ── Dual-format ATTLOG parser ─────────────────────────────────────────────
    const rawLines = rawBody.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
    const parsedPunches: { pin: string; dtStr: string; status: number; verifyType: number }[] = [];

    for (const line of rawLines) {
        const parts = line.split('\t').map((p: string) => p.trim());
        let pin: string, dtStr: string, punchStatus: number, verifyType: number;

        if (parts[0]?.toUpperCase() === 'ATTLOG') {
            // Format A: ATTLOG \t PIN \t DateTime \t Status \t Verify
            if (parts.length < 4) continue;
            pin         = parts[1];
            dtStr       = parts[2];
            punchStatus = parseInt(parts[3] ?? '0', 10);
            verifyType  = parseInt(parts[4] ?? '1', 10);
        } else {
            // Format B (SpeedFace V5L / pushver 2.4+): PIN \t DateTime \t Status \t Verify \t ...
            if (parts.length < 3 || !parts[1]?.match(/^\d{4}-\d{2}-\d{2}/)) continue;
            pin         = parts[0];
            dtStr       = parts[1];
            punchStatus = parseInt(parts[2] ?? '0', 10);
            verifyType  = parseInt(parts[3] ?? '1', 10);
        }

        // Status 255 on SpeedFace V5L = generic biometric punch → treat as Check In (0)
        if (punchStatus === 255) punchStatus = 0;
        if (!pin || !dtStr) continue;
        parsedPunches.push({ pin, dtStr, status: punchStatus, verifyType });
    }

    console.log(`[ADMS] Parsed ${parsedPunches.length} punch(es) from ${SN}`);

    // Fetch location config
    const deviceConfig = await DeviceLocation.findOne({ deviceSN: SN, isActive: true });
    const locationName = deviceConfig?.locationName ?? 'Main Office';

    let savedCount = 0;
    const toProcess = new Set<string>();

    for (const { pin, dtStr, status, verifyType } of parsedPunches) {
        // Resolve machine PIN → HRM employee via biometricPin field
        const employee = await Employee.findOne(
            { biometricPin: pin },
            { employeeId: 1, firstName: 1, lastName: 1 }
        ).lean() as { employeeId: string; firstName: string; lastName: string } | null;

        const employeeId   = employee?.employeeId ?? pin; // fallback to raw PIN if not mapped yet
        const employeeName = employee ? `${employee.firstName} ${employee.lastName}` : undefined;
        if (!employee) {
            console.warn(`[ADMS] No HRM employee mapped to biometricPin="${pin}". Set biometricPin in employee profile.`);
        }


        // Parse datetime — machine sends local PKT (+05:00)
        const punchTime = new Date(dtStr.replace(' ', 'T') + '+05:00');
        if (isNaN(punchTime.getTime())) {
            console.warn(`[ADMS] Invalid datetime: ${dtStr}`);
            continue;
        }

        const dateStr = punchTime.toISOString().slice(0, 10);

        try {
            await AttendancePunch.findOneAndUpdate(
                { deviceSN: SN, machineUserId: pin, punchTime },
                {
                    $setOnInsert: {
                        machineUserId: pin,
                        employeeId,
                        employeeName,
                        punchTime,
                        punchStatus: status,
                        verifyType,
                        deviceSN: SN,
                        location: locationName,
                        processed: false,
                    }
                },
                { upsert: true, new: false }
            );
            savedCount++;
            toProcess.add(`${employeeId}|${dateStr}`);
        } catch (err: any) {
            if (err.code !== 11000) {
                console.error('[ADMS] Error saving punch:', err.message);
            }
        }
    }

    // Trigger processing asynchronously — don't block machine response
    for (const key of toProcess) {
        const [empId, dStr] = key.split('|');
        processEmployeePunches(empId, dStr, SN).catch(console.error);
    }

    console.log(`[ADMS] Device ${SN}: received ${parsedPunches.length} lines, saved ${savedCount} new punches`);
    res.set('Content-Type', 'text/plain');
    res.send(`OK: ${savedCount}\n`);
});

/**
 * GET /api/attendance/iclock/getrequest
 * Machine polls for pending commands — respond with empty (no commands).
 */
router.get('/iclock/getrequest', (req: Request, res: Response) => {
    res.set('Content-Type', 'text/plain');
    res.send('OK\n');
});

/**
 * GET /api/attendance/iclock/ping
 * Firmware 2.4+ ping to verify server connectivity.
 */
router.get('/iclock/ping', (req: Request, res: Response) => {
    const SN = (req.query.SN as string) || 'UNKNOWN';
    console.log(`[ADMS] Ping from device: ${SN}`);
    res.set('Content-Type', 'text/plain');
    res.send('OK\n');
});

/**
 * POST /api/attendance/iclock/devicecmd
 * Machine sends command execution results — acknowledge silently.
 */
router.post('/iclock/devicecmd', (req: Request, res: Response) => {
    res.set('Content-Type', 'text/plain');
    res.send('OK\n');
});

// ─────────────────────────────────────────────────────────────────────────────
// Authenticated HR/Admin API endpoints
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/attendance/today
 */
router.get('/today', authenticate, async (req: Request, res: Response) => {
    try {
        const today = new Date().toISOString().slice(0, 10);
        const { location } = req.query;
        const summary = await getDashboardSummary(today, location as string | undefined);
        res.json({ success: true, data: summary });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /api/attendance/summary?date=YYYY-MM-DD&location=Main Office
 */
router.get('/summary', authenticate, async (req: Request, res: Response) => {
    try {
        const date     = (req.query.date as string) || new Date().toISOString().slice(0, 10);
        const location = req.query.location as string | undefined;
        const summary  = await getDashboardSummary(date, location);
        res.json({ success: true, data: summary });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /api/attendance/weekly?endDate=YYYY-MM-DD&location=...
 */
router.get('/weekly', authenticate, async (req: Request, res: Response) => {
    try {
        const endDate  = (req.query.endDate as string) || new Date().toISOString().slice(0, 10);
        const location = req.query.location as string | undefined;

        const end = new Date(endDate);
        const days: { date: string; present: number; late: number; absent: number; incomplete: number }[] = [];

        for (let i = 6; i >= 0; i--) {
            const d = new Date(end);
            d.setDate(d.getDate() - i);
            const dStr = d.toISOString().slice(0, 10);

            const filter: Record<string, any> = { date: dStr };
            if (location) filter.location = location;

            const records = await AttendanceRecord.find(filter).lean();
            days.push({
                date:       dStr,
                present:    records.filter(r => r.status === 'Present').length,
                late:       records.filter(r => r.status === 'Late').length,
                absent:     records.filter(r => r.status === 'Absent').length,
                incomplete: records.filter(r => r.status === 'Incomplete').length,
            });
        }

        res.json({ success: true, data: days });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /api/attendance/records?page=1&limit=25&...
 */
router.get('/records', authenticate, async (req: Request, res: Response) => {
    try {
        const page  = parseInt(req.query.page  as string) || 1;
        const limit = parseInt(req.query.limit as string) || 25;
        const skip  = (page - 1) * limit;

        const filter: Record<string, any> = {};
        if (req.query.date)       filter.date       = req.query.date;
        if (req.query.startDate && req.query.endDate) {
            filter.date = { $gte: req.query.startDate as string, $lte: req.query.endDate as string };
        }
        if (req.query.status)     filter.status     = req.query.status;
        if (req.query.location)   filter.location   = req.query.location;
        if (req.query.employeeId) filter.employeeId = req.query.employeeId;

        const [records, total] = await Promise.all([
            AttendanceRecord.find(filter).sort({ date: -1, employeeId: 1 }).skip(skip).limit(limit).lean(),
            AttendanceRecord.countDocuments(filter),
        ]);

        res.json({
            success: true,
            data: records,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /api/attendance/punches?employeeId=&date=YYYY-MM-DD
 */
router.get('/punches', authenticate, async (req: Request, res: Response) => {
    try {
        const { employeeId, date } = req.query;
        if (!employeeId || !date) {
            return res.status(400).json({ success: false, message: 'employeeId and date required' });
        }

        const dayStart = new Date(date + 'T00:00:00.000Z');
        const dayEnd   = new Date(date + 'T23:59:59.999Z');

        const punches = await AttendancePunch
            .find({ employeeId, punchTime: { $gte: dayStart, $lte: dayEnd } })
            .sort({ punchTime: 1 })
            .lean();

        res.json({ success: true, data: punches });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * PUT /api/attendance/records/:id — manual correction by admin/manager
 */
router.put(
    '/records/:id',
    authenticate,
    authorize(['super-admin', 'admin', 'manager']),
    async (req: Request, res: Response) => {
        const authReq = req as AuthRequest;
        try {
            const { checkIn, checkOut, status, note } = req.body;
            const record = await AttendanceRecord.findById(req.params.id);
            if (!record) return res.status(404).json({ success: false, message: 'Record not found' });

            if (checkIn)  record.checkIn  = new Date(checkIn);
            if (checkOut) record.checkOut = new Date(checkOut);
            if (status)   record.status   = status;
            if (note !== undefined) record.note = note;

            if (record.checkIn && record.checkOut) {
                record.workDurationMinutes = Math.floor(
                    (record.checkOut.getTime() - record.checkIn.getTime()) / 60000
                );
            }

            record.manuallyAdjusted = true;
            record.adjustedBy       = authReq.user?.userId;
            await record.save();

            res.json({ success: true, data: record });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

/**
 * POST /api/attendance/manual — manually add a record (admin only)
 */
router.post(
    '/manual',
    authenticate,
    authorize(['super-admin', 'admin']),
    async (req: Request, res: Response) => {
        const authReq = req as AuthRequest;
        try {
            const { employeeId, date, checkIn, checkOut, status, note, location } = req.body;
            if (!employeeId || !date) {
                return res.status(400).json({ success: false, message: 'employeeId and date required' });
            }

            const record = await AttendanceRecord.findOneAndUpdate(
                { employeeId, date },
                {
                    $set: {
                        employeeId, date,
                        location:   location ?? 'Main Office',
                        checkIn:    checkIn  ? new Date(checkIn)  : undefined,
                        checkOut:   checkOut ? new Date(checkOut) : undefined,
                        status:     status   ?? 'Present',
                        note,
                        manuallyAdjusted: true,
                        adjustedBy: authReq.user?.userId,
                    }
                },
                { upsert: true, new: true }
            );

            res.json({ success: true, data: record });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// Device / Location management
// ─────────────────────────────────────────────────────────────────────────────

router.get('/devices', authenticate, authorize(['super-admin', 'admin']), async (_req, res) => {
    const devices = await DeviceLocation.find().sort({ locationName: 1 }).lean();
    res.json({ success: true, data: devices });
});

router.put(
    '/devices/:sn',
    authenticate,
    authorize(['super-admin', 'admin']),
    async (req: Request, res: Response) => {
        try {
            const device = await DeviceLocation.findOneAndUpdate(
                { deviceSN: req.params.sn },
                { $set: req.body },
                { new: true }
            );
            if (!device) return res.status(404).json({ success: false, message: 'Device not found' });
            res.json({ success: true, data: device });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

router.get('/locations', authenticate, async (_req, res) => {
    const devices = await DeviceLocation.find({ isActive: true }, { locationName: 1 }).lean();
    const names   = [...new Set(devices.map(d => d.locationName))];
    res.json({ success: true, data: names });
});

router.get('/live-feed', authenticate, async (req: Request, res: Response) => {
    try {
        const limit    = parseInt(req.query.limit as string) || 20;
        const location = req.query.location as string | undefined;

        const filter: Record<string, any> = {};
        if (location) {
            const devicesInLocation = await DeviceLocation.find({ locationName: location }).lean();
            filter.deviceSN = { $in: devicesInLocation.map(d => d.deviceSN) };
        }

        const punches = await AttendancePunch
            .find(filter)
            .sort({ punchTime: -1 })
            .limit(limit)
            .lean();

        // Enrich with employee name if not already stored
        const enriched = await Promise.all(punches.map(async (p: any) => {
            if (p.employeeName) return p;
            const emp = await Employee.findOne(
                { employeeId: p.employeeId },
                { firstName: 1, lastName: 1 }
            ).lean() as { firstName: string; lastName: string } | null;
            return { ...p, employeeName: emp ? `${emp.firstName} ${emp.lastName}` : undefined };
        }));


        res.json({ success: true, data: enriched });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// ZKTeco Cloud API Proxy routes
// These forward requests to the upstream ZKTeco REST API (192.168.0.74:8081)
// securely from the server, keeping the API token out of the browser.
// ─────────────────────────────────────────────────────────────────────────────



/**
 * GET /api/attendance/zkt/status
 * Ping the ZKTeco server and return reachability info.
 */
router.get('/zkt/status', authenticate, async (_req: Request, res: Response) => {
    try {
        const status = await checkServerStatus();
        res.json({ success: true, data: status });
    } catch (err: any) {
        res.json({ success: true, data: { reachable: false, error: err.message } });
    }
});

/**
 * GET /api/attendance/zkt/employees
 * Returns the full employee list from the ZKTeco Cloud server.
 */
router.get('/zkt/employees', authenticate, async (_req: Request, res: Response) => {
    try {
        const employees = await fetchEmployees();
        res.json({ success: true, count: employees.length, data: employees });
    } catch (err: any) {
        res.status(503).json({ success: false, message: `ZKTeco API unreachable: ${err.message}` });
    }
});

/**
 * GET /api/attendance/zkt/transactions?last_id=123&page_size=100
 * Returns transactions from the ZKTeco Cloud server.
 * Supports incremental fetch via last_id.
 */
router.get('/zkt/transactions', authenticate, async (req: Request, res: Response) => {
    try {
        const lastId   = req.query.last_id ? parseInt(req.query.last_id as string, 10) : null;
        const pageSize = req.query.page_size ? parseInt(req.query.page_size as string, 10) : 100;
        const txns     = await fetchTransactions(lastId, pageSize);
        res.json({ success: true, count: txns.length, data: txns });
    } catch (err: any) {
        res.status(503).json({ success: false, message: `ZKTeco API unreachable: ${err.message}` });
    }
});

/**
 * GET /api/attendance/zkt/report?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
 * Returns the transaction report from the ZKTeco Cloud server.
 */
router.get('/zkt/report', authenticate, async (req: Request, res: Response) => {
    try {
        const { start_date, end_date } = req.query as Record<string, string>;
        if (!start_date || !end_date) {
            return res.status(400).json({ success: false, message: 'start_date and end_date are required' });
        }
        const report = await fetchReport(start_date, end_date);
        res.json({ success: true, count: report.length, data: report });
    } catch (err: any) {
        res.status(503).json({ success: false, message: `ZKTeco API unreachable: ${err.message}` });
    }
});

/**
 * GET /api/attendance/zkt/sync-state
 * Returns the current sync state (last transaction ID, last sync time).
 */
router.get('/zkt/sync-state', authenticate, async (_req: Request, res: Response) => {
    try {
        const state = await ZktSyncState.findOne({ key: 'default' }).lean();
        res.json({ success: true, data: state ?? { lastTransactionId: null, lastSyncAt: null, totalSynced: 0 } });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * POST /api/attendance/zkt/sync
 * Manually trigger incremental sync from ZKTeco → local AttendancePunch store.
 * Also called automatically by the scheduler every 5 seconds.
 */
router.post('/zkt/sync', authenticate, authorize(['super-admin', 'admin']), async (_req: Request, res: Response) => {
    try {
        const syncResult = await runZktSync();
        res.json({ success: true, data: syncResult });
    } catch (err: any) {
        res.status(503).json({ success: false, message: err.message });
    }
});

/**
 * POST /api/attendance/zkt/sync-report?date=YYYY-MM-DD
 * Manually trigger a sync from the machine's calculated daily report.
 */
router.post('/zkt/sync-report', authenticate, authorize(['super-admin', 'admin']), async (req: Request, res: Response) => {
    try {
        const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
        const count = await syncFromMachineReport(date);
        res.json({ success: true, message: `Synced ${count} records from machine report for ${date}` });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /api/attendance/export
 * Exports attendance records to CSV.
 */
router.get('/export', authenticate, authorize(['super-admin', 'admin', 'manager']), async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, location, status } = req.query;
        
        const filter: Record<string, any> = {};
        if (startDate && endDate) {
            filter.date = { $gte: startDate, $lte: endDate };
        } else if (req.query.date) {
            filter.date = req.query.date;
        }
        
        if (location) filter.location = location;
        if (status)   filter.status   = status;

        const records = await AttendanceRecord.find(filter).sort({ date: -1, employeeId: 1 }).lean();

        const columns = [
            { header: 'Employee ID', key: 'employeeId' },
            { header: 'Date',        key: 'date' },
            { header: 'Location',    key: 'location' },
            { header: 'Check In',    key: 'checkIn' },
            { header: 'Check Out',   key: 'checkOut' },
            { header: 'Work Minutes',key: 'workDurationMinutes' },
            { header: 'Status',      key: 'status' },
            { header: 'Late (Min)',  key: 'lateMinutes' },
            { header: 'OT (Min)',    key: 'overtimeMinutes' },
            { header: 'Note',        key: 'note' },
        ];

        const csv = generateCSV(records, columns);
        
        const filename = `Attendance_${startDate || 'Report'}_${endDate || ''}.csv`;
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        res.status(200).send(csv);
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
