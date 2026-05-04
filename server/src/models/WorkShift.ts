import mongoose, { Schema, Document } from 'mongoose';

export interface IWorkShift extends Document {
    name: string;           // e.g., "Morning Shift", "Night Shift"
    startTime: string;      // "HH:mm" (24h format, e.g., "09:00")
    endTime: string;        // "HH:mm" (24h format, e.g., "18:00")
    graceMinutes: number;   // Minutes allowed after startTime before being marked Late
    halfDayThreshold: number; // Hours worked required to avoid a Half-Day
    isDefault: boolean;     // If true, this shift is used for anyone without an assigned shift
    description?: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const WorkShiftSchema: Schema = new Schema(
    {
        name:             { type: String, required: true, unique: true },
        startTime:        { type: String, required: true, default: "09:00" },
        endTime:          { type: String, required: true, default: "18:00" },
        graceMinutes:     { type: Number, default: 30 },
        halfDayThreshold: { type: Number, default: 4 },
        isDefault:        { type: Boolean, default: false },
        description:      { type: String },
        isActive:         { type: Boolean, default: true },
    },
    { timestamps: true }
);

// Ensure only one default shift exists
WorkShiftSchema.index({ isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true } });

export default mongoose.models.WorkShift || mongoose.model<IWorkShift>('WorkShift', WorkShiftSchema);
