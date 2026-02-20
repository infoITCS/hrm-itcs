import { useAuth } from '../../contexts/AuthContext';
import {
    Users,
    UserPlus,
    BookOpen,
    Calendar,
    Clock,
    ArrowRight,
    User,
    Star,
    Briefcase,
    LayoutDashboard,
    FileCheck,
    TrendingUp,
    Shield,
    Sparkles,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import api from '../../utils/api';

type RoleType = 'admin' | 'manager' | 'employee';

const Dashboard = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [employeeCount, setEmployeeCount] = useState<number>(0);
    const [teamCount, setTeamCount] = useState<number>(0);
    const [loading, setLoading] = useState(true);

    const role: RoleType =
        user?.role === 'super-admin' || user?.role === 'admin'
            ? 'admin'
            : user?.role === 'manager'
                ? 'manager'
                : 'employee';

    const firstName = user?.firstName || user?.name?.split(' ')[0] || 'User';

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token || !user) {
            setLoading(false);
            return;
        }

        const fetchStats = async () => {
            try {
                if (role === 'admin') {
                    const res = await fetch(api.employees, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (res.ok) {
                        const data = await res.json();
                        setEmployeeCount(Array.isArray(data) ? data.length : 0);
                    }
                } else if (role === 'manager') {
                    const res = await fetch(api.employees, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (res.ok) {
                        const data = await res.json();
                        setTeamCount(Array.isArray(data) ? data.length : 0);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch dashboard stats', err);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, [user, role]);

    // Admin: organization-wide overview
    const adminStats = [
        {
            title: 'Total Employees',
            value: loading ? '...' : String(employeeCount),
            icon: Users,
            color: 'text-violet-600',
            bg: 'bg-violet-50',
            border: 'border-violet-100',
            link: '/pim',
        },
        {
            title: 'New Hires (This Month)',
            value: '—',
            icon: UserPlus,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
            border: 'border-emerald-100',
            link: '/recruitment',
        },
        {
            title: 'Leave Requests',
            value: '—',
            icon: Calendar,
            color: 'text-amber-600',
            bg: 'bg-amber-50',
            border: 'border-amber-100',
            link: '/leave',
        },
        {
            title: 'Pending Reviews',
            value: '—',
            icon: FileCheck,
            color: 'text-rose-600',
            bg: 'bg-rose-50',
            border: 'border-rose-100',
            link: '/performance',
        },
    ];

    // Manager: team and approvals
    const managerStats = [
        {
            title: 'My Team',
            value: loading ? '...' : String(teamCount),
            icon: Users,
            color: 'text-indigo-600',
            bg: 'bg-indigo-50',
            border: 'border-indigo-100',
            link: '/pim',
        },
        {
            title: 'Leave Requests',
            value: '—',
            icon: Calendar,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
            border: 'border-emerald-100',
            link: '/leave',
        },
        {
            title: 'Pending Approvals',
            value: '—',
            icon: FileCheck,
            color: 'text-amber-600',
            bg: 'bg-amber-50',
            border: 'border-amber-100',
            link: '/leave',
        },
        {
            title: 'Team Performance',
            value: 'Overview',
            icon: TrendingUp,
            color: 'text-rose-600',
            bg: 'bg-rose-50',
            border: 'border-rose-100',
            link: '/performance',
        },
    ];

    // Employee: personal overview
    const employeeStats = [
        {
            title: 'My Details',
            value: 'Profile',
            icon: User,
            color: 'text-indigo-600',
            bg: 'bg-indigo-50',
            border: 'border-indigo-100',
            link: '/my-info',
        },
        {
            title: 'Leaves Available',
            value: '—',
            icon: Calendar,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
            border: 'border-emerald-100',
            link: '/leave',
        },
        {
            title: 'Performance Reviews',
            value: 'Next',
            icon: Star,
            color: 'text-amber-600',
            bg: 'bg-amber-50',
            border: 'border-amber-100',
            link: '/performance',
        },
        {
            title: 'My Claims',
            value: '—',
            icon: Briefcase,
            color: 'text-rose-600',
            bg: 'bg-rose-50',
            border: 'border-rose-100',
            link: '/claim',
        },
    ];

    const statsByRole = { admin: adminStats, manager: managerStats, employee: employeeStats };
    const statsToDisplay = statsByRole[role];

    const welcomeByRole = {
        admin: {
            title: `Welcome back, ${firstName}! 👋`,
            subtitle: "Here's the current overview of your organization. Review pending requests and key metrics.",
            gradient: 'from-violet-600 via-purple-600 to-indigo-700',
            badge: 'Admin',
            badgeIcon: Shield,
        },
        manager: {
            title: `Welcome back, ${firstName}! 👋`,
            subtitle: "Here's your team overview. Approve leave requests and track your direct reports.",
            gradient: 'from-indigo-600 via-purple-600 to-violet-600',
            badge: 'Manager',
            badgeIcon: Users,
        },
        employee: {
            title: `Welcome back, ${firstName}! 👋`,
            subtitle: "Here is your personal overview. Check your schedule, leaves, and requests.",
            gradient: 'from-indigo-600 to-purple-600',
            badge: 'Employee',
            badgeIcon: User,
        },
    };

    const welcome = welcomeByRole[role];

    const activityTitleByRole = {
        admin: 'Organizational Activity',
        manager: 'Team Activity',
        employee: 'My Recent Activity',
    };

    const quickLinksByRole = {
        admin: [
            { title: 'Employee Directory', desc: 'View and manage all employees', icon: Users, path: '/pim' },
            { title: 'Recruitment', desc: 'New hires and open positions', icon: UserPlus, path: '/recruitment' },
            { title: 'Company Policy', desc: 'Read latest updates and rules', icon: BookOpen, path: '/directory' },
        ],
        manager: [
            { title: 'My Team (PIM)', desc: 'View and manage direct reports', icon: Users, path: '/pim' },
            { title: 'Leave Management', desc: 'Approve and track team leave', icon: Calendar, path: '/leave' },
            { title: 'Employee Directory', desc: 'Find and connect with colleagues', icon: BookOpen, path: '/directory' },
        ],
        employee: [
            { title: 'Employee Directory', desc: 'Find and connect with colleagues', icon: BookOpen, path: '/directory' },
            { title: 'Company Policy', desc: 'Read latest updates and rules', icon: BookOpen, path: '/directory' },
        ],
    };

    const quickLinks = quickLinksByRole[role];
    const BadgeIcon = welcome.badgeIcon;

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Welcome Banner */}
            <div
                className={`rounded-xl min-[992px]:rounded-2xl p-5 sm:p-6 min-[992px]:p-8 text-white shadow-xl relative overflow-hidden bg-gradient-to-r ${welcome.gradient}`}
            >
                <div className="absolute top-0 right-0 w-72 h-72 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <h1 className="text-2xl sm:text-3xl min-[992px]:text-4xl font-bold mb-2 tracking-tight">{welcome.title}</h1>
                        <p className="text-white/90 max-w-xl text-base md:text-lg">{welcome.subtitle}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/20 backdrop-blur-sm border border-white/30 font-semibold text-sm uppercase tracking-wider shadow-lg">
                            <BadgeIcon size={18} />
                            {welcome.badge}
                        </span>
                    </div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {statsToDisplay.map((stat, i) => (
                    <div
                        key={i}
                        onClick={() => stat.link && navigate(stat.link)}
                        className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-lg hover:border-slate-200 transition-all duration-300 cursor-pointer group"
                    >
                        <div className="flex justify-between items-start mb-4">
                            <div
                                className={`p-3.5 rounded-xl ${stat.bg} ${stat.color} border ${stat.border} group-hover:scale-110 transition-transform duration-300`}
                            >
                                <stat.icon size={26} strokeWidth={2} />
                            </div>
                            <div className="p-2 rounded-lg text-slate-400 opacity-0 group-hover:opacity-100 group-hover:bg-slate-100 transition-all">
                                <ArrowRight size={18} />
                            </div>
                        </div>
                        <p className="text-slate-500 font-medium text-sm mb-1">{stat.title}</p>
                        <h3 className="text-2xl md:text-3xl font-bold text-slate-800">{stat.value}</h3>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Activity */}
                <div className="lg:col-span-2">
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 h-full">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <Sparkles size={20} className="text-indigo-500" />
                                {activityTitleByRole[role]}
                            </h3>
                            <button
                                onClick={() => (role === 'admin' ? navigate('/pim') : role === 'manager' ? navigate('/leave') : navigate('/my-info'))}
                                className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
                            >
                                View All
                            </button>
                        </div>
                        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                            <div className="p-4 rounded-2xl bg-slate-50 mb-4">
                                <Clock size={48} className="text-slate-300" />
                            </div>
                            <p className="font-medium text-slate-500">Activity feed will appear here</p>
                            <span className="text-xs mt-2 text-slate-400">New feature coming soon</span>
                        </div>
                    </div>
                </div>

                {/* Quick Links */}
                <div>
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                        <h3 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2">
                            <LayoutDashboard size={20} className="text-indigo-500" />
                            Quick Links
                        </h3>
                        <div className="space-y-3">
                            {quickLinks.map((link, i) => (
                                <div
                                    key={i}
                                    onClick={() => navigate(link.path)}
                                    className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-gradient-to-r hover:from-indigo-50/80 hover:to-purple-50/80 cursor-pointer transition-all duration-200 group"
                                >
                                    <div className="p-2.5 bg-slate-50 text-slate-600 group-hover:bg-indigo-100 group-hover:text-indigo-600 rounded-xl transition-colors border border-slate-100 group-hover:border-indigo-200">
                                        <link.icon size={22} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h4 className="font-semibold text-slate-800 group-hover:text-indigo-900">{link.title}</h4>
                                        <p className="text-xs text-slate-500 mt-0.5">{link.desc}</p>
                                    </div>
                                    <ArrowRight size={16} className="text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all shrink-0" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
