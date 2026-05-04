
import { CheckCircle2, AlertCircle, Info, Phone, Copy, X } from 'lucide-react';

interface AlertModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    message: string;
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
            case 'success': return <CheckCircle2 size={40} className="text-emerald-500" />;
            case 'error': return <AlertCircle size={40} className="text-rose-500" />;
            case 'warning': return <AlertCircle size={40} className="text-amber-500" />;
            case 'confirm': return <AlertCircle size={40} className="text-indigo-500" />;
            case 'contact': return <Phone size={40} className="text-indigo-500" />;
            default: return <Info size={40} className="text-indigo-500" />;
        }
    };

    const getIconBg = () => {
        switch (type) {
            case 'success': return 'bg-emerald-50';
            case 'error': return 'bg-rose-50';
            case 'warning': return 'bg-amber-50';
            default: return 'bg-indigo-50';
        }
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        // We could show a tiny toast here
    };

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-[2rem] shadow-2xl max-w-sm w-full overflow-hidden animate-scaleIn border border-white/20 relative">
                <button 
                    onClick={onClose}
                    className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-all z-10"
                    title="Close"
                >
                    <X size={20} />
                </button>
                <div className="p-8 text-center">
                    <div className={`w-20 h-20 ${getIconBg()} rounded-full flex items-center justify-center mx-auto mb-6 shrink-0`}>
                        {getIcon()}
                    </div>
                    
                    <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-2">{title}</h3>
                    <p className="text-slate-500 text-sm font-medium leading-relaxed mb-8">{message}</p>

                    {type === 'contact' && contactInfo && (
                        <div className="bg-slate-50 rounded-2xl p-4 mb-8 space-y-3">
                            {contactInfo.phone && (
                                <div className="flex items-center justify-between gap-3 p-3 bg-white rounded-xl border border-slate-200">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                                            <Phone size={16} />
                                        </div>
                                        <span className="text-sm font-bold text-slate-700">{contactInfo.phone}</span>
                                    </div>
                                    <button 
                                        onClick={() => handleCopy(contactInfo.phone!)}
                                        className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
                                        title="Copy number"
                                    >
                                        <Copy size={16} />
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex flex-col gap-3">
                        {onConfirm && (
                            <button
                                onClick={() => {
                                    onConfirm();
                                    onClose();
                                }}
                                className={`w-full py-4 rounded-2xl font-black text-sm tracking-widest uppercase transition-all shadow-lg active:scale-95 ${
                                    type === 'error' ? 'bg-rose-600 text-white shadow-rose-200 hover:bg-rose-700' :
                                    type === 'success' ? 'bg-emerald-600 text-white shadow-emerald-200 hover:bg-emerald-700' :
                                    'bg-indigo-600 text-white shadow-indigo-200 hover:bg-indigo-700'
                                }`}
                            >
                                {confirmText}
                            </button>
                        )}
                        
                        {(showCancel || type === 'contact') && (
                            <button
                                onClick={onClose}
                                className="w-full py-4 rounded-2xl bg-slate-100 text-slate-600 font-black text-sm tracking-widest uppercase hover:bg-slate-200 transition-all active:scale-95"
                            >
                                {type === 'contact' ? 'Close' : cancelText}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AlertModal;
