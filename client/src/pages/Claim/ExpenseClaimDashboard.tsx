import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import {
    FileText,
    Inbox,
    PlusCircle,
    RefreshCw,
    ShieldCheck,
    X,
    History,
    Search,
    Download,
    Eye,
    ZoomIn,
    CheckCircle2,
    XCircle,
    Clock,
    AlertTriangle,
    Receipt,
    Upload,
    User,
    CalendarDays,
    Tag,
    MessageSquare,
    ChevronLeft,
    ChevronRight,
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

    const decisionClaimRemainingLimit = useMemo(() => {
        if (!decisionClaim || !decisionClaim.employeeId) return null;
        if (decisionClaim.category !== 'Medical') return null;

        const currentYear = new Date().getFullYear();
        const startOfYear = new Date(currentYear, 0, 1).getTime();
        const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999).getTime();

        const allLoadedClaims = [...history, ...approvals, ...mine];
        const uniqueClaims = Array.from(new Map(allLoadedClaims.map(c => [c._id, c])).values());

        const claimantClaims = uniqueClaims.filter((c: any) => {
            if (c.employeeId !== decisionClaim.employeeId) return false;
            if (c.category !== 'Medical') return false;
            if (c.status === 'Draft' || c.status === 'Declined') return false;
            if (c._id === decisionClaim._id) return false;
            const createdAt = new Date(c.createdAt).getTime();
            return createdAt >= startOfYear && createdAt <= endOfYear;
        });

        const claimedSoFar = claimantClaims.reduce((sum: number, c: any) => {
            const amount = typeof c.approvedTotal === 'number' ? c.approvedTotal : c.amountAllowed;
            return sum + amount;
        }, 0);

        return Math.max(0, 60000 - claimedSoFar);
    }, [decisionClaim, history, approvals, mine]);

    // Receipt preview state
    const [receiptBlobs, setReceiptBlobs] = useState<Record<string, string>>({});
    const [loadingReceipts, setLoadingReceipts] = useState(false);
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

    const openDecision = async (c: any) => {
        setDecisionClaim(c);
        setDecision('Approved');
        setDecisionComments('');
        const allowed = typeof c?.amountAllowed === 'number' ? c.amountAllowed : c?.amountRequested;
        const initial = Math.min(c?.amountRequested || 0, allowed || 0);
        setDecisionApprovedAmount(Number.isFinite(initial) ? initial : '');
        setDecisionAuthorizationBy('');
        setReceiptBlobs({});
        setLightboxIndex(null);
        setDecisionOpen(true);

        // Pre-fetch all receipts so the reviewer can see them inline
        const receipts: any[] = c?.receipts || [];
        if (receipts.length === 0) return;
        setLoadingReceipts(true);
        const blobs: Record<string, string> = {};
        await Promise.all(
            receipts.map(async (r: any) => {
                try {
                    const resp = await fetch(api.claimReceipt(c._id, r._id), {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (!resp.ok) return;
                    const blob = await resp.blob();
                    blobs[r._id] = window.URL.createObjectURL(blob);
                } catch {
                    // ignore individual failures — download button still works
                }
            })
        );
        setReceiptBlobs(blobs);
        setLoadingReceipts(false);
    };

    const closeDecision = () => {
        setDecisionOpen(false);
        // Revoke all blob URLs to free memory
        Object.values(receiptBlobs).forEach(u => window.URL.revokeObjectURL(u));
        setReceiptBlobs({});
        setLightboxIndex(null);
        setDecisionClaim(null);
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

    // Lock scroll on BOTH <html> and <body> when any modal is open.
    // Some browsers scroll the <html> element, others scroll <body> — we cover both.
    useEffect(() => {
        const anyOpen = decisionOpen || correctOpen || lightboxIndex !== null;
        const html = document.documentElement;
        const body = document.body;
        if (anyOpen) {
            const scrollY = window.scrollY;
            html.style.overflow = 'hidden';
            body.style.overflow = 'hidden';
            // Prevent layout shift from scrollbar disappearing
            body.style.position = 'fixed';
            body.style.top = `-${scrollY}px`;
            body.style.width = '100%';
        } else {
            const scrollY = body.style.top;
            html.style.overflow = '';
            body.style.overflow = '';
            body.style.position = '';
            body.style.top = '';
            body.style.width = '';
            // Restore scroll position
            if (scrollY) {
                window.scrollTo(0, parseInt(scrollY || '0', 10) * -1);
            }
        }
        return () => {
            html.style.overflow = '';
            body.style.overflow = '';
            body.style.position = '';
            body.style.top = '';
            body.style.width = '';
        };
    }, [decisionOpen, correctOpen, lightboxIndex]);

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
                                <Receipt size={22} />
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
                                <span className="text-xs font-bold text-slate-600">
                                    Receipts {category === 'Medical' ? '(required)' : ['Training & Certification', 'Sales/Customer Gifts', 'Other'].includes(category) ? '(comment or receipt required)' : '(optional)'}
                                </span>
                                <div className="mt-2 flex flex-wrap items-center gap-3">
                                    <input
                                        id="claim-receipt-upload"
                                        type="file"
                                        multiple
                                        accept="image/*,.pdf,.png,.jpg,.jpeg,.webp"
                                        onChange={e => setReceiptFiles(Array.from(e.target.files || []))}
                                        className="sr-only"
                                    />
                                    <label
                                        htmlFor="claim-receipt-upload"
                                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-bold shadow-md hover:shadow-lg hover:from-indigo-700 hover:to-purple-700 active:scale-[0.98] transition-all cursor-pointer"
                                    >
                                        <Upload size={18} />
                                        {receiptFiles.length > 0 ? 'Add more receipts' : 'Upload receipts'}
                                    </label>
                                    {receiptFiles.length > 0 ? (
                                        <span className="text-sm font-semibold text-indigo-600">
                                            {receiptFiles.length} file{receiptFiles.length !== 1 ? 's' : ''} selected
                                        </span>
                                    ) : (
                                        <span className="text-sm text-slate-500">No file chosen</span>
                                    )}
                                </div>
                                {receiptFiles.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {receiptFiles.map(f => (
                                            <span key={f.name} className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-xs font-semibold text-indigo-800">
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

            {/* ══════════════════════════════════════════════════════════════
                  DOCUMENT REVIEW MODAL — HR / Admin full claim inspection
            ══════════════════════════════════════════════════════════════ */}
            {decisionOpen && decisionClaim && (
                <div className="fixed inset-0 min-[992px]:left-64 min-[992px]:top-16 z-50 flex items-end min-[992px]:items-center justify-center bg-black/50 backdrop-blur-sm p-0 min-[992px]:p-6">
                    {/* Main panel */}
                    <div className="bg-white w-full min-[992px]:max-w-4xl max-h-[90vh] min-[992px]:max-h-[calc(100vh-5rem)] rounded-t-3xl min-[992px]:rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">

                        {/* ── Header ─────────────────────────────────────────── */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-t-3xl sm:rounded-t-2xl flex-shrink-0">
                            <div>
                                <div className="text-base font-extrabold text-white flex items-center gap-2">
                                    <Receipt size={18} />
                                    Claim Review — {decisionClaim.claimNo}
                                </div>
                                <div className="text-xs text-white/75 mt-0.5">
                                    {decisionClaim.employeeDetails
                                        ? `${decisionClaim.employeeDetails.firstName || ''} ${decisionClaim.employeeDetails.lastName || ''}`.trim()
                                        : 'Employee'}
                                    {' '}({decisionClaim.employeeId})
                                </div>
                            </div>
                            <button
                                onClick={closeDecision}
                                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* ── Scrollable body ────────────────────────────────── */}
                        <div className="flex-1 overflow-y-auto">
                            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">

                                {/* ── LEFT: Claim Details + Approval Trail ─────── */}
                                <div className="p-6 space-y-5">

                                    {/* Summary cards */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                                            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-bold mb-1"><Tag size={11} />CATEGORY</div>
                                            <div className="font-bold text-slate-800 text-sm">{decisionClaim.category}</div>
                                            {decisionClaim.subCategory && <div className="text-xs text-slate-500 mt-0.5">{decisionClaim.subCategory}</div>}
                                        </div>
                                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                                            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-bold mb-1"><CalendarDays size={11} />EXPENSE DATE</div>
                                            <div className="font-bold text-slate-800 text-sm">
                                                {decisionClaim.expenseDate
                                                    ? new Date(decisionClaim.expenseDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
                                                    : '—'}
                                            </div>
                                        </div>
                                        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3">
                                            <div className="flex items-center gap-1.5 text-indigo-400 text-[11px] font-bold mb-1">
                                                <span className="text-[10px] font-black text-indigo-500/80 mr-0.5 leading-none">PKR</span>
                                                REQUESTED
                                            </div>
                                            <div className="font-extrabold text-indigo-800 text-sm">{formatMoney(decisionClaim.amountRequested, decisionClaim.currency)}</div>
                                        </div>
                                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                                            <div className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-bold mb-1">
                                                <ShieldCheck size={11} />
                                                {decisionClaim.category === 'Medical' ? 'REMAINING LIMIT' : 'POLICY LIMIT'}
                                            </div>
                                            <div className="font-bold text-emerald-700 text-sm">
                                                {decisionClaim.category === 'Medical' && typeof decisionClaimRemainingLimit === 'number'
                                                    ? formatMoney(decisionClaimRemainingLimit, decisionClaim.currency)
                                                    : formatMoney(decisionClaim.amountAllowed, decisionClaim.currency)
                                                }
                                            </div>
                                            {decisionClaim.category === 'Medical' && typeof decisionClaimRemainingLimit === 'number' && decisionClaim.amountRequested > decisionClaimRemainingLimit && (
                                                <div className="text-[10px] text-rose-500 font-bold mt-0.5">
                                                    ↑ Over by {formatMoney(decisionClaim.amountRequested - decisionClaimRemainingLimit, decisionClaim.currency)}
                                                </div>
                                            )}
                                            {decisionClaim.category !== 'Medical' && decisionClaim.amountRequested > decisionClaim.amountAllowed && (
                                                <div className="text-[10px] text-rose-500 font-bold mt-0.5">
                                                    ↑ Over by {formatMoney(decisionClaim.amountRequested - decisionClaim.amountAllowed, decisionClaim.currency)}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* For whom */}
                                    {(decisionClaim.forWhom || decisionClaim.dependentName) && (
                                        <div className="flex items-start gap-2 text-sm">
                                            <User size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
                                            <div>
                                                <span className="text-slate-500">For: </span>
                                                <span className="font-semibold text-slate-700">
                                                    {decisionClaim.forWhom === 'Dependent' && decisionClaim.dependentName
                                                        ? `${decisionClaim.dependentName} (Dependent)`
                                                        : decisionClaim.forWhom || 'Self'}
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Purpose */}
                                    {decisionClaim.purpose && (
                                        <div className="flex items-start gap-2 text-sm">
                                            <MessageSquare size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
                                            <div>
                                                <span className="text-slate-500">Purpose: </span>
                                                <span className="font-semibold text-slate-700">{decisionClaim.purpose}</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Employee note */}
                                    {decisionClaim.notes && (
                                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                                            <div className="text-[11px] font-bold text-amber-700 mb-1 flex items-center gap-1.5"><MessageSquare size={11} />EMPLOYEE NOTE</div>
                                            <div className="text-sm text-amber-900">{decisionClaim.notes}</div>
                                        </div>
                                    )}

                                    {/* Eligibility flags */}
                                    {(decisionClaim.eligibility?.flags || []).length > 0 && (
                                        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3">
                                            <div className="text-[11px] font-bold text-rose-700 mb-2 flex items-center gap-1.5"><AlertTriangle size={11} />ELIGIBILITY FLAGS</div>
                                            <div className="flex flex-wrap gap-2">
                                                {(decisionClaim.eligibility.flags as string[]).map((f: string) => (
                                                    <span key={f} className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 border border-rose-200 text-xs font-bold">{f}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Approval trail */}
                                    {(decisionClaim.approvals || []).length > 0 && (
                                        <div>
                                            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Approval Trail</div>
                                            <div className="space-y-2">
                                                {(decisionClaim.approvals as any[]).map((appr: any, idx: number) => {
                                                    const isPending = appr.status === 'Pending';
                                                    const isApproved = appr.status === 'Approved';
                                                    const isDeclined = appr.status === 'Declined';
                                                    return (
                                                        <div
                                                            key={idx}
                                                            className={`flex items-start gap-3 p-3 rounded-xl border text-sm ${
                                                                isPending ? 'bg-amber-50 border-amber-200'
                                                                : isApproved ? 'bg-emerald-50 border-emerald-200'
                                                                : isDeclined ? 'bg-rose-50 border-rose-200'
                                                                : 'bg-slate-50 border-slate-200'
                                                            }`}
                                                        >
                                                            <div className="flex-shrink-0 mt-0.5">
                                                                {isPending && <Clock size={15} className="text-amber-500" />}
                                                                {isApproved && <CheckCircle2 size={15} className="text-emerald-500" />}
                                                                {isDeclined && <XCircle size={15} className="text-rose-500" />}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="font-bold capitalize text-slate-700">
                                                                    Stage {idx + 1}: {appr.stage?.replace(/([A-Z])/g, ' $1').trim()}
                                                                </div>
                                                                <div className={`text-xs font-semibold mt-0.5 ${
                                                                    isPending ? 'text-amber-600' : isApproved ? 'text-emerald-600' : 'text-rose-600'
                                                                }`}>{appr.status}</div>
                                                                {appr.comments && <div className="text-xs text-slate-500 mt-1 italic">"{appr.comments}"</div>}
                                                                {typeof appr.approvedAmount === 'number' && (
                                                                    <div className="text-xs text-slate-600 mt-0.5">Approved: {formatMoney(appr.approvedAmount, decisionClaim.currency)}</div>
                                                                )}
                                                                {appr.decidedAt && (
                                                                    <div className="text-[10px] text-slate-400 mt-0.5">
                                                                        {new Date(appr.decidedAt).toLocaleString('en-PK')}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* ── RIGHT: Receipt / Document Viewer ──────────── */}
                                <div className="p-6 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                                            <Receipt size={12} />
                                            Uploaded Documents ({(decisionClaim.receipts || []).length})
                                        </div>
                                        {loadingReceipts && (
                                            <div className="text-xs text-slate-400 flex items-center gap-1.5">
                                                <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                                                Loading previews…
                                            </div>
                                        )}
                                    </div>

                                    {(decisionClaim.receipts || []).length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-12 rounded-xl border-2 border-dashed border-slate-200">
                                            <FileText size={36} className="text-slate-200 mb-3" />
                                            <div className="text-sm font-semibold text-slate-400">No documents uploaded</div>
                                            <div className="text-xs text-slate-300 mt-1 text-center max-w-48">
                                                {decisionClaim.category === 'Medical'
                                                    ? '⚠️ Medical claims should include receipts — flag for review'
                                                    : 'This claim type may not require receipts'}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {(decisionClaim.receipts as any[]).map((r: any, idx: number) => {
                                                const blobUrl = receiptBlobs[r._id];
                                                const isImage = r.contentType?.startsWith('image/');
                                                const isPdf = r.contentType === 'application/pdf';

                                                return (
                                                    <div key={r._id} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                                                        {/* File header bar */}
                                                        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <div className={`p-1.5 rounded-lg flex-shrink-0 ${
                                                                    isImage ? 'bg-indigo-100' : isPdf ? 'bg-rose-100' : 'bg-slate-100'
                                                                }`}>
                                                                    <FileText size={12} className={isImage ? 'text-indigo-600' : isPdf ? 'text-rose-600' : 'text-slate-600'} />
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className="text-xs font-bold text-slate-700 truncate">{r.fileName}</div>
                                                                    <div className="text-[10px] text-slate-400">{r.contentType}</div>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                                                                {blobUrl && isPdf && (
                                                                    <a
                                                                        href={blobUrl}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold hover:bg-rose-100 transition-colors"
                                                                    >
                                                                        <Eye size={11} /> View PDF
                                                                    </a>
                                                                )}
                                                                {blobUrl && isImage && (
                                                                    <button
                                                                        onClick={() => setLightboxIndex(idx)}
                                                                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-bold hover:bg-indigo-100 transition-colors"
                                                                    >
                                                                        <ZoomIn size={11} /> Enlarge
                                                                    </button>
                                                                )}
                                                                <button
                                                                    onClick={() => downloadReceipt(decisionClaim._id, r._id, r.fileName)}
                                                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white text-slate-700 border border-slate-200 text-[11px] font-bold hover:bg-slate-50 transition-colors"
                                                                >
                                                                    <Download size={11} /> Download
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Preview area */}
                                                        {loadingReceipts && !blobUrl ? (
                                                            <div className="flex items-center justify-center h-40 bg-slate-50">
                                                                <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                                                            </div>
                                                        ) : blobUrl && isImage ? (
                                                            <img
                                                                src={blobUrl}
                                                                alt={r.fileName}
                                                                className="w-full max-h-72 object-contain bg-slate-100 cursor-zoom-in hover:opacity-90 transition-opacity"
                                                                onClick={() => setLightboxIndex(idx)}
                                                                title="Click to enlarge"
                                                            />
                                                        ) : blobUrl && isPdf ? (
                                                            <div className="flex flex-col items-center justify-center h-36 gap-3 bg-slate-50">
                                                                <div className="p-4 bg-rose-50 rounded-2xl">
                                                                    <FileText size={32} className="text-rose-400" />
                                                                </div>
                                                                <div className="text-xs font-semibold text-slate-500">PDF — click "View PDF" above to open</div>
                                                            </div>
                                                        ) : !loadingReceipts ? (
                                                            <div className="flex items-center justify-center h-24 bg-slate-50 text-slate-300 text-xs">
                                                                Preview unavailable — use Download
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Verification checklist */}
                                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mt-2">
                                        <div className="flex items-start gap-2">
                                            <ShieldCheck size={15} className="text-indigo-600 flex-shrink-0 mt-0.5" />
                                            <div className="text-xs text-indigo-800">
                                                <div className="font-bold mb-1.5">Verification Checklist</div>
                                                <ul className="space-y-1 text-indigo-700">
                                                    <li>✓ Receipt dates match the stated expense date</li>
                                                    <li>✓ Receipt amounts match the claim amount</li>
                                                    <li>✓ Patient / beneficiary name is correct</li>
                                                    <li>✓ Document is legible and unaltered</li>
                                                    <li>✓ Vendor / hospital name is visible and valid</li>
                                                    {decisionClaim.forWhom === 'Dependent' && (
                                                        <li className="font-semibold">✓ Dependent name ({decisionClaim.dependentName}) matches receipt</li>
                                                    )}
                                                    {decisionClaim.category === 'Medical' && (
                                                        <li>✓ Official stamp / letterhead present on medical receipt</li>
                                                    )}
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ── Decision Form — full-width bottom strip ───────── */}
                            <div className="border-t border-slate-100 bg-slate-50/70 px-6 py-5 space-y-4">
                                <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">Your Decision</div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-bold text-slate-600 block mb-1">Decision</label>
                                        <div className="grid grid-cols-2 gap-2 mt-1">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setDecision('Approved');
                                                    if (decisionApprovedAmount === 0 || decisionApprovedAmount === '') {
                                                        const initial = decisionClaim.amountAllowed;
                                                        setDecisionApprovedAmount(Number.isFinite(initial) ? initial : '');
                                                    }
                                                }}
                                                className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-bold transition-all ${
                                                    decision === 'Approved'
                                                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700 ring-2 ring-emerald-500/20'
                                                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                                }`}
                                            >
                                                <CheckCircle2 size={16} className={decision === 'Approved' ? 'text-emerald-600' : 'text-slate-400'} />
                                                Approve
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setDecision('Declined');
                                                    setDecisionApprovedAmount(0);
                                                }}
                                                className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-bold transition-all ${
                                                    decision === 'Declined'
                                                        ? 'bg-rose-50 border-rose-300 text-rose-700 ring-2 ring-rose-500/20'
                                                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                                }`}
                                            >
                                                <XCircle size={16} className={decision === 'Declined' ? 'text-rose-600' : 'text-slate-400'} />
                                                Decline
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-600">Approved Amount</label>
                                        <input
                                            type="number"
                                            value={decisionApprovedAmount}
                                            onChange={e => setDecisionApprovedAmount(e.target.value === '' ? '' : Number(e.target.value))}
                                            disabled={decision === 'Declined'}
                                            className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:bg-slate-100 bg-white"
                                        />
                                        <p className="text-[11px] text-slate-400 mt-1">
                                            Requested: <strong>{formatMoney(decisionClaim.amountRequested, decisionClaim.currency)}</strong>
                                            {' '}• Allowed: <strong className="text-emerald-600">{formatMoney(decisionClaim.amountAllowed, decisionClaim.currency)}</strong>
                                            {decisionClaim.amountRequested > decisionClaim.amountAllowed && (
                                                <span className="text-rose-500 font-bold ml-1.5">
                                                    (Over by {formatMoney(decisionClaim.amountRequested - decisionClaim.amountAllowed, decisionClaim.currency)})
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                </div>

                                {decision === 'Approved' && currentRequiresAuthorization && (
                                    <div>
                                        <label className="text-xs font-bold text-slate-600">Authorization (out-of-policy)</label>
                                        <select
                                            value={decisionAuthorizationBy}
                                            onChange={e => setDecisionAuthorizationBy(e.target.value)}
                                            className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                                        >
                                            <option value="">Select authorization level</option>
                                            <option value="HR">HR</option>
                                            <option value="Senior Management">Senior Management</option>
                                        </select>
                                    </div>
                                )}

                                <div>
                                    <label className="text-xs font-bold text-slate-600">Review Comments</label>
                                    <textarea
                                        value={decisionComments}
                                        onChange={e => setDecisionComments(e.target.value)}
                                        rows={3}
                                        placeholder={decision === 'Declined' ? 'State the reason for declining…' : 'Optional note for the employee…'}
                                        className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white resize-none"
                                    />
                                </div>

                                <div className="flex items-center justify-end gap-3">
                                    <button
                                        onClick={closeDecision}
                                        className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-100 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={submitDecision}
                                        disabled={deciding}
                                        className={`px-5 py-2.5 rounded-xl font-bold text-sm text-white transition-colors disabled:opacity-50 flex items-center gap-2 ${
                                            decision === 'Declined'
                                                ? 'bg-rose-600 hover:bg-rose-700'
                                                : 'bg-emerald-600 hover:bg-emerald-700'
                                        }`}
                                    >
                                        {deciding ? (
                                            'Saving…'
                                        ) : decision === 'Approved' ? (
                                            <>
                                                <CheckCircle2 size={16} />
                                                Approve Claim
                                            </>
                                        ) : (
                                            <>
                                                <XCircle size={16} />
                                                Decline Claim
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── Full-screen image lightbox ──────────────────────────── */}
                    {lightboxIndex !== null && (() => {
                        const receipts: any[] = decisionClaim.receipts || [];
                        const imageReceipts = receipts.filter((r: any) => r.contentType?.startsWith('image/'));
                        const lr = imageReceipts[lightboxIndex];
                        const lrUrl = lr ? receiptBlobs[lr._id] : null;
                        return lrUrl ? (
                            <div
                                className="fixed inset-0 min-[992px]:left-64 min-[992px]:top-16 z-[60] flex items-center justify-center bg-black/95 p-4"
                                onClick={() => setLightboxIndex(null)}
                            >
                                <button
                                    className="absolute top-4 right-4 p-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-colors"
                                    onClick={() => setLightboxIndex(null)}
                                >
                                    <X size={20} />
                                </button>
                                {imageReceipts.length > 1 && (
                                    <>
                                        <button
                                            className="absolute left-4 top-1/2 -translate-y-1/2 p-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-white disabled:opacity-30 transition-colors"
                                            disabled={lightboxIndex === 0}
                                            onClick={e => { e.stopPropagation(); setLightboxIndex(i => Math.max(0, (i ?? 1) - 1)); }}
                                        >
                                            <ChevronLeft size={24} />
                                        </button>
                                        <button
                                            className="absolute right-4 top-1/2 -translate-y-1/2 p-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-white disabled:opacity-30 transition-colors"
                                            disabled={lightboxIndex === imageReceipts.length - 1}
                                            onClick={e => { e.stopPropagation(); setLightboxIndex(i => Math.min(imageReceipts.length - 1, (i ?? 0) + 1)); }}
                                        >
                                            <ChevronRight size={24} />
                                        </button>
                                    </>
                                )}
                                <img
                                    src={lrUrl}
                                    alt={lr.fileName}
                                    className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
                                    onClick={e => e.stopPropagation()}
                                />
                                <div className="absolute bottom-4 left-0 right-0 text-center text-white/50 text-xs">
                                    {lr.fileName} • {lightboxIndex + 1} / {imageReceipts.length} • Click outside to close
                                </div>
                            </div>
                        ) : null;
                    })()}
                </div>
            )}

            {correctOpen && isAdminLike && (
                <div className="fixed inset-0 min-[992px]:left-64 min-[992px]:top-16 z-50 flex items-center justify-center bg-black/40 p-4">
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

