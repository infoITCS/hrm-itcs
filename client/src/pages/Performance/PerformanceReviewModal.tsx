import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    X,
    Star,
    Award,
    Calendar,
    DollarSign,
    CheckCircle2,
    AlertCircle,
    User,
    ArrowRight,
    Sparkles,
    Loader2,
} from 'lucide-react';
import axios from 'axios';
import api from '../../utils/api';
import type { IPerformanceReview, RatingScale } from './types';
import { RATING_CONFIG, STATUS_CONFIG } from './types';

interface PerformanceReviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    review: IPerformanceReview | null;
    isHrOrAdmin: boolean;
    onSaved: () => void;
}

export const PerformanceReviewModal: React.FC<PerformanceReviewModalProps> = ({
    isOpen,
    onClose,
    review,
    isHrOrAdmin,
    onSaved,
}) => {
    const isClosed = review?.status === 'CLOSED';
    const isEmployeeSelfReview = !isHrOrAdmin && review?.status === 'PENDING_SELF_ASSESSMENT';

    // Employee State
    const [selfRating, setSelfRating] = useState<RatingScale | ''>(
        review?.selfAssessment?.rating || ''
    );
    const [defenseNotes, setDefenseNotes] = useState(
        review?.selfAssessment?.defenseNotes || ''
    );

    // HR Assessment & Compensation State
    const [finalRating, setFinalRating] = useState<RatingScale | ''>(
        review?.hrAssessment?.finalRating || review?.selfAssessment?.rating || 'MEETS_EXPECTATION'
    );
    const [feedbackNotes, setFeedbackNotes] = useState(
        review?.hrAssessment?.feedbackNotes || ''
    );

    const baseSalaryInitial =
        review?.compensationRevision?.previousBaseSalary || 0;
    const [previousBaseSalary, setPreviousBaseSalary] = useState<number>(baseSalaryInitial);
    const [incrementPercentage, setIncrementPercentage] = useState<number>(
        review?.compensationRevision?.incrementPercentage || 10
    );
    const [incrementAmount, setIncrementAmount] = useState<number>(
        review?.compensationRevision?.incrementAmount ||
            Math.round(baseSalaryInitial * (10 / 100))
    );
    const [newBaseSalary, setNewBaseSalary] = useState<number>(
        review?.compensationRevision?.newBaseSalary ||
            baseSalaryInitial + Math.round(baseSalaryInitial * (10 / 100))
    );
    const [performanceBonus, setPerformanceBonus] = useState<number>(
        review?.compensationRevision?.performanceBonus || 0
    );
    const [effectiveFromDate, setEffectiveFromDate] = useState<string>(
        review?.compensationRevision?.effectiveFromDate
            ? new Date(review.compensationRevision.effectiveFromDate).toISOString().slice(0, 10)
            : `${review?.cycleYear || new Date().getFullYear()}-01-01`
    );

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (review) {
            setSelfRating(review.selfAssessment?.rating || '');
            setDefenseNotes(review.selfAssessment?.defenseNotes || '');
            setFinalRating(review.hrAssessment?.finalRating || review.selfAssessment?.rating || 'MEETS_EXPECTATION');
            setFeedbackNotes(review.hrAssessment?.feedbackNotes || '');
            const prev = review.compensationRevision?.previousBaseSalary || 0;
            const pct = review.compensationRevision?.incrementPercentage ?? 10;
            const inc = review.compensationRevision?.incrementAmount ?? Math.round(prev * (pct / 100));
            setPreviousBaseSalary(prev);
            setIncrementPercentage(pct);
            setIncrementAmount(inc);
            setNewBaseSalary(review.compensationRevision?.newBaseSalary ?? (prev + inc));
            setPerformanceBonus(review.compensationRevision?.performanceBonus || 0);
            if (review.compensationRevision?.effectiveFromDate) {
                setEffectiveFromDate(new Date(review.compensationRevision.effectiveFromDate).toISOString().slice(0, 10));
            }
        }
    }, [review]);

    // Live calculate when percentage changes
    const handlePercentageChange = (pct: number) => {
        setIncrementPercentage(pct);
        const calculatedInc = Math.round(previousBaseSalary * (pct / 100));
        setIncrementAmount(calculatedInc);
        setNewBaseSalary(previousBaseSalary + calculatedInc);
    };

    // Live calculate when increment amount changes
    const handleIncrementAmountChange = (amt: number) => {
        setIncrementAmount(amt);
        setNewBaseSalary(previousBaseSalary + amt);
        if (previousBaseSalary > 0) {
            setIncrementPercentage(Number(((amt / previousBaseSalary) * 100).toFixed(1)));
        }
    };

    // Live calculate when new salary changes
    const handleNewSalaryChange = (newSal: number) => {
        setNewBaseSalary(newSal);
        const inc = Math.max(0, newSal - previousBaseSalary);
        setIncrementAmount(inc);
        if (previousBaseSalary > 0) {
            setIncrementPercentage(Number(((inc / previousBaseSalary) * 100).toFixed(1)));
        }
    };

    // Check if effective date is retroactive
    const isRetroactive = (() => {
        if (!effectiveFromDate) return false;
        const eff = new Date(effectiveFromDate);
        const now = new Date();
        const curMonthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
        return eff < curMonthStart;
    })();

    // Handle Employee Self-Assessment Submit
    const handleEmployeeSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!review) return;
        if (!selfRating) {
            setError('Please select your self-rating.');
            return;
        }
        if (!defenseNotes.trim()) {
            setError('Please enter your self-assessment and defense remarks.');
            return;
        }

        setIsSubmitting(true);
        setError(null);
        try {
            const token = localStorage.getItem('token');
            await axios.put(
                api.performanceSelfAssess(review._id),
                { rating: selfRating, defenseNotes: defenseNotes.trim() },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            onSaved();
            onClose();
        } catch (err) {
            const msg = axios.isAxiosError(err) ? err.response?.data?.message : (err instanceof Error ? err.message : 'Failed to submit self-assessment');
            setError(msg || 'Failed to submit self-assessment');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Handle HR Finalization Submit
    const handleHrFinalize = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!review) return;
        if (!finalRating) {
            setError('Please select the final rating.');
            return;
        }
        if (!effectiveFromDate) {
            setError('Please select the effective date for salary revision.');
            return;
        }

        setIsSubmitting(true);
        setError(null);
        try {
            const token = localStorage.getItem('token');
            await axios.put(
                api.performanceFinalize(review._id),
                {
                    finalRating,
                    feedbackNotes: feedbackNotes.trim(),
                    incrementPercentage: Number(incrementPercentage) || 0,
                    incrementAmount: Number(incrementAmount) || 0,
                    newBaseSalary: Number(newBaseSalary) || previousBaseSalary,
                    performanceBonus: Number(performanceBonus) || 0,
                    effectiveFromDate,
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            onSaved();
            onClose();
        } catch (err) {
            const msg = axios.isAxiosError(err) ? err.response?.data?.message : (err instanceof Error ? err.message : 'Failed to finalize appraisal');
            setError(msg || 'Failed to finalize appraisal');
        } finally {
            setIsSubmitting(false);
        }
    };

    const ratingOptions: RatingScale[] = [
        'OUTSTANDING',
        'EXCEEDS_EXPECTATION',
        'MEETS_EXPECTATION',
        'NEEDS_IMPROVEMENT',
    ];

    if (!isOpen || !review) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-4xl max-h-[92vh] overflow-y-auto my-auto">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                            <Star size={20} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-base font-bold text-slate-800">{review.cycleTitle}</h2>
                                <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${STATUS_CONFIG[review.status]?.style}`}>
                                    {STATUS_CONFIG[review.status]?.label}
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                                {review.employeeName} ({review.employeeId}) • {review.designation || 'Staff'} • {review.department || 'General'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
                    >
                        <X size={18} />
                    </button>
                </div>

                {error && (
                    <div className="mx-6 mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2.5">
                        <AlertCircle size={16} className="shrink-0 text-rose-600" />
                        <span>{error}</span>
                    </div>
                )}

                <div className="p-6 space-y-6">
                    {/* SCENARIO 1: Employee Self-Review View */}
                    {isEmployeeSelfReview ? (
                        <form onSubmit={handleEmployeeSubmit} className="space-y-6">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2.5">
                                    Step 1: Select Your Self-Rating
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {ratingOptions.map((key) => {
                                        const cfg = RATING_CONFIG[key];
                                        const isSelected = selfRating === key;
                                        return (
                                            <button
                                                type="button"
                                                key={key}
                                                onClick={() => setSelfRating(key)}
                                                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                                                    isSelected
                                                        ? `${cfg.bg} ${cfg.border} ring-2 ring-indigo-500/30 shadow-sm`
                                                        : 'bg-slate-50/70 border-slate-200 hover:border-slate-300 hover:bg-slate-100/70'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className={`text-sm font-bold ${cfg.iconColor}`}>{cfg.label}</span>
                                                    {isSelected && <CheckCircle2 size={16} className={cfg.iconColor} />}
                                                </div>
                                                <p className="text-xs text-slate-500">{cfg.description}</p>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2 flex items-center justify-between">
                                    <span>Step 2: Self-Assessment Remarks & Defense Notes</span>
                                    <span className="text-[11px] text-slate-400 font-normal">Mention key achievements, projects delivered & impact</span>
                                </label>
                                <textarea
                                    value={defenseNotes}
                                    onChange={(e) => setDefenseNotes(e.target.value)}
                                    rows={6}
                                    placeholder="Write your defense notes here... Mention key projects delivered, problems solved, skills acquired, and goals met during this review period."
                                    className="w-full bg-white border border-slate-200 rounded-xl p-3.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-95 text-white shadow-md active:scale-95 flex items-center gap-2 disabled:opacity-50 transition-all cursor-pointer"
                                >
                                    {isSubmitting ? (
                                        <Loader2 size={15} className="animate-spin" />
                                    ) : (
                                        <ArrowRight size={15} />
                                    )}
                                    Submit Self-Assessment for 1-on-1 Review
                                </button>
                            </div>
                        </form>
                    ) : isHrOrAdmin && !isClosed ? (
                        /* SCENARIO 2: HR 1-on-1 Review & Salary Revision Mode */
                        <form onSubmit={handleHrFinalize} className="space-y-6">
                            {/* Two Column Layout: Left = Employee Defense, Right = HR Assessment & Final Rating */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                {/* LEFT: Employee Defense Notes (Reference) */}
                                <div className="space-y-3.5 bg-slate-50/70 border border-slate-200/80 rounded-2xl p-5">
                                    <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
                                        <div className="flex items-center gap-2">
                                            <User size={16} className="text-indigo-600" />
                                            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                                                Employee Self-Assessment
                                            </h3>
                                        </div>
                                        {review.selfAssessment?.submittedAt && (
                                            <span className="text-[11px] text-slate-400 font-medium">
                                                Submitted {new Date(review.selfAssessment.submittedAt).toLocaleDateString()}
                                            </span>
                                        )}
                                    </div>

                                    <div>
                                        <span className="text-[11px] text-slate-500 font-semibold block mb-1">Self-Claimed Rating</span>
                                        {review.selfAssessment?.rating ? (
                                            <span
                                                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border ${
                                                    RATING_CONFIG[review.selfAssessment.rating]?.badge
                                                }`}
                                            >
                                                <Star size={12} />
                                                {RATING_CONFIG[review.selfAssessment.rating]?.label}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-amber-600 font-medium italic">No self-rating submitted yet</span>
                                        )}
                                    </div>

                                    <div>
                                        <span className="text-[11px] text-slate-500 font-semibold block mb-1">Defense Remarks & Notes</span>
                                        <div className="bg-white border border-slate-200 rounded-xl p-3.5 text-xs text-slate-700 whitespace-pre-wrap min-h-[140px] max-h-[220px] overflow-y-auto leading-relaxed shadow-sm">
                                            {review.selfAssessment?.defenseNotes || (
                                                <span className="italic text-slate-400">
                                                    Employee has not submitted defense remarks.
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* RIGHT: HR Evaluation & Final Rating */}
                                <div className="space-y-3.5 bg-slate-50/70 border border-slate-200/80 rounded-2xl p-5">
                                    <div className="flex items-center gap-2 pb-3 border-b border-slate-200/80">
                                        <Award size={16} className="text-emerald-600" />
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                                            HR Evaluation & Final Rating
                                        </h3>
                                    </div>

                                    <div>
                                        <label className="text-[11px] text-slate-600 block mb-2 font-semibold">
                                            Select Final Rating (Decided in 1-on-1)
                                        </label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {ratingOptions.map((key) => {
                                                const cfg = RATING_CONFIG[key];
                                                const isSelected = finalRating === key;
                                                return (
                                                    <button
                                                        type="button"
                                                        key={key}
                                                        onClick={() => setFinalRating(key)}
                                                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                                                            isSelected
                                                                ? `${cfg.bg} ${cfg.border} ring-2 ring-emerald-500/30 shadow-sm`
                                                                : 'bg-white border-slate-200 hover:border-slate-300'
                                                        }`}
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <span className={`text-xs font-bold ${cfg.iconColor}`}>{cfg.label}</span>
                                                            {isSelected && <CheckCircle2 size={14} className={cfg.iconColor} />}
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[11px] text-slate-600 block mb-1 font-semibold">
                                            HR Feedback & Management Evaluation Notes
                                        </label>
                                        <textarea
                                            value={feedbackNotes}
                                            onChange={(e) => setFeedbackNotes(e.target.value)}
                                            rows={4}
                                            placeholder="Enter management evaluation notes, areas of strength, and developmental goals discussed during the 1-on-1 review..."
                                            className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors shadow-sm"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* SECTION: Compensation Revision & Salary Decision */}
                            <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-5 space-y-4 shadow-sm">
                                <div className="flex items-center justify-between pb-3 border-b border-indigo-100">
                                    <div className="flex items-center gap-2">
                                        <DollarSign size={18} className="text-emerald-600" />
                                        <h3 className="text-sm font-bold text-indigo-950">
                                            Annual Salary Review & Compensation Decision
                                        </h3>
                                    </div>
                                    <span className="text-xs text-indigo-700 bg-white px-3 py-1 rounded-lg border border-indigo-200 font-semibold shadow-xs">
                                        Current Base: PKR {previousBaseSalary.toLocaleString()}
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {/* Increment % */}
                                    <div className="space-y-1">
                                        <label className="text-xs text-slate-600 font-semibold">Increment (%)</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                min={0}
                                                max={100}
                                                step={0.5}
                                                value={incrementPercentage}
                                                onChange={(e) => handlePercentageChange(Number(e.target.value))}
                                                className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
                                            />
                                            <span className="absolute right-3.5 top-2.5 text-xs text-slate-400 font-bold">%</span>
                                        </div>
                                    </div>

                                    {/* Increment Amount (auto-calculated) */}
                                    <div className="space-y-1">
                                        <label className="text-xs text-slate-600 font-semibold">Increment Amount (PKR)</label>
                                        <input
                                            type="number"
                                            min={0}
                                            value={incrementAmount}
                                            onChange={(e) => handleIncrementAmountChange(Number(e.target.value))}
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-bold text-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-xs"
                                        />
                                    </div>

                                    {/* New Base Salary (auto-calculated) */}
                                    <div className="space-y-1">
                                        <label className="text-xs text-slate-600 font-semibold">New Base Salary (PKR)</label>
                                        <input
                                            type="number"
                                            min={0}
                                            value={newBaseSalary}
                                            onChange={(e) => handleNewSalaryChange(Number(e.target.value))}
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-extrabold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
                                        />
                                    </div>

                                    {/* Performance Bonus */}
                                    <div className="space-y-1">
                                        <label className="text-xs text-slate-600 font-semibold">One-Time Bonus (PKR)</label>
                                        <input
                                            type="number"
                                            min={0}
                                            value={performanceBonus}
                                            onChange={(e) => setPerformanceBonus(Number(e.target.value))}
                                            placeholder="0"
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-bold text-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 shadow-xs"
                                        />
                                    </div>
                                </div>

                                {/* Effective Date & Arrears Notice */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                                    <div className="space-y-1">
                                        <label className="text-xs text-slate-600 font-semibold flex items-center gap-1.5">
                                            <Calendar size={13} className="text-indigo-600" />
                                            Effective From Date
                                        </label>
                                        <input
                                            type="date"
                                            value={effectiveFromDate}
                                            onChange={(e) => setEffectiveFromDate(e.target.value)}
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
                                        />
                                    </div>

                                    <div className="flex items-center">
                                        {isRetroactive ? (
                                            <div className="p-3 bg-indigo-100/70 border border-indigo-200 text-indigo-900 rounded-xl text-xs flex items-center gap-2">
                                                <Sparkles size={16} className="shrink-0 text-indigo-600" />
                                                <span>
                                                    <strong>Retroactive Revision:</strong> Arrears back to {effectiveFromDate} will be automatically computed & disbursed by Payroll Engine.
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="p-3 bg-white border border-slate-200 rounded-xl text-slate-600 text-xs">
                                                Salary increment will apply from {effectiveFromDate || 'selected date'}.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                                <span className="text-xs text-slate-400">
                                    Finalizing updates the employee master record & pushes to salary history.
                                </span>
                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-95 text-white shadow-md active:scale-95 flex items-center gap-2 disabled:opacity-50 transition-all cursor-pointer"
                                    >
                                        {isSubmitting ? (
                                            <Loader2 size={16} className="animate-spin" />
                                        ) : (
                                            <CheckCircle2 size={16} />
                                        )}
                                        Finalize & Close Review
                                    </button>
                                </div>
                            </div>
                        </form>
                    ) : (
                        /* SCENARIO 3: Closed / Read-Only View */
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                {/* Employee Defense Summary */}
                                <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-5 space-y-3">
                                    <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                                        <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                                            Employee Self-Assessment
                                        </span>
                                        {review.selfAssessment?.rating && (
                                            <span
                                                className={`text-xs px-2.5 py-0.5 rounded-lg border font-semibold ${
                                                    RATING_CONFIG[review.selfAssessment.rating]?.badge
                                                }`}
                                            >
                                                {RATING_CONFIG[review.selfAssessment.rating]?.label}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                                        {review.selfAssessment?.defenseNotes || 'No notes recorded.'}
                                    </p>
                                </div>

                                {/* HR Final Assessment Summary */}
                                <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-5 space-y-3">
                                    <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                                        <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                                            HR Final Assessment
                                        </span>
                                        {review.hrAssessment?.finalRating && (
                                            <span
                                                className={`text-xs px-2.5 py-0.5 rounded-lg border font-semibold ${
                                                    RATING_CONFIG[review.hrAssessment.finalRating]?.badge
                                                }`}
                                            >
                                                {RATING_CONFIG[review.hrAssessment.finalRating]?.label}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                                        {review.hrAssessment?.feedbackNotes || 'No notes recorded.'}
                                    </p>
                                    {review.reviewerName && (
                                        <span className="text-[11px] text-slate-400 block pt-1">
                                            Reviewed by: {review.reviewerName} on{' '}
                                            {review.hrAssessment?.reviewedAt
                                                ? new Date(review.hrAssessment.reviewedAt).toLocaleDateString()
                                                : 'N/A'}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Compensation Outcome (shown if closed and available) */}
                            {review.compensationRevision && (
                                <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-5 space-y-3">
                                    <div className="flex items-center justify-between pb-2 border-b border-emerald-200/80">
                                        <div className="flex items-center gap-2">
                                            <CheckCircle2 size={16} className="text-emerald-600" />
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-950">
                                                Approved Compensation Revision
                                            </h4>
                                        </div>
                                        <span className="text-xs text-emerald-700 font-bold bg-white px-2.5 py-0.5 rounded-full border border-emerald-200">
                                            +{review.compensationRevision.incrementPercentage}% Increment
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                                        <div>
                                            <span className="text-slate-500 block">Previous Salary</span>
                                            <span className="font-semibold text-slate-800">
                                                PKR {review.compensationRevision.previousBaseSalary.toLocaleString()}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-slate-500 block">Increment Amount</span>
                                            <span className="font-semibold text-emerald-600">
                                                +PKR {review.compensationRevision.incrementAmount.toLocaleString()}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-slate-500 block">New Base Salary</span>
                                            <span className="font-extrabold text-slate-900">
                                                PKR {review.compensationRevision.newBaseSalary.toLocaleString()}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-slate-500 block">Effective From</span>
                                            <span className="font-semibold text-slate-800">
                                                {new Date(review.compensationRevision.effectiveFromDate).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>

                                    {review.compensationRevision.performanceBonus > 0 && (
                                        <div className="pt-2 border-t border-emerald-200/80 flex items-center justify-between text-xs">
                                            <span className="text-amber-800 font-medium">One-Time Performance Bonus</span>
                                            <span className="font-bold text-amber-700">
                                                PKR {review.compensationRevision.performanceBonus.toLocaleString()}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex justify-end pt-2">
                                <button
                                    onClick={onClose}
                                    className="px-5 py-2 rounded-xl text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};
