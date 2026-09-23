import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertCircle, Send } from 'lucide-react';
import { api } from '../../utils/api';
import { formatEmployeeFullName } from '../../utils/nameHelper';
import FormattedDateInput from '../../components/Common/FormattedDateInput';

interface ApplyLeaveModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    balance: any;
    isAdminLike?: boolean;
    allEmployees?: any[];
    editLeave?: any;
    existingLeaves?: any[];
}

const ApplyLeaveModal = ({ isOpen, onClose, onSuccess, balance, isAdminLike, allEmployees, editLeave, existingLeaves }: ApplyLeaveModalProps) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
    const [localBalance, setLocalBalance] = useState<any>(null);
    const [loadingBalance, setLoadingBalance] = useState(false);
    const [formData, setFormData] = useState({
        startDate: '',
        endDate: '',
        type: 'Annual',
        reason: '',
        duration: 'Full Day',
        startTime: '',
        endTime: ''
    });
    const [types, setTypes] = useState<any[]>([]);

    const selectedLeaveType = types.find(t => t.name === formData.type);
    const selectedTypeCode = selectedLeaveType ? selectedLeaveType.code : (formData.type || '').toLowerCase();
    const activeBalance = localBalance || balance;
    const balCategory = activeBalance?.balances?.find((b: any) => b.leaveTypeCode === selectedTypeCode);
    const availableDays = balCategory ? Math.max(0, balCategory.total - (balCategory.used || 0) - (balCategory.pending || 0)) : 0;
    const sandwichEnabled = selectedLeaveType ? selectedLeaveType.sandwichRuleEnabled !== false : true;

    // Real-time duplicate & overlap conflict detection
    const overlapConflict = (() => {
        if (!formData.startDate || !formData.endDate || !existingLeaves || existingLeaves.length === 0) {
            return null;
        }
        const reqStart = new Date(formData.startDate);
        reqStart.setHours(0, 0, 0, 0);
        const reqEnd = new Date(formData.endDate);
        reqEnd.setHours(23, 59, 59, 999);

        if (isNaN(reqStart.getTime()) || isNaN(reqEnd.getTime()) || reqStart > reqEnd) {
            return null;
        }

        for (const l of existingLeaves) {
            if (editLeave && (l._id === editLeave._id || l.id === editLeave.id)) {
                continue;
            }
            if (selectedEmployeeId && l.employeeId !== selectedEmployeeId) {
                continue;
            }
            if (l.status !== 'Pending' && l.status !== 'Approved') {
                continue;
            }

            const exStart = new Date(l.startDate);
            exStart.setHours(0, 0, 0, 0);
            const exEnd = new Date(l.endDate);
            exEnd.setHours(23, 59, 59, 999);

            if (exStart <= reqEnd && exEnd >= reqStart) {
                const isReqSingle = formData.startDate === formData.endDate;
                const exStartStr = String(l.startDate).split('T')[0];
                const exEndStr = String(l.endDate).split('T')[0];
                const isExSingle = exStartStr === exEndStr;

                if (isReqSingle && isExSingle) {
                    const exDur = l.duration || 'Full Day';
                    const reqDur = formData.duration || 'Full Day';
                    if (exDur !== 'Full Day' && reqDur !== 'Full Day' && exDur !== reqDur && exDur !== 'Specify Time' && reqDur !== 'Specify Time') {
                        continue;
                    }
                }

                const sStr = new Date(l.startDate).toLocaleDateString('en-GB');
                const eStr = new Date(l.endDate).toLocaleDateString('en-GB');
                const dateRangeStr = sStr === eStr ? sStr : `${sStr} to ${eStr}`;
                return {
                    ...l,
                    formattedRange: dateRangeStr
                };
            }
        }
        return null;
    })();

    useEffect(() => {
        const fetchLocalBalance = async () => {
            if (!selectedEmployeeId) {
                setLocalBalance(null);
                return;
            }
            setLoadingBalance(true);
            try {
                const token = localStorage.getItem('token');
                const res = await fetch(`${api.baseURL}/api/leaves/balance?employeeId=${selectedEmployeeId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.success) setLocalBalance(data.data);
                }
            } catch (err) {
                console.error('Failed to fetch selected employee balance:', err);
            } finally {
                setLoadingBalance(false);
            }
        };
        fetchLocalBalance();
    }, [selectedEmployeeId]);

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
            if (editLeave) {
                setFormData({
                    startDate: editLeave.startDate ? new Date(editLeave.startDate).toISOString().split('T')[0] : '',
                    endDate: editLeave.endDate ? new Date(editLeave.endDate).toISOString().split('T')[0] : '',
                    type: editLeave.type || 'Annual',
                    reason: editLeave.reason || '',
                    duration: editLeave.duration || 'Full Day',
                    startTime: editLeave.startTime || '',
                    endTime: editLeave.endTime || ''
                });
                setSelectedEmployeeId(editLeave.employeeId || '');
            } else {
                setFormData({ startDate: '', endDate: '', type: 'Annual', reason: '', duration: 'Full Day', startTime: '', endTime: '' });
                setSelectedEmployeeId('');
            }
            setLocalBalance(null);
            setError(null);
            setLoading(false);
        }
    }, [isOpen, editLeave]);

    useEffect(() => {
        if (formData.duration !== 'Full Day' && formData.startDate && formData.startDate !== formData.endDate) {
            setFormData(prev => ({ ...prev, endDate: prev.startDate }));
        }
    }, [formData.duration, formData.startDate]);

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

            if (overlapConflict) {
                setError(`You already have an active leave request (${overlapConflict.type} - ${overlapConflict.status}) for ${overlapConflict.formattedRange}. Duplicate or overlapping applications are not permitted.`);
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
            
            const isEditing = Boolean(editLeave);
            const effectiveAvailableDays = isEditing ? (availableDays + (editLeave.totalDays || 0)) : availableDays;
            if (diffDays > effectiveAvailableDays) {
                setError(`Requested ${diffDays} day(s) exceeds your available ${effectiveAvailableDays} day(s) balance.`);
                setLoading(false);
                return;
            }

            const token = localStorage.getItem('token');
            if (!token) {
                setError('Session expired. Please log in again.');
                setLoading(false);
                return;
            }

            const payload = { ...formData, employeeId: selectedEmployeeId || undefined };
            const url = isEditing ? `${api.baseURL}/api/leaves/${editLeave._id}` : `${api.baseURL}/api/leaves`;
            const method = isEditing ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
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

    if (!isOpen) return null;

    const modalContent = (
        <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
            <div className="min-h-full flex items-center justify-center p-4 sm:p-6">
                <div 
                    className="bg-white rounded-3xl w-full max-w-md relative shadow-2xl animate-zoomIn border border-white/20 my-4"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="p-5 sm:p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-lg sm:text-xl font-bold text-slate-800 tracking-tight">
                                    {editLeave ? 'Edit Leave Request' : 'Apply For Leave'}
                                </h2>
                                <p className="text-[10px] text-slate-400">
                                    {editLeave ? 'Modify your leave request details below' : 'Fill the details below to submit'}
                                </p>
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
                        {isAdminLike && allEmployees && (
                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Apply On Behalf Of (Admin/HR Only)</label>
                                <select
                                    value={selectedEmployeeId}
                                    onChange={e => setSelectedEmployeeId(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-xs focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all font-bold text-slate-700 cursor-pointer"
                                >
                                    <option value="">Myself</option>
                                    {allEmployees.map(emp => (
                                        <option key={emp.employeeId} value={emp.employeeId}>
                                            {formatEmployeeFullName(emp, emp.employeeId)} ({emp.employeeId})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Start Date</label>
                                <FormattedDateInput 
                                    required
                                    value={formData.startDate}
                                    onChange={val => setFormData({...formData, startDate: val})}
                                    placeholder="DD/MM/YYYY"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">End Date</label>
                                <FormattedDateInput 
                                    required
                                    value={formData.endDate}
                                    onChange={val => setFormData({...formData, endDate: val})}
                                    disabled={formData.duration !== 'Full Day'}
                                    min={formData.startDate}
                                    placeholder="DD/MM/YYYY"
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Duration</label>
                            <select 
                                value={formData.duration}
                                onChange={e => setFormData({...formData, duration: e.target.value})}
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 pr-8 text-xs focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all font-bold text-slate-700 cursor-pointer"
                            >
                                <option value="Full Day">Full Day</option>
                                <option value="Half Day - Morning">Half Day - Morning</option>
                                <option value="Half Day - Afternoon">Half Day - Afternoon</option>
                                <option value="Specify Time">Specify Time</option>
                            </select>
                        </div>

                        {formData.duration === 'Specify Time' && (
                            <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-1">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Start Time</label>
                                    <input 
                                        type="time"
                                        required
                                        value={formData.startTime}
                                        onChange={e => setFormData({...formData, startTime: e.target.value})}
                                        className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-xs focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all font-medium text-slate-600"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">End Time</label>
                                    <input 
                                        type="time"
                                        required
                                        value={formData.endTime}
                                        onChange={e => setFormData({...formData, endTime: e.target.value})}
                                        className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-xs focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all font-medium text-slate-600"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="space-y-1">
                            <div className="flex justify-between items-center ml-1">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Leave Category</label>
                                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded-md border border-indigo-100">
                                    {loadingBalance ? 'Loading...' : `${availableDays} Available`}
                                </span>
                            </div>
                            <select 
                                value={formData.type}
                                onChange={e => setFormData({...formData, type: e.target.value})}
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 pr-8 text-xs focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all font-bold text-slate-700 cursor-pointer"
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

                        {overlapConflict && (
                            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 animate-in fade-in duration-200">
                                <AlertCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-bold text-rose-900">Leave already applied for this date</p>
                                    <p className="text-[11px] text-rose-700 mt-0.5 leading-relaxed">
                                        You already have an active leave request (<strong>{overlapConflict.type}</strong> — <span className="font-semibold">{overlapConflict.status}</span>) for <strong>{overlapConflict.formattedRange}</strong>. Duplicate or overlapping requests are not permitted.
                                    </p>
                                </div>
                            </div>
                        )}

                        <button 
                            type="submit" 
                            disabled={loading || !!overlapConflict}
                            className={`w-full bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 ${loading || !!overlapConflict ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {loading ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <Send size={14} />
                                    <span>{editLeave ? 'Save Changes' : 'Submit Request'}</span>
                                </>
                            )}
                        </button>
                    </form>
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};

export default ApplyLeaveModal;
