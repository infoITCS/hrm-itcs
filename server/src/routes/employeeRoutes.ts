// Native pick — replaces lodash's _.pick, eliminating the dependency
const pick = (obj: Record<string, unknown>, keys: string[]): Record<string, unknown> =>
    keys.reduce((acc: Record<string, unknown>, key: string) => {
        if (Object.prototype.hasOwnProperty.call(obj, key)) acc[key] = obj[key];
        return acc;
    }, {});
import fs from 'fs';
import path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

import sanitize from 'sanitize-filename';
import Employee from '../models/Employee';
import Holiday from '../models/Holiday';
import User from '../models/User.model';
import AttachmentFile from '../models/AttachmentFile';
import Counter from '../models/Counter';
import AuditLog from '../models/AuditLog';
import Company from '../models/Company';
import { authenticate, authorize, AuthRequest, authenticateFile } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { canCreateUser, canViewEmployee, canEditSensitiveData, canApproveDocuments } from '../middleware/permissions';
// removed getDiff import
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

/**
 * Strips confidential salary, bank details, and financial fields
 * unless the requester is Super-Admin, Finance, or the Employee viewing their own record.
 */
function sanitizeEmployeeForRole(employee: any, requesterRole: string, requesterUserId?: string): any {
    if (!employee) return employee;
    
    const role = (requesterRole || '').toLowerCase().trim();
    // Check if requester is viewing their own profile
    const empUserId = employee.userId ? (employee.userId._id || employee.userId).toString() : null;
    const isSelf = empUserId && requesterUserId && empUserId === requesterUserId.toString();
    const isPrivilegedFinancialViewer = ['super-admin', 'admin', 'hr', 'finance'].includes(role) || isSelf;

    if (!isPrivilegedFinancialViewer) {
        const sanitized = typeof employee.toObject === 'function' ? employee.toObject() : { ...employee };
        delete sanitized.salaryComponents;
        delete sanitized.financeInfo;
        delete sanitized.bankDetails;
        delete sanitized.providentFundBalance;
        delete sanitized.providentFundHistory;
        delete sanitized.loans;
        return sanitized;
    }
    return employee;
}

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

// Ultra-fast lightweight employee dropdown (Reporting Manager / selector lookups)
// Bypasses heavy document hydration, encryption overhead, and large subdocuments
router.get('/dropdown', authenticate, async (req: Request, res: Response, next: Function) => {
    try {
        const employees = await Employee.find({ isDeleted: { $ne: true } })
            .select('employeeId firstName lastName jobInfo.designation jobInfo.department')
            .sort({ firstName: 1 })
            .lean();

        res.json(employees.map((e: any) => ({
            value: e.employeeId,
            label: `${e.firstName} ${e.lastName} (${e.employeeId})`
        })));
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
            if (queryUserId === userId || ['super-admin', 'admin', 'hr', 'finance', 'manager'].includes(role)) {
                const employee = await Employee.findOne({ userId: queryUserId, ...baseFilter }).select('-attachments.fileData').lean();
                employees = employee ? [employee] : [];
                total = employees.length;
            } else {
                return res.status(403).json({ message: 'You do not have permission to view this employee' });
            }
        } else if (['super-admin', 'admin', 'hr', 'finance'].includes(role)) {
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

        const sanitizedEmployees = (employees || []).map((emp: any) => sanitizeEmployeeForRole(emp, role, userId));
        res.json({ employees: sanitizedEmployees, total, page, totalPages: Math.ceil(total / limit) });
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
            'fatherName', 'bloodGroup', 'religion', 'domicile',
            'emergencyContacts', 'dependents', 'education', 'employmentHistory',
            'immigrationHistory', 'socialProfiles', 'skills', 'certifications',
            'bankDetails', 'licenseNumber', 'simNumber', 'workEmail', 'otherEmail'
        ];
        const ADMIN_EXTRA_FIELDS = [
            'jobInfo', 'employmentStatus', 'salaryComponents', 'financeInfo', 'benefits', 
            'employeeId', 'biometricPin', 'providentFundBalance'
        ];

        const allowedFields = (['super-admin', 'admin', 'hr', 'finance', 'manager'].includes(role))
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
            // Escape regex metacharacters in email to prevent incorrect matches (e.g. user+test@ has a literal +)
            const escapedEmail = employeeData.workEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const existingEmailEmp = await Employee.findOne({ 
                workEmail: { $regex: new RegExp(`^${escapedEmail}$`, 'i') } 
            });
            if (existingEmailEmp) {
                return res.status(400).json({ message: 'An employee with this work email already exists. Unable to create a new record.' });
            }
        }

        // Auto-generate employeeId if not provided (standard for new creations)
        if (!employeeData.employeeId) {
            const PREFIX = 'itcs-';
            const existingEmployees = await Employee.find({ employeeId: { $regex: /^itcs-\d+$/i }, isDeleted: { $ne: true } })
                .select('employeeId')
                .lean();

            let maxSeq = 0;
            for (const emp of existingEmployees) {
                const match = (emp.employeeId || '').match(/^itcs-(\d+)$/i);
                if (match) {
                    const num = parseInt(match[1], 10);
                    if (num > maxSeq) maxSeq = num;
                }
            }

            const nextNum = maxSeq + 1;
            employeeData.employeeId = `${PREFIX}${nextNum.toString().padStart(3, '0')}`;

            await Counter.findOneAndUpdate(
                { key: 'employeeId' },
                { $set: { seq: nextNum } },
                { upsert: true }
            );
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

        res.status(201).json(sanitizeEmployeeForRole(newEmployee.toObject(), role, userId));
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

// Get today's birthdays, anniversaries, new joiners, and public holidays for current month
router.get('/today-specials', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const today = new Date();
        const currentMonth = today.getMonth() + 1; // 1-12
        const currentYear = today.getFullYear();

        // Find active employees with birthdays or joining in this month
        const employees = await Employee.find({
            isDeleted: { $ne: true },
            $or: [
                {
                    $expr: { $eq: [{ $month: "$dateOfBirth" }, currentMonth] }
                },
                {
                    $expr: { $eq: [{ $month: "$jobInfo.joiningDate" }, currentMonth] }
                }
            ]
        }).select('firstName lastName middleName employeeId avatar dateOfBirth jobInfo.joiningDate jobInfo.designation jobInfo.jobTitle');

        const specials: any[] = [];
        for (const emp of employees) {
            const isBirthdayInMonth = emp.dateOfBirth && (emp.dateOfBirth.getMonth() + 1 === currentMonth);
            const isAnniversaryInMonth = emp.jobInfo?.joiningDate && (emp.jobInfo.joiningDate.getMonth() + 1 === currentMonth);
            const employeeFullName = [emp.firstName, emp.middleName, emp.lastName].filter(Boolean).join(' ') || 'Employee';

            if (isBirthdayInMonth && emp.dateOfBirth) {
                const dateStr = emp.dateOfBirth.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
                specials.push({
                    id: `${emp.employeeId}-birthday`,
                    name: employeeFullName,
                    avatar: emp.avatar,
                    type: 'birthday',
                    date: dateStr,
                    rawDay: emp.dateOfBirth.getDate(),
                    rawMonth: emp.dateOfBirth.getMonth() + 1
                });
            }

            if (isAnniversaryInMonth && emp.jobInfo?.joiningDate) {
                const yearsCompleted = currentYear - emp.jobInfo.joiningDate.getFullYear();
                const dateStr = emp.jobInfo.joiningDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
                if (yearsCompleted > 0) {
                    specials.push({
                        id: `${emp.employeeId}-anniversary`,
                        name: employeeFullName,
                        avatar: emp.avatar,
                        type: 'anniversary',
                        yearsCompleted,
                        date: dateStr,
                        rawDay: emp.jobInfo.joiningDate.getDate(),
                        rawMonth: emp.jobInfo.joiningDate.getMonth() + 1
                    });
                } else {
                    specials.push({
                        id: `${emp.employeeId}-newjoiner`,
                        name: employeeFullName,
                        avatar: emp.avatar,
                        type: 'new_joiner',
                        designation: emp.jobInfo?.designation || emp.jobInfo?.jobTitle || 'New Joiner',
                        date: dateStr,
                        rawDay: emp.jobInfo.joiningDate.getDate(),
                        rawMonth: emp.jobInfo.joiningDate.getMonth() + 1
                    });
                }
            }
        }

        // Fetch Holidays occurring in current month
        const monthStr = String(currentMonth).padStart(2, '0');
        const yearMonthPrefix = `${currentYear}-${monthStr}`;

        const holidays = await Holiday.find({
            startDate: { $regex: `^${yearMonthPrefix}` }
        }).select('name startDate endDate location');

        for (const h of holidays) {
            const start = new Date(h.startDate);
            const day = start.getDate();
            const dateStr = start.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
            specials.push({
                id: `holiday-${h._id}`,
                name: h.name,
                type: 'holiday',
                date: dateStr,
                designation: h.location || 'All Offices',
                rawDay: day,
                rawMonth: currentMonth
            });
        }

        // Sort chronologically by the day of the month
        specials.sort((a, b) => a.rawDay - b.rawDay);

        res.json(specials.map(s => ({
            id: s.id,
            name: s.name,
            avatar: s.avatar,
            type: s.type,
            yearsCompleted: s.yearsCompleted,
            designation: s.designation,
            date: s.date,
            day: s.rawDay,
            month: s.rawMonth
        })));
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});
// ─────────────────────────────────────────────────────────────────────────────
// Provident Fund Management
// ─────────────────────────────────────────────────────────────────────────────

// ponytail: maturity is 36 months from joining date — stored as a constant.
// To make it org-configurable, move this to OrgConfig and fetch it.
const PF_MATURITY_MONTHS = 36;

/**
 * GET /api/employees/pf-report
 * Returns all employees with their PF balance, history, maturity status, claim status.
 * Admin/super-admin only.
 */
router.get('/pf-report', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    const role = (authReq.user?.role || '').toLowerCase().trim();
    const isSuperOrAdmin = ['super-admin', 'admin'].includes(role);

    let hasExplicitPfPermission = false;
    if (authReq.user?.userId) {
        const userDoc = await User.findById(authReq.user.userId).select('customSubPermissions').lean() as any;
        const customSub = userDoc?.customSubPermissions instanceof Map
            ? Object.fromEntries(userDoc.customSubPermissions)
            : (userDoc?.customSubPermissions || {});
        if (customSub['provident-fund:company-pf'] === true) {
            hasExplicitPfPermission = true;
        }
    }

    if (!isSuperOrAdmin && !hasExplicitPfPermission) {
        return res.status(403).json({ message: 'Admin access or explicit company-wide PF permission required.' });
    }

    try {
        const employees = await Employee.find({
            isDeleted: { $ne: true },
            'employmentStatus.status': { $nin: ['Terminated', 'Resigned', 'Offboarded'] }
        })
            .select('employeeId firstName lastName jobInfo providentFundBalance providentFundHistory pfClaimed pfClaimedAt employmentStatus')
            .lean();

        const now = new Date();
        const result = employees.map((emp: any) => {
            const joiningDate = emp.jobInfo?.joiningDate ? new Date(emp.jobInfo.joiningDate) : null;
            let monthsOfService = 0;
            let maturityDate: Date | null = null;
            if (joiningDate) {
                const now2 = new Date();
                monthsOfService =
                    (now2.getFullYear() - joiningDate.getFullYear()) * 12 +
                    (now2.getMonth() - joiningDate.getMonth());
                maturityDate = new Date(joiningDate);
                maturityDate.setMonth(maturityDate.getMonth() + PF_MATURITY_MONTHS);
            }
            const isMatured = maturityDate ? now >= maturityDate : false;

            return {
                employeeId: emp.employeeId,
                firstName: emp.firstName,
                lastName: emp.lastName,
                designation: emp.jobInfo?.designation,
                department: emp.jobInfo?.department,
                joiningDate: emp.jobInfo?.joiningDate,
                monthsOfService,
                maturityDate: maturityDate ? maturityDate.toISOString() : null,
                providentFundBalance: emp.providentFundBalance || 0,
                providentFundHistory: emp.providentFundHistory || [],
                pfClaimed: emp.pfClaimed || false,
                pfClaimedAt: emp.pfClaimedAt || null,
                isMatured,
                maturityThresholdMonths: PF_MATURITY_MONTHS
            };
        });

        return res.json(result);
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/employees/my-pf
 * Returns PF statement & balance for the currently authenticated employee.
 * Accessible to all authenticated employees.
 */
router.get('/my-pf', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authReq = req as AuthRequest;
        const userId = authReq.user?.userId;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        let employee = await Employee.findOne({ userId, isDeleted: { $ne: true } })
            .select('employeeId firstName lastName avatar jobInfo providentFundBalance providentFundHistory pfClaimed pfClaimedAt employmentStatus')
            .lean() as any;

        if (!employee && authReq.user?.email) {
            employee = await Employee.findOne({
                isDeleted: { $ne: true },
                $or: [
                    { workEmail: { $regex: new RegExp(`^${authReq.user.email}$`, 'i') } },
                    { personalEmail: { $regex: new RegExp(`^${authReq.user.email}$`, 'i') } },
                    { email: { $regex: new RegExp(`^${authReq.user.email}$`, 'i') } }
                ]
            })
            .select('employeeId firstName lastName avatar jobInfo providentFundBalance providentFundHistory pfClaimed pfClaimedAt employmentStatus')
            .lean() as any;
        }

        if (!employee) {
            return res.status(404).json({ message: 'Employee profile not found for current user.' });
        }

        const now = new Date();
        const joiningDate = employee.jobInfo?.joiningDate ? new Date(employee.jobInfo.joiningDate) : null;
        let monthsOfService = 0;
        let maturityDate: Date | null = null;

        if (joiningDate) {
            monthsOfService =
                (now.getFullYear() - joiningDate.getFullYear()) * 12 +
                (now.getMonth() - joiningDate.getMonth());
            maturityDate = new Date(joiningDate);
            maturityDate.setMonth(maturityDate.getMonth() + PF_MATURITY_MONTHS);
        }
        const isMatured = maturityDate ? now >= maturityDate : false;

        const result = {
            employeeId: employee.employeeId,
            firstName: employee.firstName,
            lastName: employee.lastName,
            avatar: employee.avatar,
            designation: employee.jobInfo?.designation,
            department: employee.jobInfo?.department,
            joiningDate: employee.jobInfo?.joiningDate,
            monthsOfService,
            maturityDate: maturityDate ? maturityDate.toISOString() : null,
            providentFundBalance: employee.providentFundBalance || 0,
            providentFundHistory: employee.providentFundHistory || [],
            pfClaimed: employee.pfClaimed || false,
            pfClaimedAt: employee.pfClaimedAt || null,
            isMatured,
            maturityThresholdMonths: PF_MATURITY_MONTHS
        };

        return res.json(result);
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/employees/:id/pf-statement-pdf
 * Generates and downloads a PDF statement of the employee's PF.
 * Accessed via query token ?token=... for easy browser downloads.
 */
router.get('/:id/pf-statement-pdf', authenticateFile, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employee = await Employee.findOne({ employeeId: req.params.id }).lean() as any;
        if (!employee) return res.status(404).json({ message: 'Employee not found.' });

        // Check permission: employee can view their own statement, admins can view any
        const authReq = req as AuthRequest;
        const role = authReq.user?.role || '';
        const userId = authReq.user?.userId;
        const isOwn = employee.userId && employee.userId.toString() === userId;
        
        if (!isOwn && role !== 'super-admin' && role !== 'admin') {
            return res.status(403).json({ message: 'Access denied.' });
        }

        const now = new Date();
        const joiningDate = employee.jobInfo?.joiningDate ? new Date(employee.jobInfo.joiningDate) : null;
        let monthsOfService = 0;
        let maturityDate: Date | null = null;
        if (joiningDate) {
            monthsOfService =
                (now.getFullYear() - joiningDate.getFullYear()) * 12 +
                (now.getMonth() - joiningDate.getMonth());
            maturityDate = new Date(joiningDate);
            maturityDate.setMonth(maturityDate.getMonth() + PF_MATURITY_MONTHS);
        }
        const isMatured = maturityDate ? now >= maturityDate : false;

        // Calculate breakdown: Manual vs Payroll
        const history = employee.providentFundHistory || [];
        const manualCredits = history.reduce((sum: number, entry: any) => (entry.type === 'credit' && entry.source === 'manual') ? sum + entry.amount : sum, 0);
        const payrollCredits = history.reduce((sum: number, entry: any) => (entry.type === 'credit' && entry.source === 'payroll') ? sum + entry.amount : sum, 0);
        const totalDebits = history.reduce((sum: number, entry: any) => entry.type === 'debit' ? sum + entry.amount : sum, 0);
        
        const historyNet = (manualCredits + payrollCredits) - totalDebits;
        const currentBalance = employee.providentFundBalance || 0;
        const untrackedOpening = Math.max(0, currentBalance - historyNet);
        const totalOpeningBalance = manualCredits + untrackedOpening;
        
        const fmtPKR_local = (n: number) => `Rs. ${n.toLocaleString('en-PK')}`;
        const fmtDate_local = (d: Date | string | null | undefined) => {
            if (!d) return '-';
            const dateObj = typeof d === 'string' ? new Date(d) : d;
            return dateObj.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
        };
        const fmtMonths_local = (m: number) => {
            const yrs = Math.floor(m / 12);
            const mos = m % 12;
            const parts = [];
            if (yrs > 0) parts.push(`${yrs} ${yrs === 1 ? 'year' : 'years'}`);
            if (mos > 0 || yrs === 0) parts.push(`${mos} ${mos === 1 ? 'month' : 'months'}`);
            return parts.join(' ');
        };

        const company = await Company.findOne().lean() as any;
        const darkPurple = company?.branding?.primaryColor || '#1C0626';
        const magentaAccent = company?.branding?.secondaryColor || '#721466';

        const clientHost = process.env.CLIENT_URL || 'http://localhost:5173';
        const verifyUrl = `${clientHost}/verify/${employee.employeeId}`;
        const qrCodeDataUri = await QRCode.toDataURL(verifyUrl).catch(() => '');

        const doc = new PDFDocument({ margin: 65, size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="PF_Statement_${employee.employeeId}.pdf"`);
        doc.pipe(res);

        // 1. Logo (Top-Left)
        let logoDrawn = false;
        if (company?.logoUrl && company.logoUrl.startsWith('data:image/')) {
            try {
                const base64Data = company.logoUrl.replace(/^data:image\/\w+;base64,/, '');
                const buffer = Buffer.from(base64Data, 'base64');
                doc.image(buffer, 60, 22, { width: 140, height: 60, fit: [140, 60] });
                logoDrawn = true;
            } catch (err) {
                console.error('Error rendering base64 company logo in PF statement:', err);
            }
        }

        if (!logoDrawn) {
            const candidatePaths = [
                company?.logoUrl ? path.join(__dirname, '../../', company.logoUrl) : null,
                company?.logoUrl ? company.logoUrl : null,
                path.join(__dirname, '../../../client/src/assets/logo.png'),
                path.join(__dirname, '../../uploads/logo.png'),
                path.join(__dirname, '../../../client/public/logo.png')
            ].filter(Boolean) as string[];

            for (const p of candidatePaths) {
                if (fs.existsSync(p)) {
                    try {
                        doc.image(p, 60, 22, { width: 140, height: 60, fit: [140, 60] });
                        logoDrawn = true;
                        break;
                    } catch (err) {
                        console.error('Error drawing PF logo from path:', p, err);
                    }
                }
            }
        }

        if (!logoDrawn) {
            doc.fontSize(18).font('Helvetica-Bold').fillColor(darkPurple).text((company?.name || 'IT CONSULTING & SERVICES').toUpperCase(), 60, 35);
        }

        // 2. Top-Right Geometric Purple Decoration (ITCS Official Polygon Ribbon)
        doc.save()
           .moveTo(doc.page.width - 170, 0)
           .lineTo(doc.page.width - 55, 75)
           .lineTo(doc.page.width - 55, 115)
           .lineTo(doc.page.width, 40)
           .lineTo(doc.page.width, 0)
           .closePath()
           .fill(darkPurple);

        doc.save()
           .moveTo(doc.page.width - 55, 75)
           .lineTo(doc.page.width - 55, 115)
           .lineTo(doc.page.width, 175)
           .lineTo(doc.page.width, 40)
           .closePath()
           .fill(magentaAccent);

        // 3. Header Divider Line
        doc.moveTo(60, 105)
           .lineTo(doc.page.width - 65, 105)
           .strokeColor('#888888')
           .lineWidth(0.8)
           .stroke();

        // Document Title
        doc.fontSize(14).font('Helvetica-Bold').fillColor(darkPurple).text('PROVIDENT FUND STATEMENT', 200, 45, { align: 'right', width: doc.page.width - 265 });
        doc.fontSize(9).font('Helvetica').fillColor('#64748B').text(`Generated on ${new Date().toLocaleDateString('en-PK')}`, 200, 65, { align: 'right', width: doc.page.width - 265 });

        // --- Employee Details Section ---
        let currentDetailsY = 120;
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#1f2937').text('Employee Details', 60, currentDetailsY);
        currentDetailsY += 18;
        
        const detailsX1 = 60;
        const detailsX2 = 310;
        
        doc.fontSize(9.5).font('Helvetica');
        doc.fillColor('#4b5563').text('Name:', detailsX1, currentDetailsY);
        doc.font('Helvetica-Bold').fillColor('#111827').text(`${employee.firstName} ${employee.lastName || ''}`, detailsX1 + 90, currentDetailsY);
        
        doc.font('Helvetica').fillColor('#4b5563').text('Employee ID:', detailsX1, currentDetailsY + 18);
        doc.font('Helvetica-Bold').fillColor('#111827').text(`#${employee.employeeId}`, detailsX1 + 90, currentDetailsY + 18);

        doc.font('Helvetica').fillColor('#4b5563').text('Designation:', detailsX1, currentDetailsY + 36);
        doc.font('Helvetica-Bold').fillColor('#111827').text(employee.jobInfo?.designation || 'N/A', detailsX1 + 90, currentDetailsY + 36);

        doc.font('Helvetica').fillColor('#4b5563').text('Department:', detailsX1, currentDetailsY + 54);
        doc.font('Helvetica-Bold').fillColor('#111827').text(employee.jobInfo?.department || 'N/A', detailsX1 + 90, currentDetailsY + 54);

        // Column 2
        doc.font('Helvetica').fillColor('#4b5563').text('Joining Date:', detailsX2, currentDetailsY);
        doc.font('Helvetica-Bold').fillColor('#111827').text(fmtDate_local(employee.jobInfo?.joiningDate), detailsX2 + 90, currentDetailsY);

        doc.font('Helvetica').fillColor('#4b5563').text('Service Period:', detailsX2, currentDetailsY + 18);
        doc.font('Helvetica-Bold').fillColor('#111827').text(fmtMonths_local(monthsOfService), detailsX2 + 90, currentDetailsY + 18);

        doc.font('Helvetica').fillColor('#4b5563').text('Maturity Date:', detailsX2, currentDetailsY + 36);
        doc.font('Helvetica-Bold').fillColor('#111827').text(fmtDate_local(maturityDate), detailsX2 + 90, currentDetailsY + 36);

        doc.font('Helvetica').fillColor('#4b5563').text('Maturity Status:', detailsX2, currentDetailsY + 54);
        const statusText = employee.pfClaimed ? 'Claimed' : isMatured ? 'Matured' : 'Pending';
        doc.font('Helvetica-Bold').fillColor(employee.pfClaimed ? '#6b7280' : isMatured ? '#059669' : '#d97706').text(statusText, detailsX2 + 90, currentDetailsY + 54);

        doc.y = currentDetailsY + 76;
        doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(60, doc.y).lineTo(doc.page.width - 60, doc.y).stroke();
        doc.moveDown(0.8);

        // --- Fund Summary Grid (2x2 layout) ---
        const summaryY = doc.y;
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#1f2937').text('Fund Summary', 60, summaryY);
        
        const cardWidth = (doc.page.width - 120 - 15) / 2;
        const cardHeight = 44;
        const cardY1 = summaryY + 18;
        const cardY2 = summaryY + 68;

        const drawCard = (title: string, value: string, xPos: number, yPos: number, bgColor: string, txtColor: string) => {
            doc.fillColor(bgColor).rect(xPos, yPos, cardWidth, cardHeight).fill();
            doc.fillColor('#6b7280').fontSize(8).font('Helvetica-Bold').text(title.toUpperCase(), xPos + 10, yPos + 8);
            doc.fillColor(txtColor).fontSize(13).font('Helvetica-Bold').text(value, xPos + 10, yPos + 22);
        };

        drawCard('Previous PF Balance', fmtPKR_local(totalOpeningBalance), 60, cardY1, '#fefce8', '#a16207');
        drawCard('Payroll Contributions', fmtPKR_local(payrollCredits), 60 + cardWidth + 15, cardY1, '#eff6ff', '#1d4ed8');
        drawCard('Total Debits / Claims', fmtPKR_local(totalDebits), 60, cardY2, '#fef2f2', '#b91c1c');
        drawCard('Current Total PF Balance', fmtPKR_local(currentBalance), 60 + cardWidth + 15, cardY2, '#f0fdf4', '#15803d');

        doc.y = cardY2 + cardHeight + 15;

        // --- Transaction History Ledger ---
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#1f2937').text('Contribution & Adjustment History', 60, doc.y);
        doc.moveDown(0.5);

        const MONTH_SHORT_local = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const fullHistory = [...history];
        if (untrackedOpening > 0) {
            fullHistory.push({
                amount: untrackedOpening,
                type: 'credit',
                source: 'manual',
                date: employee.createdAt || employee.jobInfo?.joiningDate || new Date(),
                description: 'Previous PF Balance'
            });
        }

        const cols = {
            date: { x: 60, w: 75 },
            period: { x: 135, w: 70 },
            desc: { x: 205, w: 170 },
            source: { x: 375, w: 50 },
            type: { x: 425, w: 50 },
            amount: { x: 475, w: doc.page.width - 60 - 475 }
        };

        const tableHeaderY = doc.y;
        doc.fillColor('#f3f4f6').rect(60, tableHeaderY, doc.page.width - 120, 20).fill();
        doc.strokeColor('#d1d5db').lineWidth(0.5).moveTo(60, tableHeaderY).lineTo(doc.page.width - 60, tableHeaderY).stroke();
        doc.strokeColor('#d1d5db').lineWidth(0.5).moveTo(60, tableHeaderY + 20).lineTo(doc.page.width - 60, tableHeaderY + 20).stroke();

        doc.fontSize(8).font('Helvetica-Bold').fillColor('#374151');
        doc.text('DATE', cols.date.x + 4, tableHeaderY + 6);
        doc.text('PERIOD', cols.period.x, tableHeaderY + 6);
        doc.text('DESCRIPTION', cols.desc.x, tableHeaderY + 6);
        doc.text('SOURCE', cols.source.x, tableHeaderY + 6, { align: 'center', width: cols.source.w });
        doc.text('TYPE', cols.type.x, tableHeaderY + 6, { align: 'center', width: cols.type.w });
        doc.text('AMOUNT', cols.amount.x, tableHeaderY + 6, { align: 'right', width: cols.amount.w - 4 });

        let rowY = tableHeaderY + 20;

        if (fullHistory.length === 0) {
            doc.fillColor('#ffffff').rect(60, rowY, doc.page.width - 120, 22).fill();
            doc.fontSize(8.5).font('Helvetica-Oblique').fillColor('#9ca3af').text('No provident fund transactions logged yet.', 60 + 10, rowY + 6);
            rowY += 22;
        } else {
            const sortedHistory = [...fullHistory].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
            let stripe = false;
            
            for (const entry of sortedHistory) {
                if (rowY > doc.page.height - 140) {
                    doc.addPage();
                    rowY = 125;

                    doc.fillColor('#f3f4f6').rect(60, rowY, doc.page.width - 120, 20).fill();
                    doc.fontSize(8).font('Helvetica-Bold').fillColor('#374151');
                    doc.text('DATE', cols.date.x + 4, rowY + 6);
                    doc.text('PERIOD', cols.period.x, rowY + 6);
                    doc.text('DESCRIPTION', cols.desc.x, rowY + 6);
                    doc.text('SOURCE', cols.source.x, rowY + 6, { align: 'center', width: cols.source.w });
                    doc.text('TYPE', cols.type.x, rowY + 6, { align: 'center', width: cols.type.w });
                    doc.text('AMOUNT', cols.amount.x, rowY + 6, { align: 'right', width: cols.amount.w - 4 });
                    rowY += 20;
                }

                if (stripe) {
                    doc.fillColor('#f9fafb').rect(60, rowY, doc.page.width - 120, 20).fill();
                }

                const isCredit = entry.type === 'credit';
                doc.fontSize(8).font('Helvetica').fillColor('#111827');
                doc.text(fmtDate_local(entry.date), cols.date.x + 4, rowY + 6);

                const periodStr = entry.periodMonth && entry.periodYear 
                    ? `${MONTH_SHORT_local[entry.periodMonth]} ${entry.periodYear}` 
                    : '-';
                doc.text(periodStr, cols.period.x, rowY + 6);
                doc.text(entry.description || (entry.source === 'manual' ? 'Previous PF Balance' : 'PF Contribution'), cols.desc.x, rowY + 6, { width: cols.desc.w, lineBreak: false });

                const srcLabel = entry.source === 'manual' ? 'manual' : 'payroll';
                doc.fillColor(entry.source === 'manual' ? '#92400e' : '#1e40af')
                   .text(srcLabel, cols.source.x, rowY + 6, { width: cols.source.w, align: 'center' });

                doc.fillColor(isCredit ? '#059669' : '#dc2626')
                   .text(isCredit ? '+ Credit' : '- Debit', cols.type.x, rowY + 6, { width: cols.type.w, align: 'center' });

                doc.font('Helvetica-Bold').fillColor(isCredit ? '#059669' : '#dc2626')
                   .text(`${isCredit ? '+' : '-'}${fmtPKR_local(entry.amount)}`, cols.amount.x, rowY + 6, { width: cols.amount.w - 4, align: 'right' });

                doc.font('Helvetica');
                doc.strokeColor('#f3f4f6').lineWidth(0.5).moveTo(60, rowY + 20).lineTo(doc.page.width - 60, rowY + 20).stroke();

                rowY += 20;
                stripe = !stripe;
            }

            doc.fillColor('#f9fafb').rect(60, rowY, doc.page.width - 120, 22).fill();
            doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(60, rowY).lineTo(doc.page.width - 60, rowY).stroke();
            doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(60, rowY + 22).lineTo(doc.page.width - 60, rowY + 22).stroke();
            
            doc.fontSize(8).font('Helvetica-Bold').fillColor('#374151');
            doc.text('TOTAL ACCUMULATED PF BALANCE', cols.date.x + 4, rowY + 7, { width: 250 });
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#15803d')
               .text(fmtPKR_local(currentBalance), cols.amount.x, rowY + 6, { width: cols.amount.w - 4, align: 'right' });
        }

        // Footer Section (Dashed Line + Centered Subtitle + Bottom Purple Banner)
        doc.page.margins.bottom = 0;

        doc.moveTo(60, doc.page.height - 110)
           .lineTo(doc.page.width - 60, doc.page.height - 110)
           .dash(2, { space: 2 })
           .strokeColor('#333333')
           .stroke();

        if (qrCodeDataUri) {
            try {
                const base64Data = qrCodeDataUri.replace(/^data:image\/png;base64,/, '');
                const imageBuffer = Buffer.from(base64Data, 'base64');
                doc.image(imageBuffer, (doc.page.width / 2) - 22, doc.page.height - 100, { width: 44 });
            } catch (e) {}
        }

        doc.fillColor('#444444')
           .fontSize(7)
           .font('Helvetica-Bold')
           .text('I T C S   ( I T   C O N S U L T I N G   &   S E R V I C E S )', 45, doc.page.height - 52, { align: 'center', width: doc.page.width - 90, lineBreak: false });

        const bannerHeight = 38;
        const bannerY = doc.page.height - bannerHeight;

        doc.rect(0, bannerY, doc.page.width, bannerHeight).fill(darkPurple);

        doc.save()
           .moveTo(0, bannerY)
           .lineTo(85, bannerY)
           .lineTo(120, doc.page.height)
           .lineTo(0, doc.page.height)
           .closePath()
           .fill(magentaAccent);

        doc.save()
           .moveTo(doc.page.width - 85, bannerY)
           .lineTo(doc.page.width, bannerY)
           .lineTo(doc.page.width, doc.page.height)
           .lineTo(doc.page.width - 120, doc.page.height)
           .closePath()
           .fill(magentaAccent);

        doc.fillColor('#FFFFFF').fontSize(6.5).font('Helvetica-Bold');
        doc.text('Karachi: 6/K Block 2, P.E.C.H.S, Near Model School Karachi Pakistan', 10, bannerY + 6, { align: 'center', width: doc.page.width - 20, lineBreak: false });
        doc.text('Lahore: Office 32, 1st Floor, I.T Tower 73-E/1, Hali Rd, Block A Gulberg III', 10, bannerY + 16, { align: 'center', width: doc.page.width - 20, lineBreak: false });
        doc.text('Islamabad: Office # 14, Ground Floor, Malik Plaza F-8 Markaz', 10, bannerY + 26, { align: 'center', width: doc.page.width - 20, lineBreak: false });
        
        doc.fontSize(6).text('INFO@ITCS.COM.PK', 15, bannerY + 16, { width: 100, align: 'left', lineBreak: false });
        doc.fontSize(6).text('+92 21 111-482-711', doc.page.width - 115, bannerY + 16, { width: 100, align: 'right', lineBreak: false });

        doc.end();
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/employees/:id/pf-adjust
 * Adds a manual credit or debit adjustment to the employee's PF.
 * Admin/super-admin only.
 */
router.post('/:id/pf-adjust', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    const role = authReq.user?.role || '';
    if (role !== 'super-admin' && role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required.' });
    }

    try {
        const { amount, type, description, periodMonth, periodYear, erpReferenceId } = req.body;
        
        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
            return res.status(400).json({ message: 'Valid positive amount is required.' });
        }
        if (type !== 'credit' && type !== 'debit') {
            return res.status(400).json({ message: 'Type must be "credit" or "debit".' });
        }
        if (!description || description.trim() === '') {
            return res.status(400).json({ message: 'Description is required.' });
        }

        const employee = await Employee.findOne({ employeeId: req.params.id });
        if (!employee) return res.status(404).json({ message: 'Employee not found.' });

        const adjustAmount = Number(amount);

        if (type === 'debit' && (employee.providentFundBalance || 0) < adjustAmount) {
            return res.status(400).json({ message: 'Insufficient PF balance for this debit adjustment.' });
        }

        if (!employee.providentFundHistory) employee.providentFundHistory = [];
        
        const historyEntry = {
            amount: adjustAmount,
            type,
            source: 'manual',
            date: new Date(),
            description: description.trim(),
            periodMonth: periodMonth ? Number(periodMonth) : undefined,
            periodYear: periodYear ? Number(periodYear) : undefined,
            erpReferenceId: erpReferenceId ? String(erpReferenceId).trim() : undefined
        };

        employee.providentFundHistory.push(historyEntry as any);

        if (type === 'credit') {
            employee.providentFundBalance = (employee.providentFundBalance || 0) + adjustAmount;
        } else {
            employee.providentFundBalance = (employee.providentFundBalance || 0) - adjustAmount;
        }

        await employee.save();

        // Map employee to return the updated EmpPFData shape
        const now = new Date();
        const joiningDate = employee.jobInfo?.joiningDate ? new Date(employee.jobInfo.joiningDate) : null;
        let monthsOfService = 0;
        let maturityDate: Date | null = null;
        if (joiningDate) {
            const now2 = new Date();
            monthsOfService =
                (now2.getFullYear() - joiningDate.getFullYear()) * 12 +
                (now2.getMonth() - joiningDate.getMonth());
            maturityDate = new Date(joiningDate);
            maturityDate.setMonth(maturityDate.getMonth() + PF_MATURITY_MONTHS);
        }
        const isMatured = maturityDate ? now >= maturityDate : false;

        const updatedEmpData = {
            employeeId: employee.employeeId,
            firstName: employee.firstName,
            lastName: employee.lastName,
            designation: employee.jobInfo?.designation,
            department: employee.jobInfo?.department,
            joiningDate: employee.jobInfo?.joiningDate,
            monthsOfService,
            maturityDate: maturityDate ? maturityDate.toISOString() : null,
            providentFundBalance: employee.providentFundBalance || 0,
            providentFundHistory: employee.providentFundHistory || [],
            pfClaimed: employee.pfClaimed || false,
            pfClaimedAt: employee.pfClaimedAt || null,
            isMatured,
            maturityThresholdMonths: PF_MATURITY_MONTHS
        };

        return res.json({
            message: 'PF adjustment applied successfully.',
            employee: updatedEmpData
        });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/employees/:id/pf-claim
 * Marks the employee's PF as claimed (zeroes balance, logs debit, records claim date).
 * Admin/super-admin only. Blocked if not matured or already claimed.
 */
router.post('/:id/pf-claim', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    const role = authReq.user?.role || '';
    if (role !== 'super-admin' && role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required.' });
    }

    try {
        const employee = await Employee.findOne({ employeeId: req.params.id });
        if (!employee) return res.status(404).json({ message: 'Employee not found.' });

        if (employee.pfClaimed) {
            return res.status(400).json({ message: 'PF has already been claimed for this employee.' });
        }

        const joiningDate = employee.jobInfo?.joiningDate ? new Date(employee.jobInfo.joiningDate) : null;
        const now = new Date();
        let maturityDate: Date | null = null;
        if (joiningDate) {
            maturityDate = new Date(joiningDate);
            maturityDate.setMonth(maturityDate.getMonth() + PF_MATURITY_MONTHS);
        }

        if (!maturityDate || now < maturityDate) {
            const monthsLeft = maturityDate
                ? Math.max(0, (maturityDate.getFullYear() - now.getFullYear()) * 12 + (maturityDate.getMonth() - now.getMonth()))
                : PF_MATURITY_MONTHS;
            return res.status(400).json({
                message: `PF is not matured yet. Matures on ${maturityDate?.toDateString() || 'N/A'}. ${monthsLeft} month(s) remaining.`
            });
        }

        const balance = employee.providentFundBalance || 0;
        if (balance <= 0) {
            return res.status(400).json({ message: 'No PF balance to claim.' });
        }

        // Log the claim debit
        if (!employee.providentFundHistory) employee.providentFundHistory = [];
        employee.providentFundHistory.push({
            amount: balance,
            type: 'debit',
            source: 'manual',
            date: now,
            description: `PF Claimed by ${authReq.user?.userId || 'admin'}`,
            erpReferenceId: req.body.erpReferenceId ? String(req.body.erpReferenceId).trim() : undefined
        } as any);

        employee.providentFundBalance = 0;
        employee.pfClaimed = true;
        employee.pfClaimedAt = now;

        await employee.save();

        return res.json({
            message: 'PF claimed successfully.',
            claimedAmount: balance,
            pfClaimedAt: now
        });
    } catch (err) {
        next(err);
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

        res.json(sanitizeEmployeeForRole(employee, authReq.user?.role || '', authReq.user?.userId));
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
            'firstName', 'lastName', 'middleName', 'cnic', 'dateOfBirth', 'gender',
            'maritalStatus', 'nationality', 'domicile', 'fatherName', 'bloodGroup', 'religion',
            'phone', 'address', 'temporaryAddress', 'emergencyContacts', 'dependents',
            'education', 'employmentHistory', 'immigrationHistory',
            'socialProfiles', 'skills', 'certifications', 'bankDetails',
            'licenseNumber', 'simNumber', 'workEmail', 'otherEmail', 'email'
        ];
        const ADMIN_EXTRA_FIELDS = [
            'jobInfo', 'employmentStatus', 'salaryComponents', 'financeInfo', 'benefits', 
            'employeeId', 'biometricPin', 'avatar', 'providentFundBalance'
        ];

        const allowedFields = isAdmin
            ? [...EMPLOYEE_EDITABLE_FIELDS, ...ADMIN_EXTRA_FIELDS]
            : EMPLOYEE_EDITABLE_FIELDS;

        // Use native pick to only allow whitelisted fields from the request body
        const updates = pick(req.body, allowedFields) as any;
        // Attachments are always managed via dedicated endpoints
        delete updates.attachments;

        // Only super-admin and finance can edit salary / financial components
        const canEditFinancials = ['super-admin', 'finance'].includes(role);
        if (!canEditFinancials) {
            delete updates.salaryComponents;
            delete updates.financeInfo;
            delete updates.providentFundBalance;
            delete updates.loans;
            if (role === 'hr' || role === 'manager') {
                delete updates.bankDetails;
            }
        }

        // Check for manual Provident Fund Balance adjustment
        if (updates.providentFundBalance !== undefined) {
            const oldBalance = employee.providentFundBalance || 0;
            const newBalance = Number(updates.providentFundBalance);
            if (newBalance !== oldBalance) {
                const diffAmt = Math.abs(newBalance - oldBalance);
                const historyEntry = {
                    amount: diffAmt,
                    type: newBalance > oldBalance ? 'credit' : 'debit',
                    source: 'manual',
                    date: new Date(),
                    description: 'Manual Adjustment / Starting Balance'
                };
                if (!employee.providentFundHistory) {
                    (employee as any).providentFundHistory = [];
                }
                employee.providentFundHistory!.push(historyEntry as any);
                employee.providentFundBalance = newBalance;
                await employee.save();
                // Remove from updates so findOneAndUpdate doesn't overwrite it with BSON values or version issues
                delete updates.providentFundBalance;
            }
        }

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

        // Keep salaryComponents in sync when only financeInfo salary fields are filled
        const mergedFinance = {
            ...(employee.financeInfo?.toObject?.() ?? employee.financeInfo ?? {}),
            ...(updates.financeInfo ?? {}),
        };
        const mergedComponents = updates.salaryComponents ?? employee.salaryComponents ?? [];
        const componentTotal = (mergedComponents as any[]).reduce(
            (sum: number, c: any) => sum + (Number(c?.amount) || 0),
            0
        );
        if (componentTotal === 0) {
            const status =
                updates.employmentStatus?.status ??
                (typeof employee.employmentStatus === 'string'
                    ? employee.employmentStatus
                    : employee.employmentStatus?.status);
            const probationSalary = Number(mergedFinance.probationSalary) || 0;
            const confirmedSalary = Number(mergedFinance.confirmedSalary) || 0;
            let amount = 0;
            let component = 'Basic Salary';
            if (status === 'Probation' && probationSalary > 0) {
                amount = probationSalary;
                component = 'Probation Salary';
            } else if (confirmedSalary > 0) {
                amount = confirmedSalary;
            } else if (probationSalary > 0) {
                amount = probationSalary;
                if (status === 'Probation') component = 'Probation Salary';
            }
            if (amount > 0) {
                updates.salaryComponents = [{ component, amount, type: 'fixed' }];
            }
        }

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

        const diff = updates;

        // Sync names to User model if userId exists
        if (employee.userId && (updates.firstName || updates.lastName)) {
            await User.findByIdAndUpdate(employee.userId, {
                ...(updates.firstName && { firstName: updates.firstName }),
                ...(updates.lastName && { lastName: updates.lastName })
            });
        }

        // Log action
        await createAuditLog('UPDATE', req.params.id, authReq.user?.userId || 'unknown', { diff });

        res.json(sanitizeEmployeeForRole(updatedEmployee.toObject(), role, authReq.user?.userId));
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

