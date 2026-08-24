import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Lock, ShieldCheck, X, AlertCircle, Loader2, KeyRound, Check, RefreshCw } from 'lucide-react';
import axios from 'axios';
import { api } from '../../utils/api';

interface SalaryPinModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    title?: string;
    description?: string;
}

export const SalaryPinModal: React.FC<SalaryPinModalProps> = ({
    isOpen,
    onClose,
    onSuccess,
    title = 'Salary Security Verification',
    description = 'Enter your 4-digit Security PIN to reveal confidential salary details.'
}) => {
    // Mode: 'checking' | 'verify' | 'setup-create' | 'setup-confirm'
    const [mode, setMode] = useState<'checking' | 'verify' | 'setup-create' | 'setup-confirm'>('checking');
    const [pin, setPin] = useState<string[]>(['', '', '', '']);
    const [createdPin, setCreatedPin] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);

    const inputRefs = [
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null)
    ];

    const authHeader = () => ({
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });

    // Check if user already has a PIN configured
    useEffect(() => {
        if (!isOpen) {
            setPin(['', '', '', '']);
            setCreatedPin('');
            setError(null);
            setSuccessMessage(null);
            return;
        }

        const checkStatus = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await axios.get(api.salaryPinStatus, authHeader());
                setIsSuperAdmin(res.data.isSuperAdmin || false);
                if (res.data.hasPin) {
                    setMode('verify');
                } else {
                    setMode('setup-create');
                }
            } catch (err: any) {
                // If endpoint fails, default to verify
                setMode('verify');
            } finally {
                setLoading(false);
            }
        };

        checkStatus();
    }, [isOpen]);

    // Auto-focus first input box when mode changes or modal opens
    useEffect(() => {
        if (isOpen && mode !== 'checking') {
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

        // Auto advance to next box
        if (digit && index < 3) {
            inputRefs[index + 1].current?.focus();
        }

        // Auto submit if all 4 boxes are filled
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
                await axios.post(api.salaryPinVerify, { pin: fullPin }, authHeader());
                setSuccessMessage('PIN Verified!');
                setTimeout(() => {
                    onSuccess();
                    onClose();
                }, 400);
            } catch (err: any) {
                setError(err.response?.data?.message || 'Incorrect 4-digit PIN.');
                setPin(['', '', '', '']);
                inputRefs[0].current?.focus();
            } finally {
                setLoading(false);
            }
        }
        // ── MODE: SETUP - CREATE (Step 1) ──
        else if (mode === 'setup-create') {
            setCreatedPin(fullPin);
            setPin(['', '', '', '']);
            setMode('setup-confirm');
            setTimeout(() => {
                inputRefs[0].current?.focus();
            }, 100);
        }
        // ── MODE: SETUP - CONFIRM (Step 2) ──
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

    return createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden animate-scaleIn border border-slate-100 relative">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all z-10"
                    title="Cancel"
                >
                    <X size={18} />
                </button>

                <div className="p-6 text-center">
                    {/* Security Icon */}
                    <div className="w-14 h-14 bg-indigo-50 ring-8 ring-indigo-50/50 rounded-2xl flex items-center justify-center mx-auto mb-3.5 text-indigo-600">
                        {mode.startsWith('setup') ? <KeyRound size={26} /> : <Lock size={26} />}
                    </div>

                    {/* Title & Description */}
                    <h3 className="text-base font-bold text-slate-900 tracking-tight">
                        {mode === 'setup-create' ? 'Create 4-Digit Salary PIN' :
                         mode === 'setup-confirm' ? 'Confirm 4-Digit Salary PIN' :
                         title}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-[260px] mx-auto leading-relaxed">
                        {mode === 'setup-create' ? 'Choose a secure 4-digit code to protect your salary from unauthorized view.' :
                         mode === 'setup-confirm' ? 'Re-enter your 4-digit code to confirm and save.' :
                         description}
                    </p>

                    {/* Super Admin Notice */}
                    {isSuperAdmin && mode === 'verify' && (
                        <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-full">
                            <ShieldCheck size={11} className="text-amber-600" /> Super Admin Master Override Active
                        </div>
                    )}

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

                    {/* On-Screen Numeric Keypad */}
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

                    {/* Submit / Cancel Footer */}
                    <div className="flex gap-2 pt-2">
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
                </div>
            </div>
        </div>,
        document.body
    );
};

export default SalaryPinModal;
