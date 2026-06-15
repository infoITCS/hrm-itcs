import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Calendar, FileText, User, ShieldCheck, AlertCircle, MessageSquare } from 'lucide-react';

const STATUS_COLORS: any = {
    Pending: 'bg-amber-50 text-amber-600 border-amber-100',
    Approved: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    Rejected: 'bg-rose-50 text-rose-600 border-rose-100',
};

const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleDateString();
};

const calculateDays = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return '—';
    return Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
};

interface LeaveDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    leave: any;
}

const LeaveDetailsModal = ({ isOpen, onClose, leave }: LeaveDetailsModalProps) => {
    // Close on Escape key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    if (!isOpen || !leave) return null;

    const modalContent = (
        <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-2 sm:p-4 animate-in fade-in"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
        >
            <div 
                className="bg-white rounded-2xl sm:rounded-3xl w-full max-w-md max-h-[95vh] shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50 relative shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 sm:p-2 bg-white rounded-lg sm:rounded-xl shadow-sm">
                            <FileText size={18} className="text-indigo-600" />
                        </div>
                        <div>
                            <h3 id="modal-title" className="text-lg sm:text-xl font-bold text-slate-800">Leave Details</h3>
                            <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400">Request #{leave._id ? leave._id.slice(-6).toUpperCase() : 'NEW'}</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        aria-label="Close"
                        className="absolute top-4 sm:top-5 right-4 sm:right-5 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-white rounded-full transition-all"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto custom-scrollbar">
                    {/* Status Badge */}
                    <div className="flex items-center justify-between bg-slate-50 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-100">
                        <span className="text-xs sm:text-sm font-bold text-slate-500">Current Status</span>
                        <span className={`px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-[9px] sm:text-xs font-black uppercase tracking-wider border ${STATUS_COLORS[leave.status] || 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                            {leave.status}
                        </span>
                    </div>

                    {/* Employee Info */}
                    <div className="space-y-3 sm:space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                                <User size={16} />
                            </div>
                            <div>
                                <p className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest">Employee</p>
                                <p className="text-xs sm:text-sm font-bold text-slate-800">{leave.employeeName || 'You'}</p>
                                {leave.readableId && <p className="text-[9px] sm:text-[10px] text-indigo-500 font-bold">{leave.readableId}</p>}
                            </div>
                        </div>

                        <div className="flex items-start gap-3">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                                <Calendar size={16} />
                            </div>
                            <div>
                                <p className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest">Duration</p>
                                <p className="text-xs sm:text-sm font-bold text-slate-800">
                                    {formatDate(leave.startDate)} — {formatDate(leave.endDate)}
                                </p>
                                <p className="text-[9px] sm:text-[10px] text-emerald-600 font-bold">
                                    Total Days: {leave.totalDays !== undefined ? leave.totalDays : calculateDays(leave.startDate, leave.endDate)}
                                </p>
                                {leave.duration && leave.duration !== 'Full Day' && (
                                    <p className="text-[9px] sm:text-[10px] text-indigo-500 font-bold mt-0.5">
                                        {leave.duration} {leave.duration === 'Specify Time' ? `(${leave.startTime} - ${leave.endTime})` : ''}
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="flex items-start gap-3">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
                                <ShieldCheck size={16} />
                            </div>
                            <div>
                                <p className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest">Leave Type</p>
                                <p className="text-xs sm:text-sm font-bold text-slate-800">
                                    {leave.type.toLowerCase().includes('leave') ? leave.type : `${leave.type} Leave`}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Reason Box */}
                    <div className="space-y-2">
                        <p className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <AlertCircle size={12} /> Reason for Leave
                        </p>
                        <div className="bg-slate-50 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-100 italic text-slate-600 text-xs sm:text-sm leading-relaxed">
                            "{leave.reason || 'No reason provided'}"
                        </div>
                    </div>

                    {/* Rejection Note (Admin Note) */}
                    {leave.adminNote && (
                        <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                            <p className="text-[9px] sm:text-xs font-bold text-rose-500 uppercase tracking-widest flex items-center gap-2">
                                <MessageSquare size={12} /> Note from Admin/Manager
                            </p>
                            <div className="bg-rose-50 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-rose-100 font-bold text-rose-700 text-xs sm:text-sm leading-relaxed shadow-sm">
                                {leave.adminNote}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0">
                    <button 
                        onClick={onClose}
                        className="px-5 sm:px-6 py-2 sm:py-2.5 bg-white border border-slate-200 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm active:scale-95"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};

export default LeaveDetailsModal;
