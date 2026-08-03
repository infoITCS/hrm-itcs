import { useState, useEffect } from 'react';
import api from '../../utils/api';
import { useToast } from '../../contexts/ToastContext';
import { Plus, Edit2, Trash2, XCircle, Package, Monitor, Briefcase, FileText, Wrench, Settings, Eye, EyeOff } from 'lucide-react';

const ICON_OPTIONS = [
    { name: 'Package', component: Package },
    { name: 'Monitor', component: Monitor },
    { name: 'Briefcase', component: Briefcase },
    { name: 'FileText', component: FileText },
    { name: 'Tool', component: Wrench },
    { name: 'Settings', component: Settings }
];

const CategoryConfig = () => {
    const { showToast, showAlert } = useToast();
    const [categories, setCategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    
    // Form state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [icon, setIcon] = useState('Package');
    const [optionsList, setOptionsList] = useState<string[]>([]);
    const [newOption, setNewOption] = useState('');
    const [systemType, setSystemType] = useState('generic');
    const [isDeletable, setIsDeletable] = useState(true);
    const [isActive, setIsActive] = useState(true);
    const [hiddenOptionsList, setHiddenOptionsList] = useState<string[]>([]);

    useEffect(() => {
        fetchCategories();
    }, []);

    const fetchCategories = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.baseURL}/api/request-categories`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setCategories(data);
            }
        } catch (err) {
            console.error('Failed to fetch categories', err);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (cat?: any) => {
        if (cat) {
            setEditingId(cat._id);
            setTitle(cat.title);
            setDescription(cat.description);
            setIcon(cat.icon);
            setOptionsList(cat.options || []);
            setSystemType(cat.systemType || 'generic');
            setIsDeletable(cat.isDeletable !== false);
            setIsActive(cat.isActive !== false);
            setHiddenOptionsList(cat.hiddenOptions || []);
        } else {
            setEditingId(null);
            setTitle('');
            setDescription('');
            setIcon('Package');
            setOptionsList([]);
            setSystemType('generic');
            setIsDeletable(true);
            setIsActive(true);
            setHiddenOptionsList([]);
        }
        setNewOption('');
        setShowModal(true);
    };

    const handleSave = async () => {
        try {
            const token = localStorage.getItem('token');
            const options = optionsList.filter(s => s.trim());
            
            const payload = { title, description, icon, options, systemType, isDeletable, isActive, hiddenOptions: hiddenOptionsList };
            const url = editingId 
                ? `${api.baseURL}/api/request-categories/${editingId}`
                : `${api.baseURL}/api/request-categories`;
            
            const method = editingId ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                setShowModal(false);
                fetchCategories();
                showToast('Category saved successfully', 'success');
            } else {
                showToast('Failed to save category', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Failed to save category', 'error');
        }
    };

    const handleDelete = async (id: string) => {
        showAlert('Delete Category', 'Are you sure you want to delete this category?', 'confirm', async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await fetch(`${api.baseURL}/api/request-categories/${id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    fetchCategories();
                    showToast('Category deleted', 'success');
                } else {
                    showToast('Failed to delete category', 'error');
                }
            } catch (err) {
                console.error(err);
                showToast('Failed to delete category', 'error');
            }
        });
    };

    const handleToggleCategoryActive = async (cat: any) => {
        try {
            const token = localStorage.getItem('token');
            const payload = { ...cat, isActive: cat.isActive === false ? true : false };
            
            const res = await fetch(`${api.baseURL}/api/request-categories/${cat._id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                fetchCategories();
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleToggleOptionDirectly = async (cat: any, opt: string) => {
        try {
            const token = localStorage.getItem('token');
            const hiddenOptionsList = cat.hiddenOptions || [];
            const isHidden = hiddenOptionsList.includes(opt);
            const newHiddenOptions = isHidden 
                ? hiddenOptionsList.filter((o: string) => o !== opt)
                : [...hiddenOptionsList, opt];
                
            const payload = { ...cat, hiddenOptions: newHiddenOptions };
            
            const res = await fetch(`${api.baseURL}/api/request-categories/${cat._id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                fetchCategories();
            }
        } catch (err) {
            console.error(err);
        }
    };

    const toggleOptionVisibility = (opt: string) => {
        if (hiddenOptionsList.includes(opt)) {
            setHiddenOptionsList(hiddenOptionsList.filter(o => o !== opt));
        } else {
            setHiddenOptionsList([...hiddenOptionsList, opt]);
        }
    };

    const renderIcon = (iconName: string) => {
        const found = ICON_OPTIONS.find(i => i.name === iconName);
        const IconComponent = found ? found.component : Package;
        return <IconComponent size={20} />;
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center">
                <p className="text-sm text-gray-500">Create custom request categories to show up on the My Requests page.</p>
                <button 
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium shadow-sm text-sm"
                >
                    <Plus size={16} /> Add Category
                </button>
            </div>

            {loading ? (
                <div className="text-center py-10">Loading...</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {categories.map(cat => (
                        <div key={cat._id} className={`bg-white rounded-xl shadow-sm border border-gray-200 p-5 ${cat.isActive === false ? 'opacity-75 grayscale-[50%]' : ''}`}>
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                                        {renderIcon(cat.icon)}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-bold text-gray-900">{cat.title}</h3>
                                            {cat.isActive === false && <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-bold uppercase rounded-full border border-gray-200">Hidden</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => handleToggleCategoryActive(cat)} className="text-gray-400 hover:text-indigo-600 transition-colors" title={cat.isActive !== false ? "Hide Category" : "Show Category"}>
                                        {cat.isActive !== false ? <Eye size={16} /> : <EyeOff size={16} />}
                                    </button>
                                    <button onClick={() => handleOpenModal(cat)} className="text-gray-400 hover:text-indigo-600 transition-colors" title="Edit Category">
                                        <Edit2 size={16} />
                                    </button>
                                    {cat.isDeletable !== false && (
                                        <button onClick={() => handleDelete(cat._id)} className="text-gray-400 hover:text-rose-600 transition-colors" title="Delete Category">
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <p className="text-sm text-gray-500 mb-4">{cat.description}</p>
                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Dropdown Options</p>
                                <div className="flex flex-wrap gap-2">
                                    {cat.options.map((opt: string, i: number) => {
                                        const isHidden = (cat.hiddenOptions || []).includes(opt);
                                        return (
                                            <button 
                                                key={i} 
                                                onClick={() => handleToggleOptionDirectly(cat, opt)}
                                                className={`px-2 py-1 border text-xs rounded-md shadow-sm flex items-center gap-1 transition-all ${isHidden ? 'bg-gray-100 border-gray-200 text-gray-400 line-through hover:bg-gray-200 hover:text-gray-600' : 'bg-white border-gray-200 text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200'}`}
                                                title={isHidden ? "Click to show on Request Page" : "Click to hide from Request Page"}
                                            >
                                                {opt}
                                                {isHidden ? <EyeOff size={12} className="text-gray-500" /> : <Eye size={12} className="text-gray-400" />}
                                            </button>
                                        );
                                    })}
                                    {cat.options.length === 0 && <span className="text-xs text-gray-400 italic">No options defined</span>}
                                </div>
                            </div>
                        </div>
                    ))}
                    {categories.length === 0 && (
                        <div className="col-span-full py-12 text-center text-gray-500 bg-white rounded-xl border border-dashed border-gray-300">
                            No custom categories configured yet.
                        </div>
                    )}
                </div>
            )}

            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-slide-up">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h3 className="text-lg font-bold text-gray-900">{editingId ? 'Edit Category' : 'New Category'}</h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg transition-colors">
                                <XCircle size={20} />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                                <div>
                                    <p className="text-sm font-bold text-gray-900">Active Status</p>
                                    <p className="text-xs text-gray-500 mt-0.5">If disabled, this entire card will be hidden from employees.</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" className="sr-only peer" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                                </label>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Card Title</label>
                                <input 
                                    type="text" 
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="e.g. IT Equipment"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                <input 
                                    type="text" 
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Short description for the card"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Icon</label>
                                <select 
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                                    value={icon}
                                    onChange={(e) => setIcon(e.target.value)}
                                >
                                    {ICON_OPTIONS.map(opt => (
                                        <option key={opt.name} value={opt.name}>{opt.name}</option>
                                    ))}
                                </select>
                            </div>
                            {systemType === 'loan' ? (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Dropdown Options</label>
                                    <p className="text-sm text-gray-500 italic bg-gray-50 p-3 rounded-lg border border-gray-200">
                                        Loan requests do not use dropdown options. They use dedicated Number Input fields for Loan Amount and Monthly Deduction.
                                    </p>
                                </div>
                            ) : systemType === 'document' ? (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Dropdown Options</label>
                                    <p className="text-sm text-amber-600 italic bg-amber-50 p-3 rounded-lg border border-amber-200 mb-3">
                                        Warning: Options for Documents cannot be deleted because the backend relies on these names. However, you can use the Eye icon to hide specific options from employees.
                                    </p>
                                    <div className="flex flex-wrap gap-2 min-h-[40px] p-3 bg-gray-50 border border-gray-200 rounded-lg">
                                        {optionsList.map((opt, i) => {
                                            const isHidden = hiddenOptionsList.includes(opt);
                                            return (
                                                <div key={i} className={`flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 border rounded-full shadow-sm text-sm font-medium transition-all ${isHidden ? 'bg-gray-100 border-gray-200 text-gray-400 line-through' : 'bg-white border-gray-300 text-gray-700'}`}>
                                                    <span>{opt}</span>
                                                    <button 
                                                        onClick={() => toggleOptionVisibility(opt)}
                                                        className={`p-1 rounded-full transition-colors ${isHidden ? 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50' : 'text-indigo-600 hover:bg-indigo-50'}`}
                                                        title={isHidden ? "Show option" : "Hide option"}
                                                    >
                                                        {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Dropdown Options</label>
                                    <div className="flex gap-2 mb-3">
                                        <input 
                                            type="text"
                                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                                            placeholder="Add an option (e.g. Laptop)"
                                            value={newOption}
                                            onChange={(e) => setNewOption(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    if (newOption.trim() && !optionsList.includes(newOption.trim())) {
                                                        setOptionsList([...optionsList, newOption.trim()]);
                                                        setNewOption('');
                                                    }
                                                }
                                            }}
                                        />
                                        <button 
                                            type="button"
                                            onClick={() => {
                                                if (newOption.trim() && !optionsList.includes(newOption.trim())) {
                                                    setOptionsList([...optionsList, newOption.trim()]);
                                                    setNewOption('');
                                                }
                                            }}
                                            className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors font-medium text-sm border border-indigo-100"
                                        >
                                            Add
                                        </button>
                                    </div>
                                    
                                    <div className="flex flex-wrap gap-2 min-h-[40px] p-3 bg-gray-50 border border-gray-200 rounded-lg">
                                        {optionsList.map((opt, i) => {
                                            const isHidden = hiddenOptionsList.includes(opt);
                                            return (
                                                <div key={i} className={`flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 border rounded-full shadow-sm text-sm font-medium transition-all ${isHidden ? 'bg-gray-100 border-gray-200 text-gray-400 line-through' : 'bg-white border-gray-300 text-gray-700'}`}>
                                                    <span>{opt}</span>
                                                    <button 
                                                        onClick={() => toggleOptionVisibility(opt)}
                                                        className={`p-1 rounded-full transition-colors ${isHidden ? 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50' : 'text-indigo-600 hover:bg-indigo-50'}`}
                                                        title={isHidden ? "Show option" : "Hide option"}
                                                    >
                                                        {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                                                    </button>
                                                    <button 
                                                        onClick={() => setOptionsList(optionsList.filter((_, idx) => idx !== i))}
                                                        className="text-gray-400 hover:text-rose-500 hover:bg-rose-50 p-0.5 rounded-full transition-colors"
                                                        title="Delete option permanently"
                                                    >
                                                        <XCircle size={14} />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                        {optionsList.length === 0 && (
                                            <span className="text-sm text-gray-400 italic flex items-center">No options added yet.</span>
                                        )}
                                    </div>
                                </div>
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
                                onClick={handleSave}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-medium text-sm shadow-sm"
                            >
                                Save Category
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CategoryConfig;
