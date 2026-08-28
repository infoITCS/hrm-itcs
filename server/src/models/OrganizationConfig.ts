import mongoose, { Schema, Document } from 'mongoose';

export interface IDepartment extends Document {
    name: string;
    description?: string;
    isActive: boolean;
}

const DepartmentSchema: Schema = new Schema({
    name: { type: String, required: true, unique: true },
    description: { type: String },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

export interface IDesignation extends Document {
    name: string;
    description?: string;
    isActive: boolean;
}

const DesignationSchema: Schema = new Schema({
    name: { type: String, required: true, unique: true },
    description: { type: String },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

export const Department = mongoose.models.Department || mongoose.model<IDepartment>('Department', DepartmentSchema);
export const Designation = mongoose.models.Designation || mongoose.model<IDesignation>('Designation', DesignationSchema);

export interface ISalaryComponent extends Document {
    name: string;
    type: 'earning' | 'deduction';
    description?: string;
    isActive: boolean;
}

const SalaryComponentSchema: Schema = new Schema({
    name: { type: String, required: true },
    type: { type: String, enum: ['earning', 'deduction'], default: 'earning', required: true },
    description: { type: String },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Compound unique index so the same name isn't duplicated within the same type
SalaryComponentSchema.index({ name: 1, type: 1 }, { unique: true });

export const SalaryComponent = mongoose.models.SalaryComponent || mongoose.model<ISalaryComponent>('SalaryComponent', SalaryComponentSchema);
