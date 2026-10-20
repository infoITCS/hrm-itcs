import mongoose, { Schema, Document } from 'mongoose';

export interface IDocumentDispatchLog extends Document {
    documentId: string;
    documentType: string;
    recipientName: string;
    recipientEmail: string;
    emailType: 'personal' | 'work';
    subject: string;
    dispatchedBy: string;
    dispatchedByName: string;
    dispatchedAt: Date;
    status: 'Sent' | 'Failed';
    error?: string;
    rolePreset?: string;
    salaryDetails?: {
        basicSalary?: string;
        grossSalary?: string;
        probationSalary?: string;
        confirmedSalary?: string;
    };
    metadata?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}

const DocumentDispatchLogSchema: Schema = new Schema(
    {
        documentId: { type: String, required: true, index: true },
        documentType: { type: String, required: true, index: true },
        recipientName: { type: String, required: true },
        recipientEmail: { type: String, required: true, index: true },
        emailType: { type: String, enum: ['personal', 'work'], default: 'personal' },
        subject: { type: String, required: true },
        dispatchedBy: { type: String, required: true },
        dispatchedByName: { type: String, required: true },
        dispatchedAt: { type: Date, default: Date.now },
        status: { type: String, enum: ['Sent', 'Failed'], default: 'Sent' },
        error: { type: String },
        rolePreset: { type: String },
        salaryDetails: {
            basicSalary: { type: String },
            grossSalary: { type: String },
            probationSalary: { type: String },
            confirmedSalary: { type: String },
        },
        metadata: { type: Schema.Types.Mixed },
    },
    { timestamps: true }
);

export default mongoose.models.DocumentDispatchLog ||
    mongoose.model<IDocumentDispatchLog>('DocumentDispatchLog', DocumentDispatchLogSchema);
