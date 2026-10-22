export type RatingScale =
    | 'NEEDS_IMPROVEMENT'
    | 'BELOW_EXPECTATION'
    | 'MEETS_EXPECTATION'
    | 'EXCEEDS_EXPECTATION'
    | 'ABOVE_EXPECTATION'
    | 'OUTSTANDING';

export type ReviewCycleType = 'Q1' | 'MID_YEAR' | 'Q3' | 'ANNUAL';

export type ReviewStatus =
    | 'PENDING_SELF_ASSESSMENT'
    | 'SUBMITTED_FOR_REVIEW'
    | 'UNDER_1ON1_REVIEW'
    | 'CLOSED';

export type GoalMetricType = 'PERCENTAGE' | 'CURRENCY' | 'NUMBER' | 'MILESTONE';

export type GoalStatus =
    | 'DRAFT'
    | 'PENDING_AI_REVIEW'
    | 'PENDING_HR'
    | 'APPROVED'
    | 'RETURNED_FOR_REVISION'
    | 'REJECTED';

export type MidYearProgressStatus = 'AHEAD' | 'ON_TRACK' | 'BEHIND' | 'NOT_STARTED';

export interface ICompanyTarget {
    _id: string;
    title: string;
    description?: string;
    category: 'SALES' | 'ENGINEERING' | 'OPERATIONS' | 'CUSTOMER_SUCCESS' | 'FINANCE' | 'GENERAL';
    targetMetric?: string;
    targetValue?: string;
    year: number;
    isActive: boolean;
}

export interface ISmartGoal {
    _id: string;
    employee: string;
    employeeId: string;
    employeeName: string;
    department?: string;
    designation?: string;
    cycleYear: number;
    cycleType: ReviewCycleType;
    title: string;
    description: string;
    metricType: GoalMetricType;
    unit?: string;
    baselineValue: number;
    targetValue: number;
    currentValue: number;
    companyTargetId?: string;
    companyTargetTitle?: string;
    targetDate: string;
    aiReview: {
        status: 'PASS' | 'FLAGGED' | 'NEEDS_REVISION';
        feasibility: 'REALISTIC' | 'UNREALISTIC' | 'NEEDS_REVISION';
        complianceScore: number;
        feedback: string;
        suggestedAdjustments?: string;
        isUnrealistic: boolean;
        reviewedAt?: string;
    };
    hrReview: {
        status: 'PENDING_HR' | 'APPROVED' | 'REJECTED' | 'RETURNED_FOR_REVISION';
        comments?: string;
        reviewedBy?: string;
        reviewedAt?: string;
        submittedAt: string;
        deadline: string; // 10-day SLA
    };
    status: GoalStatus;
    progressPercentage: number;
    progressStatus: MidYearProgressStatus;
    revisionCount: number;
    resubmittedAt?: string;
    history: Array<{
        action: string;
        performedBy: string;
        performedAt: string;
        notes?: string;
    }>;
    createdAt: string;
    updatedAt: string;
}

export interface ICompensationRevision {
    previousBaseSalary: number;
    incrementPercentage: number;
    incrementAmount: number;
    newBaseSalary: number;
    performanceBonus: number;
    effectiveFromDate: string;
    appliedToSalary: boolean;
    appliedAt?: string;
}

export interface ISelfAssessment {
    rating?: RatingScale;
    defenseNotes?: string;
    submittedAt?: string;
}

export interface IHrAssessment {
    finalRating?: RatingScale;
    feedbackNotes?: string;
    reviewedAt?: string;
}

export interface IPerformanceReview {
    _id: string;
    cycleYear: number;
    cycleType?: ReviewCycleType;
    cycleTitle: string;
    employee: string;
    employeeId: string;
    employeeName: string;
    department?: string;
    designation?: string;
    reviewer?: string;
    reviewerName?: string;
    selfAssessment: ISelfAssessment;
    hrAssessment: IHrAssessment;
    compensationRevision?: ICompensationRevision;
    status: ReviewStatus;
    createdAt: string;
    updatedAt: string;
}

export interface IPerformanceStats {
    cycleYear: number;
    totalAssigned: number;
    pendingSelfReview: number;
    submittedForReview: number;
    under1on1: number;
    closed: number;
    completionRate: number;
    ratingDistribution: Record<string, number>;
    totalIncrementAmount: number;
    totalBonuses: number;
    avgIncrementPct: number;
}

export const RATING_CONFIG: Record<
    RatingScale,
    { label: string; badge: string; border: string; bg: string; iconColor: string; description: string }
> = {
    OUTSTANDING: {
        label: 'Outstanding',
        badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
        border: 'border-emerald-400',
        bg: 'bg-emerald-50/80',
        iconColor: 'text-emerald-600',
        description: 'Exceptional, extraordinary impact consistently transcending organizational expectations.',
    },
    EXCEEDS_EXPECTATION: {
        label: 'Exceeds Expectation',
        badge: 'bg-teal-50 text-teal-700 border border-teal-200',
        border: 'border-teal-400',
        bg: 'bg-teal-50/80',
        iconColor: 'text-teal-600',
        description: 'Frequently surpasses targets and sets high benchmarks for quality and execution.',
    },
    ABOVE_EXPECTATION: {
        label: 'Exceeds Expectation',
        badge: 'bg-teal-50 text-teal-700 border border-teal-200',
        border: 'border-teal-400',
        bg: 'bg-teal-50/80',
        iconColor: 'text-teal-600',
        description: 'Consistently surpasses expectations and drives strong measurable impact.',
    },
    MEETS_EXPECTATION: {
        label: 'Meets Expectation',
        badge: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
        border: 'border-indigo-400',
        bg: 'bg-indigo-50/80',
        iconColor: 'text-indigo-600',
        description: 'Reliably delivers on deliverables and fulfills core role requirements on schedule.',
    },
    BELOW_EXPECTATION: {
        label: 'Need Improvement / Below Expectation',
        badge: 'bg-rose-50 text-rose-700 border border-rose-200',
        border: 'border-rose-400',
        bg: 'bg-rose-50/80',
        iconColor: 'text-rose-600',
        description: 'Partially meets expectations with clear performance gaps requiring corrective action.',
    },
    NEEDS_IMPROVEMENT: {
        label: 'Need Improvement / Below Expectation',
        badge: 'bg-rose-50 text-rose-700 border border-rose-200',
        border: 'border-rose-400',
        bg: 'bg-rose-50/80',
        iconColor: 'text-rose-600',
        description: 'Immediate action plan and structured coaching intervention required.',
    },
};

export const STATUS_CONFIG: Record<ReviewStatus, { label: string; style: string }> = {
    PENDING_SELF_ASSESSMENT: {
        label: 'Pending Self-Review',
        style: 'bg-amber-50 text-amber-700 border border-amber-200',
    },
    SUBMITTED_FOR_REVIEW: {
        label: 'Submitted for 1-on-1',
        style: 'bg-blue-50 text-blue-700 border border-blue-200',
    },
    UNDER_1ON1_REVIEW: {
        label: 'Under 1-on-1 Review',
        style: 'bg-purple-50 text-purple-700 border border-purple-200',
    },
    CLOSED: {
        label: 'Finalized & Closed',
        style: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    },
};

export const CYCLE_CONFIG: Record<
    ReviewCycleType,
    { label: string; short: string; description: string; schedule: string }
> = {
    Q1: {
        label: 'Q1 Review',
        short: 'Q1',
        description: 'First quarter review with performance percentage/score evaluation.',
        schedule: 'End of Q1 (March)',
    },
    MID_YEAR: {
        label: 'Mid-Year Review',
        short: 'H1 / Mid-Year',
        description: 'January–June assessment to identify staff who are ahead, on track, or behind target.',
        schedule: 'End of June (Q2)',
    },
    Q3: {
        label: 'Nine-Month Review',
        short: 'Q3 (9-Mo)',
        description: 'Third quarter checkpoint evaluating cumulative milestone achievement.',
        schedule: 'End of Q3 (September)',
    },
    ANNUAL: {
        label: 'Annual Review & Goal Setting',
        short: 'Annual',
        description: 'Comprehensive year-end appraisal conducted in January with next-year goal setting and salary revisions.',
        schedule: 'January (Year-End)',
    },
};

export const MID_YEAR_STATUS_CONFIG: Record<
    MidYearProgressStatus,
    { label: string; badge: string; dot: string }
> = {
    AHEAD: {
        label: 'Ahead of Target',
        badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dot: 'bg-emerald-500',
    },
    ON_TRACK: {
        label: 'On Track',
        badge: 'bg-blue-50 text-blue-700 border-blue-200',
        dot: 'bg-blue-500',
    },
    BEHIND: {
        label: 'Behind Target',
        badge: 'bg-rose-50 text-rose-700 border-rose-200',
        dot: 'bg-rose-500',
    },
    NOT_STARTED: {
        label: 'Not Started',
        badge: 'bg-slate-50 text-slate-500 border-slate-200',
        dot: 'bg-slate-400',
    },
};

export const GOAL_STATUS_CONFIG: Record<
    GoalStatus,
    { label: string; badge: string }
> = {
    DRAFT: {
        label: 'Draft',
        badge: 'bg-slate-100 text-slate-700 border-slate-200',
    },
    PENDING_AI_REVIEW: {
        label: 'AI Audit Pending',
        badge: 'bg-purple-50 text-purple-700 border-purple-200',
    },
    PENDING_HR: {
        label: 'Pending HR Review',
        badge: 'bg-amber-50 text-amber-700 border-amber-200',
    },
    APPROVED: {
        label: 'Approved (Locked)',
        badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    RETURNED_FOR_REVISION: {
        label: 'Returned for Revision',
        badge: 'bg-orange-50 text-orange-700 border-orange-200',
    },
    REJECTED: {
        label: 'Rejected',
        badge: 'bg-rose-50 text-rose-700 border-rose-200',
    },
};
