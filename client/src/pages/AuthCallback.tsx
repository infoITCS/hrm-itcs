import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import APIService from '../services/api';
import type { User, UserRole } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../utils/api';

export const AuthCallback: React.FC = () => {
    const navigate = useNavigate();
    const { login } = useAuth();

    useEffect(() => {
        let cancelled = false;

        const handleCallback = async () => {
            try {
                // Get token from query (?token=) or hash (#token=) — hash avoids truncation of long JWTs
                const searchParams = new URLSearchParams(window.location.search);
                const hashPart = window.location.hash ? window.location.hash.slice(1) : '';
                const hashParams = new URLSearchParams(hashPart);

                let token = searchParams.get('token') || hashParams.get('token');
                if (token) token = decodeURIComponent(token);
                const error = searchParams.get('error') || hashParams.get('error');

                if (error) {
                    console.error('Auth error:', error);
                    navigate('/login');
                    return;
                }

                if (!token) {
                    console.error('No token found');
                    navigate('/login');
                    return;
                }

                // Save token for future requests
                localStorage.setItem('token', token);

                // Fetch user details using this token explicitly (avoids race with interceptor)
                const userData = await APIService.getMe(token);

                if (cancelled) return; // StrictMode safety — ignore if effect was cleaned up

                const user: User = {
                    id: userData.id || userData._id,
                    name: [userData.firstName, userData.lastName].filter(Boolean).join(' ') || userData.email.split('@')[0],
                    email: userData.email,
                    role: userData.role as UserRole,
                    avatar: userData.avatar
                        ? (userData.avatar.startsWith('http')
                            ? userData.avatar
                            : `${api.baseURL.replace(/\/$/, '')}${userData.avatar}${userData.avatar.includes('/attachments/raw/') ? `?token=${token}` : ''}`)
                        : null,
                    firstName: userData.firstName,
                    lastName: userData.lastName,
                    microsoftId: userData.microsoftId,
                    hasProfile: userData.hasProfile,
                    needsPasswordSetup: userData.needsPasswordSetup,
                };

                // Persist session data
                sessionStorage.setItem('itcs_token', token);
                sessionStorage.setItem('itcs_user', JSON.stringify(user));
                sessionStorage.setItem('itcs_auth', 'true');

                // Log the user in first so they are authenticated
                login(user);

                // If first-time Microsoft user, redirect to dashboard with a flag
                // The Dashboard will detect this and show the password setup modal stably
                if (userData.needsPasswordSetup) {
                    navigate('/dashboard?setup-password=1', { replace: true });
                } else {
                    navigate('/dashboard', { replace: true });
                }
            } catch (error) {
                console.error('Failed to complete authentication:', error);
                if (!cancelled) navigate('/login');
            }
        };

        handleCallback();

        // Cleanup — prevents StrictMode double-run from causing duplicate navigation
        return () => { cancelled = true; };
    }, []); // Empty deps: run once on mount only

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
