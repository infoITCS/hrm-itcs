import mongoose, { Schema, Document, Types } from 'mongoose';

export type PayrollRunStatus = 'Draft' | 'Approved' | 'Disbursed';

export interface IPayrollRun extends Document {
    title: string;           // Auto: "June 2026 Payroll"
    periodMonth: number;     // 1–12
    periodYear: number;      // e.g., 2026
    currency: string;        // Default: 'PKR'
    status: PayrollRunStatus;
    notes?: string;
    createdBy: string;       // AuthRequest.user.userId
    approvedBy?: string;     // userId
    approvedAt?: Date;
    disbursedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const PayrollRunSchema: Schema = new Schema(
    {
        title: { type: String, required: true },
        periodMonth: { type: Number, required: true, min: 1, max: 12 },
        periodYear: { type: Number, required: true },
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
    },
    { timestamps: true }
);

// Prevent duplicate runs for the same period
PayrollRunSchema.index({ periodYear: 1, periodMonth: 1 }, { unique: true });
PayrollRunSchema.index({ createdAt: -1 });

export default mongoose.models.PayrollRun ||
    mongoose.model<IPayrollRun>('PayrollRun', PayrollRunSchema);
