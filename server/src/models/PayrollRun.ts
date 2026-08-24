import mongoose, { Schema, Document, Types } from 'mongoose';

export type PayrollRunStatus = 'Draft' | 'Approved' | 'Disbursed';

export interface IPayrollRun extends Document {
    title: string;           // Auto: "June 2026 Payroll"
    periodMonth: number;     // 1–12
    periodYear: number;      // e.g., 2026
    startDate?: string;      // Calculation start date e.g. "2026-07-25"
    endDate?: string;        // Calculation end date e.g. "2026-08-24"
    currency: string;        // Default: 'PKR'
    status: PayrollRunStatus;
    notes?: string;
    createdBy: string;       // AuthRequest.user.userId
    approvedBy?: string;     // userId
    approvedAt?: Date;
    disbursedAt?: Date;
    erpTaskId?: string;      // Auto-generated internal batch/task ID e.g. ERP-BATCH-202608-01
    erpReferenceId?: string; // External ERP Voucher / Transaction ID entered by Finance
    erpStatus?: 'Pending' | 'Posted' | 'Reconciled';
    erpNotes?: string;
    erpPostedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const PayrollRunSchema: Schema = new Schema(
    {
        title: { type: String, required: true },
        periodMonth: { type: Number, required: true, min: 1, max: 12 },
        periodYear: { type: Number, required: true },
        startDate: { type: String },
        endDate: { type: String },
        currency: { type: String, default: 'PKR' },
        status: {
            type: String,
            enum: ['Draft', 'Approved', 'Disbursed'],
            default: 'Draft',
            index: true,
        },
        notes: { type: String },
        createdBy: { type: String, required: true },   // userId
        approvedBy: { type: String },                  // userId
        approvedAt: { type: Date },
        disbursedAt: { type: Date },
        erpTaskId: { type: String, index: true },
        erpReferenceId: { type: String },
        erpStatus: {
            type: String,
            enum: ['Pending', 'Posted', 'Reconciled'],
            default: 'Pending',
        },
        erpNotes: { type: String },
        erpPostedAt: { type: Date },
    },
    { timestamps: true }
);

// Prevent duplicate runs for the same period
PayrollRunSchema.index({ periodYear: 1, periodMonth: 1 }, { unique: true });
PayrollRunSchema.index({ createdAt: -1 });

export default mongoose.models.PayrollRun ||
    mongoose.model<IPayrollRun>('PayrollRun', PayrollRunSchema);
