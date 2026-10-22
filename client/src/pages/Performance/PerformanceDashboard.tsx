import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    Star,
    Award,
    TrendingUp,
    Users,
    Clock,
    CheckCircle2,
    Plus,
    Search,
    Filter,
    ArrowUpRight,
    Sparkles,
    Calendar,
    RefreshCw,
    AlertCircle,
    X,
    Loader2,
    Building2,
    UserCheck,
    Check,
    Target,
    Compass,
    Sliders,
    MessageSquare,
    Edit3,
    Trash2
} from 'lucide-react';
import axios from 'axios';
import api from '../../utils/api';
import { usePermissions } from '../../hooks/usePermissions';
import type {
    IPerformanceReview,
    IPerformanceStats,
    ISmartGoal,
    ICompanyTarget,
    ReviewCycleType,
} from './types';
import {
    RATING_CONFIG,
    STATUS_CONFIG,
    CYCLE_CONFIG,
    MID_YEAR_STATUS_CONFIG,
    GOAL_STATUS_CONFIG,
} from './types';
import { PerformanceReviewModal } from './PerformanceReviewModal';
import { SmartGoalModal } from './SmartGoalModal';
import { CompanyTargetsModal } from './CompanyTargetsModal';
import AlertModal from '../../components/UI/AlertModal';

interface DropdownEmployee {
    value: string;
    label: string;
}

export const PerformanceDashboard: React.FC = () => {
    const { role, canCreateUser } = usePermissions();
    const isHrOrAdmin = canCreateUser(); // super-admin, admin, hr
    const isManager = role === 'manager';
    const isRegularEmployee = !isHrOrAdmin && !isManager;

    const currentYear = new Date().getFullYear();
    const [selectedYear, setSelectedYear] = useState<number>(currentYear);
    const [activeTab, setActiveTab] = useState<'GOALS' | 'REVIEWS'>('GOALS');
    const [selectedCycle, setSelectedCycle] = useState<string>('ALL');

    // Review filters & state
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [departmentFilter, setDepartmentFilter] = useState<string>('ALL');
    const [searchQuery, setSearchQuery] = useState<string>('');

    const [reviews, setReviews] = useState<IPerformanceReview[]>([]);
    const [myReview, setMyReview] = useState<IPerformanceReview | null>(null);
    const [stats, setStats] = useState<IPerformanceStats | null>(null);

    // SMART Goals state (Phase 1)
    const [goals, setGoals] = useState<ISmartGoal[]>([]);
    const [companyTargets, setCompanyTargets] = useState<ICompanyTarget[]>([]);
    const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
    const [activeGoalToEdit, setActiveGoalToEdit] = useState<ISmartGoal | null>(null);
    const [isCompanyTargetsModalOpen, setIsCompanyTargetsModalOpen] = useState(false);
    const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null);

    // Goal Progress Modal
    const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
    const [progressGoal, setProgressGoal] = useState<ISmartGoal | null>(null);
    const [progressValue, setProgressValue] = useState<number>(0);
    const [progressNotes, setProgressNotes] = useState<string>('');
    const [isSavingProgress, setIsSavingProgress] = useState(false);

    // HR Goal Decision Modal
    const [isHrDecisionModalOpen, setIsHrDecisionModalOpen] = useState(false);
    const [decisionGoal, setDecisionGoal] = useState<ISmartGoal | null>(null);
    const [decisionType, setDecisionType] = useState<'APPROVE' | 'RETURN_FOR_REVISION' | 'REJECT'>('APPROVE');
    const [decisionComments, setDecisionComments] = useState('');
    const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);

    const [loading, setLoading] = useState<boolean>(true);
    const [refreshing, setRefreshing] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // Alert Modal State
    const [alertConfig, setAlertConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string | React.ReactNode;
        type?: 'info' | 'success' | 'warning' | 'error' | 'confirm';
        onConfirm?: () => void;
        confirmText?: string;
        cancelText?: string;
        showCancel?: boolean;
    }>({
        isOpen: false,
        title: '',
        message: '',
        type: 'info',
    });

    // Appraisal Review Modal
    const [activeModalReview, setActiveModalReview] = useState<IPerformanceReview | null>(null);
    const [isReviewModalOpen, setIsReviewModalOpen] = useState<boolean>(false);

    // Initiate Cycle Modal
    const [isInitiateModalOpen, setIsInitiateModalOpen] = useState<boolean>(false);
    const [initiateYear, setInitiateYear] = useState<number>(currentYear);
    const [initiateCycleType, setInitiateCycleType] = useState<ReviewCycleType>('ANNUAL');
    const [initiateTitle, setInitiateTitle] = useState<string>(`Annual Performance Appraisal ${currentYear}`);
    const [initiateScope, setInitiateScope] = useState<'ALL' | 'CUSTOM'>('ALL');
    const [availableEmployees, setAvailableEmployees] = useState<DropdownEmployee[]>([]);
    const [employeeSearchInModal, setEmployeeSearchInModal] = useState<string>('');
    const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
    const [isInitiating, setIsInitiating] = useState<boolean>(false);
    const [initiateSuccess, setInitiateSuccess] = useState<string | null>(null);

    // Fetch All Data
    const fetchData = useCallback(async () => {
        setError(null);
        try {
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };

            // 1. Fetch Company Targets
            try {
                const ctRes = await axios.get(api.performanceCompanyTargets, {
                    headers,
                    params: { year: selectedYear },
                });
                setCompanyTargets(ctRes.data || []);
            } catch {
                setCompanyTargets([]);
            }

            // 2. Fetch SMART Goals
            try {
                const goalsRes = await axios.get(api.performanceGoals, {
                    headers,
                    params: {
                        cycleYear: selectedYear,
                        cycleType: selectedCycle !== 'ALL' ? selectedCycle : undefined,
                    },
                });
                setGoals(goalsRes.data || []);
            } catch {
                setGoals([]);
            }

            // 3. Fetch employee's personal active review
            try {
                const myRes = await axios.get(api.performanceMine, {
                    headers,
                    params: {
                        cycleYear: selectedYear,
                        cycleType: selectedCycle !== 'ALL' ? selectedCycle : undefined,
                    },
                });
                setMyReview(myRes.data);
            } catch {
                setMyReview(null);
            }

            // 4. Fetch full list of reviews
            const reviewsRes = await axios.get(api.performance, {
                headers,
                params: {
                    cycleYear: selectedYear,
                    cycleType: selectedCycle !== 'ALL' ? selectedCycle : undefined,
                    status: statusFilter !== 'ALL' ? statusFilter : undefined,
                },
            });
            setReviews(reviewsRes.data || []);

            // 5. Fetch stats if HR/Admin
            if (isHrOrAdmin) {
                try {
                    const statsRes = await axios.get(api.performanceStats, {
                        headers,
                        params: {
                            cycleYear: selectedYear,
                            cycleType: selectedCycle !== 'ALL' ? selectedCycle : undefined,
                        },
                    });
                    setStats(statsRes.data);
                } catch {
                    setStats(null);
                }
            }
        } catch (err) {
            const msg = axios.isAxiosError(err) ? err.response?.data?.message : (err instanceof Error ? err.message : 'Failed to load performance data');
            setError(msg || 'Failed to load performance data');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [selectedYear, selectedCycle, statusFilter, isHrOrAdmin]);

    useEffect(() => {
        setLoading(true);
        fetchData();
    }, [fetchData]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchData();
    };

    // Load employees for custom initiate scope
    useEffect(() => {
        if (isInitiateModalOpen && isHrOrAdmin && availableEmployees.length === 0) {
            const token = localStorage.getItem('token');
            axios.get(api.employeesDropdown, { headers: { Authorization: `Bearer ${token}` } })
                .then(res => setAvailableEmployees(res.data || []))
                .catch(() => {});
        }
    }, [isInitiateModalOpen, isHrOrAdmin, availableEmployees.length]);

    // Unique departments from loaded reviews
    const uniqueDepartments = useMemo(() => {
        const set = new Set<string>();
        reviews.forEach(r => {
            if (r.department && r.department.trim()) set.add(r.department.trim());
        });
        return Array.from(set).sort();
    }, [reviews]);

    // Filtered Reviews
    const filteredReviews = useMemo(() => {
        return reviews.filter(r => {
            if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
            if (departmentFilter !== 'ALL' && r.department !== departmentFilter) return false;
            if (!searchQuery.trim()) return true;

            const q = searchQuery.toLowerCase().trim();
            return (
                (r.employeeName || '').toLowerCase().includes(q) ||
                (r.employeeId || '').toLowerCase().includes(q) ||
                (r.department || '').toLowerCase().includes(q) ||
                (r.designation || '').toLowerCase().includes(q)
            );
        });
    }, [reviews, statusFilter, departmentFilter, searchQuery]);

    // Filtered SMART Goals
    const filteredGoals = useMemo(() => {
        return goals.filter(g => {
            if (statusFilter !== 'ALL' && g.status !== statusFilter) return false;
            if (!searchQuery.trim()) return true;

            const q = searchQuery.toLowerCase().trim();
            return (
                (g.title || '').toLowerCase().includes(q) ||
                (g.description || '').toLowerCase().includes(q) ||
                (g.employeeName || '').toLowerCase().includes(q) ||
                (g.employeeId || '').toLowerCase().includes(q) ||
                (g.companyTargetTitle || '').toLowerCase().includes(q)
            );
        });
    }, [goals, statusFilter, searchQuery]);

    // SMART Goals stats
    const goalStats = useMemo(() => {
        let approved = 0;
        let pendingHr = 0;
        let returned = 0;
        let aheadCount = 0;
        let onTrackCount = 0;
        let behindCount = 0;

        goals.forEach(g => {
            if (g.status === 'APPROVED') approved++;
            else if (g.status === 'PENDING_HR') pendingHr++;
            else if (g.status === 'RETURNED_FOR_REVISION') returned++;

            if (g.progressStatus === 'AHEAD') aheadCount++;
            else if (g.progressStatus === 'ON_TRACK') onTrackCount++;
            else if (g.progressStatus === 'BEHIND') behindCount++;
        });

        return {
            total: goals.length,
            approved,
            pendingHr,
            returned,
            aheadCount,
            onTrackCount,
            behindCount,
        };
    }, [goals]);

    // Initiate Cycle Submit
    const handleInitiateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsInitiating(true);
        setError(null);
        setInitiateSuccess(null);
        try {
            const token = localStorage.getItem('token');
            const payload: {
                cycleYear: number;
                cycleType: ReviewCycleType;
                cycleTitle: string;
                employeeIds?: string[];
            } = {
                cycleYear: initiateYear,
                cycleType: initiateCycleType,
                cycleTitle: initiateTitle.trim(),
            };
            if (initiateScope === 'CUSTOM' && selectedEmployeeIds.length > 0) {
                payload.employeeIds = selectedEmployeeIds;
            }

            const res = await axios.post(
                api.performanceInitiate,
                payload,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setInitiateSuccess(res.data.message || 'Cycle initiated successfully!');
            setTimeout(() => {
                setIsInitiateModalOpen(false);
                setInitiateSuccess(null);
                setSelectedEmployeeIds([]);
                setSelectedYear(initiateYear);
                setSelectedCycle(initiateCycleType);
                fetchData();
            }, 1200);
        } catch (err) {
            const msg = axios.isAxiosError(err) ? err.response?.data?.message : (err instanceof Error ? err.message : 'Failed to initiate cycle');
            setError(msg || 'Failed to initiate cycle');
        } finally {
            setIsInitiating(false);
        }
    };

    // Open Progress Modal
    const handleOpenProgress = (goal: ISmartGoal) => {
        setProgressGoal(goal);
        setProgressValue(goal.currentValue || 0);
        setProgressNotes('');
        setIsProgressModalOpen(true);
    };

    // Save Progress Submit
    const handleSaveProgress = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!progressGoal) return;
        setIsSavingProgress(true);
        setError(null);
        try {
            const token = localStorage.getItem('token');
            await axios.put(
                api.performanceGoalProgress(progressGoal._id),
                { currentValue: progressValue, progressNotes },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setIsProgressModalOpen(false);
            fetchData();
        } catch (err) {
            const msg = axios.isAxiosError(err) ? err.response?.data?.message : (err instanceof Error ? err.message : 'Failed to update progress');
            setError(msg || 'Failed to update progress');
        } finally {
            setIsSavingProgress(false);
        }
    };

    // Open HR Decision Modal
    const handleOpenHrDecision = (goal: ISmartGoal, type: 'APPROVE' | 'RETURN_FOR_REVISION' | 'REJECT') => {
        setDecisionGoal(goal);
        setDecisionType(type);
        setDecisionComments(
            type === 'APPROVE'
                ? 'Approved as SMART aligned goal.'
                : type === 'RETURN_FOR_REVISION'
                ? 'Please adjust target values to be realistic and provide phased milestones.'
                : 'Goal does not align with corporate priorities.'
        );
        setIsHrDecisionModalOpen(true);
    };

    // Submit HR Decision
    const handleSaveHrDecision = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!decisionGoal) return;
        setIsSubmittingDecision(true);
        setError(null);
        try {
            const token = localStorage.getItem('token');
            await axios.put(
                api.performanceGoalHrDecision(decisionGoal._id),
                { decision: decisionType, comments: decisionComments },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setIsHrDecisionModalOpen(false);
            fetchData();
        } catch (err) {
            const msg = axios.isAxiosError(err) ? err.response?.data?.message : (err instanceof Error ? err.message : 'Failed to save decision');
            setError(msg || 'Failed to save decision');
        } finally {
            setIsSubmittingDecision(false);
        }
    };

    const handleDeleteGoal = (goal: ISmartGoal) => {
        setAlertConfig({
            isOpen: true,
            title: 'Delete SMART Goal?',
            message: `Are you sure you want to permanently delete goal "${goal.title}"? This action cannot be undone.`,
            type: 'error',
            showCancel: true,
            confirmText: 'Yes, Delete',
            cancelText: 'Cancel',
            onConfirm: async () => {
                setDeletingGoalId(goal._id);
                setError(null);
                try {
                    const token = localStorage.getItem('token');
                    await axios.delete(api.performanceGoal(goal._id), {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    setGoals(prev => prev.filter(g => g._id !== goal._id));
                    setAlertConfig({
                        isOpen: true,
                        title: 'Goal Deleted',
                        message: `Goal "${goal.title}" has been deleted successfully.`,
                        type: 'success',
                        showCancel: false,
                        confirmText: 'OK',
                    });
                } catch (err) {
                    const msg = axios.isAxiosError(err) ? err.response?.data?.message : (err instanceof Error ? err.message : 'Failed to delete goal.');
                    setAlertConfig({
                        isOpen: true,
                        title: 'Delete Failed',
                        message: msg || 'Failed to delete goal.',
                        type: 'error',
                        showCancel: false,
                        confirmText: 'OK',
                    });
                } finally {
                    setDeletingGoalId(null);
                }
            },
        });
    };

    const openReviewModal = (rev: IPerformanceReview) => {
        setActiveModalReview(rev);
        setIsReviewModalOpen(true);
    };

    const modalFilteredEmployees = useMemo(() => {
        if (!employeeSearchInModal.trim()) return availableEmployees;
        const q = employeeSearchInModal.toLowerCase().trim();
        return availableEmployees.filter(emp => emp.label.toLowerCase().includes(q));
    }, [availableEmployees, employeeSearchInModal]);

    const toggleEmployeeSelection = (empId: string) => {
        setSelectedEmployeeIds(prev =>
            prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]
        );
    };

    return (
        <div className="space-y-6 pb-12 animate-in fade-in duration-200">
            {error && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-sm flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-2.5">
                        <AlertCircle size={18} className="shrink-0 text-rose-600" />
                        <span>{error}</span>
                    </div>
                    <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700 p-1">
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* Top Hero Banner (Styled consistently with Leave & Enterprise Dashboards) */}
            <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-violet-700 rounded-2xl sm:rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden shadow-2xl shadow-indigo-200/50">
                <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full blur-3xl translate-x-1/3 -translate-y-1/3 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-60 h-60 bg-white/10 rounded-full blur-2xl -translate-x-1/3 translate-y-1/3 pointer-events-none" />

                <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-2 mb-2 sm:mb-3">
                            <div className="p-1.5 sm:p-2 bg-white/20 backdrop-blur-md rounded-xl text-white shadow-xs">
                                <Target size={16} />
                            </div>
                            <span className="text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] text-white/70">
                                Strategic Performance & Appraisals
                            </span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                            Performance & Goals
                        </h1>
                        <p className="text-white/80 mt-1 max-w-xl text-xs sm:text-sm leading-relaxed">
                            Define SMART goals with AI compliance reviews, track mid-year milestones, and conduct structured joint appraisals.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                        {/* Year Selector */}
                        <div className="bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl sm:rounded-2xl px-3.5 py-2.5 flex items-center gap-2 text-xs text-white backdrop-blur-md transition-all shadow-xs">
                            <Calendar size={14} className="text-white/80" />
                            <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(Number(e.target.value))}
                                className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
                            >
                                {[currentYear, currentYear - 1, currentYear - 2].map((yr) => (
                                    <option key={yr} value={yr} className="bg-slate-800 text-white">
                                        Cycle {yr}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Refresh */}
                        <button
                            onClick={handleRefresh}
                            disabled={refreshing}
                            className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-md transition-all disabled:opacity-50 cursor-pointer shadow-xs"
                            title="Refresh Data"
                        >
                            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
                        </button>

                        {/* Define SMART Goal (Primary White Button) */}
                        <button
                            onClick={() => {
                                setActiveGoalToEdit(null);
                                setIsGoalModalOpen(true);
                            }}
                            className="bg-white text-indigo-600 px-5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl font-bold shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer active:scale-95 text-xs sm:text-sm"
                        >
                            <Plus size={18} strokeWidth={2.5} />
                            Define SMART Goal
                        </button>

                        {/* Company Strategic Anchors Button (HR/Admin) */}
                        {isHrOrAdmin && (
                            <button
                                onClick={() => setIsCompanyTargetsModalOpen(true)}
                                className="bg-white/10 hover:bg-white/20 border border-white/20 text-white px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl font-semibold backdrop-blur-md transition-all duration-300 flex items-center gap-2 cursor-pointer text-xs sm:text-sm shadow-xs"
                                title="Manage corporate anchors that appear in SMART goal dropdowns"
                            >
                                <Building2 size={16} />
                                Strategic Anchors
                            </button>
                        )}

                        {/* HR Initiate Cycle Button */}
                        {isHrOrAdmin && (
                            <button
                                onClick={() => setIsInitiateModalOpen(true)}
                                className="bg-white/10 hover:bg-white/20 border border-white/20 text-white px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl font-semibold backdrop-blur-md transition-all duration-300 flex items-center gap-2 cursor-pointer text-xs sm:text-sm shadow-xs"
                            >
                                <Award size={16} />
                                Initiate Cycle
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* 4 Rich KPI Metric Cards (Aligned with BalanceCard style) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {/* 1. Total SMART Goals */}
                <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-all group">
                    <div className="flex items-start justify-between mb-3">
                        <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600 group-hover:scale-110 transition-transform duration-300">
                            <Target size={22} />
                        </div>
                        <div className="text-right">
                            <span className="text-2xl font-bold text-slate-800">{goalStats.total}</span>
                            <span className="text-slate-400 text-xs block">SMART Goals</span>
                        </div>
                    </div>
                    <h3 className="font-bold text-slate-700 text-sm mb-0.5">Defined Goals</h3>
                    <p className="text-xs text-slate-400 mb-3.5">
                        {goalStats.approved} approved · {goalStats.pendingHr} in review
                    </p>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all duration-700"
                            style={{
                                width: `${goalStats.total > 0 ? Math.min(100, Math.round((goalStats.approved / goalStats.total) * 100)) : 0}%`,
                            }}
                        />
                    </div>
                </div>

                {/* 2. 10-Day SLA Review Queue */}
                <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-all group">
                    <div className="flex items-start justify-between mb-3">
                        <div className="p-3 rounded-xl bg-amber-50 text-amber-600 group-hover:scale-110 transition-transform duration-300">
                            <Clock size={22} />
                        </div>
                        <div className="text-right">
                            <span className="text-2xl font-bold text-amber-600">{goalStats.pendingHr}</span>
                            <span className="text-slate-400 text-xs block">Pending HR</span>
                        </div>
                    </div>
                    <h3 className="font-bold text-slate-700 text-sm mb-0.5">10-Day SLA Queue</h3>
                    <p className="text-xs text-slate-400 mb-3.5">
                        {goalStats.returned} returned for revision
                    </p>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-700"
                            style={{
                                width: `${goalStats.total > 0 ? Math.min(100, Math.round((goalStats.pendingHr / goalStats.total) * 100)) : 0}%`,
                            }}
                        />
                    </div>
                </div>

                {/* 3. Performance Trajectory */}
                <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-all group">
                    <div className="flex items-start justify-between mb-3">
                        <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600 group-hover:scale-110 transition-transform duration-300">
                            <TrendingUp size={22} />
                        </div>
                        <div className="text-right">
                            <span className="text-2xl font-bold text-emerald-600">{goalStats.aheadCount}</span>
                            <span className="text-slate-400 text-xs block">Ahead Target</span>
                        </div>
                    </div>
                    <h3 className="font-bold text-slate-700 text-sm mb-0.5">Mid-Year Trajectory</h3>
                    <p className="text-xs text-slate-400 mb-3.5">
                        {goalStats.onTrackCount} on track · {goalStats.behindCount} behind
                    </p>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-emerald-500 to-teal-600 rounded-full transition-all duration-700"
                            style={{
                                width: `${goalStats.total > 0 ? Math.min(100, Math.round(((goalStats.aheadCount + goalStats.onTrackCount) / goalStats.total) * 100)) : 0}%`,
                            }}
                        />
                    </div>
                </div>

                {/* 4. Active Appraisal Reviews */}
                <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-all group">
                    <div className="flex items-start justify-between mb-3">
                        <div className="p-3 rounded-xl bg-purple-50 text-purple-600 group-hover:scale-110 transition-transform duration-300">
                            <Award size={22} />
                        </div>
                        <div className="text-right">
                            <span className="text-2xl font-bold text-purple-600">{reviews.length}</span>
                            <span className="text-slate-400 text-xs block">Reviews</span>
                        </div>
                    </div>
                    <h3 className="font-bold text-slate-700 text-sm mb-0.5">Appraisal Reviews</h3>
                    <p className="text-xs text-slate-400 mb-3.5">
                        {stats?.closed || 0} completed · {(stats?.completionRate || 0).toFixed(0)}% completion rate
                    </p>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-purple-500 to-indigo-600 rounded-full transition-all duration-700"
                            style={{ width: `${Math.min(100, Math.round(stats?.completionRate || 0))}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Corporate Strategic Anchors Card */}
            <div className="bg-gradient-to-r from-indigo-50/70 via-purple-50/40 to-slate-50 border border-indigo-100/90 rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-3.5">
                    <div className="p-3 rounded-2xl bg-indigo-600 text-white shrink-0 shadow-md shadow-indigo-200">
                        <Compass size={20} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h3 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide">
                                Corporate Strategic Anchors ({selectedYear})
                            </h3>
                            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100/80 px-2.5 py-0.5 rounded-full border border-indigo-200">
                                {companyTargets.length} Active {companyTargets.length === 1 ? 'Target' : 'Targets'}
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                            Every employee SMART goal is anchored to these organizational priorities for {selectedYear}.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                    {companyTargets.length > 0 ? (
                        companyTargets.slice(0, 3).map((ct) => (
                            <div
                                key={ct._id}
                                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-white border border-slate-200/90 text-slate-800 shadow-xs flex items-center gap-2 hover:border-indigo-200 transition-colors"
                            >
                                <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" />
                                {ct.targetMetric && (
                                    <span className="font-bold text-indigo-950 bg-indigo-50 px-1.5 py-0.5 rounded text-[11px]">
                                        {ct.targetMetric}
                                    </span>
                                )}
                                <span className="truncate max-w-[220px] font-medium">{ct.title}</span>
                            </div>
                        ))
                    ) : (
                        <div className="text-xs text-slate-400 italic bg-white/70 px-3 py-1.5 rounded-xl border border-dashed border-slate-200">
                            No corporate targets set for {selectedYear} yet.
                        </div>
                    )}
                    {isHrOrAdmin && (
                        <button
                            onClick={() => setIsCompanyTargetsModalOpen(true)}
                            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-white hover:bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        >
                            <Building2 size={13} />
                            Manage Anchors →
                        </button>
                    )}
                </div>
            </div>

            {/* Main Content Area: Unified Container with Tabs & Calendar */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                {/* Navigation Header */}
                <div className="border-b border-slate-100 p-4 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    {/* Primary Tabs */}
                    <div className="flex items-center gap-6 pb-1">
                        <button
                            onClick={() => setActiveTab('GOALS')}
                            className={`pb-1 text-sm font-bold transition-all duration-300 relative whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer ${
                                activeTab === 'GOALS' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
                            }`}
                        >
                            <Target size={16} />
                            SMART Goals (Phase 1)
                            <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    activeTab === 'GOALS' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'
                                }`}
                            >
                                {goals.length}
                            </span>
                            {activeTab === 'GOALS' && (
                                <div className="absolute -bottom-1 left-0 right-0 h-1 bg-indigo-600 rounded-full shadow-lg shadow-indigo-100" />
                            )}
                        </button>

                        <button
                            onClick={() => setActiveTab('REVIEWS')}
                            className={`pb-1 text-sm font-bold transition-all duration-300 relative whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer ${
                                activeTab === 'REVIEWS' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
                            }`}
                        >
                            <Award size={16} />
                            Appraisal Reviews & 1-on-1 (Phase 2)
                            <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    activeTab === 'REVIEWS' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'
                                }`}
                            >
                                {reviews.length}
                            </span>
                            {activeTab === 'REVIEWS' && (
                                <div className="absolute -bottom-1 left-0 right-0 h-1 bg-indigo-600 rounded-full shadow-lg shadow-indigo-100" />
                            )}
                        </button>
                    </div>

                    {/* Cycle Filter Segmented Control */}
                    <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-2xl text-xs font-semibold text-slate-700 self-start md:self-auto">
                        <span className="px-2 text-slate-400 text-[11px] uppercase tracking-wider flex items-center gap-1 font-bold">
                            <Calendar size={12} /> Cycle:
                        </span>
                        {(['ALL', 'Q1', 'MID_YEAR', 'Q3', 'ANNUAL'] as const).map((cycleKey) => (
                            <button
                                key={cycleKey}
                                onClick={() => setSelectedCycle(cycleKey)}
                                className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                                    selectedCycle === cycleKey
                                        ? 'bg-white text-indigo-700 shadow-xs font-bold'
                                        : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                {cycleKey === 'ALL'
                                    ? 'All Cycles'
                                    : cycleKey === 'MID_YEAR'
                                    ? 'Mid-Year (H1)'
                                    : cycleKey === 'Q1'
                                    ? 'Q1'
                                    : cycleKey === 'Q3'
                                    ? 'Q3 (9-Mo)'
                                    : 'Annual'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Tab 1: SMART Goals Content */}
                {activeTab === 'GOALS' && (
                    <div className="p-4 sm:p-6 space-y-6">
                        {/* Search & Filter Toolbar */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80">
                            <div className="relative flex-1">
                                <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Search SMART goals by title, metric, staff name, or company anchor..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-9 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-2xs"
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                                    >
                                        <X size={15} />
                                    </button>
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-700 focus:outline-none cursor-pointer shadow-2xs font-medium"
                                >
                                    <option value="ALL">All Goal Statuses</option>
                                    <option value="APPROVED">Approved (Locked)</option>
                                    <option value="PENDING_HR">Pending HR Review (10-Day SLA)</option>
                                    <option value="RETURNED_FOR_REVISION">Returned for Revision</option>
                                    <option value="REJECTED">Rejected</option>
                                </select>
                            </div>
                        </div>

                        {/* Goals Grid */}
                        {loading ? (
                            <div className="py-20 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                                <Loader2 size={22} className="animate-spin text-indigo-600" />
                                <span className="font-medium">Loading SMART goals...</span>
                            </div>
                        ) : filteredGoals.length === 0 ? (
                            <div className="py-14 sm:py-16 text-center space-y-6 max-w-xl mx-auto bg-gradient-to-b from-slate-50/60 via-indigo-50/20 to-transparent border border-dashed border-slate-200 rounded-3xl p-6 sm:p-10 my-4">
                                <div className="relative w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-xl shadow-indigo-200/50">
                                    <Target size={34} />
                                    <div className="absolute -top-1.5 -right-1.5 p-1.5 bg-amber-400 text-amber-950 rounded-xl shadow-md">
                                        <Sparkles size={14} />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-lg font-bold text-slate-800">
                                        {searchQuery || statusFilter !== 'ALL' || selectedCycle !== 'ALL'
                                            ? 'No SMART Goals Match Your Filters'
                                            : `Set Up SMART Goals for ${selectedYear}`}
                                    </h3>
                                    <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                                        {searchQuery || statusFilter !== 'ALL' || selectedCycle !== 'ALL'
                                            ? 'Try resetting your search query or selecting a different status/cycle.'
                                            : 'Define Specific, Measurable, Attainable, Realistic, and Time-bound objectives aligned with corporate anchors. Every goal is verified by Gemini AI and reviewed by HR.'}
                                    </p>
                                </div>

                                {!searchQuery && statusFilter === 'ALL' && (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-left">
                                        <div className="bg-white/80 p-3 rounded-2xl border border-slate-200/80 shadow-2xs space-y-1">
                                            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-600">
                                                <Sparkles size={13} />
                                                Gemini AI Audit
                                            </div>
                                            <p className="text-[11px] text-slate-500 leading-snug">Instant compliance score and sanity checks</p>
                                        </div>
                                        <div className="bg-white/80 p-3 rounded-2xl border border-slate-200/80 shadow-2xs space-y-1">
                                            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600">
                                                <Clock size={13} />
                                                10-Day SLA Queue
                                            </div>
                                            <p className="text-[11px] text-slate-500 leading-snug">Dedicated HR review and approval SLA</p>
                                        </div>
                                        <div className="bg-white/80 p-3 rounded-2xl border border-slate-200/80 shadow-2xs space-y-1">
                                            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                                                <TrendingUp size={13} />
                                                Mid-Year Tracking
                                            </div>
                                            <p className="text-[11px] text-slate-500 leading-snug">Ahead, On-Track, or Behind indicators</p>
                                        </div>
                                    </div>
                                )}

                                <div className="pt-2">
                                    <button
                                        onClick={() => {
                                            setActiveGoalToEdit(null);
                                            setIsGoalModalOpen(true);
                                        }}
                                        className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-6 py-3 rounded-2xl font-bold shadow-lg shadow-indigo-200/50 hover:shadow-xl hover:-translate-y-0.5 transition-all text-xs sm:text-sm inline-flex items-center gap-2 cursor-pointer active:scale-95"
                                    >
                                        <Plus size={16} strokeWidth={2.5} />
                                        Define Your First SMART Goal
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                {filteredGoals.map((g) => {
                                    const progressCfg = MID_YEAR_STATUS_CONFIG[g.progressStatus];
                                    const statusCfg = GOAL_STATUS_CONFIG[g.status];

                                    // Compute remaining SLA days for HR review
                                    const now = new Date().getTime();
                                    const deadlineTime = g.hrReview?.deadline ? new Date(g.hrReview.deadline).getTime() : now;
                                    const daysRemaining = Math.ceil((deadlineTime - now) / (1000 * 60 * 60 * 24));
                                    const isSlaBreached = daysRemaining < 0;

                                    return (
                                        <div
                                            key={g._id}
                                            className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all space-y-4 flex flex-col justify-between"
                                        >
                                            <div className="space-y-2.5">
                                                {/* Header row: Status badges & SLA badge */}
                                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                                    <div className="flex items-center gap-2">
                                                        <span
                                                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statusCfg.badge}`}
                                                        >
                                                            {statusCfg.label}
                                                        </span>
                                                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                                            {CYCLE_CONFIG[g.cycleType]?.short || g.cycleType}
                                                        </span>
                                                    </div>

                                                    {/* 10-Day SLA Countdown badge for HR review */}
                                                    {g.status === 'PENDING_HR' && (
                                                        <span
                                                            className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                                                isSlaBreached
                                                                    ? 'bg-rose-50 text-rose-700 border-rose-300'
                                                                    : daysRemaining <= 3
                                                                    ? 'bg-amber-50 text-amber-700 border-amber-300'
                                                                    : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                                            }`}
                                                            title={`HR SLA Deadline: ${new Date(g.hrReview.deadline).toLocaleDateString()}`}
                                                        >
                                                            <Clock size={11} />
                                                            {isSlaBreached
                                                                ? `SLA Breached (${Math.abs(daysRemaining)}d overdue)`
                                                                : `${daysRemaining}d Left in HR SLA`}
                                                        </span>
                                                    )}
                                                </div>

                                                <div>
                                                    <h3 className="text-sm font-bold text-slate-900 leading-snug">
                                                        {g.title}
                                                    </h3>
                                                    <p className="text-xs text-slate-500 line-clamp-2 mt-1 leading-relaxed">
                                                        {g.description}
                                                    </p>
                                                </div>

                                                {/* Strategic Anchor Tag */}
                                                {g.companyTargetTitle && (
                                                    <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-900 bg-indigo-50/80 px-2.5 py-1 rounded-lg border border-indigo-100 max-w-full truncate">
                                                        <Compass size={12} className="text-indigo-600 shrink-0" />
                                                        <span className="truncate">Aligned: {g.companyTargetTitle}</span>
                                                    </div>
                                                )}

                                                {/* Measurable Progress Bar (Mid-year comparative indicator) */}
                                                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-2">
                                                    <div className="flex items-center justify-between text-xs">
                                                        <span className="font-semibold text-slate-700">
                                                            Actual: {g.currentValue} {g.unit || ''} / Target: {g.targetValue} {g.unit || ''}
                                                        </span>
                                                        <span
                                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${progressCfg.badge}`}
                                                        >
                                                            <span className={`w-1.5 h-1.5 rounded-full ${progressCfg.dot}`} />
                                                            {progressCfg.label} ({g.progressPercentage}%)
                                                        </span>
                                                    </div>

                                                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-500 ${
                                                                g.progressStatus === 'AHEAD'
                                                                    ? 'bg-emerald-500'
                                                                    : g.progressStatus === 'BEHIND'
                                                                    ? 'bg-rose-500'
                                                                    : 'bg-indigo-600'
                                                            }`}
                                                            style={{ width: `${Math.min(100, g.progressPercentage)}%` }}
                                                        />
                                                    </div>

                                                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                                                        <span>Baseline: {g.baselineValue} {g.unit || ''}</span>
                                                        <span>Due: {new Date(g.targetDate).toLocaleDateString()}</span>
                                                    </div>
                                                </div>

                                                {/* AI Pre-Review Audit Snapshot */}
                                                {g.aiReview && (
                                                    <div className="text-[11px] bg-purple-50/70 border border-purple-100 p-2.5 rounded-xl text-purple-900 flex items-start gap-2">
                                                        <Sparkles size={14} className="text-purple-600 shrink-0 mt-0.5" />
                                                        <div className="space-y-0.5 flex-1">
                                                            <div className="flex items-center justify-between">
                                                                <span className="font-bold text-purple-950">
                                                                    AI Audit Score: {g.aiReview.complianceScore}/100
                                                                </span>
                                                                <span className="text-[10px] font-bold text-purple-700">
                                                                    {g.aiReview.feasibility}
                                                                </span>
                                                            </div>
                                                            <p className="text-purple-900/80 text-[11px] line-clamp-2">
                                                                {g.aiReview.feedback}
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* HR Comments if returned */}
                                                {g.status === 'RETURNED_FOR_REVISION' && g.hrReview?.comments && (
                                                    <div className="text-[11px] bg-orange-50 border border-orange-200 p-2.5 rounded-xl text-orange-900">
                                                        <strong>HR Feedback:</strong> {g.hrReview.comments}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                                                <div className="text-[11px] text-slate-400">
                                                    Staff: {g.employeeName} ({g.employeeId})
                                                </div>

                                                <div className="flex items-center gap-1.5">
                                                    {/* Update Progress Button */}
                                                    <button
                                                        onClick={() => handleOpenProgress(g)}
                                                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
                                                        title="Update progress / mid-year actuals"
                                                    >
                                                        <Sliders size={13} />
                                                        Progress
                                                    </button>

                                                    {/* Edit / Resubmit button */}
                                                    {(g.status !== 'APPROVED' || isHrOrAdmin) && (
                                                        <button
                                                            onClick={() => {
                                                                setActiveGoalToEdit(g);
                                                                setIsGoalModalOpen(true);
                                                            }}
                                                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                                                                g.status === 'RETURNED_FOR_REVISION'
                                                                    ? 'text-orange-700 bg-orange-100 hover:bg-orange-200'
                                                                    : 'text-slate-600 bg-slate-100 hover:bg-slate-200'
                                                            }`}
                                                            title={g.status === 'RETURNED_FOR_REVISION' ? 'Revise and resubmit' : 'Edit goal'}
                                                        >
                                                            <Edit3 size={13} />
                                                            {g.status === 'RETURNED_FOR_REVISION' ? 'Resubmit' : 'Edit'}
                                                        </button>
                                                    )}

                                                    {/* Delete Goal Button */}
                                                    <button
                                                        onClick={() => handleDeleteGoal(g)}
                                                        disabled={deletingGoalId === g._id}
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-50"
                                                        title="Delete this SMART goal"
                                                    >
                                                        {deletingGoalId === g._id ? (
                                                            <Loader2 size={13} className="animate-spin text-rose-500" />
                                                        ) : (
                                                            <Trash2 size={13} />
                                                        )}
                                                    </button>

                                                    {/* HR Review Decision Buttons (If HR and Pending) */}
                                                    {isHrOrAdmin && g.status === 'PENDING_HR' && (
                                                        <>
                                                            <button
                                                                onClick={() => handleOpenHrDecision(g, 'RETURN_FOR_REVISION')}
                                                                className="px-2 py-1.5 rounded-lg text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 transition-colors cursor-pointer"
                                                                title="Return for revision with comments"
                                                            >
                                                                Revise
                                                            </button>

                                                            <button
                                                                onClick={() => handleOpenHrDecision(g, 'APPROVE')}
                                                                className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors flex items-center gap-1 cursor-pointer shadow-xs"
                                                            >
                                                                <Check size={13} />
                                                                Approve
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* TAB 2: REVIEW CYCLES, JOINT ASSESSMENTS & SALARY ENGINE */}
            {activeTab === 'REVIEWS' && (
                <div className="space-y-6">
                    {/* Logged-In User Personal Active Review Card */}
                    {myReview ? (
                        <div className="bg-gradient-to-r from-indigo-50/90 via-purple-50/50 to-white border border-indigo-200/90 rounded-2xl sm:rounded-3xl p-6 sm:p-7 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
                            <div className="flex items-start sm:items-center gap-4 relative z-10">
                                <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200 flex items-center justify-center shrink-0">
                                    <Award size={26} />
                                </div>
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-2.5 flex-wrap">
                                        <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                                            Your Active Appraisal: {myReview.cycleTitle}
                                        </h3>
                                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${STATUS_CONFIG[myReview.status]?.style}`}>
                                            {STATUS_CONFIG[myReview.status]?.label}
                                        </span>
                                    </div>
                                    <p className="text-xs sm:text-sm text-slate-600 max-w-2xl leading-relaxed">
                                        {myReview.status === 'PENDING_SELF_ASSESSMENT'
                                            ? 'Stage 1 Open: Complete your self-assessment ratings and defense notes to prepare for your 1-on-1 joint evaluation.'
                                            : myReview.status === 'SUBMITTED_FOR_REVIEW'
                                            ? 'Your self-assessment is submitted! Ready for your scheduled 1-on-1 sit-down review with management.'
                                            : 'Your appraisal review cycle is complete. View your final ratings, feedback, and salary revisions.'}
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={() => openReviewModal(myReview)}
                                className="px-6 py-3 rounded-2xl text-xs sm:text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200 hover:shadow-lg active:scale-95 flex items-center gap-2 self-start md:self-auto transition-all shrink-0 cursor-pointer relative z-10"
                            >
                                {myReview.status === 'PENDING_SELF_ASSESSMENT' ? 'Complete Self-Assessment' : 'View My Appraisal'}
                                <ArrowUpRight size={16} />
                            </button>
                        </div>
                    ) : isRegularEmployee && !loading && (
                        <div className="bg-white border border-slate-200/80 rounded-2xl sm:rounded-3xl p-6 shadow-sm flex items-center gap-4 text-slate-600">
                            <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                                <Clock size={24} />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-slate-800">No Active Appraisal Assigned for {selectedYear}</h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Your HR department has not initiated an evaluation cycle for your profile yet. You will be notified as soon as it opens.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* HR KPI Stat Cards */}
                    {isHrOrAdmin && stats && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex items-center gap-4">
                                <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600">
                                    <Users size={22} />
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 font-medium">Total Assigned</p>
                                    <p className="text-xl font-bold text-slate-800">{stats.totalAssigned}</p>
                                    <span className="text-[10px] text-slate-400">Eligible staff</span>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex items-center gap-4">
                                <div className="p-3 rounded-xl bg-amber-50 text-amber-600">
                                    <Clock size={22} />
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 font-medium">Pending Self-Review</p>
                                    <p className="text-xl font-bold text-amber-600">{stats.pendingSelfReview}</p>
                                    <span className="text-[10px] text-slate-400">Awaiting defense</span>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex items-center gap-4">
                                <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
                                    <Star size={22} />
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 font-medium">Submitted (1-on-1 Ready)</p>
                                    <p className="text-xl font-bold text-blue-600">{stats.submittedForReview}</p>
                                    <span className="text-[10px] text-slate-400">Ready for sit-down</span>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex items-center gap-4">
                                <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600">
                                    <CheckCircle2 size={22} />
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 font-medium">Finalized & Closed</p>
                                    <p className="text-xl font-bold text-emerald-600">{stats.closed} ({stats.completionRate}%)</p>
                                    <span className="text-[10px] text-slate-400">Salary synced</span>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex items-center gap-4 sm:col-span-2 lg:col-span-1">
                                <div className="p-3 rounded-xl bg-purple-50 text-purple-600">
                                    <TrendingUp size={22} />
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 font-medium">Avg Increment</p>
                                    <p className="text-xl font-bold text-slate-800">+{stats.avgIncrementPct}%</p>
                                    <span className="text-[10px] text-slate-400">PKR {stats.totalIncrementAmount.toLocaleString()} impact</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Reviews Table Card */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden p-6 space-y-5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-base font-bold text-slate-800">
                                        {isRegularEmployee
                                            ? 'My Appraisal Records'
                                            : isManager
                                            ? 'Team Appraisal Reviews'
                                            : 'Organization Appraisal Records'}
                                    </h2>
                                    {isManager && (
                                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                            Direct Reports
                                        </span>
                                    )}
                                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                                        {filteredReviews.length} Records
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Four-point scale: Need Improvement / Below Expectation, Meets Expectation, Exceeds Expectation, Outstanding.
                                </p>
                            </div>
                        </div>

                        {/* Search & Filter Toolbar */}
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/80 p-3 rounded-xl border border-slate-200/80">
                            <div className="relative flex-1">
                                <Search size={16} className="absolute left-3.5 top-2.5 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Search by employee name, ID, department, or designation..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-9 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-xs"
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                                    >
                                        <X size={15} />
                                    </button>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2.5">
                                {!isRegularEmployee && uniqueDepartments.length > 0 && (
                                    <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-xs">
                                        <Building2 size={13} className="text-slate-400" />
                                        <select
                                            value={departmentFilter}
                                            onChange={(e) => setDepartmentFilter(e.target.value)}
                                            className="bg-transparent text-xs text-slate-700 font-medium focus:outline-none cursor-pointer"
                                        >
                                            <option value="ALL">All Departments</option>
                                            {uniqueDepartments.map(dept => (
                                                <option key={dept} value={dept}>{dept}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-xs">
                                    <Filter size={13} className="text-slate-400" />
                                    <select
                                        value={statusFilter}
                                        onChange={(e) => setStatusFilter(e.target.value)}
                                        className="bg-transparent text-xs text-slate-700 font-medium focus:outline-none cursor-pointer"
                                    >
                                        <option value="ALL">All Statuses</option>
                                        <option value="PENDING_SELF_ASSESSMENT">Pending Self-Review</option>
                                        <option value="SUBMITTED_FOR_REVIEW">Submitted for 1-on-1</option>
                                        <option value="CLOSED">Finalized & Closed</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Table */}
                        {loading ? (
                            <div className="py-20 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                                <Loader2 size={20} className="animate-spin text-indigo-500" />
                                Loading performance appraisals...
                            </div>
                        ) : filteredReviews.length === 0 ? (
                            <div className="py-16 text-center text-slate-400 text-xs space-y-2">
                                <Award size={36} className="mx-auto text-slate-300" />
                                <p className="text-slate-600 font-medium">No appraisal reviews found</p>
                                <p className="text-slate-400 text-xs">No records matched the current cycle and filter selection.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-slate-100">
                                <table className="w-full text-left border-collapse text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                            <th className="py-3.5 px-4">Employee</th>
                                            <th className="py-3.5 px-4">Cycle</th>
                                            <th className="py-3.5 px-4">Self-Rating</th>
                                            <th className="py-3.5 px-4">Final Rating</th>
                                            <th className="py-3.5 px-4">Status</th>
                                            {isHrOrAdmin && <th className="py-3.5 px-4">Increment</th>}
                                            <th className="py-3.5 px-4 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                                        {filteredReviews.map((r) => {
                                            const selfRatingCfg = r.selfAssessment?.rating ? RATING_CONFIG[r.selfAssessment.rating] : null;
                                            const finalRatingCfg = r.hrAssessment?.finalRating ? RATING_CONFIG[r.hrAssessment.finalRating] : null;
                                            return (
                                                <tr key={r._id} className="hover:bg-slate-50/80 transition-colors">
                                                    <td className="py-3.5 px-4 font-semibold text-slate-900">
                                                        <div>{r.employeeName}</div>
                                                        <div className="text-[11px] text-slate-400 font-normal">{r.employeeId} • {r.department || 'Staff'}</div>
                                                    </td>
                                                    <td className="py-3.5 px-4">
                                                        <span className="font-semibold text-slate-700">
                                                            {r.cycleType ? CYCLE_CONFIG[r.cycleType]?.short : 'Annual'}
                                                        </span>
                                                    </td>
                                                    <td className="py-3.5 px-4">
                                                        {selfRatingCfg ? (
                                                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg border text-[11px] font-semibold ${selfRatingCfg.badge}`}>
                                                                <Star size={10} />
                                                                {selfRatingCfg.label}
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-400 italic text-[11px]">Pending</span>
                                                        )}
                                                    </td>
                                                    <td className="py-3.5 px-4">
                                                        {finalRatingCfg ? (
                                                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg border text-[11px] font-semibold ${finalRatingCfg.badge}`}>
                                                                <Award size={10} />
                                                                {finalRatingCfg.label}
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-300 italic text-[11px]">—</span>
                                                        )}
                                                    </td>
                                                    <td className="py-3.5 px-4">
                                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${STATUS_CONFIG[r.status]?.style}`}>
                                                            {STATUS_CONFIG[r.status]?.label}
                                                        </span>
                                                    </td>
                                                    {isHrOrAdmin && (
                                                        <td className="py-3.5 px-4">
                                                            {r.compensationRevision?.incrementPercentage ? (
                                                                <span className="text-emerald-600 font-bold">
                                                                    +{r.compensationRevision.incrementPercentage}%
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-400">—</span>
                                                            )}
                                                        </td>
                                                    )}
                                                    <td className="py-3.5 px-4 text-right">
                                                        <button
                                                            onClick={() => openReviewModal(r)}
                                                            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors cursor-pointer"
                                                        >
                                                            {r.status === 'CLOSED'
                                                                ? 'View Summary'
                                                                : isHrOrAdmin
                                                                ? 'Conduct 1-on-1'
                                                                : isManager
                                                                ? 'Review Team Member'
                                                                : 'Review / Defense'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* PROGRESS UPDATE MODAL (Mid-Year Actuals) */}
            {isProgressModalOpen && progressGoal &&
                createPortal(
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md p-6 space-y-4">
                            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                                    <Sliders size={18} className="text-indigo-600" />
                                    Update Goal Progress
                                </h3>
                                <button
                                    onClick={() => setIsProgressModalOpen(false)}
                                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <form onSubmit={handleSaveProgress} className="space-y-4">
                                <div className="space-y-1">
                                    <span className="text-xs text-slate-500 font-semibold">Goal</span>
                                    <p className="text-sm font-bold text-slate-900">{progressGoal.title}</p>
                                    <p className="text-xs text-indigo-600">
                                        Target: {progressGoal.targetValue} {progressGoal.unit || ''} (Baseline: {progressGoal.baselineValue} {progressGoal.unit || ''})
                                    </p>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-700">Current Actual Value</label>
                                    <input
                                        type="number"
                                        value={progressValue}
                                        onChange={(e) => setProgressValue(Number(e.target.value))}
                                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                        required
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-700">Progress Notes / Milestones Met</label>
                                    <textarea
                                        rows={3}
                                        value={progressNotes}
                                        onChange={(e) => setProgressNotes(e.target.value)}
                                        placeholder="Explain actual deliverables completed, client engagements, or milestones met..."
                                        className="w-full border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none"
                                    />
                                </div>

                                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                                    <button
                                        type="button"
                                        onClick={() => setIsProgressModalOpen(false)}
                                        className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSavingProgress}
                                        className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md flex items-center gap-1.5 cursor-pointer"
                                    >
                                        {isSavingProgress ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                        Save Progress
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>,
                    document.body
                )}

            {/* HR GOAL REVIEW DECISION MODAL */}
            {isHrDecisionModalOpen && decisionGoal &&
                createPortal(
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md p-6 space-y-4">
                            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                                    <MessageSquare size={18} className="text-indigo-600" />
                                    HR Goal Review Decision
                                </h3>
                                <button
                                    onClick={() => setIsHrDecisionModalOpen(false)}
                                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <form onSubmit={handleSaveHrDecision} className="space-y-4">
                                <div className="space-y-1">
                                    <span className="text-xs text-slate-400 font-semibold">Goal</span>
                                    <p className="text-sm font-bold text-slate-900">{decisionGoal.title}</p>
                                    <p className="text-xs text-slate-500">
                                        Submitted by: {decisionGoal.employeeName} ({decisionGoal.employeeId})
                                    </p>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-700">Decision</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {(['APPROVE', 'RETURN_FOR_REVISION', 'REJECT'] as const).map((d) => (
                                            <button
                                                type="button"
                                                key={d}
                                                onClick={() => setDecisionType(d)}
                                                className={`p-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                                                    decisionType === d
                                                        ? d === 'APPROVE'
                                                            ? 'bg-emerald-50 border-emerald-400 text-emerald-700 ring-2 ring-emerald-500/20'
                                                            : d === 'RETURN_FOR_REVISION'
                                                            ? 'bg-orange-50 border-orange-400 text-orange-700 ring-2 ring-orange-500/20'
                                                            : 'bg-rose-50 border-rose-400 text-rose-700 ring-2 ring-rose-500/20'
                                                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                                }`}
                                            >
                                                {d === 'APPROVE' ? 'Approve' : d === 'RETURN_FOR_REVISION' ? 'Return' : 'Reject'}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-700">HR Review Comments / Feedback</label>
                                    <textarea
                                        rows={3}
                                        value={decisionComments}
                                        onChange={(e) => setDecisionComments(e.target.value)}
                                        placeholder="Explain decision, feedback on feasibility, or requested adjustments..."
                                        className="w-full border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none"
                                        required
                                    />
                                </div>

                                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                                    <button
                                        type="button"
                                        onClick={() => setIsHrDecisionModalOpen(false)}
                                        className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmittingDecision}
                                        className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md flex items-center gap-1.5 cursor-pointer"
                                    >
                                        {isSubmittingDecision ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                        Confirm Decision
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>,
                    document.body
                )}

            {/* INITIATE CYCLE MODAL */}
            {isInitiateModalOpen &&
                createPortal(
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg p-6 space-y-4 max-h-[92vh] overflow-y-auto">
                            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                                    <Plus size={18} className="text-indigo-600" />
                                    Initiate Performance Review Cycle
                                </h3>
                                <button
                                    onClick={() => setIsInitiateModalOpen(false)}
                                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {initiateSuccess && (
                                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs flex items-center gap-2">
                                    <CheckCircle2 size={16} />
                                    <span>{initiateSuccess}</span>
                                </div>
                            )}

                            <form onSubmit={handleInitiateSubmit} className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-slate-600">Cycle Year</label>
                                        <input
                                            type="number"
                                            min={2020}
                                            max={2040}
                                            value={initiateYear}
                                            onChange={(e) => setInitiateYear(Number(e.target.value))}
                                            className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-800 focus:outline-none"
                                            required
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-slate-600">Review Cycle Type</label>
                                        <select
                                            value={initiateCycleType}
                                            onChange={(e) => {
                                                const ct = e.target.value as ReviewCycleType;
                                                setInitiateCycleType(ct);
                                                setInitiateTitle(`${CYCLE_CONFIG[ct]?.label || ct} ${initiateYear}`);
                                            }}
                                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none cursor-pointer"
                                        >
                                            <option value="ANNUAL">Annual Review (Full Year)</option>
                                            <option value="MID_YEAR">Mid-Year Review (H1 Jan–Jun)</option>
                                            <option value="Q1">Q1 Review Cycle</option>
                                            <option value="Q3">Nine-Month Review Cycle (Q3)</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-600">Cycle Title</label>
                                    <input
                                        type="text"
                                        value={initiateTitle}
                                        onChange={(e) => setInitiateTitle(e.target.value)}
                                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-800 focus:outline-none"
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-slate-600 block">Target Scope</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setInitiateScope('ALL')}
                                            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                                                initiateScope === 'ALL'
                                                    ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-500/20 text-indigo-900 font-semibold'
                                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                            }`}
                                        >
                                            <div className="flex items-center gap-1.5 text-xs font-bold mb-0.5">
                                                <Users size={14} />
                                                All Active Employees
                                            </div>
                                            <p className="text-[11px] text-slate-400">Company-wide assignment</p>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setInitiateScope('CUSTOM')}
                                            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                                                initiateScope === 'CUSTOM'
                                                    ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-500/20 text-indigo-900 font-semibold'
                                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                            }`}
                                        >
                                            <div className="flex items-center gap-1.5 text-xs font-bold mb-0.5">
                                                <UserCheck size={14} />
                                                Select Specific Staff
                                            </div>
                                            <p className="text-[11px] text-slate-400">Choose individual team members</p>
                                        </button>
                                    </div>
                                </div>

                                {initiateScope === 'CUSTOM' && (
                                    <div className="space-y-2 bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                                        <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                                            <span>Select Staff ({selectedEmployeeIds.length} selected)</span>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedEmployeeIds([])}
                                                className="text-slate-400 hover:text-slate-600"
                                            >
                                                Clear
                                            </button>
                                        </div>

                                        <div className="relative">
                                            <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                                            <input
                                                type="text"
                                                placeholder="Search staff by name or ID..."
                                                value={employeeSearchInModal}
                                                onChange={(e) => setEmployeeSearchInModal(e.target.value)}
                                                className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none"
                                            />
                                        </div>

                                        <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 bg-white rounded-lg border border-slate-200">
                                            {modalFilteredEmployees.map((emp) => {
                                                const isChecked = selectedEmployeeIds.includes(emp.value);
                                                return (
                                                    <label
                                                        key={emp.value}
                                                        className="flex items-center gap-2.5 p-2 hover:bg-slate-50 cursor-pointer text-xs text-slate-700 select-none"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={() => toggleEmployeeSelection(emp.value)}
                                                            className="rounded border-slate-300 text-indigo-600"
                                                        />
                                                        <span className="flex-1">{emp.label}</span>
                                                        {isChecked && <Check size={14} className="text-indigo-600" />}
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                                    <button
                                        type="button"
                                        onClick={() => setIsInitiateModalOpen(false)}
                                        className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isInitiating || (initiateScope === 'CUSTOM' && selectedEmployeeIds.length === 0)}
                                        className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                                    >
                                        {isInitiating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                                        Launch Cycle
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>,
                    document.body
                )}

            {/* SMART GOAL DEFINITION & RESUBMIT MODAL */}
            <SmartGoalModal
                isOpen={isGoalModalOpen}
                onClose={() => {
                    setIsGoalModalOpen(false);
                    setActiveGoalToEdit(null);
                }}
                goal={activeGoalToEdit}
                companyTargets={companyTargets}
                currentYear={selectedYear}
                onSaved={fetchData}
                isHrOrAdmin={isHrOrAdmin}
                onOpenManageTargets={() => setIsCompanyTargetsModalOpen(true)}
            />

            {/* COMPANY TARGETS / STRATEGIC ANCHORS MODAL */}
            <CompanyTargetsModal
                isOpen={isCompanyTargetsModalOpen}
                onClose={() => setIsCompanyTargetsModalOpen(false)}
                targets={companyTargets}
                selectedYear={selectedYear}
                onTargetsUpdated={fetchData}
            />

            {/* REVIEW / 1-ON-1 MODAL */}
            <PerformanceReviewModal
                isOpen={isReviewModalOpen}
                onClose={() => setIsReviewModalOpen(false)}
                review={activeModalReview}
                isHrOrAdmin={isHrOrAdmin}
                onSaved={fetchData}
            />

            {/* SYSTEM-WIDE ALERT / CONFIRMATION MODAL */}
            <AlertModal
                isOpen={alertConfig.isOpen}
                onClose={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                confirmText={alertConfig.confirmText}
                cancelText={alertConfig.cancelText}
                showCancel={alertConfig.showCancel}
                onConfirm={alertConfig.onConfirm}
            />
        </div>
    );
};

export default PerformanceDashboard;
