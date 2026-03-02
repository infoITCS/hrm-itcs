import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from '../types';
import APIService from '../services/api';
import { api } from '../utils/api';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: (userData: User | ((prev: User | null) => User)) => void;
    logout: () => void;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    // Check if user is logged in on mount
    useEffect(() => {
        const checkAuth = async () => {
            const token = localStorage.getItem('token');
            if (token) {
                try {
                    const userData = await APIService.getMe();
                    const user: User = {
                        id: userData.id || userData._id,
                        name: [userData.firstName, userData.lastName].filter(Boolean).join(' ') || userData.email.split('@')[0],
                        email: userData.email,
                        role: userData.role,
                        avatar: userData.avatar
                            ? (userData.avatar.startsWith('http')
                                ? userData.avatar
                                : `${api.baseURL}${userData.avatar}${userData.avatar.includes('/attachments/raw/') ? `?token=${token}` : ''}`)
                            : `https://ui-avatars.com/api/?name=${encodeURIComponent([userData.firstName, userData.lastName].filter(Boolean).join(' ') || userData.email.split('@')[0])}&background=random`,
                        firstName: userData.firstName,
                        lastName: userData.lastName,
                        hasProfile: userData.hasProfile
                    };
                    setUser(user);
                } catch (error) {
                    console.error('Auth check failed:', error);
                    localStorage.removeItem('token');
                    sessionStorage.clear();
                }
            }
            setLoading(false);
        };
        checkAuth();
    }, []);

    const login = (userData: User | ((prev: User | null) => User)) => {
        setUser(prev => {
            const newUser = typeof userData === 'function' ? userData(prev) : userData;
            // Persist to sessionStorage matching the app's pattern
            sessionStorage.setItem('itcs_user', JSON.stringify(newUser));
            sessionStorage.setItem('itcs_auth', 'true');
            return newUser;
        });
    };

    const logout = () => {
        localStorage.removeItem('token');
        sessionStorage.clear();
        setUser(null);
        navigate('/login');
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated: !!user }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};


