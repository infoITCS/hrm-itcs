import * as _ from 'lodash';
import fs from 'fs';
import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import Employee from '../models/Employee';
import User from '../models/User.model';
import AuditLog from '../models/AuditLog';
import { authenticate, authorize, AuthRequest, authenticateFile } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { canCreateUser, canViewEmployee, canEditSensitiveData, canApproveDocuments } from '../middleware/permissions';
import { getDiff } from '../utils/diff';
// import { sendHRNotificationEmail } from '../utils/email'; // Commented out — uncomment to enable HR notifications

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
                        if (_.isEqual(mergedDiff[key].old, mergedDiff[key].new)) {
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
            if (queryUserId === userId || role === 'super-admin' || role === 'admin' || role === 'manager') {
                const employee = await Employee.findOne({ userId: queryUserId }).select('-attachments.fileData');
                employees = employee ? [employee] : [];
            } else {
                return res.status(403).json({ message: 'You do not have permission to view this employee' });
            }
        } else if (role === 'super-admin' || role === 'admin') {
            // Super-admin and Admin can see all employees
            employees = await Employee.find().select('-attachments.fileData');
        } else if (role === 'manager') {
            // Manager can only see direct reports and themselves
            const managerEmployee = await Employee.findOne({ userId }).select('-attachments.fileData');
            if (!managerEmployee) {
                return res.status(404).json({ message: 'Manager employee record not found' });
            }
            employees = await Employee.find({ 
                $or: [
                    { 'jobInfo.reportingManager': managerEmployee.employeeId },
                    { userId: userId }
                ]
            }).select('-attachments.fileData');
        } else {
            // Employee can only see their own profile
            const employee = await Employee.findOne({ userId }).select('-attachments.fileData');
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

        // Auto-generate employeeId if not provided (standard for new creations)
        if (!employeeData.employeeId) {
            // Retry logic to handle concurrent creation (race condition safe)
            let nextNum = 1;
            let retries = 3;
            while (retries > 0) {
                const lastEmployee = await Employee.findOne({ 
                    employeeId: { $regex: /^itcs-/i } 
                }).sort({ createdAt: -1 });

                if (lastEmployee) {
                    const parts = lastEmployee.employeeId.split('-');
                    const lastNum = parseInt(parts[parts.length - 1]);
                    if (!isNaN(lastNum)) nextNum = lastNum + 1;
                }
                
                employeeData.employeeId = `itcs-${nextNum.toString().padStart(3, '0')}`;
                
                // Check if ID already exists before inserting
                const exists = await Employee.findOne({ employeeId: employeeData.employeeId });
                if (!exists) break;
                
                nextNum++;
                retries--;
            }
        }

        const employee = new Employee({
            ...employeeData,
            employmentStatus: {
                ...employeeData.employmentStatus,
                probationEndDate: employeeData.employmentStatus?.status === 'Probation' ? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) : null // Default 3 months
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
router.get('/check-duplicate', authenticate, async (req: Request, res: Response) => {
    try {
        const { cnic, email, employeeId } = req.query;
        if (!cnic && !email) {
            return res.status(400).json({ message: 'CNIC or email is required' });
        }

        const query: any = { $or: [] };
        if (cnic) query.$or.push({ cnic: cnic as string });
        if (email) query.$or.push({ email: email as string });
        
        const existing = await Employee.findOne(query).select('firstName lastName employeeId');
        
        // If we found a match, check if it's the same employee we are currently editing
        if (existing && existing.employeeId !== employeeId) {
            return res.json({ 
                isDuplicate: true, 
                message: `An employee with this ${cnic ? 'CNIC' : 'email'} already exists: ${existing.firstName} ${existing.lastName} (${existing.employeeId})`,
                existingEmployee: existing
            });
        }

        res.json({ isDuplicate: false });
    } catch (err) {
        console.error('Duplicate check error:', err);
        res.status(500).json({ message: 'Error checking for duplicates' });
    }
});

// Get today's birthdays and anniversaries
router.get('/today-specials', authenticate, async (req: Request, res: Response) => {
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

router.get('/:id', authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    try {
        const employee = await Employee.findOne({ employeeId: req.params.id }).select('-attachments.fileData');
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

        const attachmentId = new mongoose.Types.ObjectId();
        const attachment = {
            _id: attachmentId,
            fileType: req.body.fileType || 'Document',
            fileName: req.file.originalname,
            filePath: req.file.filename,
            fileData: fileBuffer,
            contentType: req.file.mimetype,
            uploadDate: new Date(),
            status: canApproveDocuments(authReq.user?.role || '') ? 'approved' : 'pending',
            uploadedBy: authReq.user?.userId
        };

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
            const docCount = (employee.attachments || []).filter(a => a.fileType === 'Other Documents').length;
            if (docCount >= 10) {
                // Clean up the uploaded temp file before returning error
                try { fs.unlinkSync(req.file.path); } catch (e) {}
                return res.status(400).json({ message: 'Maximum limit of 10 "Other Documents" reached. Please delete old ones before uploading new files.' });
            }
        }

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

        await createAuditLog('UPLOAD_DOC', employee.employeeId, authReq.user?.userId || 'unknown', { file: req.file.originalname });

        // Clean up: delete the local file after saving to MongoDB
        try {
            fs.unlinkSync(filePath);
        } catch (unlinkErr) {
            console.error('Failed to delete temporary file:', unlinkErr);
        }

        res.status(200).json({
            ...attachment,
            fileData: undefined // Don't send buffer back in JSON
        });

    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// Route to serve raw file from MongoDB — uses authenticateFile which also accepts ?token= for <img> tags
router.get('/attachments/raw/:attachmentId', authenticateFile, async (req: Request, res: Response) => {
    try {
        // OPTIMIZATION: Use projection { 'attachments.$': 1 } to only fetch the EXACT attachment requested
        // Previously, this fetched the entire employee record WITH all binary files, which was very slow.
        const employee = await Employee.findOne(
            { 'attachments._id': req.params.attachmentId },
            { 'attachments.$': 1 }
        );
        if (!employee || !employee.attachments || employee.attachments.length === 0) {
            return res.status(404).send('File not found');
        }

        const attachment = employee.attachments[0]; // Since we used projection, it's the only one returned
        if (!attachment || !attachment.fileData) return res.status(404).send('File content not found');

        // Add caching headers so the browser doesn't re-download the same avatar/file on every page load
        res.set('Cache-Control', 'public, max-age=86400, immutable'); // Cache for 24 hours
        res.set('Content-Type', attachment.contentType || 'application/octet-stream');
        res.set('Content-Disposition', `inline; filename="${attachment.fileName}"`);
        res.send(attachment.fileData);
    } catch (err: any) {
        res.status(500).send(err.message);
    }
});

// Approve/Reject document (Super-Admin/Admin only)
router.patch('/:id/attachments/:attachmentId', authenticate, async (req: Request, res: Response) => {
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
router.delete('/:id/attachments/:attachmentId', authenticate, async (req: Request, res: Response) => {
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
router.put('/:id', authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    try {
        // Exclude fileData to prevent pulling hundreds of megabytes into Node.js memory just to update a text field
        const employee = await Employee.findOne({ employeeId: req.params.id }).select('-attachments.fileData');
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
        // Never allow attachments array to be overwritten by standard profile updates (they use separate endpoints)
        delete updates.attachments;

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
        if (updates.emergencyContacts) updates.emergencyContacts = stripEmptyWizardArrays(updates.emergencyContacts, '');
        if (updates.dependents) updates.dependents = stripEmptyWizardArrays(updates.dependents, '');
        if (updates.socialProfiles) updates.socialProfiles = stripEmptyWizardArrays(updates.socialProfiles, 'platform');
        if (updates.salaryComponents) updates.salaryComponents = stripEmptyWizardArrays(updates.salaryComponents, 'type');

        // Capture original state
        const originalEmployeeObj = employee.toObject();

        Object.assign(employee, updates);
        const updatedEmployee = await employee.save();

        // Calculate diff STRICTLY between original DB vs new DB (ignoring partial frontend updates)
        const diff = getDiff(originalEmployeeObj, updatedEmployee.toObject());

        // Sync names to User model if userId exists
        if (employee.userId && (updates.firstName || updates.lastName)) {
            await User.findByIdAndUpdate(employee.userId, {
                ...(updates.firstName && { firstName: updates.firstName }),
                ...(updates.lastName && { lastName: updates.lastName })
            });
        }

        // Log detailed diff if there are changes
        if (Object.keys(diff).length > 0) {
            await createAuditLog('UPDATE', updatedEmployee.employeeId, authReq.user?.userId || 'unknown', { diff });

            // ── HR Notification Emails (commented out — uncomment to enable) ──────────────
            // const hrEmail = process.env.HR_EMAIL || 'hr@itcs.com';
            //
            // // Notify HR if employee updated their own profile
            // if (role === 'employee' || role === '') {
            //     await sendHRNotificationEmail(hrEmail, `${updatedEmployee.firstName} ${updatedEmployee.lastName}`, 'updated their profile');
            // }
            //
            // // Notify HR if employment status changes to Terminated or Resigned
            // if (diff.employmentStatus?.status?.new &&
            //     ['Terminated', 'Resigned'].includes(diff.employmentStatus.status.new)) {
            //     await sendHRNotificationEmail(hrEmail, `${updatedEmployee.firstName} ${updatedEmployee.lastName}`, `left the company (${diff.employmentStatus.status.new})`);
            // }
            // ─────────────────────────────────────────────────────────────────────────────
        }

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
