import { useNavigate } from 'react-router-dom';
import { UserCheck, Rocket, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const OnboardingWelcome = () => {
    const navigate = useNavigate();
    const { user } = useAuth();

    const firstName = user?.firstName || user?.name?.split(' ')[0] || 'Member';

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background Decorative Elements */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-0">
                <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-100/50 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-100/50 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
            </div>

            <div className="max-w-4xl w-full bg-white rounded-3xl shadow-2xl overflow-hidden relative z-10 border border-slate-100">
                <div className="flex flex-col md:flex-row">
                    {/* Left Side: Visual/Branding */}
                    <div className="md:w-2/5 bg-gradient-to-br from-indigo-600 to-purple-700 p-12 text-white flex flex-col justify-between">
                        <div>
                            <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-8">
                                <Rocket size={32} className="text-white" />
                            </div>
                            <h2 className="text-3xl font-bold mb-4 tracking-tight">One Last Step.</h2>
                            <p className="text-indigo-100 text-lg leading-relaxed">
                                We're excited to have you on board! To access your dashboard and HR tools, we just need a few more details to set up your official profile.
                            </p>
                        </div>
                        <div className="mt-12 space-y-4">
                            <div className="flex items-center gap-3 text-sm font-medium text-white/80">
                                <ShieldCheck size={18} className="text-emerald-400" />
                                <span>Enterprise Grade Security</span>
                            </div>
                            <div className="flex items-center gap-3 text-sm font-medium text-white/80">
                                <Sparkles size={18} className="text-yellow-400" />
                                <span>Personalized Experience</span>
                            </div>
                        </div>
                    </div>

                    {/* Right Side: Welcome & CTA */}
                    <div className="md:w-3/5 p-12 flex flex-col justify-center">
                        <div className="mb-8">
                            <span className="inline-block px-4 py-1.5 bg-indigo-50 text-indigo-600 rounded-full text-sm font-bold tracking-wide uppercase mb-4">
                                Welcome to ITCS
                            </span>
                            <h1 className="text-4xl font-extrabold text-slate-900 mb-4 tracking-tight">
                                Hello, {firstName}! 
                            </h1>
                            <p className="text-slate-600 text-lg leading-relaxed">
                                Your account has been successfully verified. Now, let's complete your professional profile. This will take about 2-3 minutes.
                            </p>
                        </div>

                        <div className="space-y-6 mb-10">
                            {[
                                { 
                                    icon: UserCheck, 
                                    title: "Personal Identity", 
                                    desc: "Basic info like CNIC, DOB, and contact details." 
                                },
                                { 
                                    icon: Rocket, 
                                    title: "Job Details", 
                                    desc: "Your role, department, and joining documentation." 
                                }
                            ].map((item, i) => (
                                <div key={i} className="flex gap-4 group">
                                    <div className="flex-shrink-0 w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
                                        <item.icon size={22} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-800">{item.title}</h4>
                                        <p className="text-slate-500 text-sm">{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button 
                            onClick={() => navigate('/my-info?onboarding=true')}
                            className="group w-full flex items-center justify-center gap-3 px-8 py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-lg shadow-xl shadow-indigo-200 transition-all duration-300 transform hover:-translate-y-1 active:scale-[0.98]"
                        >
                            Complete Full Profile
                            <ArrowRight className="group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>
                </div>
            </div>

            <p className="mt-8 text-slate-400 text-sm font-medium">
                © 2026 ITCS Unified HRM • Trusted by Enterprise Teams
            </p>
        </div>
    );
};

export default OnboardingWelcome;
