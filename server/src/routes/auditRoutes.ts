import express from 'express';
import AuditLog from '../models/AuditLog';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// Get audit logs with filters
router.get('/', authenticate, async (req: any, res) => {
    try {
        const { targetResource, targetId, action } = req.query;
        const query: any = {};
        
        if (targetResource) query.targetResource = targetResource;
        if (targetId) query.targetId = targetId;
        if (action) query.action = action;

        const logs = await AuditLog.find(query)
            .sort({ timestamp: -1 })
            .limit(100);

        res.json(logs);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

export default router;

