// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const api = {
    baseURL: API_BASE_URL,
    employees: `${API_BASE_URL}/api/employees`,
    auditLogs: `${API_BASE_URL}/api/audit-logs`,
    
    // Helper function to build employee-specific URLs
    employee: (id: string) => `${API_BASE_URL}/api/employees/${id}`,
    employeeAttachments: (id: string) => `${API_BASE_URL}/api/employees/${id}/attachments`,
};

export default api;

