import React, { useState, useEffect } from 'react';
import { Save, Loader2, Building2, Paintbrush, PhoneCall, Eye, Upload, Trash2, Workflow, FileSignature } from 'lucide-react';
import api from '../../utils/api';
import PdfPreviewModal from '../../components/UI/PdfPreviewModal';

const CompanyManagement = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        name: '',
        logoUrl: '',
        // CEO / Executive Signatory (Appointment Letters & Executive Contracts)
        ceoSignatureUrl: '',
        ceoSignatoryName: '',
        ceoSignatoryTitle: '',
        // HR Signatory (Offer Letters, Experience Letters, Payslips)
        hrSignatureUrl: '',
        hrSignatoryName: '',
        hrSignatoryTitle: '',
        // Official Company Stamp Seal
        stampUrl: '',
        // Fallback compatibility
        signatureUrl: '',
        signatoryName: '',
        signatoryTitle: '',
        branding: {
            primaryColor: '#4A1248',
            secondaryColor: '#731868',
        },
        contact: {
            addressLine1: '',
            addressLine2: '',
            phone: '',
            email: '',
            website: '',
        },
        workflowSettings: {
            techEmail: '',
            adminEmail: '',
            hrEmail: '',
        }
    });

    useEffect(() => {
        const fetchCompany = async () => {
            setLoading(true);
            const token = localStorage.getItem('token');
            try {
                const res = await fetch(`${api.baseURL}/api/config/company`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok && res.status !== 204) {
                    const data = await res.json();
                    setFormData({
                        name: data.name || '',
                        logoUrl: data.logoUrl || '',
                        ceoSignatureUrl: data.ceoSignatureUrl || '',
                        ceoSignatoryName: data.ceoSignatoryName || '',
                        ceoSignatoryTitle: data.ceoSignatoryTitle || '',
                        hrSignatureUrl: data.hrSignatureUrl || data.signatureUrl || '',
                        hrSignatoryName: data.hrSignatoryName || data.signatoryName || '',
                        hrSignatoryTitle: data.hrSignatoryTitle || data.signatoryTitle || '',
                        stampUrl: data.stampUrl || '',
                        signatureUrl: data.hrSignatureUrl || data.signatureUrl || '',
                        signatoryName: data.hrSignatoryName || data.signatoryName || '',
                        signatoryTitle: data.hrSignatoryTitle || data.signatoryTitle || '',
                        branding: {
                            primaryColor: data.branding?.primaryColor || '#4A1248',
                            secondaryColor: data.branding?.secondaryColor || '#731868',
                        },
                        contact: {
                            addressLine1: data.contact?.addressLine1 || '',
                            addressLine2: data.contact?.addressLine2 || '',
                            phone: data.contact?.phone || '',
                            email: data.contact?.email || '',
                            website: data.contact?.website || '',
                        },
                        workflowSettings: {
                            techEmail: data.workflowSettings?.techEmail || '',
                            adminEmail: data.workflowSettings?.adminEmail || '',
                            hrEmail: data.workflowSettings?.hrEmail || '',
                        }
                    });
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchCompany();
    }, []);

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
                        name: formData.name,
                        logoUrl: formData.logoUrl,
                        ceoSignatureUrl: formData.ceoSignatureUrl,
                        ceoSignatoryName: formData.ceoSignatoryName,
                        ceoSignatoryTitle: formData.ceoSignatoryTitle,
                        hrSignatureUrl: formData.hrSignatureUrl,
                        hrSignatoryName: formData.hrSignatoryName,
                        hrSignatoryTitle: formData.hrSignatoryTitle,
                        signatureUrl: formData.hrSignatureUrl || formData.signatureUrl,
                        stampUrl: formData.stampUrl,
                        signatoryName: formData.hrSignatoryName || formData.signatoryName,
                        signatoryTitle: formData.hrSignatoryTitle || formData.signatoryTitle,
                        branding: formData.branding,
                        contact: formData.contact
                    },
                    templateData: {
                        subject: 'OFFICIAL LETTERHEAD VERIFICATION',
                        content: 'This document acts as a real-time layout validation sheet. It contains placeholder texts to preview paragraph margins, line height settings, header alignments, signature configurations, and bottom contact address lines.\n\nVerify that the logo, top ribbon color, and bottom metadata banner align with your corporate style guidelines.'
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
            const payload = {
                ...formData,
                signatureUrl: formData.hrSignatureUrl || formData.signatureUrl,
                signatoryName: formData.hrSignatoryName || formData.signatoryName,
                signatoryTitle: formData.hrSignatoryTitle || formData.signatoryTitle,
            };
            const res = await fetch(`${api.baseURL}/api/config/company`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.message || 'Failed to save company settings');
            }
            setSuccess(true);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center py-20">
                <Loader2 className="animate-spin text-indigo-600" size={32} />
            </div>
        );
    }

    return (
        <div className="animate-fadeIn max-w-4xl">
            {/* Form Fields */}
            <form onSubmit={handleSubmit} className="space-y-8">
                {success && (
                    <div className="p-4 bg-emerald-50 text-emerald-700 rounded-2xl border border-emerald-250 text-sm font-semibold">
                        Company profile and branding saved successfully!
                    </div>
                )}
                {error && (
                    <div className="p-4 bg-rose-50 text-rose-700 rounded-2xl border border-rose-250 text-sm font-semibold">
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* General Settings */}
                    <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
                            <Building2 className="text-indigo-600" size={20} />
                            Profile Settings
                        </h3>
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Company Name</label>
                            <input
                                type="text"
                                required
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-700"
                                value={formData.name}
                                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Company Logo</label>
                            
                            {formData.logoUrl && (
                                <div className="mb-3 p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="w-14 h-14 rounded-xl bg-white border border-slate-200 p-1 flex items-center justify-center shrink-0">
                                            <img
                                                src={formData.logoUrl.startsWith('data:image/') || formData.logoUrl.startsWith('http') ? formData.logoUrl : `${api.baseURL}/${formData.logoUrl}`}
                                                alt="Company Logo Preview"
                                                className="max-h-full max-w-full object-contain"
                                                onError={(e) => {
                                                    (e.target as HTMLElement).style.display = 'none';
                                                }}
                                            />
                                        </div>
                                        <div className="truncate">
                                            <p className="text-xs font-bold text-slate-700 truncate">Current Logo Active</p>
                                            <p className="text-[10px] text-slate-400 truncate font-mono">{formData.logoUrl.substring(0, 40)}...</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, logoUrl: '' }))}
                                        className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors shrink-0"
                                        title="Remove Logo"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            )}

                            <div className="flex items-center gap-3">
                                <label className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm">
                                    <Upload size={16} />
                                    <span>Upload Logo File</span>
                                    <input
                                        type="file"
                                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                const reader = new FileReader();
                                                reader.onload = (event) => {
                                                    const base64 = event.target?.result as string;
                                                    if (base64) {
                                                        setFormData(prev => ({ ...prev, logoUrl: base64 }));
                                                    }
                                                };
                                                reader.readAsDataURL(file);
                                            }
                                        }}
                                    />
                                </label>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1.5">Supported formats: PNG, JPG, SVG, WebP. Recommended max height: 100px.</p>
                        </div>
                    </div>

                    {/* Branding Settings */}
                    <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
                            <Paintbrush className="text-indigo-600" size={20} />
                            Branding Customization
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Primary Color</label>
                                <div className="flex gap-2 items-center">
                                    <input
                                        type="color"
                                        className="w-10 h-10 border border-slate-200 rounded-lg cursor-pointer"
                                        value={formData.branding.primaryColor}
                                        onChange={(e) => setFormData(prev => ({
                                            ...prev,
                                            branding: { ...prev.branding, primaryColor: e.target.value }
                                        }))}
                                    />
                                    <input
                                        type="text"
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs uppercase font-mono text-slate-650"
                                        value={formData.branding.primaryColor}
                                        onChange={(e) => setFormData(prev => ({
                                            ...prev,
                                            branding: { ...prev.branding, primaryColor: e.target.value }
                                        }))}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Secondary Color</label>
                                <div className="flex gap-2 items-center">
                                    <input
                                        type="color"
                                        className="w-10 h-10 border border-slate-200 rounded-lg cursor-pointer"
                                        value={formData.branding.secondaryColor}
                                        onChange={(e) => setFormData(prev => ({
                                            ...prev,
                                            branding: { ...prev.branding, secondaryColor: e.target.value }
                                        }))}
                                    />
                                    <input
                                        type="text"
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs uppercase font-mono text-slate-650"
                                        value={formData.branding.secondaryColor}
                                        onChange={(e) => setFormData(prev => ({
                                            ...prev,
                                            branding: { ...prev.branding, secondaryColor: e.target.value }
                                        }))}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Official Signatures & Document Stamp */}
                    <div className="md:col-span-2 bg-white p-6 md:p-8 rounded-3xl border border-slate-200/80 shadow-sm space-y-6">
                        <div className="flex items-start justify-between flex-wrap gap-2">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                    <FileSignature className="text-indigo-600" size={20} />
                                    Official Signatories & Document Seal
                                </h3>
                                <p className="text-xs text-slate-500 mt-1">
                                    Configure separate executive and HR signatory credentials and the official seal embedded in offer letters, appointment contracts, and payslips.
                                </p>
                            </div>
                            <span className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
                                White-Label Ready
                            </span>
                        </div>

                        {/* Signatories Grid: Two distinct side-by-side cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                            {/* Signatory 1: CEO / Executive Signatory */}
                            <div className="p-5 rounded-2xl bg-slate-50/70 border border-slate-200 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
                                        <h4 className="text-sm font-bold text-slate-800">Executive / CEO Signatory</h4>
                                    </div>
                                    <span className="px-2 py-0.5 text-[10px] font-semibold bg-purple-50 text-purple-700 rounded-md border border-purple-200">
                                        Appointment Letters
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500">
                                    Rendered on official Appointment Letters and executive employment contracts.
                                </p>

                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">Signatory Full Name</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium text-slate-700"
                                        value={formData.ceoSignatoryName}
                                        onChange={(e) => setFormData(prev => ({ ...prev, ceoSignatoryName: e.target.value }))}
                                        placeholder="e.g. Faraz Anwer"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">Designation / Title</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium text-slate-700"
                                        value={formData.ceoSignatoryTitle}
                                        onChange={(e) => setFormData(prev => ({ ...prev, ceoSignatoryTitle: e.target.value }))}
                                        placeholder="e.g. Founder & CEO / Managing Director"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">Executive Signature</label>
                                    {formData.ceoSignatureUrl && (
                                        <div className="mb-3 p-3 bg-white border border-slate-200 rounded-2xl flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className="w-20 h-12 rounded-xl bg-slate-50 border border-slate-200 p-1 flex items-center justify-center shrink-0">
                                                    <img
                                                        src={formData.ceoSignatureUrl.startsWith('data:image/') || formData.ceoSignatureUrl.startsWith('http') ? formData.ceoSignatureUrl : `${api.baseURL}/${formData.ceoSignatureUrl}`}
                                                        alt="CEO Signature Preview"
                                                        className="max-h-full max-w-full object-contain"
                                                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                                    />
                                                </div>
                                                <div className="truncate">
                                                    <p className="text-xs font-bold text-slate-700 truncate">CEO Signature Active</p>
                                                    <p className="text-[10px] text-slate-400 truncate font-mono">Executive Sign</p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setFormData(prev => ({ ...prev, ceoSignatureUrl: '' }))}
                                                className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors shrink-0"
                                                title="Remove CEO Signature"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    )}
                                    <label className="flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm">
                                        <Upload size={16} />
                                        <span>{formData.ceoSignatureUrl ? 'Change Executive Signature' : 'Upload Executive Signature'}</span>
                                        <input
                                            type="file"
                                            accept="image/png,image/jpeg,image/webp"
                                            className="hidden"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    const reader = new FileReader();
                                                    reader.onload = (event) => {
                                                        const base64 = event.target?.result as string;
                                                        if (base64) {
                                                            setFormData(prev => ({ ...prev, ceoSignatureUrl: base64 }));
                                                        }
                                                    };
                                                    reader.readAsDataURL(file);
                                                }
                                            }}
                                        />
                                    </label>
                                </div>
                            </div>

                            {/* Signatory 2: HR Signatory */}
                            <div className="p-5 rounded-2xl bg-slate-50/70 border border-slate-200 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
                                        <h4 className="text-sm font-bold text-slate-800">HR / Operations Signatory</h4>
                                    </div>
                                    <span className="px-2 py-0.5 text-[10px] font-semibold bg-indigo-50 text-indigo-700 rounded-md border border-indigo-200">
                                        Offer & Experience Letters
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500">
                                    Rendered on Offer Letters, Experience Certificates, Internship Letters, and Payslips.
                                </p>

                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">Signatory Full Name</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium text-slate-700"
                                        value={formData.hrSignatoryName}
                                        onChange={(e) => setFormData(prev => ({ ...prev, hrSignatoryName: e.target.value }))}
                                        placeholder="e.g. Afreen Saeed"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">Designation / Title</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium text-slate-700"
                                        value={formData.hrSignatoryTitle}
                                        onChange={(e) => setFormData(prev => ({ ...prev, hrSignatoryTitle: e.target.value }))}
                                        placeholder="e.g. Manager HR / Head of People"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">HR Signature</label>
                                    {formData.hrSignatureUrl && (
                                        <div className="mb-3 p-3 bg-white border border-slate-200 rounded-2xl flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className="w-20 h-12 rounded-xl bg-slate-50 border border-slate-200 p-1 flex items-center justify-center shrink-0">
                                                    <img
                                                        src={formData.hrSignatureUrl.startsWith('data:image/') || formData.hrSignatureUrl.startsWith('http') ? formData.hrSignatureUrl : `${api.baseURL}/${formData.hrSignatureUrl}`}
                                                        alt="HR Signature Preview"
                                                        className="max-h-full max-w-full object-contain"
                                                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                                    />
                                                </div>
                                                <div className="truncate">
                                                    <p className="text-xs font-bold text-slate-700 truncate">HR Signature Active</p>
                                                    <p className="text-[10px] text-slate-400 truncate font-mono">HR Sign</p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setFormData(prev => ({ ...prev, hrSignatureUrl: '' }))}
                                                className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors shrink-0"
                                                title="Remove HR Signature"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    )}
                                    <label className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm">
                                        <Upload size={16} />
                                        <span>{formData.hrSignatureUrl ? 'Change HR Signature' : 'Upload HR Signature'}</span>
                                        <input
                                            type="file"
                                            accept="image/png,image/jpeg,image/webp"
                                            className="hidden"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    const reader = new FileReader();
                                                    reader.onload = (event) => {
                                                        const base64 = event.target?.result as string;
                                                        if (base64) {
                                                            setFormData(prev => ({ ...prev, hrSignatureUrl: base64 }));
                                                        }
                                                    };
                                                    reader.readAsDataURL(file);
                                                }
                                            }}
                                        />
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* Official Company Stamp Seal */}
                        <div className="p-5 rounded-2xl bg-slate-50/70 border border-slate-200 space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                                    <h4 className="text-sm font-bold text-slate-800">Official Company Stamp Seal</h4>
                                </div>
                                <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 rounded-md border border-emerald-200">
                                    Shared Document Seal
                                </span>
                            </div>
                            <p className="text-xs text-slate-500">
                                Circular or rectangular official company seal. Embedded alongside the respective signatory on official letters and certificates.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                                <div>
                                    {formData.stampUrl && (
                                        <div className="p-3 bg-white border border-slate-200 rounded-2xl flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className="w-14 h-14 rounded-xl bg-slate-50 border border-slate-200 p-1 flex items-center justify-center shrink-0">
                                                    <img
                                                        src={formData.stampUrl.startsWith('data:image/') || formData.stampUrl.startsWith('http') ? formData.stampUrl : `${api.baseURL}/${formData.stampUrl}`}
                                                        alt="Stamp Preview"
                                                        className="max-h-full max-w-full object-contain"
                                                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                                    />
                                                </div>
                                                <div className="truncate">
                                                    <p className="text-xs font-bold text-slate-700 truncate">Stamp Seal Active</p>
                                                    <p className="text-[10px] text-slate-400 truncate font-mono">Official Seal</p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setFormData(prev => ({ ...prev, stampUrl: '' }))}
                                                className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors shrink-0"
                                                title="Remove Stamp"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm">
                                        <Upload size={16} />
                                        <span>{formData.stampUrl ? 'Change Official Stamp Seal' : 'Upload Official Stamp Seal'}</span>
                                        <input
                                            type="file"
                                            accept="image/png,image/jpeg,image/webp"
                                            className="hidden"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    const reader = new FileReader();
                                                    reader.onload = (event) => {
                                                        const base64 = event.target?.result as string;
                                                        if (base64) {
                                                            setFormData(prev => ({ ...prev, stampUrl: base64 }));
                                                        }
                                                    };
                                                    reader.readAsDataURL(file);
                                                }
                                            }}
                                        />
                                    </label>
                                    <p className="text-[10px] text-slate-400 mt-1.5">Transparent PNG recommended. Renders next to the authorized signature line.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Contact Details */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
                        <PhoneCall className="text-indigo-600" size={20} />
                        Document Footer & Contact Details
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Primary Office Address</label>
                            <input
                                type="text"
                                required
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-700"
                                value={formData.contact.addressLine1}
                                onChange={(e) => setFormData(prev => ({
                                    ...prev,
                                    contact: { ...prev.contact, addressLine1: e.target.value }
                                }))}
                                placeholder="e.g. Block A, Sector 4, Commercial Area, Capital City"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Secondary Office / Contact Line</label>
                            <input
                                type="text"
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-700"
                                value={formData.contact.addressLine2}
                                onChange={(e) => setFormData(prev => ({
                                    ...prev,
                                    contact: { ...prev.contact, addressLine2: e.target.value }
                                }))}
                                placeholder="e.g. Branch Office, Hali Road, Gulberg"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Phone Number</label>
                            <input
                                type="text"
                                required
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-700"
                                value={formData.contact.phone}
                                onChange={(e) => setFormData(prev => ({
                                    ...prev,
                                    contact: { ...prev.contact, phone: e.target.value }
                                }))}
                                placeholder="e.g. +92 21 111-222-333"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Email Address</label>
                            <input
                                type="email"
                                required
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-700"
                                value={formData.contact.email}
                                onChange={(e) => setFormData(prev => ({
                                    ...prev,
                                    contact: { ...prev.contact, email: e.target.value }
                                }))}
                                placeholder="e.g. contact@acme.com"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Website</label>
                            <input
                                type="text"
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-700"
                                value={formData.contact.website}
                                onChange={(e) => setFormData(prev => ({
                                    ...prev,
                                    contact: { ...prev.contact, website: e.target.value }
                                }))}
                                placeholder="e.g. www.acme.com"
                            />
                        </div>
                    </div>

                    {/* Workflow & Department Notification Emails */}
                    <div className="md:col-span-2 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                        <div className="flex items-start justify-between flex-wrap gap-2">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                    <Workflow className="text-indigo-600" size={20} />
                                    Workflow & Notification Routing
                                </h3>
                                <p className="text-xs text-slate-500 mt-1">
                                    Configure recipient email addresses for automated onboarding and offboarding task alerts.
                                </p>
                            </div>
                            <span className="px-2.5 py-1 text-[11px] font-semibold bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">
                                Automated Checklists
                            </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
                            {/* Tech Team Email */}
                            <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/70 space-y-2">
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700">Tech Team Email</label>
                                </div>
                                <input
                                    type="email"
                                    className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-800"
                                    value={formData.workflowSettings?.techEmail || ''}
                                    onChange={(e) => setFormData(prev => ({
                                        ...prev,
                                        workflowSettings: { ...prev.workflowSettings, techEmail: e.target.value }
                                    }))}
                                    placeholder="e.g. it-support@itcs.com"
                                />
                                <p className="text-[11px] text-slate-500 leading-snug">
                                    Notified on new user creation to provision work email, and on offboarding to revoke access/VPN.
                                </p>
                            </div>

                            {/* Admin Team Email */}
                            <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/70 space-y-2">
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700">Admin Team Email</label>
                                </div>
                                <input
                                    type="email"
                                    className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-medium text-slate-800"
                                    value={formData.workflowSettings?.adminEmail || ''}
                                    onChange={(e) => setFormData(prev => ({
                                        ...prev,
                                        workflowSettings: { ...prev.workflowSettings, adminEmail: e.target.value }
                                    }))}
                                    placeholder="e.g. admin@itcs.com"
                                />
                                <p className="text-[11px] text-slate-500 leading-snug">
                                    Notified on offboarding to collect company laptop, fuel card, and mobile SIM.
                                </p>
                            </div>

                            {/* HR Team Email */}
                            <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/70 space-y-2">
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700">HR Team Email</label>
                                </div>
                                <input
                                    type="email"
                                    className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all font-medium text-slate-800"
                                    value={formData.workflowSettings?.hrEmail || ''}
                                    onChange={(e) => setFormData(prev => ({
                                        ...prev,
                                        workflowSettings: { ...prev.workflowSettings, hrEmail: e.target.value }
                                    }))}
                                    placeholder="e.g. hr@itcs.com"
                                />
                                <p className="text-[11px] text-slate-500 leading-snug">
                                    Notified on offboarding to schedule exit interview and complete clearance checklist.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end pt-4 gap-3 flex-wrap md:flex-nowrap">
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
                        Save Branding Configurations
                    </button>
                </div>
            </form>

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
                title="Company Branding PDF Preview"
            />
        </div>
    );
};

export default CompanyManagement;
