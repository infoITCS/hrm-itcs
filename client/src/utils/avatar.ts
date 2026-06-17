import { api } from './api';

/**
 * Returns the correct URL for an employee avatar.
 * Appends ?token= to attachment URLs so browser <img> tags can authenticate.
 */
export const getAvatarUrl = (empOrString: any) => {
    if (!empOrString) return null;

    const token = localStorage.getItem('token');
    const tokenSuffix = token ? `?token=${token}` : '';

    // Handle string inputs (direct avatar URL)
    if (typeof empOrString === 'string') {
        if (empOrString.startsWith('http') || empOrString.startsWith('data:')) return empOrString;
        const url = `${api.baseURL.replace(/\/$/, '')}${empOrString.startsWith('/') ? '' : '/'}${empOrString}`;
        return empOrString.includes('/attachments/raw/') ? `${url}${tokenSuffix}` : url;
    }

    const emp = empOrString;
    // 1. Check direct avatar field (could be a relative /api/employees/attachments/raw/... path)
    if (emp.avatar) {
        if (emp.avatar.startsWith('http') || emp.avatar.startsWith('data:')) return emp.avatar;
        const url = `${api.baseURL.replace(/\/$/, '')}${emp.avatar.startsWith('/') ? '' : '/'}${emp.avatar}`;
        // Append token only for attachment endpoints
        return emp.avatar.includes('/attachments/raw/') ? `${url}${tokenSuffix}` : url;
    }

    // 2. Check attachments array for "Profile Picture" – use the LAST one (most recently uploaded)
    const profileAtts = emp.attachments?.filter((a: any) => a.fileType === 'Profile Picture') || [];
    const profileAtt = profileAtts[profileAtts.length - 1];
    if (profileAtt) {
        return `${api.baseURL}/api/employees/attachments/raw/${profileAtt._id}${tokenSuffix}`;
    }

    // 3. Check userId-based avatar (from Auth context)
    if (emp.userAvatar) {
        return emp.userAvatar.startsWith('http') || emp.userAvatar.startsWith('data:') 
            ? emp.userAvatar 
            : `${api.baseURL}${emp.userAvatar.startsWith('/') ? '' : '/'}${emp.userAvatar}`;
    }

    return null;
};
