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
    },
    { _id: true }
);

const ExpenseClaimSchema = new Schema(
    {
        claimNo: { type: String, index: true, unique: true },

        employeeId: { type: String, required: true, index: true },
        employeeUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

        category: { type: String, required: true, enum: ['Medical', 'Training & Certification', 'Travel', 'Sales/Customer Gifts', 'Other'] },
        subCategory: { type: String },

        forWhom: { type: String, enum: ['Self', 'Dependent'], required: true, default: 'Self' },
        dependentId: { type: String }, // Employee.dependents[].id/_id stringified OR CNIC/identifier
        dependentName: { type: String },

        purpose: { type: String }, // training/certification purpose, etc
        serviceDateFrom: { type: Date }, // medical / travel date range
        serviceDateTo: { type: Date },

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

        eligibility: {
            eligible: { type: Boolean, default: true },
            flags: { type: [String], default: [] }, // "OutOfPolicy", "Extra", "MissingReceipt", ...
        },

        approvals: { type: [ApprovalSchema], default: [] },

        audit: {
            submittedAt: { type: Date, default: Date.now },
            lastUpdatedAt: { type: Date, default: Date.now },
            lastUpdatedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
        },
    },
    { timestamps: true }
);

ExpenseClaimSchema.pre('save', function (next) {
    // Keep timestamps consistent across serverless updates
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const doc: any = this;
    doc.audit = doc.audit || {};
    doc.audit.lastUpdatedAt = new Date();
    next();
});

export default mongoose.model('ExpenseClaim', ExpenseClaimSchema);

