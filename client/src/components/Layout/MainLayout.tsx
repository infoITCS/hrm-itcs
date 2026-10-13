import { useState, useCallback } from 'react';
import Sidebar, { LOCKED_HRMS_ROUTES } from './Sidebar';
import Header from './Header';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Lock, AlertTriangle, ArrowRight } from 'lucide-react';

const MainLayout = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { isImpersonated, user, stopImpersonating } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const closeSidebar = useCallback(() => setSidebarOpen(false), []);
    const openSidebar = useCallback(() => setSidebarOpen(true), []);

    const isEmployee = user?.role === 'employee';
    const reminderCount = user?.profileReminderCount || 0;
    const isProfileLocked = isEmployee && !!user?.isProfileLocked;
    const isProfileWarning = isEmployee && reminderCount === 1 && !!user?.isProfileIncomplete;
    const isCurrentRouteLocked = isProfileLocked && LOCKED_HRMS_ROUTES.some(r => location.pathname.startsWith(r));

    let title = 'Dashboard';
    if (location.pathname.includes('attendance')) title = 'Attendance Dashboard';
    else if (location.pathname.includes('pim')) title = 'PIM';
    else if (location.pathname.includes('admin/loans')) title = 'Loan Management';
    else if (location.pathname.includes('admin/settings')) title = 'Admin Settings';
    else if (location.pathname.includes('admin')) title = 'Users & Roles';
    else if (location.pathname.includes('leave')) title = 'Leave';
    else if (location.pathname.includes('recruitment')) title = 'Recruitment';
    else if (location.pathname.includes('my-info')) title = 'My Info';
    else if (location.pathname.includes('performance')) title = 'Performance';
    else if (location.pathname.includes('directory')) title = 'Directory';
    else if (location.pathname.includes('claim')) title = 'Expense Claim';
    else if (location.pathname.includes('my-payslips')) title = 'My Payslips';
    else if (location.pathname.includes('my-loans')) title = 'My Loans';
    else if (location.pathname.includes('payroll')) title = 'Payroll Management';
    else if (location.pathname.includes('my-requests')) title = 'Requests';
    else if (location.pathname.includes('provident-fund')) title = 'Provident Fund';

    return (
        <div className="flex flex-col min-h-screen">
            {isImpersonated && (
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-2.5 px-4 text-center text-sm font-bold flex justify-center items-center gap-3 z-[9999] fixed top-0 left-0 right-0 h-10 shadow-md">
                    <span>
                        You are currently impersonating <strong>{user?.name || user?.email}</strong> (Role: <span className="capitalize">{user?.role}</span>)
                    </span>
                    <button 
                        onClick={stopImpersonating}
                        className="bg-white text-indigo-600 px-3 py-1 rounded-lg text-xs font-bold hover:bg-indigo-50 transition-colors shadow-sm active:scale-95"
                    >
                        Switch Back
                    </button>
                </div>
            )}
            <div className="flex flex-1 min-h-0">
                <Sidebar
                    isOpen={sidebarOpen}
                    onClose={closeSidebar}
                />
                <div className={`flex-1 flex flex-col min-w-0 ml-0 min-[992px]:ml-64 transition-all duration-300 ${isImpersonated ? 'pt-[96px] min-[992px]:pt-[104px]' : 'pt-14 min-[992px]:pt-16'}`}>
                    <Header
                        title={title}
                        onMenuClick={openSidebar}
                    />
                    <main className="flex-1 p-4 sm:p-6 overflow-x-hidden">
                        {/* Profile Lockout Banner */}
                        {isProfileLocked && (
                            <div className="mb-5 bg-rose-50 border-2 border-rose-200 rounded-2xl p-4 sm:p-5 shadow-xs">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex items-start gap-3.5">
                                        <div className="p-2.5 rounded-xl bg-rose-100 text-rose-600 shrink-0 mt-0.5">
                                            <Lock size={20} />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-sm font-bold text-rose-900">HRMS Access Restricted (Profile Incomplete)</h3>
                                                <span className="text-[10px] font-bold bg-rose-200 text-rose-900 px-2 py-0.5 rounded-md">2 Reminders Sent</span>
                                            </div>
                                            <p className="text-xs text-rose-700 mt-1 leading-relaxed">
                                                Access to HRMS features (Leaves, Attendance, Payslips, Claims, Requests, Documents) is locked pending profile completion. Complete your profile details in <strong>My Info</strong> to immediately restore full access.
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => navigate('/my-info')}
                                        className="shrink-0 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer self-start sm:self-center"
                                    >
                                        <span>Complete My Profile Now</span>
                                        <ArrowRight size={14} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* 1st Profile Warning Banner */}
                        {isProfileWarning && (
                            <div className="mb-5 bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-xs">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex items-start gap-3.5">
                                        <div className="p-2 rounded-xl bg-amber-100 text-amber-700 shrink-0 mt-0.5">
                                            <AlertTriangle size={18} />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-sm font-bold text-amber-900">Action Required: Complete Your Employee Profile</h3>
                                                <span className="text-[10px] font-bold bg-amber-200 text-amber-900 px-2 py-0.5 rounded-md">1st Warning</span>
                                            </div>
                                            <p className="text-xs text-amber-800 mt-1">
                                                Your profile is missing required information (CNIC, phone, address, or job details). If not completed upon a 2nd reminder, access to HRMS features will be restricted.
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => navigate('/my-info')}
                                        className="shrink-0 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer self-start sm:self-center"
                                    >
                                        <span>Update Profile</span>
                                        <ArrowRight size={14} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Lock Screen if directly on restricted route, else normal outlet */}
                        {isCurrentRouteLocked ? (
                            <div className="bg-white border border-rose-200 rounded-3xl p-8 sm:p-12 text-center max-w-xl mx-auto shadow-sm my-8">
                                <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-100">
                                    <Lock size={32} />
                                </div>
                                <h2 className="text-xl font-bold text-slate-800 mb-2">Feature Access Restricted</h2>
                                <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                                    This HRMS feature is locked because your employee profile remains incomplete after multiple reminders.
                                    Please complete your mandatory profile details (CNIC, Phone Number, Residential Address, and Job details) to restore access immediately.
                                </p>
                                <button
                                    onClick={() => navigate('/my-info')}
                                    className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm rounded-xl shadow-md shadow-rose-200 transition-all inline-flex items-center gap-2 cursor-pointer"
                                >
                                    <span>Complete My Profile in 'My Info'</span>
                                    <ArrowRight size={16} />
                                </button>
                            </div>
                        ) : (
                            <Outlet />
                        )}
                    </main>
                </div>
            </div>
        </div>
    );
};

export default MainLayout;
