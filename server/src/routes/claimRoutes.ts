import express, { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import ExpenseClaim, { type ExpenseClaimApprovalStage } from '../models/ExpenseClaim';
import ExpenseCategory from '../models/ExpenseCategory';
import Employee from '../models/Employee';
import Counter from '../models/Counter';
import { authenticate, AuthRequest } from '../middleware/auth';
import { sendHRNotificationEmail, sendExpenseClaimSubmittedEmail, sendExpenseClaimStatusEmail } from '../utils/email';
import { extractAndAnalyzeReceipts } from '../services/receiptExtraction';

const router = express.Router();

type ReceiptInput = { fileName: string; contentType?: string; base64: string };

const MAX_RECEIPTS = 5;
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024; // 5MB each

const HR_EMAILS = (process.env.EXPENSE_HR_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean);
const FINANCE_EMAILS = (process.env.EXPENSE_FINANCE_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean);

function sanitizeClaimForJson(doc: any) {
    const obj = doc?.toObject ? (doc.toObject() as any) : (doc as any);
    if (Array.isArray(obj?.receipts)) {
        obj.receipts = obj.receipts.map((r: any) => ({ ...r, fileData: undefined }));
    }
    return obj;
}

function buildWorkflow(category: string): ExpenseClaimApprovalStage[] {
    if (category === 'Medical') return ['hr', 'finance'];
    if (category === 'Training & Certification') return ['teamLead', 'hr', 'finance'];
    if (category === 'Travel') return ['lineManager', 'hr', 'finance'];
    if (category === 'Sales/Customer Gifts') return ['lineManager', 'hr', 'finance'];
    return ['lineManager', 'hr', 'finance'];
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
    const counter = await Counter.findOneAndUpdate(
        { key: `claimNo_${year}` },
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
    );
    return `EC-${year}-${String(counter.seq).padStart(4, '0')}`;
}

function roleCanActOnStage(role: string, stage: ExpenseClaimApprovalStage): boolean {
    if (stage === 'teamLead' || stage === 'lineManager') return role === 'manager' || role === 'admin' || role === 'super-admin';
    if (stage === 'hr') return role === 'admin' || role === 'super-admin' || role === 'hr';
    return role === 'super-admin' || role === 'admin' || role === 'hr';
}

function isAdminLike(role: string) {
    return role === 'super-admin' || role === 'admin' || role === 'hr';
}

function isFinalStatus(status?: string) {
    return status === 'Approved' || status === 'Declined';
}

async function resolveClaimLimits(
    category: string,
    submitterUserId: string,
    amountRequested: number
): Promise<{ catDoc: any; amountAllowed: number; limit: number; outOfPolicy: boolean }> {
    const catDoc = await ExpenseCategory.findOne({ name: category });
    if (!catDoc) throw Object.assign(new Error('Invalid category'), { status: 400 });

    let limit = catDoc.policyLimit && catDoc.policyLimit > 0 ? catDoc.policyLimit : 9999999;

    if (catDoc.policyLimit && catDoc.policyLimit > 0) {
        const currentYear = new Date().getFullYear();
        const startOfYear = new Date(currentYear, 0, 1);
        const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999);
        const existingClaims = await ExpenseClaim.find({
            employeeUserId: new mongoose.Types.ObjectId(String(submitterUserId)),
            category,
            status: { $nin: ['Draft', 'Declined'] },
            createdAt: { $gte: startOfYear, $lte: endOfYear },
        }).lean() as any[];

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
        const reportingManagerId = employee?.jobInfo?.reportingManager ? String(employee.jobInfo.reportingManager) : '';
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
        const employeeName = `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || employee.employeeId;
        const actionDesc = `submitted expense claim ${doc.claimNo} (${doc.category})`;
        const notify = async (emails: string[]) => {
            for (const to of emails) {
                try {
                    await sendHRNotificationEmail(to, employeeName, actionDesc);
                } catch (e) {
                    // ignore
                }
            }
        };
        if (doc.status === 'Pending HR') void notify(HR_EMAILS);
        if (doc.status === 'Pending Finance') void notify(FINANCE_EMAILS);
        if (doc.status === 'Pending Team Lead' || doc.status === 'Pending Line Manager') {
            (async () => {
                try {
                    if (reportingManagerId) {
                        const manager = await Employee.findOne({ employeeId: reportingManagerId });
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

        await doc.populate('employeeDetails', 'firstName lastName employeeId');
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
            .populate('employeeDetails', 'firstName lastName employeeId')
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
        if (!role || role === 'employee') return res.json({ success: true, data: [] });

        let claims: any[] = [];

        if (role === 'manager') {
            // Restrict to claims assigned to THIS manager via PIM reportingManager hierarchy
            const managerEmployee = await Employee.findOne({ userId }).select('employeeId').lean() as any;
            const managerEmployeeId = managerEmployee?.employeeId ? String(managerEmployee.employeeId) : '';
            if (!managerEmployeeId) return res.json({ success: true, data: [] });

            claims = await ExpenseClaim.find({
                approvals: {
                    $elemMatch: {
                        status: 'Pending',
                        stage: { $in: ['teamLead', 'lineManager'] },
                        assignedToEmployeeId: managerEmployeeId,
                    }
                }
            })
                .select('-receipts.fileData')
                .sort({ createdAt: -1 })
                .populate('employeeDetails', 'firstName lastName employeeId')
                .lean();
        } else {
            claims = await ExpenseClaim.find({
                status: { $nin: ['Draft', 'Approved', 'Declined'] },
            })
                .select('-receipts.fileData')
                .sort({ createdAt: -1 })
                .populate('employeeDetails', 'firstName lastName employeeId')
                .lean();
        }

        res.json({ success: true, data: claims });
    } catch (err) {
        next(err);
    }
});

router.get('/all', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    try {
        const role = authReq.user?.role || 'employee';
        if (!isAdminLike(role)) return res.status(403).json({ message: 'Forbidden' });

        const claims = await ExpenseClaim.find({})
            .select('-receipts.fileData')
            .sort({ createdAt: -1 })
            .populate('employeeDetails', 'firstName lastName employeeId')
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
                    if (!managerEmployeeId || String(pending.assignedToEmployeeId || '') !== managerEmployeeId) {
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

                pending.status = decision;
                pending.comments = comments;
                pending.decidedAt = new Date();
                pending.decidedByUserId = new mongoose.Types.ObjectId(String(userId));

                if (decision === 'Declined') {
                    claim.status = 'Declined';
                    claim.approvedTotal = 0;
                } else if (isAdminLike(role)) {
                    claim.approvals.forEach((approval: any, approvalIdx: number) => {
                        if (approvalIdx > idx && approval.status === 'Pending') {
                            approval.status = 'Approved';
                            approval.decidedAt = new Date();
                            approval.decidedByUserId = new mongoose.Types.ObjectId(String(userId));
                            if (typeof approval.approvedAmount !== 'number') {
                                approval.approvedAmount = pending.approvedAmount ?? claim.amountAllowed;
                            }
                        }
                    });
                    claim.status = 'Approved';
                    claim.approvedTotal = typeof pending.approvedAmount === 'number' ? pending.approvedAmount : claim.amountAllowed;
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
                                emp ? `${emp.firstName} ${emp.lastName}` : 'Employee',
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

                if (claim.status === 'Pending HR' && HR_EMAILS.length) {
                    const employee = await Employee.findOne({ employeeId: claim.employeeId }).lean() as any;
                    const employeeName = employee ? `${employee.firstName || ''} ${employee.lastName || ''}`.trim() : claim.employeeId;
                    for (const to of HR_EMAILS) void sendHRNotificationEmail(to, employeeName, `expense claim ${claim.claimNo} is pending HR review`);
                }
                if (claim.status === 'Pending Finance' && FINANCE_EMAILS.length) {
                    const employee = await Employee.findOne({ employeeId: claim.employeeId }).lean() as any;
                    const employeeName = employee ? `${employee.firstName || ''} ${employee.lastName || ''}`.trim() : claim.employeeId;
                    for (const to of FINANCE_EMAILS) void sendHRNotificationEmail(to, employeeName, `expense claim ${claim.claimNo} is pending finance review`);
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

        const idx = claim.approvals.findIndex((a: any) => a.status === 'Pending');
        const pending = claim.approvals[idx] as any;

        if (role === 'manager' && (currentStage === 'teamLead' || currentStage === 'lineManager')) {
            const managerEmployee = await Employee.findOne({ userId }).select('employeeId').lean() as any;
            const managerEmployeeId = managerEmployee?.employeeId ? String(managerEmployee.employeeId) : '';
            if (!managerEmployeeId || String(pending.assignedToEmployeeId || '') !== managerEmployeeId) {
                return res.status(403).json({ message: 'This claim is not assigned to you' });
            }
        }

        // Partial approvals (primarily HR): allow approvedAmount <= amountAllowed
        if (decision === 'Approved') {
            const allowed = typeof pending.amountAllowed === 'number' ? pending.amountAllowed : claim.amountAllowed;
            const requested = claim.amountRequested;
            const proposed = typeof approvedAmount === 'number' ? approvedAmount : Math.min(requested, allowed);
            if (proposed < 0) return res.status(400).json({ message: 'approvedAmount must be >= 0' });
            if (proposed > requested) return res.status(400).json({ message: 'approvedAmount cannot exceed amountRequested' });
            pending.approvedAmount = proposed;
            pending.amountAllowed = allowed;
            if (pending.requiresAuthorization && !authorizationBy) {
                return res.status(400).json({ message: 'authorizationBy is required for out-of-policy approvals' });
            }
            pending.authorizationBy = authorizationBy;
        }

        pending.status = decision;
        pending.comments = comments;
        pending.decidedAt = new Date();
        pending.decidedByUserId = new mongoose.Types.ObjectId(String(userId));

        if (erpReferenceId !== undefined) {
            claim.erpReferenceId = erpReferenceId;
        }

        // Terminal decision
        if (decision === 'Declined') {
            claim.status = 'Declined';
            claim.approvedTotal = 0;
        } else if (isAdminLike(role)) {
            // Admin/HR can finalize directly from any queue.
            claim.approvals.forEach((approval: any, approvalIdx: number) => {
                if (approvalIdx > idx && approval.status === 'Pending') {
                    approval.status = 'Approved';
                    approval.decidedAt = new Date();
                    approval.decidedByUserId = new mongoose.Types.ObjectId(String(userId));
                    if (typeof approval.approvedAmount !== 'number') {
                        approval.approvedAmount = pending.approvedAmount ?? claim.amountAllowed;
                    }
                }
            });
            claim.status = 'Approved';
            claim.approvedTotal = typeof pending.approvedAmount === 'number' ? pending.approvedAmount : claim.amountAllowed;
        } else {
            // Move to next stage or approve
            const nextPending = claim.approvals.find((a: any) => a.status === 'Pending');
            if (nextPending) {
                claim.status = stageToStatus(nextPending.stage) as any;
            } else {
                claim.status = 'Approved';
                // approvedTotal = last non-null approvedAmount, fallback to amountAllowed
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
                        emp ? `${emp.firstName} ${emp.lastName}` : 'Employee',
                        claim.category,
                        claim.amountRequested,
                        claim.status,
                        claim.approvedTotal ?? undefined,
                        comments || pending.comments,
                        req.headers.origin as string
                    );
                }
            } catch (emailErr) {
                console.error('[Expense Email] Failed to send status email to employee:', emailErr);
            }
        })();

        // Notify HR/Finance when entering their queues
        if (claim.status === 'Pending HR' && HR_EMAILS.length) {
            const employee = await Employee.findOne({ employeeId: claim.employeeId }).lean() as any;
            const employeeName = employee ? `${employee.firstName || ''} ${employee.lastName || ''}`.trim() : claim.employeeId;
            for (const to of HR_EMAILS) void sendHRNotificationEmail(to, employeeName, `expense claim ${claim.claimNo} is pending HR review`);
        }
        if (claim.status === 'Pending Finance' && FINANCE_EMAILS.length) {
            const employee = await Employee.findOne({ employeeId: claim.employeeId }).lean() as any;
            const employeeName = employee ? `${employee.firstName || ''} ${employee.lastName || ''}`.trim() : claim.employeeId;
            for (const to of FINANCE_EMAILS) void sendHRNotificationEmail(to, employeeName, `expense claim ${claim.claimNo} is pending finance review`);
        }

        await claim.populate('employeeDetails', 'firstName lastName employeeId');
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
                        emp ? `${emp.firstName} ${emp.lastName}` : 'Employee',
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

        await claim.populate('employeeDetails', 'firstName lastName employeeId');
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

export default router;

