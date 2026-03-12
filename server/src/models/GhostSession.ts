import mongoose, { Schema, Document } from 'mongoose';

export interface IGhostSession extends Document {
  sessionId: string;
  adminId: string;
  targetUserId: string;
  reason: string;
  startedAt: Date;
  expiresAt: Date;
  ip?: string;
  lastActivity?: Date;
}

const GhostSessionSchema: Schema = new Schema({
  sessionId: { type: String, required: true, unique: true },
  adminId: { type: String, required: true },
  targetUserId: { type: String, required: true },
  reason: { type: String, required: true },
  startedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  ip: { type: String },
  lastActivity: { type: Date, default: Date.now }
});

// TTL index to automatically remove expired sessions in MongoDB
GhostSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.GhostSession || mongoose.model<IGhostSession>('GhostSession', GhostSessionSchema);
