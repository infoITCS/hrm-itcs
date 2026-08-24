import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, Info, Phone, Copy, X } from 'lucide-react';

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

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
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
                        <div className="bg-slate-50 rounded-2xl p-3 mb-5 space-y-2">
                            {contactInfo.phone && (
                                <div className="flex items-center justify-between gap-3 p-2.5 bg-white rounded-xl border border-slate-200">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                                            <Phone size={14} />
                                        </div>
                                        <span className="text-xs font-bold text-slate-700">{contactInfo.phone}</span>
                                    </div>
                                    <button 
                                        onClick={() => handleCopy(contactInfo.phone!)}
                                        className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors"
                                        title="Copy number"
                                    >
                                        <Copy size={14} />
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex gap-2.5 pt-2">
                        {(showCancel || type === 'contact') && (
                            <button
                                onClick={onClose}
                                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs tracking-wide uppercase hover:bg-slate-200 transition-all active:scale-95"
                            >
                                {type === 'contact' ? 'Close' : cancelText}
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
                            !showCancel && type !== 'contact' && (
                                <button
                                    onClick={onClose}
                                    className="w-full py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs tracking-wide uppercase hover:bg-slate-800 transition-all shadow-md active:scale-95"
                                >
                                    {confirmText}
                                </button>
                            )
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default AlertModal;

