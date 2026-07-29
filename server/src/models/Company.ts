import mongoose, { Schema, Document } from 'mongoose';

export interface ICompany extends Document {
    name: string;
    subdomain?: string;
    logoUrl?: string;
    branding: {
        primaryColor: string;
        secondaryColor: string;
    };
    contact: {
        addressLine1: string;
        addressLine2?: string;
        phone: string;
        email: string;
        website?: string;
    };
}

const CompanySchema: Schema = new Schema({
    name: { type: String, required: true },
    subdomain: { type: String, unique: true, sparse: true },
    logoUrl: { type: String },
    branding: {
        primaryColor: { type: String, default: '#4A1248' },
        secondaryColor: { type: String, default: '#731868' }
    },
    contact: {
        addressLine1: { type: String, required: true },
        addressLine2: { type: String },
        phone: { type: String, required: true },
        email: { type: String, required: true },
        website: { type: String }
    }
}, { timestamps: true });

export default mongoose.models.Company || mongoose.model<ICompany>('Company', CompanySchema);
