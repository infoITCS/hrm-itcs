import React, { useState, useEffect } from 'react';
import { Save, Loader2, Building2, Paintbrush, PhoneCall, Eye, Upload, Trash2 } from 'lucide-react';
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
            const res = await fetch(`${api.baseURL}/api/config/company`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
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
