import { AuthRequest } from './auth';
import Employee from '../models/Employee';

export enum Permission {
    CREATE_USER = 'create_user',
    VIEW_PERSONAL_INFO = 'view_personal_info',
    EDIT_SENSITIVE_DATA = 'edit_sensitive_data',
    APPROVE_DOCUMENTS = 'approve_documents',
}

/**
 * Check if user can create new users
 * Allowed: super-admin, admin
 */
export const canCreateUser = (role: string): boolean => {
    return role === 'super-admin' || role === 'admin';
};

/**
 * Check if user can view an employee's personal info
 * - super-admin, admin: All employees
 * - manager: Only direct reports
 * - employee: Only own profile
 */
export const canViewEmployee = async (
    role: string,
    userId: string,
    targetEmployeeId?: string,
    targetEmployee?: any
): Promise<boolean> => {
    if (role === 'super-admin' || role === 'admin') {
        return true; // Can view all employees
    }

    if (role === 'manager') {
        if (!targetEmployeeId && !targetEmployee) {
            return false;
        }
        
        // Get the target employee record
        const employee = targetEmployee || await Employee.findOne({ employeeId: targetEmployeeId });
        if (!employee) return false;

        // Get manager's own employee record via userId (DB lookup — not trusting free-text input)
        const managerEmployee = await Employee.findOne({ userId });
        if (!managerEmployee) return false;

        // Allow viewing own record
        if (managerEmployee.employeeId === employee.employeeId) return true;

        // Check if the target employee's reportingManager matches manager's employeeId (from DB)
        // This prevents spoofing by comparing against actual DB record, not user input
        return employee.jobInfo?.reportingManager === managerEmployee.employeeId;
    }

    if (role === 'employee') {
        // Can only view own profile — use userId.toString() for ObjectId compat
        const employee = await Employee.findOne({ userId });
        if (!employee) return false;
        
        if (targetEmployeeId) {
            return employee.employeeId === targetEmployeeId;
        }
        if (targetEmployee) {
            return employee.employeeId === targetEmployee.employeeId;
        }
        return false;
    }

    return false;
};

/**
 * Check if user can edit sensitive data
 * Allowed: super-admin, admin
 * View only: employee
 */
export const canEditSensitiveData = (role: string): boolean => {
    return role === 'super-admin' || role === 'admin';
};

/**
 * Check if user can approve documents
 * Allowed: super-admin, admin
 * View only: manager
 * Upload only: employee
 */
export const canApproveDocuments = (role: string): boolean => {
    return role === 'super-admin' || role === 'admin';
};

export const canViewDocuments = (role: string): boolean => {
    return role === 'super-admin' || role === 'admin' || role === 'manager';
};

export const canUploadDocuments = (role: string): boolean => {
    return true; // All roles can upload
};

