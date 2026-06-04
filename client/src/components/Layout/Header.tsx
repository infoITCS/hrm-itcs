import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, User as UserIcon, Menu, KeyRound, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import APIService from '../../services/api';
import Avatar from '../UI/Avatar';

const Header = ({ title, onMenuClick }: {
    title: string;
    onMenuClick?: () => void;
}) => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [pwdForm, setPwdForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    const [pwdStatus, setPwdStatus] = useState({ loading: false, error: '', success: '' });
    const userMenuRef = useRef<HTMLDivElement>(null);

    // Close profile menu when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
                setShowUserMenu(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setPwdStatus({ loading: false, error: '', success: '' });
        
        if (pwdForm.newPassword !== pwdForm.confirmPassword) {
            return setPwdStatus(p => ({ ...p, error: 'New passwords do not match' }));
        }
        if (pwdForm.newPassword.length < 6) {
            return setPwdStatus(p => ({ ...p, error: 'Password must be at least 6 characters' }));
        }

        setPwdStatus(p => ({ ...p, loading: true }));
        try {
            await APIService.changePassword(pwdForm.currentPassword, pwdForm.newPassword);
            setPwdStatus({ loading: false, error: '', success: 'Password updated successfully!' });
            setTimeout(() => {
                setShowPasswordModal(false);
                setPwdForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                setPwdStatus({ loading: false, error: '', success: '' });
            }, 2000);
        } catch (err: any) {
            setPwdStatus({ loading: false, error: err.response?.data?.message || 'Failed to change password', success: '' });
        }
    };

    return (
        <header className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white h-14 min-[992px]:h-16 flex items-center justify-between px-4 min-[992px]:px-6 shadow-md fixed top-0 left-0 right-0 min-[992px]:left-64 z-20 transition-all duration-300 gap-2">

            {/* Hamburger: visible below 992px */}
            {onMenuClick && (
                <button
                    type="button"
                    onClick={onMenuClick}
                    className="p-2 rounded-lg hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white/50 min-[992px]:hidden shrink-0"
                    aria-label="Open menu"
                >
                    <Menu size={24} />
                </button>
            )}

            {/* Left Side: Title */}
            <div className="flex-1 flex items-center min-w-0">
                <h1 className="text-lg min-[992px]:text-xl font-semibold tracking-tight animate-in fade-in slide-in-from-left-2 truncate">
                    {title}
                </h1>
            </div>

            {/* Right Side: Icons & Profile */}
            <div className="flex items-center gap-1 sm:gap-2 min-[992px]:gap-4 ml-2 min-[992px]:ml-4 shrink-0">


                {/* Vertical Divider */}
                {user && <div className="h-8 w-px bg-white/20 mx-1"></div>}

                {/* User Profile with Dropdown */}
                {user ? (
                    <div className="relative" ref={userMenuRef}>
                        <button
                            onClick={() => setShowUserMenu(!showUserMenu)}
                            className="flex items-center gap-3 cursor-pointer p-1 rounded-lg hover:bg-white/10 transition-all group"
                        >
                            {/* Avatar */}
                            <Avatar
                                src={user.avatar}
                                firstName={user.firstName}
                                lastName={user.lastName}
                                name={user.name}
                                email={user.email}
                                className="ring-2 ring-transparent group-hover:ring-white/20 transition-all bg-white/20 backdrop-blur-sm border border-white/30"
                                initialsClassName="bg-indigo-500/30"
                            />
                            <div className="hidden md:flex flex-col">
                                <span className="text-sm font-semibold leading-none mb-1 text-left">
                                    {[user.firstName, user.lastName].filter(Boolean).join(' ') || user.name}
                                </span>
                                <span className="text-xs text-white/70 font-medium leading-none capitalize text-left">{user.role}</span>
                            </div>
                            <ChevronDown
                                size={16}
                                className={`text-white/70 group-hover:text-white transition-transform ${showUserMenu ? 'rotate-180' : ''}`}
                            />
                        </button>

                        {/* User Dropdown Menu */}
                        {showUserMenu && (
                            <div className="absolute right-0 mt-3 w-56 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-2xl overflow-hidden z-50 text-gray-800 animate-in fade-in slide-in-from-top-2 border border-blue-100/50 ring-1 ring-black/5">
                                <div className="p-4 border-b border-gray-100 bg-gray-50/80">
                                    <div className="flex items-center gap-3">
                                        <Avatar
                                            src={user.avatar}
                                            firstName={user.firstName}
                                            lastName={user.lastName}
                                            name={user.name}
                                            email={user.email}
                                            size="w-10 h-10"
                                            className="bg-indigo-100"
                                            initialsClassName="bg-indigo-50 text-indigo-600"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-gray-900 truncate">
                                                {[user.firstName, user.lastName].filter(Boolean).join(' ') || user.name}
                                            </p>
                                            <p className="text-xs text-gray-500 truncate">{user.email}</p>
                                            <p className="text-xs text-indigo-600 font-medium capitalize mt-0.5">{user.role}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="py-1">
                                    <button
                                        onClick={() => {
                                            setShowUserMenu(false);
                                            navigate('/my-info');
                                        }}
                                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
                                    >
                                        <UserIcon size={16} className="text-gray-400" />
                                        <span>My Profile</span>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowUserMenu(false);
                                            setShowPasswordModal(true);
                                        }}
                                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
                                    >
                                        <KeyRound size={16} className="text-gray-400" />
                                        <span>Change Password</span>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowUserMenu(false);
                                            logout();
                                        }}
                                        className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"
                                    >
                                        <LogOut size={16} />
                                        <span>Logout</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : null}
            </div>

            {/* Change Password Modal */}
            {showPasswordModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-scaleIn">
                        <div className="flex justify-between items-center p-6 border-b border-slate-100">
                            <h3 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                                <KeyRound className="text-indigo-600" /> Security Settings
                            </h3>
                            <button onClick={() => setShowPasswordModal(false)} className="text-slate-400 hover:text-slate-600 p-1 bg-slate-50 hover:bg-slate-100 rounded-full transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6">
                            {pwdStatus.error && (
                                <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-100 flex gap-2 text-rose-600 animate-fadeIn text-sm font-medium">
                                    <AlertCircle className="shrink-0 mt-0.5" size={16} />
                                    <p>{pwdStatus.error}</p>
                                </div>
                            )}
                            {pwdStatus.success ? (
                                <div className="text-center py-6 animate-fadeIn">
                                    <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <CheckCircle2 size={32} />
                                    </div>
                                    <h4 className="text-lg font-bold text-slate-800 mb-2">Success!</h4>
                                    <p className="text-slate-500 font-medium">{pwdStatus.success}</p>
                                </div>
                            ) : (
                                <form onSubmit={handleChangePassword} className="space-y-4">
                                    <div className="bg-indigo-50/50 border border-indigo-100 p-4 rounded-xl mb-6">
                                        <p className="text-xs text-indigo-700 font-medium leading-relaxed">
                                            If you registered via Microsoft Single Sign-On, you can set a password here to allow email/password login as well. Leave "Current Password" blank if you don't have one yet.
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase">Current Password</label>
                                        <input
                                            type="password"
                                            value={pwdForm.currentPassword}
                                            onChange={(e) => setPwdForm({ ...pwdForm, currentPassword: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-200 text-slate-800 px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-sm font-medium"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase">New Password *</label>
                                        <input
                                            type="password"
                                            value={pwdForm.newPassword}
                                            onChange={(e) => setPwdForm({ ...pwdForm, newPassword: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-200 text-slate-800 px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-sm font-medium"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase">Confirm New Password *</label>
                                        <input
                                            type="password"
                                            value={pwdForm.confirmPassword}
                                            onChange={(e) => setPwdForm({ ...pwdForm, confirmPassword: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-200 text-slate-800 px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-sm font-medium"
                                            required
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={pwdStatus.loading}
                                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 mt-4 rounded-xl shadow-md transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed text-sm"
                                    >
                                        {pwdStatus.loading ? 'Saving...' : 'Update Password'}
                                    </button>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </header>
    );
};

export default Header;
