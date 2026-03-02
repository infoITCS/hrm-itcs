
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, User, Phone, Briefcase, FileText, Download, Edit2, History, GraduationCap, Users, Shield, AlertCircle, Check, X, CreditCard, DollarSign, Banknote, Globe, Trash2, Camera, Gift } from 'lucide-react';
import api from '../../utils/api';
import { usePermissions } from '../../hooks/usePermissions';
import { getAvatarUrl } from '../../utils/avatar';

const EmployeeProfile = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { canEditSensitiveData, canApproveDocuments } = usePermissions();
    
    // Read the query parameter 'tab' from URL
    const queryParams = new URLSearchParams(window.location.search);
    const initialTab = queryParams.get('tab') || 'personal';
    
    const [activeTab, setActiveTab] = useState(initialTab);
    const [employee, setEmployee] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [auditLogs, setAuditLogs] = useState<any[]>([]);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('token');

        // Fetch employee data using the new endpoint
        fetch(`${api.employees}/${id}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
            .then(res => {
                if (!res.ok) {
                    throw new Error('Failed to fetch employee');
                }
                return res.json();
            })
            .then(data => {
                setEmployee(data);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });

        // Fetch audit logs
        const auditToken = localStorage.getItem('token');
        fetch(`${api.auditLogs}?targetResource=Employee&targetId=${id}`, {
            headers: {
                'Authorization': `Bearer ${auditToken}`
            }
        })
            .then(res => res.json())
            .then(data => setAuditLogs(data || []))
            .catch(err => console.error('Error fetching audit logs:', err));
    }, [id]);

    if (loading) return <div className="p-8 text-center">Loading Profile...</div>;
    if (!employee) return <div className="p-8 text-center">Employee Not Found</div>;

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !employee) return;

        setUploadingAvatar(true);
        try {
            const token = localStorage.getItem('token');
            const fileData = new FormData();
            fileData.append('file', file);
            fileData.append('fileType', 'Profile Picture');

            const response = await fetch(`${api.employees}/${employee.employeeId}/attachments`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: fileData
            });

            if (!response.ok) throw new Error('Failed to upload profile picture');

            // Re-fetch employee data
            const refreshRes = await fetch(`${api.employees}/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (refreshRes.ok) {
                const refreshedEmployee = await refreshRes.json();
                setEmployee(refreshedEmployee);
            }
        } catch (err: any) {
            console.error('Error uploading avatar:', err);
            alert('Failed to upload profile picture.');
        } finally {
            setUploadingAvatar(false);
        }
    };

    const tabs = [
        { id: 'personal', label: 'Personal', icon: User },
        { id: 'contact', label: 'Contact', icon: Phone },
        { id: 'job', label: 'Job', icon: Briefcase },
        { id: 'finance', label: 'Finance', icon: CreditCard },
        { id: 'benefits', label: 'Benefits', icon: Gift },
        { id: 'history', label: 'Employment History', icon: History },
        { id: 'education', label: 'Education', icon: GraduationCap },
        { id: 'dependents', label: 'Dependents', icon: Users },
        { id: 'documents', label: 'Documents', icon: FileText },
        { id: 'audit', label: 'Audit Logs', icon: Shield },
    ];

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header / Banner */}
            <div className="flex items-center gap-6 animate-slide-up bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <button onClick={() => navigate('/pim')} className="p-2 hover:bg-slate-100 rounded-xl text-gray-400 hover:text-indigo-600 transition-all">
                    <ChevronLeft size={24} />
                </button>

                <div className="relative group">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-indigo-600 text-2xl font-bold border-4 border-white shadow-md overflow-hidden transition-transform group-hover:scale-105 relative">
                        {getAvatarUrl(employee) ? (
                            <img src={getAvatarUrl(employee)!} alt="" className="w-full h-full object-cover" />
                        ) : (
                            `${employee.firstName[0]}${employee.lastName[0]}`
                        )}

                        {canEditSensitiveData() && (
                            <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-300 cursor-pointer flex flex-col items-center justify-center gap-1 backdrop-blur-[2px] text-white">
                                <Camera size={20} className="transform translate-y-2 group-hover:translate-y-0 transition-transform" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Change</span>
                                <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
                            </label>
                        )}

                        {uploadingAvatar && (
                            <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                                <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-gray-800">
                        {employee.firstName} {employee.middleName ? `${employee.middleName} ` : ''}{employee.lastName}
                    </h1>
                    <p className="text-gray-500">{employee.jobInfo?.designation} • {employee.jobInfo?.department}</p>
                </div>
                {canEditSensitiveData() && (
                    <button
                        onClick={() => navigate(`/pim/edit/${employee.employeeId}`)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all font-medium shadow-sm hover:shadow-md"
                    >
                        <Edit2 size={16} /> Edit Profile
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-6 py-3 font-medium text-sm transition-all border-b-2 ${activeTab === tab.id
                            ? 'border-indigo-600 text-indigo-600 bg-gradient-to-r from-indigo-50 to-purple-50'
                            : 'border-transparent text-slate-500 hover:text-indigo-600 hover:bg-indigo-50/50'
                            }`}
                    >
                        <tab.icon size={16} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content Body */}
            <div className="bg-white rounded-lg p-6 shadow-sm border border-slate-200/50 min-h-[400px] animate-slide-up">

                {/* Personal Tab */}
                {activeTab === 'personal' && (
                    <div className="space-y-8 animate-fadeIn">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-6 gap-x-8">
                            <Field label="Employee ID" value={employee.employeeId} />
                            <Field label="Full Name" value={`${employee.firstName} ${employee.middleName || ''} ${employee.lastName}`} />
                            <Field label="Date of Birth" value={formatDate(employee.dateOfBirth)} />
                            <Field label="Gender" value={employee.gender} />
                            <Field label="Marital Status" value={employee.maritalStatus} />
                            <Field label="Nationality" value={employee.nationality} />
                            <Field label="Father Name" value={employee.fatherName} />
                            <Field label="Blood Group" value={employee.bloodGroup} />
                            <Field label="CNIC / Govt ID" value={employee.cnic} />
                            <Field label="Religion" value={employee.religion} />
                            <Field label="License Number" value={employee.licenseNumber} />
                            <Field label="Work Email" value={employee.workEmail} />
                            <Field label="Other Email" value={employee.otherEmail} />
                            <Field label="SIM Number" value={employee.simNumber} />
                        </div>

                        {/* Professional Skills */}
                        <div className="pt-8 border-t border-slate-100">
                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Professional Skills</h3>
                            <div className="flex flex-wrap gap-2">
                                {employee.skills?.length > 0 ? (
                                    employee.skills.map((skill: string, idx: number) => (
                                        <span key={idx} className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-sm font-medium border border-indigo-100">
                                            {skill}
                                        </span>
                                    ))
                                ) : <p className="text-gray-400 italic text-sm">No skills listed</p>}
                            </div>
                        </div>

                        {/* Digital Presence */}
                        <div className="pt-8 border-t border-slate-100">
                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <Globe size={16} /> Digital Presence
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {employee.socialProfiles?.length > 0 ? (
                                    employee.socialProfiles.map((profile: any, idx: number) => (
                                        profile.link && (
                                            <a
                                                key={idx}
                                                href={profile.link}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-white transition-all group"
                                            >
                                                <div className="p-2 bg-white rounded-lg group-hover:bg-indigo-50 text-slate-400 group-hover:text-indigo-600 border border-slate-100 transition-colors">
                                                    <Globe size={16} />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase">{profile.platform}</p>
                                                    <p className="text-sm font-medium text-slate-600 truncate">{profile.link.replace(/^https?:\/\//, '')}</p>
                                                </div>
                                            </a>
                                        )
                                    ))
                                ) : <p className="text-gray-400 italic text-sm">No social profiles linked</p>}
                            </div>
                        </div>
                    </div>
                )}

                {/* Dependents Tab */}
                {activeTab === 'dependents' && (
                    <div className="space-y-6 animate-fadeIn">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-700 mb-4 border-b pb-2">Dependents</h3>
                            {employee.dependents?.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {employee.dependents.map((dep: any, i: number) => (
                                        <div key={i} className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200 hover:bg-gradient-to-br hover:from-blue-100 hover:to-indigo-100 transition-colors">
                                            <p className="font-medium text-gray-800">{dep.name}</p>
                                            <p className="text-sm text-gray-500">{dep.relation}</p>
                                            <p className="text-sm text-gray-500">DOB: {formatDate(dep.dateOfBirth)}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : <p className="text-gray-400 italic">No dependents listed</p>}
                        </div>
                    </div>
                )}

                {/* Employment History Tab */}
                {activeTab === 'history' && (
                    <div className="space-y-6 animate-fadeIn">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-700 mb-4 border-b pb-2">Previous Employment</h3>
                            {employee.employmentHistory?.length > 0 ? (
                                <div className="space-y-4">
                                    {employee.employmentHistory.map((history: any, i: number) => (
                                        <div key={i} className="p-4 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg border border-indigo-200 hover:bg-gradient-to-br hover:from-indigo-100 hover:to-purple-100 transition-colors">
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <p className="font-semibold text-gray-800">{history.companyName}</p>
                                                    <p className="text-sm text-gray-600">{history.jobTitle}</p>
                                                </div>
                                                <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded">
                                                    {formatDate(history.startDate)} - {formatDate(history.endDate)}
                                                </span>
                                            </div>
                                            {history.reasonForLeaving && (
                                                <p className="text-sm text-gray-500 mt-2">Reason: {history.reasonForLeaving}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : <p className="text-gray-400 italic">No employment history recorded</p>}
                        </div>
                    </div>
                )}

                {/* Education Tab */}
                {activeTab === 'education' && (
                    <div className="space-y-6 animate-fadeIn">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-700 mb-4 border-b pb-2">Educational Background</h3>
                            {employee.education?.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {employee.education.map((edu: any, i: number) => (
                                        <div key={i} className="p-4 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg border border-purple-200 hover:bg-gradient-to-br hover:from-purple-100 hover:to-indigo-100 transition-colors">
                                            <p className="font-semibold text-gray-800">{edu.level}</p>
                                            <p className="text-sm text-gray-600">{edu.institute}</p>
                                            <p className="text-sm text-gray-500">Year: {edu.year}</p>
                                            {edu.score && <p className="text-sm text-gray-500">Score: {edu.score}</p>}
                                        </div>
                                    ))}
                                </div>
                            ) : <p className="text-gray-400 italic">No education records</p>}
                        </div>
                    </div>
                )}

                {/* Contact Tab */}
                {activeTab === 'contact' && (
                    <div className="space-y-8 animate-fadeIn">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-700 mb-4 border-b pb-2">Contact Details</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-6 gap-x-8">
                                <Field label="Email" value={employee.email} />
                                <Field label="Phone" value={employee.phone} />
                            </div>
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-gray-700 mb-4 border-b pb-2">Address</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-6 gap-x-8">
                                <Field label="Street" value={employee.address?.street} />
                                <Field label="City" value={employee.address?.city} />
                                <Field label="State" value={employee.address?.state} />
                                <Field label="Country" value={employee.address?.country} />
                            </div>
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-gray-700 mb-4 border-b pb-2">Emergency Contacts</h3>
                            {employee.emergencyContacts?.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {employee.emergencyContacts.map((c: any, i: number) => (
                                        <div key={i} className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200 hover:bg-gradient-to-br hover:from-blue-100 hover:to-indigo-100 transition-colors">
                                            <p className="font-medium text-gray-800">{c.name}</p>
                                            <p className="text-sm text-gray-500">{c.relation} • {c.phone}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : <p className="text-gray-400 italic">No emergency contacts listed</p>}
                        </div>
                    </div>
                )}

                {/* Job Tab */}
                {activeTab === 'job' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-6 gap-x-8 animate-fadeIn">
                        <Field label="Designation" value={employee.jobInfo?.designation} />
                        <Field label="Department" value={employee.jobInfo?.department} />
                        <Field label="Reporting Manager" value={employee.jobInfo?.reportingManager} />
                        <Field label="Work Location" value={employee.jobInfo?.workLocation} />
                        <Field label="Joining Date" value={formatDate(employee.jobInfo?.joiningDate)} />

                        <div className="col-span-full mt-4 p-4 bg-gradient-to-r from-indigo-50 via-purple-50 to-indigo-50 rounded-lg border border-indigo-200">
                            <h4 className="font-medium text-purple-900 mb-2">Current Status</h4>
                            <div className="flex gap-4">
                                <Field
                                    label="Status"
                                    value={typeof employee.employmentStatus === 'string' ? employee.employmentStatus : employee.employmentStatus?.status}
                                />
                                <Field
                                    label="Start Date"
                                    value={formatDate(typeof employee.employmentStatus === 'string' ? '' : employee.employmentStatus?.startDate)}
                                />
                                {typeof employee.employmentStatus !== 'string' && employee.employmentStatus?.status === 'Probation' && (
                                    <Field
                                        label="Probation End Date"
                                        value={formatDate(employee.employmentStatus?.probationEndDate)}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Finance Tab */}
                {activeTab === 'finance' && (
                    <div className="space-y-8 animate-fadeIn">
                        <div>
                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                <DollarSign size={16} /> Salary Structure
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {employee.salaryComponents?.length > 0 ? (
                                    employee.salaryComponents.map((comp: any, i: number) => (
                                        <div key={i} className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                                                    <DollarSign size={16} />
                                                </div>
                                                <span className="text-xs font-bold text-slate-400 uppercase">{comp.type}</span>
                                            </div>
                                            <p className="text-sm font-bold text-gray-800">{comp.component}</p>
                                            <p className="text-2xl font-black text-indigo-600 mt-1">
                                                {new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', currencyDisplay: 'code' }).format(comp.amount).replace('PKR', 'Rs.')}
                                            </p>
                                        </div>
                                    ))
                                ) : <p className="text-gray-400 italic text-sm">No salary components recorded</p>}
                            </div>
                        </div>

                        <div className="pt-8 border-t border-slate-100">
                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                <Banknote size={16} /> Bank Account Details
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 bg-slate-50/50 p-6 rounded-3xl border border-slate-100">
                                <Field label="Bank Name" value={employee.bankDetails?.bankName} />
                                <Field label="Account Holder" value={employee.bankDetails?.accountName} />
                                <Field label="Account Number" value={employee.bankDetails?.accountNumber} />
                                <Field label="IBAN" value={employee.bankDetails?.iban} />
                                <Field label="Swift Code" value={employee.bankDetails?.swiftCode} />
                            </div>
                        </div>
                    </div>
                )}

                {/* Benefits Tab */}
                {activeTab === 'benefits' && (
                    <div className="space-y-6 animate-fadeIn">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-700 mb-4 border-b pb-2 flex items-center gap-2">
                                <Gift size={20} className="text-indigo-600" /> Company Benefits
                            </h3>
                            {employee.benefits?.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {employee.benefits.map((benefit: any, i: number) => (
                                        <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
                                            <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                                            <div className="flex justify-between items-start mb-3">
                                                <h4 className="font-bold text-gray-800 text-lg">{benefit.name}</h4>
                                                <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
                                                    benefit.status === 'Active' ? 'bg-emerald-100 text-emerald-700' :
                                                    benefit.status === 'Pending' ? 'bg-amber-100 text-amber-700' :
                                                    'bg-red-100 text-red-700'
                                                }`}>
                                                    {benefit.status || 'Active'}
                                                </span>
                                            </div>
                                            {benefit.description && (
                                                <p className="text-gray-500 text-sm mb-4 line-clamp-2">{benefit.description}</p>
                                            )}
                                            <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-xs text-gray-400">
                                                <span className="font-medium">Eligible Since</span>
                                                <span className="font-bold text-gray-600">{formatDate(benefit.eligibleDate)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-12 text-gray-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                                    <Gift size={48} className="mx-auto mb-4 opacity-20" />
                                    <p>No benefits assigned yet</p>
                                    <p className="text-sm mt-1">HR can assign benefits through the edit profile section.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Documents Tab */}
                {activeTab === 'documents' && (
                    <div className="animate-fadeIn">
                        {employee.attachments?.length > 0 ? (
                            <div className="space-y-4">
                                {employee.attachments.map((file: any, i: number) => {
                                    const getFileTypeColor = (type: string) => {
                                        const colors: any = {
                                            'ID': 'from-blue-600 to-cyan-600',
                                            'Contract': 'from-green-600 to-emerald-600',
                                            'Certificate': 'from-purple-600 to-pink-600',
                                            'Degree': 'from-orange-600 to-amber-600',
                                            'Experience Letter': 'from-indigo-600 to-purple-600',
                                            'Document': 'from-gray-600 to-slate-600'
                                        };
                                        return colors[type] || colors['Document'];
                                    };

                                    const getStatusBadge = (status: string) => {
                                        if (status === 'approved') {
                                            return <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded flex items-center gap-1"><Check size={12} /> Approved</span>;
                                        } else if (status === 'rejected') {
                                            return <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded flex items-center gap-1"><X size={12} /> Rejected</span>;
                                        } else {
                                            return <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">Pending</span>;
                                        }
                                    };

                                    const handleApprove = async (attachmentId: string) => {
                                        const token = localStorage.getItem('token');
                                        try {
                                            const response = await fetch(`${api.employees}/${id}/attachments/${attachmentId}`, {
                                                method: 'PATCH',
                                                headers: {
                                                    'Content-Type': 'application/json',
                                                    'Authorization': `Bearer ${token}`
                                                },
                                                body: JSON.stringify({ status: 'approved' })
                                            });
                                            if (response.ok) {
                                                // Refresh employee data
                                                const updated = await fetch(`${api.employees}/${id}`, {
                                                    headers: { 'Authorization': `Bearer ${token}` }
                                                }).then(r => r.json());
                                                setEmployee(updated);
                                            }
                                        } catch (err) {
                                            console.error('Error approving document:', err);
                                        }
                                    };

                                    const handleReject = async (attachmentId: string) => {
                                        const token = localStorage.getItem('token');
                                        try {
                                            const response = await fetch(`${api.employees}/${id}/attachments/${attachmentId}`, {
                                                method: 'PATCH',
                                                headers: {
                                                    'Content-Type': 'application/json',
                                                    'Authorization': `Bearer ${token}`
                                                },
                                                body: JSON.stringify({ status: 'rejected' })
                                            });
                                            if (response.ok) {
                                                // Refresh employee data
                                                const updated = await fetch(`${api.employees}/${id}`, {
                                                    headers: { 'Authorization': `Bearer ${token}` }
                                                }).then(r => r.json());
                                                setEmployee(updated);
                                            }
                                        } catch (err) {
                                            console.error('Error rejecting document:', err);
                                        }
                                    };

                                    const handleDownload = (attachmentId: string, fileName: string) => {
                                        if (!attachmentId) return;
                                        const url = api.attachmentRaw(attachmentId);
                                        const link = document.createElement('a');
                                        link.href = url;
                                        link.download = fileName;
                                        link.target = '_blank';
                                        document.body.appendChild(link);
                                        link.click();
                                        document.body.removeChild(link);
                                    };

                                    const handleDelete = async (attachmentId: string) => {
                                        if (!window.confirm('Are you sure you want to delete this document?')) return;
                                        const token = localStorage.getItem('token');
                                        try {
                                            const response = await fetch(`${api.employees}/${id}/attachments/${attachmentId}`, {
                                                method: 'DELETE',
                                                headers: {
                                                    'Authorization': `Bearer ${token}`
                                                }
                                            });
                                            if (response.ok) {
                                                // Refresh employee data
                                                const updated = await fetch(`${api.employees}/${id}`, {
                                                    headers: { 'Authorization': `Bearer ${token}` }
                                                }).then(r => r.json());
                                                setEmployee(updated);
                                            }
                                        } catch (err) {
                                            console.error('Error deleting document:', err);
                                        }
                                    };

                                    return (
                                        <div key={i} className="flex items-center justify-between p-4 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg border border-indigo-200 hover:bg-gradient-to-br hover:from-indigo-100 hover:to-purple-100 transition-colors">
                                            <div className="flex items-center gap-3 flex-1">
                                                <div className={`p-2 bg-gradient-to-r ${getFileTypeColor(file.fileType)} rounded-lg shadow-sm text-white`}>
                                                    <FileText size={20} />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <p className="font-medium text-gray-800">{file.fileName}</p>
                                                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">{file.fileType || 'Document'}</span>
                                                        {getStatusBadge(file.status || 'pending')}
                                                    </div>
                                                    <p className="text-xs text-gray-500">Uploaded on {formatDate(file.uploadDate)}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {canApproveDocuments() && file.status !== 'approved' && file.status !== 'rejected' && (
                                                    <>
                                                        <button
                                                            onClick={() => handleApprove(file._id)}
                                                            className="p-2 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-all"
                                                            title="Approve"
                                                        >
                                                            <Check size={18} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleReject(file._id)}
                                                            className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all"
                                                            title="Reject"
                                                        >
                                                            <X size={18} />
                                                        </button>
                                                    </>
                                                )}
                                                {canApproveDocuments() && (
                                                    <button
                                                        onClick={() => handleDelete(file._id)}
                                                        className="p-2 text-red-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                        title="Delete permanently"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleDownload(file._id, file.fileName)}
                                                    className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all"
                                                    title="Download"
                                                >
                                                    <Download size={20} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-12 text-gray-400">
                                <FileText size={48} className="mx-auto mb-4 opacity-20" />
                                <p>No documents uploaded yet</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Audit Logs Tab */}
                {activeTab === 'audit' && (
                    <div className="animate-fadeIn">
                        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="flex items-center gap-2 text-blue-800">
                                <AlertCircle size={16} />
                                <p className="text-sm font-medium">All changes to this employee record are tracked here</p>
                            </div>
                        </div>
                        {auditLogs.length > 0 ? (
                            <div className="space-y-4">
                                {auditLogs.map((log: any, i: number) => (
                                    <div key={i} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 shadow-sm">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <span className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${log.action === 'CREATE' ? 'bg-emerald-100 text-emerald-700' :
                                                    log.action === 'UPDATE' ? 'bg-indigo-100 text-indigo-700' :
                                                        log.action === 'DELETE' ? 'bg-red-100 text-red-700' :
                                                            'bg-slate-200 text-slate-700'
                                                    }`}>
                                                    {log.action.replace('_', ' ')}
                                                </span>
                                                <p className="text-xs text-gray-500 mt-2 font-medium">By: <span className="text-indigo-600 font-bold">{log.performedBy}</span></p>
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-400 bg-white px-2 py-1 rounded-md border border-slate-100">{formatDate(log.timestamp)}</span>
                                        </div>

                                        {log.details && (
                                            <div className="mt-2">
                                                {log.details.diff ? (
                                                    <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
                                                        <table className="min-w-full divide-y divide-slate-100">
                                                            <thead className="bg-slate-50">
                                                                <tr>
                                                                    <th className="px-4 py-2 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Field</th>
                                                                    <th className="px-4 py-2 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Old Value</th>
                                                                    <th className="px-4 py-2 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">New Value</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-100">
                                                                <DiffRows diff={log.details.diff} />
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                ) : (
                                                    <div className="p-3 bg-white rounded-xl border border-slate-100 text-xs font-mono text-slate-600 overflow-auto max-h-40">
                                                        <pre>{JSON.stringify(log.details, null, 2)}</pre>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-12 text-gray-400">
                                <Shield size={48} className="mx-auto mb-4 opacity-20" />
                                <p>No audit logs available</p>
                            </div>
                        )}
                    </div>
                )}

            </div>
        </div>
    );
};

const DiffRows = ({ diff, prefix = '' }: { diff: any, prefix?: string }) => {
    return (
        <>
            {Object.entries(diff).map(([key, value]: [string, any]) => {
                const label = prefix ? `${prefix}.${key}` : key;

                // If value has 'old' and 'new' keys, it's a direct change
                if (value && typeof value === 'object' && 'old' in value && 'new' in value) {
                    return (
                        <tr key={label} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-2 text-xs font-bold text-slate-700 capitalize">{label.replace(/([A-Z])/g, ' $1').replace(/\./g, ' > ')}</td>
                            <td className="px-4 py-2 text-xs text-red-500 line-through bg-red-50/30 font-medium">{String(value.old ?? 'None')}</td>
                            <td className="px-4 py-2 text-xs text-emerald-600 bg-emerald-50/30 font-bold">{String(value.new ?? 'None')}</td>
                        </tr>
                    );
                }

                // Otherwise, it's a nested object (another diff object)
                if (value && typeof value === 'object') {
                    return <DiffRows key={label} diff={value} prefix={label} />;
                }
                return null;
            })}
        </>
    );
};

const Field = ({ label, value }: { label: string, value: any }) => (
    <div className="space-y-1">
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</label>
        <p className="text-gray-800 font-medium">{value || '-'}</p>
    </div>
);

const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

export default EmployeeProfile;
