import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
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
    Shield,
    X,
    ScanFace,
} from 'lucide-react';
import logo from '../../assets/logo.png';
import { usePermissions } from '../../hooks/usePermissions';

interface SidebarProps {
    isOpen?: boolean;
    onClose?: () => void;
}

const Sidebar = ({ isOpen = false, onClose }: SidebarProps) => {
    const location = useLocation();
    const { role } = usePermissions();

    const allMenuItems = [
        { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', roles: ['super-admin', 'admin', 'manager', 'employee'], end: true },
        { name: 'Users & Roles', icon: UserCog, path: '/admin', roles: ['super-admin'], end: true },
        { name: 'Admin Settings', icon: Settings, path: '/admin/settings', roles: ['super-admin', 'admin'] },
        { name: 'Audit Logs', icon: Shield, path: '/admin/audit', roles: ['super-admin'] },
        { name: 'PIM', icon: Users, path: '/pim', roles: ['super-admin', 'admin', 'manager'] },
        { name: 'Leave', icon: Calendar, path: '/leave', roles: ['super-admin', 'admin', 'manager', 'employee'] },
        { name: 'Attendance', icon: ScanFace, path: '/attendance', roles: ['super-admin', 'admin', 'manager', 'employee'] },
        { name: 'Recruitment', icon: UserPlus, path: '/recruitment', roles: ['super-admin', 'admin'] },
        { name: 'My Info', icon: User, path: '/my-info', roles: ['super-admin', 'admin', 'manager', 'employee'] },
        { name: 'Performance', icon: Star, path: '/performance', roles: ['super-admin', 'admin', 'manager', 'employee'] },
        { name: 'Directory', icon: BookOpen, path: '/directory', roles: ['super-admin', 'admin', 'manager', 'employee'] },
        { name: 'Maintenance', icon: Settings, path: '/maintenance', roles: ['super-admin', 'admin'] },
        { name: 'Claim', icon: DollarSign, path: '/#', roles: ['super-admin', 'admin', 'manager', 'employee'] },
    ];

    const menuItems = allMenuItems.filter(item => item.roles.includes(role));

    // Close sidebar when route changes (e.g. after clicking a nav link on mobile)
    useEffect(() => {
        onClose?.();
    }, [location.pathname, onClose]);

    return (
        <>
            {/* Backdrop: visible only below 992px when sidebar is open */}
            <div
                aria-hidden="true"
                onClick={onClose}
                className={`fixed inset-0 bg-black/50 z-30 transition-opacity duration-300 min-[992px]:hidden ${
                    isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                }`}
            />

            {/* Sidebar panel: below 992px slide in when isOpen, above 992px always visible */}
            <aside
                className={`
                    w-64 max-w-[85vw] sm:max-w-none bg-white shadow-xl h-screen fixed left-0 top-0 overflow-y-auto flex flex-col z-40 border-r border-slate-200/50
                    transition-transform duration-300 ease-out
                    min-[992px]:translate-x-0
                    ${isOpen ? 'translate-x-0' : 'max-[991px]:-translate-x-full'}
                `}
            >
                <div className="p-4 min-[992px]:p-6 border-b border-gray-100/50 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 shrink-0">
                            <img src={logo} alt="ITCS Logo" className="h-8 w-auto object-contain" />
                        </div>
                        <h2 className="text-sm font-bold text-gray-800 truncate">HRM System</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 min-[992px]:hidden"
                        aria-label="Close menu"
                    >
                        <X size={20} />
                    </button>
                </div>

                <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                    {menuItems.map((item) => {
                        const IconComponent = item.icon;
                        return (
                            <NavLink
                                key={item.name}
                                to={item.path}
                                end={item.end}
                                onClick={onClose}
                                className={({ isActive, isPending }) =>
                                    `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 group relative ${
                                        isActive || isPending
                                            ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm'
                                            : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-600'
                                    }`
                                }
                            >
                                {({ isActive }) => (
                                    <>
                                        <IconComponent size={20} className="shrink-0" />
                                        <span className="truncate">{item.name}</span>
                                        {isActive ? (
                                            <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white shrink-0" />
                                        ) : null}
                                    </>
                                )}
                            </NavLink>
                        );
                    })}
                </nav>
            </aside>
        </>
    );
};

export default Sidebar;
