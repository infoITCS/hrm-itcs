import express, { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import AuditLog from '../models/AuditLog';
import User from '../models/User.model';
import Employee from '../models/Employee';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// Get audit logs with filters — enriched with performer names
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
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

        // Collect unique performer IDs that look like MongoDB ObjectIds
        const performerIds = [...new Set(
            logs
                .map(l => l.performedBy)
                .filter(id => id && mongoose.Types.ObjectId.isValid(id))
        )];

        // Build a name map: userId -> "First Last" or email
        const nameMap: Record<string, string> = {};
        if (performerIds.length > 0) {
            const [users, employees] = await Promise.all([
                User.find({ _id: { $in: performerIds } }).select('_id firstName lastName email'),
                Employee.find({ userId: { $in: performerIds } }).select('userId firstName lastName')
            ]);

            users.forEach(u => {
                const id = u._id.toString();
                if (u.firstName || u.lastName) {
                    nameMap[id] = `${u.firstName || ''} ${u.lastName || ''}`.trim();
                } else {
                    nameMap[id] = u.email;
                }
            });

            // Override with Employee name if available (more accurate)
            employees.forEach(e => {
                if (e.userId) {
                    const id = e.userId.toString();
                    if (e.firstName || e.lastName) {
                        nameMap[id] = `${e.firstName || ''} ${e.lastName || ''}`.trim();
                    }
                }
            });
        }

        // Attach performerName to each log
        const enrichedLogs = logs.map(log => ({
            ...log.toObject(),
            performerName: nameMap[log.performedBy] || log.performedBy
        }));

        res.json({
            logs: enrichedLogs,
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit))
        });
    } catch (err: any) {
        next(err);
    }
});

export default router;

