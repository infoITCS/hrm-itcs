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
        const { email, firstName, lastName, role, password, employeeId } = req.body;

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

        // Link to employee if provided
        if (employeeId) {
            const employee = await Employee.findOne({ employeeId });
            if (!employee) {
                // Rollback user creation if employee not found
                await User.findByIdAndDelete(newUser._id);
                return res.status(404).json({ message: `Employee record ${employeeId} not found. User creation cancelled.` });
            }

            if (employee.userId && String(employee.userId) !== String(newUser._id)) {
                // Rollback user creation if employee already linked
                await User.findByIdAndDelete(newUser._id);
                return res.status(409).json({ message: `Employee ${employeeId} is already linked to another account. User creation cancelled.` });
            }

            const updateResult = await Employee.updateOne(
                { employeeId },
                { $set: { userId: newUser._id.toString() } }
            );

            if (updateResult.matchedCount === 0) {
                await User.findByIdAndDelete(newUser._id);
                return res.status(404).json({ message: 'Employee linking failed. User creation cancelled.' });
            }

            await AuditLog.create({
                action: 'UPDATE',
                targetResource: 'Employee',
                targetId: employee._id.toString(),
                performedBy: authReq.user?.userId || 'System',
                details: { action: 'LINK_USER', userId: newUser._id.toString(), employeeId }
            });
        }

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

/**
 * @route   PATCH /api/admin/users/:id/password
 * @desc    Reset a user's password (manual reset by admin)
 * @access  Private (Super Admin only)
 */
router.patch('/users/:id/password', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Security: Prevent modifying other Super Admins if not a Super Admin (though requireAdmin already checks this)
        if (user.role === 'super-admin' && authReq.user?.role !== 'super-admin') {
            return res.status(403).json({ message: 'Only a Super Admin can modify another Super Admin' });
        }

        user.password = newPassword;
        await user.save();

        await AuditLog.create({
            action: 'UPDATE',
            targetResource: 'User',
            targetId: user._id.toString(),
            performedBy: authReq.user?.userId || 'System',
            details: { message: 'Password manually reset by admin' }
        });

        res.json({ message: 'Password reset successfully' });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   GET /api/admin/employees/unlinked
 * @desc    Get employees who are not yet linked to a user account
 * @access  Private (Admin only)
 */
router.get('/employees/unlinked', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const unlinkedEmployees = await Employee.find({ 
            $or: [
                { userId: { $exists: false } },
                { userId: null },
                { userId: '' }
            ]
        }).select('employeeId firstName lastName jobInfo').lean();
        
        res.json(unlinkedEmployees);
    } catch (error) {
        next(error);
    }
});

/**
 * @route   POST /api/admin/users/:id/link
 * @desc    Link an existing user to an employee profile
 * @access  Private (Admin only)
 */
router.post('/users/:id/link', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        const { employeeId } = req.body;
        const userId = req.params.id;

        if (!employeeId) {
            return res.status(400).json({ message: 'Employee ID is required' });
        }

        // 1. Fetch and validate User
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // 2. Fetch and validate target Employee
        const employee = await Employee.findOne({ employeeId });
        if (!employee) {
            return res.status(404).json({ message: 'Employee not found' });
        }

        // 3. Check if this employee is already linked to someone else
        if (employee.userId && employee.userId.toString() !== userId) {
            return res.status(409).json({ message: `Employee ${employeeId} is already linked to another user account (${employee.userId})` });
        }

        // 4. Check if this userId is already linked to another employee
        const otherLinkedEmployee = await Employee.findOne({ userId, employeeId: { $ne: employeeId } });
        if (otherLinkedEmployee) {
            return res.status(409).json({ message: `User ${userId} is already linked to another employee record (${otherLinkedEmployee.employeeId})` });
        }

        // Only update if not already linked to THIS user
        if (String(employee.userId) !== String(userId)) {
            employee.userId = userId;
            await employee.save();

            await AuditLog.create({
                action: 'UPDATE',
                targetResource: 'Employee',
                targetId: employee._id.toString(),
                performedBy: authReq.user?.userId || 'System',
                details: { action: 'LINK_USER', userId, employeeId: employee.employeeId }
            });
        }

        res.json({ success: true, message: 'User linked to employee successfully' });
    } catch (error) {
        next(error);
    }
});

export default router;
