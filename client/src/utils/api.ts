// Single source of truth for API base URL
// Strip /api suffix if present so all paths below are always correct
const rawBase = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/+$/, '');
const API_BASE_URL = rawBase.endsWith('/api') ? rawBase.slice(0, -4) : rawBase;

export const api = {
    baseURL: API_BASE_URL,
    employees: `${API_BASE_URL}/api/employees`,
    directory: `${API_BASE_URL}/api/employees/directory`,
    todaySpecials: `${API_BASE_URL}/api/employees/today-specials`,
    audit: `${API_BASE_URL}/api/audit-logs`,
    auth: `${API_BASE_URL}/api/auth`,
    admin: `${API_BASE_URL}/api/admin`,
    config: `${API_BASE_URL}/api/config`,
    attendance: `${API_BASE_URL}/api/attendance`,
    attendanceToday: `${API_BASE_URL}/api/attendance/today`,
    // Legacy attendance routes removed
    zkt: `${API_BASE_URL}/api/attendance/zkt`,
    attendanceLocations: `${API_BASE_URL}/api/attendance/locations`,
    attendanceDevices: `${API_BASE_URL}/api/attendance/devices`,
    attendanceExport: `${API_BASE_URL}/api/attendance/export`,
    workShifts: `${API_BASE_URL}/api/work-shifts`,

    // Expense Claims & Categories
    expenseCategories: `${API_BASE_URL}/api/expense-categories`,
    expenseCategoriesAll: `${API_BASE_URL}/api/expense-categories/all`,
    expenseCategory: (id: string) => `${API_BASE_URL}/api/expense-categories/${id}`,
    claims: `${API_BASE_URL}/api/claims`,
    claimMine: `${API_BASE_URL}/api/claims/mine`,
    claimAll: `${API_BASE_URL}/api/claims/all`,
    claimPendingApprovals: `${API_BASE_URL}/api/claims/approvals/pending`,
    claimProfileProgress: `${API_BASE_URL}/api/claims/profile-progress`,
    claimBulkDecision: `${API_BASE_URL}/api/claims/bulk-decision`,
    claimPreviewReceipts: `${API_BASE_URL}/api/claims/preview-receipts`,
    claimDecision: (id: string) => `${API_BASE_URL}/api/claims/${id}/decision`,
    claimAdminCorrect: (id: string) => `${API_BASE_URL}/api/claims/${id}/admin-correct`,
    claimReceipt: (id: string, receiptId: string) => `${API_BASE_URL}/api/claims/${id}/receipts/${receiptId}`,

    // ZKTeco Cloud API proxy endpoints (server proxies to 192.168.0.74:8081)
    zktStatus:       `${API_BASE_URL}/api/attendance/zkt/status`,
    zktEmployees:    `${API_BASE_URL}/api/attendance/zkt/employees`,
    zktTransactions: `${API_BASE_URL}/api/attendance/zkt/transactions`,
    zktReport:       `${API_BASE_URL}/api/attendance/zkt/report`,
    zktSyncState:    `${API_BASE_URL}/api/attendance/zkt/sync-state`,
    zktSync:         `${API_BASE_URL}/api/attendance/zkt/sync`,
    zktSyncReport:   `${API_BASE_URL}/api/attendance/zkt/sync-report`,

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
};

export default api;
