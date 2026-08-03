import mongoose, { Schema, Document } from 'mongoose';

export interface IWorkShift extends Document {
    name: string;           // e.g., "Morning Shift", "Night Shift"
    startTime: string;      // "HH:mm" (24h format, e.g., "09:00")
    endTime: string;        // "HH:mm" (24h format, e.g., "18:00")
    graceMinutes: number;   // Minutes allowed after startTime before being marked Late
    halfDayThreshold: number; // Hours worked required to avoid a Half-Day
    enableLunchDeduction: boolean; // Whether auto lunch deduction is active
    lunchDeductionMinutes: number; // Duration of lunch deduction in minutes (e.g. 60)
    lunchThresholdHours: number;   // Minimum work hours required before deducting lunch (e.g. 5)
    isDefault: boolean;     // If true, this shift is used for anyone without an assigned shift
    description?: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const WorkShiftSchema: Schema = new Schema(
    {
        name:                  { type: String, required: true, unique: true },
        startTime:             { type: String, required: true, default: "09:00" },
        endTime:               { type: String, required: true, default: "18:00" },
        graceMinutes:          { type: Number, default: 30 },
        halfDayThreshold:      { type: Number, default: 4 },
        enableLunchDeduction:  { type: Boolean, default: true },
        lunchDeductionMinutes: { type: Number, default: 60 },
        lunchThresholdHours:   { type: Number, default: 5 },
        isDefault:             { type: Boolean, default: false },
        description:           { type: String },
        isActive:              { type: Boolean, default: true },
    },
    { timestamps: true }
);

// Ensure only one default shift exists
WorkShiftSchema.index({ isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true } });

export default mongoose.models.WorkShift || mongoose.model<IWorkShift>('WorkShift', WorkShiftSchema);
