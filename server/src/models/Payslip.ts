import mongoose, { Schema, Document, Types } from 'mongoose';
import { encryptNumber, decryptNumber, decryptPayslipFields } from '../utils/encryption';

export interface IPayslipEarning {
    component: string;              // mirrors Employee.salaryComponents[].component
    amount: number;
    type: 'fixed' | 'variable';    // mirrors Employee.salaryComponents[].type enum
    expenseClaim?: boolean;         // true when amount comes from approved expense claims
}

export interface IPayslipDeduction {
    component: string;   // e.g., "Income Tax", "EOBI", "Advance"
    amount: number;
}

export interface IPayslip extends Document {
    payslipNo: string;                  // e.g., "PS-2026-06-0001"
    employeeId: string;                 // Employee.employeeId (e.g., "ITCS-001")
    payrollRunId: Types.ObjectId;       // ref: PayrollRun
    periodMonth: number;
    periodYear: number;
    currency: string;                   // inherited from PayrollRun

    // Beneficiary Account Info (allows custom/proxy account if employee has no account)
    beneficiaryAccount?: string;
    beneficiaryName?: string;
    beneficiaryBank?: string;
    customerReference?: string;         // Unique bank transfer reference

    // Financial Breakdown
    taxDeduction?: number;
    loanDeduction?: number;
    pfPayout?: number;

    // Earnings — auto-populated from Employee.salaryComponents[]
    earnings: IPayslipEarning[];

    // Deductions — manually entered by admin after generation
    // Extension point: future configurable templates will populate this array automatically
    deductions: IPayslipDeduction[];

    grossPay: number;         // sum of earnings[].amount
    totalDeductions: number;  // sum of deductions[].amount
    netPay: number;           // grossPay - totalDeductions

    status: 'Draft' | 'Finalized' | 'Revoked' | 'Cancelled';
    paymentMethod: 'Bank Transfer' | 'Cash' | 'Cheque';
    paidAt?: Date;
    notes?: string;
    createdAt: Date;
    updatedAt: Date;
}

const EarningSchema = new Schema(
    {
        component: { type: String, required: true },
        amount: { type: Schema.Types.Mixed, required: true, get: decryptNumber, set: encryptNumber },
        type: { type: String, enum: ['fixed', 'variable'], default: 'fixed' },
        expenseClaim: { type: Boolean, default: false },
    },
    { _id: false }
);

const DeductionSchema = new Schema(
    {
        component: { type: String, required: true },
        amount: { type: Schema.Types.Mixed, required: true, get: decryptNumber, set: encryptNumber },
    },
    { _id: false }
);

const PayslipSchema: Schema = new Schema(
    {
        payslipNo: { type: String, unique: true, index: true },

        // Links to existing Employee model via employeeId string (same as LeaveRequest, ExpenseClaim)
        employeeId: { type: String, required: true, index: true },

        payrollRunId: {
            type: Schema.Types.ObjectId,
            ref: 'PayrollRun',
            required: true,
            index: true,
        },

        periodMonth: { type: Number, required: true, min: 1, max: 12 },
        periodYear: { type: Number, required: true },
        currency: { type: String, default: 'PKR' },

        beneficiaryAccount: { type: String },
        beneficiaryName: { type: String },
        beneficiaryBank: { type: String },
        customerReference: { type: String, index: true },

        taxDeduction: { type: Schema.Types.Mixed, default: 0, get: decryptNumber, set: encryptNumber },
        loanDeduction: { type: Schema.Types.Mixed, default: 0, get: decryptNumber, set: encryptNumber },
        pfPayout: { type: Schema.Types.Mixed, default: 0, get: decryptNumber, set: encryptNumber },

        // Populated from Employee.salaryComponents[] on generation
        earnings: { type: [EarningSchema], default: [] },

        // Manually added by admin (tax, EOBI, advances, etc.)
        deductions: { type: [DeductionSchema], default: [] },

        grossPay: { type: Schema.Types.Mixed, required: true, default: 0, get: decryptNumber, set: encryptNumber },
        totalDeductions: { type: Schema.Types.Mixed, required: true, default: 0, get: decryptNumber, set: encryptNumber },
        netPay: { type: Schema.Types.Mixed, required: true, default: 0, get: decryptNumber, set: encryptNumber },

        status: {
            type: String,
            enum: ['Draft', 'Finalized', 'Revoked', 'Cancelled'],
            default: 'Draft',
            index: true,
        },
        paymentMethod: {
            type: String,
            enum: ['Bank Transfer', 'Cash', 'Cheque'],
            default: 'Bank Transfer',
        },
        paidAt: { type: Date },
        notes: { type: String },
        attendanceSummary: {
            workingDays: { type: Number, default: 0 },
            presentDays: { type: Number, default: 0 },
            lateDays: { type: Number, default: 0 },
            halfDays: { type: Number, default: 0 },
            absentDays: { type: Number, default: 0 },
            leaveDays: { type: Number, default: 0 },
        },
    },
    {
        timestamps: true,
        toJSON: { getters: true, virtuals: true },
        toObject: { getters: true, virtuals: true }
    }
);

// Prevent duplicate payslips for the same employee in the same run
PayslipSchema.index({ payrollRunId: 1, employeeId: 1 }, { unique: true });
PayslipSchema.index({ employeeId: 1, periodYear: -1, periodMonth: -1 });

// Virtual — same pattern as ExpenseClaim.ts
PayslipSchema.virtual('employeeDetails', {
    ref: 'Employee',
    localField: 'employeeId',
    foreignField: 'employeeId',
    justOne: true,
});

// Decrypt financial fields automatically on document hydration and queries (including .lean())
PayslipSchema.post('init', function(doc: any) {
    decryptPayslipFields(doc);
});

PayslipSchema.post(/^find/, function(result: any) {
    if (!result) return;
    if (Array.isArray(result)) {
        result.forEach(doc => decryptPayslipFields(doc));
    } else {
        decryptPayslipFields(result);
    }
});

PayslipSchema.post('findOneAndUpdate', function(doc: any) {
    if (doc) decryptPayslipFields(doc);
});

PayslipSchema.set('toObject', { getters: true, virtuals: true });
PayslipSchema.set('toJSON', { getters: true, virtuals: true });

export default mongoose.models.Payslip ||
    mongoose.model<IPayslip>('Payslip', PayslipSchema);

