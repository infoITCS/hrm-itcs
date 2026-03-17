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
