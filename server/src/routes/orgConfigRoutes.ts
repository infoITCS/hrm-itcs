import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Department, Designation, SalaryComponent } from '../models/OrganizationConfig';
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

// --- Salary & Payroll Components ---

const DEFAULT_SALARY_COMPONENTS = [
    // Earnings
    { name: 'Basic Salary', type: 'earning', description: 'Base salary compensation', isActive: true },
    { name: 'Medical Allowance', type: 'earning', description: 'Medical coverage allowance', isActive: true },
    { name: 'Travel Allowance', type: 'earning', description: 'Approved travel / conveyance claims', isActive: true },
    { name: 'HRA', type: 'earning', description: 'House Rent Allowance', isActive: true },
    { name: 'Conveyance Allowance', type: 'earning', description: 'Transportation and travel allowance', isActive: true },
    { name: 'Fuel Allowance', type: 'earning', description: 'Fuel expense allowance', isActive: true },
    { name: 'Bonus', type: 'earning', description: 'General bonus', isActive: true },
    { name: 'Performance Bonus', type: 'earning', description: 'Performance incentive bonus', isActive: true },
    { name: 'Meal Allowance', type: 'earning', description: 'Daily/monthly food stipend', isActive: true },
    { name: 'Mobile Allowance', type: 'earning', description: 'Cellular/internet expense stipend', isActive: true },
    { name: 'Special Allowance', type: 'earning', description: 'Special role or ad-hoc allowance', isActive: true },
    { name: 'Utilities', type: 'earning', description: 'Utility bills support allowance', isActive: true },
    { name: 'Reward', type: 'earning', description: 'Recognition reward or performance prize', isActive: true },
    { name: 'Sales Commission', type: 'earning', description: 'Commission on sales generated', isActive: true },
    { name: 'PF Withdrawal (Non-Taxable)', type: 'earning', description: 'Provident fund withdrawal payout', isActive: true },
    { name: 'Anniversary Bonus', type: 'earning', description: 'Work anniversary bonus', isActive: true },
    { name: 'Expense Reimbursements', type: 'earning', description: 'Approved expense reimbursement', isActive: true },

    // Deductions
    { name: 'Income Tax / Withholding Tax', type: 'deduction', description: 'Government payroll tax deduction', isActive: true },
    { name: 'Loan Deduction', type: 'deduction', description: 'Company loan recovery installment', isActive: true },
    { name: 'EOBI', type: 'deduction', description: 'Employees Old-Age Benefits contribution', isActive: true },
    { name: 'Advance Salary', type: 'deduction', description: 'Advance salary recovery deduction', isActive: true },
    { name: 'Half-Day Penalty', type: 'deduction', description: 'Attendance policy half-day penalty', isActive: true },
    { name: 'Absence Penalty', type: 'deduction', description: 'Unapproved absence pay deduction', isActive: true },
    { name: 'Security Deposit', type: 'deduction', description: 'Employment security deposit deduction', isActive: true }
];

/**
 * @route   GET /api/config/salary-components
 * @desc    Get all salary & payroll components (auto-seeds defaults if none exist)
 */
router.get('/salary-components', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { type, activeOnly } = req.query;
        let count = await SalaryComponent.countDocuments();
        if (count === 0) {
            await SalaryComponent.insertMany(DEFAULT_SALARY_COMPONENTS);
        }

        const filter: any = {};
        if (type && (type === 'earning' || type === 'deduction')) {
            filter.type = type;
        }
        if (activeOnly === 'true') {
            filter.isActive = true;
        }

        const components = await SalaryComponent.find(filter).sort({ type: 1, name: 1 });
        res.json(components);
    } catch (error) {
        next(error);
    }
});

/**
 * @route   POST /api/config/salary-components
 * @desc    Create a new salary/payroll component
 */
router.post('/salary-components', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, type, description, isActive } = req.body;
        const authReq = req as AuthRequest;

        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'Component name is required.' });
        }

        const compType = type === 'deduction' ? 'deduction' : 'earning';
        const trimmedName = name.trim();

        const existing = await SalaryComponent.findOne({ 
            name: { $regex: new RegExp(`^${trimmedName}$`, 'i') }, 
            type: compType 
        });
        if (existing) {
            return res.status(400).json({ message: `A ${compType} component with this name already exists.` });
        }

        const component = new SalaryComponent({
            name: trimmedName,
            type: compType,
            description: description?.trim(),
            isActive: isActive !== undefined ? isActive : true
        });
        await component.save();

        await AuditLog.create({
            action: 'CREATE',
            targetResource: 'SalaryComponent',
            targetId: component._id.toString(),
            performedBy: authReq.user?.userId || 'System',
            details: { name: component.name, type: component.type }
        });

        res.status(201).json(component);
    } catch (error: any) {
        if (error.code === 11000) {
            return res.status(400).json({ message: 'A component with this name and type already exists.' });
        }
        next(error);
    }
});

/**
 * @route   PUT /api/config/salary-components/:id
 * @desc    Update a salary/payroll component
 */
router.put('/salary-components/:id', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, type, description, isActive } = req.body;
        const authReq = req as AuthRequest;

        const updateData: any = {};
        if (name !== undefined) updateData.name = name.trim();
        if (type !== undefined) updateData.type = type === 'deduction' ? 'deduction' : 'earning';
        if (description !== undefined) updateData.description = description.trim();
        if (isActive !== undefined) updateData.isActive = Boolean(isActive);

        const component = await SalaryComponent.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );

        if (!component) return res.status(404).json({ message: 'Salary component not found' });

        await AuditLog.create({
            action: 'UPDATE',
            targetResource: 'SalaryComponent',
            targetId: component._id.toString(),
            performedBy: authReq.user?.userId || 'System',
            details: { name: component.name, type: component.type, isActive: component.isActive }
        });

        res.json(component);
    } catch (error: any) {
        if (error.code === 11000) {
            return res.status(400).json({ message: 'A component with this name and type already exists.' });
        }
        next(error);
    }
});

/**
 * @route   DELETE /api/config/salary-components/:id
 * @desc    Delete a salary/payroll component
 */
router.delete('/salary-components/:id', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        const component = await SalaryComponent.findByIdAndDelete(req.params.id);
        
        if (!component) return res.status(404).json({ message: 'Salary component not found' });

        await AuditLog.create({
            action: 'DELETE',
            targetResource: 'SalaryComponent',
            targetId: component._id.toString(),
            performedBy: authReq.user?.userId || 'System',
            details: { name: component.name, type: component.type }
        });

        res.json({ message: 'Salary component deleted successfully' });
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
                branding: { primaryColor: '#1C0626', secondaryColor: '#721466' },
                contact: {
                    addressLine1: 'Karachi: 6/K Block 2, P.E.C.H.S, Near Model School Karachi Pakistan',
                    addressLine2: 'Lahore: Office 32, 1st Floor, IT Tower 73-E/1, Hali Rd | Islamabad: Office #14, Ground Floor, Malik Plaza F-8',
                    phone: '+92 21 111-482-711',
                    email: 'info@itcs.com.pk'
                }
            });
            await company.save();
        } else {
            let updated = false;
            if (company.branding?.primaryColor !== '#1C0626' || company.branding?.secondaryColor !== '#721466') {
                company.branding = { primaryColor: '#1C0626', secondaryColor: '#721466' };
                updated = true;
            }
            if (!company.logoUrl && defaultLogoBase64) {
                company.logoUrl = defaultLogoBase64;
                updated = true;
            }
            if (updated) await company.save();
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
 * @desc    Get permissions configuration for all roles (Super-Admin only)
 */
router.get('/roles-permissions', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        if (!['super-admin', 'admin'].includes(authReq.user?.role || '')) {
            return res.status(403).json({ message: 'Forbidden. Admin access required.' });
        }
        const permissions = await RolePermission.find().sort({ role: 1 });
        res.json(permissions);
    } catch (error) {
        next(error);
    }
});

/**
 * @route   PUT /api/config/roles-permissions
 * @desc    Save matrix permissions updates (Admin & Super-Admin)
 */
router.put('/roles-permissions', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        if (!['super-admin', 'admin'].includes(authReq.user?.role || '')) {
            return res.status(403).json({ message: 'Forbidden. Admin access required.' });
        }
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
 * @desc    Reset all role permissions to system defaults (Admin & Super-Admin)
 */
router.post('/roles-permissions/reset', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    if (!['super-admin', 'admin'].includes(authReq.user?.role || '')) {
        return res.status(403).json({ message: 'Forbidden. Admin access required.' });
    }
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
