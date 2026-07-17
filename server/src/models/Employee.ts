import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IEmployee extends Document {
    employeeId: string;
    userId?: string;
    biometricPin?: string;  // ZKTeco machine PIN (e.g. "2") — links machine punches to this employee
    firstName: string;
    middleName?: string;
    lastName: string;
    avatar?: string;
    email?: string;
    phone?: string;
    dateOfBirth?: Date;
    gender?: string;
    maritalStatus?: string;
    nationality?: string;
    cnic?: string;
    fatherName?: string;
    bloodGroup?: string;
    religion?: string;
    licenseNumber?: string;
    workEmail?: string;
    otherEmail?: string;
    simNumber?: string;
    domicile?: string;
    skills?: string[];
    address?: {
        street?: string;
        city?: string;
        state?: string;
        zipCode?: string;
        country?: string;
    };
    temporaryAddress?: {
        street?: string;
        city?: string;
        state?: string;
        zipCode?: string;
        country?: string;
    };
    employmentStatus?: {
        status?: string;
        offboardingDate?: Date;
        probationEndDate?: Date; // [NEW] For auto-update
        autoUpdated?: boolean;
    };
    jobInfo: {
        designation: string;
        department: string;
        reportingManager?: string;
        workLocation?: string;
        joiningDate?: Date;
        shift?: Schema.Types.ObjectId | undefined;
    };
    salaryComponents?: {
        component: string;
        amount: number;
        type: 'fixed' | 'variable';
    }[];
    bankDetails?: {
        bankName?: string;
        accountName?: string;
        accountNumber?: string;
        iban?: string;
        swiftCode?: string;
    };
    providentFundBalance?: number;
    providentFundHistory?: {
        amount: number;
        type: 'credit' | 'debit';
        source: 'manual' | 'payroll';
        date: Date;
        description: string;
        periodMonth?: number;
        periodYear?: number;
        payrollRunId?: string;
        erpReferenceId?: string;
    }[];
    pfClaimed?: boolean;
    pfClaimedAt?: Date;
    socialProfiles?: {
        platform: string;
        link: string;
    }[];
    certifications?: {
        title: string;
    }[];
    benefits?: {
        name: string;
        description?: string;
        eligibleDate?: Date;
        status: 'Active' | 'Pending' | 'Expired';
    }[];
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
    immigrationHistory?: {
        documentType: string;
        documentNumber: string;
        issueDate?: Date;
        expiryDate?: Date;
        issuingCountry: string;
    }[];
    attachments?: {
        _id?: Types.ObjectId;
        fileType: string; // e.g., ID, Resume, Contract
        fileName: string;
        filePath?: string;
        contentType?: string;
        uploadDate: Date;
        status?: 'pending' | 'approved' | 'rejected';
        uploadedBy?: string;
        reviewedBy?: string;
        reviewedAt?: Date;
    }[];
    salaryHistory?: {
        effectiveDate: Date;
        amount: number;
        changeType: string;
        reason: string;
        previousAmount: number;
        components?: {
            component: string;
            amount: number;
            type: 'fixed' | 'variable';
        }[];
    }[];
    isDeleted?: boolean;
    deletedAt?: Date;
    deletedBy?: string; // userId of the admin who performed the delete
    companyId?: Types.ObjectId;
}

const EmployeeSchema: Schema = new Schema({
    employeeId: { type: String, required: true, unique: true },
    userId: { type: String },
    biometricPin: { type: String }, // ZKTeco machine PIN — used to map punches to HRM employee
    firstName: { type: String, required: true },
    middleName: { type: String },
    lastName: { type: String, required: true },
    avatar: { type: String },
    email: { type: String, match: /^\S+@\S+\.\S+$/ },
    phone: { type: String },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ['Male', 'Female', 'Other', ''] },
    maritalStatus: { type: String, enum: ['Single', 'Married', 'Divorced', 'Widowed', 'Other', ''] },
    nationality: { type: String },
    cnic: { type: String },
    domicile: { type: String },
    fatherName: { type: String },
    bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', ''] },
    religion: { type: String },
    licenseNumber: { type: String },
    workEmail: { type: String, match: [/^\S+@\S+\.\S+$/, 'Invalid email format'] },
    otherEmail: { type: String },
    simNumber: { type: String },
    skills: [{ type: String }],
    address: {
        street: { type: String },
        city: { type: String },
        state: { type: String },
        zipCode: { type: String },
        country: { type: String }
    },
    temporaryAddress: {
        street: { type: String },
        city: { type: String },
        state: { type: String },
        zipCode: { type: String },
        country: { type: String }
    },
    employmentStatus: {
        status: { type: String, enum: ['Probation', 'Permanent', 'Internship', 'Contract', 'Terminated', 'Resigned', ''] },
        offboardingDate: { type: Date },
        probationEndDate: { type: Date },
        autoUpdated: { type: Boolean, default: false }
    },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: String }, // userId of admin who performed the delete
    companyId: { type: Schema.Types.ObjectId, ref: 'Company' },
    jobInfo: {
        designation: { type: String },
        department: { type: String },
        reportingManager: { type: String },
        workLocation: { type: String },
        joiningDate: { type: Date },
        shift: { type: Schema.Types.ObjectId, ref: 'WorkShift' }
    },
    salaryComponents: [{
        component: { type: String },
        amount: { type: Number },
        type: { type: String, enum: ['fixed', 'variable'], default: 'fixed' }
    }],
    bankDetails: {
        bankName: { type: String },
        accountName: { type: String },
        accountNumber: { type: String },
        iban: { type: String },
        swiftCode: { type: String }
    },
    providentFundBalance: { type: Number, default: 0 },
    providentFundHistory: [{
        amount: { type: Number, required: true },
        type: { type: String, enum: ['credit', 'debit'], required: true },
        source: { type: String, enum: ['manual', 'payroll'], required: true },
        date: { type: Date, default: Date.now },
        description: { type: String, required: true },
        periodMonth: { type: Number },
        periodYear: { type: Number },
        payrollRunId: { type: String },
        erpReferenceId: { type: String }
    }],
    pfClaimed: { type: Boolean, default: false },
    pfClaimedAt: { type: Date },
    socialProfiles: [{
        platform: { type: String },
        link: { type: String }
    }],
    certifications: [{
        title: { type: String }
    }],
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
    benefits: [{
        name: { type: String },
        description: { type: String },
        eligibleDate: { type: Date },
        status: { type: String, enum: ['Active', 'Pending', 'Expired'], default: 'Active' }
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
    immigrationHistory: [{
        documentType: { type: String },
        documentNumber: { type: String },
        issueDate: { type: Date },
        expiryDate: { type: Date },
        issuingCountry: { type: String }
    }],
    attachments: [{
        fileType: { type: String },
        fileName: { type: String },
        filePath: { type: String },
        contentType: { type: String },
        uploadDate: { type: Date, default: Date.now },
        status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
        uploadedBy: { type: String },  // FIX: was in interface but missing from schema
        reviewedBy: { type: String },
        reviewedAt: { type: Date }
    }],
    salaryHistory: [{
        effectiveDate: { type: Date },
        amount: { type: Number },
        changeType: { type: String },
        reason: { type: String },
        previousAmount: { type: Number },
        components: [{
            component: { type: String },
            amount: { type: Number },
            type: { type: String, enum: ['fixed', 'variable'] }
        }]
    }]
}, { timestamps: true });

// Pre-hook to globally filter out soft-deleted records from find queries unless explicitly requested
EmployeeSchema.pre(/^find/, function(this: mongoose.Query<any, any>, next) {
    // If the query doesn't explicitly look for isDeleted: true, filter it out
    const query = this.getQuery();
    if (query.isDeleted === undefined) {
        this.where({ isDeleted: { $ne: true } });
    }
    next();
});

// Pre-hook for aggregation to filter out soft-deleted records
EmployeeSchema.pre('aggregate', function(next) {
    const pipeline = this.pipeline();
    // Check if the pipeline already has a match for isDeleted
    const hasDeletedFilter = pipeline.some((stage: any) => stage.$match && (stage.$match.isDeleted !== undefined));
    if (!hasDeletedFilter) {
        pipeline.unshift({ $match: { isDeleted: { $ne: true } } });
    }
    next();
});

// Encryption removed as per user request

// Performance indexes
EmployeeSchema.index({ userId: 1 });
EmployeeSchema.index({ 'jobInfo.reportingManager': 1 });
EmployeeSchema.index({ 'employmentStatus.status': 1 });
EmployeeSchema.index({ 'employmentStatus.probationEndDate': 1 }, { sparse: true });
// Added for duplicate-check queries
EmployeeSchema.index({ cnic: 1 }, { sparse: true });
EmployeeSchema.index({ email: 1 }, { sparse: true });
// Added for birthday/anniversary scheduler queries
EmployeeSchema.index({ dateOfBirth: 1 }, { sparse: true });
EmployeeSchema.index({ 'jobInfo.joiningDate': 1 }, { sparse: true });
// CRITICAL: queried on every biometric punch — full scan without this index
EmployeeSchema.index({ biometricPin: 1 }, { sparse: true });
// Added for email-based lookups in scheduler/auth
EmployeeSchema.index({ workEmail: 1 }, { sparse: true });
// Soft-delete filter index
EmployeeSchema.index({ isDeleted: 1 });

export default mongoose.models.Employee || mongoose.model<IEmployee>('Employee', EmployeeSchema);
