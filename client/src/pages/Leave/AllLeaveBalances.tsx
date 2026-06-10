import { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { Search, FileText, User, RefreshCw, AlertCircle } from 'lucide-react';

interface LeaveBalanceItem {
    leaveTypeCode: string;
    leaveTypeName: string;
    total: number;
    used: number;
    pending: number;
    available: number;
}

interface EmployeeBalance {
    employeeId: string;
    userId: string;
    name: string;
    email: string;
    designation: string;
    department: string;
    balances: LeaveBalanceItem[];
}

const AllLeaveBalances = () => {
    const [balances, setBalances] = useState<EmployeeBalance[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    const token = localStorage.getItem('token');

    const fetchAllBalances = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${api.baseURL}/api/leaves/balances/all?year=${selectedYear}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const result = await res.json();
                setBalances(result.data || []);
            } else {
                const errData = await res.json();
                throw new Error(errData.message || 'Failed to load balances');
            }
        } catch (err: any) {
            console.error('Error fetching all balances:', err);
            setError(err.message || 'Could not fetch leave balances of all employees.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAllBalances();
    }, [selectedYear]);

    const filteredBalances = balances.filter(item => {
        const name = (item.name || '').toLowerCase();
        const empId = (item.employeeId || '').toLowerCase();
        const email = (item.email || '').toLowerCase();
        const designation = (item.designation || '').toLowerCase();
        const department = (item.department || '').toLowerCase();
        const query = searchQuery.toLowerCase();

        return name.includes(query) || 
               empId.includes(query) || 
               email.includes(query) || 
               designation.includes(query) || 
               department.includes(query);
    });

    // Extract all unique active leave types from the balance lists to build table headers dynamically
    const leaveTypesHeader = balances.length > 0 
        ? balances[0].balances.map(b => ({ code: b.leaveTypeCode, name: b.leaveTypeName }))
        : [];

    return (
        <div className="space-y-6 mt-6">
            {/* Header / Search Controls */}
            <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                        <FileText size={18} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">Employee Leave Balances</h2>
                        <p className="text-xs text-slate-400">View current leave quotas and consumption details for all employees</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Search Input */}
                    <div className="relative min-w-[240px]">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input
                            type="text"
                            placeholder="Search employee, department, design..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-9 pr-3 py-2 text-xs focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all font-medium text-slate-600"
                        />
                    </div>

                    {/* Year Selector */}
                    <select
                        value={selectedYear}
                        onChange={e => setSelectedYear(Number(e.target.value))}
                        className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-xs font-bold text-slate-600 outline-none cursor-pointer focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500"
                    >
                        <option value={new Date().getFullYear()}>{new Date().getFullYear()}</option>
                        <option value={new Date().getFullYear() - 1}>{new Date().getFullYear() - 1}</option>
                        <option value={new Date().getFullYear() + 1}>{new Date().getFullYear() + 1}</option>
                    </select>

                    {/* Refresh Button */}
                    <button
                        onClick={fetchAllBalances}
                        className="p-2 hover:bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-xl border border-slate-100 transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Error Message */}
            {error && (
                <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-center gap-2 text-rose-700 animate-in fade-in">
                    <AlertCircle size={16} />
                    <span className="text-xs font-bold">{error}</span>
                </div>
            )}

            {/* Main Table Card */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="flex flex-col items-center justify-center min-h-[300px] space-y-3">
                        <div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                        <p className="text-xs text-slate-400 font-bold">Loading leave balances...</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="bg-slate-50/50">
                                    <th className="py-3 px-6 font-bold text-slate-500 uppercase tracking-wider">Employee</th>
                                    <th className="py-3 px-6 font-bold text-slate-500 uppercase tracking-wider">Job Info</th>
                                    {leaveTypesHeader.map(type => (
                                        <th key={type.code} className="py-3 px-6 font-bold text-slate-500 uppercase tracking-wider text-center capitalize">
                                            {type.name.toLowerCase().includes('leave') ? type.name : `${type.name} Leave`}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredBalances.map(item => (
                                    <tr key={item.userId} className="hover:bg-slate-50/20 transition-all duration-150">
                                        <td className="py-4 px-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-sm shrink-0 border border-indigo-100">
                                                    {item.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || <User size={14} />}
                                                </div>
                                                <div className="min-w-0">
                                                    <span className="block font-bold text-slate-700 text-sm truncate">{item.name}</span>
                                                    <span className="block text-[10px] text-slate-400 font-medium">{item.email}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-4 px-6">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-slate-700 text-[11px] capitalize">{item.designation}</span>
                                                <span className="text-[10px] text-slate-400 font-bold capitalize">{item.department}</span>
                                                <span className="text-[9px] text-indigo-500 font-black tracking-wider mt-0.5">{item.employeeId || 'No ID'}</span>
                                            </div>
                                        </td>
                                        {item.balances.map(bal => {
                                            const availablePercent = bal.total > 0 ? (bal.available / bal.total) * 100 : 0;
                                            
                                            // Dynamic color based on availability
                                            let colorClass = 'bg-slate-50 text-slate-600 border-slate-150';
                                            if (availablePercent > 50) {
                                                colorClass = 'bg-emerald-50 text-emerald-700 border-emerald-150';
                                            } else if (availablePercent > 20) {
                                                colorClass = 'bg-amber-50 text-amber-700 border-amber-150';
                                            } else if (bal.total > 0) {
                                                colorClass = 'bg-rose-50 text-rose-700 border-rose-150';
                                            }

                                            return (
                                                <td key={bal.leaveTypeCode} className="py-4 px-6 text-center">
                                                    <div className="inline-flex flex-col items-center">
                                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border tracking-wide shadow-sm min-w-[65px] ${colorClass}`}>
                                                            {bal.available} / {bal.total}
                                                        </span>
                                                        <span className="text-[9px] text-slate-400 mt-1 font-bold">
                                                            {bal.used} used {bal.pending > 0 && `(${bal.pending} pend)`}
                                                        </span>
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}

                                {filteredBalances.length === 0 && (
                                    <tr>
                                        <td colSpan={2 + leaveTypesHeader.length} className="py-12 text-center text-slate-400 font-bold">
                                            No employee leave balances matching your query found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AllLeaveBalances;
