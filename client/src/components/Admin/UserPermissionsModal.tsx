import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
    Shield, 
    X, 
    RotateCcw, 
    Save, 
    Loader2, 
    Info, 
    CheckCircle2, 
    AlertCircle,
    ChevronDown,
    ChevronUp,
    Layers,
    Sliders
} from 'lucide-react';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import APIService from '../../services/api';

export interface SubTabItem {
    key: string;
    fullKey: string;
    name: string;
    description?: string;
    defaultAllowed: boolean;
    effectiveAllowed: boolean;
    isCustom: boolean;
    customValue: boolean | null;
}

export interface ModulePermissionItem {
    key: string;
    name: string;
    roleAllowed: boolean;
    defaultScope: 'none' | 'employee' | 'manager' | 'admin';
    effectiveAllowed: boolean;
    effectiveScope: 'none' | 'employee' | 'manager' | 'admin';
    isCustomPerm: boolean;
    isCustomScope: boolean;
    customPermValue: boolean | null;
    customScopeValue: 'none' | 'employee' | 'manager' | 'admin' | null;
    subTabs?: SubTabItem[];
}

interface UserPermissionsModalProps {
    isOpen: boolean;
    userId: string;
    userEmail: string;
    userName: string;
    userRole: string;
    onClose: () => void;
    onSaved?: () => void;
}

export default function UserPermissionsModal({
    isOpen,
    userId,
    userEmail,
    userName,
    userRole,
    onClose,
    onSaved
}: UserPermissionsModalProps) {
    const { login, user: currentUser } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [modules, setModules] = useState<ModulePermissionItem[]>([]);
    const [customPermissions, setCustomPermissions] = useState<Record<string, boolean>>({});
    const [customScopes, setCustomScopes] = useState<Record<string, 'none' | 'employee' | 'manager' | 'admin'>>({});
    const [customSubPermissions, setCustomSubPermissions] = useState<Record<string, boolean>>({});
    const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        if (isOpen && userId) {
            fetchUserPermissions();
        }
    }, [isOpen, userId]);

    const fetchUserPermissions = async () => {
        setLoading(true);
        setMessage(null);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(api.userPermissions(userId), {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to load user permissions');
            const data = await res.json();
            setModules(data.modules || []);
            setCustomPermissions(data.customPermissions || {});
            setCustomScopes(data.customScopes || {});
            setCustomSubPermissions(data.customSubPermissions || {});
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Error loading permissions' });
        } finally {
            setLoading(false);
        }
    };

    const toggleModuleExpand = (moduleKey: string) => {
        setExpandedModules(prev => ({
            ...prev,
            [moduleKey]: !prev[moduleKey]
        }));
    };

    const handleAccessModeChange = (moduleKey: string, mode: 'inherit' | 'allow' | 'deny') => {
        setCustomPermissions(prev => {
            const updated = { ...prev };
            if (mode === 'inherit') {
                delete updated[moduleKey];
            } else {
                updated[moduleKey] = mode === 'allow';
            }
            return updated;
        });
    };

    const handleScopeChange = (moduleKey: string, scope: 'inherit' | 'employee' | 'manager' | 'admin') => {
        setCustomScopes(prev => {
            const updated = { ...prev };
            if (scope === 'inherit') {
                delete updated[moduleKey];
            } else {
                updated[moduleKey] = scope;
            }
            return updated;
        });
    };

    const handleSubTabChange = (fullKey: string, mode: 'inherit' | 'allow' | 'deny') => {
        setCustomSubPermissions(prev => {
            const updated = { ...prev };
            if (mode === 'inherit') {
                delete updated[fullKey];
            } else {
                updated[fullKey] = mode === 'allow';
            }
            return updated;
        });
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(api.userPermissions(userId), {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    customPermissions,
                    customScopes,
                    customSubPermissions
                })
            });
            if (!res.ok) throw new Error('Failed to save user permissions');
            
            // If the updated user is the currently logged in user, refresh context
            if (currentUser && (currentUser.id === userId || currentUser._id === userId)) {
                try {
                    const freshData = await APIService.getMe();
                    login(freshData);
                } catch (_) { /* best-effort */ }
            }

            setMessage({ type: 'success', text: 'Custom permissions, power scopes, and sub-tabs saved successfully!' });
            setTimeout(() => {
                onSaved?.();
                onClose();
            }, 1200);
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Failed to save permissions' });
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async () => {
        if (!confirm(`Are you sure you want to reset all permissions, power scopes, and sub-tabs for ${userName || userEmail} to standard '${userRole}' defaults?`)) {
            return;
        }

        setResetting(true);
        setMessage(null);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.userPermissions(userId)}/reset`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to reset permissions');

            setCustomPermissions({});
            setCustomScopes({});
            setCustomSubPermissions({});
            await fetchUserPermissions();

            if (currentUser && (currentUser.id === userId || currentUser._id === userId)) {
                try {
                    const freshData = await APIService.getMe();
                    login(freshData);
                } catch (_) { /* best-effort */ }
            }

            setMessage({ type: 'success', text: `Permissions reset to '${userRole}' baseline defaults.` });
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Failed to reset permissions' });
        } finally {
            setResetting(false);
        }
    };

    if (!isOpen) return null;

    const totalModuleOverrides = Object.keys(customPermissions).length;
    const totalScopeOverrides = Object.keys(customScopes).length;
    const totalSubTabOverrides = Object.keys(customSubPermissions).length;
    const totalActiveOverrides = totalModuleOverrides + totalScopeOverrides + totalSubTabOverrides;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 via-white to-purple-50/40">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-purple-600 text-white rounded-2xl shadow-md shadow-purple-500/20">
                            <Shield size={22} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-lg font-bold text-slate-800">
                                    Granular Permissions & Sub-Tab Control
                                </h3>
                                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700 uppercase tracking-wider">
                                    {userRole}
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Configure module access, power scopes, and per-tab visibility for <span className="font-semibold text-slate-700">{userName || userEmail}</span>
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleReset}
                            disabled={resetting || loading || totalActiveOverrides === 0}
                            className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                            title="Reset user permissions to role defaults"
                        >
                            {resetting ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                            <span>Reset to Role Baseline</span>
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Banner notice / feedback */}
                {message && (
                    <div className={`px-6 py-3 border-b text-xs font-semibold flex items-center gap-2 ${
                        message.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'
                    }`}>
                        {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                        <span>{message.text}</span>
                    </div>
                )}

                {/* Body Content */}
                <div className="p-6 overflow-y-auto flex-1 space-y-4 custom-scrollbar bg-slate-50/40">
                    {loading ? (
                        <div className="py-20 text-center space-y-3">
                            <Loader2 size={32} className="animate-spin text-purple-600 mx-auto" />
                            <p className="text-xs font-semibold text-slate-400">Loading user permissions, power scopes, & sub-tabs...</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {modules.map(mod => {
                                const isCustomPermSet = typeof customPermissions[mod.key] === 'boolean';
                                const currentPermVal = isCustomPermSet ? customPermissions[mod.key] : mod.roleAllowed;
                                const isCustomScopeSet = !!customScopes[mod.key];
                                const isExpanded = !!expandedModules[mod.key];

                                const subTabs = mod.subTabs || [];
                                const activeSubTabOverridesCount = subTabs.filter(s => typeof customSubPermissions[s.fullKey] === 'boolean').length;

                                return (
                                    <div
                                        key={mod.key}
                                        className={`rounded-2xl border transition-all overflow-hidden ${
                                            !currentPermVal 
                                                ? 'bg-slate-50/60 border-slate-200/60 opacity-90'
                                                : isCustomPermSet || isCustomScopeSet || activeSubTabOverridesCount > 0
                                                    ? 'bg-purple-50/30 border-purple-200 shadow-sm'
                                                    : 'bg-white border-slate-200/80 hover:border-slate-300 shadow-sm'
                                        }`}
                                    >
                                        {/* Main Module Row */}
                                        <div className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                            {/* Module Title & Status badges */}
                                            <div className="space-y-1 min-w-[220px]">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="text-sm font-bold text-slate-800">{mod.name}</h4>
                                                    {isCustomPermSet || isCustomScopeSet || activeSubTabOverridesCount > 0 ? (
                                                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
                                                            Custom Override
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-500">
                                                            Inherited ({userRole})
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                                                    <span>Key: <code className="font-mono text-slate-600 bg-slate-100 px-1 py-0.5 rounded">{mod.key}</code></span>
                                                    {subTabs.length > 0 && (
                                                        <span className="text-slate-300">&bull;</span>
                                                    )}
                                                    {subTabs.length > 0 && (
                                                        <span className="font-medium text-slate-500">{subTabs.length} sub-tabs</span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Controls Group */}
                                            <div className="flex flex-wrap items-center gap-3">
                                                {/* Access Control (Allow / Deny / Inherit) */}
                                                <div className="space-y-1">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Access Permission</span>
                                                    <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-semibold">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleAccessModeChange(mod.key, 'inherit')}
                                                            className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                                                                !isCustomPermSet
                                                                    ? 'bg-white text-slate-800 shadow-sm font-bold'
                                                                    : 'text-slate-500 hover:text-slate-800'
                                                            }`}
                                                        >
                                                            Inherit ({mod.roleAllowed ? 'ON' : 'OFF'})
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleAccessModeChange(mod.key, 'allow')}
                                                            className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                                                                isCustomPermSet && customPermissions[mod.key] === true
                                                                    ? 'bg-emerald-600 text-white shadow-sm font-bold'
                                                                    : 'text-emerald-700 hover:bg-emerald-100/50'
                                                            }`}
                                                        >
                                                            Allowed
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleAccessModeChange(mod.key, 'deny')}
                                                            className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                                                                isCustomPermSet && customPermissions[mod.key] === false
                                                                    ? 'bg-rose-600 text-white shadow-sm font-bold'
                                                                    : 'text-rose-700 hover:bg-rose-100/50'
                                                            }`}
                                                        >
                                                            Denied
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Power / View Scope Control */}
                                                <div className="space-y-1">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Operational Scope</span>
                                                    <select
                                                        disabled={!currentPermVal}
                                                        value={isCustomScopeSet ? customScopes[mod.key] : 'inherit'}
                                                        onChange={(e) => handleScopeChange(mod.key, e.target.value as any)}
                                                        className={`text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all outline-none ${
                                                            !currentPermVal 
                                                                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                                                : isCustomScopeSet
                                                                    ? 'bg-purple-50 text-purple-900 border-purple-300 focus:ring-2 focus:ring-purple-200'
                                                                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 focus:ring-2 focus:ring-indigo-100'
                                                        }`}
                                                    >
                                                        <option value="inherit">Inherit Role ({mod.defaultScope.toUpperCase()})</option>
                                                        <option value="employee">Employee Scope (Self View Only)</option>
                                                        <option value="manager">Manager Scope (Team Approvals & Reports)</option>
                                                        <option value="admin">Admin Scope (Full Organization Access)</option>
                                                    </select>
                                                </div>

                                                {/* Expand Sub-Tabs Accordion Trigger */}
                                                {subTabs.length > 0 && (
                                                    <div className="space-y-1">
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Sub-Tabs</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleModuleExpand(mod.key)}
                                                            className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                                                isExpanded 
                                                                    ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                                                                    : activeSubTabOverridesCount > 0
                                                                        ? 'bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-200'
                                                                        : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                                                            }`}
                                                        >
                                                            <Sliders size={13} />
                                                            <span>Tabs ({subTabs.length})</span>
                                                            {activeSubTabOverridesCount > 0 && (
                                                                <span className="bg-purple-700 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                                                                    {activeSubTabOverridesCount}
                                                                </span>
                                                            )}
                                                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Sub-Tabs Accordion Panel */}
                                        {isExpanded && subTabs.length > 0 && (
                                            <div className="border-t border-slate-200/80 bg-slate-50/70 p-4 space-y-2.5 animate-in fade-in duration-150">
                                                <div className="flex items-center justify-between pb-1 border-b border-slate-200/50">
                                                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                                                        <Layers size={14} className="text-purple-600" />
                                                        <span>Sub-Tabs & Feature Permissions for {mod.name}</span>
                                                    </div>
                                                    <span className="text-[11px] text-slate-400">
                                                        Set exact visibility per tab or leave on role inheritance
                                                    </span>
                                                </div>

                                                {!currentPermVal && (
                                                    <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs flex items-center gap-2">
                                                        <Info size={15} className="shrink-0 text-amber-600" />
                                                        <span><strong>Note:</strong> Since the entire <strong>{mod.name}</strong> module is currently disabled for this user, all sub-tabs below are automatically hidden from their view.</span>
                                                    </div>
                                                )}

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
                                                    {subTabs.map(sub => {
                                                        const isCustomSubSet = typeof customSubPermissions[sub.fullKey] === 'boolean';
                                                        const currentSubVal = isCustomSubSet ? customSubPermissions[sub.fullKey] : sub.defaultAllowed;

                                                        return (
                                                            <div
                                                                key={sub.key}
                                                                className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                                                                    !currentPermVal
                                                                        ? 'bg-slate-100/70 border-slate-200 text-slate-400 opacity-60'
                                                                        : isCustomSubSet
                                                                            ? currentSubVal
                                                                                ? 'bg-white border-emerald-300 shadow-sm'
                                                                                : 'bg-rose-50/50 border-rose-200 shadow-sm'
                                                                            : 'bg-white border-slate-200 shadow-sm'
                                                                }`}
                                                            >
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <p className="text-xs font-bold text-slate-800 truncate">{sub.name}</p>
                                                                        {isCustomSubSet && (
                                                                            <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                                                                currentSubVal ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                                                            }`}>
                                                                                {currentSubVal ? 'Explicitly Allowed' : 'Explicitly Hidden'}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                                                                        {sub.fullKey} &bull; Role Default: <span className="font-semibold text-slate-600">{sub.defaultAllowed ? 'Allowed' : 'Hidden'}</span>
                                                                    </p>
                                                                </div>

                                                                {/* 3-State Sub-Tab Switch */}
                                                                <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200 text-[11px] font-semibold shrink-0">
                                                                    <button
                                                                        type="button"
                                                                        disabled={!currentPermVal}
                                                                        onClick={() => handleSubTabChange(sub.fullKey, 'inherit')}
                                                                        className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                                                                            !isCustomSubSet
                                                                                ? 'bg-white text-slate-800 shadow-xs font-bold'
                                                                                : 'text-slate-500 hover:text-slate-800'
                                                                        }`}
                                                                    >
                                                                        Inherit ({sub.defaultAllowed ? 'ON' : 'OFF'})
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        disabled={!currentPermVal}
                                                                        onClick={() => handleSubTabChange(sub.fullKey, 'allow')}
                                                                        className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                                                                            isCustomSubSet && customSubPermissions[sub.fullKey] === true
                                                                                ? 'bg-emerald-600 text-white shadow-xs font-bold'
                                                                                : 'text-emerald-700 hover:bg-emerald-100/50'
                                                                        }`}
                                                                    >
                                                                        Allow
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        disabled={!currentPermVal}
                                                                        onClick={() => handleSubTabChange(sub.fullKey, 'deny')}
                                                                        className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                                                                            isCustomSubSet && customSubPermissions[sub.fullKey] === false
                                                                                ? 'bg-rose-600 text-white shadow-xs font-bold'
                                                                                : 'text-rose-700 hover:bg-rose-100/50'
                                                                        }`}
                                                                    >
                                                                        Hide
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                    <div className="text-xs text-slate-500">
                        {totalActiveOverrides > 0 ? (
                            <span className="font-semibold text-purple-700">
                                &bull; {totalActiveOverrides} custom override(s) active ({totalModuleOverrides} module, {totalScopeOverrides} scope, {totalSubTabOverrides} sub-tab)
                            </span>
                        ) : (
                            <span className="text-slate-400">Standard role baseline active (0 custom overrides)</span>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-all cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving || loading}
                            className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-60 cursor-pointer"
                        >
                            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            <span>Save User Permissions</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
