import { useState, useCallback } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import { Outlet, useLocation } from 'react-router-dom';

const MainLayout = () => {
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const closeSidebar = useCallback(() => setSidebarOpen(false), []);
    const openSidebar = useCallback(() => setSidebarOpen(true), []);

    let title = 'Dashboard';
    if (location.pathname.includes('pim')) title = 'PIM';
    else if (location.pathname.includes('admin')) title = 'Admin';
    else if (location.pathname.includes('leave')) title = 'Leave';
    else if (location.pathname.includes('recruitment')) title = 'Recruitment';
    else if (location.pathname.includes('my-info')) title = 'My Info';
    else if (location.pathname.includes('performance')) title = 'Performance';
    else if (location.pathname.includes('directory')) title = 'Directory';
    else if (location.pathname.includes('maintenance')) title = 'Maintenance';
    else if (location.pathname.includes('claim')) title = 'Expense Claim';

    return (
        <div className="flex flex-col min-h-screen">
            <div className="flex flex-1 min-h-0">
                <Sidebar
                    isOpen={sidebarOpen}
                    onClose={closeSidebar}
                />
            <div className="flex-1 flex flex-col min-w-0 ml-0 min-[992px]:ml-64 pt-14 min-[992px]:pt-16 transition-all duration-300">
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
