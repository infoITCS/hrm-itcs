import mongoose, { Schema, Document } from 'mongoose';

export interface IEmployee extends Document {
    employeeId: string;
    userId?: string;
    firstName: string;
    middleName?: string;
    lastName: string;
    email?: string;
    phone?: string;
    dateOfBirth?: Date;
    gender?: string;
    maritalStatus?: string;
    nationality?: string;
    address?: {
        street?: string;
        city?: string;
        state?: string;
        zipCode?: string;
        country?: string;
    };
    employmentStatus?: {
        status?: string;
        startDate?: Date;
        probationEndDate?: Date; // [NEW] For auto-update
        autoUpdated?: boolean;
    };
    jobInfo: {
        designation: string;
        department: string;
        reportingManager?: string;
        employmentType?: string;
        workLocation?: string;
        joiningDate?: Date;
    };
    // [NEW] Sub-documents
    emergencyContacts?: {
        name: string;
        relation: string;
        phone: string;
    }[];
    dependents?: {
        name: string;
        relation: string;
        dateOfBirth: Date;
    }[];
    education?: {
        level: string; // e.g., Bachelor, Master
        institute: string;
        year: string;
        score: string;
    }[];
    employmentHistory?: {
        companyName: string;
        jobTitle: string;
        startDate: Date;
        endDate: Date;
        reasonForLeaving?: string;
    }[];
    attachments?: {
        fileType: string; // e.g., ID, Resume, Contract
        fileName: string;
        filePath: string;
        uploadDate: Date;
    }[];
}

const EmployeeSchema: Schema = new Schema({
    employeeId: { type: String, required: true, unique: true },
    userId: { type: String },
    firstName: { type: String, required: true },
    middleName: { type: String },
    lastName: { type: String, required: true },
    email: { type: String },
    phone: { type: String },
    dateOfBirth: { type: Date },
    gender: { type: String },
    maritalStatus: { type: String },
    nationality: { type: String },
    address: {
        street: { type: String },
        city: { type: String },
        state: { type: String },
        zipCode: { type: String },
        country: { type: String }
    },
    employmentStatus: {
        status: { type: String },
        startDate: { type: Date },
        probationEndDate: { type: Date },
        autoUpdated: { type: Boolean, default: false }
    },
    jobInfo: {
        designation: { type: String },
        department: { type: String },
        reportingManager: { type: String },
        employmentType: { type: String },
        workLocation: { type: String },
        joiningDate: { type: Date }
    },
    emergencyContacts: [{
        name: { type: String },
        relation: { type: String },
        phone: { type: String }
    }],
    dependents: [{
        name: { type: String },
        relation: { type: String },
        dateOfBirth: { type: Date }
    }],
    education: [{
        level: { type: String },
        institute: { type: String },
        year: { type: String },
        score: { type: String }
    }],
    employmentHistory: [{
        companyName: { type: String },
        jobTitle: { type: String },
        startDate: { type: Date },
        endDate: { type: Date },
        reasonForLeaving: { type: String }
    }],
    attachments: [{
        fileType: { type: String },
        fileName: { type: String },
        filePath: { type: String },
        uploadDate: { type: Date, default: Date.now }
    }]
}, { timestamps: true });

export default mongoose.model<IEmployee>('Employee', EmployeeSchema);
