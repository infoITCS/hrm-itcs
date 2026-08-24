
import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export enum UserRole {
    SUPER_ADMIN = 'super-admin',
    ADMIN = 'admin',
    HR = 'hr',
    FINANCE = 'finance',
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
    salaryPin?: string;
    isActive?: boolean;
    needsPasswordSetup?: boolean;
    resetPasswordToken?: string;
    resetPasswordExpires?: Date;
    comparePassword(candidatePassword: string): Promise<boolean>;
    compareSalaryPin(candidatePin: string): Promise<boolean>;
}

const UserSchema: Schema = new Schema({
    email: { type: String, required: true, unique: true },
    role: { type: String, default: UserRole.EMPLOYEE },
    firstName: { type: String },
    lastName: { type: String },
    avatar: { type: String },
    microsoftId: { type: String },
    password: { type: String }, // For SSO users, this will be random
    salaryPin: { type: String }, // Hashed 4-digit PIN for salary viewing protection
    isActive: { type: Boolean, default: true },
    needsPasswordSetup: { type: Boolean, default: false },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
}, { timestamps: true });

UserSchema.pre<IUser>('save', async function (next) {
    try {
        if (this.isModified('password') && this.password) {
            try { bcrypt.getRounds(this.password); } catch {
                const salt = await bcrypt.genSalt(10);
                this.password = await bcrypt.hash(this.password, salt);
            }
        }
        if (this.isModified('salaryPin') && this.salaryPin) {
            try { bcrypt.getRounds(this.salaryPin); } catch {
                const salt = await bcrypt.genSalt(10);
                this.salaryPin = await bcrypt.hash(this.salaryPin, salt);
            }
        }
        next();
    } catch (error) {
        next(error as Error);
    }
});

UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
    if (!this.password) return false;
    return bcrypt.compare(candidatePassword, this.password);
};

UserSchema.methods.compareSalaryPin = async function (candidatePin: string): Promise<boolean> {
    if (!this.salaryPin) return false;
    return bcrypt.compare(candidatePin, this.salaryPin);
};

export const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
export default User;
