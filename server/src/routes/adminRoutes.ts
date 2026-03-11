import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { User } from '../models/User.model';
import Employee from '../models/Employee';
import AuditLog from '../models/AuditLog';
import { AuthRequest } from '../middleware/auth';
import crypto from 'crypto';
import { sendWelcomeEmail } from '../utils/email';

const router = Router();

// Middleware to ensure user is an admin
const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    if (authReq.user?.role !== 'super-admin') {
        return res.status(403).json({ message: 'Forbidden. Super Admin access required.' });
    }
    next();
};

/**
 * @route   GET /api/admin/users
 * @desc    Get all users with their associated employee data
 * @access  Private (Admin only)
 */
router.get('/users', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const users = await User.find().select('-password');
        const employees = await Employee.find().select('userId employeeId firstName lastName jobInfo employmentStatus');

        // Merge user and employee data
        const mergedData = users.map(user => {
            const employee = employees.find(emp => emp.userId && emp.userId.toString() === user._id.toString());
            return {
                ...user.toObject(),
                employeeInfo: employee ? {
                    employeeId: employee.employeeId,
                    firstName: employee.firstName,
                    lastName: employee.lastName,
                    designation: employee.jobInfo?.designation,
                    department: employee.jobInfo?.department,
                    status: employee.employmentStatus?.status || employee.employmentStatus
                } : null
            };
        });

        res.json(mergedData);
    } catch (error) {
        next(error);
    }
});

/**
 * @route   POST /api/admin/users
 * @desc    Create a new user manually
 * @access  Private (Admin only)
 */
router.post('/users', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        const { email, firstName, lastName, role, password } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists with this email' });
        }

        const userPassword = password || crypto.randomBytes(12).toString('hex');
        const newUser = new User({
            email,
            firstName,
            lastName,
            role: role || 'employee',
            password: userPassword // Assign random password if none provided
        });

        await newUser.save();

        // Send Welcome Email
        await sendWelcomeEmail(email, userPassword, req.headers.origin);

        await AuditLog.create({
            action: 'CREATE',
            targetResource: 'User',
            targetId: newUser._id.toString(),
            performedBy: authReq.user?.userId || 'System',
            details: { email: newUser.email, role: newUser.role }
        });

        res.status(201).json(newUser);
    } catch (error) {
        next(error);
    }
});

/**
 * @route   PATCH /api/admin/users/:id/role
 * @desc    Update a user's role
 * @access  Private (Admin only)
 */
router.patch('/users/:id/role', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        const { role } = req.body;
        
        if (!['super-admin', 'admin', 'manager', 'employee'].includes(role)) {
            return res.status(400).json({ message: 'Invalid role' });
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Prevent admin from downgrading super-admin if they are not super-admin
        if (user.role === 'super-admin' && authReq.user?.role !== 'super-admin') {
            return res.status(403).json({ message: 'Only a Super Admin can modify another Super Admin' });
        }

        const oldRole = user.role;
        user.role = role;
        await user.save();

        await AuditLog.create({
            action: 'UPDATE',
            targetResource: 'User',
            targetId: user._id.toString(),
            performedBy: authReq.user?.userId || 'System',
            details: { diff: { role: { old: oldRole, new: role } } }
        });

        res.json({ message: 'Role updated successfully', user });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   PATCH /api/admin/users/:id/status
 * @desc    Toggle user active status
 * @access  Private (Admin only)
 */
router.patch('/users/:id/status', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        const { isActive } = req.body;
        
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user._id.toString() === authReq.user?.userId) {
            return res.status(400).json({ message: 'You cannot deactivate your own account' });
        }

        if (user.role === 'super-admin' && authReq.user?.role !== 'super-admin') {
            return res.status(403).json({ message: 'Only a Super Admin can modify another Super Admin' });
        }

        const oldStatus = user.isActive;
        user.isActive = isActive;
        await user.save();

        await AuditLog.create({
            action: 'UPDATE',
            targetResource: 'User',
            targetId: user._id.toString(),
            performedBy: authReq.user?.userId || 'System',
            details: { diff: { isActive: { old: oldStatus, new: isActive } } }
        });

        res.json({ message: `User account ${isActive ? 'activated' : 'suspended'}`, user });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   DELETE /api/admin/users/:id/microsoft
 * @desc    Unlink Microsoft account from user
 * @access  Private (Admin only)
 */
router.delete('/users/:id/microsoft', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.microsoftId = undefined;
        await user.save();

        await AuditLog.create({
            action: 'UPDATE',
            targetResource: 'User',
            targetId: user._id.toString(),
            performedBy: authReq.user?.userId || 'System',
            details: { message: 'Unlinked Microsoft SSO' }
        });

        res.json({ message: 'Microsoft account unlinked' });
    } catch (error) {
        next(error);
    }
});

export default router;
