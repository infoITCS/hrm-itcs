
import mongoose, { Schema, Document } from 'mongoose';

export enum UserRole {
    ADMIN = 'admin',
    HR = 'hr',
    EMPLOYEE = 'employee',
}

export interface IUser extends Document {
    email: string;
    role: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    microsoftId?: string;
    password?: string;
    isActive?: boolean;
}

const UserSchema: Schema = new Schema({
    email: { type: String, required: true, unique: true },
    role: { type: String, default: UserRole.EMPLOYEE },
    firstName: { type: String },
    lastName: { type: String },
    avatar: { type: String },
    microsoftId: { type: String },
    password: { type: String }, // For SSO users, this will be random
    isActive: { type: Boolean, default: true },
}, { timestamps: true });

export const User = mongoose.model<IUser>('User', UserSchema);
export default User;
