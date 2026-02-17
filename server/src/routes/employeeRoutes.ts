
import express, { Request, Response } from 'express';
import Employee from '../models/Employee';
import AuditLog from '../models/AuditLog';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { canCreateUser, canViewEmployee, canEditSensitiveData, canApproveDocuments } from '../middleware/permissions';

const router = express.Router();

// Helper to create audit log
const createAuditLog = async (action: string, targetId: string, performedBy: string, details: any) => {
    try {
        await AuditLog.create({
            action,
            targetResource: 'Employee',
            targetId,
            performedBy,
            details
        });
    } catch (err) {
        console.error('Failed to create audit log:', err);
    }
};

// Get all employees (Protected) - Role-based filtering
router.get('/', authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    try {
        const role = authReq.user?.role || 'employee';
        const userId = authReq.user?.userId;
        const queryUserId = req.query.userId as string; // Support querying by userId

        let employees;

        if (queryUserId) {
            // If userId query parameter is provided, return that specific employee
            // Only allow if user is querying their own userId or is admin
            if (queryUserId === userId || role === 'super-admin' || role === 'admin') {
                const employee = await Employee.findOne({ userId: queryUserId });
                employees = employee ? [employee] : [];
            } else {
                return res.status(403).json({ message: 'You do not have permission to view this employee' });
            }
        } else if (role === 'super-admin' || role === 'admin') {
            // Super-admin and Admin can see all employees
            employees = await Employee.find();
        } else if (role === 'manager') {
            // Manager can only see direct reports
            const managerEmployee = await Employee.findOne({ userId });
            if (!managerEmployee) {
                return res.status(404).json({ message: 'Manager employee record not found' });
            }
            employees = await Employee.find({ 'jobInfo.reportingManager': managerEmployee.employeeId });
        } else {
            // Employee can only see their own profile
            const employee = await Employee.findOne({ userId });
            employees = employee ? [employee] : [];
        }

        res.json(employees);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// Create employee (Protected)
// Super-Admin/Admin can create any employee
// Employees can create their own employee record
router.post('/', authenticate, upload.array('attachments'), async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const role = authReq.user?.role || '';
    const userId = authReq.user?.userId;
    
    // Check if employee is trying to create their own record
    const isCreatingOwnRecord = req.body.userId === userId;
    
    // If not creating own record, check admin permission
    if (!isCreatingOwnRecord && !canCreateUser(role)) {
        return res.status(403).json({ message: 'You do not have permission to create employees' });
    }
    
    // If employee is creating own record, ensure userId matches
    if (isCreatingOwnRecord && role === 'employee') {
        // Ensure the userId in the request matches the authenticated user
        req.body.userId = userId;
    }
    // Note: req.body will contain text fields, req.files will contain files
    // Since we are sending JSON for complex nested fields from frontend, 
    // dealing with multipart/form-data for nested objects can be tricky.
    // For this implementation, we will assume:
    // 1. If files are uploaded, they are handled separately or linked via IDs.
    // 2. OR the frontend sends everything as FormData stringified JSONs.
    // Let's assume standard JSON body for data, and separate endpoint for files OR mixed.
    // Given the previous code used JSON body, let's keep it simple:
    // If we want file uploads + data in one go, we must use FormData.
    // The body will be [Object: null prototype]. We might need to parsing if it's stringified.

    // Simplification for MVP: We will handle data creation here. File uploads can be separate or we assume simplified FormData.
    // If Body is JSON (standard creation), we proceed. 

    try {
        let employeeData = req.body;

        // If coming from FormData, nested objects might be JSON strings or dot notation keys
        // Assuming the frontend sends a structured JSON payload for now primarily. 
        // If we strictly used JSON content-type, req.files would be empty (unless using a mixed parser).
        // Let's support standard JSON creation first as per original code, allowing 'attachments' to be URLs if already uploaded.

        const employee = new Employee({
            ...employeeData,
            employmentStatus: {
                ...employeeData.employmentStatus,
                probationEndDate: employeeData.employmentStatus?.status === 'Probation' ? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) : null // Default 3 months
            }
        });

        const newEmployee = await employee.save();

        // Log action
        await createAuditLog('CREATE', newEmployee.employeeId, authReq.user?.userId || 'unknown', { name: `${newEmployee.firstName} ${newEmployee.lastName}` });

        res.status(201).json(newEmployee);
    } catch (err: any) {
        res.status(400).json({ message: err.message });
    }
});

// Get single employee (Role-based access)
router.get('/:id', authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    try {
        const employee = await Employee.findOne({ employeeId: req.params.id });
        if (!employee) return res.status(404).json({ message: 'Employee not found' });

        // Check if user can view this employee
        const canView = await canViewEmployee(
            authReq.user?.role || '',
            authReq.user?.userId || '',
            req.params.id,
            employee
        );
        if (!canView) {
            return res.status(403).json({ message: 'You do not have permission to view this employee' });
        }

        res.json(employee);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// Upload attachment for an employee (All roles can upload)
router.post('/:id/attachments', authenticate, upload.single('file'), async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    try {
        if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

        const employee = await Employee.findOne({ employeeId: req.params.id });
        if (!employee) return res.status(404).json({ message: 'Employee not found' });

        // Check if user can view this employee (to upload for them)
        const canView = await canViewEmployee(
            authReq.user?.role || '',
            authReq.user?.userId || '',
            req.params.id,
            employee
        );
        if (!canView) {
            return res.status(403).json({ message: 'You do not have permission to upload documents for this employee' });
        }

        if (!employee.attachments) employee.attachments = [];

        const attachment = {
            fileType: req.body.fileType || 'Document', // 'ID', 'Contract', etc.
            fileName: req.file.originalname,
            filePath: req.file.path,
            uploadDate: new Date(),
            status: canApproveDocuments(authReq.user?.role || '') ? 'approved' : 'pending', // Auto-approve if admin
            uploadedBy: authReq.user?.userId
        };

        employee.attachments.push(attachment as any);
        await employee.save();

        await createAuditLog('UPLOAD_DOC', employee.employeeId, authReq.user?.userId || 'unknown', { file: req.file.originalname });

        res.status(200).json(attachment);

    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// Approve/Reject document (Super-Admin/Admin only)
router.patch('/:id/attachments/:attachmentId', authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    try {
        if (!canApproveDocuments(authReq.user?.role || '')) {
            return res.status(403).json({ message: 'You do not have permission to approve documents' });
        }

        const employee = await Employee.findOne({ employeeId: req.params.id });
        if (!employee) return res.status(404).json({ message: 'Employee not found' });

        const { status } = req.body; // 'approved' or 'rejected'
        if (!employee.attachments) return res.status(404).json({ message: 'No attachments found' });

        const attachmentIndex = employee.attachments.findIndex((att: any) => att._id?.toString() === req.params.attachmentId);
        if (attachmentIndex === -1) return res.status(404).json({ message: 'Attachment not found' });

        (employee.attachments[attachmentIndex] as any).status = status;
        (employee.attachments[attachmentIndex] as any).reviewedBy = authReq.user?.userId;
        (employee.attachments[attachmentIndex] as any).reviewedAt = new Date();

        await employee.save();

        await createAuditLog('DOC_APPROVAL', employee.employeeId, authReq.user?.userId || 'unknown', { 
            attachment: req.params.attachmentId, 
            status 
        });

        res.json(employee.attachments[attachmentIndex]);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// Update employee (Role-based access)
router.put('/:id', authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    try {
        const employee = await Employee.findOne({ employeeId: req.params.id });
        if (!employee) return res.status(404).json({ message: 'Employee not found' });

        // Check if user can view this employee
        const canView = await canViewEmployee(
            authReq.user?.role || '',
            authReq.user?.userId || '',
            req.params.id,
            employee
        );
        if (!canView) {
            return res.status(403).json({ message: 'You do not have permission to view this employee' });
        }

        const updates = req.body;
        const role = authReq.user?.role || '';
        
        // Fields that can only be set once and cannot be edited after being filled
        // Admins can override this restriction
        const oneTimeFields = ['cnic', 'dateOfBirth', 'bloodGroup', 'fatherName', 'nationality'] as const;
        
        // Only apply one-time field restrictions if user is NOT an admin
        // Admins can edit all fields including one-time fields
        if (role !== 'super-admin' && role !== 'admin') {
            // Prevent editing one-time fields if they already exist
            // Allow setting if field is currently empty, but prevent changing if already filled
            oneTimeFields.forEach(field => {
                const employeeObj = employee.toObject();
                const currentValue = employeeObj[field as keyof typeof employeeObj];
                const newValue = updates[field];
                
                // If field already has a value and user is trying to change it, prevent the change
                if (currentValue && newValue && currentValue !== newValue) {
                    // Field already exists and user is trying to change it - prevent this
                    delete updates[field];
                }
                // If field is empty and user is setting it, allow it (newValue exists but currentValue doesn't)
                // If field already has a value and user sends the same value, allow it (no change)
                // If field already has a value and user sends empty/null, prevent clearing it
                if (currentValue && (!newValue || newValue === '')) {
                    delete updates[field];
                }
            });
        }

        // Auto-calculate probation end if status changes to Probation
        if (updates.employmentStatus?.status === 'Probation' && employee.employmentStatus?.status !== 'Probation') {
            updates.employmentStatus.probationEndDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
        }

        Object.assign(employee, updates);
        const updatedEmployee = await employee.save();

        await createAuditLog('UPDATE', updatedEmployee.employeeId, authReq.user?.userId || 'unknown', { updates: Object.keys(updates) });

        res.json(updatedEmployee);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// Delete employee (Super-Admin/Admin only)
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    
    // Check permission
    if (!canCreateUser(authReq.user?.role || '')) {
        return res.status(403).json({ message: 'You do not have permission to delete employees' });
    }
    
    try {
        const deletedEmployee = await Employee.findOneAndDelete({ employeeId: req.params.id });
        if (!deletedEmployee) {
            return res.status(404).json({ message: 'Employee not found' });
        }

        await createAuditLog('DELETE', req.params.id, authReq.user?.userId || 'unknown', {});

        res.json({ message: 'Employee deleted' });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

export default router;
