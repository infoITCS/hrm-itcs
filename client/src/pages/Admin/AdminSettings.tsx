import React, { useState, useEffect } from 'react';
import { 
    Building2, Briefcase, Plus, Pencil, Trash2, Check, X, 
    AlertCircle, Search, ChevronRight, Settings2, ShieldCheck,
    Info
} from 'lucide-react';
import { api } from '../../utils/api';
import { usePermissions } from '../../hooks/usePermissions';
import AlertModal from '../../components/UI/AlertModal';

type ConfigItem = {
    _id: string;
    name: string;
    description?: string;
    isActive: boolean;
};

const AdminSettings = () => {
    const { role } = usePermissions();
    const isAdmin = role === 'super-admin' || role === 'admin';
    
    const [activeTab, setActiveTab] = useState<'departments' | 'designations'>('departments');
    const [items, setItems] = useState<ConfigItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Modal/Form state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<ConfigItem | null>(null);
    const [formData, setFormData] = useState({ name: '', description: '', isActive: true });
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

    const fetchData = React.useCallback(async () => {
        setLoading(true);
        const token = localStorage.getItem('token');
        try {
            const endpoint = activeTab === 'departments' ? '/departments' : '/designations';
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
    }, [activeTab]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleOpenModal = (item?: ConfigItem) => {
        if (item) {
            setEditingItem(item);
            setFormData({ name: item.name, description: item.description || '', isActive: item.isActive });
        } else {
            setEditingItem(null);
            setFormData({ name: '', description: '', isActive: true });
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
        const endpoint = activeTab === 'departments' ? '/departments' : '/designations';
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
            message: 'Are you sure you want to delete this item? This may affect existing employees.',
            type: 'confirm',
            onConfirm: async () => {
                const token = localStorage.getItem('token');
                const endpoint = activeTab === 'departments' ? '/departments' : '/designations';
                
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

    const filteredItems = items.filter(item => 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );

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
                    <p className="text-slate-500 mt-1">Manage departments and designations to maintain system-wide data consistency.</p>
                </div>
                <button 
                    onClick={() => handleOpenModal()}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95"
                >
                    <Plus size={20} />
                    Add New {activeTab === 'departments' ? 'Department' : 'Designation'}
                </button>
            </div>

            {/* Tabs & Search */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 w-full lg:w-auto">
                    <button 
                        onClick={() => setActiveTab('departments')}
                        className={`flex items-center gap-2 flex-1 lg:flex-none py-2.5 px-6 rounded-xl text-sm font-bold transition-all ${activeTab === 'departments' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Building2 size={18} />
                        Departments
                    </button>
                    <button 
                        onClick={() => setActiveTab('designations')}
                        className={`flex items-center gap-2 flex-1 lg:flex-none py-2.5 px-6 rounded-xl text-sm font-bold transition-all ${activeTab === 'designations' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Briefcase size={18} />
                        Designations
                    </button>
                </div>

                <div className="relative w-full lg:w-96 group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={20} />
                    <input 
                        type="text" 
                        placeholder={`Search ${activeTab}...`}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all shadow-sm"
                    />
                </div>
            </div>

            {/* Data Table */}
            <div className="bg-white rounded-3xl overflow-hidden border border-slate-200/60 shadow-xl shadow-slate-100/50">
                <table className="w-full text-left">
                    <thead className="bg-slate-50/80 border-b border-slate-100">
                        <tr>
                            <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Name</th>
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
                                            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 transition-all group-hover:scale-110">
                                                {activeTab === 'departments' ? <Building2 size={16} /> : <Briefcase size={16} />}
                                            </div>
                                            <span className="font-bold text-slate-700">{item.name}</span>
                                        </div>
                                    </td>
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
                                <td colSpan={4} className="px-8 py-20 text-center">
                                    <div className="max-w-xs mx-auto space-y-3">
                                        <div className="p-4 bg-slate-50 rounded-full w-16 h-16 flex items-center justify-center mx-auto text-slate-300">
                                            <Info size={32} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-800">No items found</h3>
                                            <p className="text-sm text-slate-500">Add your first {activeTab === 'departments' ? 'department' : 'designation'} to get started.</p>
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

            {/* Warning Box */}
            <div className="p-6 bg-amber-50 rounded-3xl border border-amber-100 flex items-start gap-4">
                <div className="p-2 bg-white rounded-xl text-amber-500 shadow-sm border border-amber-50">
                    <AlertCircle size={24} />
                </div>
                <div>
                    <h4 className="font-black text-amber-900 text-sm uppercase tracking-tight">Important Note on Data Integrity</h4>
                    <p className="text-sm text-amber-700 mt-1 leading-relaxed">
                        Updating or deleting a master list item will NOT automatically update existing employee records. Employees already assigned to a modified item will retain their original text designations until manually updated in their profiles.
                    </p>
                </div>
            </div>

            {/* Create/Edit Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[9999] flex items-start sm:items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn overflow-y-auto">
                    <div className="bg-white rounded-[32px] shadow-2xl max-w-md w-full my-8 overflow-hidden animate-scaleIn border border-white/20">
                        <div className="p-8">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                                        {editingItem ? 'Edit ' : 'Add New '}
                                        {activeTab === 'departments' ? 'Department' : 'Designation'}
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

                            <form onSubmit={handleSubmit} className="space-y-6">
                                {error && (
                                    <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-600 text-sm font-medium animate-shake">
                                        <AlertCircle size={18} />
                                        {error}
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Name</label>
                                    <input 
                                        type="text" 
                                        value={formData.name}
                                        onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white transition-all"
                                        placeholder={`e.g. ${activeTab === 'departments' ? 'Engineering' : 'Software Architect'}`}
                                        autoFocus
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Description (Optional)</label>
                                    <textarea 
                                        value={formData.description}
                                        onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
                                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 focus:bg-white transition-all min-h-[100px] resize-none"
                                        placeholder="Briefly describe the purpose of this item..."
                                    />
                                </div>

                                <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl">
                                    <div className="flex-1">
                                        <h4 className="text-sm font-bold text-slate-800">Status</h4>
                                        <p className="text-[10px] text-slate-500">Toggle whether this item is selectable in forms</p>
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
                </div>
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
