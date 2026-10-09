import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
    CheckSquare, Search, RefreshCw, CheckCircle2, Clock, 
    Plus, Trash2, Mail, Check, RotateCcw, MessageSquare,
    Target, Lock
} from 'lucide-react';
import api from '../../utils/api';
import { usePermissions } from '../../hooks/usePermissions';

export interface WorkflowTaskItem {
    _id: string;
    type: 'Onboarding' | 'Offboarding';
    targetEmployeeId?: string;
    targetUserId?: string;
    targetName: string;
    targetEmail?: string;
    department: 'Tech' | 'Admin' | 'HR' | 'Finance';
    title: string;
    description?: string;
    status: 'Pending' | 'Completed' | 'Skipped';
    assignedEmail?: string;
    completedBy?: string;
    completedByName?: string;
    completedAt?: string;
    notes?: string;
    canEdit?: boolean;
    createdAt: string;
}

interface WorkflowTasksTabProps {
    onPendingCountChange?: (count: number) => void;
}

const WorkflowTasksTab: React.FC<WorkflowTasksTabProps> = ({ onPendingCountChange }) => {
    const [searchParams] = useSearchParams();
    const { role } = usePermissions();
    const isAdmin = role === 'super-admin' || role === 'admin';

    const deptParam = searchParams.get('dept');
    const empIdParam = searchParams.get('empId');

    const [isFocusMode, setIsFocusMode] = useState(Boolean(deptParam || empIdParam));
    const [tasks, setTasks] = useState<WorkflowTaskItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState(empIdParam || '');
    const [filterType, setFilterType] = useState('All');
    const [filterDept, setFilterDept] = useState(deptParam || 'All');
    const [filterStatus, setFilterStatus] = useState('All');

    // Notes editing
    const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
    const [notesText, setNotesText] = useState('');

    // Add Task Modal
    const [showAddModal, setShowAddModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [newTask, setNewTask] = useState({
        type: 'Offboarding' as 'Onboarding' | 'Offboarding',
        department: 'Admin' as 'Tech' | 'Admin' | 'HR' | 'Finance',
        title: '',
        description: '',
        targetName: '',
        targetEmail: '',
        targetEmployeeId: '',
        assignedEmail: '',
    });

    // Departments user has permission to manage
    const userAllowedDepts = useMemo(() => {
        if (isAdmin) return ['Tech', 'Admin', 'HR', 'Finance'];
        const editableDepts = tasks.filter(t => t.canEdit !== false).map(t => t.department);
        const set = new Set(editableDepts);
        if (deptParam && ['Tech', 'Admin', 'HR', 'Finance'].includes(deptParam as any)) {
            set.add(deptParam as any);
        }
        return Array.from(set);
    }, [isAdmin, tasks, deptParam]);

    const fetchTasks = async (clearFocus = false) => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const params = new URLSearchParams();
            if (!clearFocus && isFocusMode) {
                if (deptParam && deptParam !== 'All') params.append('department', deptParam);
                if (empIdParam) params.append('targetEmployeeId', empIdParam);
            }
            const url = params.toString() ? `${api.workflowTasks}?${params.toString()}` : api.workflowTasks;
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data: WorkflowTaskItem[] = await res.json();
                setTasks(data);
                const pending = data.filter(t => t.status === 'Pending').length;
                if (onPendingCountChange) onPendingCountChange(pending);
            }
        } catch (err) {
            console.error('Failed to fetch workflow tasks', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTasks();
    }, []);

    const handleClearFocus = () => {
        setIsFocusMode(false);
        setFilterDept('All');
        setSearchTerm('');
        fetchTasks(true);
    };

    const handleUpdateStatus = async (taskId: string, status: 'Completed' | 'Skipped' | 'Pending', customNotes?: string) => {
        const target = tasks.find(t => t._id === taskId);
        if (target && target.canEdit === false) {
            alert(`You only have permission to edit ${target.department} department tasks.`);
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const payload: any = { status };
            if (customNotes !== undefined) payload.notes = customNotes;

            const res = await fetch(api.workflowTask(taskId), {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const updated: WorkflowTaskItem = await res.json();
                setTasks(prev => {
                    const next = prev.map(t => t._id === taskId ? { ...updated, canEdit: t.canEdit } : t);
                    const pending = next.filter(t => t.status === 'Pending').length;
                    if (onPendingCountChange) onPendingCountChange(pending);
                    return next;
                });
            } else {
                const errData = await res.json().catch(() => ({}));
                alert(errData.message || 'Failed to update task.');
            }
        } catch (err) {
            console.error('Failed to update task', err);
        }
    };

    const handleSaveNotes = async (taskId: string) => {
        const target = tasks.find(t => t._id === taskId);
        if (target && target.canEdit === false) {
            alert(`You only have permission to edit ${target.department} department tasks.`);
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(api.workflowTask(taskId), {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ notes: notesText })
            });

            if (res.ok) {
                const updated = await res.json();
                setTasks(prev => prev.map(t => t._id === taskId ? { ...updated, canEdit: t.canEdit } : t));
                setEditingNotesId(null);
                setNotesText('');
            }
        } catch (err) {
            console.error('Failed to save notes', err);
        }
    };

    const handleDeleteTask = async (taskId: string) => {
        if (!isAdmin) {
            alert('Only administrators can delete workflow tasks.');
            return;
        }
        if (!window.confirm('Are you sure you want to delete this workflow task?')) return;
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(api.workflowTask(taskId), {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setTasks(prev => {
                    const next = prev.filter(t => t._id !== taskId);
                    const pending = next.filter(t => t.status === 'Pending').length;
                    if (onPendingCountChange) onPendingCountChange(pending);
                    return next;
                });
            }
        } catch (err) {
            console.error('Failed to delete task', err);
        }
    };

    const handleCreateTask = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(api.workflowTasks, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(newTask)
            });

            if (res.ok) {
                const created = await res.json();
                setTasks(prev => [created, ...prev]);
                setShowAddModal(false);
                setNewTask({
                    type: 'Offboarding',
                    department: 'Admin',
                    title: '',
                    description: '',
                    targetName: '',
                    targetEmail: '',
                    targetEmployeeId: '',
                    assignedEmail: '',
                });
            }
        } catch (err) {
            console.error('Failed to create task', err);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Filtered list
    const filteredTasks = tasks.filter(task => {
        if (isFocusMode) {
            if (deptParam && deptParam !== 'All' && task.department !== deptParam) return false;
            if (empIdParam) {
                const matchesEmp = 
                    (task.targetEmployeeId && task.targetEmployeeId.toLowerCase() === empIdParam.toLowerCase()) ||
                    (task.targetEmail && task.targetEmail.toLowerCase() === empIdParam.toLowerCase()) ||
                    (task.targetName && task.targetName.toLowerCase().includes(empIdParam.toLowerCase())) ||
                    (task.targetUserId && task.targetUserId === empIdParam);
                if (!matchesEmp) return false;
            }
        }

        const matchesSearch = !searchTerm ? true : (
            task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            task.targetName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (task.targetEmail && task.targetEmail.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (task.targetEmployeeId && task.targetEmployeeId.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (task.description && task.description.toLowerCase().includes(searchTerm.toLowerCase()))
        );

        const matchesType = filterType === 'All' || task.type === filterType;
        const matchesDept = filterDept === 'All' || task.department === filterDept;
        const matchesStatus = filterStatus === 'All' || task.status === filterStatus;

        return matchesSearch && matchesType && matchesDept && matchesStatus;
    });

    const pendingCount = tasks.filter(t => t.status === 'Pending').length;
    const completedCount = tasks.filter(t => t.status === 'Completed').length;
    const onboardingCount = tasks.filter(t => t.type === 'Onboarding').length;
    const offboardingCount = tasks.filter(t => t.type === 'Offboarding').length;

    const getDeptBadgeColor = (dept: string) => {
        switch (dept) {
            case 'Tech': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
            case 'Admin': return 'bg-amber-50 text-amber-700 border-amber-200';
            case 'HR': return 'bg-purple-50 text-purple-700 border-purple-200';
            case 'Finance': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
            default: return 'bg-slate-50 text-slate-700 border-slate-200';
        }
    };

    return (
        <div className="space-y-6">
            {/* Focused Notification Banner (When opened from email link) */}
            {isFocusMode && (
                <div className="bg-gradient-to-r from-indigo-50 via-blue-50 to-indigo-50 border border-indigo-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm animate-in fade-in">
                    <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                            <Target size={20} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h4 className="text-sm font-bold text-slate-900">
                                    Focused Action Checklist (From Email)
                                </h4>
                                <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                                    {deptParam || 'Assigned'} Department
                                </span>
                            </div>
                            <p className="text-xs text-slate-600 mt-0.5">
                                Showing checklist tasks related to your email alert
                                {empIdParam ? <> for employee <strong>{empIdParam}</strong></> : ''}.
                            </p>
                        </div>
                    </div>
                    {isAdmin ? (
                        <button
                            type="button"
                            onClick={handleClearFocus}
                            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-white border border-indigo-200 px-3.5 py-2 rounded-xl shadow-xs transition-all hover:bg-indigo-50/50 shrink-0"
                        >
                            Clear Focus & View All
                        </button>
                    ) : (
                        <span className="text-[11px] font-semibold text-slate-500 bg-white/80 border border-slate-200 px-3 py-1.5 rounded-xl shrink-0">
                            Department-Restricted View
                        </span>
                    )}
                </div>
            )}

            {/* Top Metrics Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pending Action</p>
                    <p className="text-2xl font-black text-amber-600 mt-1">{pendingCount}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Tasks requiring completion</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Completed</p>
                    <p className="text-2xl font-black text-emerald-600 mt-1">{completedCount}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Successfully closed</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Onboarding</p>
                    <p className="text-2xl font-black text-indigo-600 mt-1">{onboardingCount}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">User provisioning tasks</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Offboarding</p>
                    <p className="text-2xl font-black text-rose-600 mt-1">{offboardingCount}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Checklist & clearance</p>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col lg:flex-row gap-4 justify-between items-stretch lg:items-center">
                    <div className="relative flex-1">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search tasks by name, email, employee ID, or title..."
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {/* Type Filter */}
                        <select
                            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20"
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                        >
                            <option value="All">All Types</option>
                            <option value="Onboarding">Onboarding</option>
                            <option value="Offboarding">Offboarding</option>
                        </select>

                        {/* Dept Filter */}
                        {isAdmin ? (
                            <select
                                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20"
                                value={filterDept}
                                onChange={(e) => setFilterDept(e.target.value)}
                            >
                                <option value="All">All Departments</option>
                                <option value="Tech">Tech</option>
                                <option value="Admin">Admin</option>
                                <option value="HR">HR</option>
                                <option value="Finance">Finance</option>
                            </select>
                        ) : userAllowedDepts.length > 1 ? (
                            <select
                                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20"
                                value={filterDept}
                                onChange={(e) => setFilterDept(e.target.value)}
                            >
                                {userAllowedDepts.map(d => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                        ) : (
                            <div className="px-3 py-2 bg-white text-slate-700 rounded-xl text-xs font-bold border border-slate-200 shadow-2xs">
                                Dept: {userAllowedDepts[0] || deptParam || 'My Dept'}
                            </div>
                        )}

                        {/* Status Filter */}
                        <select
                            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20"
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                        >
                            <option value="All">All Statuses</option>
                            <option value="Pending">Pending</option>
                            <option value="Completed">Completed</option>
                            <option value="Skipped">Skipped</option>
                        </select>

                        <button
                            type="button"
                            onClick={() => fetchTasks(false)}
                            className="p-2.5 text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                            title="Refresh Tasks"
                        >
                            <RefreshCw size={16} />
                        </button>

                        {(isAdmin || role === 'hr') && (
                            <button
                                type="button"
                                onClick={() => setShowAddModal(true)}
                                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors shadow-sm"
                            >
                                <Plus size={16} /> Add Task
                            </button>
                        )}
                    </div>
                </div>

                {/* Task List Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/80">
                                <th className="px-5 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Workflow / Dept</th>
                                <th className="px-5 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Target Employee / User</th>
                                <th className="px-5 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Task Details</th>
                                <th className="px-5 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-center">Status</th>
                                <th className="px-5 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                Array(4).fill(0).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan={5} className="px-5 py-6">
                                            <div className="h-4 bg-slate-100 rounded w-full"></div>
                                        </td>
                                    </tr>
                                ))
                            ) : filteredTasks.length > 0 ? (
                                filteredTasks.map(task => (
                                    <tr key={task._id} className="hover:bg-slate-50/60 transition-colors">
                                        {/* Type & Dept */}
                                        <td className="px-5 py-4 align-top">
                                            <div className="flex flex-col gap-1.5">
                                                <span className={`inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold w-fit ${
                                                    task.type === 'Onboarding'
                                                        ? 'bg-blue-100 text-blue-700'
                                                        : 'bg-rose-100 text-rose-700'
                                                }`}>
                                                    {task.type}
                                                </span>
                                                <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-extrabold border w-fit ${getDeptBadgeColor(task.department)}`}>
                                                    {task.department}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Target */}
                                        <td className="px-5 py-4 align-top">
                                            <div className="min-w-[160px]">
                                                <p className="text-sm font-bold text-slate-800">{task.targetName}</p>
                                                {task.targetEmail && (
                                                    <p className="text-xs text-slate-500 truncate">{task.targetEmail}</p>
                                                )}
                                                {task.targetEmployeeId && (
                                                    <span className="inline-block mt-1 px-1.5 py-0.5 text-[10px] font-mono font-bold bg-slate-100 text-slate-600 rounded">
                                                        ID: {task.targetEmployeeId}
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Task Title & Description */}
                                        <td className="px-5 py-4 align-top max-w-md">
                                            <div>
                                                <p className="text-sm font-bold text-slate-800">{task.title}</p>
                                                {task.description && (
                                                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{task.description}</p>
                                                )}
                                                {task.assignedEmail && (
                                                    <p className="text-[11px] text-indigo-600 mt-1.5 flex items-center gap-1 font-medium">
                                                        <Mail size={12} /> Notified: {task.assignedEmail}
                                                    </p>
                                                )}

                                                {/* Notes section */}
                                                {editingNotesId === task._id ? (
                                                    <div className="mt-2.5 p-2 bg-slate-50 rounded-xl border border-slate-200">
                                                        <input
                                                            type="text"
                                                            className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg outline-none"
                                                            placeholder="Add note or serial # / details..."
                                                            value={notesText}
                                                            onChange={e => setNotesText(e.target.value)}
                                                            autoFocus
                                                        />
                                                        <div className="flex justify-end gap-1.5 mt-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => setEditingNotesId(null)}
                                                                className="px-2 py-1 text-[11px] font-semibold text-slate-500 hover:text-slate-700"
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleSaveNotes(task._id)}
                                                                className="px-2.5 py-1 text-[11px] font-bold bg-indigo-600 text-white rounded-md"
                                                            >
                                                                Save
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : task.notes ? (
                                                    <div className="mt-2 text-[11px] bg-slate-50 border border-slate-200/70 p-2 rounded-lg text-slate-600 flex items-start justify-between gap-2">
                                                        <span><strong>Note:</strong> {task.notes}</span>
                                                        {task.canEdit !== false && (
                                                            <button
                                                                onClick={() => {
                                                                    setEditingNotesId(task._id);
                                                                    setNotesText(task.notes || '');
                                                                }}
                                                                className="text-indigo-600 hover:underline shrink-0 text-[10px]"
                                                            >
                                                                Edit
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : task.canEdit !== false ? (
                                                    <button
                                                        onClick={() => {
                                                            setEditingNotesId(task._id);
                                                            setNotesText('');
                                                        }}
                                                        className="mt-1.5 text-[11px] text-slate-400 hover:text-indigo-600 flex items-center gap-1"
                                                    >
                                                        <MessageSquare size={11} /> + Add note
                                                    </button>
                                                ) : null}
                                            </div>
                                        </td>

                                        {/* Status */}
                                        <td className="px-5 py-4 align-top text-center">
                                            <div className="flex flex-col items-center">
                                                {task.status === 'Completed' && (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                        <CheckCircle2 size={13} /> Completed
                                                    </span>
                                                )}
                                                {task.status === 'Pending' && (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                                        <Clock size={13} /> Pending
                                                    </span>
                                                )}
                                                {task.status === 'Skipped' && (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                                        Skipped
                                                    </span>
                                                )}

                                                {task.completedByName && (
                                                    <span className="text-[10px] text-slate-400 mt-1 text-center">
                                                        By {task.completedByName}
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Actions */}
                                        <td className="px-5 py-4 align-top text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                {task.canEdit !== false ? (
                                                    task.status === 'Pending' ? (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleUpdateStatus(task._id, 'Completed')}
                                                                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
                                                                title="Mark as Completed"
                                                            >
                                                                <Check size={14} /> Done
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleUpdateStatus(task._id, 'Skipped')}
                                                                className="px-2.5 py-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs font-semibold rounded-lg transition-colors"
                                                                title="Skip Task"
                                                            >
                                                                Skip
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleUpdateStatus(task._id, 'Pending')}
                                                            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs font-semibold rounded-lg transition-colors"
                                                            title="Reopen Task"
                                                        >
                                                            <RotateCcw size={12} /> Reopen
                                                        </button>
                                                    )
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-400 bg-slate-100 border border-slate-200">
                                                        <Lock size={12} /> View Only
                                                    </span>
                                                )}

                                                {isAdmin && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteTask(task._id)}
                                                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors ml-1"
                                                        title="Delete Task"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                                        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                                            <CheckSquare size={24} />
                                        </div>
                                        <p className="text-sm font-semibold text-slate-600">No workflow tasks found</p>
                                        <p className="text-xs text-slate-400 mt-1">
                                            Tasks are automatically created when new users are onboarded or employees are terminated/resigned.
                                        </p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal: Add Custom Workflow Task */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 bg-indigo-50/60 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">Add Workflow Checklist Task</h3>
                                <p className="text-xs text-slate-500 mt-0.5">Create a department action item for an employee</p>
                            </div>
                            <button
                                onClick={() => setShowAddModal(false)}
                                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-full transition-all"
                            >
                                <CheckSquare size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleCreateTask} className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Workflow Type</label>
                                    <select
                                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
                                        value={newTask.type}
                                        onChange={e => setNewTask({ ...newTask, type: e.target.value as any })}
                                    >
                                        <option value="Offboarding">Offboarding</option>
                                        <option value="Onboarding">Onboarding</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Department</label>
                                    <select
                                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
                                        value={newTask.department}
                                        onChange={e => setNewTask({ ...newTask, department: e.target.value as any })}
                                    >
                                        <option value="Admin">Admin</option>
                                        <option value="Tech">Tech</option>
                                        <option value="HR">HR</option>
                                        <option value="Finance">Finance</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Target Employee / Person Name *</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. John Doe"
                                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                                    value={newTask.targetName}
                                    onChange={e => setNewTask({ ...newTask, targetName: e.target.value })}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Employee ID (Optional)</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. ITCS-042"
                                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                                        value={newTask.targetEmployeeId}
                                        onChange={e => setNewTask({ ...newTask, targetEmployeeId: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Target Email (Optional)</label>
                                    <input
                                        type="email"
                                        placeholder="e.g. john@company.com"
                                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                                        value={newTask.targetEmail}
                                        onChange={e => setNewTask({ ...newTask, targetEmail: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Task Title *</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Collect company car keys and parking pass"
                                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                                    value={newTask.title}
                                    onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Description / Instructions</label>
                                <textarea
                                    rows={2}
                                    placeholder="Optional details, instructions or conditions..."
                                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 resize-none"
                                    value={newTask.description}
                                    onChange={e => setNewTask({ ...newTask, description: e.target.value })}
                                />
                            </div>

                            <div className="pt-3 flex items-center justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowAddModal(false)}
                                    className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-sm transition-all disabled:opacity-50"
                                >
                                    {isSubmitting ? 'Creating...' : 'Create Task'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WorkflowTasksTab;
