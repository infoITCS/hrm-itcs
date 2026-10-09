import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
    Bell,
    CheckSquare,
    Banknote,
    FileText,
    Calendar,
    Receipt,
    HandCoins,
    PiggyBank,
    Search,
    RefreshCw,
    ExternalLink,
    CheckCircle2,
    X,
    Clock
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { api } from '../../utils/api';
import WorkflowTasksTab from '../../components/Admin/WorkflowTasksTab';

interface NotificationTask {
    id: string;
    title: string;
    message: string;
    time: string;
    type: string;
    category?: string;
    path: string;
    actionable?: boolean;
    meta?: any;
    status?: string;
}

const NotificationsPage: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { showToast } = useToast();

    const [tasks, setTasks] = useState<NotificationTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeFilter, setActiveFilter] = useState('All');

    // Quick Action ERP Modal state
    const [selectedErpTask, setSelectedErpTask] = useState<NotificationTask | null>(null);
    const [erpIdInput, setErpIdInput] = useState('');
    const [erpNotesInput, setErpNotesInput] = useState('');
    const [submittingErp, setSubmittingErp] = useState(false);

    const role = (user?.role || '').toLowerCase();
    const isSuperAdmin = role === 'super-admin';
    const isFinance = role === 'finance';
    const isHr = role === 'hr';
    const isManager = role === 'manager';
    const isEmployee = role === 'employee';

    const [activeSection, setActiveSection] = useState<'requests' | 'workflow'>('requests');
    const [workflowPendingCount, setWorkflowPendingCount] = useState<number>(0);

    const canAccessWorkflow = ['super-admin', 'admin', 'hr', 'finance'].includes(role) ||
        Boolean((user as any)?.department && /it|tech|softw|admin|operat/i.test((user as any).department));

    const fetchTasks = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(api.notifications, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setTasks(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            console.error('Failed to fetch tasks', err);
            showToast('Failed to load notifications', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTasks();
    }, []);

    const handleOpenErpModal = (task: NotificationTask) => {
        setSelectedErpTask(task);
        setErpIdInput('');
        setErpNotesInput('');
    };

    const handleSaveErpReference = async () => {
        if (!selectedErpTask || !erpIdInput.trim()) {
            showToast('Please enter a valid ERP Reference ID', 'error');
            return;
        }

        setSubmittingErp(true);
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };

        try {
            const meta = selectedErpTask.meta || {};
            const trimmedId = erpIdInput.trim();

            if (selectedErpTask.category === 'payroll-erp') {
                await axios.put(api.payrollErpTask(meta.runId), {
                    erpReferenceId: trimmedId,
                    erpStatus: 'Posted',
                    erpNotes: erpNotesInput.trim()
                }, { headers });
                showToast('Payroll ERP Voucher ID saved successfully', 'success');
            } else if (selectedErpTask.category === 'loan-recovery-erp') {
                if (meta.payslipId) {
                    await axios.put(api.payslipLoanErp(meta.payslipId), {
                        loanDeductionErpId: trimmedId,
                        notes: erpNotesInput.trim()
                    }, { headers });
                    showToast(`Loan Recovery ERP ID saved for ${meta.employeeName || 'employee'}`, 'success');
                } else {
                    await axios.put(api.payrollErpTask(meta.runId), {
                        loanDeductionErpId: trimmedId,
                        loanDeductionErpStatus: 'Posted',
                        loanDeductionErpNotes: erpNotesInput.trim()
                    }, { headers });
                    showToast('Loan Recovery ERP ID saved successfully', 'success');
                }
            } else if (selectedErpTask.category === 'pf-erp') {
                await axios.patch(api.pfErpRef(meta.employeeId), {
                    erpReferenceId: trimmedId,
                    entryId: meta.entryId,
                    periodMonth: meta.periodMonth,
                    periodYear: meta.periodYear
                }, { headers });
                showToast('Matured PF ERP Reference saved successfully', 'success');
            } else {
                // Generic redirect
                navigate(selectedErpTask.path);
                return;
            }

            setSelectedErpTask(null);
            fetchTasks();
        } catch (err: any) {
            console.error(err);
            showToast(err.response?.data?.message || 'Failed to update ERP Reference', 'error');
        } finally {
            setSubmittingErp(false);
        }
    };

    // Filter categories depending on role
    const getFilterTabs = () => {
        if (isSuperAdmin) {
            return ['All', 'Finance & ERP', 'HR & Management', 'Leave Approvals', 'Expense Claims', 'My Requests'];
        }
        if (isFinance) {
            return ['All', 'Payroll & Loan ERP', 'Matured PF', 'Expense Claims', 'My Requests'];
        }
        if (isHr) {
            return ['All', 'Leave Approvals', 'Management & Loans', 'Expense Claims', 'My Requests'];
        }
        if (isManager) {
            return ['All', 'Leave Approvals', 'Expense Claims', 'My Requests'];
        }
        return ['All', 'Leaves', 'Expense Claims', 'Other Requests'];
    };

    const filteredTasks = tasks.filter((t) => {
        const query = searchTerm.toLowerCase().trim();
        const matchesSearch = !query || 
            t.title.toLowerCase().includes(query) || 
            t.message.toLowerCase().includes(query);

        if (!matchesSearch) return false;

        if (activeFilter === 'All') return true;

        if (activeFilter === 'Finance & ERP') {
            return t.category === 'payroll-erp' || t.category === 'loan-recovery-erp' || t.category === 'pf-erp' || t.title.includes('ERP');
        }
        if (activeFilter === 'Payroll & Loan ERP') {
            return t.category === 'payroll-erp' || t.category === 'loan-recovery-erp';
        }
        if (activeFilter === 'Matured PF') {
            return t.category === 'pf-erp';
        }
        if (activeFilter === 'Leave Approvals' || activeFilter === 'Leaves') {
            return t.title.toLowerCase().includes('leave');
        }
        if (activeFilter === 'Expense Claims') {
            return t.title.toLowerCase().includes('claim');
        }
        if (activeFilter === 'Management & Loans') {
            return t.title.toLowerCase().includes('loan') || t.title.toLowerCase().includes('pf');
        }
        if (activeFilter === 'My Requests') {
            return t.type === 'my-request' || t.title.toLowerCase().includes('your');
        }
        return true;
    });

    const getRoleHeaderSubtitle = () => {
        if (isSuperAdmin) return 'Complete global pending tasks, audit reviews, and post-payroll ERP entries.';
        if (isFinance) return 'Post finalized payroll vouchers, loan recovery deductions, and matured PF entries into ERP.';
        if (isHr) return 'Review employee leave requests, management loan reviews, and onboarding workflows.';
        if (isManager) return 'Review and approve team leave applications and expense claims.';
        return 'Track real-time progress and reviewer status of your submitted requests.';
    };

    const getCategoryIcon = (task: NotificationTask) => {
        if (task.category === 'payroll-erp') return <Banknote className="text-emerald-600" size={20} />;
        if (task.category === 'loan-recovery-erp') return <HandCoins className="text-amber-600" size={20} />;
        if (task.category === 'pf-erp') return <PiggyBank className="text-indigo-600" size={20} />;
        if (task.title.toLowerCase().includes('claim')) return <Receipt className="text-purple-600" size={20} />;
        if (task.title.toLowerCase().includes('leave')) return <Calendar className="text-blue-600" size={20} />;
        return <FileText className="text-slate-600" size={20} />;
    };

    const erpCount = tasks.filter(t => t.category?.includes('erp') || t.title.includes('ERP')).length;
    const approvalsCount = tasks.filter(t => !t.category?.includes('erp') && !t.title.includes('ERP')).length;

    return (
        <div className="space-y-6 animate-slide-up pb-12 pt-2 max-w-7xl mx-auto">
            {/* Header Banner */}
            <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/80 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
                    <Bell size={180} className="text-indigo-600 -rotate-12" />
                </div>
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center gap-1.5">
                                <CheckSquare size={13} />
                                {role.toUpperCase()} WORKSPACE
                            </span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight">
                            {isFinance ? 'Finance & Post-Payroll Tasks' : isEmployee ? 'My Requests & Notifications' : 'Pending Tasks & Approvals'}
                        </h1>
                        <p className="text-slate-500 text-sm sm:text-base mt-1 max-w-2xl">
                            {getRoleHeaderSubtitle()}
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={fetchTasks}
                            disabled={loading}
                            className="px-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl font-bold text-xs border border-slate-200 transition-all flex items-center gap-2 cursor-pointer"
                        >
                            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                            Refresh
                        </button>
                    </div>
                </div>

                {/* Metric Summary Counters */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-100">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Pending</p>
                        <p className="text-xl font-black text-slate-800 mt-0.5">{tasks.length}</p>
                    </div>
                    {(isFinance || isSuperAdmin) && (
                        <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-100">
                            <p className="text-xs font-bold text-amber-600 uppercase tracking-wider">ERP Tasks Pending</p>
                            <p className="text-xl font-black text-amber-700 mt-0.5">{erpCount}</p>
                        </div>
                    )}
                    <div className="p-3 bg-indigo-50/70 rounded-xl border border-indigo-100">
                        <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider">
                            {isEmployee ? 'My Active Requests' : 'Pending Approvals'}
                        </p>
                        <p className="text-xl font-black text-indigo-700 mt-0.5">
                            {isEmployee ? tasks.length : approvalsCount}
                        </p>
                    </div>
                    <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-100">
                        <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Status</p>
                        <p className="text-sm font-bold text-emerald-700 mt-1 flex items-center gap-1">
                            <CheckCircle2 size={15} /> All Sync Active
                        </p>
                    </div>
                </div>
            </div>

            {/* Top-Level Tab Switcher: Requests & Approvals vs Workflow Tasks */}
            {canAccessWorkflow && (
                <div className="flex items-center gap-2 border-b border-slate-200">
                    <button
                        type="button"
                        onClick={() => setActiveSection('requests')}
                        className={`px-4 py-3 font-bold text-sm border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
                            activeSection === 'requests'
                                ? 'border-indigo-600 text-indigo-600 bg-indigo-50/40 rounded-t-xl'
                                : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <Bell size={16} />
                        Requests & Approvals
                        <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] font-black bg-slate-100 text-slate-600">
                            {tasks.length}
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveSection('workflow')}
                        className={`px-4 py-3 font-bold text-sm border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
                            activeSection === 'workflow'
                                ? 'border-indigo-600 text-indigo-600 bg-indigo-50/40 rounded-t-xl'
                                : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <CheckSquare size={16} />
                        Workflow Tasks (Onboarding & Offboarding)
                        {workflowPendingCount > 0 && (
                            <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] font-black bg-rose-50 text-rose-600 border border-rose-100">
                                {workflowPendingCount}
                            </span>
                        )}
                    </button>
                </div>
            )}

            {activeSection === 'workflow' ? (
                <WorkflowTasksTab onPendingCountChange={setWorkflowPendingCount} />
            ) : (
                <>

            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="relative w-full sm:max-w-xs">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search tasks, descriptions..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-9 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    {searchTerm && (
                        <button
                            onClick={() => setSearchTerm('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

                <div className="flex gap-2 w-full sm:w-auto overflow-x-auto scrollbar-none pb-1">
                    {getFilterTabs().map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveFilter(tab)}
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                                activeFilter === tab
                                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            {/* Task Cards List */}
            {loading ? (
                <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-sm">
                    <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm font-semibold text-slate-600">Loading your pending tasks...</p>
                </div>
            ) : filteredTasks.length === 0 ? (
                <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-sm">
                    <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-100 text-emerald-600">
                        <CheckCircle2 size={32} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800">All caught up!</h3>
                    <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
                        {searchTerm ? 'No tasks matched your search query.' : 'There are no pending tasks requiring your action at this moment.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredTasks.map((task) => {
                        const isErpTask = task.category?.includes('erp') || task.title.includes('ERP');
                        const canTakeErpAction = (isFinance || isSuperAdmin) && task.actionable;

                        return (
                            <div
                                key={task.id}
                                className={`bg-white rounded-xl p-5 border transition-all shadow-sm hover:shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                                    isErpTask
                                        ? 'border-amber-200/80 bg-gradient-to-r from-amber-50/20 to-white'
                                        : 'border-slate-200 hover:border-indigo-200'
                                }`}
                            >
                                <div className="flex items-start gap-4 flex-1">
                                    <div className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-xs shrink-0 mt-0.5">
                                        {getCategoryIcon(task)}
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="text-sm sm:text-base font-bold text-slate-800">{task.title}</h3>
                                            {isErpTask ? (
                                                <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
                                                    ERP Action Required
                                                </span>
                                            ) : (
                                                <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-700">
                                                    Pending
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium">
                                            {task.message}
                                        </p>
                                        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium pt-1">
                                            <Clock size={12} />
                                            <span>
                                                {new Date(task.time).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                                    {canTakeErpAction && (
                                        <button
                                            onClick={() => handleOpenErpModal(task)}
                                            className="px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                                        >
                                            <CheckSquare size={14} />
                                            Enter ERP Voucher ID
                                        </button>
                                    )}

                                    <button
                                        onClick={() => navigate(task.path)}
                                        className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                                    >
                                        <span>View Details</span>
                                        <ExternalLink size={13} className="text-slate-400" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

                </>
            )}

            {/* Quick Action Modal: Enter ERP Reference */}
            {selectedErpTask && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-slide-up border border-slate-100">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-amber-100 text-amber-700 rounded-lg">
                                    <Banknote size={16} />
                                </div>
                                <h3 className="text-base font-bold text-slate-900">Record ERP Voucher</h3>
                            </div>
                            <button
                                onClick={() => setSelectedErpTask(null)}
                                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 space-y-1">
                                <p className="font-bold">{selectedErpTask.title}</p>
                                <p className="text-amber-800">{selectedErpTask.message}</p>
                            </div>

                            {selectedErpTask.meta?.amount !== undefined && (
                                <div className="flex items-center justify-between text-xs bg-slate-50 border border-slate-200 rounded-xl p-3">
                                    <span className="text-slate-500 font-semibold">
                                        {selectedErpTask.meta.employeeName
                                            ? `Employee: ${selectedErpTask.meta.employeeName} (${selectedErpTask.meta.employeeId || ''})`
                                            : selectedErpTask.meta.isBatch
                                                ? `Batch Total (${selectedErpTask.meta.employeeCount || ''} employees)`
                                                : 'Amount to Post'}
                                    </span>
                                    <span className="font-extrabold text-slate-800 font-mono text-sm">
                                        Rs. {Number(selectedErpTask.meta.amount).toLocaleString()}
                                    </span>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                    ERP Voucher / Transaction ID <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. JV-2026-10-09, VCH-84920"
                                    value={erpIdInput}
                                    onChange={(e) => setErpIdInput(e.target.value)}
                                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                                    autoFocus
                                />
                                <p className="text-[11px] text-slate-400 mt-1">
                                    Entering this will mark the task as "Posted" and clear it from your pending notifications.
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                    Finance Notes (Optional)
                                </label>
                                <textarea
                                    rows={2}
                                    placeholder="Add any internal ledger or reconciliation notes..."
                                    value={erpNotesInput}
                                    onChange={(e) => setErpNotesInput(e.target.value)}
                                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                                />
                            </div>
                        </div>

                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                            <button
                                onClick={() => setSelectedErpTask(null)}
                                className="px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveErpReference}
                                disabled={submittingErp || !erpIdInput.trim()}
                                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                            >
                                {submittingErp ? 'Saving...' : 'Confirm & Mark Posted'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationsPage;
