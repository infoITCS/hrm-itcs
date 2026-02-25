import axios from 'axios';

// Origin only (no /api): backend routes are /api/auth/me, /api/auth/login, etc.
const rawBase = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/+$/, '');
const API_ORIGIN = rawBase.endsWith('/api') ? rawBase.slice(0, -4) : rawBase;

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

const APIService = {
    login: async (email: string, password: string) => {
        return apiClient.post('/api/auth/login', { email, password });
    },
    getMe: async () => {
        const response = await apiClient.get('/api/auth/me');
        return response.data;
    },
};

export default APIService;
