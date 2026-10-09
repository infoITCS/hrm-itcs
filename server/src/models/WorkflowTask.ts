import mongoose, { Schema, Document } from 'mongoose';

export interface IWorkflowTask extends Document {
    type: 'Onboarding' | 'Offboarding';
    targetEmployeeId?: string;
    targetUserId?: string;
    targetName: string;
    targetEmail?: string;
    department: 'Tech' | 'Admin' | 'HR' | 'Finance';
    title: string;
    description?: string;
    status: 'Pending' | 'Completed' | 'Skipped';
    assignedEmail?: string;
    completedBy?: string;
    completedByName?: string;
    completedAt?: Date;
    notes?: string;
    createdAt: Date;
    updatedAt: Date;
}

const WorkflowTaskSchema: Schema = new Schema({
    type: { type: String, enum: ['Onboarding', 'Offboarding'], required: true, index: true },
    targetEmployeeId: { type: String, index: true },
    targetUserId: { type: String, index: true },
    targetName: { type: String, required: true },
    targetEmail: { type: String },
    department: { type: String, enum: ['Tech', 'Admin', 'HR', 'Finance'], required: true, index: true },
    title: { type: String, required: true },
    description: { type: String },
    status: { type: String, enum: ['Pending', 'Completed', 'Skipped'], default: 'Pending', index: true },
    assignedEmail: { type: String },
    completedBy: { type: String },
    completedByName: { type: String },
    completedAt: { type: Date },
    notes: { type: String }
}, { timestamps: true });

export default mongoose.models.WorkflowTask || mongoose.model<IWorkflowTask>('WorkflowTask', WorkflowTaskSchema);
