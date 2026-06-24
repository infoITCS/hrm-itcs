import mongoose, { Schema, Document } from 'mongoose';

export interface ICustomRequestCategory extends Document {
    title: string;
    description: string;
    icon: string;
    options: string[];
    systemType: 'document' | 'loan' | 'generic';
    isDeletable: boolean;
    isActive: boolean;
    hiddenOptions: string[];
    createdAt: Date;
    updatedAt: Date;
}

const customRequestCategorySchema = new Schema<ICustomRequestCategory>({
    title: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    icon: { type: String, required: true, default: 'Package' },
    options: [{ type: String }],
    systemType: { type: String, enum: ['document', 'loan', 'generic'], default: 'generic' },
    isDeletable: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    hiddenOptions: [{ type: String }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

customRequestCategorySchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

export default mongoose.model<ICustomRequestCategory>('CustomRequestCategory', customRequestCategorySchema);
