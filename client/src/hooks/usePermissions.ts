import { useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';

export const usePermissions = () => {
    const { user } = useAuth();

    const normalizedRole = useMemo(() => (user?.role || 'employee').toLowerCase().trim(), [user?.role]);

    const canCreateUser = useCallback((): boolean => {
        if (!user) return false;
        return ['super-admin', 'admin', 'hr', 'manager'].includes(normalizedRole);
    }, [user, normalizedRole]);

    const canEditSensitiveData = useCallback((): boolean => {
        if (!user) return false;
        return ['super-admin', 'admin', 'hr', 'finance', 'manager'].includes(normalizedRole);
    }, [user, normalizedRole]);

    const canApproveDocuments = useCallback((): boolean => {
        if (!user) return false;
        return ['super-admin', 'admin', 'hr', 'finance', 'manager'].includes(normalizedRole);
    }, [user, normalizedRole]);

    const canViewDocuments = useCallback((): boolean => {
        if (!user) return false;
        return ['super-admin', 'admin', 'hr', 'finance', 'manager'].includes(normalizedRole);
    }, [user, normalizedRole]);

    const canUploadDocuments = useCallback((): boolean => {
        return true; // All roles can upload
    }, []);

    const canViewAllEmployees = useCallback((): boolean => {
        if (!user) return false;
        return ['super-admin', 'admin', 'hr', 'finance', 'manager'].includes(normalizedRole);
    }, [user, normalizedRole]);

    const canViewDirectReports = useCallback((): boolean => {
        if (!user) return false;
        return normalizedRole === 'manager';
    }, [user, normalizedRole]);

    const canViewOwnProfile = useCallback((): boolean => {
        if (!user) return false;
        return normalizedRole === 'employee';
    }, [user, normalizedRole]);

    const hasAccess = useCallback((moduleName: string): boolean => {
        if (!user) return false;
        if (normalizedRole === 'super-admin') return true;

        // Explicit custom per-user override takes precedence
        if (user.customPermissions && typeof user.customPermissions[moduleName] === 'boolean') {
            return user.customPermissions[moduleName];
        }

        // Provident Fund is an employee entitlement available to all active roles by default
        if (moduleName === 'provident-fund') {
            return true;
        }

        if (user.permissions && user.permissions[moduleName] === false) return false;
        if (user.permissions && user.permissions[moduleName] === true) return true;
        // Role defaults when permissions are not yet loaded (e.g. during impersonation)
        if (normalizedRole === 'admin') return true;
        if (normalizedRole === 'finance') {
            return ['dashboard', 'pim', 'leave', 'attendance', 'claim', 'payroll', 'requests', 'settings', 'provident-fund'].includes(moduleName);
        }
        if (normalizedRole === 'hr') {
            return ['dashboard', 'pim', 'leave', 'attendance', 'claim', 'requests', 'provident-fund'].includes(moduleName);
        }
        if (normalizedRole === 'manager') {
            return ['dashboard', 'pim', 'leave', 'attendance', 'claim', 'requests', 'provident-fund'].includes(moduleName);
        }
        return ['dashboard', 'leave', 'attendance', 'claim', 'requests', 'payroll', 'provident-fund'].includes(moduleName);
    }, [user, normalizedRole]);

    const getModuleScope = useCallback((moduleName: string): 'none' | 'employee' | 'manager' | 'admin' => {
        if (!user) return 'none';
        if (normalizedRole === 'super-admin') return 'admin';
        if (user.permissions && user.permissions[moduleName] === false) return 'none';
        if (user.scopes && user.scopes[moduleName]) {
            return user.scopes[moduleName] as any;
        }
        if (normalizedRole === 'admin') return 'admin';
        if (normalizedRole === 'hr' && ['pim', 'leave', 'attendance', 'requests'].includes(moduleName)) return 'admin';
        if (normalizedRole === 'finance' && ['payroll', 'claim', 'provident-fund'].includes(moduleName)) return 'admin';
        if (normalizedRole === 'manager') return 'manager';
        return 'employee';
    }, [user, normalizedRole]);

    const isModuleAdmin = useCallback((moduleName: string): boolean => {
        return getModuleScope(moduleName) === 'admin';
    }, [getModuleScope]);

    const isModuleManagerOrAbove = useCallback((moduleName: string): boolean => {
        const scope = getModuleScope(moduleName);
        return scope === 'manager' || scope === 'admin';
    }, [getModuleScope]);

    const hasSubAccess = useCallback((moduleName: string, subTabKey: string): boolean => {
        if (!user) return false;
        if (normalizedRole === 'super-admin') return true;

        // If whole module is disabled, no sub-tab is accessible
        if (user.permissions && user.permissions[moduleName] === false) return false;

        const fullKey = `${moduleName}:${subTabKey}`;
        if (user.subPermissions && typeof user.subPermissions[fullKey] === 'boolean') {
            return user.subPermissions[fullKey];
        }

        // Sub-tabs restricted to super-admin/admin by default (e.g., company-wide PF is not given to finance by default)
        if (moduleName === 'provident-fund') {
            if (subTabKey === 'company-pf') {
                return ['super-admin', 'admin'].includes(normalizedRole);
            }
        }

        return true;
    }, [user, normalizedRole]);

    return useMemo(() => ({
        canCreateUser,
        canEditSensitiveData,
        canApproveDocuments,
        canViewDocuments,
        canUploadDocuments,
        canViewAllEmployees,
        canViewDirectReports,
        canViewOwnProfile,
        hasAccess,
        hasSubAccess,
        getModuleScope,
        isModuleAdmin,
        isModuleManagerOrAbove,
        role: normalizedRole,
        subPermissions: user?.subPermissions || {}
    }), [
        canCreateUser,
        canEditSensitiveData,
        canApproveDocuments,
        canViewDocuments,
        canUploadDocuments,
        canViewAllEmployees,
        canViewDirectReports,
        canViewOwnProfile,
        hasAccess,
        hasSubAccess,
        getModuleScope,
        isModuleAdmin,
        isModuleManagerOrAbove,
        normalizedRole,
        user?.subPermissions
    ]);
};

