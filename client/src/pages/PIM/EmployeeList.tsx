import React from 'react';
import { Plus, Pencil, Trash, Eye, Search, Filter, Briefcase, Users, LayoutGrid, List, UserPlus, Building2, ShieldCheck } from 'lucide-react';
import DeleteModal from '../../components/UI/DeleteModal';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import { usePermissions } from '../../hooks/usePermissions';
import { getAvatarUrl } from '../../utils/avatar';
import Avatar from '../../components/UI/Avatar';

const ITEMS_PER_PAGE = 12;

const EmployeeList = () => {
    const navigate = useNavigate();
    const { canCreateUser, canEditSensitiveData } = usePermissions();
    const [employees, setEmployees] = React.useState<any[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
    const [employeeToDelete, setEmployeeToDelete] = React.useState<string | null>(null);
    const [viewMode, setViewMode] = React.useState<'table' | 'grid'>('grid');
    const [page, setPage] = React.useState(1);
    const [filters, setFilters] = React.useState({
        name: '',
        id: '',
        post: '',
        dept: ''
    });
    const [statusFilter, setStatusFilter] = React.useState<'active' | 'past'>('active');
    const [departments, setDepartments] = React.useState<string[]>([]);

    React.useEffect(() => {
        const fetchConfig = async () => {
            try {
                const token = localStorage.getItem('token');
                const [deptRes] = await Promise.all([
                    fetch(`${api.baseURL}/api/config/departments`, { headers: { 'Authorization': `Bearer ${token}` } })
                ]);

                if (deptRes.ok) {
                    const data = await deptRes.json();
                    setDepartments(data.filter((d: any) => d.isActive).map((d: any) => d.name));
                }
            } catch (err) {
                console.error('Failed to fetch config', err);
            }
        };
        fetchConfig();
    }, []);

    const handleDeleteClick = (id: string) => {
        setEmployeeToDelete(id);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = () => {
        if (!employeeToDelete) return;

        const token = localStorage.getItem('token');
        fetch(api.employee(employeeToDelete), {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
            .then(res => {
                if (res.ok) {
                    setEmployees(prev => prev.filter(emp => emp.employeeId !== employeeToDelete));
                    setIsDeleteModalOpen(false);
                    setEmployeeToDelete(null);
                } else {
                    console.error('Failed to delete');
                }
            })
            .catch(err => console.error('Error deleting employee:', err));
    };

    React.useEffect(() => {
        const token = localStorage.getItem('token');
        setLoading(true);
        fetch(api.employees, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => {
                if (!res.ok) throw new Error('Failed to fetch employees');
                return res.json();
            })
            .then(data => {
                // Handle paginated response shape { employees, total } or plain array
                const empArray = Array.isArray(data) ? data : (data.employees || []);
                setEmployees(empArray);
            })
            .catch(err => {
                console.error('Error fetching employees:', err);
                setEmployees([]);
            })
            .finally(() => setLoading(false));
    }, []);

    const filteredEmployees = React.useMemo(() => {
        // Reset to page 1 whenever filters change
        return employees.filter(emp => {
            const status = emp.employmentStatus?.status || emp.jobInfo?.employmentType || 'Permanent';
            const isPast = ['Terminated', 'Resigned'].includes(status);

            if (statusFilter === 'active' && isPast) return false;
            if (statusFilter === 'past' && !isPast) return false;

            const fullName = `${emp.firstName} ${emp.middleName ? emp.middleName + ' ' : ''}${emp.lastName}`.toLowerCase();
            const designation = (emp.jobInfo?.designation || '').toLowerCase();
            const matchesName = fullName.includes(filters.name.toLowerCase()) || designation.includes(filters.name.toLowerCase());
            const matchesId = emp.employeeId.toLowerCase().includes(filters.id.toLowerCase());
            const matchesPost = designation.includes(filters.post.toLowerCase());
            const matchesDept = (emp.jobInfo?.department || '').toLowerCase().includes(filters.dept.toLowerCase());

            return matchesName && matchesId && matchesPost && matchesDept;
        });
    }, [employees, filters, statusFilter]);

    const totalPages = Math.ceil(filteredEmployees.length / ITEMS_PER_PAGE);
    const paginatedEmployees = filteredEmployees.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

    // Reset page when filters change
    React.useEffect(() => { setPage(1); }, [filters, statusFilter]);

    // Analytics Calculations
    const stats = React.useMemo(() => {
        const total = employees.length;
        const departments = new Set(employees.map(e => e.jobInfo?.department).filter(Boolean)).size;
        const newJoiners = employees.filter(e => {
            if (!e.jobInfo?.joiningDate) return false;
            const joinDate = new Date(e.jobInfo.joiningDate);
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            return joinDate > thirtyDaysAgo;
        }).length;
        const activeProbation = employees.filter(e =>
            (e.employmentStatus?.status || e.employmentStatus) === 'Probation'
        ).length;

        return [
            { label: 'Total Workforce', value: total, icon: Users, color: 'indigo', trend: 'Global Entity' },
            { label: 'Departments', value: departments, icon: Building2, color: 'purple', trend: 'Categorized' },
            { label: 'New Hires', value: newJoiners, icon: UserPlus, color: 'emerald', trend: 'Last 30 days' },
            { label: 'On Probation', value: activeProbation, icon: ShieldCheck, color: 'amber', trend: 'Active review' }
        ];
    }, [employees]);


    // Skeleton loader component
    const SkeletonCard = () => (
        <div className="bg-white rounded-3xl p-6 border border-slate-200/60 shadow-sm flex flex-col items-center animate-pulse">
            <div className="w-24 h-24 rounded-2xl bg-slate-200 mb-4" />
            <div className="h-4 bg-slate-200 rounded w-32 mb-2" />
            <div className="h-3 bg-slate-100 rounded w-24 mb-1" />
            <div className="h-3 bg-slate-100 rounded w-20 mb-6" />
            <div className="grid grid-cols-2 w-full gap-2 mb-4">
                <div className="h-10 bg-slate-100 rounded-2xl" />
                <div className="h-10 bg-slate-100 rounded-2xl" />
            </div>
            <div className="flex gap-2 w-full pt-4 border-t border-slate-100">
                <div className="h-8 bg-slate-100 rounded-xl flex-1" />
                <div className="h-8 bg-slate-200 rounded-xl w-8" />
                <div className="h-8 bg-slate-200 rounded-xl w-8" />
            </div>
        </div>
    );

    return (
        <div className="space-y-8 animate-fadeIn pb-12 bg-slate-50/30 min-h-screen">
            {/* 1. Analytics Header */}
            <div className="grid grid-cols-1 sm:grid-cols-2 min-[1200px]:grid-cols-4 gap-3 sm:gap-6">
                {stats.map((stat, i) => {
                    const colorMap: Record<string, any> = {
                        indigo: {
                            bg: 'bg-indigo-50',
                            text: 'text-indigo-600',
                            hoverBg: 'group-hover:bg-indigo-600',
                            glow: 'bg-indigo-500/5',
                            badge: 'text-indigo-600 bg-indigo-50'
                        },
                        purple: {
                            bg: 'bg-purple-50',
                            text: 'text-purple-600',
                            hoverBg: 'group-hover:bg-purple-600',
                            glow: 'bg-purple-500/5',
                            badge: 'text-purple-600 bg-purple-50'
                        },
                        emerald: {
                            bg: 'bg-emerald-50',
                            text: 'text-emerald-600',
                            hoverBg: 'group-hover:bg-emerald-600',
                            glow: 'bg-emerald-500/5',
                            badge: 'text-emerald-600 bg-emerald-50'
                        },
                        amber: {
                            bg: 'bg-amber-50',
                            text: 'text-amber-600',
                            hoverBg: 'group-hover:bg-amber-600',
                            glow: 'bg-amber-500/5',
                            badge: 'text-amber-600 bg-amber-50'
                        }
                    };
                    const styles = colorMap[stat.color] || colorMap.indigo;

                    return (
                        <div key={i} className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200/60 hover:shadow-md transition-all group overflow-hidden relative">
                            <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 ${styles.glow} rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500`} />
                            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                                <div className={`p-3 rounded-xl ${styles.bg} ${styles.text} ${styles.hoverBg} group-hover:text-white transition-all shrink-0`}>
                                    <stat.icon size={22} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs sm:text-sm font-medium text-slate-500 truncate">{stat.label}</p>
                                    <div className="flex items-center justify-between gap-2 mt-1 min-w-0">
                                        <h4 className="text-xl sm:text-2xl font-bold text-slate-800 shrink-0">{stat.value}</h4>
                                        <span className={`text-[10px] sm:text-xs font-bold uppercase tracking-wider ${styles.badge} px-2 py-0.5 rounded-md whitespace-nowrap shrink-0`}>
                                            {stat.trend}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* 2. Sleek Filter Bar */}
            <div className="bg-white/80 backdrop-blur-md p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200/60 sticky top-20 z-20">
                <div className="flex overflow-x-auto scrollbar-none border-b border-slate-200 mb-4 sm:mb-5 pb-1 gap-4 sm:gap-6">
                    <button
                        onClick={() => setStatusFilter('active')}
                        className={`pb-3 text-sm font-bold border-b-2 transition-all whitespace-nowrap shrink-0 ${statusFilter === 'active' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >
                        Active Employees
                    </button>
                    <button
                        onClick={() => setStatusFilter('past')}
                        className={`pb-3 text-sm font-bold border-b-2 transition-all whitespace-nowrap shrink-0 ${statusFilter === 'past' ? 'border-rose-600 text-rose-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >
                        Past Employees (Offboarded)
                    </button>
                </div>
                <div className="flex flex-col xl:flex-row gap-4 sm:gap-6 items-start xl:items-center justify-between">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 flex-1 w-full">
                        {/* Name Search */}
                        <div className="relative group">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
                            <input
                                type="text"
                                placeholder="Search Name "
                                value={filters.name}
                                onChange={(e) => setFilters(prev => ({ ...prev, name: e.target.value }))}
                                className="w-full pl-11 pr-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-medium"
                            />
                        </div>

                        {/* ID Search */}
                        <div className="relative group">
                            <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={16} />
                            <input
                                type="text"
                                placeholder="Emp ID "
                                value={filters.id}
                                onChange={(e) => setFilters(prev => ({ ...prev, id: e.target.value }))}
                                className="w-full pl-11 pr-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
                            />
                        </div>

                        {/* Post Search */}
                        <div className="relative group">
                            <Briefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors pointer-events-none" size={16} />
                            <input
                                type="text"
                                placeholder="Job Title "
                                value={filters.post}
                                onChange={(e) => setFilters(prev => ({ ...prev, post: e.target.value }))}
                                className="w-full pl-11 pr-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-medium"
                            />
                        </div>

                        {/* Dept Search */}
                        <div className="relative group">
                            <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors pointer-events-none" size={16} />
                            <select
                                value={filters.dept}
                                onChange={(e) => setFilters(prev => ({ ...prev, dept: e.target.value }))}
                                className="w-full pl-11 pr-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-medium appearance-none cursor-pointer"
                            >
                                <option value="">All Departments</option>
                                {departments.map(d => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 w-full xl:w-auto">
                        {/* View Toggle */}
                        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                title="Grid View"
                            >
                                <LayoutGrid size={20} />
                            </button>
                            <button
                                onClick={() => setViewMode('table')}
                                className={`p-2 rounded-lg transition-all ${viewMode === 'table' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                title="Table View"
                            >
                                <List size={20} />
                            </button>
                        </div>

                        <div className="h-8 w-[1px] bg-slate-200 hidden xl:block" />

                        {canCreateUser() && (
                            <button
                                onClick={() => navigate('/pim/add')}
                                className="flex-1 xl:flex-none bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-bold transition-all shadow-indigo-200 shadow-lg hover:shadow-indigo-300 active:scale-95"
                            >
                                <Plus size={18} /> Add New
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* 3. Employee Display */}
            <div className="animate-slide-up">
                {loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
                    </div>
                ) : viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {paginatedEmployees.map((emp) => (
                            <div key={emp.employeeId} className="bg-white rounded-3xl p-6 border border-slate-200/60 shadow-sm hover:shadow-xl hover:shadow-indigo-50 transition-all group relative overflow-hidden flex flex-col items-center text-center">
                                {/* Decorative elements */}
                                <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-500/5 -mr-10 -mt-10 rounded-full" />

                                {/* Avatar */}
                                <div className="relative mb-4">
                                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-indigo-600 text-2xl font-bold border-4 border-white shadow-lg overflow-hidden group-hover:scale-105 transition-transform">
                                        <Avatar
                                            src={getAvatarUrl(emp)}
                                            firstName={emp.firstName}
                                            lastName={emp.lastName}
                                            size="w-full h-full"
                                            initialsClassName="bg-gradient-to-br from-indigo-100 to-purple-100 text-indigo-600 text-2xl font-bold"
                                        />
                                    </div>
                                </div>

                                {/* Info */}
                                <div className="space-y-1 mb-6">
                                    <h5 className="font-bold text-slate-800 text-lg group-hover:text-indigo-600 transition-colors">
                                        {emp.firstName} {emp.middleName ? `${emp.middleName} ` : ''}{emp.lastName}
                                    </h5>
                                    <p className="text-indigo-600 text-sm font-semibold tracking-tight">{emp.jobInfo?.designation || 'Software Engineer'}</p>
                                    <div className="flex items-center justify-center gap-1.5 text-slate-400 text-xs">
                                        <Building2 size={12} />
                                        {emp.jobInfo?.department || 'Operations'}
                                    </div>
                                </div>

                                {/* Details Grid */}
                                <div className="flex items-center w-full gap-2 mb-6">
                                    <div className="bg-slate-50 p-2 sm:p-2.5 rounded-2xl shrink-0">
                                        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-0.5">ID</p>
                                        <p className="text-xs sm:text-sm font-bold text-slate-700">{emp.employeeId}</p>
                                    </div>
                                    <div className="bg-slate-50 p-2 sm:p-2.5 rounded-2xl flex-1 min-w-0">
                                        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-0.5">Status</p>
                                        <p className="text-xs font-bold text-slate-700 whitespace-nowrap">
                                            {emp.employmentStatus?.status || emp.jobInfo?.employmentType || 'Permanent'}
                                        </p>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 w-full pt-4 border-t border-slate-100">
                                    <button
                                        onClick={() => navigate(`/pim/view/${emp.employeeId}`)}
                                        className="flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-600 hover:text-white transition-all"
                                    >
                                        <Eye size={14} /> View
                                    </button>
                                    {canEditSensitiveData() && (
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => navigate(`/pim/edit/${emp.employeeId}`)}
                                                className="p-2 text-emerald-600 bg-emerald-50 rounded-xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                                                title="Edit"
                                            >
                                                <Pencil size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteClick(emp.employeeId)}
                                                className="p-2 text-rose-600 bg-rose-50 rounded-xl hover:bg-rose-600 hover:text-white transition-all shadow-sm"
                                                title="Delete"
                                            >
                                                <Trash size={14} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-200/60 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50/50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                                    <tr>
                                        <th className="px-6 py-4">Employee</th>
                                        <th className="px-4 py-4">Job Details</th>
                                        <th className="px-4 py-4">Employment</th>
                                        <th className="px-4 py-4">Manager</th>
                                        <th className="px-6 py-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {paginatedEmployees.map((emp) => (
                                        <tr key={emp.employeeId} className="hover:bg-slate-50/50 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold border border-indigo-100 relative group-hover:scale-110 transition-transform overflow-hidden">
                                                        <Avatar
                                                            src={getAvatarUrl(emp)}
                                                            firstName={emp.firstName}
                                                            lastName={emp.lastName}
                                                            size="w-full h-full"
                                                            initialsClassName="bg-indigo-50 text-indigo-600 font-bold"
                                                        />
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-slate-800">{emp.firstName} {emp.middleName ? `${emp.middleName} ` : ''}{emp.lastName}</p>
                                                        <p className="text-[11px] text-slate-400 font-medium">#{emp.employeeId}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <p className="font-bold text-slate-700">{emp.jobInfo?.designation || '-'}</p>
                                                <p className="text-[11px] text-slate-400 font-medium uppercase tracking-tight">{emp.jobInfo?.department || '-'}</p>
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 text-[11px] font-bold">
                                                    {emp.employmentStatus?.status || emp.jobInfo?.employmentType || 'Permanent'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="flex items-center gap-2 text-slate-600">
                                                    <Users size={14} className="text-slate-400" />
                                                    <span className="font-medium">{emp.jobInfo?.reportingManager || '-'}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button onClick={() => navigate(`/pim/view/${emp.employeeId}`)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="View"><Eye size={16} /></button>
                                                    {canEditSensitiveData() && (
                                                        <>
                                                            <button onClick={() => navigate(`/pim/edit/${emp.employeeId}`)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all" title="Edit"><Pencil size={16} /></button>
                                                            <button onClick={() => handleDeleteClick(emp.employeeId)} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-all" title="Delete"><Trash size={16} /></button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Pagination */}
                {!loading && totalPages > 1 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-6 bg-white rounded-2xl border border-slate-200/60 shadow-sm px-4 sm:px-6 py-3">
                        <p className="text-sm text-slate-500 text-center sm:text-left">
                            Showing <span className="font-bold text-slate-700">{Math.min((page - 1) * ITEMS_PER_PAGE + 1, filteredEmployees.length)}</span> –{' '}
                            <span className="font-bold text-slate-700">{Math.min(page * ITEMS_PER_PAGE, filteredEmployees.length)}</span> of{' '}
                            <span className="font-bold text-slate-700">{filteredEmployees.length}</span> employees
                        </p>
                        <div className="flex items-center gap-1 flex-wrap justify-center">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="px-3 py-1.5 rounded-lg text-sm font-bold text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                ← Prev
                            </button>
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                                .reduce<(number | string)[]>((acc, p, idx, arr) => {
                                    if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('...');
                                    acc.push(p);
                                    return acc;
                                }, [])
                                .map((p, i) => p === '...' ? (
                                    <span key={`dots-${i}`} className="px-2 text-slate-400">…</span>
                                ) : (
                                    <button
                                        key={p}
                                        onClick={() => setPage(p as number)}
                                        className={`w-8 h-8 rounded-lg text-sm font-bold transition-all ${page === p
                                                ? 'bg-indigo-600 text-white shadow-sm'
                                                : 'text-slate-500 hover:bg-indigo-50 hover:text-indigo-600'
                                            }`}
                                    >
                                        {p}
                                    </button>
                                ))
                            }
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="px-3 py-1.5 rounded-lg text-sm font-bold text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                Next →
                            </button>
                        </div>
                    </div>
                )}

                {!loading && filteredEmployees.length === 0 && (
                    <div className="bg-white rounded-3xl p-20 text-center border border-slate-200/60 shadow-sm">
                        <div className="flex flex-col items-center gap-4 max-w-sm mx-auto">
                            <div className="p-6 bg-slate-50 rounded-full text-slate-300">
                                <Search size={48} />
                            </div>
                            <div>
                                {Object.values(filters).some(Boolean) ? (
                                    <>
                                        <h3 className="text-lg font-bold text-slate-800">No matches found</h3>
                                        <p className="text-slate-500 text-sm mt-1">We couldn't find anyone matching those criteria. Try adjusting your filters.</p>
                                    </>
                                ) : (
                                    <>
                                        <h3 className="text-lg font-bold text-slate-800">
                                            {statusFilter === 'active' ? 'No active employees yet' : 'No past employees'}
                                        </h3>
                                        <p className="text-slate-500 text-sm mt-1">
                                            {statusFilter === 'active'
                                                ? 'Click "Add New" to onboard your first employee.'
                                                : 'Terminated or resigned employees will appear here.'}
                                        </p>
                                    </>
                                )}
                            </div>
                            {Object.values(filters).some(Boolean) && (
                                <button
                                    onClick={() => setFilters({ name: '', id: '', post: '', dept: '' })}
                                    className="mt-4 px-6 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-bold hover:bg-indigo-100 transition-all text-sm"
                                >
                                    Clear all filters
                                </button>
                            )}
                            {!Object.values(filters).some(Boolean) && canCreateUser() && statusFilter === 'active' && (
                                <button
                                    onClick={() => navigate('/pim/add')}
                                    className="mt-4 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all text-sm flex items-center gap-2"
                                >
                                    <Plus size={16} /> Add First Employee
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <DeleteModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
            />
        </div>
    );
};

export default EmployeeList;
