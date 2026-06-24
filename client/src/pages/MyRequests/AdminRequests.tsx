import { useState, useEffect } from 'react';
import api from '../../utils/api';
import { Package, Banknote, CheckCircle, Clock, XCircle } from 'lucide-react';
import CategoryConfig from './CategoryConfig';
import GeneratedDocuments from './GeneratedDocuments';

const AdminRequests = () => {
    const [activeTab, setActiveTab] = useState<'Requests' | 'Categories' | 'Documents'>('Requests');
    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionModal, setActionModal] = useState<any>(null);
    const [adminComments, setAdminComments] = useState('');

    useEffect(() => {
        fetchRequests();
    }, []);

    const fetchRequests = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.baseURL}/api/my-requests/all`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setRequests(data);
            }
        } catch (err) {
            console.error('Failed to fetch requests', err);
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (status: 'Pending' | 'Approved' | 'Rejected' | 'Completed') => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.baseURL}/api/my-requests/${actionModal._id}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ status, adminComments })
            });

            if (res.ok) {
                setActionModal(null);
                setAdminComments('');
                fetchRequests();
            } else {
                alert('Failed to update request');
            }
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Manage Requests</h1>
                    <p className="text-sm text-gray-500 mt-1">Review and approve asset and loan requests from employees.</p>
                </div>
            </div>
            <div className="flex border-b border-gray-200 mb-6">
                <button
                    onClick={() => setActiveTab('Requests')}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === 'Requests' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                    Employee Requests
                </button>
                <button
                    onClick={() => setActiveTab('Categories')}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === 'Categories' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                    Request Categories
                </button>
                <button
                    onClick={() => setActiveTab('Documents')}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === 'Documents' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                    Generated Documents
                </button>
            </div>

            {activeTab === 'Categories' ? (
                <CategoryConfig />
            ) : activeTab === 'Documents' ? (
                <GeneratedDocuments />
            ) : (
                <>
                {loading ? (
                <div className="text-center py-10">Loading...</div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-4">Employee</th>
                                    <th className="px-6 py-4">Type</th>
                                    <th className="px-6 py-4">Details</th>
                                    <th className="px-6 py-4">Date</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {requests.map(req => (
                                    <tr key={req._id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                {req.employee?.avatar ? (
                                                    <img src={req.employee.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs">
                                                        {req.employee?.firstName?.charAt(0)}{req.employee?.lastName?.charAt(0)}
                                                    </div>
                                                )}
                                                <div>
                                                    <p className="font-medium text-gray-900">{req.employee?.firstName} {req.employee?.lastName}</p>
                                                    <p className="text-xs text-gray-500">{req.employee?.employeeId}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                {req.category === 'Asset' ? <Package size={16} className="text-purple-500"/> : <Banknote size={16} className="text-emerald-500"/>}
                                                <span className="font-medium text-gray-700">{req.requestType}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {req.category === 'Loan' ? (
                                                <div className="text-xs space-y-1 text-gray-600">
                                                    <p>Amount: <strong className="text-gray-900">Rs. {req.details?.requestedAmount}</strong></p>
                                                    <p>Deduction: <strong className="text-gray-900">Rs. {req.details?.recommendedMonthlyDeduction}/mo</strong></p>
                                                </div>
                                            ) : (
                                                <div className="text-xs text-gray-600">
                                                    {req.details?.quantity && <p>Qty: <strong>{req.details.quantity}</strong></p>}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-gray-500">
                                            {new Date(req.requestedAt).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4">
                                            {req.status === 'Pending' && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-600 border border-amber-200"><Clock size={12}/> Pending</span>}
                                            {req.status === 'Approved' && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-600 border border-emerald-200"><CheckCircle size={12}/> Approved</span>}
                                            {req.status === 'Rejected' && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-600 border border-rose-200"><XCircle size={12}/> Rejected</span>}
                                        </td>
                                        <td className="px-6 py-4">
                                            <button 
                                                onClick={() => setActionModal(req)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                                    req.status === 'Pending' 
                                                    ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                }`}
                                            >
                                                {req.status === 'Pending' ? 'Review' : 'Update'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {requests.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                            No requests found.
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
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-slide-up">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h3 className="text-lg font-bold text-gray-900">Review Request</h3>
                            <button onClick={() => setActionModal(null)} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg transition-colors">
                                <XCircle size={20} />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-4">
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                <p className="text-sm text-gray-500 mb-1">Request Type</p>
                                <p className="font-medium text-gray-900">{actionModal.requestType}</p>
                                
                                {actionModal.category === 'Loan' && (
                                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                                        <div>
                                            <p className="text-gray-500">Amount</p>
                                            <p className="font-semibold text-gray-900">Rs. {actionModal.details?.requestedAmount}</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-500">Deduction/mo</p>
                                            <p className="font-semibold text-gray-900">Rs. {actionModal.details?.recommendedMonthlyDeduction}</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Admin Comments (Optional)</label>
                                <textarea 
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow resize-none h-24"
                                    placeholder="Add any remarks for the employee..."
                                    value={adminComments}
                                    onChange={(e) => setAdminComments(e.target.value)}
                                ></textarea>
                            </div>
                        </div>

                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 flex-wrap">
                            <button 
                                onClick={() => handleAction('Pending')}
                                className="px-4 py-2 bg-white border border-amber-200 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors font-medium text-sm"
                            >
                                Mark Pending
                            </button>
                            <button 
                                onClick={() => handleAction('Rejected')}
                                className="px-4 py-2 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors font-medium text-sm"
                            >
                                Reject
                            </button>
                            <button 
                                onClick={() => handleAction('Approved')}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors font-medium text-sm shadow-sm"
                            >
                                Approve Request
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* End of Requests Tab */}
                </>
            )}
        </div>
    );
};

export default AdminRequests;
