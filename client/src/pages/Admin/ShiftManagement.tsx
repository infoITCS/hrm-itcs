import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Clock, Plus, Trash2, Edit2, ShieldAlert, X } from 'lucide-react';
import api from '../../utils/api';
import AlertModal from '../../components/UI/AlertModal';

interface WorkShift {
    _id: string;
    name: string;
    startTime: string;
    endTime: string;
    graceMinutes: number;
    halfDayThreshold: number;
    isDefault: boolean;
    isActive: boolean;
    description?: string;
}

const ShiftManagement = () => {
    const [shifts, setShifts] = useState<WorkShift[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // Modal State
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [currentShiftId, setCurrentShiftId] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        startTime: '09:00',
        endTime: '18:00',
        graceMinutes: 30,
        halfDayThreshold: 4,
        isDefault: false,
        isActive: true,
        description: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

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

    useEffect(() => {
        fetchShifts();
    }, []);

    const fetchShifts = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(api.workShifts, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to fetch shifts');
            const data = await res.json();
            setShifts(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (shift?: WorkShift) => {
        if (shift) {
            setIsEditing(true);
            setCurrentShiftId(shift._id);
            setFormData({
                name: shift.name,
                startTime: shift.startTime,
                endTime: shift.endTime,
                graceMinutes: shift.graceMinutes,
                halfDayThreshold: shift.halfDayThreshold,
                isDefault: shift.isDefault,
                isActive: shift.isActive,
                description: shift.description || ''
            });
        } else {
            setIsEditing(false);
            setCurrentShiftId(null);
            setFormData({
                name: '',
                startTime: '09:00',
                endTime: '18:00',
                graceMinutes: 30,
                halfDayThreshold: 4,
                isDefault: false,
                isActive: true,
                description: ''
            });
        }
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const token = localStorage.getItem('token');
            const url = isEditing ? `${api.workShifts}/${currentShiftId}` : api.workShifts;
            const method = isEditing ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message || 'Failed to save shift');
            }

            await fetchShifts();
            setShowModal(false);
            setAlertConfig({
                isOpen: true,
                title: 'Success',
                message: `Shift ${isEditing ? 'updated' : 'created'} successfully.`,
                type: 'success'
            });
        } catch (err: any) {
            setAlertConfig({
                isOpen: true,
                title: 'Error',
                message: err.message,
                type: 'error'
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        setAlertConfig({
            isOpen: true,
            title: 'Delete Shift',
            message: 'Are you sure you want to delete this shift? Employees assigned to this shift will revert to default office timings.',
            type: 'confirm',
            onConfirm: async () => {
                try {
                    const token = localStorage.getItem('token');
                    const res = await fetch(`${api.workShifts}/${id}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (!res.ok) {
                        const data = await res.json();
                        throw new Error(data.message || 'Failed to delete shift');
                    }
                    await fetchShifts();
                    setAlertConfig({
                        isOpen: true,
                        title: 'Success',
                        message: 'Shift deleted successfully.',
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

    return (
        <div className="space-y-6 animate-slide-up">
            <div className="flex justify-end">
                <button 
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all font-bold shadow-sm hover:shadow-indigo-200 hover:shadow-lg active:scale-95"
                >
                    <Plus size={18} /> Define New Shift
                </button>
            </div>

            {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 flex items-center gap-3">
                    <ShieldAlert size={20} />
                    <span className="font-medium">{error}</span>
                </div>
            )}

            <div className="bg-white rounded-3xl shadow-xl shadow-indigo-100/20 border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/80">
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Shift Name</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Timings</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Grace Period</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-center">Status</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                Array(3).fill(0).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan={5} className="px-6 py-8"><div className="h-4 bg-slate-100 rounded w-full"></div></td>
                                    </tr>
                                ))
                            ) : shifts.length > 0 ? (
                                shifts.map((shift) => (
                                    <tr key={shift._id} className="hover:bg-indigo-50/20 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-bold text-slate-800">{shift.name}</span>
                                                    {shift.isDefault && (
                                                        <span className="text-[9px] font-black uppercase bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200">Default</span>
                                                    )}
                                                </div>
                                                <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{shift.description || 'No description'}</p>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold text-slate-700">{shift.startTime} — {shift.endTime}</span>
                                                <span className="text-[10px] text-slate-400 font-medium italic">
                                                    {parseInt(shift.endTime.split(':')[0]) < parseInt(shift.startTime.split(':')[0]) ? 'Cross-date (Night Shift)' : 'Same day'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded-lg">
                                                {shift.graceMinutes} mins
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${shift.isActive ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>
                                                {shift.isActive ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <button 
                                                    onClick={() => handleOpenModal(shift)}
                                                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                                    title="Edit Shift"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button 
                                                    onClick={() => handleDelete(shift._id)}
                                                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                    title="Delete Shift"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="p-4 bg-slate-50 rounded-full">
                                                <Clock size={32} className="text-slate-300" />
                                            </div>
                                            <p className="font-medium">No shifts defined yet. Click "Define New Shift" to start.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Shift Modal */}
            {showModal && createPortal(
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-start justify-center p-4 pt-8 sm:pt-12 animate-in fade-in">
                    <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[calc(100vh-6rem)] sm:max-h-[calc(100vh-8rem)]">
                        <div className="p-6 border-b border-slate-100 bg-slate-50 relative shrink-0">
                            <h3 className="text-xl font-bold text-slate-800">{isEditing ? 'Edit Work Shift' : 'Create New Work Shift'}</h3>
                            <p className="text-sm text-slate-500 mt-1">Define the timing parameters for this work schedule.</p>
                            <button 
                                onClick={() => setShowModal(false)}
                                className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-full transition-all"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        
                        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1 md:col-span-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Shift Name</label>
                                    <input 
                                        type="text" 
                                        required
                                        placeholder="e.g. Standard Morning, Night Shift"
                                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all"
                                        value={formData.name}
                                        onChange={e => setFormData({...formData, name: e.target.value})}
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Start Time</label>
                                    <input 
                                        type="time" 
                                        required
                                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all"
                                        value={formData.startTime}
                                        onChange={e => setFormData({...formData, startTime: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">End Time</label>
                                    <input 
                                        type="time" 
                                        required
                                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all"
                                        value={formData.endTime}
                                        onChange={e => setFormData({...formData, endTime: e.target.value})}
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Grace Minutes</label>
                                    <input 
                                        type="number" 
                                        required
                                        min="0"
                                        max="120"
                                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all"
                                        value={formData.graceMinutes}
                                        onChange={e => setFormData({...formData, graceMinutes: parseInt(e.target.value) || 0})}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Half-Day Threshold (Hrs)</label>
                                    <input 
                                        type="number" 
                                        required
                                        min="1"
                                        max="12"
                                        step="0.5"
                                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all"
                                        value={formData.halfDayThreshold}
                                        onChange={e => setFormData({...formData, halfDayThreshold: parseFloat(e.target.value) || 0})}
                                    />
                                </div>

                                <div className="md:col-span-2 p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 flex items-start gap-3">
                                    <div className="mt-1">
                                        <input 
                                            type="checkbox" 
                                            id="isDefault"
                                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                            checked={formData.isDefault}
                                            onChange={e => setFormData({...formData, isDefault: e.target.checked})}
                                        />
                                    </div>
                                    <label htmlFor="isDefault" className="cursor-pointer">
                                        <span className="text-sm font-bold text-indigo-900 block">Set as Default Shift</span>
                                        <span className="text-xs text-indigo-600 leading-relaxed">
                                            If enabled, this shift will be applied to all employees who do not have a specifically assigned shift.
                                        </span>
                                    </label>
                                </div>
                            </div>

                            <div className="pt-4 flex items-center justify-end gap-3">
                                <button 
                                    type="button" 
                                    onClick={() => setShowModal(false)}
                                    className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    disabled={isSubmitting}
                                    className="px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-sm transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Saving...
                                        </>
                                    ) : 'Save Work Shift'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

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

export default ShiftManagement;
