import { useAuth } from '../contexts/AuthContext';

export const usePermissions = () => {
    const { user } = useAuth();

    const canCreateUser = (): boolean => {
        if (!user) return false;
        return user.role === 'super-admin' || user.role === 'admin';
    };

    const canEditSensitiveData = (): boolean => {
        if (!user) return false;
        return user.role === 'super-admin' || user.role === 'admin';
    };

    const canApproveDocuments = (): boolean => {
        if (!user) return false;
        return user.role === 'super-admin' || user.role === 'admin';
    };

    const canViewDocuments = (): boolean => {
        if (!user) return false;
        return user.role === 'super-admin' || user.role === 'admin' || user.role === 'manager';
    };

    const canUploadDocuments = (): boolean => {
        return true; // All roles can upload
    };

    const canViewAllEmployees = (): boolean => {
        if (!user) return false;
        return user.role === 'super-admin' || user.role === 'admin';
    };

    const canViewDirectReports = (): boolean => {
        if (!user) return false;
        return user.role === 'manager';
    };

    const canViewOwnProfile = (): boolean => {
        if (!user) return false;
        return user.role === 'employee';
    };

    return {
        canCreateUser,
        canEditSensitiveData,
        canApproveDocuments,
        canViewDocuments,
        canUploadDocuments,
        canViewAllEmployees,
        canViewDirectReports,
        canViewOwnProfile,
        role: user?.role || 'employee'
    };
};

