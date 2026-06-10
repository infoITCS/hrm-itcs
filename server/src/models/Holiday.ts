import mongoose, { Schema, Document } from 'mongoose';

export interface IHoliday extends Document {
    name: string;
    startDate: string;     // YYYY-MM-DD
    endDate: string;       // YYYY-MM-DD
    location?: string;     // Karachi, Lahore, ISB-Office (null = All)
    isRecurring: boolean;  // Yearly holiday
}

const HolidaySchema: Schema = new Schema({
    name: { type: String, required: true },
    startDate: { type: String, required: true, index: true },
    endDate: { type: String, required: true, index: true },
    location: { type: String, index: true },
    isRecurring: { type: Boolean, default: false },
}, { timestamps: true });

// Ensure unique holiday name per startDate/location
HolidaySchema.index({ startDate: 1, location: 1 }, { unique: true });

export default mongoose.models.Holiday || mongoose.model<IHoliday>('Holiday', HolidaySchema);
