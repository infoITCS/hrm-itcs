import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { Plus, Edit2, Save, User, FileText, Check, AlertCircle, ChevronDown, Search } from 'lucide-react';

interface LeaveType {
    _id: string;
    name: string;
    code: string;
    defaultDays: number;
    isPaid: boolean;
    isActive: boolean;
    sandwichRuleEnabled: boolean;
}

interface Employee {
    _id: string;
    employeeId: string;
    userId: string;
    firstName: string;
    lastName: string;
}

const ManageLeaveTypes = () => {
    // Leave categories state
    const [types, setTypes] = useState<LeaveType[]>([]);
    const [loadingTypes, setLoadingTypes] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingType, setEditingType] = useState<LeaveType | null>(null);
    const [formData, setFormData] = useState({ name: '', defaultDays: 10, isPaid: true, isActive: true, sandwichRuleEnabled: true });
    
    // Employee override state
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
    const [empBalance, setEmpBalance] = useState<any>(null);
    const [loadingBalance, setLoadingBalance] = useState(false);
    const [modifiedBalances, setModifiedBalances] = useState<Record<string, number>>({});
    
    // Status notifications
    const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    // Dropdown and Search state
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const token = localStorage.getItem('token');

    const filteredEmployees = employees.filter(e => {
        const fullName = `${e.firstName} ${e.lastName}`.toLowerCase();
        const empId = (e.employeeId || '').toLowerCase();
        const query = searchQuery.toLowerCase();
        return fullName.includes(query) || empId.includes(query);
    });

    const selectEmployee = (empId: string) => {
        handleEmployeeChange(empId);
        setDropdownOpen(false);
        setSearchQuery('');
    };

    // Fetch leave types and employees
    const loadData = async () => {
        setLoadingTypes(true);
        try {
            const [typesRes, empRes] = await Promise.all([
                fetch(`${api.baseURL}/api/leaves/types`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${api.baseURL}/api/employees?limit=1000`, { headers: { Authorization: `Bearer ${token}` } })
            ]);

            if (typesRes.ok) {
                const typesData = await typesRes.json();
                setTypes(typesData.data);
            }
            if (empRes.ok) {
                const empData = await empRes.json();
                setEmployees(empData.employees || []);
            }
        } catch (err) {
            console.error('Failed to load leave configuration data:', err);
        } finally {
            setLoadingTypes(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    // Load selected employee's current balance
    const handleEmployeeChange = async (empId: string) => {
        const emp = employees.find(e => e._id === empId) || null;
        setSelectedEmp(emp);
        setEmpBalance(null);
        setModifiedBalances({});
        if (!emp || !emp.userId) return;

        setLoadingBalance(true);
        try {
            const res = await fetch(`${api.baseURL}/api/leaves/balance?employeeId=${emp.userId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const result = await res.json();
                setEmpBalance(result.data);
                
                // Initialize input form mapping
                const initialMap: Record<string, number> = {};
                result.data?.balances?.forEach((b: any) => {
                    initialMap[b.leaveTypeCode] = b.total;
                });
                setModifiedBalances(initialMap);
            }
        } catch (err) {
            console.error('Failed to load employee balance:', err);
        } finally {
            setLoadingBalance(false);
        }
    };

    // Save customized quota for a single category
    const handleSaveQuotaOverride = async (leaveTypeCode: string, total: number) => {
        if (!selectedEmp || !selectedEmp.userId) return;
        setStatusMsg(null);
        try {
            const res = await fetch(`${api.baseURL}/api/leaves/balance/${selectedEmp.userId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ leaveTypeCode, total })
            });

            if (res.ok) {
                const result = await res.json();
                setEmpBalance(result.data);
                setStatusMsg({ text: `Updated ${leaveTypeCode} quota for ${selectedEmp.firstName} successfully`, type: 'success' });
                setTimeout(() => setStatusMsg(null), 3000);
            } else {
                const errData = await res.json();
                throw new Error(errData.message || 'Failed to update balance');
            }
        } catch (err: any) {
            setStatusMsg({ text: err.message, type: 'error' });
        }
    };

    // Create/Edit Leave Category
    const handleSubmitCategory = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatusMsg(null);
        try {
            const url = editingType 
                ? `${api.baseURL}/api/leaves/types/${editingType._id}`
                : `${api.baseURL}/api/leaves/types`;
            const method = editingType ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                setStatusMsg({ text: `Category ${editingType ? 'updated' : 'created'} successfully`, type: 'success' });
                setShowForm(false);
                setEditingType(null);
                setFormData({ name: '', defaultDays: 10, isPaid: true, isActive: true, sandwichRuleEnabled: true });
                loadData();
                setTimeout(() => setStatusMsg(null), 3000);
            } else {
                const errData = await res.json();
                throw new Error(errData.message || 'Failed to update category');
            }
        } catch (err: any) {
            setStatusMsg({ text: err.message, type: 'error' });
        }
    };

    const handleEditClick = (t: LeaveType) => {
        setEditingType(t);
        setFormData({
            name: t.name,
            defaultDays: t.defaultDays,
            isPaid: t.isPaid,
            isActive: t.isActive,
            sandwichRuleEnabled: t.sandwichRuleEnabled !== false
        });
        setShowForm(true);
    };

    const handleToggleActive = async (t: LeaveType) => {
        try {
            const res = await fetch(`${api.baseURL}/api/leaves/types/${t._id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ isActive: !t.isActive })
            });

            if (res.ok) {
                loadData();
            }
        } catch (err) {
            console.error('Failed to toggle active state:', err);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-6">
            {/* Status Notifications */}
            {statusMsg && (
                <div className={`col-span-12 p-4 rounded-xl flex items-center gap-2 border ${
                    statusMsg.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'
                } animate-in fade-in`}>
                    {statusMsg.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
                    <span className="text-xs font-bold">{statusMsg.text}</span>
                </div>
            )}

            {/* Left Column: Manage Categories */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <FileText className="text-indigo-500" size={18} />
                            Leave Categories
                        </h2>
                        <p className="text-xs text-slate-400">Add or configure system-wide leave types</p>
                    </div>
                    <button
                        onClick={() => {
                            setEditingType(null);
                            setFormData({ name: '', defaultDays: 10, isPaid: true, isActive: true, sandwichRuleEnabled: true });
                            setShowForm(!showForm);
                        }}
                        className="flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                    >
                        <Plus size={14} /> Add New
                    </button>
                </div>

                {showForm && (
                    <form onSubmit={handleSubmitCategory} className="bg-slate-50 p-4 rounded-xl space-y-4 border border-slate-100">
                        <h3 className="text-xs font-black uppercase text-indigo-700 tracking-wider">
                            {editingType ? 'Edit Category' : 'Create Category'}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Category Name</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Hajj Leave"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none text-slate-700 font-bold"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Default Days Quota</label>
                                <input
                                    type="number"
                                    required
                                    min={0}
                                    value={formData.defaultDays}
                                    onChange={e => setFormData({ ...formData, defaultDays: Number(e.target.value) })}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none text-slate-700 font-bold"
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-6">
                            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-600">
                                <input
                                    type="checkbox"
                                    checked={formData.isPaid}
                                    onChange={e => setFormData({ ...formData, isPaid: e.target.checked })}
                                    className="rounded text-indigo-600 focus:ring-indigo-500"
                                />
                                Paid Leave Category
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-600">
                                <input
                                    type="checkbox"
                                    checked={formData.isActive}
                                    onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                                    className="rounded text-indigo-600 focus:ring-indigo-500"
                                />
                                Show to Employee
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-600">
                                <input
                                    type="checkbox"
                                    checked={formData.sandwichRuleEnabled}
                                    onChange={e => setFormData({ ...formData, sandwichRuleEnabled: e.target.checked })}
                                    className="rounded text-indigo-600 focus:ring-indigo-500"
                                />
                                Sandwich Rule Enabled
                            </label>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setShowForm(false)}
                                className="px-3 py-1.5 text-slate-500 hover:text-slate-700 font-bold text-xs bg-white border border-slate-200 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg shadow-sm"
                            >
                                {editingType ? 'Save Changes' : 'Create Category'}
                            </button>
                        </div>
                    </form>
                )}

                {loadingTypes ? (
                    <p className="text-xs text-slate-400 text-center py-6">Loading categories...</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="bg-slate-50/50">
                                    <th className="py-2.5 px-4 font-bold text-slate-500 uppercase tracking-wider">Name</th>
                                    <th className="py-2.5 px-4 font-bold text-slate-500 uppercase tracking-wider text-center">Quota</th>
                                    <th className="py-2.5 px-4 font-bold text-slate-500 uppercase tracking-wider text-center">Type</th>
                                    <th className="py-2.5 px-4 font-bold text-slate-500 uppercase tracking-wider text-center">Show to Employee</th>
                                    <th className="py-2.5 px-4 font-bold text-slate-500 uppercase tracking-wider text-center">Sandwich Rule</th>
                                    <th className="py-2.5 px-4 font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {types.map(t => (
                                    <tr key={t._id} className="hover:bg-slate-50/20">
                                        <td className="py-3 px-4 font-bold text-slate-700">{t.name}</td>
                                        <td className="py-3 px-4 text-center font-medium text-slate-600">{t.defaultDays} Days</td>
                                        <td className="py-3 px-4 text-center">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                t.isPaid ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                                            }`}>
                                                {t.isPaid ? 'Paid' : 'Unpaid'}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <button 
                                                onClick={() => handleToggleActive(t)}
                                                className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all flex items-center justify-center gap-1.5 shadow-sm mx-auto ${
                                                    t.isActive 
                                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' 
                                                        : 'bg-slate-100 border-slate-200 text-slate-400 hover:bg-slate-200'
                                                }`}
                                            >
                                                <span className={`w-1.5 h-1.5 rounded-full ${t.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                                                {t.isActive ? 'ON' : 'OFF'}
                                            </button>
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                t.sandwichRuleEnabled !== false 
                                                    ? 'bg-amber-50 text-amber-700 border border-amber-100' 
                                                    : 'bg-slate-50 text-slate-400 border border-slate-100'
                                            }`}>
                                                {t.sandwichRuleEnabled !== false ? 'ON' : 'OFF'}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-right space-x-1.5">
                                            <button
                                                onClick={() => handleEditClick(t)}
                                                className="p-1 hover:bg-slate-100 text-slate-400 hover:text-indigo-600 rounded transition-colors"
                                                title="Edit"
                                            >
                                                <Edit2 size={13} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Right Column: Customize Employee Balance */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-6">
                <div>
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <User className="text-indigo-500" size={18} />
                        Employee Quota Override
                    </h2>
                    <p className="text-xs text-slate-400">Allocate specific custom quantities to a particular person</p>
                </div>

                <div className="space-y-4">
                    <div className="space-y-1 relative">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Select Employee</label>
                        
                        {/* Custom Dropdown Trigger Button */}
                        <button
                            type="button"
                            onClick={() => setDropdownOpen(!dropdownOpen)}
                            className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none text-slate-700 font-bold flex items-center justify-between cursor-pointer hover:bg-slate-100/50 transition-all text-left relative z-10"
                        >
                            <span>
                                {selectedEmp 
                                    ? `${selectedEmp.firstName} ${selectedEmp.lastName} (${selectedEmp.employeeId || 'unlinked'})` 
                                    : '-- Search / Select Employee --'}
                            </span>
                            <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${dropdownOpen ? 'rotate-180 text-indigo-500' : ''}`} />
                        </button>

                        {/* Overlay to catch click-away closing */}
                        {dropdownOpen && (
                            <div 
                                className="fixed inset-0 z-20 bg-transparent" 
                                onClick={() => setDropdownOpen(false)}
                            />
                        )}

                        {/* Floating Dropdown Card */}
                        {dropdownOpen && (
                            <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                {/* Search Input Area */}
                                <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2 relative">
                                    <Search size={14} className="text-slate-400 absolute left-6 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        placeholder="Search by name or ID..."
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none text-slate-700 font-bold"
                                        autoFocus
                                    />
                                </div>

                                {/* Scrollable List */}
                                <div className="max-h-60 overflow-y-auto divide-y divide-slate-50">
                                    {filteredEmployees.map(e => (
                                        <button
                                            key={e._id}
                                            type="button"
                                            onClick={() => selectEmployee(e._id)}
                                            className={`w-full text-left px-4 py-3 text-xs font-bold transition-all flex items-center justify-between ${
                                                selectedEmp?._id === e._id 
                                                    ? 'bg-indigo-50 text-indigo-600 font-black' 
                                                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                                            }`}
                                        >
                                            <div className="flex flex-col">
                                                <span>{e.firstName} {e.lastName}</span>
                                                <span className="text-[10px] text-slate-400 font-medium">ID: {e.employeeId || 'unlinked'}</span>
                                            </div>
                                            {selectedEmp?._id === e._id && (
                                                <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />
                                            )}
                                        </button>
                                    ))}

                                    {filteredEmployees.length === 0 && (
                                        <div className="p-4 text-center text-slate-400 text-xs font-semibold">
                                            No employees match search query.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {loadingBalance ? (
                        <p className="text-xs text-slate-400 text-center py-6">Loading balances...</p>
                    ) : selectedEmp && empBalance ? (
                        <div className="space-y-4 animate-in fade-in duration-200">
                            <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 text-[10px] font-bold text-indigo-700">
                                Overriding leave quotas for {selectedEmp.firstName} {selectedEmp.lastName} (Year: {empBalance.year})
                            </div>
                            
                            <div className="divide-y divide-slate-100">
                                {empBalance.balances?.filter((b: any) => types.some(t => t.code === b.leaveTypeCode && t.isActive)).map((b: any) => {
                                    const matchingType = types.find(t => t.code === b.leaveTypeCode);
                                    const typeName = matchingType ? matchingType.name : b.leaveTypeCode;
                                    
                                    return (
                                        <div key={b.leaveTypeCode} className="py-3 flex items-center justify-between gap-4">
                                            <div className="min-w-0">
                                                <h4 className="font-bold text-slate-700 capitalize text-xs truncate">{typeName}</h4>
                                                <p className="text-[10px] text-slate-400">Used: {b.used}d · Pending: {b.pending}d</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={modifiedBalances[b.leaveTypeCode] ?? b.total}
                                                    onChange={e => setModifiedBalances({
                                                        ...modifiedBalances,
                                                        [b.leaveTypeCode]: Number(e.target.value)
                                                    })}
                                                    className="w-16 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-center font-bold text-xs text-slate-700 focus:ring-4 focus:ring-indigo-500/10 outline-none"
                                                />
                                                <button
                                                    onClick={() => handleSaveQuotaOverride(b.leaveTypeCode, modifiedBalances[b.leaveTypeCode] ?? b.total)}
                                                    className="p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors shadow-sm"
                                                    title="Save custom quota"
                                                >
                                                    <Save size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                                {(!empBalance.balances || empBalance.balances.length === 0) && (
                                    <p className="text-center py-6 text-slate-400 text-xs font-semibold">No balances initialized yet.</p>
                                )}
                            </div>
                        </div>
                    ) : selectedEmp ? (
                        <p className="text-xs text-slate-400 text-center py-6">Balances not loaded.</p>
                    ) : (
                        <div className="text-center py-10 bg-slate-50/50 border border-dashed border-slate-200/60 rounded-xl">
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">No employee selected</p>
                            <p className="text-[10px] text-slate-400 mt-1 max-w-[200px] mx-auto leading-relaxed">Choose an employee from the list to manage their custom leave allocations.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ManageLeaveTypes;
