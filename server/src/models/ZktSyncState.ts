import mongoose, { Schema, Document } from 'mongoose';

export interface IZktSyncState extends Document {
    key: string;              // e.g. "default" — one document per config
    lastTransactionId: number | null;
    lastSyncAt: Date | null;
    totalSynced: number;
}

const ZktSyncStateSchema = new Schema<IZktSyncState>(
    {
        key:               { type: String, required: true, unique: true, default: 'default' },
        lastTransactionId: { type: Number, default: null },
        lastSyncAt:        { type: Date,   default: null },
        totalSynced:       { type: Number, default: 0 },
    },
    { timestamps: true }
);

export default mongoose.model<IZktSyncState>('ZktSyncState', ZktSyncStateSchema);
