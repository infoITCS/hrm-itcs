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
            <div className="bg-white rounded-2xl shadow-xl w-[500px] max-w-full m-4 relative animate-in fade-in zoom-in duration-200">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-slate-100 transition-colors"
                >
                    <X size={20} />
                </button>

                <div className="p-8 text-center">
                    <h3 className="text-2xl font-bold text-slate-700 mb-4">{title}</h3>

                    <p className="text-gray-500 mb-8 text-lg leading-relaxed">
                        {message}
                    </p>

                    <div className="flex items-center justify-center gap-4">
                        <button
                            onClick={onClose}
                            className="px-6 py-2.5 rounded-full border border-primary text-primary font-medium hover:bg-blue-50 transition-colors min-w-[140px]"
                        >
                            No, Cancel
                        </button>

                        <button
                            onClick={onConfirm}
                            className="px-6 py-2.5 rounded-full bg-red-100 text-red-600 font-medium hover:bg-red-200 transition-colors flex items-center justify-center gap-2 min-w-[140px]"
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
