import { useState, useCallback } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const MainLayout = () => {
    const location = useLocation();
    const { isImpersonated, user, stopImpersonating } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const closeSidebar = useCallback(() => setSidebarOpen(false), []);
    const openSidebar = useCallback(() => setSidebarOpen(true), []);

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
                        <Outlet />
                    </main>
                </div>
            </div>
        </div>
    );
};

export default MainLayout;
