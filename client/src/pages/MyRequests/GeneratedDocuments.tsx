import { useState, useEffect } from 'react';
import api from '../../utils/api';
import { useToast } from '../../contexts/ToastContext';
import { formatEmployeeFullName } from '../../utils/nameHelper';
import { FileText, CheckCircle, XCircle, Search, X } from 'lucide-react';

const GeneratedDocuments = () => {
    const { showToast } = useToast();
    const [documents, setDocuments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionModal, setActionModal] = useState<any>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 10;

    useEffect(() => {
        fetchDocuments();
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilter]);

    const fetchDocuments = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.baseURL}/api/documents/all`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setDocuments(data);
            }
        } catch (err) {
            console.error('Failed to fetch documents', err);
        } finally {
            setLoading(false);
        }
    };

    const handleRevoke = async (documentId: string) => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.baseURL}/api/documents/${documentId}/revoke`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            if (res.ok) {
                setActionModal(null);
                fetchDocuments();
                showToast('Document revoked successfully', 'success');
            } else {
                showToast('Failed to revoke document', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('An error occurred while revoking the document', 'error');
        }
    };

    const filteredDocuments = documents.filter(doc => {
        const term = searchTerm.toLowerCase().trim();
        const empName = formatEmployeeFullName(doc.details, doc.details?.name || doc.employeeName || '').toLowerCase();
        const empId = (doc.employeeId || '').toLowerCase();
        const docType = (doc.documentType || '').toLowerCase();
        const refId = (doc.documentId || '').toLowerCase();

        const matchesSearch = !term || empName.includes(term) || empId.includes(term) || docType.includes(term) || refId.includes(term);
        const matchesStatus = statusFilter === 'All' || doc.status === statusFilter;

        return matchesSearch && matchesStatus;
    });

    const totalPages = Math.ceil(filteredDocuments.length / pageSize) || 1;
    const paginatedDocuments = filteredDocuments.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    return (
        <div className="space-y-6">
            {/* Search and Filters Layout */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                <div className="relative w-full sm:max-w-xs">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                        type="text"
                        placeholder="Search employee name..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-9 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    {searchTerm && (
                        <button
                            type="button"
                            onClick={() => setSearchTerm('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded-full hover:bg-gray-100 transition-colors"
                            title="Clear search"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
                <div className="flex gap-2 w-full sm:w-auto overflow-x-auto scrollbar-none pb-1">
                    {['All', 'Valid', 'Revoked'].map((status) => (
                        <button
                            key={status}
                            type="button"
                            onClick={() => setStatusFilter(status)}
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-all whitespace-nowrap shrink-0 ${
                                statusFilter === status
                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                        >
                            {status}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="text-center py-10">Loading...</div>
            ) : (
                <>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-4">Employee</th>
                                        <th className="px-6 py-4">Document Type</th>
                                        <th className="px-6 py-4">Ref ID</th>
                                        <th className="px-6 py-4">Issue Date</th>
                                        <th className="px-6 py-4">Status</th>
                                        <th className="px-6 py-4">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {paginatedDocuments.map(doc => (
                                        <tr key={doc._id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div>
                                                    <p className="font-medium text-gray-900">{formatEmployeeFullName(doc.details, 'Employee')}</p>
                                                    <p className="text-xs text-gray-500">{doc.employeeId}</p>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <FileText size={16} className="text-blue-500"/>
                                                    <span className="font-medium text-gray-700">{doc.documentType}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 font-mono text-xs text-gray-500 truncate max-w-[150px]">
                                                {doc.documentId}
                                            </td>
                                            <td className="px-6 py-4 text-gray-500">
                                                {new Date(doc.issueDate).toLocaleDateString()}
                                            </td>
                                            <td className="px-6 py-4">
                                                {doc.status === 'Valid' && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-600 border border-emerald-200"><CheckCircle size={12}/> Valid</span>}
                                                {doc.status === 'Revoked' && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-600 border border-rose-200"><XCircle size={12}/> Revoked</span>}
                                            </td>
                                            <td className="px-6 py-4">
                                                {doc.status === 'Valid' ? (
                                                    <button 
                                                        onClick={() => setActionModal(doc)}
                                                        className="px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg text-xs font-medium transition-colors border border-rose-200"
                                                    >
                                                        Revoke
                                                    </button>
                                                ) : (
                                                    <span className="text-gray-400 text-xs italic">N/A</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredDocuments.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                                {searchTerm.trim() || statusFilter !== 'All'
                                                    ? `No documents found matching "${searchTerm}".`
                                                    : 'No documents found.'}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {filteredDocuments.length > 0 && (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
                            <div className="text-xs text-gray-500 font-medium">
                                Showing <span className="font-bold text-gray-700">{(currentPage - 1) * pageSize + 1}</span> to{' '}
                                <span className="font-bold text-gray-700">{Math.min(currentPage * pageSize, filteredDocuments.length)}</span> of{' '}
                                <span className="font-bold text-gray-700">{filteredDocuments.length}</span> entries
                            </div>
                            {totalPages > 1 && (
                                <div className="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Previous
                                    </button>
                                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                                        .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
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
                                                    type="button"
                                                    onClick={() => setCurrentPage(item)}
                                                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                                                        currentPage === item
                                                            ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/30'
                                                            : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    {item}
                                                </button>
                                            ) : (
                                                <span key={idx} className="px-1 text-gray-400 text-xs">...</span>
                                            )
                                        )}
                                    <button
                                        type="button"
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                        className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Next
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            {actionModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden animate-slide-up">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h3 className="text-lg font-bold text-gray-900">Revoke Document</h3>
                            <button onClick={() => setActionModal(null)} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg transition-colors">
                                <XCircle size={20} />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-4 text-center">
                            <p className="text-sm text-gray-600">
                                Are you sure you want to revoke the <strong>{actionModal.documentType}</strong> for <strong>{formatEmployeeFullName(actionModal.details, 'Employee')}</strong>?
                            </p>
                            <p className="text-xs text-rose-600 bg-rose-50 p-2 rounded border border-rose-200">
                                This action is permanent and will cause the document verification link to show as revoked.
                            </p>
                        </div>

                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 flex-wrap">
                            <button 
                                onClick={() => setActionModal(null)}
                                className="px-4 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors font-medium text-sm"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={() => handleRevoke(actionModal.documentId)}
                                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors font-medium text-sm shadow-sm"
                            >
                                Confirm Revoke
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GeneratedDocuments;
