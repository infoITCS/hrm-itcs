import mongoose, { Document, Schema } from 'mongoose';

export interface ILeaveBalanceCategory {
    leaveTypeCode: string;
    total: number;
    used: number;
    pending: number;
}

export interface ILeaveBalance extends Document {
    employeeId: string;
    year: number;
    balances: ILeaveBalanceCategory[];
    [key: string]: any; // Allow indexing dynamically or legacy virtuals
}

const LeaveBalanceSchema: Schema = new Schema({
    employeeId: { type: String, required: true },
    year: { type: Number, required: true },
    balances: [{
        leaveTypeCode: { type: String, required: true },
        total: { type: Number, required: true, default: 0 },
        used: { type: Number, default: 0 },
        pending: { type: Number, default: 0 }
    }]
}, { timestamps: true });

// Prevent duplicate balances for the same employee in the same year
LeaveBalanceSchema.index({ employeeId: 1, year: 1 }, { unique: true });

export default mongoose.models.LeaveBalance || mongoose.model<ILeaveBalance>('LeaveBalance', LeaveBalanceSchema);
