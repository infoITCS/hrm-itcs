import mongoose, { Document, Schema } from 'mongoose';

export interface IOfficialDocument extends Document {
    documentId: string; // unique hash or ID for verification
    employeeId: string;
    documentType: string; // 'Experience Letter', 'Financial Experience Letter', 'Salary Slip', etc.
    issueDate: Date;
    status: 'Valid' | 'Revoked';
    details: any; // e.g. snapshot of salary, designation at the time of issue
    generatedBy: string; // userId who requested it
    companyId?: mongoose.Types.ObjectId;
}

const officialDocumentSchema = new Schema<IOfficialDocument>({
    documentId: { type: String, required: true, unique: true },
    employeeId: { type: String, required: true },
    documentType: { type: String, required: true },
    issueDate: { type: Date, default: Date.now },
    status: { type: String, enum: ['Valid', 'Revoked'], default: 'Valid' },
    details: { type: Schema.Types.Mixed, default: {} },
    generatedBy: { type: String, required: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company' }
});

export default mongoose.model<IOfficialDocument>('OfficialDocument', officialDocumentSchema);
