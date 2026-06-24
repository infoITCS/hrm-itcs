import mongoose, { Document, Schema } from 'mongoose';

export interface IEmployeeRequest extends Document {
    employeeId: string;
    category: 'Document' | 'Asset' | 'Loan';
    requestType: string;
    status: 'Pending' | 'Approved' | 'Rejected' | 'Completed';
    details: any;
    adminComments?: string;
    requestedAt: Date;
    updatedAt: Date;
    approvedBy?: string;
}

const employeeRequestSchema = new Schema<IEmployeeRequest>({
    employeeId: { type: String, required: true },
    category: { type: String, required: true },
    requestType: { type: String, required: true },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Completed'], default: 'Pending' },
    details: { type: Schema.Types.Mixed, default: {} },
    adminComments: { type: String },
    requestedAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    approvedBy: { type: String }
});

employeeRequestSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

export default mongoose.model<IEmployeeRequest>('EmployeeRequest', employeeRequestSchema);
