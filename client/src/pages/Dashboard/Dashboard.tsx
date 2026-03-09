import { useAuth } from '../../contexts/AuthContext';
import SetPasswordModal from '../../components/SetPasswordModal';
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
    Check,
    AlertCircle,
    X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import api from '../../utils/api';

type RoleType = 'admin' | 'manager' | 'employee';

const Dashboard = () => {
    const { user, login } = useAuth();
    const navigate = useNavigate();
    const [employeeCount, setEmployeeCount] = useState<number>(0);
    const [teamCount, setTeamCount] = useState<number>(0);
    const [teamMembers, setTeamMembers] = useState<any[]>([]);
    const [pendingTasks, setPendingTasks] = useState<any[]>([]);
    const [newHiresCount, setNewHiresCount] = useState<number>(0);
    const [highlights, setHighlights] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showSetPassword, setShowSetPassword] = useState(false);

    // Detect ?setup-password=1 injected by AuthCallback OR check user profile state
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const hasQueryParam = params.get('setup-password') === '1';
        
        if (hasQueryParam || user?.needsPasswordSetup) {
            setShowSetPassword(true);
            
            // Clean URL query param if present
            if (hasQueryParam) {
                window.history.replaceState({}, '', '/dashboard');
            }
        }
    }, [user?.needsPasswordSetup]);

    const role: RoleType =
        user?.role === 'super-admin' || user?.role === 'admin'
            ? 'admin'
            : user?.role === 'manager'
                ? 'manager'
                : 'employee';

    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.name || 'User';

    const [onboardingData, setOnboardingData] = useState<any>(null);
    const [onboardingDismissed, setOnboardingDismissed] = useState(
        localStorage.getItem(`onboarding_dismissed_${user?.id}`) === 'true'
    );

    const calculateOnboardingProgress = (emp: any) => {
        const empData = emp || {};

        const steps = [
            { id: 'personal', label: 'Personal Information', completed: !!(empData.firstName && empData.lastName && empData.cnic && empData.dateOfBirth) },
            { id: 'contact', label: 'Contact & Emergency', completed: !!(empData.address?.city && empData.emergencyContacts?.some((ec: any) => ec.name || ec.phone)) },
            { id: 'history', label: 'Employment & Education', completed: !!(empData.education?.some((edu: any) => edu.level) || empData.employmentHistory?.some((eh: any) => eh.companyName)) },
            { id: 'skills', label: 'Skills & Profiles', completed: !!(empData.skills?.length > 0 || empData.socialProfiles?.some((sp: any) => sp.link)) },
            { id: 'documents', label: 'Identity Documents (CNIC Front, CNIC Back, Degree, Picture)', completed: !!(
                empData.attachments?.some((a: any) => a.fileType === 'CNIC Front') &&
                empData.attachments?.some((a: any) => a.fileType === 'CNIC Back') &&
                empData.attachments?.some((a: any) => a.fileType === 'Degree' || a.fileType?.startsWith('Degree - ')) &&
                empData.attachments?.some((a: any) => a.fileType === 'Profile Picture' || a.fileType === 'Picture')
            )}
        ];

        const completedCount = steps.filter(s => s.completed).length;
        const percent = Math.round((completedCount / steps.length) * 100);

        return { percent, steps };
    };

    // Show onboarding for employees even if they don't have an employee record yet
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
                            const managerEmp = data.find((e: any) => e.userId === user.id);
                            const myTeam = managerEmp ? data.filter((e: any) => e.jobInfo?.reportingManager === managerEmp.employeeId) : [];
                            // Ensure we count team members, excluding themselves
                            setTeamCount(myTeam.filter((e: any) => e.userId !== user.id).length);
                            setTeamMembers(myTeam);

                            // Calculate pending document approvals for team members
                            const pendingDocs: any[] = [];
                            myTeam.forEach((member: any) => {
                                member.attachments?.forEach((doc: any) => {
                                    if (doc.status === 'Pending' || doc.status === 'PENDING') {
                                        pendingDocs.push({
                                            id: doc._id || doc.id,
                                            type: 'document',
                                            title: `Document Approval: ${doc.fileType}`,
                                            employeeName: `${member.firstName} ${member.lastName}`,
                                            employeeId: member._id,
                                            date: new Date(doc.uploadDate || Date.now()).toLocaleDateString()
                                        });
                                    }
                                });
                            });
                            setPendingTasks(pendingDocs);
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
            {/* Password Setup Modal for first-time Microsoft users */}
            {showSetPassword && (
                <SetPasswordModal
                    userName={user?.firstName || user?.name}
                    onSuccess={() => {
                        setShowSetPassword(false);
                        // Update global user state so modal doesn't re-appear
                        login((prev: any) => prev ? ({ ...prev, needsPasswordSetup: false }) : prev);
                    }}
                />
            )}
            {/* Onboarding Progress Card — only shown when employee record exists and has incomplete steps */}
            {!loading && onboarding && onboarding.steps.length > 0 && !onboardingDismissed && (
                <div className={`bg-white rounded-2xl border-2 shadow-xl overflow-hidden relative group transition-all duration-500 ${onboarding.percent === 100 ? 'border-emerald-200 shadow-emerald-100/50' : 'border-indigo-100 shadow-indigo-100/50'}`}>
                    {onboarding.percent === 100 && (
                        <button 
                            onClick={() => {
                                localStorage.setItem(`onboarding_dismissed_${user?.id}`, 'true');
                                setOnboardingDismissed(true);
                            }}
                            className="absolute top-4 right-4 p-2 text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-full transition-all z-30"
                            title="Dismiss"
                        >
                            <X size={20} />
                        </button>
                    )}
                    <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none group-hover:scale-110 transition-transform duration-700">
                        {onboarding.percent === 100 ? <PartyPopper size={160} className="text-emerald-600 -rotate-12" /> : <Rocket size={160} className="text-indigo-600 -rotate-12" />}
                    </div>
                    
                    <div className="p-6 sm:p-8 flex flex-col lg:flex-row gap-8 items-center">
                        <div className="flex-1 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className={`p-2.5 text-white rounded-xl shadow-lg ${onboarding.percent === 100 ? 'bg-emerald-500 shadow-emerald-200' : 'bg-indigo-600 shadow-indigo-200'}`}>
                                    {onboarding.percent === 100 ? <Sparkles size={20} /> : <Rocket size={20} />}
                                </div>
                                <div>
                                    <h2 className={`text-xl font-bold tracking-tight ${onboarding.percent === 100 ? 'text-emerald-700' : 'text-slate-800'}`}>
                                        {onboarding.percent === 100 ? 'Onboarding Complete!' : 'Onboarding in Progress'}
                                    </h2>
                                    <p className="text-sm text-slate-500 font-medium">
                                        {onboarding.percent === 100 ? 'You have successfully completed all required profile sections.' : 'Complete your profile to unlock all enterprise features.'}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between items-end mb-1">
                                    <span className={`text-sm font-bold ${onboarding.percent === 100 ? 'text-emerald-600' : 'text-indigo-600'}`}>{onboarding.percent}% Completed</span>
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{onboarding.steps.filter(s => s.completed).length} of {onboarding.steps.length} Steps</span>
                                </div>
                                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-50">
                                    <div 
                                        className={`h-full rounded-full transition-all duration-1000 ease-out shadow-sm ${onboarding.percent === 100 ? 'bg-gradient-to-r from-emerald-400 to-green-500' : 'bg-gradient-to-r from-indigo-500 to-purple-500'}`}
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

                        {onboarding.percent < 100 && (
                            <div className="shrink-0">
                                <button 
                                    onClick={() => {
                                        const firstIncomplete = onboarding.steps.find((s: any) => !s.completed);
                                        let stepNum = 1;
                                        if (firstIncomplete) {
                                            if (firstIncomplete.id === 'personal') stepNum = 1;
                                            if (firstIncomplete.id === 'contact') stepNum = 2;
                                            if (firstIncomplete.id === 'immigration') stepNum = 3;
                                            if (firstIncomplete.id === 'history') stepNum = 5;
                                            if (firstIncomplete.id === 'skills') stepNum = 6;
                                            if (firstIncomplete.id === 'documents') stepNum = 8;
                                        }
                                        navigate(`/my-info?onboarding=true&step=${stepNum}`);
                                    }}
                                    className="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold shadow-xl shadow-indigo-100 transition-all transform hover:-translate-y-1 active:scale-95 flex items-center gap-2 group"
                                >
                                    Continue Onboarding
                                    <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                                </button>
                            </div>
                        )}
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
                {/* Activity or Manager Widgets */}
                <div className="lg:col-span-2 flex flex-col gap-6">
                    {role === 'manager' && (
                        <>
                            {/* Pending Approvals Widget */}
                            <div className="bg-white rounded-2xl border border-rose-100 shadow-sm shadow-rose-100/50 p-6 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-6 opacity-[0.03] pointer-events-none group-hover:scale-110 transition-transform duration-700">
                                    <FileCheck size={100} className="text-rose-500 -rotate-12" />
                                </div>
                                <div className="flex items-center justify-between mb-5 relative z-10">
                                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                        <div className="p-1.5 bg-rose-100 text-rose-600 rounded-lg">
                                            <FileCheck size={18} />
                                        </div>
                                        Pending Approvals
                                        {pendingTasks.length > 0 && (
                                            <span className="bg-rose-500 text-white px-2.5 py-0.5 rounded-full text-xs font-bold inline-flex items-center justify-center min-w-[24px] h-[24px] ml-1 shadow-sm">{pendingTasks.length}</span>
                                        )}
                                    </h3>
                                </div>
                                {pendingTasks.length > 0 ? (
                                    <div className="space-y-3 relative z-10 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                        {pendingTasks.map((task, idx) => (
                                            <div key={idx} onClick={() => navigate(`/pim/view/${task.employeeId}?tab=documents`)} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-xl hover:bg-white hover:border-rose-200 hover:shadow-md hover:shadow-rose-100/50 transition-all cursor-pointer group">
                                                <div className="flex items-center gap-4">
                                                    <div className="p-2.5 bg-white rounded-xl shadow-sm border border-slate-100 group-hover:bg-rose-50 group-hover:border-rose-100 transition-colors">
                                                        <FileCheck size={20} className="text-rose-500 group-hover:scale-110 transition-transform" />
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-sm text-slate-800 group-hover:text-rose-700 transition-colors">{task.title}</p>
                                                        <p className="text-xs text-slate-500 font-medium mt-0.5">Requested by <span className="text-slate-700 font-bold">{task.employeeName}</span> • {task.date}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-100/50">Pending</span>
                                                    <ArrowRight size={16} className="text-slate-300 group-hover:text-rose-500 transition-all group-hover:translate-x-1" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-8 pb-4 relative z-10 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                                        <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3 border border-emerald-100">
                                            <Check size={28} className="text-emerald-500" />
                                        </div>
                                        <p className="font-bold text-slate-700">All caught up!</p>
                                        <p className="text-sm text-slate-500 mt-1">You have no pending approvals for your team at this time.</p>
                                    </div>
                                )}
                            </div>

                            {/* Probation Alerts Widget */}
                            {teamMembers.some((m) => {
                                if (m.employmentStatus?.status === 'Probation' && m.employmentStatus?.probationEndDate) {
                                    const endDate = new Date(m.employmentStatus.probationEndDate);
                                    const today = new Date();
                                    const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                                    return diffDays >= 0 && diffDays <= 14; // Within 14 days
                                }
                                return false;
                            }) && (
                                <div className="bg-white rounded-2xl border border-amber-100 shadow-sm shadow-amber-100/50 p-6 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-6 opacity-[0.03] pointer-events-none transition-transform duration-700 transform hover:scale-110">
                                        <AlertCircle size={100} className="text-amber-500 -rotate-12" />
                                    </div>
                                    <div className="flex items-center justify-between mb-4 relative z-10">
                                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                            <div className="p-1.5 bg-amber-100 text-amber-600 rounded-lg">
                                                <AlertCircle size={18} />
                                            </div>
                                            Action Needed: Probation Ending
                                        </h3>
                                    </div>
                                    <div className="space-y-3 relative z-10">
                                        {teamMembers.filter((m) => {
                                            if (m.employmentStatus?.status === 'Probation' && m.employmentStatus?.probationEndDate) {
                                                const endDate = new Date(m.employmentStatus.probationEndDate);
                                                const today = new Date();
                                                const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                                                return diffDays >= 0 && diffDays <= 14;
                                            }
                                            return false;
                                        }).map((member, idx) => {
                                            const daysLeft = Math.ceil((new Date(member.employmentStatus.probationEndDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                                            return (
                                                <div key={idx} onClick={() => navigate(`/pim/view/${member._id}?tab=job`)} className="p-3 bg-amber-50/50 border border-amber-200 hover:bg-white hover:shadow-md rounded-xl flex items-center justify-between cursor-pointer transition-all group">
                                                    <div>
                                                        <p className="font-bold text-sm text-slate-800 group-hover:text-amber-700 transition-colors">{member.firstName} {member.lastName}</p>
                                                        <p className="text-xs text-slate-500 font-medium mt-0.5">Probation ends in <span className="font-bold text-amber-600">{daysLeft === 0 ? 'Today' : `${daysLeft} days`}</span></p>
                                                    </div>
                                                    <span className="text-[10px] font-bold uppercase tracking-widest bg-amber-100 border border-amber-200 text-amber-700 px-2.5 py-1 rounded">Review</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* My Team Details Widget */}
                            <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm shadow-indigo-100/30 p-6 flex-1 flex flex-col relative overflow-hidden">
                                <div className="absolute bottom-0 right-0 p-6 opacity-[0.02] pointer-events-none">
                                    <Users size={120} className="text-indigo-600 -translate-x-8" />
                                </div>
                                <div className="flex items-center justify-between mb-5 relative z-10">
                                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                        <div className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg">
                                            <Users size={18} />
                                        </div>
                                        My Team
                                        <span className="bg-indigo-50 text-indigo-600 px-2.5 py-0.5 rounded-full text-xs font-bold border border-indigo-100 ml-1">{teamMembers.length}</span>
                                    </h3>
                                    <button onClick={() => navigate('/pim')} className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors">
                                        View Dashboard
                                    </button>
                                </div>
                                
                                {teamMembers.length > 0 ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-2 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar relative z-10">
                                        {teamMembers.map((member, idx) => (
                                            <div key={idx} onClick={() => navigate(`/pim/view/${member._id}`)} className="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-xl hover:border-indigo-300 hover:shadow-md shadow-sm transition-all cursor-pointer group hover:bg-slate-50/50">
                                                <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold shrink-0 border border-indigo-100 group-hover:scale-105 transition-transform">
                                                    {member.firstName ? `${member.firstName[0]}${member.lastName ? member.lastName[0] : ''}` : <User size={16} />}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-bold text-slate-800 truncate group-hover:text-indigo-700 transition-colors">{member.firstName} {member.lastName}</p>
                                                    <p className="text-[10px] font-bold text-slate-400 truncate tracking-wider uppercase mt-0.5 mb-1.5">{member.jobInfo?.designation || 'No Designation'}</p>
                                                    
                                                    {/* Onboarding Progress Bar */}
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-24 bg-slate-100 h-1.5 rounded-full overflow-hidden shadow-inner">
                                                            <div className={`h-full rounded-full transition-all ${(calculateOnboardingProgress(member)?.percent ?? 0) === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${calculateOnboardingProgress(member)?.percent ?? 0}%` }}></div>
                                                        </div>
                                                        <span className="text-[9px] font-bold text-slate-400">Onboarding: {calculateOnboardingProgress(member)?.percent ?? 0}%</span>
                                                    </div>
                                                </div>
                                                <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-sm border border-slate-100 group-hover:border-indigo-200 group-hover:bg-indigo-50 shrink-0">
                                                    <ArrowRight size={12} className="text-slate-400 group-hover:text-indigo-600 transition-all opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center py-8 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200 relative z-10">
                                        <div className="p-4 bg-white rounded-full shadow-sm border border-slate-100 mb-3">
                                            <Users size={28} className="text-slate-300" />
                                        </div>
                                        <p className="font-bold text-slate-600">No Direct Reports</p>
                                        <p className="text-xs text-slate-400 mt-1 max-w-[200px]">You currently do not have any employees assigned to you in the system.</p>
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {role !== 'manager' && (
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 h-full flex flex-col">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                    <Sparkles size={20} className="text-indigo-500" />
                                    {activityTitleByRole[role] || 'Recent Activity'}
                                </h3>
                                <button
                                    onClick={() => (role === 'admin' ? navigate('/pim') : navigate('/my-info'))}
                                    className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
                                >
                                    View All
                                </button>
                            </div>
                            <div className="flex-1 flex flex-col items-center justify-center py-12 text-slate-400 min-h-[300px]">
                                <div className="p-4 rounded-2xl bg-slate-50 mb-4 shadow-inner">
                                    <Clock size={48} className="text-slate-300" />
                                </div>
                                <p className="font-medium text-slate-500">Activity feed will appear here</p>
                                <span className="text-xs mt-2 text-slate-400">New feature coming soon</span>
                            </div>
                        </div>
                    )}
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
