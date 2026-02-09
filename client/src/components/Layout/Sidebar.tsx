import React from 'react';
import { NavLink } from 'react-router-dom';
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
        <aside className="w-64 bg-white shadow-md h-screen fixed left-0 top-0 overflow-y-auto flex flex-col z-10">
            <div className="p-6">
                <div className="flex items-center gap-2">
                    <img src={logo} alt="ITCS Logo" className="h-12 w-auto object-contain" />
                </div>
            </div>

            <nav className="flex-1 px-4 pb-4 space-y-1">
                {menuItems.map((item) => (
                    <NavLink
                        key={item.name}
                        to={item.path}
                        className={({ isActive }) =>
                            `flex items-center gap-4 px-4 py-3 rounded-r-full text-sm font-medium transition-colors ${isActive
                                ? 'bg-primary text-white'
                                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                            }`
                        }
                    >
                        <item.icon size={20} />
                        {item.name}
                    </NavLink>
                ))}
            </nav>
        </aside>
    );
};

export default Sidebar;
