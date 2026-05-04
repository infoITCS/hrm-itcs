import mongoose, { Document, Schema } from 'mongoose';

export interface ILeaveBalance extends Document {
    employeeId: string;
    year: number;
    annual: { total: number; used: number; pending: number };
    sick: { total: number; used: number; pending: number };
    casual: { total: number; used: number; pending: number };
    unpaid: { total: number; used: number; pending: number };
}

const LeaveBalanceSchema: Schema = new Schema({
    employeeId: { type: String, required: true },
    year: { type: Number, required: true },
    annual: {
        total: { type: Number, default: 20 },
        used: { type: Number, default: 0 },
        pending: { type: Number, default: 0 }
    },
    sick: {
        total: { type: Number, default: 10 },
        used: { type: Number, default: 0 },
        pending: { type: Number, default: 0 }
    },
    casual: {
        total: { type: Number, default: 10 },
        used: { type: Number, default: 0 },
        pending: { type: Number, default: 0 }
    },
    unpaid: {
        total: { type: Number, default: 0 },
        used: { type: Number, default: 0 },
        pending: { type: Number, default: 0 }
    }
}, { timestamps: true });

// Prevent duplicate balances for the same employee in the same year
LeaveBalanceSchema.index({ employeeId: 1, year: 1 }, { unique: true });

export default mongoose.models.LeaveBalance || mongoose.model<ILeaveBalance>('LeaveBalance', LeaveBalanceSchema);
