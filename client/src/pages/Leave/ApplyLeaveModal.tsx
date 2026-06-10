import { useState, useEffect } from 'react';
import { X, AlertCircle, Calendar, Send } from 'lucide-react';
import { api } from '../../utils/api';

interface ApplyLeaveModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    balance: any;
}

const ApplyLeaveModal = ({ isOpen, onClose, onSuccess, balance }: ApplyLeaveModalProps) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        startDate: '',
        endDate: '',
        type: 'Annual',
        reason: ''
    });
    const [types, setTypes] = useState<any[]>([]);

    const selectedLeaveType = types.find(t => t.name === formData.type);
    const selectedTypeCode = selectedLeaveType ? selectedLeaveType.code : (formData.type || '').toLowerCase();
    const balCategory = balance?.balances?.find((b: any) => b.leaveTypeCode === selectedTypeCode);
    const availableDays = balCategory ? Math.max(0, balCategory.total - (balCategory.used || 0) - (balCategory.pending || 0)) : 0;
    const sandwichEnabled = selectedLeaveType ? selectedLeaveType.sandwichRuleEnabled !== false : true;

    // Fetch active leave types and reset state when modal opens/closes
    useEffect(() => {
        const fetchTypes = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await fetch(`${api.baseURL}/api/leaves/types?activeOnly=true`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.data) {
                        setTypes(data.data);
                        if (data.data.length > 0) {
                            setFormData(prev => ({ ...prev, type: data.data[0].name }));
                        }
                    }
                }
            } catch (err) {
                console.error('Failed to fetch leave types:', err);
            }
        };

        if (isOpen) {
            fetchTypes();
            setFormData({ startDate: '', endDate: '', type: 'Annual', reason: '' });
            setError(null);
            setLoading(false);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            // 1. Validation
            const start = new Date(formData.startDate);
            const end = new Date(formData.endDate);
            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                setError('Please select valid start and end dates');
                setLoading(false);
                return;
            }
            if (end < start) {
                setError('End date cannot be before start date');
                setLoading(false);
                return;
            }

            // Calculate duration (inclusive, weekends excluded unless sandwiched and sandwich rule is enabled)
            let diffDays = 0;
            const dates: Date[] = [];
            let current = new Date(start);
            while (current <= end) {
                dates.push(new Date(current));
                current.setDate(current.getDate() + 1);
            }

            for (let i = 0; i < dates.length; i++) {
                const d = dates[i];
                const dayOfWeek = d.getDay();
                if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                    diffDays++;
                } else if (sandwichEnabled) {
                    // Sandwiched?
                    let hasBefore = false;
                    let hasAfter = false;
                    for (let j = 0; j < i; j++) {
                        const dayJ = dates[j].getDay();
                        if (dayJ !== 0 && dayJ !== 6) {
                            hasBefore = true;
                            break;
                        }
                    }
                    for (let j = i + 1; j < dates.length; j++) {
                        const dayJ = dates[j].getDay();
                        if (dayJ !== 0 && dayJ !== 6) {
                            hasAfter = true;
                            break;
                        }
                    }
                    if (hasBefore && hasAfter) {
                        diffDays++;
                    }
                }
            }

            if (diffDays === 0 && start.getTime() <= end.getTime()) {
                setError('Selected range contains only weekends. No leave days will be deducted.');
                setLoading(false);
                return;
            }
            
            if (diffDays > availableDays) {
                setError(`Requested ${diffDays} day(s) exceeds your available ${availableDays} day(s) balance.`);
                setLoading(false);
                return;
            }

            const token = localStorage.getItem('token');
            if (!token) {
                setError('Session expired. Please log in again.');
                setLoading(false);
                return;
            }

            const res = await fetch(`${api.baseURL}/api/leaves`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                setError(errorData.message || errorData.error || `Server error: ${res.status}`);
                return;
            }

            const data = await res.json();
            if (data.success) {
                onSuccess();
                onClose();
            } else {
                setError(data.error || data.message || 'Failed to submit request');
            }
        } catch (err) {
            setError('Connection error. Please check your internet and try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex justify-center p-2 sm:p-4 items-center" onClick={onClose}>
            <div 
                className="bg-white rounded-3xl w-full max-w-md relative z-10 shadow-2xl animate-zoomIn border border-white/20"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-5 sm:p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-lg sm:text-xl font-bold text-slate-800 tracking-tight">Apply For Leave</h2>
                            <p className="text-[10px] text-slate-400">Fill the details below to submit</p>
                        </div>
                        <button 
                            onClick={onClose}
                            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-all"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {error && (
                        <div className="mb-4 bg-rose-50 border border-rose-100 p-3 rounded-xl flex gap-2 animate-shake">
                            <AlertCircle className="text-rose-500 shrink-0" size={16} />
                            <p className="text-[10px] text-rose-700 font-medium">{error}</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-3.5">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Start Date</label>
                                <div className="relative group">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={14} />
                                    <input 
                                        type="date"
                                        required
                                        value={formData.startDate}
                                        onChange={e => setFormData({...formData, startDate: e.target.value})}
                                        className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-9 pr-3 py-2 text-xs focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all font-medium text-slate-600"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">End Date</label>
                                <div className="relative group">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={14} />
                                    <input 
                                        type="date"
                                        required
                                        value={formData.endDate}
                                        onChange={e => setFormData({...formData, endDate: e.target.value})}
                                        className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-9 pr-3 py-2 text-xs focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all font-medium text-slate-600"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <div className="flex justify-between items-center ml-1">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Leave Category</label>
                                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded-md border border-indigo-100">
                                    {availableDays} Available
                                </span>
                            </div>
                            <select 
                                value={formData.type}
                                onChange={e => setFormData({...formData, type: e.target.value})}
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-xs focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all font-bold text-slate-700 cursor-pointer"
                            >
                                {types.map(t => (
                                    <option key={t._id} value={t.name}>
                                        {t.name.toLowerCase().includes('leave') ? t.name : `${t.name} Leave`}
                                    </option>
                                ))}
                                {types.length === 0 && (
                                    <option value="Annual">Annual Leave</option>
                                )}
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Reason (Optional)</label>
                            <textarea 
                                rows={2}
                                value={formData.reason}
                                onChange={e => setFormData({...formData, reason: e.target.value})}
                                placeholder="Short reason for leave..."
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-xs focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all font-medium text-slate-600 resize-none min-h-[60px]"
                            />
                        </div>

                        <div className="flex items-center gap-2 px-1 text-indigo-600/70">
                            <AlertCircle size={12} />
                            <p className="text-[9px] font-medium tracking-tight">
                                Syncs automatically with attendance. Weekends {sandwichEnabled ? 'included if sandwiched' : 'excluded'}.
                            </p>
                        </div>

                        <button 
                            type="submit" 
                            disabled={loading}
                            className={`w-full bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                            {loading ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <Send size={14} />
                                    <span>Submit Request</span>
                                </>
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default ApplyLeaveModal;
