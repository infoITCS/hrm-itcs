import mongoose, { Schema, Document } from 'mongoose';

export interface IRolePermission extends Document {
    role: string;
    permissions: {
        dashboard: boolean;
        pim: boolean;
        leave: boolean;
        attendance: boolean;
        claim: boolean;
        payroll: boolean;
        requests: boolean;
        settings: boolean;
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
        requests: { type: Boolean, default: false },
        settings: { type: Boolean, default: false }
    }
}, { timestamps: true });

export default mongoose.models.RolePermission || mongoose.model<IRolePermission>('RolePermission', RolePermissionSchema);

export async function bootstrapPermissions() {
    const defaults = [
        {
            role: 'super-admin',
            permissions: { dashboard: true, pim: true, leave: true, attendance: true, claim: true, payroll: true, requests: true, settings: true }
        },
        {
            role: 'admin',
            permissions: { dashboard: true, pim: true, leave: true, attendance: true, claim: true, payroll: true, requests: true, settings: true }
        },
        {
            role: 'hr',
            permissions: { dashboard: true, pim: true, leave: true, attendance: true, claim: true, payroll: true, requests: true, settings: true }
        },
        {
            role: 'finance',
            permissions: { dashboard: true, pim: true, leave: true, attendance: true, claim: true, payroll: true, requests: true, settings: true }
        },
        {
            role: 'manager',
            permissions: { dashboard: true, pim: true, leave: true, attendance: true, claim: true, payroll: false, requests: true, settings: false }
        },
        {
            role: 'employee',
            permissions: { dashboard: true, pim: false, leave: true, attendance: true, claim: true, payroll: false, requests: true, settings: false }
        }
    ];

    try {
        const RolePermission = mongoose.models.RolePermission || mongoose.model('RolePermission');
        for (const d of defaults) {
            // Only set permissions when the document is being INSERTED for the first time.
            // $setOnInsert is a no-op when the document already exists, preserving admin edits.
            await RolePermission.findOneAndUpdate(
                { role: d.role },
                { $setOnInsert: { permissions: d.permissions } },
                { upsert: true }
            );
        }
    } catch (err) {
        console.error('Error bootstrapping default role permissions:', err);
    }
}
