import { api } from './api';

/**
 * Returns the correct URL for an employee avatar.
 * Appends ?token= to attachment URLs so browser <img> tags can authenticate.
 */
export const getAvatarUrl = (emp: any) => {
    if (!emp) return null;

    const token = localStorage.getItem('token');
    const tokenSuffix = token ? `?token=${token}` : '';

    // 1. Check direct avatar field (could be a relative /api/employees/attachments/raw/... path)
    if (emp.avatar) {
        if (emp.avatar.startsWith('http')) return emp.avatar;
        const url = `${api.baseURL}${emp.avatar}`;
        // Append token only for attachment endpoints
        return emp.avatar.includes('/attachments/raw/') ? `${url}${tokenSuffix}` : url;
    }

    // 2. Check attachments array for "Profile Picture"
    const profileAtt = emp.attachments?.find((a: any) => a.fileType === 'Profile Picture');
    if (profileAtt) {
        return `${api.baseURL}/api/employees/attachments/raw/${profileAtt._id}${tokenSuffix}`;
    }

    // 3. Check userId-based avatar (from Auth context)
    if (emp.userAvatar) {
        return emp.userAvatar.startsWith('http') ? emp.userAvatar : `${api.baseURL}${emp.userAvatar}`;
    }

    return null;
};
