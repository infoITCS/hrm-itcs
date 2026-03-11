
import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export enum UserRole {
    SUPER_ADMIN = 'super-admin',
    ADMIN = 'admin',
    MANAGER = 'manager',
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
    needsPasswordSetup?: boolean;
    resetPasswordToken?: string;
    resetPasswordExpires?: Date;
    comparePassword(candidatePassword: string): Promise<boolean>;
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
    needsPasswordSetup: { type: Boolean, default: false },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
}, { timestamps: true });

UserSchema.pre<IUser>('save', async function (next) {
    if (!this.isModified('password') || !this.password) return next();
    try {
        // Only hash if it's not already a bcrypt hash (bcrypt hashes start with $2a$, $2b$, or $2y$ and are 60 chars long)
        if (this.password.startsWith('$2') && this.password.length === 60) {
            return next();
        }
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error as Error);
    }
});

UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
    if (!this.password) return false;
    return bcrypt.compare(candidatePassword, this.password);
};

export const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
export default User;
