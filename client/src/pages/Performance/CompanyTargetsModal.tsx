import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
    X,
    Target,
    Plus,
    Edit2,
    Trash2,
    Check,
    AlertCircle,
    Loader2,
    Sparkles
} from 'lucide-react';
import axios from 'axios';
import api from '../../utils/api';
import AlertModal from '../../components/UI/AlertModal';
import type { ICompanyTarget } from './types';

interface CompanyTargetsModalProps {
    isOpen: boolean;
    onClose: () => void;
    targets: ICompanyTarget[];
    selectedYear: number;
    onTargetsUpdated: () => void;
}

const CATEGORY_COLORS: Record<string, { badge: string; icon: string }> = {
    SALES: { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: 'text-emerald-600' },
    ENGINEERING: { badge: 'bg-blue-50 text-blue-700 border-blue-200', icon: 'text-blue-600' },
    OPERATIONS: { badge: 'bg-purple-50 text-purple-700 border-purple-200', icon: 'text-purple-600' },
    CUSTOMER_SUCCESS: { badge: 'bg-teal-50 text-teal-700 border-teal-200', icon: 'text-teal-600' },
    FINANCE: { badge: 'bg-amber-50 text-amber-700 border-amber-200', icon: 'text-amber-600' },
    GENERAL: { badge: 'bg-slate-50 text-slate-700 border-slate-200', icon: 'text-slate-600' },
};

export const CompanyTargetsModal: React.FC<CompanyTargetsModalProps> = ({
    isOpen,
    onClose,
    targets,
    selectedYear,
    onTargetsUpdated,
}) => {
    const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
    const [isCreatingNew, setIsCreatingNew] = useState(false);

    // Form inputs
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState<'SALES' | 'ENGINEERING' | 'OPERATIONS' | 'CUSTOMER_SUCCESS' | 'FINANCE' | 'GENERAL'>('GENERAL');
    const [targetMetric, setTargetMetric] = useState('');
    const [targetValue, setTargetValue] = useState('');
    const [year, setYear] = useState<number>(selectedYear);

    const [isSaving, setIsSaving] = useState(false);
    const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Alert Modal State
    const [alertConfig, setAlertConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string | React.ReactNode;
        type?: 'info' | 'success' | 'warning' | 'error' | 'confirm';
        onConfirm?: () => void;
        confirmText?: string;
        cancelText?: string;
        showCancel?: boolean;
    }>({
        isOpen: false,
        title: '',
        message: '',
        type: 'info',
    });

    const resetForm = () => {
        setTitle('');
        setDescription('');
        setCategory('GENERAL');
        setTargetMetric('');
        setTargetValue('');
        setYear(selectedYear);
        setEditingTargetId(null);
        setIsCreatingNew(false);
        setError(null);
    };

    const handleStartEdit = (target: ICompanyTarget) => {
        setEditingTargetId(target._id);
        setIsCreatingNew(false);
        setTitle(target.title || '');
        setDescription(target.description || '');
        setCategory(target.category || 'GENERAL');
        setTargetMetric(target.targetMetric || '');
        setTargetValue(target.targetValue || '');
        setYear(target.year || selectedYear);
        setError(null);
    };

    const handleStartCreate = () => {
        resetForm();
        setIsCreatingNew(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) {
            setError('Please enter a target title.');
            return;
        }

        setIsSaving(true);
        setError(null);
        try {
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };

            if (editingTargetId) {
                // Update
                await axios.put(
                    api.performanceCompanyTarget(editingTargetId),
                    {
                        title: title.trim(),
                        description: description.trim(),
                        category,
                        targetMetric: targetMetric.trim(),
                        targetValue: targetValue.trim(),
                        year: Number(year) || selectedYear,
                    },
                    { headers }
                );
            } else {
                // Create
                await axios.post(
                    api.performanceCompanyTargets,
                    {
                        title: title.trim(),
                        description: description.trim(),
                        category,
                        targetMetric: targetMetric.trim(),
                        targetValue: targetValue.trim(),
                        year: Number(year) || selectedYear,
                    },
                    { headers }
                );
            }

            resetForm();
            onTargetsUpdated();
            setAlertConfig({
                isOpen: true,
                title: editingTargetId ? 'Target Updated' : 'Target Created',
                message: `Corporate target "${title.trim()}" has been saved successfully.`,
                type: 'success',
                showCancel: false,
                confirmText: 'OK',
            });
        } catch (err) {
            const msg = axios.isAxiosError(err) ? err.response?.data?.message : 'Failed to save company target.';
            setError(msg || 'Failed to save company target.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = (id: string, targetTitle: string) => {
        setAlertConfig({
            isOpen: true,
            title: 'Delete Corporate Target?',
            message: `Are you sure you want to delete "${targetTitle}"? It will no longer appear in employee SMART goal selection dropdowns.`,
            type: 'error',
            showCancel: true,
            confirmText: 'Yes, Delete',
            cancelText: 'Cancel',
            onConfirm: async () => {
                setIsDeletingId(id);
                setError(null);
                try {
                    const token = localStorage.getItem('token');
                    await axios.delete(api.performanceCompanyTarget(id), {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (editingTargetId === id) resetForm();
                    onTargetsUpdated();
                    setAlertConfig({
                        isOpen: true,
                        title: 'Target Deleted',
                        message: 'The corporate target has been removed successfully.',
                        type: 'success',
                        showCancel: false,
                        confirmText: 'OK',
                    });
                } catch (err) {
                    const msg = axios.isAxiosError(err) ? err.response?.data?.message : 'Failed to delete company target.';
                    setAlertConfig({
                        isOpen: true,
                        title: 'Delete Failed',
                        message: msg || 'Failed to delete company target.',
                        type: 'error',
                        showCancel: false,
                        confirmText: 'OK',
                    });
                } finally {
                    setIsDeletingId(null);
                }
            },
        });
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-50/50 to-white">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-200">
                            <Target size={20} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-bold text-slate-800">Company Strategic Targets</h2>
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
                                    {selectedYear} Anchors
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Set corporate targets that employees align their SMART goals against
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body Content */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1">
                    {error && (
                        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-2xl text-xs flex items-center gap-2">
                            <AlertCircle size={16} className="shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Add / Edit Form */}
                    {(isCreatingNew || editingTargetId) ? (
                        <form onSubmit={handleSave} className="bg-slate-50 border border-slate-200 rounded-2xl p-4.5 space-y-3.5 animate-in fade-in duration-150">
                            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                    <Sparkles size={14} className="text-indigo-600" />
                                    {editingTargetId ? 'Edit Corporate Target' : 'Create New Corporate Target'}
                                </span>
                                <button
                                    type="button"
                                    onClick={resetForm}
                                    className="text-xs font-medium text-slate-500 hover:text-slate-700 cursor-pointer"
                                >
                                    Cancel
                                </button>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[11px] font-semibold text-slate-700">Target Title *</label>
                                <input
                                    type="text"
                                    placeholder="e.g. PKR 2 Billion Total Sales & Revenue Target"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[11px] font-semibold text-slate-700">Category</label>
                                    <select
                                        value={category}
                                        onChange={(e) => setCategory(e.target.value as ICompanyTarget['category'])}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none cursor-pointer"
                                    >
                                        <option value="SALES">Sales</option>
                                        <option value="ENGINEERING">Engineering</option>
                                        <option value="OPERATIONS">Operations</option>
                                        <option value="CUSTOMER_SUCCESS">Customer Success</option>
                                        <option value="FINANCE">Finance</option>
                                        <option value="GENERAL">General</option>
                                    </select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[11px] font-semibold text-slate-700">Target Metric</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Revenue / SLA"
                                        value={targetMetric}
                                        onChange={(e) => setTargetMetric(e.target.value)}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[11px] font-semibold text-slate-700">Target Benchmark Value</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. PKR 2,000,000,000"
                                        value={targetValue}
                                        onChange={(e) => setTargetValue(e.target.value)}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[11px] font-semibold text-slate-700">Description / Context</label>
                                <textarea
                                    rows={2}
                                    placeholder="Brief background or strategic goal definition..."
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={resetForm}
                                    className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="px-4 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                                >
                                    {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                                    {editingTargetId ? 'Save Changes' : 'Create Corporate Target'}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                                Active Corporate Targets ({targets.length})
                            </span>
                            <button
                                onClick={handleStartCreate}
                                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                            >
                                <Plus size={14} />
                                Add Corporate Target
                            </button>
                        </div>
                    )}

                    {/* Targets List */}
                    <div className="space-y-3">
                        {targets.length === 0 ? (
                            <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                <Target size={28} className="mx-auto text-slate-300 mb-2" />
                                <p className="text-xs font-medium text-slate-500">No corporate targets defined for {selectedYear} yet.</p>
                                <button
                                    onClick={handleStartCreate}
                                    className="mt-2 text-xs font-bold text-indigo-600 hover:underline"
                                >
                                    + Add the first target
                                </button>
                            </div>
                        ) : (
                            targets.map((t) => {
                                const catStyle = CATEGORY_COLORS[t.category] || CATEGORY_COLORS.GENERAL;
                                const isThisEditing = editingTargetId === t._id;
                                const isThisDeleting = isDeletingId === t._id;

                                return (
                                    <div
                                        key={t._id}
                                        className={`bg-white border rounded-2xl p-4 transition-all hover:border-slate-300 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                            isThisEditing ? 'border-indigo-400 bg-indigo-50/20' : 'border-slate-200'
                                        }`}
                                    >
                                        <div className="space-y-1 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${catStyle.badge}`}>
                                                    {t.category}
                                                </span>
                                                <h4 className="text-xs font-bold text-slate-800">{t.title}</h4>
                                            </div>

                                            {t.description && (
                                                <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                                                    {t.description}
                                                </p>
                                            )}

                                            {(t.targetValue || t.targetMetric) && (
                                                <div className="text-[11px] text-slate-600 flex items-center gap-2">
                                                    {t.targetMetric && (
                                                        <span className="font-semibold text-slate-500">
                                                            Metric: {t.targetMetric}
                                                        </span>
                                                    )}
                                                    {t.targetValue && (
                                                        <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                                                            Benchmark: {t.targetValue}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-1.5 self-end sm:self-center">
                                            <button
                                                onClick={() => handleStartEdit(t)}
                                                className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-indigo-600 transition-colors cursor-pointer"
                                                title="Edit target"
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(t._id, t.title)}
                                                disabled={isThisDeleting}
                                                className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer disabled:opacity-50"
                                                title="Delete target"
                                            >
                                                {isThisDeleting ? (
                                                    <Loader2 size={14} className="animate-spin text-rose-500" />
                                                ) : (
                                                    <Trash2 size={14} />
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs text-slate-500">
                    <span>Changes take effect immediately across all goal selection dropdowns.</span>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                        Done
                    </button>
                </div>
            </div>

            <AlertModal
                isOpen={alertConfig.isOpen}
                onClose={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                confirmText={alertConfig.confirmText}
                cancelText={alertConfig.cancelText}
                showCancel={alertConfig.showCancel}
                onConfirm={alertConfig.onConfirm}
            />
        </div>,
        document.body
    );
};
