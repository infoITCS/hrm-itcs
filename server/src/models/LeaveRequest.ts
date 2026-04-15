import mongoose, { Schema, Document } from 'mongoose';

export enum LeaveStatus {
    PENDING = 'Pending',
    APPROVED = 'Approved',
    REJECTED = 'Rejected',
}

export interface ILeaveRequest extends Document {
    employeeId: string;    // itcs-001
    type: string;          // Sick, Casual, Annual
    startDate: string;     // YYYY-MM-DD
    endDate: string;       // YYYY-MM-DD
    status: LeaveStatus;
    reason?: string;
    appliedBy?: string;    // userId
    approvedBy?: string;   // userId
    createdAt: Date;
    updatedAt: Date;
}

const LeaveRequestSchema: Schema = new Schema({
    employeeId: { type: String, required: true, index: true },
    type: { type: String, required: true },
    startDate: { type: String, required: true, index: true },
    endDate: { type: String, required: true, index: true },
    status: { type: String, enum: Object.values(LeaveStatus), default: LeaveStatus.PENDING },
    reason: { type: String },
    appliedBy: { type: String },
    approvedBy: { type: String },
}, { timestamps: true });

// Index for checking if an employee is on leave on a specific date
LeaveRequestSchema.index({ employeeId: 1, startDate: 1, endDate: 1, status: 1 });

export default mongoose.models.LeaveRequest || mongoose.model<ILeaveRequest>('LeaveRequest', LeaveRequestSchema);
