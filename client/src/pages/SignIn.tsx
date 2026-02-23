import { useState, useEffect } from 'react';
import type { User, UserRole } from '../types';
import APIService from '../services/api';
import itcsLogo from '../assets/logo.png'
interface SignInProps {
    onLogin: (user: User) => void;
}

export const SignIn: React.FC<SignInProps> = ({ onLogin }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showEmailForm, setShowEmailForm] = useState(false);

    // Check for error in URL (from SSO redirect)
    useEffect(() => {
        const params = new URLSearchParams(window.location.hash.split('?')[1]);
        const errorParam = params.get('error');
        if (errorParam) {
            const errorMap: Record<string, string> = {
                'access_denied': 'Access denied by Microsoft.',
                'microsoft_auth_failed': 'Microsoft authentication failed.',
                'no_code': 'No authorization code received.',
                'no_email': 'No email address found in your Microsoft account.',
                'callback_failed': 'Authentication callback failed. Please try again.',
                'server_error': 'Internal server error during authentication.'
            };
            setError(errorMap[errorParam] || decodeURIComponent(errorParam).replace(/_/g, ' '));
        }
    }, []);

    const handleMicrosoftLogin = (forceAccountSelection: boolean = false) => {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
        const url = forceAccountSelection
            ? `${apiUrl}/auth/microsoft?prompt=select_account`
            : `${apiUrl}/auth/microsoft`;
        console.log('Redirecting to Microsoft OAuth:', url);
        window.location.href = url;
    };

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await APIService.login(email, password);

            const user: User = {
                id: response.data.user._id || response.data.user.id,
                name: [response.data.user.firstName, response.data.user.lastName].filter(Boolean).join(' ') || response.data.user.email.split('@')[0],
                email: response.data.user.email,
                role: response.data.user.role as UserRole,
                avatar: response.data.user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(response.data.user.firstName || response.data.user.email)}`,
                firstName: response.data.user.firstName,
                lastName: response.data.user.lastName
            };

            onLogin(user);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex font-sans bg-gray-50">
            {/* Left Panel - Branding & Visuals */}
            <div className="hidden lg:flex w-1/2 bg-slate-900 relative overflow-hidden flex-col justify-between p-16 text-white">
                {/* Dynamic Background Effects */}
                <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                    <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] bg-primary rounded-full mix-blend-multiply filter blur-[100px] animate-blob"></div>
                    <div className="absolute top-[-20%] right-[-20%] w-[80%] h-[80%] bg-blue-600 rounded-full mix-blend-multiply filter blur-[100px] animate-blob animation-delay-2000"></div>
                    <div className="absolute bottom-[-20%] left-[20%] w-[80%] h-[80%] bg-indigo-600 rounded-full mix-blend-multiply filter blur-[100px] animate-blob animation-delay-4000"></div>
                </div>

                {/* Logo Area */}
                <div className="relative z-10 flex flex-col gap-6 items-start">
                    <img src={itcsLogo} alt="ITCS Logo" className="h-28 w-auto object-contain drop-shadow-2xl" />
                    <div className="flex flex-col gap-2">
                        <div className="h-1 w-12 bg-gradient-to-r from-primary to-blue-500 rounded-full"></div>
                        <p className="text-xs text-blue-200 font-bold tracking-[0.3em] uppercase opacity-90 text-shadow-sm">
                            Unified Workforce Platform
                        </p>
                    </div>
                </div>

                {/* Hero Text */}
                <div className="relative z-10 max-w-lg">
                    <h2 className="text-5xl font-bold mb-6 leading-tight">
                        Manage your team <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400">
                            with confidence.
                        </span>
                    </h2>
                    <p className="text-lg text-gray-400 leading-relaxed">
                        Experience the next generation of human resource management.
                        Streamlined workflows, insightful analytics, and a seamless employee experience.
                    </p>
                </div>

                {/* Footer Info */}
                <div className="relative z-10 flex gap-6 text-sm text-gray-500 font-medium">
                    <span>© 2026 ITCS</span>
                    <span className="w-px h-5 bg-gray-700"></span>
                    <span>Enterprise Edition</span>
                </div>
            </div>

            {/* Right Panel - Login Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8 lg:p-16 bg-white relative">
                <div className="w-full max-w-md space-y-8 animate-fadeIn">
                    {/* Mobile Logo (visible only on small screens) */}
                    <div className="lg:hidden flex flex-col items-start gap-2 mb-8">
                        <img src="/itcs-logo.webp" alt="ITCS Logo" className="h-12 w-auto" />
                        <span className="text-xs font-bold text-gray-500 tracking-widest uppercase">HRM Unified</span>
                    </div>

                    <div className="space-y-2">
                        <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Welcome back</h2>
                        <p className="text-gray-500">Please enter your details to sign in.</p>
                    </div>

                    {error && (
                        <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-r-md flex items-start gap-3 animate-shake">
                            <span className="material-symbols-outlined text-red-500 text-xl mt-0.5">error</span>
                            <p className="text-sm text-red-700 font-medium">{error}</p>
                        </div>
                    )}

                    {loading ? (
                        <div className="py-12 flex flex-col items-center justify-center space-y-4">
                            <div className="w-12 h-12 border-4 border-gray-100 border-t-primary rounded-full animate-spin"></div>
                            <p className="text-sm font-medium text-gray-500">Authenticating securely...</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {!showEmailForm ? (
                                /* SSO Login View */
                                <div className="space-y-6">
                                    <button
                                        onClick={() => handleMicrosoftLogin(false)}
                                        className="w-full group relative flex items-center justify-center gap-3 px-6 py-4 bg-[#2F2F2F] hover:bg-[#1a1a1a] text-white rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                                    >
                                        <div className="flex items-center justify-center w-6 h-6 bg-white rounded-sm p-[1px]">
                                            <svg className="w-full h-full" viewBox="0 0 23 23">
                                                <path fill="#f35325" d="M1 1h10v10H1z" />
                                                <path fill="#81bc06" d="M12 1h10v10H12z" />
                                                <path fill="#05a6f0" d="M1 12h10v10H1z" />
                                                <path fill="#ffba08" d="M12 12h10v10H12z" />
                                            </svg>
                                        </div>
                                        <span className="font-semibold text-lg">Sign in with Microsoft</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            console.log('Use different account clicked');
                                            handleMicrosoftLogin(true);
                                        }}
                                        className="w-full flex items-center justify-center gap-2 px-6 py-3 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-50 font-medium transition-all rounded-lg border border-transparent hover:border-gray-200 cursor-pointer active:scale-[0.98]"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                        Use a different Microsoft account
                                    </button>

                                    <div className="relative">
                                        <div className="absolute inset-0 flex items-center">
                                            <div className="w-full border-t border-gray-200"></div>
                                        </div>
                                        <div className="relative flex justify-center text-sm">
                                            <span className="px-4 bg-white text-gray-500 font-medium">or continue with</span>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => setShowEmailForm(true)}
                                        className="w-full flex items-center justify-center gap-2 px-6 py-3 border-2 border-gray-100 hover:border-primary/30 hover:bg-primary/5 rounded-xl text-gray-700 font-semibold transition-all duration-200"
                                    >
                                        <span className="material-symbols-outlined text-gray-500">mail</span>
                                        Email & Password
                                    </button>
                                </div>
                            ) : (
                                /* Email Login View */
                                <form onSubmit={handleEmailLogin} className="space-y-5 animate-slideUp">
                                    <div className="space-y-4">
                                        <div className="space-y-1">
                                            <label className="text-sm font-semibold text-gray-700 ml-1">Email address</label>
                                            <input
                                                type="email"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                required
                                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white outline-none transition-all duration-200"
                                                placeholder="name@company.com"
                                                autoFocus
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <div className="flex justify-between items-center ml-1">
                                                <label className="text-sm font-semibold text-gray-700">Password</label>
                                                <a href="#" className="text-xs font-semibold text-primary hover:text-primary/80">Forgot password?</a>
                                            </div>
                                            <input
                                                type="password"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                required
                                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white outline-none transition-all duration-200"
                                                placeholder="••••••••"
                                            />
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-primary/30 hover:shadow-primary/40 transition-all duration-200 transform hover:-translate-y-0.5"
                                    >
                                        Sign In
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setShowEmailForm(false)}
                                        className="w-full py-2 flex items-center justify-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-lg">arrow_back</span>
                                        Back to login options
                                    </button>
                                </form>
                            )}
                        </div>
                    )}

                    <div className="pt-6 text-center">
                        <p className="text-xs text-gray-400">
                            Protected by Enterprise Grade Security. <br />
                            By signing in, you agree to our <a href="#" className="underline hover:text-gray-600">Terms</a> and <a href="#" className="underline hover:text-gray-600">Privacy Policy</a>.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
