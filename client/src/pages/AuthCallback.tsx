import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import APIService from '../services/api';
import type { User, UserRole } from '../types';
import { useAuth } from '../contexts/AuthContext';

export const AuthCallback: React.FC = () => {
    const navigate = useNavigate();
    const { login } = useAuth();

    useEffect(() => {
        const handleCallback = async () => {
            try {
                // Get token from URL
                // Check standard search params first, fallback to hash splitting if needed
                const searchParams = new URLSearchParams(window.location.search);
                const hashParams = new URLSearchParams(window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '');
                
                const token = searchParams.get('token') || hashParams.get('token');
                const error = searchParams.get('error') || hashParams.get('error');

                if (error) {
                    console.error('Auth error:', error);
                    navigate('/login'); // Redirect to login page
                    return;
                }

                if (!token) {
                    console.error('No token found');
                    navigate('/login');
                    return;
                }

                // Save token to localStorage (more common than sessionStorage for auth persistence, but using sessionStorage as per request code logic if preferred, though usually localStorage is better for staying logged in)
                // The original request code used sessionStorage. Let's stick to localStorage for better UX or match the request.
                // Wait, the request specifically used `sessionStorage.setItem('itcs_token', token);`. I should respect that, but `api.ts` uses `localStorage.getItem('token')`.
                // Let's fix that inconsistency. I'll use localStorage to match api.ts.
                // Save token to localStorage immediately so APIService can use it in interceptors
                localStorage.setItem('token', token);

                // Fetch user details
                const userData = await APIService.getMe();

                const user: User = {
                    id: userData.id || userData._id,
                    name: [userData.firstName, userData.lastName].filter(Boolean).join(' ') || userData.email.split('@')[0],
                    email: userData.email,
                    role: userData.role as UserRole,
                    avatar: userData.avatar || 'https://ui-avatars.com/api/?name=' + (userData.firstName || 'User'),
                    firstName: userData.firstName,
                    lastName: userData.lastName,
                    hasProfile: userData.hasProfile
                };

                // User requested session storage keys, I'll add them too just in case other parts need them
                sessionStorage.setItem('itcs_token', token);
                sessionStorage.setItem('itcs_user', JSON.stringify(user));
                sessionStorage.setItem('itcs_auth', 'true');

                login(user);

                // Redirect based on profile status
                if (!user.hasProfile) {
                    navigate('/onboarding');
                } else {
                    navigate('/dashboard');
                }
            } catch (error) {
                console.error('Failed to complete authentication:', error);
                navigate('/login');
            }
        };

        handleCallback();
    }, [navigate, login]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center">
                <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="mt-6 text-lg font-semibold text-gray-700">Completing sign in...</p>
                <p className="mt-2 text-sm text-gray-500">Please wait while we set up your account</p>
            </div>
        </div>
    );
};
