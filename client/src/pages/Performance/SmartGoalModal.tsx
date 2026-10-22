import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    X,
    Target,
    Sparkles,
    AlertCircle,
    Calendar,
    Loader2,
    Info,
    Settings
} from 'lucide-react';
import axios from 'axios';
import api from '../../utils/api';
import type { ISmartGoal, ICompanyTarget, GoalMetricType, ReviewCycleType } from './types';

interface SmartGoalModalProps {
    isOpen: boolean;
    onClose: () => void;
    goal: ISmartGoal | null; // null for new, populated for edit/resubmit
    companyTargets: ICompanyTarget[];
    currentYear: number;
    onSaved: () => void;
    isHrOrAdmin?: boolean;
    onOpenManageTargets?: () => void;
}

export const SmartGoalModal: React.FC<SmartGoalModalProps> = ({
    isOpen,
    onClose,
    goal,
    companyTargets,
    currentYear,
    onSaved,
    isHrOrAdmin,
    onOpenManageTargets,
}) => {
    const isEditOrResubmit = Boolean(goal);

    // Form fields
    const [title, setTitle] = useState(goal?.title || '');
    const [description, setDescription] = useState(goal?.description || '');
    const [cycleType, setCycleType] = useState<ReviewCycleType>(goal?.cycleType || 'ANNUAL');
    const [metricType, setMetricType] = useState<GoalMetricType>(goal?.metricType || 'PERCENTAGE');
    const [unit, setUnit] = useState(goal?.unit || '%');
    const [baselineValue, setBaselineValue] = useState<number>(goal?.baselineValue || 0);
    const [targetValue, setTargetValue] = useState<number>(goal?.targetValue || 10);
    const [companyTargetId, setCompanyTargetId] = useState(goal?.companyTargetId || (companyTargets[0]?._id || ''));
    const [targetDate, setTargetDate] = useState(
        goal?.targetDate
            ? new Date(goal.targetDate).toISOString().slice(0, 10)
            : `${currentYear}-12-31`
    );
    const [resubmissionNote, setResubmissionNote] = useState('');

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [aiResult, setAiResult] = useState<ISmartGoal['aiReview'] | null>(goal?.aiReview || null);

    // Synchronize form when modal opens or goal changes
    useEffect(() => {
        if (isOpen) {
            setTitle(goal?.title || '');
            setDescription(goal?.description || '');
            setCycleType(goal?.cycleType || 'ANNUAL');
            setMetricType(goal?.metricType || 'PERCENTAGE');
            setUnit(goal?.unit || '%');
            setBaselineValue(goal?.baselineValue || 0);
            setTargetValue(goal?.targetValue || 10);
            setCompanyTargetId(goal?.companyTargetId || (companyTargets[0]?._id || ''));
            setTargetDate(
                goal?.targetDate
                    ? new Date(goal.targetDate).toISOString().slice(0, 10)
                    : `${currentYear}-12-31`
            );
            setResubmissionNote('');
            setError(null);
            setAiResult(goal?.aiReview || null);
        }
    }, [isOpen, goal, currentYear, companyTargets]);

    useEffect(() => {
        if (metricType === 'PERCENTAGE') setUnit('%');
        else if (metricType === 'CURRENCY') setUnit('PKR');
        else if (metricType === 'NUMBER') setUnit('Units');
        else if (metricType === 'MILESTONE') setUnit('Milestones');
    }, [metricType]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsSubmitting(true);

        try {
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };

            const payload = {
                title: title.trim(),
                description: description.trim(),
                cycleYear: currentYear,
                cycleType,
                metricType,
                unit: unit.trim() || '%',
                baselineValue: Number(baselineValue) || 0,
                targetValue: Number(targetValue),
                companyTargetId: companyTargetId || undefined,
                targetDate,
                resubmissionNote: resubmissionNote.trim() || undefined,
            };

            let res;
            if (goal?._id) {
                res = await axios.put(api.performanceGoal(goal._id), payload, { headers });
            } else {
                res = await axios.post(api.performanceGoals, payload, { headers });
            }

            const savedGoal = res.data.goal;
            if (savedGoal?.aiReview) {
                setAiResult(savedGoal.aiReview);
            }

            onSaved();
            // Close after short delay if compliant
            if (savedGoal?.aiReview?.status === 'PASS') {
                setTimeout(() => onClose(), 800);
            }
        } catch (err) {
            const msg = axios.isAxiosError(err) ? err.response?.data?.message : (err instanceof Error ? err.message : 'Failed to submit goal');
            setError(msg || 'Failed to submit goal');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-2xl max-h-[92vh] overflow-y-auto my-auto p-6 space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                            <Target size={20} />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-800">
                                {isEditOrResubmit ? 'Revise & Resubmit SMART Goal' : 'Define New SMART Goal'}
                            </h2>
                            <p className="text-xs text-slate-500">
                                Specific, Measurable, Attainable, Realistic & Time-bound with AI validation
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                        <X size={18} />
                    </button>
                </div>

                {error && (
                    <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                        <AlertCircle size={16} className="shrink-0 text-rose-600" />
                        <span>{error}</span>
                    </div>
                )}

                {/* HR Returned Comments Notice (If previously returned) */}
                {goal?.hrReview?.status === 'RETURNED_FOR_REVISION' && goal?.hrReview?.comments && (
                    <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                        <div className="font-bold flex items-center gap-1.5 text-amber-800">
                            <Info size={14} />
                            HR Revision Feedback (Please adjust targets below):
                        </div>
                        <p className="text-amber-900/90 italic">"{goal.hrReview.comments}"</p>
                    </div>
                )}

                {/* AI Review Banner (if evaluated) */}
                {aiResult && (
                    <div
                        className={`p-4 rounded-xl border text-xs space-y-2 ${
                            aiResult.status === 'PASS'
                                ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                                : aiResult.isUnrealistic
                                ? 'bg-rose-50 border-rose-200 text-rose-900'
                                : 'bg-purple-50 border-purple-200 text-purple-900'
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <span className="font-bold flex items-center gap-1.5">
                                <Sparkles size={14} />
                                Gemini AI Pre-Review Audit (Score: {aiResult.complianceScore}/100)
                            </span>
                            <span
                                className={`px-2 py-0.5 rounded-full font-bold text-[10px] uppercase tracking-wide border ${
                                    aiResult.feasibility === 'REALISTIC'
                                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                        : 'bg-rose-100 text-rose-800 border-rose-300'
                                }`}
                            >
                                {aiResult.feasibility}
                            </span>
                        </div>
                        <p className="leading-relaxed">{aiResult.feedback}</p>
                        {aiResult.suggestedAdjustments && (
                            <p className="text-[11px] opacity-80 pt-1 border-t border-current/15">
                                <strong>AI Recommendation:</strong> {aiResult.suggestedAdjustments}
                            </p>
                        )}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* S: Specific - Title */}
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                            <span>1. Specific Goal Title (What will you achieve?)</span>
                            <span className="text-[10px] text-slate-400">Concrete task</span>
                        </label>
                        <input
                            type="text"
                            placeholder="e.g. Increase corporate client pipeline conversions by 15%"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
                            required
                        />
                    </div>

                    {/* S: Specific - Description */}
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-700">Detailed Action Plan & Deliverables</label>
                        <textarea
                            rows={3}
                            placeholder="Detail the steps, methodologies, and technical/business activities you will execute to hit this goal..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
                            required
                        />
                    </div>

                    {/* M: Measurable - Metric Type, Baseline & Target */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
                        <span className="text-xs font-bold text-slate-800 block">
                            2. Measurable Targets (Quantifiable Criteria)
                        </span>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="space-y-1">
                                <label className="text-[11px] text-slate-600 font-medium">Metric Format</label>
                                <select
                                    value={metricType}
                                    onChange={(e) => setMetricType(e.target.value as GoalMetricType)}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none cursor-pointer"
                                >
                                    <option value="PERCENTAGE">Percentage (%)</option>
                                    <option value="CURRENCY">Currency (PKR)</option>
                                    <option value="NUMBER">Numeric Count</option>
                                    <option value="MILESTONE">Milestones (1 to N)</option>
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[11px] text-slate-600 font-medium">Baseline (Start)</label>
                                <input
                                    type="number"
                                    value={baselineValue}
                                    onChange={(e) => setBaselineValue(Number(e.target.value))}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none"
                                    required
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[11px] text-slate-600 font-medium">Target Value</label>
                                <input
                                    type="number"
                                    value={targetValue}
                                    onChange={(e) => setTargetValue(Number(e.target.value))}
                                    className="w-full bg-white border border-indigo-200 rounded-xl px-2.5 py-1.5 text-xs text-indigo-900 font-bold focus:outline-none"
                                    required
                                />
                            </div>
                        </div>

                        <p className="text-[10px] text-slate-400">
                            Baseline: {baselineValue} {unit} $\rightarrow$ Target: {targetValue} {unit} (AI will audit if increase is statistically realistic).
                        </p>
                    </div>

                    {/* A & R: Attainable & Realistic - Aligned with Company Target */}
                    <div className="space-y-1">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                                <span>3. Aligned Company Target (Corporate Objective)</span>
                                <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded-md">Strategic Anchor</span>
                            </label>
                            {isHrOrAdmin && onOpenManageTargets && (
                                <button
                                    type="button"
                                    onClick={onOpenManageTargets}
                                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 underline cursor-pointer"
                                    title="Add, edit, or configure corporate targets"
                                >
                                    <Settings size={12} />
                                    Edit / Manage Corporate Targets
                                </button>
                            )}
                        </div>
                        <select
                            value={companyTargetId}
                            onChange={(e) => setCompanyTargetId(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                            required
                        >
                            <option value="">Select a Company Target...</option>
                            {companyTargets.map((ct) => (
                                <option key={ct._id} value={ct._id}>
                                    [{ct.category}] {ct.title}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* T: Time-bound - Target Due Date & Cycle */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                                <Calendar size={13} className="text-indigo-600" />
                                4. Target Completion Date
                            </label>
                            <input
                                type="date"
                                value={targetDate}
                                onChange={(e) => setTargetDate(e.target.value)}
                                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                required
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-slate-700">Evaluation Cycle</label>
                            <select
                                value={cycleType}
                                onChange={(e) => setCycleType(e.target.value as ReviewCycleType)}
                                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                            >
                                <option value="ANNUAL">Annual Review Cycle (Full Year)</option>
                                <option value="MID_YEAR">Mid-Year Review (H1 Jan–Jun)</option>
                                <option value="Q1">Q1 Review Cycle</option>
                                <option value="Q3">Nine-Month Review Cycle (Q3)</option>
                            </select>
                        </div>
                    </div>

                    {/* Resubmission Notes (if editing) */}
                    {isEditOrResubmit && (
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-slate-700">Resubmission / Adjustment Note</label>
                            <input
                                type="text"
                                placeholder="Explain changes made in response to HR or AI recommendations..."
                                value={resubmissionNote}
                                onChange={(e) => setResubmissionNote(e.target.value)}
                                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none"
                            />
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                        <span className="text-[11px] text-slate-400">
                            Submissions trigger automated Gemini AI pre-review & start HR 10-day SLA window.
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-95 text-white shadow-md active:scale-95 flex items-center gap-2 disabled:opacity-50 transition-all cursor-pointer"
                            >
                                {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                                {isEditOrResubmit ? 'Resubmit with AI Check' : 'Submit SMART Goal'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};

export default SmartGoalModal;
