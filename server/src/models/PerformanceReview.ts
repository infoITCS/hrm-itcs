import mongoose, { Schema, Document } from 'mongoose';

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

export interface ICompensationRevision {
    previousBaseSalary: number;
    incrementPercentage: number;
    incrementAmount: number;
    newBaseSalary: number;
    performanceBonus: number;
    effectiveFromDate: Date;
    appliedToSalary: boolean;
    appliedAt?: Date;
}

export interface ISelfAssessment {
    rating?: RatingScale;
    defenseNotes?: string;
    submittedAt?: Date;
}

export interface IHrAssessment {
    finalRating?: RatingScale;
    feedbackNotes?: string;
    reviewedAt?: Date;
}

export interface IPerformanceReview extends Document {
    cycleYear: number;
    cycleType: ReviewCycleType;
    cycleTitle: string;
    employee: mongoose.Types.ObjectId;
    employeeId: string;
    employeeName: string;
    department?: string;
    designation?: string;
    reviewer?: mongoose.Types.ObjectId;
    reviewerName?: string;
    selfAssessment: ISelfAssessment;
    hrAssessment: IHrAssessment;
    compensationRevision?: ICompensationRevision;
    status: ReviewStatus;
    createdAt: Date;
    updatedAt: Date;
}

const CompensationRevisionSchema = new Schema<ICompensationRevision>(
    {
        previousBaseSalary: { type: Number, default: 0 },
        incrementPercentage: { type: Number, default: 0 },
        incrementAmount: { type: Number, default: 0 },
        newBaseSalary: { type: Number, default: 0 },
        performanceBonus: { type: Number, default: 0 },
        effectiveFromDate: { type: Date },
        appliedToSalary: { type: Boolean, default: false },
        appliedAt: { type: Date },
    },
    { _id: false }
);

const SelfAssessmentSchema = new Schema<ISelfAssessment>(
    {
        rating: {
            type: String,
            enum: ['NEEDS_IMPROVEMENT', 'BELOW_EXPECTATION', 'MEETS_EXPECTATION', 'EXCEEDS_EXPECTATION', 'ABOVE_EXPECTATION', 'OUTSTANDING'],
        },
        defenseNotes: { type: String, trim: true },
        submittedAt: { type: Date },
    },
    { _id: false }
);

const HrAssessmentSchema = new Schema<IHrAssessment>(
    {
        finalRating: {
            type: String,
            enum: ['NEEDS_IMPROVEMENT', 'BELOW_EXPECTATION', 'MEETS_EXPECTATION', 'EXCEEDS_EXPECTATION', 'ABOVE_EXPECTATION', 'OUTSTANDING'],
        },
        feedbackNotes: { type: String, trim: true },
        reviewedAt: { type: Date },
    },
    { _id: false }
);

const PerformanceReviewSchema = new Schema<IPerformanceReview>(
    {
        cycleYear: { type: Number, required: true },
        cycleType: {
            type: String,
            enum: ['Q1', 'MID_YEAR', 'Q3', 'ANNUAL'],
            default: 'ANNUAL',
            index: true,
        },
        cycleTitle: { type: String, required: true, trim: true },
        employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
        employeeId: { type: String, required: true, trim: true, index: true },
        employeeName: { type: String, required: true, trim: true },
        department: { type: String, trim: true },
        designation: { type: String, trim: true },
        reviewer: { type: Schema.Types.ObjectId, ref: 'User' },
        reviewerName: { type: String, trim: true },
        selfAssessment: { type: SelfAssessmentSchema, default: () => ({}) },
        hrAssessment: { type: HrAssessmentSchema, default: () => ({}) },
        compensationRevision: { type: CompensationRevisionSchema },
        status: {
            type: String,
            enum: ['PENDING_SELF_ASSESSMENT', 'SUBMITTED_FOR_REVIEW', 'UNDER_1ON1_REVIEW', 'CLOSED'],
            default: 'PENDING_SELF_ASSESSMENT',
            index: true,
        },
    },
    {
        timestamps: true,
        toJSON: { getters: true, virtuals: true },
        toObject: { getters: true, virtuals: true },
    }
);

// One review per employee per cycle year
PerformanceReviewSchema.index({ cycleYear: 1, employeeId: 1 }, { unique: true });

export default mongoose.models.PerformanceReview ||
    mongoose.model<IPerformanceReview>('PerformanceReview', PerformanceReviewSchema);
