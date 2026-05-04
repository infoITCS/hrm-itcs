import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { runZktSync } from '../services/zktCloudService';
import logger from '../utils/logger';

const router = Router();

/**
 * GET /api/cron/sync
 * Secure endpoint for Vercel Cron Jobs to trigger machine sync.
 */
router.get('/sync', async (req: Request, res: Response) => {
    const authHeader = req.headers['authorization'];
    const cronSecret = process.env.CRON_SECRET;

    // Strict Security Check: Constant-time comparison to prevent timing attacks
    let isAuthorized = false;
    if (cronSecret && authHeader) {
        const expected = Buffer.from(`Bearer ${cronSecret}`);
        const actual = Buffer.from(authHeader);
        if (expected.length === actual.length) {
            isAuthorized = crypto.timingSafeEqual(expected, actual);
        }
    }

    if (!isAuthorized) {
        logger.warn('[CRON] Unauthorized sync attempt blocked. Invalid or missing secret.');
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    logger.info('[CRON] Starting automated ZKT sync...');
    try {
        const result = await runZktSync();
        logger.info(`[CRON] Sync complete: ${result.newRecords ?? 0} records.`);
        
        // Sanitize response: only return safe fields
        res.json({ 
            success: true, 
            message: 'Sync completed successfully',
            timestamp: new Date().toISOString(),
            newRecordsCount: result.newRecords ?? 0
        });
    } catch (err: unknown) {
        logger.error('[CRON] Sync failed:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

export default router;
