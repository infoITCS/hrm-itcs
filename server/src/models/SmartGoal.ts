import mongoose, { Schema, Document } from 'mongoose';

export type GoalMetricType = 'PERCENTAGE' | 'CURRENCY' | 'NUMBER' | 'MILESTONE';

export type GoalStatus =
    | 'DRAFT'
    | 'PENDING_AI_REVIEW'
    | 'PENDING_HR'
    | 'APPROVED'
    | 'RETURNED_FOR_REVISION'
    | 'REJECTED';

export type MidYearProgressStatus = 'AHEAD' | 'ON_TRACK' | 'BEHIND' | 'NOT_STARTED';

export interface ICompanyTarget extends Document {
    title: string;
    description?: string;
    category: 'SALES' | 'ENGINEERING' | 'OPERATIONS' | 'CUSTOMER_SUCCESS' | 'FINANCE' | 'GENERAL';
    targetMetric?: string;
    targetValue?: string;
    year: number;
    isActive: boolean;
    createdBy?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface ISmartGoal extends Document {
    employee: mongoose.Types.ObjectId;
    employeeId: string;
    employeeName: string;
    department?: string;
    designation?: string;
    cycleYear: number;
    cycleType: 'Q1' | 'MID_YEAR' | 'Q3' | 'ANNUAL';
    
    // SMART Fields
    title: string; // Specific
    description: string; // Specific detail
    metricType: GoalMetricType; // Measurable
    unit?: string; // e.g. '%', 'PKR', 'Clients', 'Bugs'
    baselineValue: number; // Measurable starting point
    targetValue: number; // Measurable target
    currentValue: number; // Actual progress
    companyTargetId?: mongoose.Types.ObjectId; // Attainable & Aligned
    companyTargetTitle?: string; // e.g. "PKR 2 Billion Sales Revenue Target"
    targetDate: Date; // Time-bound
    
    // AI Pre-Review (Gemini)
    aiReview: {
        status: 'PASS' | 'FLAGGED' | 'NEEDS_REVISION';
        feasibility: 'REALISTIC' | 'UNREALISTIC' | 'NEEDS_REVISION';
        complianceScore: number; // 0 - 100
        feedback: string;
        suggestedAdjustments?: string;
        isUnrealistic: boolean;
        reviewedAt?: Date;
    };

    // HR Review & 10-Day SLA Decision
    hrReview: {
        status: 'PENDING_HR' | 'APPROVED' | 'REJECTED' | 'RETURNED_FOR_REVISION';
        comments?: string;
        reviewedBy?: string;
        reviewedAt?: Date;
        submittedAt: Date;
        deadline: Date; // submittedAt + 10 days SLA
    };

    status: GoalStatus;
    progressPercentage: number;
    progressStatus: MidYearProgressStatus;
    revisionCount: number;
    resubmittedAt?: Date;
    history: Array<{
        action: string;
        performedBy: string;
        performedAt: Date;
        notes?: string;
    }>;
    createdAt: Date;
    updatedAt: Date;
}

const CompanyTargetSchema = new Schema<ICompanyTarget>(
    {
        title: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        category: {
            type: String,
            enum: ['SALES', 'ENGINEERING', 'OPERATIONS', 'CUSTOMER_SUCCESS', 'FINANCE', 'GENERAL'],
            default: 'GENERAL',
        },
        targetMetric: { type: String },
        targetValue: { type: String },
        year: { type: Number, required: true, default: () => new Date().getFullYear() },
        isActive: { type: Boolean, default: true },
        createdBy: { type: String },
    },
    { timestamps: true }
);

const SmartGoalSchema = new Schema<ISmartGoal>(
    {
        employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
        employeeId: { type: String, required: true, index: true },
        employeeName: { type: String, required: true },
        department: { type: String },
        designation: { type: String },
        cycleYear: { type: Number, required: true, index: true },
        cycleType: {
            type: String,
            enum: ['Q1', 'MID_YEAR', 'Q3', 'ANNUAL'],
            default: 'ANNUAL',
            index: true,
        },
        title: { type: String, required: true, trim: true },
        description: { type: String, required: true, trim: true },
        metricType: {
            type: String,
            enum: ['PERCENTAGE', 'CURRENCY', 'NUMBER', 'MILESTONE'],
            default: 'PERCENTAGE',
        },
        unit: { type: String, default: '%' },
        baselineValue: { type: Number, default: 0 },
        targetValue: { type: Number, required: true },
        currentValue: { type: Number, default: 0 },
        companyTargetId: { type: Schema.Types.ObjectId, ref: 'CompanyTarget' },
        companyTargetTitle: { type: String },
        targetDate: { type: Date, required: true },

        aiReview: {
            status: { type: String, enum: ['PASS', 'FLAGGED', 'NEEDS_REVISION'], default: 'NEEDS_REVISION' },
            feasibility: { type: String, enum: ['REALISTIC', 'UNREALISTIC', 'NEEDS_REVISION'], default: 'REALISTIC' },
            complianceScore: { type: Number, default: 0 },
            feedback: { type: String, default: '' },
            suggestedAdjustments: { type: String },
            isUnrealistic: { type: Boolean, default: false },
            reviewedAt: { type: Date },
        },

        hrReview: {
            status: {
                type: String,
                enum: ['PENDING_HR', 'APPROVED', 'REJECTED', 'RETURNED_FOR_REVISION'],
                default: 'PENDING_HR',
                index: true,
            },
            comments: { type: String, default: '' },
            reviewedBy: { type: String },
            reviewedAt: { type: Date },
            submittedAt: { type: Date, default: Date.now },
            deadline: { type: Date }, // 10 days from submission
        },

        status: {
            type: String,
            enum: ['DRAFT', 'PENDING_AI_REVIEW', 'PENDING_HR', 'APPROVED', 'RETURNED_FOR_REVISION', 'REJECTED'],
            default: 'PENDING_HR',
            index: true,
        },
        progressPercentage: { type: Number, default: 0 },
        progressStatus: {
            type: String,
            enum: ['AHEAD', 'ON_TRACK', 'BEHIND', 'NOT_STARTED'],
            default: 'NOT_STARTED',
        },
        revisionCount: { type: Number, default: 0 },
        resubmittedAt: { type: Date },
        history: [
            {
                action: { type: String },
                performedBy: { type: String },
                performedAt: { type: Date, default: Date.now },
                notes: { type: String },
            },
        ],
    },
    { timestamps: true }
);

// Auto-compute 10-day SLA deadline & progress percentage before saving
SmartGoalSchema.pre('save', function (next) {
    if (!this.hrReview.deadline && this.hrReview.submittedAt) {
        const d = new Date(this.hrReview.submittedAt);
        d.setDate(d.getDate() + 10);
        this.hrReview.deadline = d;
    }

    // Auto-calculate progress percentage & comparative indicator
    const totalSpan = this.targetValue - this.baselineValue;
    if (totalSpan > 0) {
        const progress = Math.max(0, this.currentValue - this.baselineValue);
        this.progressPercentage = Math.min(200, Math.round((progress / totalSpan) * 100));
    } else if (this.targetValue > 0) {
        this.progressPercentage = Math.min(200, Math.round((this.currentValue / this.targetValue) * 100));
    }

    if (this.currentValue === 0 && this.baselineValue === 0) {
        this.progressStatus = 'NOT_STARTED';
    } else if (this.progressPercentage >= 105) {
        this.progressStatus = 'AHEAD';
    } else if (this.progressPercentage >= 75) {
        this.progressStatus = 'ON_TRACK';
    } else {
        this.progressStatus = 'BEHIND';
    }

    next();
});

export const CompanyTarget =
    mongoose.models.CompanyTarget || mongoose.model<ICompanyTarget>('CompanyTarget', CompanyTargetSchema);

export const SmartGoal =
    mongoose.models.SmartGoal || mongoose.model<ISmartGoal>('SmartGoal', SmartGoalSchema);

export default SmartGoal;
