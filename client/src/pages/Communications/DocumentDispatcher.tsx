import React, { useState, useEffect, useCallback } from 'react';
import {
    Send,
    FileText,
    Sparkles,
    Download,
    Eye,
    RefreshCw,
    Briefcase,
    DollarSign,
    CheckCircle2,
    AlertCircle,
    User,
    Mail,
    Plus,
    Trash2,
    History,
    Calendar,
    Search,
    Loader2,
    Check
} from 'lucide-react';
import axios from 'axios';
import api from '../../utils/api';
import PdfPreviewModal from '../../components/UI/PdfPreviewModal';
import AlertModal from '../../components/UI/AlertModal';

const DOCUMENT_TYPES = [
    'Job Offer Letter',
    'Internship Offer Letter',
    'Appointment Letter',
    'Employment Contract',
    'Experience Letter',
    'Character Certificate',
    'Relieving Letter',
    'Custom Memorandum'
];

interface DutyPreset {
    id: string;
    category: string;
    title: string;
    duties: string[];
}

interface EmployeeOption {
    _id?: string;
    employeeId: string;
    firstName: string;
    lastName: string;
    email?: string;
    workEmail?: string;
    phone?: string;
    jobInfo?: {
        designation?: string;
        department?: string;
    };
}

interface DispatchLog {
    _id: string;
    documentId: string;
    documentType: string;
    recipientName: string;
    recipientEmail: string;
    emailType: 'personal' | 'work';
    subject: string;
    dispatchedByName: string;
    dispatchedAt: string;
    status: 'Sent' | 'Failed';
    rolePreset?: string;
    salaryDetails?: {
        basicSalary?: string;
        grossSalary?: string;
        probationSalary?: string;
        confirmedSalary?: string;
    };
    error?: string;
}

// Helper to parse probation period strings cleanly without digit concatenation bugs
function parseProbation(val: any): { days: string; months: string; formatted: string } {
    const str = String(val || '').trim();
    if (!str) return { days: '90', months: '3', formatted: '3 Months (90 Days)' };

    // Explicitly look for days and months labels with independent captures
    const daysMatch = str.match(/(\d+)\s*days?/i);
    const monthsMatch = str.match(/(\d+)\s*months?/i);

    let days = '';
    let months = '';

    if (daysMatch && monthsMatch) {
        months = monthsMatch[1];
        days = daysMatch[1];
    } else if (daysMatch) {
        days = daysMatch[1];
        months = String(Math.max(1, Math.round(Number(days) / 30)));
    } else if (monthsMatch) {
        months = monthsMatch[1];
        days = String(Number(months) * 30);
    } else {
        const firstNumMatch = str.match(/\d+/);
        if (firstNumMatch) {
            const num = Number(firstNumMatch[0]);
            if (num <= 12) {
                months = String(num);
                days = String(num * 30);
            } else {
                days = String(num);
                months = String(Math.max(1, Math.round(num / 30)));
            }
        } else {
            months = '3';
            days = '90';
        }
    }

    return {
        days,
        months,
        formatted: `${months} Months (${days} Days)`
    };
}

export const DocumentDispatcher: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'compose' | 'history'>('compose');

    // Presets & Employees
    const [dutyPresets, setDutyPresets] = useState<DutyPreset[]>([]);
    const [employees, setEmployees] = useState<EmployeeOption[]>([]);
    const [loadingEmployees, setLoadingEmployees] = useState(false);

    // Form State
    const [documentType, setDocumentType] = useState('Job Offer Letter');
    const [recipientMode, setRecipientMode] = useState<'candidate' | 'employee'>('candidate');
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');

    const [recipientName, setRecipientName] = useState('');
    const [recipientEmail, setRecipientEmail] = useState('');
    const [emailType, setEmailType] = useState<'personal' | 'work'>('personal');
    const [recipientPhone, setRecipientPhone] = useState('');
    const [recipientCity, setRecipientCity] = useState('Karachi');

    // Role & Duties
    const [selectedPresetId, setSelectedPresetId] = useState('');
    const [designation, setDesignation] = useState('Software Engineer');
    const [department, setDepartment] = useState('Engineering');
    const [jobDuties, setJobDuties] = useState<string[]>([
        'Architect, develop, and maintain high-performance web applications using modern TypeScript and Node.js.',
        'Design and optimize scalable RESTful APIs, database schemas, and server-side business logic.',
        'Collaborate closely with product and UI/UX teams to deliver responsive and intuitive user experiences.',
        'Conduct peer code reviews, enforce coding standards, and maintain unit test coverage.'
    ]);
    const [newDutyInput, setNewDutyInput] = useState('');

    // Compensation & Terms
    const [basicSalary, setBasicSalary] = useState('120,000');
    const [allowances, setAllowances] = useState('30,000');
    const [grossSalary, setGrossSalary] = useState('150,000');
    const [probationSalary, setProbationSalary] = useState('150,000');
    const [confirmedSalary, setConfirmedSalary] = useState('175,000');
    const [commissionStructure, setCommissionStructure] = useState('Performance-based quarterly bonuses as per company policy');
    const [benefitsList, setBenefitsList] = useState('Meal Allowance, Health Insurance / OPD Reimbursement, Provident Fund, Performance Bonuses');

    // Terms & Schedule
    const [joiningDate, setJoiningDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() + 14);
        return d.toISOString().split('T')[0];
    });
    const [workingDays, setWorkingDays] = useState('Monday to Friday');
    const [workingHours, setWorkingHours] = useState('09:00 AM - 06:00 PM');
    const [probationDuration, setProbationDuration] = useState('3 Months (90 Days)');
    const [noticePeriod, setNoticePeriod] = useState('15 Days during probation / 30 Days after confirmation');
    const [workLocation, setWorkLocation] = useState('Karachi Office (On-site)');
    const [reportingManager, setReportingManager] = useState('Engineering Manager / CTO');

    // Optional email body note
    const [customEmailMessage, setCustomEmailMessage] = useState('');

    // Actions state
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // PDF Preview Modal
    const [previewModalOpen, setPreviewModalOpen] = useState(false);
    const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    // History Logs
    const [logs, setLogs] = useState<DispatchLog[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [searchLogTerm, setSearchLogTerm] = useState('');

    // Alert / Confirm Modal
    const [alertConfig, setAlertConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string | React.ReactNode;
        type?: 'info' | 'success' | 'warning' | 'error' | 'confirm';
        onConfirm?: () => void;
        confirmText?: string;
        cancelText?: string;
        showCancel?: boolean;
    }>({
        isOpen: false,
        title: '',
        message: '',
        type: 'confirm'
    });

    // 1. Fetch duty presets and employees
    const fetchInitialData = useCallback(async () => {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };

        try {
            const presetsRes = await axios.get(api.documentDutyPresets, { headers });
            setDutyPresets(presetsRes.data || []);
        } catch (err) {
            console.error('Failed to load duty presets', err);
        }

        try {
            setLoadingEmployees(true);
            const empRes = await axios.get(`${api.baseURL}/api/employees/dropdown`, { headers });
            setEmployees(empRes.data || []);
        } catch {
            // Fallback: continue without dropdown
        } finally {
            setLoadingEmployees(false);
        }
    }, []);

    // 2. Fetch dispatch logs
    const fetchLogs = useCallback(async () => {
        const token = localStorage.getItem('token');
        try {
            setLoadingLogs(true);
            const res = await axios.get(api.documentDispatchLogs, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setLogs(res.data || []);
        } catch (err: unknown) {
            console.error('Failed to fetch dispatch logs', err);
        } finally {
            setLoadingLogs(false);
        }
    }, []);

    useEffect(() => {
        fetchInitialData();
    }, [fetchInitialData]);

    useEffect(() => {
        if (activeTab === 'history') {
            fetchLogs();
        }
    }, [activeTab, fetchLogs]);

    // Handle employee selection
    const handleSelectEmployee = (empId: string) => {
        setSelectedEmployeeId(empId);
        const emp = employees.find(e => e.employeeId === empId || e._id === empId);
        if (emp) {
            setRecipientName(`${emp.firstName || ''} ${emp.lastName || ''}`.trim());
            const work = emp.workEmail || '';
            const personal = emp.email || '';
            if (emailType === 'work' && work) {
                setRecipientEmail(work);
            } else if (personal) {
                setRecipientEmail(personal);
            } else {
                setRecipientEmail(work);
            }
            if (emp.jobInfo?.designation) setDesignation(emp.jobInfo.designation);
            if (emp.jobInfo?.department) setDepartment(emp.jobInfo.department);
            if (emp.phone) setRecipientPhone(emp.phone);
        }
    };

    const isInternship = documentType.toLowerCase().includes('internship');

    // Handle template switching with dynamic field adaptation
    const handleDocumentTypeChange = (newDocType: string) => {
        setDocumentType(newDocType);
        if (newDocType.toLowerCase().includes('internship')) {
            setDesignation('Software Engineering Intern');
            setDepartment('Engineering');
            setGrossSalary('35,000');
            setBasicSalary('Fixed Monthly Stipend');
            setProbationSalary('35,000');
            setConfirmedSalary('35,000');
            setCommissionStructure('Fixed Monthly Stipend');
            setProbationDuration('3 Months (12 Weeks)');
            setBenefitsList('Certificate of Completion, Senior Mentorship, Meal Allowance');
            setReportingManager('Lead Software Engineer / Engineering Manager');
            setJobDuties([
                'Participate in hands-on development sprints under senior engineering mentorship.',
                'Assist in writing clean, testable code, unit tests, and bug resolution for web applications.',
                'Learn and apply modern development workflows, Git version control, and code review practices.',
                'Collaborate with team members during daily standups and sprint planning sessions.'
            ]);
            setSelectedPresetId('intern_software_eng');
        } else if (newDocType.toLowerCase().includes('job') || newDocType.toLowerCase().includes('contract') || newDocType.toLowerCase().includes('appointment')) {
            setDesignation('Software Engineer');
            setDepartment('Engineering');
            setBasicSalary('120,000');
            setAllowances('30,000');
            setGrossSalary('150,000');
            setProbationSalary('150,000');
            setConfirmedSalary('175,000');
            setCommissionStructure('Performance-based quarterly bonuses as per company policy');
            setProbationDuration('3 Months (90 Days)');
            setNoticePeriod('15 Days during probation / 30 Days after confirmation');
            setReportingManager('Engineering Manager / CTO');
            setBenefitsList('Meal Allowance, Health Insurance / OPD Reimbursement, Provident Fund, Performance Bonuses');
            setJobDuties([
                'Architect, develop, and maintain high-performance web applications using modern TypeScript and Node.js.',
                'Design and optimize scalable RESTful APIs, database schemas, and server-side business logic.',
                'Collaborate closely with product and UI/UX teams to deliver responsive and intuitive user experiences.',
                'Conduct peer code reviews, enforce coding standards, and maintain unit test coverage.'
            ]);
            setSelectedPresetId('fullstack_tech');
        }
    };

    // Handle preset selection
    const handleSelectPreset = (presetId: string) => {
        setSelectedPresetId(presetId);
        const preset = dutyPresets.find(p => p.id === presetId);
        if (preset) {
            setDesignation(preset.title);
            setJobDuties([...preset.duties]);
            const cat = preset.category.toLowerCase();
            const tit = preset.title.toLowerCase();
            if (cat.includes('intern')) {
                if (tit.includes('software') || tit.includes('tech') || tit.includes('engineer')) setDepartment('Engineering');
                else if (tit.includes('sales') || tit.includes('business') || tit.includes('bdo')) setDepartment('Sales & Business Development');
                else if (tit.includes('marketing')) setDepartment('Marketing');
                else if (tit.includes('design') || tit.includes('ui')) setDepartment('Product & UI/UX Design');
                else if (tit.includes('hr') || tit.includes('human')) setDepartment('Human Resources');
            } else if (cat.includes('tech')) setDepartment('Engineering');
            else if (cat.includes('sales')) setDepartment('Sales & Business Development');
            else if (cat.includes('marketing')) setDepartment('Marketing');
            else if (cat.includes('finance')) setDepartment('Finance');
            else if (cat.includes('human')) setDepartment('Human Resources');
            else if (cat.includes('operations')) setDepartment('Operations');
        }
    };

    // Duty management
    const handleAddDuty = () => {
        if (newDutyInput.trim()) {
            setJobDuties(prev => [...prev, newDutyInput.trim()]);
            setNewDutyInput('');
        }
    };

    const handleRemoveDuty = (index: number) => {
        setJobDuties(prev => prev.filter((_, i) => i !== index));
    };

    const handleDutyChange = (index: number, val: string) => {
        setJobDuties(prev => {
            const updated = [...prev];
            updated[index] = val;
            return updated;
        });
    };

    // Build payload variables
    const getPayloadVariables = () => {
        const cleanCity = recipientCity.replace(/,?\s*Pakistan\b/gi, '').trim() || 'Karachi';
        const prob = parseProbation(probationDuration);

        return {
            designation,
            department,
            basicSalary,
            allowances,
            grossSalary,
            probationSalary,
            confirmedSalary,
            commissionStructure,
            benefitsList,
            joiningDate,
            workingDays,
            workingHours,
            probationDays: prob.days,
            probationMonths: prob.months,
            probationPeriod: prob.formatted,
            internshipDuration: probationDuration,
            employmentType: isInternship ? 'Internship' : 'Full-Time',
            companyResources: 'Official Laptop, Corporate Email Account, and Access Credentials',
            taxCondition: 'Subject to applicable income tax laws and statutory tax brackets',
            stipend: grossSalary,
            startDate: joiningDate,
            internshipStartDate: joiningDate,
            noticePeriod: isInternship ? '15 Days written notice' : noticePeriod,
            workLocation,
            reportingManager,
            city: cleanCity,
            personalCity: cleanCity,
            phone: recipientPhone,
            jobDuties,
            jobResponsibilities: jobDuties.map(d => `• ${d}`).join('\n'),
            lastWorkingDay: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            settlementDays: '30',
            skills: 'technical competence, leadership, and professional diligence',
            generalJobDescription: 'core deliverables and engineering excellence',
            content: customEmailMessage || undefined
        };
    };

    // Generate PDF for Preview or Download
    const handleGeneratePdf = async (action: 'preview' | 'download') => {
        setErrorMessage(null);
        if (!recipientName.trim()) {
            setErrorMessage('Please enter the recipient full name.');
            return;
        }

        try {
            if (action === 'preview') {
                setPreviewLoading(true);
                setPreviewModalOpen(true);
            }

            const token = localStorage.getItem('token');
            const res = await axios.post(
                api.documentPreviewCustomPdf,
                {
                    documentType,
                    recipientName: recipientName.trim(),
                    recipientEmail: recipientEmail.trim(),
                    variables: getPayloadVariables()
                },
                {
                    headers: { Authorization: `Bearer ${token}` },
                    responseType: 'blob'
                }
            );

            const file = new Blob([res.data], { type: 'application/pdf' });
            const fileUrl = URL.createObjectURL(file);

            if (action === 'preview') {
                setPreviewPdfUrl(fileUrl);
            } else {
                const link = document.createElement('a');
                link.href = fileUrl;
                link.download = `${documentType.replace(/\s+/g, '_')}_${recipientName.replace(/\s+/g, '_')}.pdf`;
                document.body.appendChild(link);
                link.click();
                link.remove();
            }
        } catch (err: unknown) {
            let msg = 'Failed to generate PDF document.';
            if (axios.isAxiosError(err) && err.response?.data?.message) {
                msg = err.response.data.message;
            }
            setErrorMessage(msg);
            setPreviewModalOpen(false);
        } finally {
            setPreviewLoading(false);
        }
    };

    // Dispatch Document Email - Triggers AlertModal Confirmation
    const handleDispatchEmail = (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);
        setSuccessMessage(null);

        if (!recipientName.trim()) {
            setAlertConfig({
                isOpen: true,
                title: 'Recipient Name Required',
                message: 'Please provide the recipient full name before dispatching the document.',
                type: 'warning',
                confirmText: 'OK',
                showCancel: false
            });
            return;
        }
        if (!recipientEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim())) {
            setAlertConfig({
                isOpen: true,
                title: 'Valid Email Address Required',
                message: 'Please enter a valid recipient email address (e.g. name@example.com) to deliver the official PDF.',
                type: 'warning',
                confirmText: 'OK',
                showCancel: false
            });
            return;
        }

        setAlertConfig({
            isOpen: true,
            title: 'Confirm Document Dispatch',
            message: (
                <div className="space-y-3 text-left">
                    <p className="text-xs text-slate-600 leading-relaxed">
                        Are you sure you want to generate and dispatch this official document?
                    </p>
                    <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-2 text-xs">
                        <div className="flex justify-between items-center pb-1.5 border-b border-slate-200/60">
                            <span className="text-slate-400 font-medium">Document:</span>
                            <span className="font-bold text-slate-900">{documentType}</span>
                        </div>
                        <div className="flex justify-between items-center pb-1.5 border-b border-slate-200/60">
                            <span className="text-slate-400 font-medium">Recipient:</span>
                            <span className="font-bold text-slate-900">{recipientName.trim()}</span>
                        </div>
                        <div className="flex justify-between items-center pb-1.5 border-b border-slate-200/60">
                            <span className="text-slate-400 font-medium">Destination Email:</span>
                            <span className="font-bold text-indigo-600">{recipientEmail.trim().toLowerCase()}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-slate-400 font-medium">Email Type:</span>
                            <span className="font-semibold text-slate-700 capitalize">{emailType} Email</span>
                        </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-indigo-50/80 border border-indigo-100 text-[11px] text-indigo-700 leading-relaxed flex items-start gap-2">
                        <span className="font-bold shrink-0">ℹ Note:</span>
                        <span>An official letterhead PDF with a scannable verification QR code will be generated and emailed immediately.</span>
                    </div>
                </div>
            ),
            type: 'confirm',
            confirmText: 'Yes, Dispatch Email',
            cancelText: 'Cancel',
            showCancel: true,
            onConfirm: () => executeDispatchEmail()
        });
    };

    // Actual execution after confirmation
    const executeDispatchEmail = async () => {
        setIsSubmitting(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.post(
                api.documentDispatchEmail,
                {
                    documentType,
                    recipientName: recipientName.trim(),
                    recipientEmail: recipientEmail.trim().toLowerCase(),
                    emailType,
                    subject: `${documentType}: IT Consulting & Services - ${recipientName.trim()}`,
                    emailMessage: customEmailMessage.trim(),
                    rolePreset: selectedPresetId,
                    variables: getPayloadVariables()
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            const okMsg = res.data.message || `${documentType} was successfully emailed to ${recipientEmail}!`;
            setSuccessMessage(okMsg);
            fetchInitialData();
            window.scrollTo({ top: 0, behavior: 'smooth' });

            setAlertConfig({
                isOpen: true,
                title: 'Document Dispatched!',
                message: okMsg,
                type: 'success',
                confirmText: 'Done',
                showCancel: false
            });
        } catch (err: unknown) {
            let msg = 'Failed to dispatch document email. Please check configuration.';
            if (axios.isAxiosError(err) && err.response?.data?.message) {
                msg = err.response.data.message;
            }
            setErrorMessage(msg);
            setAlertConfig({
                isOpen: true,
                title: 'Dispatch Failed',
                message: msg,
                type: 'error',
                confirmText: 'Close',
                showCancel: false
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredLogs = logs.filter(l => {
        if (!searchLogTerm) return true;
        const q = searchLogTerm.toLowerCase();
        return (
            l.recipientName?.toLowerCase().includes(q) ||
            l.recipientEmail?.toLowerCase().includes(q) ||
            l.documentType?.toLowerCase().includes(q) ||
            l.documentId?.toLowerCase().includes(q)
        );
    });

    return (
        <div className="space-y-6 pb-16 animate-in fade-in duration-200">
            {/* Top Hero Banner matching Payroll & Leave dashboards */}
            <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-indigo-100 relative overflow-hidden">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                    <div className="space-y-1.5 max-w-2xl">
                        <div className="flex items-center gap-2">
                            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-white/20 backdrop-blur-sm text-white flex items-center gap-1.5">
                                <Sparkles size={13} />
                                Document & Offer Dispatch Center
                            </span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                            HR Document & Email Dispatcher
                        </h1>
                        <p className="text-white/80 text-xs sm:text-sm leading-relaxed">
                            Generate and email official Job Offer Letters, Contracts, and Certificates with customized role duties and compensation directly to candidate personal emails or staff work emails.
                        </p>
                    </div>

                    {/* Navigation Tabs */}
                    <div className="flex items-center gap-2 bg-white/10 p-1.5 rounded-2xl border border-white/20 backdrop-blur-sm self-start md:self-auto">
                        <button
                            onClick={() => setActiveTab('compose')}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                                activeTab === 'compose'
                                    ? 'bg-white text-indigo-700 shadow-md'
                                    : 'text-white hover:bg-white/10'
                            }`}
                        >
                            <Send size={14} />
                            Compose & Dispatch
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                                activeTab === 'history'
                                    ? 'bg-white text-indigo-700 shadow-md'
                                    : 'text-white hover:bg-white/10'
                            }`}
                        >
                            <History size={14} />
                            Dispatch History
                        </button>
                    </div>
                </div>
            </div>

            {/* Notification Alerts */}
            {successMessage && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-sm flex items-center justify-between shadow-sm animate-in slide-in-from-top-2">
                    <div className="flex items-center gap-2.5">
                        <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                        <span>{successMessage}</span>
                    </div>
                    <button onClick={() => setSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-800 text-xs font-bold">
                        Dismiss
                    </button>
                </div>
            )}

            {errorMessage && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-sm flex items-center justify-between shadow-sm animate-in slide-in-from-top-2">
                    <div className="flex items-center gap-2.5">
                        <AlertCircle size={18} className="text-rose-600 shrink-0" />
                        <span>{errorMessage}</span>
                    </div>
                    <button onClick={() => setErrorMessage(null)} className="text-rose-600 hover:text-rose-800 text-xs font-bold">
                        Dismiss
                    </button>
                </div>
            )}

            {/* TAB 1: COMPOSE & DISPATCH */}
            {activeTab === 'compose' && (
                <form onSubmit={handleDispatchEmail} className="max-w-4xl mx-auto space-y-5">
                    {/* 1. Template & Recipient Selection */}
                    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-5">
                        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                                <FileText size={18} />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-slate-800">1. Document Type & Recipient</h3>
                                <p className="text-xs text-slate-400">Choose template and recipient email destination</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-600">Document Template</label>
                                <select
                                    value={documentType}
                                    onChange={(e) => handleDocumentTypeChange(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                >
                                    {DOCUMENT_TYPES.map(dt => (
                                        <option key={dt} value={dt}>{dt}</option>
                                    ))}
                                </select>
                            </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-600">Recipient Mode</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setRecipientMode('candidate');
                                                setEmailType('personal');
                                            }}
                                            className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                                                recipientMode === 'candidate'
                                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-300 shadow-xs'
                                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                            }`}
                                        >
                                            New Candidate
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setRecipientMode('employee')}
                                            className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                                                recipientMode === 'employee'
                                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-300 shadow-xs'
                                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                            }`}
                                        >
                                            Existing Staff
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Existing Employee Select Dropdown if selected */}
                            {recipientMode === 'employee' && (
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-semibold text-slate-600">Select Employee</label>
                                        {loadingEmployees && (
                                            <span className="text-[11px] text-indigo-600 flex items-center gap-1 font-medium">
                                                <Loader2 size={11} className="animate-spin" /> Loading roster...
                                            </span>
                                        )}
                                    </div>
                                    <select
                                        value={selectedEmployeeId}
                                        disabled={loadingEmployees}
                                        onChange={(e) => handleSelectEmployee(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60"
                                    >
                                        <option value="">
                                            {loadingEmployees ? '-- Loading employees... --' : '-- Choose employee from list --'}
                                        </option>
                                        {employees.map(emp => (
                                            <option key={emp.employeeId || emp._id} value={emp.employeeId || emp._id}>
                                                {emp.firstName} {emp.lastName} ({emp.employeeId}) • {emp.jobInfo?.designation || 'Staff'}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Recipient Details */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-600">Recipient Full Name</label>
                                    <div className="relative">
                                        <User size={15} className="absolute left-3 top-2.5 text-slate-400" />
                                        <input
                                            type="text"
                                            required
                                            value={recipientName}
                                            onChange={(e) => setRecipientName(e.target.value)}
                                            placeholder="e.g. Abdul Raheem"
                                            className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-600">Recipient Email Address</label>
                                    <div className="relative">
                                        <Mail size={15} className="absolute left-3 top-2.5 text-slate-400" />
                                        <input
                                            type="email"
                                            required
                                            value={recipientEmail}
                                            onChange={(e) => setRecipientEmail(e.target.value)}
                                            placeholder="e.g. abdulraheem@gmail.com"
                                            className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-600">Phone Number (Optional)</label>
                                    <input
                                        type="tel"
                                        value={recipientPhone}
                                        onChange={(e) => setRecipientPhone(e.target.value)}
                                        placeholder="e.g. +92 300 1234567"
                                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-600">City / Location</label>
                                    <input
                                        type="text"
                                        value={recipientCity}
                                        onChange={(e) => setRecipientCity(e.target.value)}
                                        placeholder="e.g. Karachi"
                                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                    />
                                </div>
                            </div>

                            {/* Email Type Radio Box with clear notice */}
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-600">Target Email Classification</label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <label
                                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                                            emailType === 'personal'
                                                ? 'bg-indigo-50/60 border-indigo-300 ring-2 ring-indigo-500/20'
                                                : 'bg-slate-50 border-slate-200 hover:bg-slate-100/60'
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="emailType"
                                            checked={emailType === 'personal'}
                                            onChange={() => setEmailType('personal')}
                                            className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <div>
                                            <p className="text-xs font-bold text-slate-800">Personal Email (e.g. Gmail)</p>
                                            <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                                                Best for candidates & pre-hires. <strong>No login account is created.</strong>
                                            </p>
                                        </div>
                                    </label>

                                    <label
                                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                                            emailType === 'work'
                                                ? 'bg-indigo-50/60 border-indigo-300 ring-2 ring-indigo-500/20'
                                                : 'bg-slate-50 border-slate-200 hover:bg-slate-100/60'
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="emailType"
                                            checked={emailType === 'work'}
                                            onChange={() => setEmailType('work')}
                                            className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <div>
                                            <p className="text-xs font-bold text-slate-800">Official Work Email (@itcs.com.pk)</p>
                                            <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                                                For active staff with an established corporate inbox.
                                            </p>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* 2. Role Duties & Department Presets */}
                        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-4">
                            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
                                        <Briefcase size={18} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-800">2. Role Duties & Responsibilities Presets</h3>
                                        <p className="text-xs text-slate-400">Select preset dropdown to auto-fill duties or customize</p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-600">Select Job Role Duties Preset</label>
                                <select
                                    value={selectedPresetId}
                                    onChange={(e) => handleSelectPreset(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                                >
                                    <option value="">-- Choose Role Preset (e.g. Tech, Sales, Marketing) --</option>
                                    {dutyPresets.map(preset => (
                                        <option key={preset.id} value={preset.id}>
                                            [{preset.category}] {preset.title}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-600">Job Title / Designation</label>
                                    <input
                                        type="text"
                                        required
                                        value={designation}
                                        onChange={(e) => setDesignation(e.target.value)}
                                        placeholder="e.g. Full-Stack Engineer"
                                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-600">Department</label>
                                    <input
                                        type="text"
                                        required
                                        value={department}
                                        onChange={(e) => setDepartment(e.target.value)}
                                        placeholder="e.g. Engineering"
                                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                                    />
                                </div>
                            </div>

                            {/* Editable Duties List */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-semibold text-slate-600">
                                        Core Duties & Responsibilities ({jobDuties.length} items)
                                    </label>
                                    <span className="text-[11px] text-slate-400">Click to edit lines directly</span>
                                </div>

                                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                    {jobDuties.map((duty, idx) => (
                                        <div key={idx} className="flex items-start gap-2 bg-slate-50 border border-slate-200/80 rounded-xl p-2.5">
                                            <span className="text-xs font-bold text-slate-400 mt-1">{idx + 1}.</span>
                                            <textarea
                                                rows={2}
                                                value={duty}
                                                onChange={(e) => handleDutyChange(idx, e.target.value)}
                                                className="w-full bg-transparent text-xs text-slate-800 focus:outline-none resize-none leading-relaxed"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveDuty(idx)}
                                                className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                                                title="Remove this duty"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                {/* Add duty line */}
                                <div className="flex items-center gap-2 pt-1">
                                    <input
                                        type="text"
                                        value={newDutyInput}
                                        onChange={(e) => setNewDutyInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                handleAddDuty();
                                            }
                                        }}
                                        placeholder="Type another responsibility and press Add..."
                                        className="flex-1 bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleAddDuty}
                                        className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                                    >
                                        <Plus size={14} />
                                        Add Duty
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* 3. Compensation & Benefits / Internship Stipend */}
                        {isInternship ? (
                            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-4">
                                <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                                    <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
                                        <DollarSign size={18} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-800">3. Internship Stipend & Learning Package</h3>
                                        <p className="text-xs text-slate-400">Specify monthly stipend allowance and learning perks</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-slate-600">Monthly Stipend (PKR)</label>
                                        <input
                                            type="text"
                                            value={grossSalary}
                                            onChange={(e) => {
                                                setGrossSalary(e.target.value);
                                                setBasicSalary(e.target.value);
                                                setProbationSalary(e.target.value);
                                                setConfirmedSalary(e.target.value);
                                            }}
                                            placeholder="e.g. 35,000 (or type Unpaid)"
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-slate-600">Stipend Classification</label>
                                        <select
                                            value={commissionStructure}
                                            onChange={(e) => setCommissionStructure(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                                        >
                                            <option value="Fixed Monthly Stipend">Fixed Monthly Stipend</option>
                                            <option value="Performance & Milestone Based Stipend">Performance & Milestone Based Stipend</option>
                                            <option value="Unpaid / Academic Credit Only">Unpaid / Academic Credit Only</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-600">Learning Perks & Facilities</label>
                                    <input
                                        type="text"
                                        value={benefitsList}
                                        onChange={(e) => setBenefitsList(e.target.value)}
                                        placeholder="e.g. Certificate of Completion, Senior Mentorship, Meal Allowance"
                                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-4">
                                <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                                    <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                                        <DollarSign size={18} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-800">3. Compensation & Benefits Structure</h3>
                                        <p className="text-xs text-slate-400">Specify base salary, probation figures, and confirmed package</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-slate-600">Basic Salary (PKR)</label>
                                        <input
                                            type="text"
                                            value={basicSalary}
                                            onChange={(e) => setBasicSalary(e.target.value)}
                                            placeholder="120,000"
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-slate-600">Allowances (PKR)</label>
                                        <input
                                            type="text"
                                            value={allowances}
                                            onChange={(e) => setAllowances(e.target.value)}
                                            placeholder="30,000"
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-slate-600">Total Gross Salary (PKR)</label>
                                        <input
                                            type="text"
                                            value={grossSalary}
                                            onChange={(e) => setGrossSalary(e.target.value)}
                                            placeholder="150,000"
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-slate-600">Probation Salary (PKR)</label>
                                        <input
                                            type="text"
                                            value={probationSalary}
                                            onChange={(e) => setProbationSalary(e.target.value)}
                                            placeholder="150,000"
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-slate-600">Confirmed Post-Probation Salary (PKR)</label>
                                        <input
                                            type="text"
                                            value={confirmedSalary}
                                            onChange={(e) => setConfirmedSalary(e.target.value)}
                                            placeholder="175,000"
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-600">Commission / Incentive Terms</label>
                                    <input
                                        type="text"
                                        value={commissionStructure}
                                        onChange={(e) => setCommissionStructure(e.target.value)}
                                        placeholder="Quarterly performance bonus or sales commission"
                                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-600">Company Benefits Included</label>
                                    <input
                                        type="text"
                                        value={benefitsList}
                                        onChange={(e) => setBenefitsList(e.target.value)}
                                        placeholder="Meal Allowance, Health Insurance, Provident Fund"
                                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                    />
                                </div>
                            </div>
                        )}

                        {/* 4. Terms, Shift & Schedule / Internship Duration */}
                        {isInternship ? (
                            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-4">
                                <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                                    <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                                        <Calendar size={18} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-800">4. Internship Schedule & Duration</h3>
                                        <p className="text-xs text-slate-400">Specify start date, program duration, shift timings, and reporting mentor</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-slate-600">Internship Start Date</label>
                                        <input
                                            type="date"
                                            required
                                            value={joiningDate}
                                            onChange={(e) => setJoiningDate(e.target.value)}
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-slate-600">Internship Duration</label>
                                        <input
                                            type="text"
                                            value={probationDuration}
                                            onChange={(e) => setProbationDuration(e.target.value)}
                                            placeholder="e.g. 3 Months (12 Weeks) / Summer 2026"
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-slate-600">Working Days</label>
                                        <input
                                            type="text"
                                            value={workingDays}
                                            onChange={(e) => setWorkingDays(e.target.value)}
                                            placeholder="Monday to Friday"
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-slate-600">Working Hours / Shift</label>
                                        <input
                                            type="text"
                                            value={workingHours}
                                            onChange={(e) => setWorkingHours(e.target.value)}
                                            placeholder="09:00 AM - 05:00 PM"
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-slate-600">Assigned Mentor / Supervisor</label>
                                        <input
                                            type="text"
                                            value={reportingManager}
                                            onChange={(e) => setReportingManager(e.target.value)}
                                            placeholder="e.g. Senior Software Engineer / Team Lead"
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-slate-600">Work Location</label>
                                        <input
                                            type="text"
                                            value={workLocation}
                                            onChange={(e) => setWorkLocation(e.target.value)}
                                            placeholder="Karachi Office (On-site / Hybrid)"
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-4">
                                <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                                    <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                                        <Calendar size={18} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-800">4. Terms, Shift & Schedule</h3>
                                        <p className="text-xs text-slate-400">Specify dates, shift timings, probation, and reporting</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-slate-600">Date of Joining</label>
                                        <input
                                            type="date"
                                            required
                                            value={joiningDate}
                                            onChange={(e) => setJoiningDate(e.target.value)}
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-slate-600">Working Days</label>
                                        <input
                                            type="text"
                                            value={workingDays}
                                            onChange={(e) => setWorkingDays(e.target.value)}
                                            placeholder="Monday to Friday"
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-slate-600">Working Hours / Shift</label>
                                        <input
                                            type="text"
                                            value={workingHours}
                                            onChange={(e) => setWorkingHours(e.target.value)}
                                            placeholder="09:00 AM - 06:00 PM"
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-slate-600">Work Location</label>
                                        <input
                                            type="text"
                                            value={workLocation}
                                            onChange={(e) => setWorkLocation(e.target.value)}
                                            placeholder="Karachi Office"
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-slate-600">Probation Duration</label>
                                        <input
                                            type="text"
                                            value={probationDuration}
                                            onChange={(e) => setProbationDuration(e.target.value)}
                                            placeholder="3 Months (90 Days)"
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-slate-600">Notice Period</label>
                                        <input
                                            type="text"
                                            value={noticePeriod}
                                            onChange={(e) => setNoticePeriod(e.target.value)}
                                            placeholder="15 Days during probation / 30 Days after confirmation"
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-600">Reporting Manager</label>
                                    <input
                                        type="text"
                                        value={reportingManager}
                                        onChange={(e) => setReportingManager(e.target.value)}
                                        placeholder="Engineering Manager / CTO"
                                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                                    />
                                </div>
                            </div>
                        )}

                        {/* 5. Optional Email Message Note */}
                        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-3">
                            <label className="text-xs font-semibold text-slate-700 block">
                                Optional Personal Note (Included in Email Body)
                            </label>
                            <textarea
                                rows={3}
                                value={customEmailMessage}
                                onChange={(e) => setCustomEmailMessage(e.target.value)}
                                placeholder="e.g. We were very impressed with your interviews and look forward to welcoming you to the ITCS team! Please review the attached offer letter and reply with your signed confirmation."
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            />
                        </div>

                        {/* Action Buttons Bar */}
                        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex flex-wrap items-center justify-between gap-3 sticky bottom-4 z-20 shadow-indigo-100/50">
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleGeneratePdf('preview')}
                                    className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-all flex items-center gap-2 cursor-pointer shadow-xs"
                                >
                                    <Eye size={15} />
                                    Preview PDF
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleGeneratePdf('download')}
                                    className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center gap-2 cursor-pointer"
                                >
                                    <Download size={15} />
                                    Download PDF
                                </button>
                            </div>

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="px-6 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-95 text-white shadow-md active:scale-95 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                            >
                                {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                                Dispatch Email to Recipient
                            </button>
                        </div>
                    </form>
                )}

            {/* TAB 2: SENT DISPATCH HISTORY */}
            {activeTab === 'history' && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="relative w-full sm:w-80">
                            <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search by recipient or document reference..."
                                value={searchLogTerm}
                                onChange={(e) => setSearchLogTerm(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            />
                        </div>

                        <button
                            onClick={fetchLogs}
                            disabled={loadingLogs}
                            className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center gap-2 self-start sm:self-auto cursor-pointer"
                        >
                            <RefreshCw size={13} className={loadingLogs ? 'animate-spin' : ''} />
                            Refresh History
                        </button>
                    </div>

                    {loadingLogs ? (
                        <div className="py-20 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                            <Loader2 size={18} className="animate-spin text-indigo-600" />
                            Loading dispatch history...
                        </div>
                    ) : filteredLogs.length === 0 ? (
                        <div className="py-20 text-center text-slate-400 text-xs space-y-2">
                            <History size={36} className="mx-auto text-slate-300" />
                            <p className="text-slate-600 font-semibold">No dispatch logs found</p>
                            <p className="text-slate-400">Documents sent via the dispatcher will appear here with delivery timestamps.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-xl border border-slate-100">
                            <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider">
                                        <th className="py-3 px-4">Document / Reference</th>
                                        <th className="py-3 px-4">Recipient</th>
                                        <th className="py-3 px-4">Target Email</th>
                                        <th className="py-3 px-4">Role Preset</th>
                                        <th className="py-3 px-4">Date Dispatched</th>
                                        <th className="py-3 px-4">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-slate-700">
                                    {filteredLogs.map(log => (
                                        <tr key={log._id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="py-3 px-4">
                                                <p className="font-bold text-slate-900">{log.documentType}</p>
                                                <p className="text-[10px] text-slate-400 font-mono">{log.documentId}</p>
                                            </td>
                                            <td className="py-3 px-4 font-semibold text-slate-800">
                                                {log.recipientName}
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="flex items-center gap-1.5">
                                                    <span>{log.recipientEmail}</span>
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                                                        log.emailType === 'personal'
                                                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                                            : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                                    }`}>
                                                        {log.emailType}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 text-slate-600">
                                                {log.rolePreset || 'Custom'}
                                            </td>
                                            <td className="py-3 px-4 text-slate-500">
                                                {new Date(log.dispatchedAt).toLocaleString('en-US', {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    year: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-semibold border ${
                                                    log.status === 'Sent'
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                        : 'bg-rose-50 text-rose-700 border-rose-200'
                                                }`}>
                                                    {log.status === 'Sent' ? <Check size={11} /> : <AlertCircle size={11} />}
                                                    {log.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* PDF Preview Modal */}
            <PdfPreviewModal
                isOpen={previewModalOpen}
                onClose={() => setPreviewModalOpen(false)}
                pdfUrl={previewPdfUrl}
                loading={previewLoading}
                title={`${documentType} - ${recipientName || 'Candidate'}`}
            />

            {/* Confirmation & Status Alert Modal */}
            <AlertModal
                isOpen={alertConfig.isOpen}
                onClose={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                confirmText={alertConfig.confirmText}
                cancelText={alertConfig.cancelText}
                showCancel={alertConfig.showCancel}
                onConfirm={alertConfig.onConfirm}
            />
        </div>
    );
};

export default DocumentDispatcher;
