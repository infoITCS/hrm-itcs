import mongoose, { Schema, Document } from 'mongoose';

/**
 * DeviceLocation — maps a ZKTeco device serial number to a named office location
 * and stores the shift timing for that location.
 * When new machines are added for Karachi / Lahore, just add a new document.
 */
export interface IDeviceLocation extends Document {
    // ZKTeco machine serial number (e.g., "CAHT214760099")
    deviceSN: string;
    // Human-readable name (e.g., "ISB-Office", "Karachi", "Lahore")
    locationName: string;
    // Shift start time in "HH:MM" 24h format (e.g., "09:00")
    shiftStart: string;
    // Shift end time in "HH:MM" 24h format (e.g., "18:00")
    shiftEnd: string;
    // Grace period in minutes before marking as Late
    graceMinutes: number;
    // Minimum work hours for Half-Day threshold
    halfDayThresholdHours: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const DeviceLocationSchema: Schema = new Schema(
    {
        deviceSN:              { type: String, required: true, unique: true },
        locationName:          { type: String, required: true },
        shiftStart:            { type: String, default: '09:00' },
        shiftEnd:              { type: String, default: '18:00' },
        graceMinutes:          { type: Number, default: 15 },
        halfDayThresholdHours: { type: Number, default: 4 },
        isActive:              { type: Boolean, default: true },
    },
    { timestamps: true }
);

export default mongoose.models.DeviceLocation ||
    mongoose.model<IDeviceLocation>('DeviceLocation', DeviceLocationSchema);
