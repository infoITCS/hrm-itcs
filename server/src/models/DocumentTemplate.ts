import mongoose, { Schema, Document } from 'mongoose';

export interface IDocTemplate extends Document {
    companyId?: mongoose.Types.ObjectId;
    documentType: string;
    subject: string;
    content: string;
    isActive: boolean;
}

const DocumentTemplateSchema: Schema = new Schema({
    companyId: { type: Schema.Types.ObjectId, ref: 'Company' },
    documentType: { type: String, required: true },
    subject: { type: String },
    content: { type: String, required: true },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Prevent duplicate templates of the same type
DocumentTemplateSchema.index({ documentType: 1 }, { unique: true });

export default mongoose.models.DocumentTemplate || mongoose.model<IDocTemplate>('DocumentTemplate', DocumentTemplateSchema);
