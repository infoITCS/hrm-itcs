import axios from 'axios';

// Base URL must end with /api so GET /auth/me hits /api/auth/me (backend mounts auth at /api/auth)
const rawBase = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/+$/, '');
const API_BASE_URL = rawBase.endsWith('/api') ? rawBase : `${rawBase}/api`;

const apiClient = axios.create({
    baseURL: API_BASE_URL,
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
        return apiClient.post('/auth/login', { email, password });
    },
    getMe: async () => {
        // Assuming the backend has an endpoint to get current user details
        // Adjust endpoint if strictly different, e.g. /users/me or /auth/me
        const response = await apiClient.get('/auth/me');
        return response.data;
    },
};

export default APIService;
