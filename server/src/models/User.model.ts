
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
            const isHashed = /^\$2[aby]\$\d{2}\$/.test(this.password);
            if (!isHashed) {
                const salt = await bcrypt.genSalt(10);
                this.password = await bcrypt.hash(this.password, salt);
            }
        }
        if (this.isModified('salaryPin') && this.salaryPin) {
            const isPinHashed = /^\$2[aby]\$\d{2}\$/.test(this.salaryPin);
            if (!isPinHashed) {
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
    if (this.password.startsWith('$2')) {
        return bcrypt.compare(candidatePassword, this.password);
    }
    // Fallback if previously saved as plaintext
    const isPlainMatch = candidatePassword === this.password;
    if (isPlainMatch) {
        // Auto-upgrade to bcrypt hash
        this.password = candidatePassword;
        await this.save();
    }
    return isPlainMatch;
};

UserSchema.methods.compareSalaryPin = async function (candidatePin: string): Promise<boolean> {
    if (!this.salaryPin) return false;
    if (this.salaryPin.startsWith('$2')) {
        return bcrypt.compare(candidatePin, this.salaryPin);
    }
    const isPlainMatch = candidatePin === this.salaryPin;
    if (isPlainMatch) {
        this.salaryPin = candidatePin;
        await this.save();
    }
    return isPlainMatch;
};

export const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
export default User;
