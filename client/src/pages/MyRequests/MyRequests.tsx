import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../../utils/api';
import { 
    FileText, Package, Banknote, Download, CheckCircle, Clock, XCircle, 
    Monitor, Briefcase, Wrench, Settings, Search, Paperclip, Eye,
    ChevronDown, ChevronUp, AlertTriangle
} from 'lucide-react';
import AlertModal from '../../components/UI/AlertModal';

const ICON_MAP: Record<string, any> = {
    Package, Monitor, Briefcase, FileText, Tool: Wrench, Settings, Banknote
};

const MyRequests = () => {
    const location = useLocation();
    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState<any>(null);
    
    // Alert configurations
    const [alertConfig, setAlertConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type: 'info' | 'success' | 'warning' | 'error';
    }>({
        isOpen: false,
        title: '',
        message: '',
        type: 'info'
    });

    const triggerAlert = (title: string, message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
        setAlertConfig({ isOpen: true, title, message, type });
    };
    
    // Form fields
    const [selectedOption, setSelectedOption] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [loanAmount, setLoanAmount] = useState('');
    const [paybackDuration, setPaybackDuration] = useState('');
    const [monthlyDeduction, setMonthlyDeduction] = useState('');
    const [reason, setReason] = useState('');
    const [purposeDetail, setPurposeDetail] = useState('');
    const [internshipStartDate, setInternshipStartDate] = useState('');
    const [internshipEndDate, setInternshipEndDate] = useState('');
    
    // Custom dropdown open state
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    
    // Custom Categories state
    const [customCategories, setCustomCategories] = useState<any[]>([]);
    const [categoriesLoading, setCategoriesLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState<any>(null);

    // Provident Fund Balance state
    const [pfBalance, setPfBalance] = useState<number | null>(null);

    // File attachments state
    const [uploadedFiles, setUploadedFiles] = useState<{ fileId: string; fileName: string }[]>([]);
    const [uploadingFile, setUploadingFile] = useState(false);

    // Search and filter state
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    
    // PF Loan Exceeded confirmation
    const [showLoanConfirm, setShowLoanConfirm] = useState(false);

    useEffect(() => {
        fetchRequests();
        fetchCustomCategories();
        fetchPfBalance();
        if (location.state?.openNew) {
            setShowModal(true);
        }
    }, [location.state]);

    const fetchPfBalance = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.baseURL}/api/my-requests/pf-balance`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setPfBalance(data.pfBalance);
            }
        } catch (err) {
            console.error('Failed to fetch PF balance', err);
        }
    };

    const fetchCustomCategories = async () => {
        try {
            const cached = localStorage.getItem('requestCategories');
            if (cached) {
                try {
                    setCustomCategories(JSON.parse(cached));
                    setCategoriesLoading(false);
                } catch (e) {
                    // Ignore parse error
                }
            }
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.baseURL}/api/request-categories`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setCustomCategories(data);
                localStorage.setItem('requestCategories', JSON.stringify(data));
            }
        } catch (err) {
            console.error('Failed to fetch categories', err);
        } finally {
            setCategoriesLoading(false);
        }
    };

    const fetchRequests = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.baseURL}/api/my-requests/my-requests`, {
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

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingFile(true);
        try {
            const token = localStorage.getItem('token');
            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch(`${api.baseURL}/api/my-requests/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (res.ok) {
                const data = await res.json();
                setUploadedFiles(prev => [...prev, { fileId: data.fileId, fileName: data.fileName }]);
            } else {
                const err = await res.json().catch(() => ({ message: 'Failed to upload file' }));
                triggerAlert('Upload Error', err.message || 'Failed to upload file.', 'error');
            }
        } catch (err) {
            console.error(err);
            triggerAlert('Upload Error', 'Failed to upload attachment file.', 'error');
        } finally {
            setUploadingFile(false);
        }
    };

    const handleGenerateDocument = async () => {
        if (!reason || !reason.trim()) {
            triggerAlert('Validation Error', 'Please enter the Purpose / Reason before generating the document.', 'warning');
            return;
        }
        const isNocDoc = selectedOption.toLowerCase().includes('noc') || selectedOption.toLowerCase().includes('no objection');
        if (isNocDoc && (!purposeDetail || !purposeDetail.trim())) {
            triggerAlert('Validation Error', 'Please enter the Purpose Detail before generating the NOC document.', 'warning');
            return;
        }

        const isInternshipDoc = selectedOption.toLowerCase().includes('internship');
        if (isInternshipDoc) {
            if (!internshipStartDate || !internshipEndDate) {
                triggerAlert('Validation Error', 'Internship start date and end date are required. Please fill in the internship dates.', 'warning');
                return;
            }
        }

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.baseURL}/api/documents/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ 
                    documentType: selectedOption, 
                    reason,
                    customVars: {
                        purpose: reason,
                        purposeDetail: purposeDetail,
                        startDate: internshipStartDate,
                        endDate: internshipEndDate,
                        internshipStartDate: internshipStartDate,
                        internshipEndDate: internshipEndDate
                    }
                })
            });

            if (res.ok) {
                // Download the PDF
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${selectedOption.replace(/\s+/g, '_')}.pdf`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
                setShowModal(false);
            } else {
                const data = await res.json().catch(() => ({}));
                const errMsg = data.message || `Failed to generate '${selectedOption}' document.`;
                const isHrAdmin = ['admin', 'super-admin', 'hr'].includes(data.userRole);
                if (isHrAdmin) {
                    triggerAlert('HR Configuration Required', errMsg, 'warning');
                } else {
                    triggerAlert('Template Not Available', errMsg, 'info');
                }
            }
        } catch (err) {
            console.error(err);
            triggerAlert('Generation Error', 'An unexpected error occurred while requesting document generation.', 'error');
        }
    };

    const handleSubmitRequest = async (anyways: boolean | React.MouseEvent = false) => {
        if (!activeCategory) return;
        
        const shouldProceedAnyways = anyways === true;
        
        // Loan PF Cap Validation
        if (activeCategory.systemType === 'loan') {
            if (!loanAmount || Number(loanAmount) <= 0) {
                triggerAlert('Validation Error', 'Please enter a valid loan amount.', 'warning');
                return;
            }
            if (!monthlyDeduction || Number(monthlyDeduction) <= 0) {
                triggerAlert('Validation Error', 'Please enter a valid monthly deduction amount.', 'warning');
                return;
            }
            if (!paybackDuration || Number(paybackDuration) > 12) {
                triggerAlert('Validation Error', 'Loan duration cannot exceed 12 months. Please increase your monthly deduction.', 'warning');
                return;
            }
            if (!shouldProceedAnyways && pfBalance !== null && Number(loanAmount) > pfBalance) {
                setShowLoanConfirm(true);
                return;
            }
        }

        try {
            let details: any = {
                reason,
                attachments: uploadedFiles
            };
            let type = selectedOption;

            if (activeCategory.systemType === 'loan') {
                type = 'Loan';
                details = { 
                    ...details,
                    requestedAmount: Number(loanAmount), 
                    paybackDuration: Number(paybackDuration),
                    recommendedMonthlyDeduction: Number(monthlyDeduction) 
                };
            } else {
                details = { 
                    ...details,
                    quantity 
                };
            }

            const token = localStorage.getItem('token');
            const res = await fetch(`${api.baseURL}/api/my-requests`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    category: activeCategory.title,
                    requestType: type,
                    details
                })
            });

            if (res.ok) {
                setShowModal(false);
                fetchRequests();
            } else {
                triggerAlert('Submission Error', 'Failed to submit request. Please try again.', 'error');
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleCancelRequest = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to cancel this request?')) return;
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.baseURL}/api/my-requests/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                fetchRequests();
            } else {
                triggerAlert('Cancellation Error', 'Failed to cancel request.', 'error');
            }
        } catch (err) {
            console.error(err);
        }
    };

    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 9;

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilter]);

    const filteredRequests = requests.filter(req => {
        const matchesSearch = req.requestType.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              req.category.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'All' 
            ? true 
            : statusFilter === 'Pending' 
            ? (req.status === 'Pending' || req.status === 'Pending HR' || req.status === 'Pending Finance')
            : req.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const paginatedRequests = filteredRequests.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">My Requests</h1>
                    <p className="text-sm text-gray-500 mt-1">Manage your document, asset, and loan requests.</p>
                </div>
            </div>

            {/* Quick Actions Grid */}
            {categoriesLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    {[1, 2, 3].map((skeleton) => (
                        <div key={skeleton} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 animate-pulse">
                            <div className="flex flex-col items-center justify-center space-y-4">
                                <div className="p-4 bg-gray-100 rounded-2xl w-16 h-16"></div>
                                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                                <div className="h-3 bg-gray-100 rounded w-1/2"></div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    {customCategories.filter(cat => cat.isActive !== false).map(cat => {
                        const IconComponent = ICON_MAP[cat.icon] || Package;
                    return (
                        <div 
                            key={cat._id}
                            onClick={() => { 
                                const visibleOptions = cat.options.filter((opt: string) => !(cat.hiddenOptions || []).includes(opt));
                                setActiveCategory(cat); 
                                setSelectedOption(visibleOptions[0] || '');
                                setQuantity(1);
                                setLoanAmount('');
                                setPaybackDuration('');
                                setMonthlyDeduction('');
                                setReason('');
                                setUploadedFiles([]);
                                setDropdownOpen(false);
                                setShowModal(true); 
                            }}
                            className={`bg-gradient-to-br ${
                                cat.systemType === 'document' ? 'from-blue-500 to-blue-600' :
                                cat.systemType === 'loan' ? 'from-emerald-500 to-emerald-600' :
                                cat.title === 'Request Asset' ? 'from-purple-500 to-purple-600' :
                                'from-indigo-500 to-indigo-600'
                            } rounded-2xl p-6 text-white cursor-pointer hover:-translate-y-1 hover:shadow-lg transition-all duration-300 relative overflow-hidden group shadow-md`}
                        >
                            <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-500">
                                <IconComponent size={80} />
                            </div>
                            <div className="relative z-10">
                                <div className="bg-white/20 w-12 h-12 rounded-xl flex items-center justify-center backdrop-blur-sm mb-4 shadow-sm border border-white/10">
                                    <IconComponent size={24} className="text-white" />
                                </div>
                                <h3 className="text-xl font-bold mb-2">{cat.title}</h3>
                                <p className="text-white/90 text-sm leading-relaxed">{cat.description}</p>
                            </div>
                        </div>
                    );
                })}
            </div>
            )}

            {/* Filter and Search Layout */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                <div className="relative w-full sm:max-w-xs">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                        type="text"
                        placeholder="Search requests..."
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

            <div className="flex items-center justify-between mt-8 mb-4 border-b border-gray-200 pb-2">
                <h2 className="text-lg font-bold text-gray-900">Request History</h2>
            </div>

            {loading ? (
                <div className="text-center py-10">Loading...</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {paginatedRequests.map(req => (
                        <div 
                            key={req._id} 
                            onClick={() => { setSelectedRequest(req); setShowDetailModal(true); }}
                            className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-all cursor-pointer relative group flex flex-col justify-between"
                        >
                            <div>
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg ${
                                            (req.category === 'Document' || req.category === 'Generate Document') ? 'bg-blue-50 text-blue-600' : 
                                            (req.category === 'Asset' || req.category === 'Request Asset') ? 'bg-purple-50 text-purple-600' : 
                                            (req.category === 'Loan' || req.category === 'Request Loan') ? 'bg-emerald-50 text-emerald-600' : 
                                            'bg-indigo-50 text-indigo-600'
                                        }`}>
                                            {(req.category === 'Document' || req.category === 'Generate Document') && <FileText size={20} />}
                                            {(req.category === 'Asset' || req.category === 'Request Asset') && <Package size={20} />}
                                            {(req.category === 'Loan' || req.category === 'Request Loan') && <Banknote size={20} />}
                                            {(req.category !== 'Document' && req.category !== 'Generate Document' && req.category !== 'Asset' && req.category !== 'Request Asset' && req.category !== 'Loan' && req.category !== 'Request Loan') && <Package size={20} />}
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-gray-900">{req.requestType}</h3>
                                            <p className="text-xs text-gray-500">{new Date(req.requestedAt).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1.5">
                                        {(req.status === 'Pending' || req.status === 'Pending HR') && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-600 border border-amber-200"><Clock size={12}/> Pending HR</span>}
                                        {req.status === 'Pending Finance' && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600 border border-indigo-200"><Clock size={12}/> Pending Finance</span>}
                                        {req.status === 'Approved' && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-600 border border-emerald-200"><CheckCircle size={12}/> Approved</span>}
                                        {req.status === 'Rejected' && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-600 border border-rose-200"><XCircle size={12}/> Rejected</span>}
                                        {req.status === 'Completed' && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200"><CheckCircle size={12}/> Completed</span>}
                                        {req.status === 'Cancelled' && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200"><XCircle size={12}/> Cancelled</span>}
                                    </div>
                                </div>
                                
                                {(req.category === 'Loan' || req.category === 'Request Loan') && (
                                    <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs sm:text-sm">
                                        <div className="flex justify-between items-center gap-2 mb-1">
                                            <span className="text-gray-500 shrink-0">Amount</span>
                                            <span className="font-semibold text-gray-800 text-right whitespace-nowrap">Rs. {req.details?.requestedAmount?.toLocaleString()}</span>
                                        </div>
                                        {req.details?.paybackDuration && (
                                            <div className="flex justify-between items-center gap-2 mb-1">
                                                <span className="text-gray-500 shrink-0">Duration</span>
                                                <span className="font-semibold text-gray-800 text-right whitespace-nowrap">{req.details.paybackDuration} Months</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between items-center gap-2">
                                            <span className="text-gray-500 shrink-0">Monthly Deduction</span>
                                            <span className="font-semibold text-gray-800 text-right whitespace-nowrap">Rs. {req.details?.recommendedMonthlyDeduction?.toLocaleString()}</span>
                                        </div>
                                    </div>
                                )}

                                {(req.category !== 'Loan' && req.category !== 'Request Loan' && req.category !== 'Document' && req.category !== 'Generate Document') && req.details?.quantity && (
                                    <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm">
                                        <div className="flex justify-between"><span className="text-gray-500">Quantity</span><span className="font-medium">{req.details.quantity}</span></div>
                                    </div>
                                )}

                                {req.details?.reason && (
                                    <p className="mt-3 text-xs text-gray-600 italic line-clamp-2">
                                        "{req.details.reason}"
                                    </p>
                                )}
                            </div>

                            <div className="mt-4 flex justify-between items-center border-t border-gray-100 pt-3">
                                <span className="text-xs text-indigo-600 font-semibold inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Eye size={12} /> View Details
                                </span>
                                {req.status === 'Pending' && (
                                    <button
                                        onClick={(e) => handleCancelRequest(req._id, e)}
                                        className="px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-md transition-colors font-medium ml-auto"
                                    >
                                        Cancel
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                    {filteredRequests.length === 0 && (
                        <div className="col-span-full py-12 text-center text-gray-500 bg-white rounded-xl border border-dashed border-gray-300">
                            No requests found. Click on the action cards above to get started.
                        </div>
                    )}
                </div>
            )}

            {filteredRequests.length > pageSize && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-white rounded-xl border border-gray-200 shadow-sm mt-4">
                    <div className="text-xs text-gray-500 font-medium">
                        Showing <span className="font-bold text-gray-700">{(currentPage - 1) * pageSize + 1}</span> to{' '}
                        <span className="font-bold text-gray-700">{Math.min(currentPage * pageSize, filteredRequests.length)}</span> of{' '}
                        <span className="font-bold text-gray-700">{filteredRequests.length}</span> entries
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
                            onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredRequests.length / pageSize), p + 1))}
                            disabled={currentPage === Math.ceil(filteredRequests.length / pageSize)}
                            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}

            {/* Submission Modal */}
            {showModal && activeCategory && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-slide-up">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h3 className="text-lg font-bold text-gray-900">
                                {activeCategory.title}
                            </h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg transition-colors">
                                <XCircle size={20} />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                            {activeCategory.systemType === 'document' && (
                                <div className="bg-blue-50 text-blue-700 p-3 rounded-lg text-sm flex gap-2 mb-4">
                                    <Download size={16} className="shrink-0 mt-0.5" />
                                    <p>Documents do not require HR approval. They will be generated and downloaded immediately with a verifiable QR code.</p>
                                </div>
                            )}

                            {activeCategory.systemType === 'loan' ? (
                                <>
                                    <div className="bg-emerald-50 text-emerald-800 p-3.5 rounded-xl text-sm border border-emerald-100 flex flex-col gap-1">
                                        <div className="flex justify-between">
                                            <span>Provident Fund Balance:</span>
                                            <strong className="font-bold">
                                                Rs. {pfBalance !== null ? pfBalance.toLocaleString() : 'Loading...'}
                                            </strong>
                                        </div>
                                        <span className="text-[10px] opacity-80">Loan requests exceeding this balance will require special approval.</span>
                                    </div>
                                    {pfBalance !== null && loanAmount && Number(loanAmount) > pfBalance && (
                                        <div className="bg-rose-50 text-rose-700 text-xs px-3.5 py-2.5 rounded-xl border border-rose-100 font-semibold flex items-center gap-1.5 animate-pulse">
                                            <AlertTriangle size={14} className="text-rose-500 shrink-0" />
                                            <span>Warning: Requested amount exceeds your Provident Fund balance.</span>
                                        </div>
                                    )}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Requested Loan Amount (Rs.)</label>
                                        <input 
                                            type="number" 
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                                            value={loanAmount}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setLoanAmount(val);
                                                if (monthlyDeduction) {
                                                    const amt = Number(val);
                                                    const ded = Number(monthlyDeduction);
                                                    if (ded > 0) {
                                                        setPaybackDuration(Math.ceil(amt / ded).toString());
                                                    }
                                                }
                                            }}
                                            placeholder="e.g. 50000"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Deduction (Rs.)</label>
                                        <input 
                                            type="number" 
                                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow ${
                                                paybackDuration && Number(paybackDuration) > 12 ? 'border-rose-300 bg-rose-50' : 'border-gray-300'
                                            }`}
                                            value={monthlyDeduction}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setMonthlyDeduction(val);
                                                if (loanAmount) {
                                                    const amt = Number(loanAmount);
                                                    const ded = Number(val);
                                                    if (ded > 0) {
                                                        setPaybackDuration(Math.ceil(amt / ded).toString());
                                                    } else {
                                                        setPaybackDuration('');
                                                    }
                                                }
                                            }}
                                            placeholder="e.g. 5000"
                                            min="1"
                                        />
                                        {paybackDuration && Number(paybackDuration) > 12 ? (
                                            <p className="text-xs text-rose-500 mt-1 font-medium">Loans must be returned within 1 year (12 months maximum). Please increase your monthly deduction.</p>
                                        ) : (
                                            <p className="text-xs text-gray-500 mt-1">This installment will be automatically deducted from your monthly salary.</p>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <>
                                     <div className="relative" ref={dropdownRef}>
                                         <label className="block text-sm font-medium text-gray-700 mb-1">
                                             {activeCategory.systemType === 'document' ? 'Document Type' : 'Option'}
                                         </label>
                                         <button
                                             type="button"
                                             onClick={() => setDropdownOpen(!dropdownOpen)}
                                             className="w-full flex items-center justify-between px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl shadow-sm hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-left text-sm transition-all text-gray-800 font-medium"
                                         >
                                             <span className="truncate">{selectedOption || "Select option"}</span>
                                             {dropdownOpen ? (
                                                 <ChevronUp size={16} className="text-gray-400 shrink-0 ml-2" />
                                             ) : (
                                                 <ChevronDown size={16} className="text-gray-400 shrink-0 ml-2" />
                                             )}
                                         </button>
                                         
                                         {dropdownOpen && (
                                             <div className="absolute z-50 mt-1.5 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto py-1 divide-y divide-gray-50 text-sm">
                                                 {activeCategory.options
                                                     .filter((opt: string) => !(activeCategory.hiddenOptions || []).includes(opt))
                                                     .map((opt: string, i: number) => {
                                                         const isSelected = selectedOption === opt;
                                                         return (
                                                             <button
                                                                 key={i}
                                                                 type="button"
                                                                 onClick={() => {
                                                                     setSelectedOption(opt);
                                                                     setDropdownOpen(false);
                                                                 }}
                                                                 className={`w-full text-left px-4 py-2.5 transition-colors flex items-center justify-between ${
                                                                     isSelected 
                                                                         ? 'bg-indigo-50 text-indigo-700 font-semibold' 
                                                                         : 'text-gray-700 hover:bg-slate-50'
                                                                 }`}
                                                             >
                                                                 <span>{opt}</span>
                                                                 {isSelected && (
                                                                     <CheckCircle size={14} className="text-indigo-600 shrink-0 ml-2" />
                                                                 )}
                                                             </button>
                                                         );
                                                     })}
                                                 {activeCategory.options.filter((opt: string) => !(activeCategory.hiddenOptions || []).includes(opt)).length === 0 && (
                                                     <div className="px-4 py-3 text-gray-400 italic text-center">
                                                         No options available
                                                     </div>
                                                 )}
                                             </div>
                                         )}
                                     </div>
                                    {activeCategory.systemType !== 'document' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Quantity (Optional)</label>
                                            <input 
                                                type="number" 
                                                min="1" 
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                                                value={quantity}
                                                onChange={(e) => setQuantity(Number(e.target.value))}
                                            />
                                        </div>
                                    )}
                                </>
                            )}

                            {activeCategory.systemType === 'document' ? (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Purpose / Reason <span className="text-rose-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-sm"
                                            value={reason}
                                            onChange={(e) => setReason(e.target.value)}
                                            placeholder="e.g. applying for a visa / opening a bank account / traveling abroad"
                                            required
                                        />
                                    </div>
                                    {(selectedOption.toLowerCase().includes('noc') || selectedOption.toLowerCase().includes('no objection')) && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Purpose Detail (Title / Subject) <span className="text-rose-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-sm"
                                                value={purposeDetail}
                                                onChange={(e) => setPurposeDetail(e.target.value)}
                                                placeholder="e.g. Tourist Visa to Germany / HBL Bank Account Opening"
                                                required
                                            />
                                        </div>
                                    )}
                                    {selectedOption.toLowerCase().includes('internship') && (
                                        <div className="grid grid-cols-2 gap-3 pt-1">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Internship Start Date <span className="text-rose-500">*</span>
                                                </label>
                                                <input
                                                    type="date"
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                                    value={internshipStartDate}
                                                    onChange={(e) => setInternshipStartDate(e.target.value)}
                                                    required
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Internship End Date <span className="text-rose-500">*</span>
                                                </label>
                                                <input
                                                    type="date"
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                                    value={internshipEndDate}
                                                    onChange={(e) => setInternshipEndDate(e.target.value)}
                                                    required
                                                />
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Reason / Purpose
                                    </label>
                                    <textarea
                                        rows={3}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-sm"
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                        placeholder="Explain why you are making this request..."
                                    />
                                </div>
                            )}

                            {activeCategory.systemType !== 'document' && (
                                <>

                                    {/* Attachment Section */}
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-gray-700">Attachments</label>
                                        <div className="flex items-center gap-3">
                                            <label className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 cursor-pointer hover:bg-gray-50 transition-colors shadow-sm">
                                                <Paperclip size={14} /> Add Attachment
                                                <input 
                                                    type="file" 
                                                    className="hidden" 
                                                    onChange={handleFileUpload} 
                                                    disabled={uploadingFile}
                                                />
                                            </label>
                                            {uploadingFile && <span className="text-xs text-gray-500 animate-pulse">Uploading file...</span>}
                                        </div>

                                        {uploadedFiles.length > 0 && (
                                            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-50">
                                                {uploadedFiles.map((file, idx) => (
                                                    <div key={idx} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg text-xs text-slate-700 font-medium">
                                                        <FileText size={12} className="text-slate-400" />
                                                        <span className="max-w-[120px] truncate">{file.fileName}</span>
                                                        <button 
                                                            type="button"
                                                            onClick={() => setUploadedFiles(prev => prev.filter((_, i) => i !== idx))}
                                                            className="text-slate-400 hover:text-rose-500 font-bold ml-1"
                                                        >
                                                            ×
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
                            <button 
                                onClick={() => setShowModal(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors font-medium text-sm"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={activeCategory.systemType === 'document' ? handleGenerateDocument : handleSubmitRequest}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-medium text-sm shadow-sm"
                            >
                                {activeCategory.systemType === 'document' ? 'Generate Document' : 'Submit Request'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Detailed Request Modal with visual timeline */}
            {showDetailModal && selectedRequest && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-slide-up">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h3 className="text-lg font-bold text-gray-900">Request Details</h3>
                            <button onClick={() => { setShowDetailModal(false); setSelectedRequest(null); }} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg transition-colors">
                                <XCircle size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                            {/* Visual Timeline */}
                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Workflow Timeline</h4>
                                <div className="relative pl-6 border-l border-gray-200 space-y-5">
                                    <div className="relative">
                                        <div className="absolute -left-[30px] top-1 bg-emerald-500 text-white w-4 h-4 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                                            <CheckCircle size={10} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900">Submitted Request</p>
                                            <p className="text-xs text-gray-500">{new Date(selectedRequest.requestedAt).toLocaleString()}</p>
                                        </div>
                                    </div>

                                    {/* Action Stage */}
                                    {selectedRequest.status !== 'Pending' && selectedRequest.status !== 'Cancelled' && (
                                        <div className="relative">
                                            <div className="absolute -left-[30px] top-1 bg-emerald-500 text-white w-4 h-4 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                                                <CheckCircle size={10} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-gray-900">
                                                    Request {selectedRequest.status}
                                                </p>
                                                <p className="text-xs text-gray-500">{new Date(selectedRequest.updatedAt).toLocaleString()}</p>
                                            </div>
                                        </div>
                                    )}

                                    {selectedRequest.status === 'Cancelled' && (
                                        <div className="relative">
                                            <div className="absolute -left-[30px] top-1 bg-gray-400 text-white w-4 h-4 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                                                <XCircle size={10} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-gray-500">Request Cancelled</p>
                                                <p className="text-xs text-gray-500">{new Date(selectedRequest.updatedAt).toLocaleString()}</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Pending Admin state */}
                                    {selectedRequest.status === 'Pending' && (
                                        <div className="relative">
                                            <div className="absolute -left-[30px] top-1 bg-amber-400 text-white w-4 h-4 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                                                <Clock size={10} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-gray-900">Awaiting Manager/Admin Review</p>
                                                <p className="text-xs text-gray-400">Usually processed within 1-2 working days.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Details Info */}
                            <div className="space-y-3 pt-4 border-t border-gray-100">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Category:</span>
                                    <span className="font-semibold text-gray-900">{selectedRequest.category}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Request Type:</span>
                                    <span className="font-semibold text-gray-900">{selectedRequest.requestType}</span>
                                </div>
                                
                                {selectedRequest.details?.requestedAmount && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Loan Amount:</span>
                                        <span className="font-semibold text-gray-900">Rs. {selectedRequest.details.requestedAmount.toLocaleString()}</span>
                                    </div>
                                )}
                                {selectedRequest.details?.paybackDuration && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Payback Duration:</span>
                                        <span className="font-semibold text-gray-900">{selectedRequest.details.paybackDuration} Months</span>
                                    </div>
                                )}
                                {selectedRequest.details?.recommendedMonthlyDeduction && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Monthly Deduction:</span>
                                        <span className="font-semibold text-gray-900">Rs. {selectedRequest.details.recommendedMonthlyDeduction.toLocaleString()}</span>
                                    </div>
                                )}
                                {selectedRequest.details?.quantity && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Quantity:</span>
                                        <span className="font-semibold text-gray-900">{selectedRequest.details.quantity}</span>
                                    </div>
                                )}
                            </div>

                            {/* Reason details */}
                            {selectedRequest.details?.reason && (
                                <div className="space-y-1 pt-4 border-t border-gray-100">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Reason / Purpose</h4>
                                    <p className="text-sm text-gray-700 bg-slate-50 p-3 rounded-lg border border-slate-100 italic">
                                        "{selectedRequest.details.reason}"
                                    </p>
                                </div>
                            )}

                            {/* Attachments details */}
                            {selectedRequest.details?.attachments?.length > 0 && (
                                <div className="space-y-2 pt-4 border-t border-gray-100">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Attachments</h4>
                                    <div className="flex flex-col gap-2">
                                        {selectedRequest.details.attachments.map((file: any, idx: number) => (
                                            <a 
                                                key={idx}
                                                href={`${api.baseURL}/api/my-requests/attachments/${file.fileId}?name=${encodeURIComponent(file.fileName)}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex items-center justify-between bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-xs hover:bg-indigo-50/50 hover:border-indigo-200 transition-all font-medium text-indigo-700"
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

                            {/* Admin Note */}
                            {selectedRequest.adminComments && (
                                <div className="space-y-1 pt-4 border-t border-gray-100">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Approver Notes</h4>
                                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-800">
                                        {selectedRequest.adminComments}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                            <button
                                onClick={() => { setShowDetailModal(false); setSelectedRequest(null); }}
                                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors font-medium text-sm"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Custom Theme Alert Modal */}
            <AlertModal
                isOpen={alertConfig.isOpen}
                onClose={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
            />

            {/* Provident Fund Exceeded Confirmation Dialog */}
            {showLoanConfirm && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-rose-100 animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-6 text-center space-y-4">
                            <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center mx-auto text-rose-600">
                                <AlertTriangle size={24} />
                            </div>
                            <div className="space-y-1">
                                <h3 className="text-base font-black text-slate-800">PF Balance Exceeded</h3>
                                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                                    Your requested loan amount (<strong>Rs. {Number(loanAmount).toLocaleString()}</strong>) exceeds your current Provident Fund balance (<strong>Rs. {pfBalance?.toLocaleString()}</strong>).
                                </p>
                                <p className="text-[11px] text-rose-500 font-bold bg-rose-50 p-2 rounded-lg mt-2">
                                    Final approval decision rests with the administrator.
                                </p>
                            </div>
                            <div className="flex gap-2.5 pt-2">
                                <button
                                    onClick={() => setShowLoanConfirm(false)}
                                    className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
                                    type="button"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        setShowLoanConfirm(false);
                                        handleSubmitRequest(true); // Proceed anyways
                                    }}
                                    className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition-colors shadow-sm shadow-rose-100"
                                    type="button"
                                >
                                    Apply Anyways
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MyRequests;
