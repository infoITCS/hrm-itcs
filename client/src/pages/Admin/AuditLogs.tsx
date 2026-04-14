import { useState, useEffect } from 'react';
import { Search, Clock, User, FileText, AlertCircle, Trash2, Edit, Plus, Upload, Check, X, Shield } from 'lucide-react';
import api from '../../utils/api';

interface AuditLog {
    _id: string;
    action: string;
    targetResource: string;
    targetId: string;
    performedBy: string;
    details: any;
    timestamp: string;
}

const AuditLogs = () => {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState({
        action: '',
        resource: ''
    });
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalLogs, setTotalLogs] = useState(0);
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

    const LIMIT = 15;

    useEffect(() => {
        setPage(1); // Reset to first page when filters change
        fetchLogs(1);
    }, [filter]);

    const fetchLogs = async (pageNum = page) => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const queryParams = new URLSearchParams();
            if (filter.action) queryParams.append('action', filter.action);
            if (filter.resource) queryParams.append('targetResource', filter.resource);
            queryParams.append('page', pageNum.toString());
            queryParams.append('limit', LIMIT.toString());

            const response = await fetch(`${api.auditLogs}?${queryParams.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to fetch audit logs');
            const data = await response.json();
            setLogs(data.logs);
            setTotalPages(data.pages);
            setTotalLogs(data.total);
            setPage(data.page);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const getActionIcon = (action: string) => {
        switch (action) {
            case 'CREATE': return <Plus size={16} className="text-emerald-500" />;
            case 'UPDATE': return <Edit size={16} className="text-amber-500" />;
            case 'DELETE': return <Trash2 size={16} className="text-red-500" />;
            case 'UPLOAD_DOC': return <Upload size={16} className="text-indigo-500" />;
            case 'DOC_APPROVAL': return <Check size={16} className="text-emerald-500" />;
            case 'DOC_DELETE': return <X size={16} className="text-red-500" />;

            default: return <AlertCircle size={16} className="text-gray-400" />;
        }
    };

    const formatDetails = (log: AuditLog) => {
        if (!log.details) return 'No additional details';


        if (log.details.diff) {
            const changes = Object.keys(log.details.diff);
            return `Updated ${changes.length} fields: ${changes.join(', ')}`;
        }

        if (log.details.name) {
            return `Target: ${log.details.name}`;
        }

        if (log.details.file) {
            return `File: ${log.details.file}`;
        }

        if (log.details.status) {
            return `Status changed to ${log.details.status}`;
        }

        return JSON.stringify(log.details);
    };

    const filteredLogs = logs.filter(log => 
        log.performedBy.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.targetId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.action.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6 animate-slide-up">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Shield className="text-indigo-600" /> System Audit Logs
                    </h2>
                    <p className="text-gray-500">Track all administrative actions ({totalLogs} total events)</p>
                </div>
                
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input 
                            type="text" 
                            placeholder="Search in this page..."
                            className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-100 outline-none transition-all w-64 shadow-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl flex items-center gap-3 animate-shake">
                    <AlertCircle size={20} />
                    <p className="text-sm font-medium">{error}</p>
                </div>
            )}

            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Action Type</label>
                    <select 
                        className="w-full bg-slate-50 border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-100 outline-none"
                        value={filter.action}
                        onChange={(e) => setFilter({...filter, action: e.target.value})}
                    >
                        <option value="">All Actions</option>
                        <option value="CREATE">Create</option>
                        <option value="UPDATE">Update</option>
                        <option value="DELETE">Delete</option>
                        <option value="UPLOAD_DOC">Document Upload</option>
                        <option value="DOC_APPROVAL">Document Approval</option>

                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Resource</label>
                    <select 
                        className="w-full bg-slate-50 border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-100 outline-none"
                        value={filter.resource}
                        onChange={(e) => setFilter({...filter, resource: e.target.value})}
                    >
                        <option value="">All Resources</option>
                        <option value="Employee">Employee</option>
                        <option value="User">User</option>
                    </select>
                </div>
            </div>

            {/* Logs List */}
            <div className="bg-white rounded-3xl shadow-xl shadow-indigo-100/20 border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50">
                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Timestamp</th>
                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Performed By</th>
                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Action</th>
                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Target</th>
                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {loading ? (
                                Array(5).fill(0).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan={5} className="px-6 py-8"><div className="h-4 bg-gray-100 rounded w-full"></div></td>
                                    </tr>
                                ))
                            ) : filteredLogs.length > 0 ? (
                                filteredLogs.map((log) => (
                                    <tr key={log._id} onClick={() => setSelectedLog(log)} className="cursor-pointer hover:bg-indigo-50/30 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-gray-500 whitespace-nowrap">
                                                <Clock size={14} />
                                                <span className="text-xs font-medium">
                                                    {new Date(log.timestamp).toLocaleString()}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                                                    <User size={14} />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-gray-700">{log.performedBy}</p>
                                                    <p className="text-[10px] text-gray-400 uppercase font-bold tracking-tight">User ID</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <div className="p-1.5 rounded-lg bg-gray-50 group-hover:bg-white transition-colors">
                                                    {getActionIcon(log.action)}
                                                </div>
                                                <span className="text-xs font-bold text-gray-600">{log.action}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold text-gray-700">{log.targetResource}</span>
                                                <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded w-fit">{log.targetId}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-xs text-gray-600 font-medium max-w-xs truncate" title={formatDetails(log)}>
                                                {formatDetails(log)}
                                            </p>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400 italic">
                                        <div className="flex flex-col items-center gap-2">
                                            <FileText size={48} className="opacity-10" />
                                            <p>No activity logs found</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {!loading && totalPages > 1 && (
                    <div className="px-6 py-4 bg-slate-50/50 border-t border-gray-100 flex items-center justify-between">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                            Page {page} of {totalPages}
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => fetchLogs(page - 1)}
                                disabled={page === 1}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${page === 1 ? 'text-gray-300 cursor-not-allowed' : 'text-indigo-600 hover:bg-indigo-600 hover:text-white bg-white shadow-sm border border-gray-100'}`}
                            >
                                Previous
                            </button>
                            <button
                                onClick={() => fetchLogs(page + 1)}
                                disabled={page === totalPages}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${page === totalPages ? 'text-gray-300 cursor-not-allowed' : 'text-indigo-600 hover:bg-indigo-600 hover:text-white bg-white shadow-sm border border-gray-100'}`}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Diff Viewer Modal */}
            {selectedLog && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-gray-900/40 backdrop-blur-sm px-4 pb-4 animate-fadeIn overflow-y-auto" onClick={() => setSelectedLog(null)}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden mb-auto" onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-50 shrink-0">
                            <div>
                                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                    <FileText className="text-indigo-600" size={20} /> Action Details
                                </h3>
                                <p className="text-xs font-bold text-gray-400 mt-0.5">
                                    {selectedLog.action} on {selectedLog.targetResource} ({selectedLog.targetId})
                                </p>
                            </div>
                            <button onClick={() => setSelectedLog(null)} className="p-2 bg-white border border-gray-200 rounded-full hover:bg-gray-100 transition-colors text-gray-500">
                                <X size={18} />
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
                            {selectedLog.details?.diff ? (
                                <div className="space-y-4">
                                    {Object.entries(selectedLog.details.diff).map(([key, val]: any) => (
                                        <div key={key} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                                                <p className="font-bold text-slate-800 text-sm capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
                                                <div className="p-4 bg-rose-50/30">
                                                    <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><X size={12}/> Old Value</p>
                                                    <pre className="text-xs text-rose-900 font-mono whitespace-pre-wrap break-all bg-rose-100/50 p-3 rounded-xl border border-rose-100">
                                                        {val.old === null || val.old === undefined ? 'Empty' : typeof val.old === 'object' ? JSON.stringify(val.old, null, 2) : String(val.old)}
                                                    </pre>
                                                </div>
                                                <div className="p-4 bg-emerald-50/30">
                                                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Check size={12}/> New Value</p>
                                                    <pre className="text-xs text-emerald-900 font-mono whitespace-pre-wrap break-all bg-emerald-100/50 p-3 rounded-xl border border-emerald-100 shadow-sm">
                                                        {val.new === null || val.new === undefined ? 'Empty' : typeof val.new === 'object' ? JSON.stringify(val.new, null, 2) : String(val.new)}
                                                    </pre>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
                                    <pre className="text-xs text-slate-700 font-mono whitespace-pre-wrap break-all">
                                        {JSON.stringify(selectedLog.details, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AuditLogs;
