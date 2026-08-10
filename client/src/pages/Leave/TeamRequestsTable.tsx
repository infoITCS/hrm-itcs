import { useState, useEffect } from 'react';
import { Check, X, Eye, MessageSquare, Search, Edit3 } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../contexts/ToastContext';
import LeaveDetailsModal from './LeaveDetailsModal';
import Avatar from '../../components/UI/Avatar';
import { usePermissions } from '../../hooks/usePermissions';

const TeamRequestsTable = ({ onStatusChange }: { onStatusChange?: () => void }) => {
    const { showToast } = useToast();
    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [selectedLeave, setSelectedLeave] = useState<any>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const { role } = usePermissions();
    const isAdmin = ['super-admin', 'admin'].includes(role);
    
    // Rejection State
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectionNote, setRejectionNote] = useState('');
    const [targetRequestId, setTargetRequestId] = useState<string | null>(null);

    // Edit State
    const [showEditModal, setShowEditModal] = useState(false);
    const [editTargetId, setEditTargetId] = useState<string | null>(null);
    const [editTargetStatus, setEditTargetStatus] = useState<'Pending' | 'Approved' | 'Rejected'>('Pending');
    const [editTargetNote, setEditTargetNote] = useState('');

    const fetchAllRequests = async () => {
        try {
            const token = localStorage.getItem('token');
            const r = await fetch(`${api.baseURL}/api/leaves/all`, { 
                headers: { Authorization: `Bearer ${token}` } 
            });
            
            if (!r.ok) {
                const errorData = await r.json().catch(() => ({}));
                console.error('Error fetching team leaves:', errorData.message || r.statusText);
                return;
            }

            const d = await r.json();
            if (d.success) {
                const sorted = d.data.sort((a: any, b: any) => {
                    if (a.status === 'Pending' && b.status !== 'Pending') return -1;
                    if (a.status !== 'Pending' && b.status === 'Pending') return 1;
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                });
                setRequests(sorted);
            }
        } catch (err) {
            console.error('Error fetching team leaves:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAllRequests();
    }, []);

    const handleAction = async (id: string, status: 'Approved' | 'Rejected', adminNote?: string): Promise<boolean> => {
        setProcessingId(id);
        try {
            const token = localStorage.getItem('token');
            const r = await fetch(`${api.baseURL}/api/leaves/${id}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ status, adminNote })
            });

            if (!r.ok) {
                const errorData = await r.json().catch(() => ({}));
                console.error('Error processing leave:', errorData.message || r.statusText);
                return false;
            }

            const d = await r.json();
            if (d.success) {
                await fetchAllRequests();
                setShowRejectModal(false);
                setRejectionNote('');
                setTargetRequestId(null);
                if (onStatusChange) onStatusChange();
                return true;
            }
            return false;
        } catch (err) {
            console.error('Error processing leave:', err);
            return false;
        } finally {
            setProcessingId(null);
        }
    };

    const openRejectDialog = (id: string) => {
        setTargetRequestId(id);
        setRejectionNote(''); // Clear note when opening
        setShowRejectModal(true);
    };

    const handleRevert = async () => {
        if (!editTargetId) return;
        setProcessingId(editTargetId);
        try {
            const token = localStorage.getItem('token');
            const r = await fetch(`${api.baseURL}/api/leaves/${editTargetId}/revert-status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ status: editTargetStatus, adminNote: editTargetNote })
            });
            if (r.ok) {
                await fetchAllRequests();
                setShowEditModal(false);
                setEditTargetId(null);
                showToast('Leave status updated', 'success');
                if (onStatusChange) onStatusChange();
            } else {
                const err = await r.json().catch(() => ({}));
                showToast(err.message || 'Failed to revert status', 'error');
            }
        } catch (e) {
            console.error('Error reverting status:', e);
        } finally {
            setProcessingId(null);
        }
    };

    const filteredRequests = requests.filter(req => {
        if (!searchQuery) return true;
        const s = searchQuery.toLowerCase();
        return (
            (req.employeeName && req.employeeName.toLowerCase().includes(s)) ||
            (req.readableId && req.readableId.toLowerCase().includes(s)) ||
            (req.type && req.type.toLowerCase().includes(s))
        );
    });

    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 10;

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery]);

    const paginatedRequests = filteredRequests.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    if (loading) {
        return (
            <div className="p-12 text-center">
                <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-slate-400 font-medium">Loading requests...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col">
            <div className="p-4 border-b border-slate-50 flex justify-between items-center bg-white rounded-t-3xl">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                        type="text" 
                        placeholder="Search employee or ID..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-all min-w-[250px]"
                    />
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-slate-50/50">
                        <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">Employee</th>
                        <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">Type</th>
                        <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">Dates</th>
                        <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">Reason</th>
                        <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider text-center">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                    {filteredRequests.length === 0 ? (
                        <tr>
                            <td colSpan={5} className="px-6 py-20 text-center">
                                <div className="max-w-xs mx-auto">
                                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                                        <MessageSquare size={32} />
                                    </div>
                                    <h3 className="font-bold text-slate-700">No Requests Found</h3>
                                    <p className="text-sm text-slate-400 mt-1">There are no leave requests matching your search.</p>
                                </div>
                            </td>
                        </tr>
                    ) : (
                        paginatedRequests.map((req) => (
                        <tr key={req._id} className="hover:bg-slate-50/50 transition-colors group">
                            <td className="px-6 py-5">
                                <div className="flex items-center gap-3">
                                    <Avatar 
                                        src={req.avatar} 
                                        name={req.employeeName} 
                                        size="w-10 h-10"
                                        className="border-2 border-white shadow-sm shrink-0"
                                        initialsClassName="bg-indigo-100 text-indigo-600 font-bold"
                                    />
                                    <div className="flex flex-col">
                                        <span className="font-bold text-slate-800 text-sm">{req.employeeName || 'Unknown'}</span>
                                        {req.readableId && <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-tighter italic">{req.readableId}</span>}
                                    </div>
                                </div>
                            </td>
                            <td className="px-6 py-5">
                                <span className="font-bold text-slate-700 text-sm">{req.type}</span>
                            </td>
                            <td className="px-6 py-5">
                                <div className="flex flex-col text-xs">
                                    <span className="font-bold text-slate-700">{new Date(req.startDate).toLocaleDateString()}</span>
                                    <span className="text-[10px] text-slate-400">to {new Date(req.endDate).toLocaleDateString()}</span>
                                    {req.duration && req.duration !== 'Full Day' && (
                                        <span className="text-[10px] text-indigo-500 font-bold mt-0.5">
                                            {req.duration} {req.duration === 'Specify Time' ? `(${req.startTime} - ${req.endTime})` : ''}
                                        </span>
                                    )}
                                </div>
                            </td>
                            <td className="px-6 py-5">
                                <div className="flex items-center gap-2">
                                    <p className="text-xs text-slate-500 max-w-[120px] truncate italic">"{req.reason || 'No reason'}"</p>
                                    <button onClick={() => { setSelectedLeave(req); setShowDetailsModal(true); }} className="p-1 text-slate-300 hover:text-indigo-600 transition-colors">
                                        <Eye size={14} />
                                    </button>
                                </div>
                            </td>
                            <td className="px-6 py-5">
                                <div className="flex justify-center items-center gap-2">
                                    {req.status === 'Pending' ? (
                                        <>
                                            <button 
                                                onClick={() => handleAction(req._id, 'Approved')}
                                                disabled={processingId === req._id}
                                                className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-500 hover:text-white transition-all flex items-center justify-center"
                                                title="Approve"
                                            >
                                                {processingId === req._id ? <div className="w-3 h-3 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" /> : <Check size={16} />}
                                            </button>
                                            <button 
                                                onClick={() => openRejectDialog(req._id)}
                                                disabled={processingId === req._id}
                                                className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center"
                                                title="Reject"
                                            >
                                                <X size={16} />
                                            </button>
                                        </>
                                    ) : (
                                        <div className="flex flex-col items-center group/action relative w-full">
                                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                                                req.status === 'Approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'
                                            }`}>
                                                {req.status}
                                            </span>
                                            {req.adminNote && (
                                                <span className="text-[8px] text-slate-400 mt-1 max-w-[80px] truncate italic" title={req.adminNote}>
                                                    "{req.adminNote}"
                                                </span>
                                            )}
                                            {isAdmin && (
                                                <button 
                                                    onClick={() => {
                                                        setEditTargetId(req._id);
                                                        setEditTargetStatus(req.status);
                                                        setEditTargetNote(req.adminNote || '');
                                                        setShowEditModal(true);
                                                    }}
                                                    className="absolute right-0 top-1/2 -translate-y-1/2 p-1.5 bg-slate-100 text-slate-400 hover:text-indigo-600 rounded-lg opacity-0 group-hover/action:opacity-100 transition-all hover:bg-indigo-50"
                                                    title="Edit Status"
                                                >
                                                    <Edit3 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </td>
                        </tr>
                    )))}
                </tbody>
            </table>
            </div>

            {filteredRequests.length > pageSize && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-slate-100 bg-white">
                    <div className="text-xs text-slate-500 font-medium">
                        Showing <span className="font-bold text-slate-700">{(currentPage - 1) * pageSize + 1}</span> to{' '}
                        <span className="font-bold text-slate-700">{Math.min(currentPage * pageSize, filteredRequests.length)}</span> of{' '}
                        <span className="font-bold text-slate-700">{filteredRequests.length}</span> entries
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            Previous
                        </button>
                        {Array.from({ length: Math.ceil(filteredRequests.length / pageSize) }, (_, i) => i + 1)
                            .filter(p => p === 1 || p === Math.ceil(filteredRequests.length / pageSize) || Math.abs(p - currentPage) <= 1)
                            .reduce((acc: (number | string)[], page, index, array) => {
                                if (index > 0 && page - (array[index - 1] as number) > 1) {
                                    acc.push('...');
                                }
                                acc.push(page);
                                return acc;
                            }, [])
                            .map((item, idx) =>
                                typeof item === 'number' ? (
                                    <button
                                        key={idx}
                                        onClick={() => setCurrentPage(item)}
                                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                                            currentPage === item
                                                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/30'
                                                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        {item}
                                    </button>
                                ) : (
                                    <span key={idx} className="px-1 text-slate-400 text-xs">...</span>
                                )
                            )}
                        <button
                            onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredRequests.length / pageSize), p + 1))}
                            disabled={currentPage === Math.ceil(filteredRequests.length / pageSize)}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}

            {/* Rejection Reason Modal */}
            {showRejectModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-rose-50 rounded-xl text-rose-600">
                                    <MessageSquare size={20} />
                                </div>
                                <h3 className="text-lg font-bold text-slate-800">Reason for Rejection</h3>
                            </div>
                            
                            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                                Please provide a brief explanation for the employee about why this leave request is being rejected.
                            </p>

                            <textarea 
                                value={rejectionNote}
                                onChange={(e) => setRejectionNote(e.target.value)}
                                placeholder="E.g. Project deadline, short-staffed this week..."
                                className="w-full h-24 p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-300 transition-all resize-none italic"
                                autoFocus
                            />

                            <div className="flex gap-3 mt-6">
                                <button 
                                    onClick={() => setShowRejectModal(false)}
                                    className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-all"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={async () => {
                                        if (targetRequestId) {
                                            const success = await handleAction(targetRequestId, 'Rejected', rejectionNote);
                                            if (success) {
                                                setShowRejectModal(false);
                                                setTargetRequestId(null);
                                            }
                                        }
                                    }}
                                    disabled={!rejectionNote.trim() || processingId === targetRequestId}
                                    className="flex-1 py-2.5 bg-rose-600 text-white rounded-xl text-sm font-bold hover:bg-rose-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-rose-200"
                                >
                                    {processingId === targetRequestId ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Reject Request'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Status Modal */}
            {showEditModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
                                    <Edit3 size={20} />
                                </div>
                                <h3 className="text-lg font-bold text-slate-800">Edit Leave Status</h3>
                            </div>
                            
                            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                                You are about to override a processed leave request. This will automatically recalculate the employee's leave balance and update their attendance logs.
                            </p>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 mb-1.5 block uppercase tracking-wider">New Status</label>
                                    <select
                                        value={editTargetStatus}
                                        onChange={(e: any) => setEditTargetStatus(e.target.value)}
                                        className="w-full px-3 py-2 pr-8 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-all"
                                    >
                                        <option value="Pending">Pending</option>
                                        <option value="Approved">Approved</option>
                                        <option value="Rejected">Rejected</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-slate-500 mb-1.5 block uppercase tracking-wider">Admin Note (Optional)</label>
                                    <textarea 
                                        value={editTargetNote}
                                        onChange={(e) => setEditTargetNote(e.target.value)}
                                        placeholder="Reason for overriding..."
                                        className="w-full h-20 p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-all resize-none italic"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button 
                                    onClick={() => setShowEditModal(false)}
                                    className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-all"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={handleRevert}
                                    disabled={processingId === editTargetId}
                                    className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
                                >
                                    {processingId === editTargetId ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Save Changes'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <LeaveDetailsModal 
                isOpen={showDetailsModal}
                onClose={() => {
                    setShowDetailsModal(false);
                    setSelectedLeave(null);
                }}
                leave={selectedLeave}
                onSuccess={onStatusChange}
            />
        </div>

    );
};

export default TeamRequestsTable;
