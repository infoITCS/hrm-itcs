
import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
    action: string; // e.g., 'CREATE', 'UPDATE', 'DELETE'
    targetResource: string; // e.g., 'Employee', 'Department'
    targetId?: string; // ID of the resource
    performedBy: string; // User ID or Name
    details?: {
        diff?: Record<string, { old: unknown; new: unknown } | Record<string, unknown>>;
        name?: string;
        file?: string;
        attachment?: string;
        status?: string;
        reason?: string;
        [key: string]: unknown;
    };
    timestamp: Date;
}

const AuditLogSchema: Schema = new Schema({
    action: { type: String, required: true },
    targetResource: { type: String, required: true },
    targetId: { type: String },
    performedBy: { type: String, required: true },
    details: { type: Schema.Types.Mixed }, // Flexible for storing change diffs
    timestamp: { type: Date, default: Date.now }
});

// Performance indexes
AuditLogSchema.index({ targetId: 1, performedBy: 1, timestamp: -1 });
AuditLogSchema.index({ action: 1, timestamp: -1 });
AuditLogSchema.index({ targetResource: 1 });
// TTL: auto-expire audit logs to prevent unbounded collection growth (default 1 year)
const ttlSeconds = parseInt(process.env.AUDIT_LOG_TTL_SECONDS || '31536000', 10);
if (!isNaN(ttlSeconds) && ttlSeconds > 0) {
    AuditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: ttlSeconds });
}

export default mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
