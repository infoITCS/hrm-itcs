import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Download,
    FileSpreadsheet,
    Filter,
    CheckSquare,
    Square,
    Search,
    Loader2,
    Building2,
    Calendar,
    Users,
    Heart,
    DollarSign,
    Sparkles,
    Eye,
    GraduationCap,
    ArrowLeft
} from 'lucide-react';
import axios from 'axios';
import { api } from '../../utils/api';

interface FieldOption {
    key: string;
    label: string;
    category: string;
    isSensitive?: boolean;
    disabled?: boolean;
}

const EmployeeExportPage: React.FC = () => {
    const navigate = useNavigate();

    // ── Field Registry & Selection ─────────────────────────────────────────
    const [fields, setFields] = useState<FieldOption[]>([]);
    const [selectedKeys, setSelectedKeys] = useState<string[]>([
        'employeeId',
        'fullName',
        'cnic',
        'maritalStatus',
        'department',
        'designation',
        'joiningDate',
        'tenureFormatted',
        'dependents'
    ]);
    const [fieldSearch, setFieldSearch] = useState('');
    const [activeCategory, setActiveCategory] = useState<string>('All');
    const [departments, setDepartments] = useState<string[]>([]);

    // ── Filters ────────────────────────────────────────────────────────────
    const [filters, setFilters] = useState({
        maritalStatus: 'all',
        tenureCategory: 'all',
        minTenure: '',
        maxTenure: '',
        status: 'all', // Show all records by default
        department: 'all',
        workLocation: 'all',
        gender: 'all',
        hasDependents: 'all',
        search: ''
    });

    // ── Live Preview & Export State ────────────────────────────────────────
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
    const [previewRows, setPreviewRows] = useState<Record<string, any>[]>([]);
    const [totalCount, setTotalCount] = useState<number>(0);
    const [isExporting, setIsExporting] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    // ── Fetch Field Definitions & Departments on Mount ─────────────────────
    useEffect(() => {
        const fetchMetadata = async () => {
            try {
                const token = localStorage.getItem('token');
                const [fieldsRes, deptsRes] = await Promise.all([
                    axios.get(api.employeesExportFields, {
                        headers: { Authorization: `Bearer ${token}` }
                    }),
                    axios.get(`${api.baseURL}/api/employees/departments`, {
                        headers: { Authorization: `Bearer ${token}` }
                    }).catch(() => ({ data: [] }))
                ]);

                if (fieldsRes.data?.success && Array.isArray(fieldsRes.data.fields)) {
                    setFields(fieldsRes.data.fields);
                }
                if (Array.isArray(deptsRes.data)) {
                    setDepartments(deptsRes.data);
                }
            } catch (err: any) {
                console.error('Failed to load export metadata:', err);
                setFetchError(err.response?.data?.message || 'Failed to load export fields from server.');
            }
        };
        fetchMetadata();
    }, []);

    // ── Fetch Live Preview Data (Debounced) ─────────────────────────────────
    useEffect(() => {
        if (selectedKeys.length === 0) {
            setPreviewRows([]);
            setPreviewHeaders([]);
            setTotalCount(0);
            return;
        }

        const timer = setTimeout(async () => {
            setPreviewLoading(true);
            setFetchError(null);
            try {
                const token = localStorage.getItem('token');
                const payload = {
                    filters: {
                        ...filters,
                        minTenure: filters.minTenure ? Number(filters.minTenure) : undefined,
                        maxTenure: filters.maxTenure ? Number(filters.maxTenure) : undefined
                    },
                    selectedFields: selectedKeys,
                    format: 'preview'
                };
                const res = await axios.post(api.employeesExportCustom, payload, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.data?.success) {
                    setPreviewHeaders(res.data.headers || []);
                    setPreviewRows(res.data.sampleRows || []);
                    setTotalCount(res.data.totalCount || 0);
                }
            } catch (err: any) {
                console.error('Failed to fetch preview:', err);
                setFetchError(err.response?.data?.message || 'Failed to fetch live preview data.');
            } finally {
                setPreviewLoading(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [filters, selectedKeys]);

    // ── Category List & Counts ─────────────────────────────────────────────
    const categories = useMemo(() => {
        const unique = Array.from(new Set(fields.map((f) => f.category)));
        return ['All', 'Selected', ...unique];
    }, [fields]);

    const categoryCounts = useMemo(() => {
        const map: Record<string, { total: number; selected: number }> = {};
        for (const f of fields) {
            if (!map[f.category]) map[f.category] = { total: 0, selected: 0 };
            map[f.category].total++;
            if (selectedKeys.includes(f.key)) map[f.category].selected++;
        }
        return map;
    }, [fields, selectedKeys]);

    // ── Filtered Fields for Selection UI ───────────────────────────────────
    const visibleFields = useMemo(() => {
        return fields.filter((f) => {
            let matchesCategory = true;
            if (activeCategory === 'Selected') {
                matchesCategory = selectedKeys.includes(f.key);
            } else if (activeCategory !== 'All') {
                matchesCategory = f.category === activeCategory;
            }

            const matchesSearch =
                !fieldSearch.trim() ||
                f.label.toLowerCase().includes(fieldSearch.toLowerCase()) ||
                f.key.toLowerCase().includes(fieldSearch.toLowerCase()) ||
                f.category.toLowerCase().includes(fieldSearch.toLowerCase());
            return matchesCategory && matchesSearch;
        });
    }, [fields, activeCategory, fieldSearch, selectedKeys]);

    // ── Selection Toggles ──────────────────────────────────────────────────
    const toggleField = (key: string) => {
        setSelectedKeys((prev) =>
            prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
        );
    };

    const selectAllAvailable = () => {
        setSelectedKeys(fields.map((f) => f.key));
    };

    const clearAllSelections = () => {
        setSelectedKeys([]);
    };

    // ── Preset Handlers ────────────────────────────────────────────────────
    const applyPreset = (presetName: string) => {
        switch (presetName) {
            case 'all':
                setSelectedKeys(fields.map((f) => f.key));
                break;
            case 'essential':
                setSelectedKeys([
                    'employeeId',
                    'fullName',
                    'cnic',
                    'fatherName',
                    'dateOfBirth',
                    'age',
                    'gender',
                    'maritalStatus',
                    'phone',
                    'workEmail',
                    'department',
                    'designation',
                    'workLocation',
                    'joiningDate',
                    'tenureFormatted'
                ]);
                break;
            case 'dependents':
                setSelectedKeys([
                    'employeeId',
                    'fullName',
                    'cnic',
                    'maritalStatus',
                    'department',
                    'designation',
                    'dependents',
                    'dependentsNames',
                    'dependentsCount',
                    'maternityBaselineChildCount',
                    'emergencyContacts',
                    'emergencyContactNames',
                    'emergencyContactPhones'
                ]);
                setFilters((prev) => ({ ...prev, hasDependents: 'yes' }));
                break;
            case 'tenure':
                setSelectedKeys([
                    'employeeId',
                    'fullName',
                    'department',
                    'designation',
                    'joiningDate',
                    'tenureYears',
                    'tenureFormatted',
                    'maritalStatus',
                    'employmentStatus',
                    'probationEndDate',
                    'probationMonths',
                    'probationDays',
                    'autoUpdatedProbation',
                    'offboardingDate'
                ]);
                break;
            case 'finance':
                setSelectedKeys([
                    'employeeId',
                    'fullName',
                    'department',
                    'designation',
                    'confirmedSalary',
                    'probationSalary',
                    'salaryComponents',
                    'bankName',
                    'accountName',
                    'accountNumber',
                    'iban',
                    'providentFundBalance',
                    'pfClaimed',
                    'musharakahEnrolled',
                    'entitledForEobi',
                    'entitledForMealAllowance',
                    'medicalAnnualLimit',
                    'loansTotalAmount',
                    'loansRemainingAmount'
                ]);
                break;
            case 'education':
                setSelectedKeys([
                    'employeeId',
                    'fullName',
                    'department',
                    'designation',
                    'education',
                    'highestEducation',
                    'employmentHistory',
                    'priorExperienceCount',
                    'skills',
                    'certifications',
                    'socialProfiles'
                ]);
                break;
            default:
                break;
        }
    };

    // ── Download Excel (.xlsx) ─────────────────────────────────────────────
    const handleExportExcel = async () => {
        if (selectedKeys.length === 0) return;
        setIsExporting(true);
        try {
            const token = localStorage.getItem('token');
            const payload = {
                filters: {
                    ...filters,
                    minTenure: filters.minTenure ? Number(filters.minTenure) : undefined,
                    maxTenure: filters.maxTenure ? Number(filters.maxTenure) : undefined
                },
                selectedFields: selectedKeys,
                format: 'xlsx'
            };

            const res = await axios.post(api.employeesExportCustom, payload, {
                headers: { Authorization: `Bearer ${token}` },
                responseType: 'blob'
            });

            // Trigger browser download
            const blob = new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            const dateStr = new Date().toISOString().slice(0, 10);
            a.href = url;
            a.download = `Employee_Data_Export_${dateStr}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err: any) {
            console.error('Failed to export excel:', err);
            alert('Failed to generate Excel export. Please check your network and try again.');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="space-y-6 animate-slide-up pb-16">
            {/* ── Top Header Banner (Right beneath the application header) ── */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/admin')}
                        className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all cursor-pointer shrink-0"
                        title="Back to User & Role Management"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                                <FileSpreadsheet className="text-emerald-500" size={26} />
                                Custom Employee Data Extraction & Export
                            </h1>
                            <span className="text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-0.5 rounded-full">
                                Excel (.xlsx)
                            </span>
                        </div>
                        <p className="text-slate-500 text-xs mt-1">
                            Restricted to User & Role Management. Filter by status, tenure, marital status, or department, pick desired fields, and export.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 self-start md:self-auto">
                    <button
                        onClick={handleExportExcel}
                        disabled={isExporting || selectedKeys.length === 0 || totalCount === 0}
                        className={`px-6 py-2.5 rounded-xl text-sm font-bold text-white flex items-center gap-2 shadow-md transition-all cursor-pointer ${
                            isExporting || selectedKeys.length === 0 || totalCount === 0
                                ? 'bg-slate-300 cursor-not-allowed shadow-none'
                                : 'bg-emerald-600 hover:bg-emerald-700 active:scale-95 shadow-emerald-200 hover:shadow-lg'
                        }`}
                    >
                        {isExporting ? (
                            <>
                                <Loader2 size={16} className="animate-spin" /> Generating Excel...
                            </>
                        ) : (
                            <>
                                <Download size={16} /> Export to Excel (.xlsx)
                            </>
                        )}
                    </button>
                </div>
            </div>

            {fetchError && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs font-semibold flex items-center gap-2">
                    <span>⚠️ {fetchError}</span>
                </div>
            )}

            {/* ── Section 1: Filters Bar ── */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                        <Filter size={16} className="text-indigo-600" />
                        <span>1. Filter Employee Database</span>
                        <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full ml-1">
                            {totalCount} Matching Records
                        </span>
                    </div>
                    <button
                        onClick={() =>
                            setFilters({
                                maritalStatus: 'all',
                                tenureCategory: 'all',
                                minTenure: '',
                                maxTenure: '',
                                status: 'all',
                                department: 'all',
                                workLocation: 'all',
                                gender: 'all',
                                hasDependents: 'all',
                                search: ''
                            })
                        }
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-bold cursor-pointer"
                    >
                        Reset All Filters
                    </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 text-xs">
                    {/* Employment Status Filter */}
                    <div>
                        <label className="block text-slate-600 font-semibold mb-1">Employment Status</label>
                        <select
                            value={filters.status}
                            onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all font-medium"
                        >
                            <option value="all">All Employees (Active + Past)</option>
                            <option value="active">Active Workforce Only</option>
                            <option value="past">Past / Offboarded / Resigned</option>
                            <option value="Probation">On Probation</option>
                            <option value="Permanent">Confirmed / Permanent</option>
                            <option value="Internship">Internship</option>
                            <option value="Contract">Contract</option>
                            <option value="Part-time">Part-time</option>
                            <option value="On Hold">On Hold</option>
                            <option value="Terminated">Terminated</option>
                            <option value="Resigned">Resigned</option>
                        </select>
                    </div>

                    {/* Marital Status Filter */}
                    <div>
                        <label className="block text-slate-600 font-semibold mb-1 flex items-center gap-1.5">
                            <Heart size={13} className="text-rose-500" /> Marital Status
                        </label>
                        <select
                            value={filters.maritalStatus}
                            onChange={(e) => setFilters((p) => ({ ...p, maritalStatus: e.target.value }))}
                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all font-medium"
                        >
                            <option value="all">All Marital Statuses</option>
                            <option value="Single">Single</option>
                            <option value="Married">Married</option>
                            <option value="Divorced">Divorced</option>
                            <option value="Widowed">Widowed</option>
                        </select>
                    </div>

                    {/* Tenure Filter */}
                    <div>
                        <label className="block text-slate-600 font-semibold mb-1 flex items-center gap-1.5">
                            <Calendar size={13} className="text-indigo-500" /> Tenure / Experience
                        </label>
                        <select
                            value={filters.tenureCategory}
                            onChange={(e) => setFilters((p) => ({ ...p, tenureCategory: e.target.value as any }))}
                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all font-medium"
                        >
                            <option value="all">All Tenures</option>
                            <option value="gt3">Completed &gt; 3 Years (Senior)</option>
                            <option value="1to3">1 to 3 Years</option>
                            <option value="lt1">Less than 1 Year (New Joiners)</option>
                            <option value="custom">Custom Range (Years)</option>
                        </select>
                    </div>

                    {/* Custom Tenure Inputs */}
                    {filters.tenureCategory === 'custom' ? (
                        <div className="flex gap-2 items-center">
                            <div className="flex-1">
                                <label className="block text-slate-500 font-medium mb-1">Min Yrs</label>
                                <input
                                    type="number"
                                    step="0.5"
                                    placeholder="0"
                                    value={filters.minTenure}
                                    onChange={(e) => setFilters((p) => ({ ...p, minTenure: e.target.value }))}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="block text-slate-500 font-medium mb-1">Max Yrs</label>
                                <input
                                    type="number"
                                    step="0.5"
                                    placeholder="10"
                                    value={filters.maxTenure}
                                    onChange={(e) => setFilters((p) => ({ ...p, maxTenure: e.target.value }))}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                                />
                            </div>
                        </div>
                    ) : (
                        /* Dependents Filter */
                        <div>
                            <label className="block text-slate-600 font-semibold mb-1 flex items-center gap-1.5">
                                <Users size={13} className="text-emerald-500" /> Dependents Filter
                            </label>
                            <select
                                value={filters.hasDependents}
                                onChange={(e) => setFilters((p) => ({ ...p, hasDependents: e.target.value as any }))}
                                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all font-medium"
                            >
                                <option value="all">All (With or Without Dependents)</option>
                                <option value="yes">Has Dependents Only</option>
                                <option value="no">No Dependents Recorded</option>
                            </select>
                        </div>
                    )}

                    {/* Department Filter */}
                    <div>
                        <label className="block text-slate-600 font-semibold mb-1 flex items-center gap-1.5">
                            <Building2 size={13} className="text-purple-500" /> Department
                        </label>
                        <select
                            value={filters.department}
                            onChange={(e) => setFilters((p) => ({ ...p, department: e.target.value }))}
                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all font-medium"
                        >
                            <option value="all">All Departments</option>
                            {departments.map((d) => (
                                <option key={d} value={d}>
                                    {d}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Gender Filter */}
                    <div>
                        <label className="block text-slate-600 font-semibold mb-1">Gender</label>
                        <select
                            value={filters.gender}
                            onChange={(e) => setFilters((p) => ({ ...p, gender: e.target.value }))}
                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all font-medium"
                        >
                            <option value="all">All Genders</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>

                    {/* Search Keyword */}
                    <div className="md:col-span-2">
                        <label className="block text-slate-600 font-semibold mb-1">Search Keyword</label>
                        <div className="relative">
                            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search by Name, CNIC, Email, Employee ID, Post, Dept..."
                                value={filters.search}
                                onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
                                className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all text-xs font-medium"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Section 2: Selectable Fields (Categories + Checkboxes) ── */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                        <CheckSquare size={16} className="text-indigo-600" />
                        <span className="text-slate-800 font-bold text-sm">
                            2. Available Fields Selection
                        </span>
                        <span className="text-xs bg-indigo-50 text-indigo-700 font-bold px-2.5 py-0.5 rounded-full border border-indigo-200">
                            {selectedKeys.length} of {fields.length} Selected
                        </span>
                    </div>

                    {/* Quick Presets */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="text-slate-400 font-medium mr-1 text-[11px]">Presets:</span>
                        <button
                            onClick={() => applyPreset('all')}
                            className="px-3 py-1 bg-purple-100 hover:bg-purple-200 text-purple-800 rounded-xl font-bold transition-colors cursor-pointer flex items-center gap-1"
                        >
                            <Sparkles size={12} className="text-purple-600" /> All Fields
                        </button>
                        <button
                            onClick={() => applyPreset('essential')}
                            className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors cursor-pointer"
                        >
                            Basic + CNIC
                        </button>
                        <button
                            onClick={() => applyPreset('dependents')}
                            className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl font-semibold transition-colors cursor-pointer flex items-center gap-1"
                        >
                            <Users size={12} /> Dependents
                        </button>
                        <button
                            onClick={() => applyPreset('tenure')}
                            className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl font-semibold transition-colors cursor-pointer flex items-center gap-1"
                        >
                            <Calendar size={12} /> Tenure & Status
                        </button>
                        <button
                            onClick={() => applyPreset('finance')}
                            className="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl font-semibold transition-colors cursor-pointer flex items-center gap-1"
                        >
                            <DollarSign size={12} /> Salary & Finance
                        </button>
                        <button
                            onClick={() => applyPreset('education')}
                            className="px-3 py-1 bg-sky-50 hover:bg-sky-100 text-sky-800 rounded-xl font-semibold transition-colors cursor-pointer flex items-center gap-1"
                        >
                            <GraduationCap size={12} /> Education & Skills
                        </button>
                    </div>
                </div>

                {/* Search & Category Tabs */}
                <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                    <div className="flex flex-wrap gap-1.5 w-full sm:w-auto">
                        {categories.map((cat) => {
                            const count = categoryCounts[cat];
                            const label =
                                cat === 'All'
                                    ? `All (${fields.length})`
                                    : cat === 'Selected'
                                    ? `Selected (${selectedKeys.length})`
                                    : count
                                    ? `${cat} (${count.selected}/${count.total})`
                                    : cat;

                            return (
                                <button
                                    key={cat}
                                    onClick={() => setActiveCategory(cat)}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                        activeCategory === cat
                                            ? 'bg-indigo-600 text-white shadow-sm'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <div className="relative flex-1 sm:w-60">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search field names..."
                                value={fieldSearch}
                                onChange={(e) => setFieldSearch(e.target.value)}
                                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:border-indigo-500 font-medium"
                            />
                        </div>
                        <button
                            onClick={selectAllAvailable}
                            className="px-3 py-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-bold whitespace-nowrap cursor-pointer hover:bg-indigo-50 rounded-xl"
                        >
                            Select All
                        </button>
                        <button
                            onClick={clearAllSelections}
                            className="px-3 py-1.5 text-xs text-rose-500 hover:text-rose-700 font-bold whitespace-nowrap cursor-pointer hover:bg-rose-50 rounded-xl"
                        >
                            Clear All
                        </button>
                    </div>
                </div>

                {/* Field Checkboxes Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-72 overflow-y-auto p-2 border border-slate-100 rounded-2xl bg-slate-50/60 scrollbar-thin">
                    {visibleFields.length === 0 ? (
                        <div className="col-span-full py-8 text-center text-slate-400 text-xs">
                            No fields match "{fieldSearch}".
                        </div>
                    ) : (
                        visibleFields.map((field) => {
                            const isChecked = selectedKeys.includes(field.key);
                            return (
                                <label
                                    key={field.key}
                                    onClick={() => toggleField(field.key)}
                                    className={`flex items-start gap-2.5 p-3 rounded-2xl border transition-all cursor-pointer select-none text-xs ${
                                        isChecked
                                            ? 'bg-indigo-50/90 border-indigo-300 text-indigo-950 shadow-xs'
                                            : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                                    }`}
                                >
                                    <div className="mt-0.5 shrink-0">
                                        {isChecked ? (
                                            <CheckSquare size={16} className="text-indigo-600" />
                                        ) : (
                                            <Square size={16} className="text-slate-400" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold truncate">{field.label}</div>
                                        <div className="text-[10px] text-slate-400 truncate">
                                            {field.category}
                                            {field.isSensitive && ' • Financial / Confidential'}
                                        </div>
                                    </div>
                                </label>
                            );
                        })
                    )}
                </div>
            </div>

            {/* ── Section 3: Live Preview Table ── */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                        <Eye size={16} className="text-indigo-600" />
                        <span>3. Live Preview & Data Verification</span>
                        <span className="text-xs bg-slate-100 text-slate-700 font-semibold px-2.5 py-0.5 rounded-full ml-1">
                            {totalCount} matching employees
                        </span>
                    </div>
                    {previewLoading && (
                        <div className="flex items-center gap-1.5 text-xs text-indigo-600 font-semibold animate-pulse">
                            <Loader2 size={14} className="animate-spin" /> Updating preview...
                        </div>
                    )}
                </div>

                {selectedKeys.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 text-xs font-medium">
                        Please select at least one field from above to preview and export.
                    </div>
                ) : previewRows.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 text-xs font-medium">
                        No employees found matching the chosen filters.
                    </div>
                ) : (
                    <div className="overflow-x-auto border border-slate-200 rounded-2xl max-h-80 scrollbar-thin">
                        <table className="w-full text-left text-xs whitespace-nowrap">
                            <thead className="bg-slate-100/90 sticky top-0 border-b border-slate-200 font-bold text-slate-700 z-10">
                                <tr>
                                    <th className="px-4 py-3 w-12 text-slate-400">#</th>
                                    {previewHeaders.map((h) => (
                                        <th key={h} className="px-4 py-3">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {previewRows.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-indigo-50/40 transition-colors">
                                        <td className="px-4 py-2.5 text-slate-400 text-[11px]">{idx + 1}</td>
                                        {previewHeaders.map((h) => (
                                            <td key={h} className="px-4 py-2.5 font-medium text-slate-700">
                                                {String(row[h] ?? '—')}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <div className="flex items-center justify-between text-xs text-slate-400 font-medium pt-1">
                    <span>* Preview displays up to first 50 matching rows. The Excel download will export all {totalCount} matching records.</span>
                    <button
                        onClick={handleExportExcel}
                        disabled={isExporting || selectedKeys.length === 0 || totalCount === 0}
                        className={`px-5 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-2 shadow-sm transition-all cursor-pointer ${
                            isExporting || selectedKeys.length === 0 || totalCount === 0
                                ? 'bg-slate-300 cursor-not-allowed shadow-none'
                                : 'bg-emerald-600 hover:bg-emerald-700 active:scale-95 shadow-emerald-200'
                        }`}
                    >
                        <Download size={14} /> Export All {totalCount} Records (.xlsx)
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EmployeeExportPage;
