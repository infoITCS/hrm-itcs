
import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
    action: string; // e.g., 'CREATE', 'UPDATE', 'DELETE'
    targetResource: string; // e.g., 'Employee', 'Department'
    targetId?: string; // ID of the resource
    performedBy: string; // User ID or Name
    details?: any; // Changed fields or snapshot
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

export default mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
