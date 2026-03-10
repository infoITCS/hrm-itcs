// Single source of truth for API base URL
// Strip /api suffix if present so all paths below are always correct
const rawBase = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/+$/, '');
const API_BASE_URL = rawBase.endsWith('/api') ? rawBase.slice(0, -4) : rawBase;

export const api = {
    baseURL: API_BASE_URL,
    employees: `${API_BASE_URL}/api/employees`,
    todaySpecials: `${API_BASE_URL}/api/employees/today-specials`,
    auditLogs: `${API_BASE_URL}/api/audit-logs`,
    auth: `${API_BASE_URL}/api/auth`,
    admin: `${API_BASE_URL}/api/admin`,

    employee: (id: string) => `${API_BASE_URL}/api/employees/${id}`,
    employeeAttachments: (id: string) => `${API_BASE_URL}/api/employees/${id}/attachments`,
    // Appends ?token= so browser <img> tags can authenticate (they can't send headers)
    attachmentRaw: (id: string) => {
        const token = localStorage.getItem('token');
        return `${API_BASE_URL}/api/employees/attachments/raw/${id}${token ? `?token=${token}` : ''}`;
    },
    checkDuplicate: (cnic?: string, email?: string, employeeId?: string) => {
        const params = new URLSearchParams();
        if (cnic) params.append('cnic', cnic);
        if (email) params.append('email', email);
        if (employeeId) params.append('employeeId', employeeId);
        return `${API_BASE_URL}/api/employees/check-duplicate?${params.toString()}`;
    },
/*
    extractFromDocument: (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return fetch(`${API_BASE_URL}/api/ai/extract`, {
            method: 'POST',
            body: formData,
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        }).then(async res => {
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                console.error('[API] AI Extraction Failed:', res.status, errorData);
                throw new Error(errorData.message || `Server error: ${res.status}`);
            }
            return res.json();
        });
    }
    */
};

export default api;
