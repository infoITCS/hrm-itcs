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
    Cake,
    PartyPopper,
    Award,
    Rocket,
    Check
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
    const [newHiresCount, setNewHiresCount] = useState<number>(0);
    const [highlights, setHighlights] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const role: RoleType =
        user?.role === 'super-admin' || user?.role === 'admin'
            ? 'admin'
            : user?.role === 'manager'
                ? 'manager'
                : 'employee';

    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.name || 'User';

    const [onboardingData, setOnboardingData] = useState<any>(null);

    const calculateOnboardingProgress = (emp: any) => {
        if (!emp) return { percent: 0, steps: [] };

        const steps = [
            { id: 'personal', label: 'Personal Information', completed: !!(emp.firstName && emp.lastName && emp.cnic && emp.dateOfBirth) },
            { id: 'contact', label: 'Contact & Emergency', completed: !!(emp.address?.city && emp.emergencyContacts?.length > 0 && emp.emergencyContacts[0].phone) },
            { id: 'documents', label: 'Identity Documents', completed: !!(emp.attachments?.some((a: any) => a.fileType === 'Profile Picture' || a.fileType === 'ID Card' || a.fileType === 'Passport')) },
            { id: 'employment', label: 'Work & Education', completed: !!(emp.education?.length > 0) }
        ];

        const completedCount = steps.filter(s => s.completed).length;
        const percent = Math.round((completedCount / steps.length) * 100);

        return { percent, steps };
    };

    const onboarding = user?.role === 'employee' ? calculateOnboardingProgress(onboardingData) : null;

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token || !user) {
            setLoading(false);
            return;
        }

        const fetchStats = async () => {
            try {
                // Fetch current user's employee record for onboarding check
                const empRes = await fetch(`${api.employees}?userId=${user.id}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (empRes.ok) {
                    const empData = await empRes.json();
                    const emp = Array.isArray(empData) ? empData[0] : empData;
                    if (emp) setOnboardingData(emp);
                }

                const res = await fetch(api.employees, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data)) {
                        if (role === 'admin') {
                            setEmployeeCount(data.length);
                        } else if (role === 'manager') {
                            setTeamCount(data.length);
                        }

                        // Calculate New Hires count (Last 30 days)
                        const thirtyDaysAgo = new Date();
                        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                        const newHires = data.filter(e => {
                            if (!e.jobInfo?.joiningDate) return false;
                            return new Date(e.jobInfo.joiningDate) > thirtyDaysAgo;
                        }).length;
                        setNewHiresCount(newHires);

                        // Generate Dynamic Highlights
                        const today = new Date();
                        const tomorrow = new Date();
                        tomorrow.setDate(today.getDate() + 1);

                        const items: any[] = [];
                        data.forEach((emp: any) => {
                            const firstName = emp.firstName || '';
                            const lastName = emp.lastName || '';
                            const fullName = `${firstName} ${lastName}`.trim();

                            // 1. Birthdays
                            if (emp.dateOfBirth) {
                                const dob = new Date(emp.dateOfBirth);
                                if (dob.getMonth() === today.getMonth() && dob.getDate() === today.getDate()) {
                                    items.push({ id: `b-${emp._id}`, type: 'birthday', name: fullName, date: 'Today', icon: Cake, color: 'text-rose-500', bg: 'bg-rose-50' });
                                } else if (dob.getMonth() === tomorrow.getMonth() && dob.getDate() === tomorrow.getDate()) {
                                    items.push({ id: `b-${emp._id}`, type: 'birthday', name: fullName, date: 'Tomorrow', icon: Cake, color: 'text-rose-500', bg: 'bg-rose-50' });
                                }
                            }

                            // 2. Anniversaries
                            if (emp.jobInfo?.joiningDate) {
                                const joinDate = new Date(emp.jobInfo.joiningDate);
                                const years = today.getFullYear() - joinDate.getFullYear();
                                if (years > 0 && joinDate.getMonth() === today.getMonth() && joinDate.getDate() === today.getDate()) {
                                    items.push({ id: `a-${emp._id}`, type: 'anniversary', name: fullName, years: `${years} Year${years > 1 ? 's' : ''}`, date: 'Today', icon: Award, color: 'text-amber-500', bg: 'bg-amber-50' });
                                }
                            }

                            // 3. New Joiners (Joined in last 7 days or joining tomorrow)
                            if (emp.jobInfo?.joiningDate) {
                                const joinDate = new Date(emp.jobInfo.joiningDate);
                                const diffDays = Math.ceil((today.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24));
                                if (diffDays >= 0 && diffDays <= 7) {
                                    items.push({ id: `n-${emp._id}`, type: 'new-joiner', name: fullName, role: emp.jobInfo?.designation || 'New Member', date: diffDays === 0 ? 'Today' : `${diffDays}d ago`, icon: UserPlus, color: 'text-indigo-500', bg: 'bg-indigo-50' });
                                }
                            }
                        });

                        // Fallback if no highlights
                        if (items.length === 0) {
                            items.push({ id: 'empty', type: 'info', name: 'No events today', role: 'Quiet day!', date: '-', icon: Sparkles, color: 'text-slate-400', bg: 'bg-slate-50' });
                        }

                        setHighlights(items.slice(0, 3)); // Show top 3
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
            value: loading ? '...' : String(newHiresCount),
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

    const statsByRole: Record<string, any[]> = { admin: adminStats, manager: managerStats, employee: employeeStats };
    const statsToDisplay = statsByRole[role] || employeeStats;

    const welcomeByRole: Record<string, any> = {
        admin: {
            title: `Welcome back, ${fullName}! 👋`,
            subtitle: "Here's the current overview of your organization. Review pending requests and key metrics.",
            gradient: 'from-violet-600 via-purple-600 to-indigo-700',
            badge: 'Admin',
            badgeIcon: Shield,
        },
        manager: {
            title: `Welcome back, ${fullName}! 👋`,
            subtitle: "Here's your team overview. Approve leave requests and track your direct reports.",
            gradient: 'from-indigo-600 via-purple-600 to-violet-600',
            badge: 'Manager',
            badgeIcon: Users,
        },
        employee: {
            title: `Welcome back, ${fullName}! 👋`,
            subtitle: "Here is your personal overview. Check your schedule, leaves, and requests.",
            gradient: 'from-indigo-600 to-purple-600',
            badge: 'Employee',
            badgeIcon: User,
        },
    };

    const welcome = welcomeByRole[role] || welcomeByRole.employee;

    const activityTitleByRole: Record<string, string> = {
        admin: 'Organizational Activity',
        manager: 'Team Activity',
        employee: 'My Recent Activity',
    };

    const quickLinksByRole: Record<string, any[]> = {
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

    const quickLinks = quickLinksByRole[role] || quickLinksByRole.employee;
    const BadgeIcon = welcome.badgeIcon;


    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Onboarding Progress Card (Only for New Hires) */}
            {onboarding && onboarding.percent < 100 && (
                <div className="bg-white rounded-2xl border-2 border-indigo-100 shadow-xl shadow-indigo-100/50 overflow-hidden relative group">
                    <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none group-hover:scale-110 transition-transform duration-700">
                        <Rocket size={160} className="text-indigo-600 -rotate-12" />
                    </div>
                    
                    <div className="p-6 sm:p-8 flex flex-col lg:flex-row gap-8 items-center">
                        <div className="flex-1 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-200">
                                    <Rocket size={20} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-slate-800 tracking-tight">Onboarding in Progress</h2>
                                    <p className="text-sm text-slate-500 font-medium">Complete your profile to unlock all enterprise features.</p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between items-end mb-1">
                                    <span className="text-sm font-bold text-indigo-600">{onboarding.percent}% Completed</span>
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{onboarding.steps.filter(s => s.completed).length} of {onboarding.steps.length} Steps</span>
                                </div>
                                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-50">
                                    <div 
                                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-1000 ease-out shadow-sm"
                                        style={{ width: `${onboarding.percent}%` }}
                                    />
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                                {onboarding.steps.map((s, idx) => (
                                    <div key={idx} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${s.completed ? 'bg-emerald-50/50 border-emerald-100 text-emerald-700' : 'bg-slate-50/50 border-slate-100 text-slate-400'}`}>
                                        <div className={`p-1 rounded-full ${s.completed ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'}`}>
                                            <Check size={12} strokeWidth={3} />
                                        </div>
                                        <span className="text-xs font-bold">{s.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="shrink-0">
                            <button 
                                onClick={() => navigate('/my-info?onboarding=true')}
                                className="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold shadow-xl shadow-indigo-100 transition-all transform hover:-translate-y-1 active:scale-95 flex items-center gap-2 group"
                            >
                                Continue Onboarding
                                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

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

            {/* Today's Highlights Section */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 overflow-hidden relative">
                <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                    <PartyPopper size={120} className="text-indigo-600 rotate-12" />
                </div>

                <div className="flex items-center justify-between mb-6 relative z-10">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-200">
                            <Sparkles size={20} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800 tracking-tight">Today's Highlights</h2>
                            <p className="text-sm text-slate-500 font-medium">Don't forget to celebrate with your team!</p>
                        </div>
                    </div>
                    <div className="hidden sm:block">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
                            {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative z-10">
                    {highlights.map((item) => (
                        <div
                            key={item.id}
                            className="flex items-center gap-4 p-4 rounded-2xl border border-slate-50 hover:border-indigo-100 hover:bg-slate-50/50 transition-all group cursor-pointer"
                        >
                            <div className={`p-3 rounded-xl ${item.bg} ${item.color} group-hover:scale-110 transition-transform`}>
                                <item.icon size={22} />
                            </div>
                            <div className="min-w-0">
                                <h4 className="font-bold text-slate-800 text-sm truncate">{item.name}</h4>
                                <p className="text-xs text-slate-500 font-medium capitalize">
                                    {item.type === 'anniversary' ? `Work Anniversary • ${item.years}` :
                                        item.type === 'birthday' ? 'Happy Birthday! 🎂' :
                                            `${item.role} • New Joiner`}
                                </p>
                            </div>
                            <div className="ml-auto text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md uppercase">
                                {item.date}
                            </div>
                        </div>
                    ))}
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
                                {activityTitleByRole[role] || 'Recent Activity'}
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
