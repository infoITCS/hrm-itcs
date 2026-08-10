import mongoose, { Schema, Document } from 'mongoose';

/**
 * AttendanceRecord — computed daily attendance for one employee.
 * Generated/updated by attendanceProcessor whenever new punches arrive.
 */
export type AttendanceStatus =
    | 'Present'
    | 'Absent'
    | 'Late'
    | 'Half-Day'
    | 'Early Leave'
    | 'On Leave'
    | 'Holiday'
    | 'Weekend'
    | 'Incomplete'; // Checked in but no check-out yet

export interface IAttendanceRecord extends Document {
    employeeId: string;
    // Canonical date string "YYYY-MM-DD" for easy querying without timezone drift
    date: string;
    location: string;
    checkIn?: Date;
    checkOut?: Date;
    // Total work duration in minutes (checkOut - checkIn)
    workDurationMinutes: number;
    status: AttendanceStatus;
    // Minutes late vs shift start (9:00 AM). 0 if on time.
    lateMinutes: number;
    // Minutes of overtime beyond shift end (18:00 / 6 PM). 0 if none.
    overtimeMinutes: number;
    // Array of all punch times for this day (for audit/display)
    allPunches: Date[];
    // Manual override note (e.g., "approved remote work")
    note?: string;
    // Was manually corrected by admin/manager?
    manuallyAdjusted: boolean;
    adjustedBy?: string;
    isAutoClosed?: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const AttendanceRecordSchema: Schema = new Schema(
    {
        employeeId:          { type: String, required: true, index: true },
        date:                { type: String, required: true, index: true }, // "YYYY-MM-DD"
        location:            { type: String, default: 'ISB-Office' },
        
        // Time tracking
        checkIn:             { type: Date },
        checkOut:            { type: Date },
        shiftStart:          { type: String }, // e.g. "09:00"
        shiftEnd:            { type: String },   // e.g. "18:00"
        
        // Metrics
        workDurationMinutes: { type: Number, default: 0 },
        lateMinutes:         { type: Number, default: 0 },
        overtimeMinutes:     { type: Number, default: 0 },
        
        // Status & Details
        status:              {
            type: String,
            enum: ['Present', 'Absent', 'Late', 'Half-Day', 'Early Leave', 'On Leave', 'Holiday', 'Weekend', 'Incomplete'],
            default: 'Incomplete'
        },
        isHalfDay:           { type: Boolean, default: false },
        leaveType:           { type: String }, // e.g. "Casual", "Sick", "Annual"
        
        allPunches:          [{ type: Date }],
        note:                { type: String },
        manuallyAdjusted:    { type: Boolean, default: false },
        adjustedBy:          { type: String },
        isAutoClosed:        { type: Boolean, default: false },
    },
    { timestamps: true }
);

// One record per employee per date
AttendanceRecordSchema.index({ employeeId: 1, date: 1 }, { unique: true });
// Dashboard queries: all records for a given date across all employees
AttendanceRecordSchema.index({ date: 1, status: 1 });
// Location-based filtering
AttendanceRecordSchema.index({ location: 1, date: 1 });

export default mongoose.models.AttendanceRecord ||
    mongoose.model<IAttendanceRecord>('AttendanceRecord', AttendanceRecordSchema);
