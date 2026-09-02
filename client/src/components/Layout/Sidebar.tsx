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
    Banknote,
    Receipt,
    FileText,
    PiggyBank,
    X,
    ScanFace,
    Inbox,
    ClipboardList,
    Headphones,
    Mail,
} from 'lucide-react';
import logo from '../../assets/logo.png';
import { usePermissions } from '../../hooks/usePermissions';
import { useAuth } from '../../contexts/AuthContext';

interface SidebarProps {
    isOpen?: boolean;
    onClose?: () => void;
}

const Sidebar = ({ isOpen = false, onClose }: SidebarProps) => {
    const location = useLocation();
    const { role, hasAccess, hasSubAccess } = usePermissions();
    const { isImpersonated } = useAuth();

    const allMenuItems = [
        { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', roles: null, module: 'dashboard', end: true },
        { name: 'Loan Management', icon: Banknote, path: '/admin/loans', roles: null, module: 'loans', end: true },
        { name: 'Users & Roles', icon: UserCog, path: '/admin', roles: ['super-admin', 'admin'], module: 'settings', end: true },
        { name: 'Admin Settings', icon: Settings, path: '/admin/settings', roles: ['super-admin', 'admin'], module: 'settings' },
        // { name: 'Audit Logs', icon: Shield, path: '/admin/audit', roles: ['super-admin'] },
        { name: 'PIM', icon: Users, path: '/pim', roles: null, module: 'pim', subTab: 'employee-list' },
        { name: 'Leave', icon: Calendar, path: '/leave', roles: null, module: 'leave' },
        { name: 'Attendance', icon: ScanFace, path: '/attendance', roles: null, module: 'attendance' },
        { name: 'Recruitment', icon: UserPlus, path: '/recruitment', roles: null, module: 'recruitment' },
        { name: 'My Info', icon: User, path: '/my-info', roles: ['super-admin', 'admin', 'manager', 'employee', 'hr', 'finance'] },
        { name: 'Performance', icon: Star, path: '/performance', roles: null, module: 'performance' },
        { name: 'Directory', icon: BookOpen, path: '/directory', roles: ['super-admin', 'admin', 'manager', 'employee', 'hr', 'finance'] },
        { name: 'Expense Claim', icon: Receipt, path: '/claim', roles: null, module: 'claim' },
        { name: 'My Payslips', icon: FileText, path: '/my-payslips', roles: ['super-admin', 'admin', 'manager', 'employee', 'hr', 'finance'], end: true },
        { name: 'Payroll Management', icon: Banknote, path: '/payroll', roles: null, module: 'payroll', subTab: 'payroll-runs' },
        { name: 'My Requests', icon: Inbox, path: '/my-requests', roles: null, module: 'requests', subTab: 'my-requests', end: true },
        { name: 'Manage Requests', icon: ClipboardList, path: '/my-requests/manage', roles: null, module: 'requests', subTab: 'manage-requests' },
        { name: 'Provident Fund', icon: PiggyBank, path: '/provident-fund', roles: null, module: 'provident-fund' },
    ];

    const menuItems = allMenuItems.filter(item => {
        // If roles array is explicitly defined, user's role MUST be included
        if (item.roles && !item.roles.includes(role)) return false;
        // If module key is defined, user MUST have DB access to that module
        if (item.module && !hasAccess(item.module)) return false;
        // If subTab key is defined, user MUST have permission to that subTab
        if (item.module && (item as any).subTab && !hasSubAccess(item.module, (item as any).subTab)) return false;
        return true;
    });

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
                } ${isImpersonated ? 'top-10' : 'top-0'}`}
            />

            {/* Sidebar panel: below 992px slide in when isOpen, above 992px always visible */}
            <aside
                className={`
                    w-64 max-w-[85vw] sm:max-w-none bg-white shadow-xl fixed left-0 overflow-y-auto flex flex-col z-40 border-r border-slate-200/50
                    transition-transform duration-300 ease-out
                    min-[992px]:translate-x-0
                    ${isOpen ? 'translate-x-0' : 'max-[991px]:-translate-x-full'}
                    ${isImpersonated ? 'top-10 h-[calc(100vh-2.5rem)]' : 'top-0 h-screen'}
                `}
            >
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-center relative shrink-0">
                    <div className="flex items-center justify-center gap-3">
                        <img src={logo} alt="ITCS Logo" className="h-9 w-auto object-contain shrink-0" />
                        <h2 className="text-base font-extrabold text-slate-800 tracking-tight leading-none whitespace-nowrap">HRM System</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="absolute right-3 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 min-[992px]:hidden"
                        aria-label="Close menu"
                    >
                        <X size={18} />
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

                {/* Support Widget */}
                <div className="p-3 border-t border-slate-100 bg-slate-50/70 shrink-0">
                    <div className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-xs">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-5 h-5 rounded-md bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                <Headphones size={12} />
                            </div>
                            <span className="text-xs font-bold text-slate-800">HRM Support</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mb-1.5 leading-snug">Need help with the portal?</p>
                        <a
                            href="mailto:hrmsupport@itcs.com.pk?subject=HRM%20Portal%20Support%20Request"
                            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors group break-all"
                        >
                            <Mail size={12} className="shrink-0 text-indigo-500 group-hover:text-indigo-700" />
                            <span>hrmsupport@itcs.com.pk</span>
                        </a>
                    </div>
                </div>
            </aside>
        </>
    );
};

export default Sidebar;
