import express, { Request, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import Holiday from '../models/Holiday';

const router = express.Router();

// GET /api/holidays - List all holidays
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const holidays = await Holiday.find().sort({ startDate: 1 });
        res.json({ success: true, data: holidays });
    } catch (error) {
        next(error);
    }
});

// POST /api/holidays - Create a new holiday (Admin only)
router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const user = authReq.user as any;
        if (!['super-admin', 'admin', 'hr', 'finance'].includes(user?.role || '')) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const { name, startDate, endDate, location, isRecurring } = req.body;
        if (!name || !startDate) {
            return res.status(400).json({ success: false, message: 'Name and start date are required' });
        }

        const resolvedEndDate = endDate || startDate;
        if (resolvedEndDate < startDate) {
            return res.status(400).json({ success: false, message: 'End date cannot be before start date' });
        }

        const existing = await Holiday.findOne({ startDate, location: location || null });
        if (existing) {
            return res.status(400).json({ success: false, message: `A holiday is already scheduled to start on ${startDate}` });
        }

        const holiday = await Holiday.create({
            name,
            startDate,
            endDate: resolvedEndDate,
            location: location || null,
            isRecurring: !!isRecurring
        });

        res.status(201).json({ success: true, data: holiday });
    } catch (error) {
        next(error);
    }
});

// PUT /api/holidays/:id - Update an existing holiday (Admin only)
router.put('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const user = authReq.user as any;
        if (!['super-admin', 'admin', 'hr', 'finance'].includes(user?.role || '')) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const { name, startDate, endDate, location, isRecurring } = req.body;
        const holiday = await Holiday.findById(req.params.id);
        if (!holiday) {
            return res.status(404).json({ success: false, message: 'Holiday not found' });
        }

        if (name) holiday.name = name;
        if (startDate) holiday.startDate = startDate;
        if (endDate) holiday.endDate = endDate;
        if (startDate || endDate) {
            const currentStart = startDate || holiday.startDate;
            const currentEnd = endDate || holiday.endDate;
            if (currentEnd < currentStart) {
                return res.status(400).json({ success: false, message: 'End date cannot be before start date' });
            }
        }
        if (location !== undefined) holiday.location = location || null;
        if (isRecurring !== undefined) holiday.isRecurring = !!isRecurring;

        await holiday.save();
        res.json({ success: true, data: holiday });
    } catch (error) {
        next(error);
    }
});

// DELETE /api/holidays/:id - Delete a holiday (Admin only)
router.delete('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const user = authReq.user as any;
        if (!['super-admin', 'admin', 'hr', 'finance'].includes(user?.role || '')) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const holiday = await Holiday.findById(req.params.id);
        if (!holiday) {
            return res.status(404).json({ success: false, message: 'Holiday not found' });
        }

        await Holiday.deleteOne({ _id: req.params.id });
        res.json({ success: true, message: 'Holiday deleted successfully' });
    } catch (error) {
        next(error);
    }
});

export default router;
