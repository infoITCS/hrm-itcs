import mongoose, { Document, Schema } from 'mongoose';

export interface IEmployeeRequest extends Document {
    employeeId: string;
    category: string;
    requestType: string;
    status: 'Pending' | 'Pending HR' | 'Pending Finance' | 'Approved' | 'Rejected' | 'Completed' | 'Cancelled';
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
