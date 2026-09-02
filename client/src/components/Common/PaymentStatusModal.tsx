import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, X, Loader2, Calendar, FileText, Info } from 'lucide-react';

export interface PaymentStatusTarget {
    id: string;
    itemType: 'claim' | 'request';
    employeeName: string;
    employeeId?: string;
    title: string;
    amount?: number;
    currency?: string;
    currentStatus?: 'Paid' | 'Unpaid' | 'Included in Payroll';
    currentErpRef?: string;
    currentPaidAt?: string;
}

interface PaymentStatusModalProps {
    target: PaymentStatusTarget | null;
    onClose: () => void;
    onSuccess: (targetId: string, newStatus: 'Paid' | 'Unpaid', erpReferenceId?: string, paidAt?: string, remarks?: string) => Promise<void>;
}

export default function PaymentStatusModal({ target, onClose, onSuccess }: PaymentStatusModalProps) {
    if (!target) return null;

    const isCurrentlyPaid = target.currentStatus === 'Paid';
    const nextStatus: 'Paid' | 'Unpaid' = isCurrentlyPaid ? 'Unpaid' : 'Paid';

    const [erpReferenceId, setErpReferenceId] = useState(target.currentErpRef || '');
    const [paidDate, setPaidDate] = useState<string>(() => {
        if (target.currentPaidAt) {
            try {
                return new Date(target.currentPaidAt).toISOString().split('T')[0];
            } catch (e) {}
        }
        return new Date().toISOString().split('T')[0];
    });
    const [remarks, setRemarks] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onSuccess(
                target.id,
                nextStatus,
                nextStatus === 'Paid' ? erpReferenceId.trim() : undefined,
                nextStatus === 'Paid' ? paidDate : undefined,
                remarks.trim() || undefined
            );
            onClose();
        } catch (err) {
            // error handled by caller
        } finally {
            setLoading(false);
        }
    };

    return createPortal(
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn overflow-y-auto"
            onClick={onClose}
        >
            <div 
                className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full max-h-[90vh] sm:max-h-[85vh] flex flex-col overflow-hidden transition-all transform animate-scaleIn my-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className={`shrink-0 p-4 sm:p-5 text-white flex items-center justify-between ${
                    nextStatus === 'Paid'
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600'
                        : 'bg-gradient-to-r from-amber-600 to-orange-600'
                }`}>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/20 rounded-2xl backdrop-blur-md shrink-0">
                            {nextStatus === 'Paid' ? <CheckCircle2 size={22} /> : <AlertCircle size={22} />}
                        </div>
                        <div>
                            <h3 className="font-bold text-base sm:text-lg leading-tight">
                                {nextStatus === 'Paid' ? 'Mark as Paid (Direct Payout)' : 'Revert to Unpaid'}
                            </h3>
                            <p className="text-white/80 text-xs mt-0.5">
                                {nextStatus === 'Paid' ? 'Disburse directly outside payroll' : 'Queue for inclusion in payroll'}
                            </p>
                        </div>
                    </div>
                    <button 
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded-full hover:bg-white/20 text-white transition-colors shrink-0"
                    >
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
                    {/* Scrollable Body */}
                    <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 text-slate-700 text-sm">
                        {/* Item Summary Card */}
                        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-2">
                            <div className="flex justify-between items-start">
                                <div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Employee</span>
                                    <p className="font-bold text-slate-900 text-sm">
                                        {target.employeeName} {target.employeeId && <span className="text-xs text-slate-500 font-normal">({target.employeeId})</span>}
                                    </p>
                                </div>
                                {typeof target.amount === 'number' && (
                                    <div className="text-right">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Amount</span>
                                        <p className="font-extrabold text-emerald-700 text-base">
                                            {target.currency || 'Rs.'} {target.amount.toLocaleString()}
                                        </p>
                                    </div>
                                )}
                            </div>
                            <div className="pt-2 border-t border-slate-200/60 flex justify-between text-xs text-slate-600">
                                <span>Item: <strong className="text-slate-800">{target.title}</strong></span>
                                <span>Current: <strong className={isCurrentlyPaid ? 'text-emerald-700' : 'text-amber-700'}>{target.currentStatus || 'Unpaid'}</strong></span>
                            </div>
                        </div>

                        {/* Logic Notice Box */}
                        {nextStatus === 'Paid' ? (
                            <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-3 flex items-start gap-2.5 text-xs text-emerald-900 leading-relaxed">
                                <Info size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                                <div>
                                    <strong className="font-bold">Excluded from Monthly Payroll:</strong> Marking as Paid indicates Finance has disbursed this payout directly. It will be <strong>left out</strong> of payroll runs to prevent double payment.
                                </div>
                            </div>
                        ) : (
                            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-start gap-2.5 text-xs text-amber-900 leading-relaxed">
                                <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
                                <div>
                                    <strong className="font-bold">Included in Monthly Payroll:</strong> Reverting to Unpaid means this approved amount will <strong>automatically be added</strong> to the employee's next monthly payroll salary and payslip.
                                </div>
                            </div>
                        )}

                        {/* Inputs when marking as Paid */}
                        {nextStatus === 'Paid' && (
                            <div className="space-y-3 pt-0.5">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">
                                        ERP Reference / Voucher # (Optional)
                                    </label>
                                    <div className="relative">
                                        <FileText size={15} className="absolute left-3 top-3 text-slate-400" />
                                        <input 
                                            type="text"
                                            placeholder="e.g. ERP-BANK-998822"
                                            value={erpReferenceId}
                                            onChange={(e) => setErpReferenceId(e.target.value)}
                                            className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition-all"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">
                                        Disbursement Date
                                    </label>
                                    <div className="relative">
                                        <Calendar size={15} className="absolute left-3 top-3 text-slate-400" />
                                        <input 
                                            type="date"
                                            value={paidDate}
                                            onChange={(e) => setPaidDate(e.target.value)}
                                            className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition-all"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">
                                Finance Remarks / Notes (Optional)
                            </label>
                            <textarea 
                                rows={2}
                                placeholder="Add any audit notes..."
                                value={remarks}
                                onChange={(e) => setRemarks(e.target.value)}
                                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none transition-all resize-none"
                            />
                        </div>
                    </div>

                    {/* Sticky Footer Actions */}
                    <div className="shrink-0 p-3.5 sm:p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className={`px-5 py-2 text-xs font-bold text-white rounded-xl shadow-md transition-all flex items-center gap-2 ${
                                nextStatus === 'Paid'
                                    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                                    : 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                            }`}
                        >
                            {loading && <Loader2 size={14} className="animate-spin" />}
                            {nextStatus === 'Paid' ? 'Confirm & Mark as Paid' : 'Confirm & Revert to Unpaid'}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}

