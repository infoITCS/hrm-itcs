// Native pick — replaces lodash's _.pick, eliminating the dependency
const pick = (obj: Record<string, unknown>, keys: string[]): Record<string, unknown> =>
    keys.reduce((acc: Record<string, unknown>, key: string) => {
        if (Object.prototype.hasOwnProperty.call(obj, key)) acc[key] = obj[key];
        return acc;
    }, {});
import fs from 'fs';
import express, { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';

import sanitize from 'sanitize-filename';
import Employee from '../models/Employee';
import User from '../models/User.model';
import AttachmentFile from '../models/AttachmentFile';
import Counter from '../models/Counter';
import AuditLog from '../models/AuditLog';
import { authenticate, authorize, AuthRequest, authenticateFile } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { canCreateUser, canViewEmployee, canEditSensitiveData, canApproveDocuments } from '../middleware/permissions';
import { getDiff } from '../utils/diff';
import logger from '../utils/logger';



// Native magic-byte MIME detector — replaces the file-type package.
// Covers exactly the MIME types allowed in the upload allowlist.
// Using magic bytes is more reliable than file extension alone (polyglot attack defense).
const detectMimeFromBuffer = (buf: Buffer): string | null => {
    if (buf.length < 4) return null;
    // JPEG: FF D8 FF
    if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
    // GIF: 47 49 46 38
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
    // WebP: 52 49 46 46 ... 57 45 42 50
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
        buf.length >= 12 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50)
        return 'image/webp';
    // PDF: 25 50 44 46
    if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf';
    // DOC (old): D0 CF 11 E0 (OLE2 compound document — can be Word, Excel, or PPT)
    if (buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0) {
        // H3 FIX: Distinguish OLE2 subtypes (Word vs Excel vs PPT)
        // We look for stream names in the first 4KB of the OLE container.
        const header = buf.slice(0, 4096).toString('binary');
        if (header.includes('WordDocument')) return 'application/msword';
        if (header.includes('Workbook') || header.includes('Book')) return 'application/vnd.ms-excel';
        if (header.includes('PowerPoint Document')) return 'application/vnd.ms-powerpoint';
        return 'application/x-ole-storage'; // Generic OLE
    }
    // DOCX (ZIP-based, starts with PK): 50 4B 03 04
    if (buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04) {
        // H3 FIX: Inspect ZIP container for "word/document.xml" signature to confirm it's a DOCX
        // DOCX is a ZIP containing a word/ directory. We look for this string in the first 4KB.
        const header = buf.slice(0, 4096).toString('binary');
        if (header.includes('word/document.xml') || header.includes('word/_rels/document.xml.rels')) {
            return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        }
        // If it's a ZIP but doesn't look like Word, we still might allow it if it's Excel/PPT later, 
        // but for now, we only allow Word as per previous logic.
    }
    return null;
};

const router = express.Router();

// Helper to create audit log
const createAuditLog = async (action: string, targetId: string, performedBy: string, details: any) => {
    try {
        if (action === 'UPDATE' && details.diff) {
            // Find recent UPDATE log for this target within the last 10 minutes
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
            const recentLog = await AuditLog.findOne({
                action: 'UPDATE',
                targetId,
                performedBy,
                timestamp: { $gte: tenMinutesAgo }
            }).sort({ timestamp: -1 });

            if (recentLog && recentLog.details?.diff) {
                // Merge diffs
                const mergedDiff = { ...recentLog.details.diff };

                for (const key in details.diff) {
                    if (mergedDiff[key]) {
                        // Inherit original old value, but use latest new value
                        // Handle nested object diffs recursively if needed, but for simplicity:
                        if (typeof mergedDiff[key].old !== 'undefined' && typeof details.diff[key].new !== 'undefined') {
                            mergedDiff[key] = {
                                old: mergedDiff[key].old,
                                new: details.diff[key].new
                            };
                        } else {
                            // If it's a nested diff object structure, just overwrite for now to prevent deep nesting bugs
                            mergedDiff[key] = details.diff[key];
                        }

                        // If the change was reverted back to original, remove it from log
                        // JSON.stringify comparison is reliable here — diffs contain
                        // already-normalized plain objects (no circular refs, no Dates)
                        if (JSON.stringify(mergedDiff[key].old) === JSON.stringify(mergedDiff[key].new)) {
                            delete mergedDiff[key];
                        }
                    } else {
                        // Completely new field modification inside the 10-minute window
                        mergedDiff[key] = details.diff[key];
                    }
                }

                // If all changes were reverted and the diff is functionally empty, destroy the log entirely
                if (Object.keys(mergedDiff).length === 0) {
                    await AuditLog.findByIdAndDelete(recentLog._id);
                    return;
                }

                // Push merged diff to DB
                await AuditLog.findByIdAndUpdate(recentLog._id, {
                    details: { diff: mergedDiff },
                    timestamp: new Date() // reset window clock to allow continuous editing sessions 
                });
                return; // Prevent creating a new duplicate log
            }
        }

        await AuditLog.create({
            action,
            targetResource: 'Employee',
            targetId,
            performedBy,
            details
        });
    } catch (err) {
        logger.error('Failed to create audit log:', err);
    }
};

// Get simplified directory (All active employees, limited info)
// Open to all authenticated users for internal phonebook purposes
router.get('/directory', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const directory = await Employee.find({
            'employmentStatus.status': { $nin: ['Terminated', 'Resigned'] }
        })
        .select('firstName lastName middleName avatar workEmail phone jobInfo.designation jobInfo.department employeeId userId attachments._id attachments.fileType')
        .sort({ firstName: 1 })
        .lean();

        res.json(directory);
    } catch (err: any) {
        next(err);
    }
});

// Get all employees (Protected) - Role-based filtering
router.get('/', authenticate, async (req: Request, res: Response, next: Function) => {
    const authReq = req as AuthRequest;
    try {
        const role = authReq.user?.role || 'employee';
        const userId = authReq.user?.userId;
        const queryUserId = req.query.userId;
        
        // Sanitize: only accept plain string userId, reject object operators
        if (queryUserId && typeof queryUserId !== 'string') {
            return res.status(400).json({ message: 'Invalid query parameters' });
        }

        // Pagination
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
        const skip = (page - 1) * limit;

        let employees;
        let total = 0;

        // Base filter: always exclude soft-deleted employees from normal queries
        const baseFilter = { isDeleted: { $ne: true } };

        if (queryUserId) {
            if (queryUserId === userId || role === 'super-admin' || role === 'admin' || role === 'manager') {
                const employee = await Employee.findOne({ userId: queryUserId, ...baseFilter }).select('-attachments.fileData').lean();
                employees = employee ? [employee] : [];
                total = employees.length;
            } else {
                return res.status(403).json({ message: 'You do not have permission to view this employee' });
            }
        } else if (role === 'super-admin' || role === 'admin') {
            // Admins see all non-deleted employees
            [employees, total] = await Promise.all([
                Employee.find(baseFilter).select('-attachments.fileData').skip(skip).limit(limit).lean(),
                Employee.countDocuments(baseFilter)
            ]);
        } else if (role === 'manager') {
            // Managers see only their direct reports + their own record
            const managerEmployee = await Employee.findOne({ userId, ...baseFilter }).select('employeeId').lean() as any;
            if (!managerEmployee) {
                return res.status(404).json({ message: 'Manager employee record not found' });
            }
            const query = { ...baseFilter, $or: [{ 'jobInfo.reportingManager': managerEmployee.employeeId }, { userId }] };
            [employees, total] = await Promise.all([
                Employee.find(query).select('-attachments.fileData').skip(skip).limit(limit).lean(),
                Employee.countDocuments(query)
            ]);
        } else {
            const employee = await Employee.findOne({ userId, ...baseFilter }).select('-attachments.fileData').lean();
            employees = employee ? [employee] : [];
            total = employees.length;
        }

        res.json({ employees, total, page, totalPages: Math.ceil(total / limit) });
    } catch (err: any) {
        next(err);
    }
});

// Create employee (Protected)
// Super-Admin/Admin can create any employee
// Employees can create their own employee record
router.post('/', authenticate, upload.array('attachments'), async (req: Request, res: Response, next: NextFunction) => {
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

    try {
        // SECURITY: Mass Assignment Protection
        const EMPLOYEE_EDITABLE_FIELDS = [
            'firstName', 'lastName', 'middleName', 'phone', 'address', 'temporaryAddress', 'cnic', 
            'dateOfBirth', 'gender', 'maritalStatus', 'nationality', 'email', 'userId',
            'fatherName', 'bloodGroup', 'religion', 'domicile'
        ];
        const ADMIN_EXTRA_FIELDS = [
            'jobInfo', 'employmentStatus', 'salaryComponents', 'benefits', 
            'workEmail', 'otherEmail', 'employeeId', 'biometricPin'
        ];

        const allowedFields = (role === 'super-admin' || role === 'admin' || role === 'manager')
            ? [...EMPLOYEE_EDITABLE_FIELDS, ...ADMIN_EXTRA_FIELDS]
            : EMPLOYEE_EDITABLE_FIELDS;

        const employeeData = pick(req.body, allowedFields) as any;

        // Basic validation
        if (!employeeData.firstName || !employeeData.lastName) {
            return res.status(400).json({ message: 'First name and last name are required' });
        }

        // Prevent duplicate employee records for the same user
        if (employeeData.userId) {
            const existingEmp = await Employee.findOne({ userId: employeeData.userId });
            if (existingEmp) {
                return res.status(400).json({ 
                    message: 'An employee record already exists for this user.',
                    employeeId: existingEmp.employeeId 
                });
            }
        }

        // Prevent duplicate work emails
        if (employeeData.workEmail) {
            // we should also trim it and maybe check case insensitively, but keeping it simple as requested or maybe just use the raw value since it could be lowercased before saving
            const existingEmailEmp = await Employee.findOne({ 
                workEmail: { $regex: new RegExp(`^${employeeData.workEmail}$`, 'i') } 
            });
            if (existingEmailEmp) {
                return res.status(400).json({ message: 'An employee with this work email already exists. Unable to create a new record.' });
            }
        }

        // Auto-generate employeeId if not provided (standard for new creations)
        if (!employeeData.employeeId) {
            // H3 FIX: Atomic Counter implementation using findOneAndUpdate to prevent race conditions
            const PREFIX = 'itcs-';
            const counter = await Counter.findOneAndUpdate(
                { key: 'employeeId' },
                { $inc: { seq: 1 } },
                { upsert: true, new: true }
            );
            
            const nextNum = counter.seq;
            employeeData.employeeId = `${PREFIX}${nextNum.toString().padStart(3, '0')}`;
        }

        // Sanitize jobInfo.shift: if it's an empty string, set it to null 
        // to avoid BSONError/CastError when converting to ObjectId
        if (employeeData.jobInfo && employeeData.jobInfo.shift === '') {
            employeeData.jobInfo.shift = null;
        }

        const employee = new Employee({
            ...employeeData,
            jobInfo: {
                designation: 'Employee',
                department: 'General',
                joiningDate: new Date(),
                ...employeeData.jobInfo
            },
            employmentStatus: {
                status: 'Probation', // Default
                ...employeeData.employmentStatus,
                probationEndDate: (employeeData.employmentStatus?.status === 'Probation' || !employeeData.employmentStatus)
                    ? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) 
                    : employeeData.employmentStatus?.probationEndDate
            }
        });

        const newEmployee = await employee.save();

        // Sync names to User model if userId exists
        if (newEmployee.userId && (newEmployee.firstName || newEmployee.lastName)) {
            await User.findByIdAndUpdate(newEmployee.userId, {
                ...(newEmployee.firstName && { firstName: newEmployee.firstName }),
                ...(newEmployee.lastName && { lastName: newEmployee.lastName })
            });
        }

        // Log action
        await createAuditLog('CREATE', newEmployee.employeeId, authReq.user?.userId || 'unknown', { name: `${newEmployee.firstName} ${newEmployee.lastName}` });

        res.status(201).json(newEmployee);
    } catch (err: any) {
        // Handle Mongolian Duplicate Key Error Specifically
        if (err.code === 11000) {
            return res.status(400).json({ message: 'Employee ID or record already exists. Please try again.' });
        }
        res.status(400).json({ message: err.message });
    }
});

// Get single employee (Role-based access)
// Check for duplicate employees (by CNIC or email)
router.get('/check-duplicate', authenticate, async (req: Request, res: Response, next: Function) => {
    try {
        const { cnic, email, employeeId } = req.query;

        // Sanitize: reject MongoDB operator objects (NoSQL injection protection)
        if ((cnic && typeof cnic !== 'string') || (email && typeof email !== 'string') || (employeeId && typeof employeeId !== 'string')) {
            return res.status(400).json({ message: 'Invalid query parameters' });
        }

        if (!cnic && !email) {
            return res.status(400).json({ message: 'CNIC or email is required' });
        }

        const query: any = { $or: [] };
        if (cnic) query.$or.push({ cnic: cnic.trim() });
        if (email) query.$or.push({ email: email.trim().toLowerCase() });
        
        const existing = await Employee.findOne(query).select('firstName lastName employeeId').lean() as any;
        
        if (existing && existing.employeeId !== employeeId) {
            return res.json({ 
                isDuplicate: true, 
                message: `An employee with this ${cnic ? 'CNIC' : 'email'} already exists: ${existing.firstName} ${existing.lastName} (${existing.employeeId})`,
                existingEmployee: existing
            });
        }

        res.json({ isDuplicate: false });
    } catch (err) {
        logger.error('Duplicate check error:', err);
        next(err);
    }
});

// Get today's birthdays and anniversaries
router.get('/today-specials', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const today = new Date();
        const currentMonth = today.getMonth() + 1; // 1-12
        const currentDay = today.getDate();

        // MongoDB aggregation to find employees with birthdays or joining today
        const employees = await Employee.find({
            $or: [
                {
                    $expr: {
                        $and: [
                            { $eq: [{ $month: "$dateOfBirth" }, currentMonth] },
                            { $eq: [{ $dayOfMonth: "$dateOfBirth" }, currentDay] }
                        ]
                    }
                },
                {
                    $expr: {
                        $and: [
                            { $eq: [{ $month: "$jobInfo.joiningDate" }, currentMonth] },
                            { $eq: [{ $dayOfMonth: "$jobInfo.joiningDate" }, currentDay] }
                        ]
                    }
                }
            ]
        }).select('firstName lastName employeeId avatar dateOfBirth jobInfo.joiningDate');

        const specials = employees.map(emp => {
            const isBirthday = emp.dateOfBirth && 
                             (emp.dateOfBirth.getMonth() + 1 === currentMonth) && 
                             (emp.dateOfBirth.getDate() === currentDay);
            
            const isAnniversary = emp.jobInfo?.joiningDate && 
                                (emp.jobInfo.joiningDate.getMonth() + 1 === currentMonth) && 
                                (emp.jobInfo.joiningDate.getDate() === currentDay);

            let yearsCompleted = 0;
            if (isAnniversary && emp.jobInfo?.joiningDate) {
                yearsCompleted = today.getFullYear() - emp.jobInfo.joiningDate.getFullYear();
            }

            return {
                id: emp.employeeId,
                name: `${emp.firstName} ${emp.lastName}`,
                avatar: emp.avatar,
                type: isBirthday ? 'birthday' : 'anniversary',
                yearsCompleted: isAnniversary ? yearsCompleted : undefined
            };
        });

        res.json(specials.filter(s => s.type === 'birthday' || (s.type === 'anniversary' && s.yearsCompleted! > 0)));
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/:id', authenticate, async (req: Request, res: Response, next: Function) => {
    const authReq = req as AuthRequest;
    try {
        const employee = await Employee.findOne({ employeeId: req.params.id }).select('-attachments.fileData').lean();
        if (!employee) return res.status(404).json({ message: 'Employee not found' });

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
        next(err);
    }
});

// Upload attachment for an employee (All roles can upload)
router.post('/:id/attachments', authenticate, upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

        // Exclude fileData to prevent downloading hundreds of megabytes just to check permissions
        const employee = await Employee.findOne({ employeeId: req.params.id }).select('-attachments.fileData');
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

        // Read file into buffer for MongoDB storage
        const filePath = req.file.path;
        const fileBuffer = fs.readFileSync(filePath);

        // SECURITY: Validate magic bytes to ensure file content matches extension.
        // Native implementation — file-type package removed (ESM-only in v22+, CVE in v13-21).
        const detectedMime = detectMimeFromBuffer(fileBuffer);
        const allowedMimes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];

        if (!detectedMime || !allowedMimes.includes(detectedMime)) {
            try { fs.unlinkSync(filePath); } catch (e) {}
            return res.status(400).json({ 
                message: 'Invalid file content. The file contents do not match the expected type.' 
            });
        }

        // 1. Clear existing documents of the same type to prevent bloat (except for generic buckets like 'Other Documents')
        const fileType = req.body.fileType || 'Document';
        const additiveTypes = ['Other Documents']; 
        
        if (!additiveTypes.includes(fileType)) {
            await Employee.updateOne(
                { employeeId: req.params.id },
                { $pull: { attachments: { fileType: fileType } } }
            );
        } else if (fileType === 'Other Documents') {
            // Security: Limit "Other Documents" to 10 files to prevent database bloat/abuse
            const docCount = (employee.attachments || []).filter((a: any) => a.fileType === 'Other Documents').length;
            if (docCount >= 10) {
                // Clean up the uploaded temp file before returning error
                try { fs.unlinkSync(req.file.path); } catch (e) {}
                return res.status(400).json({ message: 'Maximum limit of 10 "Other Documents" reached. Please delete old ones before uploading new files.' });
            }
        }

        // SECURITY: Sanitize filename to prevent path traversal or malicious characters
        const safeFilename = sanitize(req.file.originalname);

        const attachmentId = new mongoose.Types.ObjectId();
        const attachment = {
            _id: attachmentId,
            fileType: fileType,
            fileName: safeFilename,
            filePath: req.file.filename,
            contentType: detectedMime!, // Use detected mime from magic bytes, not client-provided
            uploadDate: new Date(),
            status: canApproveDocuments(authReq.user?.role || '') ? 'approved' : 'pending',
            uploadedBy: authReq.user?.userId
        };

        // 2a. Save file buffer to dedicated AttachmentFile collection
        await AttachmentFile.create({
            _id: attachmentId,
            employeeId: employee.employeeId,
            fileData: fileBuffer,
            contentType: detectedMime!
        });

        // 2. Use updateOne to push attachment directly into MongoDB array.
        // Doing this avoids Mongoose overwriting arrays when they are loaded partially (without fileData)
        await Employee.updateOne(
            { employeeId: req.params.id },
            { $push: { attachments: attachment as any } }
        );

        // If this is a profile picture, update the User and Employee model
        if (attachment.fileType === 'Profile Picture') {
            const newAvatarUrl = `/api/employees/attachments/raw/${attachmentId}`;
            await Employee.updateOne({ employeeId: req.params.id }, { avatar: newAvatarUrl });

            if (employee.userId) {
                await User.findByIdAndUpdate(employee.userId, { avatar: newAvatarUrl });
            }
        }

        await createAuditLog('UPLOAD_DOC', employee.employeeId, authReq.user?.userId || 'unknown', { file: safeFilename });

        // Clean up: delete the local file after saving to MongoDB
        try {
            fs.unlinkSync(filePath);
        } catch (unlinkErr) {
            logger.error('Failed to delete temporary file:', unlinkErr);
        }

        res.status(200).json(attachment);

    } catch (err: any) {
        next(err);
    }
});

// Route to serve raw file from MongoDB — PUBLIC access for <img> tags
router.get('/attachments/raw/:attachmentId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employee = await Employee.findOne(
            { 'attachments._id': req.params.attachmentId },
            { 'attachments.$': 1 }
        );
        
        // If file not found in DB, send a default SVG icon instead of 404
        if (!employee || !employee.attachments || employee.attachments.length === 0) {
            return sendDefaultAvatar(res);
        }

        const attachment = employee.attachments[0];
        const fileDoc = await AttachmentFile.findById(req.params.attachmentId);
        
        if (!fileDoc || !fileDoc.fileData) {
            return sendDefaultAvatar(res);
        }

        res.set('Cache-Control', 'public, max-age=86400, immutable');
        res.set('Content-Type', fileDoc.contentType || attachment.contentType || 'application/octet-stream');
        res.set('Content-Disposition', `inline; filename="${attachment.fileName}"`);
        res.send(fileDoc.fileData);
    } catch (err: any) {
        // Even on database error, try to send the placeholder to keep the UI clean
        sendDefaultAvatar(res);
    }
});

// Helper to send a simple SVG avatar placeholder
function sendDefaultAvatar(res: Response) {
    const svg = `
        <svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="100" height="100" fill="#F1F5F9"/>
            <circle cx="50" cy="40" r="20" fill="#CBD5E1"/>
            <path d="M20 80C20 63.4315 33.4315 50 50 50C66.5685 50 80 63.4315 80 80V100H20V80Z" fill="#CBD5E1"/>
        </svg>
    `.trim();
    res.set('Content-Type', 'image/svg+xml');
    res.set('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(svg);
}

// Approve/Reject document (Super-Admin/Admin only)
router.patch('/:id/attachments/:attachmentId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        if (!canApproveDocuments(authReq.user?.role || '')) {
            return res.status(403).json({ message: 'You do not have permission to approve documents' });
        }

        const { status } = req.body; // 'approved' or 'rejected'
        const employeeId = req.params.id;
        const attachmentId = req.params.attachmentId;

        // Efficient array update without pulling all 50MBs of files into Node.js
        const result = await Employee.updateOne(
            { employeeId, 'attachments._id': attachmentId },
            {
                $set: {
                    'attachments.$.status': status,
                    'attachments.$.reviewedBy': authReq.user?.userId,
                    'attachments.$.reviewedAt': new Date()
                }
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Attachment or Employee not found' });
        }

        await createAuditLog('DOC_APPROVAL', employeeId, authReq.user?.userId || 'unknown', {
            attachment: attachmentId,
            status
        });

        // Fetch just the updated attachment metadata to return it
        const updatedDoc = await Employee.findOne(
            { employeeId, 'attachments._id': attachmentId },
            { 'attachments.$': 1 }
        ).select('-attachments.fileData');

        res.json(updatedDoc?.attachments?.[0] || { message: 'Success' });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// Delete attachment
router.delete('/:id/attachments/:attachmentId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const employeeId = req.params.id;
        const role = authReq.user?.role || '';
        const userId = authReq.user?.userId;

        // Extract attachment metadata before deleting, without loading the huge fileData Buffer
        const employee = await Employee.findOne(
            { employeeId, 'attachments._id': req.params.attachmentId },
            { 'attachments.$': 1, userId: 1, employeeId: 1 }
        ).select('-attachments.fileData');

        if (!employee || !employee.attachments || employee.attachments.length === 0) {
            return res.status(404).json({ message: 'Attachment or Employee not found' });
        }

        // Check permission: Admin can delete any, Employee can delete their own
        const isAdmin = role === 'super-admin' || role === 'admin';
        const isOwner = employee.userId?.toString() === userId?.toString();

        if (!isAdmin && !isOwner) {
            return res.status(403).json({ message: 'You do not have permission to delete documents' });
        }

        const deletedAttachment = employee.attachments[0];

        // Efficient array modification: Remove the attachment from Mongo without downloading/uploading 50MB
        await Employee.updateOne(
            { employeeId },
            { $pull: { attachments: { _id: req.params.attachmentId } } }
        );

        // Also delete from the dedicated AttachmentFile collection
        await AttachmentFile.findByIdAndDelete(req.params.attachmentId);

        await createAuditLog('DOC_DELETE', employee.employeeId, authReq.user?.userId || 'unknown', {
            attachmentId: req.params.attachmentId,
            fileName: (deletedAttachment as any).fileName
        });

        res.json({ message: 'Attachment deleted successfully' });
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// Update employee (Role-based access)
router.put('/:id', authenticate, async (req: Request, res: Response, next: Function) => {
    const authReq = req as AuthRequest;
    try {
        const role = authReq.user?.role || '';
        const isAdmin = role === 'super-admin' || role === 'admin' || role === 'manager';

        // Exclude fileData to prevent pulling hundreds of megabytes into Node.js memory
        const employee = await Employee.findOne({ employeeId: req.params.id }).select('-attachments.fileData');
        if (!employee) return res.status(404).json({ message: 'Employee not found' });

        const canView = await canViewEmployee(
            role,
            authReq.user?.userId || '',
            req.params.id,
            employee
        );
        if (!canView) {
            return res.status(403).json({ message: 'You do not have permission to update this employee' });
        }

        // ─────────────────────────────────────────────────────────────────────────
        // SECURITY: Mass Assignment Protection — explicit field allowlists per role
        // ─────────────────────────────────────────────────────────────────────────
        const EMPLOYEE_EDITABLE_FIELDS = [
            'phone', 'address', 'temporaryAddress', 'emergencyContacts', 'dependents',
            'education', 'employmentHistory', 'immigrationHistory',
            'socialProfiles', 'skills', 'certifications', 'bankDetails',
            'licenseNumber', 'simNumber', 'workEmail', 'otherEmail',
            'email', 'fatherName', 'bloodGroup', 'religion', 'domicile'
        ];
        const ADMIN_EXTRA_FIELDS = [
            'firstName', 'lastName', 'middleName', 'dateOfBirth', 'gender',
            'maritalStatus', 'nationality', 'domicile', 'cnic', 'jobInfo', 'employmentStatus',
            'salaryComponents', 'benefits', 'workEmail', 'otherEmail', 'avatar', 'biometricPin'
        ];

        const allowedFields = isAdmin
            ? [...EMPLOYEE_EDITABLE_FIELDS, ...ADMIN_EXTRA_FIELDS]
            : EMPLOYEE_EDITABLE_FIELDS;

        // Use native pick to only allow whitelisted fields from the request body
        const updates = pick(req.body, allowedFields) as any;
        // Attachments are always managed via dedicated endpoints
        delete updates.attachments;

        // Fields that can only be set once (employees cannot change after initial fill)
        const oneTimeFields = ['cnic', 'dateOfBirth', 'bloodGroup', 'fatherName', 'nationality', 'religion', 'domicile'] as const;
        if (!isAdmin) {
            oneTimeFields.forEach(field => {
                const employeeObj = employee.toObject();
                const currentValue = employeeObj[field as keyof typeof employeeObj];
                const newValue = updates[field];
                if (currentValue && newValue && currentValue !== newValue) delete updates[field];
                if (currentValue && (!newValue || newValue === '')) delete updates[field];
            });
        }

        // Auto-calculate probation end if status changes to Probation
        if (updates.employmentStatus?.status === 'Probation' && employee.employmentStatus?.status !== 'Probation') {
            updates.employmentStatus.probationEndDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
        }

        // Strip completely empty arrays from frontend defaults so they don't overwrite DB
        const stripEmptyWizardArrays = (arr: any[], defaultKey: string) => {
            if (!Array.isArray(arr)) return arr;
            return arr.filter(item => {
                if (!item || typeof item !== 'object') return true;
                return Object.entries(item).some(([k, v]) => 
                    k !== defaultKey && k !== '_id' && k !== 'id' && v !== '' && v !== null && v !== undefined
                );
            });
        };

        if (updates.immigrationHistory) updates.immigrationHistory = stripEmptyWizardArrays(updates.immigrationHistory, 'documentType');
        if (updates.employmentHistory) updates.employmentHistory = stripEmptyWizardArrays(updates.employmentHistory, '');
        if (updates.education) updates.education = stripEmptyWizardArrays(updates.education, '');
        if (updates.certifications) updates.certifications = stripEmptyWizardArrays(updates.certifications, '');
        if (updates.emergencyContacts) updates.emergencyContacts = stripEmptyWizardArrays(updates.emergencyContacts, '');
        if (updates.dependents) updates.dependents = stripEmptyWizardArrays(updates.dependents, '');
        if (updates.socialProfiles) updates.socialProfiles = stripEmptyWizardArrays(updates.socialProfiles, 'platform');
        if (updates.salaryComponents) updates.salaryComponents = stripEmptyWizardArrays(updates.salaryComponents, 'type');

        // Sanitize jobInfo.shift: if it's an empty string, set it to null 
        // to avoid BSONError/CastError when converting to ObjectId
        if (updates.jobInfo && updates.jobInfo.shift === '') {
            updates.jobInfo.shift = null;
        }

        // Capture original state for diff
        const originalEmployeeObj = employee.toObject();

        // Use findOneAndUpdate to completely bypass VersionError (__v) during concurrent background saves
        const updatedEmployee = await Employee.findOneAndUpdate(
            { employeeId: req.params.id },
            { $set: updates },
            { new: true, runValidators: true }
        ).select('-attachments.fileData');

        if (!updatedEmployee) return res.status(404).json({ message: 'Employee not found during update' });

        const diff = getDiff(originalEmployeeObj, updatedEmployee.toObject());

        // Sync names to User model if userId exists
        if (employee.userId && (updates.firstName || updates.lastName)) {
            await User.findByIdAndUpdate(employee.userId, {
                ...(updates.firstName && { firstName: updates.firstName }),
                ...(updates.lastName && { lastName: updates.lastName })
            });
        }

        // Log action
        await createAuditLog('UPDATE', req.params.id, authReq.user?.userId || 'unknown', { diff });

        res.json(updatedEmployee);
    } catch (err: any) {
        logger.error(`[EmployeeUpdate] Error updating ${req.params.id}:`, err);
        
        // Distinguish client-side validation errors from internal server errors
        if (err.name === 'ValidationError' || err.name === 'CastError' || err.statusCode === 400) {
            return res.status(400).json({ message: "Invalid request parameters or data format" });
        }
        
        res.status(500).json({ message: "Internal server error" });
    }
});

// Delete employee (Super-Admin/Admin only)
router.delete('/:id', authenticate, async (req: Request, res: Response, next: Function) => {
    const authReq = req as AuthRequest;
    try {
        const role = authReq.user?.role || '';
        if (role !== 'super-admin' && role !== 'admin') {
            return res.status(403).json({ message: 'You do not have permission to delete employees' });
        }

        const employee = await Employee.findOne({ employeeId: req.params.id });
        if (!employee) return res.status(404).json({ message: 'Employee not found' });

        // SOFT DELETE: Mark as deleted instead of removing from DB
        await Employee.updateOne({ employeeId: req.params.id }, { isDeleted: true });

        // Also deactivate the user account if linked
        if (employee.userId) {
            await User.findByIdAndUpdate(employee.userId, { isActive: false });
        }

        await createAuditLog('DELETE', req.params.id, authReq.user?.userId || 'unknown', { name: `${employee.firstName} ${employee.lastName}` });

        res.json({ message: 'Employee deleted successfully (Soft delete)' });
    } catch (err: any) {
        next(err);
    }
});

export default router;
