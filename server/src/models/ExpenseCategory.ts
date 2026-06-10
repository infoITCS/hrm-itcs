import mongoose, { Schema } from 'mongoose';

const ExpenseCategorySchema = new Schema(
    {
        name: { type: String, required: true, unique: true },
        isActive: { type: Boolean, default: true },
        policyLimit: { type: Number, default: 0 }, // 0 means no limit
        subCategories: [{ type: String }],
        requiresReceipt: { type: Boolean, default: false }
    },
    { timestamps: true }
);

ExpenseCategorySchema.set('toObject', { virtuals: true });
ExpenseCategorySchema.set('toJSON', { virtuals: true });

export default mongoose.model('ExpenseCategory', ExpenseCategorySchema);
