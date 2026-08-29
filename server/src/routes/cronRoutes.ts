import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { runZktSync } from '../services/zktCloudService';
import * as attendanceProcessor from '../services/attendanceProcessor';
import { upgradeCompletedProbations } from '../services/probationUpgradeService';
import logger from '../utils/logger';

const router = Router();

// Helper to check authorization
const isAuthorized = (req: Request) => {
    const authHeader = req.headers['authorization'];
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || !authHeader) return false;

    const expected = Buffer.from(`Bearer ${cronSecret}`);
    const actual = Buffer.from(authHeader);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};

/**
 * GET /api/cron/sync
 * Real-time machine punch sync
 */
router.get('/sync', async (req: Request, res: Response) => {
    if (!isAuthorized(req)) return res.status(401).json({ success: false, message: 'Unauthorized' });
    
    logger.info('[CRON] Starting automated ZKT sync...');
    try {
        const result = await runZktSync();
        res.json({ success: true, newRecords: result.newRecords ?? 0 });
    } catch (err: any) {
        logger.error('[CRON] Sync failed:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /api/cron/absenteeism
 * Mark employees as absent/weekend/holiday (Daily 11:00 PM)
 */
router.get('/absenteeism', async (req: Request, res: Response) => {
    if (!isAuthorized(req)) return res.status(401).json({ success: false, message: 'Unauthorized' });
    
    const dateStr = (req.query.date as string) || new Date().toISOString().slice(0, 10);
    try {
        const count = await attendanceProcessor.processDailyAbsenteeism(dateStr);
        res.json({ success: true, date: dateStr, marked: count });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
});

/**
 * GET /api/cron/auto-close
 * Close incomplete records for the day (Daily 11:05 PM)
 */
router.get('/auto-close', async (req: Request, res: Response) => {
    if (!isAuthorized(req)) return res.status(401).json({ success: false, message: 'Unauthorized' });
    
    const dateStr = (req.query.date as string) || new Date().toISOString().slice(0, 10);
    try {
        const result = await attendanceProcessor.autoCloseIncompleteRecords(dateStr);
        res.json({ success: true, date: dateStr, processed: result.processed });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
});

/**
 * GET /api/cron/machine-report
 * Nightly sync from machine report (Daily 11:30 PM)
 */
router.get('/machine-report', async (req: Request, res: Response) => {
    if (!isAuthorized(req)) return res.status(401).json({ success: false, message: 'Unauthorized' });
    
    const dateStr = (req.query.date as string) || new Date().toISOString().slice(0, 10);
    try {
        const count = await attendanceProcessor.syncFromMachineReport(dateStr);
        res.json({ success: true, date: dateStr, synced: count });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
});

/**
 * GET /api/cron/maintenance
 * Runs probation upgrades, birthday/anniversary reminders, etc. (Daily 8:00 AM)
 * We call a combined "maintenance" task here or trigger individual ones.
 * For now, let's just trigger the Birthday/Anniversary logic.
 */
router.get('/maintenance', async (req: Request, res: Response) => {
    if (!isAuthorized(req)) return res.status(401).json({ success: false, message: 'Unauthorized' });

    try {
        const probation = await upgradeCompletedProbations();
        res.json({
            success: true,
            probationUpgrades: probation.upgradedCount,
            upgradedEmployeeIds: probation.employeeIds,
        });
    } catch (err: any) {
        logger.error('[CRON] Maintenance failed:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
