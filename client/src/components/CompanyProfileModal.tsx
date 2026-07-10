import { X, Download, FileText } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';

interface CompanyProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const CompanyProfileModal = ({ isOpen, onClose }: CompanyProfileModalProps) => {
    const [loading, setLoading] = useState(true);

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[99999] flex flex-col bg-slate-900 w-screen h-screen overflow-hidden animate-fadeIn">
            {/* Header Toolbar */}
            <div className="bg-slate-950 px-5 py-3 flex items-center justify-between text-white border-b border-slate-800 shrink-0 shadow-md">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-lg hidden sm:block">
                        <FileText size={18} />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-sm sm:text-base font-bold truncate text-slate-100">
                            ITCS_Company_Profile.pdf
                        </h3>
                        <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider hidden sm:block">
                            Size: 36.6 MB • PDF Document
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Download PDF button */}
                    <a 
                        href="/ITCS_Company_Profile.pdf" 
                        download="ITCS_Company_Profile.pdf"
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-lg shadow-indigo-500/20 active:scale-95 transition-all"
                    >
                        <Download size={14} strokeWidth={2.5} />
                        <span className="hidden sm:inline">Download PDF</span>
                        <span className="sm:hidden">Download</span>
                    </a>

                    {/* Close button */}
                    <button 
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl active:scale-95 transition-all"
                        title="Close Viewer"
                    >
                        <X size={20} strokeWidth={2.5} />
                    </button>
                </div>
            </div>

            {/* PDF Container Viewport */}
            <div className="flex-1 bg-slate-900 relative flex items-center justify-center overflow-hidden">
                {loading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-white gap-4 z-20">
                        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin shadow-lg"></div>
                        <div className="text-center">
                            <p className="text-sm font-bold text-slate-200">Loading PDF Document...</p>
                            <p className="text-xs text-slate-400 mt-1">This file is quite large (36 MB) and may take a moment to render.</p>
                        </div>
                    </div>
                )}
                
                <iframe
                    src="/ITCS_Company_Profile.pdf#toolbar=1"
                    className={`w-full h-full border-0 bg-slate-900 transition-opacity duration-300 ${loading ? 'opacity-0' : 'opacity-100'}`}
                    title="ITCS Company Profile PDF Viewer"
                    onLoad={() => setLoading(false)}
                />
            </div>
        </div>,
        document.body
    );
};

export default CompanyProfileModal;
