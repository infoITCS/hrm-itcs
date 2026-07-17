import Employee from '../models/Employee';

export const canCreateUser = (role: string): boolean => {
    return ['super-admin', 'admin', 'hr', 'manager'].includes(role);
};

/**
 * Check if user can view an employee's personal info.
 * - super-admin, admin, hr, finance: can view all employees.
 * - manager: can only view own record + direct reports.
 * - employee: can only view own profile.
 */
export const canViewEmployee = async (
    role: string,
    userId: string,
    targetEmployeeId?: string,
    targetEmployee?: any
): Promise<boolean> => {
    if (['super-admin', 'admin', 'hr', 'finance'].includes(role)) {
        return true; // Full access
    }

    if (role === 'manager') {
        // Always resolve target from DB to prevent caller manipulation
        const targetId = targetEmployeeId || targetEmployee?.employeeId;
        if (!targetId) return false;

        const employee = await Employee.findOne({ employeeId: targetId }).lean() as any;
        if (!employee) return false;

        // Get manager's own employee record via userId (DB lookup — not trusting free-text input)
        const managerEmployee = await Employee.findOne({ userId }).lean() as any;
        if (!managerEmployee) return false;

        // Allow viewing own record
        if (managerEmployee.employeeId === employee.employeeId) return true;

        // Check if the target is a direct report (compare against actual DB record, not user input)
        return employee.jobInfo?.reportingManager === managerEmployee.employeeId;
    }

    if (role === 'employee') {
        const employee = await Employee.findOne({ userId }).lean() as any;
        if (!employee) return false;

        const targetId = targetEmployeeId || targetEmployee?.employeeId;
        if (!targetId) return false;

        // Resolve target from DB to verify it exists
        const resolvedTarget = await Employee.findOne({ employeeId: targetId }).lean() as any;
        if (!resolvedTarget) return false;

        return employee.employeeId === resolvedTarget.employeeId;
    }

    return false;
};

export const canEditSensitiveData = (role: string): boolean => {
    return ['super-admin', 'admin', 'hr', 'finance', 'manager'].includes(role);
};

export const canApproveDocuments = (role: string): boolean => {
    return ['super-admin', 'admin', 'hr', 'finance', 'manager'].includes(role);
};

export const canViewDocuments = (role: string): boolean => {
    return ['super-admin', 'admin', 'hr', 'finance', 'manager'].includes(role);
};

export const canUploadDocuments = (_role: string): boolean => {
    return true; // All roles can upload
};
