import { useState, useEffect } from 'react';
import { UserCog, Search, User, X, Briefcase, Plus, ShieldAlert, Key } from 'lucide-react';
import api from '../../utils/api';
import { usePermissions } from '../../hooks/usePermissions';
import AlertModal from '../../components/UI/AlertModal';

interface UserData {
    _id: string;
    email: string;
    role: string;
    firstName?: string;
    lastName?: string;
    isActive: boolean;
    microsoftId?: string;
    employeeInfo?: {
        employeeId: string;
        firstName: string;
        lastName: string;
        designation?: string;
        department?: string;
        status?: string;
    };
    createdAt: string;
}

const UserManagement = () => {
    const { role: currentUserRole } = usePermissions();
    const [users, setUsers] = useState<UserData[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterRole, setFilterRole] = useState('all');
    const [error, setError] = useState<string | null>(null);

    // Modal state
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteData, setInviteData] = useState({ email: '', firstName: '', lastName: '', role: 'employee' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Password Reset Modal state
    const [showResetModal, setShowResetModal] = useState(false);
    const [resettingUser, setResettingUser] = useState<UserData | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [isResetting, setIsResetting] = useState(false);


    const [alertConfig, setAlertConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type: 'info' | 'success' | 'warning' | 'error' | 'confirm';
        onConfirm?: () => void;
    }>({
        isOpen: false,
        title: '',
        message: '',
        type: 'info'
    });

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.baseURL}/api/admin/users`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to fetch users');
            const data = await res.json();
            setUsers(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRoleChange = async (userId: string, newRole: string) => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.baseURL}/api/admin/users/${userId}/role`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ role: newRole })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message || 'Failed to update role');
            }

            setUsers(users.map(u => u._id === userId ? { ...u, role: newRole } : u));
        } catch (err: any) {
            alert(err.message);
        }
    };

    const handleStatusToggle = async (userId: string, currentStatus: boolean) => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.baseURL}/api/admin/users/${userId}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ isActive: !currentStatus })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message || 'Failed to update status');
            }

            setUsers(users.map(u => u._id === userId ? { ...u, isActive: !currentStatus } : u));
        } catch (err: any) {
            setAlertConfig({
                isOpen: true,
                title: 'Error',
                message: err.message,
                type: 'error'
            });
        }
    };


    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.baseURL}/api/admin/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(inviteData)
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message || 'Failed to create user');
            }

            await fetchUsers();
            setShowInviteModal(false);
            setInviteData({ email: '', firstName: '', lastName: '', role: 'employee' });
        } catch (err: any) {
            setAlertConfig({
                isOpen: true,
                title: 'Creation Failed',
                message: err.message,
                type: 'error'
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePasswordReset = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!resettingUser) return;
        
        setIsResetting(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${api.baseURL}/api/admin/users/${resettingUser._id}/password`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ newPassword })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message || 'Failed to reset password');
            }

            setAlertConfig({
                isOpen: true,
                title: 'Success',
                message: `Password for ${resettingUser.email} has been reset successfully.`,
                type: 'success'
            });
            setShowResetModal(false);
            setNewPassword('');
            setResettingUser(null);
        } catch (err: any) {
            setAlertConfig({
                isOpen: true,
                title: 'Reset Failed',
                message: err.message,
                type: 'error'
            });
        } finally {
            setIsResetting(false);
        }
    };

    const getRoleBadgeColor = (role: string) => {
        switch (role) {
            case 'super-admin': return 'bg-purple-100 text-purple-700 border-purple-200';
            case 'admin': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
            case 'manager': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            default: return 'bg-slate-100 text-slate-700 border-slate-200';
        }
    };

    const filteredUsers = users.filter(user => {
        const matchesSearch = 
            (user.firstName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
            (user.lastName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
            user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (user.employeeInfo?.employeeId || '').toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesRole = filterRole === 'all' || user.role === filterRole;

        return matchesSearch && matchesRole;
    });

    return (
        <div className="space-y-6 animate-slide-up pb-12 pt-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <UserCog className="text-indigo-600" /> User & Role Management
                    </h2>
                    <p className="text-gray-500 mt-1">Control access, assign roles, and manage authentication across the system.</p>
                </div>
                
                <button 
                    onClick={() => setShowInviteModal(true)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all font-bold shadow-sm hover:shadow-indigo-200 hover:shadow-lg active:scale-95"
                >
                    <Plus size={18} /> Add New User
                </button>
            </div>

            {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 flex items-center gap-3">
                    <ShieldAlert size={20} />
                    <span className="font-medium">{error}</span>
                </div>
            )}

            <div className="bg-white rounded-3xl shadow-xl shadow-indigo-100/20 border border-gray-100 overflow-hidden">
                <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row gap-4 justify-between items-center">
                    <div className="relative w-full sm:w-96">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                            type="text" 
                            placeholder="Search by name, email, or employee ID..."
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <span className="text-sm font-bold text-slate-500 uppercase tracking-widest hidden sm:block w-full text-right sm:w-auto">Filter by Role:</span>
                        <select 
                            className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 outline-none w-full sm:w-auto focus:ring-4 focus:ring-indigo-500/10"
                            value={filterRole}
                            onChange={(e) => setFilterRole(e.target.value)}
                        >
                            <option value="all">All Roles</option>
                            <option value="super-admin">Super Admin</option>
                            <option value="admin">Admin</option>
                            <option value="manager">Manager</option>
                            <option value="employee">Employee</option>
                        </select>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/80">
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">User Details</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Linked Employee</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">System Role</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-center">Status</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Access & Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                Array(5).fill(0).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan={5} className="px-6 py-8"><div className="h-4 bg-slate-100 rounded w-full"></div></td>
                                    </tr>
                                ))
                            ) : filteredUsers.length > 0 ? (
                                filteredUsers.map((user) => (
                                    <tr key={user._id} className="hover:bg-indigo-50/20 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold border border-indigo-100">
                                                    {user.firstName ? `${user.firstName[0]}${user.lastName ? user.lastName[0] : ''}` : <User size={18} />}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-slate-800">
                                                        {user.firstName || user.employeeInfo?.firstName} {user.lastName || user.employeeInfo?.lastName}
                                                        {!user.firstName && !user.employeeInfo && <span className="text-slate-400 italic">No Name Set</span>}
                                                    </p>
                                                    <p className="text-xs text-slate-500 font-medium break-all">{user.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {user.employeeInfo ? (
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                                                        <Briefcase size={12} className="text-slate-400" />
                                                        {user.employeeInfo.designation || 'No Designation'}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded w-fit mt-1 border border-indigo-100">
                                                        {user.employeeInfo.employeeId}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-md border border-amber-200 flex items-center gap-1 w-fit">
                                                    <ShieldAlert size={12} /> Not Linked
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <select
                                                value={user.role}
                                                onChange={(e) => handleRoleChange(user._id, e.target.value)}
                                                disabled={user.role === 'super-admin' && currentUserRole !== 'super-admin'}
                                                className={`text-xs font-bold px-3 py-1.5 rounded-lg border outline-none cursor-pointer transition-all ${getRoleBadgeColor(user.role)} ${user.role === 'super-admin' && currentUserRole !== 'super-admin' ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-sm'}`}
                                            >
                                                <option value="super-admin" disabled={currentUserRole !== 'super-admin'}>Super Admin</option>
                                                <option value="admin">Admin</option>
                                                <option value="manager">Manager</option>
                                                <option value="employee">Employee</option>
                                            </select>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <button
                                                onClick={() => handleStatusToggle(user._id, user.isActive)}
                                                disabled={user.role === 'super-admin' && currentUserRole !== 'super-admin'}
                                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none transition-all ${user.role === 'super-admin' && currentUserRole !== 'super-admin' ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            >
                                                <div className={`absolute inset-0 rounded-full transition-colors duration-300 ${user.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                                <span
                                                    className={`absolute h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-300 ${user.isActive ? 'translate-x-1.5' : '-translate-x-1.5'}`}
                                                />
                                            </button>
                                            <p className={`text-[9px] font-black uppercase mt-1 tracking-wider ${user.isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                {user.isActive ? 'Active' : 'Suspended'}
                                            </p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-2">
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-2 py-1 text-[10px] font-bold rounded border ${user.microsoftId ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                                                        SSO
                                                    </span>
                                                    <span className="px-2 py-1 text-[10px] font-bold rounded border bg-slate-50 text-slate-700 border-slate-200">
                                                        Email
                                                    </span>
                                                </div>
                                                {currentUserRole === 'super-admin' && (
                                                    <button
                                                        onClick={() => {
                                                            setResettingUser(user);
                                                            setShowResetModal(true);
                                                        }}
                                                        className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100 transition-colors w-fit shadow-sm"
                                                        title="Reset Password"
                                                    >
                                                        <Key size={10} /> Reset Password
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="p-4 bg-slate-50 rounded-full">
                                                <UserCog size={32} className="text-slate-300" />
                                            </div>
                                            <p className="font-medium">No users found matching your criteria.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Create User Modal */}
            {showInviteModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-start sm:items-center justify-center p-4 animate-in fade-in overflow-y-auto">
                    <div className="bg-white rounded-3xl w-full max-w-md my-8 shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
                        <div className="p-6 border-b border-slate-100 bg-slate-50 relative">
                            <h3 className="text-xl font-bold text-slate-800">Add New User</h3>
                            <p className="text-sm text-slate-500 mt-1">Create a user credential so they can log in.</p>
                            <button 
                                onClick={() => setShowInviteModal(false)}
                                className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-full transition-all"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        
                        <form onSubmit={handleCreateUser} className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">First Name</label>
                                    <input 
                                        type="text" 
                                        required
                                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all"
                                        value={inviteData.firstName}
                                        onChange={e => setInviteData({...inviteData, firstName: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Last Name</label>
                                    <input 
                                        type="text" 
                                        required
                                        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all"
                                        value={inviteData.lastName}
                                        onChange={e => setInviteData({...inviteData, lastName: e.target.value})}
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Email Address</label>
                                <input 
                                    type="email" 
                                    required
                                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all"
                                    value={inviteData.email}
                                    onChange={e => setInviteData({...inviteData, email: e.target.value})}
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">System Role</label>
                                <select 
                                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all"
                                    value={inviteData.role}
                                    onChange={e => setInviteData({...inviteData, role: e.target.value})}
                                >
                                    <option value="super-admin" disabled={currentUserRole !== 'super-admin'}>Super Admin</option>
                                    <option value="admin">Admin</option>
                                    <option value="manager">Manager</option>
                                    <option value="employee">Employee</option>
                                </select>
                            </div>

                            <div className="pt-4 flex items-center justify-end gap-3">
                                <button 
                                    type="button" 
                                    onClick={() => setShowInviteModal(false)}
                                    className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    disabled={isSubmitting}
                                    className="px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-sm transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Creating...
                                        </>
                                    ) : 'Create User'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Reset Password Modal */}
            {showResetModal && resettingUser && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
                        <div className="p-6 border-b border-slate-100 bg-amber-50 relative">
                            <h3 className="text-xl font-bold text-amber-800 flex items-center gap-2">
                                <Key size={20} /> Reset User Password
                            </h3>
                            <p className="text-sm text-amber-600 mt-1">Setting a new password for <strong>{resettingUser.email}</strong></p>
                            <button 
                                onClick={() => {
                                    setShowResetModal(false);
                                    setNewPassword('');
                                }}
                                className="absolute top-6 right-6 p-2 text-amber-400 hover:text-amber-600 hover:bg-white rounded-full transition-all"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        
                        <form onSubmit={handlePasswordReset} className="p-6 space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">New Password</label>
                                <input 
                                    type="text" 
                                    required
                                    minLength={6}
                                    placeholder="Enter new strong password"
                                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-amber-100 focus:border-amber-400 outline-none transition-all"
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    autoFocus
                                />
                                <p className="text-[10px] text-slate-400 mt-1">Minimum 6 characters. The user will NOT be notified automatically.</p>
                            </div>

                            <div className="pt-4 flex items-center justify-end gap-3">
                                <button 
                                    type="button" 
                                    onClick={() => {
                                        setShowResetModal(false);
                                        setNewPassword('');
                                    }}
                                    className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    disabled={isResetting || !newPassword}
                                    className="px-6 py-2.5 text-sm font-bold text-white bg-amber-600 rounded-xl hover:bg-amber-700 shadow-sm transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isResetting ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Resetting...
                                        </>
                                    ) : 'Confirm Reset'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}


            {/* Modal components... */}
            <AlertModal 
                isOpen={alertConfig.isOpen}
                onClose={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                onConfirm={alertConfig.onConfirm}
                showCancel={alertConfig.type === 'confirm'}
            />
        </div>
    );
};

export default UserManagement;
