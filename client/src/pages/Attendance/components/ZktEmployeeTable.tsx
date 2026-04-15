import { useState, useMemo } from 'react';
import { Search, ChevronUp, ChevronDown, Users, Building2 } from 'lucide-react';
import type { ZktEmployee } from '../../../services/zktService';

interface ZktEmployeeTableProps {
    employees: ZktEmployee[];
    loading?: boolean;
    todayInCodes?: Set<string>;   // emp_codes that have punched IN today
}

type SortKey = 'emp_code' | 'first_name' | 'department';
type SortDir = 'asc' | 'desc';

const SkeletonRow = () => (
    <tr className="border-b border-slate-50 animate-pulse">
        <td className="px-4 py-3"><div className="h-3 w-16 bg-slate-100 rounded" /></td>
        <td className="px-4 py-3"><div className="h-3 w-32 bg-slate-100 rounded" /></td>
        <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-100 rounded" /></td>
        <td className="px-4 py-3"><div className="h-5 w-14 bg-slate-100 rounded-lg" /></td>
    </tr>
);

const ZktEmployeeTable = ({ employees, loading = false, todayInCodes = new Set() }: ZktEmployeeTableProps) => {
    const [search, setSearch]         = useState('');
    const [deptFilter, setDeptFilter] = useState('');
    const [sortKey, setSortKey]       = useState<SortKey>('emp_code');
    const [sortDir, setSortDir]       = useState<SortDir>('asc');

    // Collect unique departments
    const departments = useMemo(() => {
        const depts = new Set<string>();
        employees.forEach(e => { if (e.department_name) depts.add(e.department_name); });
        return Array.from(depts).sort();
    }, [employees]);

    // Filter + sort
    const visible = useMemo(() => {
        let list = employees;
        if (search) {
            const q = search.toLowerCase();
            list = list.filter(e =>
                e.emp_code.toLowerCase().includes(q) ||
                e.first_name.toLowerCase().includes(q) ||
                (e.last_name ?? '').toLowerCase().includes(q)
            );
        }
        if (deptFilter) {
            list = list.filter(e => e.department_name === deptFilter);
        }
        return [...list].sort((a, b) => {
            let av = '', bv = '';
            if (sortKey === 'emp_code')    { av = a.emp_code;   bv = b.emp_code; }
            if (sortKey === 'first_name')  { av = a.first_name; bv = b.first_name; }
            if (sortKey === 'department')  { av = a.department_name ?? ''; bv = b.department_name ?? ''; }
            return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        });
    }, [employees, search, deptFilter, sortKey, sortDir]);

    const toggleSort = (key: SortKey) => {
        if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('asc'); }
    };

    const SortIcon = ({ col }: { col: SortKey }) => {
        if (col !== sortKey) return <ChevronUp size={12} className="text-slate-300" />;
        return sortDir === 'asc' ? <ChevronUp size={12} className="text-indigo-500" /> : <ChevronDown size={12} className="text-indigo-500" />;
    };

    const presentCount = employees.filter(e => todayInCodes.has(e.emp_code)).length;
    const absentCount  = employees.length - presentCount;

    return (
        <div className="space-y-4">
            {/* Summary pills */}
            <div className="flex gap-3 flex-wrap">
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-xl text-sm">
                    <Users size={14} className="text-emerald-500" />
                    <span className="font-bold text-emerald-700">{presentCount}</span>
                    <span className="text-emerald-600">Present</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-rose-50 border border-rose-100 rounded-xl text-sm">
                    <Users size={14} className="text-rose-500" />
                    <span className="font-bold text-rose-700">{absentCount}</span>
                    <span className="text-rose-600">Absent</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm ml-auto">
                    <Building2 size={14} className="text-slate-400" />
                    <span className="text-slate-500">{departments.length} department{departments.length !== 1 ? 's' : ''}</span>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[180px]">
                    <Search size={14} className="absolute left-3 top-3 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search ID or name…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                </div>
                <select
                    value={deptFilter}
                    onChange={e => setDeptFilter(e.target.value)}
                    className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                >
                    <option value="">All Departments</option>
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="text-left px-4 py-3 font-semibold text-slate-600 cursor-pointer select-none" onClick={() => toggleSort('emp_code')}>
                                <span className="flex items-center gap-1">Employee ID <SortIcon col="emp_code" /></span>
                            </th>
                            <th className="text-left px-4 py-3 font-semibold text-slate-600 cursor-pointer select-none" onClick={() => toggleSort('first_name')}>
                                <span className="flex items-center gap-1">Name <SortIcon col="first_name" /></span>
                            </th>
                            <th className="text-left px-4 py-3 font-semibold text-slate-600 cursor-pointer select-none" onClick={() => toggleSort('department')}>
                                <span className="flex items-center gap-1">Department <SortIcon col="department" /></span>
                            </th>
                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading
                            ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                            : visible.map(emp => {
                                const isPresent = todayInCodes.has(emp.emp_code);
                                return (
                                    <tr key={emp.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                        <td className="px-4 py-3 font-mono font-bold text-slate-800 text-xs">{emp.emp_code}</td>
                                        <td className="px-4 py-3 font-semibold text-slate-700">
                                            {emp.first_name} {emp.last_name ?? ''}
                                        </td>
                                        <td className="px-4 py-3 text-slate-500">
                                            {emp.department_name ?? emp.department ?? '—'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                                                isPresent
                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                    : 'bg-rose-50 text-rose-600 border-rose-200'
                                            }`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${isPresent ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                                                {isPresent ? 'Present' : 'Absent'}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })
                        }
                        {!loading && !visible.length && (
                            <tr>
                                <td colSpan={4} className="px-4 py-10 text-center text-slate-400 text-sm">
                                    No employees match your filter.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            {!loading && (
                <p className="text-xs text-slate-400 text-right">
                    Showing {visible.length} of {employees.length} employees
                </p>
            )}
        </div>
    );
};

export default ZktEmployeeTable;
