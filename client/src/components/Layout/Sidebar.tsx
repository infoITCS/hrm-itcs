import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
    Search,
    UserCog,
    Users,
    Calendar,
    UserPlus,
    User,
    Star,
    LayoutDashboard,
    BookOpen,
    Settings,
    DollarSign,
    MessageSquare
} from 'lucide-react';
import logo from '../../assets/logo.png';


const Sidebar = () => {
    const location = useLocation();
    
    const menuItems = [
        { name: 'Search', icon: Search, path: '/search' },
        { name: 'Admin', icon: UserCog, path: '/admin' },
        { name: 'PIM', icon: Users, path: '/pim' },
        { name: 'Leave', icon: Calendar, path: '/leave' },
        { name: 'Recruitment', icon: UserPlus, path: '/recruitment' },
        { name: 'My Info', icon: User, path: '/my-info' },
        { name: 'Performance', icon: Star, path: '/performance' },
        { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
        { name: 'Directory', icon: BookOpen, path: '/directory' },
        { name: 'Maintenance', icon: Settings, path: '/maintenance' },
        { name: 'Claim', icon: DollarSign, path: '/claim' },
        { name: 'Buzz', icon: MessageSquare, path: '/buzz' },
    ];

    return (
        <aside className="w-64 bg-white shadow-lg h-screen fixed left-0 top-0 overflow-y-auto flex flex-col z-10 border-r border-slate-200/50">
            <div className="p-6 border-b border-gray-100/50">
                <div className="flex items-center gap-3">
                    <div className="p-2">
                        <img src={logo} alt="ITCS Logo" className="h-8 w-auto object-contain" />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold text-gray-800">HRM System</h2>
                       
                    </div>
                </div>
            </div>

            <nav className="flex-1 px-3 py-4 space-y-1">
                {menuItems.map((item) => {
                    const IconComponent = item.icon;
                    const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
                    return (
                        <NavLink
                            key={item.name}
                            to={item.path}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 group relative ${
                                isActive
                                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm'
                                    : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-600'
                            }`}
                        >
                            <IconComponent 
                                size={20} 
                                className={isActive ? 'text-white' : 'text-gray-500 group-hover:text-primary-600'} 
                            />
                            <span>{item.name}</span>
                            {isActive && (
                                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white"></div>
                            )}
                        </NavLink>
                    );
                })}
            </nav>
            
            
        </aside>
    );
};

export default Sidebar;
