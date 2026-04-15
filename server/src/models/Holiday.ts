import mongoose, { Schema, Document } from 'mongoose';

export interface IHoliday extends Document {
    name: string;
    date: string;          // YYYY-MM-DD
    location?: string;     // Karachi, Lahore, Main Office (null = All)
    isRecurring: boolean;  // Yearly holiday
}

const HolidaySchema: Schema = new Schema({
    name: { type: String, required: true },
    date: { type: String, required: true, index: true },
    location: { type: String, index: true },
    isRecurring: { type: Boolean, default: false },
}, { timestamps: true });

// Ensure unique holiday name per date/location
HolidaySchema.index({ date: 1, location: 1 }, { unique: true });

export default mongoose.models.Holiday || mongoose.model<IHoliday>('Holiday', HolidaySchema);
