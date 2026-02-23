import { api } from './api';

/**
 * Returns the correct URL for an employee avatar
 * Handles full URLs, relative paths, and fallback to attachments
 */
export const getAvatarUrl = (emp: any) => {
    if (!emp) return null;

    // 1. Check direct avatar field
    if (emp.avatar) {
        return emp.avatar.startsWith('http') ? emp.avatar : `${api.baseURL}${emp.avatar}`;
    }

    // 2. Check attachments for "Profile Picture"
    const profileAtt = emp.attachments?.find((a: any) => a.fileType === 'Profile Picture');
    if (profileAtt) {
        return `${api.baseURL}/api/employees/attachments/raw/${profileAtt._id}`;
    }

    // 3. Check userId-based avatar (from Auth)
    if (emp.userAvatar) {
        return emp.userAvatar.startsWith('http') ? emp.userAvatar : `${api.baseURL}${emp.userAvatar}`;
    }

    return null;
};
