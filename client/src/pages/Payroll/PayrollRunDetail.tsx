import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Banknote, Loader2, CheckCircle2,
    PencilLine, Save, X, Plus, Trash2, Users,
    TrendingDown, CreditCard, RefreshCw,
    Eye, EyeOff, FileSpreadsheet, Building2
} from 'lucide-react';
import axios from 'axios';
import { api } from '../../utils/api';
import { usePermissions } from '../../hooks/usePermissions';
import AlertModal from '../../components/UI/AlertModal';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface Earning { component: string; amount: number; type: 'fixed' | 'variable' }
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
}

const PRESET_EARNINGS = [
    'Basic Salary',
    'Meal Allowance',
    'Performance Bonus',
    'Fuel Allowance',
    'Medical Allowance',
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
    const empOwnName = `${payslip.employeeDetails?.firstName || ''} ${payslip.employeeDetails?.lastName || ''}`.trim();
    const hasEmployeeBank = Boolean(empOwnAccount);

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
            const name = target.beneficiaryName || `${target.employeeDetails?.firstName || ''} ${target.employeeDetails?.lastName || ''}`.trim();
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
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
                    <div>
                        <h2 className="text-base font-bold text-slate-800">Edit Payslip & Beneficiary Details</h2>
                        <p className="text-xs text-slate-500">
                            {payslip.employeeDetails?.firstName} {payslip.employeeDetails?.lastName} ({payslip.employeeId}) • {payslip.payslipNo}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
                </div>

                <div className="p-6 space-y-5">
                    {error && <div className="bg-rose-50 text-rose-700 text-sm px-3 py-2 rounded-lg border border-rose-200">{error}</div>}

                    {/* Bank Disbursement Section */}
                    {hasEmployeeBank && !isProxyMode ? (
                        <div className="bg-emerald-50/60 rounded-xl p-4 border border-emerald-100 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                                        <Building2 size={16} />
                                    </div>
                                    <div>
                                        <h3 className="text-xs font-bold text-emerald-950 uppercase tracking-wide flex items-center gap-1.5">
                                            Employee Registered Bank Account
                                            <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                                                <CheckCircle2 size={11} className="text-emerald-600" /> On File
                                            </span>
                                        </h3>
                                        <p className="text-[11px] text-slate-500">Disbursement will be paid directly to employee's primary bank</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsProxyMode(true)}
                                    className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold underline decoration-indigo-300 hover:decoration-indigo-600 transition-colors text-left sm:text-right"
                                >
                                    Use Proxy / Alternate Account
                                </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-white p-3 rounded-lg border border-emerald-100/80 text-xs shadow-xs">
                                <div>
                                    <span className="block text-[10px] font-bold uppercase text-slate-400">Account / IBAN</span>
                                    <span className="font-mono font-bold text-slate-800">{empOwnAccount}</span>
                                </div>
                                <div>
                                    <span className="block text-[10px] font-bold uppercase text-slate-400">Account Title</span>
                                    <span className="font-semibold text-slate-700">{empOwnName || '—'}</span>
                                </div>
                                <div>
                                    <span className="block text-[10px] font-bold uppercase text-slate-400">Bank Name</span>
                                    <span className="font-semibold text-slate-700">{empOwnBank}</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-amber-50/60 rounded-xl p-4 border border-amber-200/80 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div>
                                    <h3 className="text-xs font-bold text-amber-950 uppercase tracking-wide flex items-center gap-1.5">
                                        <Building2 size={14} className="text-amber-600" />
                                        {hasEmployeeBank ? 'Proxy / Alternate Beneficiary Account' : 'Beneficiary Account (No Bank Info On File)'}
                                    </h3>
                                    <p className="text-[11px] text-amber-800/80">
                                        {hasEmployeeBank
                                            ? 'Routing salary disbursement to an alternate/proxy beneficiary account'
                                            : 'Employee profile has no bank account on file. Enter details or choose a proxy account.'}
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    {hasEmployeeBank && (
                                        <button
                                            type="button"
                                            onClick={handleRevertToOwnBank}
                                            className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold underline"
                                        >
                                            Use Employee's Account
                                        </button>
                                    )}
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[11px] text-slate-500 font-medium">Use proxy:</span>
                                        <select 
                                            onChange={(e) => handleCopyFromOtherEmployee(e.target.value)}
                                            defaultValue=""
                                            className="text-xs bg-white border border-amber-300 text-slate-700 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-amber-400"
                                        >
                                            <option value="">Select Employee Account...</option>
                                            {allPayslips
                                                .filter(p => p.employeeId !== payslip.employeeId)
                                                .map(p => (
                                                    <option key={p.employeeId} value={p.employeeId}>
                                                        {p.employeeDetails?.firstName} {p.employeeDetails?.lastName} ({p.employeeId})
                                                    </option>
                                                ))
                                            }
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                <div>
                                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Account Number / IBAN</label>
                                    <input
                                        type="text"
                                        placeholder="Enter account number / IBAN"
                                        value={beneficiaryAccount}
                                        onChange={e => setBeneficiaryAccount(e.target.value)}
                                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400 font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Beneficiary Name</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Abdul Raheem"
                                        value={beneficiaryName}
                                        onChange={e => setBeneficiaryName(e.target.value)}
                                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Bank Name</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Meezan Bank"
                                        value={beneficiaryBank}
                                        onChange={e => setBeneficiaryBank(e.target.value)}
                                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Earnings with Dropdowns */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                                <TrendingDown size={14} className="rotate-180 text-emerald-500" /> Earnings
                            </h3>
                            <button 
                                onClick={() => setEarnings(e => [...e, { component: 'Performance Bonus', amount: 0, type: 'variable' }])}
                                className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium"
                            >
                                <Plus size={13} /> Add Earning
                            </button>
                        </div>
                        <div className="space-y-2">
                            {earnings.map((e, i) => (
                                <div key={i} className="grid grid-cols-6 gap-2 items-center">
                                    <select
                                        value={PRESET_EARNINGS.includes(e.component) ? e.component : 'Custom / Other'}
                                        onChange={ev => {
                                            const val = ev.target.value;
                                            setEarnings(arr => arr.map((x, j) => j === i ? { ...x, component: val === 'Custom / Other' ? '' : val } : x));
                                        }}
                                        className="col-span-3 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 font-medium"
                                    >
                                        {PRESET_EARNINGS.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                    {!PRESET_EARNINGS.slice(0, -1).includes(e.component) && (
                                        <input
                                            value={e.component}
                                            onChange={ev => setEarnings(arr => arr.map((x, j) => j === i ? { ...x, component: ev.target.value } : x))}
                                            placeholder="Custom component name"
                                            className="col-span-3 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                        />
                                    )}
                                    <input
                                        type="number"
                                        value={e.amount}
                                        onChange={ev => setEarnings(arr => arr.map((x, j) => j === i ? { ...x, amount: Number(ev.target.value) } : x))}
                                        placeholder="Amount"
                                        className={`${!PRESET_EARNINGS.slice(0, -1).includes(e.component) ? 'col-span-2' : 'col-span-2'} border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-right font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-300`}
                                    />
                                    <button
                                        onClick={() => setEarnings(arr => arr.filter((_, j) => j !== i))}
                                        className="p-1.5 text-rose-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 justify-self-center"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Deductions with Dropdowns */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                                <TrendingDown size={14} className="text-rose-500" /> Deductions
                            </h3>
                            <button 
                                onClick={() => setDeductions(d => [...d, { component: 'Income Tax / Withholding Tax', amount: 0 }])}
                                className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium"
                            >
                                <Plus size={13} /> Add Deduction
                            </button>
                        </div>
                        <div className="space-y-2">
                            {deductions.length === 0 && (
                                <p className="text-xs text-slate-400 italic">No deductions yet. Click Add to select Income Tax, Loan, EOBI, etc.</p>
                            )}
                            {deductions.map((d, i) => (
                                <div key={i} className="grid grid-cols-6 gap-2 items-center">
                                    <select
                                        value={PRESET_DEDUCTIONS.includes(d.component) ? d.component : 'Custom / Other'}
                                        onChange={ev => {
                                            const val = ev.target.value;
                                            setDeductions(arr => arr.map((x, j) => j === i ? { ...x, component: val === 'Custom / Other' ? '' : val } : x));
                                        }}
                                        className="col-span-3 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 font-medium"
                                    >
                                        {PRESET_DEDUCTIONS.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                    {!PRESET_DEDUCTIONS.slice(0, -1).includes(d.component) && (
                                        <input
                                            value={d.component}
                                            onChange={ev => setDeductions(arr => arr.map((x, j) => j === i ? { ...x, component: ev.target.value } : x))}
                                            placeholder="Custom deduction name"
                                            className="col-span-3 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                        />
                                    )}
                                    <input
                                        type="number"
                                        value={d.amount}
                                        onChange={ev => setDeductions(arr => arr.map((x, j) => j === i ? { ...x, amount: Number(ev.target.value) } : x))}
                                        placeholder="Amount"
                                        className={`${!PRESET_DEDUCTIONS.slice(0, -1).includes(d.component) ? 'col-span-2' : 'col-span-2'} border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-right font-semibold text-rose-600 focus:outline-none focus:ring-2 focus:ring-indigo-300`}
                                    />
                                    <button
                                        onClick={() => setDeductions(arr => arr.filter((_, j) => j !== i))}
                                        className="p-1.5 text-rose-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 justify-self-center"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Live totals */}
                    <div className="bg-slate-50 rounded-xl p-4 space-y-1.5 text-sm">
                        <div className="flex justify-between text-slate-600"><span>Gross Pay</span><span className="font-semibold text-emerald-600">{fmt(grossPay)}</span></div>
                        <div className="flex justify-between text-slate-600"><span>Total Deductions</span><span className="font-semibold text-rose-600">- {fmt(totalDeductions)}</span></div>
                        <div className="flex justify-between text-slate-800 font-bold border-t border-slate-200 pt-1.5 mt-1"><span>Net Pay</span><span className="text-indigo-600">{fmt(netPay)}</span></div>
                    </div>

                    {/* Payment method, Customer Reference & Notes */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Method</label>
                            <select
                                value={paymentMethod}
                                onChange={e => setPaymentMethod(e.target.value)}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            >
                                <option value="Bank Transfer">Bank Transfer</option>
                                <option value="Cash">Cash</option>
                                <option value="Cheque">Cheque</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Customer / Bank Ref</label>
                            <input
                                value={customerReference}
                                onChange={e => setCustomerReference(e.target.value)}
                                placeholder="e.g. PAY-202608-001"
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Notes</label>
                            <input
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                placeholder="Optional payslip note..."
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-2 px-6 pb-5">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 font-medium">Cancel</button>
                    <button onClick={handleSave} disabled={saving}
                        className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90 flex items-center gap-2 disabled:opacity-60">
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
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
    const [erpRefInput, setErpRefInput] = useState('');
    const [erpNotesInput, setErpNotesInput] = useState('');

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

    useEffect(() => { fetchData(); }, [fetchData, refreshCounter]);

    const authHeader = { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } };

    const handleGenerate = async () => {
        triggerConfirm(
            'Regenerate Payslips?',
            `This will recalculate attendance penalties, loan installments, and non-taxable PF withdrawals for "${run?.title}". Existing draft payslips will be refreshed. Continue?`,
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

    const handleApprove = async () => {
        triggerConfirm(
            'Approve Payroll Run?',
            `Approve "${run?.title}"? All draft payslips will be finalized and PF monthly contributions recorded.`,
            async () => {
                setActionLoading('approve');
                try {
                    await axios.put(api.payrollApprove(id!), {}, authHeader);
                    setRefreshCounter(c => c + 1);
                } catch (err: any) {
                    triggerError('Failed to Approve', err.response?.data?.message || 'Failed to approve.');
                } finally {
                    setActionLoading(null);
                }
            }
        );
    };

    const handleSaveErpTask = async () => {
        setActionLoading('erp-task');
        try {
            await axios.put(api.payrollErpTask(id!), {
                erpReferenceId: erpRefInput.trim(),
                erpStatus: erpRefInput.trim() ? 'Posted' : 'Pending',
                erpNotes: erpNotesInput.trim(),
            }, authHeader);
            setShowErpTaskModal(false);
            setRefreshCounter(c => c + 1);
            triggerSuccess('ERP ID Saved', 'ERP Voucher ID updated successfully.');
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
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }));
            const link = document.createElement('a');
            link.href = url;
            const filename = `Bank_Disbursement_4Col_${(run?.title || 'Payroll').replace(/[^a-zA-Z0-9_\-]/g, '_')}.csv`;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err: any) {
            triggerError('Export Failed', err.response?.data?.message || 'Failed to download bank transfer sheet.');
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
    const totalDeductions = payslips.reduce((s, p) => s + p.totalDeductions, 0);
    const totalNet = payslips.reduce((s, p) => s + p.netPay, 0);

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
                            <span className="font-semibold text-slate-700">ERP Voucher:</span>
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
                    <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                        <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><TrendingDown size={12} /> Total Deductions</p>
                        <p className="text-xl font-bold text-rose-500">{fmt(totalDeductions)}</p>
                    </div>
                    <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100 shadow-sm">
                        <p className="text-xs text-indigo-600 mb-1 flex items-center gap-1"><CreditCard size={12} /> Total Net Pay</p>
                        <p className="text-xl font-bold text-indigo-700">{fmt(totalNet)}</p>
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
                                    const benName = ps.beneficiaryName || `${ps.employeeDetails?.firstName || ''} ${ps.employeeDetails?.lastName || ''}`.trim();
                                    
                                    return (
                                        <tr key={ps._id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-5 py-3.5">
                                                <p className="font-semibold text-slate-800">
                                                    {ps.employeeDetails?.firstName} {ps.employeeDetails?.lastName}
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

            {/* Finance ERP Task Modal */}
            {showErpTaskModal && createPortal(
                <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2 text-slate-900">
                                <Building2 size={20} className="text-indigo-600" />
                                <h3 className="font-bold text-base">Enter ERP ID</h3>
                            </div>
                            <button onClick={() => setShowErpTaskModal(false)} className="p-1 text-slate-400 hover:bg-slate-100 rounded-lg">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="block font-bold text-slate-700 mb-1">
                                    ERP ID / Voucher Number <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. ERP-TXN-2026-0899"
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
