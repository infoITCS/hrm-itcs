import React from 'react';
import { Plus, Pencil, Trash, Eye, Search, Filter, Briefcase, Users, LayoutGrid, List, UserPlus, Building2, ShieldCheck } from 'lucide-react';
import DeleteModal from '../../components/UI/DeleteModal';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import { usePermissions } from '../../hooks/usePermissions';
import { getAvatarUrl } from '../../utils/avatar';

const EmployeeList = () => {
    const navigate = useNavigate();
    const { canCreateUser, canEditSensitiveData } = usePermissions();
    const [employees, setEmployees] = React.useState<any[]>([]);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
    const [employeeToDelete, setEmployeeToDelete] = React.useState<string | null>(null);
    const [viewMode, setViewMode] = React.useState<'table' | 'grid'>('grid');
    const [filters, setFilters] = React.useState({
        name: '',
        id: '',
        post: '',
        dept: '',
        manager: ''
    });
    const [statusFilter, setStatusFilter] = React.useState<'active' | 'past'>('active');

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
        fetch(api.employees, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
            .then(res => {
                if (!res.ok) {
                    throw new Error('Failed to fetch employees');
                }
                return res.json();
            })
            .then(data => {
                if (Array.isArray(data)) {
                    setEmployees(data);
                } else {
                    console.error('API returned non-array data:', data);
                    setEmployees([]);
                }
            })
            .catch(err => {
                console.error('Error fetching employees:', err);
                setEmployees([]);
            });
    }, []);

    const filteredEmployees = React.useMemo(() => {
        return employees.filter(emp => {
            const status = emp.employmentStatus?.status || emp.jobInfo?.employmentType || 'Permanent';
            const isPast = ['Terminated', 'Resigned'].includes(status);
            
            if (statusFilter === 'active' && isPast) return false;
            if (statusFilter === 'past' && !isPast) return false;

            const fullName = `${emp.firstName} ${emp.middleName ? emp.middleName + ' ' : ''}${emp.lastName}`.toLowerCase();
            const matchesName = fullName.includes(filters.name.toLowerCase());
            const matchesId = emp.employeeId.toLowerCase().includes(filters.id.toLowerCase());
            const matchesPost = (emp.jobInfo?.designation || '').toLowerCase().includes(filters.post.toLowerCase());
            const matchesDept = (emp.jobInfo?.department || '').toLowerCase().includes(filters.dept.toLowerCase());
            const matchesManager = (emp.jobInfo?.reportingManager || '').toLowerCase().includes(filters.manager.toLowerCase());

            return matchesName && matchesId && matchesPost && matchesDept && matchesManager;
        });
    }, [employees, filters, statusFilter]);

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


    return (
        <div className="space-y-8 animate-fadeIn pb-12 bg-slate-50/30 min-h-screen">
            {/* 1. Analytics Header */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map((stat, i) => (
                    <div key={i} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 hover:shadow-md transition-all group overflow-hidden relative">
                        <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 bg-${stat.color}-500/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500`} />
                        <div className="flex items-center gap-4">
                            <div className={`p-3 rounded-xl bg-${stat.color}-50 text-${stat.color}-600 group-hover:bg-${stat.color}-600 group-hover:text-white transition-all`}>
                                <stat.icon size={24} />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                                <div className="flex items-baseline gap-2">
                                    <h4 className="text-2xl font-bold text-slate-800">{stat.value}</h4>
                                    <span className={`text-[10px] font-bold uppercase tracking-wider text-${stat.color}-600 bg-${stat.color}-50 px-1.5 py-0.5 rounded`}>
                                        {stat.trend}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* 2. Sleek Filter Bar */}
            <div className="bg-white/80 backdrop-blur-md p-5 rounded-2xl shadow-sm border border-slate-200/60 sticky top-20 z-20">
                <div className="flex border-b border-slate-200 mb-5 pb-1 gap-6">
                    <button 
                        onClick={() => setStatusFilter('active')}
                        className={`pb-3 text-sm font-bold border-b-2 transition-all ${statusFilter === 'active' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >
                        Active Employees
                    </button>
                    <button 
                        onClick={() => setStatusFilter('past')}
                        className={`pb-3 text-sm font-bold border-b-2 transition-all ${statusFilter === 'past' ? 'border-rose-600 text-rose-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >
                        Past Employees (Offboarded)
                    </button>
                </div>
                <div className="flex flex-col xl:flex-row gap-6 items-start xl:items-center justify-between">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 flex-1 w-full">
                        {/* Name Search */}
                        <div className="relative group">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
                            <input
                                type="text"
                                placeholder="Search Name..."
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
                                placeholder="Emp ID..."
                                value={filters.id}
                                onChange={(e) => setFilters(prev => ({ ...prev, id: e.target.value }))}
                                className="w-full pl-11 pr-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
                            />
                        </div>

                        {/* Post Search */}
                        <div className="relative group">
                            <Briefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={16} />
                            <input
                                type="text"
                                placeholder="Job Title..."
                                value={filters.post}
                                onChange={(e) => setFilters(prev => ({ ...prev, post: e.target.value }))}
                                className="w-full pl-11 pr-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
                            />
                        </div>

                        {/* Dept Search */}
                        <div className="relative group">
                            <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={16} />
                            <input
                                type="text"
                                placeholder="Department..."
                                value={filters.dept}
                                onChange={(e) => setFilters(prev => ({ ...prev, dept: e.target.value }))}
                                className="w-full pl-11 pr-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
                            />
                        </div>

                        {/* Manager Search */}
                        <div className="relative group">
                            <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={16} />
                            <input
                                type="text"
                                placeholder="Manager..."
                                value={filters.manager}
                                onChange={(e) => setFilters(prev => ({ ...prev, manager: e.target.value }))}
                                className="w-full pl-11 pr-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
                            />
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
                {viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {filteredEmployees.map((emp) => (
                            <div key={emp.employeeId} className="bg-white rounded-3xl p-6 border border-slate-200/60 shadow-sm hover:shadow-xl hover:shadow-indigo-50 transition-all group relative overflow-hidden flex flex-col items-center text-center">
                                {/* Decorative elements */}
                                <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-500/5 -mr-10 -mt-10 rounded-full" />

                                {/* Avatar */}
                                <div className="relative mb-4">
                                    <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-indigo-600 text-2xl font-bold border-4 border-white shadow-lg overflow-hidden group-hover:scale-105 transition-transform">
                                        {getAvatarUrl(emp) ? (
                                            <img src={getAvatarUrl(emp)!} alt={emp.firstName} className="w-full h-full object-cover" />
                                        ) : (
                                            `${emp.firstName[0]}${emp.lastName[0]}`
                                        )}
                                    </div>
                                </div>

                                {/* Info */}
                                <div className="space-y-1 mb-6">
                                    <h5 className="font-bold text-slate-800 text-lg group-hover:text-indigo-600 transition-colors">
                                        {emp.firstName} {emp.lastName}
                                    </h5>
                                    <p className="text-indigo-600 text-sm font-semibold tracking-tight">{emp.jobInfo?.designation || 'Software Engineer'}</p>
                                    <div className="flex items-center justify-center gap-1.5 text-slate-400 text-xs">
                                        <Building2 size={12} />
                                        {emp.jobInfo?.department || 'Operations'}
                                    </div>
                                </div>

                                {/* Details Grid */}
                                <div className="grid grid-cols-2 w-full gap-2 mb-6">
                                    <div className="bg-slate-50 p-2.5 rounded-2xl">
                                        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-0.5">ID</p>
                                        <p className="text-sm font-bold text-slate-700">{emp.employeeId}</p>
                                    </div>
                                    <div className="bg-slate-50 p-2.5 rounded-2xl">
                                        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-0.5">Status</p>
                                        <p className="text-sm font-bold text-slate-700">{emp.employmentStatus?.status || emp.jobInfo?.employmentType || 'Permanent'}</p>
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
                                    {filteredEmployees.map((emp) => (
                                        <tr key={emp.employeeId} className="hover:bg-slate-50/50 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold border border-indigo-100 relative group-hover:scale-110 transition-transform overflow-hidden">
                                                        {getAvatarUrl(emp) ? (
                                                            <img src={getAvatarUrl(emp)!} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            `${emp.firstName[0]}${emp.lastName[0]}`
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-slate-800">{emp.firstName} {emp.lastName}</p>
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

                {filteredEmployees.length === 0 && (
                    <div className="bg-white rounded-3xl p-20 text-center border border-slate-200/60 shadow-sm">
                        <div className="flex flex-col items-center gap-4 max-w-xs mx-auto">
                            <div className="p-6 bg-slate-50 rounded-full text-slate-300">
                                <Search size={48} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">No members found</h3>
                                <p className="text-slate-500 text-sm mt-1">We couldn't find anyone matching those search criteria. Try adjusting your filters.</p>
                            </div>
                            <button
                                onClick={() => setFilters({ name: '', id: '', post: '', dept: '', manager: '' })}
                                className="mt-4 px-6 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-bold hover:bg-indigo-100 transition-all text-sm"
                            >
                                Clear all filters
                            </button>
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
