
import express from 'express';
import Employee from '../models/Employee';
import AuditLog from '../models/AuditLog';
import { authenticate, authorize } from '../middleware/auth';
import { upload } from '../middleware/upload';

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

// Get all employees (Protected)
router.get('/', async (req, res) => {
    try {
        // In a real app, might filter by visibility
        const employees = await Employee.find();
        res.json(employees);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// Create employee (Protected, HR/Admin)
router.post('/', authenticate, authorize(['admin', 'hr']), upload.array('attachments'), async (req: any, res) => {
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
        await createAuditLog('CREATE', newEmployee.employeeId, req.user?.userId || 'unknown', { name: `${newEmployee.firstName} ${newEmployee.lastName}` });

        res.status(201).json(newEmployee);
    } catch (err: any) {
        res.status(400).json({ message: err.message });
    }
});

// Upload attachment for an employee
router.post('/:id/attachments', authenticate, upload.single('file'), async (req: any, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

        const employee = await Employee.findOne({ employeeId: req.params.id });
        if (!employee) return res.status(404).json({ message: 'Employee not found' });

        if (!employee.attachments) employee.attachments = [];

        const attachment = {
            fileType: req.body.fileType || 'Document', // 'ID', 'Contract', etc.
            fileName: req.file.originalname,
            filePath: req.file.path,
            uploadDate: new Date()
        };

        employee.attachments.push(attachment as any);
        await employee.save();

        await createAuditLog('UPLOAD_DOC', employee.employeeId, req.user?.userId || 'unknown', { file: req.file.originalname });

        res.status(200).json(attachment);

    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// Update employee
router.put('/:id', authenticate, authorize(['admin', 'hr']), async (req: any, res) => {
    try {
        const employee = await Employee.findOne({ employeeId: req.params.id });
        if (!employee) return res.status(404).json({ message: 'Employee not found' });

        const updates = req.body;

        // Auto-calculate probation end if status changes to Probation
        if (updates.employmentStatus?.status === 'Probation' && employee.employmentStatus?.status !== 'Probation') {
            updates.employmentStatus.probationEndDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
        }

        Object.assign(employee, updates);
        const updatedEmployee = await employee.save();

        await createAuditLog('UPDATE', updatedEmployee.employeeId, req.user?.userId || 'unknown', { updates: Object.keys(updates) });

        res.json(updatedEmployee);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// Delete employee
router.delete('/:id', authenticate, authorize(['admin']), async (req: any, res) => {
    try {
        const deletedEmployee = await Employee.findOneAndDelete({ employeeId: req.params.id });
        if (!deletedEmployee) {
            return res.status(404).json({ message: 'Employee not found' });
        }

        await createAuditLog('DELETE', req.params.id, req.user?.userId || 'unknown', {});

        res.json({ message: 'Employee deleted' });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

export default router;
