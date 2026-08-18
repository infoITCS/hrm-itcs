import mongoose, { Document, Schema } from 'mongoose';

export interface IEmployeeRequest extends Document {
    employeeId: string;
    category: string;
    requestType: string;
    status: 'Pending' | 'Pending HR' | 'Pending Finance' | 'Approved' | 'Rejected' | 'Completed' | 'Cancelled';
    payoutStatus?: 'Unpaid' | 'Included in Payroll' | 'Paid';
    payrollRunId?: mongoose.Types.ObjectId | string;
    paidAt?: Date;
    details: any;
    adminComments?: string;
    requestedAt: Date;
    updatedAt: Date;
    approvedBy?: string;
    erpReferenceId?: string;
}

const employeeRequestSchema = new Schema<IEmployeeRequest>({
    employeeId: { type: String, required: true },
    category: { type: String, required: true },
    requestType: { type: String, required: true },
    status: { type: String, enum: ['Pending', 'Pending HR', 'Pending Finance', 'Approved', 'Rejected', 'Completed', 'Cancelled'], default: 'Pending' },
    payoutStatus: { type: String, enum: ['Unpaid', 'Included in Payroll', 'Paid'], default: 'Unpaid', index: true },
    payrollRunId: { type: Schema.Types.ObjectId, ref: 'PayrollRun', index: true },
    paidAt: { type: Date },
    details: { type: Schema.Types.Mixed, default: {} },
    adminComments: { type: String },
    requestedAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    approvedBy: { type: String },
    erpReferenceId: { type: String }
});

employeeRequestSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

export default mongoose.model<IEmployeeRequest>('EmployeeRequest', employeeRequestSchema);
