import { useState, useEffect, useMemo } from 'react';
import { Search, Mail, Phone, Building2, User, Grid, List as ListIcon, Filter, X, FileText } from 'lucide-react';
import api from '../../utils/api';
import Avatar from '../../components/UI/Avatar';
import { getAvatarUrl } from '../../utils/avatar';
import AlertModal from '../../components/UI/AlertModal';
import CompanyProfileModal from '../../components/CompanyProfileModal';
import { formatEmployeeFullName } from '../../utils/nameHelper';

interface Employee {
    employeeId: string;
    userId: string;
    firstName: string;
    middleName?: string;
    lastName: string;
    avatar?: string;
    workEmail?: string;
    phone?: string;
    jobInfo?: {
        designation?: string;
        department?: string;
    };
    attachments?: any[];
}

const Directory = () => {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDept, setSelectedDept] = useState('All');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [alertConfig, setAlertConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type: 'info' | 'success' | 'warning' | 'error' | 'confirm' | 'contact';
        contactInfo?: { phone?: string; email?: string; name?: string };
        onConfirm?: () => void;
    }>({
        isOpen: false,
        title: '',
        message: '',
        type: 'info'
    });
    const [showProfileModal, setShowProfileModal] = useState(false);

    useEffect(() => {
        const fetchDirectory = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await fetch(api.directory, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setEmployees(data);
                }
            } catch (err) {
                console.error('Failed to fetch directory', err);
            } finally {
                setLoading(false);
            }
        };
        fetchDirectory();
    }, []);

    const departments = useMemo(() => {
        const depts = new Set(employees.map(emp => emp.jobInfo?.department).filter(Boolean) as string[]);
        return ['All', ...Array.from(depts).sort()];
    }, [employees]);

    const filteredEmployees = useMemo(() => {
        return employees.filter(emp => {
            const fullName = formatEmployeeFullName(emp, '').toLowerCase();
            const matchesSearch = fullName.includes(searchTerm.toLowerCase()) || 
                                 (emp.jobInfo?.designation || '').toLowerCase().includes(searchTerm.toLowerCase());
            const matchesDept = selectedDept === 'All' || emp.jobInfo?.department === selectedDept;
            return matchesSearch && matchesDept;
        });
    }, [employees, searchTerm, selectedDept]);

    const handleCallClick = (emp: Employee) => {
        setAlertConfig({
            isOpen: true,
            title: `Contact ${emp.firstName}`,
            message: `Choose how you'd like to reach ${formatEmployeeFullName(emp, 'Employee')}.`,
            type: 'contact',
            contactInfo: {
                phone: emp.phone,
                email: emp.workEmail,
                name: formatEmployeeFullName(emp, 'Employee')
            },
            onConfirm: () => {
                window.location.href = `tel:${emp.phone}`;
            }
        });
    };

    const SkeletonCard = () => (
        <div className="bg-white rounded-3xl p-6 border border-slate-200/60 shadow-sm animate-pulse">
            <div className="flex flex-col items-center">
                <div className="w-24 h-24 rounded-full bg-slate-200 mb-4" />
                <div className="h-5 bg-slate-200 rounded w-32 mb-2" />
                <div className="h-3 bg-slate-100 rounded w-24 mb-6" />
                <div className="w-full flex gap-2 pt-4 border-t border-slate-50">
                    <div className="h-10 bg-slate-100 rounded-xl flex-1" />
                    <div className="h-10 bg-slate-100 rounded-xl flex-1" />
                </div>
            </div>
        </div>
    );

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fadeIn space-y-8">
            <CompanyProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} />
            
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 sm:gap-6">
                <div className="space-y-2">
                    <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">Organization Directory</h1>
                    <p className="text-slate-500 font-medium tracking-wide">Connect with your colleagues across the company.</p>
                </div>

                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => setShowProfileModal(true)}
                        className="px-4 py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold rounded-xl text-sm transition-all shadow-sm border border-indigo-200 flex items-center gap-2"
                    >
                        <Building2 size={16} />
                        <span className="hidden sm:inline">Company Profile</span>
                    </button>
                    <button 
                        onClick={() => window.open('https://itconsultingandservices.sharepoint.com/:w:/s/Docs/IQBbHj4ttmqhSqwx7fsHqj3CAdCFc4H_TJI0-QJk9EnA3uk?e=gJh0AI', '_blank')}
                        className="px-4 py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold rounded-xl text-sm transition-all shadow-sm border border-indigo-200 flex items-center gap-2"
                    >
                        <FileText size={16} />
                        <span className="hidden sm:inline">Company Policy</span>
                    </button>
                    <div className="h-8 w-px bg-slate-200 mx-1 hidden sm:block"></div>
                    
                    <button 
                        onClick={() => setViewMode('grid')}
                        className={`p-2.5 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white text-slate-400 hover:text-slate-600 border border-slate-200'}`}
                    >
                        <Grid size={20} />
                    </button>
                    <button 
                        onClick={() => setViewMode('list')}
                        className={`p-2.5 rounded-xl transition-all ${viewMode === 'list' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white text-slate-400 hover:text-slate-600 border border-slate-200'}`}
                    >
                        <ListIcon size={20} />
                    </button>
                </div>
            </div>

            {/* Controls Bar */}
            <div className="bg-white/80 backdrop-blur-md p-4 rounded-[2rem] border border-slate-200/60 shadow-sm flex flex-col lg:flex-row gap-4">
                <div className="relative flex-1 group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={20} />
                    <input 
                        type="text"
                        placeholder="Search by name or designation..."
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50/50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-medium"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {searchTerm && (
                        <button 
                            onClick={() => setSearchTerm('')}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                            <X size={18} />
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-2 lg:pb-0 px-1 scrollbar-hide no-scrollbar">
                    <div className="flex items-center gap-2 shrink-0 pr-4 border-r border-slate-200 mr-2">
                        <Filter size={16} className="text-slate-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Department</span>
                    </div>
                    {departments.map((dept) => (
                        <button
                            key={dept}
                            onClick={() => setSelectedDept(dept)}
                            className={`px-5 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                                selectedDept === dept 
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm' 
                                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                            }`}
                        >
                            {dept}
                        </button>
                    ))}
                </div>
            </div>

            {/* Results Section */}
            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {[1,2,3,4,5,6,7,8].map(i => <SkeletonCard key={i} />)}
                </div>
            ) : filteredEmployees.length > 0 ? (
                viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {filteredEmployees.map((emp) => (
                            <div key={emp.employeeId} className="group bg-white rounded-3xl p-6 border border-slate-200/60 shadow-sm hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300 relative overflow-hidden">
                                {/* Aesthetic Background Blur Decor */}
                                <div className="absolute -top-12 -right-12 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />
                                
                                <div className="flex flex-col items-center relative z-10 text-center">
                                    <div className="relative mb-4">
                                        <Avatar 
                                            src={getAvatarUrl(emp)} 
                                            firstName={emp.firstName} 
                                            lastName={emp.lastName} 
                                            className="w-24 h-24 ring-4 ring-slate-50 group-hover:ring-indigo-100 transition-all duration-500"
                                        />
                                        <div className="absolute bottom-1 right-1 w-6 h-6 bg-white rounded-full flex items-center justify-center border-4 border-white">
                                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                                        </div>
                                    </div>
                                    
                                    <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                                        {formatEmployeeFullName(emp, emp.employeeId)}
                                    </h3>
                                    <p className="text-indigo-600 text-xs font-black uppercase tracking-widest mt-1">
                                        {emp.jobInfo?.designation || 'Staff Member'}
                                    </p>
                                    
                                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-50 rounded-full mt-3 border border-slate-100 group-hover:bg-indigo-50 group-hover:border-indigo-100 transition-colors">
                                        <Building2 size={12} className="text-slate-400 group-hover:text-indigo-500" />
                                        <span className="text-[10px] font-bold text-slate-500 group-hover:text-indigo-600">
                                            {emp.jobInfo?.department || 'Unassigned'}
                                        </span>
                                    </div>

                                    <div className="w-full grid grid-cols-2 gap-3 pt-6 mt-6 border-t border-slate-50">
                                        {emp.workEmail ? (
                                            <a 
                                                href={`mailto:${emp.workEmail}`}
                                                className="flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-slate-50 text-slate-600 hover:bg-indigo-600 hover:text-white transition-all text-xs font-bold group/btn active:scale-95"
                                            >
                                                <Mail size={14} className="group-hover/btn:scale-110 transition-transform" />
                                                Email
                                            </a>
                                        ) : (
                                            <div className="flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-slate-100/50 text-slate-300 transition-all text-xs font-bold cursor-not-allowed">
                                                <Mail size={14} /> 
                                                N/A
                                            </div>
                                        )}

                                        {emp.phone ? (
                                            <button 
                                                onClick={() => handleCallClick(emp)}
                                                className="flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-slate-50 text-slate-600 hover:bg-emerald-600 hover:text-white transition-all text-xs font-bold group/btn active:scale-95"
                                            >
                                                <Phone size={14} className="group-hover/btn:scale-110 transition-transform" />
                                                Call
                                            </button>
                                        ) : (
                                            <div className="flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-slate-100/50 text-slate-300 transition-all text-xs font-bold cursor-not-allowed">
                                                <Phone size={14} /> 
                                                N/A
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-white rounded-[2rem] border border-slate-200/60 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                <tr>
                                    <th className="px-6 py-4">Employee</th>
                                    <th className="px-6 py-4">Role & Team</th>
                                    <th className="px-6 py-4">Contact Details</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                                {filteredEmployees.map((emp) => (
                                    <tr key={emp.employeeId} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <Avatar 
                                                    src={getAvatarUrl(emp)} 
                                                    firstName={emp.firstName} 
                                                    lastName={emp.lastName} 
                                                    className="w-10 h-10 group-hover:scale-110 transition-transform"
                                                />
                                                <div>
                                                    <p className="text-sm font-bold text-slate-900">{formatEmployeeFullName(emp, emp.employeeId)}</p>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{emp.employeeId}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="space-y-1">
                                                <p className="text-sm font-bold text-indigo-600">{emp.jobInfo?.designation || 'Staff'}</p>
                                                <p className="text-xs text-slate-500 flex items-center gap-1.5">
                                                    <Building2 size={12} className="text-slate-300" />
                                                    {emp.jobInfo?.department || 'Unassigned'}
                                                </p>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="space-y-1">
                                                {emp.workEmail && (
                                                    <p className="text-xs text-slate-600 flex items-center gap-1.5 font-bold">
                                                        <Mail size={12} className="text-slate-300" />
                                                        {emp.workEmail}
                                                    </p>
                                                )}
                                                {emp.phone && (
                                                    <p className="text-xs text-slate-500 flex items-center gap-1.5">
                                                        <Phone size={12} className="text-slate-300" />
                                                        {emp.phone}
                                                    </p>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {emp.workEmail && (
                                                    <a href={`mailto:${emp.workEmail}`} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all">
                                                        <Mail size={18} />
                                                    </a>
                                                )}
                                                {emp.phone && (
                                                    <button 
                                                        onClick={() => handleCallClick(emp)}
                                                        className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                                                    >
                                                        <Phone size={18} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        </div>
                    </div>
                )
            ) : (
                <div className="py-20 text-center bg-white rounded-[3rem] border border-dashed border-slate-200 shadow-sm">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
                        <User size={32} className="text-slate-300" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800">No matches found</h3>
                    <p className="text-slate-500 mt-2">Try adjusting your search or filters to find what you're looking for.</p>
                    <button 
                        onClick={() => { setSearchTerm(''); setSelectedDept('All'); }}
                        className="mt-6 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all active:scale-95"
                    >
                        Reset All Filters
                    </button>
                </div>
            )}

            <AlertModal 
                isOpen={alertConfig.isOpen}
                onClose={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                contactInfo={alertConfig.contactInfo}
                onConfirm={alertConfig.onConfirm}
                confirmText="Call Now"
            />
        </div>
    );
};

export default Directory;
