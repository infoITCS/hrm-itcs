export interface SubTabDefinition {
    key: string;
    name: string;
    description?: string;
    defaultRoles: string[]; // ['all'] or specific roles like ['admin', 'super-admin', 'finance', 'hr', 'manager', 'employee']
}

export interface SystemModuleDefinition {
    key: string;
    name: string;
    subTabs: SubTabDefinition[];
}

export const SYSTEM_MODULES: SystemModuleDefinition[] = [
    {
        key: 'dashboard',
        name: 'Dashboard',
        subTabs: [
            { key: 'overview', name: 'Overview & Stats', defaultRoles: ['all'] },
            { key: 'pending-tasks', name: 'My Pending Tasks', defaultRoles: ['all'] },
            { key: 'highlights', name: 'Monthly Highlights', defaultRoles: ['all'] },
            { key: 'today-leaves', name: 'On Leave Today', defaultRoles: ['all'] },
        ]
    },
    {
        key: 'pim',
        name: 'Personnel Information (PIM)',
        subTabs: [
            { key: 'employee-list', name: 'Employee Directory & List', defaultRoles: ['super-admin', 'admin', 'hr', 'finance', 'manager'] },
            { key: 'add-employee', name: 'Add Employee Wizard', defaultRoles: ['super-admin', 'admin', 'hr'] },
            { key: 'employee-profile', name: 'View & Edit Profiles', defaultRoles: ['all'] },
            { key: 'documents', name: 'Employee Document Verification', defaultRoles: ['super-admin', 'admin', 'hr', 'manager'] },
        ]
    },
    {
        key: 'attendance',
        name: 'Attendance & Biometrics',
        subTabs: [
            { key: 'my-attendance', name: 'My Attendance Logs', defaultRoles: ['all'] },
            { key: 'attendance-dashboard', name: 'Today Attendance Monitor', defaultRoles: ['super-admin', 'admin', 'hr', 'manager'] },
            { key: 'daily-log', name: 'Daily Timesheet Log', defaultRoles: ['super-admin', 'admin', 'hr', 'manager'] },
            { key: 'wfh-requests', name: 'WFH Requests & Approvals', defaultRoles: ['all'] },
            { key: 'corrections', name: 'Admin Punch Correction', defaultRoles: ['super-admin', 'admin', 'hr'] },
            { key: 'biometrics', name: 'ZKTeco Device Machine Sync', defaultRoles: ['super-admin', 'admin'] },
            { key: 'monthly-report', name: 'Monthly PDF & CSV Reports', defaultRoles: ['super-admin', 'admin', 'hr'] },
        ]
    },
    {
        key: 'leave',
        name: 'Leave Management',
        subTabs: [
            { key: 'my-leaves', name: 'My Leave Balances & History', defaultRoles: ['all'] },
            { key: 'apply-leave', name: 'Apply for Leave', defaultRoles: ['all'] },
            { key: 'team-requests', name: 'Leave Approvals Queue', defaultRoles: ['super-admin', 'admin', 'hr', 'manager'] },
            { key: 'all-leaves', name: 'Company-wide Leave History', defaultRoles: ['super-admin', 'admin', 'hr'] },
            { key: 'holidays', name: 'Holiday Calendar', defaultRoles: ['all'] },
        ]
    },
    {
        key: 'claim',
        name: 'Expense Claims',
        subTabs: [
            { key: 'submit', name: 'Submit Claim', defaultRoles: ['all'] },
            { key: 'mine', name: 'My Claims', defaultRoles: ['all'] },
            { key: 'approvals', name: 'Approvals Queue', defaultRoles: ['super-admin', 'admin', 'hr', 'finance', 'manager'] },
            { key: 'history', name: 'Claims History (Org-wide)', defaultRoles: ['super-admin', 'admin', 'finance'] },
            { key: 'settings', name: 'Category & Policy Settings', defaultRoles: ['super-admin', 'admin', 'finance'] },
        ]
    },
    {
        key: 'payroll',
        name: 'Payroll & Compensation',
        subTabs: [
            { key: 'my-payslips', name: 'My Payslips', defaultRoles: ['all'] },
            { key: 'payroll-runs', name: 'Payroll Processing & Runs', defaultRoles: ['super-admin', 'finance', 'admin'] },
            { key: 'bank-advice', name: 'Bank Transfer Advice & Export', defaultRoles: ['super-admin', 'finance', 'admin'] },
            { key: 'salary-structure', name: 'Salary Config & Increments', defaultRoles: ['super-admin', 'finance'] },
        ]
    },
    {
        key: 'provident-fund',
        name: 'Provident Fund',
        subTabs: [
            { key: 'my-pf', name: 'My PF Statement & Balance', defaultRoles: ['all'] },
            { key: 'company-pf', name: 'Company-wide PF Ledger', defaultRoles: ['super-admin', 'admin'] },
        ]
    },
    {
        key: 'requests',
        name: 'Custom Requests & Approvals',
        subTabs: [
            { key: 'my-requests', name: 'My Submitted Requests', defaultRoles: ['all'] },
            { key: 'manage-requests', name: 'Manage & Approve Requests', defaultRoles: ['super-admin', 'admin', 'hr', 'finance', 'manager'] },
            { key: 'request-categories', name: 'Request Form Templates', defaultRoles: ['super-admin', 'admin', 'hr'] },
        ]
    },
    {
        key: 'loans',
        name: 'Loan Management',
        subTabs: [
            { key: 'balances', name: 'Employee Balances & Details', defaultRoles: ['super-admin', 'admin', 'hr'] },
            { key: 'monthly-deductions', name: 'Monthly Deductions & ERP', defaultRoles: ['super-admin', 'admin', 'hr', 'finance'] },
        ]
    },
    {
        key: 'recruitment',
        name: 'Recruitment',
        subTabs: [
            { key: 'candidates', name: 'Candidate Pipeline', defaultRoles: ['super-admin', 'admin', 'hr'] },
        ]
    },
    {
        key: 'performance',
        name: 'Performance',
        subTabs: [
            { key: 'reviews', name: 'Performance Reviews', defaultRoles: ['all'] },
        ]
    },
    {
        key: 'settings',
        name: 'System Settings',
        subTabs: [
            { key: 'organization', name: 'Company Profile & Branding', defaultRoles: ['super-admin', 'admin'] },
            { key: 'work-shifts', name: 'Work Shift Configurations', defaultRoles: ['super-admin', 'admin', 'hr'] },
            { key: 'holidays-config', name: 'Holiday & Leave Policy Settings', defaultRoles: ['super-admin', 'admin', 'hr'] },
            { key: 'security-pin', name: 'Universal Financial PIN Settings', defaultRoles: ['super-admin'] },
        ]
    }
];

export function getDefaultScopeForRole(role: string, moduleName: string): 'none' | 'employee' | 'manager' | 'admin' {
    const normalized = (role || 'employee').toLowerCase().trim();
    if (normalized === 'super-admin' || normalized === 'admin') return 'admin';
    if (normalized === 'hr') {
        if (['pim', 'leave', 'attendance', 'requests'].includes(moduleName)) return 'admin';
        return 'manager';
    }
    if (normalized === 'finance') {
        if (['payroll', 'claim'].includes(moduleName)) return 'admin';
        return 'employee';
    }
    if (normalized === 'manager') {
        return 'manager';
    }
    return 'employee';
}

export function getDefaultSubTabAccess(role: string, moduleKey: string, subTabKey: string): boolean {
    const normalized = (role || 'employee').toLowerCase().trim();
    if (normalized === 'super-admin') return true;

    const mod = SYSTEM_MODULES.find(m => m.key === moduleKey);
    if (!mod) return true;

    const sub = mod.subTabs.find(s => s.key === subTabKey);
    if (!sub) return true;

    if (sub.defaultRoles.includes('all')) return true;
    return sub.defaultRoles.includes(normalized);
}

export function computeEffectivePermissionsAndScopes(user: any, rolePermissions: any) {
    const customPerms = user.customPermissions instanceof Map 
        ? Object.fromEntries(user.customPermissions) 
        : (user.customPermissions || {});
        
    const customScopes = user.customScopes instanceof Map 
        ? Object.fromEntries(user.customScopes) 
        : (user.customScopes || {});

    const customSubPerms = user.customSubPermissions instanceof Map
        ? Object.fromEntries(user.customSubPermissions)
        : (user.customSubPermissions || {});

    const basePermissions = rolePermissions?.permissions || {};
    
    const effectivePermissions: Record<string, boolean> = { ...basePermissions };
    // Apply custom user overrides if explicitly set; default missing modules from sub-tab access
    for (const mod of SYSTEM_MODULES) {
        if (typeof customPerms[mod.key] === 'boolean') {
            effectivePermissions[mod.key] = customPerms[mod.key];
        } else if (mod.key === 'provident-fund') {
            effectivePermissions['provident-fund'] = true;
        } else if (typeof effectivePermissions[mod.key] !== 'boolean') {
            effectivePermissions[mod.key] = mod.subTabs.some((sub) =>
                getDefaultSubTabAccess(user.role, mod.key, sub.key)
            );
        }
    }
    
    const effectiveScopes: Record<string, 'none' | 'employee' | 'manager' | 'admin'> = {};
    for (const mod of SYSTEM_MODULES) {
        // If module is explicitly disabled in effective permissions, scope becomes 'none'
        if (effectivePermissions[mod.key] === false && user.role !== 'super-admin') {
            effectiveScopes[mod.key] = customScopes[mod.key] || 'none';
        } else if (customScopes[mod.key]) {
            effectiveScopes[mod.key] = customScopes[mod.key];
        } else {
            effectiveScopes[mod.key] = getDefaultScopeForRole(user.role, mod.key);
        }
    }

    const effectiveSubPermissions: Record<string, boolean> = {};
    for (const mod of SYSTEM_MODULES) {
        const isModuleEnabled = effectivePermissions[mod.key] !== false || user.role === 'super-admin';
        for (const sub of mod.subTabs) {
            const fullKey = `${mod.key}:${sub.key}`;
            if (!isModuleEnabled) {
                effectiveSubPermissions[fullKey] = false;
            } else if (typeof customSubPerms[fullKey] === 'boolean') {
                effectiveSubPermissions[fullKey] = customSubPerms[fullKey];
            } else {
                effectiveSubPermissions[fullKey] = getDefaultSubTabAccess(user.role, mod.key, sub.key);
            }
        }
    }

    return {
        permissions: effectivePermissions,
        scopes: effectiveScopes,
        subPermissions: effectiveSubPermissions,
        customPermissions: customPerms,
        customScopes: customScopes,
        customSubPermissions: customSubPerms,
    };
}
