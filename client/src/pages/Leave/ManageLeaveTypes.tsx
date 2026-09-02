import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { Plus, Edit2, FileText, Check, AlertCircle, Sparkles } from 'lucide-react';

interface LeaveType {
    _id: string;
    name: string;
    code: string;
    defaultDays: number;
    isPaid: boolean;
    isActive: boolean;
    sandwichRuleEnabled: boolean;
}

const ManageLeaveTypes = () => {
    const [types, setTypes] = useState<LeaveType[]>([]);
    const [loadingTypes, setLoadingTypes] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingType, setEditingType] = useState<LeaveType | null>(null);
    const [formData, setFormData] = useState({ name: '', defaultDays: 10, isPaid: true, isActive: true, sandwichRuleEnabled: true });
    
    // Status notifications
    const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    const token = localStorage.getItem('token');

    // Fetch leave types
    const loadData = async () => {
        setLoadingTypes(true);
        try {
            const typesRes = await fetch(`${api.baseURL}/api/leaves/types`, { headers: { Authorization: `Bearer ${token}` } });
            if (typesRes.ok) {
                const typesData = await typesRes.json();
                setTypes(typesData.data || []);
            }
        } catch (err) {
            console.error('Failed to load leave configuration data:', err);
        } finally {
            setLoadingTypes(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    // Create/Edit Leave Category
    const handleSubmitCategory = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatusMsg(null);
        try {
            const url = editingType 
                ? `${api.baseURL}/api/leaves/types/${editingType._id}`
                : `${api.baseURL}/api/leaves/types`;
            const method = editingType ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                setStatusMsg({ text: `Category ${editingType ? 'updated' : 'created'} successfully`, type: 'success' });
                setShowForm(false);
                setEditingType(null);
                setFormData({ name: '', defaultDays: 10, isPaid: true, isActive: true, sandwichRuleEnabled: true });
                loadData();
                setTimeout(() => setStatusMsg(null), 3000);
            } else {
                const errData = await res.json();
                throw new Error(errData.message || 'Failed to update category');
            }
        } catch (err: any) {
            setStatusMsg({ text: err.message, type: 'error' });
        }
    };

    const handleEditClick = (t: LeaveType) => {
        setEditingType(t);
        setFormData({
            name: t.name,
            defaultDays: t.defaultDays,
            isPaid: t.isPaid,
            isActive: t.isActive,
            sandwichRuleEnabled: t.sandwichRuleEnabled !== false
        });
        setShowForm(true);
    };

    const handleToggleActive = async (t: LeaveType) => {
        try {
            const res = await fetch(`${api.baseURL}/api/leaves/types/${t._id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ isActive: !t.isActive })
            });

            if (res.ok) {
                loadData();
            }
        } catch (err) {
            console.error('Failed to toggle active state:', err);
        }
    };

    return (
        <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-6">
            {/* Status Notifications */}
            {statusMsg && (
                <div className={`p-4 rounded-2xl flex items-center gap-2 border ${
                    statusMsg.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'
                } animate-in fade-in`}>
                    {statusMsg.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
                    <span className="text-xs font-bold">{statusMsg.text}</span>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                        <FileText size={18} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            Leave Categories & Company Policy
                        </h2>
                        <p className="text-xs text-slate-400">Add or configure system-wide leave types, default day quotas, and sandwich rules</p>
                    </div>
                </div>

                <button
                    onClick={() => {
                        setEditingType(null);
                        setFormData({ name: '', defaultDays: 10, isPaid: true, isActive: true, sandwichRuleEnabled: true });
                        setShowForm(!showForm);
                    }}
                    className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm shrink-0"
                >
                    <Plus size={14} /> Add New Category
                </button>
            </div>

            {/* Form */}
            {showForm && (
                <form onSubmit={handleSubmitCategory} className="bg-slate-50/80 p-5 rounded-2xl space-y-4 border border-slate-150 animate-in fade-in duration-150">
                    <div className="flex items-center gap-2 text-indigo-700 text-xs font-bold mb-1">
                        <Sparkles size={14} />
                        <span>{editingType ? 'Edit Leave Category' : 'Create New Leave Category'}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Category Name</label>
                            <input 
                                type="text"
                                required
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                placeholder="e.g. Annual Leave, Sick Leave"
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Default Days (Quota)</label>
                            <input 
                                type="number"
                                required
                                min={0}
                                value={formData.defaultDays}
                                onChange={e => setFormData({ ...formData, defaultDays: Number(e.target.value) })}
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-6 pt-2">
                        <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                            <input 
                                type="checkbox"
                                checked={formData.isPaid}
                                onChange={e => setFormData({ ...formData, isPaid: e.target.checked })}
                                className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                            Paid Leave
                        </label>
                        <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                            <input 
                                type="checkbox"
                                checked={formData.isActive}
                                onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                                className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                            Active (Visible to Employees)
                        </label>
                        <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                            <input 
                                type="checkbox"
                                checked={formData.sandwichRuleEnabled}
                                onChange={e => setFormData({ ...formData, sandwichRuleEnabled: e.target.checked })}
                                className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                            Sandwich Rule Enabled
                        </label>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200/60">
                        <button
                            type="button"
                            onClick={() => setShowForm(false)}
                            className="px-4 py-2 text-slate-500 hover:text-slate-700 font-bold text-xs bg-white border border-slate-200 rounded-xl transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all"
                        >
                            {editingType ? 'Save Changes' : 'Create Category'}
                        </button>
                    </div>
                </form>
            )}

            {/* Categories Table */}
            {loadingTypes ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-2">
                    <div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                    <p className="text-xs text-slate-400 font-bold">Loading leave categories...</p>
                </div>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-100">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="bg-slate-50/70">
                                <th className="py-3 px-5 font-bold text-slate-500 uppercase tracking-wider">Leave Category</th>
                                <th className="py-3 px-5 font-bold text-slate-500 uppercase tracking-wider text-center">Default Quota</th>
                                <th className="py-3 px-5 font-bold text-slate-500 uppercase tracking-wider text-center">Type</th>
                                <th className="py-3 px-5 font-bold text-slate-500 uppercase tracking-wider text-center">Active Status</th>
                                <th className="py-3 px-5 font-bold text-slate-500 uppercase tracking-wider text-center">Sandwich Rule</th>
                                <th className="py-3 px-5 font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {types.map(t => (
                                <tr key={t._id} className="hover:bg-slate-50/40 transition-colors">
                                    <td className="py-4 px-5">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-slate-800 text-sm">{t.name}</span>
                                            <span className="text-[10px] text-slate-400 font-mono">code: {t.code}</span>
                                        </div>
                                    </td>
                                    <td className="py-4 px-5 text-center font-bold text-slate-700">{t.defaultDays} Days</td>
                                    <td className="py-4 px-5 text-center">
                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border tracking-wide ${
                                            t.isPaid 
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-150' 
                                                : 'bg-rose-50 text-rose-700 border-rose-150'
                                        }`}>
                                            {t.isPaid ? 'PAID' : 'UNPAID'}
                                        </span>
                                    </td>
                                    <td className="py-4 px-5 text-center">
                                        <button 
                                            onClick={() => handleToggleActive(t)}
                                            className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all inline-flex items-center justify-center gap-1.5 shadow-xs ${
                                                t.isActive 
                                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' 
                                                    : 'bg-slate-100 border-slate-200 text-slate-400 hover:bg-slate-200'
                                            }`}
                                        >
                                            <span className={`w-1.5 h-1.5 rounded-full ${t.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                                            {t.isActive ? 'ON' : 'OFF'}
                                        </button>
                                    </td>
                                    <td className="py-4 px-5 text-center">
                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                                            t.sandwichRuleEnabled !== false 
                                                ? 'bg-amber-50 text-amber-700 border-amber-100' 
                                                : 'bg-slate-50 text-slate-400 border-slate-100'
                                        }`}>
                                            {t.sandwichRuleEnabled !== false ? 'ON' : 'OFF'}
                                        </span>
                                    </td>
                                    <td className="py-4 px-5 text-right">
                                        <button
                                            onClick={() => handleEditClick(t)}
                                            className="p-2 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-xl transition-colors inline-flex items-center justify-center"
                                            title="Edit Category Details"
                                        >
                                            <Edit2 size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}

                            {types.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="py-12 text-center text-slate-400 font-bold">
                                        No leave categories found. Click "Add New Category" to create one.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default ManageLeaveTypes;
