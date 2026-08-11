import mongoose, { Schema } from 'mongoose';

export type ExpenseClaimCategory = 'Medical' | 'Training & Certification' | 'Travel' | 'Sales/Customer Gifts' | 'Other';

export type ExpenseClaimForWhom = 'Self' | 'Dependent';

export type ExpenseClaimStatus =
    | 'Draft'
    | 'Submitted'
    | 'Pending Team Lead'
    | 'Pending Line Manager'
    | 'Pending HR'
    | 'Pending Finance'
    | 'Approved'
    | 'Declined';

export type ExpenseClaimApprovalStage = 'teamLead' | 'lineManager' | 'hr' | 'finance';

const ApprovalSchema = new Schema(
    {
        stage: { type: String, enum: ['teamLead', 'lineManager', 'hr', 'finance'], required: true },
        status: { type: String, enum: ['Pending', 'Approved', 'Declined'], required: true, default: 'Pending' },
        // For manager/team-lead stages we pin the approver via PIM hierarchy
        assignedToEmployeeId: { type: String },
        assignedToUserId: { type: Schema.Types.ObjectId, ref: 'User' },
        decidedAt: { type: Date },
        decidedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
        comments: { type: String },
        approvedAmount: { type: Number, min: 0 },
        amountAllowed: { type: Number, min: 0 },
        requiresAuthorization: { type: Boolean, default: false },
        authorizationBy: { type: String }, // free text: "HR" / "Senior Management" etc
    },
    { _id: false }
);

const ReceiptSchema = new Schema(
    {
        fileName: { type: String, required: true },
        contentType: { type: String },
        fileData: { type: Buffer, required: true },
        uploadedAt: { type: Date, default: Date.now },
        // AI-extracted from receipt image/PDF
        extractedDate: { type: Date },
        extractedAmount: { type: Number, min: 0 },
        extractedCurrency: { type: String, default: 'PKR' },
        merchantName: { type: String },
        receiptAgeDays: { type: Number, min: 0 },
        extractionStatus: { type: String, enum: ['success', 'partial', 'failed'], default: 'failed' },
        extractionError: { type: String },
        extractionConfidence: { type: String, enum: ['high', 'medium', 'low', 'none'] },
    },
    { _id: true }
);

const ReceiptAnalysisSchema = new Schema(
    {
        analyzedAt: { type: Date },
        receiptCount: { type: Number, default: 0 },
        successfulExtractions: { type: Number, default: 0 },
        totalExtractedAmount: { type: Number, min: 0 },
        oldestReceiptDate: { type: Date },
        maxReceiptAgeDays: { type: Number, min: 0 },
        amountRequested: { type: Number },
        amountAllowed: { type: Number },
        issues: { type: [String], default: [] },
    },
    { _id: false }
);

const ExpenseClaimSchema = new Schema(
    {
        claimNo: { type: String, index: true, unique: true },

        employeeId: { type: String, required: true, index: true },
        employeeUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

        category: { type: String, required: true },
        subCategories: [{ type: String }],
        expenseDate: { type: Date, default: Date.now },

        forWhom: { type: String, enum: ['Self', 'Dependent'], required: true, default: 'Self' },
        dependentId: { type: String }, // Employee.dependents[].id/_id stringified OR CNIC/identifier
        dependentName: { type: String },

        purpose: { type: String }, // training/certification purpose, etc

        currency: { type: String, default: 'PKR' },
        amountRequested: { type: Number, required: true, min: 0 },
        amountAllowed: { type: Number, required: true, min: 0 },
        approvedTotal: { type: Number, min: 0 },

        notes: { type: String },

        receipts: { type: [ReceiptSchema], default: [] },

        status: {
            type: String,
            enum: ['Draft', 'Submitted', 'Pending Team Lead', 'Pending Line Manager', 'Pending HR', 'Pending Finance', 'Approved', 'Declined'],
            default: 'Submitted',
            index: true,
        },
        payoutStatus: {
            type: String,
            enum: ['Unpaid', 'Included in Payroll', 'Paid'],
            default: 'Unpaid',
            index: true,
        },
        payrollRunId: { type: Schema.Types.ObjectId, ref: 'PayrollRun', index: true },
        paidAt: { type: Date },
        erpReferenceId: { type: String },

        eligibility: {
            eligible: { type: Boolean, default: true },
            flags: { type: [String], default: [] }, // OutOfPolicy, MissingReceipt, ReceiptOlderThan45Days, ReceiptTotalExceedsQuota, ...
        },

        receiptAnalysis: { type: ReceiptAnalysisSchema },

        approvals: { type: [ApprovalSchema], default: [] },

        audit: {
            submittedAt: { type: Date }, // Explicitly set when transitioning from Draft to Submitted
            lastUpdatedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
        },
    },
    { timestamps: true }
);

ExpenseClaimSchema.pre('save', function (next) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const doc: any = this;
    // Ensure audit object exists for lastUpdatedByUserId writes
    doc.audit = doc.audit || {};
    
    // Set submittedAt when status transitions to Submitted or is new and Submitted
    if (doc.status === 'Submitted' && !doc.audit.submittedAt) {
        doc.audit.submittedAt = new Date();
    }
    
    next();
});

ExpenseClaimSchema.virtual('employeeDetails', {
    ref: 'Employee',
    localField: 'employeeId',
    foreignField: 'employeeId',
    justOne: true
});

ExpenseClaimSchema.set('toObject', { virtuals: true });
ExpenseClaimSchema.set('toJSON', { virtuals: true });

export default mongoose.model('ExpenseClaim', ExpenseClaimSchema);

