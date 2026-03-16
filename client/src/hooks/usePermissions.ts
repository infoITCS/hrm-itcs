import { useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';

export const usePermissions = () => {
    const { user } = useAuth();

    const canCreateUser = useCallback((): boolean => {
        if (!user) return false;
        return user.role === 'super-admin' || user.role === 'admin' || user.role === 'manager';
    }, [user]);

    const canEditSensitiveData = useCallback((): boolean => {
        if (!user) return false;
        return user.role === 'super-admin' || user.role === 'admin' || user.role === 'manager';
    }, [user]);

    const canApproveDocuments = useCallback((): boolean => {
        if (!user) return false;
        return user.role === 'super-admin' || user.role === 'admin' || user.role === 'manager';
    }, [user]);

    const canViewDocuments = useCallback((): boolean => {
        if (!user) return false;
        return user.role === 'super-admin' || user.role === 'admin' || user.role === 'manager';
    }, [user]);

    const canUploadDocuments = useCallback((): boolean => {
        return true; // All roles can upload
    }, []);

    const canViewAllEmployees = useCallback((): boolean => {
        if (!user) return false;
        return user.role === 'super-admin' || user.role === 'admin' || user.role === 'manager';
    }, [user]);

    const canViewDirectReports = useCallback((): boolean => {
        if (!user) return false;
        return user.role === 'manager';
    }, [user]);

    const canViewOwnProfile = useCallback((): boolean => {
        if (!user) return false;
        return user.role === 'employee';
    }, [user]);

    return useMemo(() => ({
        canCreateUser,
        canEditSensitiveData,
        canApproveDocuments,
        canViewDocuments,
        canUploadDocuments,
        canViewAllEmployees,
        canViewDirectReports,
        canViewOwnProfile,
        role: user?.role || 'employee'
    }), [
        canCreateUser,
        canEditSensitiveData,
        canApproveDocuments,
        canViewDocuments,
        canUploadDocuments,
        canViewAllEmployees,
        canViewDirectReports,
        canViewOwnProfile,
        user?.role
    ]);
};

