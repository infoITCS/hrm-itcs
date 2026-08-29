
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ChevronLeft, User, Phone, Briefcase, FileText, Download, Edit2, History,
    GraduationCap, Users, Shield, AlertCircle, Check, X, Eye,
    DollarSign, Banknote, Globe, Trash2, Camera, Gift, AlertTriangle, LogOut, Lock, Unlock
} from 'lucide-react';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import { getAvatarUrl } from '../../utils/avatar';
import Avatar from '../../components/UI/Avatar';
import DeleteModal from '../../components/UI/DeleteModal';
import SalaryPinModal from '../../components/UI/SalaryPinModal';
import { formatEmployeeFullName } from '../../utils/nameHelper';

const EmployeeProfile = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, login } = useAuth();
    const { showToast } = useToast();
    const { canEditSensitiveData, canApproveDocuments, role } = usePermissions();

    // Read the query parameter 'tab' from URL
    const queryParams = new URLSearchParams(window.location.search);
    const initialTab = queryParams.get('tab') || 'personal';

    const [activeTab, setActiveTab] = useState(initialTab);
    const [employee, setEmployee] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [auditLogs, setAuditLogs] = useState<any[]>([]);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);

    // All employees list — used to resolve reporting manager name
    const [allEmployees, setAllEmployees] = useState<any[]>([]);

    // Financial Lock state
    const [isFinancialUnlocked, setIsFinancialUnlocked] = useState(false);
    const [showMasterPinModal, setShowMasterPinModal] = useState(false);

    // Offboard modal state
    const [showOffboardModal, setShowOffboardModal] = useState(false);
    const [offboardStatus, setOffboardStatus] = useState<'Terminated' | 'Resigned'>('Terminated');
    const [offboardLoading, setOffboardLoading] = useState(false);

    const [previewDoc, setPreviewDoc] = useState<{ url: string; name: string; type: string } | null>(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [attachmentToDelete, setAttachmentToDelete] = useState<string | null>(null);

    const isAdmin = ['super-admin', 'admin', 'hr'].includes(role);
    const canViewFinancials = ['super-admin', 'finance', 'hr'].includes(role);

    const fetchEmployee = useCallback(async () => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${api.employees}/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to fetch employee');
            const data = await res.json();
            setEmployee(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [id]);

    const fetchAuditLogs = useCallback(async () => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${api.audit}?targetResource=Employee&targetId=${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            // Support both old array response and new { logs } shape
            setAuditLogs(Array.isArray(data) ? data : (data.logs || []));
        } catch (err) {
            console.error('Error fetching audit logs:', err);
        }
    }, [id]);

    const fetchAllEmployees = useCallback(async () => {
        if (!isAdmin) return; // only admins need the full list for name resolution
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(api.employees, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                // Handle paginated response { employees } or plain array
                const empArray = Array.isArray(data) ? data : (data.employees || []);
                setAllEmployees(empArray);
            }
        } catch (err) {
            console.error('Error fetching employees list:', err);
        }
    }, [isAdmin]);

    useEffect(() => {
        fetchEmployee();
        fetchAuditLogs();
        fetchAllEmployees();
    }, [id, fetchEmployee, fetchAuditLogs, fetchAllEmployees]);

    const [localAvatarPreview, setLocalAvatarPreview] = useState<string | null>(null);
    const [viewingAvatarUrl, setViewingAvatarUrl] = useState<string | null>(null);

    if (loading) return <div className="p-8 text-center">Loading Profile...</div>;
    if (!employee) return <div className="p-8 text-center">Employee Not Found</div>;

    // Resolve manager ID/name to a display name
    const resolveManagerName = (managerValue: string) => {
        if (!managerValue) return '-';
        // Check if value looks like an employee ID (itcs-xxx format) or a name
        const found = allEmployees.find(
            e => e.employeeId === managerValue || 
                 formatEmployeeFullName(e, '').toLowerCase() === managerValue.toLowerCase()
        );
        if (found) return `${formatEmployeeFullName(found, found.employeeId)} (${found.employeeId})`;
        return managerValue; // Return as-is if we can't resolve
    };

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !employee) return;

        // Instant local preview
        const localUrl = URL.createObjectURL(file);
        setLocalAvatarPreview(localUrl);
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
            
            const attachment = await response.json();
            
            // Sync AuthContext if this is the current user
            const isSelf = 
                employee.userId === user?.id || 
                (employee.userId && typeof employee.userId === 'object' && (employee.userId as any)._id === user?.id) ||
                employee.workEmail === user?.email ||
                employee.email === user?.email;

            if (isSelf) {
                const newAvatarUrl = `${api.baseURL}/api/employees/attachments/raw/${attachment._id}?token=${token}&t=${Date.now()}`;
                login((prev: any) => prev ? { ...prev, avatar: newAvatarUrl } : prev as any);
            }
            
            await fetchEmployee();
        } catch (err: any) {
            console.error('Error uploading avatar:', err);
            showToast('Failed to upload profile picture.', 'error');
            setLocalAvatarPreview(null);
        } finally {
            setUploadingAvatar(false);
            // We keep the local preview for a few seconds or until fetchEmployee finishes if we want
        }
    };

    const handleOffboard = async () => {
        setOffboardLoading(true);
        const token = localStorage.getItem('token');
        try {
            const response = await fetch(`${api.employees}/${employee.employeeId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    employmentStatus: { 
                        ...employee.employmentStatus,
                        status: offboardStatus, 
                        autoUpdated: false,
                        offboardingDate: new Date()
                    }
                })
            });
            if (response.ok) {
                await fetchEmployee();
                await fetchAuditLogs();
                setShowOffboardModal(false);
            } else {
                const err = await response.json();
                showToast(err.message || 'Failed to update status', 'error');
            }
        } catch (err) {
            console.error('Error offboarding employee:', err);
        } finally {
            setOffboardLoading(false);
        }
    };

    const isOffboarded = ['Terminated', 'Resigned'].includes(
        employee.employmentStatus?.status || employee.employmentStatus || ''
    );

    const handleApprove = async (attachmentId: string) => {
        const token = localStorage.getItem('token');
        await fetch(`${api.employees}/${id}/attachments/${attachmentId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ status: 'approved' })
        });
        await fetchEmployee();
    };

    const handleReject = async (attachmentId: string) => {
        const token = localStorage.getItem('token');
        await fetch(`${api.employees}/${id}/attachments/${attachmentId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ status: 'rejected' })
        });
        await fetchEmployee();
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
        setAttachmentToDelete(attachmentId);
        setShowDeleteModal(true);
    };

    const confirmDelete = async () => {
        if (!attachmentToDelete) return;
        const token = localStorage.getItem('token');
        const response = await fetch(`${api.employees}/${id}/attachments/${attachmentToDelete}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            await fetchEmployee();
            setShowDeleteModal(false);
            setAttachmentToDelete(null);
        }
    };

    const tabs = [
        { id: 'personal', label: 'Personal', icon: User },
        { id: 'contact', label: 'Contact', icon: Phone },
        { id: 'job', label: 'Job', icon: Briefcase },
        { id: 'immigration', label: 'Immigration', icon: Globe },
        ...(canViewFinancials ? [{ id: 'finance', label: 'Finance', icon: Banknote }] : []),
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
            <div className="flex flex-wrap items-center gap-4 animate-slide-up bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
                <button onClick={() => navigate('/pim')} className="p-2 hover:bg-slate-100 rounded-xl text-gray-400 hover:text-indigo-600 transition-all shrink-0">
                    <ChevronLeft size={24} />
                </button>

                <div className="relative group shrink-0">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-indigo-600 text-2xl font-bold border-4 border-white shadow-md overflow-hidden transition-transform group-hover:scale-105 relative">
                        <Avatar
                            src={localAvatarPreview || getAvatarUrl(employee)}
                            firstName={employee.firstName}
                            lastName={employee.lastName}
                            size="w-full h-full"
                            initialsClassName="bg-gradient-to-br from-indigo-100 to-purple-100 text-indigo-600 text-2xl font-bold"
                        />

                        <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center gap-1.5 backdrop-blur-[2px] text-white">
                            {(localAvatarPreview || getAvatarUrl(employee)) && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const url = localAvatarPreview || getAvatarUrl(employee);
                                        if (url) setViewingAvatarUrl(url);
                                    }}
                                    className="p-1.5 bg-white/20 hover:bg-white/35 rounded-lg transition-all flex flex-col items-center justify-center hover:scale-105"
                                    title="View Profile Picture"
                                >
                                    <Eye size={16} />
                                    <span className="text-[8px] font-extrabold uppercase tracking-wider">View</span>
                                </button>
                            )}

                            {canEditSensitiveData() && (
                                <label className="p-1.5 bg-white/20 hover:bg-white/35 rounded-lg transition-all cursor-pointer flex flex-col items-center justify-center hover:scale-105" title="Change Profile Picture">
                                    <Camera size={16} />
                                    <span className="text-[8px] font-extrabold uppercase tracking-wider">Change</span>
                                    <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
                                </label>
                            )}
                        </div>

                        {uploadingAvatar && (
                            <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                                <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex-1 min-w-0">
                    <h1 className="text-lg sm:text-2xl font-bold text-gray-800 truncate">
                        {formatEmployeeFullName(employee, 'Employee')}
                    </h1>
                    <p className="text-gray-500 text-sm truncate">{employee.jobInfo?.designation} • {employee.jobInfo?.department}</p>
                    {/* Offboard status badge */}
                    {isOffboarded && (
                        <span className="inline-flex items-center gap-1.5 mt-1 px-3 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200">
                            <AlertTriangle size={12} />
                            {employee.employmentStatus?.status || employee.employmentStatus}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2 sm:gap-3 ml-auto">
                    {/* Quick Offboard Button — admin only, only if not already offboarded */}
                    {isAdmin && !isOffboarded && (
                        <button
                            onClick={() => setShowOffboardModal(true)}
                            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 border border-rose-200 text-rose-600 bg-rose-50 rounded-lg hover:bg-rose-100 hover:border-rose-300 transition-all font-medium text-xs sm:text-sm"
                        >
                            <LogOut size={14} />
                            <span className="hidden sm:inline">Offboard</span>
                        </button>
                    )}

                    {canEditSensitiveData() && (
                        <button
                            onClick={() => navigate(`/pim/edit/${employee.employeeId}`)}
                            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all font-medium text-xs sm:text-sm shadow-sm hover:shadow-md"
                        >
                            <Edit2 size={14} />
                            <span className="hidden sm:inline">Edit Profile</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 overflow-x-auto">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-5 py-3 font-medium text-sm transition-all border-b-2 whitespace-nowrap ${activeTab === tab.id
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
                            <Field label="Full Name" value={formatEmployeeFullName(employee, '—')} />
                            <Field label="Date of Birth" value={formatDate(employee.dateOfBirth)} />
                            <Field label="Gender" value={employee.gender} />
                            <Field label="Marital Status" value={employee.maritalStatus} />
                            <Field label="Nationality" value={employee.nationality} />
                            <Field label="Domicile" value={employee.domicile} />
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
                                                href={profile.link?.startsWith('http') ? profile.link : `https://${profile.link}`}
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

                        {/* Certifications Display */}
                        {employee.certifications?.length > 0 && (
                            <div className="pt-8 border-t border-slate-100">
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <FileText size={16} /> Certifications
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                    {employee.certifications.map((cert: any, idx: number) => {
                                        const savedFile = employee.attachments?.find((a: any) => a.fileType === `Certification - ${idx}`);
                                        return (
                                            <div key={idx} className="p-4 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 group/cert hover:border-indigo-300 transition-all shadow-sm">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="p-2 bg-indigo-50 text-indigo-500 rounded-lg shrink-0">
                                                        <FileText size={16} />
                                                    </div>
                                                    <h4 className="font-semibold text-sm text-slate-700 truncate" title={cert.title}>{cert.title || 'Untitled Certification'}</h4>
                                                </div>
                                                {savedFile && (
                                                    <div className="flex items-center gap-1 shrink-0 opacity-60 group-hover/cert:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={() => {
                                                                const url = api.attachmentRaw(savedFile._id);
                                                                const ext = savedFile.fileName?.split('.').pop()?.toLowerCase() || '';
                                                                setPreviewDoc({ url, name: savedFile.fileName, type: ext });
                                                            }}
                                                            className="p-1.5 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-all"
                                                            title="Preview Certification"
                                                        >
                                                            <Eye size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDownload(savedFile._id, savedFile.fileName)}
                                                            className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                                            title="Download Certification"
                                                        >
                                                            <Download size={16} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
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
                        {/* #2 FIX: Resolve manager name instead of showing raw ID */}
                        <Field label="Reporting Manager" value={resolveManagerName(employee.jobInfo?.reportingManager)} />
                        <Field label="Work Location" value={employee.jobInfo?.workLocation} />
                        <Field label="Joining Date" value={formatDate(employee.jobInfo?.joiningDate)} />

                        <div className="col-span-full mt-4 p-4 bg-gradient-to-r from-indigo-50 via-purple-50 to-indigo-50 rounded-lg border border-indigo-200">
                            <h4 className="font-medium text-purple-900 mb-2">Employment Status</h4>
                            <div className="flex gap-12">
                                <Field
                                    label="Current Status"
                                    value={typeof employee.employmentStatus === 'string' ? employee.employmentStatus : employee.employmentStatus?.status}
                                />
                                {employee.employmentStatus?.offboardingDate && (
                                    <Field
                                        label="Offboarding Date"
                                        value={formatDate(employee.employmentStatus?.offboardingDate)}
                                    />
                                )}
                                {typeof employee.employmentStatus !== 'string' && employee.employmentStatus?.status === 'Probation' && (
                                    <Field
                                        label="Probation End Date"
                                        value={formatDate(employee.employmentStatus?.probationEndDate)}
                                    />
                                )}
                            </div>
                            {typeof employee.employmentStatus !== 'string' && employee.employmentStatus?.status === 'On Hold' && (
                                <p className="text-xs text-amber-700 mt-2">
                                    This employee is on hold and is excluded from payroll processing.
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* Immigration Tab — #1 FIX: New tab */}
                {activeTab === 'immigration' && (
                    <div className="space-y-6 animate-fadeIn">
                        <h3 className="text-lg font-semibold text-gray-700 mb-4 border-b pb-2 flex items-center gap-2">
                            <Globe size={20} className="text-indigo-600" />
                            Immigration & Travel Documents
                        </h3>
                        {employee.immigrationHistory?.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {employee.immigrationHistory.map((doc: any, i: number) => (
                                    <div key={i} className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
                                        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-indigo-500 to-purple-500" />
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <span className="inline-block px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold uppercase tracking-wider mb-2">
                                                    {doc.documentType}
                                                </span>
                                                <p className="text-lg font-bold text-gray-800 font-mono">{doc.documentNumber || '—'}</p>
                                            </div>
                                            <Globe size={24} className="text-slate-200 group-hover:text-indigo-200 transition-colors" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-100">
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Issue Date</p>
                                                <p className="text-sm font-semibold text-slate-700">{formatDate(doc.issueDate)}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Expiry Date</p>
                                                <p className={`text-sm font-semibold ${doc.expiryDate && new Date(doc.expiryDate) < new Date() ? 'text-rose-600' : 'text-slate-700'}`}>
                                                    {formatDate(doc.expiryDate)}
                                                </p>
                                            </div>
                                            <div className="col-span-2">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Issuing Country</p>
                                                <p className="text-sm font-semibold text-slate-700">{doc.issuingCountry || '—'}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-12 text-gray-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                                <Globe size={48} className="mx-auto mb-4 opacity-20" />
                                <p>No immigration documents recorded</p>
                                <p className="text-sm mt-1">Add documents through the Edit Profile section.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Finance Tab — Only accessible by Super-Admin, Finance, and HR */}
                {activeTab === 'finance' && canViewFinancials && (
                    !isFinancialUnlocked ? (
                        <div className="p-8 sm:p-12 bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-100/50 text-center max-w-lg mx-auto my-8 space-y-5 animate-fadeIn">
                            <div className="w-16 h-16 bg-amber-50 ring-8 ring-amber-50/50 rounded-2xl flex items-center justify-center mx-auto text-amber-600">
                                <Lock size={30} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">Confidential Financial Profile Locked</h3>
                                <p className="text-xs text-slate-500 mt-1.5 max-w-sm mx-auto leading-relaxed">
                                    Salary components, compensation packages, Provident Fund balance, and bank records are protected. Enter the Universal Master Financial PIN to unlock.
                                </p>
                            </div>
                            <button
                                onClick={() => setShowMasterPinModal(true)}
                                className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-indigo-200 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
                            >
                                <Lock size={15} /> Unlock Financial Records
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-8 animate-fadeIn">
                            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200/80 px-4 py-2.5 rounded-2xl">
                                <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                                    <Unlock size={16} className="text-emerald-600" />
                                    <span>Financial Profile Unlocked (Master Security Active)</span>
                                </div>
                                <button
                                    onClick={() => setIsFinancialUnlocked(false)}
                                    className="px-3 py-1 bg-white hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200 transition-all cursor-pointer flex items-center gap-1"
                                >
                                    <Lock size={12} /> Lock
                                </button>
                            </div>

                            <div>
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                    <DollarSign size={16} /> Salary Structure
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {employee.salaryComponents?.length > 0 ? (
                                        employee.salaryComponents.map((comp: any, i: number) => (
                                            <div key={i} className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                                                            <DollarSign size={16} />
                                                        </div>
                                                        <p className="text-sm font-bold text-gray-800">{comp.component}</p>
                                                    </div>
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                                        comp.type === 'variable'
                                                            ? 'bg-purple-100 text-purple-700'
                                                            : 'bg-emerald-100 text-emerald-700'
                                                    }`}>
                                                        {comp.type || 'fixed'}
                                                    </span>
                                                </div>
                                                <p className="text-2xl font-black text-indigo-600 mt-1">
                                                    {new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', currencyDisplay: 'code' }).format(comp.amount).replace('PKR', 'Rs.')}
                                                </p>
                                            </div>
                                        ))
                                    ) : <p className="text-gray-400 italic text-sm">No salary components recorded</p>}
                                </div>
                                {/* Total gross */}
                                {employee.salaryComponents?.length > 0 && (
                                    <div className="mt-4 p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-center justify-between">
                                        <p className="text-sm font-bold text-indigo-700">Total Monthly Gross</p>
                                        <p className="text-xl font-black text-indigo-700">
                                            {new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(
                                                employee.salaryComponents.reduce((sum: number, c: any) => sum + (c.amount || 0), 0)
                                            )}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Provident Fund Balance */}
                            <div className="pt-8 border-t border-slate-100 animate-fadeIn">
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                    <Banknote size={16} className="text-emerald-500" /> Provident Fund Details
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 bg-slate-50/50 p-6 rounded-3xl border border-slate-100 mb-6">
                                    <Field 
                                        label="Current PF Balance" 
                                        value={employee.providentFundBalance ? new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(employee.providentFundBalance).replace('PKR', 'Rs.') : 'Rs. 0'} 
                                    />
                                    <Field 
                                        label="PF Enrolled Since" 
                                        value={employee.employmentDetails?.joiningDate ? formatDate(employee.employmentDetails.joiningDate) : 'Not Enrolled'} 
                                    />
                                    <Field 
                                        label="PF Match Scheme" 
                                        value="Standard Employee + Employer Match" 
                                    />
                                </div>

                                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                                    <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100">
                                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">PF Contribution & Adjustment History</h4>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse text-sm">
                                            <thead>
                                                <tr className="bg-slate-50/30 text-xs font-bold text-slate-400 uppercase border-b border-slate-100">
                                                    <th className="px-6 py-3">Date</th>
                                                    <th className="px-6 py-3">Description</th>
                                                    <th className="px-6 py-3">Source</th>
                                                    <th className="px-6 py-3">Type</th>
                                                    <th className="px-6 py-3 text-right">Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                                                {employee.providentFundHistory?.length > 0 ? (
                                                    [...employee.providentFundHistory]
                                                        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                                        .map((entry: any, index: number) => (
                                                            <tr key={index} className="hover:bg-slate-50/40 transition-colors">
                                                                <td className="px-6 py-4 text-xs text-slate-400">
                                                                    {new Date(entry.date).toLocaleString()}
                                                                </td>
                                                                <td className="px-6 py-4 font-semibold text-slate-800">
                                                                    {entry.description}
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                                                                        entry.source === 'payroll' 
                                                                            ? 'bg-blue-50 text-blue-600 border-blue-100' 
                                                                            : 'bg-amber-50 text-amber-600 border-amber-100'
                                                                    }`}>
                                                                        {entry.source}
                                                                    </span>
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                                        entry.type === 'credit' 
                                                                            ? 'bg-emerald-50 text-emerald-600' 
                                                                            : 'bg-rose-50 text-rose-600'
                                                                    }`}>
                                                                        {entry.type === 'credit' ? '+ Credit' : '- Debit'}
                                                                    </span>
                                                                </td>
                                                                <td className={`px-6 py-4 text-right font-black ${
                                                                    entry.type === 'credit' ? 'text-emerald-600' : 'text-rose-600'
                                                                }`}>
                                                                    Rs. {entry.amount.toLocaleString()}
                                                                </td>
                                                            </tr>
                                                        ))
                                                ) : (
                                                    <tr>
                                                        <td colSpan={5} className="px-6 py-8 text-center text-slate-400 italic">
                                                            No contribution history recorded.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>

                            {/* Bank Account Details */}
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
                    )
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
                                    const colorMap: any = {
                                        'ID': 'from-blue-600 to-cyan-600',
                                        'Contract': 'from-green-600 to-emerald-600',
                                        'Certificate': 'from-purple-600 to-pink-600',
                                        'Degree': 'from-orange-600 to-amber-600',
                                        'Experience Letter': 'from-indigo-600 to-purple-600',
                                        'Document': 'from-gray-600 to-slate-600'
                                    };
                                    const color = colorMap[file.fileType] || colorMap['Document'];

                                    const getStatusBadge = (status: string) => {
                                        if (status === 'approved') return <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded flex items-center gap-1"><Check size={12} /> Approved</span>;
                                        if (status === 'rejected') return <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded flex items-center gap-1"><X size={12} /> Rejected</span>;
                                        return <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">Pending</span>;
                                    };

                                    // Re-using handlers from component scope

                                    return (
                                        <div key={i} className="flex items-center justify-between p-4 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg border border-indigo-200 hover:bg-gradient-to-br hover:from-indigo-100 hover:to-purple-100 transition-colors">
                                            <div className="flex items-center gap-3 flex-1">
                                                <div className={`p-2 bg-gradient-to-r ${color} rounded-lg shadow-sm text-white`}>
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
                                                <button
                                                    onClick={() => {
                                                        const url = api.attachmentRaw(file._id);
                                                        const ext = file.fileName?.split('.').pop()?.toLowerCase() || '';
                                                        setPreviewDoc({ url, name: file.fileName, type: ext });
                                                    }}
                                                    className="p-2 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-all"
                                                    title="Preview Document"
                                                >
                                                    <Eye size={18} />
                                                </button>
                                                {canApproveDocuments() && file.status !== 'approved' && file.status !== 'rejected' && (
                                                    <>
                                                        <button onClick={() => handleApprove(file._id)} className="p-2 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-all" title="Approve"><Check size={18} /></button>
                                                        <button onClick={() => handleReject(file._id)} className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all" title="Reject"><X size={18} /></button>
                                                    </>
                                                )}
                                                {canApproveDocuments() && (
                                                    <button onClick={() => handleDelete(file._id)} className="p-2 text-red-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Delete permanently"><Trash2 size={18} /></button>
                                                )}
                                                <button onClick={() => handleDownload(file._id, file.fileName)} className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all" title="Download"><Download size={20} /></button>
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
                                                {/* #15 FIX: Show resolved performer name */}
                                                <p className="text-xs text-gray-500 mt-2 font-medium">
                                                    By: <span className="text-indigo-600 font-bold">{log.performerName || log.performedBy}</span>
                                                </p>
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-400 bg-white px-2 py-1 rounded-md border border-slate-100">{formatDate(log.timestamp)}</span>
                                        </div>

                                        {log.details && (
                                            <div className="mt-2">
                                                {log.details.diff ? (
                                                    <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
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

            {/* Offboard Confirmation Modal — #5 FIX */}
            {showOffboardModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl border border-rose-100 p-8 max-w-md w-full mx-4 animate-slide-up">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-3 bg-rose-100 rounded-xl text-rose-600">
                                <LogOut size={24} />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-gray-800">Offboard Employee</h2>
                                <p className="text-sm text-gray-500">This will update the employment status immediately.</p>
                            </div>
                        </div>

                        <div className="my-6 p-4 bg-rose-50 rounded-xl border border-rose-100 flex items-center gap-3">
                            <AlertTriangle size={20} className="text-rose-500 flex-shrink-0" />
                            <p className="text-sm text-rose-700">
                                You are about to offboard <strong>{formatEmployeeFullName(employee, 'Employee')}</strong>. This action is logged and reversible via the edit profile.
                            </p>
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm font-semibold text-gray-600 mb-3">Select Offboarding Reason</label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => setOffboardStatus('Terminated')}
                                    className={`p-3 rounded-xl border-2 text-sm font-bold transition-all ${offboardStatus === 'Terminated' ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-slate-200 text-slate-600 hover:border-rose-200'}`}
                                >
                                    🔴 Terminated
                                </button>
                                <button
                                    onClick={() => setOffboardStatus('Resigned')}
                                    className={`p-3 rounded-xl border-2 text-sm font-bold transition-all ${offboardStatus === 'Resigned' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600 hover:border-amber-200'}`}
                                >
                                    🟡 Resigned
                                </button>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowOffboardModal(false)}
                                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleOffboard}
                                disabled={offboardLoading}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 text-white font-bold hover:bg-rose-700 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                            >
                                {offboardLoading ? (
                                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processing...</>
                                ) : (
                                    <><LogOut size={16} /> Confirm Offboard</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Document Preview Modal */}
            {previewDoc && createPortal(
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fadeIn">
                    <div className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-slide-up">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                            <div className="min-w-0 flex items-center gap-3">
                                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                                    <FileText size={20} />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-800 truncate" title={previewDoc.name}>
                                        {previewDoc.name}
                                    </h3>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                                        {previewDoc.type} file
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <a
                                    href={previewDoc.url}
                                    download={previewDoc.name}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                                    title="Download / Open in New Tab"
                                >
                                    <Download size={18} />
                                </a>
                                <button
                                    onClick={() => setPreviewDoc(null)}
                                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                                    title="Close"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Content Body */}
                        <div className="flex-1 bg-slate-900/5 flex items-center justify-center p-6 overflow-auto min-h-[300px]">
                            {['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(previewDoc.type.toLowerCase()) ? (
                                <img 
                                    src={previewDoc.url} 
                                    alt={previewDoc.name} 
                                    className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-md bg-white" 
                                />
                            ) : previewDoc.type.toLowerCase() === 'pdf' ? (
                                <iframe 
                                    src={previewDoc.url} 
                                    className="w-full h-[70vh] rounded-lg border border-slate-200/50 shadow-sm bg-white" 
                                    title={previewDoc.name} 
                                />
                            ) : (
                                <div className="text-center p-8 max-w-sm">
                                    <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-200/50 shadow-inner">
                                        <FileText size={32} />
                                    </div>
                                    <h4 className="text-sm font-bold text-slate-700 mb-1">Preview not supported</h4>
                                    <p className="text-xs text-slate-400 mb-6">
                                        This document type ({previewDoc.type.toUpperCase()}) cannot be previewed directly in the browser.
                                    </p>
                                    <a
                                        href={previewDoc.url}
                                        download={previewDoc.name}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-100 hover:shadow-lg hover:shadow-indigo-200"
                                    >
                                        <Download size={16} /> Download to View
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            , document.body)}

            {/* View Avatar Lightbox */}
            {viewingAvatarUrl && createPortal(
                <div 
                    className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fadeIn"
                    onClick={() => setViewingAvatarUrl(null)}
                >
                    <div 
                        className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col animate-slide-up"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <div>
                                <h3 className="text-sm font-bold text-slate-800">
                                    {formatEmployeeFullName(employee, 'Employee')}
                                </h3>
                                <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mt-0.5">
                                    Profile Picture
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <a
                                    href={viewingAvatarUrl}
                                    download={`${employee.firstName}_${employee.lastName || 'Profile'}_Avatar.png`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="p-2 hover:bg-slate-200/60 rounded-xl text-slate-500 hover:text-indigo-600 transition-colors flex items-center gap-1.5 text-xs font-bold"
                                    title="Download Image"
                                >
                                    <Download size={16} /> Download
                                </a>
                                <button
                                    onClick={() => setViewingAvatarUrl(null)}
                                    className="p-2 hover:bg-slate-200/60 rounded-xl text-slate-400 hover:text-slate-700 transition-colors"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        <div className="p-6 overflow-auto flex items-center justify-center bg-slate-900/95 max-h-[80vh]">
                            <img 
                                src={viewingAvatarUrl} 
                                alt={`${employee.firstName} ${employee.lastName || ''} Profile Picture`} 
                                className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-2xl" 
                            />
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Delete Confirmation Modal */}
            <DeleteModal
                isOpen={showDeleteModal}
                onClose={() => {
                    setShowDeleteModal(false);
                    setAttachmentToDelete(null);
                }}
                onConfirm={confirmDelete}
                title="Delete Document?"
                message="This document will be permanently removed from the employee record. This action cannot be undone."
            />

            {/* Universal Master Financial Security Modal */}
            <SalaryPinModal
                isOpen={showMasterPinModal}
                onClose={() => setShowMasterPinModal(false)}
                onSuccess={() => setIsFinancialUnlocked(true)}
                requireMasterPin={true}
                title="Universal Master Financial PIN"
                description="Enter the 4-digit Master Financial PIN to unlock and view employee compensation details."
            />
        </div>
    );
};

const formatAuditValue = (val: any): string => {
    if (val === null || val === undefined || val === '') return 'None';

    // Normalize Dates if they look like ISO strings or YYYY-MM-DD
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
        try {
            const date = new Date(val);
            if (!isNaN(date.getTime())) {
                return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            }
        } catch (e) {
            // fallback
        }
    }
    
    // If it's an array, format each item
    if (Array.isArray(val)) {
        if (val.length === 0) return 'None';
        return val.map(item => formatAuditValue(item)).join(', ');
    }
    
    // If it's an object, try to find a descriptive field or stringify
    if (typeof val === 'object') {
        // Common descriptive fields across different sections
        const keys = ['name', 'degree', 'institute', 'institution', 'companyName', 'company', 'jobTitle', 'level', 'platform', 'relation', 'fileName', 'title', 'bankName', 'accountName'];
        
        for (const k of keys) {
            if (Object.prototype.hasOwnProperty.call(val, k)) {
                return formatAuditValue(val[k]);
            }
        }
        
        // Fallback to JSON if no descriptive field exists
        try {
            return JSON.stringify(val);
        } catch (e) {
            return '[Complex Object]';
        }
    }
    
    return String(val);
};

const DiffRows = ({ diff, prefix = '' }: { diff: any, prefix?: string }) => {
    return (
        <>
            {Object.entries(diff).map(([key, value]: [string, any]) => {
                const label = prefix ? `${prefix}.${key}` : key;

                if (value && typeof value === 'object' && 'old' in value && 'new' in value) {
                    return (
                        <tr key={label} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-3 text-xs font-bold text-slate-700 capitalize min-w-[140px]">{label.replace(/([A-Z])/g, ' $1').replace(/\./g, ' > ')}</td>
                            <td className="px-4 py-3 text-xs text-red-500 line-through bg-red-50/30 font-medium break-words max-w-[250px]">{formatAuditValue(value.old)}</td>
                            <td className="px-4 py-3 text-xs text-emerald-600 bg-emerald-50/30 font-bold break-words max-w-[250px]">{formatAuditValue(value.new)}</td>
                        </tr>
                    );
                }

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
