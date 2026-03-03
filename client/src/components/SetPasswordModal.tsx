import { useState, useCallback } from 'react';
import APIService from '../services/api';

interface SetPasswordModalProps {
    userName?: string;
    onSuccess: () => void;
    onSkip?: () => void;
}

interface PasswordStrength {
    score: number;      // 0–4
    label: string;
    color: string;
}

const evaluateStrength = (pw: string): PasswordStrength => {
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[a-z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;

    const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
    const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'];
    return { score, label: pw ? labels[score - 1] ?? labels[0] : '', color: pw ? colors[score - 1] ?? colors[0] : '#e5e7eb' };
};

const EyeIcon = ({ open }: { open: boolean }) => (
    open ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
    )
);

const CheckIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

const XIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
);

const LockIcon = () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
);

const MicrosoftIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="1" y="1" width="10" height="10" fill="#f25022" />
        <rect x="13" y="1" width="10" height="10" fill="#7fba00" />
        <rect x="1" y="13" width="10" height="10" fill="#00a4ef" />
        <rect x="13" y="13" width="10" height="10" fill="#ffb900" />
    </svg>
);

export const SetPasswordModal: React.FC<SetPasswordModalProps> = ({ userName, onSuccess, onSkip }) => {
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const strength = evaluateStrength(password);

    const requirements = [
        { label: 'At least 8 characters', met: password.length >= 8 },
        { label: 'One uppercase letter (A–Z)', met: /[A-Z]/.test(password) },
        { label: 'One lowercase letter (a–z)', met: /[a-z]/.test(password) },
        { label: 'One number (0–9)', met: /[0-9]/.test(password) },
    ];

    const allMet = requirements.every(r => r.met);
    const passwordsMatch = password === confirm && confirm.length > 0;

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!allMet) {
            setError('Please meet all password requirements.');
            return;
        }
        if (!passwordsMatch) {
            setError('Passwords do not match.');
            return;
        }

        setLoading(true);
        try {
            await APIService.setupPassword(password);
            setSuccess(true);
            setTimeout(() => onSuccess(), 1800);
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Failed to set password. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [password, confirm, allMet, passwordsMatch, onSuccess]);

    return (
        <div style={styles.overlay}>
            <div style={styles.card}>
                {/* Decorative top gradient bar */}
                <div style={styles.topBar} />

                {success ? (
                    <div style={styles.successState}>
                        <div style={styles.successCircle}>
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        </div>
                        <h2 style={styles.successTitle}>Password Set! 🎉</h2>
                        <p style={styles.successSubtitle}>Your account is now fully secured. Redirecting…</p>
                    </div>
                ) : (
                    <>
                        {/* Header */}
                        <div style={styles.header}>
                            <div style={styles.iconWrap}>
                                <LockIcon />
                            </div>
                            <div>
                                <div style={styles.microsoftBadge}>
                                    <MicrosoftIcon />
                                    <span>Microsoft Sign-In Detected</span>
                                </div>
                                <h2 style={styles.title}>Create Your Password</h2>
                                <p style={styles.subtitle}>
                                    {userName ? `Welcome, ${userName}! ` : ''}
                                    Set a password so you can also sign in directly with your email.
                                </p>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} style={styles.form}>
                            {/* Password field */}
                            <div style={styles.fieldGroup}>
                                <label style={styles.label}>New Password</label>
                                <div style={styles.inputWrap}>
                                    <input
                                        id="spm-password"
                                        type={showPw ? 'text' : 'password'}
                                        value={password}
                                        onChange={e => { setPassword(e.target.value); setError(''); }}
                                        placeholder="Enter your new password"
                                        style={styles.input}
                                        autoComplete="new-password"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPw(v => !v)}
                                        style={styles.eyeBtn}
                                        aria-label={showPw ? 'Hide password' : 'Show password'}
                                    >
                                        <EyeIcon open={showPw} />
                                    </button>
                                </div>

                                {/* Strength bar */}
                                {password && (
                                    <div style={styles.strengthWrap}>
                                        <div style={styles.strengthBarTrack}>
                                            {[1, 2, 3, 4, 5].map(i => (
                                                <div
                                                    key={i}
                                                    style={{
                                                        ...styles.strengthSegment,
                                                        backgroundColor: i <= strength.score ? strength.color : '#e5e7eb',
                                                    }}
                                                />
                                            ))}
                                        </div>
                                        <span style={{ ...styles.strengthLabel, color: strength.color }}>{strength.label}</span>
                                    </div>
                                )}
                            </div>

                            {/* Confirm password field */}
                            <div style={styles.fieldGroup}>
                                <label style={styles.label}>Confirm Password</label>
                                <div style={styles.inputWrap}>
                                    <input
                                        id="spm-confirm"
                                        type={showConfirm ? 'text' : 'password'}
                                        value={confirm}
                                        onChange={e => { setConfirm(e.target.value); setError(''); }}
                                        placeholder="Re-enter your password"
                                        style={{
                                            ...styles.input,
                                            borderColor: confirm && !passwordsMatch ? '#ef4444' : confirm && passwordsMatch ? '#22c55e' : 'rgba(99,102,241,0.2)',
                                        }}
                                        autoComplete="new-password"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirm(v => !v)}
                                        style={styles.eyeBtn}
                                        aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                                    >
                                        <EyeIcon open={showConfirm} />
                                    </button>
                                </div>
                                {confirm && !passwordsMatch && (
                                    <p style={styles.matchError}>Passwords do not match</p>
                                )}
                                {confirm && passwordsMatch && (
                                    <p style={styles.matchSuccess}>✓ Passwords match</p>
                                )}
                            </div>

                            {/* Requirements checklist */}
                            {password && (
                                <div style={styles.reqList}>
                                    {requirements.map(req => (
                                        <div key={req.label} style={styles.reqRow}>
                                            <span style={{ ...styles.reqIcon, backgroundColor: req.met ? '#22c55e' : '#e5e7eb', color: req.met ? '#fff' : '#9ca3af' }}>
                                                {req.met ? <CheckIcon /> : <XIcon />}
                                            </span>
                                            <span style={{ ...styles.reqText, color: req.met ? '#111827' : '#9ca3af' }}>{req.label}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Error message */}
                            {error && (
                                <div style={styles.errorBox}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                    <span>{error}</span>
                                </div>
                            )}

                            {/* Actions */}
                            <div style={styles.actions}>
                                <button
                                    id="spm-submit-btn"
                                    type="submit"
                                    disabled={loading || !allMet || !passwordsMatch}
                                    style={{
                                        ...styles.submitBtn,
                                        opacity: loading || !allMet || !passwordsMatch ? 0.6 : 1,
                                        cursor: loading || !allMet || !passwordsMatch ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    {loading ? (
                                        <span style={styles.spinnerWrap}>
                                            <span style={styles.spinner} />
                                            Setting password…
                                        </span>
                                    ) : 'Set My Password'}
                                </button>

                                {onSkip && (
                                    <button
                                        id="spm-skip-btn"
                                        type="button"
                                        onClick={onSkip}
                                        style={styles.skipBtn}
                                    >
                                        Skip for now
                                    </button>
                                )}
                            </div>
                        </form>

                        <p style={styles.secureNote}>
                            🔒 Your password is encrypted and never stored in plain text
                        </p>
                    </>
                )}
            </div>

            {/* Spinner animation keyframes */}
            <style>{`
                @keyframes spm-spin { to { transform: rotate(360deg); } }
                @keyframes spm-fadeIn { from { opacity: 0; transform: scale(0.95) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
                @keyframes spm-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
                #spm-submit-btn:not(:disabled):hover { transform: translateY(-1px); box-shadow: 0 8px 25px rgba(99,102,241,0.4) !important; }
                #spm-skip-btn:hover { color: #6366f1 !important; }
                #spm-password, #spm-confirm { transition: border-color 0.2s, box-shadow 0.2s; }
                #spm-password:focus, #spm-confirm:focus { border-color: #6366f1 !important; box-shadow: 0 0 0 3px rgba(99,102,241,0.15) !important; outline: none; }
            `}</style>
        </div>
    );
};

const styles: Record<string, React.CSSProperties> = {
    overlay: {
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
    },
    card: {
        backgroundColor: '#ffffff',
        borderRadius: '20px',
        width: '100%',
        maxWidth: '460px',
        boxShadow: '0 25px 60px rgba(0,0,0,0.25)',
        overflow: 'hidden',
        animation: 'spm-fadeIn 0.3s ease-out',
        position: 'relative',
    },
    topBar: {
        height: '5px',
        background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #a855f7)',
        borderRadius: '20px 20px 0 0',
    },
    header: {
        display: 'flex',
        gap: '16px',
        alignItems: 'flex-start',
        padding: '28px 28px 0',
    },
    iconWrap: {
        width: '56px',
        height: '56px',
        borderRadius: '16px',
        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        flexShrink: 0,
        boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
    },
    microsoftBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        backgroundColor: '#f0f4ff',
        border: '1px solid #c7d2fe',
        borderRadius: '20px',
        padding: '3px 10px',
        fontSize: '11px',
        fontWeight: 600,
        color: '#4338ca',
        marginBottom: '6px',
    },
    title: {
        fontSize: '20px',
        fontWeight: 700,
        color: '#111827',
        margin: 0,
        lineHeight: 1.3,
    },
    subtitle: {
        fontSize: '13px',
        color: '#6b7280',
        margin: '4px 0 0',
        lineHeight: 1.5,
    },
    form: {
        padding: '24px 28px',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
    },
    fieldGroup: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
    },
    label: {
        fontSize: '13px',
        fontWeight: 600,
        color: '#374151',
    },
    inputWrap: {
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
    },
    input: {
        width: '100%',
        padding: '12px 44px 12px 14px',
        borderRadius: '10px',
        border: '1.5px solid rgba(99,102,241,0.2)',
        fontSize: '14px',
        color: '#111827',
        backgroundColor: '#fafafa',
        boxSizing: 'border-box',
    },
    eyeBtn: {
        position: 'absolute',
        right: '12px',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: '#9ca3af',
        padding: '2px',
        display: 'flex',
        alignItems: 'center',
    },
    strengthWrap: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
    },
    strengthBarTrack: {
        display: 'flex',
        gap: '4px',
        flex: 1,
    },
    strengthSegment: {
        flex: 1,
        height: '4px',
        borderRadius: '2px',
        transition: 'background-color 0.3s',
    },
    strengthLabel: {
        fontSize: '12px',
        fontWeight: 600,
        minWidth: '64px',
        textAlign: 'right',
    },
    matchError: {
        fontSize: '12px',
        color: '#ef4444',
        margin: 0,
    },
    matchSuccess: {
        fontSize: '12px',
        color: '#22c55e',
        fontWeight: 500,
        margin: 0,
    },
    reqList: {
        backgroundColor: '#f9fafb',
        borderRadius: '10px',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        border: '1px solid #f3f4f6',
    },
    reqRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    },
    reqIcon: {
        width: '18px',
        height: '18px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'background-color 0.2s',
    },
    reqText: {
        fontSize: '12px',
        transition: 'color 0.2s',
    },
    errorBox: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        backgroundColor: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: '8px',
        padding: '10px 14px',
        fontSize: '13px',
        color: '#dc2626',
    },
    actions: {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
    },
    submitBtn: {
        width: '100%',
        padding: '13px',
        borderRadius: '10px',
        border: 'none',
        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        color: '#fff',
        fontSize: '15px',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'transform 0.15s, box-shadow 0.15s, opacity 0.15s',
        boxShadow: '0 4px 14px rgba(99,102,241,0.25)',
    },
    spinnerWrap: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
    },
    spinner: {
        display: 'inline-block',
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        border: '2.5px solid rgba(255,255,255,0.4)',
        borderTopColor: '#fff',
        animation: 'spm-spin 0.7s linear infinite',
    },
    skipBtn: {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        fontSize: '13px',
        color: '#9ca3af',
        fontWeight: 500,
        padding: '4px',
        transition: 'color 0.2s',
        textAlign: 'center',
    },
    secureNote: {
        textAlign: 'center',
        fontSize: '12px',
        color: '#9ca3af',
        padding: '0 28px 20px',
        margin: 0,
    },
    // Success state
    successState: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 28px',
        gap: '16px',
        textAlign: 'center',
    },
    successCircle: {
        width: '80px',
        height: '80px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #22c55e, #10b981)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 8px 24px rgba(34,197,94,0.35)',
        animation: 'spm-pulse 0.8s ease-out',
    },
    successTitle: {
        fontSize: '22px',
        fontWeight: 700,
        color: '#111827',
        margin: 0,
    },
    successSubtitle: {
        fontSize: '14px',
        color: '#6b7280',
        margin: 0,
    },
};

export default SetPasswordModal;
