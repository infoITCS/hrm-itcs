import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { Plus, Edit2, Trash2, Calendar, MapPin, Check, AlertCircle } from 'lucide-react';

interface Holiday {
    _id: string;
    name: string;
    startDate: string;
    endDate: string;
    location?: string;
    isRecurring: boolean;
}

const ManageHolidays = () => {
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        startDate: '',
        endDate: '',
        locationOption: '', // '', 'ISB-Office', 'Karachi Office', 'Lahore Office', 'CUSTOM'
        customLocation: '',
        isRecurring: false
    });

    const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const token = localStorage.getItem('token');

    const loadHolidays = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${api.baseURL}/api/holidays`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const result = await res.json();
                setHolidays(result.data || []);
            }
        } catch (err) {
            console.error('Failed to load holidays:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadHolidays();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatusMsg(null);

        const location = formData.locationOption === 'CUSTOM' 
            ? formData.customLocation 
            : formData.locationOption;

        const payload = {
            name: formData.name,
            startDate: formData.startDate,
            endDate: formData.endDate || formData.startDate,
            location: location || null,
            isRecurring: formData.isRecurring
        };

        if (payload.endDate < payload.startDate) {
            setStatusMsg({ text: 'To Date (End) cannot be before From Date (Start)', type: 'error' });
            return;
        }

        try {
            const url = editingHoliday 
                ? `${api.baseURL}/api/holidays/${editingHoliday._id}`
                : `${api.baseURL}/api/holidays`;
            const method = editingHoliday ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                setStatusMsg({ 
                    text: `Holiday ${editingHoliday ? 'updated' : 'created'} successfully`, 
                    type: 'success' 
                });
                setShowForm(false);
                setEditingHoliday(null);
                setFormData({ name: '', startDate: '', endDate: '', locationOption: '', customLocation: '', isRecurring: false });
                loadHolidays();
                setTimeout(() => setStatusMsg(null), 3000);
            } else {
                const errData = await res.json();
                throw new Error(errData.message || 'Failed to save holiday');
            }
        } catch (err: any) {
            setStatusMsg({ text: err.message, type: 'error' });
        }
    };

    const handleEditClick = (h: Holiday) => {
        setEditingHoliday(h);
        
        const standardOptions = ['', 'ISB-Office', 'Karachi Office', 'Lahore Office'];
        const isStandard = standardOptions.includes(h.location || '');
        
        setFormData({
            name: h.name,
            startDate: h.startDate,
            endDate: h.endDate,
            locationOption: h.location ? (isStandard ? h.location : 'CUSTOM') : '',
            customLocation: h.location && !isStandard ? h.location : '',
            isRecurring: h.isRecurring
        });
        setShowForm(true);
    };

    const handleDeleteClick = async (id: string) => {
        if (!window.confirm('Are you sure you want to delete this holiday? This action cannot be undone.')) {
            return;
        }

        setStatusMsg(null);
        try {
            const res = await fetch(`${api.baseURL}/api/holidays/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.ok) {
                setStatusMsg({ text: 'Holiday deleted successfully', type: 'success' });
                loadHolidays();
                setTimeout(() => setStatusMsg(null), 3000);
            } else {
                const errData = await res.json();
                throw new Error(errData.message || 'Failed to delete holiday');
            }
        } catch (err: any) {
            setStatusMsg({ text: err.message, type: 'error' });
        }
    };

    return (
        <div className="space-y-6 mt-6">
            {/* Status Messages */}
            {statusMsg && (
                <div className={`p-4 rounded-xl flex items-center gap-2 border ${
                    statusMsg.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'
                } animate-in fade-in`}>
                    {statusMsg.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
                    <span className="text-xs font-bold">{statusMsg.text}</span>
                </div>
            )}

            {/* Title and Setup Header */}
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-6">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                            <Calendar size={18} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">Holiday Settings</h2>
                            <p className="text-xs text-slate-400">Configure and schedule company holidays</p>
                        </div>
                    </div>

                    <button
                        onClick={() => {
                            setEditingHoliday(null);
                            setFormData({ name: '', startDate: '', endDate: '', locationOption: '', customLocation: '', isRecurring: false });
                            setShowForm(!showForm);
                        }}
                        className="flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm"
                    >
                        <Plus size={14} /> Add Holiday
                    </button>
                </div>

                {showForm && (
                    <form onSubmit={handleSubmit} className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-4 max-w-xl animate-in fade-in duration-200">
                        <h3 className="text-xs font-black uppercase text-indigo-700 tracking-wider">
                            {editingHoliday ? 'Edit Custom Holiday' : 'Create Custom Holiday'}
                        </h3>
                        
                        <div className="grid grid-cols-1 gap-4">
                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Holiday Name</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Eid Holiday"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none text-slate-700 font-bold"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">From Date (Start)</label>
                                <input
                                    type="date"
                                    required
                                    value={formData.startDate}
                                    onChange={e => {
                                        const newStart = e.target.value;
                                        setFormData(prev => ({
                                            ...prev,
                                            startDate: newStart,
                                            endDate: prev.endDate ? prev.endDate : newStart
                                        }));
                                    }}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none text-slate-700 font-bold"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">To Date (End)</label>
                                <input
                                    type="date"
                                    required
                                    value={formData.endDate}
                                    onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none text-slate-700 font-bold"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Office Location</label>
                                <select
                                    value={formData.locationOption}
                                    onChange={e => setFormData({ ...formData, locationOption: e.target.value })}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none text-slate-700 font-bold cursor-pointer"
                                >
                                    <option value="">All Offices</option>
                                    <option value="ISB-Office">Islamabad Office (ISB-Office)</option>
                                    <option value="Karachi Office">Karachi Office</option>
                                    <option value="Lahore Office">Lahore Office</option>
                                    <option value="CUSTOM">-- Custom Location --</option>
                                </select>
                            </div>

                            {formData.locationOption === 'CUSTOM' && (
                                <div className="space-y-1 animate-in slide-in-from-left-2 duration-250">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Custom Office Name</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="e.g. Multan Branch"
                                        value={formData.customLocation}
                                        onChange={e => setFormData({ ...formData, customLocation: e.target.value })}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none text-slate-700 font-bold"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-4 pt-1">
                            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-600">
                                <input
                                    type="checkbox"
                                    checked={formData.isRecurring}
                                    onChange={e => setFormData({ ...formData, isRecurring: e.target.checked })}
                                    className="rounded text-indigo-600 focus:ring-indigo-500"
                                />
                                Recurring Yearly Holiday
                            </label>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setShowForm(false)}
                                className="px-3.5 py-1.5 text-slate-500 hover:text-slate-700 font-bold text-xs bg-white border border-slate-200 rounded-xl"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-4.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm"
                            >
                                {editingHoliday ? 'Save Changes' : 'Create Holiday'}
                            </button>
                        </div>
                    </form>
                )}

                {/* Holidays History Table */}
                {loading ? (
                    <div className="text-center py-8 text-xs text-slate-400 font-bold">Loading holidays list...</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="bg-slate-50/50">
                                    <th className="py-2.5 px-4 font-bold text-slate-500 uppercase tracking-wider">Name</th>
                                    <th className="py-2.5 px-4 font-bold text-slate-500 uppercase tracking-wider">Date / Duration</th>
                                    <th className="py-2.5 px-4 font-bold text-slate-500 uppercase tracking-wider text-center">Applicable Office</th>
                                    <th className="py-2.5 px-4 font-bold text-slate-500 uppercase tracking-wider text-center">Type</th>
                                    <th className="py-2.5 px-4 font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {holidays.map(h => {
                                    return (
                                        <tr key={h._id} className="hover:bg-slate-50/20 transition-colors">
                                            <td className="py-3 px-4 font-bold text-slate-700 capitalize">{h.name}</td>
                                            <td className="py-3 px-4 font-medium text-slate-600">
                                                {h.startDate === h.endDate ? (
                                                    new Date(h.startDate).toLocaleDateString(undefined, { 
                                                        weekday: 'short', 
                                                        year: 'numeric', 
                                                        month: 'short', 
                                                        day: 'numeric' 
                                                    })
                                                ) : (
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-slate-700">
                                                            {new Date(h.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - {new Date(h.endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                                        </span>
                                                        <span className="text-[10px] text-slate-400 font-bold">
                                                            {Math.ceil((new Date(h.endDate).getTime() - new Date(h.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1} Days
                                                        </span>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-center text-slate-500 font-bold">
                                                <span className="inline-flex items-center gap-1">
                                                    <MapPin size={12} className="text-slate-450 shrink-0" />
                                                    {h.location || 'All Offices'}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                    h.isRecurring 
                                                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                                                        : 'bg-indigo-50 text-indigo-600 border border-indigo-100'
                                                }`}>
                                                    {h.isRecurring ? 'Yearly' : 'One-Off'}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-right space-x-1.5">
                                                <button
                                                    onClick={() => handleEditClick(h)}
                                                    className="p-1 hover:bg-slate-100 text-slate-400 hover:text-indigo-600 rounded transition-colors"
                                                    title="Edit"
                                                >
                                                    <Edit2 size={13} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteClick(h._id)}
                                                    className="p-1 hover:bg-slate-100 text-slate-400 hover:text-rose-600 rounded transition-colors"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}

                                {holidays.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="py-8 text-center text-slate-400 font-bold">
                                            No holidays configured. Click "Add Holiday" above to define one.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ManageHolidays;
