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
                        avatar: (userData.avatar && 
                                 userData.avatar.trim() !== '' && 
                                 userData.avatar !== 'null' && 
                                 userData.avatar !== 'undefined')
                            ? userData.avatar
                            : null,
                        firstName: userData.firstName,
                        lastName: userData.lastName,
                        hasProfile: userData.hasProfile,
                        needsPasswordSetup: userData.needsPasswordSetup,
                        microsoftId: userData.microsoftId
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

    const [storageError, setStorageError] = useState(false);

    const login = (userData: User | ((prev: User | null) => User)) => {
        setUser(prev => {
            const newUser = typeof userData === 'function' ? userData(prev) : userData;
            
            // Persist to sessionStorage matching the app's pattern
            // Wrap in try-catch to prevent crash if quota exceeded
            try {
                // If the avatar is a massive base64 string, don't persist it to storage
                // (keeps storage light and prevents QuotaExceededError)
                let storageUser = newUser;
                if (newUser?.avatar && newUser.avatar.startsWith('data:')) {
                    storageUser = { ...newUser, avatar: prev?.avatar || '' };
                }
                
                sessionStorage.setItem('itcs_user', JSON.stringify(storageUser));
                sessionStorage.setItem('itcs_auth', 'true');
                setStorageError(false);
            } catch (e: any) {
                console.warn('Failed to persist user to sessionStorage:', e);
                // Specifically detect quota errors
                if (e.name === 'QuotaExceededError' || e.code === 22) {
                    setStorageError(true);
                }
            }
            return newUser;
        });
    };

    const logout = () => {
        localStorage.removeItem('token');
        sessionStorage.clear();
        setUser(null);
        setStorageError(false);
        navigate('/login');
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated: !!user }}>
            {storageError && (
                <div className="fixed top-4 right-4 z-[9999] bg-amber-50 border border-amber-200 p-4 rounded-2xl shadow-xl max-w-sm animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="flex gap-3">
                        <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
                            <span className="text-amber-600 font-bold">!</span>
                        </div>
                        <div>
                            <p className="font-bold text-amber-900 text-sm">Storage Warning</p>
                            <p className="text-amber-700 text-xs mt-1">
                                Your browser storage is full. Some profile changes might not persist after refreshing.
                            </p>
                            <button 
                                onClick={() => setStorageError(false)}
                                className="mt-2 text-[10px] font-bold text-amber-600 hover:text-amber-800 uppercase tracking-wider"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                </div>
            )}
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


