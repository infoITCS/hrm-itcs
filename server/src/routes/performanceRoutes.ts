import { Router } from 'express';
import {
    initiateCycle,
    getReviews,
    getMyActiveReview,
    getPerformanceStats,
    getReviewById,
    submitSelfAssessment,
    finalizeReview,
} from '../controllers/performanceController';
import {
    getCompanyTargets,
    createCompanyTarget,
    updateCompanyTarget,
    deleteCompanyTarget,
    getGoals,
    createGoal,
    updateGoal,
    deleteGoal,
    updateGoalProgress,
    hrGoalDecision,
} from '../controllers/smartGoalController';

const router = Router();

// ── Company Targets (Strategic Anchors) ──
router.get('/company-targets', getCompanyTargets);
router.post('/company-targets', createCompanyTarget);
router.put('/company-targets/:id', updateCompanyTarget);
router.delete('/company-targets/:id', deleteCompanyTarget);

// ── SMART Goals (Phase 1) & AI Pre-Review ──
router.get('/goals', getGoals);
router.post('/goals', createGoal);
router.put('/goals/:id', updateGoal);
router.delete('/goals/:id', deleteGoal);
router.put('/goals/:id/progress', updateGoalProgress);
router.put('/goals/:id/hr-decision', hrGoalDecision);

// ── Appraisal Cycles & Reviews (Phase 2) ──
router.post('/initiate', initiateCycle);
router.get('/stats', getPerformanceStats);
router.get('/mine', getMyActiveReview);
router.get('/', getReviews);
router.get('/:id', getReviewById);
router.put('/:id/self-assess', submitSelfAssessment);
router.put('/:id/finalize', finalizeReview);

export default router;
