import express, { Request, Response, NextFunction } from 'express';
import ExpenseCategory from '../models/ExpenseCategory';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = express.Router();

function isAdminLike(role: string) {
    return ['super-admin', 'admin', 'hr', 'finance'].includes(role);
}

// GET /api/expense-categories
// Public (authenticated) route for fetching active categories
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const categories = await ExpenseCategory.find({ isActive: true }).lean();
        res.json({ success: true, data: categories });
    } catch (err) {
        next(err);
    }
});

// GET /api/expense-categories/all
// Admin only route for fetching all categories (including inactive)
router.get('/all', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const role = authReq.user?.role || 'employee';
        if (!isAdminLike(role)) return res.status(403).json({ message: 'Forbidden' });

        const categories = await ExpenseCategory.find({}).lean();
        res.json({ success: true, data: categories });
    } catch (err) {
        next(err);
    }
});

// POST /api/expense-categories
// Admin only route for creating a new category
router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const role = authReq.user?.role || 'employee';
        if (!isAdminLike(role)) return res.status(403).json({ message: 'Forbidden' });

        const { name, isActive, policyLimit, subCategories, requiresReceipt } = req.body;

        if (!name) {
            return res.status(400).json({ message: 'Name is required' });
        }

        const newCategory = new ExpenseCategory({
            name,
            isActive: isActive ?? true,
            policyLimit: policyLimit ?? 0,
            subCategories: Array.isArray(subCategories) ? subCategories : [],
            requiresReceipt: requiresReceipt ?? false
        });

        await newCategory.save();
        res.status(201).json({ success: true, data: newCategory });
    } catch (err: any) {
        if (err.code === 11000) {
            return res.status(400).json({ message: 'Category name already exists' });
        }
        next(err);
    }
});

// PUT /api/expense-categories/:id
// Admin only route for updating a category
router.put('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const role = authReq.user?.role || 'employee';
        if (!isAdminLike(role)) return res.status(403).json({ message: 'Forbidden' });

        const { name, isActive, policyLimit, subCategories, requiresReceipt } = req.body;

        const category = await ExpenseCategory.findById(req.params.id);
        if (!category) return res.status(404).json({ message: 'Category not found' });

        if (name !== undefined) category.name = name;
        if (isActive !== undefined) category.isActive = isActive;
        if (policyLimit !== undefined) category.policyLimit = policyLimit;
        if (subCategories !== undefined && Array.isArray(subCategories)) category.subCategories = subCategories;
        if (requiresReceipt !== undefined) category.requiresReceipt = requiresReceipt;

        await category.save();
        res.json({ success: true, data: category });
    } catch (err: any) {
        if (err.code === 11000) {
            return res.status(400).json({ message: 'Category name already exists' });
        }
        next(err);
    }
});

// DELETE /api/expense-categories/:id
// Admin only route for deleting a category (optional, usually better to deactivate)
router.delete('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const role = authReq.user?.role || 'employee';
        if (!isAdminLike(role)) return res.status(403).json({ message: 'Forbidden' });

        const category = await ExpenseCategory.findByIdAndDelete(req.params.id);
        if (!category) return res.status(404).json({ message: 'Category not found' });

        res.json({ success: true, message: 'Category deleted' });
    } catch (err) {
        next(err);
    }
});

export default router;
