import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { User } from '../models/User.model';
import Employee from '../models/Employee';
import AuditLog from '../models/AuditLog';
import { AuthRequest } from '../middleware/auth';
import { AuthUtils } from '../middleware/auth.utils';
import crypto from 'crypto';
import { sendWelcomeEmail, sendTestEmail } from '../utils/email';
import RolePermission from '../models/RolePermission';
import { SYSTEM_MODULES, computeEffectivePermissionsAndScopes, getDefaultScopeForRole, getDefaultSubTabAccess } from '../utils/permissionUtils';

const router = Router();

// Middleware to ensure user is an admin or super-admin
const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    if (!['super-admin', 'admin'].includes(authReq.user?.role || '')) {
        return res.status(403).json({ message: 'Forbidden. Admin access required.' });
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

        res.status(201).json({ ...newUser.toObject(), password: undefined });
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
        
        if (!['super-admin', 'admin', 'hr', 'finance', 'manager', 'employee'].includes(role)) {
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

/**
 * @route   POST /api/admin/users/:id/impersonate
 * @desc    Impersonate a user
 * @access  Private (Super Admin only)
 */
router.post('/users/:id/impersonate', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        const targetUserId = req.params.id;

        // Check if target user exists
        const targetUser = await User.findById(targetUserId);
        if (!targetUser) {
            return res.status(404).json({ message: 'User to impersonate not found' });
        }

        // Generate token for target user
        const token = AuthUtils.generateToken({
            userId: targetUser._id.toString(),
            email: targetUser.email,
            role: targetUser.role,
        });

        // Fetch target user's associated employee record
        const employee = await Employee.findOne({ userId: targetUser._id }).select('-attachments.fileData');

        let avatarUrl = targetUser.avatar;
        if (!avatarUrl && employee) {
            const profilePic = employee.attachments?.find(
                (att: any) => att.fileType === "Profile Picture"
            );
            if (profilePic) {
                avatarUrl = `/api/employees/attachments/raw/${profilePic._id}`;
            }
        }

        // Log this impersonation action
        await AuditLog.create({
            action: 'UPDATE',
            targetResource: 'User',
            targetId: targetUserId,
            performedBy: authReq.user?.userId || 'System',
            details: {
                action: 'IMPERSONATE_USER',
                impersonatorId: authReq.user?.userId,
                impersonatedUserEmail: targetUser.email
            }
        });

        const rolePerm = (await RolePermission.findOne({ role: targetUser.role }).lean()) as any;
        const computed = computeEffectivePermissionsAndScopes(targetUser, rolePerm);

        res.json({
            token,
            user: {
                id: targetUser._id,
                _id: targetUser._id,
                email: targetUser.email,
                role: targetUser.role,
                firstName: targetUser.firstName || employee?.firstName,
                lastName: targetUser.lastName || employee?.lastName,
                avatar: avatarUrl,
                hasProfile: !!employee,
                permissions: computed.permissions,
                scopes: computed.scopes,
                subPermissions: computed.subPermissions,
                customPermissions: computed.customPermissions,
                customScopes: computed.customScopes,
                customSubPermissions: computed.customSubPermissions,
            }
        });
    } catch (error) {
        next(error);
    }
});
/**
 * POST /api/admin/test-email
 * Sends a test email to verify SMTP configuration.
 */
router.post('/test-email', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { to } = req.body;
        const targetEmail = to || process.env.HR_EMAIL || process.env.SMTP_USER;
        if (!targetEmail) {
            return res.status(400).json({ message: 'Recipient email address is required.' });
        }
        const result = await sendTestEmail(targetEmail);
        if (result.success) {
            return res.json({ message: result.message });
        } else {
            return res.status(500).json({ message: 'SMTP Test Failed', error: result.error });
        }
    } catch (err) {
        next(err);
    }
});

/**
 * @route   GET /api/admin/users/:id/permissions
 * @desc    Get detailed permissions, scopes, role baseline, and custom overrides for a user
 * @access  Private (Super-Admin only)
 */
router.get('/users/:id/permissions', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });

        const rolePerm = (await RolePermission.findOne({ role: user.role }).lean()) as any;
        const computed = computeEffectivePermissionsAndScopes(user, rolePerm);

        // Build module breakdown with baseline and override status
        const moduleBreakdown = SYSTEM_MODULES.map(mod => {
            const roleAllowed = !!rolePerm?.permissions?.[mod.key];
            const defaultScope = getDefaultScopeForRole(user.role, mod.key);
            const hasCustomPerm = typeof computed.customPermissions[mod.key] === 'boolean';
            const hasCustomScope = !!computed.customScopes[mod.key];

            const subTabsBreakdown = mod.subTabs.map(sub => {
                const fullKey = `${mod.key}:${sub.key}`;
                const defaultAllowed = getDefaultSubTabAccess(user.role, mod.key, sub.key);
                const hasCustomSubPerm = typeof computed.customSubPermissions[fullKey] === 'boolean';
                const effectiveAllowed = computed.subPermissions[fullKey] ?? defaultAllowed;

                return {
                    key: sub.key,
                    fullKey,
                    name: sub.name,
                    description: sub.description,
                    defaultAllowed,
                    effectiveAllowed,
                    isCustom: hasCustomSubPerm,
                    customValue: hasCustomSubPerm ? computed.customSubPermissions[fullKey] : null,
                };
            });

            return {
                key: mod.key,
                name: mod.name,
                roleAllowed,
                defaultScope,
                effectiveAllowed: computed.permissions[mod.key] ?? roleAllowed,
                effectiveScope: computed.scopes[mod.key] || defaultScope,
                isCustomPerm: hasCustomPerm,
                isCustomScope: hasCustomScope,
                customPermValue: hasCustomPerm ? computed.customPermissions[mod.key] : null,
                customScopeValue: hasCustomScope ? computed.customScopes[mod.key] : null,
                subTabs: subTabsBreakdown,
            };
        });

        res.json({
            user: {
                id: user._id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
            },
            modules: moduleBreakdown,
            effectivePermissions: computed.permissions,
            effectiveScopes: computed.scopes,
            effectiveSubPermissions: computed.subPermissions,
            customPermissions: computed.customPermissions,
            customScopes: computed.customScopes,
            customSubPermissions: computed.customSubPermissions,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   PUT /api/admin/users/:id/permissions
 * @desc    Update granular custom permissions, scopes, and sub-tabs for a specific user
 * @access  Private (Super-Admin only)
 */
router.put('/users/:id/permissions', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        const { customPermissions, customScopes, customSubPermissions } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (customPermissions && typeof customPermissions === 'object') {
            user.set('customPermissions', customPermissions);
            user.markModified('customPermissions');
        }
        if (customScopes && typeof customScopes === 'object') {
            user.set('customScopes', customScopes);
            user.markModified('customScopes');
        }
        if (customSubPermissions && typeof customSubPermissions === 'object') {
            user.set('customSubPermissions', customSubPermissions);
            user.markModified('customSubPermissions');
        }

        await user.save();

        await AuditLog.create({
            action: 'UPDATE',
            targetResource: 'User',
            targetId: String(user._id),
            performedBy: authReq.user?.userId || 'System',
            details: {
                action: 'UPDATE_USER_PERMISSIONS',
                targetEmail: user.email,
                customPermissions,
                customScopes,
                customSubPermissions,
            }
        });

        const rolePerm = (await RolePermission.findOne({ role: user.role }).lean()) as any;
        const computed = computeEffectivePermissionsAndScopes(user, rolePerm);

        res.json({
            success: true,
            message: 'User permissions and sub-tabs updated successfully',
            effectivePermissions: computed.permissions,
            effectiveScopes: computed.scopes,
            effectiveSubPermissions: computed.subPermissions,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   POST /api/admin/users/:id/permissions/reset
 * @desc    Reset a user's permissions, scopes, and sub-tabs back to their base role defaults
 * @access  Private (Super-Admin only)
 */
router.post('/users/:id/permissions/reset', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.set('customPermissions', {});
        user.set('customScopes', {});
        user.set('customSubPermissions', {});
        user.markModified('customPermissions');
        user.markModified('customScopes');
        user.markModified('customSubPermissions');
        await user.save();

        await AuditLog.create({
            action: 'UPDATE',
            targetResource: 'User',
            targetId: String(user._id),
            performedBy: authReq.user?.userId || 'System',
            details: {
                action: 'RESET_USER_PERMISSIONS_TO_ROLE',
                targetEmail: user.email,
                role: user.role,
            }
        });

        const rolePerm = (await RolePermission.findOne({ role: user.role }).lean()) as any;
        const computed = computeEffectivePermissionsAndScopes(user, rolePerm);

        res.json({
            success: true,
            message: `User permissions reset to ${user.role} defaults`,
            effectivePermissions: computed.permissions,
            effectiveScopes: computed.scopes,
            effectiveSubPermissions: computed.subPermissions,
        });
    } catch (error) {
        next(error);
    }
});

export default router;
