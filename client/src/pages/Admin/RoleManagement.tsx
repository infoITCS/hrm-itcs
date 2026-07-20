import { useState, useEffect } from 'react';
import { Shield, Save, RefreshCw, AlertCircle, Check, RotateCcw } from 'lucide-react';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import APIService from '../../services/api';

interface RolePermissionData {
    role: string;
    permissions: {
        dashboard: boolean;
        pim: boolean;
        leave: boolean;
        attendance: boolean;
        claim: boolean;
        payroll: boolean;
        requests: boolean;
        settings: boolean;
        [key: string]: boolean;
    };
}

const RoleManagement = () => {
    const { login, user } = useAuth();
    const [matrix, setMatrix] = useState<RolePermissionData[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const modules = [
        { key: 'dashboard', name: 'Dashboard' },
        { key: 'pim', name: 'PIM (Profile/Onboarding)' },
        { key: 'leave', name: 'Leave Management' },
        { key: 'attendance', name: 'Attendance & ADMS' },
        { key: 'claim', name: 'Expense Claims' },
        { key: 'payroll', name: 'Payroll & PF Reports' },
        { key: 'requests', name: 'Custom Requests / Loans' },
        { key: 'settings', name: 'System Settings' }
    ];

    const fetchPermissions = async () => {
        setLoading(true);
        setMessage(null);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.config}/roles-permissions`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to fetch role permissions');
            const data = await res.json();
            setMatrix(data);
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Error loading permissions matrix.' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPermissions();
    }, []);

    const handleCheckboxChange = (role: string, moduleKey: string, checked: boolean) => {
        setMatrix(prev => prev.map(item => {
            if (item.role === role) {
                return {
                    ...item,
                    permissions: {
                        ...item.permissions,
                        [moduleKey]: checked
                    }
                };
            }
            return item;
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.config}/roles-permissions`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ matrix })
            });

            if (!res.ok) throw new Error('Failed to save permissions');

            // Refresh caller's own permissions immediately so sidebar updates without re-login
            try {
                const userData = await APIService.getMe();
                if (user) login({ ...user, permissions: userData.permissions || {} });
            } catch (_) { /* best-effort */ }

            setMessage({ type: 'success', text: 'Permissions saved! Sidebar updated instantly for your role. Other users will see changes on their next page load.' });
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Error saving configurations.' });
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async () => {
        if (!window.confirm('Reset ALL role permissions to system defaults? This cannot be undone.')) return;
        setSaving(true);
        setMessage(null);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.config}/roles-permissions/reset`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Reset failed');
            await fetchPermissions(); // reload the table
            const userData = await APIService.getMe();
            if (user) login({ ...user, permissions: userData.permissions || {} });
            setMessage({ type: 'success', text: 'Permissions reset to system defaults. Sidebar updated.' });
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Error resetting permissions.' });
        } finally {
            setSaving(false);
        }
    };

    const getRoleDisplayName = (role: string) => {
        switch (role) {
            case 'super-admin': return 'Super Admin';
            case 'admin': return 'Admin';
            case 'hr': return 'HR Manager';
            case 'finance': return 'Finance Manager';
            case 'manager': return 'Line Manager';
            case 'employee': return 'Standard Employee';
            default: return role.toUpperCase();
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-slate-200/60 shadow-sm">
                <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="mt-4 text-sm font-medium text-slate-500">Loading Permissions Matrix...</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-3xl overflow-hidden border border-slate-200/60 shadow-xl shadow-slate-100/50 p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Shield className="text-indigo-600" size={22} /> Roles & Permissions Manager
                    </h3>
                    <p className="text-slate-500 text-sm mt-1">Configure module access credentials for each employee role dynamically.</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={fetchPermissions}
                        className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 rounded-xl transition-all"
                        title="Reload"
                    >
                        <RefreshCw size={18} />
                    </button>
                    <button
                        onClick={handleReset}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2.5 border border-rose-200 text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl transition-all font-semibold text-sm disabled:opacity-50"
                        title="Reset all permissions to system defaults"
                    >
                        <RotateCcw size={16} />
                        Reset Defaults
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all font-bold shadow-md shadow-indigo-100 disabled:opacity-50"
                    >
                        <Save size={18} />
                        {saving ? 'Saving...' : 'Save Permissions'}
                    </button>
                </div>
            </div>

            {message && (
                <div className={`p-4 rounded-xl border flex items-start gap-3 text-sm font-medium ${
                    message.type === 'success' 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                        : 'bg-rose-50 text-rose-700 border-rose-100'
                }`}>
                    {message.type === 'success' ? <Check size={18} className="shrink-0 mt-0.5" /> : <AlertCircle size={18} className="shrink-0 mt-0.5" />}
                    <span>{message.text}</span>
                </div>
            )}

            <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                <table className="w-full text-left border-collapse min-w-[800px]">
                    <thead>
                        <tr className="bg-slate-50/80 border-b border-slate-100">
                            <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-slate-400">System Role</th>
                            {modules.map(mod => (
                                <th key={mod.key} className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">
                                    {mod.name}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {matrix.map((row) => {
                            const isSuper = row.role === 'super-admin';
                            return (
                                <tr key={row.role} className="hover:bg-slate-50/30 transition-colors">
                                    <td className="px-6 py-5 font-bold text-slate-700">
                                        <div className="flex flex-col">
                                            <span>{getRoleDisplayName(row.role)}</span>
                                            <span className="text-[10px] text-slate-400 font-mono font-medium">{row.role}</span>
                                        </div>
                                    </td>
                                    {modules.map(mod => {
                                        const isChecked = !!row.permissions[mod.key];
                                        return (
                                            <td key={mod.key} className="px-4 py-5 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={isSuper || isChecked}
                                                    disabled={isSuper}
                                                    onChange={(e) => handleCheckboxChange(row.role, mod.key, e.target.checked)}
                                                    className="w-4.5 h-4.5 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 focus:ring-offset-0 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                                                />
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default RoleManagement;
