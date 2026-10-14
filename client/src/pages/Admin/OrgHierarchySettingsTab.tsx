import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Network,
    Search,
    MapPin,
    UserCheck,
    GripVertical,
    Pencil,
    Eye,
    RefreshCw,
    X,
    Check,
    Users,
    UserPlus
} from 'lucide-react';
import api from '../../utils/api';
import Avatar from '../../components/UI/Avatar';
import { getAvatarUrl } from '../../utils/avatar';
import { formatEmployeeFullName } from '../../utils/nameHelper';
import { useToast } from '../../contexts/ToastContext';
import OrgHierarchyModal, {
    type OrgEmployee,
    canonicalDepartment,
    STANDARD_DEPTS
} from '../../components/Directory/OrgHierarchyModal';

const DEPT_BADGES: Record<string, { bg: string; text: string; border: string }> = {
    'TECH': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    'DEV': { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
    'SALES': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
    'FINANCE': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
    'HR & ADMIN': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
    'MARKETING': { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300' },
    'INTERNS': { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' }
};

const OrgHierarchySettingsTab: React.FC = () => {
    const { showToast } = useToast();
    const [employees, setEmployees] = useState<OrgEmployee[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('All');

    // Drag-and-drop state
    const [draggedEmployeeId, setDraggedEmployeeId] = useState<string | null>(null);
    const [dragOverDept, setDragOverDept] = useState<string | null>(null);

    // Edit placement modal state (used for both quick edit and "+ Assign Employee" via dropdown)
    const [editingEmpId, setEditingEmpId] = useState<string>('');
    const [editDept, setEditDept] = useState<string>('TECH');
    const [editManager, setEditManager] = useState<string>('');
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [savingPlacement, setSavingPlacement] = useState(false);

    // Preview chart modal
    const [showChartPreview, setShowChartPreview] = useState(false);

    // Fetch employees from directory
    const fetchEmployees = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(api.directory, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setEmployees(data);
            } else {
                showToast('Failed to load employees for organization hierarchy.', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Error connecting to server.', 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        fetchEmployees();
    }, [fetchEmployees]);

    // Standard HRM system departments
    const allDepartments = useMemo(() => {
        return Array.from(STANDARD_DEPTS);
    }, []);

    // Group employees by department using canonicalDepartment
    const employeesByDept = useMemo(() => {
        const map: Record<string, OrgEmployee[]> = {};
        allDepartments.forEach(dept => { map[dept] = []; });

        employees.forEach(emp => {
            const canonDept = canonicalDepartment(emp.jobInfo?.department, emp.jobInfo?.designation);
            const targetDept = map[canonDept] ? canonDept : 'TECH';

            // If employee matches search term
            const name = formatEmployeeFullName(emp, '').toLowerCase();
            const desig = (emp.jobInfo?.designation || '').toLowerCase();
            const query = searchTerm.toLowerCase();
            const matchesSearch = !query || name.includes(query) || desig.includes(query) || emp.employeeId.toLowerCase().includes(query);

            if (matchesSearch) {
                map[targetDept].push(emp);
            }
        });

        return map;
    }, [employees, allDepartments, searchTerm]);

    // Candidate managers for the dropdown (excluding the employee themselves)
    const candidateManagers = useMemo(() => {
        return employees
            .filter(e => e.employeeId !== editingEmpId)
            .sort((a, b) => a.firstName.localeCompare(b.firstName));
    }, [employees, editingEmpId]);

    // Save placement API call
    const handleSavePlacement = async (empId: string, newDept: string, newManagerId: string) => {
        if (!empId) {
            showToast('Please select an employee.', 'warning');
            return;
        }

        try {
            setSavingPlacement(true);
            const token = localStorage.getItem('token');
            const res = await fetch(api.employeeOrgPlacement(empId), {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    department: newDept,
                    reportingManager: newManagerId || null
                })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.message || 'Failed to update organization placement.');
            }

            // Update local state
            setEmployees(prev => prev.map(e => {
                if (e.employeeId === empId) {
                    return {
                        ...e,
                        jobInfo: {
                            ...e.jobInfo,
                            department: newDept,
                            reportingManager: newManagerId || undefined
                        }
                    };
                }
                return e;
            }));

            showToast('Organization placement saved successfully!', 'success');
            setIsAssignModalOpen(false);
            setEditingEmpId('');
        } catch (err: any) {
            console.error(err);
            showToast(err.message || 'Failed to update employee placement.', 'error');
        } finally {
            setSavingPlacement(false);
        }
    };

    // Drag and drop handlers
    const handleDragStart = (e: React.DragEvent, empId: string) => {
        e.dataTransfer.setData('text/plain', empId);
        setDraggedEmployeeId(empId);
    };

    const handleDragOver = (e: React.DragEvent, dept: string) => {
        e.preventDefault();
        if (dragOverDept !== dept) {
            setDragOverDept(dept);
        }
    };

    const handleDragLeave = () => {
        setDragOverDept(null);
    };

    const handleDrop = async (e: React.DragEvent, targetDept: string) => {
        e.preventDefault();
        setDragOverDept(null);
        const empId = e.dataTransfer.getData('text/plain') || draggedEmployeeId;
        setDraggedEmployeeId(null);

        if (!empId) return;

        const emp = employees.find(x => x.employeeId === empId);
        if (!emp) return;

        const currentDept = canonicalDepartment(emp.jobInfo?.department, emp.jobInfo?.designation);
        if (currentDept === targetDept) return; // No change

        await handleSavePlacement(empId, targetDept, emp.jobInfo?.reportingManager || '');
    };

    // Open edit/assign modal for an existing employee
    const openEditModal = (emp: OrgEmployee) => {
        setEditingEmpId(emp.employeeId);
        setEditDept(canonicalDepartment(emp.jobInfo?.department, emp.jobInfo?.designation));
        setEditManager(emp.jobInfo?.reportingManager || '');
        setIsAssignModalOpen(true);
    };

    // Open assign modal for a new placement into a specific department
    const openAssignForDept = (deptName?: string) => {
        setEditingEmpId(employees[0]?.employeeId || '');
        setEditDept(deptName || 'TECH');
        setEditManager('');
        setIsAssignModalOpen(true);
    };

    const selectedEmployeeObj = employees.find(e => e.employeeId === editingEmpId);

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header / Actions Card */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div>
                    <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs uppercase tracking-widest mb-1.5">
                        <Network size={16} />
                        Organization Structure
                    </div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Organization Hierarchy Management</h2>
                    <p className="text-sm text-slate-500 mt-1">
                        Assign employees to departments and managers using simple dropdowns or drag-and-drop. Changes update the Directory Corporate Chart immediately.
                    </p>
                </div>

                <div className="flex items-center gap-3 shrink-0 flex-wrap">
                    {/* Add / Move Employee via Dropdown */}
                    <button
                        type="button"
                        onClick={() => openAssignForDept()}
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm transition-all shadow-md shadow-indigo-200 active:scale-95 flex items-center gap-2"
                    >
                        <UserPlus size={18} />
                        <span>Assign Employee</span>
                    </button>

                    <button
                        type="button"
                        onClick={fetchEmployees}
                        disabled={loading}
                        className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-all flex items-center gap-2"
                        title="Reload latest employees"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        <span>Refresh</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setShowChartPreview(true)}
                        className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-sm transition-all shadow-md active:scale-95 flex items-center gap-2"
                    >
                        <Eye size={18} />
                        <span>Preview Live Org Chart</span>
                    </button>
                </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-sm">
                <div className="relative w-full md:w-80 group">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
                    <input
                        type="text"
                        placeholder="Search employee by name, ID, or title..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-medium"
                    />
                    {searchTerm && (
                        <button
                            onClick={() => setSearchTerm('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>

                {/* Quick department filter tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto scrollbar-none pb-1 md:pb-0">
                    <button
                        onClick={() => setSelectedDeptFilter('All')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                            selectedDeptFilter === 'All'
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        All ({employees.length})
                    </button>
                    {allDepartments.map(dept => {
                        const count = employeesByDept[dept]?.length || 0;
                        return (
                            <button
                                key={dept}
                                onClick={() => setSelectedDeptFilter(dept)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                                    selectedDeptFilter === dept
                                        ? 'bg-indigo-600 text-white shadow-sm'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                            >
                                {dept} ({count})
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Department Columns Board */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 items-start">
                {allDepartments
                    .filter(dept => selectedDeptFilter === 'All' || selectedDeptFilter === dept)
                    .map(dept => {
                        const deptEmps = employeesByDept[dept] || [];
                        const isDragOver = dragOverDept === dept;
                        const badgeStyle = DEPT_BADGES[dept] || { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300' };

                        return (
                            <div
                                key={dept}
                                onDragOver={(e) => handleDragOver(e, dept)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, dept)}
                                className={`rounded-3xl border transition-all duration-200 bg-white shadow-sm flex flex-col ${
                                    isDragOver
                                        ? 'border-indigo-500 ring-4 ring-indigo-500/10 bg-indigo-50/20 scale-[1.01]'
                                        : 'border-slate-200/90'
                                }`}
                            >
                                {/* Column Header */}
                                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <div className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider border ${badgeStyle.bg} ${badgeStyle.text} ${badgeStyle.border}`}>
                                            {dept}
                                        </div>
                                        <span className="text-xs font-bold text-slate-400">
                                            {deptEmps.length} {deptEmps.length === 1 ? 'member' : 'members'}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => openAssignForDept(dept)}
                                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
                                        title={`Assign an employee into ${dept}`}
                                    >
                                        <UserPlus size={13} />
                                        <span>Add</span>
                                    </button>
                                </div>

                                {/* Employees List */}
                                <div className="p-3 space-y-2.5 max-h-[520px] overflow-y-auto scrollbar-thin">
                                    {deptEmps.length === 0 ? (
                                        <div className="py-8 text-center border-2 border-dashed border-slate-200 rounded-2xl">
                                            <Users size={24} className="mx-auto text-slate-300 mb-1" />
                                            <p className="text-xs font-medium text-slate-400">No employees in {dept}</p>
                                            <button
                                                type="button"
                                                onClick={() => openAssignForDept(dept)}
                                                className="mt-2 text-xs font-bold text-indigo-600 hover:underline"
                                            >
                                                + Assign employee via dropdown
                                            </button>
                                        </div>
                                    ) : (
                                        deptEmps.map(emp => {
                                            const isBeingDragged = draggedEmployeeId === emp.employeeId;
                                            const manager = employees.find(m => m.employeeId === emp.jobInfo?.reportingManager);
                                            const isIntern = (emp.jobInfo?.designation || '').toLowerCase().includes('intern');

                                            return (
                                                <div
                                                    key={emp.employeeId}
                                                    draggable
                                                    onDragStart={(e) => handleDragStart(e, emp.employeeId)}
                                                    className={`p-3 rounded-2xl border transition-all duration-150 group bg-slate-50/70 hover:bg-white hover:shadow-md hover:border-indigo-200 cursor-grab active:cursor-grabbing ${
                                                        isBeingDragged ? 'opacity-40 border-dashed border-indigo-400' : 'border-slate-200/70'
                                                    }`}
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex items-center gap-3">
                                                            <div className="text-slate-300 group-hover:text-slate-400 transition-colors">
                                                                <GripVertical size={16} />
                                                            </div>
                                                            <Avatar
                                                                src={getAvatarUrl(emp)}
                                                                firstName={emp.firstName}
                                                                lastName={emp.lastName}
                                                                className="w-9 h-9 ring-2 ring-white shrink-0 text-xs"
                                                            />
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                    <h4 className="text-sm font-bold text-slate-900 truncate">
                                                                        {formatEmployeeFullName(emp, 'Employee')}
                                                                    </h4>
                                                                    {isIntern && (
                                                                        <span className="px-1.5 py-0.5 rounded bg-pink-100 text-pink-700 text-[10px] font-black uppercase tracking-tight">
                                                                            Intern
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="text-xs text-slate-500 font-medium truncate">
                                                                    {emp.jobInfo?.designation || 'No Designation'}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        {/* Edit button */}
                                                        <button
                                                            type="button"
                                                            onClick={() => openEditModal(emp)}
                                                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors shrink-0"
                                                            title="Edit Department / Manager"
                                                        >
                                                            <Pencil size={14} />
                                                        </button>
                                                    </div>

                                                    {/* Sub-info: Reporting line & location */}
                                                    <div className="mt-2.5 pt-2 border-t border-slate-100/80 flex items-center justify-between text-[11px] text-slate-500">
                                                        <div className="flex items-center gap-1 truncate max-w-[65%]">
                                                            <UserCheck size={12} className="text-indigo-500 shrink-0" />
                                                            <span className="truncate">
                                                                {manager ? formatEmployeeFullName(manager, 'Manager') : 'Direct / Self'}
                                                            </span>
                                                        </div>
                                                        {emp.jobInfo?.workLocation && (
                                                            <div className="flex items-center gap-1 text-slate-400 font-medium uppercase text-[10px]">
                                                                <MapPin size={11} />
                                                                <span>{emp.jobInfo.workLocation}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        );
                    })}
            </div>

            {/* Quick Edit / Assign Placement Modal */}
            {isAssignModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-scaleUp">
                        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                {selectedEmployeeObj ? (
                                    <>
                                        <Avatar
                                            src={getAvatarUrl(selectedEmployeeObj)}
                                            firstName={selectedEmployeeObj.firstName}
                                            lastName={selectedEmployeeObj.lastName}
                                            className="w-11 h-11 ring-2 ring-indigo-100"
                                        />
                                        <div>
                                            <h3 className="text-base font-bold text-slate-900">
                                                {formatEmployeeFullName(selectedEmployeeObj, 'Employee')}
                                            </h3>
                                            <p className="text-xs text-slate-500">
                                                {selectedEmployeeObj.jobInfo?.designation || selectedEmployeeObj.employeeId}
                                            </p>
                                        </div>
                                    </>
                                ) : (
                                    <div>
                                        <h3 className="text-base font-bold text-slate-900">Assign Employee</h3>
                                        <p className="text-xs text-slate-500">Select employee and reporting line</p>
                                    </div>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => { setIsAssignModalOpen(false); setEditingEmpId(''); }}
                                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="py-5 space-y-4">
                            {/* Employee Dropdown Selector */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                    Select Employee
                                </label>
                                <select
                                    value={editingEmpId}
                                    onChange={(e) => {
                                        const newId = e.target.value;
                                        setEditingEmpId(newId);
                                        const chosen = employees.find(x => x.employeeId === newId);
                                        if (chosen) {
                                            setEditDept(canonicalDepartment(chosen.jobInfo?.department, chosen.jobInfo?.designation));
                                            setEditManager(chosen.jobInfo?.reportingManager || '');
                                        }
                                    }}
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500"
                                >
                                    <option value="" disabled>Select an employee...</option>
                                    {employees.map(e => (
                                        <option key={e.employeeId} value={e.employeeId}>
                                            {formatEmployeeFullName(e, 'Employee')} ({e.jobInfo?.designation || e.employeeId})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Department Dropdown Selector */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                    Assigned Department
                                </label>
                                <select
                                    value={editDept}
                                    onChange={(e) => setEditDept(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500"
                                >
                                    {allDepartments.map(d => (
                                        <option key={d} value={d}>{d}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Manager Dropdown Selector */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                    Reporting Manager
                                </label>
                                <select
                                    value={editManager}
                                    onChange={(e) => setEditManager(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500"
                                >
                                    <option value="">No Manager (Reports to CEO / Executive)</option>
                                    {candidateManagers.map(m => (
                                        <option key={m.employeeId} value={m.employeeId}>
                                            {formatEmployeeFullName(m, 'Manager')} ({m.jobInfo?.designation || m.employeeId})
                                        </option>
                                    ))}
                                </select>
                                <p className="text-[11px] text-slate-400 mt-1">
                                    System automatically prevents cyclic loops and handles pending expense claim transfers.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => { setIsAssignModalOpen(false); setEditingEmpId(''); }}
                                className="px-4 py-2 text-slate-600 hover:text-slate-800 font-bold text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={savingPlacement || !editingEmpId}
                                onClick={() => handleSavePlacement(editingEmpId, editDept, editManager)}
                                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm shadow-md shadow-indigo-200 transition-all flex items-center gap-2"
                            >
                                {savingPlacement ? (
                                    <RefreshCw size={16} className="animate-spin" />
                                ) : (
                                    <Check size={16} />
                                )}
                                <span>Save Changes</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Live Chart Preview Modal */}
            <OrgHierarchyModal
                isOpen={showChartPreview}
                onClose={() => setShowChartPreview(false)}
                employees={employees}
            />
        </div>
    );
};

export default OrgHierarchySettingsTab;
