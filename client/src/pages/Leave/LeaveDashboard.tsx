import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
    Calendar, Plus, Eye, Filter, FileText, Clock,
    Plane, Heart
} from 'lucide-react';
import { api } from '../../utils/api';
import ApplyLeaveModal from './ApplyLeaveModal';
import TeamRequestsTable from './TeamRequestsTable';
import { usePermissions } from '../../hooks/usePermissions';
import ManageLeaveTypes from './ManageLeaveTypes';
import HolidayCalendar from './HolidayCalendar';
import ManageHolidays from './ManageHolidays';
import AllLeaveBalances from './AllLeaveBalances';

// ── Components ──────────────────────────────────────────────────────────────

const BalanceCard = ({ title, used, pending, total, icon: Icon, color }: any) => {
    const totalSafe = Math.max(0.1, total || 0);
    const usedSafe = Math.max(0, (used || 0) + (pending || 0));
    const percentage = Math.min(100, (usedSafe / totalSafe) * 100);
    const available = Math.max(0, (total || 0) - usedSafe);

    const colors: any = {
        indigo: 'from-indigo-500 to-blue-600 shadow-indigo-100',
        emerald: 'from-emerald-500 to-teal-600 shadow-emerald-100',
        rose: 'from-rose-500 to-pink-600 shadow-rose-100',
        amber: 'from-amber-500 to-orange-600 shadow-amber-100',
    };

    const bgColors: any = {
        indigo: 'bg-indigo-50 text-indigo-600',
        emerald: 'bg-emerald-50 text-emerald-600',
        rose: 'bg-rose-50 text-rose-600',
        amber: 'bg-amber-50 text-amber-600',
    };

    return (
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all duration-300 group">
            <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-xl ${bgColors[color]} group-hover:scale-110 transition-transform duration-300`}>
                    <Icon size={24} />
                </div>
                <div className="text-right">
                    <span className="text-2xl font-bold text-slate-800">{available}</span>
                    <span className="text-slate-400 text-xs block">Days Left</span>
                </div>
            </div>
            
            <h3 className="font-bold text-slate-700 mb-1">{title}</h3>
            <p className="text-xs text-slate-400 mb-4">{used} used, {pending || 0} pending of {total}</p>

            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div 
                    className={`h-full bg-gradient-to-r ${colors[color]} rounded-full transition-all duration-1000`}
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
};

import LeaveDetailsModal from './LeaveDetailsModal';

const LeaveDashboard = () => {
    const [balance, setBalance] = useState<any>(null);
    const [history, setHistory] = useState<any[]>([]);
    const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
    const [allEmployees, setAllEmployees] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showApplyModal, setShowApplyModal] = useState(false);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [selectedLeave, setSelectedLeave] = useState<any>(null);
    const [searchParams] = useSearchParams();
    type LeaveTab = 'my-leaves' | 'team-requests' | 'settings' | 'holiday-settings';
    const [activeTab, setActiveTab] = useState<LeaveTab>(() => {
        const tabParam = searchParams.get('tab');
        if (tabParam === 'team-requests' || tabParam === 'team' || tabParam === 'requests' || tabParam === 'approvals') {
            return 'team-requests';
        }
        if (tabParam === 'settings' || tabParam === 'balances' || tabParam === 'all-balances' || tabParam === 'reports') return 'settings';
        if (tabParam === 'holiday-settings') return 'holiday-settings';
        return 'my-leaves';
    });
    const [statusFilter, setStatusFilter] = useState('All');
    const [refreshCounter, setRefreshCounter] = useState(0);
    const { role, hasSubAccess } = usePermissions();
    const canMyLeaves = hasSubAccess('leave', 'my-leaves');
    const canTeamRequests = ['super-admin', 'admin', 'manager', 'hr'].includes(role) && hasSubAccess('leave', 'team-requests');
    const canSettings = ['super-admin', 'admin', 'hr'].includes(role) && hasSubAccess('leave', 'all-leaves');
    const canHolidaySettings = ['super-admin', 'admin', 'hr'].includes(role) && hasSubAccess('leave', 'holidays');
    const isManagement = canTeamRequests;
    const isAdmin = canSettings || canHolidaySettings;
    const isAdminLike = ['super-admin', 'admin', 'hr'].includes(role);

    const filteredHistory = history.filter(item => 
        statusFilter === 'All' || item.status === statusFilter
    );

    const fetchLeaveData = async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('token');
            const [balRes, histRes, typesRes] = await Promise.all([
                fetch(`${api.baseURL}/api/leaves/balance`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${api.baseURL}/api/leaves/mine`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${api.baseURL}/api/leaves/types?activeOnly=true`, { headers: { Authorization: `Bearer ${token}` } })
            ]);
            
            if (!balRes.ok || !histRes.ok || !typesRes.ok) {
                throw new Error(`Failed to load data. Server returned ${balRes.status}/${histRes.status}/${typesRes.status}`);
            }

            const [balData, histData, typesData] = await Promise.all([
                balRes.json(),
                histRes.json(),
                typesRes.json()
            ]);

            if (!balData.success || !histData.success || !typesData.success) {
                throw new Error(balData.message || histData.message || typesData.message || 'API reported failure');
            }

            setBalance(balData.data);
            setHistory(histData.data);
            setLeaveTypes(typesData.data);
            // employee fetching removed from here
        } catch (err: any) {
            console.error('Leave fetch error:', err);
            setError(err.message || 'Could not fetch leave data. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLeaveData();
    }, []);

    useEffect(() => {
        const fetchEmployees = async () => {
            if (!isAdminLike) return;
            try {
                const token = localStorage.getItem('token');
                const res = await fetch(api.employees, { headers: { Authorization: `Bearer ${token}` } });
                if (res.ok) {
                    const data = await res.json();
                    const empArray = Array.isArray(data) ? data : (data.employees || []);
                    setAllEmployees(empArray);
                }
            } catch (err) {
                console.error('Failed to fetch employees for leave dashboard:', err);
            }
        };
        fetchEmployees();
    }, [isAdminLike]);

    useEffect(() => {
        const tabParam = searchParams.get('tab');
        if (tabParam === 'team-requests' || tabParam === 'team' || tabParam === 'requests' || tabParam === 'approvals') {
            if (isManagement) setActiveTab('team-requests');
        } else if (tabParam === 'settings' || tabParam === 'balances' || tabParam === 'all-balances' || tabParam === 'reports') {
            if (isAdmin) setActiveTab('settings');
        } else if (tabParam === 'holiday-settings') {
            if (isAdmin) setActiveTab('holiday-settings');
        } else if (tabParam === 'my-leaves') {
            setActiveTab('my-leaves');
        }
    }, [searchParams, isManagement, isAdmin]);

    useEffect(() => {
        if (!isManagement && activeTab === 'team-requests') {
            setActiveTab('my-leaves');
        }
        if (!isAdmin && (activeTab === 'settings' || activeTab === 'holiday-settings')) {
            setActiveTab('my-leaves');
        }
    }, [isManagement, isAdmin, activeTab]);

    const getCardStyling = (code: string, index: number) => {
        const colorPalette = ['indigo', 'rose', 'emerald', 'amber'];
        let color = colorPalette[index % colorPalette.length];
        
        if (code === 'annual') color = 'indigo';
        else if (code === 'sick') color = 'rose';
        else if (code === 'casual') color = 'amber';
        
        let icon = FileText;
        if (code === 'annual') icon = Plane;
        else if (code === 'sick') icon = Heart;
        else if (code === 'casual') icon = Calendar;

        return { color, icon };
    };

const STATUS_COLORS: any = {
    Pending: 'bg-amber-50 text-amber-600 border-amber-100',
    Approved: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    Rejected: 'bg-rose-50 text-rose-600 border-rose-100',
    DEFAULT: 'bg-slate-50 text-slate-500 border-slate-100'
};

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                <p className="text-sm font-bold text-slate-400 animate-pulse">Loading Leave Dashboard...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 sm:space-y-8 animate-fadeIn p-2 sm:p-0">
            {/* Header Area */}
            <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-violet-700 rounded-2xl sm:rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden shadow-2xl shadow-indigo-200/50">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full blur-2xl -translate-x-1/2 translate-y-1/2" />
                
                <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-2 sm:mb-3">
                            <div className="p-2 bg-white/20 backdrop-blur-md rounded-xl">
                                <Calendar size={18} />
                            </div>
                            <span className="text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] text-white/70">
                                {isManagement ? 'Leave Management' : 'My Leave'}
                            </span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Leave Dashboard</h1>
                        <p className="text-white/70 mt-2 max-w-md text-xs sm:text-sm leading-relaxed">
                            {isManagement
                                ? 'Manage your time off, review team requests, and approve leave in one place.'
                                : 'Apply for leave, check your balance, and view your leave history.'}
                        </p>
                    </div>

                    <button 
                        onClick={() => setShowApplyModal(true)}
                        className="bg-white text-indigo-600 px-5 sm:px-6 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl font-bold shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-center gap-2 w-full sm:w-auto"
                    >
                        <Plus size={20} strokeWidth={3} />
                        Apply For Leave
                    </button>
                </div>
            </div>

            {/* Error Banner */}
            {error && (
                <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-shake">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-rose-100 rounded-lg text-rose-600">
                            <Clock size={18} />
                        </div>
                        <p className="text-sm font-bold text-rose-700">{error}</p>
                    </div>
                    <button 
                        onClick={fetchLeaveData}
                        className="px-4 py-2 bg-rose-600 text-white text-xs font-bold rounded-xl hover:bg-rose-700 transition-all shadow-lg shadow-rose-100"
                    >
                        Retry Loading
                    </button>
                </div>
            )}

            {/* Balances Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {balance?.balances?.filter((b: any) => leaveTypes.some(t => t.code === b.leaveTypeCode)).map((balCategory: any, idx: number) => {
                    const typeDetails = leaveTypes.find(t => t.code === balCategory.leaveTypeCode);
                    const title = typeDetails ? typeDetails.name : (balCategory.leaveTypeCode.charAt(0).toUpperCase() + balCategory.leaveTypeCode.slice(1));
                    const { color, icon } = getCardStyling(balCategory.leaveTypeCode, idx);
                    return (
                        <BalanceCard 
                            key={balCategory.leaveTypeCode}
                            title={title.toLowerCase().includes('leave') ? title : `${title} Leave`} 
                            used={balCategory.used || 0} 
                            pending={balCategory.pending || 0}
                            total={balCategory.total || 0} 
                            icon={icon} 
                            color={color} 
                        />
                    );
                })}
                {(!balance?.balances || balance.balances.length === 0) && (
                    <div className="col-span-full py-10 text-center bg-white border border-slate-100 rounded-2xl">
                        <p className="text-sm text-slate-400 font-bold">No leave balances initialized.</p>
                    </div>
                )}
            </div>

            {/* Main Content Area */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="border-b border-slate-50 p-4 sm:p-6 flex flex-col gap-4">
                    {/* Scrollable Tab Bar */}
                    <div className="flex overflow-x-auto scrollbar-none gap-2 sm:gap-6 pb-1">
                        {canMyLeaves && (
                            <button 
                                onClick={() => setActiveTab('my-leaves')}
                                className={`pb-1 text-sm font-bold transition-all duration-300 relative whitespace-nowrap shrink-0 ${activeTab === 'my-leaves' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                My Leave Request
                                {activeTab === 'my-leaves' && <div className="absolute -bottom-1 left-0 right-0 h-1 bg-indigo-600 rounded-full shadow-lg shadow-indigo-100" />}
                            </button>
                        )}
                        
                        {canSettings && (
                            <button 
                                onClick={() => setActiveTab('settings')}
                                className={`pb-1 text-sm font-bold transition-all duration-300 relative whitespace-nowrap shrink-0 ${activeTab === 'settings' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                Leave Settings & Balances
                                {activeTab === 'settings' && <div className="absolute -bottom-1 left-0 right-0 h-1 bg-indigo-600 rounded-full shadow-lg shadow-indigo-100" />}
                            </button>
                        )}

                        {canHolidaySettings && (
                            <button 
                                onClick={() => setActiveTab('holiday-settings')}
                                className={`pb-1 text-sm font-bold transition-all duration-300 relative whitespace-nowrap shrink-0 ${activeTab === 'holiday-settings' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                Holiday Settings
                                {activeTab === 'holiday-settings' && <div className="absolute -bottom-1 left-0 right-0 h-1 bg-indigo-600 rounded-full shadow-lg shadow-indigo-100" />}
                            </button>
                        )}

                        {canTeamRequests && (
                            <button 
                                onClick={() => setActiveTab('team-requests')}
                                className={`pb-1 text-sm font-bold transition-all duration-300 relative whitespace-nowrap shrink-0 ${activeTab === 'team-requests' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                Leave Requests
                                {activeTab === 'team-requests' && <div className="absolute -bottom-1 left-0 right-0 h-1 bg-indigo-600 rounded-full shadow-lg shadow-indigo-100" />}
                            </button>
                        )}
                    </div>

                    {activeTab === 'my-leaves' && (
                        <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-xl border border-slate-100 w-fit self-end">
                            <select 
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                aria-label="Filter history by status"
                                className="bg-transparent text-xs font-bold text-slate-500 outline-none px-2 pr-8 py-1 cursor-pointer"
                            >
                                <option value="All">All Status</option>
                                <option value="Pending">Pending</option>
                                <option value="Approved">Approved</option>
                                <option value="Rejected">Rejected</option>
                            </select>
                            <Filter size={14} className="text-slate-400 mr-2" />
                        </div>
                    )}
                </div>

                <div className="overflow-x-auto">
                    {activeTab === 'team-requests' ? (
                        <TeamRequestsTable 
                            onStatusChange={() => {
                                fetchLeaveData();
                                setRefreshCounter(prev => prev + 1);
                            }}
                        />
                    ) : activeTab === 'settings' ? (
                        <div className="flex flex-col gap-6 p-6 bg-slate-50/50">
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                                <ManageLeaveTypes />
                            </div>
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                                <AllLeaveBalances refreshTrigger={refreshCounter} />
                            </div>
                        </div>
                    ) : activeTab === 'holiday-settings' ? (
                        <div className="flex flex-col gap-6 p-6 bg-slate-50/50">
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                                <ManageHolidays />
                            </div>
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                                <HolidayCalendar />
                            </div>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/50">
                                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">Leave Type</th>
                                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">Duration</th>
                                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">Dates</th>
                                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">Reason</th>
                                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider text-center">Status</th>
                                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filteredHistory.length > 0 ? filteredHistory.map((leave) => (
                                    <tr key={leave._id} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                                                    <FileText size={16} />
                                                </div>
                                                <span className="font-bold text-slate-700">
                                                    {leave.type.toLowerCase().includes('leave') ? leave.type : `${leave.type} Leave`}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <span className="text-slate-600 font-medium">
                                                {leave.totalDays !== undefined ? leave.totalDays : Math.ceil((new Date(leave.endDate).getTime() - new Date(leave.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1} Days
                                            </span>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-slate-700">{new Date(leave.startDate).toLocaleDateString()}</span>
                                                <span className="text-[10px] text-slate-400">to {new Date(leave.endDate).toLocaleDateString()}</span>
                                                {leave.duration && leave.duration !== 'Full Day' && (
                                                    <span className="text-[10px] text-indigo-500 font-bold mt-0.5">
                                                        {leave.duration} {leave.duration === 'Specify Time' ? `(${leave.startTime} - ${leave.endTime})` : ''}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <p className="text-sm text-slate-500 max-w-xs truncate">{leave.reason || 'No reason provided'}</p>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex justify-center">
                                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${STATUS_COLORS[leave.status] || STATUS_COLORS.DEFAULT}`}>
                                                    {leave.status}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 text-right">
                                            <button 
                                                onClick={() => {
                                                    setSelectedLeave(leave);
                                                    setShowDetailsModal(true);
                                                }}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 transition-all cursor-pointer shadow-2xs"
                                                title="View leave details"
                                            >
                                                <Eye size={13} />
                                                Details
                                            </button>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-20 text-center">
                                            <div className="max-w-xs mx-auto">
                                                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                                                    <Clock size={32} />
                                                </div>
                                                <h3 className="font-bold text-slate-700">No History Found</h3>
                                                <p className="text-sm text-slate-400 mt-1">You haven't requested any time off yet. Click the button above to start.</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            <ApplyLeaveModal 
                isOpen={showApplyModal} 
                onClose={() => setShowApplyModal(false)}
                onSuccess={() => {
                    fetchLeaveData();
                    setRefreshCounter(prev => prev + 1);
                }}
                balance={balance}
                isAdminLike={isAdminLike}
                allEmployees={allEmployees}
            />

            <LeaveDetailsModal 
                isOpen={showDetailsModal}
                onClose={() => {
                    setShowDetailsModal(false);
                    setSelectedLeave(null);
                }}
                leave={selectedLeave}
                onSuccess={() => {
                    fetchLeaveData();
                    setRefreshCounter(prev => prev + 1);
                }}
            />
        </div>
    );
};

export default LeaveDashboard;
