import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Save, Upload, Check, User, Briefcase, FileText, Trash2, Globe, Users, GraduationCap, CreditCard, Banknote } from 'lucide-react';
import CustomSelect from '../../components/UI/CustomSelect';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';

const AddEmployeeWizard = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const isEditMode = !!id;
    const { user: authUser } = useAuth();
    const { canEditSensitiveData, canCreateUser } = usePermissions();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [completedSteps, setCompletedSteps] = useState<number[]>([]);
    const [showCompletion, setShowCompletion] = useState<number | null>(null);
    const [initialLockedFields, setInitialLockedFields] = useState<{ [key: string]: boolean }>({});
    const [stepErrors, setStepErrors] = useState<string[]>([]);

    // Required fields on step 1 (Personal) – must be filled before Next
    const isStep1RequiredValid = () => {
        return !!(
            formData.employeeId?.trim() &&
            formData.firstName?.trim() &&
            formData.lastName?.trim() &&
            formData.cnic?.trim() &&
            formData.dateOfBirth &&
            formData.fatherName?.trim() &&
            formData.religion?.trim() &&
            formData.nationality?.trim() &&
            formData.gender &&
            formData.maritalStatus
        );
    };

    const getStep1RequiredErrors = (): string[] => {
        const err: string[] = [];
        if (!formData.employeeId?.trim()) err.push('Employee ID');
        if (!formData.firstName?.trim()) err.push('First Name');
        if (!formData.lastName?.trim()) err.push('Last Name');
        if (!formData.cnic?.trim()) err.push('CNIC / Govt ID');
        if (!formData.dateOfBirth) err.push('Date of Birth');
        if (!formData.fatherName?.trim()) err.push('Father Name');
        if (!formData.religion?.trim()) err.push('Religion');
        if (!formData.nationality?.trim()) err.push('Nationality');
        if (!formData.gender) err.push('Gender');
        if (!formData.maritalStatus) err.push('Marital Status');
        return err;
    };

    // Redirect unauthorized users trying to create employees
    useEffect(() => {
        if (!isEditMode && !canCreateUser()) {
            navigate('/pim', { replace: true });
        }
    }, [isEditMode, canCreateUser, navigate]);

    // Client-side ID generation removed to prevent race conditions. 
    // The server now handles auto-generating the next ITCS-XXX ID.


    // Initial State including Nested Objects
    const [formData, setFormData] = useState({
        // Personal
        employeeId: '', firstName: '', lastName: '', middleName: '', cnic: '',
        email: '', phone: '', dateOfBirth: '', gender: '',
        maritalStatus: '', nationality: '', fatherName: '', bloodGroup: '',
        religion: '', licenseNumber: '', simNumber: '', workEmail: '', otherEmail: '',

        // Address
        address: { street: '', city: '', state: '', zipCode: '', country: '' },

        // Job
        jobInfo: {
            designation: '', department: '', reportingManager: '', workLocation: '', joiningDate: ''
        },

        // Status
        employmentStatus: { status: 'Probation', autoUpdated: false, probationEndDate: '' },

        // Emergency Contacts (Array)
        emergencyContacts: [{ name: '', relation: '', phone: '' }],

        // Dependents
        dependents: [{ name: '', relation: '', dateOfBirth: '' }],

        // Immigration / Travel History
        immigrationHistory: [{ documentType: 'Passport', documentNumber: '', issueDate: '', expiryDate: '', issuingCountry: '' }],

        // Employment History
        employmentHistory: [{ companyName: '', jobTitle: '', startDate: '', endDate: '', reasonForLeaving: '' }],

        // Education
        education: [{ level: '', institute: '', year: '', score: '' }],

        // Attachments
        files: [] as { file: File; type: string }[],

        // Phase 2: Supplemental
        skills: [] as string[],
        socialProfiles: [
            { platform: 'LinkedIn', link: '' },
            { platform: 'GitHub', link: '' },
            { platform: 'Portfolio', link: '' }
        ],
        salaryComponents: [] as { component: string; amount: number; type: 'fixed' | 'variable' }[],
        bankDetails: {
            bankName: '',
            accountName: '',
            accountNumber: '',
            iban: '',
            swiftCode: ''
        }
    });

    // Fetch Data for Edit Mode
    useEffect(() => {
        if (isEditMode && id) {
            setLoading(true);
            const token = localStorage.getItem('token');

            fetch(`${api.employees}/${id}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
                .then(res => {
                    if (!res.ok) {
                        throw new Error('Failed to fetch employee data');
                    }
                    return res.json();
                })
                .then(found => {
                    if (found) {
                        // Format dates for input fields
                        const formatDate = (date: any) => {
                            if (!date) return '';
                            if (typeof date === 'string') {
                                return date.split('T')[0];
                            }
                            if (date instanceof Date) {
                                return date.toISOString().split('T')[0];
                            }
                            return '';
                        };

                        setFormData({
                            // Personal Info
                            employeeId: found.employeeId || '',
                            firstName: found.firstName || '',
                            lastName: found.lastName || '',
                            middleName: found.middleName || '',
                            cnic: found.cnic || '',
                            email: found.email || '',
                            phone: found.phone || '',
                            dateOfBirth: formatDate(found.dateOfBirth),
                            gender: found.gender || '',
                            maritalStatus: found.maritalStatus || '',
                            nationality: found.nationality || '',
                            fatherName: found.fatherName || '',
                            bloodGroup: found.bloodGroup || '',
                            religion: found.religion || '',
                            licenseNumber: found.licenseNumber || '',
                            simNumber: found.simNumber || '',
                            workEmail: found.workEmail || '',
                            otherEmail: found.otherEmail || '',

                            // Address
                            address: {
                                street: found.address?.street || '',
                                city: found.address?.city || '',
                                state: found.address?.state || '',
                                zipCode: found.address?.zipCode || '',
                                country: found.address?.country || ''
                            },

                            // Job Info
                            jobInfo: {
                                designation: found.jobInfo?.designation || '',
                                department: found.jobInfo?.department || '',
                                reportingManager: found.jobInfo?.reportingManager || '',
                                workLocation: found.jobInfo?.workLocation || '',
                                joiningDate: formatDate(found.jobInfo?.joiningDate)
                            },

                            // Employment Status
                            employmentStatus: typeof found.employmentStatus === 'string'
                                ? { status: found.employmentStatus, autoUpdated: false, probationEndDate: '' }
                                : {
                                    status: found.employmentStatus?.status || 'Probation',
                                    autoUpdated: found.employmentStatus?.autoUpdated || false,
                                    probationEndDate: formatDate(found.employmentStatus?.probationEndDate)
                                },

                            // Emergency Contacts
                            emergencyContacts: found.emergencyContacts?.length
                                ? found.emergencyContacts.map((ec: any) => ({
                                    name: ec.name || '',
                                    relation: ec.relation || '',
                                    phone: ec.phone || ''
                                }))
                                : [{ name: '', relation: '', phone: '' }],

                            // Dependents
                            dependents: found.dependents?.length
                                ? found.dependents.map((dep: any) => ({
                                    name: dep.name || '',
                                    relation: dep.relation || '',
                                    dateOfBirth: formatDate(dep.dateOfBirth)
                                }))
                                : [{ name: '', relation: '', dateOfBirth: '' }],

                            // Immigration History
                            immigrationHistory: found.immigrationHistory?.length
                                ? found.immigrationHistory.map((imm: any) => ({
                                    documentType: imm.documentType || 'Passport',
                                    documentNumber: imm.documentNumber || '',
                                    issueDate: formatDate(imm.issueDate),
                                    expiryDate: formatDate(imm.expiryDate),
                                    issuingCountry: imm.issuingCountry || ''
                                }))
                                : [{ documentType: 'Passport', documentNumber: '', issueDate: '', expiryDate: '', issuingCountry: '' }],

                            // Employment History
                            employmentHistory: found.employmentHistory?.length
                                ? found.employmentHistory.map((eh: any) => ({
                                    companyName: eh.companyName || '',
                                    jobTitle: eh.jobTitle || '',
                                    startDate: formatDate(eh.startDate),
                                    endDate: formatDate(eh.endDate),
                                    reasonForLeaving: eh.reasonForLeaving || ''
                                }))
                                : [{ companyName: '', jobTitle: '', startDate: '', endDate: '', reasonForLeaving: '' }],

                            // Education
                            education: found.education?.length
                                ? found.education.map((edu: any) => ({
                                    level: edu.level || '',
                                    institute: edu.institute || '',
                                    year: edu.year || '',
                                    score: edu.score || ''
                                }))
                                : [{ level: '', institute: '', year: '', score: '' }],

                            // Files - Note: We can't load actual File objects from server, so we'll keep this empty
                            // The attachments are shown separately in the employee profile
                            files: [],

                            // Supplemental info
                            skills: found.skills || [],
                            socialProfiles: found.socialProfiles?.length ? found.socialProfiles : [
                                { platform: 'LinkedIn', link: '' },
                                { platform: 'GitHub', link: '' },
                                { platform: 'Portfolio', link: '' }
                            ],
                            salaryComponents: found.salaryComponents || [],
                            bankDetails: found.bankDetails || {
                                bankName: '',
                                accountName: '',
                                accountNumber: '',
                                iban: '',
                                swiftCode: ''
                            }
                        });

                        // Track fields that were already filled to lock them for non-admins
                        setInitialLockedFields({
                            cnic: !!found.cnic,
                            dateOfBirth: !!found.dateOfBirth,
                            fatherName: !!found.fatherName,
                            nationality: !!found.nationality,
                            bloodGroup: !!found.bloodGroup
                        });
                    }
                    setLoading(false);
                })
                .catch(err => {
                    console.error('Error fetching employee:', err);
                    setError('Failed to load employee data. Please try again.');
                    setLoading(false);
                });
        }
    }, [id, isEditMode]);

    const handleChange = (e: any, section?: string, index?: number, subfield?: string) => {
        const { name, value } = e.target;

        if (section === 'address') {
            setFormData(prev => ({ ...prev, address: { ...prev.address, [name]: value } }));
        } else if (section === 'jobInfo') {
            setFormData(prev => ({ ...prev, jobInfo: { ...prev.jobInfo, [name]: value } }));
        } else if (section === 'employmentStatus') {
            setFormData(prev => ({ ...prev, employmentStatus: { ...prev.employmentStatus, [name]: value } }));
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

    const handleSubmit = async (shouldNavigate = true) => {
        setLoading(true);
        setError(null);

        try {
            const token = localStorage.getItem('token');
            if (!token) {
                setError('You must be logged in to submit. Please log in and try again.');
                setLoading(false);
                return;
            }

            // Check permission to create employees
            if (!isEditMode && !canCreateUser()) {
                setError('You do not have permission to create employees.');
                setLoading(false);
                return;
            }

            // 1. Create or Update Employee (without files - files are uploaded separately)
            const { files, ...employeeData } = formData;

            // Automatically link the authenticated user's ID if creating a new record
            if (!isEditMode && authUser?.id) {
                (employeeData as any).userId = authUser.id;
            }

            const url = isEditMode ? `${api.employees}/${id}` : api.employees;
            const method = isEditMode ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(employeeData)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: isEditMode ? 'Failed to update employee' : 'Failed to create employee' }));
                throw new Error(errorData.message || `Server error: ${response.status}`);
            }

            const savedEmp = await response.json();
            const employeeId = isEditMode ? id : savedEmp.employeeId;

            // 2. Upload Files if any (only for new employees or new files)
            if (files.length > 0) {
                for (const fileObj of files) {
                    try {
                        const fileData = new FormData();
                        fileData.append('file', fileObj.file);
                        fileData.append('fileType', fileObj.type || 'Document');

                        const fileResponse = await fetch(api.employeeAttachments(employeeId), {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}` },
                            body: fileData
                        });

                        if (!fileResponse.ok) {
                            console.warn(`Failed to upload file ${fileObj.file.name}`);
                        }
                    } catch (fileError) {
                        console.error(`Error uploading file ${fileObj.file.name}:`, fileError);
                        // Continue with other files even if one fails
                    }
                }
            }


            // Update initialLockedFields after successful save to lock them on "Back"
            setInitialLockedFields({
                cnic: !!employeeData.cnic,
                dateOfBirth: !!employeeData.dateOfBirth,
                fatherName: !!employeeData.fatherName,
                nationality: !!employeeData.nationality,
                bloodGroup: !!employeeData.bloodGroup
            });

            // Success - navigate if requested
            if (shouldNavigate) {
                navigate('/pim');
            }
            return savedEmp;
        } catch (error: any) {
            console.error('Error submitting form:', error);
            setError(error.message || 'Failed to submit employee. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const steps = [
        { id: 1, title: 'Personal', icon: User },
        { id: 2, title: 'Contact & Dependents', icon: Users },
        { id: 3, title: 'Immigration', icon: Globe },
        { id: 4, title: 'Job & Status', icon: Briefcase },
        { id: 5, title: 'History & Education', icon: GraduationCap },
        { id: 6, title: 'Finance & Assets', icon: CreditCard },
        { id: 7, title: 'Documents', icon: FileText }
    ];

    const handleNext = async () => {
        // On step 1, require: Employee ID, First Name, Last Name, CNIC, Date of Birth, Father Name, Religion, Nationality, Gender, Marital Status
        if (step === 1) {
            if (!isStep1RequiredValid()) {
                setStepErrors(getStep1RequiredErrors());
                return;
            }
            setStepErrors([]);
        }

        if (formData.firstName && formData.lastName) {
            const savedEmp = await handleSubmit(false);
            if (!savedEmp) return;

            if (!isEditMode && savedEmp.employeeId) {
                navigate(`/pim/edit/${savedEmp.employeeId}`, { replace: true });
            }
        }

        if (step < steps.length) {
            if (!completedSteps.includes(step)) {
                setCompletedSteps([...completedSteps, step]);
                setShowCompletion(step);
                setTimeout(() => setShowCompletion(null), 2000);
            }
            setStep(s => Math.min(steps.length, s + 1));
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4 mb-2">
                <button onClick={() => navigate('/pim')} className="p-2 hover:bg-primary-50 rounded-xl transition-all text-gray-500 hover:text-primary-600">
                    <ChevronLeft size={24} />
                </button>
                <div className="flex-1">
                    <h2 className="text-xl font-semibold text-gray-700">{isEditMode ? 'Edit Employee' : 'Add New Employee'}</h2>
                    <p className="text-sm text-gray-500">Step {step} of {steps.length}: {steps[step - 1].title}</p>
                </div>
            </div>

            {/* Progress Bar with Smooth Animation */}
            <div className="flex items-center justify-between mb-8 px-8 relative" style={{ minHeight: '120px' }}>
                {/* Background Progress Bar - Smooth Loading Animation */}
                <div className="absolute top-7 left-8 right-8 h-1.5 bg-slate-200 rounded-full -z-0 overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 rounded-full transition-all duration-1000 ease-out relative"
                        style={{ width: `${((step - 1) / (steps.length - 1)) * 100}%` }}
                    >
                        {/* Shimmer effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                    </div>
                </div>

                {steps.map((s, i) => {
                    const isCompleted = step > s.id;
                    const isCurrent = step === s.id;
                    return (
                        <div key={s.id} className="flex flex-col items-center relative z-10">
                            {/* Step Circle with Completion Animation */}
                            <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-500 shadow-md relative ${isCompleted
                                ? 'bg-gradient-to-r from-emerald-500 to-green-500 text-white scale-110 ring-4 ring-emerald-200'
                                : isCurrent
                                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white scale-110 ring-4 ring-indigo-200'
                                    : 'bg-slate-200 text-slate-500 scale-100'
                                }`}>
                                {isCompleted ? (
                                    <div className="relative">
                                        <Check size={20} className="animate-scale-in" />
                                        {/* Success sparkle effect */}
                                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-300 rounded-full animate-ping" />
                                    </div>
                                ) : (
                                    <s.icon size={18} className={isCurrent ? 'animate-bounce' : ''} />
                                )}
                                {/* Ripple effect for current step */}
                                {isCurrent && (
                                    <>
                                        <div className="absolute inset-0 rounded-full bg-indigo-400 animate-ping opacity-20" />
                                        <div className="absolute inset-0 rounded-full bg-indigo-300 animate-ping opacity-10" style={{ animationDelay: '0.5s' }} />
                                    </>
                                )}
                            </div>

                            {/* Completion Notification Box - Positioned above without overlap */}
                            {isCompleted && showCompletion === s.id && (
                                <div className="absolute -top-20 left-1/2 transform -translate-x-1/2 bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap animate-slide-up shadow-lg z-30 pointer-events-none">
                                    ✓ Completed
                                    <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-emerald-500" />
                                </div>
                            )}

                            {/* Step Title */}
                            <span className={`text-xs mt-3 font-semibold transition-all duration-300 ${isCompleted || isCurrent
                                ? 'text-indigo-600 scale-105'
                                : 'text-gray-400 scale-100'
                                }`}>
                                {s.title}
                            </span>

                            {/* Connecting Line */}
                            {i !== steps.length - 1 && (
                                <div className="absolute top-7 left-[60%] w-[calc(100%-4rem)] h-0.5 -z-0">
                                    <div
                                        className={`h-full transition-all duration-1000 ease-out ${isCompleted
                                            ? 'bg-gradient-to-r from-emerald-500 to-green-500'
                                            : step > s.id
                                                ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500'
                                                : 'bg-slate-200'
                                            }`}
                                        style={{
                                            width: step > s.id ? '100%' : '0%',
                                            transition: 'width 1s ease-out'
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200/50 p-8 min-h-[400px] relative">
                {/* Loading Overlay */}
                {loading && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center animate-fadeIn">
                        <div className="text-center">
                            <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
                            <p className="text-indigo-600 font-medium">
                                {isEditMode ? 'Loading employee data...' : 'Saving...'}
                            </p>
                        </div>
                    </div>
                )}

                {/* Step 1: Personal Details */}
                {step === 1 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-slide-up pb-20">
                        {/* New Upload Fields for Step 1 */}
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
                                    {/* Display selected file if any */}
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
                            <label className="block text-sm font-medium text-gray-600">Employee ID *</label>
                            <input 
                                type="text" 
                                name="employeeId" 
                                value={formData.employeeId} 
                                onChange={handleChange} 
                                placeholder={isEditMode ? "e.g. itcs-001" : "Auto-generated by system"}
                                className={`w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all ${!isEditMode && !canEditSensitiveData() ? 'bg-gray-50' : 'bg-white'}`}
                                readOnly={!isEditMode && !canEditSensitiveData()}
                            />
                            {!isEditMode && !canEditSensitiveData() && <p className="text-xs text-indigo-500">System will assign the next available ID</p>}
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-600">First Name *</label>
                            <input type="text" name="firstName" value={formData.firstName} onChange={handleChange} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-600">Last Name *</label>
                            <input type="text" name="lastName" value={formData.lastName} onChange={handleChange} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                        </div>
                        {/* CNIC, Father Name, Nationality, Blood Group - Visible to all, editable only if empty (except admins) */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-600">CNIC / Govt ID *</label>
                            <input
                                type="text"
                                name="cnic"
                                value={formData.cnic || ''}
                                onChange={handleChange}
                                placeholder="e.g. 12345-1234567-1"
                                disabled={initialLockedFields.cnic && !canEditSensitiveData()}
                                className={`w-full border border-gray-300 rounded px-3 py-2 text-sm ${initialLockedFields.cnic && !canEditSensitiveData() ? 'bg-gray-50 cursor-not-allowed' : ''}`}
                            />
                            {initialLockedFields.cnic && !canEditSensitiveData() && <p className="text-xs text-gray-500">This field cannot be edited once filled</p>}
                            {initialLockedFields.cnic && canEditSensitiveData() && <p className="text-xs text-indigo-500">Admin: This field can be edited</p>}
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-600">Date of Birth *</label>
                            <input
                                type="date"
                                name="dateOfBirth"
                                value={formData.dateOfBirth}
                                onChange={handleChange}
                                disabled={initialLockedFields.dateOfBirth && !canEditSensitiveData()}
                                className={`w-full border border-gray-300 rounded px-3 py-2 text-sm ${initialLockedFields.dateOfBirth && !canEditSensitiveData() ? 'bg-gray-50 cursor-not-allowed' : ''}`}
                            />
                            {initialLockedFields.dateOfBirth && !canEditSensitiveData() && <p className="text-xs text-gray-500">This field cannot be edited once filled</p>}
                            {initialLockedFields.dateOfBirth && canEditSensitiveData() && <p className="text-xs text-indigo-500">Admin: This field can be edited</p>}
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-600">Father Name *</label>
                            <input
                                type="text"
                                name="fatherName"
                                value={formData.fatherName}
                                onChange={handleChange}
                                disabled={initialLockedFields.fatherName && !canEditSensitiveData()}
                                className={`w-full border border-gray-300 rounded px-3 py-2 text-sm ${initialLockedFields.fatherName && !canEditSensitiveData() ? 'bg-gray-50 cursor-not-allowed' : ''}`}
                            />
                            {initialLockedFields.fatherName && !canEditSensitiveData() && <p className="text-xs text-gray-500">This field cannot be edited once filled</p>}
                            {initialLockedFields.fatherName && canEditSensitiveData() && <p className="text-xs text-indigo-500">Admin: This field can be edited</p>}
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-600">Nationality *</label>
                            <input
                                type="text"
                                name="nationality"
                                value={formData.nationality}
                                onChange={handleChange}
                                disabled={initialLockedFields.nationality && !canEditSensitiveData()}
                                className={`w-full border border-gray-300 rounded px-3 py-2 text-sm ${initialLockedFields.nationality && !canEditSensitiveData() ? 'bg-gray-50 cursor-not-allowed' : ''}`}
                            />
                            {initialLockedFields.nationality && !canEditSensitiveData() && <p className="text-xs text-gray-500">This field cannot be edited once filled</p>}
                            {initialLockedFields.nationality && canEditSensitiveData() && <p className="text-xs text-indigo-500">Admin: This field can be edited</p>}
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-600">Blood Group</label>
                            {initialLockedFields.bloodGroup && !canEditSensitiveData() ? (
                                <input
                                    type="text"
                                    value={formData.bloodGroup}
                                    disabled
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-gray-50 cursor-not-allowed"
                                />
                            ) : (
                                <CustomSelect
                                    label=""
                                    value={formData.bloodGroup}
                                    onChange={(val) => setFormData({ ...formData, bloodGroup: val })}
                                    options={['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']}
                                    disabled={false}
                                />
                            )}
                            {initialLockedFields.bloodGroup && !canEditSensitiveData() && <p className="text-xs text-gray-500">This field cannot be edited once filled</p>}
                            {initialLockedFields.bloodGroup && canEditSensitiveData() && <p className="text-xs text-indigo-500">Admin: This field can be edited</p>}
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-600">Religion *</label>
                            <input type="text" name="religion" value={formData.religion} onChange={handleChange} className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all" />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-600">License Number</label>
                            <input type="text" name="licenseNumber" value={formData.licenseNumber} onChange={handleChange} className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all" />
                        </div>
                        <div className="space-y-2">
                            <CustomSelect label="Gender *" value={formData.gender} onChange={(val) => setFormData({ ...formData, gender: val })} options={['Male', 'Female', 'Other']} />
                        </div>
                        <div className="space-y-2">
                            <CustomSelect label="Marital Status *" value={formData.maritalStatus} onChange={(val) => setFormData({ ...formData, maritalStatus: val })} options={['Single', 'Married', 'Other']} />
                        </div>
                    </div>
                )}

                {/* Step 2: Contact, Address, Dependents */}
                {step === 2 && (
                    <div className="space-y-8 animate-slide-up">
                        <div>
                            <h3 className="text-lg font-medium text-gray-700 mb-4">Contact Info</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <input type="email" name="email" placeholder="Personal Email" value={formData.email} onChange={handleChange} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                                <input type="email" name="workEmail" placeholder="Work Email" value={formData.workEmail} onChange={handleChange} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                                <input type="email" name="otherEmail" placeholder="Other Email" value={formData.otherEmail} onChange={handleChange} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                                <input type="text" name="phone" placeholder="Personal Phone" value={formData.phone} onChange={handleChange} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                                <input type="text" name="simNumber" placeholder="Company SIM Number" value={formData.simNumber} onChange={handleChange} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                            </div>
                        </div>

                        <div>
                            <h3 className="text-lg font-medium text-gray-700 mb-4">Address</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                <input type="text" name="street" placeholder="Street" value={formData.address.street} onChange={(e) => handleChange(e, 'address')} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                                <input type="text" name="city" placeholder="City" value={formData.address.city} onChange={(e) => handleChange(e, 'address')} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                                <input type="text" name="state" placeholder="State / Province" value={formData.address.state} onChange={(e) => handleChange(e, 'address')} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                                <input type="text" name="zipCode" placeholder="Zip / Postal Code" value={formData.address.zipCode} onChange={(e) => handleChange(e, 'address')} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                                <input type="text" name="country" placeholder="Country" value={formData.address.country} onChange={(e) => handleChange(e, 'address')} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
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
                                            <input type="date" value={dep.dateOfBirth ? dep.dateOfBirth.split('T')[0] : ''} onChange={(e) => handleChange(e, 'dependents', idx, 'dateOfBirth')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all text-gray-500" />
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

                                        {/* Document Upload */}
                                        <div className="md:col-span-2 lg:col-span-3 space-y-1 mt-2 pt-2 border-t border-gray-50">
                                            <div className="flex items-center gap-2">
                                                <label className="flex items-center gap-2 cursor-pointer px-3 py-1.5 border border-dashed border-gray-300 rounded-lg bg-gray-50 hover:bg-white text-gray-600 transition-all text-xs w-full justify-center">
                                                    <Upload size={14} />
                                                    <span className="truncate">
                                                        {formData.files.some(f => f.type === `Immigration - ${doc.documentNumber || idx}`)
                                                            ? formData.files.find(f => f.type === `Immigration - ${doc.documentNumber || idx}`)?.file.name
                                                            : 'Upload Document Scan'}
                                                    </span>
                                                    <input
                                                        type="file"
                                                        accept=".pdf,.jpg,.png"
                                                        className="hidden"
                                                        onChange={(e) => {
                                                            if (e.target.files && e.target.files.length > 0) {
                                                                const typeKey = `Immigration - ${doc.documentNumber || idx}`;
                                                                setFormData(prev => ({
                                                                    ...prev,
                                                                    files: [...prev.files.filter(f => f.type !== typeKey), { file: e.target.files![0], type: typeKey }]
                                                                }));
                                                            }
                                                        }}
                                                    />
                                                </label>
                                                {formData.files.some(f => f.type === `Immigration - ${doc.documentNumber || idx}`) && (
                                                    <button
                                                        onClick={() => setFormData(p => ({ ...p, files: p.files.filter(f => f.type !== `Immigration - ${doc.documentNumber || idx}`) }))}
                                                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                                                        title="Remove File"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Step 4: Job Info & History */}
                {step === 4 && (
                    <div className="space-y-8 animate-slide-up pb-20">
                        {/* Job Information */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-600">Job Title</label>
                                <input type="text" name="designation" value={formData.jobInfo.designation} onChange={(e) => handleChange(e, 'jobInfo')} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                            </div>
                            <div className="space-y-2">
                                <CustomSelect label="Department" value={formData.jobInfo.department} onChange={(val) => setFormData(p => ({ ...p, jobInfo: { ...p.jobInfo, department: val } }))} options={['Technical', 'Development', 'Administration', 'Marketing', 'Sales', 'Finance']} />
                            </div>
                            <div className="space-y-2">
                                <CustomSelect label="Employment Status" value={formData.employmentStatus.status} onChange={(val) => setFormData(p => ({ ...p, employmentStatus: { ...p.employmentStatus, status: val } }))} options={['Internship', 'Probation', 'Permanent', 'Contract', 'Part-time']} />
                            </div>
                            {formData.employmentStatus.status === 'Probation' && (
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-600">Probation End Date</label>
                                    <input
                                        type="date"
                                        value={formData.employmentStatus.probationEndDate}
                                        onChange={(e) => setFormData(p => ({ ...p, employmentStatus: { ...p.employmentStatus, probationEndDate: e.target.value } }))}
                                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-100 outline-none"
                                    />
                                </div>
                            )}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-600">Joining Date</label>
                                <input type="date" name="joiningDate" value={formData.jobInfo.joiningDate} onChange={(e) => handleChange(e, 'jobInfo')} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-600">Reporting Manager</label>
                                <input type="text" name="reportingManager" value={formData.jobInfo.reportingManager} onChange={(e) => handleChange(e, 'jobInfo')} placeholder="Name of reporting manager" className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-600">Work Location</label>
                                <input type="text" name="workLocation" value={formData.jobInfo.workLocation} onChange={(e) => handleChange(e, 'jobInfo')} placeholder="e.g. Remote, On-site" className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                            </div>
                            <div className="space-y-2 col-span-1 md:col-span-2">
                                <label className="block text-sm font-medium text-gray-600 mb-2">Employment Contract</label>
                                <div className="flex items-center gap-4 border border-dashed border-gray-300 rounded-lg p-3 bg-gray-50/50 hover:bg-gray-50 transition-colors relative cursor-pointer">
                                    <input
                                        type="file"
                                        accept=".pdf,.doc,.docx"
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                        onChange={(e) => {
                                            if (e.target.files && e.target.files.length > 0) {
                                                const file = e.target.files[0];
                                                setFormData(prev => ({
                                                    ...prev,
                                                    files: [...prev.files, { file, type: 'Employment Contract' }]
                                                }));
                                            }
                                        }}
                                    />
                                    <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
                                        <FileText size={20} />
                                    </div>
                                    <div className="flex-1">
                                        {formData.files.some(f => f.type === 'Employment Contract') ? (
                                            <p className="text-sm font-medium text-emerald-600">{formData.files.find(f => f.type === 'Employment Contract')?.file.name}</p>
                                        ) : (
                                            <p className="text-sm text-gray-500">Upload contract (PDF/DOC)</p>
                                        )}
                                    </div>
                                    <Upload size={18} className="text-gray-400" />
                                </div>
                            </div>
                        </div>

                        {/* Employment History */}
                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-medium text-gray-700">Employment History</h3>
                                <button onClick={() => setFormData(p => ({ ...p, employmentHistory: [...p.employmentHistory, { companyName: '', jobTitle: '', startDate: '', endDate: '', reasonForLeaving: '' }] }))} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 border border-indigo-200 transition-all shadow-sm">
                                    + Add Employment History
                                </button>
                            </div>
                            {formData.employmentHistory.map((history, idx) => (
                                <div key={idx} className="mb-4 p-5 border border-gray-100 rounded-xl bg-white shadow-sm hover:shadow-md transition-all relative group">
                                    <div className="flex justify-end mb-2">
                                        <button
                                            onClick={() => {
                                                const newHistory = formData.employmentHistory.filter((_, i) => i !== idx);
                                                setFormData({ ...formData, employmentHistory: newHistory });
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
                                            <input type="text" placeholder="e.g. Acme Corp" value={history.companyName} onChange={(e) => {
                                                const newHistory = [...formData.employmentHistory];
                                                newHistory[idx].companyName = e.target.value;
                                                setFormData({ ...formData, employmentHistory: newHistory });
                                            }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all text-gray-600" />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-medium text-gray-500">Job Title</label>
                                            <input type="text" placeholder="e.g. Software Engineer" value={history.jobTitle} onChange={(e) => {
                                                const newHistory = [...formData.employmentHistory];
                                                newHistory[idx].jobTitle = e.target.value;
                                                setFormData({ ...formData, employmentHistory: newHistory });
                                            }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all text-gray-600" />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-medium text-gray-500">Start Date</label>
                                            <input type="date" value={history.startDate} onChange={(e) => {
                                                const newHistory = [...formData.employmentHistory];
                                                newHistory[idx].startDate = e.target.value;
                                                setFormData({ ...formData, employmentHistory: newHistory });
                                            }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all text-gray-600" />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-medium text-gray-500">End Date</label>
                                            <input type="date" value={history.endDate} onChange={(e) => {
                                                const newHistory = [...formData.employmentHistory];
                                                newHistory[idx].endDate = e.target.value;
                                                setFormData({ ...formData, employmentHistory: newHistory });
                                            }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all text-gray-600" />
                                        </div>
                                        <div className="md:col-span-2 space-y-1">
                                            <label className="text-xs font-medium text-gray-500">Reason for Leaving</label>
                                            <input type="text" placeholder="Optional" value={history.reasonForLeaving} onChange={(e) => {
                                                const newHistory = [...formData.employmentHistory];
                                                newHistory[idx].reasonForLeaving = e.target.value;
                                                setFormData({ ...formData, employmentHistory: newHistory });
                                            }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all" />
                                        </div>
                                        <div className="md:col-span-2 space-y-1 mt-2 pt-2 border-t border-gray-50">
                                            <div className="flex items-center gap-2">
                                                <label className="flex items-center gap-2 cursor-pointer px-3 py-1.5 border border-dashed border-gray-300 rounded-lg bg-gray-50 hover:bg-white text-gray-600 transition-all text-xs w-full">
                                                    <Upload size={14} />
                                                    <span className="truncate flex-1">
                                                        {formData.files.some(f => f.type === `Experience Letter - ${history.companyName || idx}`)
                                                            ? formData.files.find(f => f.type === `Experience Letter - ${history.companyName || idx}`)?.file.name
                                                            : 'Upload Experience Letter'}
                                                    </span>
                                                    <input
                                                        type="file"
                                                        accept=".pdf,.jpg,.png,.doc,.docx"
                                                        className="hidden"
                                                        onChange={(e) => {
                                                            if (e.target.files && e.target.files.length > 0) {
                                                                // Use a unique type key for this specific history entry
                                                                const typeKey = `Experience Letter - ${history.companyName || idx}`;
                                                                setFormData(prev => ({
                                                                    ...prev,
                                                                    files: [...prev.files.filter(f => f.type !== typeKey), { file: e.target.files![0], type: typeKey }]
                                                                }));
                                                            }
                                                        }}
                                                    />
                                                </label>
                                                {formData.files.some(f => f.type === `Experience Letter - ${history.companyName || idx}`) && (
                                                    <button
                                                        onClick={() => setFormData(p => ({ ...p, files: p.files.filter(f => f.type !== `Experience Letter - ${history.companyName || idx}`) }))}
                                                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                                                        title="Remove File"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Step 5: Education */}
                {step === 5 && (
                    <div className="space-y-8 animate-slide-up pb-20">
                        <div>
                            <div className="flex justify-between items-center mb-4">
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
                                            <input type="text" placeholder="e.g. Bachelor, Master" value={edu.level} onChange={(e) => {
                                                const newEdu = [...formData.education];
                                                newEdu[idx].level = e.target.value;
                                                setFormData({ ...formData, education: newEdu });
                                            }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all text-gray-600" />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-medium text-gray-500">Institute</label>
                                            <input type="text" placeholder="e.g. Harvard University" value={edu.institute} onChange={(e) => {
                                                const newEdu = [...formData.education];
                                                newEdu[idx].institute = e.target.value;
                                                setFormData({ ...formData, education: newEdu });
                                            }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all text-gray-600" />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-medium text-gray-500">Year</label>
                                            <input type="text" placeholder="e.g. 2020-2024" value={edu.year} onChange={(e) => {
                                                const newEdu = [...formData.education];
                                                newEdu[idx].year = e.target.value;
                                                setFormData({ ...formData, education: newEdu });
                                            }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all text-gray-600" />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-medium text-gray-500">Score/GPA</label>
                                            <input type="text" placeholder="e.g. 3.8/4.0" value={edu.score} onChange={(e) => {
                                                const newEdu = [...formData.education];
                                                newEdu[idx].score = e.target.value;
                                                setFormData({ ...formData, education: newEdu });
                                            }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all text-gray-600" />
                                        </div>
                                        <div className="md:col-span-2 space-y-1 mt-2 pt-2 border-t border-gray-50">
                                            <div className="flex items-center gap-2">
                                                <label className="flex items-center gap-2 cursor-pointer px-3 py-1.5 border border-dashed border-gray-300 rounded-lg bg-gray-50 hover:bg-white text-gray-600 transition-all text-xs w-full">
                                                    <Upload size={14} />
                                                    <span className="truncate flex-1">
                                                        {formData.files.some(f => f.type === `Certificate - ${edu.level || idx}`)
                                                            ? formData.files.find(f => f.type === `Certificate - ${edu.level || idx}`)?.file.name
                                                            : 'Upload Certificate/Document'}
                                                    </span>
                                                    <input
                                                        type="file"
                                                        accept=".pdf,.jpg,.png,.doc,.docx"
                                                        className="hidden"
                                                        onChange={(e) => {
                                                            if (e.target.files && e.target.files.length > 0) {
                                                                const typeKey = `Certificate - ${edu.level || idx}`;
                                                                setFormData(prev => ({
                                                                    ...prev,
                                                                    files: [...prev.files.filter(f => f.type !== typeKey), { file: e.target.files![0], type: typeKey }]
                                                                }));
                                                            }
                                                        }}
                                                    />
                                                </label>
                                                {formData.files.some(f => f.type === `Certificate - ${edu.level || idx}`) && (
                                                    <button
                                                        onClick={() => setFormData(p => ({ ...p, files: p.files.filter(f => f.type !== `Certificate - ${edu.level || idx}`) }))}
                                                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                                                        title="Remove File"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {/* Skills & Social Profiles */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12 pt-8 border-t border-gray-100">
                                <div>
                                    <h3 className="text-lg font-medium text-gray-700 mb-4">Professional Skills</h3>
                                    <div className="space-y-4">
                                        <div className="flex flex-wrap gap-2 mb-2">
                                            {formData.skills.map((skill, idx) => (
                                                <span key={idx} className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-sm font-medium group">
                                                    {skill}
                                                    <button onClick={() => setFormData(p => ({ ...p, skills: p.skills.filter((_, i) => i !== idx) }))} className="hover:text-red-500">
                                                        <Trash2 size={12} />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                placeholder="Add a skill (e.g. React)"
                                                id="skillInput"
                                                className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-200 outline-none transition-all"
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        const val = (e.target as HTMLInputElement).value.trim();
                                                        if (val && !formData.skills.includes(val)) {
                                                            setFormData(p => ({ ...p, skills: [...p.skills, val] }));
                                                            (e.target as HTMLInputElement).value = '';
                                                        }
                                                        e.preventDefault();
                                                    }
                                                }}
                                            />
                                            <button
                                                onClick={() => {
                                                    const input = document.getElementById('skillInput') as HTMLInputElement;
                                                    const val = input.value.trim();
                                                    if (val) {
                                                        setFormData(p => ({ ...p, skills: [...p.skills, val] }));
                                                        input.value = '';
                                                    }
                                                }}
                                                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700"
                                            >
                                                Add
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-lg font-medium text-gray-700 mb-4">Digital Presence</h3>
                                    <div className="space-y-4">
                                        {formData.socialProfiles.map((profile, idx) => (
                                            <div key={idx} className="flex items-center gap-3">
                                                <label className="text-xs font-semibold text-gray-400 w-20 uppercase tracking-wider">{profile.platform}</label>
                                                <input
                                                    type="url"
                                                    placeholder={`${profile.platform} URL`}
                                                    value={profile.link}
                                                    onChange={(e) => {
                                                        const newProfiles = [...formData.socialProfiles];
                                                        newProfiles[idx].link = e.target.value;
                                                        setFormData(p => ({ ...p, socialProfiles: newProfiles }));
                                                    }}
                                                    className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-200 outline-none transition-all"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 6: Finance & Assets */}
                {step === 6 && (
                    <div className="space-y-8 animate-slide-up pb-20">
                        {/* Salary Components */}
                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-medium text-gray-700">Salary Components</h3>
                                <button
                                    onClick={() => setFormData(p => ({
                                        ...p,
                                        salaryComponents: [...p.salaryComponents, { component: '', amount: 0, type: 'fixed' }]
                                    }))}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 border border-indigo-200 transition-all shadow-sm"
                                >
                                    + Add Component
                                </button>
                            </div>
                            <div className="space-y-4">
                                {formData.salaryComponents.map((comp, idx) => (
                                    <div key={idx} className="flex flex-col md:flex-row gap-4 p-4 bg-white border border-gray-100 rounded-xl shadow-sm relative group">
                                        <div className="flex-1 space-y-1">
                                            <label className="text-xs font-medium text-gray-500">Component Name</label>
                                            <input
                                                type="text"
                                                placeholder="e.g. Basic Salary"
                                                value={comp.component}
                                                onChange={(e) => {
                                                    const newComps = [...formData.salaryComponents];
                                                    newComps[idx].component = e.target.value;
                                                    setFormData(p => ({ ...p, salaryComponents: newComps }));
                                                }}
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 outline-none transition-all"
                                            />
                                        </div>
                                        <div className="w-full md:w-32 space-y-1">
                                            <label className="text-xs font-medium text-gray-500">Amount</label>
                                            <input
                                                type="number"
                                                placeholder="0.00"
                                                value={comp.amount}
                                                onChange={(e) => {
                                                    const newComps = [...formData.salaryComponents];
                                                    newComps[idx].amount = Number(e.target.value);
                                                    setFormData(p => ({ ...p, salaryComponents: newComps }));
                                                }}
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 outline-none transition-all"
                                            />
                                        </div>
                                        <div className="w-full md:w-40 space-y-1">
                                            <label className="text-xs font-medium text-gray-500">Type</label>
                                            <select
                                                value={comp.type}
                                                onChange={(e) => {
                                                    const newComps = [...formData.salaryComponents];
                                                    newComps[idx].type = e.target.value as 'fixed' | 'variable';
                                                    setFormData(p => ({ ...p, salaryComponents: newComps }));
                                                }}
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 outline-none transition-all bg-white"
                                            >
                                                <option value="fixed">Fixed</option>
                                                <option value="variable">Variable</option>
                                            </select>
                                        </div>
                                        <button
                                            onClick={() => setFormData(p => ({
                                                ...p,
                                                salaryComponents: p.salaryComponents.filter((_, i) => i !== idx)
                                            }))}
                                            className="self-end md:self-center p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))}
                                {formData.salaryComponents.length === 0 && (
                                    <div className="text-center py-8 bg-gray-50 border border-dashed border-gray-200 rounded-xl text-gray-400 text-sm">
                                        No salary components added yet.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Bank Details */}
                        <div className="pt-8 border-t border-gray-100">
                            <h3 className="text-lg font-medium text-gray-700 mb-6 flex items-center gap-2">
                                <Banknote size={20} className="text-indigo-500" />
                                Bank Account Details
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-gray-500">Bank Name</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Chase Bank"
                                        value={formData.bankDetails.bankName}
                                        onChange={(e) => setFormData(p => ({ ...p, bankDetails: { ...p.bankDetails, bankName: e.target.value } }))}
                                        className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-200 outline-none transition-all"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-gray-500">Account Holder Name</label>
                                    <input
                                        type="text"
                                        placeholder="Full name as per bank"
                                        value={formData.bankDetails.accountName}
                                        onChange={(e) => setFormData(p => ({ ...p, bankDetails: { ...p.bankDetails, accountName: e.target.value } }))}
                                        className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-200 outline-none transition-all"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-gray-500">Account Number</label>
                                    <input
                                        type="text"
                                        placeholder="Account Number"
                                        value={formData.bankDetails.accountNumber}
                                        onChange={(e) => setFormData(p => ({ ...p, bankDetails: { ...p.bankDetails, accountNumber: e.target.value } }))}
                                        className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-200 outline-none transition-all"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-gray-500">IBAN</label>
                                    <input
                                        type="text"
                                        placeholder="International Bank Account Number"
                                        value={formData.bankDetails.iban}
                                        onChange={(e) => setFormData(p => ({ ...p, bankDetails: { ...p.bankDetails, iban: e.target.value } }))}
                                        className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-200 outline-none transition-all"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-gray-500">Swift Code (BIC)</label>
                                    <input
                                        type="text"
                                        placeholder="Swift/BIC Code"
                                        value={formData.bankDetails.swiftCode}
                                        onChange={(e) => setFormData(p => ({ ...p, bankDetails: { ...p.bankDetails, swiftCode: e.target.value } }))}
                                        className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-200 outline-none transition-all"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 7: Additional Documents */}
                {step === 7 && (
                    <div className="space-y-6 animate-slide-up">
                        <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-6 text-center">
                            <div className="border-2 border-dashed border-indigo-300 rounded-lg p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-white/50 transition-all relative group">
                                <input
                                    type="file"
                                    multiple
                                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                    onChange={(e) => {
                                        if (e.target.files && e.target.files.length > 0) {
                                            const newFiles = Array.from(e.target.files).map(f => ({ file: f, type: 'Other Document' }));
                                            setFormData(prev => ({
                                                ...prev,
                                                files: [...prev.files, ...newFiles]
                                            }));
                                        }
                                    }}
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                />
                                <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                    <Upload size={32} className="text-indigo-600" />
                                </div>
                                <h4 className="text-lg font-semibold text-gray-700">Upload Additional Files</h4>
                                <p className="text-sm text-gray-500 mt-2">Drag & drop files or <span className="text-indigo-600 font-medium">Browse</span></p>
                                <p className="text-xs text-gray-400 mt-1">Supports PDF, JPG, PNG, DOC (Max 10MB)</p>
                            </div>
                        </div>

                        {formData.files.length > 0 && (
                            <div className="space-y-3">
                                <h4 className="font-medium text-gray-700">Attached Documents ({formData.files.length})</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {formData.files.map((fileObj, i) => (
                                        <div key={i} className="flex justify-between items-center bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className="p-2 bg-gray-100 rounded-lg">
                                                    <FileText size={20} className="text-gray-500" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-gray-700 truncate">{fileObj.file.name}</p>
                                                    <p className="text-xs text-gray-500">{fileObj.type} • {(fileObj.file.size / 1024).toFixed(1)} KB</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setFormData(p => ({ ...p, files: p.files.filter((_, idx) => idx !== i) }))}
                                                className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Error Message */}
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
                        <span className="text-red-500">⚠️</span>
                        <span>{error}</span>
                        <button
                            onClick={() => setError(null)}
                            className="ml-auto text-red-500 hover:text-red-700"
                        >
                            ×
                        </button>
                    </div>
                )}

                {/* Step 1 required fields validation */}
                {step === 1 && stepErrors.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg">
                        <p className="font-medium mb-2">Please fill all required fields before continuing:</p>
                        <ul className="list-disc list-inside text-sm space-y-1">
                            {stepErrors.map((err, i) => (
                                <li key={i}>{err}</li>
                            ))}
                        </ul>
                        <button type="button" onClick={() => setStepErrors([])} className="mt-2 text-amber-600 hover:text-amber-800 text-sm font-medium">
                            Dismiss
                        </button>
                    </div>
                )}

                {/* Navigation Buttons */}
                <div className="flex justify-between pt-6 border-t border-gray-100">
                    <button
                        onClick={() => { setStepErrors([]); setStep(s => Math.max(1, s - 1)); }}
                        disabled={step === 1}
                        className={`px-6 py-2.5 rounded-xl border border-gray-300 font-medium flex items-center gap-2 transition-all ${step === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary-50 hover:border-primary-300 hover:text-primary-700'}`}
                    >
                        <ChevronLeft size={16} /> Back
                    </button>

                    {step < steps.length ? (
                        <button
                            onClick={handleNext}
                            disabled={step === 1 && !isStep1RequiredValid()}
                            className={`px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-all shadow-sm ${step === 1 && !isStep1RequiredValid() ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 hover:shadow-md'}`}
                        >
                            {loading && step === 1 ? 'Saving...' : 'Next'} <ChevronRight size={16} />
                        </button>
                    ) : (
                        <button
                            onClick={() => handleSubmit()}
                            disabled={loading}
                            className="px-8 py-2.5 rounded-lg bg-success text-white font-medium hover:bg-success/90 flex items-center gap-2 shadow-sm hover:shadow-md transition-all"
                        >
                            <Save size={18} /> {loading ? (isEditMode ? 'Updating...' : 'Saving...') : (isEditMode ? 'Update Employee' : 'Submit Employee')}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AddEmployeeWizard;
