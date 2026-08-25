import { useState, useEffect } from 'react';
import api from '../../utils/api';
import { useToast } from '../../contexts/ToastContext';
import { formatEmployeeFullName } from '../../utils/nameHelper';
import { FileText, CheckCircle, XCircle } from 'lucide-react';

const GeneratedDocuments = () => {
    const { showToast } = useToast();
    const [documents, setDocuments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionModal, setActionModal] = useState<any>(null);

    useEffect(() => {
        fetchDocuments();
    }, []);

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

    return (
        <div className="space-y-6">
            {loading ? (
                <div className="text-center py-10">Loading...</div>
            ) : (
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
                                {documents.map(doc => (
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
                                {documents.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                            No documents found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
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
