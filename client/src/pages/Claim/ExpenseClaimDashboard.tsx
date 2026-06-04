import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import {
    DollarSign,
    FileText,
    Inbox,
    PlusCircle,
    RefreshCw,
    ShieldCheck,
    X,
    History,
    Search,
} from 'lucide-react';

type Category = 'Medical' | 'Training & Certification' | 'Travel' | 'Sales/Customer Gifts' | 'Other';
type ForWhom = 'Self' | 'Dependent';

type Claim = any;

const SUB_CATEGORIES: Record<Category, string[]> = {
    Medical: ['Consultation', 'Pharmacy / Medicines', 'Lab Test / Diagnostics', 'Hospitalization', 'Dental Treatment', 'Optical / Glasses', 'Other Medical'],
    'Training & Certification': ['Course Fee', 'Certification Exam Fee', 'Books / Study Material', 'Workshop / Seminar Fee', 'Other Training'],
    Travel: ['Hotel Accommodation', 'Flight / Train Ticket', 'Fuel / Mileage', 'Taxi / Ride Share', 'Meals / Per Diem', 'Other Travel'],
    'Sales/Customer Gifts': ['Customer Lunch / Dinner', 'Client Entertainment', 'Corporate Gift Item', 'Other Sales Expense'],
    Other: ['Office Supplies', 'Software Subscription', 'Internet / Mobile Bill', 'Miscellaneous']
};

const STATUS_COLORS: Record<string, string> = {
    'Pending Team Lead': 'bg-amber-50 text-amber-700 border-amber-200',
    'Pending Line Manager': 'bg-amber-50 text-amber-700 border-amber-200',
    'Pending HR': 'bg-indigo-50 text-indigo-700 border-indigo-200',
    'Pending Finance': 'bg-violet-50 text-violet-700 border-violet-200',
    Approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Declined: 'bg-rose-50 text-rose-700 border-rose-200',
};

function formatMoney(amount?: number, currency = 'PKR') {
    if (typeof amount !== 'number') return '—';
    return `${currency} ${amount.toLocaleString('en-PK')}`;
}

function readFileAsBase64(file: File) {
    return new Promise<{ fileName: string; contentType: string; base64: string }>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ fileName: file.name, contentType: file.type, base64: String(reader.result || '') });
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

const ExpenseClaimDashboard = () => {
    const { user } = useAuth();
    const { role } = usePermissions();

    const token = localStorage.getItem('token');
    const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

    type Tab = 'submit' | 'mine' | 'approvals' | 'history';
    const [tab, setTab] = useState<Tab>('submit');

    const [employee, setEmployee] = useState<any>(null);
    const [dependents, setDependents] = useState<any[]>([]);

    const [mine, setMine] = useState<Claim[]>([]);
    const [approvals, setApprovals] = useState<Claim[]>([]);
    const [history, setHistory] = useState<Claim[]>([]);

    const [progress, setProgress] = useState<{ pct: number; totalEmployees: number; completed: number } | null>(null);

    const [loadingEmployee, setLoadingEmployee] = useState(false);
    const [loadingMine, setLoadingMine] = useState(false);
    const [loadingApprovals, setLoadingApprovals] = useState(false);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState(false);

    // Form state
    const [category, setCategory] = useState<Category>('Medical');
    const [subCategory, setSubCategory] = useState('');
    const [forWhom, setForWhom] = useState<ForWhom>('Self');
    const [dependentId, setDependentId] = useState('');
    const [purpose, setPurpose] = useState('');
    const [amountRequested, setAmountRequested] = useState<number>(0);
    const [notes, setNotes] = useState('');
    const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
    const [submitting, setSubmitting] = useState(false);

    // Admin/HR submission on behalf of employee
    const [allEmployees, setAllEmployees] = useState<any[]>([]);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');

    // New form fields
    const [expenseDate, setExpenseDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

    // PIM-style filters state
    const [filterClaimNo, setFilterClaimNo] = useState('');
    const [filterEmployeeName, setFilterEmployeeName] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterStartDate, setFilterStartDate] = useState('');
    const [filterEndDate, setFilterEndDate] = useState('');

    const isApprover = role === 'manager' || role === 'admin' || role === 'super-admin' || role === 'hr';
    const isAdminLike = role === 'admin' || role === 'super-admin' || role === 'hr';

    const remainingMedicalLimit = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const startOfYear = new Date(currentYear, 0, 1).getTime();
        const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999).getTime();

        let relevantClaims: any[] = [];
        if (isAdminLike && selectedEmployeeId) {
            relevantClaims = history.filter((c: any) => c.employeeId === selectedEmployeeId);
        } else {
            relevantClaims = mine;
        }

        const medicalClaims = relevantClaims.filter((c: any) => {
            if (c.category !== 'Medical') return false;
            if (c.status === 'Draft' || c.status === 'Declined') return false;
            const createdAt = new Date(c.createdAt).getTime();
            return createdAt >= startOfYear && createdAt <= endOfYear;
        });

        const claimedSoFar = medicalClaims.reduce((sum: number, c: any) => {
            const amount = typeof c.approvedTotal === 'number' ? c.approvedTotal : c.amountAllowed;
            return sum + amount;
        }, 0);

        return Math.max(0, 60000 - claimedSoFar);
    }, [mine, history, selectedEmployeeId, isAdminLike]);

    const fetchEmployee = useCallback(async () => {
        if (!user?.id) return;
        setLoadingEmployee(true);
        try {
            const r = await fetch(`${api.employees}?userId=${encodeURIComponent(user.id)}`, { headers });
            const d = await r.json();
            const emp = d?.employees?.[0];
            setEmployee(emp || null);
            setDependents(Array.isArray(emp?.dependents) ? emp.dependents : []);
        } catch {
            // ignore
        } finally {
            setLoadingEmployee(false);
        }
    }, [user?.id, headers]);

    const fetchMine = useCallback(async () => {
        setLoadingMine(true);
        try {
            const r = await fetch(api.claimMine, { headers });
            const d = await r.json();
            if (d?.success) setMine(d.data || []);
        } catch {
            // ignore
        } finally {
            setLoadingMine(false);
        }
    }, [headers]);

    const fetchApprovals = useCallback(async () => {
        if (!isApprover) return;
        setLoadingApprovals(true);
        try {
            const r = await fetch(api.claimPendingApprovals, { headers });
            const d = await r.json();
            if (d?.success) setApprovals(d.data || []);
        } catch {
            // ignore
        } finally {
            setLoadingApprovals(false);
        }
    }, [headers, isApprover]);

    const fetchProgress = useCallback(async () => {
        if (!isApprover) return;
        setLoadingProgress(true);
        try {
            const r = await fetch(api.claimProfileProgress, { headers });
            const d = await r.json();
            if (d?.success) setProgress(d.data);
        } catch {
            // ignore
        } finally {
            setLoadingProgress(false);
        }
    }, [headers, isApprover]);

    const fetchHistory = useCallback(async () => {
        if (!isAdminLike) return;
        setLoadingHistory(true);
        try {
            const r = await fetch(api.claimAll, { headers });
            const d = await r.json();
            if (d?.success) setHistory(d.data || []);
        } catch {
            // ignore
        } finally {
            setLoadingHistory(false);
        }
    }, [headers, isAdminLike]);

    const fetchAllEmployees = useCallback(async () => {
        if (!isAdminLike) return;
        try {
            const r = await fetch(api.employees, { headers });
            const d = await r.json();
            const empArray = Array.isArray(d) ? d : (d.employees || []);
            setAllEmployees(empArray);
        } catch {
            // ignore
        }
    }, [headers, isAdminLike]);

    const filterList = useCallback((list: any[]) => {
        return list.filter(c => {
            const matchesClaimNo = !filterClaimNo || (c.claimNo || '').toLowerCase().includes(filterClaimNo.toLowerCase());
            const matchesCategory = !filterCategory || c.category === filterCategory;
            const matchesStatus = !filterStatus || c.status === filterStatus;
            
            let matchesEmployee = true;
            if (filterEmployeeName) {
                const name = `${c.employeeDetails?.firstName || ''} ${c.employeeDetails?.lastName || ''}`.toLowerCase();
                const empId = (c.employeeId || '').toLowerCase();
                matchesEmployee = name.includes(filterEmployeeName.toLowerCase()) || empId.includes(filterEmployeeName.toLowerCase());
            }
            
            let matchesDate = true;
            const claimDate = c.expenseDate ? new Date(c.expenseDate) : new Date(c.createdAt);
            if (filterStartDate) {
                const start = new Date(filterStartDate);
                start.setHours(0, 0, 0, 0);
                matchesDate = matchesDate && claimDate >= start;
            }
            if (filterEndDate) {
                const end = new Date(filterEndDate);
                end.setHours(23, 59, 59, 999);
                matchesDate = matchesDate && claimDate <= end;
            }
            
            return matchesClaimNo && matchesCategory && matchesStatus && matchesEmployee && matchesDate;
        });
    }, [filterClaimNo, filterEmployeeName, filterCategory, filterStatus, filterStartDate, filterEndDate]);

    const filteredMine = useMemo(() => filterList(mine), [mine, filterList]);
    const filteredApprovals = useMemo(() => filterList(approvals), [approvals, filterList]);
    const filteredHistory = useMemo(() => filterList(history), [history, filterList]);

    useEffect(() => {
        fetchEmployee();
        fetchMine();
        fetchApprovals();
        fetchProgress();
        fetchHistory();
        fetchAllEmployees();
    }, [fetchEmployee, fetchMine, fetchApprovals, fetchProgress, fetchHistory, fetchAllEmployees]);

    useEffect(() => {
        if (forWhom === 'Self') setDependentId('');
    }, [forWhom]);

    const submitDisabledReason = useMemo(() => {
        if (loadingEmployee) return 'Loading employee...';
        const targetEmp = selectedEmployeeId 
            ? allEmployees.find(emp => emp.employeeId === selectedEmployeeId) 
            : employee;
        if (!targetEmp?.employeeId) return 'Employee profile not found';
        if (!amountRequested || amountRequested <= 0) return 'Enter a valid amount';
        if (category === 'Medical' && forWhom === 'Dependent' && !dependentId) return 'Select a registered dependent';
        if (category === 'Medical' && amountRequested > remainingMedicalLimit && !isAdminLike) {
            return `Amount exceeds remaining medical limit (${formatMoney(remainingMedicalLimit)}). Out-of-policy claims can only be submitted by HR or Admin.`;
        }
        if (category === 'Medical' && receiptFiles.length === 0) return 'Receipt upload is required for Medical claims';
        if (['Training & Certification', 'Sales/Customer Gifts', 'Other'].includes(category)) {
            const hasComment = notes.trim().length >= 5;
            const hasReceipt = receiptFiles.length > 0;
            if (!hasComment && !hasReceipt) {
                return 'A comment (min 5 chars) or a receipt upload is required for this category';
            }
        }
        return '';
    }, [loadingEmployee, employee?.employeeId, isAdminLike, selectedEmployeeId, amountRequested, forWhom, dependentId, category, remainingMedicalLimit, notes, receiptFiles.length]);

    const handleSubmit = async () => {
        if (submitDisabledReason) return;
        setSubmitting(true);
        try {
            const receipts = await Promise.all(receiptFiles.map(readFileAsBase64));

            const payload = {
                employeeId: selectedEmployeeId || undefined,
                category,
                subCategory: subCategory.trim() || undefined,
                expenseDate,
                forWhom,
                dependentId: forWhom === 'Dependent' ? dependentId : undefined,
                purpose: purpose.trim() || undefined,
                amountRequested,
                notes: notes.trim() || undefined,
                receipts,
            };

            const r = await fetch(api.claims, { method: 'POST', headers, body: JSON.stringify(payload) });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.message || 'Failed to submit claim');

            // Reset form
            setSelectedEmployeeId('');
            setSubCategory('');
            setExpenseDate(new Date().toISOString().split('T')[0]);
            setForWhom('Self');
            setDependentId('');
            setPurpose('');
            setAmountRequested(0);
            setNotes('');
            setReceiptFiles([]);

            await fetchMine();
            await fetchApprovals();
            setTab('mine');
        } catch (e: any) {
            alert(e?.message || 'Failed to submit claim');
        } finally {
            setSubmitting(false);
        }
    };

    const downloadReceipt = async (claimId: string, receiptId: string, fileName = 'receipt') => {
        try {
            const r = await fetch(api.claimReceipt(claimId, receiptId), { headers: { Authorization: `Bearer ${token}` } });
            if (!r.ok) throw new Error('Failed to download receipt');
            const blob = await r.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (e: any) {
            alert(e?.message || 'Failed to download receipt');
        }
    };

    // Decision modal
    const [decisionOpen, setDecisionOpen] = useState(false);
    const [decisionClaim, setDecisionClaim] = useState<any>(null);
    const [decision, setDecision] = useState<'Approved' | 'Declined'>('Approved');
    const [decisionComments, setDecisionComments] = useState('');
    const [decisionApprovedAmount, setDecisionApprovedAmount] = useState<number | ''>('');
    const [decisionAuthorizationBy, setDecisionAuthorizationBy] = useState('');
    const [deciding, setDeciding] = useState(false);

    const openDecision = (c: any) => {
        setDecisionClaim(c);
        setDecision('Approved');
        setDecisionComments('');
        const allowed = typeof c?.amountAllowed === 'number' ? c.amountAllowed : c?.amountRequested;
        const initial = Math.min(c?.amountRequested || 0, allowed || 0);
        setDecisionApprovedAmount(Number.isFinite(initial) ? initial : '');
        setDecisionAuthorizationBy('');
        setDecisionOpen(true);
    };

    const currentRequiresAuthorization = useMemo(() => {
        if (!decisionClaim?.approvals?.length) return false;
        const pending = decisionClaim.approvals.find((a: any) => a.status === 'Pending');
        return !!pending?.requiresAuthorization;
    }, [decisionClaim]);

    const submitDecision = async () => {
        if (!decisionClaim?._id) return;
        if (decision === 'Approved' && currentRequiresAuthorization && !decisionAuthorizationBy) {
            alert('Authorization is required for this out-of-policy claim (e.g. HR / Senior Management).');
            return;
        }

        setDeciding(true);
        try {
            const payload: any = {
                decision,
                comments: decisionComments.trim() || undefined,
            };
            if (decision === 'Approved' && decisionApprovedAmount !== '') payload.approvedAmount = Number(decisionApprovedAmount);
            if (decision === 'Approved' && currentRequiresAuthorization) payload.authorizationBy = decisionAuthorizationBy;

            const r = await fetch(api.claimDecision(decisionClaim._id), { method: 'PATCH', headers, body: JSON.stringify(payload) });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.message || 'Failed to submit decision');

            setDecisionOpen(false);
            setDecisionClaim(null);
            await fetchApprovals();
            await fetchMine();
            await fetchHistory();
        } catch (e: any) {
            alert(e?.message || 'Failed to submit decision');
        } finally {
            setDeciding(false);
        }
    };

    // Admin correction modal
    const [correctOpen, setCorrectOpen] = useState(false);
    const [correctClaim, setCorrectClaim] = useState<any>(null);
    const [correctStatus, setCorrectStatus] = useState<string>('Approved');
    const [correctApprovedTotal, setCorrectApprovedTotal] = useState<number | ''>('');
    const [correcting, setCorrecting] = useState(false);

    const openCorrect = (c: any) => {
        setCorrectClaim(c);
        setCorrectStatus(c?.status || 'Approved');
        setCorrectApprovedTotal(typeof c?.approvedTotal === 'number' ? c.approvedTotal : '');
        setCorrectOpen(true);
    };

    const submitCorrection = async () => {
        if (!correctClaim?._id) return;
        setCorrecting(true);
        try {
            const payload: any = {
                status: correctStatus,
            };
            if (correctApprovedTotal !== '') payload.approvedTotal = Number(correctApprovedTotal);
            const r = await fetch(api.claimAdminCorrect(correctClaim._id), { method: 'PATCH', headers, body: JSON.stringify(payload) });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.message || 'Failed to update claim');
            setCorrectOpen(false);
            setCorrectClaim(null);
            await fetchMine();
            await fetchApprovals();
            await fetchHistory();
        } catch (e: any) {
            alert(e?.message || 'Failed to update claim');
        } finally {
            setCorrecting(false);
        }
    };

    const tabs = [
        { id: 'submit' as const, label: 'Submit Claim', icon: PlusCircle },
        { id: 'mine' as const, label: 'My Claims', icon: FileText },
        ...(isApprover ? [{ id: 'approvals' as const, label: 'Approvals', icon: Inbox }] : []),
        ...(isAdminLike ? [{ id: 'history' as const, label: 'Claims History', icon: History }] : []),
    ];

    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="rounded-2xl p-6 text-white shadow-xl relative overflow-hidden bg-gradient-to-r from-indigo-600 via-purple-600 to-violet-700">
                <div className="absolute top-0 right-0 w-72 h-72 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2.5 bg-white/20 backdrop-blur-sm rounded-xl">
                                <DollarSign size={22} />
                            </div>
                            <span className="text-sm font-bold uppercase tracking-widest text-white/80">Expense Claims</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Claim Module</h1>
                        <p className="text-white/80 text-sm mt-1">
                            Smart submission, strict eligibility, and multi-layer approvals
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            onClick={() => { fetchMine(); fetchApprovals(); fetchProgress(); fetchHistory(); }}
                            className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-sm rounded-xl transition-all"
                        >
                            <RefreshCw size={15} />
                            Refresh
                        </button>
                    </div>
                </div>

                {isApprover && (
                    <div className="relative z-10 mt-5 bg-white/10 border border-white/15 rounded-2xl p-4">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white/15 rounded-xl">
                                    <ShieldCheck size={18} />
                                </div>
                                <div>
                                    <div className="text-sm font-bold">Data Collection Progress</div>
                                    <div className="text-xs text-white/80">
                                        {loadingProgress ? 'Loading…' : progress ? `${progress.completed}/${progress.totalEmployees} employees complete` : '—'}
                                    </div>
                                </div>
                            </div>
                            <div className="text-sm font-extrabold">
                                {loadingProgress ? '—' : `${progress?.pct ?? 0}%`}
                            </div>
                        </div>
                        <div className="mt-3 h-2.5 rounded-full bg-white/20 overflow-hidden">
                            <div
                                className="h-full bg-white/70 rounded-full transition-all"
                                style={{ width: `${Math.min(100, Math.max(0, progress?.pct ?? 0))}%` }}
                            />
                        </div>
                    </div>
                )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex items-center gap-1 p-2 border-b border-slate-100">
                    {tabs.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                                tab === t.id
                                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm'
                                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                            }`}
                        >
                            <t.icon size={16} />
                            {t.label}
                        </button>
                    ))}
                    <div className="ml-auto pr-2 text-xs text-slate-400 font-medium">
                        {employee ? (
                            `Employee: ${`${employee.firstName || ''} ${employee.lastName || ''}`.trim() || employee.employeeId} (${employee.employeeId})`
                        ) : (
                            '—'
                        )}
                    </div>
                </div>

                {tab !== 'submit' && (
                    <div className="p-4 bg-slate-50/50 border-b border-slate-100 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                            <input
                                type="text"
                                placeholder="Search Claim #..."
                                value={filterClaimNo}
                                onChange={e => setFilterClaimNo(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                            />
                        </div>

                        {tab !== 'mine' && (
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                <input
                                    type="text"
                                    placeholder="Search Employee..."
                                    value={filterEmployeeName}
                                    onChange={e => setFilterEmployeeName(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                                />
                            </div>
                        )}

                        <select
                            value={filterCategory}
                            onChange={e => setFilterCategory(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                        >
                            <option value="">All Categories</option>
                            {['Medical', 'Training & Certification', 'Travel', 'Sales/Customer Gifts', 'Other'].map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>

                        <select
                            value={filterStatus}
                            onChange={e => setFilterStatus(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                        >
                            <option value="">All Statuses</option>
                            {['Draft', 'Submitted', 'Pending Team Lead', 'Pending Line Manager', 'Pending HR', 'Pending Finance', 'Approved', 'Declined'].map(s => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>

                        <input
                            type="date"
                            value={filterStartDate}
                            onChange={e => setFilterStartDate(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                            title="Start Date"
                        />

                        <input
                            type="date"
                            value={filterEndDate}
                            onChange={e => setFilterEndDate(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                            title="End Date"
                        />
                        
                        <button
                            onClick={() => {
                                setFilterClaimNo('');
                                setFilterEmployeeName('');
                                setFilterCategory('');
                                setFilterStatus('');
                                setFilterStartDate('');
                                setFilterEndDate('');
                            }}
                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
                        >
                            <X size={12} /> Clear
                        </button>
                    </div>
                )}

                {tab === 'submit' && (
                    <div className="p-6 space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {isAdminLike && (
                                <div className="lg:col-span-2">
                                    <label className="text-xs font-bold text-slate-600">Apply On Behalf Of Employee (Admin/HR Only)</label>
                                    <select
                                        value={selectedEmployeeId}
                                        onChange={e => {
                                            const empId = e.target.value;
                                            setSelectedEmployeeId(empId);
                                            const emp = allEmployees.find(emp => emp.employeeId === empId);
                                            if (emp) {
                                                setDependents(Array.isArray(emp.dependents) ? emp.dependents : []);
                                            } else {
                                                setDependents(Array.isArray(employee?.dependents) ? employee.dependents : []);
                                            }
                                        }}
                                        className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                    >
                                        <option value="">Myself ({employee ? `${employee.firstName} ${employee.lastName} (${employee.employeeId})` : 'Loading...' })</option>
                                        {allEmployees.filter(emp => emp.employeeId !== employee?.employeeId).map(emp => (
                                            <option key={emp.employeeId} value={emp.employeeId}>
                                                {emp.firstName} {emp.lastName} ({emp.employeeId})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {category === 'Medical' && (
                                <div className="lg:col-span-2 p-4 bg-indigo-50/70 border border-indigo-100 rounded-xl flex items-center justify-between text-indigo-700 text-xs font-bold animate-fadeIn">
                                    <span>Remaining Medical balance for {selectedEmployeeId ? "selected employee" : "you"} ({new Date().getFullYear()}):</span>
                                    <span className="text-sm font-extrabold">
                                        {(selectedEmployeeId ? loadingHistory : loadingMine) ? 'Loading...' : formatMoney(remainingMedicalLimit)}
                                    </span>
                                </div>
                            )}
                            <div>
                                <label className="text-xs font-bold text-slate-600">Category</label>
                                <select
                                    value={category}
                                    onChange={e => {
                                        const cat = e.target.value as Category;
                                        setCategory(cat);
                                        setSubCategory('');
                                    }}
                                    className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                >
                                    {(['Medical', 'Training & Certification', 'Travel', 'Sales/Customer Gifts', 'Other'] as Category[]).map(c => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-600">Sub-category</label>
                                <select
                                    value={subCategory}
                                    onChange={e => setSubCategory(e.target.value)}
                                    className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                >
                                    <option value="">Select Sub-category</option>
                                    {(SUB_CATEGORIES[category] || []).map(sc => (
                                        <option key={sc} value={sc}>{sc}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-600">Expense/Medical Date</label>
                                <input
                                    type="date"
                                    value={expenseDate}
                                    onChange={e => setExpenseDate(e.target.value)}
                                    className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-600">Purpose (optional)</label>
                                <input
                                    value={purpose}
                                    onChange={e => setPurpose(e.target.value)}
                                    placeholder={category === 'Training & Certification' ? 'e.g., AWS certification exam fee' : 'e.g., business trip / medical visit'}
                                    className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                />
                                {category === 'Training & Certification' && (
                                    <p className="text-[11px] text-slate-400 mt-1">
                                        Training & Certification claims require an extra Team Lead approval layer.
                                    </p>
                                )}
                            </div>

                            {category === 'Medical' && (
                                <div>
                                    <label className="text-xs font-bold text-slate-600">For whom</label>
                                    <select
                                        value={forWhom}
                                        onChange={e => setForWhom(e.target.value as ForWhom)}
                                        className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                    >
                                        <option value="Self">Self</option>
                                        <option value="Dependent">Dependent</option>
                                    </select>
                                    {forWhom === 'Dependent' && (
                                        <div className="mt-2">
                                            <select
                                                value={dependentId}
                                                onChange={e => setDependentId(e.target.value)}
                                                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                            >
                                                <option value="">Select registered dependent</option>
                                                {dependents.map(d => (
                                                    <option key={String(d._id)} value={String(d._id)}>
                                                        {d.name} ({d.relation})
                                                    </option>
                                                ))}
                                            </select>
                                            <p className="text-[11px] text-slate-400 mt-1">
                                                Claims for non-registered dependents are blocked automatically.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}


                            <div>
                                <label className="text-xs font-bold text-slate-600">Amount Requested (PKR)</label>
                                <input
                                    type="number"
                                    value={amountRequested || ''}
                                    onChange={e => setAmountRequested(Number(e.target.value))}
                                    placeholder="0"
                                    className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                />
                                 <p className="text-[11px] text-slate-400 mt-1">
                                     {category === 'Medical' ? (
                                         <span>
                                             Claims exceeding {selectedEmployeeId ? "the selected employee's" : "your"} remaining <strong>{formatMoney(remainingMedicalLimit)}</strong> balance are flagged as out-of-policy.
                                         </span>
                                     ) : (
                                         'Out-of-policy amounts are flagged and require HR/Senior Management authorization.'
                                     )}
                                 </p>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-600">
                                    Comment {['Training & Certification', 'Sales/Customer Gifts', 'Other'].includes(category) ? '(comment or receipt required)' : '(optional)'}
                                </label>
                                <input
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    placeholder={category === 'Sales/Customer Gifts' ? 'Customer name, purpose, and context…' : 'Optional notes…'}
                                    className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                />
                            </div>

                            <div className="lg:col-span-2">
                                <label className="text-xs font-bold text-slate-600">
                                    Receipts {category === 'Medical' ? '(required)' : ['Training & Certification', 'Sales/Customer Gifts', 'Other'].includes(category) ? '(comment or receipt required)' : '(optional)'}
                                </label>
                                <input
                                    type="file"
                                    multiple
                                    onChange={e => setReceiptFiles(Array.from(e.target.files || []))}
                                    className="mt-1 w-full text-sm"
                                />
                                {receiptFiles.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {receiptFiles.map(f => (
                                            <span key={f.name} className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700">
                                                {f.name}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <p className="text-[11px] text-slate-400 mt-1">
                                    Up to 5 receipts, 5MB each.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between gap-3">
                            <div className="text-xs text-rose-600 font-semibold">
                                {submitDisabledReason ? submitDisabledReason : ''}
                            </div>
                            <button
                                onClick={handleSubmit}
                                disabled={!!submitDisabledReason || submitting}
                                className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-colors"
                            >
                                {submitting ? 'Submitting…' : 'Submit Claim'}
                            </button>
                        </div>
                    </div>
                )}

                {tab === 'mine' && (
                    <div className="p-6">
                        {loadingMine ? (
                            <div className="text-slate-400 text-sm">Loading…</div>
                        ) : filteredMine.length === 0 ? (
                            <div className="text-center py-12 text-slate-400">
                                <FileText size={42} className="mx-auto mb-3 text-slate-300" />
                                <p className="font-semibold">No claims yet.</p>
                                <p className="text-sm mt-1">Submit your first expense claim from the “Submit Claim” tab.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-slate-100">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-100">
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Claim #</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Category</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Requested</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Allowed</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Approved</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Flags</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Receipts</th>
                                            {isAdminLike && (
                                                <th className="text-left px-4 py-3 font-semibold text-slate-600">Admin</th>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredMine.map((c: any) => (
                                            <tr key={c._id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                                <td className="px-4 py-3 font-bold text-slate-800">{c.claimNo || '—'}</td>
                                                <td className="px-4 py-3 text-slate-600">{c.category}</td>
                                                <td className="px-4 py-3 text-slate-700 font-semibold">
                                                    <div>{formatMoney(c.amountRequested, c.currency)}</div>
                                                    {c.amountRequested > c.amountAllowed && (
                                                        <div className="text-[10px] text-rose-500 font-bold">
                                                            Disallowed: {formatMoney(c.amountRequested - c.amountAllowed, c.currency)}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-slate-600">{formatMoney(c.amountAllowed, c.currency)}</td>
                                                <td className="px-4 py-3 text-slate-600">{formatMoney(c.approvedTotal, c.currency)}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${STATUS_COLORS[c.status] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                                        {c.status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {(c.eligibility?.flags || []).length ? (c.eligibility.flags || []).map((f: string) => (
                                                            <span key={f} className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold">
                                                                {f}
                                                            </span>
                                                        )) : (
                                                            <span className="text-xs text-slate-400">—</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {(c.receipts || []).length ? (
                                                        <div className="flex flex-col gap-1">
                                                            {(c.receipts || []).map((r: any) => (
                                                                <button
                                                                    key={r._id}
                                                                    onClick={() => downloadReceipt(c._id, r._id, r.fileName)}
                                                                    className="text-left text-indigo-600 hover:text-indigo-700 font-semibold text-xs"
                                                                >
                                                                    {r.fileName}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-slate-400">—</span>
                                                    )}
                                                </td>
                                                {isAdminLike && (
                                                    <td className="px-4 py-3">
                                                        <button
                                                            onClick={() => openCorrect(c)}
                                                            className="text-xs font-bold text-slate-600 hover:text-slate-900"
                                                        >
                                                            Correct
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {tab === 'approvals' && isApprover && (
                    <div className="p-6">
                        {loadingApprovals ? (
                            <div className="text-slate-400 text-sm">Loading…</div>
                        ) : filteredApprovals.length === 0 ? (
                            <div className="text-center py-12 text-slate-400">
                                <Inbox size={42} className="mx-auto mb-3 text-slate-300" />
                                <p className="font-semibold">No pending approvals.</p>
                                <p className="text-sm mt-1">New claims will appear here automatically.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-slate-100">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-100">
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Claim #</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Employee</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Category</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Requested</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Allowed</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Flags</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredApprovals.map((c: any) => (
                                            <tr key={c._id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                                <td className="px-4 py-3 font-bold text-slate-800">{c.claimNo || '—'}</td>
                                                 <td className="px-4 py-3 text-slate-600">
                                                     {c.employeeDetails ? (
                                                         <div>
                                                             <div className="font-semibold text-slate-800">
                                                                 {`${c.employeeDetails.firstName || ''} ${c.employeeDetails.lastName || ''}`.trim()}
                                                             </div>
                                                             <div className="text-[11px] text-slate-400">{c.employeeId}</div>
                                                         </div>
                                                     ) : (
                                                         c.employeeId
                                                     )}
                                                 </td>
                                                <td className="px-4 py-3 text-slate-600">{c.category}</td>
                                                <td className="px-4 py-3 text-slate-700 font-semibold">
                                                    <div>{formatMoney(c.amountRequested, c.currency)}</div>
                                                    {c.amountRequested > c.amountAllowed && (
                                                        <div className="text-[10px] text-rose-500 font-bold">
                                                            Disallowed: {formatMoney(c.amountRequested - c.amountAllowed, c.currency)}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-slate-600">{formatMoney(c.amountAllowed, c.currency)}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${STATUS_COLORS[c.status] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                                        {c.status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {(c.eligibility?.flags || []).length ? (c.eligibility.flags || []).map((f: string) => (
                                                            <span key={f} className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold">
                                                                {f}
                                                            </span>
                                                        )) : (
                                                            <span className="text-xs text-slate-400">—</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <button
                                                        onClick={() => openDecision(c)}
                                                        className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700"
                                                    >
                                                        Review
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {tab === 'history' && isAdminLike && (
                    <div className="p-6">
                        {loadingHistory ? (
                            <div className="text-slate-400 text-sm">Loading…</div>
                        ) : filteredHistory.length === 0 ? (
                            <div className="text-center py-12 text-slate-400">
                                <History size={42} className="mx-auto mb-3 text-slate-300" />
                                <p className="font-semibold">No claims in history.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-slate-100">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-100">
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Claim #</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Employee</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Category</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Requested</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Allowed</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Approved</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Submitted At</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Receipts</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredHistory.map((c: any) => (
                                            <tr key={c._id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                                <td className="px-4 py-3 font-bold text-slate-800">{c.claimNo || '—'}</td>
                                                 <td className="px-4 py-3 text-slate-600">
                                                     {c.employeeDetails ? (
                                                         <div>
                                                             <div className="font-semibold text-slate-800">
                                                                 {`${c.employeeDetails.firstName || ''} ${c.employeeDetails.lastName || ''}`.trim()}
                                                             </div>
                                                             <div className="text-[11px] text-slate-400">{c.employeeId}</div>
                                                         </div>
                                                     ) : (
                                                         c.employeeId
                                                     )}
                                                 </td>
                                                <td className="px-4 py-3 text-slate-600">{c.category}</td>
                                                <td className="px-4 py-3 text-slate-700 font-semibold">
                                                    <div>{formatMoney(c.amountRequested, c.currency)}</div>
                                                    {c.amountRequested > c.amountAllowed && (
                                                        <div className="text-[10px] text-rose-500 font-bold">
                                                            Disallowed: {formatMoney(c.amountRequested - c.amountAllowed, c.currency)}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-slate-600">{formatMoney(c.amountAllowed, c.currency)}</td>
                                                <td className="px-4 py-3 text-slate-600">{formatMoney(c.approvedTotal, c.currency)}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${STATUS_COLORS[c.status] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                                        {c.status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-slate-500">
                                                    {c.audit?.submittedAt ? new Date(c.audit.submittedAt).toLocaleDateString('en-PK') : new Date(c.createdAt).toLocaleDateString('en-PK')}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {(c.receipts || []).length ? (
                                                        <div className="flex flex-col gap-1">
                                                            {(c.receipts || []).map((r: any) => (
                                                                <button
                                                                    key={r._id}
                                                                    onClick={() => downloadReceipt(c._id, r._id, r.fileName)}
                                                                    className="text-left text-indigo-600 hover:text-indigo-700 font-semibold text-xs"
                                                                >
                                                                    {r.fileName}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-slate-400">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 flex gap-2">
                                                    {c.status !== 'Approved' && c.status !== 'Declined' && (
                                                        <button
                                                            onClick={() => openDecision(c)}
                                                            className="text-xs font-bold text-indigo-600 hover:text-indigo-900"
                                                        >
                                                            Decision
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => openCorrect(c)}
                                                        className="text-xs font-bold text-slate-600 hover:text-slate-900"
                                                    >
                                                        Correct
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {decisionOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
                        <div className="flex items-center justify-between p-5 border-b border-slate-100">
                            <div>
                                <div className="text-sm font-extrabold text-slate-800">Review Claim</div>
                                <div className="text-xs text-slate-500">
                                    {decisionClaim?.claimNo} • {decisionClaim?.employeeDetails 
                                        ? `${decisionClaim.employeeDetails.firstName || ''} ${decisionClaim.employeeDetails.lastName || ''}`.trim() 
                                        : 'Employee'} ({decisionClaim?.employeeId})
                                </div>
                            </div>
                            <button onClick={() => setDecisionOpen(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-slate-600">Decision</label>
                                    <select
                                        value={decision}
                                        onChange={e => setDecision(e.target.value as any)}
                                        className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                    >
                                        <option value="Approved">Approve</option>
                                        <option value="Declined">Decline</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-600">Approved Amount (optional)</label>
                                    <input
                                        type="number"
                                        value={decisionApprovedAmount}
                                        onChange={e => setDecisionApprovedAmount(e.target.value === '' ? '' : Number(e.target.value))}
                                        disabled={decision === 'Declined'}
                                        className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:bg-slate-50"
                                    />
                                    <p className="text-[11px] text-slate-400 mt-1">
                                        Requested: {formatMoney(decisionClaim?.amountRequested, decisionClaim?.currency)} • Allowed: {formatMoney(decisionClaim?.amountAllowed, decisionClaim?.currency)}
                                        {decisionClaim?.amountRequested > decisionClaim?.amountAllowed && (
                                            <span className="text-rose-500 font-bold ml-1.5">
                                                (Disallowed: {formatMoney(decisionClaim.amountRequested - decisionClaim.amountAllowed, decisionClaim.currency)})
                                            </span>
                                        )}
                                    </p>
                                </div>
                            </div>

                            {decision === 'Approved' && currentRequiresAuthorization && (
                                <div>
                                    <label className="text-xs font-bold text-slate-600">Authorization for out-of-policy claim</label>
                                    <select
                                        value={decisionAuthorizationBy}
                                        onChange={e => setDecisionAuthorizationBy(e.target.value)}
                                        className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                    >
                                        <option value="">Select authorization</option>
                                        <option value="HR">HR</option>
                                        <option value="Senior Management">Senior Management</option>
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="text-xs font-bold text-slate-600">Comments (optional)</label>
                                <textarea
                                    value={decisionComments}
                                    onChange={e => setDecisionComments(e.target.value)}
                                    rows={3}
                                    className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2">
                                <button
                                    onClick={() => setDecisionOpen(false)}
                                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={submitDecision}
                                    disabled={deciding}
                                    className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 disabled:opacity-50"
                                >
                                    {deciding ? 'Saving…' : 'Submit'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {correctOpen && isAdminLike && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
                        <div className="flex items-center justify-between p-5 border-b border-slate-100">
                            <div>
                                <div className="text-sm font-extrabold text-slate-800">Admin Correction</div>
                                <div className="text-xs text-slate-500">
                                    {correctClaim?.claimNo} • {correctClaim?.employeeDetails 
                                        ? `${correctClaim.employeeDetails.firstName || ''} ${correctClaim.employeeDetails.lastName || ''}`.trim() 
                                        : 'Employee'} ({correctClaim?.employeeId})
                                </div>
                            </div>
                            <button onClick={() => setCorrectOpen(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200/50">
                                <span className="font-bold">Requested:</span> {formatMoney(correctClaim?.amountRequested, correctClaim?.currency)} • <span className="font-bold">Allowed:</span> {formatMoney(correctClaim?.amountAllowed, correctClaim?.currency)}
                                {correctClaim?.amountRequested > correctClaim?.amountAllowed && (
                                    <div className="text-rose-500 font-bold mt-1">
                                        Disallowed: {formatMoney(correctClaim.amountRequested - correctClaim.amountAllowed, correctClaim.currency)}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-slate-600">Status</label>
                                    <select
                                        value={correctStatus}
                                        onChange={e => setCorrectStatus(e.target.value)}
                                        className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                    >
                                        {['Submitted', 'Pending Team Lead', 'Pending Line Manager', 'Pending HR', 'Pending Finance', 'Approved', 'Declined'].map(s => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-600">Approved Total (optional)</label>
                                    <input
                                        type="number"
                                        value={correctApprovedTotal}
                                        onChange={e => setCorrectApprovedTotal(e.target.value === '' ? '' : Number(e.target.value))}
                                        className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2">
                                <button
                                    onClick={() => setCorrectOpen(false)}
                                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={submitCorrection}
                                    disabled={correcting}
                                    className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 disabled:opacity-50"
                                >
                                    {correcting ? 'Saving…' : 'Update'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ExpenseClaimDashboard;

