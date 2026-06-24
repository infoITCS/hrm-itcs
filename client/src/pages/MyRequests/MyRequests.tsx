import { useState, useEffect } from 'react';
import api from '../../utils/api';
import { FileText, Package, Banknote, Download, CheckCircle, Clock, XCircle, Monitor, Briefcase, Wrench, Settings } from 'lucide-react';

const ICON_MAP: Record<string, any> = {
    Package, Monitor, Briefcase, FileText, Tool: Wrench, Settings, Banknote
};

const MyRequests = () => {
    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    
    // Form fields
    const [selectedOption, setSelectedOption] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [loanAmount, setLoanAmount] = useState('');
    const [monthlyDeduction, setMonthlyDeduction] = useState('');
    
    // Custom Categories state
    const [customCategories, setCustomCategories] = useState<any[]>([]);
    const [categoriesLoading, setCategoriesLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState<any>(null);

    useEffect(() => {
        fetchRequests();
        fetchCustomCategories();
    }, []);

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

    const handleGenerateDocument = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.baseURL}/api/documents/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ documentType: selectedOption })
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
                alert('Failed to generate document');
            }
        } catch (err) {
            console.error(err);
            alert('Error generating document');
        }
    };

    const handleSubmitRequest = async () => {
        if (!activeCategory) return;
        try {
            let details: any = {};
            let type = selectedOption;

            if (activeCategory.systemType === 'loan') {
                type = 'Loan';
                details = { requestedAmount: Number(loanAmount), recommendedMonthlyDeduction: Number(monthlyDeduction) };
            } else {
                details = { quantity };
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
                alert('Failed to submit request');
            }
        } catch (err) {
            console.error(err);
        }
    };

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
                                setMonthlyDeduction('');
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

            <div className="flex items-center justify-between mt-8 mb-4 border-b border-gray-200 pb-2">
                <h2 className="text-lg font-bold text-gray-900">Request History</h2>
            </div>

            {loading ? (
                <div className="text-center py-10">Loading...</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {requests.map(req => (
                        <div key={req._id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow">
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
                                <div>
                                    {req.status === 'Pending' && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-600 border border-amber-200"><Clock size={12}/> Pending</span>}
                                    {req.status === 'Approved' && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-600 border border-emerald-200"><CheckCircle size={12}/> Approved</span>}
                                    {req.status === 'Rejected' && <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-600 border border-rose-200"><XCircle size={12}/> Rejected</span>}
                                </div>
                            </div>
                            
                            {(req.category === 'Loan' || req.category === 'Request Loan') && (
                                <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm">
                                    <div className="flex justify-between mb-1"><span className="text-gray-500">Amount</span><span className="font-medium">Rs. {req.details?.requestedAmount}</span></div>
                                    <div className="flex justify-between"><span className="text-gray-500">Monthly Deduction</span><span className="font-medium">Rs. {req.details?.recommendedMonthlyDeduction}</span></div>
                                </div>
                            )}

                            {(req.category !== 'Loan' && req.category !== 'Request Loan' && req.category !== 'Document' && req.category !== 'Generate Document') && req.details?.quantity && (
                                <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm">
                                    <div className="flex justify-between"><span className="text-gray-500">Quantity</span><span className="font-medium">{req.details.quantity}</span></div>
                                </div>
                            )}

                            {req.adminComments && (
                                <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
                                    <strong>Admin Note:</strong> {req.adminComments}
                                </div>
                            )}
                        </div>
                    ))}
                    {requests.length === 0 && (
                        <div className="col-span-full py-12 text-center text-gray-500 bg-white rounded-xl border border-dashed border-gray-300">
                            No requests found. Click "New Request" to get started.
                        </div>
                    )}
                </div>
            )}

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
                        
                        <div className="p-6 space-y-4">
                            {activeCategory.systemType === 'document' && (
                                <div className="bg-blue-50 text-blue-700 p-3 rounded-lg text-sm flex gap-2 mb-4">
                                    <Download size={16} className="shrink-0 mt-0.5" />
                                    <p>Documents do not require HR approval. They will be generated and downloaded immediately with a verifiable QR code.</p>
                                </div>
                            )}

                            {activeCategory.systemType === 'loan' ? (
                                <>
                                    <div className="bg-emerald-50 text-emerald-800 p-3 rounded-lg text-sm border border-emerald-100">
                                        <strong>Note:</strong> Your requested loan amount cannot exceed your current Provident Fund balance.
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Requested Loan Amount (Rs.)</label>
                                        <input 
                                            type="number" 
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                                            value={loanAmount}
                                            onChange={(e) => setLoanAmount(e.target.value)}
                                            placeholder="e.g. 50000"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Recommended Monthly Deduction (Rs.)</label>
                                        <input 
                                            type="number" 
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                                            value={monthlyDeduction}
                                            onChange={(e) => setMonthlyDeduction(e.target.value)}
                                            placeholder="e.g. 5000"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">HR will review this deduction amount against your salary.</p>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">{activeCategory.systemType === 'document' ? 'Document Type' : 'Option'}</label>
                                        <select 
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                                            value={selectedOption}
                                            onChange={(e) => setSelectedOption(e.target.value)}
                                        >
                                            {activeCategory.options
                                                .filter((opt: string) => !(activeCategory.hiddenOptions || []).includes(opt))
                                                .map((opt: string, i: number) => (
                                                    <option key={i} value={opt}>{opt}</option>
                                            ))}
                                            {activeCategory.options.filter((opt: string) => !(activeCategory.hiddenOptions || []).includes(opt)).length === 0 && (
                                                <option value="" disabled>No options available</option>
                                            )}
                                        </select>
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
        </div>
    );
};

export default MyRequests;
