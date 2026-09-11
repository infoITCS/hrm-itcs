import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, Info, Phone, Copy, X, Check, Building2, User } from 'lucide-react';

interface AlertModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    message: string | React.ReactNode;
    type?: 'info' | 'success' | 'warning' | 'error' | 'confirm' | 'contact';
    onConfirm?: () => void;
    confirmText?: string;
    cancelText?: string;
    showCancel?: boolean;
    contactInfo?: {
        phone?: string;
        workPhone?: string;
        email?: string;
        name?: string;
    };
}

const AlertModal: React.FC<AlertModalProps> = ({
    isOpen,
    onClose,
    title,
    message,
    type = 'info',
    onConfirm,
    confirmText = 'OK',
    cancelText = 'Cancel',
    showCancel = false,
    contactInfo
}) => {
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    if (!isOpen) return null;

    const getIcon = () => {
        switch (type) {
            case 'success': return <CheckCircle2 size={36} className="text-emerald-500" />;
            case 'error': return <AlertCircle size={36} className="text-rose-500" />;
            case 'warning': return <AlertCircle size={36} className="text-amber-500" />;
            case 'confirm': return <AlertCircle size={36} className="text-indigo-500" />;
            case 'contact': return <Phone size={36} className="text-indigo-500" />;
            default: return <Info size={36} className="text-indigo-500" />;
        }
    };

    const getIconBg = () => {
        switch (type) {
            case 'success': return 'bg-emerald-50 ring-8 ring-emerald-50/50';
            case 'error': return 'bg-rose-50 ring-8 ring-rose-50/50';
            case 'warning': return 'bg-amber-50 ring-8 ring-amber-50/50';
            default: return 'bg-indigo-50 ring-8 ring-indigo-50/50';
        }
    };

    const handleCopy = (text: string, key: string = 'default') => {
        navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    const renderFormattedMessage = () => {
        if (!message) return null;
        if (typeof message !== 'string') return message;

        const trimmed = message.trim();
        if (trimmed.includes('\n')) {
            const sections = trimmed.split(/\n\s*\n/);
            return (
                <div className="space-y-2.5 my-4 text-left">
                    {sections.map((sec, idx) => {
                        const lines = sec.split('\n').map(l => l.trim()).filter(Boolean);
                        const isList = lines.length > 1;
                        if (isList) {
                            return (
                                <div key={idx} className="max-h-44 overflow-y-auto bg-slate-50/80 rounded-xl p-2 border border-slate-200/80 space-y-1.5">
                                    {lines.map((item, itemIdx) => (
                                        <div key={itemIdx} className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200/60 text-xs font-semibold text-slate-700 shadow-2xs">
                                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                                type === 'error' ? 'bg-rose-500' :
                                                type === 'warning' ? 'bg-amber-500' :
                                                type === 'success' ? 'bg-emerald-500' : 'bg-indigo-500'
                                            }`} />
                                            <span className="truncate">{item.replace(/^[-•]\s*/, '')}</span>
                                        </div>
                                    ))}
                                </div>
                            );
                        }
                        return (
                            <p key={idx} className="text-slate-600 text-xs font-medium leading-relaxed">
                                {sec}
                            </p>
                        );
                    })}
                </div>
            );
        }

        return <p className="text-slate-600 text-xs font-medium leading-relaxed my-4">{message}</p>;
    };

    return createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-scaleIn border border-slate-100 relative">
                <button 
                    onClick={onClose}
                    className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all z-10"
                    title="Close"
                >
                    <X size={18} />
                </button>
                <div className="p-6 text-center">
                    <div className={`w-16 h-16 ${getIconBg()} rounded-full flex items-center justify-center mx-auto mb-4 shrink-0 transition-all`}>
                        {getIcon()}
                    </div>
                    
                    <h3 className="text-lg font-bold text-slate-900 tracking-tight">{title}</h3>
                    
                    {renderFormattedMessage()}

                    {type === 'contact' && contactInfo && (
                        <div className="space-y-3 my-4 text-left">
                            {/* Category 1: Personal Number */}
                            <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200/80 transition-all hover:border-indigo-200">
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                        <User size={12} className="text-slate-400" />
                                        Personal Number
                                    </span>
                                    {contactInfo.phone ? (
                                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                                            Available
                                        </span>
                                    ) : (
                                        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                            Not Provided
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center justify-between gap-2 p-2 bg-white rounded-xl border border-slate-200 shadow-2xs">
                                    <span className={`text-sm font-bold tracking-tight px-1 ${contactInfo.phone ? 'text-slate-800 font-mono' : 'text-slate-400 italic text-xs'}`}>
                                        {contactInfo.phone || 'No personal number recorded'}
                                    </span>
                                    {contactInfo.phone && (
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => handleCopy(contactInfo.phone!, 'personal')}
                                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors relative"
                                                title="Copy personal number"
                                            >
                                                {copiedKey === 'personal' ? (
                                                    <span className="flex items-center text-[10px] font-bold text-emerald-600 gap-1 px-1">
                                                        <Check size={13} className="text-emerald-500" /> Copied!
                                                    </span>
                                                ) : (
                                                    <Copy size={14} />
                                                )}
                                            </button>
                                            <a
                                                href={`tel:${contactInfo.phone}`}
                                                className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
                                                title="Call personal number"
                                            >
                                                <Phone size={12} />
                                                <span>Call</span>
                                            </a>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Category 2: Official Number (Company SIM) */}
                            <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200/80 transition-all hover:border-indigo-200">
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-indigo-600 uppercase tracking-wider">
                                        <Building2 size={12} className="text-indigo-500" />
                                        Official Number (Company SIM)
                                    </span>
                                    {contactInfo.workPhone ? (
                                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                                            Assigned SIM
                                        </span>
                                    ) : (
                                        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                                            Pending HR Assignment
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center justify-between gap-2 p-2 bg-white rounded-xl border border-slate-200 shadow-2xs">
                                    <span className={`text-sm font-bold tracking-tight px-1 ${contactInfo.workPhone ? 'text-indigo-900 font-mono' : 'text-slate-400 italic text-xs'}`}>
                                        {contactInfo.workPhone || 'No company SIM assigned yet'}
                                    </span>
                                    {contactInfo.workPhone && (
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => handleCopy(contactInfo.workPhone!, 'work')}
                                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors relative"
                                                title="Copy official number"
                                            >
                                                {copiedKey === 'work' ? (
                                                    <span className="flex items-center text-[10px] font-bold text-emerald-600 gap-1 px-1">
                                                        <Check size={13} className="text-emerald-500" /> Copied!
                                                    </span>
                                                ) : (
                                                    <Copy size={14} />
                                                )}
                                            </button>
                                            <a
                                                href={`tel:${contactInfo.workPhone}`}
                                                className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
                                                title="Call official number"
                                            >
                                                <Phone size={12} />
                                                <span>Call</span>
                                            </a>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-2.5 pt-2">
                        {type === 'contact' ? (
                            <button
                                onClick={onClose}
                                className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs tracking-wide uppercase hover:bg-slate-200 transition-all active:scale-95"
                            >
                                Done
                            </button>
                        ) : (
                            <>
                                {showCancel && (
                                    <button
                                        onClick={onClose}
                                        className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs tracking-wide uppercase hover:bg-slate-200 transition-all active:scale-95"
                                    >
                                        {cancelText}
                                    </button>
                                )}

                                {onConfirm ? (
                                    <button
                                        onClick={() => {
                                            onConfirm();
                                            onClose();
                                        }}
                                        className={`flex-1 py-2.5 rounded-xl font-bold text-xs tracking-wide uppercase transition-all shadow-md active:scale-95 text-white ${
                                            type === 'error' ? 'bg-rose-600 shadow-rose-200 hover:bg-rose-700' :
                                            type === 'success' ? 'bg-emerald-600 shadow-emerald-200 hover:bg-emerald-700' :
                                            'bg-indigo-600 shadow-indigo-200 hover:bg-indigo-700'
                                        }`}
                                    >
                                        {confirmText}
                                    </button>
                                ) : (
                                    !showCancel && (
                                        <button
                                            onClick={onClose}
                                            className="w-full py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs tracking-wide uppercase hover:bg-slate-800 transition-all shadow-md active:scale-95"
                                        >
                                            {confirmText}
                                        </button>
                                    )
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default AlertModal;

