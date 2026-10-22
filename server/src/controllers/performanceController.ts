import { Request, Response } from 'express';
import mongoose from 'mongoose';
import PerformanceReview, { RatingScale, ReviewStatus } from '../models/PerformanceReview';
import Employee from '../models/Employee';
import User from '../models/User.model';
import { AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';

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

// ─── Controller Methods ──────────────────────────────────────────────────────

/**
 * Initiate an appraisal cycle for all (or selected) active employees.
 * Accessible by: super-admin, admin, hr
 */
export async function initiateCycle(req: Request, res: Response) {
    try {
        const authReq = req as AuthRequest;
        if (!isHrOrAdmin(authReq.user?.role)) {
            return res.status(403).json({ message: 'Access denied. HR/Admin role required.' });
        }

        const cycleYear = Number(req.body.cycleYear) || new Date().getFullYear();
        const cycleType = (req.body.cycleType || 'ANNUAL').toUpperCase();
        const cycleTitle = (req.body.cycleTitle || `${cycleType === 'ANNUAL' ? 'Annual' : cycleType} Performance Appraisal ${cycleYear}`).trim();
        const targetEmployeeIds: string[] | undefined = Array.isArray(req.body.employeeIds)
            ? req.body.employeeIds
            : undefined;

        const employeeQuery: any = { isDeleted: { $ne: true } };
        if (targetEmployeeIds && targetEmployeeIds.length > 0) {
            employeeQuery.employeeId = { $in: targetEmployeeIds };
        }

        const employees = await Employee.find(employeeQuery)
            .select('employeeId firstName lastName name jobInfo financeInfo')
            .lean();

        if (employees.length === 0) {
            return res.status(404).json({ message: 'No eligible active employees found.' });
        }

        // Check for existing reviews in this cycle
        const existingReviews = await PerformanceReview.find({
            cycleYear,
            cycleType,
            employeeId: { $in: employees.map((e) => e.employeeId) },
        })
            .select('employeeId')
            .lean();

        const existingEmpIds = new Set(existingReviews.map((r: any) => r.employeeId));

        const toInsert: any[] = [];
        for (const emp of employees) {
            if (existingEmpIds.has(emp.employeeId)) continue;

            const fullName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || (emp as any).name || emp.employeeId;
            const currentSalary = Number((emp as any).financeInfo?.confirmedSalary) ||
                Number((emp as any).financeInfo?.probationSalary) || 0;

            toInsert.push({
                cycleYear,
                cycleType,
                cycleTitle,
                employee: emp._id,
                employeeId: emp.employeeId,
                employeeName: fullName,
                department: (emp as any).jobInfo?.department || '',
                designation: (emp as any).jobInfo?.designation || '',
                compensationRevision: {
                    previousBaseSalary: currentSalary,
                    incrementPercentage: 0,
                    incrementAmount: 0,
                    newBaseSalary: currentSalary,
                    performanceBonus: 0,
                    effectiveFromDate: new Date(`${cycleYear}-01-01T00:00:00.000Z`),
                    appliedToSalary: false,
                },
                status: 'PENDING_SELF_ASSESSMENT',
            });
        }

        if (toInsert.length > 0) {
            await PerformanceReview.insertMany(toInsert);
        }

        return res.status(201).json({
            success: true,
            message: `Appraisal cycle ${cycleYear} initiated successfully.`,
            cycleYear,
            cycleTitle,
            createdCount: toInsert.length,
            skippedCount: employees.length - toInsert.length,
            totalEligible: employees.length,
        });
    } catch (error: any) {
        logger.error('[PerformanceController] Failed to initiate cycle:', error);
        return res.status(500).json({ message: error.message || 'Failed to initiate appraisal cycle' });
    }
}

/**
 * List reviews with filtering and role-based access control.
 */
export async function getReviews(req: Request, res: Response) {
    try {
        const authReq = req as AuthRequest;
        const { role, userId } = authReq.user || {};
        const isPrivileged = isHrOrAdmin(role);

        const currentEmp = await resolveCurrentEmployee(userId);
        if (!isPrivileged && !currentEmp) {
            return res.status(404).json({ message: 'Employee record not found for logged in user.' });
        }

        const query: any = {};

        if (req.query.cycleYear) {
            query.cycleYear = Number(req.query.cycleYear);
        }
        if (req.query.cycleType && req.query.cycleType !== 'ALL') {
            query.cycleType = String(req.query.cycleType);
        }
        if (req.query.status) {
            query.status = String(req.query.status);
        }
        if (req.query.department) {
            query.department = String(req.query.department);
        }

        if (req.query.search) {
            const rawSearch = String(req.query.search).trim();
            const escaped = rawSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const searchRegex = new RegExp(escaped, 'i');
            query.$or = [
                { employeeName: searchRegex },
                { employeeId: searchRegex },
                { department: searchRegex },
                { designation: searchRegex },
            ];
        }

        // Scope to user role
        if (!isPrivileged) {
            if (role === 'manager' && currentEmp) {
                // Manager can see direct reports and own review
                const managerIdentifiers = [
                    currentEmp.employeeId,
                    String(currentEmp._id),
                    currentEmp.userId,
                    `${currentEmp.firstName || ''} ${currentEmp.lastName || ''}`.trim()
                ].filter(Boolean);

                const reportees = await Employee.find({
                    'jobInfo.reportingManager': { $in: managerIdentifiers },
                    isDeleted: { $ne: true },
                }).select('employeeId');

                const allowedEmpIds = [currentEmp.employeeId, ...reportees.map((r: any) => r.employeeId)];
                query.employeeId = { $in: allowedEmpIds };
            } else if (currentEmp) {
                // Regular employee only sees own reviews
                query.employeeId = currentEmp.employeeId;
            }
        }

        const reviews = (await PerformanceReview.find(query).sort({ updatedAt: -1 }).lean()) as any[];

        // If regular employee, mask unfinalized compensation revision
        const sanitized = reviews.map((r: any) => {
            if (!isPrivileged && r.status !== 'CLOSED' && r.employeeId === currentEmp?.employeeId) {
                return {
                    ...r,
                    compensationRevision: undefined,
                };
            }
            return r;
        });

        return res.json(sanitized);
    } catch (error: any) {
        logger.error('[PerformanceController] Failed to fetch reviews:', error);
        return res.status(500).json({ message: error.message || 'Failed to fetch reviews' });
    }
}

/**
 * Get active review for currently logged-in employee.
 */
export async function getMyActiveReview(req: Request, res: Response) {
    try {
        const authReq = req as AuthRequest;
        const currentEmp = await resolveCurrentEmployee(authReq.user?.userId);
        if (!currentEmp) {
            return res.status(404).json({ message: 'Employee record not found.' });
        }

        const cycleYear = req.query.cycleYear ? Number(req.query.cycleYear) : undefined;
        const cycleType = req.query.cycleType && req.query.cycleType !== 'ALL' ? String(req.query.cycleType) : undefined;
        const query: any = { employeeId: currentEmp.employeeId };
        if (cycleYear) query.cycleYear = cycleYear;
        if (cycleType) query.cycleType = cycleType;

        const review = (await PerformanceReview.findOne(query).sort({ cycleYear: -1, createdAt: -1 }).lean()) as any;

        if (!review) {
            return res.status(404).json({ message: 'No active appraisal form found.' });
        }

        // Mask compensation revision if not closed
        if (review.status !== 'CLOSED') {
            review.compensationRevision = undefined;
        }

        return res.json(review);
    } catch (error: any) {
        logger.error('[PerformanceController] Failed to get my review:', error);
        return res.status(500).json({ message: error.message || 'Failed to get appraisal form' });
    }
}

/**
 * Get single review by ID.
 */
export async function getReviewById(req: Request, res: Response) {
    try {
        const authReq = req as AuthRequest;
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: 'Invalid review ID format' });
        }

        const review = (await PerformanceReview.findById(id).lean()) as any;
        if (!review) {
            return res.status(404).json({ message: 'Performance review not found' });
        }

        const isPrivileged = isHrOrAdmin(authReq.user?.role);
        const currentEmp = await resolveCurrentEmployee(authReq.user?.userId);

        let isManagerOfReviewee = false;
        if (authReq.user?.role === 'manager' && currentEmp) {
            const managerIdentifiers = [
                currentEmp.employeeId,
                String(currentEmp._id),
                currentEmp.userId,
                `${currentEmp.firstName || ''} ${currentEmp.lastName || ''}`.trim()
            ].filter(Boolean);

            const isReport = await Employee.exists({
                employeeId: review.employeeId,
                'jobInfo.reportingManager': { $in: managerIdentifiers },
                isDeleted: { $ne: true },
            });
            if (isReport) isManagerOfReviewee = true;
        }

        if (!isPrivileged && !isManagerOfReviewee && review.employeeId !== currentEmp?.employeeId) {
            return res.status(403).json({ message: 'Access denied to this review' });
        }

        if (!isPrivileged && review.status !== 'CLOSED') {
            review.compensationRevision = undefined;
        }

        return res.json(review);
    } catch (error: any) {
        logger.error('[PerformanceController] Failed to get review by id:', error);
        return res.status(500).json({ message: error.message || 'Failed to get review' });
    }
}

/**
 * Stage 1: Employee submits self-assessment and defense notes.
 */
export async function submitSelfAssessment(req: Request, res: Response) {
    try {
        const authReq = req as AuthRequest;
        const { id } = req.params;
        const { rating, defenseNotes } = req.body;

        const validRatings: RatingScale[] = [
            'NEEDS_IMPROVEMENT',
            'BELOW_EXPECTATION',
            'MEETS_EXPECTATION',
            'ABOVE_EXPECTATION',
        ];

        if (!rating || !validRatings.includes(rating)) {
            return res.status(400).json({
                message: 'A valid rating is required (NEEDS_IMPROVEMENT, BELOW_EXPECTATION, MEETS_EXPECTATION, ABOVE_EXPECTATION).',
            });
        }

        if (!defenseNotes || !defenseNotes.trim()) {
            return res.status(400).json({ message: 'Defense remarks / self-assessment notes are required.' });
        }

        const review = await PerformanceReview.findById(id);
        if (!review) {
            return res.status(404).json({ message: 'Performance review not found.' });
        }

        const isPrivileged = isHrOrAdmin(authReq.user?.role);
        const currentEmp = await resolveCurrentEmployee(authReq.user?.userId);

        if (!isPrivileged && review.employeeId !== currentEmp?.employeeId) {
            return res.status(403).json({ message: 'You can only submit self-assessment for your own review.' });
        }

        if (review.status === 'CLOSED') {
            return res.status(400).json({ message: 'This review has already been finalized and closed.' });
        }

        review.selfAssessment = {
            rating,
            defenseNotes: defenseNotes.trim(),
            submittedAt: new Date(),
        };
        review.status = 'SUBMITTED_FOR_REVIEW';

        await review.save();

        return res.json({
            success: true,
            message: 'Self-assessment submitted successfully for review.',
            review,
        });
    } catch (error: any) {
        logger.error('[PerformanceController] Failed to submit self-assessment:', error);
        return res.status(500).json({ message: error.message || 'Failed to submit self-assessment' });
    }
}

/**
 * Stage 2: HR 1-on-1 Sit-down finalization & salary revision.
 * Only accessible by HR / Admin.
 */
export async function finalizeReview(req: Request, res: Response) {
    try {
        const authReq = req as AuthRequest;
        if (!isHrOrAdmin(authReq.user?.role)) {
            return res.status(403).json({ message: 'Access denied. HR/Admin role required.' });
        }

        const { id } = req.params;
        const {
            finalRating,
            feedbackNotes,
            incrementPercentage,
            incrementAmount,
            newBaseSalary,
            performanceBonus,
            effectiveFromDate,
        } = req.body;

        const validRatings: RatingScale[] = [
            'NEEDS_IMPROVEMENT',
            'BELOW_EXPECTATION',
            'MEETS_EXPECTATION',
            'ABOVE_EXPECTATION',
        ];

        if (!finalRating || !validRatings.includes(finalRating)) {
            return res.status(400).json({ message: 'A valid final rating is required.' });
        }

        const review = await PerformanceReview.findById(id);
        if (!review) {
            return res.status(404).json({ message: 'Performance review not found.' });
        }

        const employee = await Employee.findOne({ employeeId: review.employeeId, isDeleted: { $ne: true } });
        if (!employee) {
            return res.status(404).json({ message: 'Associated employee record not found.' });
        }

        // Determine base salary from employee master record
        const previousBaseSalary = Number(employee.financeInfo?.confirmedSalary) ||
            Number(employee.financeInfo?.probationSalary) ||
            review.compensationRevision?.previousBaseSalary || 0;

        const pct = Math.max(0, Number(incrementPercentage) || 0);
        const incAmt = incrementAmount !== undefined
            ? Math.max(0, Number(incrementAmount))
            : Math.round(previousBaseSalary * (pct / 100));

        const finalNewSalary = newBaseSalary !== undefined
            ? Math.max(0, Number(newBaseSalary))
            : previousBaseSalary + incAmt;

        const bonus = Math.max(0, Number(performanceBonus) || 0);
        const effDate = effectiveFromDate ? new Date(effectiveFromDate) : new Date();

        // 1. Update Performance Review
        const reviewerUser = (await User.findById(authReq.user?.userId).select('firstName lastName name username').lean()) as any;
        const reviewerName = reviewerUser
            ? `${reviewerUser.firstName || ''} ${reviewerUser.lastName || ''}`.trim() || reviewerUser.name || reviewerUser.username
            : 'HR Management';

        review.hrAssessment = {
            finalRating,
            feedbackNotes: (feedbackNotes || '').trim(),
            reviewedAt: new Date(),
        };

        review.reviewer = authReq.user?.userId as any;
        review.reviewerName = reviewerName;

        review.compensationRevision = {
            previousBaseSalary,
            incrementPercentage: pct,
            incrementAmount: incAmt,
            newBaseSalary: finalNewSalary,
            performanceBonus: bonus,
            effectiveFromDate: effDate,
            appliedToSalary: true,
            appliedAt: new Date(),
        };

        review.status = 'CLOSED';
        await review.save();

        // 2. Update Employee Master Salary and append to salaryHistory for automatic payroll arrears!
        if (finalNewSalary > 0 && finalNewSalary !== previousBaseSalary) {
            employee.financeInfo = employee.financeInfo || {};
            employee.financeInfo.confirmedSalary = finalNewSalary;

            if (!Array.isArray(employee.salaryHistory)) {
                employee.salaryHistory = [];
            }

            employee.salaryHistory.push({
                effectiveDate: effDate,
                revisedAt: new Date(),
                amount: finalNewSalary,
                previousAmount: previousBaseSalary,
                changeType: 'Annual Appraisal',
                reason: `Annual Appraisal ${review.cycleYear} (${finalRating}) — ${pct}% increment`,
                arrearsProcessed: false, // Triggers automatic retroactive arrears in payroll engine!
            });

            employee.markModified('financeInfo');
            employee.markModified('salaryHistory');
            await employee.save();
        }

        return res.json({
            success: true,
            message: 'Appraisal review finalized, closed, and compensation revision synced to employee record.',
            review,
        });
    } catch (error: any) {
        logger.error('[PerformanceController] Failed to finalize review:', error);
        return res.status(500).json({ message: error.message || 'Failed to finalize review' });
    }
}

/**
 * HR Performance Dashboard Statistics
 */
export async function getPerformanceStats(req: Request, res: Response) {
    try {
        const authReq = req as AuthRequest;
        if (!isHrOrAdmin(authReq.user?.role)) {
            return res.status(403).json({ message: 'Access denied. HR/Admin role required.' });
        }

        const cycleYear = req.query.cycleYear ? Number(req.query.cycleYear) : new Date().getFullYear();
        const cycleType = req.query.cycleType && req.query.cycleType !== 'ALL' ? String(req.query.cycleType) : undefined;

        const statsQuery: any = { cycleYear };
        if (cycleType) statsQuery.cycleType = cycleType;

        const reviews = (await PerformanceReview.find(statsQuery).lean()) as any[];

        const totalAssigned = reviews.length;
        let pendingSelfReview = 0;
        let submittedForReview = 0;
        let under1on1 = 0;
        let closed = 0;

        let totalIncrementAmount = 0;
        let totalBonuses = 0;
        let totalIncrementPct = 0;
        let incrementEligibleCount = 0;

        const ratingDistribution: Record<string, number> = {
            ABOVE_EXPECTATION: 0,
            MEETS_EXPECTATION: 0,
            BELOW_EXPECTATION: 0,
            NEEDS_IMPROVEMENT: 0,
        };

        for (const r of reviews) {
            if (r.status === 'PENDING_SELF_ASSESSMENT') pendingSelfReview++;
            else if (r.status === 'SUBMITTED_FOR_REVIEW') submittedForReview++;
            else if (r.status === 'UNDER_1ON1_REVIEW') under1on1++;
            else if (r.status === 'CLOSED') closed++;

            if (r.hrAssessment?.finalRating && ratingDistribution[r.hrAssessment.finalRating] !== undefined) {
                ratingDistribution[r.hrAssessment.finalRating]++;
            }

            if (r.compensationRevision) {
                totalIncrementAmount += Number(r.compensationRevision.incrementAmount) || 0;
                totalBonuses += Number(r.compensationRevision.performanceBonus) || 0;
                if (r.compensationRevision.incrementPercentage > 0) {
                    totalIncrementPct += r.compensationRevision.incrementPercentage;
                    incrementEligibleCount++;
                }
            }
        }

        const avgIncrementPct = incrementEligibleCount > 0 ? (totalIncrementPct / incrementEligibleCount).toFixed(1) : '0';

        return res.json({
            cycleYear,
            totalAssigned,
            pendingSelfReview,
            submittedForReview,
            under1on1,
            closed,
            completionRate: totalAssigned > 0 ? Math.round((closed / totalAssigned) * 100) : 0,
            ratingDistribution,
            totalIncrementAmount,
            totalBonuses,
            avgIncrementPct: Number(avgIncrementPct),
        });
    } catch (error: any) {
        logger.error('[PerformanceController] Failed to get stats:', error);
        return res.status(500).json({ message: error.message || 'Failed to get stats' });
    }
}
