import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Lock, ShieldCheck, X, AlertCircle, Loader2, KeyRound, Check, RefreshCw, Mail, Key, ArrowLeft, ShieldAlert } from 'lucide-react';
import axios from 'axios';
import { api } from '../../utils/api';
import { usePermissions } from '../../hooks/usePermissions';

interface SalaryPinModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    title?: string;
    description?: string;
    requireMasterPin?: boolean;
}

export const SalaryPinModal: React.FC<SalaryPinModalProps> = ({
    isOpen,
    onClose,
    onSuccess,
    title = 'Financial Security Verification',
    description = 'Enter your 4-digit Security PIN to reveal confidential salary and financial data.',
    requireMasterPin = false
}) => {
    const { role: currentUserRole } = usePermissions();
    const isSuperAdmin = currentUserRole === 'super-admin';
    const isPrivileged = ['super-admin', 'hr', 'admin', 'finance'].includes(currentUserRole);

    // Modes: 'checking' | 'verify' | 'setup-create' | 'setup-confirm' | 'otp-request' | 'otp-verify'
    const [mode, setMode] = useState<'checking' | 'verify' | 'setup-create' | 'setup-confirm' | 'otp-request' | 'otp-verify'>('checking');
    const [pin, setPin] = useState<string[]>(['', '', '', '']);
    const [createdPin, setCreatedPin] = useState<string>('');
    const [otpCode, setOtpCode] = useState<string>('');
    const [newMasterPin, setNewMasterPin] = useState<string>('');
    const [maskedEmail, setMaskedEmail] = useState<string>('');
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const inputRefs = [
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null)
    ];

    const authHeader = () => ({
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });

    useEffect(() => {
        if (!isOpen) {
            setPin(['', '', '', '']);
            setCreatedPin('');
            setOtpCode('');
            setNewMasterPin('');
            setError(null);
            setSuccessMessage(null);
            return;
        }

        const checkStatus = async () => {
            setLoading(true);
            setError(null);

            if (requireMasterPin) {
                // Master PIN mode always goes directly to verify
                setMode('verify');
                setLoading(false);
                return;
            }

            try {
                const res = await axios.get(api.salaryPinStatus, authHeader());
                if (res.data.hasPin || isPrivileged) {
                    setMode('verify');
                } else {
                    setMode('setup-create');
                }
            } catch (err: any) {
                setMode('verify');
            } finally {
                setLoading(false);
            }
        };

        checkStatus();
    }, [isOpen, requireMasterPin, isPrivileged]);

    useEffect(() => {
        if (isOpen && (mode === 'verify' || mode === 'setup-create' || mode === 'setup-confirm')) {
            setTimeout(() => {
                inputRefs[0].current?.focus();
            }, 100);
        }
    }, [isOpen, mode]);

    if (!isOpen) return null;

    const handleInputChange = (index: number, value: string) => {
        setError(null);
        const digit = value.replace(/\D/g, '').slice(-1);
        const newPin = [...pin];
        newPin[index] = digit;
        setPin(newPin);

        if (digit && index < 3) {
            inputRefs[index + 1].current?.focus();
        }

        if (digit && index === 3 && newPin.every(d => d !== '')) {
            submitPin(newPin.join(''));
        }
    };

    const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace' && !pin[index] && index > 0) {
            inputRefs[index - 1].current?.focus();
        } else if (e.key === 'ArrowLeft' && index > 0) {
            inputRefs[index - 1].current?.focus();
        } else if (e.key === 'ArrowRight' && index < 3) {
            inputRefs[index + 1].current?.focus();
        }
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
        if (pasted.length === 4) {
            const digits = pasted.split('');
            setPin(digits);
            inputRefs[3].current?.focus();
            submitPin(pasted);
        }
    };

    const handleKeypadPress = (num: number) => {
        const firstEmpty = pin.findIndex(d => d === '');
        if (firstEmpty !== -1) {
            handleInputChange(firstEmpty, String(num));
        }
    };

    const handleKeypadBackspace = () => {
        const lastFilled = pin.map(d => d !== '').lastIndexOf(true);
        if (lastFilled !== -1) {
            const newPin = [...pin];
            newPin[lastFilled] = '';
            setPin(newPin);
            inputRefs[lastFilled].current?.focus();
        }
    };

    const submitPin = async (fullPin: string) => {
        if (fullPin.length !== 4) {
            setError('Please enter a complete 4-digit PIN.');
            return;
        }

        setError(null);

        // ── MODE: VERIFY ──
        if (mode === 'verify') {
            setLoading(true);
            try {
                const endpoint = requireMasterPin ? api.masterPinVerify : api.salaryPinVerify;
                await axios.post(endpoint, { pin: fullPin }, authHeader());
                setSuccessMessage('Access Granted!');
                setTimeout(() => {
                    onSuccess();
                    onClose();
                }, 400);
            } catch (err: any) {
                setError(err.response?.data?.message || 'Incorrect 4-digit Security PIN.');
                setPin(['', '', '', '']);
                inputRefs[0].current?.focus();
            } finally {
                setLoading(false);
            }
        }
        // ── MODE: SETUP - CREATE ──
        else if (mode === 'setup-create') {
            setCreatedPin(fullPin);
            setPin(['', '', '', '']);
            setMode('setup-confirm');
            setTimeout(() => {
                inputRefs[0].current?.focus();
            }, 100);
        }
        // ── MODE: SETUP - CONFIRM ──
        else if (mode === 'setup-confirm') {
            if (fullPin !== createdPin) {
                setError('PINs do not match. Please try again.');
                setPin(['', '', '', '']);
                setMode('setup-create');
                return;
            }

            setLoading(true);
            try {
                await axios.post(api.salaryPinSet, { pin: fullPin }, authHeader());
                setSuccessMessage('PIN Created Successfully!');
                setTimeout(() => {
                    onSuccess();
                    onClose();
                }, 500);
            } catch (err: any) {
                setError(err.response?.data?.message || 'Failed to save PIN.');
                setPin(['', '', '', '']);
                setMode('setup-create');
            } finally {
                setLoading(false);
            }
        }
    };

    // ── Super Admin: Request Email OTP ──
    const handleRequestEmailOtp = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await axios.post(api.masterPinRequestOtp, {}, authHeader());
            setMaskedEmail(res.data.maskedEmail || 'Super Admin Email');
            setSuccessMessage(res.data.message || 'OTP dispatched to email.');
            setMode('otp-verify');
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to dispatch OTP email.');
        } finally {
            setLoading(false);
        }
    };

    // ── Super Admin: Confirm OTP & Set New Master PIN ──
    const handleConfirmOtpReset = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!otpCode || otpCode.trim().length !== 6) {
            setError('Please enter the 6-digit OTP received via email.');
            return;
        }
        if (!newMasterPin || !/^\d{4}$/.test(newMasterPin.trim())) {
            setError('New Master PIN must be exactly 4 numeric digits.');
            return;
        }

        setLoading(true);
        setError(null);
        try {
            await axios.post(api.masterPinConfirmReset, {
                otp: otpCode.trim(),
                newPin: newMasterPin.trim()
            }, authHeader());

            setSuccessMessage('Universal Master PIN Updated Successfully!');
            setTimeout(() => {
                setMode('verify');
                setPin(['', '', '', '']);
                setOtpCode('');
                setNewMasterPin('');
                setSuccessMessage(null);
            }, 1200);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Invalid or expired OTP code.');
        } finally {
            setLoading(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn overflow-y-auto">
            <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full max-h-[calc(100vh-2rem)] overflow-y-auto animate-scaleIn border border-slate-100 relative my-auto">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all z-10"
                    title="Cancel"
                >
                    <X size={18} />
                </button>

                <div className="p-6 text-center">
                    {/* Header Icon */}
                    <div className="w-14 h-14 bg-indigo-50 ring-8 ring-indigo-50/50 rounded-2xl flex items-center justify-center mx-auto mb-3.5 text-indigo-600">
                        {mode === 'otp-request' || mode === 'otp-verify' ? (
                            <Mail size={26} className="text-amber-600" />
                        ) : mode.startsWith('setup') ? (
                            <KeyRound size={26} />
                        ) : (
                            <Lock size={26} />
                        )}
                    </div>

                    {/* Title & Description */}
                    <h3 className="text-base font-bold text-slate-900 tracking-tight">
                        {mode === 'setup-create' ? 'Create 4-Digit Salary PIN' :
                         mode === 'setup-confirm' ? 'Confirm 4-Digit Salary PIN' :
                         mode === 'otp-request' ? 'Reset Master Financial PIN' :
                         mode === 'otp-verify' ? 'Email OTP Verification' :
                         requireMasterPin ? 'Universal Master Security Lock' :
                         title}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-[280px] mx-auto leading-relaxed">
                        {mode === 'setup-create' ? 'Choose a secure 4-digit code to protect your salary.' :
                         mode === 'setup-confirm' ? 'Re-enter your 4-digit code to confirm and save.' :
                         mode === 'otp-request' ? 'For security, changing the Universal Master PIN requires a 6-digit verification code sent to the Super Admin email.' :
                         mode === 'otp-verify' ? `Enter the 6-digit code sent to ${maskedEmail || 'your email'} and set your new 4-digit Master PIN.` :
                         description}
                    </p>

                    {/* Error & Success Alerts */}
                    {error && (
                        <div className="mt-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold px-3 py-1.5 rounded-xl flex items-center justify-center gap-1.5 animate-shake">
                            <AlertCircle size={13} className="shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {successMessage && (
                        <div className="mt-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold px-3 py-1.5 rounded-xl flex items-center justify-center gap-1.5">
                            <Check size={14} className="shrink-0" />
                            <span>{successMessage}</span>
                        </div>
                    )}

                    {/* ── SUB-VIEW: OTP REQUEST ── */}
                    {mode === 'otp-request' && (
                        <div className="mt-5 space-y-4">
                            <div className="p-3 bg-amber-50/80 rounded-2xl border border-amber-200/60 text-left flex items-start gap-2.5">
                                <ShieldAlert size={18} className="text-amber-600 shrink-0 mt-0.5" />
                                <p className="text-[11px] text-amber-800 leading-snug">
                                    A verification code will be sent to the official Super Admin email. Only verified administrators can authorize this change.
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => { setMode('verify'); setError(null); }}
                                    className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all flex items-center justify-center gap-1"
                                >
                                    <ArrowLeft size={14} /> Back
                                </button>
                                <button
                                    type="button"
                                    onClick={handleRequestEmailOtp}
                                    disabled={loading}
                                    className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                                >
                                    {loading ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                                    Send OTP Email
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── SUB-VIEW: OTP VERIFY & NEW PIN ── */}
                    {mode === 'otp-verify' && (
                        <form onSubmit={handleConfirmOtpReset} className="mt-5 space-y-3.5 text-left">
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                    6-Digit Email OTP
                                </label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={6}
                                    placeholder="e.g. 849201"
                                    value={otpCode}
                                    onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                                    className="w-full text-center tracking-[6px] text-lg font-mono font-black py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                                    required
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                    New 4-Digit Master PIN
                                </label>
                                <input
                                    type="password"
                                    inputMode="numeric"
                                    maxLength={4}
                                    placeholder="••••"
                                    value={newMasterPin}
                                    onChange={e => setNewMasterPin(e.target.value.replace(/\D/g, ''))}
                                    className="w-full text-center tracking-[8px] text-xl font-black py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                                    required
                                />
                            </div>

                            <div className="flex gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => { setMode('otp-request'); setError(null); }}
                                    className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all"
                                >
                                    Resend
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading || otpCode.length !== 6 || newMasterPin.length !== 4}
                                    className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                                >
                                    {loading ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={14} />}
                                    Update Master PIN
                                </button>
                            </div>
                        </form>
                    )}

                    {/* ── SUB-VIEW: PIN BOXES & KEYPAD ── */}
                    {(mode === 'verify' || mode === 'setup-create' || mode === 'setup-confirm') && (
                        <>
                            {/* 4 Digit Boxes */}
                            <div className="flex justify-center gap-3 my-5">
                                {pin.map((digit, i) => (
                                    <input
                                        key={i}
                                        ref={inputRefs[i]}
                                        type="password"
                                        inputMode="numeric"
                                        maxLength={1}
                                        value={digit}
                                        onChange={e => handleInputChange(i, e.target.value)}
                                        onKeyDown={e => handleKeyDown(i, e)}
                                        onPaste={handlePaste}
                                        disabled={loading}
                                        className={`w-12 h-13 text-center text-xl font-black rounded-xl border-2 transition-all outline-none ${
                                            digit
                                                ? 'border-indigo-600 bg-indigo-50/40 text-indigo-900 ring-2 ring-indigo-200'
                                                : 'border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-300 focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100'
                                        }`}
                                    />
                                ))}
                            </div>

                            {/* Numeric Keypad */}
                            <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto mb-2">
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                                    <button
                                        key={num}
                                        type="button"
                                        onClick={() => handleKeypadPress(num)}
                                        disabled={loading}
                                        className="h-10 rounded-xl bg-slate-100/80 hover:bg-slate-200/80 active:bg-indigo-100 active:text-indigo-600 text-sm font-bold text-slate-700 transition-colors cursor-pointer select-none"
                                    >
                                        {num}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => setPin(['', '', '', ''])}
                                    disabled={loading}
                                    className="h-10 rounded-xl bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-400 transition-colors cursor-pointer flex items-center justify-center"
                                    title="Clear"
                                >
                                    <RefreshCw size={13} />
                                </button>
                                <button
                                    key={0}
                                    type="button"
                                    onClick={() => handleKeypadPress(0)}
                                    disabled={loading}
                                    className="h-10 rounded-xl bg-slate-100/80 hover:bg-slate-200/80 active:bg-indigo-100 active:text-indigo-600 text-sm font-bold text-slate-700 transition-colors cursor-pointer select-none"
                                >
                                    0
                                </button>
                                <button
                                    type="button"
                                    onClick={handleKeypadBackspace}
                                    disabled={loading}
                                    className="h-10 rounded-xl bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-500 hover:text-rose-600 transition-colors cursor-pointer flex items-center justify-center select-none"
                                    title="Backspace"
                                >
                                    ⌫
                                </button>
                            </div>

                            {/* Reset Master PIN Option for Super Admin */}
                            {isSuperAdmin && mode === 'verify' && (
                                <div className="mt-3 text-center">
                                    <button
                                        type="button"
                                        onClick={() => { setMode('otp-request'); setError(null); }}
                                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors inline-flex items-center gap-1 py-1 px-2 rounded-lg hover:bg-indigo-50"
                                    >
                                        <Key size={12} /> Reset Master PIN via Email OTP
                                    </button>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="flex gap-2 pt-3">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs uppercase hover:bg-slate-200 transition-all cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => submitPin(pin.join(''))}
                                    disabled={loading || pin.some(d => d === '')}
                                    className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase shadow-md shadow-indigo-200 hover:shadow-indigo-300 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                    {loading ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                                    {mode === 'setup-create' ? 'Next' :
                                     mode === 'setup-confirm' ? 'Save PIN' :
                                     'Verify'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default SalaryPinModal;
