import React from 'react';
import { Trash, X } from 'lucide-react';

interface DeleteModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title?: string;
    message?: string;
}

const DeleteModal: React.FC<DeleteModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title = "Are you Sure?",
    message = "The selected record will be permanently deleted. Are you sure you want to continue?"
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-large w-[500px] max-w-full m-4 relative animate-fadeIn border border-gray-200/50">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-2 rounded-xl hover:bg-primary-50 transition-all"
                >
                    <X size={20} />
                </button>

                <div className="p-8 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 bg-error/10 rounded-full flex items-center justify-center">
                        <Trash size={32} className="text-error" />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-800 mb-4">{title}</h3>

                    <p className="text-gray-600 mb-8 text-base leading-relaxed">
                        {message}
                    </p>

                    <div className="flex items-center justify-center gap-4">
                        <button
                            onClick={onClose}
                            className="px-6 py-2.5 rounded-xl border-2 border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 hover:border-gray-400 transition-all min-w-[140px]"
                        >
                            No, Cancel
                        </button>

                        <button
                            onClick={onConfirm}
                            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-error to-error/90 text-white font-semibold hover:shadow-glow transition-all flex items-center justify-center gap-2 min-w-[140px] shadow-soft"
                        >
                            <Trash size={18} />
                            Yes, Delete
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DeleteModal;
