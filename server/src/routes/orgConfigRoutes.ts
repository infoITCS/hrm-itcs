import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Department, Designation } from '../models/OrganizationConfig';
import Company from '../models/Company';
import DocumentTemplate from '../models/DocumentTemplate';
import Employee from '../models/Employee';
import AuditLog from '../models/AuditLog';
import RolePermission from '../models/RolePermission';

const router = Router();

// Middleware to ensure user is an admin, super-admin, or hr
const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    const role = (authReq.user?.role || '').toLowerCase().trim();
    if (!['super-admin', 'admin', 'hr'].includes(role)) {
        return res.status(403).json({ message: 'Forbidden. Admin access required.' });
    }
    next();
};

/**
 * @route   GET /api/config/departments
 * @desc    Get all departments
 */
router.get('/departments', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const departments = await Department.find().sort({ name: 1 });
        res.json(departments);
    } catch (error) {
        next(error);
    }
});

/**
 * @route   POST /api/config/departments
 * @desc    Create a new department
 */
router.post('/departments', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, description } = req.body;
        const authReq = req as AuthRequest;

        const department = new Department({ name, description });
        await department.save();

        await AuditLog.create({
            action: 'CREATE',
            targetResource: 'Department',
            targetId: department._id.toString(),
            performedBy: authReq.user?.userId || 'System',
            details: { name: department.name }
        });

        res.status(201).json(department);
    } catch (error) {
        next(error);
    }
});

/**
 * @route   PUT /api/config/departments/:id
 * @desc    Update a department
 */
router.put('/departments/:id', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, description, isActive } = req.body;
        const authReq = req as AuthRequest;

        const department = await Department.findByIdAndUpdate(
            req.params.id,
            { name, description, isActive },
            { new: true, runValidators: true }
        );

        if (!department) return res.status(404).json({ message: 'Department not found' });

        await AuditLog.create({
            action: 'UPDATE',
            targetResource: 'Department',
            targetId: department._id.toString(),
            performedBy: authReq.user?.userId || 'System',
            details: { name: department.name, isActive }
        });

        res.json(department);
    } catch (error) {
        next(error);
    }
});

/**
 * @route   DELETE /api/config/departments/:id
 * @desc    Delete a department
 */
router.delete('/departments/:id', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        const department = await Department.findByIdAndDelete(req.params.id);
        
        if (!department) return res.status(404).json({ message: 'Department not found' });

        await AuditLog.create({
            action: 'DELETE',
            targetResource: 'Department',
            targetId: department._id.toString(),
            performedBy: authReq.user?.userId || 'System',
            details: { name: department.name }
        });

        res.json({ message: 'Department deleted' });
    } catch (error) {
        next(error);
    }
});

// --- Designations ---

/**
 * @route   GET /api/config/designations
 * @desc    Get all designations
 */
router.get('/designations', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const designations = await Designation.find().sort({ name: 1 });
        res.json(designations);
    } catch (error) {
        next(error);
    }
});

/**
 * @route   POST /api/config/designations
 * @desc    Create a new designation
 */
router.post('/designations', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, description } = req.body;
        const authReq = req as AuthRequest;

        const designation = new Designation({ name, description });
        await designation.save();

        await AuditLog.create({
            action: 'CREATE',
            targetResource: 'Designation',
            targetId: designation._id.toString(),
            performedBy: authReq.user?.userId || 'System',
            details: { name: designation.name }
        });

        res.status(201).json(designation);
    } catch (error) {
        next(error);
    }
});

/**
 * @route   PUT /api/config/designations/:id
 * @desc    Update a designation
 */
router.put('/designations/:id', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, description, isActive } = req.body;
        const authReq = req as AuthRequest;

        const designation = await Designation.findByIdAndUpdate(
            req.params.id,
            { name, description, isActive },
            { new: true, runValidators: true }
        );

        if (!designation) return res.status(404).json({ message: 'Designation not found' });

        await AuditLog.create({
            action: 'UPDATE',
            targetResource: 'Designation',
            targetId: designation._id.toString(),
            performedBy: authReq.user?.userId || 'System',
            details: { name: designation.name, isActive }
        });

        res.json(designation);
    } catch (error) {
        next(error);
    }
});

/**
 * @route   DELETE /api/config/designations/:id
 * @desc    Delete a designation
 */
router.delete('/designations/:id', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        const designation = await Designation.findByIdAndDelete(req.params.id);
        
        if (!designation) return res.status(404).json({ message: 'Designation not found' });

        await AuditLog.create({
            action: 'DELETE',
            targetResource: 'Designation',
            targetId: designation._id.toString(),
            performedBy: authReq.user?.userId || 'System',
            details: { name: designation.name }
        });

        res.json({ message: 'Designation deleted' });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   GET /api/config/company
 * @desc    Get company profile/branding details for current single-tenant deployment
 */
router.get('/company', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        let company = await Company.findOne();
        const logoFilePath = path.join(__dirname, '../../../client/src/assets/logo.png');
        let defaultLogoBase64 = '';
        if (fs.existsSync(logoFilePath)) {
            try {
                const logoBuffer = fs.readFileSync(logoFilePath);
                defaultLogoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
            } catch (e) {}
        }

        if (!company) {
            company = new Company({
                name: 'IT Consulting and Services',
                logoUrl: defaultLogoBase64 || 'uploads/logo.png',
                branding: { primaryColor: '#4A148C', secondaryColor: '#1A0933' },
                contact: {
                    addressLine1: 'Karachi: 6/K Block 2, P.E.C.H.S, Karachi Pakistan | Lahore: Office 32, 1st Floor, IT Tower, Hali Rd, Gulberg III',
                    phone: '+92 21 111-482-711',
                    email: 'info@itcs.com.pk'
                }
            });
            await company.save();
        } else if (!company.logoUrl && defaultLogoBase64) {
            company.logoUrl = defaultLogoBase64;
            await company.save();
        }

        res.json(company);
    } catch (error) {
        next(error);
    }
});

/**
 * @route   PUT /api/config/company
 * @desc    Update company profile/branding details (Admin only)
 */
router.put('/company', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, logoUrl, branding, contact } = req.body;

        const company = await Company.findOneAndUpdate(
            {},
            { name, logoUrl, branding, contact },
            { new: true, upsert: true, runValidators: true }
        );

        res.json(company);
    } catch (error) {
        next(error);
    }
});

/**
 * @route   GET /api/config/templates
 * @desc    List all document templates for current deployment
 */
router.get('/templates', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const templates = await DocumentTemplate.find();
        res.json(templates);
    } catch (error) {
        next(error);
    }
});

/**
 * @route   POST /api/config/templates
 * @desc    Create or update a document template (Admin only)
 */
router.post('/templates', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { documentType, subject, content, isActive } = req.body;

        const template = await DocumentTemplate.findOneAndUpdate(
            { documentType },
            { subject, content, isActive },
            { new: true, upsert: true, runValidators: true }
        );

        res.json(template);
    } catch (error) {
        next(error);
    }
});

/**
 * @route   GET /api/config/roles-permissions
 * @desc    Get permissions configuration for all roles
 */
router.get('/roles-permissions', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const permissions = await RolePermission.find().sort({ role: 1 });
        res.json(permissions);
    } catch (error) {
        next(error);
    }
});

/**
 * @route   PUT /api/config/roles-permissions
 * @desc    Save matrix permissions updates
 */
router.put('/roles-permissions', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { matrix } = req.body;
        if (!Array.isArray(matrix)) {
            return res.status(400).json({ message: 'Matrix payload must be an array.' });
        }

        for (const item of matrix) {
            if (!item.role || !item.permissions) continue;
            await RolePermission.findOneAndUpdate(
                { role: item.role },
                { permissions: item.permissions },
                { new: true, upsert: true }
            );
        }

        res.json({ success: true, message: 'Permissions updated successfully.' });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   POST /api/config/roles-permissions/reset
 * @desc    Reset all role permissions to system defaults (force overwrite)
 */
router.post('/roles-permissions/reset', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    const defaults = [
        { role: 'super-admin', permissions: { dashboard: true, pim: true, leave: true, attendance: true, claim: true, payroll: true, requests: true, settings: true } },
        { role: 'admin',       permissions: { dashboard: true, pim: true, leave: true, attendance: true, claim: true, payroll: true, requests: true, settings: true } },
        { role: 'hr',          permissions: { dashboard: true, pim: true, leave: true, attendance: true, claim: true, payroll: true, requests: true, settings: true } },
        { role: 'finance',     permissions: { dashboard: true, pim: true, leave: true, attendance: true, claim: true, payroll: true, requests: true, settings: true } },
        { role: 'manager',     permissions: { dashboard: true, pim: true, leave: true, attendance: true, claim: true, payroll: false, requests: true, settings: false } },
        { role: 'employee',    permissions: { dashboard: true, pim: false, leave: true, attendance: true, claim: true, payroll: false, requests: true, settings: false } },
    ];
    try {
        for (const d of defaults) {
            await RolePermission.findOneAndUpdate(
                { role: d.role },
                { permissions: d.permissions },
                { upsert: true, new: true }
            );
        }
        res.json({ success: true, message: 'All role permissions reset to system defaults.' });
    } catch (error) {
        next(error);
    }
});

export default router;
