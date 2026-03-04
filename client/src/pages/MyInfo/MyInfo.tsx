import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Save, Upload, Check, X, User, FileText, Trash2, Globe, Users, GraduationCap, Edit2, Shield, Phone, Briefcase, Download, AlertCircle, History, Camera, CreditCard, Banknote, DollarSign, Plus } from 'lucide-react';
import CustomSelect from '../../components/UI/CustomSelect';
import api, { api as apiHelpers } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { getAvatarUrl } from '../../utils/avatar';
import type { User as UserType } from '../../types';

const MyInfo = () => {
    const navigate = useNavigate();
    const { user, login } = useAuth();
    const { canEditSensitiveData } = usePermissions();
    const [loading, setLoading] = useState(true);
    const [avatarCache, setAvatarCache] = useState<string>('');
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
    const [initialLockedFields, setInitialLockedFields] = useState<{ [key: string]: boolean }>({});
    const [stepErrors, setStepErrors] = useState<string[]>([]);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; attachmentId: string | null; fileName: string | null }>({
        isOpen: false,
        attachmentId: null,
        fileName: null
    });

    const validateField = (name: string, value: string): string => {
        if (!value.trim()) return ''; // empty = no error
        switch (name) {
            case 'email':
            case 'workEmail':
            case 'otherEmail':
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? '' : 'Enter a valid email address (e.g. name@domain.com)';
            case 'phone':
            case 'simNumber':
                return /^[\+]?[0-9 \-\(\)]{7,15}$/.test(value.replace(/\s/g, '')) ? '' : 'Enter a valid phone number (7-15 digits)';
            case 'cnic':
                return /^[0-9]{5}-[0-9]{7}-[0-9]$/.test(value) ? '' : 'CNIC must be in format 12345-1234567-1';
            case 'iban':
                return /^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}$/.test(value.replace(/\s/g, '').toUpperCase()) ? '' : 'Enter a valid IBAN (e.g. PK36SCBL0000001123456702)';
            case 'accountNumber':
                return /^[0-9]{8,16}$/.test(value.replace(/[-\s]/g, '')) ? '' : 'Account number must be 8-16 digits';
            case 'swiftCode':
                return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(value.toUpperCase()) ? '' : 'Enter a valid SWIFT/BIC code (e.g. SCBLPKKA)';
            default:
                return '';
        }
    };

    const handleFieldBlur = (name: string, value: string) => {
        const err = validateField(name, value);
        setFieldErrors(prev => ({ ...prev, [name]: err }));
    };

    const hasFetched = useRef(false);
    const searchParams = new URLSearchParams(window.location.search);
    const onboarding = searchParams.get('onboarding') === 'true';
    const targetStep = parseInt(searchParams.get('step') || '1', 10);

    const [step, setStep] = useState(targetStep);
    
    // Required fields on step 1 – must be filled before Next/Save (for employee, manager, admin)
    const isStep1RequiredValid = () => {
        return !!(
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
        religion: '',
        licenseNumber: '',
        simNumber: '',
        workEmail: '',
        otherEmail: '',

        // Address
        address: {
            street: '',
            city: '',
            state: '',
            zipCode: '',
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

        // Job
        jobInfo: {
            designation: '',
            department: '',
            reportingManager: '',
            workLocation: '',
            joiningDate: ''
        },

        // Status
        employmentStatus: { status: 'Probation', autoUpdated: false, probationEndDate: '' },

        // Files
        files: [] as { file: File; type: string }[],

        // Supplemental
        skills: [] as string[],
        socialProfiles: [
            { platform: 'LinkedIn', link: '' },
            { platform: 'GitHub', link: '' },
            { platform: 'Portfolio', link: '' }
        ],
        salaryComponents: [
            { component: 'Basic Salary', amount: 0, type: 'fixed' },
            { component: 'Medical Allowance', amount: 0, type: 'fixed' }
        ] as { component: string; amount: number; type: 'fixed' | 'variable' }[],
        bankDetails: {
            bankName: '',
            accountName: '',
            accountNumber: '',
            iban: '',
            swiftCode: ''
        }
    });

    // Fetch employee data linked to current user
    useEffect(() => {
        const fetchEmployeeData = async () => {
            if (!user?.id || hasFetched.current) return;

            setLoading(true);
            hasFetched.current = true;
            if (onboarding) setIsEditing(true);
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
                            email: (employee.email === user?.email && user?.microsoftId) ? '' : (employee.email || ''),
                            phone: employee.phone || '',
                            dateOfBirth: formatDate(employee.dateOfBirth),
                            gender: employee.gender || '',
                            maritalStatus: employee.maritalStatus || '',
                            nationality: employee.nationality || '',
                            fatherName: employee.fatherName || '',
                            bloodGroup: employee.bloodGroup || '',
                            cnic: employee.cnic || '',
                            religion: employee.religion || '',
                            licenseNumber: employee.licenseNumber || '',
                            simNumber: employee.simNumber || '',
                            workEmail: employee.workEmail || (user?.microsoftId ? user?.email : '') || '',
                            otherEmail: employee.otherEmail || '',
                            address: {
                                street: employee.address?.street || '',
                                city: employee.address?.city || '',
                                state: employee.address?.state || '',
                                zipCode: employee.address?.zipCode || '',
                                country: employee.address?.country || ''
                            },
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
                            skills: employee.skills || [],
                            socialProfiles: employee.socialProfiles?.length ? employee.socialProfiles : [
                                { platform: 'LinkedIn', link: '' },
                                { platform: 'GitHub', link: '' },
                                { platform: 'Portfolio', link: '' }
                            ],
                            salaryComponents: (() => {
                                const standard = [
                                    { component: 'Basic Salary', amount: 0, type: 'fixed' },
                                    { component: 'Medical Allowance', amount: 0, type: 'fixed' }
                                ];
                                if (!employee.salaryComponents || employee.salaryComponents.length === 0) return standard;
                                
                                // Ensure standard components exist in the loaded list
                                const merged = [...employee.salaryComponents];
                                standard.forEach(s => {
                                    if (!merged.find(m => m.component === s.component)) {
                                        merged.unshift(s);
                                    }
                                });
                                return merged;
                            })(),
                            bankDetails: employee.bankDetails || {
                                bankName: '',
                                accountName: '',
                                accountNumber: '',
                                iban: '',
                                swiftCode: ''
                            },
                            jobInfo: {
                                designation: employee.jobInfo?.designation || '',
                                department: employee.jobInfo?.department || '',
                                reportingManager: employee.jobInfo?.reportingManager || '',
                                workLocation: employee.jobInfo?.workLocation || '',
                                joiningDate: formatDate(employee.jobInfo?.joiningDate)
                            },
                            employmentStatus: typeof employee.employmentStatus === 'string'
                                ? { status: employee.employmentStatus, autoUpdated: false, probationEndDate: '' }
                                : {
                                    status: employee.employmentStatus?.status || 'Probation',
                                    autoUpdated: employee.employmentStatus?.autoUpdated || false,
                                    probationEndDate: formatDate(employee.employmentStatus?.probationEndDate)
                                },
                            files: []
                        } as any);

                        // Track fields that were already filled to lock them for non-admins
                        setInitialLockedFields({
                            cnic: !!employee.cnic,
                            dateOfBirth: !!employee.dateOfBirth,
                            fatherName: !!employee.fatherName,
                            nationality: !!employee.nationality,
                            bloodGroup: !!employee.bloodGroup
                        });
                    } else {
                        // No employee record found, initialize with user data
                        setIsEditing(true); // Default to editing if no record exists
                        setFormData(prev => ({
                            ...prev,
                            email: '',
                            workEmail: user?.email || '',
                            firstName: user?.firstName || '',
                            lastName: user?.lastName || ''
                        }));
                    }
                } else {
                    // response not ok (e.g. 401 Unauthorized, 404)
                    setIsEditing(true);
                }
            } catch (err: any) {
                console.error('Error fetching employee data:', err);
                setError('Failed to load your profile information. Please complete your profile to continue.');
                setIsEditing(true);
            } finally {
                setLoading(false);
            }
        };

        fetchEmployeeData();
    }, [user?.id]); // Refresh on ID change

    // Scroll to top when step changes
    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [step]);

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
        // Step 1 has required field validation before saving
        if (step === 1) {
            if (!isStep1RequiredValid()) {
                setStepErrors(getStep1RequiredErrors());
                return;
            }
            setStepErrors([]);
        }

        // Trigger background save without awaiting so UI is instant
        handleSubmit(false);

        const currentIndex = steps.findIndex(s => s.id === step);
        if (currentIndex < steps.length - 1) {
            const nextStep = steps[currentIndex + 1];
            if (!completedSteps.includes(step)) {
                setCompletedSteps([...completedSteps, step]);
                setShowCompletion(step);
                setTimeout(() => setShowCompletion(null), 2000);
            }
            setStep(nextStep.id);
        }
    };

    const handleStepClick = (targetStepId: number) => {
        // If clicking the current step, do nothing
        if (targetStepId === step) return;

        // Step 1 requires valid fields before leaving
        if (step === 1 && targetStepId > 1) {
            if (!isStep1RequiredValid()) {
                setStepErrors(getStep1RequiredErrors());
                return;
            }
            setStepErrors([]);
        }

        // Fire off background save silently
        handleSubmit(false);

        // Mark current step as completed if jumping forward
        if (targetStepId > step && !completedSteps.includes(step)) {
            setCompletedSteps(prev => [...prev, step]);
        }

        setStep(targetStepId);
    };

    const handlePrev = () => {
        const currentIndex = steps.findIndex(s => s.id === step);
        if (currentIndex > 0) {
            setStepErrors([]);
            setStep(steps[currentIndex - 1].id);
        }
    };

    const handleSubmit = async (shouldNavigate = true) => {
        if (!isStep1RequiredValid()) {
            setStepErrors(getStep1RequiredErrors());
            return;
        }
        setStepErrors([]);

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
                email: (formData.email === user?.email && user?.microsoftId) ? '' : (formData.email || ''),
                workEmail: formData.workEmail || (user?.microsoftId ? user?.email : '') || '',
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
                // employeeId is omitted to allow server-side generation
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
            setRawEmployee(savedEmployee); // Update raw data to refresh profile view immediately
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
                // Clear files array after successful upload so they aren't uploaded again on next save
                setFormData(prev => ({ ...prev, files: [] }));
            }

            setInitialLockedFields({
                cnic: !!employeeData.cnic,
                dateOfBirth: !!employeeData.dateOfBirth,
                fatherName: !!employeeData.fatherName,
                nationality: !!employeeData.nationality,
                bloodGroup: !!employeeData.bloodGroup
            });

            setSuccess(true);
            setTimeout(() => {
                setSuccess(false);
                if (shouldNavigate) {
                    if (onboarding) {
                        navigate('/dashboard');
                    } else {
                        setIsEditing(false);
                    }
                }
            }, 600);
            return savedEmployee;
        } catch (err: any) {
            console.error('Error saving employee data:', err);
            setError(err.message || 'Failed to save your information. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleDownload = (attachmentId: string, fileName: string) => {
        if (!attachmentId) return;
        const url = apiHelpers.attachmentRaw(attachmentId);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleDeleteDocument = async (attachmentId: string, fileName: string) => {
        setDeleteModal({ isOpen: true, attachmentId, fileName });
    };

    const confirmDeleteDocument = async () => {
        const { attachmentId } = deleteModal;
        if (!attachmentId || !employeeId) return;

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${api.employees}/${employeeId}/attachments/${attachmentId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Failed to delete document' }));
                throw new Error(errorData.message || 'Failed to delete document');
            }

            // Refresh data
            setRawEmployee((prev: any) => ({
                ...prev,
                attachments: prev.attachments.filter((att: any) => att._id !== attachmentId)
            }));

            setDeleteModal({ isOpen: false, attachmentId: null, fileName: null });
            setSuccess(true);
            setTimeout(() => setSuccess(false), 2000);
        } catch (err: any) {
            console.error('Error deleting document:', err);
            setError(err.message || 'Failed to delete document.');
            setDeleteModal({ isOpen: false, attachmentId: null, fileName: null });
        }
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
                    // Update local employee state so MyInfo page shows new avatar instantly
                    setRawEmployee(employee);

                    // Sync avatar with AuthContext so the header updates instantly too
                    const profilePics = employee.attachments?.filter((a: any) => a.fileType === 'Profile Picture') || [];
                    if (profilePics.length > 0) {
                        const latestPic = profilePics[profilePics.length - 1];
                        const token = localStorage.getItem('token');
                        const newAvatar = `${api.baseURL}/api/employees/attachments/raw/${latestPic._id}?token=${token}&t=${Date.now()}`;
                        login((prev: UserType | null) => prev ? { ...prev, avatar: newAvatar } : prev as any);
                        
                        // Also force component-level image refresh for MyInfo
                        setAvatarCache(`&t=${Date.now()}`);
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

    const allSteps = [
        { id: 1, title: 'Personal', icon: User },
        { id: 2, title: 'Contact & Dependents', icon: Users },
        { id: 3, title: 'Immigration', icon: Globe },
        { id: 4, title: 'Job & Status', icon: Briefcase, roleRestricted: true },
        { id: 5, title: 'History & Education', icon: GraduationCap },
        { id: 6, title: 'Skills & Profiles', icon: User },
        { id: 7, title: 'Finance', icon: CreditCard, roleRestricted: true },
        { id: 8, title: 'Documents', icon: FileText }
    ];

    const isAdmin = user?.role === 'admin' || user?.role === 'super-admin' || user?.role === 'manager';
    const canEditJob = user?.role === 'admin' || user?.role === 'super-admin';
    const disabledJobClass = !canEditJob ? 'bg-gray-50 cursor-not-allowed' : 'bg-white';
    const steps = allSteps.filter(s => !s.roleRestricted || isAdmin);

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

    const renderProfileView = () => {
        if (!rawEmployee) return null;

        const tabs = [
            { id: 'personal', label: 'Personal', icon: User },
            { id: 'contact', label: 'Contact', icon: Phone },
            { id: 'job', label: 'Job', icon: Briefcase },
            { id: 'finance', label: 'Finance', icon: CreditCard },
            { id: 'history', label: 'Employment History', icon: History },
            { id: 'education', label: 'Education', icon: GraduationCap },
            { id: 'dependents', label: 'Dependents', icon: Users },
            { id: 'documents', label: 'Documents', icon: FileText },
        ];

        const renderField = (label: string, value: any) => (
            <div key={label} className="space-y-1">
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</label>
                <p className="text-gray-800 font-medium">{value || '-'}</p>
            </div>
        );

        const formatDate = (dateString: string) => {
            if (!dateString) return '-';
            return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        };

        const getInitials = () => {
            const first = rawEmployee.firstName?.charAt(0) || '';
            const last = rawEmployee.lastName?.charAt(0) || '';
            return (first + last).toUpperCase() || '?';
        };

        let avatarUrl = getAvatarUrl(rawEmployee) || user?.avatar;
        if (avatarUrl && avatarCache) {
            avatarUrl += avatarUrl.includes('?') ? avatarCache : `?${avatarCache.substring(1)}`;
        }

        return (
            <div className="space-y-6 animate-fadeIn pb-10">
                {/* Header / Banner */}
                <div className="flex flex-col md:flex-row md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200/50 shadow-sm animate-slide-up">
                    <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200/50 relative group overflow-hidden">
                        {avatarUrl ? (
                            <img
                                key={avatarUrl}
                                src={avatarUrl}
                                alt="Avatar"
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                onError={(e: any) => {
                                    e.target.style.display = 'none';
                                    if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                                }}
                            />
                        ) : null}
                        <div className={`w-full h-full flex items-center justify-center font-bold text-2xl tracking-tighter ${avatarUrl ? 'hidden' : ''}`}>
                            {getInitials()}
                        </div>
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
                        <h1 className="text-2xl font-bold text-gray-800">
                            {rawEmployee.firstName} {rawEmployee.middleName ? `${rawEmployee.middleName} ` : ''}{rawEmployee.lastName}
                        </h1>
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
                            onClick={() => { setIsEditing(true); setStep(1); }}
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
                        <div className="space-y-10 animate-fadeIn">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-8 gap-x-12">
                                {renderField('Full Name', `${rawEmployee.firstName} ${rawEmployee.middleName || ''} ${rawEmployee.lastName}`)}
                                {renderField('Date of Birth', formatDate(rawEmployee.dateOfBirth))}
                                {renderField('Gender', rawEmployee.gender)}
                                {renderField('Marital Status', rawEmployee.maritalStatus)}
                                {renderField('Nationality', rawEmployee.nationality)}
                                {renderField('Father Name', rawEmployee.fatherName)}
                                {renderField('Blood Group', rawEmployee.bloodGroup)}
                                {renderField('CNIC / Govt ID', rawEmployee.cnic)}
                                {renderField('Religion', rawEmployee.religion)}
                                {renderField('License Number', rawEmployee.licenseNumber)}
                                {renderField('Work Email', rawEmployee.workEmail)}
                                {renderField('Other Email', rawEmployee.otherEmail)}
                                {renderField('SIM Number', rawEmployee.simNumber)}
                            </div>

                            {/* Skills Section */}
                            <div className="pt-8 border-t border-slate-100">
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                    Professional Skills
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                    {rawEmployee.skills?.length > 0 ? (
                                        rawEmployee.skills.map((skill: string, idx: number) => (
                                            <span key={idx} className="px-4 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl text-sm font-semibold border border-indigo-100/50 shadow-sm">
                                                {skill}
                                            </span>
                                        ))
                                    ) : <p className="text-gray-400 italic">No skills added yet</p>}
                                </div>
                            </div>

                            {/* Social Profiles */}
                            <div className="pt-8 border-t border-slate-100">
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                    <Globe size={16} /> Digital Presence
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    {rawEmployee.socialProfiles?.length > 0 ? (
                                        rawEmployee.socialProfiles.map((profile: any, idx: number) => (
                                            profile.link && (
                                                <a
                                                    key={idx}
                                                    href={profile.link?.startsWith('http') ? profile.link : `https://${profile.link}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200 hover:border-indigo-300 hover:bg-white transition-all group"
                                                >
                                                    <div className="p-2.5 bg-white rounded-xl group-hover:bg-indigo-50 text-slate-400 group-hover:text-indigo-600 border border-slate-100 transition-colors">
                                                        <Globe size={18} />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{profile.platform}</p>
                                                        <p className="text-sm font-bold text-slate-600 truncate">{profile.link.split('//')[1] || profile.link}</p>
                                                    </div>
                                                </a>
                                            )
                                        ))
                                    ) : <p className="text-gray-400 italic">No social profiles linked</p>}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Contact Tab */}
                    {activeTab === 'contact' && (
                        <div className="space-y-10 animate-fadeIn">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                {renderField('Personal Email', rawEmployee.email)}
                                {renderField('Phone', rawEmployee.phone)}
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                    <Globe size={16} /> Current Address
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                                    {renderField('Street', rawEmployee.address?.street)}
                                    {renderField('City', rawEmployee.address?.city)}
                                    {renderField('Country', rawEmployee.address?.country)}
                                </div>
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                    <Users size={16} /> Emergency Contacts
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {rawEmployee.emergencyContacts?.map((c: any) => (
                                        <div key={c._id || c.phone} className="p-5 bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 transition-colors group">
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
                                {renderField('Designation', rawEmployee.jobInfo?.designation)}
                                {renderField('Department', rawEmployee.jobInfo?.department)}
                                {renderField('Reporting Manager', rawEmployee.jobInfo?.reportingManager)}
                                {renderField('Joining Date', formatDate(rawEmployee.jobInfo?.joiningDate))}
                                {renderField('Work Location', rawEmployee.jobInfo?.workLocation)}
                                {renderField('Status', rawEmployee.employmentStatus?.status || rawEmployee.employmentStatus || '-')}
                                {rawEmployee.employmentStatus?.status === 'Probation' && (
                                    renderField('Probation End Date', formatDate(rawEmployee.employmentStatus?.probationEndDate))
                                )}
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

                    {/* Finance Tab */}
                    {activeTab === 'finance' && (
                        <div className="space-y-8 animate-fadeIn">
                            <div>
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6">Salary Structure</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {rawEmployee.salaryComponents?.length > 0 ? (
                                        rawEmployee.salaryComponents.map((comp: any, i: number) => (
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
                                    ) : <p className="text-gray-400 italic">No salary components recorded</p>}
                                    {rawEmployee.salaryComponents?.length > 0 && (
                                        <div className="p-4 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl border border-indigo-400 shadow-lg text-white">
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className="p-2 bg-white/20 rounded-lg">
                                                    <CreditCard size={16} />
                                                </div>
                                                <span className="text-xs font-bold text-indigo-100 uppercase">Gross Monthly</span>
                                            </div>
                                            <p className="text-sm font-bold opacity-90">Total Payable Salary</p>
                                            <p className="text-2xl font-black mt-1">
                                                {new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', currencyDisplay: 'code' }).format(
                                                    rawEmployee.salaryComponents.reduce((sum: number, c: any) => sum + (c.amount || 0), 0)
                                                ).replace('PKR', 'Rs.')}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="pt-8 border-t border-slate-100">
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6">Bank Account Details</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 bg-slate-50/50 p-6 rounded-3xl border border-slate-100">
                                    {renderField('Bank Name', rawEmployee.bankDetails?.bankName)}
                                    {renderField('Account Holder', rawEmployee.bankDetails?.accountName)}
                                    {renderField('Account Number', rawEmployee.bankDetails?.accountNumber)}
                                    {renderField('IBAN', rawEmployee.bankDetails?.iban)}
                                    {renderField('Swift Code', rawEmployee.bankDetails?.swiftCode)}
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
                                {rawEmployee.dependents?.map((dep: any) => (
                                    <div key={dep._id || dep.name} className="p-6 bg-white rounded-2xl border border-slate-200 flex items-center gap-4">
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
                                    {rawEmployee.attachments.map((file: any) => (
                                        <div key={file._id} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 transition-all">
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
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => handleDownload(file._id, file.fileName)}
                                                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition-all"
                                                    title="Download"
                                                >
                                                    <Download size={20} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteDocument(file._id, file.fileName)}
                                                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={20} />
                                                </button>
                                            </div>
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
                renderProfileView()
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
                            <p className="text-sm text-gray-500">
                                Step {steps.findIndex(s => s.id === step) + 1} of {steps.length}: {steps.find(s => s.id === step)?.title}
                            </p>
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
                                style={{ width: `${(steps.findIndex(s => s.id === step) / (steps.length - 1)) * 100}%` }}
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                            </div>
                        </div>

                        {steps.map((s) => {
                            const isCompleted = step > s.id;
                            const isCurrent = step === s.id;
                            return (
                                <div
                                    key={s.id}
                                    className="flex flex-col items-center relative z-10 cursor-pointer group"
                                    onClick={() => handleStepClick(s.id)}
                                >
                                    <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-500 shadow-md relative group-hover:shadow-lg group-hover:scale-105 active:scale-95 ${isCompleted
                                        ? 'bg-gradient-to-r from-emerald-500 to-green-500 text-white scale-110 ring-4 ring-emerald-200'
                                        : isCurrent
                                            ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white scale-110 ring-4 ring-indigo-200'
                                            : 'bg-slate-200 text-slate-500 scale-100 hover:bg-slate-300'
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

                        {stepErrors.length > 0 && (
                            <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl">
                                <p className="font-medium mb-2">Please fill all required fields in Step 1 (Personal) before continuing:</p>
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
                                <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-4">
                                    {['Profile Picture', 'Resume/CV', 'CNIC Front', 'CNIC Back'].map((label) => (
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
                                    <label className="block text-sm font-medium text-gray-600">CNIC / Govt ID *</label>
                                    <input
                                        type="text"
                                        name="cnic"
                                        value={formData.cnic || ''}
                                        onChange={handleChange}
                                        onBlur={(e) => handleFieldBlur('cnic', e.target.value)}
                                        placeholder="e.g. 12345-1234567-1"
                                        disabled={initialLockedFields.cnic && !canEditSensitiveData()}
                                        className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 bg-white transition-all ${fieldErrors.cnic ? 'border-red-400 focus:border-red-400 focus:ring-red-100' : 'border-gray-300 focus:border-primary-500 focus:ring-primary-200'} ${initialLockedFields.cnic && !canEditSensitiveData() ? 'bg-gray-50 cursor-not-allowed' : ''}`}
                                    />
                                    {fieldErrors.cnic && <p className="text-xs text-red-500 mt-1">{fieldErrors.cnic}</p>}
                                    {!fieldErrors.cnic && initialLockedFields.cnic && !canEditSensitiveData() && <p className="text-xs text-gray-500 mt-1">This field cannot be edited once filled</p>}
                                    {!fieldErrors.cnic && initialLockedFields.cnic && canEditSensitiveData() && <p className="text-xs text-indigo-500 mt-1">Admin: This field can be edited</p>}
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-600">Date of Birth *</label>
                                    <input
                                        type="date"
                                        name="dateOfBirth"
                                        value={formData.dateOfBirth}
                                        onChange={handleChange}
                                        disabled={initialLockedFields.dateOfBirth && !canEditSensitiveData()}
                                        className={`w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 bg-white transition-all ${initialLockedFields.dateOfBirth && !canEditSensitiveData() ? 'bg-gray-50 cursor-not-allowed' : ''}`}
                                    />
                                    {initialLockedFields.dateOfBirth && !canEditSensitiveData() && <p className="text-xs text-gray-500 mt-1">This field cannot be edited once filled</p>}
                                    {initialLockedFields.dateOfBirth && canEditSensitiveData() && <p className="text-xs text-indigo-500 mt-1">Admin: This field can be edited</p>}
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-600">Father Name *</label>
                                    <input
                                        type="text"
                                        name="fatherName"
                                        value={formData.fatherName}
                                        onChange={handleChange}
                                        disabled={initialLockedFields.fatherName && !canEditSensitiveData()}
                                        className={`w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 bg-white transition-all ${initialLockedFields.fatherName && !canEditSensitiveData() ? 'bg-gray-50 cursor-not-allowed' : ''}`}
                                    />
                                    {initialLockedFields.fatherName && !canEditSensitiveData() && <p className="text-xs text-gray-500 mt-1">This field cannot be edited once filled</p>}
                                    {initialLockedFields.fatherName && canEditSensitiveData() && <p className="text-xs text-indigo-500 mt-1">Admin: This field can be edited</p>}
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-600">Nationality *</label>
                                    <input
                                        type="text"
                                        name="nationality"
                                        value={formData.nationality}
                                        onChange={handleChange}
                                        disabled={initialLockedFields.nationality && !canEditSensitiveData()}
                                        className={`w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 bg-white transition-all ${initialLockedFields.nationality && !canEditSensitiveData() ? 'bg-gray-50 cursor-not-allowed' : ''}`}
                                    />
                                    {initialLockedFields.nationality && !canEditSensitiveData() && <p className="text-xs text-gray-500 mt-1">This field cannot be edited once filled</p>}
                                    {initialLockedFields.nationality && canEditSensitiveData() && <p className="text-xs text-indigo-500 mt-1">Admin: This field can be edited</p>}
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-600">Blood Group</label>
                                    {initialLockedFields.bloodGroup && !canEditSensitiveData() ? (
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
                                    {initialLockedFields.bloodGroup && !canEditSensitiveData() && <p className="text-xs text-gray-500 mt-1">This field cannot be edited once filled</p>}
                                    {initialLockedFields.bloodGroup && canEditSensitiveData() && <p className="text-xs text-indigo-500 mt-1">Admin: This field can be edited</p>}
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-600">Religion *</label>
                                    <input type="text" name="religion" value={formData.religion} onChange={handleChange} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 bg-white transition-all" />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-600">License Number</label>
                                    <input type="text" name="licenseNumber" value={formData.licenseNumber} onChange={handleChange} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 bg-white transition-all" />
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
                            <div className="space-y-8 animate-slide-up pb-20">
                                <div>
                                    <h3 className="text-lg font-medium text-gray-700 mb-4">Contact Info</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="block text-sm font-medium text-gray-600">Personal Email</label>
                                            <input type="email" name="email" value={formData.email} onChange={handleChange} onBlur={(e) => handleFieldBlur('email', e.target.value)} className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 bg-white transition-all ${fieldErrors.email ? 'border-red-400 focus:border-red-400 focus:ring-red-100' : 'border-gray-300 focus:border-primary-500 focus:ring-primary-200'}`} />
                                            {fieldErrors.email && <p className="text-xs text-red-500 mt-1">{fieldErrors.email}</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <label className="block text-sm font-medium text-gray-600">Work Email</label>
                                            <input type="email" name="workEmail" value={formData.workEmail} onChange={handleChange} onBlur={(e) => handleFieldBlur('workEmail', e.target.value)} className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 bg-white transition-all ${fieldErrors.workEmail ? 'border-red-400 focus:border-red-400 focus:ring-red-100' : 'border-gray-300 focus:border-primary-500 focus:ring-primary-200'}`} />
                                            {fieldErrors.workEmail && <p className="text-xs text-red-500 mt-1">{fieldErrors.workEmail}</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <label className="block text-sm font-medium text-gray-600">Other Email</label>
                                            <input type="email" name="otherEmail" value={formData.otherEmail} onChange={handleChange} onBlur={(e) => handleFieldBlur('otherEmail', e.target.value)} className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 bg-white transition-all ${fieldErrors.otherEmail ? 'border-red-400 focus:border-red-400 focus:ring-red-100' : 'border-gray-300 focus:border-primary-500 focus:ring-primary-200'}`} />
                                            {fieldErrors.otherEmail && <p className="text-xs text-red-500 mt-1">{fieldErrors.otherEmail}</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <label className="block text-sm font-medium text-gray-600">Personal Phone</label>
                                            <input type="text" name="phone" value={formData.phone} onChange={handleChange} onBlur={(e) => handleFieldBlur('phone', e.target.value)} placeholder="e.g. +92 300 1234567" className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 bg-white transition-all ${fieldErrors.phone ? 'border-red-400 focus:border-red-400 focus:ring-red-100' : 'border-gray-300 focus:border-primary-500 focus:ring-primary-200'}`} />
                                            {fieldErrors.phone && <p className="text-xs text-red-500 mt-1">{fieldErrors.phone}</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <label className="block text-sm font-medium text-gray-600">Company SIM Number</label>
                                            <input type="text" name="simNumber" value={formData.simNumber} onChange={handleChange} onBlur={(e) => handleFieldBlur('simNumber', e.target.value)} placeholder="e.g. +92 301 9876543" className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 bg-white transition-all ${fieldErrors.simNumber ? 'border-red-400 focus:border-red-400 focus:ring-red-100' : 'border-gray-300 focus:border-primary-500 focus:ring-primary-200'}`} />
                                            {fieldErrors.simNumber && <p className="text-xs text-red-500 mt-1">{fieldErrors.simNumber}</p>}
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-lg font-medium text-gray-700 mb-4">Address</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        <input type="text" name="street" placeholder="Street" value={formData.address.street} onChange={(e) => handleChange(e, 'address')} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 bg-white transition-all" />
                                        <input type="text" name="city" placeholder="City" value={formData.address.city} onChange={(e) => handleChange(e, 'address')} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 bg-white transition-all" />
                                        <input type="text" name="state" placeholder="State / Province" value={formData.address.state} onChange={(e) => handleChange(e, 'address')} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 bg-white transition-all" />
                                        <input type="text" name="zipCode" placeholder="Zip / Postal Code" value={formData.address.zipCode} onChange={(e) => handleChange(e, 'address')} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 bg-white transition-all" />
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
                                                <div>
                                                    <input type="tel" placeholder="e.g. +92 300 1234567" value={contact.phone} onChange={(e) => handleChange(e, 'emergencyContacts', idx, 'phone')} onBlur={(e) => { const err = validateField('phone', e.target.value); setFieldErrors(prev => ({ ...prev, [`ec_phone_${idx}`]: err })); }} className={`border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none transition-all w-full ${fieldErrors[`ec_phone_${idx}`] ? 'border-red-400 focus:ring-red-100' : 'border-gray-300 focus:ring-indigo-200 focus:border-indigo-400'}`} />
                                                    {fieldErrors[`ec_phone_${idx}`] && <p className="text-xs text-red-500 mt-1">{fieldErrors[`ec_phone_${idx}`]}</p>}
                                                </div>
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

                        {/* Step 4: Job & Status (Read-only for employees, editable for admins) */}
                        {step === 4 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-slide-up pb-20">
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-600">Designation</label>
                                    <input
                                        type="text"
                                        name="designation"
                                        value={formData.jobInfo.designation}
                                        onChange={(e) => setFormData(prev => ({ ...prev, jobInfo: { ...prev.jobInfo, designation: e.target.value } }))}
                                        disabled={!canEditJob}
                                        className={`w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all ${disabledJobClass}`}
                                        placeholder="e.g. Software Engineer"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-600">Department</label>
                                    <input
                                        type="text"
                                        name="department"
                                        value={formData.jobInfo.department}
                                        onChange={(e) => setFormData(prev => ({ ...prev, jobInfo: { ...prev.jobInfo, department: e.target.value } }))}
                                        disabled={!canEditJob}
                                        className={`w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all ${disabledJobClass}`}
                                        placeholder="e.g. IT"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-600">Reporting Manager</label>
                                    <input
                                        type="text"
                                        name="reportingManager"
                                        value={formData.jobInfo.reportingManager}
                                        onChange={(e) => setFormData(prev => ({ ...prev, jobInfo: { ...prev.jobInfo, reportingManager: e.target.value } }))}
                                        disabled={!canEditJob}
                                        className={`w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all ${disabledJobClass}`}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-600">Work Location</label>
                                    <input
                                        type="text"
                                        name="workLocation"
                                        value={formData.jobInfo.workLocation}
                                        onChange={(e) => setFormData(prev => ({ ...prev, jobInfo: { ...prev.jobInfo, workLocation: e.target.value } }))}
                                        disabled={!canEditJob}
                                        className={`w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all ${disabledJobClass}`}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-600">Joining Date</label>
                                    <input
                                        type="date"
                                        name="joiningDate"
                                        value={formData.jobInfo.joiningDate}
                                        onChange={(e) => setFormData(prev => ({ ...prev, jobInfo: { ...prev.jobInfo, joiningDate: e.target.value } }))}
                                        disabled={!canEditJob}
                                        className={`w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all ${disabledJobClass}`}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-600">Status</label>
                                    <select
                                        value={formData.employmentStatus.status}
                                        onChange={(e) => setFormData(prev => ({ ...prev, employmentStatus: { ...prev.employmentStatus, status: e.target.value } }))}
                                        disabled={!canEditJob}
                                        className={`w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all ${disabledJobClass}`}
                                    >
                                        <option value="Probation">Probation</option>
                                        <option value="Permanent">Permanent</option>
                                        <option value="Internship">Internship</option>
                                        <option value="Contract">Contract</option>
                                        <option value="Terminated">Terminated</option>
                                        <option value="Resigned">Resigned</option>
                                    </select>
                                </div>
                                {formData.employmentStatus.status === 'Probation' && (
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-gray-600">Probation End Date</label>
                                        <input
                                            type="date"
                                            value={formData.employmentStatus.probationEndDate}
                                            onChange={(e) => setFormData(prev => ({ ...prev, employmentStatus: { ...prev.employmentStatus, probationEndDate: e.target.value } }))}
                                            disabled={!canEditJob}
                                            className={`w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all ${disabledJobClass}`}
                                        />
                                    </div>
                                )}
                                <div className="md:col-span-2 p-4 bg-indigo-50 border border-indigo-100 rounded-xl flex items-start gap-3 mt-4">
                                    <Shield size={20} className="text-indigo-600 mt-0.5" />
                                    <p className="text-sm text-indigo-700">
                                        {canEditJob
                                            ? 'Admin: You have permission to edit Job & Status information.'
                                            : 'Note: Job and Status information can only be updated by the HR Department or an Administrator. Please contact HR if you believe this information is incorrect.'}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Step 5: History & Education */}
                        {step === 5 && (
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
                                                        setFormData(p => ({ ...p, education: p.education.filter((_, i) => i !== idx) }));
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
                                                <div className="md:col-span-2 space-y-1 mt-2 pt-2 border-t border-gray-50">
                                                    <div className="flex items-center gap-2">
                                                        <label className="flex items-center gap-2 cursor-pointer px-3 py-1.5 border border-dashed border-gray-300 rounded-lg bg-gray-50 hover:bg-white text-gray-600 transition-all text-xs w-full">
                                                            <Upload size={14} />
                                                            <span className="truncate flex-1">
                                                                {formData.files.some(f => f.type === `Degree - ${edu.level || idx}`)
                                                                    ? formData.files.find(f => f.type === `Degree - ${edu.level || idx}`)?.file.name
                                                                    : 'Upload Degree/Certificate (PDF, Image)'}
                                                            </span>
                                                            <input
                                                                type="file"
                                                                accept=".pdf,.jpg,.jpeg,.png"
                                                                className="hidden"
                                                                onChange={(e) => {
                                                                    if (e.target.files && e.target.files.length > 0) {
                                                                        const typeKey = `Degree - ${edu.level || idx}`;
                                                                        setFormData(prev => ({
                                                                            ...prev,
                                                                            files: [...prev.files.filter(f => f.type !== typeKey), { file: e.target.files![0], type: typeKey }]
                                                                        }));
                                                                    }
                                                                }}
                                                            />
                                                        </label>
                                                        {formData.files.some(f => f.type === `Degree - ${edu.level || idx}`) && (
                                                            <button
                                                                onClick={() => setFormData(p => ({ ...p, files: p.files.filter(f => f.type !== `Degree - ${edu.level || idx}`) }))}
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

                        {/* Step 6: Skills & Social Profiles */}
                        {step === 6 && (
                            <div className="space-y-8 animate-slide-up pb-20">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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
                                                        type="text"
                                                        placeholder={`${profile.platform} username or URL`}
                                                        value={profile.link}
                                                        onChange={(e) => {
                                                            const newProfiles = [...formData.socialProfiles];
                                                            newProfiles[idx].link = e.target.value;
                                                            setFormData(p => ({ ...p, socialProfiles: newProfiles }));
                                                        }}
                                                        onBlur={(e) => {
                                                            let val = e.target.value.trim();
                                                            if (!val) return;
                                                            
                                                            const platform = profile.platform.toLowerCase();
                                                            
                                                            // Auto-guess username to full url
                                                            if (!val.includes('.') && !val.includes('/')) {
                                                                if (platform === 'linkedin') val = `https://linkedin.com/in/${val}`;
                                                                else if (platform === 'github') val = `https://github.com/${val}`;
                                                                else val = `https://${val}.com`;
                                                            } 
                                                            else if (!val.startsWith('http')) {
                                                                val = `https://${val}`;
                                                            }
                                                            
                                                            // Strict context validation
                                                            if (platform === 'linkedin' && !val.includes('linkedin.com')) {
                                                                alert('Please provide a valid LinkedIn link or username.');
                                                                val = '';
                                                            } else if (platform === 'github' && !val.includes('github.com')) {
                                                                alert('Please provide a valid GitHub link or username.');
                                                                val = '';
                                                            }
                                                            
                                                            const newProfiles = [...formData.socialProfiles];
                                                            newProfiles[idx].link = val;
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
                        )}

                        {/* Step 7: Finance */}
                        {step === 7 && (
                            <div className="space-y-8 animate-slide-up pb-20">
                                {/* Salary Structure */}
                                {isAdmin && (
                                    <div>
                                        <div className="flex justify-between items-end mb-6">
                                            <div>
                                                <h3 className="text-lg font-medium text-gray-700">Salary Structure</h3>
                                                <p className="text-sm text-gray-500">Define the monthly salary breakdown</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Total Monthly (Gross)</p>
                                                <p className="text-2xl font-bold text-indigo-600">
                                                    {new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(
                                                        formData.salaryComponents.reduce((sum, c) => sum + (c.amount || 0), 0)
                                                    )}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
                                            {formData.salaryComponents.map((comp, idx) => {
                                                const commonOptions = ["Basic Salary", "Medical Allowance", "HRA", "Conveyance Allowance", "Fuel Allowance", "Bonus", "Special Allowance", "Utilities"];
                                                const showCustomInput = !commonOptions.includes(comp.component) && comp.component !== '';
                                                
                                                return (
                                                    <div key={idx} className="space-y-3 relative group bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
                                                        <div className="flex justify-between items-center">
                                                            <div className="flex-1 space-y-2">
                                                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Component Type</label>
                                                                <select
                                                                    value={commonOptions.includes(comp.component) ? comp.component : (comp.component === '' ? '' : 'Other')}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value;
                                                                        const newComps = [...formData.salaryComponents];
                                                                        newComps[idx].component = val === 'Other' ? '' : val;
                                                                        setFormData(p => ({ ...p, salaryComponents: newComps }));
                                                                    }}
                                                                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-100 outline-none bg-slate-50/50 font-medium text-slate-700"
                                                                >
                                                                    <option value="">Select Component</option>
                                                                    {commonOptions.map(opt => (
                                                                        <option key={opt} value={opt}>{opt}</option>
                                                                    ))}
                                                                    <option value="Other">Other (Custom Naming)</option>
                                                                </select>
                                                            </div>
                                                            <div className="pt-6 pl-2">
                                                                <button
                                                                    onClick={() => setFormData(p => ({
                                                                        ...p,
                                                                        salaryComponents: p.salaryComponents.filter((_, i) => i !== idx)
                                                                    }))}
                                                                    className="text-slate-300 hover:text-red-500 transition-colors p-2 hover:bg-red-50 rounded-lg"
                                                                    title="Remove Component"
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {(showCustomInput || (comp.component === '' && !commonOptions.includes(comp.component))) && (
                                                            <div className="space-y-1 animate-fadeIn">
                                                                <label className="text-[10px] font-bold text-indigo-400 uppercase">Custom Name</label>
                                                                <input
                                                                    type="text"
                                                                    value={comp.component}
                                                                    onChange={(e) => {
                                                                        const newComps = [...formData.salaryComponents];
                                                                        newComps[idx].component = e.target.value;
                                                                        setFormData(p => ({ ...p, salaryComponents: newComps }));
                                                                    }}
                                                                    className="w-full border-b border-indigo-100 focus:border-indigo-400 px-0 py-1 text-sm outline-none bg-transparent placeholder:text-slate-300 font-medium"
                                                                    placeholder="e.g. Fuel Allowance"
                                                                />
                                                            </div>
                                                        )}

                                                        <div className="space-y-2">
                                                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Amount (Monthly)</label>
                                                            <div className="relative">
                                                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-300">PKR</div>
                                                                <input
                                                                    type="number"
                                                                    value={comp.amount || ''}
                                                                    onChange={(e) => {
                                                                        const newComps = [...formData.salaryComponents];
                                                                        newComps[idx].amount = Number(e.target.value);
                                                                        setFormData(p => ({ ...p, salaryComponents: newComps }));
                                                                    }}
                                                                    className="w-full border-none bg-slate-50 rounded-xl pl-12 pr-4 py-3 text-lg font-black text-slate-700 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all shadow-inner"
                                                                    placeholder="0"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            
                                            <button
                                                onClick={() => setFormData(p => ({
                                                    ...p,
                                                    salaryComponents: [...p.salaryComponents, { component: 'Other Allowance', amount: 0, type: 'fixed' }]
                                                }))}
                                                className="md:col-span-2 py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:text-indigo-500 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all text-sm font-medium flex items-center justify-center gap-2"
                                            >
                                                <Plus size={16} />
                                                Add Other Component
                                            </button>
                                        </div>
                                    </div>
                                )}

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
                                                onBlur={(e) => handleFieldBlur('accountNumber', e.target.value)}
                                                className={`w-full border rounded-lg px-4 py-2 text-sm focus:ring-2 outline-none transition-all ${fieldErrors.accountNumber ? 'border-red-400 focus:ring-red-100' : 'border-gray-300 focus:ring-indigo-200'}`}
                                            />
                                            {fieldErrors.accountNumber && <p className="text-xs text-red-500 mt-1">{fieldErrors.accountNumber}</p>}
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-medium text-gray-500">IBAN</label>
                                            <input
                                                type="text"
                                                placeholder="e.g. PK36SCBL0000001123456702"
                                                value={formData.bankDetails.iban}
                                                onChange={(e) => setFormData(p => ({ ...p, bankDetails: { ...p.bankDetails, iban: e.target.value } }))}
                                                onBlur={(e) => handleFieldBlur('iban', e.target.value)}
                                                className={`w-full border rounded-lg px-4 py-2 text-sm focus:ring-2 outline-none transition-all ${fieldErrors.iban ? 'border-red-400 focus:ring-red-100' : 'border-gray-300 focus:ring-indigo-200'}`}
                                            />
                                            {fieldErrors.iban && <p className="text-xs text-red-500 mt-1">{fieldErrors.iban}</p>}
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-medium text-gray-500">Swift Code (BIC)</label>
                                            <input
                                                type="text"
                                                placeholder="e.g. SCBLPKKA"
                                                value={formData.bankDetails.swiftCode}
                                                onChange={(e) => setFormData(p => ({ ...p, bankDetails: { ...p.bankDetails, swiftCode: e.target.value } }))}
                                                onBlur={(e) => handleFieldBlur('swiftCode', e.target.value)}
                                                className={`w-full border rounded-lg px-4 py-2 text-sm focus:ring-2 outline-none transition-all ${fieldErrors.swiftCode ? 'border-red-400 focus:ring-red-100' : 'border-gray-300 focus:ring-indigo-200'}`}
                                            />
                                            {fieldErrors.swiftCode && <p className="text-xs text-red-500 mt-1">{fieldErrors.swiftCode}</p>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 8: Documents */}
                        {step === 8 && (
                            <div className="animate-slide-up pb-20">
                                <div>
                                    <h3 className="text-lg font-medium text-gray-700 mb-6">Documents & Attachments</h3>
                                    
                                    {/* Existing Documents From Server */}
                                    {rawEmployee?.attachments?.length > 0 && (
                                        <div className="mb-12">
                                            <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Your Documents</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {rawEmployee.attachments.map((file: any, i: number) => (
                                                    <div key={i} className="flex justify-between items-center bg-white p-4 rounded-2xl border border-gray-100 shadow-sm group hover:border-indigo-200 transition-all">
                                                        <div className="flex items-center gap-3 overflow-hidden">
                                                            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                                                                <FileText size={20} />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="text-sm font-bold text-gray-700 truncate">{file.fileName}</p>
                                                                <div className="flex items-center gap-2">
                                                                    <p className="text-[10px] font-bold text-gray-400 uppercase">{file.fileType}</p>
                                                                    {file.status === 'approved' && <span className="text-[10px] text-emerald-600 font-bold px-1.5 bg-emerald-50 rounded italic">Approved</span>}
                                                                    {file.status === 'pending' && <span className="text-[10px] text-amber-600 font-bold px-1.5 bg-amber-50 rounded italic">Pending Review</span>}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <a 
                                                            href={apiHelpers.attachmentRaw(file._id)} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer"
                                                            className="p-2 text-gray-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                                            title="Download"
                                                        >
                                                            <Download size={18} />
                                                        </a>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Upload Grid */}
                                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Upload New Documents</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {['Contract', 'Certificates', 'Degree', 'Other Documents'].map((label) => (
                                            <div key={label} className="border border-dashed border-gray-300 rounded-2xl p-6 flex flex-col items-center justify-center bg-gray-50/50 hover:bg-white hover:border-indigo-400 hover:shadow-xl hover:shadow-indigo-50 transition-all relative group cursor-pointer">
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
                                                <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center mb-4 text-indigo-500 group-hover:scale-110 group-hover:rotate-3 transition-all">
                                                    <Upload size={28} />
                                                </div>
                                                <span className="text-sm font-bold text-gray-700">{label}</span>
                                                
                                                {formData.files.some(f => f.type === label) ? (
                                                    <div className="mt-3 flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-[10px] font-bold max-w-full">
                                                        <Check size={12} />
                                                        <span className="truncate">{formData.files.find(f => f.type === label)?.file.name}</span>
                                                        <button 
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                setFormData(p => ({ ...p, files: p.files.filter(f => f.type !== label) }));
                                                            }}
                                                            className="hover:text-red-500"
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2">Click to upload</span>
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
                                disabled={step === 1 || saving}
                                className={`px-6 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2 ${step === 1 || saving
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                            >
                                <ChevronLeft size={16} /> Previous
                            </button>

                            <div className="flex gap-3">
                                {step !== steps[0].id && step !== steps[steps.length - 1].id && formData.firstName && formData.lastName && (
                                    <button
                                        onClick={() => handleSubmit(false)}
                                        disabled={saving}
                                        className="px-6 py-2.5 rounded-lg border border-indigo-200 text-indigo-700 font-medium hover:bg-indigo-50 transition-all flex items-center gap-2"
                                    >
                                        <Save size={16} /> Save Progress
                                    </button>
                                )}

                                {step !== steps[steps.length - 1].id ? (
                                    <button
                                        onClick={handleNext}
                                        disabled={saving || (step === 1 && !isStep1RequiredValid())}
                                        className={`px-8 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2 shadow-sm ${
                                            saving
                                                ? 'bg-indigo-400 text-white cursor-wait'
                                                : step === 1 && !isStep1RequiredValid()
                                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                                    : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white hover:shadow-md'
                                        }`}
                                    >
                                        {saving ? (
                                            <>
                                                Saving... <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                            </>
                                        ) : (
                                            <>Save & Next <ChevronRight size={16} /></>
                                        )}
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => handleSubmit()}
                                        disabled={saving || !isStep1RequiredValid()}
                                        className={`px-8 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2 shadow-sm ${saving || !isStep1RequiredValid() ? 'opacity-50 cursor-not-allowed bg-gray-300 text-gray-500' : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white hover:shadow-md'}`}
                                    >
                                        <Save size={18} /> {saving ? 'Saving...' : 'Save Information'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Delete Confirmation Modal */}
            {deleteModal.isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden animate-scaleIn border border-white/20">
                        <div className="p-8 text-center">
                            <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                                <AlertCircle size={40} />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-800 mb-2">Are you sure?</h3>
                            <p className="text-gray-500 leading-relaxed mb-8">
                                You are about to delete <span className="font-semibold text-gray-700 italic">"{deleteModal.fileName}"</span>. This action cannot be undone.
                            </p>
                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={confirmDeleteDocument}
                                    className="w-full py-4 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-2xl font-bold shadow-lg shadow-red-200 hover:shadow-xl hover:shadow-red-300 transition-all active:scale-95"
                                >
                                    Yes, Delete Document
                                </button>
                                <button
                                    onClick={() => setDeleteModal({ isOpen: false, attachmentId: null, fileName: null })}
                                    className="w-full py-4 bg-slate-50 text-slate-600 border border-slate-200 rounded-2xl font-bold hover:bg-slate-100 transition-all active:scale-95"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MyInfo;
