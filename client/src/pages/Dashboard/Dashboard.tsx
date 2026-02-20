
import { useAuth } from '../../contexts/AuthContext';
import { Users, UserPlus, BookOpen, Calendar, Clock, ArrowRight, User, Star, Briefcase } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import api from '../../utils/api';

const Dashboard = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [employeeCount, setEmployeeCount] = useState<number | string>('...');

    const isAdmin = user?.role === 'admin' || user?.role === 'super-admin';

    useEffect(() => {
        const fetchStats = async () => {
            if (!user) return;
            const token = localStorage.getItem('token');
            if (isAdmin) {
                try {
                    const res = await fetch(api.employees, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        setEmployeeCount(data.length);
                    }
                } catch (err) {
                    console.error('Failed to fetch dashboard stats', err);
                }
            }
        };
        fetchStats();
    }, [user, isAdmin]);

    // Stats cards for Admins/HR
    const adminStats = [
        { title: 'Total Employees', value: employeeCount.toString(), icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50', link: '/pim' },
        { title: 'New Hires (This Month)', value: '12', icon: UserPlus, color: 'text-emerald-600', bg: 'bg-emerald-50', link: '/recruitment' },
        { title: 'Leave Requests', value: '5', icon: Calendar, color: 'text-amber-600', bg: 'bg-amber-50', link: '/leave' },
        { title: 'Pending Reviews', value: '8', icon: Clock, color: 'text-rose-600', bg: 'bg-rose-50', link: '/performance' },
    ];

    // Stats cards for regular Employees
    const employeeStats = [
        { title: 'My Details', value: 'Profile', icon: User, color: 'text-indigo-600', bg: 'bg-indigo-50', link: '/my-info' },
        { title: 'Leaves Available', value: '14 Days', icon: Calendar, color: 'text-emerald-600', bg: 'bg-emerald-50', link: '/leave' },
        { title: 'Performance Reviews', value: 'Next in 3m', icon: Star, color: 'text-amber-600', bg: 'bg-amber-50', link: '/performance' },
        { title: 'My Claims', value: '2 Pending', icon: Briefcase, color: 'text-rose-600', bg: 'bg-rose-50', link: '/claim' },
    ];

    const statsToDisplay = isAdmin ? adminStats : employeeStats;

    const quickLinks = [
        { title: 'Employee Directory', desc: 'Find and connect with colleagues', icon: BookOpen, path: '/directory' },
        { title: 'Company Policy', desc: 'Read latest updates and rules', icon: BookOpen, path: '/directory' },
    ];

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Welcome Banner */}
            <div className="rounded-2xl p-8 text-white shadow-lg relative overflow-hidden bg-gradient-to-r from-indigo-600 to-purple-600">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 rounded-full mix-blend-overlay filter blur-2xl transform translate-x-1/2 -translate-y-1/2"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-white opacity-10 rounded-full mix-blend-overlay filter blur-2xl transform -translate-x-1/2 translate-y-1/2"></div>

                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold mb-2">Welcome back, {user?.firstName || user?.name || 'User'}! 👋</h1>
                        <p className="text-indigo-100 max-w-xl">
                            {isAdmin
                                ? "Here's the current overview of your organization. You have pending requests to review."
                                : "Here is your personal overview. Check your schedule, leaves, and requests."}
                        </p>
                    </div>
                    {isAdmin && (
                        <div>
                            <span className="px-4 py-1.5 rounded-full bg-white/20 text-white font-medium text-sm backdrop-blur-sm border border-white/30 uppercase tracking-widest shadow-sm">
                                {user?.role} View
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 tracking-tight">
                {statsToDisplay.map((stat, i) => (
                    <div
                        key={i}
                        className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer group"
                        onClick={() => stat.link && navigate(stat.link)}
                    >
                        <div className="flex justify-between items-start mb-4">
                            <div className={`p-3 rounded-xl ${stat.bg} ${stat.color} group-hover:scale-110 transition-transform`}>
                                <stat.icon size={24} />
                            </div>
                            <div className="p-1.5 rounded-lg text-slate-400 opacity-0 group-hover:opacity-100 group-hover:bg-slate-50 transition-all">
                                <ArrowRight size={16} />
                            </div>
                        </div>
                        <div>
                            <p className="text-slate-500 font-medium text-sm mb-1">{stat.title}</p>
                            <h3 className="text-3xl font-bold text-slate-800">{stat.value}</h3>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column (Wider) */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Activity Feed Placeholder */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-bold text-slate-800">
                                {isAdmin ? 'Organizational Activity' : 'My Recent Activity'}
                            </h3>
                            <button className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">View All</button>
                        </div>
                        <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                            <Clock size={48} className="mb-4 opacity-20" />
                            <p>Activity feed will appear here</p>
                            <span className="text-xs mt-2 text-slate-300">New feature coming soon</span>
                        </div>
                    </div>
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                    {/* Quick actions/links */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                        <h3 className="text-lg font-bold text-slate-800 mb-6">Quick Links</h3>
                        <div className="space-y-4">
                            {quickLinks.map((link, i) => (
                                <div
                                    key={i}
                                    onClick={() => navigate(link.path)}
                                    className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 hover:border-indigo-100 hover:bg-indigo-50/50 cursor-pointer transition-all group"
                                >
                                    <div className="p-2.5 bg-slate-50 group-hover:bg-white text-slate-600 group-hover:text-indigo-600 rounded-lg transition-colors border border-slate-200/50 group-hover:border-indigo-100">
                                        <link.icon size={20} />
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-slate-800 group-hover:text-indigo-900">{link.title}</h4>
                                        <p className="text-xs text-slate-500">{link.desc}</p>
                                    </div>
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
