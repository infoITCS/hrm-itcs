import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Shield,
    BookOpen,
    Building2,
    Briefcase,
    FileText,
    HeartHandshake,
    ShieldAlert,
    Clock,
    Award,
    AlertOctagon,
    ArrowLeft,
    Search,
    ChevronUp,
    Printer,
    CheckCircle2,
    ChevronRight,
    Sparkles,
    Users,
    DollarSign,
    Lock,
} from 'lucide-react';
import logo from '../../assets/logo.png';
import CompanyProfileModal from '../../components/CompanyProfileModal';

interface Section {
    id: string;
    num: string;
    title: string;
    icon: any;
    keywords: string[];
}

const SECTIONS: Section[] = [
    { id: 'sec-01', num: '01', title: 'Introduction', icon: BookOpen, keywords: ['mission', 'vision', 'values', 'islam', 'services', 'cloud', 'cybersecurity', 'overview', 'purpose', 'profile'] },
    { id: 'sec-02', num: '02', title: 'Business Operations', icon: Building2, keywords: ['business', 'communication', 'compliance', 'respect', 'managers', 'employees', 'unacceptable', 'confidentiality', 'personal records', 'assets'] },
    { id: 'sec-03', num: '03', title: 'Employment', icon: Users, keywords: ['recruitment', 'probation', 'permanent', 'contract', 'internship', 'appointment', 'orientation', 'attendance', 'wfh', 'resignation', 'termination'] },
    { id: 'sec-04', num: '04', title: 'Terms & Conditions of Employment', icon: Briefcase, keywords: ['dress code', 'working hours', 'lunch', 'prayer', 'overtime', 'technical', 'compensation', 'benefits', 'opd', 'medical', 'provident fund', 'loans', 'sim'] },
    { id: 'sec-05', num: '05', title: 'Harassment Policy', icon: ShieldAlert, keywords: ['harassment', 'bullying', 'sexual', 'reporting', 'confidentiality', 'sanctions', 'misconduct'] },
    { id: 'sec-06', num: '06', title: 'HSE Policy', icon: Shield, keywords: ['hse', 'health', 'safety', 'environment', 'risk', 'emergency', 'compliance'] },
    { id: 'sec-07', num: '07', title: 'Employee Tardiness & Leave Policy', icon: Clock, keywords: ['tardiness', 'late', 'grace period', 'leave', 'sick', 'annual', 'half-day', 'maternity', 'paternity', 'meal allowance'] },
    { id: 'sec-08', num: '08', title: 'Performance Management', icon: Award, keywords: ['performance', 'training', 'development', 'certifications', 'career', 'appraisal', 'smart'] },
    { id: 'sec-09', num: '09', title: 'Grievance and Discipline', icon: AlertOctagon, keywords: ['grievance', 'discipline', 'procedure', 'negligence', 'misconduct', 'committee'] },
];

export default function CompanyPolicy() {
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeSection, setActiveSection] = useState('sec-01');
    const [scrollProgress, setScrollProgress] = useState(0);
    const [showBackToTop, setShowBackToTop] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            const totalScroll = document.documentElement.scrollHeight - window.innerHeight;
            const currentScroll = window.scrollY;
            setScrollProgress(totalScroll > 0 ? (currentScroll / totalScroll) * 100 : 0);
            setShowBackToTop(currentScroll > 400);

            // Determine active section based on scroll position
            for (const s of SECTIONS) {
                const el = document.getElementById(s.id);
                if (el) {
                    const rect = el.getBoundingClientRect();
                    if (rect.top <= 180 && rect.bottom >= 180) {
                        setActiveSection(s.id);
                        break;
                    }
                }
            }
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const scrollToSection = (id: string) => {
        const el = document.getElementById(id);
        if (el) {
            const yOffset = -90;
            const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
            window.scrollTo({ top: y, behavior: 'smooth' });
            setActiveSection(id);
        }
    };

    const filteredSections = useMemo(() => {
        if (!searchQuery.trim()) return SECTIONS;
        const q = searchQuery.toLowerCase();
        return SECTIONS.filter(s =>
            s.title.toLowerCase().includes(q) ||
            s.num.includes(q) ||
            s.keywords.some(k => k.includes(q))
        );
    }, [searchQuery]);

    return (
        <div className="min-h-screen bg-[#0b0714] text-[#f4f2fa] font-sans antialiased selection:bg-purple-500 selection:text-white relative">
            <CompanyProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} />

            {/* Scroll Progress Bar */}
            <div
                className="fixed top-0 left-0 h-1 bg-gradient-to-r from-purple-600 via-fuchsia-500 to-pink-500 z-50 transition-all duration-75 shadow-lg shadow-purple-500/50"
                style={{ width: `${scrollProgress}%` }}
            />

            {/* Top Navigation Header */}
            <header className="sticky top-0 z-40 bg-[#0b0714]/80 backdrop-blur-xl border-b border-white/10 px-4 sm:px-8 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-purple-300 hover:text-white transition-all border border-white/10 flex items-center gap-1.5 text-xs font-semibold"
                        title="Go back"
                    >
                        <ArrowLeft size={16} />
                        <span className="hidden sm:inline">Back</span>
                    </button>
                    <div className="h-5 w-px bg-white/15 mx-1" />
                    <div className="flex items-center gap-2.5">
                        <img src={logo} alt="ITCS Logo" className="h-6 sm:h-7 w-auto object-contain" />
                        <span className="text-xs font-black tracking-wider uppercase text-purple-400">Policy Manual</span>
                    </div>
                </div>

                <div className="flex items-center gap-2.5 sm:gap-3">
                    <div className="relative hidden md:block w-56 lg:w-64">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-300/60" />
                        <input
                            type="text"
                            placeholder="Search policies (e.g. Leave, PF, OPD)..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-white/5 border border-white/15 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-purple-200/40 focus:outline-none focus:border-purple-400 transition-colors"
                        />
                    </div>
                    <button
                        onClick={() => setShowProfileModal(true)}
                        className="px-3 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 hover:text-white transition-all border border-purple-500/30 flex items-center gap-1.5 text-xs font-semibold shadow-sm"
                        title="View Company Profile (PDF)"
                    >
                        <Building2 size={15} className="text-purple-300" />
                        <span className="hidden sm:inline">Company Profile</span>
                    </button>
                    <button
                        onClick={() => window.print()}
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-purple-300 hover:text-white transition-all border border-white/10 flex items-center gap-1.5 text-xs font-semibold"
                        title="Print / Save as PDF"
                    >
                        <Printer size={15} />
                        <span className="hidden sm:inline">Print</span>
                    </button>
                </div>
            </header>

            {/* Background Ambient Glows */}
            <div className="fixed top-0 right-0 w-[50vw] h-[50vw] bg-purple-600/10 rounded-full blur-3xl pointer-events-none -z-10" />
            <div className="fixed bottom-0 left-0 w-[45vw] h-[45vw] bg-indigo-600/10 rounded-full blur-3xl pointer-events-none -z-10" />

            <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 sm:py-12">
                {/* Hero Banner */}
                <div className="mb-12 text-center max-w-3xl mx-auto space-y-4">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-bold tracking-wide uppercase">
                        <Sparkles size={14} className="text-purple-400" />
                        Human Resources · Company-Wide Standards
                    </div>
                    <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-tight">
                        ITCS <span className="bg-gradient-to-r from-purple-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent">Policy Manual</span>
                    </h1>
                    <p className="text-sm sm:text-base text-purple-100/70 max-w-2xl mx-auto leading-relaxed">
                        The principles, standards, and operating procedures that guide how we work, treat one another, and grow together across Karachi, Lahore, and Islamabad.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-xs text-purple-200/80">
                        <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg">Applies to: <b>All Staff</b></span>
                        <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg">Offices: <b>Karachi · Lahore · Islamabad</b></span>
                        <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg">Sections: <b>9 Sections</b></span>
                        <button
                            onClick={() => setShowProfileModal(true)}
                            className="px-3 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 hover:text-white border border-purple-500/30 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                            <Building2 size={13} className="text-purple-400" />
                            <span>Company Profile (PDF)</span>
                        </button>
                    </div>
                </div>

                {/* Main Content Layout with Sidebar Index */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* Left Sticky TOC Index */}
                    <div className="lg:col-span-1">
                        <div className="sticky top-20 bg-[#170f29] border border-white/10 rounded-2xl p-4 shadow-xl space-y-2">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-purple-400 px-2 mb-2 flex items-center justify-between">
                                <span>Table of Contents</span>
                                <span className="text-[10px] text-purple-300/50">9 Sections</span>
                            </div>

                            {/* Mobile search bar */}
                            <div className="relative md:hidden mb-3">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-300/60" />
                                <input
                                    type="text"
                                    placeholder="Filter sections..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-white/5 border border-white/15 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-purple-200/40 focus:outline-none focus:border-purple-400"
                                />
                            </div>

                            <nav className="space-y-1 max-h-[calc(100vh-14rem)] overflow-y-auto pr-1">
                                {filteredSections.map((sec) => {
                                    const isActive = activeSection === sec.id;
                                    return (
                                        <button
                                            key={sec.id}
                                            onClick={() => scrollToSection(sec.id)}
                                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs font-semibold transition-all group ${
                                                isActive
                                                    ? 'bg-gradient-to-r from-purple-600/30 to-fuchsia-600/30 text-white border border-purple-500/40 shadow-sm'
                                                    : 'text-purple-200/70 hover:bg-white/5 hover:text-white'
                                            }`}
                                        >
                                            <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-extrabold flex-shrink-0 ${
                                                isActive ? 'bg-purple-500 text-white shadow-sm' : 'bg-white/5 text-purple-300 border border-white/10 group-hover:border-purple-400/40'
                                            }`}>
                                                {sec.num}
                                            </span>
                                            <span className="truncate flex-1">{sec.title}</span>
                                            <ChevronRight size={14} className={`text-purple-400/40 transition-transform ${isActive ? 'text-purple-300 translate-x-0.5' : 'group-hover:translate-x-0.5'}`} />
                                        </button>
                                    );
                                })}
                            </nav>

                            <div className="pt-3 mt-3 border-t border-white/10">
                                <button
                                    onClick={() => setShowProfileModal(true)}
                                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs font-semibold bg-white/5 text-purple-200 hover:bg-purple-600/20 hover:text-white border border-white/10 hover:border-purple-500/30 transition-all group"
                                >
                                    <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-extrabold bg-purple-500/20 text-purple-300 border border-purple-500/30 group-hover:bg-purple-500 group-hover:text-white transition-colors">
                                        <Building2 size={12} />
                                    </span>
                                    <span className="truncate flex-1">Company Profile (PDF)</span>
                                    <ChevronRight size={14} className="text-purple-400/40 group-hover:text-purple-300 group-hover:translate-x-0.5 transition-transform" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Right Content Sections */}
                    <div className="lg:col-span-3 space-y-12">

                        {/* SECTION 01 */}
                        <section id="sec-01" className="bg-[#170f29] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6 scroll-mt-24">
                            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-fuchsia-600 flex items-center justify-center text-white shadow-md">
                                    <BookOpen size={20} />
                                </div>
                                <div>
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-purple-400">Section 01</div>
                                    <h2 className="text-xl sm:text-2xl font-bold text-white">Introduction</h2>
                                </div>
                            </div>

                            <div className="space-y-6 text-sm text-purple-100/80 leading-relaxed">
                                <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-900/30 via-indigo-900/30 to-fuchsia-900/30 border border-purple-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <Building2 size={16} className="text-purple-400" />
                                            <span className="font-bold text-white text-sm">Official ITCS Company Profile</span>
                                        </div>
                                        <p className="text-xs text-purple-200/70">
                                            View comprehensive details about our corporate overview, services, certifications, and leadership document.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setShowProfileModal(true)}
                                        className="px-4 py-2 bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-purple-500/25 shrink-0 flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
                                    >
                                        <FileText size={14} />
                                        <span>Open PDF Document</span>
                                    </button>
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-white mb-1.5 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-purple-400" /> Mission
                                    </h3>
                                    <p>Our Mission is to uplift businesses with advanced technology solutions and skilled consulting services, helping them reach their strategic objectives and navigate their digital evolution.</p>
                                </div>

                                <div>
                                    <h3 className="text-base font-bold text-white mb-1.5 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-purple-400" /> Vision
                                    </h3>
                                    <p>Our vision is to be the global frontrunners in IT consulting, services, and solutions. We're dedicated to delivering real business value through our expertise and innovative approach. Let's forge lasting partnerships based on trust, respect, and shared success.</p>
                                </div>

                                <div>
                                    <h3 className="text-base font-bold text-white mb-1.5 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-purple-400" /> Our Core Values
                                    </h3>
                                    <p className="bg-purple-950/40 border border-purple-500/20 p-4 rounded-xl text-purple-100">
                                        Our Ethos is based on the Egalitarian principles and Teachings of <b>ISLAM</b>. We, at ITCS, steadfastly adhere to the principles of Islam in our dealings. We shall never resort to bribery, falsehoods, deceit, or the allure of interest. Our commitment to honest dealings knows no compromise. From our very inception, we have held these principles dear, and God willing, we shall maintain this unwavering course for all time.
                                    </p>
                                </div>

                                <div>
                                    <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-purple-400" /> Services We Provide
                                    </h3>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                                        {['Cloud', 'Cybersecurity', 'Consulting', 'Enterprise Solutions', 'IT Services', 'Network Solutions'].map((svc) => (
                                            <div key={svc} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-semibold text-purple-200 flex items-center gap-2">
                                                <CheckCircle2 size={14} className="text-purple-400 flex-shrink-0" />
                                                {svc}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-base font-bold text-white mb-1.5 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-purple-400" /> Overview & Purpose of Manual
                                    </h3>
                                    <p className="mb-2">Our human resource policy manual is designed to provide clear rules and regulations regarding organization management, daily operational processes, and employee interactions. It reflects our business ethics across Finance, Personnel, and Administration.</p>
                                    <p className="text-purple-300 font-semibold">The rules outlined in this policy manual apply to all staff.</p>
                                </div>
                            </div>
                        </section>

                        {/* SECTION 02 */}
                        <section id="sec-02" className="bg-[#170f29] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6 scroll-mt-24">
                            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-md">
                                    <Building2 size={20} />
                                </div>
                                <div>
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-purple-400">Section 02</div>
                                    <h2 className="text-xl sm:text-2xl font-bold text-white">Business Operations</h2>
                                </div>
                            </div>

                            <div className="space-y-6 text-sm text-purple-100/80 leading-relaxed">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                                        <h4 className="font-bold text-white mb-1">Ethical Business</h4>
                                        <p className="text-xs text-purple-200/70">Fulfill promises and commitments with honesty. Standard Operating Procedures (SOPs) must be adhered to by every department.</p>
                                    </div>
                                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                                        <h4 className="font-bold text-white mb-1">Open Communication</h4>
                                        <p className="text-xs text-purple-200/70">Culture where everyone's opinion is respected. Employees may express concerns without fear of negative repercussions.</p>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-purple-400" /> Respect for Others
                                    </h3>
                                    <p className="mb-3">We maintain a culture of fairness, equality, and respect — irrespective of age, rank, race, or color:</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {[
                                            'Courtesy, kindness, and politeness',
                                            'Sharing of thoughts and constructive ideas',
                                            'Listening to one another and sharing experiences',
                                            'Avoiding insults and derogatory behavior',
                                            'Strictly no use of foul language',
                                            "Respecting each other's culture and values"
                                        ].map((item, idx) => (
                                            <div key={idx} className="flex items-center gap-2 text-xs bg-white/5 border border-white/10 rounded-xl p-2.5 text-purple-200">
                                                <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />
                                                {item}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="bg-purple-950/40 border border-purple-500/20 rounded-2xl p-4">
                                        <h4 className="font-bold text-purple-200 mb-1.5">Responsibilities of Managers</h4>
                                        <ul className="text-xs space-y-1 text-purple-200/80 list-disc list-inside">
                                            <li>Promotion of positive culture in department</li>
                                            <li>Maintain a friendly working environment</li>
                                            <li>Quick & unbiased resolution of disputes</li>
                                        </ul>
                                    </div>
                                    <div className="bg-purple-950/40 border border-purple-500/20 rounded-2xl p-4">
                                        <h4 className="font-bold text-purple-200 mb-1.5">Responsibilities of Employees</h4>
                                        <ul className="text-xs space-y-1 text-purple-200/80 list-disc list-inside">
                                            <li>Work efficiently toward company goals</li>
                                            <li>Show respect, follow rules and orders</li>
                                            <li>Work as a unit; protect company assets</li>
                                        </ul>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-base font-bold text-white mb-1.5 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-purple-400" /> Records, Confidentiality & Assets
                                    </h3>
                                    <p className="mb-2">Company records and client data must be kept confidential at all times. Personal files (CNIC, degrees, salary, appraisals) are accessible strictly to authorized HR management.</p>
                                    <p className="text-xs text-purple-300">Personal use of company physical, digital, financial, or intellectual assets is strictly prohibited.</p>
                                </div>
                            </div>
                        </section>

                        {/* SECTION 03 */}
                        <section id="sec-03" className="bg-[#170f29] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6 scroll-mt-24">
                            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-fuchsia-600 to-pink-600 flex items-center justify-center text-white shadow-md">
                                    <Users size={20} />
                                </div>
                                <div>
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-purple-400">Section 03</div>
                                    <h2 className="text-xl sm:text-2xl font-bold text-white">Employment</h2>
                                </div>
                            </div>

                            <div className="space-y-6 text-sm text-purple-100/80 leading-relaxed">
                                <div>
                                    <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-purple-400" /> Types of Appointment
                                    </h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5">
                                            <h4 className="font-bold text-white text-xs uppercase tracking-wide text-purple-300 mb-1">Probation (90 Days)</h4>
                                            <p className="text-xs text-purple-200/70">Newly hired individuals are under observation for the first 90 days. Satisfactory performance leads to permanent confirmation.</p>
                                        </div>
                                        <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5">
                                            <h4 className="font-bold text-white text-xs uppercase tracking-wide text-purple-300 mb-1">Permanent</h4>
                                            <p className="text-xs text-purple-200/70">Confirmed after successful probation. Termination requires serious misconduct with one month's prior notice.</p>
                                        </div>
                                        <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5">
                                            <h4 className="font-bold text-white text-xs uppercase tracking-wide text-purple-300 mb-1">Contract</h4>
                                            <p className="text-xs text-purple-200/70">Hired for a specified period (max 1 year). Reapplication required to continue post-contract.</p>
                                        </div>
                                        <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5">
                                            <h4 className="font-bold text-white text-xs uppercase tracking-wide text-purple-300 mb-1">Internship</h4>
                                            <p className="text-xs text-purple-200/70">Paid or unpaid, based on nature and qualifications of the applicant.</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-purple-950/40 border border-purple-500/20 rounded-2xl p-4 space-y-2">
                                    <h4 className="font-bold text-white text-xs uppercase tracking-wider text-purple-300">Attendance & Work From Home (WFH)</h4>
                                    <p className="text-xs text-purple-200/80 leading-relaxed">
                                        Standard working hours are <b>8 AM–5 PM</b> or <b>9 AM–6 PM</b>, Monday to Friday.
                                    </p>
                                    <p className="text-xs text-purple-200/80 leading-relaxed">
                                        <b>Work from Home (WFH):</b> On WFH days (including optional WFH Fridays), employees must be online in the designated daily Teams meeting at or before start time. <b>Any login after the scheduled start time — even by one minute — is considered late; grace period does not apply to WFH.</b>
                                    </p>
                                    <p className="text-xs text-purple-200/80 leading-relaxed">
                                        <b>Leave Exhaustion:</b> Once allocated leave is fully used, additional leaves are unpaid and uncompensated.
                                    </p>
                                </div>

                                <div>
                                    <h3 className="text-base font-bold text-white mb-1.5 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-purple-400" /> Resignation & Termination Policy
                                    </h3>
                                    <p className="text-xs text-purple-200/80">Permanent staff: 1 month prior notice. Probationary staff: 24 hours notice and return of assets. Termination for cause follows formal notice and settlement for time served.</p>
                                </div>
                            </div>
                        </section>

                        {/* SECTION 04 */}
                        <section id="sec-04" className="bg-[#170f29] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6 scroll-mt-24">
                            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md">
                                    <Briefcase size={20} />
                                </div>
                                <div>
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-purple-400">Section 04</div>
                                    <h2 className="text-xl sm:text-2xl font-bold text-white">Terms & Conditions of Employment</h2>
                                </div>
                            </div>

                            <div className="space-y-6 text-sm text-purple-100/80 leading-relaxed">
                                <div>
                                    <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-purple-400" /> Dress Code
                                    </h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                                            <span className="font-bold text-purple-300 block mb-1">For Men</span>
                                            Well-pressed clothes, polished shoes. No flip-flops or athletic shoes with formal wear. No V-necks with inappropriate text/pictures, no shorts or sleeveless shirts.
                                        </div>
                                        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                                            <span className="font-bold text-purple-300 block mb-1">For Women</span>
                                            Abaya worn on a daily basis. No flip-flops — proper shoes or heels. Immodest dressing is strictly not allowed.
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-purple-400" /> Employee Benefits Package
                                    </h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        <div className="bg-white/5 border border-white/10 rounded-xl p-3.5">
                                            <DollarSign size={16} className="text-emerald-400 mb-1" />
                                            <div className="font-bold text-white text-xs">Salary & Wages</div>
                                            <div className="text-[11px] text-purple-200/70 mt-1">Competitive, benchmarked against industry standards. Reviewed annually.</div>
                                        </div>
                                        <div className="bg-white/5 border border-white/10 rounded-xl p-3.5">
                                            <HeartHandshake size={16} className="text-pink-400 mb-1" />
                                            <div className="font-bold text-white text-xs">OPD Medical Coverage</div>
                                            <div className="text-[11px] text-purple-200/70 mt-1">Up to <b>PKR 60,000/year</b> (accruing at PKR 5,000/month) claimable via expense claim portal.</div>
                                        </div>
                                        <div className="bg-white/5 border border-white/10 rounded-xl p-3.5">
                                            <Building2 size={16} className="text-purple-400 mb-1" />
                                            <div className="font-bold text-white text-xs">Provident Fund</div>
                                            <div className="text-[11px] text-purple-200/70 mt-1"><b>15%</b> accumulated via Share Plan with a 3-year maturity period.</div>
                                        </div>
                                        <div className="bg-white/5 border border-white/10 rounded-xl p-3.5">
                                            <Award size={16} className="text-amber-400 mb-1" />
                                            <div className="font-bold text-white text-xs">Training & Certifications</div>
                                            <div className="text-[11px] text-purple-200/70 mt-1">1 certification/year supported and reimbursed upon successful completion.</div>
                                        </div>
                                        <div className="bg-white/5 border border-white/10 rounded-xl p-3.5">
                                            <FileText size={16} className="text-cyan-400 mb-1" />
                                            <div className="font-bold text-white text-xs">Postpaid SIM & Fuel</div>
                                            <div className="text-[11px] text-purple-200/70 mt-1">Postpaid SIM provided with bill covered. Fuel allowance provided per role eligibility.</div>
                                        </div>
                                        <div className="bg-white/5 border border-white/10 rounded-xl p-3.5">
                                            <Lock size={16} className="text-indigo-400 mb-1" />
                                            <div className="font-bold text-white text-xs">Employee Loans</div>
                                            <div className="text-[11px] text-purple-200/70 mt-1">Loan up to accumulated PF balance, repayable in 6 equal monthly installments.</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
                                    <h4 className="font-bold text-purple-300 text-xs uppercase tracking-wide">Overtime Policy — Technical Team</h4>
                                    <p className="text-xs text-purple-200/80">Support outside normal hours requires prior approval and ticket generation. For genuine emergencies, notify the WhatsApp group immediately, generate the ticket, and document the task upon start. Overtime applies only to customers with active support contracts.</p>
                                </div>
                            </div>
                        </section>

                        {/* SECTION 05 */}
                        <section id="sec-05" className="bg-[#170f29] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6 scroll-mt-24">
                            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-600 to-pink-600 flex items-center justify-center text-white shadow-md">
                                    <ShieldAlert size={20} />
                                </div>
                                <div>
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-purple-400">Section 05</div>
                                    <h2 className="text-xl sm:text-2xl font-bold text-white">Harassment Policy</h2>
                                </div>
                            </div>

                            <div className="space-y-4 text-sm text-purple-100/80 leading-relaxed">
                                <p>ITCS maintains a zero-tolerance policy against all forms of sexual harassment, bullying, and intimidation. This applies equally to all genders. We adhere strictly to the <b>Protection Against Harassment Law, 2010</b>.</p>

                                <div className="bg-rose-950/30 border border-rose-500/20 rounded-2xl p-4 space-y-2 text-xs text-rose-200">
                                    <div className="font-bold text-rose-300 uppercase tracking-wide">Harassment & Bullying Violations:</div>
                                    <ul className="list-disc list-inside space-y-1">
                                        <li>Discrimination based on gender, age, race, religious beliefs, or marital status.</li>
                                        <li>Misuse of organizational position to bully, insult, discriminate, or manipulate.</li>
                                        <li>Targeted or repeated conduct that is humiliating, offensive, or intimidating.</li>
                                    </ul>
                                </div>

                                <p className="text-xs text-purple-200/70">
                                    <b>Reporting & Confidentiality:</b> Reports should be made promptly to the immediate supervisor or HR Management. All proceedings are kept strictly confidential with impartial hearings. False or malicious complaints are subject to disciplinary action.
                                </p>
                            </div>
                        </section>

                        {/* SECTION 06 */}
                        <section id="sec-06" className="bg-[#170f29] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6 scroll-mt-24">
                            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center text-white shadow-md">
                                    <Shield size={20} />
                                </div>
                                <div>
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-purple-400">Section 06</div>
                                    <h2 className="text-xl sm:text-2xl font-bold text-white">HSE Policy (Health, Safety & Environment)</h2>
                                </div>
                            </div>

                            <div className="space-y-4 text-sm text-purple-100/80 leading-relaxed">
                                <p>Operating since 2010 in Karachi, Lahore, and Islamabad, ITCS prioritizes workplace safety, emergency readiness, and environmental responsibility.</p>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                                    <div className="bg-white/5 border border-white/10 rounded-xl p-3.5">
                                        <div className="font-bold text-emerald-400 mb-1">Health & Safety</div>
                                        <p className="text-purple-200/70">Hazard-free workplace, training, and emergency drills to prevent accidents.</p>
                                    </div>
                                    <div className="bg-white/5 border border-white/10 rounded-xl p-3.5">
                                        <div className="font-bold text-teal-400 mb-1">Environmental</div>
                                        <p className="text-purple-200/70">Waste reduction, energy conservation, recycling, and responsible resource utilization.</p>
                                    </div>
                                    <div className="bg-white/5 border border-white/10 rounded-xl p-3.5">
                                        <div className="font-bold text-purple-400 mb-1">Compliance</div>
                                        <p className="text-purple-200/70">Periodic reviews and compliance with national occupational safety laws.</p>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* SECTION 07 */}
                        <section id="sec-07" className="bg-[#170f29] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6 scroll-mt-24">
                            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-md">
                                    <Clock size={20} />
                                </div>
                                <div>
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-purple-400">Section 07</div>
                                    <h2 className="text-xl sm:text-2xl font-bold text-white">Employee Tardiness & Leave Policy</h2>
                                </div>
                            </div>

                            <div className="space-y-6 text-sm text-purple-100/80 leading-relaxed">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                                        <div className="text-2xl sm:text-3xl font-black text-amber-400">10</div>
                                        <div className="text-xs text-purple-200/70 mt-1 font-semibold">Sick Leave Days / Year</div>
                                    </div>
                                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                                        <div className="text-2xl sm:text-3xl font-black text-purple-400">20</div>
                                        <div className="text-xs text-purple-200/70 mt-1 font-semibold">Annual Leave Days / Year</div>
                                    </div>
                                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                                        <div className="text-2xl sm:text-3xl font-black text-emerald-400">1 Wk</div>
                                        <div className="text-xs text-purple-200/70 mt-1 font-semibold">Paid Paternity Leave</div>
                                    </div>
                                </div>

                                <div className="bg-amber-950/30 border border-amber-500/20 rounded-2xl p-4 space-y-2 text-xs">
                                    <h4 className="font-bold text-amber-300 uppercase tracking-wide">Tardiness Rules & Grace Period</h4>
                                    <ul className="list-disc list-inside space-y-1 text-purple-100">
                                        <li><b>Full Hours Requirement:</b> Employees must complete their full 9 working hours regardless of arrival time (e.g. clocking in at 9:13 AM requires clocking out at 6:13 PM).</li>
                                        <li><b>Late Thresholds:</b> More than 30 minutes late is marked "Late". More than 1 hour late is marked as "Leave".</li>
                                        <li><b>3rd Late Arrival:</b> A 3rd late arrival in a month counts as a full day's leave.</li>
                                        <li><b>Meal Allowance:</b> Late arrivals beyond the grace period or half-days forfeit the meal allowance for that day.</li>
                                    </ul>
                                </div>

                                <div>
                                    <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-purple-400" /> Maternity & Paternity Leave
                                    </h3>
                                    <div className="overflow-x-auto border border-white/10 rounded-xl">
                                        <table className="w-full text-left text-xs">
                                            <thead className="bg-white/5 text-purple-300 font-bold border-b border-white/10">
                                                <tr>
                                                    <th className="p-3">Category</th>
                                                    <th className="p-3">Child / Event</th>
                                                    <th className="p-3">Paid Entitlement</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/10 text-purple-100/80">
                                                <tr>
                                                    <td className="p-3 font-semibold text-white" rowSpan={3}>Maternity Leave</td>
                                                    <td className="p-3">First Child</td>
                                                    <td className="p-3 font-bold text-purple-300">180 days (6 months)</td>
                                                </tr>
                                                <tr>
                                                    <td className="p-3">Second Child</td>
                                                    <td className="p-3 font-bold text-purple-300">120 days (4 months)</td>
                                                </tr>
                                                <tr>
                                                    <td className="p-3">Third Child</td>
                                                    <td className="p-3 font-bold text-purple-300">90 days (3 months)</td>
                                                </tr>
                                                <tr>
                                                    <td className="p-3 font-semibold text-white">Paternity Leave</td>
                                                    <td className="p-3">Per Child</td>
                                                    <td className="p-3 font-bold text-emerald-400">1 week (7 business days)</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* SECTION 08 */}
                        <section id="sec-08" className="bg-[#170f29] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6 scroll-mt-24">
                            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-fuchsia-600 flex items-center justify-center text-white shadow-md">
                                    <Award size={20} />
                                </div>
                                <div>
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-purple-400">Section 08</div>
                                    <h2 className="text-xl sm:text-2xl font-bold text-white">Performance Management</h2>
                                </div>
                            </div>

                            <div className="space-y-6 text-sm text-purple-100/80 leading-relaxed">
                                <p>Performance management at ITCS provides clear expectations, continuous feedback, and opportunities for professional growth.</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                    <div className="bg-white/5 border border-white/10 rounded-xl p-3.5">
                                        <div className="font-bold text-purple-300 mb-1">1. Planning (SMART Goals)</div>
                                        <p className="text-purple-200/70">Connect organizational goals with individual objectives set annually.</p>
                                    </div>
                                    <div className="bg-white/5 border border-white/10 rounded-xl p-3.5">
                                        <div className="font-bold text-purple-300 mb-1">2. Coaching & Quarterly Reviews</div>
                                        <p className="text-purple-200/70">Continuous monitoring, quarterly feedback, and coaching for weak areas.</p>
                                    </div>
                                    <div className="bg-white/5 border border-white/10 rounded-xl p-3.5">
                                        <div className="font-bold text-purple-300 mb-1">3. Annual Review</div>
                                        <p className="text-purple-200/70">Evaluating actual deliverables vs targets with comprehensive appraisal scoring.</p>
                                    </div>
                                    <div className="bg-white/5 border border-white/10 rounded-xl p-3.5">
                                        <div className="font-bold text-purple-300 mb-1">4. Rewards & Promotion</div>
                                        <p className="text-purple-200/70">Rewarding top performers via bonuses, increments, and internal promotions.</p>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* SECTION 09 */}
                        <section id="sec-09" className="bg-[#170f29] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6 scroll-mt-24">
                            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-rose-600 flex items-center justify-center text-white shadow-md">
                                    <AlertOctagon size={20} />
                                </div>
                                <div>
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-purple-400">Section 09</div>
                                    <h2 className="text-xl sm:text-2xl font-bold text-white">Grievance and Discipline</h2>
                                </div>
                            </div>

                            <div className="space-y-6 text-sm text-purple-100/80 leading-relaxed">
                                <blockquote className="border-l-2 border-purple-400 pl-4 py-1 text-purple-200 font-medium italic">
                                    "Motivation gets you going, but discipline keeps you growing."
                                </blockquote>

                                <div>
                                    <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-purple-400" /> Grievance Resolution Procedure
                                    </h3>
                                    <div className="space-y-2 text-xs">
                                        {[
                                            { step: '1', title: 'Verbal Discussion', desc: 'Supervisor conducts a discussion within 2 working days to listen without bias.' },
                                            { step: '2', title: 'Pre-Grievance Hearing', desc: 'If unresolved, written grievance submitted; response given within 3 working days with copies to HR.' },
                                            { step: '3', title: 'Grievance Hearing', desc: 'Escalated to senior management for private review; colleague accompaniment allowed.' },
                                            { step: '4', title: 'Judgment & Action', desc: 'Senior management issues formal written findings, recommendations, and actions.' },
                                            { step: '5', title: 'Final Appeal to CEO', desc: 'If unsatisfied, employee may appeal to the Chief Executive Officer for final decision.' },
                                        ].map((item) => (
                                            <div key={item.step} className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-xl p-3">
                                                <span className="w-5 h-5 rounded-full bg-purple-500/30 text-purple-300 font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{item.step}</span>
                                                <div>
                                                    <span className="font-bold text-white">{item.title}: </span>
                                                    <span className="text-purple-200/80">{item.desc}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                    <div className="bg-white/5 border border-white/10 rounded-xl p-3.5">
                                        <div className="font-bold text-amber-300 mb-1">Negligence</div>
                                        <p className="text-purple-200/70">Substandard performance, lack of dedicated presence, failure to observe SOPs.</p>
                                    </div>
                                    <div className="bg-white/5 border border-white/10 rounded-xl p-3.5">
                                        <div className="font-bold text-rose-400 mb-1">Misconduct</div>
                                        <p className="text-purple-200/70">Fraudulent behavior, forging signatures, breach of confidentiality, violence, or misuse of authority.</p>
                                    </div>
                                </div>
                            </div>
                        </section>

                    </div>
                </div>

                {/* Footer */}
                <footer className="mt-16 pt-8 border-t border-white/10 text-center text-xs text-purple-300/50 space-y-3">
                    <div className="flex items-center justify-center gap-2">
                        <img src={logo} alt="ITCS Logo" className="h-6 w-auto object-contain opacity-70" />
                        <span className="font-bold text-purple-200/70">IT Consulting & Services</span>
                    </div>
                    <p className="max-w-md mx-auto text-[11px] leading-relaxed">
                        This manual is the property of ITCS and is intended for internal use by all employees. Policies may be reviewed and revised periodically.
                    </p>
                </footer>
            </div>

            {/* Back to Top Floating Button */}
            {showBackToTop && (
                <button
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    className="fixed bottom-6 right-6 p-3 rounded-full bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-2xl hover:scale-110 active:scale-95 transition-all z-40 border border-white/20"
                    title="Back to top"
                >
                    <ChevronUp size={20} />
                </button>
            )}
        </div>
    );
}
