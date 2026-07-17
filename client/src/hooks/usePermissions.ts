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
        return !!user.permissions?.[moduleName];
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
        role: normalizedRole
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
        normalizedRole
    ]);
};

