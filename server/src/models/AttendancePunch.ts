import mongoose, { Schema, Document } from 'mongoose';

/**
 * AttendancePunch — raw punch log from the biometric machine.
 * Every finger/face scan = one document.
 * Punches are later aggregated into AttendanceRecord (daily summaries).
 */
export interface IAttendancePunch extends Document {
    // Machine user ID (numeric string matching HRM employeeId: "01" → "01")
    machineUserId: string;
    // Linked HRM employee ID (same value as machineUserId for now: "01" = "01")
    employeeId: string;
    /** 
     * Cached employee display name at the time of punch. 
     * Treated as immutable historical data for fast feed rendering. 
     */
    employeeName?: string;
    punchTime: Date;
    // ZKTeco status codes: 0=CheckIn, 1=CheckOut, 2=BreakOut, 3=BreakIn, 4=OTIn, 5=OTOut
    punchStatus: number;
    // ZKTeco verify type: 1=Finger, 4=Face, 15=Face+Finger
    verifyType: number;
    // Device serial number (unique per machine/location)
    deviceSN: string;
    // Location tag derived from device SN config
    location: string;
    // Whether this punch has been processed into an AttendanceRecord
    processed: boolean;
    createdAt: Date;
}

const AttendancePunchSchema: Schema = new Schema(
    {
        machineUserId: { type: String, required: true, index: true },
        employeeId:    { type: String, required: true, index: true },
        // Denormalized display name — optional, for fast live-feed rendering without a JOIN
        employeeName:  { type: String },
        punchTime:     { type: Date,   required: true, index: true },
        punchStatus:   { type: Number, default: 0 },
        verifyType:    { type: Number, default: 1 },
        deviceSN:      { type: String, default: 'UNKNOWN' },
        location:      { type: String, default: process.env.DEFAULT_LOCATION || 'ISB-Office' },
        processed:     { type: Boolean, default: false, index: true },
    },
    { timestamps: true }
);

// Compound index: find all punches for an employee on a given date fast
AttendancePunchSchema.index({ employeeId: 1, punchTime: 1 });
// Prevent exact duplicate punches from the same device (same user, same second)
AttendancePunchSchema.index({ deviceSN: 1, machineUserId: 1, punchTime: 1 }, { unique: true });

export default mongoose.models.AttendancePunch ||
    mongoose.model<IAttendancePunch>('AttendancePunch', AttendancePunchSchema);
