import { Router, Request, Response } from 'express';
import WorkShift from '../models/WorkShift';
import { authenticate, authorize } from '../middleware/auth';
import logger from '../utils/logger';

const router = Router();

// Get all shifts (Admin/Manager only)
router.get('/', authenticate, authorize(['admin', 'super-admin', 'manager', 'hr', 'finance']), async (req: Request, res: Response) => {
    try {
        const shifts = await WorkShift.find().sort({ name: 1 });
        res.json(shifts);
    } catch (error: any) {
        logger.error('Error fetching shifts:', error);
        res.status(500).json({ message: 'Error fetching shifts' });
    }
});

// Create a new shift (Admin only)
router.post('/', authenticate, authorize(['admin', 'super-admin', 'hr', 'finance']), async (req: Request, res: Response) => {
    try {
        const { name, startTime, endTime, graceMinutes, halfDayThreshold, isDefault, description, isActive } = req.body;
        if (!name || !startTime || !endTime) {
            return res.status(400).json({ message: 'Name, startTime, and endTime are required' });
        }
        const sanitizedPayload = { name, startTime, endTime, graceMinutes, halfDayThreshold, isDefault, description, isActive };
        
        const session = await WorkShift.startSession();
        let newShift;
        try {
            await session.withTransaction(async () => {
                if (isDefault) {
                    await WorkShift.updateMany({}, { $set: { isDefault: false } }, { session });
                }
                newShift = new WorkShift(sanitizedPayload);
                await newShift.save({ session });
            });
        } finally {
            await session.endSession();
        }
        
        res.status(201).json(newShift);
    } catch (error: any) {
        logger.error('Error creating shift:', error);
        res.status(500).json({ message: error.message || 'Error creating shift' });
    }
});

// Update a shift
router.put('/:id', authenticate, authorize(['admin', 'super-admin', 'hr', 'finance']), async (req: Request, res: Response) => {
    try {
        const { name, startTime, endTime, graceMinutes, halfDayThreshold, isDefault, description, isActive } = req.body;
        const sanitizedPayload = { name, startTime, endTime, graceMinutes, halfDayThreshold, isDefault, description, isActive };
        
        const session = await WorkShift.startSession();
        let updatedShift;
        try {
            await session.withTransaction(async () => {
                const shift = await WorkShift.findById(req.params.id).session(session);
                if (!shift) {
                    throw new Error('Shift not found');
                }
                
                if (isDefault === false && shift.isDefault) {
                    const otherShift = await WorkShift.findOne({ _id: { $ne: req.params.id } }).session(session);
                    if (otherShift) {
                        await WorkShift.updateOne({ _id: otherShift._id }, { $set: { isDefault: true } }, { session });
                    } else {
                        throw new Error('Cannot unset the only default shift. Create or assign another default shift first.');
                    }
                } else if (isDefault === true) {
                    await WorkShift.updateMany({ _id: { $ne: req.params.id } }, { $set: { isDefault: false } }, { session });
                }

                updatedShift = await WorkShift.findByIdAndUpdate(req.params.id, sanitizedPayload, { new: true, runValidators: true, session });
            });
        } finally {
            await session.endSession();
        }

        res.json(updatedShift);
    } catch (error: any) {
        logger.error('Error updating shift:', error);
        if (error.message === 'Shift not found' || error.message.includes('Cannot unset the only default shift')) {
            return res.status(error.message === 'Shift not found' ? 404 : 400).json({ message: error.message });
        }
        res.status(500).json({ message: 'Error updating shift' });
    }
});

// Delete a shift
router.delete('/:id', authenticate, authorize(['admin', 'super-admin', 'hr', 'finance']), async (req: Request, res: Response) => {
    try {
        const shift = await WorkShift.findById(req.params.id);
        if (!shift) return res.status(404).json({ message: 'Shift not found' });
        
        if (shift.isDefault) {
            return res.status(400).json({ message: 'Cannot delete the default shift. Assign another shift as default first.' });
        }

        await WorkShift.findByIdAndDelete(req.params.id);
        res.json({ message: 'Shift deleted successfully' });
    } catch (error: any) {
        logger.error('Error deleting shift:', error);
        res.status(500).json({ message: 'Error deleting shift' });
    }
});

export default router;
