import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Save, Upload, Check, User, FileText, Trash2, Globe, Users, GraduationCap, Edit2, Shield, Phone, Briefcase, Download, AlertCircle, History, Camera } from 'lucide-react';
import CustomSelect from '../../components/UI/CustomSelect';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

const MyInfo = () => {
    const navigate = useNavigate();
    const { user, login } = useAuth();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [employeeId, setEmployeeId] = useState<string | null>(null);
    const [rawEmployee, setRawEmployee] = useState<any>(null);
    const [completedSteps, setCompletedSteps] = useState<number[]>([]);
    const [showCompletion, setShowCompletion] = useState<number | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [activeTab, setActiveTab] = useState('personal');
    const [uploadingAvatar, setUploadingAvatar] = useState(false);

    const [formData, setFormData] = useState({
        // Personal
        firstName: '',
        lastName: '',
        middleName: '',
        email: '',
        phone: '',
        dateOfBirth: '',
        gender: '',
        maritalStatus: '',
        nationality: '',
        fatherName: '',
        bloodGroup: '',
        cnic: '',

        // Address
        address: {
            street: '',
            city: '',
            country: ''
        },

        // Emergency Contacts
        emergencyContacts: [{ name: '', relation: '', phone: '' }],

        // Dependents
        dependents: [{ name: '', relation: '', dateOfBirth: '' }],

        // Immigration
        immigrationHistory: [{ documentType: 'Passport', documentNumber: '', issueDate: '', expiryDate: '', issuingCountry: '' }],

        // Employment History
        employmentHistory: [{ companyName: '', jobTitle: '', startDate: '', endDate: '', reasonForLeaving: '' }],

        // Education
        education: [{ level: '', institute: '', year: '', score: '' }],

        // Files
        files: [] as { file: File; type: string }[]
    });

    // Fetch employee data linked to current user
    useEffect(() => {
        const fetchEmployeeData = async () => {
            if (!user?.id) return;

            setLoading(true);
            try {
                const token = localStorage.getItem('token');

                // Try to find employee by userId
                const response = await fetch(`${api.employees}?userId=${user.id}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.ok) {
                    const employees = await response.json();
                    const employee = Array.isArray(employees) ? employees.find((emp: any) => emp.userId === user.id) : null;

                    if (employee) {
                        setRawEmployee(employee);
                        setEmployeeId(employee.employeeId);
                        // Populate form with existing data
                        const formatDate = (date: any) => {
                            if (!date) return '';
                            if (typeof date === 'string') return date.split('T')[0];
                            if (date instanceof Date) return date.toISOString().split('T')[0];
                            return '';
                        };

                        setFormData({
                            firstName: employee.firstName || '',
                            lastName: employee.lastName || '',
                            middleName: employee.middleName || '',
                            email: employee.email || user.email || '',
                            phone: employee.phone || '',
                            dateOfBirth: formatDate(employee.dateOfBirth),
                            gender: employee.gender || '',
                            maritalStatus: employee.maritalStatus || '',
                            nationality: employee.nationality || '',
                            fatherName: employee.fatherName || '',
                            bloodGroup: employee.bloodGroup || '',
                            cnic: employee.cnic || '',
                            address: employee.address || { street: '', city: '', country: '' },
                            emergencyContacts: employee.emergencyContacts?.length
                                ? employee.emergencyContacts.map((ec: any) => ({
                                    name: ec.name || '',
                                    relation: ec.relation || '',
                                    phone: ec.phone || ''
                                }))
                                : [{ name: '', relation: '', phone: '' }],
                            dependents: employee.dependents?.length
                                ? employee.dependents.map((dep: any) => ({
                                    name: dep.name || '',
                                    relation: dep.relation || '',
                                    dateOfBirth: formatDate(dep.dateOfBirth)
                                }))
                                : [{ name: '', relation: '', dateOfBirth: '' }],
                            immigrationHistory: employee.immigrationHistory?.length
                                ? employee.immigrationHistory.map((imm: any) => ({
                                    documentType: imm.documentType || 'Passport',
                                    documentNumber: imm.documentNumber || '',
                                    issueDate: formatDate(imm.issueDate),
                                    expiryDate: formatDate(imm.expiryDate),
                                    issuingCountry: imm.issuingCountry || ''
                                }))
                                : [{ documentType: 'Passport', documentNumber: '', issueDate: '', expiryDate: '', issuingCountry: '' }],
                            employmentHistory: employee.employmentHistory?.length
                                ? employee.employmentHistory.map((eh: any) => ({
                                    companyName: eh.companyName || '',
                                    jobTitle: eh.jobTitle || '',
                                    startDate: formatDate(eh.startDate),
                                    endDate: formatDate(eh.endDate),
                                    reasonForLeaving: eh.reasonForLeaving || ''
                                }))
                                : [{ companyName: '', jobTitle: '', startDate: '', endDate: '', reasonForLeaving: '' }],
                            education: employee.education?.length
                                ? employee.education.map((edu: any) => ({
                                    level: edu.level || '',
                                    institute: edu.institute || '',
                                    year: edu.year || '',
                                    score: edu.score || ''
                                }))
                                : [{ level: '', institute: '', year: '', score: '' }],
                            files: []
                        });
                    } else {
                        // No employee record found, initialize with user data
                        setIsEditing(true); // Default to editing if no record exists
                        setFormData(prev => ({
                            ...prev,
                            email: user.email || '',
                            firstName: user.firstName || '',
                            lastName: user.lastName || ''
                        }));
                    }
                }
            } catch (err: any) {
                console.error('Error fetching employee data:', err);
                setError('Failed to load your profile information.');
            } finally {
                setLoading(false);
            }
        };

        fetchEmployeeData();
    }, [user, success]); // Refresh on success

    const handleChange = (e: any, section?: string, index?: number, subfield?: string) => {
        const { name, value } = e.target;

        if (section === 'address') {
            setFormData(prev => ({ ...prev, address: { ...prev.address, [name]: value } }));
        } else if (section === 'emergencyContacts' && index !== undefined && subfield) {
            const newContacts = [...formData.emergencyContacts];
            (newContacts[index] as any)[subfield] = value;
            setFormData(prev => ({ ...prev, emergencyContacts: newContacts }));
        } else if (section === 'dependents' && index !== undefined && subfield) {
            const newDependents = [...formData.dependents];
            (newDependents[index] as any)[subfield] = value;
            setFormData(prev => ({ ...prev, dependents: newDependents }));
        } else if (section === 'immigrationHistory' && index !== undefined && subfield) {
            const newHistory = [...formData.immigrationHistory];
            (newHistory[index] as any)[subfield] = value;
            setFormData(prev => ({ ...prev, immigrationHistory: newHistory }));
        } else if (section === 'employmentHistory' && index !== undefined && subfield) {
            const newHistory = [...formData.employmentHistory];
            (newHistory[index] as any)[subfield] = value;
            setFormData(prev => ({ ...prev, employmentHistory: newHistory }));
        } else if (section === 'education' && index !== undefined && subfield) {
            const newEducation = [...formData.education];
            (newEducation[index] as any)[subfield] = value;
            setFormData(prev => ({ ...prev, education: newEducation }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const addEmergencyContact = () => {
        setFormData(prev => ({ ...prev, emergencyContacts: [...prev.emergencyContacts, { name: '', relation: '', phone: '' }] }));
    };

    const removeEmergencyContact = (index: number) => {
        setFormData(prev => ({
            ...prev,
            emergencyContacts: prev.emergencyContacts.filter((_, i) => i !== index)
        }));
    };

    const handleNext = () => {
        if (step < 5) {
            if (!completedSteps.includes(step)) {
                setCompletedSteps([...completedSteps, step]);
                setShowCompletion(step);
                setTimeout(() => setShowCompletion(null), 2000);
            }
            setStep(step + 1);
        }
    };

    const handlePrev = () => {
        if (step > 1) {
            setStep(step - 1);
        }
    };

    const handleSubmit = async () => {
        setSaving(true);
        setError(null);
        setSuccess(false);

        try {
            const token = localStorage.getItem('token');
            if (!token) {
                setError('You must be logged in to save your information.');
                setSaving(false);
                return;
            }

            // Prepare employee data
            const employeeData: any = {
                ...formData,
                userId: user?.id,
                email: formData.email || user?.email,
                firstName: formData.firstName || user?.firstName || '',
                lastName: formData.lastName || user?.lastName || ''
            };

            // Remove empty one-time fields if they haven't been filled
            if (!employeeData.cnic) delete employeeData.cnic;
            if (!employeeData.dateOfBirth) delete employeeData.dateOfBirth;
            if (!employeeData.fatherName) delete employeeData.fatherName;
            if (!employeeData.nationality) delete employeeData.nationality;
            if (!employeeData.bloodGroup) delete employeeData.bloodGroup;

            let response;
            if (employeeId) {
                // Update existing employee
                response = await fetch(`${api.employees}/${employeeId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(employeeData)
                });
            } else {
                // Create new employee record
                employeeData.employeeId = `EMP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                employeeData.jobInfo = {
                    designation: 'Employee',
                    department: 'General',
                    joiningDate: new Date().toISOString()
                };
                employeeData.employmentStatus = {
                    status: 'Probation',
                    autoUpdated: false
                };

                response = await fetch(api.employees, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(employeeData)
                });
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Failed to save information' }));
                throw new Error(errorData.message || 'Failed to save your information');
            }

            const savedEmployee = await response.json();
            if (savedEmployee.employeeId && !employeeId) {
                setEmployeeId(savedEmployee.employeeId);
            }

            // Upload files if any
            if (formData.files.length > 0 && savedEmployee.employeeId) {
                for (const fileObj of formData.files) {
                    try {
                        const fileData = new FormData();
                        fileData.append('file', fileObj.file);
                        fileData.append('fileType', fileObj.type || 'Document');

                        const fileResponse = await fetch(api.employeeAttachments(savedEmployee.employeeId), {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}` },
                            body: fileData
                        });

                        if (!fileResponse.ok) {
                            console.warn(`Failed to upload file ${fileObj.file.name}`);
                        }
                    } catch (fileError) {
                        console.error(`Error uploading file ${fileObj.file.name}:`, fileError);
                    }
                }
            }

            setSuccess(true);
            setTimeout(() => {
                setSuccess(false);
                setIsEditing(false); // Go back to profile view after save
            }, 3000);
        } catch (err: any) {
            console.error('Error saving employee data:', err);
            setError(err.message || 'Failed to save your information. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleDownload = (filePath: string, fileName: string) => {
        if (!filePath) return;
        const url = `${api.baseURL}/uploads/${filePath}`;
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !employeeId) return;

        setUploadingAvatar(true);
        try {
            const token = localStorage.getItem('token');
            const fileData = new FormData();
            fileData.append('file', file);
            fileData.append('fileType', 'Profile Picture');

            const response = await fetch(api.employeeAttachments(employeeId), {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: fileData
            });

            if (!response.ok) throw new Error('Failed to upload profile picture');

            // Refresh data to show new avatar
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);

            // Re-fetch employee data
            const refreshRes = await fetch(`${api.employees}?userId=${user?.id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (refreshRes.ok) {
                const employees = await refreshRes.json();
                // Ensure we handle both array and single object responses safely
                const employeeList = Array.isArray(employees) ? employees : [employees];
                const employee = employeeList.find((emp: any) => emp.userId === user?.id || emp._id === employeeId || emp.id === employeeId);

                if (employee) {
                    setRawEmployee(employee);

                    // Also sync with AuthContext for Header/Sidebar
                    // Get ALL profile pictures and pick the latest one
                    const profilePics = employee.attachments?.filter((a: any) => a.fileType === 'Profile Picture') || [];
                    if (profilePics.length > 0 && user) {
                        const latestPic = profilePics[profilePics.length - 1];
                        const newAvatar = latestPic.filePath.startsWith('/uploads')
                            ? `${api.baseURL}${latestPic.filePath}`
                            : `${api.baseURL}/uploads/${latestPic.filePath}`;
                        login({ ...user, avatar: newAvatar });
                    }
                }
            }
        } catch (err: any) {
            console.error('Error uploading avatar:', err);
            setError('Failed to upload profile picture.');
        } finally {
            setUploadingAvatar(false);
        }
    };

    const steps = [
        { id: 1, title: 'Personal', icon: User },
        { id: 2, title: 'Contact & Dependents', icon: Users },
        { id: 3, title: 'Immigration', icon: Globe },
        { id: 4, title: 'History & Education', icon: GraduationCap },
        { id: 5, title: 'Documents', icon: FileText }
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading your information...</p>
                </div>
            </div>
        );
    }

    const ProfileView = () => {
        if (!rawEmployee) return null;

        const tabs = [
            { id: 'personal', label: 'Personal', icon: User },
            { id: 'contact', label: 'Contact', icon: Phone },
            { id: 'job', label: 'Job', icon: Briefcase },
            { id: 'history', label: 'Employment History', icon: History },
            { id: 'education', label: 'Education', icon: GraduationCap },
            { id: 'dependents', label: 'Dependents', icon: Users },
            { id: 'documents', label: 'Documents', icon: FileText },
        ];

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

        const getAvatarUrl = () => {
            if (!rawEmployee) return user?.avatar || null;

            // Get all profile pictures and pick the latest one (at the end of the array)
            const profilePics = rawEmployee.attachments?.filter((a: any) => a.fileType === 'Profile Picture') || [];

            if (profilePics.length > 0) {
                const latestPic = profilePics[profilePics.length - 1];
                const path = latestPic.filePath;
                if (path.startsWith('http')) return path;
                if (path.startsWith('/uploads')) return `${api.baseURL}${path}`;
                return `${api.baseURL}/uploads/${path}`;
            }

            // Fallback to user avatar from AuthContext
            return user?.avatar || null;
        };

        const avatarUrl = getAvatarUrl();

        return (
            <div className="space-y-6 animate-fadeIn pb-10">
                {/* Header / Banner */}
                <div className="flex flex-col md:flex-row md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200/50 shadow-sm animate-slide-up">
                    <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200/50 relative group overflow-hidden">
                        {avatarUrl ? (
                            <img
                                src={avatarUrl}
                                alt="Avatar"
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            />
                        ) : (
                            <User size={40} />
                        )}
                        <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-300 cursor-pointer flex flex-col items-center justify-center gap-1 backdrop-blur-[2px]">
                            <Camera size={20} className="transform translate-y-2 group-hover:translate-y-0 transition-transform" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Change</span>
                            <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
                        </label>
                        {uploadingAvatar && (
                            <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                                <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        )}
                    </div>
                    <div className="flex-1">
                        <h1 className="text-2xl font-bold text-gray-800">{rawEmployee.firstName} {rawEmployee.lastName}</h1>
                        <p className="text-gray-500 font-medium">{rawEmployee.jobInfo?.designation || 'Employee'} • {rawEmployee.jobInfo?.department || 'Member'}</p>
                        <div className="flex flex-wrap gap-4 mt-2">
                            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                                <Check size={12} /> Active
                            </span>
                            <span className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
                                <Shield size={12} /> {rawEmployee.employeeId}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsEditing(true)}
                            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all font-semibold shadow-md shadow-indigo-100 hover:shadow-lg hover:scale-[1.02] active:scale-95"
                        >
                            <Edit2 size={18} /> Edit Profile
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex overflow-x-auto gap-1 border-b border-gray-100 bg-white/50 p-1 rounded-xl no-scrollbar">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-6 py-3 font-semibold text-sm transition-all rounded-lg whitespace-nowrap ${activeTab === tab.id
                                ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50'
                                : 'text-slate-500 hover:text-indigo-600 hover:bg-white/80'
                                }`}
                        >
                            <tab.icon size={16} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content Body */}
                <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200/50 min-h-[400px] animate-slide-up">
                    {/* Personal Tab */}
                    {activeTab === 'personal' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-8 gap-x-12 animate-fadeIn">
                            <Field label="Full Name" value={`${rawEmployee.firstName} ${rawEmployee.middleName || ''} ${rawEmployee.lastName}`} />
                            <Field label="Date of Birth" value={formatDate(rawEmployee.dateOfBirth)} />
                            <Field label="Gender" value={rawEmployee.gender} />
                            <Field label="Marital Status" value={rawEmployee.maritalStatus} />
                            <Field label="Nationality" value={rawEmployee.nationality} />
                            <Field label="Father Name" value={rawEmployee.fatherName} />
                            <Field label="Blood Group" value={rawEmployee.bloodGroup} />
                            <Field label="CNIC / Govt ID" value={rawEmployee.cnic} />
                        </div>
                    )}

                    {/* Contact Tab */}
                    {activeTab === 'contact' && (
                        <div className="space-y-10 animate-fadeIn">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                <Field label="Email" value={rawEmployee.email} />
                                <Field label="Phone" value={rawEmployee.phone} />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                    <Globe size={16} /> Current Address
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                                    <Field label="Street" value={rawEmployee.address?.street} />
                                    <Field label="City" value={rawEmployee.address?.city} />
                                    <Field label="Country" value={rawEmployee.address?.country} />
                                </div>
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                    <Users size={16} /> Emergency Contacts
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {rawEmployee.emergencyContacts?.map((c: any, i: number) => (
                                        <div key={i} className="p-5 bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 transition-colors group">
                                            <p className="font-bold text-gray-800">{c.name}</p>
                                            <div className="flex items-center gap-4 mt-2">
                                                <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg">{c.relation}</span>
                                                <span className="text-sm text-gray-500 flex items-center gap-1.5"><Phone size={12} /> {c.phone}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Job Tab */}
                    {activeTab === 'job' && (
                        <div className="space-y-10 animate-fadeIn">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                <Field label="Designation" value={rawEmployee.jobInfo?.designation} />
                                <Field label="Department" value={rawEmployee.jobInfo?.department} />
                                <Field label="Joining Date" value={formatDate(rawEmployee.jobInfo?.joiningDate)} />
                            </div>
                            <div className="p-8 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl text-white shadow-xl shadow-indigo-200">
                                <h4 className="text-sm font-bold text-indigo-100 uppercase tracking-widest mb-4">Current Employment Status</h4>
                                <div className="flex flex-wrap gap-12">
                                    <div>
                                        <label className="block text-xs font-medium text-indigo-200 uppercase mb-1">Status</label>
                                        <p className="text-xl font-bold">{typeof rawEmployee.employmentStatus === 'string' ? rawEmployee.employmentStatus : rawEmployee.employmentStatus?.status}</p>
                                    </div>
                                    {typeof rawEmployee.employmentStatus !== 'string' && rawEmployee.employmentStatus?.probationEndDate && (
                                        <div>
                                            <label className="block text-xs font-medium text-indigo-200 uppercase mb-1">Probation Ends</label>
                                            <p className="text-xl font-bold">{formatDate(rawEmployee.employmentStatus.probationEndDate)}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* History Tab */}
                    {activeTab === 'history' && (
                        <div className="space-y-6 animate-fadeIn">
                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6">Employment History</h3>
                            {rawEmployee.employmentHistory?.length > 0 ? (
                                <div className="relative border-l-2 border-slate-100 ml-4 pl-8 space-y-10">
                                    {rawEmployee.employmentHistory.map((h: any, i: number) => (
                                        <div key={i} className="relative">
                                            <div className="absolute -left-[41px] top-0 w-4 h-4 rounded-full bg-indigo-600 border-4 border-white shadow-sm" />
                                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
                                                <h4 className="text-lg font-bold text-gray-800">{h.companyName}</h4>
                                                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">{formatDate(h.startDate)} - {formatDate(h.endDate)}</span>
                                            </div>
                                            <p className="text-indigo-600 font-semibold">{h.jobTitle}</p>
                                            {h.reasonForLeaving && <p className="text-sm text-gray-500 mt-2 bg-slate-50 p-3 rounded-lg border border-slate-100 italic">"Reason: {h.reasonForLeaving}"</p>}
                                        </div>
                                    ))}
                                </div>
                            ) : <p className="text-gray-400 italic">No history recorded</p>}
                        </div>
                    )}

                    {/* Education Tab */}
                    {activeTab === 'education' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeIn">
                            {rawEmployee.education?.map((edu: any, i: number) => (
                                <div key={i} className="p-6 bg-gradient-to-br from-white to-slate-50 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
                                    <div className="flex items-start gap-4">
                                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                                            <GraduationCap size={24} />
                                        </div>
                                        <div>
                                            <h4 className="text-lg font-bold text-gray-800">{edu.level}</h4>
                                            <p className="text-indigo-600 font-medium">{edu.institute}</p>
                                            <div className="flex items-center gap-4 mt-3">
                                                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">{edu.year}</span>
                                                {edu.score && <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">Score: {edu.score}</span>}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Dependents Tab */}
                    {activeTab === 'dependents' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeIn">
                            {rawEmployee.dependents?.map((dep: any, i: number) => (
                                <div key={i} className="p-6 bg-white rounded-2xl border border-slate-200 flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                                        <User size={24} />
                                    </div>
                                    <div>
                                        <p className="font-bold text-gray-800">{dep.name}</p>
                                        <p className="text-sm text-indigo-600 font-medium">{dep.relation}</p>
                                        <p className="text-xs text-gray-400 mt-1">Born: {formatDate(dep.dateOfBirth)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Documents Tab */}
                    {activeTab === 'documents' && (
                        <div className="space-y-4 animate-fadeIn">
                            {rawEmployee.attachments?.length > 0 ? (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    {rawEmployee.attachments.map((file: any, i: number) => (
                                        <div key={i} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 transition-all">
                                            <div className="flex items-center gap-4">
                                                <div className="p-3 bg-slate-50 text-slate-400 rounded-xl">
                                                    <FileText size={20} />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-sm text-gray-800 truncate max-w-[200px]">{file.fileName}</p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-[10px] font-bold uppercase bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{file.fileType || 'Doc'}</span>
                                                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${file.status === 'approved' ? 'bg-emerald-50 text-emerald-600' :
                                                            file.status === 'rejected' ? 'bg-red-50 text-red-600' :
                                                                'bg-amber-50 text-amber-600'
                                                            }`}>
                                                            {file.status || 'Pending'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleDownload(file.filePath, file.fileName)}
                                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition-all"
                                                title="Download"
                                            >
                                                <Download size={20} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-20 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                                    <FileText size={48} className="mx-auto text-slate-300 mb-4" />
                                    <p className="text-slate-500 font-medium">No documents uploaded yet</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {!isEditing ? (
                <ProfileView />
            ) : (
                <div className="space-y-6">
                    {/* Header */}
                    <div className="flex items-center gap-4 mb-2">
                        <button
                            onClick={() => employeeId ? setIsEditing(false) : navigate('/pim')}
                            className="p-2 hover:bg-primary-50 rounded-xl transition-all text-gray-500 hover:text-primary-600"
                        >
                            <ChevronLeft size={24} />
                        </button>
                        <div className="flex-1">
                            <h2 className="text-xl font-semibold text-gray-700">
                                {employeeId ? 'Edit Your Information' : 'Complete Your Profile'}
                            </h2>
                            <p className="text-sm text-gray-500">Step {step} of 5: {steps[step - 1].title}</p>
                        </div>
                        {employeeId && (
                            <button
                                onClick={() => setIsEditing(false)}
                                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-indigo-600 transition-colors"
                            >
                                Back to Profile
                            </button>
                        )}
                    </div>

                    {/* Progress Bar with Smooth Animation */}
                    <div className="flex items-center justify-between mb-8 px-8 relative" style={{ minHeight: '120px' }}>
                        {/* Background Progress Bar */}
                        <div className="absolute top-7 left-8 right-8 h-1.5 bg-slate-200 rounded-full -z-0 overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 rounded-full transition-all duration-1000 ease-out relative"
                                style={{ width: `${((step - 1) / (steps.length - 1)) * 100}%` }}
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                            </div>
                        </div>

                        {steps.map((s) => {
                            const isCompleted = step > s.id;
                            const isCurrent = step === s.id;
                            return (
                                <div key={s.id} className="flex flex-col items-center relative z-10">
                                    <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-500 shadow-md relative ${isCompleted
                                        ? 'bg-gradient-to-r from-emerald-500 to-green-500 text-white scale-110 ring-4 ring-emerald-200'
                                        : isCurrent
                                            ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white scale-110 ring-4 ring-indigo-200'
                                            : 'bg-slate-200 text-slate-500 scale-100'
                                        }`}>
                                        {isCompleted ? (
                                            <div className="relative">
                                                <Check size={20} className="animate-scale-in" />
                                                <div className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-300 rounded-full animate-ping" />
                                            </div>
                                        ) : (
                                            <s.icon size={18} className={isCurrent ? 'animate-bounce' : ''} />
                                        )}
                                        {isCurrent && (
                                            <>
                                                <div className="absolute inset-0 rounded-full bg-indigo-400 animate-ping opacity-20" />
                                                <div className="absolute inset-0 rounded-full bg-indigo-300 animate-ping opacity-10" style={{ animationDelay: '0.5s' }} />
                                            </>
                                        )}
                                    </div>
                                    {isCompleted && showCompletion === s.id && (
                                        <div className="absolute -top-20 left-1/2 transform -translate-x-1/2 bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap animate-slide-up shadow-lg z-30 pointer-events-none">
                                            ✓ Completed
                                            <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-emerald-500" />
                                        </div>
                                    )}
                                    <span className={`text-xs mt-3 font-semibold transition-all duration-300 ${isCompleted || isCurrent
                                        ? 'text-indigo-600 scale-105'
                                        : 'text-gray-400 scale-100'
                                        }`}>
                                        {s.title}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200/50 p-8 min-h-[400px] relative">
                        {/* Loading Overlay */}
                        {saving && (
                            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center animate-fadeIn rounded-2xl">
                                <div className="text-center">
                                    <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
                                    <p className="text-indigo-600 font-medium">Saving...</p>
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2">
                                <AlertCircle size={18} className="text-red-500" />
                                <span>{error}</span>
                                <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">×</button>
                            </div>
                        )}

                        {success && (
                            <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl flex items-center gap-2">
                                <Check size={18} className="text-green-500" />
                                <span>Your information has been saved successfully!</span>
                            </div>
                        )}

                        {/* Step 1: Personal Details */}
                        {step === 1 && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-slide-up pb-20">
                                {/* Upload Fields */}
                                <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                                    {['Profile Picture', 'Resume/CV', 'ID Proof'].map((label) => (
                                        <div key={label} className="border border-dashed border-gray-300 rounded-xl p-4 flex flex-col items-center justify-center bg-gray-50/50 hover:bg-gray-50 transition-colors relative group">
                                            <input
                                                type="file"
                                                accept={label === 'Profile Picture' ? "image/*" : ".pdf,.doc,.docx,.jpg,.png"}
                                                className="absolute inset-0 opacity-0 cursor-pointer"
                                                onChange={(e) => {
                                                    if (e.target.files && e.target.files.length > 0) {
                                                        const file = e.target.files[0];
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            files: [...prev.files, { file, type: label }]
                                                        }));
                                                    }
                                                }}
                                            />
                                            <div className="p-2 bg-white rounded-full shadow-sm mb-2 text-indigo-500 group-hover:scale-110 transition-transform">
                                                <Upload size={20} />
                                            </div>
                                            <span className="text-sm font-medium text-gray-600">{label}</span>
                                            {formData.files.some(f => f.type === label) ? (
                                                <span className="text-xs text-emerald-600 font-medium mt-1 truncate max-w-full px-2">
                                                    {formData.files.find(f => f.type === label)?.file.name}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-gray-400 mt-1">Click to upload</span>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-600">First Name *</label>
                                    <input type="text" name="firstName" value={formData.firstName} onChange={handleChange} required className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 bg-white transition-all" />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-600">Last Name *</label>
                                    <input type="text" name="lastName" value={formData.lastName} onChange={handleChange} required className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 bg-white transition-all" />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-600">Middle Name</label>
                                    <input type="text" name="middleName" value={formData.middleName} onChange={handleChange} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 bg-white transition-all" />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-600">Email *</label>
                                    <input type="email" name="email" value={formData.email} onChange={handleChange} required className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 bg-white transition-all" />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-600">Phone</label>
                                    <input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 bg-white transition-all" />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-600">CNIC / Govt ID</label>
                                    <input
                                        type="text"
                                        name="cnic"
                                        value={formData.cnic || ''}
                                        onChange={handleChange}
                                        placeholder="e.g. 12345-1234567-1"
                                        disabled={!!formData.cnic}
                                        className={`w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 bg-white transition-all ${formData.cnic ? 'bg-gray-50 cursor-not-allowed' : ''}`}
                                    />
                                    {formData.cnic && <p className="text-xs text-gray-500 mt-1">This field cannot be edited once filled</p>}
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-600">Date of Birth</label>
                                    <input
                                        type="date"
                                        name="dateOfBirth"
                                        value={formData.dateOfBirth}
                                        onChange={handleChange}
                                        disabled={!!formData.dateOfBirth}
                                        className={`w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 bg-white transition-all ${formData.dateOfBirth ? 'bg-gray-50 cursor-not-allowed' : ''}`}
                                    />
                                    {formData.dateOfBirth && <p className="text-xs text-gray-500 mt-1">This field cannot be edited once filled</p>}
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-600">Father Name</label>
                                    <input
                                        type="text"
                                        name="fatherName"
                                        value={formData.fatherName}
                                        onChange={handleChange}
                                        disabled={!!formData.fatherName}
                                        className={`w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 bg-white transition-all ${formData.fatherName ? 'bg-gray-50 cursor-not-allowed' : ''}`}
                                    />
                                    {formData.fatherName && <p className="text-xs text-gray-500 mt-1">This field cannot be edited once filled</p>}
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-600">Nationality</label>
                                    <input
                                        type="text"
                                        name="nationality"
                                        value={formData.nationality}
                                        onChange={handleChange}
                                        disabled={!!formData.nationality}
                                        className={`w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 bg-white transition-all ${formData.nationality ? 'bg-gray-50 cursor-not-allowed' : ''}`}
                                    />
                                    {formData.nationality && <p className="text-xs text-gray-500 mt-1">This field cannot be edited once filled</p>}
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-600">Blood Group</label>
                                    {formData.bloodGroup ? (
                                        <input
                                            type="text"
                                            value={formData.bloodGroup}
                                            disabled
                                            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm bg-gray-50 cursor-not-allowed"
                                        />
                                    ) : (
                                        <CustomSelect
                                            label=""
                                            value={formData.bloodGroup}
                                            onChange={(val) => setFormData({ ...formData, bloodGroup: val })}
                                            options={['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']}
                                        />
                                    )}
                                    {formData.bloodGroup && <p className="text-xs text-gray-500 mt-1">This field cannot be edited once filled</p>}
                                </div>
                                <div className="space-y-2">
                                    <CustomSelect label="Gender" value={formData.gender} onChange={(val) => setFormData({ ...formData, gender: val })} options={['Male', 'Female', 'Other']} />
                                </div>
                                <div className="space-y-2">
                                    <CustomSelect label="Marital Status" value={formData.maritalStatus} onChange={(val) => setFormData({ ...formData, maritalStatus: val })} options={['Single', 'Married', 'Other']} />
                                </div>
                            </div>
                        )}

                        {/* Step 2: Contact, Address, Dependents */}
                        {step === 2 && (
                            <div className="space-y-8 animate-slide-up pb-20">
                                <div>
                                    <h3 className="text-lg font-medium text-gray-700 mb-4">Contact Info</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <input type="email" name="email" placeholder="Email" value={formData.email} onChange={handleChange} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 bg-white transition-all" />
                                        <input type="text" name="phone" placeholder="Phone" value={formData.phone} onChange={handleChange} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 bg-white transition-all" />
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-lg font-medium text-gray-700 mb-4">Address</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <input type="text" name="street" placeholder="Street" value={formData.address.street} onChange={(e) => handleChange(e, 'address')} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 bg-white transition-all" />
                                        <input type="text" name="city" placeholder="City" value={formData.address.city} onChange={(e) => handleChange(e, 'address')} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 bg-white transition-all" />
                                        <input type="text" name="country" placeholder="Country" value={formData.address.country} onChange={(e) => handleChange(e, 'address')} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 bg-white transition-all" />
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-lg font-medium text-gray-700">Emergency Contacts</h3>
                                        <button onClick={addEmergencyContact} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 border border-indigo-200 transition-all shadow-sm">
                                            + Add Contact
                                        </button>
                                    </div>
                                    {formData.emergencyContacts.map((contact, idx) => (
                                        <div key={idx} className="flex gap-4 mb-3 items-end p-4 border border-gray-100 rounded-xl bg-gray-50/50 hover:border-gray-300 transition-all group">
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
                                                <input type="text" placeholder="Name" value={contact.name} onChange={(e) => handleChange(e, 'emergencyContacts', idx, 'name')} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all" />
                                                <input type="text" placeholder="Relation" value={contact.relation} onChange={(e) => handleChange(e, 'emergencyContacts', idx, 'relation')} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all" />
                                                <input type="text" placeholder="Phone" value={contact.phone} onChange={(e) => handleChange(e, 'emergencyContacts', idx, 'phone')} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all" />
                                            </div>
                                            <button onClick={() => removeEmergencyContact(idx)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Remove Contact">
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <div>
                                    <div className="flex justify-between items-center mb-4 mt-8">
                                        <h3 className="text-lg font-medium text-gray-700">Dependents</h3>
                                        <button onClick={() => setFormData(p => ({ ...p, dependents: [...p.dependents, { name: '', relation: '', dateOfBirth: '' }] }))} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 border border-indigo-200 transition-all shadow-sm">
                                            + Add Dependent
                                        </button>
                                    </div>
                                    {formData.dependents.map((dep, idx) => (
                                        <div key={idx} className="flex gap-4 mb-3 items-end p-4 border border-gray-100 rounded-xl bg-gray-50/50 hover:border-gray-300 transition-all group">
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
                                                <div className="space-y-1">
                                                    <label className="text-xs font-medium text-gray-500">Name</label>
                                                    <input type="text" placeholder="Name" value={dep.name} onChange={(e) => handleChange(e, 'dependents', idx, 'name')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-xs font-medium text-gray-500">Relation</label>
                                                    <input type="text" placeholder="Relation" value={dep.relation} onChange={(e) => handleChange(e, 'dependents', idx, 'relation')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-xs font-medium text-gray-500">Date of Birth</label>
                                                    <input type="date" value={dep.dateOfBirth} onChange={(e) => handleChange(e, 'dependents', idx, 'dateOfBirth')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all text-gray-500" />
                                                </div>
                                            </div>
                                            <button onClick={() => setFormData(p => ({ ...p, dependents: p.dependents.filter((_, i) => i !== idx) }))} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Remove Dependent">
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Step 3: Immigration History */}
                        {step === 3 && (
                            <div className="animate-slide-up pb-20">
                                <div>
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-lg font-medium text-gray-700">Immigration & Travel History</h3>
                                        <button onClick={() => setFormData(p => ({ ...p, immigrationHistory: [...p.immigrationHistory, { documentType: 'Passport', documentNumber: '', issueDate: '', expiryDate: '', issuingCountry: '' }] }))} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 border border-indigo-200 transition-all shadow-sm">
                                            + Add Document
                                        </button>
                                    </div>
                                    {formData.immigrationHistory.map((doc, idx) => (
                                        <div key={idx} className="mb-4 p-5 border border-gray-100 rounded-xl bg-white shadow-sm hover:shadow-md transition-all relative group">
                                            <div className="flex justify-end mb-2">
                                                <button
                                                    onClick={() => {
                                                        const newHist = formData.immigrationHistory.filter((_, i) => i !== idx);
                                                        setFormData({ ...formData, immigrationHistory: newHist });
                                                    }}
                                                    className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded-md hover:bg-red-50"
                                                    title="Delete Entry"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                <div className="space-y-1">
                                                    <label className="text-xs font-medium text-gray-500">Document Type</label>
                                                    <select
                                                        value={doc.documentType}
                                                        onChange={(e) => handleChange(e, 'immigrationHistory', idx, 'documentType')}
                                                        name="documentType"
                                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all bg-white"
                                                    >
                                                        <option value="Passport">Passport</option>
                                                        <option value="Visa">Visa</option>
                                                        <option value="Work Permit">Work Permit</option>
                                                        <option value="Driving License">Driving License</option>
                                                        <option value="Other">Other</option>
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-xs font-medium text-gray-500">Document Number</label>
                                                    <input type="text" name="documentNumber" value={doc.documentNumber} onChange={(e) => handleChange(e, 'immigrationHistory', idx, 'documentNumber')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-xs font-medium text-gray-500">Issuing Country</label>
                                                    <input type="text" name="issuingCountry" value={doc.issuingCountry} onChange={(e) => handleChange(e, 'immigrationHistory', idx, 'issuingCountry')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-xs font-medium text-gray-500">Issue Date</label>
                                                    <input type="date" name="issueDate" value={doc.issueDate} onChange={(e) => handleChange(e, 'immigrationHistory', idx, 'issueDate')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all text-gray-500" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-xs font-medium text-gray-500">Expiry Date</label>
                                                    <input type="date" name="expiryDate" value={doc.expiryDate} onChange={(e) => handleChange(e, 'immigrationHistory', idx, 'expiryDate')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all text-gray-500" />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Step 4: History & Education */}
                        {step === 4 && (
                            <div className="space-y-8 animate-slide-up pb-20">
                                <div>
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-lg font-medium text-gray-700">Previous Employment</h3>
                                        <button onClick={() => setFormData(p => ({ ...p, employmentHistory: [...p.employmentHistory, { companyName: '', jobTitle: '', startDate: '', endDate: '', reasonForLeaving: '' }] }))} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 border border-indigo-200 transition-all shadow-sm">
                                            + Add Employment
                                        </button>
                                    </div>
                                    {formData.employmentHistory.map((eh, idx) => (
                                        <div key={idx} className="mb-4 p-5 border border-gray-100 rounded-xl bg-white shadow-sm hover:shadow-md transition-all relative group">
                                            <div className="flex justify-end mb-2">
                                                <button
                                                    onClick={() => {
                                                        const newHist = formData.employmentHistory.filter((_, i) => i !== idx);
                                                        setFormData({ ...formData, employmentHistory: newHist });
                                                    }}
                                                    className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded-md hover:bg-red-50"
                                                    title="Delete Entry"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-1">
                                                    <label className="text-xs font-medium text-gray-500">Company Name</label>
                                                    <input type="text" value={eh.companyName} onChange={(e) => handleChange(e, 'employmentHistory', idx, 'companyName')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-xs font-medium text-gray-500">Job Title</label>
                                                    <input type="text" value={eh.jobTitle} onChange={(e) => handleChange(e, 'employmentHistory', idx, 'jobTitle')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-xs font-medium text-gray-500">Start Date</label>
                                                    <input type="date" value={eh.startDate} onChange={(e) => handleChange(e, 'employmentHistory', idx, 'startDate')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all text-gray-500" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-xs font-medium text-gray-500">End Date</label>
                                                    <input type="date" value={eh.endDate} onChange={(e) => handleChange(e, 'employmentHistory', idx, 'endDate')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all text-gray-500" />
                                                </div>
                                                <div className="space-y-1 md:col-span-2">
                                                    <label className="text-xs font-medium text-gray-500">Reason for Leaving</label>
                                                    <input type="text" value={eh.reasonForLeaving} onChange={(e) => handleChange(e, 'employmentHistory', idx, 'reasonForLeaving')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all" />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div>
                                    <div className="flex justify-between items-center mb-4 mt-8">
                                        <h3 className="text-lg font-medium text-gray-700">Education</h3>
                                        <button onClick={() => setFormData(p => ({ ...p, education: [...p.education, { level: '', institute: '', year: '', score: '' }] }))} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 border border-indigo-200 transition-all shadow-sm">
                                            + Add Education
                                        </button>
                                    </div>
                                    {formData.education.map((edu, idx) => (
                                        <div key={idx} className="mb-4 p-5 border border-gray-100 rounded-xl bg-white shadow-sm hover:shadow-md transition-all relative group">
                                            <div className="flex justify-end mb-2">
                                                <button
                                                    onClick={() => {
                                                        const newEdu = formData.education.filter((_, i) => i !== idx);
                                                        setFormData({ ...formData, education: newEdu });
                                                    }}
                                                    className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded-md hover:bg-red-50"
                                                    title="Delete Entry"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-1">
                                                    <label className="text-xs font-medium text-gray-500">Level</label>
                                                    <select
                                                        value={edu.level}
                                                        onChange={(e) => handleChange(e, 'education', idx, 'level')}
                                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all bg-white"
                                                    >
                                                        <option value="">-- Select --</option>
                                                        <option value="High School">High School</option>
                                                        <option value="Diploma">Diploma</option>
                                                        <option value="Bachelor">Bachelor</option>
                                                        <option value="Master">Master</option>
                                                        <option value="PhD">PhD</option>
                                                        <option value="Other">Other</option>
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-xs font-medium text-gray-500">Institute</label>
                                                    <input type="text" value={edu.institute} onChange={(e) => handleChange(e, 'education', idx, 'institute')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-xs font-medium text-gray-500">Year</label>
                                                    <input type="text" placeholder="e.g., 2020" value={edu.year} onChange={(e) => handleChange(e, 'education', idx, 'year')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-xs font-medium text-gray-500">Score / GPA</label>
                                                    <input type="text" placeholder="e.g., 3.5/4.0 or 85%" value={edu.score} onChange={(e) => handleChange(e, 'education', idx, 'score')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all" />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Step 5: Documents */}
                        {step === 5 && (
                            <div className="animate-slide-up pb-20">
                                <div>
                                    <h3 className="text-lg font-medium text-gray-700 mb-4">Additional Documents</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {['Contract', 'Certificates', 'Other Documents'].map((label) => (
                                            <div key={label} className="border border-dashed border-gray-300 rounded-xl p-6 flex flex-col items-center justify-center bg-gray-50/50 hover:bg-gray-50 transition-colors relative group">
                                                <input
                                                    type="file"
                                                    accept=".pdf,.doc,.docx,.jpg,.png"
                                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                                    onChange={(e) => {
                                                        if (e.target.files && e.target.files.length > 0) {
                                                            const file = e.target.files[0];
                                                            setFormData(prev => ({
                                                                ...prev,
                                                                files: [...prev.files, { file, type: label }]
                                                            }));
                                                        }
                                                    }}
                                                />
                                                <div className="p-3 bg-white rounded-full shadow-sm mb-3 text-indigo-500 group-hover:scale-110 transition-transform">
                                                    <Upload size={24} />
                                                </div>
                                                <span className="text-sm font-medium text-gray-600">{label}</span>
                                                {formData.files.some(f => f.type === label) ? (
                                                    <span className="text-xs text-emerald-600 font-medium mt-2 truncate max-w-full px-2">
                                                        {formData.files.find(f => f.type === label)?.file.name}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-gray-400 mt-2">Click to upload</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Navigation Buttons */}
                        <div className="flex justify-between items-center pt-6 border-t border-gray-200 mt-8">
                            <button
                                onClick={handlePrev}
                                disabled={step === 1}
                                className={`px-6 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2 ${step === 1
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                            >
                                <ChevronLeft size={16} /> Previous
                            </button>
                            {step < 5 ? (
                                <button
                                    onClick={handleNext}
                                    className="px-8 py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-medium transition-all flex items-center gap-2 shadow-sm hover:shadow-md"
                                >
                                    Next <ChevronRight size={16} />
                                </button>
                            ) : (
                                <button
                                    onClick={handleSubmit}
                                    disabled={saving}
                                    className="px-8 py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-medium transition-all flex items-center gap-2 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Save size={18} /> {saving ? 'Saving...' : 'Save Information'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MyInfo;
