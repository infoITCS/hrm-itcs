/**
 * adms.routes.ts — ZKTeco physical machine protocol.
 * NO authentication — machines cannot send JWT tokens.
 * KEEP this file completely separate from the authenticated HR API.
 *
 * Machine handshake:
 *   GET  /iclock/cdata?SN=XXX        → server sends config to machine
 *   POST /iclock/cdata?SN=XXX&table=ATTLOG → machine pushes punches
 *   GET  /iclock/getrequest          → server sends "OK\n"
 *   GET  /iclock/ping                → server sends "OK\n"
 *   POST /iclock/devicecmd           → ack
 */
import { Router, Request, Response } from 'express';
import * as repo from './attendance.repository';
import { processEmployeePunches } from './attendance.service';
import logger from '../../utils/logger';


const router = Router();

// ─── Heartbeat / Config ───────────────────────────────────────────────────────
router.get('/iclock/cdata', async (req: Request, res: Response) => {
    try {
        const sn = (req.query.SN || req.query.sn || '') as string;
        if (!sn) return res.status(400).send('SN required');

        // Auto-register device if first time seen
        const existing = await repo.findDeviceConfig(sn);
        if (!existing) {
            await repo.upsertDevice(sn, {
                deviceSN: sn,
                locationName: process.env.DEFAULT_LOCATION || 'ISB-Office',
                shiftStart: '09:00', shiftEnd: '18:00',
                graceMinutes: 30, halfDayThresholdHours: 4,
                isActive: true,
            });
            logger.info(`[ADMS] Auto-registered new device: ${sn}`);
        }

        const tz = process.env.MACHINE_TIMEZONE || '5';
        res.set('Content-Type', 'text/plain');
        res.send([
            `GET OPTION FROM: ${sn}`,
            `ATTLOGStamp=0`,
            `OPERLOGStamp=9999`,
            `ATTPHOTOStamp=9999`,
            `ErrorDelay=30`,
            `Delay=10`,
            `TransTimes=00:00;14:05`,
            `TransInterval=1`,
            `TransFlag=TransData AttLog OpLog AttPhoto`,
            `TimeZone=${tz}`,
            `Realtime=1`,
            `Encrypt=0`,
        ].join('\r\n'));
    } catch (err) {
        logger.error('[ADMS] Error in cdata handshake:', err);
        res.status(500).send('Internal Server Error');
    }
});

// ─── Punch Data Receiver ──────────────────────────────────────────────────────
router.post('/iclock/cdata', async (req: Request, res: Response) => {
    const sn = (req.query.SN || req.query.sn || '') as string;
    const table = (req.query.table || '') as string;

    res.set('Content-Type', 'text/plain');
    if (table !== 'ATTLOG') return res.send('OK'); // only process punch logs

    const rawBody = req.body as string;
    if (!rawBody?.trim()) return res.send('OK');

    const lines = rawBody.split('\n').map((l) => l.trim()).filter(Boolean);
    logger.info(`[ADMS] Device ${sn} pushed ${lines.length} lines`);

    // Process in background — respond immediately so machine doesn't retry
    res.send('OK');

    const deviceConfig = await repo.findDeviceConfig(sn) as any;
    const location = deviceConfig?.locationName || process.env.DEFAULT_LOCATION || 'ISB-Office';

    for (const line of lines) {
        try {
            /**
             * Two ATTLOG formats in the wild:
             * Format A (old): ATTLOG\t{pin}\t{datetime}\t{status}\t{verify}
             * Format B (SpeedFace V5L): {pin}\t{datetime}\t{status}\t{verify}\t0\t0\t1
             */
            let pin: string, dateTimeStr: string, punchStatusRaw: number;

            if (line.startsWith('ATTLOG')) {
                const parts = line.split('\t');
                pin = parts[1]?.trim();
                dateTimeStr = parts[2]?.trim();
                punchStatusRaw = parseInt(parts[3] ?? '0', 10);
            } else {
                const parts = line.split('\t');
                pin = parts[0]?.trim();
                dateTimeStr = parts[1]?.trim();
                punchStatusRaw = parseInt(parts[2] ?? '0', 10);
            }

            if (!pin || !dateTimeStr) continue;

            // ─── Timestamp Validation & UTC Conversion ────────────────────────
            const parts = dateTimeStr.split(' ');
            if (parts.length < 1) continue;
            const datePart = parts[0];
            const timePart = parts[1] || '00:00:00';

            // Validate formats
            if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
                logger.warn(`[ADMS] Invalid date format: ${datePart}`);
                continue;
            }
            if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(timePart)) {
                logger.warn(`[ADMS] Invalid time format: ${timePart}`);
                continue;
            }

            const [tH, tM, tS] = timePart.split(':').map(Number);
            if (!Number.isFinite(tH) || !Number.isFinite(tM)) continue;

            const timezoneOffset = parseInt(process.env.MACHINE_TIMEZONE || '5', 10);
            const punchTimeUTC = new Date(`${datePart}T00:00:00.000Z`);
            punchTimeUTC.setUTCHours(tH - timezoneOffset, tM, tS || 0, 0);

            if (isNaN(punchTimeUTC.getTime())) {
                logger.warn(`[ADMS] Invalid timestamp calculation for: ${dateTimeStr}`);
                continue;
            }

            // Record attendance for the local punch date
            const dateStr = datePart;

            // Status 255 = generic punch (SpeedFace) → treat as check-in (0)
            const punchStatus = punchStatusRaw === 255 ? 0 : punchStatusRaw;

            // Map machine PIN to HRM employee
            const employee = await repo.findEmployeeByPin(pin) as any;
            if (!employee) { logger.debug(`[ADMS] No HRM employee for pin: ${pin}`); continue; }

            // Save raw punch (idempotent)
            await repo.upsertPunch(sn, pin, punchTimeUTC, {
                machineUserId: pin,
                employeeId: employee.employeeId,
                employeeName: `${employee.firstName} ${employee.lastName || ''}`.trim(),
                punchTime: punchTimeUTC,
                punchStatus,
                verifyType: 1,
                deviceSN: sn,
                location,
                processed: false,
            });

            // Recompute attendance record for this employee/day
            await processEmployeePunches(employee.employeeId, dateStr, sn);
        } catch (err) {
            logger.error(`[ADMS] Failed to process line: "${line}"`, err);
        }
    }
});

// ─── Ack Endpoints ────────────────────────────────────────────────────────────
router.get('/iclock/getrequest', (_req, res) => res.send('OK\n'));
router.get('/iclock/ping', (_req, res) => res.send('OK\n'));
router.post('/iclock/devicecmd', (_req, res) => res.send('OK\n'));

export default router;
