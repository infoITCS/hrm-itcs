import mongoose, { Schema, Document } from 'mongoose';

export interface ILoanRepayment extends Document {
    employeeId: string;
    amount: number;
    repaymentDate: Date;
    paymentMethod: 'Bank Transfer' | 'Cash Deposit' | 'Cheque' | 'Online Transfer' | 'Other';
    erpReferenceId?: string;
    evidenceUrl?: string;
    evidenceFileName?: string;
    notes?: string;
    recordedBy: string;
    recordedByName?: string;
    createdAt: Date;
    updatedAt: Date;
}

const LoanRepaymentSchema: Schema = new Schema(
    {
        employeeId: { type: String, required: true, index: true },
        amount: { type: Number, required: true, min: 1 },
        repaymentDate: { type: Date, required: true, default: Date.now },
        paymentMethod: {
            type: String,
            enum: ['Bank Transfer', 'Cash Deposit', 'Cheque', 'Online Transfer', 'Other'],
            default: 'Bank Transfer',
            required: true,
        },
        erpReferenceId: { type: String, trim: true },
        evidenceUrl: { type: String, trim: true },
        evidenceFileName: { type: String, trim: true },
        notes: { type: String, trim: true },
        recordedBy: { type: String, required: true },
        recordedByName: { type: String, trim: true },
    },
    { timestamps: true }
);

export default mongoose.models.LoanRepayment || mongoose.model<ILoanRepayment>('LoanRepayment', LoanRepaymentSchema);
