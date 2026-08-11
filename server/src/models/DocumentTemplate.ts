import mongoose, { Schema, Document } from 'mongoose';

export interface IDocTemplate extends Document {
    documentType: string;
    subject: string;
    content: string;
    isActive: boolean;
}

const DocumentTemplateSchema: Schema = new Schema({
    documentType: { type: String, required: true },
    subject: { type: String },
    content: { type: String, required: true },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Prevent duplicate templates of the same type
DocumentTemplateSchema.index({ documentType: 1 }, { unique: true });

export default mongoose.models.DocumentTemplate || mongoose.model<IDocTemplate>('DocumentTemplate', DocumentTemplateSchema);
