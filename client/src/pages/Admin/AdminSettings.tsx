import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
    Building2, Briefcase, Plus, Pencil, Trash2, Check, X, 
    AlertCircle, Search, ChevronRight, Settings2, ShieldCheck,
    Info, Clock, MapPin, FileText, Banknote, TrendingUp, TrendingDown
} from 'lucide-react';
import api from '../../utils/api'; // Fix import to use default or named correctly
import { usePermissions } from '../../hooks/usePermissions';
import AlertModal from '../../components/UI/AlertModal';
import ShiftManagement from './ShiftManagement';
import LocationManagement from './LocationManagement';
import CompanyManagement from './CompanyManagement';
import TemplateManagement from './TemplateManagement';

type ConfigItem = {
    _id: string;
    name: string;
    type?: 'earning' | 'deduction';
    description?: string;
    isActive: boolean;
};

const AdminSettings = () => {
    const { role, hasSubAccess } = usePermissions();
    const isAdmin = ['super-admin', 'admin', 'hr', 'finance'].includes(role);
    const canShifts = hasSubAccess('settings', 'work-shifts');
    const canCompany = hasSubAccess('settings', 'organization');
    const canTemplates = hasSubAccess('settings', 'holidays-config');
    
    const [activeTab, setActiveTab] = useState<'departments' | 'designations' | 'salary-components' | 'shifts' | 'locations' | 'company' | 'templates'>('departments');
    const [componentTypeFilter, setComponentTypeFilter] = useState<'all' | 'earning' | 'deduction'>('all');
    const [items, setItems] = useState<ConfigItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Modal/Form state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<ConfigItem | null>(null);
    const [formData, setFormData] = useState<{ name: string; type: 'earning' | 'deduction'; description: string; isActive: boolean }>({ 
        name: '', 
        type: 'earning', 
        description: '', 
        isActive: true 
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [alertConfig, setAlertConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type: 'info' | 'success' | 'warning' | 'error' | 'confirm';
        onConfirm?: () => void;
    }>({
        isOpen: false,
        title: '',
        message: '',
        type: 'info'
    });

    const getEndpoint = React.useCallback(() => {
        if (activeTab === 'departments') return '/departments';
        if (activeTab === 'designations') return '/designations';
        if (activeTab === 'salary-components') return '/salary-components';
        return '/departments';
    }, [activeTab]);

    const fetchData = React.useCallback(async () => {
        setLoading(true);
        const token = localStorage.getItem('token');
        try {
            const endpoint = getEndpoint();
            const res = await fetch(`${api.config}${endpoint}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to fetch data');
            const data = await res.json();
            setItems(data);
        } catch (err: any) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [getEndpoint]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleOpenModal = (item?: ConfigItem) => {
        if (item) {
            setEditingItem(item);
            setFormData({ 
                name: item.name, 
                type: item.type || 'earning',
                description: item.description || '', 
                isActive: item.isActive 
            });
        } else {
            setEditingItem(null);
            setFormData({ 
                name: '', 
                type: (componentTypeFilter === 'deduction' ? 'deduction' : 'earning'),
                description: '', 
                isActive: true 
            });
        }
        setError(null);
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim()) return setError('Name is required');

        setSubmitting(true);
        setError(null);
        const token = localStorage.getItem('token');
        const endpoint = getEndpoint();
        const url = editingItem 
            ? `${api.config}${endpoint}/${editingItem._id}` 
            : `${api.config}${endpoint}`;
        
        try {
            const res = await fetch(url, {
                method: editingItem ? 'PUT' : 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify(formData)
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message || 'Operation failed');
            }

            await fetchData();
            setIsModalOpen(false);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = (id: string) => {
        setAlertConfig({
            isOpen: true,
            title: 'Delete Confirmation',
            message: activeTab === 'salary-components' 
                ? 'Are you sure you want to delete this salary component? It will no longer appear in new payroll dropdowns.'
                : 'Are you sure you want to delete this item? This may affect existing employees.',
            type: 'confirm',
            onConfirm: async () => {
                const token = localStorage.getItem('token');
                const endpoint = getEndpoint();
                
                try {
                    const res = await fetch(`${api.config}${endpoint}/${id}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (!res.ok) throw new Error('Delete failed');
                    setItems(prev => prev.filter(i => i._id !== id));
                    setAlertConfig({
                        isOpen: true,
                        title: 'Success',
                        message: 'Item deleted successfully.',
                        type: 'success'
                    });
                } catch (err: any) {
                    setAlertConfig({
                        isOpen: true,
                        title: 'Error',
                        message: err.message,
                        type: 'error'
                    });
                }
            }
        });
    };

    const filteredItems = items.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.description?.toLowerCase().includes(searchTerm.toLowerCase());
        if (activeTab === 'salary-components' && componentTypeFilter !== 'all') {
            return matchesSearch && item.type === componentTypeFilter;
        }
        return matchesSearch;
    });

    if (!isAdmin) {
        return (
            <div className="p-8 text-center bg-white rounded-3xl border border-slate-200 shadow-sm mt-10">
                <ShieldCheck size={48} className="mx-auto text-slate-300 mb-4" />
                <h2 className="text-xl font-bold text-slate-800">Access Denied</h2>
                <p className="text-slate-500">Only administrators can manage organization settings.</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fadeIn pb-12 pt-4">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 text-indigo-600 font-bold text-sm uppercase tracking-widest mb-1">
                        <Settings2 size={16} />
                        Organization Admin
                    </div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">System Configuration</h1>
                    <p className="text-slate-500 mt-1">Manage departments, designations, salary components, and work shifts to maintain system-wide data consistency.</p>
                </div>
                {(activeTab === 'departments' || activeTab === 'designations' || activeTab === 'salary-components') && (
                    <button 
                        onClick={() => handleOpenModal()}
                        className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95 shrink-0"
                    >
                        <Plus size={20} />
                        Add New {activeTab === 'departments' ? 'Department' : activeTab === 'designations' ? 'Designation' : 'Salary Component'}
                    </button>
                )}
            </div>

            {/* Tabs & Search */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 w-full lg:w-auto overflow-x-auto scrollbar-none">
                    <button 
                        onClick={() => setActiveTab('departments')}
                        className={`flex items-center gap-1.5 sm:gap-2 flex-1 lg:flex-none py-2.5 px-3 sm:px-6 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'departments' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Building2 size={16} />
                        <span>Departments</span>
                    </button>
                    <button 
                        onClick={() => setActiveTab('designations')}
                        className={`flex items-center gap-1.5 sm:gap-2 flex-1 lg:flex-none py-2.5 px-3 sm:px-6 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'designations' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Briefcase size={16} />
                        <span>Designations</span>
                    </button>
                    <button 
                        onClick={() => setActiveTab('salary-components')}
                        className={`flex items-center gap-1.5 sm:gap-2 flex-1 lg:flex-none py-2.5 px-3 sm:px-6 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'salary-components' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Banknote size={16} />
                        <span>Salary Components</span>
                    </button>
                    {canShifts && (
                        <button 
                            onClick={() => setActiveTab('shifts')}
                            className={`flex items-center gap-1.5 sm:gap-2 flex-1 lg:flex-none py-2.5 px-3 sm:px-6 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'shifts' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <Clock size={16} />
                            <span>Work Shifts</span>
                        </button>
                    )}
                    {canCompany && (
                        <button 
                            onClick={() => setActiveTab('locations')}
                            className={`flex items-center gap-1.5 sm:gap-2 flex-1 lg:flex-none py-2.5 px-3 sm:px-6 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'locations' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <MapPin size={16} />
                            <span>Locations</span>
                        </button>
                    )}
                    {canCompany && (
                        <button 
                            onClick={() => setActiveTab('company')}
                            className={`flex items-center gap-1.5 sm:gap-2 flex-1 lg:flex-none py-2.5 px-3 sm:px-6 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'company' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <Building2 size={16} />
                            <span>Company Branding</span>
                        </button>
                    )}
                    {canTemplates && (
                        <button 
                            onClick={() => setActiveTab('templates')}
                            className={`flex items-center gap-1.5 sm:gap-2 flex-1 lg:flex-none py-2.5 px-3 sm:px-6 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'templates' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <FileText size={16} />
                            <span>Document Templates</span>
                        </button>
                    )}
                </div>

                {activeTab !== 'shifts' && activeTab !== 'locations' && activeTab !== 'company' && activeTab !== 'templates' && (
                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
                        {activeTab === 'salary-components' && (
                            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0 w-full sm:w-auto">
                                <button
                                    type="button"
                                    onClick={() => setComponentTypeFilter('all')}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex-1 sm:flex-none ${componentTypeFilter === 'all' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    All Types
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setComponentTypeFilter('earning')}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 flex-1 sm:flex-none ${componentTypeFilter === 'earning' ? 'bg-emerald-50 text-emerald-700 shadow-sm font-black' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    <TrendingUp size={12} className="text-emerald-600" />
                                    Earnings (+Add)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setComponentTypeFilter('deduction')}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 flex-1 sm:flex-none ${componentTypeFilter === 'deduction' ? 'bg-rose-50 text-rose-700 shadow-sm font-black' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    <TrendingDown size={12} className="text-rose-600" />
                                    Deductions (-Deduct)
                                </button>
                            </div>
                        )}
                        <div className="relative w-full lg:w-72 group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
                            <input 
                                type="text" 
                                placeholder={`Search ${activeTab === 'salary-components' ? 'components' : activeTab}...`}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all shadow-sm"
                            />
                        </div>
                    </div>
                )}
            </div>

            {activeTab === 'shifts' ? (
                <ShiftManagement />
            ) : activeTab === 'locations' ? (
                <LocationManagement />
            ) : activeTab === 'company' ? (
                <CompanyManagement />
            ) : activeTab === 'templates' ? (
                <TemplateManagement />
            ) : (
                <div className="bg-white rounded-3xl overflow-hidden border border-slate-200/60 shadow-xl shadow-slate-100/50">
                    <div className="overflow-x-auto">
                    <table className="w-full text-left">
                    <thead className="bg-slate-50/80 border-b border-slate-100">
                        <tr>
                            <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Name</th>
                            {activeTab === 'salary-components' && (
                                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Type</th>
                            )}
                            <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Description</th>
                            <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Status</th>
                            <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {loading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <tr key={i} className="animate-pulse">
                                    <td className="px-8 py-6"><div className="h-4 bg-slate-100 rounded w-32"></div></td>
                                    {activeTab === 'salary-components' && (
                                        <td className="px-8 py-6"><div className="h-4 bg-slate-100 rounded w-24"></div></td>
                                    )}
                                    <td className="px-8 py-6"><div className="h-4 bg-slate-100 rounded w-48"></div></td>
                                    <td className="px-8 py-6"><div className="h-4 bg-slate-100 rounded w-16"></div></td>
                                    <td className="px-8 py-6 text-right"><div className="h-8 bg-slate-100 rounded w-20 ml-auto"></div></td>
                                </tr>
                            ))
                        ) : filteredItems.length > 0 ? (
                            filteredItems.map((item) => (
                                <tr key={item._id} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="px-8 py-5">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all group-hover:scale-110 ${
                                                activeTab === 'salary-components'
                                                    ? item.type === 'deduction'
                                                        ? 'bg-rose-50 text-rose-600'
                                                        : 'bg-emerald-50 text-emerald-600'
                                                    : activeTab === 'departments'
                                                        ? 'bg-indigo-50 text-indigo-600'
                                                        : 'bg-indigo-50 text-indigo-600'
                                            }`}>
                                                {activeTab === 'departments' ? (
                                                    <Building2 size={16} />
                                                ) : activeTab === 'designations' ? (
                                                    <Briefcase size={16} />
                                                ) : item.type === 'deduction' ? (
                                                    <TrendingDown size={16} />
                                                ) : (
                                                    <TrendingUp size={16} />
                                                )}
                                            </div>
                                            <span className="font-bold text-slate-700">{item.name}</span>
                                        </div>
                                    </td>
                                    {activeTab === 'salary-components' && (
                                        <td className="px-8 py-5">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                                item.type === 'deduction'
                                                    ? 'bg-rose-50 text-rose-600 border border-rose-100'
                                                    : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                            }`}>
                                                {item.type === 'deduction' ? (
                                                    <><TrendingDown size={11} /> Deduction (Deduct)</>
                                                ) : (
                                                    <><TrendingUp size={11} /> Earning (Add)</>
                                                )}
                                            </span>
                                        </td>
                                    )}
                                    <td className="px-8 py-5">
                                        <span className="text-sm text-slate-500">{item.description || '—'}</span>
                                    </td>
                                    <td className="px-8 py-5">
                                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${item.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                            {item.isActive ? (
                                                <><Check size={10} /> Active</>
                                            ) : (
                                                <><X size={10} /> Inactive</>
                                            )}
                                        </span>
                                    </td>
                                    <td className="px-8 py-5 text-right">
                                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button 
                                                onClick={() => handleOpenModal(item)}
                                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                                                title="Edit"
                                            >
                                                <Pencil size={18} />
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(item._id)}
                                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                                                title="Delete"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={activeTab === 'salary-components' ? 5 : 4} className="px-8 py-20 text-center">
                                    <div className="max-w-xs mx-auto space-y-3">
                                        <div className="p-4 bg-slate-50 rounded-full w-16 h-16 flex items-center justify-center mx-auto text-slate-300">
                                            <Info size={32} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-800">No items found</h3>
                                            <p className="text-sm text-slate-500">
                                                Add your first {activeTab === 'departments' ? 'department' : activeTab === 'designations' ? 'designation' : 'salary component'} to get started.
                                            </p>
                                        </div>
                                        <button 
                                            onClick={() => handleOpenModal()}
                                            className="text-indigo-600 font-bold text-sm bg-indigo-50 px-4 py-2 rounded-xl hover:bg-indigo-100 transition-all"
                                        >
                                            Create Now
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            </div>
            )}

            {/* Warning Box */}
            <div className="p-6 bg-amber-50 rounded-3xl border border-amber-100 flex items-start gap-4">
                <div className="p-2 bg-white rounded-xl text-amber-500 shadow-sm border border-amber-50">
                    <AlertCircle size={24} />
                </div>
                <div>
                    <h4 className="font-black text-amber-900 text-sm uppercase tracking-tight">Important Note on Data Integrity</h4>
                    <p className="text-sm text-amber-700 mt-1 leading-relaxed">
                        Updating or deleting a master list item will NOT automatically modify existing historical records or already generated payslips. It will update the selectable options for newly configured profiles and future payroll runs.
                    </p>
                </div>
            </div>

            {/* Create/Edit Modal */}
            {isModalOpen && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-start sm:items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn overflow-y-auto">
                    <div className="bg-white rounded-[32px] shadow-2xl max-w-md w-full my-8 overflow-hidden animate-scaleIn border border-white/20">
                        <div className="p-8">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                                        {editingItem ? 'Edit ' : 'Add New '}
                                        {activeTab === 'departments' ? 'Department' : activeTab === 'designations' ? 'Designation' : 'Salary Component'}
                                    </h2>
                                    <p className="text-sm text-slate-500">Provide the details below to save changes.</p>
                                </div>
                                <button 
                                    onClick={() => setIsModalOpen(false)}
                                    className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-all"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-5">
                                {error && (
                                    <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-600 text-sm font-medium animate-shake">
                                        <AlertCircle size={18} />
                                        {error}
                                    </div>
                                )}

                                {activeTab === 'salary-components' && (
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Component Type</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setFormData(p => ({ ...p, type: 'earning' }))}
                                                className={`py-3 px-4 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 border transition-all ${
                                                    formData.type === 'earning'
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-2 ring-emerald-100 shadow-sm'
                                                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                                }`}
                                            >
                                                <TrendingUp size={15} className="text-emerald-600" />
                                                <span>Earning (+Add)</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setFormData(p => ({ ...p, type: 'deduction' }))}
                                                className={`py-3 px-4 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 border transition-all ${
                                                    formData.type === 'deduction'
                                                        ? 'bg-rose-50 text-rose-700 border-rose-300 ring-2 ring-rose-100 shadow-sm'
                                                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                                }`}
                                            >
                                                <TrendingDown size={15} className="text-rose-600" />
                                                <span>Deduction (-Deduct)</span>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Name</label>
                                    <input 
                                        type="text" 
                                        value={formData.name}
                                        onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white transition-all"
                                        placeholder={
                                            activeTab === 'departments' 
                                                ? 'e.g. Engineering' 
                                                : activeTab === 'designations' 
                                                    ? 'e.g. Software Architect' 
                                                    : formData.type === 'earning' 
                                                        ? 'e.g. Reward, Sales Commission, Bonus' 
                                                        : 'e.g. Loan Recovery, Advance Salary'
                                        }
                                        autoFocus
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Description (Optional)</label>
                                    <textarea 
                                        value={formData.description}
                                        onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
                                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white transition-all min-h-[90px] resize-none"
                                        placeholder="Briefly describe the purpose of this component..."
                                    />
                                </div>

                                <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl">
                                    <div className="flex-1">
                                        <h4 className="text-sm font-bold text-slate-800">Status</h4>
                                        <p className="text-[10px] text-slate-500">Toggle whether this item appears in dropdowns</p>
                                    </div>
                                    <button 
                                        type="button"
                                        onClick={() => setFormData(p => ({ ...p, isActive: !p.isActive }))}
                                        className={`w-12 h-6 rounded-full relative transition-all duration-300 ${formData.isActive ? 'bg-indigo-600' : 'bg-slate-300'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-300 ${formData.isActive ? 'right-1' : 'left-1'}`} />
                                    </button>
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <button 
                                        type="button"
                                        onClick={() => setIsModalOpen(false)}
                                        className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all active:scale-95"
                                    >
                                        Discard
                                    </button>
                                    <button 
                                        type="submit"
                                        disabled={submitting}
                                        className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95 flex items-center justify-center gap-2"
                                    >
                                        {submitting ? (
                                            <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <>Save Changes <ChevronRight size={18} /></>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>,
                document.body
            )}
            {/* Other modals... */}
            <AlertModal 
                isOpen={alertConfig.isOpen}
                onClose={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                onConfirm={alertConfig.onConfirm}
                showCancel={alertConfig.type === 'confirm'}
            />
        </div>
    );
};

export default AdminSettings;
