import React, { createContext, useContext, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import AlertModal from '../components/UI/AlertModal';

interface ToastItem {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
}

interface AlertState {
    isOpen: boolean;
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error' | 'confirm';
    onConfirm?: () => void;
}

interface ToastContextType {
    showToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning', durationMs?: number) => void;
    showAlert: (title: string, message: string, type?: 'info' | 'success' | 'warning' | 'error' | 'confirm', onConfirm?: () => void) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const [alertState, setAlertState] = useState<AlertState>({
        isOpen: false,
        title: '',
        message: '',
        type: 'info'
    });

    const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', durationMs = 4000) => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts(prev => [...prev, { id, message, type }]);

        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, durationMs);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const showAlert = useCallback((title: string, message: string, type: 'info' | 'success' | 'warning' | 'error' | 'confirm' = 'info', onConfirm?: () => void) => {
        setAlertState({
            isOpen: true,
            title,
            message,
            type,
            onConfirm
        });
    }, []);

    const closeAlert = useCallback(() => {
        setAlertState(prev => ({ ...prev, isOpen: false }));
    }, []);

    const getToastStyle = (type: ToastItem['type']) => {
        switch (type) {
            case 'success': return 'bg-emerald-600 text-white shadow-emerald-500/20';
            case 'error': return 'bg-rose-600 text-white shadow-rose-500/20';
            case 'warning': return 'bg-amber-500 text-white shadow-amber-500/20';
            default: return 'bg-indigo-600 text-white shadow-indigo-500/20';
        }
    };

    const getToastIcon = (type: ToastItem['type']) => {
        switch (type) {
            case 'success': return <CheckCircle2 size={18} />;
            case 'error': return <AlertCircle size={18} />;
            case 'warning': return <AlertCircle size={18} />;
            default: return <Info size={18} />;
        }
    };

    return (
        <ToastContext.Provider value={{ showToast, showAlert }}>
            {children}
            
            {/* Toast Container */}
            {createPortal(
                <div className="fixed top-5 right-5 z-[99999] flex flex-col gap-2 max-w-md w-full pointer-events-none px-4 sm:px-0">
                    {toasts.map(t => (
                        <div
                            key={t.id}
                            className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-2xl shadow-xl border border-white/10 text-sm font-semibold transition-all transform animate-slideInRight ${getToastStyle(t.type)}`}
                        >
                            <div className="flex items-center gap-2.5 min-w-0">
                                <span className="shrink-0">{getToastIcon(t.type)}</span>
                                <span className="truncate">{t.message}</span>
                            </div>
                            <button
                                onClick={() => removeToast(t.id)}
                                className="shrink-0 p-1 hover:bg-white/20 rounded-lg transition-colors"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                </div>,
                document.body
            )}

            {/* Alert Modal */}
            <AlertModal
                isOpen={alertState.isOpen}
                onClose={closeAlert}
                title={alertState.title}
                message={alertState.message}
                type={alertState.type}
                onConfirm={alertState.onConfirm}
            />
        </ToastContext.Provider>
    );
};

export const useToast = (): ToastContextType => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};
