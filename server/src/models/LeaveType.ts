import mongoose, { Schema, Document } from 'mongoose';

export interface ILeaveType extends Document {
    name: string;
    code: string; // "annual", "sick", "casual", etc.
    defaultDays: number;
    isPaid: boolean;
    isActive: boolean;
    sandwichRuleEnabled: boolean;
    isCalendarDays?: boolean;
    genderRestricted?: 'male' | 'female' | 'all';
    maritalStatusRestricted?: 'married' | 'any';
    createdAt: Date;
    updatedAt: Date;
}

const LeaveTypeSchema: Schema = new Schema({
    name: { type: String, required: true, unique: true },
    code: { type: String, required: true, unique: true, lowercase: true, trim: true },
    defaultDays: { type: Number, required: true, default: 0 },
    isPaid: { type: Boolean, required: true, default: true },
    isActive: { type: Boolean, required: true, default: true },
    sandwichRuleEnabled: { type: Boolean, required: true, default: true },
    isCalendarDays: { type: Boolean, default: false },
    genderRestricted: { type: String, enum: ['male', 'female', 'all'], default: 'all' },
    maritalStatusRestricted: { type: String, enum: ['married', 'any'], default: 'any' }
}, { timestamps: true });


export default mongoose.models.LeaveType || mongoose.model<ILeaveType>('LeaveType', LeaveTypeSchema);
