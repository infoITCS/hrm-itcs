import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../utils/api';
import { Search, FileText, User, RefreshCw, AlertCircle, Edit3, Download, X, Check, Calculator, Calendar, ChevronDown, Clock } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';

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

const AllLeaveBalances = ({ refreshTrigger = 0 }: { refreshTrigger?: number }) => {
    const { role } = usePermissions();
    const { showToast } = useToast();
    const canEdit = ['super-admin', 'admin', 'hr'].includes(role);

    const [balances, setBalances] = useState<EmployeeBalance[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState<string>('all');
    const [showMonthDropdown, setShowMonthDropdown] = useState(false);
    const [showYearDropdown, setShowYearDropdown] = useState(false);

    const MONTHS = [
        { value: 'all', label: 'All Months', fullLabel: 'All Months (Yearly)' },
        { value: '1', label: 'Jan', fullLabel: 'January' },
        { value: '2', label: 'Feb', fullLabel: 'February' },
        { value: '3', label: 'Mar', fullLabel: 'March' },
        { value: '4', label: 'Apr', fullLabel: 'April' },
        { value: '5', label: 'May', fullLabel: 'May' },
        { value: '6', label: 'Jun', fullLabel: 'June' },
        { value: '7', label: 'Jul', fullLabel: 'July' },
        { value: '8', label: 'Aug', fullLabel: 'August' },
        { value: '9', label: 'Sep', fullLabel: 'September' },
        { value: '10', label: 'Oct', fullLabel: 'October' },
        { value: '11', label: 'Nov', fullLabel: 'November' },
        { value: '12', label: 'Dec', fullLabel: 'December' },
    ];

    const activeMonthObj = MONTHS.find(m => m.value === selectedMonth) || MONTHS[0];
    const currentMonthLabel = activeMonthObj.label;

    // Edit Starting Balance Modal State
    const [editingEmp, setEditingEmp] = useState<EmployeeBalance | null>(null);
    const [editBalances, setEditBalances] = useState<Array<{ leaveTypeCode: string; leaveTypeName: string; total: number | string; used: number | string }>>([]);
    const [saving, setSaving] = useState(false);

    const token = localStorage.getItem('token');

    const fetchAllBalances = async () => {
        setLoading(true);
        setError(null);
        try {
            const monthParam = selectedMonth !== 'all' ? `&month=${selectedMonth}` : '';
            const res = await fetch(`${api.baseURL}/api/leaves/balances/all?year=${selectedYear}${monthParam}`, {
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
    }, [selectedYear, selectedMonth, refreshTrigger]);

    const openEditModal = (emp: EmployeeBalance) => {
        setEditingEmp(emp);
        setEditBalances(
            emp.balances.map(b => ({
                leaveTypeCode: b.leaveTypeCode,
                leaveTypeName: b.leaveTypeName,
                total: b.total ?? 0,
                used: b.used ?? 0
            }))
        );
    };

    const handleSaveBalance = async () => {
        if (!editingEmp) return;
        setSaving(true);
        try {
            const targetId = editingEmp.employeeId || editingEmp.userId;
            const res = await fetch(`${api.baseURL}/api/leaves/balance/${targetId}`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    year: selectedYear,
                    balances: editBalances.map(b => ({
                        leaveTypeCode: b.leaveTypeCode,
                        total: Number(b.total) || 0,
                        used: Number(b.used) || 0
                    }))
                })
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.message || 'Failed to update leave balance');
            }
            showToast(`Leave balances for ${editingEmp.name} saved successfully!`, 'success');
            setEditingEmp(null);
            fetchAllBalances();
        } catch (err: any) {
            showToast(err.message || 'Error saving leave balance', 'error');
        } finally {
            setSaving(false);
        }
    };

    const exportToCsv = () => {
        if (balances.length === 0) {
            showToast('No balance data to export.', 'warning');
            return;
        }

        const isMonthly = selectedMonth !== 'all';

        const leaveHeaders = leaveTypesHeader.flatMap(t => {
            const cleanName = t.name.replace(/ leave/gi, '');
            if (isMonthly) {
                return [
                    `"${cleanName} Total"`,
                    `"${cleanName} ${currentMonthLabel} Used"`,
                    `"${cleanName} Year Used"`,
                    `"${cleanName} Remaining"`
                ];
            }
            return [
                `"${cleanName} Total"`,
                `"${cleanName} Used"`,
                `"${cleanName} Remaining"`
            ];
        });

        const headers = [
            '"Employee ID"',
            '"Name"',
            ...leaveHeaders
        ];

        const rows = filteredBalances.map(emp => {
            const leaveCols = leaveTypesHeader.flatMap(t => {
                const b = emp.balances.find(item => item.leaveTypeCode === t.code);
                const total = b ? Number(b.total) || 0 : 0;
                const used = b ? Number(b.used) || 0 : 0;
                const monthUsed = b ? Number((b as any).monthUsed) || 0 : 0;
                const remaining = Math.max(0, total - used);
                if (isMonthly) {
                    return [total, monthUsed, used, remaining];
                }
                return [total, used, remaining];
            });

            return [
                `"${emp.employeeId || ''}"`,
                `"${emp.name.replace(/"/g, '""')}"`,
                ...leaveCols
            ].join(',');
        });

        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        const filename = isMonthly 
            ? `Leave_Balances_${selectedYear}_${currentMonthLabel}.csv`
            : `Leave_Balances_${selectedYear}.csv`;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

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
        <div className="space-y-4">
            {/* Error Message */}
            {error && (
                <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-center gap-2 text-rose-700 animate-in fade-in">
                    <AlertCircle size={16} />
                    <span className="text-xs font-bold">{error}</span>
                </div>
            )}

            {/* Unified Main Card */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                {/* Seamless Card Header & Controls Toolbar */}
                <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-3 bg-white">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0">
                            <FileText size={20} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                                <h2 className="text-sm sm:text-base font-bold text-slate-800 whitespace-nowrap">Employee Leave Balances</h2>
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-100/80 whitespace-nowrap">
                                    {filteredBalances.length} {filteredBalances.length === 1 ? 'Employee' : 'Employees'}
                                </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5 truncate sm:whitespace-normal">
                                {selectedMonth === 'all' 
                                    ? 'Yearly total quotas and consumption details' 
                                    : `Monthly leaves taken in ${currentMonthLabel} ${selectedYear} & annual balance`}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
                        {/* Search Input */}
                        <div className="relative w-full sm:w-44 lg:w-48">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                            <input
                                type="text"
                                placeholder="Search..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200/80 rounded-xl pl-8 pr-3 py-1.5 text-xs focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all font-medium text-slate-700 placeholder:text-slate-400"
                            />
                        </div>

                        {/* Custom Sleek Month Selector */}
                        <div className="relative shrink-0">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowMonthDropdown(prev => !prev);
                                    setShowYearDropdown(false);
                                }}
                                className={`inline-flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100/90 border rounded-xl px-2.5 py-1.5 text-xs font-bold transition-all ${
                                    showMonthDropdown 
                                        ? 'border-indigo-400 ring-4 ring-indigo-500/10 text-indigo-700 bg-white' 
                                        : 'border-slate-200/80 text-slate-700'
                                }`}
                                title="Filter by Month"
                            >
                                <Calendar size={13} className="text-indigo-600" />
                                <span>{selectedMonth === 'all' ? 'All Months' : activeMonthObj.fullLabel}</span>
                                <ChevronDown size={12} className={`text-slate-400 transition-transform duration-200 ${showMonthDropdown ? 'rotate-180 text-indigo-600' : ''}`} />
                            </button>

                            {showMonthDropdown && (
                                <>
                                    <div 
                                        className="fixed inset-0 z-40 bg-black/5" 
                                        onClick={() => setShowMonthDropdown(false)} 
                                    />
                                    <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-100 p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
                                        <div className="flex items-center justify-between px-1 pb-2 border-b border-slate-100 mb-2">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                                                Filter By Period
                                            </span>
                                            {selectedMonth !== 'all' && (
                                                <button
                                                    onClick={() => {
                                                        setSelectedMonth('all');
                                                        setShowMonthDropdown(false);
                                                    }}
                                                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800"
                                                >
                                                    Reset
                                                </button>
                                            )}
                                        </div>

                                        {/* All Months Option */}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedMonth('all');
                                                setShowMonthDropdown(false);
                                            }}
                                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all mb-2 ${
                                                selectedMonth === 'all'
                                                    ? 'bg-indigo-600 text-white shadow-sm'
                                                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
                                            }`}
                                        >
                                            <span className="flex items-center gap-2">
                                                <Calendar size={13} className={selectedMonth === 'all' ? 'text-white' : 'text-indigo-600'} />
                                                All Months (Yearly Summary)
                                            </span>
                                            {selectedMonth === 'all' && <Check size={14} />}
                                        </button>

                                        {/* 12 Months Grid */}
                                        <div className="grid grid-cols-3 gap-1.5 pt-1">
                                            {MONTHS.filter(m => m.value !== 'all').map(m => {
                                                const isSelected = selectedMonth === m.value;
                                                return (
                                                    <button
                                                        key={m.value}
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedMonth(m.value);
                                                            setShowMonthDropdown(false);
                                                        }}
                                                        className={`py-2 px-2 rounded-xl text-xs font-bold transition-all text-center ${
                                                            isSelected
                                                                ? 'bg-indigo-600 text-white shadow-xs'
                                                                : 'bg-slate-50/80 hover:bg-indigo-50/70 hover:text-indigo-700 text-slate-700'
                                                        }`}
                                                    >
                                                        {m.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Custom Sleek Year Selector */}
                        <div className="relative shrink-0">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowYearDropdown(prev => !prev);
                                    setShowMonthDropdown(false);
                                }}
                                className={`inline-flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100/90 border rounded-xl px-2.5 py-1.5 text-xs font-bold transition-all ${
                                    showYearDropdown 
                                        ? 'border-indigo-400 ring-4 ring-indigo-500/10 text-indigo-700 bg-white' 
                                        : 'border-slate-200/80 text-slate-700'
                                }`}
                                title="Filter by Year"
                            >
                                <Clock size={13} className="text-indigo-600" />
                                <span>{selectedYear}</span>
                                <ChevronDown size={12} className={`text-slate-400 transition-transform duration-200 ${showYearDropdown ? 'rotate-180 text-indigo-600' : ''}`} />
                            </button>

                            {showYearDropdown && (
                                <>
                                    <div 
                                        className="fixed inset-0 z-40 bg-black/5" 
                                        onClick={() => setShowYearDropdown(false)} 
                                    />
                                    <div className="absolute right-0 top-full mt-2 w-36 bg-white rounded-2xl shadow-xl border border-slate-100 p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                                        {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(y => (
                                            <button
                                                key={y}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedYear(y);
                                                    setShowYearDropdown(false);
                                                }}
                                                className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                                    selectedYear === y 
                                                        ? 'bg-indigo-50 text-indigo-700' 
                                                        : 'text-slate-700 hover:bg-slate-50'
                                                }`}
                                            >
                                                {y}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Export CSV Button */}
                        <button
                            onClick={exportToCsv}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-50 hover:bg-slate-100/80 text-slate-700 rounded-xl border border-slate-200/80 text-xs font-bold transition-all shadow-2xs shrink-0"
                            title="Export Leave Report to CSV"
                        >
                            <Download size={13} className="text-indigo-600" />
                            <span>CSV</span>
                        </button>

                        {/* Refresh Button */}
                        <button
                            onClick={fetchAllBalances}
                            className="p-1.5 hover:bg-slate-100/80 text-slate-400 hover:text-indigo-600 rounded-xl border border-slate-200/80 transition-colors shrink-0 bg-slate-50 shadow-2xs"
                            title="Refresh Data"
                        >
                            <RefreshCw size={13} className={loading ? 'animate-spin text-indigo-600' : ''} />
                        </button>
                    </div>
                </div>

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
                                    {canEdit && (
                                        <th className="py-3 px-6 font-bold text-slate-500 uppercase tracking-wider text-center">Actions</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredBalances.map(item => (
                                    <tr key={item.userId || item.employeeId} className="hover:bg-slate-50/20 transition-all duration-150">
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
                                            const isMonthly = selectedMonth !== 'all';
                                            const monthDays = Number((bal as any).monthUsed) || 0;
                                            
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
                                                        {isMonthly ? (
                                                            <>
                                                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border tracking-wide shadow-xs min-w-[70px] ${
                                                                    monthDays > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-500 border-slate-200'
                                                                }`}>
                                                                    {monthDays}d in {currentMonthLabel}
                                                                </span>
                                                                <span className="text-[9px] text-slate-400 mt-1 font-bold">
                                                                    {bal.available} avail ({bal.used} yr)
                                                                </span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border tracking-wide shadow-xs min-w-[65px] ${colorClass}`}>
                                                                    {bal.available} / {bal.total}
                                                                </span>
                                                                <span className="text-[9px] text-slate-400 mt-1 font-bold">
                                                                    {bal.used} used {bal.pending > 0 && `(${bal.pending} pend)`}
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            );
                                        })}
                                        {canEdit && (
                                            <td className="py-4 px-6 text-center">
                                                <button
                                                    onClick={() => openEditModal(item)}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-bold transition-colors"
                                                    title="Adjust Starting Balance / Quota"
                                                >
                                                    <Edit3 size={12} />
                                                    Edit
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}

                                {filteredBalances.length === 0 && (
                                    <tr>
                                        <td colSpan={3 + leaveTypesHeader.length} className="py-12 text-center text-slate-400 font-bold">
                                            No employee leave balances matching your query found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Edit / Starting Balance Modal */}
            {editingEmp && createPortal(
                <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
                    <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 my-auto">
                        {/* Modal Header */}
                        <div className="p-6 bg-gradient-to-r from-indigo-600 to-purple-600 text-white flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white/10 rounded-xl">
                                    <Calculator size={20} />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold">Adjust Leave Balances ({selectedYear})</h3>
                                    <p className="text-xs text-white/80">{editingEmp.name} ({editingEmp.employeeId || 'No ID'})</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setEditingEmp(null)}
                                className="p-1.5 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 space-y-4 overflow-y-auto flex-1">
                            <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-2xl text-[11px] text-indigo-800 leading-relaxed">
                                Enter the <strong>Total Allowed Quota</strong> and <strong>Already Availed / Used Days</strong> (from the old portal). The remaining available days are calculated automatically.
                            </div>

                            <div className="space-y-3">
                                {editBalances.map((b, idx) => {
                                    const available = Math.max(0, (Number(b.total) || 0) - (Number(b.used) || 0));
                                    return (
                                        <div key={b.leaveTypeCode} className="p-4 bg-slate-50/80 rounded-2xl border border-slate-150 space-y-2.5">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-bold text-slate-800 capitalize">
                                                    {b.leaveTypeName.toLowerCase().includes('leave') ? b.leaveTypeName : `${b.leaveTypeName} Leave`}
                                                </span>
                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-700">
                                                    Available: {available} Days
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Total Quota (Days)</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.5"
                                                        placeholder="0"
                                                        value={b.total === '' ? '' : b.total}
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            setEditBalances(prev => prev.map((item, i) => i === idx ? { ...item, total: val } : item));
                                                        }}
                                                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Used (Old Portal Availed)</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.5"
                                                        placeholder="0"
                                                        value={b.used === '' ? '' : b.used}
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            setEditBalances(prev => prev.map((item, i) => i === idx ? { ...item, used: val } : item));
                                                        }}
                                                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={() => setEditingEmp(null)}
                                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveBalance}
                                disabled={saving}
                                className="inline-flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm disabled:opacity-50"
                            >
                                <Check size={14} />
                                {saving ? 'Saving...' : 'Save Balances'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default AllLeaveBalances;
