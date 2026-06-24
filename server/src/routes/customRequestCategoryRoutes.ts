import express, { Request, Response, NextFunction } from 'express';
import CustomRequestCategory from '../models/CustomRequestCategory';
import { authenticate, authorize } from '../middleware/auth';

const router = express.Router();

// Get all custom request categories (Public/Employees)
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const categories = await CustomRequestCategory.find().sort({ createdAt: -1 }).lean();
        res.json(categories);
    } catch (err: any) {
        next(err);
    }
});

// Create a new category (Admin only)
router.post('/', authenticate, authorize(['admin', 'super-admin']), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { title, description, icon, options, isActive, hiddenOptions, systemType } = req.body;
        const newCategory = new CustomRequestCategory({ title, description, icon, options, isActive, hiddenOptions, systemType });
        await newCategory.save();
        res.status(201).json(newCategory);
    } catch (err: any) {
        next(err);
    }
});

// Update a category (Admin only)
router.put('/:id', authenticate, authorize(['admin', 'super-admin']), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { title, description, icon, options, isActive, hiddenOptions, systemType } = req.body;
        const category = await CustomRequestCategory.findByIdAndUpdate(
            req.params.id,
            { title, description, icon, options, isActive, hiddenOptions, systemType },
            { new: true }
        );
        if (!category) return res.status(404).json({ message: 'Category not found' });
        res.json(category);
    } catch (err: any) {
        next(err);
    }
});

// Delete a category (Admin only)
router.delete('/:id', authenticate, authorize(['admin', 'super-admin']), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const category = await CustomRequestCategory.findByIdAndDelete(req.params.id);
        if (!category) return res.status(404).json({ message: 'Category not found' });
        res.json({ message: 'Category deleted' });
    } catch (err: any) {
        next(err);
    }
});

export default router;
