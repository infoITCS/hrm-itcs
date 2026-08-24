import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IMasterSecurityPin extends Document {
    hashedMasterPin: string;
    resetOtp?: string;
    otpExpiresAt?: Date;
    lastChangedAt?: Date;
    lastChangedBy?: string;
    comparePin(candidatePin: string): Promise<boolean>;
    compareOtp(candidateOtp: string): Promise<boolean>;
}

const MasterSecurityPinSchema: Schema = new Schema({
    hashedMasterPin: {
        type: String,
        required: true,
    },
    resetOtp: {
        type: String,
    },
    otpExpiresAt: {
        type: Date,
    },
    lastChangedAt: {
        type: Date,
        default: Date.now,
    },
    lastChangedBy: {
        type: String,
    }
}, {
    timestamps: true
});

MasterSecurityPinSchema.methods.comparePin = async function (candidatePin: string): Promise<boolean> {
    if (!this.hashedMasterPin) return false;
    return bcrypt.compare(candidatePin, this.hashedMasterPin);
};

MasterSecurityPinSchema.methods.compareOtp = async function (candidateOtp: string): Promise<boolean> {
    if (!this.resetOtp || !this.otpExpiresAt) return false;
    if (new Date() > this.otpExpiresAt) return false;
    return bcrypt.compare(candidateOtp, this.resetOtp);
};

export const MasterSecurityPin = mongoose.models.MasterSecurityPin || mongoose.model<IMasterSecurityPin>('MasterSecurityPin', MasterSecurityPinSchema);
export default MasterSecurityPin;
