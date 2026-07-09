import { createPortal } from 'react-dom';
import { X, FileText, Loader2 } from 'lucide-react';

interface PdfPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    pdfUrl: string | null;
    loading: boolean;
    title?: string;
}

const PdfPreviewModal = ({ isOpen, onClose, pdfUrl, loading, title = 'Document Preview' }: PdfPreviewModalProps) => {
    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-3xl w-full max-w-4xl h-[90vh] flex flex-col shadow-2xl overflow-hidden mx-4 border border-slate-200">
                {/* Modal Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-indigo-50 rounded-xl text-indigo-650">
                            <FileText size={20} />
                        </div>
                        <div>
                            <h3 className="text-md font-bold text-slate-800">{title}</h3>
                            <p className="text-[10px] text-slate-400">Review layout page formatting, margins, and branding details.</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 bg-slate-200/50 hover:bg-slate-200 rounded-full transition-colors text-slate-500 hover:text-slate-700 active:scale-95"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Modal Body */}
                <div className="flex-1 bg-slate-100 p-4 flex items-center justify-center relative">
                    {loading ? (
                        <div className="flex flex-col items-center gap-3">
                            <Loader2 className="animate-spin text-indigo-600" size={32} />
                            <span className="text-xs font-semibold text-slate-500">Generating PDF preview document...</span>
                        </div>
                    ) : pdfUrl ? (
                        <iframe 
                            src={`${pdfUrl}#toolbar=0&navpanes=0`} 
                            className="w-full h-full rounded-2xl border border-slate-200/80 shadow-md bg-white"
                            title="PDF Document Preview"
                        />
                    ) : (
                        <div className="text-sm font-semibold text-rose-500">Failed to render PDF preview content.</div>
                    )}
                </div>

                {/* Modal Footer */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                    <button 
                        onClick={onClose}
                        className="px-6 py-2.5 bg-slate-200 hover:bg-slate-250 text-slate-700 rounded-xl text-xs font-bold transition-all active:scale-95"
                    >
                        Close Preview
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default PdfPreviewModal;
