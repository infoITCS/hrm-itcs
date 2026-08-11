import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { api } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
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
    Edit2,
} from 'lucide-react';

type ForWhom = 'Self' | 'Dependent';

type Claim = any;

const STATUS_COLORS: Record<string, string> = {
    'Pending Team Lead': 'bg-amber-50 text-amber-700 border-amber-200',
    'Pending Line Manager': 'bg-amber-50 text-amber-700 border-amber-200',
    'Pending HR': 'bg-indigo-50 text-indigo-700 border-indigo-200',
    'Pending Finance': 'bg-violet-50 text-violet-700 border-violet-200',
    Approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Declined: 'bg-rose-50 text-rose-700 border-rose-200',
};

const FLAG_LABELS: Record<string, string> = {
    OutOfPolicy: 'Amount exceeds policy limit',
    MissingReceipt: 'Receipt not uploaded',
    MissingCommentOrReceipt: 'Comment or receipt required',
    ReceiptOlderThan45Days: 'Receipt older than 45 days',
    ReceiptTotalExceedsQuota: 'Receipt total exceeds allowed quota',
    ReceiptTotalExceedsRequested: 'Receipt total exceeds requested amount',
    ReceiptDateUnreadable: 'Receipt date could not be read',
    ReceiptExtractionFailed: 'Could not read receipt (manual review needed)',
    ReceiptDateMismatch: 'Receipt date does not match expense date',
};

function flagLabel(flag: string) {
    return FLAG_LABELS[flag] || flag;
}

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
    const { showToast } = useToast();
    const { role } = usePermissions();
    const [searchParams] = useSearchParams();

    const token = localStorage.getItem('token');
    const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

    type Tab = 'submit' | 'mine' | 'approvals' | 'history' | 'settings';
    const [tab, setTab] = useState<Tab>(() => {
        const initialTab = searchParams.get('tab');
        if (initialTab && ['submit', 'mine', 'approvals', 'history', 'settings'].includes(initialTab)) {
            return initialTab as Tab;
        }
        return 'mine';
    });

    useEffect(() => {
        const urlTab = searchParams.get('tab');
        if (urlTab && ['submit', 'mine', 'approvals', 'history', 'settings'].includes(urlTab)) {
            setTab(urlTab as Tab);
        }
    }, [searchParams]);

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
    const [categories, setCategories] = useState<any[]>([]);
    const [category, setCategory] = useState<string>('');
    const [subCategories, setSubCategories] = useState<string[]>([]);
    const [forWhom, setForWhom] = useState<ForWhom>('Self');
    const [dependentId, setDependentId] = useState('');
    const [purpose, setPurpose] = useState('');
    const [amountRequested, setAmountRequested] = useState<number>(0);
    const [notes, setNotes] = useState('');
    const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
    const [scanningReceipts, setScanningReceipts] = useState(false);
    const [receiptPreview, setReceiptPreview] = useState<{
        flags: string[];
        receiptAnalysis: any;
        receipts: any[];
    } | null>(null);
    const [submitPreviewIndex, setSubmitPreviewIndex] = useState<number | null>(null);
    const uploadInputRef = useRef<HTMLInputElement>(null);
    const [submitting, setSubmitting] = useState(false);

    const submitReceiptUrls = useMemo(
        () => receiptFiles.map(f => URL.createObjectURL(f)),
        [receiptFiles]
    );

    useEffect(() => {
        return () => {
            submitReceiptUrls.forEach(u => URL.revokeObjectURL(u));
        };
    }, [submitReceiptUrls]);

    const handleReceiptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const incoming = Array.from(e.target.files || []);
        if (incoming.length === 0) return;
        setReceiptFiles(prev => {
            const combined = [...prev, ...incoming];
            return combined.slice(0, 5);
        });
        if (uploadInputRef.current) uploadInputRef.current.value = '';
    };

    const removeReceiptAt = (index: number) => {
        setReceiptFiles(prev => prev.filter((_, i) => i !== index));
        setSubmitPreviewIndex(prev => {
            if (prev === null) return null;
            if (prev === index) return null;
            if (prev > index) return prev - 1;
            return prev;
        });
        if (uploadInputRef.current) uploadInputRef.current.value = '';
    };

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

    // Bulk actions state
    const [selectedClaimIds, setSelectedClaimIds] = useState<string[]>([]);
    const [bulkDecisionOpen, setBulkDecisionOpen] = useState(false);
    const [bulkDecisionType, setBulkDecisionType] = useState<'Approved' | 'Declined'>('Approved');
    const [bulkComments, setBulkComments] = useState('');
    const [bulkSubmitting, setBulkSubmitting] = useState(false);

    // Category Settings state
    const [editingCategory, setEditingCategory] = useState<any>(null);
    const [categoryModalOpen, setCategoryModalOpen] = useState(false);
    const [catFormName, setCatFormName] = useState('');
    const [catFormLimit, setCatFormLimit] = useState<number | ''>('');
    const [catFormActive, setCatFormActive] = useState(true);
    const [catFormReceipt, setCatFormReceipt] = useState(false);
    const [catFormSubCats, setCatFormSubCats] = useState('');
    const [catSubmitting, setCatSubmitting] = useState(false);

    const isApprover = role === 'admin' || role === 'super-admin' || role === 'hr' || role === 'finance';
    const isAdminLike = role === 'admin' || role === 'super-admin' || role === 'hr';
    const canSeeAllClaims = role === 'admin' || role === 'super-admin' || role === 'hr' || role === 'finance';

    const [erpInputs, setErpInputs] = useState<Record<string, string>>({});
    const [savingErp, setSavingErp] = useState<Record<string, boolean>>({});

    const handleQuickSaveErp = async (claimId: string, erpVal?: string) => {
        const valueToSave = erpVal !== undefined ? erpVal : erpInputs[claimId];
        if (!valueToSave || !valueToSave.trim()) {
            alert('Please enter a valid ERP Reference ID');
            return;
        }
        setSavingErp(prev => ({ ...prev, [claimId]: true }));
        try {
            const res = await fetch(`${api.claims}/${claimId}/erp-reference`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ erpReferenceId: valueToSave.trim() })
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.message || 'Failed to update ERP Reference ID');
            fetchHistory();
            fetchApprovals();
        } catch (err: any) {
            alert(err.message || 'Failed to update ERP Reference ID');
        } finally {
            setSavingErp(prev => ({ ...prev, [claimId]: false }));
        }
    };

    const remainingMedicalLimit = useMemo(() => {
        if (!category) return 0;
        const selectedCat = categories.find(c => c.name === category);
        if (!selectedCat || !selectedCat.policyLimit) return 0;

        const currentYear = new Date().getFullYear();
        const startOfYear = new Date(currentYear, 0, 1).getTime();
        const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999).getTime();

        let relevantClaims: any[] = [];
        if (isAdminLike && selectedEmployeeId) {
            relevantClaims = history.filter((c: any) => c.employeeId === selectedEmployeeId);
        } else {
            relevantClaims = mine;
        }

        const categoryClaims = relevantClaims.filter((c: any) => {
            if (c.category !== category) return false;
            if (c.status === 'Draft' || c.status === 'Declined') return false;
            const createdAt = new Date(c.createdAt).getTime();
            return createdAt >= startOfYear && createdAt <= endOfYear;
        });

        const claimedSoFar = categoryClaims.reduce((sum: number, c: any) => {
            const amount = typeof c.approvedTotal === 'number' ? c.approvedTotal : c.amountAllowed;
            return sum + amount;
        }, 0);

        return Math.max(0, selectedCat.policyLimit - claimedSoFar);
    }, [category, categories, mine, history, selectedEmployeeId, isAdminLike]);

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
        if (!canSeeAllClaims) return;
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
    }, [headers, canSeeAllClaims]);

    const fetchAllEmployees = useCallback(async () => {
        if (!canSeeAllClaims) return;
        try {
            const r = await fetch(api.employees, { headers });
            const d = await r.json();
            const empArray = Array.isArray(d) ? d : (d.employees || []);
            setAllEmployees(empArray);
        } catch {
            // ignore
        }
    }, [headers, canSeeAllClaims]);

    const fetchCategories = useCallback(async () => {
        try {
            const endpoint = isAdminLike ? api.expenseCategoriesAll : api.expenseCategories;
            const r = await fetch(endpoint, { headers });
            const d = await r.json();
            if (d?.success) {
                setCategories(d.data || []);
                if (d.data?.length > 0 && !category) {
                    setCategory(d.data[0].name);
                }
            }
        } catch {
            // ignore
        }
    }, [headers, isAdminLike, category]);

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

    const [currentPage, setCurrentPage] = useState<number>(1);
    const pageSize = 10;

    useEffect(() => {
        setCurrentPage(1);
    }, [tab, filterClaimNo, filterEmployeeName, filterCategory, filterStatus, filterStartDate, filterEndDate]);

    const paginatedMine = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredMine.slice(start, start + pageSize);
    }, [filteredMine, currentPage]);

    const paginatedApprovals = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredApprovals.slice(start, start + pageSize);
    }, [filteredApprovals, currentPage]);

    const paginatedHistory = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredHistory.slice(start, start + pageSize);
    }, [filteredHistory, currentPage]);

    const renderPagination = (totalItems: number) => {
        if (totalItems <= pageSize) return null;
        const totalPages = Math.ceil(totalItems / pageSize);
        const startItem = (currentPage - 1) * pageSize + 1;
        const endItem = Math.min(currentPage * pageSize, totalItems);

        return (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 px-4 py-3 bg-slate-50/70 rounded-xl border border-slate-100">
                <div className="text-xs text-slate-500 font-medium">
                    Showing <span className="font-bold text-slate-700">{startItem}</span> to{' '}
                    <span className="font-bold text-slate-700">{endItem}</span> of{' '}
                    <span className="font-bold text-slate-700">{totalItems}</span> entries
                </div>
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        Previous
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                        .reduce((acc: (number | string)[], page, index, array) => {
                            if (index > 0 && page - (array[index - 1] as number) > 1) {
                                acc.push('...');
                            }
                            acc.push(page);
                            return acc;
                        }, [])
                        .map((item, idx) =>
                            typeof item === 'number' ? (
                                <button
                                    key={idx}
                                    onClick={() => setCurrentPage(item)}
                                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                                        currentPage === item
                                            ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/30'
                                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                                    }`}
                                >
                                    {item}
                                </button>
                            ) : (
                                <span key={idx} className="px-1 text-slate-400 text-xs">...</span>
                            )
                        )}
                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        Next
                    </button>
                </div>
            </div>
        );
    };

    useEffect(() => {
        fetchEmployee();
        fetchMine();
        fetchApprovals();
        fetchProgress();
        fetchHistory();
        fetchAllEmployees();
        fetchCategories();
    }, [fetchEmployee, fetchMine, fetchApprovals, fetchProgress, fetchHistory, fetchAllEmployees, fetchCategories]);

    useEffect(() => {
        if (forWhom === 'Self') setDependentId('');
    }, [forWhom]);

    // Scan receipts on upload / when amount or date changes — show flags BEFORE submit
    useEffect(() => {
        if (receiptFiles.length === 0) {
            setReceiptPreview(null);
            return;
        }
        if (!amountRequested || amountRequested <= 0 || !category) {
            setReceiptPreview(null);
            return;
        }

        const timer = setTimeout(async () => {
            setScanningReceipts(true);
            try {
                const receipts = await Promise.all(receiptFiles.map(readFileAsBase64));
                const payload = {
                    employeeId: selectedEmployeeId || undefined,
                    category,
                    amountRequested,
                    expenseDate,
                    receipts,
                };
                const r = await fetch(api.claimPreviewReceipts, { method: 'POST', headers, body: JSON.stringify(payload) });
                const d = await r.json();
                if (r.ok && d?.success) {
                    setReceiptPreview(d.data);
                } else {
                    setReceiptPreview(null);
                }
            } catch {
                setReceiptPreview(null);
            } finally {
                setScanningReceipts(false);
            }
        }, 600);

        return () => clearTimeout(timer);
    }, [receiptFiles, amountRequested, category, expenseDate, selectedEmployeeId, headers]);

    const submitDisabledReason = useMemo(() => {
        if (loadingEmployee) return 'Loading employee...';
        const targetEmp = selectedEmployeeId 
            ? allEmployees.find(emp => emp.employeeId === selectedEmployeeId) 
            : employee;
        if (!targetEmp?.employeeId) return 'Employee profile not found';
        if (!amountRequested || amountRequested <= 0) return 'Enter a valid amount';
        if (!category) return 'Select a category';
        
        const selectedCat = categories.find(c => c.name === category);
        
        if (selectedCat && selectedCat.requiresReceipt && receiptFiles.length === 0) {
            return `Receipt upload is required for ${selectedCat.name} claims`;
        }
        
        if (category === 'Medical' && forWhom === 'Dependent' && !dependentId) return 'Select a registered dependent';
        
        if (selectedCat && selectedCat.policyLimit > 0 && amountRequested > remainingMedicalLimit && !isAdminLike) {
            return `Amount exceeds remaining limit (${formatMoney(remainingMedicalLimit)}). Out-of-policy claims can only be submitted by HR or Admin.`;
        }

        if (selectedCat && !selectedCat.requiresReceipt) {
            const hasComment = notes.trim().length >= 5;
            const hasReceipt = receiptFiles.length > 0;
            if (!hasComment && !hasReceipt) {
                return 'A comment (min 5 chars) or a receipt upload is required for this category';
            }
        }
        return '';
    }, [loadingEmployee, employee?.employeeId, isAdminLike, selectedEmployeeId, amountRequested, forWhom, dependentId, category, categories, remainingMedicalLimit, notes, receiptFiles.length]);

    const handleSubmit = async () => {
        if (submitDisabledReason) return;
        setSubmitting(true);
        try {
            const receipts = await Promise.all(receiptFiles.map(readFileAsBase64));

            const payload = {
                employeeId: selectedEmployeeId || undefined,
                category,
                subCategories: subCategories,
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
            setSubCategories([]);
            setExpenseDate(new Date().toISOString().split('T')[0]);
            setForWhom('Self');
            setDependentId('');
            setPurpose('');
            setAmountRequested(0);
            setNotes('');
            setReceiptFiles([]);
            setReceiptPreview(null);
            setSubmitPreviewIndex(null);

            await fetchMine();
            await fetchApprovals();
            setTab('mine');
            showToast('Claim submitted successfully', 'success');
        } catch (e: any) {
            showToast(e?.message || 'Failed to submit claim', 'error');
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
            showToast(e?.message || 'Failed to download receipt', 'error');
        }
    };

    // Decision modal
    const [decisionOpen, setDecisionOpen] = useState(false);
    const [decisionClaim, setDecisionClaim] = useState<any>(null);
    const [decision, setDecision] = useState<'Approved' | 'Declined'>('Approved');
    const [decisionComments, setDecisionComments] = useState('');
    const [decisionApprovedAmount, setDecisionApprovedAmount] = useState<number | ''>('');
    const [decisionAuthorizationBy, setDecisionAuthorizationBy] = useState('');
    const [decisionErpId, setDecisionErpId] = useState('');
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

        const hrApproval = c?.approvals?.find((a: any) => a.stage === 'hr' && a.status === 'Approved');
        const currentPendingStage = c?.approvals?.find((a: any) => a.status === 'Pending')?.stage;

        let initial;
        if (currentPendingStage === 'finance' && hrApproval && typeof hrApproval.approvedAmount === 'number') {
            initial = hrApproval.approvedAmount;
        } else {
            const allowed = typeof c?.amountAllowed === 'number' ? c.amountAllowed : c?.amountRequested;
            initial = Math.min(c?.amountRequested || 0, allowed || 0);
        }

        setDecisionApprovedAmount(Number.isFinite(initial) ? initial : '');
        setDecisionAuthorizationBy('');
        setDecisionErpId(c?.erpReferenceId || '');
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
        setDecisionErpId('');
    };

    const currentRequiresAuthorization = useMemo(() => {
        if (!decisionClaim?.approvals?.length) return false;
        const pending = decisionClaim.approvals.find((a: any) => a.status === 'Pending');
        return !!pending?.requiresAuthorization;
    }, [decisionClaim]);

    const currentPendingStage = useMemo(() => {
        if (!decisionClaim?.approvals?.length) return null;
        return decisionClaim.approvals.find((a: any) => a.status === 'Pending')?.stage;
    }, [decisionClaim]);

    const submitDecision = async () => {
        if (!decisionClaim?._id) return;
        if (decision === 'Approved' && currentRequiresAuthorization && !decisionAuthorizationBy) {
            showToast('Authorization is required for this out-of-policy claim (e.g. HR / Senior Management).', 'warning');
            return;
        }
        if (decision === 'Approved' && currentPendingStage === 'finance' && !decisionErpId.trim()) {
            showToast('ERP Transaction Reference ID is required when Finance approves/disburses an expense claim.', 'warning');
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
            if (decision === 'Approved' && decisionErpId.trim() !== '') payload.erpReferenceId = decisionErpId.trim();

            const r = await fetch(api.claimDecision(decisionClaim._id), { method: 'PATCH', headers, body: JSON.stringify(payload) });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.message || 'Failed to submit decision');

            setDecisionOpen(false);
            setDecisionClaim(null);
            setDecisionErpId('');
            showToast(`Claim decision submitted (${decision})`, 'success');
            await fetchApprovals();
            await fetchMine();
            await fetchHistory();
        } catch (e: any) {
            showToast(e?.message || 'Failed to submit decision', 'error');
        } finally {
            setDeciding(false);
        }
    };

    const handleBulkDecision = async () => {
        if (selectedClaimIds.length === 0) return;
        setBulkSubmitting(true);
        try {
            const payload = {
                claimIds: selectedClaimIds,
                decision: bulkDecisionType,
                comments: bulkComments.trim() || undefined,
            };
            const r = await fetch(api.claimBulkDecision, { method: 'PATCH', headers, body: JSON.stringify(payload) });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.message || 'Failed to process bulk decision');
            if (d.failedCount > 0) {
                showToast(`Processed ${d.processedCount} claims, but ${d.failedCount} claims failed or were skipped.`, 'warning');
            } else {
                showToast(`Successfully processed ${d.processedCount} claims`, 'success');
            }
            setBulkDecisionOpen(false);
            setSelectedClaimIds([]);
            setBulkComments('');
            await fetchApprovals();
            await fetchMine();
            await fetchHistory();
        } catch (e: any) {
            showToast(e?.message || 'Failed to process bulk decision', 'error');
        } finally {
            setBulkSubmitting(false);
        }
    };

    const handleSaveCategory = async () => {
        if (!catFormName) return showToast('Name is required', 'warning');
        setCatSubmitting(true);
        try {
            const payload = {
                name: catFormName,
                policyLimit: typeof catFormLimit === 'number' ? catFormLimit : 0,
                isActive: catFormActive,
                requiresReceipt: catFormReceipt,
                subCategories: catFormSubCats.split(',').map(s => s.trim()).filter(Boolean),
            };

            let r;
            if (editingCategory) {
                r = await fetch(api.expenseCategory(editingCategory._id), { method: 'PUT', headers, body: JSON.stringify(payload) });
            } else {
                r = await fetch(api.expenseCategories, { method: 'POST', headers, body: JSON.stringify(payload) });
            }
            
            const d = await r.json();
            if (!r.ok) throw new Error(d?.message || 'Failed to save category');
            
            setCategoryModalOpen(false);
            showToast('Expense category saved', 'success');
            await fetchCategories();
        } catch (e: any) {
            showToast(e?.message || 'Failed to save category', 'error');
        } finally {
            setCatSubmitting(false);
        }
    };

    const openEditCategory = (cat?: any) => {
        if (cat) {
            setEditingCategory(cat);
            setCatFormName(cat.name);
            setCatFormLimit(cat.policyLimit || '');
            setCatFormActive(cat.isActive !== false);
            setCatFormReceipt(cat.requiresReceipt === true);
            setCatFormSubCats((cat.subCategories || []).join(', '));
        } else {
            setEditingCategory(null);
            setCatFormName('');
            setCatFormLimit('');
            setCatFormActive(true);
            setCatFormReceipt(false);
            setCatFormSubCats('');
        }
        setCategoryModalOpen(true);
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
        const anyOpen = decisionOpen || correctOpen || lightboxIndex !== null || submitPreviewIndex !== null;
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
    }, [decisionOpen, correctOpen, lightboxIndex, submitPreviewIndex]);

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
            showToast('Claim updated successfully', 'success');
            await fetchMine();
            await fetchApprovals();
            await fetchHistory();
        } catch (e: any) {
            showToast(e?.message || 'Failed to update claim', 'error');
        } finally {
            setCorrecting(false);
        }
    };

    const tabs = [
        { id: 'submit' as const, label: 'Submit Claim', icon: PlusCircle },
        { id: 'mine' as const, label: 'My Claims', icon: FileText },
        ...(isApprover ? [{ id: 'approvals' as const, label: 'Approvals', icon: Inbox }] : []),
        ...(canSeeAllClaims ? [{ id: 'history' as const, label: 'Claims History', icon: History }] : []),
        ...(isAdminLike ? [{ id: 'settings' as const, label: 'Category Settings', icon: Tag }] : []),
    ];

    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="rounded-2xl p-4 sm:p-6 text-white shadow-xl relative overflow-hidden bg-gradient-to-r from-indigo-600 via-purple-600 to-violet-700">
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
                <div className="flex overflow-x-auto scrollbar-none items-center gap-1 p-2 border-b border-slate-100">
                    {tabs.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap shrink-0 ${
                                tab === t.id
                                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm'
                                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                            }`}
                        >
                            <t.icon size={15} />
                            {t.label}
                        </button>
                    ))}
                    <div className="ml-auto pr-2 text-xs text-slate-400 font-medium hidden md:block shrink-0">
                        {employee ? (
                            `${`${employee.firstName || ''} ${employee.lastName || ''}`.trim() || employee.employeeId} (${employee.employeeId})`
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

                            {categories.find(c => c.name === category)?.policyLimit > 0 && (
                                <div className="lg:col-span-2 p-4 bg-indigo-50/70 border border-indigo-100 rounded-xl flex items-center justify-between text-indigo-700 text-xs font-bold animate-fadeIn">
                                    <span>Remaining balance for {selectedEmployeeId ? "selected employee" : "you"} ({new Date().getFullYear()}):</span>
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
                                        setCategory(e.target.value);
                                        setSubCategories([]);
                                    }}
                                    className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                >
                                    {categories.map(c => (
                                        <option key={c._id} value={c.name}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-600">Sub-category</label>
                                <select
                                    value={subCategories[0] || ''}
                                    onChange={e => {
                                        const val = e.target.value;
                                        setSubCategories(val ? [val] : []);
                                    }}
                                    className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                                >
                                    <option value="">Select a sub-category</option>
                                    {categories.find(c => c.name === category)?.subCategories?.map((sc: string) => (
                                        <option key={sc} value={sc}>{sc}</option>
                                    ))}
                                </select>
                                {(!categories.find(c => c.name === category)?.subCategories || categories.find(c => c.name === category)?.subCategories.length === 0) && (
                                    <p className="text-[11px] text-slate-400 mt-1 italic">No sub-categories defined for this category.</p>
                                )}
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
                                        ref={uploadInputRef}
                                        id="claim-receipt-upload"
                                        type="file"
                                        multiple
                                        accept="image/*,.pdf,.png,.jpg,.jpeg,.webp"
                                        onChange={handleReceiptUpload}
                                        className="sr-only"
                                    />
                                    <label
                                        htmlFor="claim-receipt-upload"
                                        className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold shadow-md transition-all ${
                                            receiptFiles.length >= 5
                                                ? 'bg-slate-300 cursor-not-allowed pointer-events-none'
                                                : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-lg hover:from-indigo-700 hover:to-purple-700 active:scale-[0.98] cursor-pointer'
                                        }`}
                                    >
                                        <Upload size={18} />
                                        {receiptFiles.length >= 5
                                            ? 'Maximum 5 receipts'
                                            : receiptFiles.length > 0
                                                ? 'Add more receipts'
                                                : 'Upload receipts'}
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
                                    <div className="mt-3 space-y-2">
                                        {receiptFiles.map((f, idx) => {
                                            const url = submitReceiptUrls[idx];
                                            const isImage = f.type.startsWith('image/');
                                            const isPdf = f.type === 'application/pdf';
                                            const scan = receiptPreview?.receipts?.[idx];
                                            return (
                                                <div
                                                    key={`${f.name}-${f.size}-${idx}`}
                                                    className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 shadow-sm"
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => setSubmitPreviewIndex(idx)}
                                                        className="flex-shrink-0 w-14 h-14 rounded-lg border border-slate-100 overflow-hidden bg-slate-50 flex items-center justify-center hover:ring-2 hover:ring-indigo-300 transition-all"
                                                        title="Preview receipt"
                                                    >
                                                        {isImage && url ? (
                                                            <img src={url} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <FileText size={22} className={isPdf ? 'text-rose-500' : 'text-slate-400'} />
                                                        )}
                                                    </button>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-semibold text-slate-800 truncate">{f.name}</div>
                                                        <div className="text-[11px] text-slate-400">
                                                            {(f.size / 1024).toFixed(0)} KB
                                                            {scan?.extractedAmount != null && (
                                                                <span className="ml-2 text-indigo-600 font-semibold">
                                                                    · Scanned: {formatMoney(scan.extractedAmount, scan.extractedCurrency || 'PKR')}
                                                                </span>
                                                            )}
                                                            {scan?.extractedDate && (
                                                                <span className="ml-1 text-slate-500">
                                                                    · {new Date(scan.extractedDate).toLocaleDateString('en-PK')}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => setSubmitPreviewIndex(idx)}
                                                            className="p-2 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-colors"
                                                            title="Preview"
                                                        >
                                                            <Eye size={16} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeReceiptAt(idx)}
                                                            className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors"
                                                            title="Remove receipt"
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                                <p className="text-[11px] text-slate-400 mt-1">
                                    Up to 5 receipts, 5MB each. Tap preview or thumbnail to view. Remove wrong uploads before submitting.
                                </p>
                            </div>

                            {/* Pre-submit receipt scan results */}
                            {(scanningReceipts || receiptPreview) && receiptFiles.length > 0 && (
                                <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
                                    <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                                        {scanningReceipts ? (
                                            <>
                                                <RefreshCw size={16} className="animate-spin text-indigo-600" />
                                                Scanning receipts…
                                            </>
                                        ) : (
                                            <>
                                                <Receipt size={16} className="text-indigo-600" />
                                                Receipt Scan Results
                                            </>
                                        )}
                                    </div>

                                    {!scanningReceipts && receiptPreview && (
                                        <>
                                            {receiptPreview.receipts?.map((r: any, idx: number) => (
                                                <div key={idx} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs bg-white rounded-lg border border-slate-100 px-3 py-2">
                                                    <span className="font-semibold text-slate-700 truncate max-w-[160px]">{r.fileName}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setSubmitPreviewIndex(idx)}
                                                        className="text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                                                    >
                                                        <Eye size={12} /> Preview
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeReceiptAt(idx)}
                                                        className="text-rose-600 hover:text-rose-800 font-semibold flex items-center gap-1"
                                                    >
                                                        <X size={12} /> Remove
                                                    </button>
                                                    <span>
                                                        Date:{' '}
                                                        <strong className={typeof r.receiptAgeDays === 'number' && r.receiptAgeDays > 45 ? 'text-rose-600' : 'text-slate-800'}>
                                                            {r.extractedDate
                                                                ? `${new Date(r.extractedDate).toLocaleDateString('en-PK')}${typeof r.receiptAgeDays === 'number' ? ` (${r.receiptAgeDays}d old)` : ''}`
                                                                : '—'}
                                                        </strong>
                                                    </span>
                                                    <span>
                                                        Amount:{' '}
                                                        <strong className="text-slate-800">
                                                            {typeof r.extractedAmount === 'number'
                                                                ? formatMoney(r.extractedAmount, r.extractedCurrency || 'PKR')
                                                                : '—'}
                                                        </strong>
                                                    </span>
                                                    {r.extractionStatus === 'failed' && (
                                                        <span className="text-amber-600 font-semibold">Could not read — verify manually</span>
                                                    )}
                                                </div>
                                            ))}

                                            {receiptPreview.receiptAnalysis && typeof receiptPreview.receiptAnalysis.totalExtractedAmount === 'number' && (
                                                <div className="text-xs text-slate-600">
                                                    Total from receipts:{' '}
                                                    <strong>{formatMoney(receiptPreview.receiptAnalysis.totalExtractedAmount)}</strong>
                                                    {' · '}
                                                    Allowed quota:{' '}
                                                    <strong className="text-emerald-700">{formatMoney(receiptPreview.receiptAnalysis.amountAllowed)}</strong>
                                                </div>
                                            )}

                                            {(receiptPreview.flags || []).length > 0 ? (
                                                <div className="bg-rose-50 border border-rose-200 rounded-lg p-3">
                                                    <div className="text-[11px] font-bold text-rose-700 mb-2 flex items-center gap-1.5">
                                                        <AlertTriangle size={12} />
                                                        ISSUES FOUND — review before submitting
                                                    </div>
                                                    <div className="flex flex-wrap gap-2 mb-2">
                                                        {receiptPreview.flags.map((f: string) => (
                                                            <span key={f} className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 border border-rose-200 text-xs font-bold" style={{ whiteSpace: 'nowrap' }}>
                                                                {flagLabel(f)}
                                                            </span>
                                                        ))}
                                                    </div>
                                                    {(receiptPreview.receiptAnalysis?.issues || []).map((issue: string, i: number) => (
                                                        <div key={i} className="text-xs text-rose-700 flex items-start gap-1.5 mt-1">
                                                            <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
                                                            {issue}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2 text-xs text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                                                    <CheckCircle2 size={14} />
                                                    Receipt scan passed — no issues detected
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="text-xs text-rose-600 font-semibold">
                                {submitDisabledReason ? submitDisabledReason : ''}
                            </div>
                            <button
                                onClick={handleSubmit}
                                disabled={!!submitDisabledReason || submitting}
                                className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-colors shrink-0 self-start sm:self-auto"
                            >
                                {submitting ? 'Scanning receipts & submitting…' : 'Submit Claim'}
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
                                <table className="w-full text-sm min-w-[1100px]">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-100">
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Claim #</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Category</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Requested</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Allowed</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Approved</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600 min-w-[300px]">Flags</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Receipts</th>
                                            {isAdminLike && (
                                                <th className="text-left px-4 py-3 font-semibold text-slate-600">Admin</th>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedMine.map((c: any) => (
                                            <tr key={c._id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                                <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap align-middle">{c.claimNo || '—'}</td>
                                                <td className="px-4 py-3 text-slate-600 align-middle">{c.category}</td>
                                                <td className="px-4 py-3 text-slate-700 font-semibold whitespace-nowrap align-middle">
                                                    <div>{formatMoney(c.amountRequested, c.currency)}</div>
                                                    {c.amountRequested > c.amountAllowed && (
                                                        <div className="text-[10px] text-rose-500 font-bold">
                                                            Disallowed: {formatMoney(c.amountRequested - c.amountAllowed, c.currency)}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-slate-600 whitespace-nowrap align-middle">{formatMoney(c.amountAllowed, c.currency)}</td>
                                                <td className="px-4 py-3 text-slate-600 whitespace-nowrap align-middle">{formatMoney(c.approvedTotal, c.currency)}</td>
                                                <td className="px-4 py-3 whitespace-nowrap align-middle">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${STATUS_COLORS[c.status] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                                            {c.status}
                                                        </span>
                                                        {c.status === 'Approved' && (
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wide border ${
                                                                c.payoutStatus === 'Paid'
                                                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                                                    : c.payoutStatus === 'Included in Payroll'
                                                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                                            }`}>
                                                                {c.payoutStatus || 'Unpaid'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 align-middle" style={{ minWidth: '300px' }}>
                                                    <div className="flex items-center gap-1.5" style={{ minWidth: '300px' }}>
                                                        {(c.eligibility?.flags || []).length ? (c.eligibility.flags || []).map((f: string) => (
                                                            <span key={f} className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold" style={{ whiteSpace: 'nowrap' }} title={f}>
                                                                {flagLabel(f)}
                                                            </span>
                                                        )) : (
                                                            <span className="text-xs text-slate-400">—</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 align-middle">
                                                    {(c.receipts || []).length ? (
                                                        <div className="flex flex-col gap-1">
                                                            {(c.receipts || []).map((r: any) => (
                                                                <button
                                                                    key={r._id}
                                                                    onClick={() => downloadReceipt(c._id, r._id, r.fileName)}
                                                                    className="text-left text-indigo-600 hover:text-indigo-700 font-semibold text-xs truncate max-w-[150px] block whitespace-nowrap"
                                                                    title={r.fileName}
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
                                                    <td className="px-4 py-3 align-middle">
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
                        {renderPagination(filteredMine.length)}
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
                                <table className="w-full text-sm min-w-[1100px]">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-100">
                                            <th className="px-4 py-3 w-10 text-center">
                                                <input 
                                                    type="checkbox" 
                                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                    checked={filteredApprovals.length > 0 && selectedClaimIds.length === filteredApprovals.length}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setSelectedClaimIds(filteredApprovals.map((c: any) => c._id));
                                                        } else {
                                                            setSelectedClaimIds([]);
                                                        }
                                                    }}
                                                />
                                            </th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Claim #</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Employee</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Category</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Requested</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Allowed</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600 min-w-[300px]">Flags</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedApprovals.map((c: any) => (
                                            <tr key={c._id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                                <td className="px-4 py-3 text-center align-middle">
                                                    <input 
                                                        type="checkbox" 
                                                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                        checked={selectedClaimIds.includes(c._id)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setSelectedClaimIds(prev => [...prev, c._id]);
                                                            } else {
                                                                setSelectedClaimIds(prev => prev.filter(id => id !== c._id));
                                                            }
                                                        }}
                                                    />
                                                </td>
                                                <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap align-middle">{c.claimNo || '—'}</td>
                                                 <td className="px-4 py-3 text-slate-600 align-middle">
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
                                                <td className="px-4 py-3 text-slate-600 align-middle">{c.category}</td>
                                                <td className="px-4 py-3 text-slate-700 font-semibold whitespace-nowrap align-middle">
                                                    <div>{formatMoney(c.amountRequested, c.currency)}</div>
                                                    {c.amountRequested > c.amountAllowed && (
                                                        <div className="text-[10px] text-rose-500 font-bold">
                                                            Disallowed: {formatMoney(c.amountRequested - c.amountAllowed, c.currency)}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-slate-600 whitespace-nowrap align-middle">{formatMoney(c.amountAllowed, c.currency)}</td>
                                                <td className="px-4 py-3 whitespace-nowrap align-middle">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${STATUS_COLORS[c.status] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                                            {c.status}
                                                        </span>
                                                        {c.status === 'Approved' && (
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wide border ${
                                                                c.payoutStatus === 'Paid'
                                                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                                                    : c.payoutStatus === 'Included in Payroll'
                                                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                                            }`}>
                                                                {c.payoutStatus || 'Unpaid'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 align-middle" style={{ minWidth: '300px' }}>
                                                    <div className="flex items-center gap-1.5" style={{ minWidth: '300px' }}>
                                                        {(c.eligibility?.flags || []).length ? (c.eligibility.flags || []).map((f: string) => (
                                                            <span key={f} className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold" style={{ whiteSpace: 'nowrap' }} title={f}>
                                                                {flagLabel(f)}
                                                            </span>
                                                        )) : (
                                                            <span className="text-xs text-slate-400">—</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 align-middle">
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
                        
                        {/* Bulk Action Floating Toolbar */}
                        {selectedClaimIds.length > 0 && (
                            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white rounded-2xl shadow-2xl border border-indigo-100 px-6 py-4 flex items-center gap-6 z-40 animate-fadeIn">
                                <div className="text-sm font-bold text-slate-700">
                                    <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md mr-2">{selectedClaimIds.length}</span>
                                    claims selected
                                </div>
                                <div className="w-px h-6 bg-slate-200"></div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => {
                                            setBulkDecisionType('Approved');
                                            setBulkDecisionOpen(true);
                                        }}
                                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-500/30 transition-all flex items-center gap-2"
                                    >
                                        <CheckCircle2 size={16} /> Bulk Approve
                                    </button>
                                    <button
                                        onClick={() => {
                                            setBulkDecisionType('Declined');
                                            setBulkDecisionOpen(true);
                                        }}
                                        className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-rose-500/30 transition-all flex items-center gap-2"
                                    >
                                        <XCircle size={16} /> Bulk Decline
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Bulk Decision Modal */}
                        {bulkDecisionOpen && createPortal(
                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                                <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-scaleIn">
                                    <div className={`px-6 py-4 border-b text-white flex justify-between items-center ${bulkDecisionType === 'Approved' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
                                        <div className="font-bold text-lg">Bulk {bulkDecisionType}</div>
                                        <button onClick={() => setBulkDecisionOpen(false)} className="text-white/80 hover:text-white"><X size={20}/></button>
                                    </div>
                                    <div className="p-6">
                                        <p className="text-sm text-slate-600 mb-4">
                                            You are about to <strong>{bulkDecisionType.toLowerCase()}</strong> {selectedClaimIds.length} selected claims.
                                        </p>
                                        <div>
                                            <label className="text-xs font-bold text-slate-600">Comments (Optional)</label>
                                            <textarea
                                                className="mt-1 w-full border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-300 outline-none resize-none"
                                                rows={3}
                                                placeholder="Add a comment for all selected claims..."
                                                value={bulkComments}
                                                onChange={e => setBulkComments(e.target.value)}
                                            ></textarea>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                                        <button onClick={() => setBulkDecisionOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
                                        <button 
                                            onClick={handleBulkDecision} 
                                            disabled={bulkSubmitting}
                                            className={`px-4 py-2 text-sm font-bold text-white rounded-xl shadow flex items-center gap-2 ${bulkDecisionType === 'Approved' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20' : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'} disabled:opacity-50`}
                                        >
                                            {bulkSubmitting && <RefreshCw size={14} className="animate-spin" />}
                                            Confirm
                                        </button>
                                    </div>
                                </div>
                            </div>
                        , document.body)}
                    </div>
                )}

                {tab === 'history' && canSeeAllClaims && (
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
                                <table className="w-full text-sm min-w-[1100px]">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-100">
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Claim #</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Employee</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Category</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Requested</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Allowed</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Approved</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">ERP Ref #</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Submitted At</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Receipts</th>
                                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedHistory.map((c: any) => (
                                            <tr key={c._id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                                <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap align-middle">{c.claimNo || '—'}</td>
                                                 <td className="px-4 py-3 text-slate-600 align-middle">
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
                                                <td className="px-4 py-3 text-slate-600 align-middle">{c.category}</td>
                                                <td className="px-4 py-3 text-slate-700 font-semibold whitespace-nowrap align-middle">
                                                    <div>{formatMoney(c.amountRequested, c.currency)}</div>
                                                    {c.amountRequested > c.amountAllowed && (
                                                        <div className="text-[10px] text-rose-500 font-bold">
                                                            Disallowed: {formatMoney(c.amountRequested - c.amountAllowed, c.currency)}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-slate-600 whitespace-nowrap align-middle">{formatMoney(c.amountAllowed, c.currency)}</td>
                                                <td className="px-4 py-3 text-slate-600 whitespace-nowrap align-middle">{formatMoney(c.approvedTotal, c.currency)}</td>
                                                <td className="px-4 py-3 whitespace-nowrap align-middle">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${STATUS_COLORS[c.status] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                                            {c.status}
                                                        </span>
                                                        {c.status === 'Approved' && (
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wide border ${
                                                                c.payoutStatus === 'Paid'
                                                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                                                    : c.payoutStatus === 'Included in Payroll'
                                                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                                            }`}>
                                                                {c.payoutStatus || 'Unpaid'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 align-middle">
                                                    {c.status === 'Approved' ? (
                                                        c.erpReferenceId ? (
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold whitespace-nowrap">
                                                                    ✓ {c.erpReferenceId}
                                                                </span>
                                                                {(role === 'admin' || role === 'super-admin' || role === 'finance') && (
                                                                    <button
                                                                        onClick={() => {
                                                                            const newErp = prompt('Edit ERP Reference ID:', c.erpReferenceId);
                                                                            if (newErp !== null && newErp.trim()) {
                                                                                handleQuickSaveErp(c._id, newErp.trim());
                                                                            }
                                                                        }}
                                                                        className="text-[10px] font-bold text-slate-400 hover:text-indigo-600 underline"
                                                                    >
                                                                        Edit
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-1">
                                                                <input
                                                                    type="text"
                                                                    placeholder="e.g. ERP-123"
                                                                    value={erpInputs[c._id] ?? ''}
                                                                    onChange={(e) => setErpInputs(prev => ({ ...prev, [c._id]: e.target.value }))}
                                                                    className="w-28 px-2 py-1 border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                                                                />
                                                                <button
                                                                    onClick={() => handleQuickSaveErp(c._id, erpInputs[c._id])}
                                                                    disabled={savingErp[c._id]}
                                                                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold whitespace-nowrap disabled:opacity-50"
                                                                >
                                                                    {savingErp[c._id] ? 'Saving...' : 'Save'}
                                                                </button>
                                                            </div>
                                                        )
                                                    ) : (
                                                        <span className="text-xs text-slate-400">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-slate-500 align-middle">
                                                    {c.audit?.submittedAt ? new Date(c.audit.submittedAt).toLocaleDateString('en-PK') : new Date(c.createdAt).toLocaleDateString('en-PK')}
                                                </td>
                                                <td className="px-4 py-3 align-middle">
                                                    {(c.receipts || []).length ? (
                                                        <div className="flex flex-col gap-1">
                                                            {(c.receipts || []).map((r: any) => (
                                                                <button
                                                                    key={r._id}
                                                                    onClick={() => downloadReceipt(c._id, r._id, r.fileName)}
                                                                    className="text-left text-indigo-600 hover:text-indigo-700 font-semibold text-xs truncate max-w-[150px] block whitespace-nowrap" title={r.fileName}
                                                                >
                                                                    {r.fileName}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-slate-400">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 align-middle">
                                                    <div className="flex items-center gap-1.5">
                                                        <button
                                                            onClick={() => openDecision(c)}
                                                            className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold transition-colors flex items-center gap-1"
                                                            title="View Details & Scanned Receipts"
                                                        >
                                                            <Eye size={13} /> Details
                                                        </button>
                                                        {isAdminLike && (
                                                            <button
                                                                onClick={() => openCorrect(c)}
                                                                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-bold transition-colors flex items-center gap-1"
                                                                title="Edit Status / Approved Total"
                                                            >
                                                                <Edit2 size={13} /> Correct
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {renderPagination(filteredHistory.length)}
                    </div>
                )}

                {tab === 'settings' && isAdminLike && (
                    <div className="p-6">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">Expense Categories</h3>
                                <p className="text-sm text-slate-500">Manage categories, limits, and sub-categories.</p>
                            </div>
                            <button
                                onClick={() => openEditCategory()}
                                className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-indigo-600/30 hover:bg-indigo-700 transition-colors flex items-center gap-2"
                            >
                                <PlusCircle size={16} /> New Category
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {categories.map((cat: any) => (
                                <div key={cat._id} className={`p-5 rounded-2xl border ${cat.isActive ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-75'} shadow-sm flex flex-col`}>
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <div className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                                {cat.name}
                                                {!cat.isActive && <span className="px-2 py-0.5 rounded text-[10px] bg-slate-200 text-slate-600 uppercase tracking-widest">Inactive</span>}
                                            </div>
                                            <div className="text-xs font-semibold text-slate-500 mt-1 flex items-center gap-4">
                                                <span>Limit: {cat.policyLimit > 0 ? formatMoney(cat.policyLimit) : 'No limit'}</span>
                                                {cat.requiresReceipt && <span className="text-indigo-600 flex items-center gap-1"><Receipt size={12}/> Receipt Req.</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex-1 mt-2">
                                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Sub-categories</div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {(cat.subCategories || []).length > 0 ? (cat.subCategories || []).map((sc: string) => (
                                                <span key={sc} className="px-2 py-1 rounded bg-slate-100 text-slate-600 text-[11px] font-semibold border border-slate-200">{sc}</span>
                                            )) : (
                                                <span className="text-xs text-slate-400 italic">None defined</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end">
                                        <button 
                                            onClick={() => openEditCategory(cat)}
                                            className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
                                        >
                                            Edit Category
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Category Modal */}
                        {categoryModalOpen && createPortal(
                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                                <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-scaleIn">
                                    <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                        <div className="font-bold text-slate-800 text-lg">{editingCategory ? 'Edit Category' : 'New Category'}</div>
                                        <button onClick={() => setCategoryModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                                    </div>
                                    <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                                        <div>
                                            <label className="text-xs font-bold text-slate-600">Category Name</label>
                                            <input
                                                type="text"
                                                value={catFormName}
                                                onChange={e => setCatFormName(e.target.value)}
                                                className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-300 outline-none"
                                                placeholder="e.g., Variable Expense"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-600">Annual Policy Limit (PKR)</label>
                                            <input
                                                type="number"
                                                value={catFormLimit}
                                                onChange={e => setCatFormLimit(e.target.value === '' ? '' : Number(e.target.value))}
                                                className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-300 outline-none"
                                                placeholder="0 or empty for no limit"
                                            />
                                            <p className="text-[11px] text-slate-500 mt-1">If set &gt; 0, system tracks the user's total approved amount for this category in the current year and blocks submissions exceeding the limit (unless submitted by Admin).</p>
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-600">Sub-categories (comma separated)</label>
                                            <textarea
                                                value={catFormSubCats}
                                                onChange={e => setCatFormSubCats(e.target.value)}
                                                className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-300 outline-none resize-none"
                                                rows={3}
                                                placeholder="e.g., Office Supplies, Software, Travel"
                                            ></textarea>
                                        </div>
                                        <div className="flex flex-col gap-3 mt-2 p-4 bg-slate-50 rounded-xl border border-slate-200">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input 
                                                    type="checkbox" 
                                                    checked={catFormActive}
                                                    onChange={e => setCatFormActive(e.target.checked)}
                                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                />
                                                <span className="text-sm font-semibold text-slate-700">Category is Active</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input 
                                                    type="checkbox" 
                                                    checked={catFormReceipt}
                                                    onChange={e => setCatFormReceipt(e.target.checked)}
                                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                />
                                                <span className="text-sm font-semibold text-slate-700">Receipt Upload Required</span>
                                            </label>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                                        <button onClick={() => setCategoryModalOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-900">Cancel</button>
                                        <button 
                                            onClick={handleSaveCategory} 
                                            disabled={catSubmitting}
                                            className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                                        >
                                            {catSubmitting && <RefreshCw size={14} className="animate-spin" />}
                                            Save Category
                                        </button>
                                    </div>
                                </div>
                            </div>
                        , document.body)}
                    </div>
                )}
            </div>

            {/* ══════════════════════════════════════════════════════════════
                  DOCUMENT REVIEW MODAL — HR / Admin full claim inspection
            ══════════════════════════════════════════════════════════════ */}
            {decisionOpen && decisionClaim && createPortal(
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
                                            {decisionClaim.subCategories && decisionClaim.subCategories.length > 0 && <div className="text-xs text-slate-500 mt-0.5">{decisionClaim.subCategories.join(', ')}</div>}
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

                                    {/* ERP Reference ID */}
                                    {decisionClaim.erpReferenceId && (
                                        <div className="flex items-start gap-2 text-sm bg-indigo-50/50 p-3 rounded-xl border border-indigo-100">
                                            <ShieldCheck size={14} className="text-indigo-600 mt-0.5 flex-shrink-0" />
                                            <div>
                                                <span className="text-indigo-700 font-bold text-xs uppercase tracking-wide">ERP ID: </span>
                                                <span className="font-extrabold text-indigo-950">{decisionClaim.erpReferenceId}</span>
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

                                    {/* OCR receipt analysis */}
                                    {decisionClaim.receiptAnalysis && (decisionClaim.receipts || []).length > 0 && (
                                        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3">
                                            <div className="text-[11px] font-bold text-indigo-700 mb-2 flex items-center gap-1.5">
                                                <Receipt size={11} />RECEIPT SCAN ANALYSIS
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                                                <div>
                                                    <span className="text-slate-500">Receipt total (from images):</span>{' '}
                                                    <span className="font-bold text-slate-800">
                                                        {typeof decisionClaim.receiptAnalysis.totalExtractedAmount === 'number'
                                                            ? formatMoney(decisionClaim.receiptAnalysis.totalExtractedAmount, decisionClaim.currency)
                                                            : '—'}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-500">Oldest receipt age:</span>{' '}
                                                    <span className={`font-bold ${(decisionClaim.receiptAnalysis.maxReceiptAgeDays ?? 0) > 45 ? 'text-rose-600' : 'text-slate-800'}`}>
                                                        {typeof decisionClaim.receiptAnalysis.maxReceiptAgeDays === 'number'
                                                            ? `${decisionClaim.receiptAnalysis.maxReceiptAgeDays} days`
                                                            : '—'}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-500">Requested:</span>{' '}
                                                    <span className="font-bold">{formatMoney(decisionClaim.receiptAnalysis.amountRequested, decisionClaim.currency)}</span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-500">Allowed quota:</span>{' '}
                                                    <span className="font-bold text-emerald-700">{formatMoney(decisionClaim.receiptAnalysis.amountAllowed, decisionClaim.currency)}</span>
                                                </div>
                                            </div>
                                            {(decisionClaim.receiptAnalysis.issues || []).length > 0 && (
                                                <ul className="space-y-1 mt-2">
                                                    {(decisionClaim.receiptAnalysis.issues as string[]).map((issue: string, i: number) => (
                                                        <li key={i} className="text-xs text-rose-700 flex items-start gap-1.5">
                                                            <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                                                            {issue}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    )}

                                    {/* Eligibility flags */}
                                    {(decisionClaim.eligibility?.flags || []).length > 0 && (
                                        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3">
                                            <div className="text-[11px] font-bold text-rose-700 mb-2 flex items-center gap-1.5"><AlertTriangle size={11} />ELIGIBILITY FLAGS</div>
                                            <div className="flex flex-wrap gap-2">
                                                {(decisionClaim.eligibility.flags as string[]).map((f: string) => (
                                                    <span key={f} className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 border border-rose-200 text-xs font-bold" style={{ whiteSpace: 'nowrap' }}>{flagLabel(f)}</span>
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
                                                                    {(r.extractedAmount != null || r.extractedDate) && (
                                                                        <div className="text-[10px] text-indigo-600 font-semibold mt-0.5">
                                                                            {r.extractedAmount != null && `Amount: ${formatMoney(r.extractedAmount, r.extractedCurrency || decisionClaim.currency)}`}
                                                                            {r.extractedAmount != null && r.extractedDate && ' · '}
                                                                            {r.extractedDate && `Date: ${new Date(r.extractedDate).toLocaleDateString('en-PK')}`}
                                                                            {typeof r.receiptAgeDays === 'number' && (
                                                                                <span className={r.receiptAgeDays > 45 ? ' text-rose-600' : ' text-slate-500'}>
                                                                                    {' '}({r.receiptAgeDays}d old)
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                    {r.extractionStatus === 'failed' && (
                                                                        <div className="text-[10px] text-amber-600 font-semibold mt-0.5">Could not read receipt — verify manually</div>
                                                                    )}
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
                                
                                {(() => {
                                    const hrApproval = decisionClaim?.approvals?.find((a: any) => a.stage === 'hr' && a.status === 'Approved');
                                    return (
                                        <>
                                            {currentPendingStage === 'finance' && hrApproval && (
                                                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3.5 space-y-1.5 text-xs mb-3">
                                                    <div className="font-bold text-indigo-900 flex items-center justify-between">
                                                        <span className="flex items-center gap-1.5"><CheckCircle2 size={14} className="text-indigo-600" /> HR Approved Amount:</span>
                                                        <span className="text-emerald-700 font-extrabold text-sm">{formatMoney(hrApproval.approvedAmount ?? decisionClaim.amountAllowed, decisionClaim.currency)}</span>
                                                    </div>
                                                    {hrApproval.comments && (
                                                        <div className="text-indigo-800 text-[11px] font-medium italic pt-1 border-t border-indigo-100/80">
                                                            HR Remarks: "{hrApproval.comments}"
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="text-xs font-bold text-slate-600 block mb-1">Decision</label>
                                                    <div className="grid grid-cols-2 gap-2 mt-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setDecision('Approved');
                                                                if (decisionApprovedAmount === 0 || decisionApprovedAmount === '') {
                                                                    const initial = currentPendingStage === 'finance' && hrApproval && typeof hrApproval.approvedAmount === 'number'
                                                                        ? hrApproval.approvedAmount
                                                                        : decisionClaim.amountAllowed;
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
                                                        onChange={e => {
                                                            const val = e.target.value === '' ? '' : Number(e.target.value);
                                                            if (currentPendingStage === 'finance' && hrApproval && typeof hrApproval.approvedAmount === 'number' && typeof val === 'number' && val > hrApproval.approvedAmount) {
                                                                setDecisionApprovedAmount(hrApproval.approvedAmount);
                                                            } else {
                                                                setDecisionApprovedAmount(val);
                                                            }
                                                        }}
                                                        disabled={decision === 'Declined' || (currentPendingStage === 'finance' && !!hrApproval && typeof hrApproval.approvedAmount === 'number')}
                                                        className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:bg-slate-100 bg-white font-bold text-slate-800"
                                                    />
                                                    {currentPendingStage === 'finance' && hrApproval && typeof hrApproval.approvedAmount === 'number' ? (
                                                        <p className="text-[11px] text-indigo-600 font-bold mt-1 flex items-center gap-1">
                                                            🔒 Pre-filled & locked to HR Approved Amount ({formatMoney(hrApproval.approvedAmount, decisionClaim.currency)}).
                                                        </p>
                                                    ) : (
                                                        <p className="text-[11px] text-slate-400 mt-1">
                                                            Requested: <strong>{formatMoney(decisionClaim.amountRequested, decisionClaim.currency)}</strong>
                                                            {' '}• Allowed: <strong className="text-emerald-600">{formatMoney(decisionClaim.amountAllowed, decisionClaim.currency)}</strong>
                                                            {decisionClaim.amountRequested > decisionClaim.amountAllowed && (
                                                                <span className="text-rose-500 font-bold ml-1.5">
                                                                    (Over by {formatMoney(decisionClaim.amountRequested - decisionClaim.amountAllowed, decisionClaim.currency)})
                                                                </span>
                                                            )}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    );
                                })()}

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

                                {decision === 'Approved' && (
                                    <div>
                                        <label className="text-xs font-bold text-slate-600">ERP Transaction Reference ID</label>
                                        <input
                                            type="text"
                                            value={decisionErpId}
                                            onChange={e => setDecisionErpId(e.target.value)}
                                            placeholder="e.g. ERP-TXN-654321"
                                            className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                                        />
                                    </div>
                                )}

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
            , document.body)}

            {/* Submit form — receipt preview lightbox */}
            {submitPreviewIndex !== null && receiptFiles[submitPreviewIndex] && (() => {
                const f = receiptFiles[submitPreviewIndex];
                const url = submitReceiptUrls[submitPreviewIndex];
                const isImage = f.type.startsWith('image/');
                const isPdf = f.type === 'application/pdf';
                return createPortal(
                    <div
                        className="fixed inset-0 min-[992px]:left-64 min-[992px]:top-16 z-[60] flex items-center justify-center bg-black/95 p-4"
                        onClick={() => setSubmitPreviewIndex(null)}
                    >
                        <button
                            type="button"
                            className="absolute top-4 right-4 p-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-colors"
                            onClick={() => setSubmitPreviewIndex(null)}
                        >
                            <X size={20} />
                        </button>
                        {receiptFiles.length > 1 && (
                            <>
                                <button
                                    type="button"
                                    className="absolute left-4 top-1/2 -translate-y-1/2 p-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-white disabled:opacity-30 transition-colors"
                                    disabled={submitPreviewIndex === 0}
                                    onClick={e => { e.stopPropagation(); setSubmitPreviewIndex(i => Math.max(0, (i ?? 1) - 1)); }}
                                >
                                    <ChevronLeft size={24} />
                                </button>
                                <button
                                    type="button"
                                    className="absolute right-4 top-1/2 -translate-y-1/2 p-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-white disabled:opacity-30 transition-colors"
                                    disabled={submitPreviewIndex === receiptFiles.length - 1}
                                    onClick={e => { e.stopPropagation(); setSubmitPreviewIndex(i => Math.min(receiptFiles.length - 1, (i ?? 0) + 1)); }}
                                >
                                    <ChevronRight size={24} />
                                </button>
                            </>
                        )}
                        <div className="max-w-4xl w-full max-h-[85vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
                            {isImage && url ? (
                                <img
                                    src={url}
                                    alt={f.name}
                                    className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-2xl"
                                />
                            ) : isPdf && url ? (
                                <iframe
                                    src={url}
                                    title={f.name}
                                    className="w-full h-[75vh] rounded-xl bg-white shadow-2xl"
                                />
                            ) : (
                                <div className="bg-white rounded-xl p-8 text-center text-slate-600">
                                    <FileText size={48} className="mx-auto mb-3 text-slate-300" />
                                    Preview not available for this file type.
                                </div>
                            )}
                            <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
                                <span className="text-white/70 text-xs">
                                    {f.name} • {submitPreviewIndex + 1} / {receiptFiles.length}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => removeReceiptAt(submitPreviewIndex)}
                                    className="px-3 py-1.5 rounded-lg bg-rose-600/90 hover:bg-rose-600 text-white text-xs font-bold flex items-center gap-1.5"
                                >
                                    <X size={14} /> Remove this receipt
                                </button>
                            </div>
                        </div>
                    </div>
                , document.body);
            })()}

            {correctOpen && isAdminLike && createPortal(
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
                            <div className="flex items-center justify-between text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200/50">
                                <div>
                                    <div><span className="font-bold">Category:</span> {correctClaim?.category}</div>
                                    <div><span className="font-bold">Requested:</span> {formatMoney(correctClaim?.amountRequested, correctClaim?.currency)} • <span className="font-bold">Allowed:</span> {formatMoney(correctClaim?.amountAllowed, correctClaim?.currency)}</div>
                                    {correctClaim?.amountRequested > correctClaim?.amountAllowed && (
                                        <div className="text-rose-500 font-bold mt-0.5">
                                            Disallowed: {formatMoney(correctClaim.amountRequested - correctClaim.amountAllowed, correctClaim.currency)}
                                        </div>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const claim = correctClaim;
                                        setCorrectOpen(false);
                                        openDecision(claim);
                                    }}
                                    className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-lg border border-indigo-200 flex items-center gap-1 shrink-0"
                                >
                                    <Eye size={13} /> Full Details
                                </button>
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
            , document.body)}
        </div>
    );
};

export default ExpenseClaimDashboard;

