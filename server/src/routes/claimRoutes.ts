import express, { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import ExpenseClaim, { type ExpenseClaimApprovalStage } from '../models/ExpenseClaim';
import ExpenseCategory from '../models/ExpenseCategory';
import Employee from '../models/Employee';
import Counter from '../models/Counter';
import { User } from '../models/User.model';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
    sendHRNotificationEmail,
    sendExpenseClaimSubmittedEmail,
    sendExpenseClaimStatusEmail,
    sendExpenseClaimActionRequiredEmail,
    sendExpenseClaimAmendedEmail
} from '../utils/email';
import { extractAndAnalyzeReceipts } from '../services/receiptExtraction';
import { formatEmployeeFullName } from '../utils/nameHelper';

const router = express.Router();

type ReceiptInput = { fileName: string; contentType?: string; base64: string };

const MAX_RECEIPTS = 5;
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024; // 5MB each

const getHrEmails = async (): Promise<string[]> => {
    const envList = (process.env.EXPENSE_HR_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean);
    const dbUsers = await User.find({ role: { $in: ['super-admin', 'admin', 'hr'] } }).select('email').lean();
    const dbEmails = dbUsers.map((u: any) => u.email).filter(Boolean);
    const fallback = process.env.HR_EMAIL || process.env.SMTP_USER || '';
    return Array.from(new Set([...envList, ...dbEmails, fallback].filter(Boolean)));
};

const getFinanceEmails = async (): Promise<string[]> => {
    const envList = (process.env.EXPENSE_FINANCE_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean);
    const dbUsers = await User.find({ role: { $in: ['super-admin', 'admin', 'finance'] } }).select('email').lean();
    const dbEmails = dbUsers.map((u: any) => u.email).filter(Boolean);
    const fallback = process.env.FINANCE_EMAILS || process.env.HR_EMAIL || process.env.SMTP_USER || '';
    return Array.from(new Set([...envList, ...dbEmails, fallback].filter(Boolean)));
};

function sanitizeClaimForJson(doc: any) {
    const obj = doc?.toObject ? (doc.toObject() as any) : (doc as any);
    if (Array.isArray(obj?.receipts)) {
        obj.receipts = obj.receipts.map((r: any) => ({ ...r, fileData: undefined }));
    }
    return obj;
}

function buildWorkflow(category: string): ExpenseClaimApprovalStage[] {
    return ['hr', 'finance'];
}

function stageToStatus(stage: ExpenseClaimApprovalStage): string {
    if (stage === 'teamLead') return 'Pending Team Lead';
    if (stage === 'lineManager') return 'Pending Line Manager';
    if (stage === 'hr') return 'Pending HR';
    return 'Pending Finance';
}

function decodeReceipts(receipts?: ReceiptInput[]) {
    const decoded: any[] = [];
    if (!receipts) return decoded;
    if (!Array.isArray(receipts)) throw new Error('receipts must be an array');
    if (receipts.length > MAX_RECEIPTS) throw new Error(`Maximum ${MAX_RECEIPTS} receipts allowed`);

    for (const r of receipts) {
        if (!r?.fileName || !r?.base64) throw new Error('Each receipt requires fileName and base64');
        const clean = r.base64.includes(',') ? r.base64.split(',').pop()! : r.base64;
        const buf = Buffer.from(clean, 'base64');
        if (buf.byteLength > MAX_RECEIPT_BYTES) throw new Error(`Receipt too large (max ${MAX_RECEIPT_BYTES} bytes)`);
        decoded.push({
            _id: new mongoose.Types.ObjectId(),
            fileName: r.fileName,
            contentType: r.contentType,
            fileData: buf,
            uploadedAt: new Date(),
        });
    }
    return decoded;
}

async function generateClaimNo(): Promise<string> {
    const year = new Date().getFullYear();
    const counter: any = await Counter.findOneAndUpdate(
        { key: `claimNo_${year}` },
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
    );
    let seq = counter?.seq || 1;
    let claimNo = `EC-${year}-${String(seq).padStart(4, '0')}`;

    while (await ExpenseClaim.exists({ claimNo })) {
        seq++;
        claimNo = `EC-${year}-${String(seq).padStart(4, '0')}`;
    }

    await Counter.updateOne({ key: `claimNo_${year}` }, { $set: { seq } });
    return claimNo;
}

function roleCanActOnStage(role: string, stage: ExpenseClaimApprovalStage): boolean {
    if (stage === 'teamLead' || stage === 'lineManager') return role === 'manager' || role === 'admin' || role === 'super-admin';
    if (stage === 'hr') return role === 'admin' || role === 'super-admin' || role === 'hr';
    if (stage === 'finance') return role === 'admin' || role === 'super-admin' || role === 'finance';
    return false;
}

function isAdminLike(role: string) {
    return role === 'super-admin' || role === 'admin' || role === 'hr' || role === 'finance';
}

function isFinalStatus(status?: string) {
    return status === 'Approved' || status === 'Declined';
}

async function resolveClaimLimits(
    category: string,
    submitterUserId: string,
    amountRequested: number,
    excludeClaimId?: string
): Promise<{ catDoc: any; amountAllowed: number; limit: number; outOfPolicy: boolean }> {
    const catDoc = await ExpenseCategory.findOne({ name: category });
    if (!catDoc) throw Object.assign(new Error('Invalid category'), { status: 400 });

    let limit = catDoc.policyLimit && catDoc.policyLimit > 0 ? catDoc.policyLimit : 9999999;

    const empDoc = await Employee.findOne({ userId: submitterUserId }).lean() as any;

    if (category === 'Medical') {
        const currentYear = new Date().getFullYear();
        const startOfYear = new Date(currentYear, 0, 1);
        const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999);

        let baseLimit = catDoc.policyLimit || 60000;
        if (empDoc?.medicalBenefit?.customAnnualLimit && empDoc.medicalBenefit.customAnnualLimit > 0) {
            baseLimit = empDoc.medicalBenefit.customAnnualLimit;
        }

        // Pro-rate if joined in current year
        if (empDoc?.jobInfo?.joiningDate) {
            const joiningDate = new Date(empDoc.jobInfo.joiningDate);
            if (joiningDate.getFullYear() === currentYear) {
                const joiningMonth = joiningDate.getMonth(); // 0 to 11
                const activeMonths = 12 - joiningMonth;
                baseLimit = Math.round((activeMonths / 12) * baseLimit);
            }
        }

        const openingUtilized = empDoc?.medicalBenefit?.openingBalanceUtilized || 0;

        const query: any = {
            employeeUserId: new mongoose.Types.ObjectId(String(submitterUserId)),
            category: 'Medical',
            status: { $nin: ['Draft', 'Declined', 'Action Required'] },
            createdAt: { $gte: startOfYear, $lte: endOfYear },
        };
        if (excludeClaimId && mongoose.isValidObjectId(excludeClaimId)) {
            query._id = { $ne: new mongoose.Types.ObjectId(excludeClaimId) };
        }

        const existingClaims = await ExpenseClaim.find(query).lean() as any[];

        const claimedSoFar = existingClaims.reduce((sum, c) => {
            const amount = typeof c.approvedTotal === 'number' ? c.approvedTotal : c.amountAllowed;
            return sum + amount;
        }, 0);

        limit = Math.max(0, baseLimit - openingUtilized - claimedSoFar);
    } else if (catDoc.policyLimit && catDoc.policyLimit > 0) {
        const currentYear = new Date().getFullYear();
        const startOfYear = new Date(currentYear, 0, 1);
        const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999);
        const query: any = {
            employeeUserId: new mongoose.Types.ObjectId(String(submitterUserId)),
            category,
            status: { $nin: ['Draft', 'Declined', 'Action Required'] },
            createdAt: { $gte: startOfYear, $lte: endOfYear },
        };
        if (excludeClaimId && mongoose.isValidObjectId(excludeClaimId)) {
            query._id = { $ne: new mongoose.Types.ObjectId(excludeClaimId) };
        }
        const existingClaims = await ExpenseClaim.find(query).lean() as any[];

        const claimedSoFar = existingClaims.reduce((sum, c) => {
            const amount = typeof c.approvedTotal === 'number' ? c.approvedTotal : c.amountAllowed;
            return sum + amount;
        }, 0);

        limit = Math.max(0, catDoc.policyLimit - claimedSoFar);
    }

    const amountAllowed = Math.min(amountRequested, limit);
    const outOfPolicy = amountRequested > limit;
    return { catDoc, amountAllowed, limit, outOfPolicy };
}

// Preview receipt scan + flags BEFORE submit (no claim created)
router.post('/preview-receipts', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const userId = authReq.user?.userId;
        const role = authReq.user?.role || 'employee';
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const { employeeId: targetEmployeeId, category, amountRequested, expenseDate, receipts } = req.body || {};

        if (!category) return res.status(400).json({ message: 'category is required' });
        if (typeof amountRequested !== 'number' || amountRequested <= 0) {
            return res.status(400).json({ message: 'amountRequested must be a positive number' });
        }

        let submitterUserId = userId;
        if (targetEmployeeId && isAdminLike(role)) {
            const employee = await Employee.findOne({ employeeId: targetEmployeeId }).lean() as any;
            if (!employee?.userId) return res.status(404).json({ message: 'Employee not found' });
            submitterUserId = employee.userId;
        }

        const { catDoc, amountAllowed, outOfPolicy } = await resolveClaimLimits(category, submitterUserId, amountRequested);
        const flags: string[] = [];

        if (outOfPolicy && !isAdminLike(role)) {
            return res.status(400).json({
                message: 'Amount exceeds remaining policy limit',
            });
        }
        if (outOfPolicy) flags.push('OutOfPolicy');

        const decodedReceipts = decodeReceipts(receipts as ReceiptInput[] | undefined);
        if (decodedReceipts.length === 0) {
            return res.json({
                success: true,
                data: { flags, receiptAnalysis: null, receipts: [] },
            });
        }

        const parsedExpenseDate = expenseDate ? new Date(expenseDate) : null;
        const analysis = await extractAndAnalyzeReceipts(
            decodedReceipts.map((r: any) => ({
                fileName: r.fileName,
                contentType: r.contentType,
                fileData: r.fileData,
            })),
            amountRequested,
            amountAllowed,
            parsedExpenseDate
        );

        for (const f of analysis.flags) {
            if (!flags.includes(f)) flags.push(f);
        }

        res.json({
            success: true,
            data: {
                flags,
                receiptAnalysis: analysis.receiptAnalysis,
                receipts: analysis.receipts.map(r => ({
                    fileName: r.fileName,
                    extractedDate: r.extractedDate,
                    extractedAmount: r.extractedAmount,
                    extractedCurrency: r.extractedCurrency,
                    merchantName: r.merchantName,
                    receiptAgeDays: r.receiptAgeDays,
                    extractionStatus: r.extractionStatus,
                    extractionError: r.extractionError,
                    extractionConfidence: r.extractionConfidence,
                })),
            },
        });
    } catch (err: any) {
        if (err?.status === 400) return res.status(400).json({ message: err.message });
        next(err);
    }
});

router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const userId = authReq.user?.userId;
        const role = authReq.user?.role || 'employee';
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const {
            employeeId: targetEmployeeId,
            category,
            subCategories,
            expenseDate,
            forWhom,
            dependentId,
            purpose,
            amountRequested,
            notes,
            receipts,
        } = req.body || {};

        if (!category) return res.status(400).json({ message: 'category is required' });
        
        const catDoc = await ExpenseCategory.findOne({ name: category });
        if (!catDoc) {
            return res.status(400).json({ message: 'Invalid category' });
        }
        
        if (typeof amountRequested !== 'number' || amountRequested <= 0) {
            return res.status(400).json({ message: 'amountRequested must be a positive number' });
        }

        let employee: any;
        let submitterUserId = userId;

        if (targetEmployeeId && isAdminLike(role)) {
            employee = await Employee.findOne({ employeeId: targetEmployeeId }).lean() as any;
            if (!employee) return res.status(404).json({ message: `Employee record not found for ID ${targetEmployeeId}` });
            submitterUserId = employee.userId;
            if (!submitterUserId) {
                return res.status(400).json({ message: 'The selected employee does not have a linked user account.' });
            }
        } else {
            employee = await Employee.findOne({ userId }).lean() as any;
            if (!employee) return res.status(404).json({ message: 'Employee record not found for this user' });
        }

        let dependentName: string | undefined;
        const fw = (forWhom as string) || 'Self';
        if (fw === 'Dependent') {
            const deps = Array.isArray(employee.dependents) ? employee.dependents : [];
            const match = deps.find((d: any) => String(d._id) === String(dependentId));
            if (!match) return res.status(400).json({ message: 'Dependent not registered. Claim blocked.' });
            dependentName = match.name;
        }

        const flags: string[] = [];
        let limit = catDoc.policyLimit && catDoc.policyLimit > 0 ? catDoc.policyLimit : 9999999;

        if (catDoc.policyLimit && catDoc.policyLimit > 0) {
            const currentYear = new Date().getFullYear();
            const startOfYear = new Date(currentYear, 0, 1);
            const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999);
            const existingClaims = await ExpenseClaim.find({
                employeeUserId: new mongoose.Types.ObjectId(String(submitterUserId)),
                category: category,
                status: { $nin: ['Draft', 'Declined'] },
                createdAt: { $gte: startOfYear, $lte: endOfYear }
            }).lean() as any[];

            const claimedSoFar = existingClaims.reduce((sum, c) => {
                const amount = typeof c.approvedTotal === 'number' ? c.approvedTotal : c.amountAllowed;
                return sum + amount;
            }, 0);

            limit = Math.max(0, catDoc.policyLimit - claimedSoFar);
        }

        const amountAllowed = Math.min(amountRequested, limit);
        const outOfPolicy = amountRequested > limit;

        if (outOfPolicy) {
            if (!isAdminLike(role)) {
                return res.status(400).json({
                    message: `Claim amount exceeds the remaining limit of PKR ${limit.toLocaleString('en-PK')}. Out-of-policy claims can only be submitted by HR or Admin.`
                });
            }
            flags.push('OutOfPolicy');
        }

        const decodedReceipts = decodeReceipts(receipts as ReceiptInput[] | undefined);
        const hasComment = notes && String(notes).trim().length >= 5;
        const hasReceipt = decodedReceipts.length > 0;

        if (catDoc.requiresReceipt) {
            if (!hasReceipt) {
                flags.push('MissingReceipt');
            }
        } else if (!hasComment && !hasReceipt) {
            // For other categories, at least one of comment or receipt is typically required
            flags.push('MissingCommentOrReceipt');
        }

        // Local OCR: extract date + amount from each uploaded receipt (no third-party AI)
        let receiptAnalysis: any = undefined;
        let finalReceipts = decodedReceipts;
        const parsedExpenseDate = expenseDate ? new Date(expenseDate) : null;
        if (decodedReceipts.length > 0) {
            const analysis = await extractAndAnalyzeReceipts(
                decodedReceipts.map((r: any) => ({
                    fileName: r.fileName,
                    contentType: r.contentType,
                    fileData: r.fileData,
                })),
                amountRequested,
                amountAllowed,
                parsedExpenseDate
            );
            finalReceipts = analysis.receipts.map((r, i) => ({
                ...decodedReceipts[i],
                extractedDate: r.extractedDate,
                extractedAmount: r.extractedAmount,
                extractedCurrency: r.extractedCurrency,
                merchantName: r.merchantName,
                receiptAgeDays: r.receiptAgeDays,
                extractionStatus: r.extractionStatus,
                extractionError: r.extractionError,
                extractionConfidence: r.extractionConfidence,
            }));
            receiptAnalysis = analysis.receiptAnalysis;
            for (const f of analysis.flags) {
                if (!flags.includes(f)) flags.push(f);
            }
        }

        const workflow = buildWorkflow(category);
        let reportingManagerId = employee?.jobInfo?.reportingManager ? String(employee.jobInfo.reportingManager) : '';
        if (reportingManagerId) {
            const mgrDoc = await Employee.findOne({
                $or: [
                    { employeeId: reportingManagerId },
                    { _id: mongoose.isValidObjectId(reportingManagerId) ? reportingManagerId : undefined },
                    { userId: reportingManagerId }
                ]
            }).select('employeeId').lean() as any;
            if (mgrDoc?.employeeId) {
                reportingManagerId = mgrDoc.employeeId;
            }
        }
        const approvals = workflow.map(stage => ({
            stage,
            status: 'Pending',
            amountAllowed,
            requiresAuthorization: stage === 'hr' && outOfPolicy,
            ...(stage === 'teamLead' || stage === 'lineManager'
                ? { assignedToEmployeeId: reportingManagerId || undefined }
                : {}),
        }));

        const firstStage = workflow[0];
        const claimNo = await generateClaimNo();

        const doc = await ExpenseClaim.create({
            claimNo,
            employeeId: employee.employeeId,
            employeeUserId: new mongoose.Types.ObjectId(String(submitterUserId)),
            category: category,
            subCategories: Array.isArray(subCategories) ? subCategories : [],
            expenseDate: expenseDate ? new Date(expenseDate) : new Date(),
            forWhom: fw,
            dependentId: fw === 'Dependent' ? String(dependentId) : undefined,
            dependentName,
            purpose,
            amountRequested,
            amountAllowed,
            approvedTotal: undefined,
            notes,
            receipts: finalReceipts,
            receiptAnalysis,
            status: stageToStatus(firstStage) as any,
            eligibility: { eligible: flags.length === 0, flags },
            approvals,
            audit: {
                submittedAt: new Date(),
                lastUpdatedAt: new Date(),
                lastUpdatedByUserId: new mongoose.Types.ObjectId(String(userId)),
            },
        });

        // Notifications (best-effort)
        const employeeName = formatEmployeeFullName(employee, employee.employeeId);
        const notifyClaim = async (emails: string[]) => {
            for (const to of emails) {
                try {
                    await sendExpenseClaimSubmittedEmail(to, employeeName, category, amountRequested);
                } catch (e) {
                    // ignore
                }
            }
        };
        (async () => {
            const hrEmails = await getHrEmails();
            const financeEmails = await getFinanceEmails();
            if (doc.status === 'Pending HR') void notifyClaim(hrEmails);
            if (doc.status === 'Pending Finance') void notifyClaim(financeEmails);
        })();
        if (doc.status === 'Pending Team Lead' || doc.status === 'Pending Line Manager') {
            (async () => {
                try {
                    if (reportingManagerId) {
                        const manager = await Employee.findOne({
                            $or: [
                                { employeeId: reportingManagerId },
                                { _id: mongoose.isValidObjectId(reportingManagerId) ? reportingManagerId : undefined },
                                { userId: reportingManagerId }
                            ]
                        });
                        const managerEmail = manager?.workEmail || manager?.email;
                        if (managerEmail) {
                            await sendExpenseClaimSubmittedEmail(
                                managerEmail,
                                employeeName,
                                category,
                                amountRequested,
                                req.headers.origin as string
                            );
                        }
                    }
                } catch (emailErr) {
                    console.error('[Expense Email] Failed to send submission email to manager:', emailErr);
                }
            })();
        }

        await doc.populate('employeeDetails', 'firstName middleName lastName employeeId');
        res.status(201).json({ success: true, data: doc });
    } catch (err: any) {
        // Handle unique claimNo collisions (rare in concurrent submit)
        if (err?.code === 11000) {
            return res.status(409).json({ message: 'Please retry submission (claim number collision)' });
        }
        next(err);
    }
});

router.get('/mine', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const userId = authReq.user?.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });
        const claims = await ExpenseClaim.find({ employeeUserId: userId })
            .select('-receipts.fileData')
            .sort({ createdAt: -1 })
            .populate('employeeDetails', 'firstName middleName lastName employeeId')
            .lean();
        res.json({ success: true, data: claims });
    } catch (err) {
        next(err);
    }
});

router.get('/approvals/pending', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const userId = authReq.user?.userId;
        const role = authReq.user?.role || 'employee';
        if (!role || role === 'employee' || role === 'manager') return res.json({ success: true, data: [] });

        if (role !== 'super-admin') {
            const dbUser = await User.findById(userId).select('customScopes customSubPermissions').lean() as any;
            if (dbUser?.customScopes?.claim === 'employee' || dbUser?.customSubPermissions?.['claim:approvals'] === false) {
                return res.json({ success: true, data: [] });
            }
        }

        let statusQuery: any = { $nin: ['Draft', 'Approved', 'Declined', 'Action Required'] };
        if (role === 'finance') {
            statusQuery = 'Pending Finance';
        } else if (role === 'hr') {
            statusQuery = 'Pending HR';
        }

        let claims = await ExpenseClaim.find({
            status: statusQuery,
        })
            .select('-receipts.fileData')
            .sort({ createdAt: -1 })
            .populate('employeeDetails', 'firstName middleName lastName employeeId')
        res.json({ success: true, data: claims });
    } catch (err) {
        next(err);
    }
});

router.get('/all', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const role = authReq.user?.role || 'employee';
        if (!isAdminLike(role) && role !== 'finance') return res.status(403).json({ message: 'Forbidden' });

        if (role !== 'super-admin') {
            const dbUser = await User.findById(authReq.user?.userId).select('customScopes customSubPermissions').lean() as any;
            if (dbUser?.customScopes?.claim === 'employee' || dbUser?.customSubPermissions?.['claim:history'] === false) {
                return res.status(403).json({ message: 'Forbidden' });
            }
        }

        const claims = await ExpenseClaim.find({})
            .select('-receipts.fileData')
            .sort({ createdAt: -1 })
            .populate('employeeDetails', 'firstName middleName lastName employeeId')
            .lean();
        res.json({ success: true, data: claims });
    } catch (err) {
        next(err);
    }
});

router.patch('/bulk-decision', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const userId = authReq.user?.userId;
        const role = authReq.user?.role || 'employee';
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const { claimIds, decision, comments } = req.body || {};
        if (!Array.isArray(claimIds) || claimIds.length === 0) {
            return res.status(400).json({ message: 'claimIds array is required' });
        }
        if (!['Approved', 'Declined'].includes(decision)) {
            return res.status(400).json({ message: 'decision must be Approved or Declined' });
        }

        const processedIds = [];
        const failedIds = [];

        for (const claimId of claimIds) {
            try {
                const claim = await ExpenseClaim.findById(claimId);
                if (!claim || isFinalStatus(claim.status)) {
                    failedIds.push(claimId);
                    continue;
                }

                const currentStage = claim.approvals?.find((a: any) => a.status === 'Pending')?.stage as ExpenseClaimApprovalStage | undefined;
                if (!currentStage) {
                    failedIds.push(claimId);
                    continue;
                }

                if (!isAdminLike(role) && !roleCanActOnStage(role, currentStage)) {
                    failedIds.push(claimId);
                    continue;
                }

                const idx = claim.approvals.findIndex((a: any) => a.status === 'Pending');
                const pending = claim.approvals[idx] as any;

                if (role === 'manager' && (currentStage === 'teamLead' || currentStage === 'lineManager')) {
                    const managerEmployee = await Employee.findOne({ userId }).select('employeeId').lean() as any;
                    const managerEmployeeId = managerEmployee?.employeeId ? String(managerEmployee.employeeId) : '';
                    const managerMongoId = managerEmployee?._id ? String(managerEmployee._id) : '';
                    const managerIdentifiers = [managerEmployeeId, managerMongoId, String(userId)].filter(Boolean);

                    const isAssigned = managerIdentifiers.includes(String(pending.assignedToEmployeeId || ''));
                    let isDirectReport = false;
                    if (!isAssigned) {
                        const claimSubmitter = await Employee.findOne({
                            $or: [
                                { employeeId: claim.employeeId },
                                { userId: claim.employeeUserId }
                            ]
                        }).select('jobInfo.reportingManager').lean() as any;
                        if (claimSubmitter?.jobInfo?.reportingManager && managerIdentifiers.includes(String(claimSubmitter.jobInfo.reportingManager))) {
                            isDirectReport = true;
                        }
                    }
                    if (!isAssigned && !isDirectReport) {
                        failedIds.push(claimId);
                        continue;
                    }
                }

                if (decision === 'Approved') {
                    const allowed = typeof pending.amountAllowed === 'number' ? pending.amountAllowed : claim.amountAllowed;
                    const requested = claim.amountRequested;
                    pending.approvedAmount = Math.min(requested, allowed);
                    pending.amountAllowed = allowed;
                    // Note: If requiresAuthorization is true, it generally needs individual handling.
                    // We'll skip such claims in bulk actions to avoid violating policy bypasses without explicit authorization text.
                    if (pending.requiresAuthorization) {
                        failedIds.push(claimId);
                        continue;
                    }
                }

                if (currentStage === 'hr' && role === 'finance') {
                    failedIds.push(claimId);
                    continue;
                }
                if (currentStage === 'finance' && decision === 'Approved') {
                    // Finance approval requires individual ERP ID entry
                    failedIds.push(claimId);
                    continue;
                }

                pending.status = decision;
                pending.comments = comments;
                pending.decidedAt = new Date();
                pending.decidedByUserId = new mongoose.Types.ObjectId(String(userId));

                if (decision === 'Declined') {
                    claim.status = 'Declined';
                    claim.approvedTotal = 0;
                } else {
                    const nextPending = claim.approvals.find((a: any) => a.status === 'Pending');
                    if (nextPending) {
                        claim.status = stageToStatus(nextPending.stage) as any;
                    } else {
                        claim.status = 'Approved';
                        const lastApprovedAmount = [...claim.approvals]
                            .reverse()
                            .find((a: any) => a.status === 'Approved' && typeof a.approvedAmount === 'number')?.approvedAmount;
                        claim.approvedTotal = typeof lastApprovedAmount === 'number' ? lastApprovedAmount : claim.amountAllowed;
                    }
                }

                (claim as any).audit = (claim as any).audit || {};
                (claim as any).audit.lastUpdatedAt = new Date();
                (claim as any).audit.lastUpdatedByUserId = new mongoose.Types.ObjectId(String(userId));

                await claim.save();

                // Trigger employee notification email asynchronously
                (async () => {
                    try {
                        const emp = await Employee.findOne({
                            $or: [
                                { userId: claim.employeeUserId },
                                { employeeId: claim.employeeId },
                                { _id: claim.employeeUserId }
                            ]
                        });
                        const employeeEmail = emp?.workEmail || emp?.email;
                        if (employeeEmail) {
                            await sendExpenseClaimStatusEmail(
                                employeeEmail,
                                formatEmployeeFullName(emp, 'Employee'),
                                claim.category,
                                claim.amountRequested,
                                claim.status,
                                claim.approvedTotal ?? undefined,
                                comments,
                                req.headers.origin as string
                            );
                        }
                    } catch (emailErr) {
                        console.error('[Expense Email] Failed to send status email in bulk decision:', emailErr);
                    }
                })();

                const hrEmailsList = await getHrEmails();
                const financeEmailsList = await getFinanceEmails();
                if (claim.status === 'Pending HR' && hrEmailsList.length) {
                    const employee = await Employee.findOne({ employeeId: claim.employeeId }).lean() as any;
                    const employeeName = formatEmployeeFullName(employee, claim.employeeId);
                    for (const to of hrEmailsList) void sendHRNotificationEmail(to, employeeName, `expense claim ${claim.claimNo} is pending HR review`);
                }
                if (claim.status === 'Pending Finance' && financeEmailsList.length) {
                    const employee = await Employee.findOne({ employeeId: claim.employeeId }).lean() as any;
                    const employeeName = formatEmployeeFullName(employee, claim.employeeId);
                    for (const to of financeEmailsList) void sendHRNotificationEmail(to, employeeName, `expense claim ${claim.claimNo} is pending finance review`);
                }

                processedIds.push(claimId);
            } catch (e) {
                failedIds.push(claimId);
            }
        }

        res.json({ success: true, processedCount: processedIds.length, failedCount: failedIds.length, failedIds });
    } catch (err) {
        next(err);
    }
});

router.patch('/:id/decision', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const userId = authReq.user?.userId;
        const role = authReq.user?.role || 'employee';
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const { decision, comments, approvedAmount, authorizationBy, erpReferenceId } = req.body || {};
        if (!['Approved', 'Declined'].includes(decision)) return res.status(400).json({ message: 'decision must be Approved or Declined' });

        const claim = await ExpenseClaim.findById(req.params.id);
        if (!claim) return res.status(404).json({ message: 'Claim not found' });
        if (isFinalStatus(claim.status)) return res.status(400).json({ message: 'Claim is already finalized' });

        const currentStage = claim.approvals?.find((a: any) => a.status === 'Pending')?.stage as ExpenseClaimApprovalStage | undefined;
        if (!currentStage) return res.status(400).json({ message: 'Claim has no pending stage' });
        if (!isAdminLike(role) && !roleCanActOnStage(role, currentStage)) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        // Enforce stage-based permissions
        if (currentStage === 'hr' && role === 'finance') {
            return res.status(403).json({ message: 'Expense claims must be approved by HR / Admin before Finance can disburse or approve.' });
        }

        if (currentStage === 'finance' && decision === 'Approved' && (!erpReferenceId || !String(erpReferenceId).trim())) {
            return res.status(400).json({ message: 'ERP Transaction Reference ID is required when Finance approves/disburses an expense claim.' });
        }

        const idx = claim.approvals.findIndex((a: any) => a.status === 'Pending');
        const pending = claim.approvals[idx] as any;

        if (role === 'manager' && (currentStage === 'teamLead' || currentStage === 'lineManager')) {
            const managerEmployee = await Employee.findOne({ userId }).select('employeeId').lean() as any;
            const managerEmployeeId = managerEmployee?.employeeId ? String(managerEmployee.employeeId) : '';
            const managerMongoId = managerEmployee?._id ? String(managerEmployee._id) : '';
            const managerIdentifiers = [managerEmployeeId, managerMongoId, String(userId)].filter(Boolean);

            const isAssigned = managerIdentifiers.includes(String(pending.assignedToEmployeeId || ''));
            let isDirectReport = false;
            if (!isAssigned) {
                const claimSubmitter = await Employee.findOne({
                    $or: [
                        { employeeId: claim.employeeId },
                        { userId: claim.employeeUserId }
                    ]
                }).select('jobInfo.reportingManager').lean() as any;
                if (claimSubmitter?.jobInfo?.reportingManager && managerIdentifiers.includes(String(claimSubmitter.jobInfo.reportingManager))) {
                    isDirectReport = true;
                }
            }
            if (!isAssigned && !isDirectReport) {
                return res.status(403).json({ message: 'This claim is not assigned to you' });
            }
        }

        // Partial approvals (primarily HR): allow approvedAmount <= amountAllowed
        if (decision === 'Approved') {
            let maxAllowed = typeof pending.amountAllowed === 'number' ? pending.amountAllowed : claim.amountAllowed;
            
            // If current stage is finance, enforce max cap from HR approved amount
            if (currentStage === 'finance') {
                const hrApproval = claim.approvals?.find((a: any) => a.stage === 'hr' && a.status === 'Approved');
                if (hrApproval && typeof hrApproval.approvedAmount === 'number') {
                    maxAllowed = hrApproval.approvedAmount;
                }
            }

            const requested = claim.amountRequested;
            const proposed = typeof approvedAmount === 'number' ? approvedAmount : maxAllowed;
            if (proposed < 0) return res.status(400).json({ message: 'approvedAmount must be >= 0' });
            if (proposed > maxAllowed) {
                return res.status(400).json({ message: `Approved amount cannot exceed the HR-approved amount of ${maxAllowed}` });
            }
            pending.approvedAmount = proposed;
            pending.amountAllowed = maxAllowed;
            if (pending.requiresAuthorization && !authorizationBy) {
                return res.status(400).json({ message: 'authorizationBy is required for out-of-policy approvals' });
            }
            pending.authorizationBy = authorizationBy;
        }

        pending.status = decision;
        pending.comments = comments;
        pending.decidedAt = new Date();
        pending.decidedByUserId = new mongoose.Types.ObjectId(String(userId));

        if (erpReferenceId !== undefined && String(erpReferenceId).trim() !== '') {
            claim.erpReferenceId = String(erpReferenceId).trim();
        }

        // Stage Progression
        if (decision === 'Declined') {
            claim.status = 'Declined';
            claim.approvedTotal = 0;
        } else {
            const nextPending = claim.approvals.find((a: any) => a.status === 'Pending');
            if (nextPending) {
                if (typeof pending.approvedAmount === 'number') {
                    nextPending.amountAllowed = pending.approvedAmount;
                }
                claim.status = stageToStatus(nextPending.stage) as any;
            } else {
                claim.status = 'Approved';
                const lastApprovedAmount = [...claim.approvals]
                    .reverse()
                    .find((a: any) => a.status === 'Approved' && typeof a.approvedAmount === 'number')?.approvedAmount;
                claim.approvedTotal = typeof lastApprovedAmount === 'number' ? lastApprovedAmount : claim.amountAllowed;
            }
        }

        (claim as any).audit = (claim as any).audit || {};
        (claim as any).audit.lastUpdatedAt = new Date();
        (claim as any).audit.lastUpdatedByUserId = new mongoose.Types.ObjectId(String(userId));

        await claim.save();

        // Trigger employee notification email asynchronously
        (async () => {
            try {
                const emp = await Employee.findOne({
                    $or: [
                        { userId: claim.employeeUserId },
                        { employeeId: claim.employeeId }
                    ]
                }).select('workEmail personalEmail firstName lastName');
                
                let employeeEmail = emp?.workEmail || emp?.personalEmail;
                if (!employeeEmail && claim.employeeUserId) {
                    const u = await User.findById(claim.employeeUserId).select('email').lean() as any;
                    employeeEmail = u?.email;
                }

                if (employeeEmail) {
                    await sendExpenseClaimStatusEmail(
                        employeeEmail,
                        emp ? `${emp.firstName || ''} ${emp.lastName || ''}`.trim() : 'Employee',
                        claim.category,
                        claim.amountRequested,
                        claim.status,
                        pending.approvedAmount ?? claim.approvedTotal ?? undefined,
                        comments || pending.comments,
                        req.headers.origin as string
                    );
                }
            } catch (emailErr) {
                console.error('[Expense Email] Failed to send status email to employee:', emailErr);
            }
        })();

        // Notify HR/Finance when entering their queues
        const hrEmailsList = await getHrEmails();
        const financeEmailsList = await getFinanceEmails();
        if (claim.status === 'Pending HR' && hrEmailsList.length) {
            const employee = await Employee.findOne({ employeeId: claim.employeeId }).lean() as any;
            const employeeName = formatEmployeeFullName(employee, claim.employeeId);
            for (const to of hrEmailsList) void sendHRNotificationEmail(to, employeeName, `expense claim ${claim.claimNo} is pending HR review`);
        }
        if (claim.status === 'Pending Finance' && financeEmailsList.length) {
            const employee = await Employee.findOne({ employeeId: claim.employeeId }).lean() as any;
            const employeeName = formatEmployeeFullName(employee, claim.employeeId);
            for (const to of financeEmailsList) void sendHRNotificationEmail(to, employeeName, `expense claim ${claim.claimNo} is pending finance review`);
        }

        await claim.populate('employeeDetails', 'firstName middleName lastName employeeId');
        res.json({ success: true, data: sanitizeClaimForJson(claim) });
    } catch (err) {
        next(err);
    }
});

// HR/admin post-submission correction (status + approvedTotal)
router.patch('/:id/admin-correct', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const userId = authReq.user?.userId;
        const role = authReq.user?.role || 'employee';
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });
        if (!isAdminLike(role)) return res.status(403).json({ message: 'Forbidden' });

        const { status, approvedTotal, notes } = req.body || {};
        const allowedStatuses = ['Submitted', 'Pending Team Lead', 'Pending Line Manager', 'Pending HR', 'Pending Finance', 'Approved', 'Declined'];
        if (status && !allowedStatuses.includes(status)) return res.status(400).json({ message: 'Invalid status' });

        const claim = await ExpenseClaim.findById(req.params.id);
        if (!claim) return res.status(404).json({ message: 'Claim not found' });

        if (typeof approvedTotal === 'number') {
            if (approvedTotal < 0) return res.status(400).json({ message: 'approvedTotal must be >= 0' });
            if (approvedTotal > claim.amountRequested) return res.status(400).json({ message: 'approvedTotal cannot exceed amountRequested' });
            claim.approvedTotal = approvedTotal;
        }
        if (typeof status === 'string') claim.status = status as any;
        if (typeof notes === 'string' && notes.trim()) claim.notes = notes;

        (claim as any).audit = (claim as any).audit || {};
        (claim as any).audit.lastUpdatedAt = new Date();
        (claim as any).audit.lastUpdatedByUserId = new mongoose.Types.ObjectId(String(userId));
        await claim.save();

        // Trigger employee notification email asynchronously
        (async () => {
            try {
                const emp = await Employee.findOne({
                    $or: [
                        { userId: claim.employeeUserId },
                        { employeeId: claim.employeeId },
                        { _id: claim.employeeUserId }
                    ]
                });
                const employeeEmail = emp?.workEmail || emp?.email;
                if (employeeEmail) {
                    await sendExpenseClaimStatusEmail(
                        employeeEmail,
                        formatEmployeeFullName(emp, 'Employee'),
                        claim.category,
                        claim.amountRequested,
                        claim.status,
                        claim.approvedTotal ?? undefined,
                        notes || claim.notes,
                        req.headers.origin as string
                    );
                }
            } catch (emailErr) {
                console.error('[Expense Email] Failed to send correction status email to employee:', emailErr);
            }
        })();

        await claim.populate('employeeDetails', 'firstName middleName lastName employeeId');
        res.json({ success: true, data: sanitizeClaimForJson(claim) });
    } catch (err) {
        next(err);
    }
});

// Update ERP Reference ID for an Approved Claim (Finance/Admin)
router.patch('/:id/erp-reference', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const userId = authReq.user?.userId;
        const role = authReq.user?.role || 'employee';
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });
        if (!isAdminLike(role) && role !== 'finance') return res.status(403).json({ message: 'Forbidden' });

        const { erpReferenceId } = req.body || {};
        if (!erpReferenceId || typeof erpReferenceId !== 'string' || !erpReferenceId.trim()) {
            return res.status(400).json({ message: 'erpReferenceId is required' });
        }

        const claim = await ExpenseClaim.findById(req.params.id);
        if (!claim) return res.status(404).json({ message: 'Claim not found' });

        claim.erpReferenceId = erpReferenceId.trim();
        (claim as any).audit = (claim as any).audit || {};
        (claim as any).audit.lastUpdatedAt = new Date();
        (claim as any).audit.lastUpdatedByUserId = new mongoose.Types.ObjectId(String(userId));
        await claim.save();

        await claim.populate('employeeDetails', 'firstName middleName lastName employeeId');
        res.json({ success: true, data: sanitizeClaimForJson(claim) });
    } catch (err) {
        next(err);
    }
});

// Real-time "data collection progress" (employee profile completeness) for admins
router.get('/profile-progress', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const role = authReq.user?.role || 'employee';
        if (!isAdminLike(role) && role !== 'manager') return res.json({ success: true, data: { totalEmployees: 0, completed: 0, pct: 0 } });

        const employees = await Employee.find({ 'employmentStatus.status': { $nin: ['Terminated', 'Resigned'] } })
            .select('phone address cnic jobInfo.designation jobInfo.department userId')
            .lean() as any[];

        const totalEmployees = employees.length;
        const completed = employees.filter(e =>
            !!e.userId &&
            !!e.phone &&
            !!e.cnic &&
            !!(e.address?.street || e.address?.city || e.address?.state || e.address?.country) &&
            !!e.jobInfo?.department &&
            !!e.jobInfo?.designation
        ).length;

        const pct = totalEmployees > 0 ? Math.round((completed / totalEmployees) * 100) : 0;
        res.json({ success: true, data: { totalEmployees, completed, pct } });
    } catch (err) {
        next(err);
    }
});

// Download receipt by claim + receipt id (authorized: owner or admin/manager)
router.get('/:id/receipts/:receiptId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const role = authReq.user?.role || 'employee';
        const userId = authReq.user?.userId;
        const claim = await ExpenseClaim.findById(req.params.id);
        if (!claim) return res.status(404).json({ message: 'Claim not found' });

        const isOwner = String(claim.employeeUserId) === String(userId);
        if (!isOwner && !isAdminLike(role) && role !== 'manager') return res.status(403).json({ message: 'Forbidden' });

        const receipt = (claim.receipts || []).find((r: any) => String(r._id) === String(req.params.receiptId));
        if (!receipt) return res.status(404).json({ message: 'Receipt not found' });

        res.set('Content-Type', receipt.contentType || 'application/octet-stream');
        res.set('Content-Disposition', `inline; filename="${receipt.fileName}"`);
        res.send(receipt.fileData);
    } catch (err) {
        next(err);
    }
});

// Re-scan receipts for an existing claim using updated OCR algorithm
router.post('/:id/rescan', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const role = authReq.user?.role || 'employee';
        const userId = authReq.user?.userId;
        const claim = await ExpenseClaim.findById(req.params.id);
        if (!claim) return res.status(404).json({ message: 'Claim not found' });

        const isOwner = String(claim.employeeUserId) === String(userId);
        if (!isOwner && !isAdminLike(role) && role !== 'manager') return res.status(403).json({ message: 'Forbidden' });

        const receipts = claim.receipts || [];
        if (receipts.length === 0) {
            return res.json({ success: true, data: sanitizeClaimForJson(claim) });
        }

        const parsedExpenseDate = claim.expenseDate ? new Date(claim.expenseDate) : null;
        const analysis = await extractAndAnalyzeReceipts(
            receipts.map((r: any) => ({
                fileName: r.fileName,
                contentType: r.contentType,
                fileData: r.fileData,
            })),
            claim.amountRequested,
            claim.amountAllowed,
            parsedExpenseDate
        );

        // Update receipt extraction details
        (claim as any).receipts = receipts.map((r: any, i: number) => {
            const extracted = analysis.receipts[i];
            const base = typeof r?.toObject === 'function' ? r.toObject() : r;
            return {
                ...base,
                extractedDate: extracted?.extractedDate,
                extractedAmount: extracted?.extractedAmount,
                extractedCurrency: extracted?.extractedCurrency,
                merchantName: extracted?.merchantName,
                receiptAgeDays: extracted?.receiptAgeDays,
                extractionStatus: extracted?.extractionStatus,
                extractionError: extracted?.extractionError,
                extractionConfidence: extracted?.extractionConfidence,
            };
        });

        claim.receiptAnalysis = analysis.receiptAnalysis as any;

        // Clean out stale OCR error flags and re-apply valid ones
        const ocrFlags = [
            'ReceiptTotalExceedsQuota',
            'ReceiptTotalExceedsRequested',
            'ReceiptOlderThan45Days',
            'ReceiptDateMismatch',
            'ReceiptExtractionFailed',
            'ReceiptDateUnreadable'
        ];
        const currentFlags = (claim.eligibility && Array.isArray((claim.eligibility as any).flags))
            ? (claim.eligibility as any).flags
            : [];
        const existingFlags = currentFlags.filter((f: string) => !ocrFlags.includes(f));
        for (const f of analysis.flags) {
            if (!existingFlags.includes(f)) existingFlags.push(f);
        }
        (claim as any).eligibility = {
            ...((claim as any).eligibility || {}),
            eligible: existingFlags.length === 0,
            flags: existingFlags,
        };

        await claim.save();
        await claim.populate('employeeDetails', 'firstName middleName lastName employeeId');
        res.json({ success: true, data: sanitizeClaimForJson(claim), message: 'Receipts re-scanned successfully' });
    } catch (err) {
        next(err);
    }
});

// ── Localized Commenting on Claim ──────────────────────────────────────────
router.post('/:id/comments', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const userId = authReq.user?.userId;
        const role = authReq.user?.role || 'employee';
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const { message } = req.body || {};
        if (!message || !String(message).trim()) {
            return res.status(400).json({ message: 'Comment message is required' });
        }

        const claim = await ExpenseClaim.findById(req.params.id);
        if (!claim) return res.status(404).json({ message: 'Claim not found' });

        const isOwner = String(claim.employeeUserId) === String(userId);
        if (!isOwner && !isAdminLike(role) && role !== 'manager') {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const userDoc = await User.findById(userId).select('firstName lastName role').lean() as any;
        const authorName = userDoc ? `${userDoc.firstName || ''} ${userDoc.lastName || ''}`.trim() || userDoc.role || 'User' : 'User';

        claim.comments = claim.comments || [];
        claim.comments.push({
            authorUserId: new mongoose.Types.ObjectId(String(userId)),
            authorName,
            authorRole: role,
            message: String(message).trim(),
            createdAt: new Date(),
            isActionRequest: false
        } as any);

        (claim as any).audit = (claim as any).audit || {};
        (claim as any).audit.lastUpdatedAt = new Date();
        (claim as any).audit.lastUpdatedByUserId = new mongoose.Types.ObjectId(String(userId));

        await claim.save();
        await claim.populate('employeeDetails', 'firstName middleName lastName employeeId');
        res.json({ success: true, data: sanitizeClaimForJson(claim) });
    } catch (err) {
        next(err);
    }
});

// ── Request Amendment / Send Back to Employee ─────────────────────────────
router.patch('/:id/request-amendment', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const userId = authReq.user?.userId;
        const role = authReq.user?.role || 'employee';
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });
        if (!isAdminLike(role) && role !== 'manager') return res.status(403).json({ message: 'Forbidden' });

        const { comments } = req.body || {};
        if (!comments || !String(comments).trim()) {
            return res.status(400).json({ message: 'Please provide instructions / remarks for the employee amendment' });
        }

        const claim = await ExpenseClaim.findById(req.params.id);
        if (!claim) return res.status(404).json({ message: 'Claim not found' });
        if (isFinalStatus(claim.status)) return res.status(400).json({ message: 'Cannot amend a finalized claim' });

        const userDoc = await User.findById(userId).select('firstName lastName role').lean() as any;
        const authorName = userDoc ? `${userDoc.firstName || ''} ${userDoc.lastName || ''}`.trim() || userDoc.role || 'Reviewer' : 'Reviewer';

        claim.status = 'Action Required';

        // Update pending approval status
        if (Array.isArray(claim.approvals)) {
            const pendingAppr = claim.approvals.find((a: any) => a.status === 'Pending');
            if (pendingAppr) {
                pendingAppr.status = 'Action Required' as any;
                pendingAppr.comments = String(comments).trim();
                pendingAppr.decidedAt = new Date();
                pendingAppr.decidedByUserId = new mongoose.Types.ObjectId(String(userId));
            }
        }

        claim.comments = claim.comments || [];
        claim.comments.push({
            authorUserId: new mongoose.Types.ObjectId(String(userId)),
            authorName,
            authorRole: role,
            message: String(comments).trim(),
            createdAt: new Date(),
            isActionRequest: true
        } as any);

        (claim as any).audit = (claim as any).audit || {};
        (claim as any).audit.lastUpdatedAt = new Date();
        (claim as any).audit.lastUpdatedByUserId = new mongoose.Types.ObjectId(String(userId));

        await claim.save();

        // Send email alert to employee
        (async () => {
            try {
                const emp = await Employee.findOne({
                    $or: [
                        { userId: claim.employeeUserId },
                        { employeeId: claim.employeeId }
                    ]
                }).select('workEmail personalEmail firstName lastName');
                
                let employeeEmail = emp?.workEmail || emp?.personalEmail;
                if (!employeeEmail && claim.employeeUserId) {
                    const u = await User.findById(claim.employeeUserId).select('email').lean() as any;
                    employeeEmail = u?.email;
                }

                if (employeeEmail) {
                    await sendExpenseClaimActionRequiredEmail(
                        employeeEmail,
                        emp ? `${emp.firstName || ''} ${emp.lastName || ''}`.trim() : 'Employee',
                        claim.claimNo || 'Expense Claim',
                        claim.category,
                        claim.amountRequested,
                        String(comments).trim(),
                        req.headers.origin as string
                    );
                }
            } catch (emailErr) {
                console.error('[Expense Email] Failed to send action required email to employee:', emailErr);
            }
        })();

        await claim.populate('employeeDetails', 'firstName middleName lastName employeeId');
        res.json({ success: true, data: sanitizeClaimForJson(claim), message: 'Claim sent back for amendment' });
    } catch (err) {
        next(err);
    }
});

// ── Employee Amend & Resubmit ─────────────────────────────────────────────
router.patch('/:id/amend', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const userId = authReq.user?.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const claim = await ExpenseClaim.findById(req.params.id);
        if (!claim) return res.status(404).json({ message: 'Claim not found' });

        const isOwner = String(claim.employeeUserId) === String(userId);
        if (!isOwner) return res.status(403).json({ message: 'Forbidden' });

        if (claim.status !== 'Action Required' && claim.status !== 'Draft') {
            return res.status(400).json({ message: 'Only claims with status "Action Required" or "Draft" can be amended' });
        }

        const { amountRequested, notes, receipts, replyComment, expenseDate, forWhom, dependentId } = req.body || {};

        if (typeof amountRequested === 'number' && amountRequested > 0) {
            claim.amountRequested = amountRequested;
        }

        if (typeof notes === 'string') {
            claim.notes = notes;
        }

        if (expenseDate) {
            claim.expenseDate = new Date(expenseDate);
        }

        if (forWhom && ['Self', 'Dependent'].includes(forWhom)) {
            claim.forWhom = forWhom;
            if (forWhom === 'Dependent' && dependentId) {
                const emp = await Employee.findOne({ userId }).lean() as any;
                const deps = Array.isArray(emp?.dependents) ? emp.dependents : [];
                const match = deps.find((d: any) => String(d._id) === String(dependentId));
                if (match) {
                    claim.dependentId = String(dependentId);
                    claim.dependentName = match.name;
                }
            } else if (forWhom === 'Self') {
                claim.dependentId = undefined;
                claim.dependentName = undefined;
            }
        }

        // Decode & process receipts if provided
        let finalReceipts: any[] = ((claim.receipts as any) || []);
        if (receipts && Array.isArray(receipts)) {
            const decodedReceipts = decodeReceipts(receipts as ReceiptInput[]);
            if (decodedReceipts.length > 0) {
                const analysis = await extractAndAnalyzeReceipts(
                    decodedReceipts.map((r: any) => ({
                        fileName: r.fileName,
                        contentType: r.contentType,
                        fileData: r.fileData,
                    })),
                    claim.amountRequested,
                    claim.amountAllowed,
                    claim.expenseDate ? new Date(claim.expenseDate) : null
                );

                finalReceipts = analysis.receipts.map((r, i) => ({
                    ...decodedReceipts[i],
                    extractedDate: r.extractedDate,
                    extractedAmount: r.extractedAmount,
                    extractedCurrency: r.extractedCurrency,
                    merchantName: r.merchantName,
                    receiptAgeDays: r.receiptAgeDays,
                    extractionStatus: r.extractionStatus,
                    extractionError: r.extractionError,
                    extractionConfidence: r.extractionConfidence,
                }));
                claim.receiptAnalysis = analysis.receiptAnalysis as any;

                const ocrFlags = [
                    'ReceiptTotalExceedsQuota',
                    'ReceiptTotalExceedsRequested',
                    'ReceiptOlderThan45Days',
                    'ReceiptDateMismatch',
                    'ReceiptExtractionFailed',
                    'ReceiptDateUnreadable'
                ];
                const currentFlags = (claim.eligibility && Array.isArray((claim.eligibility as any).flags))
                    ? (claim.eligibility as any).flags
                    : [];
                const existingFlags = currentFlags.filter((f: string) => !ocrFlags.includes(f));
                for (const f of analysis.flags) {
                    if (!existingFlags.includes(f)) existingFlags.push(f);
                }
                (claim as any).eligibility = {
                    ...((claim as any).eligibility || {}),
                    eligible: existingFlags.length === 0,
                    flags: existingFlags,
                };
            }
        }
        claim.receipts = finalReceipts as any;

        // Recalculate limits & policy flags
        const { amountAllowed, outOfPolicy } = await resolveClaimLimits(claim.category, String(userId), claim.amountRequested, String(claim._id));
        claim.amountAllowed = amountAllowed;
        if (!claim.eligibility) {
            (claim as any).eligibility = { eligible: true, flags: [] };
        }
        const claimEligibility = claim.eligibility as any;
        if (outOfPolicy && !claimEligibility.flags.includes('OutOfPolicy')) {
            claimEligibility.flags.push('OutOfPolicy');
        } else if (!outOfPolicy) {
            claimEligibility.flags = claimEligibility.flags.filter((f: string) => f !== 'OutOfPolicy');
        }
        claimEligibility.eligible = claimEligibility.flags.length === 0;

        // Add reply comment
        const userDoc = await User.findById(userId).select('firstName lastName role').lean() as any;
        const authorName = userDoc ? `${userDoc.firstName || ''} ${userDoc.lastName || ''}`.trim() || 'Employee' : 'Employee';

        if (replyComment && String(replyComment).trim()) {
            claim.comments = claim.comments || [];
            claim.comments.push({
                authorUserId: new mongoose.Types.ObjectId(String(userId)),
                authorName,
                authorRole: 'employee',
                message: String(replyComment).trim(),
                createdAt: new Date(),
                isActionRequest: false
            } as any);
        }

        // Reset approval workflow back to Pending HR
        const workflow = buildWorkflow(claim.category);
        claim.approvals = workflow.map(stage => ({
            stage,
            status: 'Pending' as any,
            amountAllowed: claim.amountAllowed,
            requiresAuthorization: stage === 'hr' && outOfPolicy,
        })) as any;

        claim.status = stageToStatus(workflow[0]) as any;

        (claim as any).audit = (claim as any).audit || {};
        (claim as any).audit.lastUpdatedAt = new Date();
        (claim as any).audit.lastUpdatedByUserId = new mongoose.Types.ObjectId(String(userId));

        await claim.save();

        // Notify HR of resubmission
        (async () => {
            try {
                const hrEmailsList = await getHrEmails();
                const emp = await Employee.findOne({ userId }).select('firstName lastName employeeId').lean() as any;
                const empName = emp ? formatEmployeeFullName(emp, emp.employeeId) : authorName;
                for (const to of hrEmailsList) {
                    await sendExpenseClaimAmendedEmail(
                        to,
                        empName,
                        claim.claimNo || 'Expense Claim',
                        claim.category,
                        claim.amountRequested,
                        replyComment ? String(replyComment).trim() : undefined,
                        req.headers.origin as string
                    );
                }
            } catch (emailErr) {
                console.error('[Expense Email] Failed to send resubmitted email to HR:', emailErr);
            }
        })();

        await claim.populate('employeeDetails', 'firstName middleName lastName employeeId');
        res.json({ success: true, data: sanitizeClaimForJson(claim), message: 'Claim amended and resubmitted successfully' });
    } catch (err) {
        next(err);
    }
});

// ── Company-wide Medical Records Roster (HR / Admin / Finance) ────────────
router.get('/medical-records', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const role = authReq.user?.role || 'employee';
        if (!['super-admin', 'admin', 'hr'].includes(role)) return res.status(403).json({ message: 'Forbidden' });

        const currentYear = new Date().getFullYear();
        const startOfYear = new Date(currentYear, 0, 1);
        const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999);

        const employees = await Employee.find({ 'employmentStatus.status': { $nin: ['Terminated', 'Resigned'] } })
            .select('employeeId firstName middleName lastName jobInfo medicalBenefit userId email phone')
            .lean() as any[];

        const medicalCat = await ExpenseCategory.findOne({ name: 'Medical' }).lean() as any;
        const defaultAnnualLimit = medicalCat?.policyLimit || 60000;

        // Fetch all Medical claims in current year
        const allMedicalClaims = await ExpenseClaim.find({
            category: 'Medical',
            status: { $nin: ['Draft', 'Declined'] },
            createdAt: { $gte: startOfYear, $lte: endOfYear }
        }).select('employeeId employeeUserId amountRequested amountAllowed approvedTotal status createdAt subCategories forWhom dependentName')
        .lean() as any[];

        const records = employees.map(emp => {
            const empUserIdStr = emp.userId ? String(emp.userId) : '';
            const empIdStr = emp.employeeId ? String(emp.employeeId) : '';

            const empClaims = allMedicalClaims.filter(c =>
                (empUserIdStr && String(c.employeeUserId) === empUserIdStr) ||
                (empIdStr && String(c.employeeId) === empIdStr)
            );

            let baseLimit = emp.medicalBenefit?.customAnnualLimit && emp.medicalBenefit.customAnnualLimit > 0
                ? emp.medicalBenefit.customAnnualLimit
                : defaultAnnualLimit;

            let isMidYearJoiner = false;
            let activeMonths = 12;
            if (emp.jobInfo?.joiningDate) {
                const jd = new Date(emp.jobInfo.joiningDate);
                if (jd.getFullYear() === currentYear) {
                    isMidYearJoiner = true;
                    activeMonths = 12 - jd.getMonth();
                    baseLimit = Math.round((activeMonths / 12) * baseLimit);
                }
            }

            const openingUtilized = emp.medicalBenefit?.openingBalanceUtilized || 0;

            const approvedClaims = empClaims.filter(c => c.status === 'Approved');
            const pendingClaims = empClaims.filter(c => c.status !== 'Approved');

            const ytdApproved = approvedClaims.reduce((sum, c) => {
                const amt = typeof c.approvedTotal === 'number' ? c.approvedTotal : c.amountAllowed;
                return sum + amt;
            }, 0);

            const ytdPending = pendingClaims.reduce((sum, c) => sum + (c.amountRequested || 0), 0);

            const totalUtilized = openingUtilized + ytdApproved;
            const remainingBalance = Math.max(0, baseLimit - totalUtilized);
            const utilizationPct = baseLimit > 0 ? Math.min(100, Math.round((totalUtilized / baseLimit) * 100)) : 0;

            return {
                employeeId: emp.employeeId,
                name: formatEmployeeFullName(emp, emp.employeeId),
                department: emp.jobInfo?.department || '—',
                designation: emp.jobInfo?.designation || '—',
                joiningDate: emp.jobInfo?.joiningDate || null,
                isMidYearJoiner,
                activeMonths,
                annualLimit: baseLimit,
                customLimitSet: !!(emp.medicalBenefit?.customAnnualLimit && emp.medicalBenefit.customAnnualLimit > 0),
                openingBalanceUtilized: openingUtilized,
                ytdApproved,
                ytdPending,
                totalUtilized,
                remainingBalance,
                utilizationPct,
                isMaxedOut: remainingBalance <= 0,
                claimCount: empClaims.length,
                notes: emp.medicalBenefit?.notes || ''
            };
        });

        const totalAllocated = records.reduce((s, r) => s + r.annualLimit, 0);
        const totalUtilized = records.reduce((s, r) => s + r.totalUtilized, 0);
        const totalMaxedOut = records.filter(r => r.isMaxedOut).length;

        res.json({
            success: true,
            data: {
                records,
                summary: {
                    totalEmployees: records.length,
                    totalAllocated,
                    totalUtilized,
                    totalRemaining: Math.max(0, totalAllocated - totalUtilized),
                    totalMaxedOut
                }
            }
        });
    } catch (err) {
        next(err);
    }
});

// ── Individual Employee Medical Ledger & History ──────────────────────────
router.get('/medical-records/:employeeId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const userId = authReq.user?.userId;
        const role = authReq.user?.role || 'employee';
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const emp = await Employee.findOne({
            $or: [
                { employeeId: req.params.employeeId },
                { _id: mongoose.isValidObjectId(req.params.employeeId) ? req.params.employeeId : undefined }
            ]
        }).select('employeeId firstName middleName lastName jobInfo medicalBenefit userId dependents').lean() as any;

        if (!emp) return res.status(404).json({ message: 'Employee not found' });

        const isSelf = String(emp.userId) === String(userId);
        if (!isSelf && !['super-admin', 'admin', 'hr'].includes(role)) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const currentYear = new Date().getFullYear();
        const startOfYear = new Date(currentYear, 0, 1);
        const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999);

        const medicalCat = await ExpenseCategory.findOne({ name: 'Medical' }).lean() as any;
        const defaultAnnualLimit = medicalCat?.policyLimit || 60000;

        let baseLimit = emp.medicalBenefit?.customAnnualLimit && emp.medicalBenefit.customAnnualLimit > 0
            ? emp.medicalBenefit.customAnnualLimit
            : defaultAnnualLimit;

        let isMidYearJoiner = false;
        let activeMonths = 12;
        if (emp.jobInfo?.joiningDate) {
            const jd = new Date(emp.jobInfo.joiningDate);
            if (jd.getFullYear() === currentYear) {
                isMidYearJoiner = true;
                activeMonths = 12 - jd.getMonth();
                baseLimit = Math.round((activeMonths / 12) * baseLimit);
            }
        }

        const claims = await ExpenseClaim.find({
            $or: [
                { employeeId: emp.employeeId },
                { employeeUserId: emp.userId }
            ],
            category: 'Medical',
            createdAt: { $gte: startOfYear, $lte: endOfYear }
        })
        .select('-receipts.fileData')
        .sort({ createdAt: -1 })
        .lean() as any[];

        const openingUtilized = emp.medicalBenefit?.openingBalanceUtilized || 0;
        const approvedClaims = claims.filter(c => c.status === 'Approved');
        const pendingClaims = claims.filter(c => c.status !== 'Approved' && c.status !== 'Declined' && c.status !== 'Draft');

        const ytdApproved = approvedClaims.reduce((sum, c) => {
            const amt = typeof c.approvedTotal === 'number' ? c.approvedTotal : c.amountAllowed;
            return sum + amt;
        }, 0);

        const ytdPending = pendingClaims.reduce((sum, c) => sum + (c.amountRequested || 0), 0);
        const totalUtilized = openingUtilized + ytdApproved;
        const remainingBalance = Math.max(0, baseLimit - totalUtilized);

        // Group by subcategory
        const subcategoryBreakdown: Record<string, number> = {
            'Consultation': 0,
            'Pharmacy / Medicines': 0,
            'Lab Test / Diagnostics': 0,
            'Hospitalization': 0,
            'Dental Treatment': 0,
            'Optical / Glasses': 0,
            'Other Medical': 0
        };

        for (const c of approvedClaims) {
            const amt = typeof c.approvedTotal === 'number' ? c.approvedTotal : c.amountAllowed;
            const sub = (c.subCategories && c.subCategories[0]) || 'Other Medical';
            subcategoryBreakdown[sub] = (subcategoryBreakdown[sub] || 0) + amt;
        }

        res.json({
            success: true,
            data: {
                employee: {
                    employeeId: emp.employeeId,
                    name: formatEmployeeFullName(emp, emp.employeeId),
                    department: emp.jobInfo?.department,
                    designation: emp.jobInfo?.designation,
                    joiningDate: emp.jobInfo?.joiningDate,
                    isMidYearJoiner,
                    activeMonths,
                    medicalBenefit: emp.medicalBenefit || {},
                    dependents: emp.dependents || []
                },
                summary: {
                    annualLimit: baseLimit,
                    openingBalanceUtilized: openingUtilized,
                    ytdApproved,
                    ytdPending,
                    totalUtilized,
                    remainingBalance,
                    isMaxedOut: remainingBalance <= 0,
                    utilizationPct: baseLimit > 0 ? Math.min(100, Math.round((totalUtilized / baseLimit) * 100)) : 0
                },
                subcategoryBreakdown,
                claims
            }
        });
    } catch (err) {
        next(err);
    }
});

// ── Adjust Custom Annual Limit or Opening Balance (HR / Admin) ───────────
router.patch('/medical-records/:employeeId/adjust', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const role = authReq.user?.role || 'employee';
        const userId = authReq.user?.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });
        if (!isAdminLike(role)) return res.status(403).json({ message: 'Forbidden' });

        const { customAnnualLimit, openingBalanceUtilized, notes } = req.body || {};

        const emp = await Employee.findOne({
            $or: [
                { employeeId: req.params.employeeId },
                { _id: mongoose.isValidObjectId(req.params.employeeId) ? req.params.employeeId : undefined }
            ]
        });

        if (!emp) return res.status(404).json({ message: 'Employee not found' });

        emp.medicalBenefit = emp.medicalBenefit || {};
        if (customAnnualLimit !== undefined) {
            emp.medicalBenefit.customAnnualLimit = customAnnualLimit === '' || customAnnualLimit === null ? undefined : Number(customAnnualLimit);
        }
        if (openingBalanceUtilized !== undefined) {
            emp.medicalBenefit.openingBalanceUtilized = openingBalanceUtilized === '' || openingBalanceUtilized === null ? 0 : Number(openingBalanceUtilized);
        }
        if (typeof notes === 'string') {
            emp.medicalBenefit.notes = notes.trim();
        }

        await emp.save();
        res.json({ success: true, data: emp.medicalBenefit, message: 'Medical benefit adjusted successfully' });
    } catch (err) {
        next(err);
    }
});

// ── Mark Expense Claim as Paid / Unpaid (Finance & Admin) ─────────────────
router.patch('/:id/payout-status', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const role = authReq.user?.role || 'employee';
        if (!['super-admin', 'admin', 'finance'].includes(role)) {
            return res.status(403).json({ message: 'Forbidden. Finance or Admin access required.' });
        }

        const { payoutStatus, erpReferenceId, paidAt, remarks } = req.body;
        if (!['Paid', 'Unpaid', 'Included in Payroll'].includes(payoutStatus)) {
            return res.status(400).json({ message: 'Invalid payoutStatus' });
        }

        const claim = await ExpenseClaim.findById(req.params.id);
        if (!claim) {
            return res.status(404).json({ message: 'Claim not found' });
        }

        claim.payoutStatus = payoutStatus;
        if (payoutStatus === 'Paid') {
            claim.paidAt = paidAt ? new Date(paidAt) : new Date();
            if (erpReferenceId) claim.erpReferenceId = erpReferenceId.trim();
        } else if (payoutStatus === 'Unpaid') {
            claim.paidAt = undefined;
        }

        if (remarks) {
            claim.comments = claim.comments || [];
            claim.comments.push({
                userId: authReq.user?.userId,
                userName: authReq.user?.email || 'Finance',
                role: role,
                comment: `[Payment Status: ${payoutStatus}] ${remarks.trim()}`,
                createdAt: new Date()
            });
        }

        await claim.save();
        res.json({ success: true, message: `Claim payout status updated to ${payoutStatus}`, claim });
    } catch (err) {
        next(err);
    }
});

export default router;

