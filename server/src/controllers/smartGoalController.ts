import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { SmartGoal, CompanyTarget, ISmartGoal } from '../models/SmartGoal';
import Employee from '../models/Employee';
import { AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';
import { performAiGoalReview } from '../services/aiGoalReviewService';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function resolveCurrentEmployee(userId?: string) {
    if (!userId) return null;
    return Employee.findOne({
        $or: [
            { userId },
            { employeeId: userId },
            { _id: mongoose.isValidObjectId(userId) ? userId : undefined },
        ].filter(Boolean),
        isDeleted: { $ne: true },
    });
}

function isHrOrAdmin(role?: string): boolean {
    const r = (role || '').toLowerCase().trim();
    return ['super-admin', 'admin', 'hr'].includes(r);
}

// ─── Company Targets (Pre-defined Anchors) ───────────────────────────────────

export async function getCompanyTargets(req: Request, res: Response) {
    try {
        const year = Number(req.query.year) || new Date().getFullYear();
        let targets = await CompanyTarget.find({ year, isActive: true }).sort({ createdAt: -1 }).lean();

        // Auto-seed standard organization anchors if none exist yet for the year
        if (targets.length === 0) {
            const defaults = [
                {
                    title: 'PKR 2 Billion Total Sales & Revenue Target',
                    description: 'Achieve corporate annual revenue target of PKR 2 Billion across enterprise services and product deliveries.',
                    category: 'SALES',
                    targetMetric: 'Revenue',
                    targetValue: 'PKR 2,000,000,000',
                    year,
                    isActive: true,
                    createdBy: 'System Seed',
                },
                {
                    title: '99.9% Infrastructure & Client Uptime (SLA)',
                    description: 'Maintain high availability, zero critical downtime, and sub-100ms response across infrastructure.',
                    category: 'ENGINEERING',
                    targetMetric: 'Availability',
                    targetValue: '99.9%',
                    year,
                    isActive: true,
                    createdBy: 'System Seed',
                },
                {
                    title: 'Customer Satisfaction (CSAT) >= 95%',
                    description: 'Deliver exceptional client service and support turnaround within contractual SLA thresholds.',
                    category: 'CUSTOMER_SUCCESS',
                    targetMetric: 'CSAT Score',
                    targetValue: '95%',
                    year,
                    isActive: true,
                    createdBy: 'System Seed',
                },
                {
                    title: 'Zero High-Severity Security or Compliance Breaches',
                    description: 'Full adherence to ISO/SOC-2 policies, GDPR, and enterprise data confidentiality standards.',
                    category: 'OPERATIONS',
                    targetMetric: 'Audit Score',
                    targetValue: '100%',
                    year,
                    isActive: true,
                    createdBy: 'System Seed',
                },
            ];
            await CompanyTarget.insertMany(defaults);
            targets = (await CompanyTarget.find({ year, isActive: true }).sort({ createdAt: -1 }).lean()) as any[];
        }

        return res.json(targets);
    } catch (error: any) {
        logger.error('[SmartGoalController] Failed to fetch company targets:', error);
        return res.status(500).json({ message: error.message || 'Failed to fetch company targets' });
    }
}

export async function createCompanyTarget(req: Request, res: Response) {
    try {
        const authReq = req as AuthRequest;
        if (!isHrOrAdmin(authReq.user?.role)) {
            return res.status(403).json({ message: 'Access denied. HR/Admin role required.' });
        }

        const { title, description, category, targetMetric, targetValue, year } = req.body;
        if (!title || !title.trim()) {
            return res.status(400).json({ message: 'Company target title is required.' });
        }

        const target = await CompanyTarget.create({
            title: title.trim(),
            description: description?.trim(),
            category: category || 'GENERAL',
            targetMetric,
            targetValue,
            year: Number(year) || new Date().getFullYear(),
            isActive: true,
            createdBy: (authReq.user as any)?.name || authReq.user?.email || 'HR Admin',
        });

        return res.status(201).json({ success: true, target });
    } catch (error: any) {
        logger.error('[SmartGoalController] Failed to create company target:', error);
        return res.status(500).json({ message: error.message || 'Failed to create company target' });
    }
}

export async function updateCompanyTarget(req: Request, res: Response) {
    try {
        const authReq = req as AuthRequest;
        if (!isHrOrAdmin(authReq.user?.role)) {
            return res.status(403).json({ message: 'Access denied. HR/Admin role required.' });
        }

        const { id } = req.params;
        const { title, description, category, targetMetric, targetValue, year, isActive } = req.body;

        const target = await CompanyTarget.findById(id);
        if (!target) return res.status(404).json({ message: 'Company target not found.' });

        if (title !== undefined) target.title = title.trim();
        if (description !== undefined) target.description = description.trim();
        if (category !== undefined) target.category = category;
        if (targetMetric !== undefined) target.targetMetric = targetMetric;
        if (targetValue !== undefined) target.targetValue = targetValue;
        if (year !== undefined) target.year = Number(year);
        if (isActive !== undefined) target.isActive = Boolean(isActive);

        await target.save();

        // Keep existing goals referencing this target updated with the new title
        if (title) {
            await SmartGoal.updateMany(
                { companyTargetId: target._id },
                { companyTargetTitle: target.title }
            );
        }

        return res.json({ success: true, target });
    } catch (error: any) {
        logger.error('[SmartGoalController] Failed to update company target:', error);
        return res.status(500).json({ message: error.message || 'Failed to update company target' });
    }
}

export async function deleteCompanyTarget(req: Request, res: Response) {
    try {
        const authReq = req as AuthRequest;
        if (!isHrOrAdmin(authReq.user?.role)) {
            return res.status(403).json({ message: 'Access denied. HR/Admin role required.' });
        }

        const { id } = req.params;
        const target = await CompanyTarget.findById(id);
        if (!target) return res.status(404).json({ message: 'Company target not found.' });

        await CompanyTarget.findByIdAndDelete(id);

        return res.json({ success: true, message: 'Company target deleted successfully.' });
    } catch (error: any) {
        logger.error('[SmartGoalController] Failed to delete company target:', error);
        return res.status(500).json({ message: error.message || 'Failed to delete company target' });
    }
}

// ─── SMART Goals CRUD & AI Pre-Review ────────────────────────────────────────

export async function getGoals(req: Request, res: Response) {
    try {
        const authReq = req as AuthRequest;
        const { role, userId } = authReq.user || {};
        const isPrivileged = isHrOrAdmin(role);

        const currentEmp = await resolveCurrentEmployee(userId);
        if (!isPrivileged && !currentEmp) {
            return res.status(404).json({ message: 'Employee record not found for logged in user.' });
        }

        const query: any = {};
        if (req.query.cycleYear) query.cycleYear = Number(req.query.cycleYear);
        if (req.query.cycleType) query.cycleType = String(req.query.cycleType);
        if (req.query.status && req.query.status !== 'ALL') query.status = String(req.query.status);

        if (req.query.search) {
            const rawSearch = String(req.query.search).trim();
            const escaped = rawSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const searchRegex = new RegExp(escaped, 'i');
            query.$or = [
                { title: searchRegex },
                { description: searchRegex },
                { employeeName: searchRegex },
                { employeeId: searchRegex },
                { companyTargetTitle: searchRegex },
            ];
        }

        // Scope
        if (!isPrivileged) {
            if (role === 'manager' && currentEmp) {
                const managerIdentifiers = [
                    currentEmp.employeeId,
                    String(currentEmp._id),
                    currentEmp.userId,
                    `${currentEmp.firstName || ''} ${currentEmp.lastName || ''}`.trim(),
                ].filter(Boolean);

                const reportees = await Employee.find({
                    'jobInfo.reportingManager': { $in: managerIdentifiers },
                    isDeleted: { $ne: true },
                }).select('employeeId');

                const allowedEmpIds = [currentEmp.employeeId, ...reportees.map((r: any) => r.employeeId)];
                query.employeeId = { $in: allowedEmpIds };
            } else if (currentEmp) {
                query.employeeId = currentEmp.employeeId;
            }
        }

        const goals = await SmartGoal.find(query).sort({ updatedAt: -1 }).lean();
        return res.json(goals);
    } catch (error: any) {
        logger.error('[SmartGoalController] Failed to fetch goals:', error);
        return res.status(500).json({ message: error.message || 'Failed to fetch goals' });
    }
}

export async function createGoal(req: Request, res: Response) {
    try {
        const authReq = req as AuthRequest;
        const currentEmp = await resolveCurrentEmployee(authReq.user?.userId);
        if (!currentEmp) {
            return res.status(404).json({ message: 'Employee profile not found.' });
        }

        const {
            title,
            description,
            metricType,
            unit,
            baselineValue,
            targetValue,
            companyTargetId,
            targetDate,
            cycleYear,
            cycleType,
        } = req.body;

        if (!title || !title.trim()) return res.status(400).json({ message: 'Goal title is required.' });
        if (!description || !description.trim()) return res.status(400).json({ message: 'Goal description is required.' });
        if (targetValue === undefined || targetValue === null) return res.status(400).json({ message: 'Target value is required.' });
        if (!targetDate) return res.status(400).json({ message: 'Target completion date is required.' });

        let companyTargetTitle = '';
        if (companyTargetId && mongoose.isValidObjectId(companyTargetId)) {
            const ct = await CompanyTarget.findById(companyTargetId).select('title').lean() as any;
            if (ct) companyTargetTitle = ct.title;
        }

        const fullName = `${currentEmp.firstName || ''} ${currentEmp.lastName || ''}`.trim() || currentEmp.employeeId;

        // Run Gemini AI Pre-Review
        const aiReview = await performAiGoalReview({
            title: title.trim(),
            description: description.trim(),
            metricType: metricType || 'PERCENTAGE',
            unit: unit || '%',
            baselineValue: Number(baselineValue) || 0,
            targetValue: Number(targetValue),
            companyTargetTitle,
            targetDate,
            designation: (currentEmp as any).jobInfo?.designation,
            department: (currentEmp as any).jobInfo?.department,
        });

        const submittedAt = new Date();
        const deadline = new Date(submittedAt);
        deadline.setDate(deadline.getDate() + 10); // 10-day HR response SLA

        const status = aiReview.isUnrealistic ? 'RETURNED_FOR_REVISION' : 'PENDING_HR';

        const newGoal = new SmartGoal({
            employee: currentEmp._id,
            employeeId: currentEmp.employeeId,
            employeeName: fullName,
            department: (currentEmp as any).jobInfo?.department || '',
            designation: (currentEmp as any).jobInfo?.designation || '',
            cycleYear: Number(cycleYear) || new Date().getFullYear(),
            cycleType: cycleType || 'ANNUAL',
            title: title.trim(),
            description: description.trim(),
            metricType: metricType || 'PERCENTAGE',
            unit: unit || '%',
            baselineValue: Number(baselineValue) || 0,
            targetValue: Number(targetValue),
            currentValue: Number(baselineValue) || 0,
            companyTargetId: companyTargetId && mongoose.isValidObjectId(companyTargetId) ? companyTargetId : undefined,
            companyTargetTitle,
            targetDate: new Date(targetDate),
            aiReview,
            hrReview: {
                status: 'PENDING_HR',
                comments: '',
                submittedAt,
                deadline,
            },
            status,
            revisionCount: 0,
            history: [
                {
                    action: 'GOAL_SUBMITTED',
                    performedBy: fullName,
                    performedAt: submittedAt,
                    notes: `Goal submitted for review. AI compliance score: ${aiReview.complianceScore}/100.`,
                },
            ],
        });

        await newGoal.save();

        return res.status(201).json({
            success: true,
            message: aiReview.isUnrealistic
                ? 'Goal submitted, but AI flagged an unrealistic target. Please review recommendations.'
                : 'SMART goal submitted successfully and sent to HR review queue (10-day SLA active).',
            goal: newGoal,
        });
    } catch (error: any) {
        logger.error('[SmartGoalController] Failed to create goal:', error);
        return res.status(500).json({ message: error.message || 'Failed to create goal' });
    }
}

export async function updateGoal(req: Request, res: Response) {
    try {
        const authReq = req as AuthRequest;
        const { id } = req.params;
        const currentEmp = await resolveCurrentEmployee(authReq.user?.userId);
        const isPrivileged = isHrOrAdmin(authReq.user?.role);

        const goal = await SmartGoal.findById(id);
        if (!goal) return res.status(404).json({ message: 'Goal not found.' });

        if (!isPrivileged && goal.employeeId !== currentEmp?.employeeId) {
            return res.status(403).json({ message: 'Access denied.' });
        }

        const {
            title,
            description,
            metricType,
            unit,
            baselineValue,
            targetValue,
            companyTargetId,
            targetDate,
            resubmissionNote,
        } = req.body;

        if (title) goal.title = title.trim();
        if (description) goal.description = description.trim();
        if (metricType) goal.metricType = metricType;
        if (unit !== undefined) goal.unit = unit;
        if (baselineValue !== undefined) goal.baselineValue = Number(baselineValue);
        if (targetValue !== undefined) goal.targetValue = Number(targetValue);
        if (targetDate) goal.targetDate = new Date(targetDate);

        if (companyTargetId && mongoose.isValidObjectId(companyTargetId)) {
            const ct = await CompanyTarget.findById(companyTargetId).select('title').lean() as any;
            if (ct) {
                goal.companyTargetId = companyTargetId;
                goal.companyTargetTitle = ct.title;
            }
        }

        // Re-run AI Pre-Review on resubmission
        const aiReview = await performAiGoalReview({
            title: goal.title,
            description: goal.description,
            metricType: goal.metricType,
            unit: goal.unit,
            baselineValue: goal.baselineValue,
            targetValue: goal.targetValue,
            companyTargetTitle: goal.companyTargetTitle,
            targetDate: goal.targetDate,
            designation: goal.designation,
            department: goal.department,
        });

        const resubmitDate = new Date();
        const deadline = new Date(resubmitDate);
        deadline.setDate(deadline.getDate() + 10);

        goal.aiReview = aiReview;
        goal.hrReview.status = 'PENDING_HR';
        goal.hrReview.submittedAt = resubmitDate;
        goal.hrReview.deadline = deadline;
        goal.status = aiReview.isUnrealistic ? 'RETURNED_FOR_REVISION' : 'PENDING_HR';
        goal.revisionCount = (goal.revisionCount || 0) + 1;
        goal.resubmittedAt = resubmitDate;

        const actorName = currentEmp ? `${currentEmp.firstName} ${currentEmp.lastName}` : 'Employee';
        goal.history.push({
            action: 'GOAL_RESUBMITTED',
            performedBy: actorName,
            performedAt: resubmitDate,
            notes: resubmissionNote || `Goal revised & resubmitted (Revision #${goal.revisionCount}). New AI score: ${aiReview.complianceScore}/100.`,
        });

        await goal.save();

        return res.json({
            success: true,
            message: 'Goal revised and resubmitted successfully. 10-day HR review countdown restarted.',
            goal,
        });
    } catch (error: any) {
        logger.error('[SmartGoalController] Failed to update goal:', error);
        return res.status(500).json({ message: error.message || 'Failed to update goal' });
    }
}

export async function deleteGoal(req: Request, res: Response) {
    try {
        const authReq = req as AuthRequest;
        const { id } = req.params;
        const currentEmp = await resolveCurrentEmployee(authReq.user?.userId);
        const isPrivileged = isHrOrAdmin(authReq.user?.role);

        const goal = await SmartGoal.findById(id);
        if (!goal) return res.status(404).json({ message: 'Goal not found.' });

        if (!isPrivileged && goal.employeeId !== currentEmp?.employeeId) {
            return res.status(403).json({ message: 'Access denied. You can only delete your own goals.' });
        }

        await SmartGoal.findByIdAndDelete(id);

        return res.json({ success: true, message: 'SMART goal deleted successfully.' });
    } catch (error: any) {
        logger.error('[SmartGoalController] Failed to delete goal:', error);
        return res.status(500).json({ message: error.message || 'Failed to delete goal' });
    }
}

export async function updateGoalProgress(req: Request, res: Response) {
    try {
        const authReq = req as AuthRequest;
        const { id } = req.params;
        const { currentValue, progressNotes } = req.body;
        const currentEmp = await resolveCurrentEmployee(authReq.user?.userId);
        const isPrivileged = isHrOrAdmin(authReq.user?.role);

        const goal = await SmartGoal.findById(id);
        if (!goal) return res.status(404).json({ message: 'Goal not found.' });

        if (!isPrivileged && goal.employeeId !== currentEmp?.employeeId && authReq.user?.role !== 'manager') {
            return res.status(403).json({ message: 'Access denied.' });
        }

        if (currentValue !== undefined) {
            goal.currentValue = Number(currentValue);
        }

        const actorName = currentEmp ? `${currentEmp.firstName} ${currentEmp.lastName}` : ((authReq.user as any)?.name || authReq.user?.email || 'User');
        goal.history.push({
            action: 'PROGRESS_UPDATED',
            performedBy: actorName,
            performedAt: new Date(),
            notes: progressNotes || `Progress updated to ${goal.currentValue} ${goal.unit || ''}. Status: ${goal.progressStatus}.`,
        });

        await goal.save();

        return res.json({
            success: true,
            message: 'Progress recorded successfully.',
            goal,
        });
    } catch (error: any) {
        logger.error('[SmartGoalController] Failed to update goal progress:', error);
        return res.status(500).json({ message: error.message || 'Failed to update goal progress' });
    }
}

export async function hrGoalDecision(req: Request, res: Response) {
    try {
        const authReq = req as AuthRequest;
        if (!isHrOrAdmin(authReq.user?.role)) {
            return res.status(403).json({ message: 'Access denied. HR/Admin role required.' });
        }

        const { id } = req.params;
        const { decision, comments } = req.body; // 'APPROVE' | 'REJECT' | 'RETURN_FOR_REVISION'

        const goal = await SmartGoal.findById(id);
        if (!goal) return res.status(404).json({ message: 'Goal not found.' });

        const reviewerName = (authReq.user as any)?.name || authReq.user?.email || 'HR Reviewer';
        const now = new Date();

        if (decision === 'APPROVE') {
            goal.hrReview.status = 'APPROVED';
            goal.status = 'APPROVED';
            goal.hrReview.reviewedBy = reviewerName;
            goal.hrReview.reviewedAt = now;
            goal.hrReview.comments = comments || 'Approved as SMART aligned goal.';
            goal.history.push({
                action: 'HR_APPROVED',
                performedBy: reviewerName,
                performedAt: now,
                notes: comments || 'Goal approved by HR.',
            });
        } else if (decision === 'RETURN_FOR_REVISION') {
            goal.hrReview.status = 'RETURNED_FOR_REVISION';
            goal.status = 'RETURNED_FOR_REVISION';
            goal.hrReview.reviewedBy = reviewerName;
            goal.hrReview.reviewedAt = now;
            goal.hrReview.comments = comments || 'Returned for revision. Please clarify metrics or adjust targets.';
            goal.history.push({
                action: 'HR_RETURNED_FOR_REVISION',
                performedBy: reviewerName,
                performedAt: now,
                notes: comments || 'Goal returned for revision by HR.',
            });
        } else if (decision === 'REJECT') {
            goal.hrReview.status = 'REJECTED';
            goal.status = 'REJECTED';
            goal.hrReview.reviewedBy = reviewerName;
            goal.hrReview.reviewedAt = now;
            goal.hrReview.comments = comments || 'Goal rejected.';
            goal.history.push({
                action: 'HR_REJECTED',
                performedBy: reviewerName,
                performedAt: now,
                notes: comments || 'Goal rejected by HR.',
            });
        } else {
            return res.status(400).json({ message: 'Invalid decision. Must be APPROVE, REJECT, or RETURN_FOR_REVISION.' });
        }

        await goal.save();

        return res.json({
            success: true,
            message: `Goal decision '${decision}' recorded successfully.`,
            goal,
        });
    } catch (error: any) {
        logger.error('[SmartGoalController] Failed to record HR decision:', error);
        return res.status(500).json({ message: error.message || 'Failed to record HR decision' });
    }
}
