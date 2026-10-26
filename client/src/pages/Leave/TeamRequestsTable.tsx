import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, X, Eye, MessageSquare, Search, Edit3, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../contexts/ToastContext';
import LeaveDetailsModal from './LeaveDetailsModal';
import Avatar from '../../components/UI/Avatar';
import { usePermissions } from '../../hooks/usePermissions';

type SortField = 'employee' | 'type' | 'date';
type SortOrder = 'asc' | 'desc';
type ActionFilter = 'all' | 'pending' | 'approved' | 'rejected';

const TeamRequestsTable = ({ onStatusChange }: { onStatusChange?: () => void }) => {
    const { showToast } = useToast();
    const [searchParams, setSearchParams] = useSearchParams();
    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [selectedLeave, setSelectedLeave] = useState<any>(null);
    const [searchQuery, setSearchQuery] = useState(() => sessionStorage.getItem('leave_team_search') || '');
    const { role } = usePermissions();
    const isAdmin = ['super-admin', 'admin'].includes(role);

    // Sorting & Action Filter State (persisted in sessionStorage)
    const [statusFilter, setStatusFilter] = useState<ActionFilter>(() => (sessionStorage.getItem('leave_team_filter') as ActionFilter) || 'all');
    const [sortField, setSortField] = useState<SortField>('date');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

    useEffect(() => {
        sessionStorage.setItem('leave_team_filter', statusFilter);
        sessionStorage.setItem('leave_team_search', searchQuery);
    }, [statusFilter, searchQuery]);

    const handleLeaveClick = (e: React.MouseEvent, req: any) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        setSelectedLeave(req);
        setShowDetailsModal(true);
        if (searchParams.get('leaveId') !== req._id) {
            setSearchParams(prev => {
                const next = new URLSearchParams(prev);
                next.set('leaveId', req._id);
                next.set('tab', 'team-requests');
                return next;
            }, { replace: true });
        }
    };

    const targetLeaveId = searchParams.get('leaveId');
    useEffect(() => {
        if (!targetLeaveId) return;
        if (selectedLeave?._id === targetLeaveId && showDetailsModal) return;

        const found = requests.find(r => r._id === targetLeaveId);
        if (found) {
            setSelectedLeave(found);
            setShowDetailsModal(true);
            return;
        }

        let isCurrent = true;
        const token = localStorage.getItem('token');
        fetch(`${api.baseURL}/api/leaves/${targetLeaveId}`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                if (isCurrent && data?.success && data?.data) {
                    setSelectedLeave(data.data);
                    setShowDetailsModal(true);
                }
            })
            .catch(() => {});

        return () => { isCurrent = false; };
    }, [targetLeaveId, requests, selectedLeave, showDetailsModal]);
    
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

    const actionCounts = useMemo(() => ({
        all: requests.length,
        pending: requests.filter(r => (r.status || '').toLowerCase() === 'pending').length,
        approved: requests.filter(r => (r.status || '').toLowerCase() === 'approved').length,
        rejected: requests.filter(r => (r.status || '').toLowerCase() === 'rejected').length,
    }), [requests]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder(field === 'date' ? 'desc' : 'asc');
        }
    };

    const filteredRequests = useMemo(() => {
        return requests
            .filter(req => {
                if (searchQuery) {
                    const s = searchQuery.toLowerCase();
                    const matches = (
                        (req.employeeName && req.employeeName.toLowerCase().includes(s)) ||
                        (req.readableId && req.readableId.toLowerCase().includes(s)) ||
                        (req.type && req.type.toLowerCase().includes(s))
                    );
                    if (!matches) return false;
                }

                const st = (req.status || '').toLowerCase();
                if (statusFilter === 'pending' && st !== 'pending') return false;
                if (statusFilter === 'approved' && st !== 'approved') return false;
                if (statusFilter === 'rejected' && st !== 'rejected') return false;

                return true;
            })
            .sort((a: any, b: any) => {
                let comparison = 0;
                if (sortField === 'employee') {
                    const nameA = (a.employeeName || a.employee?.firstName || '').toLowerCase();
                    const nameB = (b.employeeName || b.employee?.firstName || '').toLowerCase();
                    comparison = nameA.localeCompare(nameB);
                } else if (sortField === 'type') {
                    const typeA = (a.type || '').toLowerCase();
                    const typeB = (b.type || '').toLowerCase();
                    comparison = typeA.localeCompare(typeB);
                } else if (sortField === 'date') {
                    const dateA = new Date(a.startDate || a.createdAt || 0).getTime();
                    const dateB = new Date(b.startDate || b.createdAt || 0).getTime();
                    comparison = dateA - dateB;
                }
                return sortOrder === 'asc' ? comparison : -comparison;
            });
    }, [requests, searchQuery, statusFilter, sortField, sortOrder]);

    const renderSortableHeader = (field: SortField, label: string) => {
        const isActive = sortField === field;
        return (
            <th 
                onClick={() => handleSort(field)}
                className={`px-6 py-4 text-xs font-black uppercase tracking-wider cursor-pointer select-none transition-colors group ${
                    isActive ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100/60'
                }`}
                title={`Sort by ${label} (${isActive && sortOrder === 'asc' ? 'Descending' : 'Ascending'})`}
            >
                <div className="flex items-center gap-1.5">
                    <span>{label}</span>
                    {isActive ? (
                        sortOrder === 'asc' ? (
                            <ArrowUp size={13} className="text-indigo-600 shrink-0 stroke-[2.5]" />
                        ) : (
                            <ArrowDown size={13} className="text-indigo-600 shrink-0 stroke-[2.5]" />
                        )
                    ) : (
                        <ArrowUpDown size={13} className="text-slate-300 group-hover:text-slate-500 shrink-0 transition-colors" />
                    )}
                </div>
            </th>
        );
    };

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
            <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 justify-between items-center bg-white rounded-t-3xl">
                <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
                    <div className="relative shrink-0">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input 
                            type="text" 
                            placeholder="Search employee or ID..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-all w-[240px]"
                        />
                    </div>

                    {/* Action / Status Filter Tabs */}
                    <div className="flex items-center gap-1 bg-slate-100/70 p-1 rounded-xl border border-slate-200/50">
                        <button
                            type="button"
                            onClick={() => setStatusFilter('all')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                statusFilter === 'all'
                                    ? 'bg-white text-slate-800 shadow-xs'
                                    : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
                            }`}
                        >
                            All
                            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                                statusFilter === 'all' ? 'bg-slate-100 text-slate-700' : 'bg-slate-200/70 text-slate-500'
                            }`}>
                                {actionCounts.all}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setStatusFilter('pending')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                statusFilter === 'pending'
                                    ? 'bg-amber-500 text-white shadow-xs'
                                    : 'text-slate-500 hover:text-amber-700 hover:bg-amber-50/60'
                            }`}
                        >
                            <span>No Action</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                                statusFilter === 'pending' ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-800'
                            }`}>
                                {actionCounts.pending}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setStatusFilter('approved')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                statusFilter === 'approved'
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : 'text-slate-500 hover:text-emerald-700 hover:bg-emerald-50/60'
                            }`}
                        >
                            <span>Approved</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                                statusFilter === 'approved' ? 'bg-emerald-700 text-white' : 'bg-emerald-100 text-emerald-800'
                            }`}>
                                {actionCounts.approved}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setStatusFilter('rejected')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                statusFilter === 'rejected'
                                    ? 'bg-rose-600 text-white shadow-xs'
                                    : 'text-slate-500 hover:text-rose-700 hover:bg-rose-50/60'
                            }`}
                        >
                            <span>Rejected</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                                statusFilter === 'rejected' ? 'bg-rose-700 text-white' : 'bg-rose-100 text-rose-800'
                            }`}>
                                {actionCounts.rejected}
                            </span>
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="text-xs font-semibold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 shrink-0">
                        Showing: <span className="text-indigo-600 font-bold">{filteredRequests.length}</span> of {requests.length}
                    </div>
                </div>
            </div>
            <div className="overflow-x-auto max-h-[750px] overflow-y-auto">
                <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-xs z-10 shadow-2xs">
                    <tr className="bg-slate-50/50">
                        {renderSortableHeader('employee', 'Employee')}
                        {renderSortableHeader('type', 'Type')}
                        {renderSortableHeader('date', 'Dates')}
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
                                    <p className="text-sm text-slate-400 mt-1">There are no leave requests matching your search or filters.</p>
                                    {(searchQuery || statusFilter !== 'all') && (
                                        <button
                                            type="button"
                                            onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}
                                            className="mt-3 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100/70 px-3 py-1.5 rounded-lg border border-indigo-100 transition-colors"
                                        >
                                            Reset Filters
                                        </button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ) : (
                        filteredRequests.map((req) => (
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
                                        <a
                                            href={`/leave?leaveId=${req._id}&tab=team-requests`}
                                            onClick={(e) => handleLeaveClick(e, req)}
                                            className="font-bold text-slate-800 text-sm hover:text-indigo-600 hover:underline"
                                            title="View leave details (Right-click to open in new tab)"
                                        >
                                            {req.employeeName || 'Unknown'}
                                        </a>
                                        {req.readableId && <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-tighter italic">{req.readableId}</span>}
                                    </div>
                                </div>
                            </td>
                            <td className="px-6 py-5">
                                <span className="font-bold text-slate-700 text-sm">{req.type}</span>
                            </td>
                            <td className="px-6 py-5">
                                <div className="flex flex-col text-xs">
                                    <span className="font-bold text-slate-700">{new Date(req.startDate).toLocaleDateString('en-GB')}</span>
                                    <span className="text-[10px] text-slate-400">to {new Date(req.endDate).toLocaleDateString('en-GB')}</span>
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
                                    <a
                                        href={`/leave?leaveId=${req._id}&tab=team-requests`}
                                        onClick={(e) => handleLeaveClick(e, req)}
                                        className="p-1 text-slate-300 hover:text-indigo-600 transition-colors inline-block"
                                        title="View leave details (Right-click to open in new tab)"
                                    >
                                        <Eye size={14} />
                                    </a>
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
                                            <div className="flex items-center gap-1.5">
                                                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                                                    req.status === 'Approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'
                                                }`}>
                                                    {req.status}
                                                </span>
                                                {isAdmin && (
                                                    <button 
                                                        onClick={() => {
                                                             setEditTargetId(req._id);
                                                             setEditTargetStatus(req.status);
                                                             setEditTargetNote(req.adminNote || '');
                                                             setShowEditModal(true);
                                                        }}
                                                        className="inline-flex items-center justify-center p-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200/80 rounded-lg transition-all shadow-2xs cursor-pointer"
                                                        title="Edit Status"
                                                    >
                                                        <Edit3 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                            {req.approvedByName && (
                                                <span className="text-[9px] text-slate-500 font-medium mt-1 truncate max-w-[140px]" title={`By ${req.approvedByName.replace(/\s*\([^)]*\)$/, '').trim()}`}>
                                                    by {req.approvedByName.replace(/\s*\([^)]*\)$/, '').trim()}
                                                </span>
                                            )}
                                            {req.adminNote && (
                                                <span className="text-[8px] text-slate-400 mt-0.5 max-w-[120px] truncate italic text-center" title={req.adminNote}>
                                                    "{req.adminNote}"
                                                </span>
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
                    if (searchParams.has('leaveId')) {
                        setSearchParams(prev => {
                            const next = new URLSearchParams(prev);
                            next.delete('leaveId');
                            return next;
                        }, { replace: true });
                    }
                }}
                leave={selectedLeave}
                onSuccess={onStatusChange}
            />
        </div>

    );
};

export default TeamRequestsTable;
