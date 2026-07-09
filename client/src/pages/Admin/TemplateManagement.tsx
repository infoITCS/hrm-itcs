import React, { useState, useEffect, useRef } from 'react';
import { Save, Loader2, FileText, Code, Eye } from 'lucide-react';
import api from '../../utils/api';
import PdfPreviewModal from '../../components/UI/PdfPreviewModal';


const DOCUMENT_TYPES = [
    'Job Offer Letter',
    'Internship Offer Letter',
    'Appointment Letter',
    'Employment Contract',
    'Pay Slip',
    'Consolidated Pay Slip (3 Months)',
    'Consolidated Pay Slip (6 Months)',
    'No Objection Certificate (NOC)',
    'Character Certificate',
    'Income Verification Letter',
    'Experience Letter',
    'Employment Certificate',
    'Internship Completion Certificate',
    'Relieving Letter'
];

const PLACEHOLDERS = [
    { tag: '{{employeeId}}', desc: "Employee unique ID" },
    { tag: '{{employeeName}}', desc: "Employee's full name" },
    { tag: '{{firstName}}', desc: "Employee's first name" },
    { tag: '{{lastName}}', desc: "Employee's last name" },
    { tag: '{{designation}}', desc: "Job title / Designation" },
    { tag: '{{department}}', desc: "Job Department" },
    { tag: '{{reportingManager}}', desc: "Supervisor / Reporting Manager" },
    { tag: '{{joiningDate}}', desc: "Formatted Date of Joining" },
    { tag: '{{lastWorkingDay}}', desc: "Separation / Offboarding date" },
    { tag: '{{basicSalary}}', desc: "Basic Salary amount (Rs.)" },
    { tag: '{{grossSalary}}', desc: "Total Gross Salary (Rs.)" },
    { tag: '{{purpose}}', desc: "Purpose/Reason of request input" },
    { tag: '{{date}}', desc: "Date of document issuance" },
    { tag: '{{pronounSubject}}', desc: "he / she" },
    { tag: '{{pronounObject}}', desc: "him / her" },
    { tag: '{{pronounPossessive}}', desc: "his / her" },
    { tag: '{{cnic}}', desc: "CNIC / National ID" },
    { tag: '{{fatherName}}', desc: "Father's name" },
    { tag: '{{gender}}', desc: "Gender (Male/Female)" },
    { tag: '{{maritalStatus}}', desc: "Marital Status (Single/Married)" },
    { tag: '{{nationality}}', desc: "Nationality" },
    { tag: '{{personalEmail}}', desc: "Personal email address" },
    { tag: '{{workEmail}}', desc: "Official work email address" },
    { tag: '{{phone}}', desc: "Mobile / Phone number" },
    { tag: '{{address}}', desc: "Complete physical address" },
    { tag: '{{bankName}}', desc: "Bank name" },
    { tag: '{{bankAccountNumber}}', desc: "Bank account number" },
    { tag: '{{bankIban}}', desc: "Bank IBAN number" }
];

const TemplateManagement = () => {
    const [selectedDocType, setSelectedDocType] = useState(DOCUMENT_TYPES[0]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);

    const [subject, setSubject] = useState('');
    const [content, setContent] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [companyData, setCompanyData] = useState<any>({
        name: 'Acme Corp',
        logoUrl: '',
        branding: { primaryColor: '#4A148C', secondaryColor: '#1A0933' },
        contact: { addressLine1: '', addressLine2: '', phone: '', email: '', website: '' }
    });

    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const fetchCompany = async () => {
            const token = localStorage.getItem('token');
            try {
                const res = await fetch(`${api.baseURL}/api/config/company`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok && res.status !== 204) {
                    const data = await res.json();
                    setCompanyData(data);
                }
            } catch (err) {
                console.error(err);
            }
        };
        fetchCompany();
    }, []);

    useEffect(() => {
        const fetchTemplate = async () => {
            setLoading(true);
            setError(null);
            setSuccess(false);
            const token = localStorage.getItem('token');
            try {
                const res = await fetch(`${api.baseURL}/api/config/templates`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    const matched = data.find((t: any) => t.documentType === selectedDocType);
                    if (matched) {
                        setSubject(matched.subject || '');
                        setContent(matched.content || '');
                        setIsActive(matched.isActive !== false);
                    } else {
                        // Reset defaults
                        setSubject('');
                        setContent('');
                        setIsActive(true);
                    }
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchTemplate();
    }, [selectedDocType]);

    const handlePreviewPdf = async () => {
        setPreviewOpen(true);
        setPreviewLoading(true);
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${api.baseURL}/api/documents/preview-pdf`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    companyData: {
                        name: companyData.name,
                        logoUrl: companyData.logoUrl,
                        branding: companyData.branding,
                        contact: companyData.contact
                    },
                    templateData: {
                        subject: subject,
                        content: content
                    }
                })
            });
            if (res.ok) {
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                setPdfUrl(url);
            } else {
                console.error('Failed to fetch PDF preview');
            }
        } catch (err) {
            console.error(err);
        } finally {
            setPreviewLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        setSuccess(false);
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${api.baseURL}/api/config/templates`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    documentType: selectedDocType,
                    subject,
                    content,
                    isActive
                })
            });
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.message || 'Failed to save document template');
            }
            setSuccess(true);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleInsertTag = (tag: string) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const before = text.substring(0, start);
        const after = text.substring(end, text.length);

        setContent(before + tag + after);
        
        // Re-focus and set cursor position after the tag
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + tag.length, start + tag.length);
        }, 50);
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-fadeIn pb-12">
            {/* Sidebar selection */}
            <div className="lg:col-span-1 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm h-fit">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
                    <FileText size={16} /> Document Type
                </h3>
                <div className="flex flex-col gap-1">
                    {DOCUMENT_TYPES.map((type) => (
                        <button
                            key={type}
                            type="button"
                            onClick={() => setSelectedDocType(type)}
                            className={`w-full text-left px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                                selectedDocType === type
                                    ? 'bg-indigo-50 text-indigo-700 font-bold border-l-4 border-indigo-600'
                                    : 'text-slate-650 hover:bg-slate-50'
                            }`}
                        >
                            {type}
                        </button>
                    ))}
                </div>
            </div>

            {/* Template Editor */}
            <div className="lg:col-span-3 space-y-6">
                {success && (
                    <div className="p-4 bg-emerald-50 text-emerald-700 rounded-2xl border border-emerald-250 text-sm font-semibold">
                        Document template saved successfully!
                    </div>
                )}
                {error && (
                    <div className="p-4 bg-rose-50 text-rose-700 rounded-2xl border border-rose-250 text-sm font-semibold">
                        {error}
                    </div>
                )}

                {loading ? (
                    <div className="flex justify-center items-center py-20 bg-white rounded-3xl border border-slate-200 shadow-sm">
                        <Loader2 className="animate-spin text-indigo-600" size={32} />
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Editor Form */}
                        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                                <div>
                                    <h2 className="text-lg font-bold text-slate-800">{selectedDocType} Layout</h2>
                                    <p className="text-xs text-slate-400 mt-1">Configure layout template text and tags to generate dynamic PDF documents.</p>
                                </div>
                                <div>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="rounded text-indigo-650 focus:ring-indigo-500 w-4 h-4 border-slate-300"
                                            checked={isActive}
                                            onChange={(e) => setIsActive(e.target.checked)}
                                        />
                                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Active</span>
                                    </label>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Document Subject Line / Header Title</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-700"
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    placeholder="e.g. TO WHOM IT MAY CONCERN / APPOINTMENT CONTRACT"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                {/* Editor Textarea */}
                                <div className="md:col-span-3">
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Letter Body Content</label>
                                    <textarea
                                        ref={textareaRef}
                                        rows={15}
                                        required
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-700 leading-relaxed"
                                        value={content}
                                        onChange={(e) => setContent(e.target.value)}
                                        placeholder="Write letter text content... Use tags like {{employeeName}} to insert dynamic employee fields."
                                    />
                                </div>

                                {/* Tags helper panel */}
                                <div className="md:col-span-1 space-y-4">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                        <Code size={14} /> Tag Guide
                                    </h4>
                                    <p className="text-[10px] text-slate-500">Click any tag below to insert it at the cursor position in the letter text body.</p>
                                    <div className="flex flex-wrap lg:flex-col gap-1.5 max-h-[350px] overflow-y-auto pr-1">
                                        {PLACEHOLDERS.map((placeholder) => (
                                            <button
                                                key={placeholder.tag}
                                                type="button"
                                                onClick={() => handleInsertTag(placeholder.tag)}
                                                className="text-left px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg hover:bg-indigo-50 hover:text-indigo-750 hover:border-indigo-200 transition-all text-[11px] font-mono text-slate-650 group shadow-xs shrink-0 flex flex-col"
                                            >
                                                <span className="font-bold text-indigo-600 group-hover:text-indigo-800">{placeholder.tag}</span>
                                                <span className="text-[9px] text-slate-400 group-hover:text-slate-500">{placeholder.desc}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end border-t border-slate-100 pt-4 gap-3 flex-wrap md:flex-nowrap">
                                <button
                                    type="button"
                                    onClick={handlePreviewPdf}
                                    className="flex items-center justify-center gap-2 px-6 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold transition-all active:scale-95 w-full md:w-auto"
                                >
                                    <Eye size={20} />
                                    Preview Full-Page PDF
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex items-center justify-center gap-2 px-8 py-3.5 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95 disabled:opacity-50 w-full md:w-auto"
                                >
                                    {saving ? (
                                        <Loader2 className="animate-spin" size={20} />
                                    ) : (
                                        <Save size={20} />
                                    )}
                                    Save Template Configuration
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Full Screen PDF Preview Modal */}
                <PdfPreviewModal
                    isOpen={previewOpen}
                    onClose={() => {
                        setPreviewOpen(false);
                        if (pdfUrl) {
                            URL.revokeObjectURL(pdfUrl);
                            setPdfUrl(null);
                        }
                    }}
                    pdfUrl={pdfUrl}
                    loading={previewLoading}
                    title={`${selectedDocType} PDF Layout Preview`}
                />
            </div>
        </div>
    );
};

export default TemplateManagement;
