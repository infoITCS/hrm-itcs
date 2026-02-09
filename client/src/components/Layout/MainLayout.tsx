import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import { Outlet, useLocation } from 'react-router-dom';

const MainLayout = () => {
    const location = useLocation();

    // Determine title based on path, rough logic
    let title = 'Dashboard';
    if (location.pathname.includes('pim')) title = 'PIM';
    else if (location.pathname.includes('admin')) title = 'Admin';
    // ... add others

    return (
        <div className="flex min-h-screen bg-gray-50">
            <Sidebar />
            <div className="flex-1 flex flex-col ml-64 transition-all duration-300">
                <Header title={title} />
                <main className="flex-1 p-6 overflow-x-hidden">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default MainLayout;
