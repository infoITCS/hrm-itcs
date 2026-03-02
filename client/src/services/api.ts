import axios from 'axios';

// Origin only: strip trailing slashes and /api so env can be with or without /api
const rawBase = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/+$/, '');
const API_ORIGIN = rawBase.endsWith('/api') ? rawBase.slice(0, -4) : rawBase;

// Explicit full URLs for auth so we always hit /api/auth/... (no dependency on baseURL)
const AUTH_ME_URL = `${API_ORIGIN}/api/auth/me`;
const AUTH_LOGIN_URL = `${API_ORIGIN}/api/auth/login`;

const apiClient = axios.create({
    baseURL: API_ORIGIN,
    headers: {
        'Content-Type': 'application/json',
    },
});

apiClient.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Auto-logout on expired/invalid token
apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            sessionStorage.clear();
            // Only redirect if not already on login page
            if (!window.location.pathname.includes('/login')) {
                window.location.href = '/login?expired=true';
            }
        }
        return Promise.reject(error);
    }
);

const APIService = {
    login: async (email: string, password: string) => {
        const response = await apiClient.post(AUTH_LOGIN_URL, { email, password });
        return response;
    },
    getMe: async () => {
        const response = await apiClient.get(AUTH_ME_URL);
        return response.data;
    },
    changePassword: async (currentPassword: string, newPassword: string) => {
        const response = await apiClient.post(`${API_ORIGIN}/api/auth/change-password`, { currentPassword, newPassword });
        return response.data;
    },
    forgotPassword: async (email: string) => {
        const response = await apiClient.post(`${API_ORIGIN}/api/auth/forgot-password`, { email });
        return response.data;
    },
    resetPassword: async (token: string, newPassword: string) => {
        const response = await apiClient.post(`${API_ORIGIN}/api/auth/reset-password`, { token, newPassword });
        return response.data;
    }
};

export default APIService;
