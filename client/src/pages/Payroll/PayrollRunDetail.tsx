import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Banknote, Loader2, CheckCircle2,
    PencilLine, Save, X, Plus, Trash2, Users,
    TrendingDown, CreditCard, RefreshCw,
    Eye, EyeOff, FileSpreadsheet, Building2, Calendar, Receipt
} from 'lucide-react';
import axios from 'axios';
import { api } from '../../utils/api';
import { usePermissions } from '../../hooks/usePermissions';
import AlertModal from '../../components/UI/AlertModal';
import { formatEmployeeFullName } from '../../utils/nameHelper';
import { isExpenseClaimPayrollEarning } from '../../utils/expenseClaimPayroll';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface Earning { component: string; amount: number; type: 'fixed' | 'variable'; expenseClaim?: boolean }
interface Deduction { component: string; amount: number }

interface Payslip {
    _id: string;
    payslipNo: string;
    employeeId: string;
    beneficiaryAccount?: string;
    beneficiaryName?: string;
    beneficiaryBank?: string;
    customerReference?: string;
    taxDeduction?: number;
    loanDeduction?: number;
    pfPayout?: number;
    earnings: Earning[];
    deductions: Deduction[];
    grossPay: number;
    totalDeductions: number;
    netPay: number;
    currency: string;
    status: 'Draft' | 'Finalized';
    paymentMethod: string;
    notes?: string;
    employeeDetails?: {
        firstName: string;
        middleName?: string;
        lastName: string;
        jobInfo?: { designation?: string; department?: string };
        bankDetails?: { accountNumber?: string; bankName?: string; iban?: string };
        avatar?: string;
    };
}

interface PayrollRun {
    _id: string;
    title: string;
    periodMonth: number;
    periodYear: number;
    startDate?: string;
    endDate?: string;
    currency: string;
    status: 'Draft' | 'Approved' | 'Disbursed';
    notes?: string;
    approvedBy?: string;
    approvedAt?: string;
    disbursedAt?: string;
    erpTaskId?: string;
    erpReferenceId?: string;
    erpStatus?: 'Pending' | 'Posted' | 'Reconciled';
    erpNotes?: string;
    erpPostedAt?: string;
    totalPayableAmount?: number;
    totalExpenseClaimsAmount?: number;
    totalLoanDeductionsAmount?: number;
    erpPayableAmount?: number;
}

interface ExpenseClaimPreview {
    _id: string;
    claimNo: string;
    employeeId: string;
    amount: number;
    erpReferenceId?: string;
    category: string;
}

interface AmountPreview {
    totalPayableAmount: number;
    totalExpenseClaimsAmount: number;
    totalLoanDeductionsAmount?: number;
    erpPayableAmount: number;
    claimCount: number;
    expenseClaimsIncluded: ExpenseClaimPreview[];
    source?: string;
    loading?: boolean;
}

const MONTH_NAMES = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const PRESET_EARNINGS = [
    'Basic Salary',
    'Meal Allowance',
    'Performance Bonus',
    'Fuel Allowance',
    'Medical Allowance',
    'Travel Allowance',
    'Mobile Allowance',
    'PF Withdrawal (Non-Taxable)',
    'Anniversary Bonus',
    'Expense Reimbursements',
    'Special Allowance',
    'Custom / Other'
];

const PRESET_DEDUCTIONS = [
    'Income Tax / Withholding Tax',
    'Loan Deduction',
    'EOBI',
    'Advance Salary',
    'Half-Day Penalty',
    'Absence Penalty',
    'Security Deposit',
    'Custom / Other'
];

// ─────────────────────────────────────────────────────────────────────────────
// Inline Payslip Edit Panel with Category Dropdowns & Dynamic Beneficiary
// ─────────────────────────────────────────────────────────────────────────────
const PayslipEditPanel = ({
    payslip, currency, allPayslips, onClose, onSaved,
}: { payslip: Payslip; currency: string; allPayslips: Payslip[]; onClose: () => void; onSaved: () => void }) => {
    const empBank = payslip.employeeDetails?.bankDetails;
    const empOwnAccount = empBank?.accountNumber || empBank?.iban || '';
    const empOwnBank = empBank?.bankName || 'Meezan Bank';
    const empOwnName = formatEmployeeFullName(payslip.employeeDetails, payslip.employeeId);
    const hasEmployeeBank = Boolean(empOwnAccount);

    const [presetEarnings, setPresetEarnings] = useState<string[]>(PRESET_EARNINGS);
    const [presetDeductions, setPresetDeductions] = useState<string[]>(PRESET_DEDUCTIONS);

    useEffect(() => {
        const fetchComponents = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await axios.get(`${api.config}/salary-components?activeOnly=true`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (Array.isArray(res.data) && res.data.length > 0) {
                    const earningsList = res.data.filter((c: any) => c.type === 'earning').map((c: any) => c.name);
                    const deductionsList = res.data.filter((c: any) => c.type === 'deduction').map((c: any) => c.name);
                    
                    if (earningsList.length > 0) {
                        if (!earningsList.includes('Custom / Other')) earningsList.push('Custom / Other');
                        setPresetEarnings(earningsList);
                    }
                    if (deductionsList.length > 0) {
                        if (!deductionsList.includes('Custom / Other')) deductionsList.push('Custom / Other');
                        setPresetDeductions(deductionsList);
                    }
                }
            } catch (err) {
                // fall back to PRESET_EARNINGS and PRESET_DEDUCTIONS
            }
        };
        fetchComponents();
    }, []);

    const [earnings, setEarnings] = useState<Earning[]>(payslip.earnings.map(e => ({ ...e })));
    const [deductions, setDeductions] = useState<Deduction[]>(payslip.deductions.map(d => ({ ...d })));
    const [paymentMethod, setPaymentMethod] = useState(payslip.paymentMethod || 'Bank Transfer');
    const [beneficiaryAccount, setBeneficiaryAccount] = useState(payslip.beneficiaryAccount || empOwnAccount);
    const [beneficiaryName, setBeneficiaryName] = useState(payslip.beneficiaryName || empOwnName);
    const [beneficiaryBank, setBeneficiaryBank] = useState(payslip.beneficiaryBank || empOwnBank);
    const [customerReference, setCustomerReference] = useState(payslip.customerReference || '');
    const [notes, setNotes] = useState(payslip.notes || '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const isUsingCustomProxy = Boolean(
        payslip.beneficiaryAccount &&
        hasEmployeeBank &&
        (payslip.beneficiaryAccount !== empOwnAccount || (payslip.beneficiaryName && payslip.beneficiaryName !== empOwnName))
    );

    const [isProxyMode, setIsProxyMode] = useState<boolean>(!hasEmployeeBank || isUsingCustomProxy);

    const grossPay = earnings.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const totalDeductions = deductions.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    const netPay = grossPay - totalDeductions;

    const fmt = (val: number) =>
        new Intl.NumberFormat('en-PK', { style: 'currency', currency, maximumFractionDigits: 0 }).format(val);

    const handleCopyFromOtherEmployee = (selectedEmpId: string) => {
        if (!selectedEmpId) return;
        const target = allPayslips.find(p => p.employeeId === selectedEmpId);
        if (target) {
            const acc = target.beneficiaryAccount || target.employeeDetails?.bankDetails?.accountNumber || target.employeeDetails?.bankDetails?.iban || '';
            const name = target.beneficiaryName || formatEmployeeFullName(target.employeeDetails, target.employeeId);
            const bank = target.beneficiaryBank || target.employeeDetails?.bankDetails?.bankName || 'Meezan Bank';
            setBeneficiaryAccount(acc);
            setBeneficiaryName(name);
            setBeneficiaryBank(bank);
        }
    };

    const handleRevertToOwnBank = () => {
        setBeneficiaryAccount(empOwnAccount);
        setBeneficiaryName(empOwnName);
        setBeneficiaryBank(empOwnBank);
        setIsProxyMode(false);
    };

    const handleSave = async () => {
        setSaving(true);
        setError('');
        try {
            await axios.put(api.payslip(payslip._id), {
                earnings,
                deductions,
                paymentMethod,
                notes,
                beneficiaryAccount: isProxyMode ? beneficiaryAccount : empOwnAccount,
                beneficiaryName: isProxyMode ? beneficiaryName : empOwnName,
                beneficiaryBank: isProxyMode ? beneficiaryBank : empOwnBank,
                customerReference,
            }, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            });
            onSaved();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to save changes.');
        } finally {
            setSaving(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-100">
                {/* Modal Header */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-white shrink-0">
                    <div>
                        <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                            <span>Edit Payslip & Beneficiary Details</span>
                        </h2>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                            <span className="font-semibold text-slate-700">{formatEmployeeFullName(payslip.employeeDetails, payslip.employeeId)}</span>
                            <span className="text-slate-400 font-mono ml-1">({payslip.employeeId})</span>
                            <span className="text-slate-300 mx-1.5">•</span>
                            <span className="font-mono text-indigo-600 font-medium">{payslip.payslipNo}</span>
                        </p>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Modal Body */}
                <div className="p-5 space-y-4 overflow-y-auto flex-1">
                    {error && (
                        <div className="bg-rose-50 text-rose-700 text-xs px-3 py-2 rounded-lg border border-rose-200 font-medium">
                            {error}
                        </div>
                    )}

                    {/* Bank Disbursement Section */}
                    {hasEmployeeBank && !isProxyMode ? (
                        <div className="bg-emerald-50/70 rounded-xl p-3.5 border border-emerald-200/80 space-y-2.5">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg shrink-0">
                                        <Building2 size={14} />
                                    </div>
                                    <div>
                                        <h3 className="text-xs font-bold text-emerald-950 uppercase tracking-wide flex items-center gap-1.5">
                                            Employee Registered Bank Account
                                            <span className="inline-flex items-center gap-0.5 text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded-md">
                                                <CheckCircle2 size={10} className="text-emerald-600" /> On File
                                            </span>
                                        </h3>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsProxyMode(true)}
                                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-bold hover:underline transition-colors"
                                >
                                    Use Proxy / Alternate Account
                                </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-white/90 p-2.5 rounded-lg border border-emerald-100 text-xs">
                                <div>
                                    <span className="block text-[10px] font-bold uppercase text-slate-400">Account / IBAN</span>
                                    <span className="font-mono font-bold text-slate-800 text-[11px] truncate block">{empOwnAccount}</span>
                                </div>
                                <div>
                                    <span className="block text-[10px] font-bold uppercase text-slate-400">Account Title</span>
                                    <span className="font-medium text-slate-700 text-[11px] truncate block">{empOwnName || '—'}</span>
                                </div>
                                <div>
                                    <span className="block text-[10px] font-bold uppercase text-slate-400">Bank Name</span>
                                    <span className="font-medium text-slate-700 text-[11px] truncate block">{empOwnBank}</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-amber-50/70 rounded-xl p-3.5 border border-amber-200/80 space-y-2.5">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div>
                                    <h3 className="text-xs font-bold text-amber-950 uppercase tracking-wide flex items-center gap-1.5">
                                        <Building2 size={13} className="text-amber-600" />
                                        {hasEmployeeBank ? 'Proxy / Alternate Beneficiary Account' : 'Beneficiary Account (No Bank Info On File)'}
                                    </h3>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    {hasEmployeeBank && (
                                        <button
                                            type="button"
                                            onClick={handleRevertToOwnBank}
                                            className="text-[11px] text-indigo-600 hover:text-indigo-800 font-bold hover:underline"
                                        >
                                            Use Primary Account
                                        </button>
                                    )}
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[11px] text-slate-500 font-medium">Use proxy:</span>
                                        <select 
                                            onChange={(e) => handleCopyFromOtherEmployee(e.target.value)}
                                            defaultValue=""
                                            className="h-7 text-xs bg-white border border-amber-300 text-slate-700 rounded-lg px-2 focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
                                        >
                                            <option value="">Select Employee Account...</option>
                                            {allPayslips
                                                .filter(p => p.employeeId !== payslip.employeeId)
                                                .map(p => (
                                                    <option key={p.employeeId} value={p.employeeId}>
                                                        {formatEmployeeFullName(p.employeeDetails, p.employeeId)} ({p.employeeId})
                                                    </option>
                                                ))
                                            }
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div>
                                    <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Account Number / IBAN</label>
                                    <input
                                        type="text"
                                        placeholder="Enter account / IBAN"
                                        value={beneficiaryAccount}
                                        onChange={e => setBeneficiaryAccount(e.target.value)}
                                        className="w-full h-8 bg-white border border-slate-200 rounded-lg px-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Beneficiary Name</label>
                                    <input
                                        type="text"
                                        placeholder="Account title"
                                        value={beneficiaryName}
                                        onChange={e => setBeneficiaryName(e.target.value)}
                                        className="w-full h-8 bg-white border border-slate-200 rounded-lg px-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Bank Name</label>
                                    <input
                                        type="text"
                                        placeholder="Bank name"
                                        value={beneficiaryBank}
                                        onChange={e => setBeneficiaryBank(e.target.value)}
                                        className="w-full h-8 bg-white border border-slate-200 rounded-lg px-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Earnings Section */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                                <TrendingDown size={13} className="rotate-180 text-emerald-600" /> 
                                <span>Earnings</span>
                            </h3>
                            <button 
                                onClick={() => setEarnings(e => [...e, { component: 'Performance Bonus', amount: 0, type: 'variable' }])}
                                className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-semibold hover:underline cursor-pointer"
                            >
                                <Plus size={12} /> Add Earning
                            </button>
                        </div>

                        <div className="space-y-1.5">
                            {earnings.map((e, i) => {
                                const isPreset = presetEarnings.includes(e.component) && e.component !== 'Custom / Other';
                                return (
                                    <div key={i} className="flex items-center gap-2 bg-slate-50/60 p-1.5 rounded-lg border border-slate-100">
                                        <select
                                            value={isPreset ? e.component : 'Custom / Other'}
                                            onChange={ev => {
                                                const val = ev.target.value;
                                                setEarnings(arr => arr.map((x, j) => j === i ? { ...x, component: val === 'Custom / Other' ? '' : val } : x));
                                            }}
                                            className="w-48 shrink-0 h-8 border border-slate-200 rounded-lg px-2 text-xs text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                                        >
                                            {presetEarnings.map(cat => (
                                                <option key={cat} value={cat}>{cat}</option>
                                            ))}
                                        </select>

                                        {!isPreset && (
                                            <input
                                                value={e.component}
                                                onChange={ev => setEarnings(arr => arr.map((x, j) => j === i ? { ...x, component: ev.target.value } : x))}
                                                placeholder="Custom component name"
                                                className="flex-1 min-w-0 h-8 border border-slate-200 rounded-lg px-2.5 text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                            />
                                        )}

                                        {isPreset && <div className="flex-1" />}

                                        <div className="relative w-28 shrink-0">
                                            <input
                                                type="number"
                                                value={e.amount || ''}
                                                onChange={ev => setEarnings(arr => arr.map((x, j) => j === i ? { ...x, amount: Number(ev.target.value) } : x))}
                                                placeholder="0"
                                                className="w-full h-8 border border-slate-200 rounded-lg px-2.5 text-xs text-right font-bold text-emerald-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                            />
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => setEarnings(arr => arr.filter((_, j) => j !== i))}
                                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                                            title="Delete"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Deductions Section */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                                <TrendingDown size={13} className="text-rose-500" /> 
                                <span>Deductions</span>
                            </h3>
                            <button 
                                onClick={() => setDeductions(d => [...d, { component: 'Income Tax / Withholding Tax', amount: 0 }])}
                                className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-semibold hover:underline cursor-pointer"
                            >
                                <Plus size={12} /> Add Deduction
                            </button>
                        </div>

                        <div className="space-y-1.5">
                            {deductions.length === 0 && (
                                <p className="text-xs text-slate-400 italic py-1">No deductions added.</p>
                            )}
                            {deductions.map((d, i) => {
                                const isPreset = presetDeductions.includes(d.component) && d.component !== 'Custom / Other';
                                return (
                                    <div key={i} className="flex items-center gap-2 bg-slate-50/60 p-1.5 rounded-lg border border-slate-100">
                                        <select
                                            value={isPreset ? d.component : 'Custom / Other'}
                                            onChange={ev => {
                                                const val = ev.target.value;
                                                setDeductions(arr => arr.map((x, j) => j === i ? { ...x, component: val === 'Custom / Other' ? '' : val } : x));
                                            }}
                                            className="w-48 shrink-0 h-8 border border-slate-200 rounded-lg px-2 text-xs text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                                        >
                                            {presetDeductions.map(cat => (
                                                <option key={cat} value={cat}>{cat}</option>
                                            ))}
                                        </select>

                                        {!isPreset && (
                                            <input
                                                value={d.component}
                                                onChange={ev => setDeductions(arr => arr.map((x, j) => j === i ? { ...x, component: ev.target.value } : x))}
                                                placeholder="Custom deduction name"
                                                className="flex-1 min-w-0 h-8 border border-slate-200 rounded-lg px-2.5 text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                            />
                                        )}

                                        {isPreset && <div className="flex-1" />}

                                        <div className="relative w-28 shrink-0">
                                            <input
                                                type="number"
                                                value={d.amount || ''}
                                                onChange={ev => setDeductions(arr => arr.map((x, j) => j === i ? { ...x, amount: Number(ev.target.value) } : x))}
                                                placeholder="0"
                                                className="w-full h-8 border border-slate-200 rounded-lg px-2.5 text-xs text-right font-bold text-rose-600 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                            />
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => setDeductions(arr => arr.filter((_, j) => j !== i))}
                                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                                            title="Delete"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Live Totals Card */}
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/70 space-y-1 text-xs">
                        <div className="flex justify-between text-slate-600">
                            <span>Gross Pay</span>
                            <span className="font-bold text-emerald-700">{fmt(grossPay)}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                            <span>Total Deductions</span>
                            <span className="font-bold text-rose-600">- {fmt(totalDeductions)}</span>
                        </div>
                        <div className="flex justify-between text-slate-900 font-bold border-t border-slate-200 pt-1.5 mt-1 text-xs">
                            <span className="uppercase tracking-wider text-[10px] text-slate-500">Net Disbursable Pay</span>
                            <span className="text-indigo-600 text-sm font-extrabold">{fmt(netPay)}</span>
                        </div>
                    </div>

                    {/* Payment Method, Ref & Notes */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                        <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Payment Method</label>
                            <select
                                value={paymentMethod}
                                onChange={e => setPaymentMethod(e.target.value)}
                                className="w-full h-8 border border-slate-200 rounded-lg px-2.5 text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                            >
                                <option value="Bank Transfer">Bank Transfer</option>
                                <option value="Cash">Cash</option>
                                <option value="Cheque">Cheque</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Customer / Bank Ref</label>
                            <input
                                value={customerReference}
                                onChange={e => setCustomerReference(e.target.value)}
                                placeholder="e.g. PAY-202608-001"
                                className="w-full h-8 border border-slate-200 rounded-lg px-2.5 text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Notes</label>
                            <input
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                placeholder="Optional payslip note..."
                                className="w-full h-8 border border-slate-200 rounded-lg px-2.5 text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>
                    </div>
                </div>

                {/* Modal Footer */}
                <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50/50 shrink-0">
                    <button 
                        onClick={onClose} 
                        className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200/70 transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleSave} 
                        disabled={saving}
                        className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm flex items-center gap-1.5 disabled:opacity-60 transition-all cursor-pointer"
                    >
                        {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                        Save Changes
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
const PayrollRunDetail = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { role } = usePermissions();
    const isAdminRole = ['admin', 'super-admin', 'finance', 'hr'].includes(role);

    const [run, setRun] = useState<PayrollRun | null>(null);
    const [payslips, setPayslips] = useState<Payslip[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [editingPayslip, setEditingPayslip] = useState<Payslip | null>(null);
    const [refreshCounter, setRefreshCounter] = useState(0);

    // Visibility Mask Toggle for Sensitive Financial Numbers
    const [maskSalaries, setMaskSalaries] = useState(true);
    const [showRevealConfirm, setShowRevealConfirm] = useState(false);

    const handleToggleMask = () => {
        if (maskSalaries) {
            setShowRevealConfirm(true);
        } else {
            setMaskSalaries(true);
        }
    };

    const handleConfirmReveal = () => {
        setMaskSalaries(false);
        setShowRevealConfirm(false);
    };

    // ERP Task Modal State
    const [showErpTaskModal, setShowErpTaskModal] = useState(false);
    const [showApproveModal, setShowApproveModal] = useState(false);
    const [approveErpInput, setApproveErpInput] = useState('');
    const [erpRefInput, setErpRefInput] = useState('');
    const [erpNotesInput, setErpNotesInput] = useState('');

    const [amountPreview, setAmountPreview] = useState<AmountPreview | null>(null);
    const [, setLoadingPreview] = useState(false);

    // Attendance Period Editing State
    const [showEditPeriodModal, setShowEditPeriodModal] = useState(false);
    const [editStartInput, setEditStartInput] = useState('');
    const [editEndInput, setEditEndInput] = useState('');

    const countWorkingDays = (startStr: string, endStr: string) => {
        if (!startStr || !endStr || startStr > endStr) return 0;
        let count = 0;
        const cur = new Date(startStr + 'T12:00:00.000Z');
        const stop = new Date(endStr + 'T12:00:00.000Z');
        while (cur <= stop) {
            const day = cur.getUTCDay();
            if (day !== 0 && day !== 6) count++;
            cur.setUTCDate(cur.getUTCDate() + 1);
        }
        return count;
    };

    const handleOpenEditPeriod = () => {
        if (!run) return;
        const defaultLastDay = new Date(run.periodYear, run.periodMonth, 0).getDate();
        const curStart = run.startDate || `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}-01`;
        const curEnd = run.endDate || `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}-${String(defaultLastDay).padStart(2, '0')}`;
        setEditStartInput(curStart);
        setEditEndInput(curEnd);
        setShowEditPeriodModal(true);
    };

    const handleSavePeriod = async () => {
        if (!editStartInput || !editEndInput) {
            triggerError('Invalid Dates', 'Please select both start date and end date.');
            return;
        }
        if (editStartInput > editEndInput) {
            triggerError('Invalid Date Range', 'Start date must be before or equal to end date.');
            return;
        }
        setActionLoading('save-period');
        try {
            await axios.put(api.payrollRun(id!), {
                startDate: editStartInput,
                endDate: editEndInput,
            }, authHeader);
            setShowEditPeriodModal(false);
            setRefreshCounter(c => c + 1);
            triggerSuccess(
                'Period Updated',
                `Payroll calculation period updated to ${editStartInput} → ${editEndInput}. Click "Generate" to recalculate payslips for this period.`
            );
        } catch (err: any) {
            triggerError('Failed to Update Period', err.response?.data?.message || 'Failed to update calculation period.');
        } finally {
            setActionLoading(null);
        }
    };

    const [alertConfig, setAlertConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type: 'info' | 'success' | 'warning' | 'error' | 'confirm';
        onConfirm?: () => void;
        confirmText?: string;
        showCancel?: boolean;
    }>({
        isOpen: false,
        title: '',
        message: '',
        type: 'info',
    });

    const triggerConfirm = (title: string, message: string, onConfirm: () => void) => {
        setAlertConfig({
            isOpen: true,
            title,
            message,
            type: 'confirm',
            onConfirm,
            confirmText: 'Confirm',
            showCancel: true,
        });
    };

    const triggerError = (title: string, message: string) => {
        setAlertConfig({
            isOpen: true,
            title,
            message,
            type: 'error',
            confirmText: 'OK',
            showCancel: false,
        });
    };

    const triggerSuccess = (title: string, message: string) => {
        setAlertConfig({
            isOpen: true,
            title,
            message,
            type: 'success',
            confirmText: 'OK',
            showCancel: false,
        });
    };

    const fetchData = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        setError(null);
        try {
            const res = await axios.get(api.payrollRun(id), {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            });
            setRun(res.data.run);
            setPayslips(res.data.payslips);
            if (res.data.run) {
                setErpRefInput(res.data.run.erpReferenceId || '');
                setErpNotesInput(res.data.run.erpNotes || '');
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to load payroll run.');
        } finally {
            setLoading(false);
        }
    }, [id]);

    const fetchPreviewAmounts = useCallback(async () => {
        if (!id) return;
        setLoadingPreview(true);
        try {
            const res = await axios.get(api.payrollPreviewAmounts(id), {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            });
            setAmountPreview({
                totalPayableAmount: res.data.totalPayableAmount ?? 0,
                totalExpenseClaimsAmount: res.data.totalExpenseClaimsAmount ?? 0,
                totalLoanDeductionsAmount: res.data.totalLoanDeductionsAmount ?? 0,
                erpPayableAmount: res.data.erpPayableAmount ?? 0,
                claimCount: res.data.claimCount ?? 0,
                expenseClaimsIncluded: res.data.expenseClaimsIncluded ?? [],
                source: res.data.source,
            });
        } catch {
            setAmountPreview(null);
        } finally {
            setLoadingPreview(false);
        }
    }, [id]);

    useEffect(() => { fetchData(); }, [fetchData, refreshCounter]);

    useEffect(() => {
        if (run?.status === 'Draft') {
            fetchPreviewAmounts();
        }
    }, [run?.status, run?.startDate, run?.endDate, fetchPreviewAmounts, refreshCounter, payslips.length]);

    const authHeader = { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } };

    const handleGenerate = async () => {
        const defaultLastDay = run ? new Date(run.periodYear, run.periodMonth, 0).getDate() : 30;
        const periodStartStr = run?.startDate || `${run?.periodYear}-${String(run?.periodMonth).padStart(2, '0')}-01`;
        const periodEndStr = run?.endDate || `${run?.periodYear}-${String(run?.periodMonth).padStart(2, '0')}-${String(defaultLastDay).padStart(2, '0')}`;
        
        triggerConfirm(
            'Regenerate Payslips?',
            `This will count working days and calculate attendance penalties, meal allowances, and loans for "${run?.title}" over the period (${periodStartStr} to ${periodEndStr}). Existing draft payslips will be refreshed. Continue?`,
            async () => {
                setActionLoading('generate');
                try {
                    const res = await axios.post(api.payrollGenerate(id!), {}, authHeader);
                    setRefreshCounter(c => c + 1);
                    const missing = res.data?.missingSalary as string[] | undefined;
                    if (missing?.length) {
                        triggerError(
                            'Payslips Generated — Salary Missing',
                            `Generated payslips, but these employees have no salary set in PIM:\n\n${missing.join('\n')}\n\nAdd Salary Structure in their employee profile, then click Generate again.`
                        );
                    }
                } catch (err: any) {
                    triggerError('Failed to Generate', err.response?.data?.message || 'Failed to generate payslips.');
                } finally {
                    setActionLoading(null);
                }
            }
        );
    };

    const handleApprove = () => {
        if (payslips.length === 0) {
            triggerError('Generate Payslips First', 'Generate payslips before approving this payroll run.');
            return;
        }
        setApproveErpInput(run?.erpReferenceId || '');
        setShowApproveModal(true);
    };

    const handleConfirmApprove = async () => {
        if (!approveErpInput.trim()) {
            triggerError('ERP ID Required', 'Enter the Payroll ERP Reference ID for the amount excluding expense claims.');
            return;
        }
        setActionLoading('approve');
        try {
            await axios.put(api.payrollApprove(id!), {
                erpReferenceId: approveErpInput.trim(),
            }, authHeader);
            setShowApproveModal(false);
            setRefreshCounter(c => c + 1);
            triggerSuccess('Payroll Approved', 'Run approved and Payroll ERP ID recorded.');
        } catch (err: any) {
            triggerError('Failed to Approve', err.response?.data?.message || 'Failed to approve.');
        } finally {
            setActionLoading(null);
        }
    };

    const handleSaveErpTask = async () => {
        if (!erpRefInput.trim()) {
            triggerError('ERP ID Required', 'Please enter the Payroll ERP Reference ID for the amount excluding expense claims.');
            return;
        }
        setActionLoading('erp-task');
        try {
            await axios.put(api.payrollErpTask(id!), {
                erpReferenceId: erpRefInput.trim(),
                erpStatus: erpRefInput.trim() ? 'Posted' : 'Pending',
                erpNotes: erpNotesInput.trim(),
            }, authHeader);
            setShowErpTaskModal(false);
            setRefreshCounter(c => c + 1);
            triggerSuccess('ERP ID Saved', 'Payroll ERP Reference ID updated.');
        } catch (err: any) {
            triggerError('Failed to Save ERP ID', err.response?.data?.message || 'Failed to update ERP ID.');
        } finally {
            setActionLoading(null);
        }
    };

    const handleDownloadBankExcel = async () => {
        setActionLoading('bank-excel');
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(api.payrollExportBankExcel(id!), {
                headers: { Authorization: `Bearer ${token}` },
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
            const link = document.createElement('a');
            link.href = url;
            const MONTH_SHORT = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const shortMonth = run ? (MONTH_SHORT[run.periodMonth] || 'Mth') : 'Mth';
            const shortYear = run ? String(run.periodYear).slice(-2) : '26';
            const filename = `${shortMonth}${shortYear}Payroll.xlsx`;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err: any) {
            triggerError('Export Failed', err.response?.data?.message || 'Failed to download bank transfer spreadsheet.');
        } finally {
            setActionLoading(null);
        }
    };


    const handleDeleteRun = async () => {
        triggerConfirm(
            'Delete Payroll Run?',
            `Are you sure you want to delete "${run?.title}"? All associated payslips will be permanently deleted. This action cannot be undone.`,
            async () => {
                setActionLoading('delete');
                try {
                    await axios.delete(api.payrollRun(id!), authHeader);
                    navigate('/payroll');
                } catch (err: any) {
                    triggerError('Failed to Delete', err.response?.data?.message || 'Failed to delete payroll run.');
                } finally {
                    setActionLoading(null);
                }
            }
        );
    };

    const fmt = (val: number, cur = run?.currency || 'PKR') => {
        if (maskSalaries) return 'PKR ••••••';
        return new Intl.NumberFormat('en-PK', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(val);
    };

    const totalGross = payslips.reduce((s, p) => s + p.grossPay, 0);
    const totalNet = payslips.reduce((s, p) => s + p.netPay, 0);
    const totalExpenseClaims = payslips.reduce((s, p) => {
        const claimAmt = (p.earnings || [])
            .filter(isExpenseClaimPayrollEarning)
            .reduce((sum, e) => sum + (e.amount || 0), 0);
        return s + claimAmt;
    }, 0);
    const totalLoanDeductions = payslips.reduce((s, p) => {
        if (p.loanDeduction !== undefined && Number(p.loanDeduction) > 0) {
            return s + Number(p.loanDeduction);
        }
        const loanDeds = (p.deductions || []).filter((d: any) => d.component === 'Loan Deduction');
        return s + loanDeds.reduce((sum: number, d: any) => sum + (Number(d.amount) || 0), 0);
    }, 0);

    const displayAmounts = useMemo(() => {
        if (amountPreview) {
            return {
                totalPayableAmount: amountPreview.totalPayableAmount,
                totalExpenseClaimsAmount: amountPreview.totalExpenseClaimsAmount,
                totalLoanDeductionsAmount: amountPreview.totalLoanDeductionsAmount ?? totalLoanDeductions,
                erpPayableAmount: amountPreview.erpPayableAmount,
                claimCount: amountPreview.claimCount,
            };
        }
        if (payslips.length > 0) {
            const totalPayable = payslips.reduce((s, p) => s + p.netPay, 0);
            const claims = payslips.reduce((s, p) => {
                const claimAmt = (p.earnings || [])
                    .filter(isExpenseClaimPayrollEarning)
                    .reduce((sum, e) => sum + (e.amount || 0), 0);
                return s + claimAmt;
            }, 0);
            return {
                totalPayableAmount: totalPayable,
                totalExpenseClaimsAmount: claims,
                totalLoanDeductionsAmount: totalLoanDeductions,
                erpPayableAmount: totalPayable - claims + totalLoanDeductions,
                claimCount: 0,
            };
        }
        return null;
    }, [amountPreview, payslips, totalLoanDeductions]);

    if (!isAdminRole) return <div className="p-6 text-rose-600">Access denied.</div>;

    if (loading) return (
        <div className="flex items-center justify-center py-32">
            <Loader2 size={30} className="animate-spin text-indigo-500" />
        </div>
    );

    if (error) return (
        <div className="p-6">
            <div className="bg-rose-50 text-rose-700 rounded-xl px-4 py-3 border border-rose-200 text-sm">{error}</div>
        </div>
    );

    if (!run) return null;

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header Card */}
            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm space-y-4">
                {/* Top Row: Title, Status, and Primary Workflow Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <button 
                            onClick={() => navigate('/payroll')}
                            className="p-2.5 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors shrink-0 border border-slate-200/70"
                            title="Back to Payroll Runs"
                        >
                            <ArrowLeft size={18} />
                        </button>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2.5 flex-wrap">
                                <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                                    <Banknote size={22} className="text-indigo-600 shrink-0" />
                                    <span>{run.title}</span>
                                </h1>
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                    run.status === 'Draft' ? 'bg-amber-50 text-amber-700 border border-amber-200/80' :
                                    run.status === 'Approved' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/80' :
                                    'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                                }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${
                                        run.status === 'Draft' ? 'bg-amber-500' :
                                        run.status === 'Approved' ? 'bg-indigo-500' : 'bg-emerald-500'
                                    }`} />
                                    {run.status}
                                </span>
                                <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                                    {run.currency}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-slate-500">
                                <span className="inline-flex items-center gap-1.5 font-medium text-indigo-900 bg-indigo-50/80 border border-indigo-100/90 px-2.5 py-0.5 rounded-lg">
                                    <Calendar size={12} className="text-indigo-600" />
                                    <span>
                                        {run.startDate && run.endDate ? `${run.startDate} → ${run.endDate}` : `${MONTH_NAMES[run.periodMonth]} ${run.periodYear}`}
                                    </span>
                                    <span className="text-indigo-600 font-bold ml-0.5">
                                        ({countWorkingDays(run.startDate || '', run.endDate || '') || 22} Working Days)
                                    </span>
                                </span>
                                {run.status === 'Draft' && (
                                    <button
                                        type="button"
                                        onClick={handleOpenEditPeriod}
                                        className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-bold hover:underline cursor-pointer"
                                    >
                                        <PencilLine size={12} /> Edit Period
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Primary Workflow Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                        {run.status === 'Draft' && (
                            <>
                                <button 
                                    id="btn-generate-payslips" 
                                    onClick={handleGenerate} 
                                    disabled={!!actionLoading}
                                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200/80 transition-all disabled:opacity-50 cursor-pointer"
                                >
                                    {actionLoading === 'generate' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                                    <span>Generate</span>
                                </button>
                                <button 
                                    id="btn-approve-run" 
                                    onClick={handleApprove} 
                                    disabled={!!actionLoading || payslips.length === 0}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm shadow-indigo-200 transition-all disabled:opacity-50 cursor-pointer"
                                >
                                    {actionLoading === 'approve' ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                                    <span>Approve Run</span>
                                </button>
                            </>
                        )}
                        {run.status !== 'Disbursed' && (
                            <button 
                                id="btn-delete-run" 
                                onClick={handleDeleteRun} 
                                disabled={!!actionLoading}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200/80 transition-all disabled:opacity-50 cursor-pointer"
                                title="Delete Payroll Run"
                            >
                                {actionLoading === 'delete' ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                <span className="hidden sm:inline">Delete</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Bottom Toolbar: ERP Info, Export, and View Controls */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
                    {/* ERP Metadata */}
                    <div className="flex items-center gap-2 flex-wrap text-slate-600">
                        <div 
                            onClick={() => {
                                setErpRefInput(run.erpReferenceId || '');
                                setErpNotesInput(run.erpNotes || '');
                                setShowErpTaskModal(true);
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 cursor-pointer transition-all group"
                            title="Click to enter or update ERP Voucher ID"
                        >
                            <Building2 size={13} className="text-slate-400 group-hover:text-indigo-600 transition-colors" />
                            <span className="font-semibold text-slate-700">Payroll ERP (excl. claims):</span>
                            <span className="font-mono text-slate-900 font-bold">{run.erpReferenceId || 'Not Entered'}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                run.erpStatus === 'Reconciled' ? 'bg-emerald-100 text-emerald-700' :
                                run.erpStatus === 'Posted' ? 'bg-indigo-100 text-indigo-700' :
                                'bg-amber-100 text-amber-700'
                            }`}>
                                {run.erpStatus || 'Pending'}
                            </span>
                        </div>

                        {run.erpTaskId && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 font-mono">
                                Task: {run.erpTaskId}
                            </span>
                        )}
                    </div>

                    {/* Utility Controls & Export */}
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Toggle Salary Encryption / Mask */}
                        <button
                            onClick={handleToggleMask}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border cursor-pointer ${
                                maskSalaries 
                                    ? 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100' 
                                    : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                            }`}
                            title={maskSalaries ? 'Click to reveal confidential salaries' : 'Click to mask financial numbers'}
                        >
                            {maskSalaries ? <Eye size={13} className="text-slate-500" /> : <EyeOff size={13} className="text-amber-600" />}
                            <span>{maskSalaries ? 'Reveal Salaries' : 'Mask Salaries'}</span>
                        </button>

                        {/* Bank Transfer Sheet */}
                        {payslips.length > 0 && (
                            <button 
                                id="btn-bank-excel"
                                onClick={handleDownloadBankExcel} 
                                disabled={!!actionLoading}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors disabled:opacity-50 shadow-xs cursor-pointer"
                                title="Download Bank Transfer Sheet (Excel/CSV)"
                            >
                                {actionLoading === 'bank-excel' ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}
                                <span>Bank Transfer Sheet</span>
                            </button>
                        )}

                        {/* Refresh */}
                        <button 
                            onClick={() => setRefreshCounter(c => c + 1)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 border border-slate-200 transition-colors cursor-pointer" 
                            title="Refresh"
                        >
                            <RefreshCw size={13} />
                        </button>
                    </div>
                </div>
            </div>

            {/* ERP split: payable vs claims vs loans vs payroll ERP amount (after generate) */}
            {run.status === 'Draft' && payslips.length > 0 && displayAmounts && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100">
                        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                            <Building2 size={16} className="text-indigo-600" />
                            Payroll & ERP Amount Split
                        </h2>
                        <p className="text-xs text-slate-500 mt-1 max-w-3xl">
                            Expense claims and loan deductions are posted to ERP under separate vouchers.
                            When you approve, you will enter a Payroll ERP ID for the salary portion only ({fmt(displayAmounts.erpPayableAmount)}).
                        </p>
                    </div>

                    <div className="p-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            <div className="rounded-xl p-4 bg-indigo-50 border border-indigo-100">
                                <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider mb-1">Total Payable (Payslips)</p>
                                <p className="text-xl font-black text-indigo-900">{fmt(displayAmounts.totalPayableAmount)}</p>
                                <p className="text-[10px] text-indigo-600/80 mt-1">Net cash transfer to employees</p>
                            </div>
                            <div className="rounded-xl p-4 bg-amber-50 border border-amber-100">
                                <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                                    <Receipt size={11} /> Expense Claims
                                </p>
                                <p className="text-xl font-black text-amber-900">{fmt(displayAmounts.totalExpenseClaimsAmount)}</p>
                                <p className="text-[10px] text-amber-700/80 mt-1">Separate ERP IDs — deducted</p>
                            </div>
                            <div className="rounded-xl p-4 bg-purple-50 border border-purple-100">
                                <p className="text-[11px] font-bold text-purple-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                                    <CreditCard size={11} /> Loan Deductions
                                </p>
                                <p className="text-xl font-black text-purple-900">{fmt(displayAmounts.totalLoanDeductionsAmount ?? 0)}</p>
                                <p className="text-[10px] text-purple-700/80 mt-1">Separate Loan ERP ID — added back</p>
                            </div>
                            <div className="rounded-xl p-4 bg-emerald-50 border border-emerald-200 ring-1 ring-emerald-100">
                                <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider mb-1">Payroll ERP Amount</p>
                                <p className="text-xl font-black text-emerald-900">{fmt(displayAmounts.erpPayableAmount)}</p>
                                <p className="text-[10px] text-emerald-700/80 mt-1">Post this amount when approving</p>
                            </div>
                        </div>

                        {amountPreview?.expenseClaimsIncluded && amountPreview.expenseClaimsIncluded.length > 0 && (
                            <div className="rounded-xl border border-slate-100 overflow-hidden mt-4">
                                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-600 uppercase tracking-wider">
                                    Included Expense Claims (separate ERP IDs)
                                </div>
                                <div className="max-h-48 overflow-y-auto divide-y divide-slate-50">
                                    {amountPreview.expenseClaimsIncluded.map(c => (
                                        <div key={c._id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                                            <div>
                                                <span className="font-bold text-slate-800">{c.claimNo}</span>
                                                <span className="text-slate-400 mx-2">•</span>
                                                <span className="text-slate-600">{c.employeeId}</span>
                                            </div>
                                            <div className="flex items-center gap-3 shrink-0">
                                                <span className="font-bold text-amber-800">{fmt(c.amount)}</span>
                                                <span className={`font-mono text-[10px] px-2 py-0.5 rounded ${c.erpReferenceId ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
                                                    {c.erpReferenceId || 'No ERP ID'}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Summary cards */}
            {payslips.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                        <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><Users size={12} /> Total Employees</p>
                        <p className="text-2xl font-bold text-slate-800">{payslips.length}</p>
                    </div>
                    <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                        <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><Banknote size={12} /> Total Gross Pay</p>
                        <p className="text-xl font-bold text-emerald-600">{fmt(totalGross)}</p>
                    </div>
                    <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100 shadow-sm">
                        <p className="text-xs text-amber-700 mb-1 flex items-center gap-1"><Receipt size={12} /> Expense Claims (ERP separate)</p>
                        <p className="text-xl font-bold text-amber-800">{fmt(totalExpenseClaims)}</p>
                    </div>
                    <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100 shadow-sm">
                        <p className="text-xs text-indigo-600 mb-1 flex items-center gap-1"><CreditCard size={12} /> Total Net Pay</p>
                        <p className="text-xl font-bold text-indigo-700">{fmt(totalNet)}</p>
                        <p className="text-[10px] text-indigo-500 mt-1">ERP payroll: {fmt(displayAmounts?.erpPayableAmount ?? (totalNet - totalExpenseClaims + totalLoanDeductions))}</p>
                    </div>
                </div>
            )}

            {/* Payslips Table */}
            {payslips.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <h2 className="text-sm font-bold text-slate-700">Payslips & Disbursement Accounts</h2>
                            <span className="text-xs text-slate-400">({payslips.length} employees)</span>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Employee</th>
                                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Beneficiary Account</th>
                                    <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Gross</th>
                                    <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Deductions</th>
                                    <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Net Pay</th>
                                    {run.status === 'Draft' && <th className="px-5 py-3 text-right">Action</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {payslips.map(ps => {
                                    const accNo = ps.beneficiaryAccount || ps.employeeDetails?.bankDetails?.accountNumber || ps.employeeDetails?.bankDetails?.iban;
                                    const benName = ps.beneficiaryName || formatEmployeeFullName(ps.employeeDetails, ps.employeeId);
                                    
                                    return (
                                        <tr key={ps._id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-5 py-3.5">
                                                <p className="font-semibold text-slate-800">
                                                    {formatEmployeeFullName(ps.employeeDetails, ps.employeeId)}
                                                </p>
                                                <p className="text-xs text-slate-400">
                                                    {ps.employeeDetails?.jobInfo?.designation} • {ps.employeeId}
                                                </p>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                {accNo ? (
                                                    <div>
                                                        <p className="font-mono text-xs font-bold text-slate-700">{accNo}</p>
                                                        <p className="text-[11px] text-slate-400">{benName} • {ps.beneficiaryBank || 'Meezan Bank'}</p>
                                                    </div>
                                                ) : (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                                        Empty (Fill in Edit)
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3.5 text-right font-medium text-slate-700">{fmt(ps.grossPay)}</td>
                                            <td className="px-5 py-3.5 text-right hidden md:table-cell text-rose-500 font-medium">
                                                {ps.totalDeductions > 0 ? `- ${fmt(ps.totalDeductions)}` : '—'}
                                            </td>
                                            <td className="px-5 py-3.5 text-right font-bold text-indigo-700">{fmt(ps.netPay)}</td>
                                            {run.status === 'Draft' && (
                                                <td className="px-5 py-3.5 text-right">
                                                    <button
                                                        id={`btn-edit-payslip-${ps._id}`}
                                                        onClick={() => setEditingPayslip(ps)}
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                                        title="Edit payslip & beneficiary details"
                                                    >
                                                        <PencilLine size={15} />
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Inline Payslip Edit Modal */}
            {editingPayslip && (
                <PayslipEditPanel
                    payslip={editingPayslip}
                    currency={run.currency}
                    allPayslips={payslips}
                    onClose={() => setEditingPayslip(null)}
                    onSaved={() => { setEditingPayslip(null); setRefreshCounter(c => c + 1); }}
                />
            )}

            {/* Edit Attendance Period Modal */}
            {showEditPeriodModal && createPortal(
                <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2 text-slate-900">
                                <Calendar size={20} className="text-indigo-600" />
                                <h3 className="font-bold text-base">Edit Payroll Calculation Period</h3>
                            </div>
                            <button onClick={() => setShowEditPeriodModal(false)} className="p-1 text-slate-400 hover:bg-slate-100 rounded-lg">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-slate-700 uppercase">Payroll Calculation Period</span>
                                <span className="font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                                    {countWorkingDays(editStartInput, editEndInput)} Working Days
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Start Date (From)</label>
                                    <input
                                        type="date"
                                        value={editStartInput}
                                        onChange={e => setEditStartInput(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">End Date (To)</label>
                                    <input
                                        type="date"
                                        value={editEndInput}
                                        onChange={e => setEditEndInput(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono"
                                        required
                                    />
                                </div>
                            </div>

                            <p className="text-[11px] text-slate-500 italic">
                                Changing the date range updates which days are counted for payroll calculation and working days.
                            </p>
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                            <button
                                onClick={() => setShowEditPeriodModal(false)}
                                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSavePeriod}
                                disabled={actionLoading === 'save-period'}
                                className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-60 cursor-pointer"
                            >
                                {actionLoading === 'save-period' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                                Save Period
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Approve Payroll — ERP ID + amount split */}
            {showApproveModal && displayAmounts && createPortal(
                <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2 text-slate-900">
                                <CheckCircle2 size={22} className="text-indigo-600" />
                                <h3 className="font-bold text-base">Approve Payroll Run</h3>
                            </div>
                            <button onClick={() => setShowApproveModal(false)} className="p-1 text-slate-400 hover:bg-slate-100 rounded-lg">
                                <X size={18} />
                            </button>
                        </div>

                        <p className="text-xs text-slate-500 leading-relaxed">
                            Finalize payslips and record the Payroll ERP voucher. Post only the <strong>Payroll ERP Amount</strong> to ERP — expense claims already have separate ERP IDs.
                        </p>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div className="rounded-xl p-2.5 bg-indigo-50 border border-indigo-100">
                                <p className="text-[10px] font-bold text-indigo-600 uppercase mb-0.5">Total Payable</p>
                                <p className="text-xs font-black text-indigo-900">{fmt(displayAmounts.totalPayableAmount)}</p>
                            </div>
                            <div className="rounded-xl p-2.5 bg-amber-50 border border-amber-100">
                                <p className="text-[10px] font-bold text-amber-700 uppercase mb-0.5">Expense Claims</p>
                                <p className="text-xs font-black text-amber-900">{fmt(displayAmounts.totalExpenseClaimsAmount)}</p>
                            </div>
                            <div className="rounded-xl p-2.5 bg-purple-50 border border-purple-100">
                                <p className="text-[10px] font-bold text-purple-700 uppercase mb-0.5">Loan Deductions</p>
                                <p className="text-xs font-black text-purple-900">{fmt(displayAmounts.totalLoanDeductionsAmount ?? 0)}</p>
                            </div>
                            <div className="rounded-xl p-2.5 bg-emerald-50 border border-emerald-200">
                                <p className="text-[10px] font-bold text-emerald-700 uppercase mb-0.5">Post to ERP</p>
                                <p className="text-xs font-black text-emerald-900">{fmt(displayAmounts.erpPayableAmount)}</p>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">
                                Payroll ERP ID / Voucher <span className="text-rose-500">*</span>
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. ERP-PAY-JUL-2026-001"
                                value={approveErpInput}
                                onChange={e => setApproveErpInput(e.target.value)}
                                autoFocus
                                className="w-full bg-slate-50 border border-slate-200 text-slate-800 px-3.5 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono font-semibold text-sm"
                            />
                            <p className="text-[10px] text-slate-400 mt-1.5">
                                Use this ID for {fmt(displayAmounts.erpPayableAmount)} in ERP (excludes claims; loan deductions posted separately).
                            </p>
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                            <button
                                onClick={() => setShowApproveModal(false)}
                                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmApprove}
                                disabled={actionLoading === 'approve' || !approveErpInput.trim()}
                                className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                            >
                                {actionLoading === 'approve' ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                                Approve Run
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Finance ERP Task Modal (edit after approval) */}
            {showErpTaskModal && createPortal(
                <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2 text-slate-900">
                                <Building2 size={20} className="text-indigo-600" />
                                <h3 className="font-bold text-base">Payroll ERP Reference ID</h3>
                            </div>
                            <button onClick={() => setShowErpTaskModal(false)} className="p-1 text-slate-400 hover:bg-slate-100 rounded-lg">
                                <X size={18} />
                            </button>
                        </div>

                        <p className="text-xs text-slate-500 leading-relaxed">
                            Enter the ERP voucher for the <strong>payroll amount excluding expense claims</strong>.
                            {amountPreview && (
                                <> Post <strong>{fmt(amountPreview.erpPayableAmount)}</strong> to ERP — claims ({fmt(amountPreview.totalExpenseClaimsAmount)}) already have separate ERP IDs.</>
                            )}
                        </p>

                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="block font-bold text-slate-700 mb-1">
                                    Payroll ERP ID / Voucher Number <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. ERP-PAY-JUL-2026-001"
                                    value={erpRefInput}
                                    onChange={e => setErpRefInput(e.target.value)}
                                    autoFocus
                                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 px-3.5 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono font-semibold text-sm"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                            <button
                                onClick={() => setShowErpTaskModal(false)}
                                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveErpTask}
                                disabled={actionLoading === 'erp-task'}
                                className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-60"
                            >
                                {actionLoading === 'erp-task' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                                Save ERP ID
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Privacy Reveal Confirmation Modal */}
            <AlertModal
                isOpen={showRevealConfirm}
                onClose={() => setShowRevealConfirm(false)}
                title="Reveal Confidential Salary Details?"
                message="You are about to display sensitive financial figures on your screen. Please make sure no one nearby is looking at your screen to protect your privacy."
                type="warning"
                confirmText="Yes, Reveal Salaries"
                cancelText="Keep Masked"
                showCancel={true}
                onConfirm={handleConfirmReveal}
            />

            {/* Styled Confirmation & Alert Popup */}
            <AlertModal
                isOpen={alertConfig.isOpen}
                onClose={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                onConfirm={alertConfig.onConfirm}
                confirmText={alertConfig.confirmText}
                showCancel={alertConfig.showCancel}
            />
        </div>
    );
};

export default PayrollRunDetail;
