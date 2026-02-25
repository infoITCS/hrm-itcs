// API Configuration: use origin only (no /api) so paths like /api/auth, /api/employees never double
const rawBase = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/+$/, '');
const API_BASE_URL = rawBase.endsWith('/api') ? rawBase.slice(0, -4) : rawBase;

export const api = {
    baseURL: API_BASE_URL,
    employees: `${API_BASE_URL}/api/employees`,
    auditLogs: `${API_BASE_URL}/api/audit-logs`,
    auth: `${API_BASE_URL}/api/auth`,

    employee: (id: string) => `${API_BASE_URL}/api/employees/${id}`,
    employeeAttachments: (id: string) => `${API_BASE_URL}/api/employees/${id}/attachments`,
    attachmentRaw: (id: string) => `${API_BASE_URL}/api/employees/attachments/raw/${id}`,
};

export default api;


