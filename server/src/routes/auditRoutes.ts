import express from 'express';
import AuditLog from '../models/AuditLog';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// Get audit logs with filters
router.get('/', authenticate, async (req: any, res) => {
    try {
        const { targetResource, targetId, action, page = 1, limit = 25 } = req.query;
        const query: any = {};
        
        if (targetResource) query.targetResource = targetResource;
        if (targetId) query.targetId = targetId;
        if (action) query.action = action;

        const skip = (Number(page) - 1) * Number(limit);

        const logs = await AuditLog.find(query)
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(Number(limit));

        const total = await AuditLog.countDocuments(query);

        res.json({
            logs,
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit))
        });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

export default router;

