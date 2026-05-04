
import { useNavigate } from 'react-router-dom';
import { Shield, ArrowLeft, Mail, Phone, MapPin, Scale, FileText } from 'lucide-react';

const Terms = () => {
    const navigate = useNavigate();

    return (
        <div style={{ fontFamily: "'Outfit', sans-serif" }} className="min-h-screen bg-white text-slate-900 selection:bg-indigo-100 selection:text-indigo-900 overflow-x-hidden">
            {/* Header / Navbar */}
            <nav className="w-full bg-white px-6 py-6 border-b border-slate-100">
                <div className="max-w-[1200px] mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white shadow-md">
                            <Shield size={20} strokeWidth={2.5} />
                        </div>
                        <div className="flex flex-col justify-center">
                            <h1 className="text-xl font-black tracking-tight leading-none uppercase text-slate-900">Terms of Service</h1>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">IT Consulting and Services (ITCS)</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => {
                            const isInternal = document.referrer.includes(window.location.host);
                            if (isInternal) {
                                navigate(-1);
                            } else {
                                navigate('/');
                            }
                        }}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-500 hover:text-primary transition-colors uppercase tracking-wider"
                    >
                        <ArrowLeft size={16} />
                        Back
                    </button>
                </div>
            </nav>

            <main className="max-w-[1200px] mx-auto px-6 py-16 space-y-24">
                
                {/* Hero Section */}
                <header className="max-w-2xl">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-primary/10 text-primary rounded-full text-[10px] font-black uppercase tracking-[0.2em] mb-8 border border-primary/20">
                        <Scale size={14} strokeWidth={3} /> Platform Usage Guidelines
                    </div>
                    <h1 className="text-[3.5rem] md:text-[4.5rem] font-black text-slate-900 tracking-tight leading-[1.1] mb-8">
                        Rules of engagement for <br />our <span className="text-primary">platform.</span>
                    </h1>
                    <p className="text-2xl text-slate-500 font-medium leading-relaxed max-w-lg">
                        These terms govern your access and use of the ITCS Human Resource Management system. Please review them carefully to understand your responsibilities.
                    </p>
                </header>

                {/* Section 1: Intro + Highlights */}
                <div className="grid lg:grid-cols-12 gap-6">
                    {/* Dark Intro Card */}
                    <div className="lg:col-span-6 bg-slate-900 rounded-[2.5rem] p-12 text-white shadow-2xl shadow-slate-200">
                        <h2 className="text-4xl font-black mb-8 tracking-tight">Introduction</h2>
                        <p className="text-slate-300 text-[18px] leading-loose font-medium">
                            By logging into the ITCS HRM platform, you agree to comply with company policies regarding data integrity, confidentiality, and professional usage. This system is provisioned exclusively for authorized personnel.
                        </p>
                    </div>

                    {/* Features (White Cards) */}
                    <div className="lg:col-span-6 grid sm:grid-cols-2 gap-6">
                        <div className="bg-white border border-slate-100 rounded-[2.5rem] p-10 shadow-lg shadow-slate-100/50 hover:-translate-y-1 transition-transform duration-300">
                            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mb-8">
                                <Shield size={28} strokeWidth={2.5} />
                            </div>
                            <h4 className="text-xl font-black text-slate-900 mb-3 tracking-tight">Credential Security</h4>
                            <p className="text-base text-slate-500 font-medium leading-relaxed">
                                You are strictly responsible for keeping your login credentials secure.
                            </p>
                        </div>
                        <div className="bg-white border border-slate-100 rounded-[2.5rem] p-10 shadow-lg shadow-slate-100/50 hover:-translate-y-1 transition-transform duration-300">
                            <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-500 mb-8">
                                <FileText size={28} strokeWidth={2.5} />
                            </div>
                            <h4 className="text-xl font-black text-slate-900 mb-3 tracking-tight">Data Accuracy</h4>
                            <p className="text-base text-slate-500 font-medium leading-relaxed">
                                Ensure all provided information, including documents and time logs, is strictly accurate.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Section 2: Acceptable Use Grid & Policy Banner */}
                <div className="grid lg:grid-cols-12 gap-6">
                    {/* Acceptable Use Grid */}
                    <div className="lg:col-span-8 bg-white border border-slate-100 rounded-[2.5rem] p-12 shadow-lg shadow-slate-100/50">
                        <div className="flex items-center gap-3 mb-10">
                            <div className="w-1.5 h-6 bg-primary rounded-full"></div>
                            <h3 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Acceptable Use Policy</h3>
                        </div>
                        
                        <div className="grid sm:grid-cols-2 gap-x-12 gap-y-10">
                            <div>
                                <h5 className="text-[13px] font-black text-primary uppercase tracking-widest mb-3">Access Limits</h5>
                                <p className="text-base text-slate-600 font-medium leading-relaxed">You may solely access, review, and modify information directly relevant to your employment scope and organizational role.</p>
                            </div>
                            <div>
                                <h5 className="text-[13px] font-black text-primary uppercase tracking-widest mb-3">Confidentiality</h5>
                                <p className="text-base text-slate-600 font-medium leading-relaxed">Employee directories, internal communications, and proprietary documents must strictly not be distributed outside the company.</p>
                            </div>
                            <div>
                                <h5 className="text-[13px] font-black text-primary uppercase tracking-widest mb-3">Attendance Integrity</h5>
                                <p className="text-base text-slate-600 font-medium leading-relaxed">Any attempt to alter, manipulate, or spoof biometric punches or manual attendance logs is considered a severe violation.</p>
                            </div>
                            <div>
                                <h5 className="text-[13px] font-black text-primary uppercase tracking-widest mb-3">System Integrity</h5>
                                <p className="text-base text-slate-600 font-medium leading-relaxed">You must not attempt to disrupt, hack, reverse-engineer, or misuse the software infrastructure or its dependent APIs in any capacity.</p>
                            </div>
                        </div>
                    </div>

                    {/* Policy Banner */}
                    <div className="lg:col-span-4 bg-slate-900 rounded-[2.5rem] p-12 text-white flex flex-col justify-between shadow-xl shadow-slate-800/30 relative overflow-hidden">
                        {/* Glow effect */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 rounded-full blur-3xl -ml-10 -mt-10 pointer-events-none"></div>
                        
                        <div className="relative z-10">
                            <h3 className="text-3xl font-black mb-6 tracking-tight">Zero Tolerance</h3>
                            <p className="text-slate-300 text-[18px] font-medium leading-loose">
                                Security breaches and unauthorized data distribution carry strict disciplinary actions, up to and including termination and legal recourse.
                            </p>
                        </div>
                        <div className="relative z-10 mt-16 text-[11px] font-black text-white/40 uppercase tracking-[0.3em]">
                            Corporate Integrity First
                        </div>
                    </div>
                </div>

                {/* Section 3: Administrative Rights */}
                <div className="py-8 text-center max-w-[1100px] mx-auto w-full">
                    <h2 className="text-4xl font-black text-slate-900 mb-16 tracking-tight">
                        Administrative <span className="text-primary">Rights.</span>
                    </h2>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        {[
                            { title: 'Audit Logs', desc: 'System actively monitors and logs functional interactions.' },
                            { title: 'Revocation', desc: 'ITCS reserves the right to suspend or terminate access.' },
                            { title: 'Overrides', desc: 'Admins maintain the authority to override incorrect data.' },
                            { title: 'Updates', desc: 'Policies may be updated routinely by HR management.' }
                        ].map((item, i) => (
                            <div key={i} className="bg-white rounded-[1.5rem] p-8 flex flex-col items-start justify-center min-h-[200px] text-left shadow-xl shadow-slate-200/60 border border-slate-50 hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-2 transition-all duration-300">
                                <span className="text-[16px] font-black text-primary mb-auto bg-primary/10 w-12 h-12 rounded-[0.8rem] flex items-center justify-center">
                                    {i + 1}
                                </span>
                                <div className="mt-10">
                                    <h4 className="text-[22px] font-black text-slate-900 mb-3 tracking-tight">{item.title}</h4>
                                    <p className="text-[14px] text-slate-500 font-medium leading-relaxed">{item.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Section 4: Bottom Grid */}
                <div className="grid lg:grid-cols-12 gap-6">
                    {/* Compliance Tags */}
                    <div className="lg:col-span-7 bg-white border border-slate-100 rounded-[2.5rem] p-12 shadow-lg shadow-slate-100/50">
                        <h2 className="text-3xl font-black text-slate-900 mb-10 tracking-tight">Compliance Areas</h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {['Data Privacy', 'Fair Usage', 'Non-Disclosure', 'Intellectual Prop.', 'Access Logging', 'Code of Conduct'].map((tag) => (
                                <div key={tag} className="bg-slate-50 rounded-[1rem] py-5 px-3 text-center">
                                    <span className="text-[12px] font-black text-slate-600 uppercase tracking-widest">{tag}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Need Help */}
                    <div className="lg:col-span-5 bg-slate-900 rounded-[2.5rem] p-12 text-white shadow-2xl shadow-slate-200">
                        <h2 className="text-3xl font-black text-primary-light mb-4 tracking-tight line-clamp-1">Report an Issue</h2>
                        <p className="text-slate-400 text-base font-medium mb-10">Contact the administration regarding concerns.</p>
                        
                        <div className="space-y-8">
                            <div className="flex items-center gap-5">
                                <div className="w-14 h-14 bg-slate-800 rounded-[1rem] flex items-center justify-center text-slate-400 shrink-0">
                                    <Mail size={22} />
                                </div>
                                <div>
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">HR Email</p>
                                    <a href="mailto:hr@itcs.com.pk" className="text-[17px] font-bold text-white hover:text-blue-300 transition-colors">hr@itcs.com.pk</a>
                                </div>
                            </div>
                            <div className="flex items-center gap-5">
                                <div className="w-14 h-14 bg-slate-800 rounded-[1rem] flex items-center justify-center text-slate-400 shrink-0">
                                    <Phone size={22} />
                                </div>
                                <div>
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">Company Desk</p>
                                    <p className="text-[17px] font-bold text-white">021 111-482-711</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-5">
                                <div className="w-14 h-14 bg-slate-800 rounded-[1rem] flex items-center justify-center text-slate-400 shrink-0">
                                    <MapPin size={22} />
                                </div>
                                <div>
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">Office</p>
                                    <p className="text-[17px] font-bold text-white">6/K Block 2, Karachi</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </main>
        </div>
    );
};

export default Terms;
