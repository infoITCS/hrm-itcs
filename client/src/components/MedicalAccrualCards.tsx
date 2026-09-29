import React from 'react';
import { DollarSign, Sparkles, ShieldCheck } from 'lucide-react';
import type { MedicalAccrualData } from '../utils/medicalAccrual';

interface Props {
    accrual: Partial<MedicalAccrualData> | null | undefined;
    currentClaimAmount?: number;
    title?: string;
    subtitle?: string;
    currency?: string;
    compact?: boolean;
}

export const MedicalAccrualCards: React.FC<Props> = ({
    accrual,
    currentClaimAmount,
    title,
    subtitle,
    currency = 'PKR',
    compact = false,
}) => {
    const monthlyAllowance = accrual?.monthlyAllowance ?? 5000;
    const eligibleMonths = accrual?.eligibleMonths ?? 0;
    const accruedBalance = accrual?.accruedBalance ?? (eligibleMonths * monthlyAllowance);
    const totalUtilized = accrual?.totalUtilized ?? 0;
    const remainingBalance = accrual?.remainingBalance ?? Math.max(0, accruedBalance - totalUtilized);
    const annualLimit = (accrual as any)?.annualLimit ?? (accrual as any)?.annualCap ?? 60000;

    const formatAmt = (val: number) => `${currency} ${Number(val || 0).toLocaleString('en-PK')}`;

    const isOver = typeof currentClaimAmount === 'number' && currentClaimAmount > remainingBalance;
    const postApprovalRemaining = typeof currentClaimAmount === 'number' ? Math.max(0, remainingBalance - currentClaimAmount) : remainingBalance;

    return (
        <div className="space-y-2">
            {(title || subtitle) && (
                <div className="flex items-center justify-between gap-2">
                    {title && (
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5 truncate">
                            <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
                            <span className="truncate">{title}</span>
                        </span>
                    )}
                    {subtitle && (
                        <span className="text-[11px] font-semibold text-slate-400 shrink-0">
                            {subtitle}
                        </span>
                    )}
                </div>
            )}
            <div className={`grid ${compact ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-4'} gap-2 sm:gap-2.5`}>
                {/* 1. Monthly Allowance */}
                <div className="bg-sky-50/70 border border-sky-200/80 rounded-xl p-2.5 shadow-2xs">
                    <div className="flex items-center gap-1.5 text-sky-800 text-[11px] font-bold tracking-tight mb-1">
                        <DollarSign size={13} className="text-sky-600 shrink-0" />
                        <span className="truncate">Monthly Allowance</span>
                    </div>
                    <div className="font-black text-sky-950 text-sm sm:text-base tracking-tight leading-none mb-1">
                        {formatAmt(monthlyAllowance)}
                    </div>
                    <div className="text-[10px] text-sky-700/80 font-medium truncate">
                        Accrues monthly
                    </div>
                </div>

                {/* 2. Accrued To-Date */}
                <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-xl p-2.5 shadow-2xs">
                    <div className="flex items-center gap-1.5 text-indigo-800 text-[11px] font-bold tracking-tight mb-1">
                        <Sparkles size={13} className="text-indigo-600 shrink-0" />
                        <span className="truncate">Total Accrued</span>
                    </div>
                    <div className="font-black text-indigo-950 text-sm sm:text-base tracking-tight leading-none mb-1">
                        {formatAmt(accruedBalance)}
                    </div>
                    <div className="text-[10px] text-indigo-700/80 font-medium truncate">
                        {eligibleMonths} eligible month{eligibleMonths !== 1 ? 's' : ''}
                    </div>
                </div>

                {/* 3. Amount Requested (if current claim context) OR Annual Cap (profile/info context) */}
                {typeof currentClaimAmount === 'number' ? (
                    <div className={`rounded-xl p-2.5 border shadow-2xs transition-all ${
                        isOver ? 'bg-rose-50/80 border-rose-300 text-rose-950' : 'bg-slate-50/80 border-slate-200 text-slate-900'
                    }`}>
                        <div className={`flex items-center gap-1.5 text-[11px] font-bold tracking-tight mb-1 ${
                            isOver ? 'text-rose-800' : 'text-slate-600'
                        }`}>
                            <span className="text-[10px] font-black leading-none text-indigo-600">PKR</span>
                            <span className="truncate">Amount Requested</span>
                        </div>
                        <div className={`font-black text-sm sm:text-base tracking-tight leading-none mb-1 ${
                            isOver ? 'text-rose-700' : 'text-slate-900'
                        }`}>
                            {formatAmt(currentClaimAmount)}
                        </div>
                        <div className={`text-[10px] font-semibold truncate ${
                            isOver ? 'text-rose-600' : 'text-slate-400'
                        }`}>
                            {isOver ? `Over by ${formatAmt(currentClaimAmount - remainingBalance)}` : 'Current claim'}
                        </div>
                    </div>
                ) : (
                    <div className="bg-purple-50/70 border border-purple-200/80 rounded-xl p-2.5 shadow-2xs">
                        <div className="flex items-center gap-1.5 text-purple-800 text-[11px] font-bold tracking-tight mb-1">
                            <ShieldCheck size={13} className="text-purple-600 shrink-0" />
                            <span className="truncate">Annual Limit</span>
                        </div>
                        <div className="font-black text-purple-950 text-sm sm:text-base tracking-tight leading-none mb-1">
                            {formatAmt(annualLimit)}
                        </div>
                        <div className="text-[10px] text-purple-700/80 font-medium truncate">
                            Policy annual cap
                        </div>
                    </div>
                )}

                {/* 4. Remaining Balance */}
                <div className={`rounded-xl p-2.5 border shadow-2xs transition-all ${
                    isOver ? 'bg-rose-50/90 border-rose-300 text-rose-950' : 'bg-emerald-50/90 border-emerald-200/90 text-emerald-950'
                }`}>
                    <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-tight mb-1">
                        <ShieldCheck size={13} className={isOver ? 'text-rose-600 shrink-0' : 'text-emerald-600 shrink-0'} />
                        <span className={`truncate ${isOver ? 'text-rose-800' : 'text-emerald-800'}`}>
                            Remaining Balance
                        </span>
                    </div>
                    <div className={`font-black text-sm sm:text-base tracking-tight leading-none mb-1 ${
                        isOver ? 'text-rose-700' : 'text-emerald-800'
                    }`}>
                        {formatAmt(remainingBalance)}
                    </div>
                    <div className={`text-[10px] font-semibold truncate ${
                        isOver ? 'text-rose-600' : 'text-emerald-700'
                    }`}>
                        {typeof currentClaimAmount === 'number' && currentClaimAmount > 0 ? (
                            isOver ? (
                                `Over limit by ${formatAmt(currentClaimAmount - remainingBalance)}`
                            ) : (
                                `After: ${formatAmt(postApprovalRemaining)}`
                            )
                        ) : (
                            'Available to claim'
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MedicalAccrualCards;
