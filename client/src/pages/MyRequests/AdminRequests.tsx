import { useState, useEffect } from 'react';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { formatEmployeeFullName } from '../../utils/nameHelper';
import { Package, Banknote, CheckCircle, Clock, XCircle, FileText, Download, Search } from 'lucide-react';
import CategoryConfig from './CategoryConfig';
import GeneratedDocuments from './GeneratedDocuments';

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const AdminRequests = () => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const canManageCategoriesAndDocs = ['admin', 'super-admin', 'hr'].includes(user?.role || '');
    const isAdminOrSuper = ['admin', 'super-admin', 'hr', 'finance'].includes(user?.role || '');

    const [activeTab, setActiveTab] = useState<'Requests' | 'Categories' | 'Documents'>('Requests');
    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionModal, setActionModal] = useState<any>(null);
    const [adminComments, setAdminComments] = useState('');
    const [erpReferenceId, setErpReferenceId] = useState('');

    // Search and filter state
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');

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
            const isLoan = actionModal.category === 'Loan' || actionModal.category === 'Request Loan';
            if ((status === 'Completed' || (status === 'Approved' && actionModal.status === 'Pending Finance')) && isLoan && !erpReferenceId.trim()) {
                showToast('ERP Transaction Reference ID is required to approve & disburse loan requests.', 'warning');
                return;
            }

            const token = localStorage.getItem('token');
            const res = await fetch(`${api.baseURL}/api/my-requests/${actionModal._id}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ status, adminComments, erpReferenceId })
            });

            if (res.ok) {
                setActionModal(null);
                setAdminComments('');
                setErpReferenceId('');
                fetchRequests();
                showToast(`Request updated to ${status}`, 'success');
            } else {
                showToast('Failed to update request', 'error');
            }
        } catch (err) {
            console.error(err);
        }
    };

    const isFinanceRole = (user?.role || '').toLowerCase().trim() === 'finance';

    const filteredRequests = requests.filter(req => {
        if (isFinanceRole) {
            const cat = (req.category || '').toLowerCase();
            const reqType = (req.requestType || '').toLowerCase();
            const isFinanceRelated = cat.includes('loan') || cat.includes('finance') || cat.includes('pf') || cat.includes('provident') || cat.includes('salary') || cat.includes('advance') ||
                                     reqType.includes('loan') || reqType.includes('finance') || reqType.includes('pf') || reqType.includes('salary') || reqType.includes('advance');
            if (!isFinanceRelated) return false;
        }

        const employeeName = formatEmployeeFullName(req.employee, '').toLowerCase();
        const matchesSearch = req.requestType.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              req.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              employeeName.includes(searchTerm.toLowerCase()) ||
                              (req.employee?.employeeId || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'All' 
            ? true 
            : statusFilter === 'Pending' 
            ? (req.status === 'Pending' || req.status === 'Pending HR' || req.status === 'Pending Finance')
            : req.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Manage Requests</h1>
                    <p className="text-sm text-gray-500 mt-1">Review and manage asset, loan, and document requests from employees.</p>
                </div>
            </div>

            {/* Navigation Tabs (Only visible for admin/super-admin/hr) */}
            {canManageCategoriesAndDocs && (
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
            )}

            {activeTab === 'Categories' && canManageCategoriesAndDocs ? (
                <CategoryConfig />
            ) : activeTab === 'Documents' && canManageCategoriesAndDocs ? (
                <GeneratedDocuments />
            ) : (
                <>
                {/* Search and Filters Layout */}
                <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl border border-gray-100 shadow-sm mb-6">
                    <div className="relative w-full sm:max-w-xs">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input 
                            type="text"
                            placeholder="Search employee or type..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto overflow-x-auto scrollbar-none pb-1">
                        {['All', 'Pending', 'Pending HR', 'Pending Finance', 'Approved', 'Rejected', 'Completed', 'Cancelled'].map((status) => (
                            <button
                                key={status}
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
                                    {filteredRequests.map(req => (
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
                                                        <p className="font-medium text-gray-900">{formatEmployeeFullName(req.employee, 'Employee')}</p>
                                                        <p className="text-xs text-gray-500">{req.employee?.employeeId}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    {(req.category === 'Asset' || req.category === 'Request Asset') ? <Package size={16} className="text-purple-500"/> : <Banknote size={16} className="text-emerald-500"/>}
                                                    <span className="font-medium text-gray-700">{req.requestType}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                {(req.category === 'Loan' || req.category === 'Request Loan') ? (
                                                    <div className="text-xs space-y-1 text-gray-600">
                                                        <p>Amount: <strong className="text-gray-900">Rs. {req.details?.requestedAmount?.toLocaleString()}</strong></p>
                                                        {req.details?.paybackDuration && (
                                                            <p>Duration: <strong className="text-gray-900">{req.details.paybackDuration} Months</strong></p>
                                                        )}
                                                        <p>Deduction: <strong className="text-gray-900">Rs. {req.details?.recommendedMonthlyDeduction?.toLocaleString()}/mo</strong></p>
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
                                                {(req.status === 'Pending' || req.status === 'Pending HR') && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-600 border border-amber-200"><Clock size={12}/> Pending HR</span>}
                                                {req.status === 'Pending Finance' && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600 border border-indigo-200"><Clock size={12}/> Pending Finance</span>}
                                                {req.status === 'Approved' && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-600 border border-emerald-200"><CheckCircle size={12}/> Approved</span>}
                                                {req.status === 'Rejected' && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-600 border border-rose-200"><XCircle size={12}/> Rejected</span>}
                                                {req.status === 'Completed' && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200"><CheckCircle size={12}/> Completed</span>}
                                                {req.status === 'Cancelled' && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200"><XCircle size={12}/> Cancelled</span>}
                                            </td>
                                            <td className="px-6 py-4">
                                                <button 
                                                    onClick={() => {
                                                        setActionModal(req);
                                                        setAdminComments(req.adminComments || '');
                                                        setErpReferenceId(req.erpReferenceId || '');
                                                    }}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                                        (req.status === 'Pending' || req.status === 'Pending HR' || req.status === 'Pending Finance') 
                                                        ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                    }`}
                                                >
                                                    {(req.status === 'Pending' || req.status === 'Pending HR' || req.status === 'Pending Finance') ? 'Review' : 'View'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredRequests.length === 0 && (
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
                </>
            )}

            {/* Review Action Modal */}
            {actionModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-slide-up">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h3 className="text-lg font-bold text-gray-900">Review Request</h3>
                            <button onClick={() => { setActionModal(null); setAdminComments(''); setErpReferenceId(''); }} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg transition-colors">
                                <XCircle size={20} />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
                            {/* Workflow Visual Timeline */}
                            <div className="space-y-3 pb-3 border-b border-gray-100">
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Workflow Timeline</p>
                                <div className="relative pl-6 border-l border-gray-200 space-y-4">
                                    <div className="relative">
                                        <div className="absolute -left-[30px] top-1 bg-emerald-500 text-white w-4 h-4 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                                            <CheckCircle size={10} />
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold text-gray-900">Submitted by Employee</p>
                                            <p className="text-[10px] text-gray-400">{new Date(actionModal.requestedAt).toLocaleString()}</p>
                                        </div>
                                    </div>
                                    
                                    {(actionModal.status === 'Approved' || actionModal.status === 'Completed' || actionModal.status === 'Rejected') && (
                                        <div className="relative">
                                            <div className="absolute -left-[30px] top-1 bg-emerald-500 text-white w-4 h-4 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                                                <CheckCircle size={10} />
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold text-gray-900">Processed ({actionModal.status})</p>
                                                <p className="text-[10px] text-gray-400">{new Date(actionModal.updatedAt).toLocaleString()}</p>
                                            </div>
                                        </div>
                                    )}

                                    {actionModal.status === 'Cancelled' && (
                                        <div className="relative">
                                            <div className="absolute -left-[30px] top-1 bg-gray-400 text-white w-4 h-4 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                                                <XCircle size={10} />
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold text-gray-500">Cancelled by Employee</p>
                                                <p className="text-[10px] text-gray-400">{new Date(actionModal.updatedAt).toLocaleString()}</p>
                                            </div>
                                        </div>
                                    )}

                                    {(actionModal.status === 'Pending' || actionModal.status === 'Pending HR') && (
                                        <div className="relative">
                                            <div className="absolute -left-[30px] top-1 bg-amber-400 text-white w-4 h-4 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                                                <Clock size={10} />
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold text-gray-900">Awaiting HR / Admin Approval</p>
                                            </div>
                                        </div>
                                    )}

                                    {actionModal.status === 'Pending Finance' && (
                                        <>
                                            <div className="relative">
                                                <div className="absolute -left-[30px] top-1 bg-emerald-500 text-white w-4 h-4 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                                                    <CheckCircle size={10} />
                                                </div>
                                                <div>
                                                    <p className="text-xs font-semibold text-gray-900">HR / Admin Approved</p>
                                                </div>
                                            </div>
                                            <div className="relative">
                                                <div className="absolute -left-[30px] top-1 bg-indigo-500 text-white w-4 h-4 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                                                    <Clock size={10} />
                                                </div>
                                                <div>
                                                    <p className="text-xs font-semibold text-gray-900">Awaiting Finance Approval & Disbursement</p>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            {isFinanceRole && (actionModal.status === 'Pending' || actionModal.status === 'Pending HR') && (actionModal.category === 'Loan' || actionModal.category === 'Request Loan') && (
                                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-medium flex items-center gap-2">
                                    <span>⚠️</span> Awaiting HR/Admin stage 1 approval before Finance can disburse or approve.
                                </div>
                            )}

                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-3">
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div>
                                        <p className="text-gray-500 text-xs">Employee</p>
                                        <p className="font-semibold text-gray-900">{formatEmployeeFullName(actionModal.employee, 'Employee')}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-500 text-xs">Employee ID</p>
                                        <p className="font-semibold text-gray-900">{actionModal.employee?.employeeId}</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-sm border-t border-gray-200/60 pt-2">
                                    <div>
                                        <p className="text-gray-500 text-xs">Category</p>
                                        <p className="font-semibold text-gray-900">{actionModal.category}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-500 text-xs">Request Type</p>
                                        <p className="font-semibold text-gray-900">{actionModal.requestType}</p>
                                    </div>
                                </div>
                                
                                {actionModal.erpReferenceId && (
                                    <div className="grid grid-cols-2 gap-2 text-sm border-t border-gray-200/60 pt-2 bg-indigo-50/40 p-2.5 rounded-xl border border-indigo-100">
                                        <div className="col-span-2">
                                            <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">ERP Transaction ID</p>
                                            <p className="font-extrabold text-indigo-700 text-xs mt-0.5">{actionModal.erpReferenceId}</p>
                                        </div>
                                    </div>
                                )}
                                
                                {(actionModal.category === 'Loan' || actionModal.category === 'Request Loan') && (
                                    <>
                                        <div className="mt-3 grid grid-cols-3 gap-3 text-sm border-t border-gray-200/60 pt-2">
                                            <div>
                                                <p className="text-gray-500 text-xs">Amount</p>
                                                <p className="font-semibold text-gray-900">Rs. {actionModal.details?.requestedAmount?.toLocaleString()}</p>
                                            </div>
                                            <div>
                                                <p className="text-gray-500 text-xs">Duration</p>
                                                <p className="font-semibold text-gray-900">{actionModal.details?.paybackDuration || '-'} Months</p>
                                            </div>
                                            <div>
                                                <p className="text-gray-500 text-xs">Deduction/mo</p>
                                                <p className="font-semibold text-gray-900">Rs. {actionModal.details?.recommendedMonthlyDeduction?.toLocaleString()}</p>
                                            </div>
                                        </div>
                                        {actionModal.employee && (
                                            (() => {
                                                const pfBal = actionModal.employee.providentFundBalance ?? 0;
                                                const reqAmt = actionModal.details?.requestedAmount ?? 0;
                                                const isExceeded = reqAmt > pfBal;
                                                return isExceeded ? (
                                                    <div className="mt-3 p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs space-y-1">
                                                        <div className="flex justify-between font-bold text-rose-700">
                                                            <span>Employee's PF Balance:</span>
                                                            <span>Rs. {pfBal.toLocaleString()}</span>
                                                        </div>
                                                        <p className="text-rose-600 font-medium flex items-center gap-1">
                                                            <span>⚠️</span> Warning: Requested amount exceeds their Provident Fund balance.
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <div className="mt-3 p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs flex justify-between font-semibold text-slate-600">
                                                        <span>Employee's PF Balance:</span>
                                                        <span className="text-slate-800 font-bold">Rs. {pfBal.toLocaleString()}</span>
                                                    </div>
                                                );
                                            })()
                                        )}
                                    </>
                                )}

                                {actionModal.details?.periodMonth && (
                                    <div className="mt-3 text-sm border-t border-gray-200/60 pt-2 flex justify-between items-center">
                                        <span className="text-gray-500 text-xs">Target Payroll Period</span>
                                        <span className="font-semibold text-gray-900 bg-amber-50 px-2 py-0.5 rounded text-amber-900 border border-amber-200">
                                            {MONTH_NAMES[actionModal.details.periodMonth] || actionModal.details.periodMonth} {actionModal.details.periodYear || ''}
                                        </span>
                                    </div>
                                )}

                                {(actionModal.category !== 'Loan' && actionModal.category !== 'Request Loan') && actionModal.details?.quantity && (
                                    <div className="mt-3 text-sm border-t border-gray-200/60 pt-2">
                                        <p className="text-gray-500 text-xs">Quantity</p>
                                        <p className="font-semibold text-gray-900">{actionModal.details.quantity}</p>
                                    </div>
                                )}
                            </div>

                            {/* Reason details */}
                            {actionModal.details?.reason && (
                                <div className="space-y-1">
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Reason / Purpose</p>
                                    <p className="text-sm text-gray-700 bg-slate-50 p-3 rounded-lg border border-slate-100 italic">
                                        "{actionModal.details.reason}"
                                    </p>
                                </div>
                            )}

                            {/* Attachments details */}
                            {actionModal.details?.attachments?.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Attachments</p>
                                    <div className="flex flex-col gap-2">
                                        {actionModal.details.attachments.map((file: any, idx: number) => (
                                            <a 
                                                key={idx}
                                                href={`${api.baseURL}/api/my-requests/attachments/${file.fileId}?name=${encodeURIComponent(file.fileName)}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex items-center justify-between bg-slate-50 border border-slate-200 p-2 rounded-lg text-xs hover:bg-indigo-50/50 hover:border-indigo-200 transition-all font-medium text-indigo-700"
                                            >
                                                <span className="flex items-center gap-1.5 truncate max-w-[280px]">
                                                    <FileText size={14} className="text-slate-400" />
                                                    {file.fileName}
                                                </span>
                                                <Download size={14} />
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Remarks / Note</label>
                                <textarea 
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow resize-none h-20 text-sm"
                                    placeholder="Add any remarks for the employee..."
                                    value={adminComments}
                                    onChange={(e) => setAdminComments(e.target.value)}
                                ></textarea>
                            </div>

                            {/* Render ERP Transaction ID input for completing financial requests */}
                            {(actionModal.category === 'Loan' || actionModal.category === 'Request Loan' || actionModal.status === 'Approved' || actionModal.status === 'Pending Finance') && (
                                <div className="space-y-1">
                                    <label className="block text-xs font-bold text-gray-500 uppercase">
                                        ERP Transaction Reference ID { (actionModal.category === 'Loan' || actionModal.category === 'Request Loan') && <span className="text-rose-500">*</span> }
                                    </label>
                                    <input 
                                        type="text"
                                        className="w-full bg-slate-50 border border-slate-200 text-slate-800 px-3.5 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-xs font-semibold"
                                        placeholder="e.g. ERP-TXN-123456"
                                        value={erpReferenceId}
                                        onChange={(e) => setErpReferenceId(e.target.value)}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2 flex-wrap">
                            <button 
                                onClick={() => { setActionModal(null); setAdminComments(''); setErpReferenceId(''); }}
                                className="px-4 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium text-sm"
                            >
                                Close
                            </button>
                            {(actionModal.status === 'Pending' || actionModal.status === 'Pending HR') && (
                                <>
                                    <button 
                                        onClick={() => handleAction('Rejected')}
                                        className="px-4 py-2 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors font-medium text-sm"
                                    >
                                        Reject
                                    </button>
                                    {!isFinanceRole && (
                                        <button 
                                            onClick={() => handleAction('Approved')}
                                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors font-medium text-sm shadow-sm"
                                        >
                                            {(actionModal.category === 'Loan' || actionModal.category === 'Request Loan') ? 'Approve (Forward to Finance)' : 'Approve'}
                                        </button>
                                    )}
                                </>
                            )}
                            {actionModal.status === 'Pending Finance' && (
                                <>
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
                                        Approve & Disburse
                                    </button>
                                    <button 
                                        onClick={() => handleAction('Completed')}
                                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium text-sm shadow-sm"
                                    >
                                        Complete Request
                                    </button>
                                </>
                            )}
                            {actionModal.status === 'Approved' && isAdminOrSuper && (
                                <button 
                                    onClick={() => handleAction('Completed')}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium text-sm shadow-sm"
                                >
                                    Complete Request
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminRequests;
