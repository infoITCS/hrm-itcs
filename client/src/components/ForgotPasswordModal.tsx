import { useState } from 'react';
import { createPortal } from 'react-dom';
import APIService from '../services/api';

interface ForgotPasswordModalProps {
    onClose: () => void;
}

const MailIcon = () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
    </svg>
);

const CheckCircleIcon = () => (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
);

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({ onClose }) => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim()) {
            setError('Please enter your email address.');
            return;
        }
        setError('');
        setLoading(true);
        try {
            const res = await APIService.forgotPassword(email.trim());
            console.log(res);
            setSuccess(true);
        } catch (err: any) {
            const message = err.response?.data?.message || 'Something went wrong. Please try again.';
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const modal = (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)' }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
                style={{ animation: 'modalIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
            >
                {/* Header */}
                <div className="relative bg-gradient-to-br from-indigo-600 to-violet-600 px-8 pt-8 pb-10 text-white text-center overflow-hidden">
                    {/* Decorative circles */}
                    <div className="absolute -top-6 -right-6 w-32 h-32 bg-white/10 rounded-full" />
                    <div className="absolute -bottom-8 -left-8 w-40 h-40 bg-white/5 rounded-full" />

                    {/* Close button */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 rounded-xl hover:bg-white/20 text-white/70 hover:text-white transition-all"
                        aria-label="Close"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>

                    <div className="relative z-10 inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/20 mb-4 shadow-inner">
                        <MailIcon />
                    </div>
                    <h2 className="relative z-10 text-2xl font-black tracking-tight">Forgot Password?</h2>
                    <p className="relative z-10 text-indigo-200 text-sm mt-1 font-medium">
                        No worries. We'll send you a reset link.
                    </p>
                </div>

                {/* Body */}
                <div className="px-8 py-8">
                    {success ? (
                        <div className="text-center py-4">
                            <div className="flex justify-center mb-4 text-emerald-500">
                                <CheckCircleIcon />
                            </div>
                            <h3 className="text-xl font-bold text-slate-800 mb-2">Check your inbox!</h3>
                            <p className="text-slate-500 text-sm leading-relaxed">
                                If an account exists for <span className="font-semibold text-indigo-600">{email}</span>, 
                                you'll receive a password reset link shortly.
                            </p>
                            <p className="text-slate-400 text-xs mt-3">
                                Don't see it? Check your spam folder.
                            </p>
                            <button
                                onClick={onClose}
                                className="mt-6 w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-indigo-200"
                            >
                                Back to Sign In
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <p className="text-slate-500 text-sm">
                                Enter the email address associated with your account and we'll send you a link to reset your password.
                            </p>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                    Email Address
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                                    placeholder="name@company.com"
                                    autoFocus
                                    className={`w-full px-4 py-3 bg-slate-50 border rounded-xl text-slate-800 font-medium outline-none transition-all duration-200 focus:bg-white
                                        ${error ? 'border-red-400 focus:ring-2 focus:ring-red-200' : 'border-slate-200 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400'}`}
                                />
                                {error && (
                                    <p className="text-red-500 text-xs font-semibold flex items-center gap-1 mt-1">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                        {error}
                                    </p>
                                )}
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M21 12a9 9 0 11-6.219-8.56" />
                                        </svg>
                                        Sending...
                                    </>
                                ) : (
                                    'Send Reset Link'
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={onClose}
                                className="w-full py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors flex items-center justify-center gap-1.5"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                    <polyline points="15 18 9 12 15 6" />
                                </svg>
                                Back to Sign In
                            </button>
                        </form>
                    )}
                </div>
            </div>

            <style>{`
                @keyframes modalIn {
                    from { opacity: 0; transform: scale(0.92) translateY(12px); }
                    to   { opacity: 1; transform: scale(1) translateY(0); }
                }
            `}</style>
        </div>
    );

    return createPortal(modal, document.body);
};
