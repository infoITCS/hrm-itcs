import mongoose, { Schema, Document } from 'mongoose';

export interface ILeaveType extends Document {
    name: string;
    code: string; // "annual", "sick", "casual", etc.
    defaultDays: number;
    isPaid: boolean;
    isActive: boolean;
    sandwichRuleEnabled: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const LeaveTypeSchema: Schema = new Schema({
    name: { type: String, required: true, unique: true },
    code: { type: String, required: true, unique: true, lowercase: true, trim: true },
    defaultDays: { type: Number, required: true, default: 0 },
    isPaid: { type: Boolean, required: true, default: true },
    isActive: { type: Boolean, required: true, default: true },
    sandwichRuleEnabled: { type: Boolean, required: true, default: true }
}, { timestamps: true });


export default mongoose.models.LeaveType || mongoose.model<ILeaveType>('LeaveType', LeaveTypeSchema);
