import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IRolePermission extends Document {
    role: string;
    permissions: {
        dashboard: boolean;
        pim: boolean;
        leave: boolean;
        attendance: boolean;
        claim: boolean;
        payroll: boolean;
        loans: boolean;
        requests: boolean;
        'provident-fund'?: boolean;
        recruitment?: boolean;
        performance?: boolean;
        settings: boolean;
        [key: string]: boolean | undefined;
    };
}

const RolePermissionSchema = new Schema({
    role: { type: String, required: true, unique: true },
    permissions: {
        dashboard: { type: Boolean, default: true },
        pim: { type: Boolean, default: false },
        leave: { type: Boolean, default: false },
        attendance: { type: Boolean, default: false },
        claim: { type: Boolean, default: false },
        payroll: { type: Boolean, default: false },
        loans: { type: Boolean, default: false },
        requests: { type: Boolean, default: false },
        'provident-fund': { type: Boolean, default: true },
        recruitment: { type: Boolean, default: false },
        performance: { type: Boolean, default: false },
        settings: { type: Boolean, default: false }
    }
}, { timestamps: true });

export default mongoose.models.RolePermission || mongoose.model<IRolePermission>('RolePermission', RolePermissionSchema);

export async function bootstrapPermissions() {
    const defaults = [
        {
            role: 'super-admin',
            permissions: { dashboard: true, pim: true, leave: true, attendance: true, claim: true, payroll: true, loans: true, requests: true, 'provident-fund': true, recruitment: true, performance: true, settings: true }
        },
        {
            role: 'admin',
            permissions: { dashboard: true, pim: true, leave: true, attendance: true, claim: true, payroll: true, loans: true, requests: true, 'provident-fund': true, recruitment: true, performance: true, settings: true }
        },
        {
            role: 'finance',
            permissions: { dashboard: true, pim: false, leave: true, attendance: true, claim: true, payroll: true, loans: true, requests: true, 'provident-fund': true, recruitment: false, performance: false, settings: false }
        },
        {
            role: 'hr',
            permissions: { dashboard: true, pim: true, leave: true, attendance: true, claim: true, payroll: false, loans: true, requests: true, 'provident-fund': true, recruitment: true, performance: true, settings: false }
        },
        {
            role: 'manager',
            permissions: { dashboard: true, pim: true, leave: true, attendance: true, claim: true, payroll: false, loans: false, requests: true, 'provident-fund': true, recruitment: false, performance: true, settings: false }
        },
        {
            role: 'employee',
            permissions: { dashboard: true, pim: false, leave: true, attendance: true, claim: true, payroll: false, loans: false, requests: true, 'provident-fund': true, recruitment: false, performance: true, settings: false }
        }
    ];

    try {
        const RolePermission = mongoose.models.RolePermission || mongoose.model('RolePermission');
        for (const d of defaults) {
            // Use $setOnInsert so existing saved permissions are NEVER overwritten on server restart!
            await RolePermission.findOneAndUpdate(
                { role: d.role },
                { $setOnInsert: { permissions: d.permissions } },
                { upsert: true }
            );
        }

        // Auto-encrypt any legacy unhashed passwords or salary PINs in the database
        const User = mongoose.models.User || mongoose.model('User');
        const unhashedUsers = await User.find({
            $or: [
                { password: { $exists: true, $ne: '', $not: /^\$2[aby]\$/ } },
                { salaryPin: { $exists: true, $ne: '', $not: /^\$2[aby]\$/ } }
            ]
        });
        // Auto-recalibrate employeeId counter to match highest existing non-deleted employee
        const Employee = mongoose.models.Employee || mongoose.model('Employee');
        const Counter = mongoose.models.Counter || mongoose.model('Counter');
        const employees = await Employee.find({ employeeId: { $regex: /^itcs-\d+$/i }, isDeleted: { $ne: true } })
            .select('employeeId')
            .lean();
        
        let maxSeq = 0;
        for (const emp of employees) {
            const match = (emp.employeeId || '').match(/^itcs-(\d+)$/i);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxSeq) maxSeq = num;
            }
        }
        await Counter.findOneAndUpdate(
            { key: 'employeeId' },
            { $set: { seq: maxSeq } },
            { upsert: true }
        );
        console.log(`[Counter Sync] Employee ID sequence calibrated to: ${maxSeq} (Next will be itcs-${String(maxSeq + 1).padStart(3, '0')})`);

        // Initialize Master Financial Security PIN if not already set
        const MasterSecurityPin = mongoose.models.MasterSecurityPin || mongoose.model('MasterSecurityPin');
        const existingMasterPin = await MasterSecurityPin.findOne();
        if (!existingMasterPin) {
            const initialPin = process.env.SUPER_ADMIN_MASTER_PIN || '7777';
            const salt = await bcrypt.genSalt(10);
            const hashedMasterPin = await bcrypt.hash(initialPin, salt);
            await MasterSecurityPin.create({
                hashedMasterPin,
                lastChangedBy: 'System Init'
            });
            console.log(`[Master PIN] Initialized Universal Master Financial PIN.`);
        }
    } catch (err) {
        console.error('Error bootstrapping default role permissions:', err);
    }
}
