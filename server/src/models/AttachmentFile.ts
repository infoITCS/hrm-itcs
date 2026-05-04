import mongoose, { Schema, Document } from 'mongoose';

export interface IAttachmentFile extends Document {
    _id: mongoose.Types.ObjectId; // Matches the attachmentId in the Employee document
    employeeId: string;           // Reference back to the employee
    fileData: Buffer;             // The binary file data
    contentType: string;          // MIME type
    createdAt?: Date;
    updatedAt?: Date;
}

const AttachmentFileSchema: Schema = new Schema({
    _id: { type: Schema.Types.ObjectId, required: true },
    employeeId: { type: String, required: true, index: true },
    fileData: { 
        type: Buffer, 
        required: true,
        validate: {
            validator: (v: Buffer) => v.length <= 5 * 1024 * 1024,
            message: 'File size too large. Max 5MB allowed.'
        }
    },
    contentType: { type: String, required: true }
}, { timestamps: true });

export default mongoose.models.AttachmentFile || mongoose.model<IAttachmentFile>('AttachmentFile', AttachmentFileSchema);
