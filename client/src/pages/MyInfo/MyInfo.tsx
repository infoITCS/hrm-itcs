import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Save, Upload, Check, X, User, FileText, Trash2, Globe, Users, GraduationCap, Edit2, Shield, Phone, Briefcase, Download, AlertCircle, History, Camera, CreditCard, Banknote, DollarSign, Plus, Eye, Navigation, Cloud, Lock } from 'lucide-react';
import CustomSelect from '../../components/UI/CustomSelect';
import AddressForm from '../../components/UI/AddressForm';
import RelationSelect from '../../components/UI/RelationSelect';
import SalaryPinModal from '../../components/UI/SalaryPinModal';
import countriesData from '../../data/countries.json';
import api, { api as apiHelpers } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import { getAvatarUrl } from '../../utils/avatar';
import type { User as UserType } from '../../types';
import { formatEmployeeFullName } from '../../utils/nameHelper';

const DocumentPreview = ({
    typeKey,
    existingFile,
    localFile,
    onRemove,
    onPreview,
    inputId
}: {
    typeKey: string;
    existingFile?: any;
    localFile?: File;
    onRemove: () => void;
    onPreview: (url: string, name: string, type: string) => void;
    inputId?: string;
}) => {
    const [localUrl, setLocalUrl] = useState<string | null>(null);

    useEffect(() => {
        if (localFile) {
            const url = URL.createObjectURL(localFile);
            setLocalUrl(url);
            return () => {
                URL.revokeObjectURL(url);
            };
        } else {
            setLocalUrl(null);
        }
    }, [localFile]);

    const url = localFile ? localUrl : (existingFile ? apiHelpers.attachmentRaw(existingFile._id) : null);
    if (!url) return null;

    const fileName = localFile ? localFile.name : existingFile.fileName;
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(extension);
    const isPdf = extension === 'pdf';

    return (
        <div data-typekey={typeKey} className="w-full bg-white border border-slate-200/80 rounded-xl p-3 shadow-sm flex flex-col gap-3 group relative transition-all duration-300 hover:shadow-md hover:border-indigo-200 animate-fade-in z-10 text-left">
            {/* Thumbnail */}
            <div 
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onPreview(url, fileName, extension);
                }}
                className="w-full h-24 bg-slate-50 border border-slate-100 rounded-lg overflow-hidden flex items-center justify-center relative cursor-pointer"
            >
                {isImage ? (
                    <img src={url} alt={fileName} className="w-full h-full object-cover group-hover:scale-105 transition-all duration-300" />
                ) : isPdf ? (
                    <div className="flex flex-col items-center gap-1 text-rose-500 font-medium">
                        <FileText size={24} />
                        <span className="text-[9px] uppercase font-bold tracking-wider text-rose-500">PDF</span>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-1 text-slate-400 font-medium">
                        <FileText size={24} />
                        <span className="text-[9px] uppercase font-bold tracking-wider text-slate-400">File</span>
                    </div>
                )}
                <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-white text-[10px] font-bold flex items-center gap-1 bg-slate-950/30 px-2.5 py-1 rounded-full backdrop-blur-sm">
                        <Eye size={12} /> Preview
                    </span>
                </div>
            </div>

            {/* Info / Title */}
            <div className="min-w-0">
                <p className="text-[11px] font-bold text-slate-700 truncate" title={fileName}>{fileName}</p>
                <div className="flex items-center gap-1 mt-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${localFile ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">
                        {localFile ? 'Staged Draft' : 'Saved Server'}
                    </span>
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] font-bold mt-auto gap-2">
                {inputId ? (
                    <label 
                        htmlFor={inputId}
                        className="flex-1 text-center cursor-pointer text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100/80 px-2 py-1 rounded transition-colors"
                    >
                        Change
                    </label>
                ) : null}
                <button
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onRemove();
                    }}
                    className={`text-center text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100/80 px-2 py-1 rounded transition-colors ${inputId ? 'flex-1' : 'w-full'}`}
                >
                    Delete
                </button>
            </div>
        </div>
    );
};

const MyInfo = () => {
    const navigate = useNavigate();
    const { user, login } = useAuth();
    const { showToast } = useToast();
    const { canEditSensitiveData } = usePermissions();
    const [loading, setLoading] = useState(true);
    const [avatarCache, setAvatarCache] = useState<string>('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [employeeId, setEmployeeId] = useState<string | null>(null);


    const [rawEmployee, setRawEmployee] = useState<any>(null);
    const [completedSteps, setCompletedSteps] = useState<number[]>([]);
    const [showCompletion, setShowCompletion] = useState<number | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [activeTab, setActiveTab] = useState('personal');
    const [isSalaryUnlocked, setIsSalaryUnlocked] = useState(false);
    const [showSalaryPinModal, setShowSalaryPinModal] = useState(false);
    const [salaryPlanType, setSalaryPlanType] = useState<'direct' | 'probation'>('direct');
    const salaryLockTimerRef = useRef<any>(null);

    const handleSalaryUnlockSuccess = () => {
        setIsSalaryUnlocked(true);
        if (salaryLockTimerRef.current) clearTimeout(salaryLockTimerRef.current);
        salaryLockTimerRef.current = setTimeout(() => {
            setIsSalaryUnlocked(false);
        }, 5 * 60 * 1000); // 5 minutes auto-lock
    };

    useEffect(() => {
        return () => {
            if (salaryLockTimerRef.current) clearTimeout(salaryLockTimerRef.current);
        };
    }, []);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [avatarImgError, setAvatarImgError] = useState(false);
    const [localAvatarPreview, setLocalAvatarPreview] = useState<string | null>(null);
    const [initialLockedFields, setInitialLockedFields] = useState<{ [key: string]: boolean }>({});
    const [stepErrors, setStepErrors] = useState<string[]>([]);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; attachmentId: string | null; fileName: string | null }>({
        isOpen: false,
        attachmentId: null,
        fileName: null
    });
    const [limitModalOpen, setLimitModalOpen] = useState(false);
    const [duplicateError, setDuplicateError] = useState<{ field: string; message: string } | null>(null);
    const [lightboxFile, setLightboxFile] = useState<{
        url: string;
        fileName: string;
        fileType: string;
    } | null>(null);
    const [departments, setDepartments] = useState<string[]>([]);
    const [designations, setDesignations] = useState<string[]>([]);
    const [salaryComponentOptions, setSalaryComponentOptions] = useState<string[]>([
        "Basic Salary", "Medical Allowance", "HRA", "Conveyance Allowance", "Fuel Allowance", "Bonus", "Special Allowance", "Utilities"
    ]);
    const [employeesList, setEmployeesList] = useState<{ value: string; label: string }[]>([]);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const token = localStorage.getItem('token');
                const [deptRes, desigRes, salaryCompRes, empRes] = await Promise.all([
                    fetch(`${api.baseURL}/api/config/departments`, { headers: { 'Authorization': `Bearer ${token}` } }),
                    fetch(`${api.baseURL}/api/config/designations`, { headers: { 'Authorization': `Bearer ${token}` } }),
                    fetch(`${api.baseURL}/api/config/salary-components?activeOnly=true&type=earning`, { headers: { 'Authorization': `Bearer ${token}` } }),
                    fetch(`${api.baseURL}/api/employees`, { headers: { 'Authorization': `Bearer ${token}` } })
                ]);
                
                if (deptRes.ok) {
                    const data = await deptRes.json();
                    setDepartments(data.filter((d: any) => d.isActive).map((d: any) => d.name));
                }
                if (desigRes.ok) {
                    const data = await desigRes.json();
                    setDesignations(data.filter((d: any) => d.isActive).map((d: any) => d.name));
                }
                if (salaryCompRes.ok) {
                    const data = await salaryCompRes.json();
                    if (Array.isArray(data) && data.length > 0) {
                        setSalaryComponentOptions(data.map((c: any) => c.name));
                    }
                }
                if (empRes.ok) {
                    const data = await empRes.json();
                    const empArray = Array.isArray(data) ? data : (data.employees || []);
                    setEmployeesList(empArray.map((emp: any) => ({
                        value: emp.employeeId,
                        label: `${formatEmployeeFullName(emp, emp.employeeId)} (${emp.employeeId})`
                    })));
                }
            } catch (err) {
                console.error('Failed to fetch configuration data:', err);
            }
        };
        fetchConfig();
    }, []);

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

    const checkDuplicateData = async (name: string, value: string) => {
        if (name !== 'cnic' && name !== 'email') return;
        if (!value || validateField(name, value)) return; 

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(api.checkDuplicate(name === 'cnic' ? value : undefined, name === 'email' ? value : undefined, employeeId || undefined), {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.isDuplicate) {
                    setDuplicateError({ field: name, message: data.message });
                } else {
                    if (duplicateError?.field === name) setDuplicateError(null);
                }
            }
        } catch (err) {
            console.error('Check duplicate error:', err);
        }
    };

    const handleFieldBlur = (name: string, value: string) => {
        const err = validateField(name, value);
        setFieldErrors(prev => ({ ...prev, [name]: err }));
        checkDuplicateData(name, value);
    };

    const hasFetched = useRef(false);
    const searchParams = new URLSearchParams(window.location.search);
    const onboarding = searchParams.get('onboarding') === 'true';
    const targetStep = parseInt(searchParams.get('step') || '1', 10);

    const [step, setStep] = useState<number>(targetStep);
    const [isSameAddress, setIsSameAddress] = useState(false);
    
    // Required fields on step 1 – must be filled before Next/Save (for employee, manager, admin)
    const isStep1RequiredValid = () => {
        const hasProfilePicture = rawEmployee?.attachments?.some((a: any) => a.fileType === 'Profile Picture') || formData.files.some(f => f.type === 'Profile Picture') || !!localAvatarPreview;
        const hasCNICFront = rawEmployee?.attachments?.some((a: any) => a.fileType === 'CNIC Front') || formData.files.some(f => f.type === 'CNIC Front');
        const hasCNICBack = rawEmployee?.attachments?.some((a: any) => a.fileType === 'CNIC Back') || formData.files.some(f => f.type === 'CNIC Back');

        const hasCoreFields = !!(
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

        // Files are only rigidly required upon First Time creation, not during future edits
        if (!employeeId) {
            return hasCoreFields && hasProfilePicture && hasCNICFront && hasCNICBack;
        }

        return hasCoreFields;
    };

    const getStep1RequiredErrors = (): string[] => {
        const err: string[] = [];
        const hasProfilePicture = rawEmployee?.attachments?.some((a: any) => a.fileType === 'Profile Picture') || formData.files.some(f => f.type === 'Profile Picture') || !!localAvatarPreview;
        const hasCNICFront = rawEmployee?.attachments?.some((a: any) => a.fileType === 'CNIC Front') || formData.files.some(f => f.type === 'CNIC Front');
        const hasCNICBack = rawEmployee?.attachments?.some((a: any) => a.fileType === 'CNIC Back') || formData.files.some(f => f.type === 'CNIC Back');

        if (!formData.firstName?.trim()) err.push('First Name');
        if (!formData.lastName?.trim()) err.push('Last Name');
        if (!formData.cnic?.trim()) err.push('CNIC / Govt ID');
        if (!formData.dateOfBirth) err.push('Date of Birth');
        if (!formData.fatherName?.trim()) err.push('Father Name');
        if (!formData.religion?.trim()) err.push('Religion');
        if (!formData.nationality?.trim()) err.push('Nationality');
        if (!formData.gender) err.push('Gender');
        if (!formData.maritalStatus) err.push('Marital Status');
        
        if (!employeeId) {
            if (!hasProfilePicture) err.push('Profile Picture');
            if (!hasCNICFront) err.push('CNIC Front Image');
            if (!hasCNICBack) err.push('CNIC Back Image');
        }
        return err;
    };

    const isStep8RequiredValid = () => {
        if (isAdmin) return true;
        const hasSignedContract = rawEmployee?.attachments?.some((a: any) => a.fileType === 'Signed Contract' || a.fileType === 'Contract') || formData.files.some(f => f.type === 'Signed Contract' || f.type === 'Contract');
        
        return hasSignedContract;
    };

    const getStep8RequiredErrors = (): string[] => {
        const err: string[] = [];
        const hasSignedContract = rawEmployee?.attachments?.some((a: any) => a.fileType === 'Signed Contract' || a.fileType === 'Contract') || formData.files.some(f => f.type === 'Signed Contract' || f.type === 'Contract');
        
        if (!hasSignedContract) err.push('Signed Contract');
        
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
        domicile: '',
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
        temporaryAddress: {
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
        certifications: [] as { title: string }[],
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
        },
        financeInfo: {
            probationSalary: 0,
            confirmedSalary: 0,
            probationMonths: 3,
            probationDays: 90
        },
        providentFundBalance: 0,
        benefits: [] as { name: string; description: string; eligibleDate: string; status: string }[],
        salaryHistory: [] as { effectiveDate: string; amount: number; changeType: string; reason: string; previousAmount: number }[]
    });

/*
    const handleAiExtract = async (file: File) => {
        setExtracting(true);
        setError(null);
        try {
            const data = await api.extractFromDocument(file);
            
            setFormData(prev => ({
                ...prev,
                firstName: data.firstName || prev.firstName,
                lastName: data.lastName || prev.lastName,
                middleName: data.middleName || prev.middleName,
                fatherName: data.fatherName || prev.fatherName,
                cnic: data.cnic || prev.cnic,
                dateOfBirth: data.dateOfBirth ? data.dateOfBirth.split('T')[0] : prev.dateOfBirth,
                gender: data.gender || prev.gender,
                nationality: data.nationality || prev.nationality,
                religion: data.religion || prev.religion,
                maritalStatus: data.maritalStatus || prev.maritalStatus,
                bloodGroup: data.bloodGroup || prev.bloodGroup,
                domicile: data.domicile || prev.domicile,
                email: data.email || prev.email,
                phone: data.phone || prev.phone,
                address: {
                    ...prev.address,
                    street: data.address?.street || prev.address.street,
                    city: data.address?.city || prev.address.city,
                    state: data.address?.state || prev.address.state,
                    zipCode: data.address?.zipCode || prev.address.zipCode,
                    country: data.address?.country || prev.address.country,
                },
                skills: data.skills?.length ? Array.from(new Set([...prev.skills, ...data.skills])) : prev.skills,
                education: data.education?.length && (!prev.education[0]?.institute) ? data.education : prev.education,
                employmentHistory: data.employmentHistory?.length && (!prev.employmentHistory[0]?.companyName) ? data.employmentHistory : prev.employmentHistory,
                emergencyContacts: data.emergencyContacts?.length && (!prev.emergencyContacts[0]?.name) ? data.emergencyContacts : prev.emergencyContacts,
                bankDetails: {
                    ...prev.bankDetails,
                    bankName: data.bankDetails?.bankName || prev.bankDetails.bankName,
                    accountNumber: data.bankDetails?.accountNumber || prev.bankDetails.accountNumber,
                    accountName: data.bankDetails?.accountName || prev.bankDetails.accountName,
                    iban: data.bankDetails?.iban || prev.bankDetails.iban,
                    swiftCode: data.bankDetails?.swiftCode || prev.bankDetails.swiftCode,
                },
                socialProfiles: prev.socialProfiles.map(p => {
                    const extracted = data.socialProfiles?.find((ep: any) => ep.platform === p.platform);
                    return extracted && !p.link ? { ...p, link: extracted.link } : p;
                })
            }));
            
            setSuccess('AI successfully extracted information from your document!');
            setTimeout(() => setSuccess(null), 5000);
        } catch (err: any) {
            setError('AI Extraction failed: ' + err.message);
        } finally {
            setExtracting(false);
        }
    };
    */

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
                    const data = await response.json();
                    // Handle paginated { employees } or plain array
                    const empList = Array.isArray(data) ? data : (data.employees || []);
                    const employee = empList.find((emp: any) => emp.userId === user.id);

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
                            domicile: employee.domicile || '',
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
                            temporaryAddress: {
                                street: employee.temporaryAddress?.street || '',
                                city: employee.temporaryAddress?.city || '',
                                state: employee.temporaryAddress?.state || '',
                                zipCode: employee.temporaryAddress?.zipCode || '',
                                country: employee.temporaryAddress?.country || ''
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
                            certifications: employee.certifications?.length ? employee.certifications : [],
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
                            financeInfo: {
                                probationSalary: employee.financeInfo?.probationSalary || 0,
                                confirmedSalary: employee.financeInfo?.confirmedSalary || 0,
                                probationMonths: employee.financeInfo?.probationMonths || 0,
                                probationDays: employee.financeInfo?.probationDays || 0
                            },
                            benefits: employee.benefits?.length ? employee.benefits.map((b: any) => ({
                                name: b.name || '',
                                description: b.description || '',
                                eligibleDate: formatDate(b.eligibleDate),
                                status: b.status || 'Active'
                            })) : [],
                            salaryHistory: employee.salaryHistory?.length
                                ? employee.salaryHistory.map((sh: any) => ({
                                    ...sh,
                                    effectiveDate: formatDate(sh.effectiveDate)
                                }))
                                : [],
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
                            files: [],
                            providentFundBalance: employee.providentFundBalance || 0
                        });

                        // Track fields that were already filled to lock them for non-admins
                        setInitialLockedFields({
                            cnic: !!employee.cnic,
                            dateOfBirth: !!employee.dateOfBirth,
                            fatherName: !!employee.fatherName,
                            nationality: !!employee.nationality,
                            bloodGroup: !!employee.bloodGroup,
                            religion: !!employee.religion
                        });

                        // Check if addresses are identical to set initial checkbox state
                        const normalize = (val: any) => (val || '').trim();
                        const hasPerm = !!(normalize(employee.address?.street) || normalize(employee.address?.city) || normalize(employee.address?.state) || normalize(employee.address?.zipCode) || normalize(employee.address?.country));
                        const sameAddress = hasPerm &&
                            normalize(employee.address?.street) === normalize(employee.temporaryAddress?.street) &&
                            normalize(employee.address?.city) === normalize(employee.temporaryAddress?.city) &&
                            normalize(employee.address?.state) === normalize(employee.temporaryAddress?.state) &&
                            normalize(employee.address?.zipCode) === normalize(employee.temporaryAddress?.zipCode) &&
                            normalize(employee.address?.country) === normalize(employee.temporaryAddress?.country);
                        setIsSameAddress(sameAddress);
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

    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [step]);

    // Sync temporary address with permanent if "Same as Permanent" is checked
    useEffect(() => {
        if (isSameAddress) {
            setFormData(prev => ({
                ...prev,
                temporaryAddress: { ...prev.address }
            }));
        }
    }, [isSameAddress, formData.address]);

    const copyPermanentAddress = () => {
        setFormData(prev => ({
            ...prev,
            temporaryAddress: { ...prev.address }
        }));
    };

    const handleChange = (e: any, section?: string, index?: number, subfield?: string) => {
        const { name, value } = e.target;

        if (section === 'address') {
            setFormData(prev => ({ ...prev, address: { ...prev.address, [name]: value } }));
        } else if (section === 'temporaryAddress') {
            if (isSameAddress) return;
            setFormData(prev => ({ ...prev, temporaryAddress: { ...prev.temporaryAddress, [name]: value } }));
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
        handleSubmit(false, true);

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
        handleSubmit(false, true);

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

    const handleSubmit = async (shouldNavigate = true, isBackground = false) => {
        if (!isStep1RequiredValid()) {
            setStepErrors(getStep1RequiredErrors());
            return;
        }
        if (duplicateError) {
            setError(duplicateError.message);
            return;
        }
        setStepErrors([]);

        // Non-admin employees must upload Contract on final (Documents) step
        if (!isBackground && shouldNavigate && !isAdmin && step === steps[steps.length - 1].id) {
            if (!isStep8RequiredValid()) {
                setError(`The following documents are mandatory: ${getStep8RequiredErrors().join(', ')}`);
                setSaving(false);
                return;
            }
        }

        if (!isBackground) setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const token = localStorage.getItem('token');
            if (!token) {
                setError('You must be logged in to save your information.');
                if (!isBackground) setSaving(false);
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
            if (!employeeData.domicile) delete employeeData.domicile;
            if (!employeeData.bloodGroup) delete employeeData.bloodGroup;
            if (!employeeData.religion) delete employeeData.religion;

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

            // Upload files (Parallelize for speed)
            if (formData.files.length > 0 && savedEmployee.employeeId) {
                const uploadPromises = formData.files.map(async (fileObj) => {
                    try {
                        const fileData = new FormData();
                        fileData.append('file', fileObj.file);
                        fileData.append('fileType', fileObj.type || 'Document');

                        const fileResponse = await fetch(api.employeeAttachments(savedEmployee.employeeId), {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}` },
                            body: fileData
                        });

                        if (fileResponse.ok) {
                            const attachment = await fileResponse.json();
                            // If this was a profile picture, sync with AuthContext and rawEmployee
                            if (fileObj.type === 'Profile Picture') {
                                const newAvatarUrl = `${api.baseURL}/api/employees/attachments/raw/${attachment._id}?token=${token}&t=${Date.now()}`;
                                login((prev: any) => prev ? { ...prev, avatar: newAvatarUrl } : prev as any);
                                
                                setRawEmployee((prev: any) => ({
                                    ...prev,
                                    avatar: `/api/employees/attachments/raw/${attachment._id}`,
                                    attachments: [
                                        ...(prev?.attachments || []).filter((a: any) => a.fileType !== 'Profile Picture'),
                                        { ...attachment, fileType: 'Profile Picture' }
                                    ]
                                }));
                                setAvatarCache(`&t=${Date.now()}`);
                            } else {
                                // Sync other file types into local state so they show up in Documents tab instantly
                                setRawEmployee((prev: any) => ({
                                    ...prev,
                                    attachments: [
                                        ...(prev?.attachments || []).filter((a: any) => a.fileType !== fileObj.type),
                                        { ...attachment, status: 'Pending' }
                                    ]
                                }));
                            }
                        }
                    } catch (fileError) {
                        console.error(`Error uploading file ${fileObj.file.name}:`, fileError);
                    }
                });

                if (isBackground) {
                    Promise.all(uploadPromises).then(() => {
                        console.log('BG Uploads complete');
                        setSuccess('Files uploaded successfully');
                        setTimeout(() => setSuccess(null), 2000);
                    });
                } else {
                    await Promise.all(uploadPromises);
                }
                
                // Clear files array after successful upload
                setFormData(prev => ({ ...prev, files: [] }));
            }

            setInitialLockedFields({
                cnic: !!savedEmployee.cnic,
                dateOfBirth: !!savedEmployee.dateOfBirth,
                fatherName: !!savedEmployee.fatherName,
                nationality: !!savedEmployee.nationality,
                domicile: !!savedEmployee.domicile,
                bloodGroup: !!savedEmployee.bloodGroup,
                religion: !!savedEmployee.religion
            });

            if (!isBackground) {
                setSuccess('Profile saved successfully');
                setTimeout(() => {
                    setSuccess(null);
                    if (shouldNavigate) {
                        if (onboarding) {
                            navigate('/dashboard');
                        } else {
                            setIsEditing(false);
                        }
                    }
                }, 600);
            } else {
                // Background success flash
                setSuccess('Progress saved');
                setTimeout(() => setSuccess(null), 1000);
            }
            return savedEmployee;
        } catch (err: any) {
            console.error('Error saving employee data:', err);
            setError(err.message || 'Failed to save your information. Please try again.');
        } finally {
            if (!isBackground) setSaving(false);
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
            setSuccess('Document deleted successfully');
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            console.error('Error deleting document:', err);
            setError(err.message || 'Failed to delete document.');
            setDeleteModal({ isOpen: false, attachmentId: null, fileName: null });
        }
    };

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !employeeId) return;

        // ── Instant local preview — user sees the image the moment they pick it ──
        const localPreviewUrl = URL.createObjectURL(file);
        // Revoke the previous preview URL if one exists
        setLocalAvatarPreview(prev => {
            if (prev) URL.revokeObjectURL(prev);
            return localPreviewUrl;
        });
        setAvatarImgError(false); // make sure preview img is attempted
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

            // The server returns the created attachment object (or the full employee)
            const uploadResult = await response.json();

            // Determine the new attachment ID from the response
            // Some backends return the attachment directly, others return the updated employee
            const newAttachment =
                uploadResult._id && uploadResult.fileType
                    ? uploadResult                                          // direct attachment object
                    : uploadResult.attachments?.slice(-1)[0] ?? null;     // last attachment in employee doc

            if (newAttachment?._id) {
                // 1. Instantly patch rawEmployee in local state (no re-fetch needed)
                setRawEmployee((prev: any) => ({
                    ...prev,
                    // Update main avatar field to point to new ID (server does this too)
                    avatar: `/api/employees/attachments/raw/${newAttachment._id}`,
                    // Filter out old profile pictures from attachments to match server-side pulling
                    attachments: [
                        ...(prev?.attachments || []).filter((a: any) => a.fileType !== 'Profile Picture'),
                        { ...newAttachment, fileType: 'Profile Picture' }
                    ]
                }));

                // 2. Build the authenticated URL for the new attachment
                const newAvatarUrl = `${api.baseURL}/api/employees/attachments/raw/${newAttachment._id}?token=${token}&t=${Date.now()}`;

                // 3. Push new avatar into AuthContext so the header icon refreshes instantly
                login((prev: UserType | null) =>
                    prev ? { ...prev, avatar: newAvatarUrl } : prev as any
                );

                // 4. Clear error state and cache-bust so component re-renders with new server URL
                setAvatarImgError(false);
                setAvatarCache(`&t=${Date.now()}`);
            } else {
                // Fallback: re-fetch employee to get the latest attachment list
                const refreshRes = await fetch(`${api.employees}?userId=${user?.id}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (refreshRes.ok) {
                    const data = await refreshRes.json();
                    const empList = Array.isArray(data) ? data : (data.employees || []);
                    const employee = empList.find((emp: any) =>
                        emp.userId === user?.id || emp._id === employeeId || emp.id === employeeId
                    );
                    if (employee) {
                        setRawEmployee(employee);
                        const profilePics = employee.attachments?.filter((a: any) => a.fileType === 'Profile Picture') || [];
                        if (profilePics.length > 0) {
                            const latestPic = profilePics[profilePics.length - 1];
                            const newAvatarUrl = `${api.baseURL}/api/employees/attachments/raw/${latestPic._id}?token=${token}&t=${Date.now()}`;
                            login((prev: UserType | null) => prev ? { ...prev, avatar: newAvatarUrl } : prev as any);
                            setAvatarImgError(false);
                            setAvatarCache(`&t=${Date.now()}`);
                        }
                    }
                }
            }

            // Upload done — clear local preview; rawEmployee / AuthContext now has the real server URL
            setLocalAvatarPreview(prev => {
                if (prev) URL.revokeObjectURL(prev);
                return null;
            });

            setSuccess('Profile updated successfully');
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            console.error('Error uploading avatar:', err);
            setError('Failed to upload profile picture.');
            // Revert preview on error
            setLocalAvatarPreview(prev => {
                if (prev) URL.revokeObjectURL(prev);
                return null;
            });
        } finally {
            setUploadingAvatar(false);
        }
    };

    const handleSyncMicrosoftPhoto = () => {
        // Set the redirect target so AuthCallback knows where to send us back!
        localStorage.setItem('auth_redirect', '/my-info');
        
        // Directly redirect the main window instead of opening a popup
        window.location.href = `${api.baseURL.replace(/\/$/, '')}/api/auth/microsoft?prompt=select_account&sync=true`;
    };

    const allSteps = [
        { id: 1, title: 'Personal', icon: User },
        { id: 2, title: 'Contact & Dependents', icon: Users },
        { id: 3, title: 'Immigration', icon: Globe },
        { id: 4, title: 'Job & Status', icon: Briefcase, roleRestricted: true },
        { id: 5, title: 'History & Education', icon: GraduationCap },
        { id: 6, title: 'Skills & Profiles', icon: User },
        { id: 7, title: 'Finance', icon: CreditCard },
        { id: 8, title: 'Documents', icon: FileText }
    ];

    const isAdmin = user?.role === 'admin' || user?.role === 'super-admin' || user?.role === 'manager';
    const canEditJob = user?.role === 'admin' || user?.role === 'super-admin' || user?.role === 'manager';
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
            { id: 'immigration', label: 'Immigration & Travel', icon: Navigation },
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

        // localAvatarPreview is a blob URL set immediately on file pick — shows image BEFORE upload completes.
        // Once the upload finishes it is cleared and the server URL takes over.
        let avatarUrl = localAvatarPreview || getAvatarUrl(rawEmployee) || user?.avatar;
        if (!localAvatarPreview && avatarUrl && avatarCache) {
            avatarUrl += avatarUrl.includes('?') ? avatarCache : `?${avatarCache.substring(1)}`;
        }

        return (
            <div className="space-y-6 animate-fadeIn pb-10">
                {/* Header / Banner */}
                <div className="flex flex-col sm:flex-row items-center sm:items-center text-center sm:text-left gap-4 sm:gap-6 bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/50 shadow-sm animate-slide-up">
                    <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200/50 relative group overflow-hidden shrink-0">
                        {avatarUrl && !avatarImgError ? (
                            <img
                                key={avatarUrl}
                                src={avatarUrl}
                                alt="Avatar"
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                onError={() => setAvatarImgError(true)}
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center font-bold text-2xl tracking-tighter">
                                {getInitials()}
                            </div>
                        )}
                        <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center gap-2 backdrop-blur-[2px] text-white">
                            {avatarUrl && !avatarImgError && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setLightboxFile({
                                            url: avatarUrl!,
                                            fileName: `${rawEmployee.firstName} ${rawEmployee.lastName || ''} Profile Picture`,
                                            fileType: 'png'
                                        });
                                    }}
                                    className="p-2 bg-white/20 hover:bg-white/35 rounded-xl transition-all flex flex-col items-center justify-center gap-0.5 hover:scale-105"
                                    title="View Profile Picture"
                                >
                                    <Eye size={18} />
                                    <span className="text-[9px] font-extrabold uppercase tracking-wider">View</span>
                                </button>
                            )}
                            <label className="p-2 bg-white/20 hover:bg-white/35 rounded-xl transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 hover:scale-105" title="Change Profile Picture">
                                <Camera size={18} />
                                <span className="text-[9px] font-extrabold uppercase tracking-wider">Change</span>
                                <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
                            </label>
                        </div>
                        {uploadingAvatar && (
                            <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                                <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        )}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col items-center sm:items-start text-center sm:text-left">
                        <h1 className="text-xl sm:text-2xl font-bold text-gray-800 break-words">
                            {rawEmployee.firstName} {rawEmployee.middleName ? `${rawEmployee.middleName} ` : ''}{rawEmployee.lastName}
                        </h1>
                        <p className="text-xs sm:text-sm text-gray-500 font-medium mt-0.5">{rawEmployee.jobInfo?.designation || 'Employee'} • {rawEmployee.jobInfo?.department || 'Member'}</p>
                        <div className="flex flex-wrap justify-center sm:justify-start gap-2 sm:gap-4 mt-2">
                            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100 whitespace-nowrap">
                                <Check size={12} /> Active
                            </span>
                            <span className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100 whitespace-nowrap">
                                <Shield size={12} /> {rawEmployee.employeeId}
                            </span>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 w-full sm:w-auto shrink-0 mt-2 sm:mt-0">
                        <button
                            onClick={handleSyncMicrosoftPhoto}
                            className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 bg-gradient-to-r from-blue-600 to-sky-600 text-white rounded-xl hover:from-blue-700 hover:to-sky-700 transition-all font-semibold text-xs sm:text-sm shadow-md shadow-blue-100 hover:shadow-lg hover:scale-[1.02] active:scale-95 whitespace-nowrap"
                            title="Sync profile picture from Microsoft 365"
                        >
                            <Cloud size={18} className="shrink-0" /> Sync MS Photo
                        </button>
                        <button
                            onClick={() => { setIsEditing(true); setStep(1); }}
                            className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all font-semibold text-xs sm:text-sm shadow-md shadow-indigo-100 hover:shadow-lg hover:scale-[1.02] active:scale-95 whitespace-nowrap"
                        >
                            <Edit2 size={18} className="shrink-0" /> Edit Profile
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
                                {renderField('Domicile', rawEmployee.domicile)}
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
                            {/* Certifications Display */}
                            {rawEmployee.certifications?.length > 0 && (
                                <div className="pt-8 border-t border-slate-100">
                                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                        <FileText size={16} /> Certifications
                                    </h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                        {rawEmployee.certifications.map((cert: any, idx: number) => {
                                            const savedFile = rawEmployee.attachments?.find((a: any) => a.fileType === `Certification - ${idx}`);
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
                                                                    const url = apiHelpers.attachmentRaw(savedFile._id);
                                                                    const ext = savedFile.fileName?.split('.').pop()?.toLowerCase() || '';
                                                                    setLightboxFile({ url, fileName: savedFile.fileName, fileType: ext });
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

                    {/* Contact Tab */}
                    {activeTab === 'contact' && (
                        <div className="space-y-10 animate-fadeIn">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                {renderField('Personal Email', rawEmployee.email)}
                                {renderField('Phone', rawEmployee.phone)}
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                    <Globe size={16} /> Permanent Address
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                                    {renderField('Street', rawEmployee.address?.street)}
                                    {renderField('City', rawEmployee.address?.city)}
                                    {renderField('State / Province', rawEmployee.address?.state)}
                                    {renderField('Zip / Postal Code', rawEmployee.address?.zipCode)}
                                    {renderField('Country', rawEmployee.address?.country)}
                                </div>
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                    <Globe size={16} /> Temporary Address
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                                    {renderField('Street', rawEmployee.temporaryAddress?.street)}
                                    {renderField('City', rawEmployee.temporaryAddress?.city)}
                                    {renderField('State / Province', rawEmployee.temporaryAddress?.state)}
                                    {renderField('Zip / Postal Code', rawEmployee.temporaryAddress?.zipCode)}
                                    {renderField('Country', rawEmployee.temporaryAddress?.country)}
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
                                {renderField('Status', (typeof rawEmployee.employmentStatus === 'string' ? rawEmployee.employmentStatus : rawEmployee.employmentStatus?.status) || '-')}
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
                            {!isSalaryUnlocked ? (
                                <div className="bg-slate-50/80 rounded-3xl p-8 border border-slate-200/80 text-center max-w-md mx-auto my-6 shadow-xs">
                                    <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-3.5 ring-8 ring-indigo-50/50">
                                        <Lock size={26} />
                                    </div>
                                    <h3 className="text-base font-bold text-slate-800">Financial Information Protected</h3>
                                    <p className="text-xs text-slate-500 mt-1 mb-5 leading-relaxed">
                                        Salary breakdown, probation terms, and Provident Fund balance are locked with your 4-digit Security PIN to ensure privacy.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => setShowSalaryPinModal(true)}
                                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-200 hover:shadow-indigo-300 transition-all inline-flex items-center gap-2 cursor-pointer"
                                    >
                                        <Lock size={13} /> Unlock with 4-Digit PIN
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center justify-between bg-indigo-50/60 p-3 rounded-2xl border border-indigo-100">
                                        <div className="flex items-center gap-2 text-xs font-semibold text-indigo-900">
                                            <Shield size={14} className="text-indigo-600" />
                                            <span>Salary & PF details unlocked for this session</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setIsSalaryUnlocked(false)}
                                            className="inline-flex items-center gap-1 px-3 py-1 bg-white hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-200 transition-all cursor-pointer"
                                        >
                                            <Lock size={11} /> Lock Figures
                                        </button>
                                    </div>

                                    {/* Salary Terms */}
                                    <div>
                                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Salary & Employment Terms</h3>
                                        {(rawEmployee.financeInfo?.probationMonths > 0 && rawEmployee.financeInfo?.probationSalary !== rawEmployee.financeInfo?.confirmedSalary) ? (
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div className="p-5 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl text-white shadow-md">
                                                    <span className="text-xs font-black uppercase tracking-wider text-amber-100 block mb-1">Probation Base Salary</span>
                                                    <p className="text-2xl font-black">
                                                        {new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', currencyDisplay: 'code' }).format(rawEmployee.financeInfo?.probationSalary || 0).replace('PKR', 'Rs.')}
                                                    </p>
                                                    <p className="text-xs text-amber-100 mt-2 font-medium">Duration: {rawEmployee.financeInfo?.probationMonths || 3} Months ({rawEmployee.financeInfo?.probationDays || 90} Days)</p>
                                                </div>
                                                <div className="p-5 bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl text-white shadow-md">
                                                    <span className="text-xs font-black uppercase tracking-wider text-emerald-100 block mb-1">Confirmed Base Salary</span>
                                                    <p className="text-2xl font-black">
                                                        {new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', currencyDisplay: 'code' }).format(rawEmployee.financeInfo?.confirmedSalary || 0).replace('PKR', 'Rs.')}
                                                    </p>
                                                    <p className="text-xs text-emerald-100 mt-2 font-medium">Applies after successful probation completion</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div className="p-5 bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl text-white shadow-md">
                                                    <span className="text-xs font-black uppercase tracking-wider text-indigo-100 block mb-1">Direct Monthly Base Salary</span>
                                                    <p className="text-2xl font-black">
                                                        {new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', currencyDisplay: 'code' }).format(rawEmployee.financeInfo?.confirmedSalary || rawEmployee.financeInfo?.probationSalary || 0).replace('PKR', 'Rs.')}
                                                    </p>
                                                    <p className="text-xs text-indigo-200 mt-2 font-medium">Direct / Confirmed Employment</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6">Salary Breakdown Components</h3>
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

                                    {/* Provident Fund Details */}
                                    <div className="pt-8 border-t border-slate-100">
                                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6">Provident Fund Details</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 bg-slate-50/50 p-6 rounded-3xl border border-slate-100 mb-6">
                                            {renderField('Current PF Balance', rawEmployee.providentFundBalance ? new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(rawEmployee.providentFundBalance).replace('PKR', 'Rs.') : 'Rs. 0')}
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
                                                    <tbody className="divide-y divide-slate-100 font-medium text-slate-750">
                                                        {rawEmployee.providentFundHistory?.length > 0 ? (
                                                            [...rawEmployee.providentFundHistory]
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
                                </>
                            )}

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

                            {/* Benefits Display */}
                            <div className="pt-8 border-t border-slate-100">
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                    <Check size={16} /> Company Benefits
                                </h3>
                                {rawEmployee.benefits?.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {rawEmployee.benefits.map((benefit: any, idx: number) => (
                                            <div key={idx} className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm hover:border-indigo-300 transition-all group overflow-hidden relative">
                                                <div className="absolute top-0 right-0 w-12 h-12 bg-indigo-50 rounded-bl-2xl -z-0 opacity-40 group-hover:bg-indigo-100 transition-colors" />
                                                <div className="relative z-10">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest ${
                                                            benefit.status === 'Active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                                                        }`}>
                                                            {benefit.status || 'Active'}
                                                        </span>
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{formatDate(benefit.eligibleDate)}</span>
                                                    </div>
                                                    <h4 className="text-base font-bold text-slate-800 mb-1">{benefit.name}</h4>
                                                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{benefit.description || 'No description provided'}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center">
                                        <p className="text-sm text-slate-400 italic">No company benefits assigned Yet</p>
                                    </div>
                                )}
                            </div>

                            {/* Salary History Display */}
                            <div className="pt-8 border-t border-slate-100">
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                    <History size={16} /> Salary Progression
                                </h3>
                                {rawEmployee.salaryHistory?.length > 0 ? (
                                    <div className="relative pl-8 border-l-2 border-indigo-100 space-y-8 pb-4">
                                        {[...rawEmployee.salaryHistory].sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime()).map((hist: any, idx: number) => (
                                            <div key={idx} className="relative">
                                                <div className="absolute -left-10 top-2 w-4 h-4 rounded-full bg-white border-4 border-indigo-500 z-10" />
                                                <div className="p-5 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div>
                                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{formatDate(hist.effectiveDate)}</p>
                                                            <h4 className="text-lg font-bold text-slate-800">{hist.changeType}</h4>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-xl font-black text-indigo-600">
                                                                {new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', currencyDisplay: 'code' }).format(hist.amount).replace('PKR', 'Rs.')}
                                                            </p>
                                                            {hist.previousAmount > 0 && (
                                                                <p className="text-[10px] font-bold text-emerald-500 uppercase">
                                                                    +{(((hist.amount - hist.previousAmount) / hist.previousAmount) * 100).toFixed(1)}% Change
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {hist.reason && (
                                                        <div className="mt-2 pt-2 border-t border-slate-50 italic text-sm text-slate-500">
                                                            "{hist.reason}"
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center">
                                        <p className="text-sm text-slate-400 italic">No salary progression recorded</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Employment History Tab */}
                    {activeTab === 'history' && (
                        <div className="space-y-6 animate-fadeIn pb-10">
                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                <History size={16} /> Previous Employment
                            </h3>
                            {rawEmployee.employmentHistory?.length > 0 ? (
                                <div className="space-y-4">
                                    {rawEmployee.employmentHistory.map((history: any, i: number) => (
                                        <div key={i} className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-300 transition-all relative overflow-hidden group">
                                            <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-indigo-500 to-purple-500" />
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <p className="font-bold text-gray-800 text-lg">{history.companyName}</p>
                                                    <p className="text-sm text-indigo-600 font-semibold">{history.jobTitle}</p>
                                                </div>
                                                <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-md border border-slate-100 italic">
                                                    {formatDate(history.startDate)} - {formatDate(history.endDate)}
                                                </span>
                                            </div>
                                            {history.reasonForLeaving && (
                                                <p className="text-xs text-slate-500 mt-2 italic leading-relaxed">Reason for leaving: "{history.reasonForLeaving}"</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : <p className="text-gray-400 italic">No previous employment history recorded</p>}
                        </div>
                    )}

                    {/* Education Tab */}
                    {activeTab === 'education' && (
                        <div className="space-y-6 animate-fadeIn pb-10">
                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                <GraduationCap size={16} /> Educational Background
                            </h3>
                            {rawEmployee.education?.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {rawEmployee.education.map((edu: any, i: number) => (
                                        <div key={i} className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-300 transition-all relative group">
                                            <div className="absolute top-0 right-0 w-12 h-12 bg-indigo-50 rounded-bl-3xl -z-0 opacity-40 group-hover:bg-indigo-100 transition-colors" />
                                            <div className="relative z-10">
                                                <div className="flex items-center gap-3 mb-3">
                                                    <div className="p-2 bg-indigo-50 text-indigo-500 rounded-xl group-hover:bg-indigo-100 transition-colors">
                                                        <GraduationCap size={18} />
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Level</p>
                                                        <p className="text-sm font-bold text-indigo-600 uppercase">{edu.level}</p>
                                                    </div>
                                                </div>
                                                <h4 className="font-bold text-slate-800 text-base mb-1">{edu.institute}</h4>
                                                <div className="flex items-center gap-6 mt-3 pt-3 border-t border-slate-50">
                                                    <div>
                                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Year</p>
                                                        <p className="text-sm font-bold text-slate-700">{edu.year}</p>
                                                    </div>
                                                    {edu.score && (
                                                        <div>
                                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Score / GPA</p>
                                                            <p className="text-sm font-bold text-slate-700">{edu.score}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : <p className="text-gray-400 italic">No education records found</p>}
                        </div>
                    )}

                    {/* Dependents Tab */}
                    {activeTab === 'dependents' && (
                        <div className="space-y-6 animate-fadeIn pb-10">
                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                <Users size={16} /> Family & Dependents
                            </h3>
                            {rawEmployee.dependents?.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {rawEmployee.dependents.map((dep: any, i: number) => (
                                        <div key={i} className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-300 transition-all group overflow-hidden relative">
                                            <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-slate-50 rounded-full group-hover:bg-indigo-50 transition-colors" />
                                            <div className="relative z-10">
                                                <div className="flex items-center justify-between mb-3">
                                                    <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full uppercase tracking-widest">{dep.relation}</span>
                                                </div>
                                                <h4 className="text-base font-bold text-slate-800 mb-1">{dep.name}</h4>
                                                <p className="text-xs text-slate-500 flex items-center gap-1.5"><History size={12} /> Born: {formatDate(dep.dateOfBirth)}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : <p className="text-gray-400 italic">No dependents recorded</p>}
                        </div>
                    )}

                    {/* Immigration Tab */}
                    {activeTab === 'immigration' && (
                        <div className="space-y-8 animate-fadeIn pb-10">
                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                <Navigation size={16} /> Immigration Documents
                            </h3>
                            {rawEmployee.immigrationHistory?.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {rawEmployee.immigrationHistory.map((doc: any, i: number) => (
                                        <div key={i} className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
                                            <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-indigo-500 to-purple-500" />
                                            <div className="flex justify-between items-start mb-4">
                                                <div>
                                                    <span className="inline-block px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase tracking-wider mb-2">
                                                        {doc.documentType}
                                                    </span>
                                                    <p className="text-lg font-bold text-gray-800 font-mono tracking-tighter">{doc.documentNumber || '—'}</p>
                                                </div>
                                                <Globe size={20} className="text-slate-200 group-hover:text-indigo-200 transition-colors" />
                                            </div>
                                            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-100">
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Issue Date</p>
                                                    <p className="text-xs font-bold text-slate-700">{formatDate(doc.issueDate)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Expiry Date</p>
                                                    <p className={`text-xs font-bold ${doc.expiryDate && new Date(doc.expiryDate) < new Date() ? 'text-rose-600' : 'text-slate-700'}`}>
                                                        {formatDate(doc.expiryDate)}
                                                    </p>
                                                </div>
                                                <div className="col-span-2">
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Issuing Country</p>
                                                    <p className="text-xs font-bold text-slate-700">{doc.issuingCountry || '—'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-12 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                                    <Globe size={48} className="mx-auto mb-4 opacity-20" />
                                    <p className="text-sm font-medium text-slate-500">No immigration documents recorded</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Documents Tab */}
                    {activeTab === 'documents' && (
                        <div className="space-y-6 animate-fadeIn pb-10">
                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                <FileText size={16} /> Personal Documents
                            </h3>
                            {rawEmployee.attachments?.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {rawEmployee.attachments.map((file: any, i: number) => (
                                        <div key={i} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-200 hover:border-indigo-100 shadow-sm transition-all group">
                                            <div className="flex items-center gap-4 min-w-0">
                                                <div className="p-3 bg-slate-50 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 rounded-xl transition-colors shrink-0">
                                                    <FileText size={20} />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-bold text-gray-700 truncate">{file.fileName}</p>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{file.fileType}</span>
                                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                                            file.status === 'approved' ? 'bg-emerald-50 text-emerald-600' : 
                                                            file.status === 'rejected' ? 'bg-rose-50 text-rose-600' : 
                                                            'bg-amber-50 text-amber-600'
                                                        }`}>
                                                            {file.status || 'pending'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 ml-4">
                                                <button onClick={() => handleDownload(file._id, file.fileName)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all">
                                                    <Download size={18} />
                                                </button>
                                                <a href={apiHelpers.attachmentRaw(file._id)} target="_blank" rel="noopener noreferrer" className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all">
                                                    <Eye size={18} />
                                                </a>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-12 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                                    <FileText size={48} className="mx-auto mb-4 opacity-20" />
                                    <p className="text-sm font-medium text-slate-500">No documents uploaded yet</p>
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
                                <span>{success}</span>
                            </div>
                        )}


                        {/* Step 1: Personal Details */}
                        {step === 1 && (
                            <div className="animate-slide-up pb-20">
                                { /* AI Magic Fill Section - Temporarily Commented Out
                                <div className="mb-8 p-6 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-200 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6 animate-scale-in">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg shrink-0">
                                            <Sparkles size={24} />
                                        </div>
                                        <div>
                                            <h4 className="text-gray-800 font-bold">AI Magic Fill</h4>
                                            <p className="text-sm text-gray-500">
                                                {formData.files.some(f => f.type === 'Resume/CV') 
                                                    ? "Ready to extract from your uploaded resume!" 
                                                    : "Upload your resume to automatically fill this form using AI."}
                                            </p>
                                        </div>
                                    </div>
                                    {formData.files.some(f => f.type === 'Resume/CV') ? (
                                        <button
                                            onClick={() => {
                                                const resume = formData.files.find(f => f.type === 'Resume/CV')?.file;
                                                if (resume) handleAiExtract(resume);
                                            }}
                                            disabled={extracting}
                                            className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-200 hover:shadow-xl hover:bg-indigo-700 transition-all flex items-center gap-2 whitespace-nowrap active:scale-95 disabled:opacity-50"
                                        >
                                            {extracting ? <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Wand2 size={18} />}
                                            {extracting ? 'AI is reading...' : 'Extract Data'}
                                        </button>
                                    ) : (
                                        <div className="relative overflow-hidden group">
                                            <input
                                                type="file"
                                                accept=".pdf,.doc,.docx,.jpg,.png"
                                                className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                                onChange={(e) => {
                                                    if (e.target.files && e.target.files.length > 0) {
                                                        const file = e.target.files[0];
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            files: [...prev.files, { file, type: 'Resume/CV' }]
                                                        }));
                                                        handleAiExtract(file);
                                                    }
                                                }}
                                            />
                                            <button className="px-6 py-3 bg-white text-indigo-600 border-2 border-indigo-100 rounded-2xl font-bold hover:border-indigo-600 transition-all flex items-center gap-2 whitespace-nowrap group-hover:bg-indigo-50">
                                                <Upload size={18} />
                                                Start with Resume
                                            </button>
                                        </div>
                                    )}
                                </div>
                                */ }

                                {/* Duplicate Alert */}
                                {duplicateError && (
                                    <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3 text-rose-700 animate-shake">
                                        <AlertCircle size={20} className="shrink-0" />
                                        <p className="text-sm font-bold">{duplicateError.message}</p>
                                    </div>
                                )}
                                
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* Upload Fields */}
                                <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-4">
                                    {['Profile Picture', 'Resume/CV', 'CNIC Front', 'CNIC Back'].map((label) => {
                                        const existingFile = rawEmployee?.attachments?.find((a: any) => a.fileType === label);
                                        const localFileObj = formData.files.find(f => f.type === label);
                                        const hasFile = !!existingFile || !!localFileObj;
                                        const inputId = `file-input-${label.replace(/[^a-zA-Z0-9-]/g, '-')}`;

                                        return (
                                            <div key={label} className="relative flex flex-col h-full min-h-[160px]">
                                                <input
                                                    type="file"
                                                    id={inputId}
                                                    accept={label === 'Profile Picture' ? "image/*" : (label === 'Resume/CV' ? '.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp' : '.jpg,.jpeg,.png,.webp')}
                                                    className="hidden"
                                                    onChange={(e) => {
                                                        if (e.target.files && e.target.files.length > 0) {
                                                            const file = e.target.files[0];
                                                            setFormData(prev => ({
                                                                ...prev,
                                                                files: [...prev.files.filter(f => f.type !== label), { file, type: label }]
                                                            }));
                                                            // Generate preview for profile picture
                                                            if (label === 'Profile Picture') {
                                                                const previewUrl = URL.createObjectURL(file);
                                                                setLocalAvatarPreview(prev => {
                                                                    if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
                                                                    return previewUrl;
                                                                });
                                                                login((prev: any) => prev ? { ...prev, avatar: previewUrl } : prev as any);
                                                            }
                                                        }
                                                    }}
                                                />

                                                {hasFile ? (
                                                    label === 'Profile Picture' ? (
                                                        <div className="border border-dashed border-gray-300 rounded-xl p-4 flex flex-col items-center justify-center bg-gray-50/50 hover:bg-gray-50 transition-colors h-full">
                                                            {localAvatarPreview ? (
                                                                <div className="relative cursor-pointer group/avatar" onClick={() => setLightboxFile({ url: localAvatarPreview, fileName: 'Profile Picture', fileType: 'png' })}>
                                                                    <img src={localAvatarPreview} alt="Preview" className="w-20 h-20 rounded-full object-cover border-2 border-indigo-300 shadow-md mb-2" />
                                                                    <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                                                                        <Eye className="text-white" size={18} />
                                                                    </div>
                                                                </div>
                                                            ) : existingFile ? (
                                                                <div className="relative cursor-pointer group/avatar" onClick={() => setLightboxFile({ url: apiHelpers.attachmentRaw(existingFile._id), fileName: existingFile.fileName, fileType: 'png' })}>
                                                                    <img src={apiHelpers.attachmentRaw(existingFile._id)} alt="Existing Profile" className="w-20 h-20 rounded-full object-cover border-2 border-indigo-300 shadow-md mb-2 opacity-80" />
                                                                    <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                                                                        <Eye className="text-white" size={18} />
                                                                    </div>
                                                                </div>
                                                            ) : null}
                                                            <span className="text-xs font-semibold text-gray-500 mb-2">{label}</span>
                                                            <div className="flex gap-2 w-full max-w-[150px]">
                                                                <label htmlFor={inputId} className="flex-1 text-center cursor-pointer text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded transition-colors">
                                                                    Change
                                                                </label>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        if (localAvatarPreview) {
                                                                            setLocalAvatarPreview(null);
                                                                            setFormData(p => ({ ...p, files: p.files.filter(f => f.type !== 'Profile Picture') }));
                                                                            const originalUrl = getAvatarUrl(rawEmployee);
                                                                            login((prev: any) => prev ? { ...prev, avatar: originalUrl } : prev as any);
                                                                        } else if (existingFile) {
                                                                            handleDeleteDocument(existingFile._id, existingFile.fileName);
                                                                        }
                                                                    }}
                                                                    className="flex-1 text-center text-[10px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded transition-colors"
                                                                >
                                                                    Delete
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <DocumentPreview
                                                            typeKey={label}
                                                            existingFile={existingFile}
                                                            localFile={localFileObj?.file}
                                                            inputId={inputId}
                                                            onPreview={(url, name, type) => setLightboxFile({ url, fileName: name, fileType: type })}
                                                            onRemove={() => {
                                                                if (localFileObj) {
                                                                    setFormData(p => ({ ...p, files: p.files.filter(f => f.type !== label) }));
                                                                } else if (existingFile) {
                                                                    handleDeleteDocument(existingFile._id, existingFile.fileName);
                                                                }
                                                            }}
                                                        />
                                                    )
                                                ) : (
                                                    <label htmlFor={inputId} className="border border-dashed border-gray-300 rounded-xl p-4 flex flex-col items-center justify-center bg-gray-50/50 hover:bg-gray-50 hover:border-indigo-400 cursor-pointer transition-colors h-full group">
                                                        <div className="p-2 bg-white rounded-full shadow-sm mb-2 text-indigo-500 group-hover:scale-110 transition-transform">
                                                            <Upload size={20} />
                                                        </div>
                                                        <span className="text-sm font-medium text-gray-600">{label}</span>
                                                        <span className="text-xs text-gray-400 mt-1">Click to upload</span>
                                                    </label>
                                                )}
                                            </div>
                                        );
                                    })}
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
                                        onChange={initialLockedFields.cnic && !canEditSensitiveData() ? undefined : handleChange}
                                        onBlur={(e) => handleFieldBlur('cnic', e.target.value)}
                                        placeholder="e.g. 12345-1234567-1"
                                        readOnly={initialLockedFields.cnic && !canEditSensitiveData()}
                                        className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 bg-white transition-all ${fieldErrors.cnic ? 'border-red-400 focus:border-red-400 focus:ring-red-100' : 'border-gray-300 focus:border-primary-500 focus:ring-primary-200'} ${initialLockedFields.cnic && !canEditSensitiveData() ? 'bg-gray-50 cursor-default select-none' : ''}`}
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
                                        onChange={initialLockedFields.dateOfBirth && !canEditSensitiveData() ? undefined : handleChange}
                                        max={new Date().toISOString().split('T')[0]}
                                        readOnly={initialLockedFields.dateOfBirth && !canEditSensitiveData()}
                                        className={`w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 bg-white transition-all ${initialLockedFields.dateOfBirth && !canEditSensitiveData() ? 'bg-gray-50 cursor-default select-none' : ''}`}
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
                                        onChange={initialLockedFields.fatherName && !canEditSensitiveData() ? undefined : handleChange}
                                        readOnly={initialLockedFields.fatherName && !canEditSensitiveData()}
                                        className={`w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 bg-white transition-all ${initialLockedFields.fatherName && !canEditSensitiveData() ? 'bg-gray-50 cursor-default select-none' : ''}`}
                                    />
                                    {initialLockedFields.fatherName && !canEditSensitiveData() && <p className="text-xs text-gray-500 mt-1">This field cannot be edited once filled</p>}
                                    {initialLockedFields.fatherName && canEditSensitiveData() && <p className="text-xs text-indigo-500 mt-1">Admin: This field can be edited</p>}
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-600">Nationality *</label>
                                    {initialLockedFields.nationality && !canEditSensitiveData() ? (
                                        <input
                                            type="text"
                                            name="nationality"
                                            value={formData.nationality}
                                            readOnly
                                            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm bg-gray-50 cursor-default select-none focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                                        />
                                    ) : (
                                        <CustomSelect
                                            label=""
                                            value={formData.nationality}
                                            onChange={(val) => setFormData({ ...formData, nationality: val })}
                                            options={countriesData.map(c => c.name)}
                                        />
                                    )}
                                    {initialLockedFields.nationality && !canEditSensitiveData() && <p className="text-xs text-gray-500 mt-1">This field cannot be edited once filled</p>}
                                    {initialLockedFields.nationality && canEditSensitiveData() && <p className="text-xs text-indigo-500 mt-1">Admin: This field can be edited</p>}
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-600">Domicile *</label>
                                    <input
                                        type="text"
                                        name="domicile"
                                        value={formData.domicile}
                                        onChange={handleChange}
                                        className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 bg-white transition-all"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-600">Blood Group</label>
                                    {initialLockedFields.bloodGroup && !canEditSensitiveData() ? (
                                        <input
                                            type="text"
                                            value={formData.bloodGroup}
                                            readOnly
                                            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm bg-gray-50 cursor-default select-none focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
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
                                    {initialLockedFields.religion && !canEditSensitiveData() ? (
                                        <input
                                            type="text"
                                            value={formData.religion}
                                            readOnly
                                            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm bg-gray-50 cursor-default select-none focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                                        />
                                    ) : (
                                        <CustomSelect 
                                            label="Religion *" 
                                            value={formData.religion} 
                                            onChange={(val) => setFormData({ ...formData, religion: val })} 
                                            options={['Islam', 'Christianity', 'Hinduism', 'Buddhism', 'Sikhism', 'Other']} 
                                        />
                                    )}
                                    {initialLockedFields.religion && !canEditSensitiveData() && <p className="text-xs text-gray-500 mt-1">This field cannot be edited once filled</p>}
                                    {initialLockedFields.religion && canEditSensitiveData() && <p className="text-xs text-indigo-500 mt-1">Admin: This field can be edited</p>}
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-600">License Number</label>
                                    <input type="text" name="licenseNumber" value={formData.licenseNumber} onChange={handleChange} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 bg-white transition-all" />
                                </div>
                                <div className="space-y-2">
                                    <CustomSelect label="Gender *" value={formData.gender} onChange={(val) => setFormData({ ...formData, gender: val })} options={['Male', 'Female', 'Other']} />
                                </div>
                                <div className="space-y-2">
                                    <CustomSelect label="Marital Status *" value={formData.maritalStatus} onChange={(val) => setFormData({ ...formData, maritalStatus: val })} options={['Single', 'Married', 'Divorced', 'Widowed', 'Other']} />
                                </div>
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
                                            <input
                                                type="text"
                                                name="simNumber"
                                                value={formData.simNumber}
                                                onChange={canEditJob ? handleChange : undefined}
                                                onBlur={canEditJob ? (e) => handleFieldBlur('simNumber', e.target.value) : undefined}
                                                readOnly={!canEditJob}
                                                placeholder="e.g. +92 301 9876543"
                                                className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition-all ${fieldErrors.simNumber ? 'border-red-400 focus:border-red-400 focus:ring-red-100' : 'border-gray-300 focus:border-primary-500 focus:ring-primary-200'} ${!canEditJob ? 'bg-gray-50 cursor-default select-none' : 'bg-white'}`}
                                            />
                                            {fieldErrors.simNumber && <p className="text-xs text-red-500 mt-1">{fieldErrors.simNumber}</p>}
                                            {!canEditJob && <p className="text-xs text-gray-500 mt-1">This field can only be updated by HR</p>}
                                            {canEditJob && <p className="text-xs text-indigo-500 mt-1">Admin: You can edit this field</p>}
                                        </div>
                                    </div>
                                </div>

                                <AddressForm
                                    title="Permanent Address"
                                    subtitle="Your official home / registered address"
                                    value={formData.address}
                                    onChange={(field, val) =>
                                        setFormData(prev => ({ ...prev, address: { ...prev.address, [field]: val } }))
                                    }
                                />

                                <AddressForm
                                    title="Temporary Address"
                                    subtitle="Your current / temporary residence (if different from permanent)"
                                    value={formData.temporaryAddress}
                                    onChange={(field, val) =>
                                        setFormData(prev => ({ ...prev, temporaryAddress: { ...prev.temporaryAddress, [field]: val } }))
                                    }
                                    disabled={isSameAddress}
                                    headerAction={
                                        <label className="flex items-center gap-2 cursor-pointer group">
                                            <div className="relative">
                                                <input
                                                    type="checkbox"
                                                    checked={isSameAddress}
                                                    onChange={(e) => {
                                                        const checked = e.target.checked;
                                                        setIsSameAddress(checked);
                                                        if (checked) copyPermanentAddress();
                                                    }}
                                                    className="sr-only"
                                                />
                                                <div className={`w-4 h-4 border-2 rounded transition-all flex items-center justify-center ${isSameAddress ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300 group-hover:border-indigo-400'}`}>
                                                    {isSameAddress && <Check size={10} className="text-white" strokeWidth={4} />}
                                                </div>
                                            </div>
                                            <span className="text-xs font-bold text-slate-500 group-hover:text-indigo-600 transition-colors uppercase tracking-wider">Same as Permanent</span>
                                        </label>
                                    }
                                />

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
                                                <RelationSelect
                                                    value={contact.relation}
                                                    onChange={(val) => handleChange({ target: { name: 'relation', value: val } } as any, 'emergencyContacts', idx, 'relation')}
                                                    options={['Father','Mother','Spouse','Son','Daughter','Brother','Sister','Grandfather','Grandmother','Uncle','Aunt','Cousin','Friend','Colleague','Guardian','Other']}
                                                />
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
                                                    <RelationSelect
                                                        value={dep.relation}
                                                        onChange={(val) => handleChange({ target: { name: 'relation', value: val } } as any, 'dependents', idx, 'relation')}
                                                        options={['Mother','Father','Spouse','Son','Daughter']}
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-xs font-medium text-gray-500">Date of Birth</label>
                                                    <input type="date" value={dep.dateOfBirth} onChange={(e) => handleChange(e, 'dependents', idx, 'dateOfBirth')} max={new Date().toISOString().split('T')[0]} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all text-gray-500" />
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
                                                    <CustomSelect
                                                        label=""
                                                        value={doc.issuingCountry}
                                                        onChange={(val) => handleChange({ target: { name: 'issuingCountry', value: val } } as any, 'immigrationHistory', idx, 'issuingCountry')}
                                                        options={countriesData.map(c => c.name)}
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="block text-xs font-medium text-gray-500">Issue Date</label>
                                                    <input 
                                                        type="date" 
                                                        name="issueDate" 
                                                        value={doc.issueDate} 
                                                        onChange={(e) => handleChange(e, 'immigrationHistory', idx, 'issueDate')} 
                                                        max={doc.expiryDate || new Date().toISOString().split('T')[0]}
                                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all text-gray-500" 
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="block text-xs font-medium text-gray-500">Expiry Date</label>
                                                    <input 
                                                        type="date" 
                                                        name="expiryDate" 
                                                        value={doc.expiryDate} 
                                                        onChange={(e) => handleChange(e, 'immigrationHistory', idx, 'expiryDate')} 
                                                        min={doc.issueDate || new Date().toISOString().split('T')[0]}
                                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all text-gray-500" 
                                                    />
                                                </div>
                                            </div>

                                            {/* Document Upload */}
                                            <div className="mt-3 pt-3 border-t border-gray-100">
                                                <div className="mt-3 pt-3 border-t border-gray-100">
                                                {(() => {
                                                    const typeKey = `Immigration - ${doc.documentNumber || idx}`;
                                                    const existingFile = rawEmployee?.attachments?.find((a: any) => a.fileType === typeKey);
                                                    const localFileObj = formData.files.find(f => f.type === typeKey);
                                                    const hasFile = !!existingFile || !!localFileObj;
                                                    const inputId = `file-input-${typeKey.replace(/[^a-zA-Z0-9-]/g, '-')}`;

                                                    return (
                                                        <div className="flex flex-col gap-2">
                                                            <input
                                                                type="file"
                                                                id={inputId}
                                                                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                                                                className="hidden"
                                                                onChange={(e) => {
                                                                    if (e.target.files && e.target.files.length > 0) {
                                                                        setFormData(prev => ({
                                                                            ...prev,
                                                                            files: [...prev.files.filter(f => f.type !== typeKey), { file: e.target.files![0], type: typeKey }]
                                                                        }));
                                                                    }
                                                                }}
                                                            />
                                                            {hasFile ? (
                                                                <DocumentPreview
                                                                    typeKey={typeKey}
                                                                    existingFile={existingFile}
                                                                    localFile={localFileObj?.file}
                                                                    inputId={inputId}
                                                                    onPreview={(url, name, type) => setLightboxFile({ url, fileName: name, fileType: type })}
                                                                    onRemove={() => {
                                                                        if (localFileObj) {
                                                                            setFormData(p => ({ ...p, files: p.files.filter(f => f.type !== typeKey) }));
                                                                        } else if (existingFile) {
                                                                            handleDeleteDocument(existingFile._id, existingFile.fileName);
                                                                        }
                                                                    }}
                                                                />
                                                            ) : (
                                                                <label htmlFor={inputId} className="flex items-center gap-2 cursor-pointer px-3 py-2 border border-dashed border-gray-300 rounded-lg bg-gray-50 hover:bg-white text-gray-500 hover:text-indigo-600 hover:border-indigo-300 transition-all text-xs w-full justify-center">
                                                                    <Upload size={14} className="pointer-events-none" />
                                                                    <span className="truncate pointer-events-none">Upload Document Scan (PDF / JPG / PNG)</span>
                                                                </label>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
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
                                    <CustomSelect
                                        label="Job Title"
                                        value={formData.jobInfo.designation}
                                        onChange={(val) => setFormData(prev => ({ ...prev, jobInfo: { ...prev.jobInfo, designation: val } }))}
                                        options={designations}
                                        disabled={!canEditJob}
                                    />
                                    {!canEditJob && (
                                        <p className="text-[10px] text-gray-500 flex items-center gap-1 mt-1">
                                            <Shield size={10} /> Locked for employees
                                        </p>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <CustomSelect
                                        label="Department"
                                        value={formData.jobInfo.department}
                                        onChange={(val) => setFormData(prev => ({ ...prev, jobInfo: { ...prev.jobInfo, department: val } }))}
                                        options={departments}
                                        disabled={!canEditJob}
                                    />
                                    {!canEditJob && (
                                        <p className="text-[10px] text-gray-500 flex items-center gap-1 mt-1">
                                            <Shield size={10} /> Locked for employees
                                        </p>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <CustomSelect
                                        label="Reporting Manager"
                                        value={formData.jobInfo.reportingManager}
                                        onChange={(val) => setFormData(prev => ({ ...prev, jobInfo: { ...prev.jobInfo, reportingManager: val } }))}
                                        options={employeesList}
                                        disabled={!canEditJob}
                                    />
                                    {!canEditJob && (
                                        <p className="text-[10px] text-gray-500 flex items-center gap-1 mt-1">
                                            <Shield size={10} /> Locked for employees
                                        </p>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-600">Work / Office Location</label>
                                    <input
                                        type="text"
                                        value={formData.jobInfo.workLocation}
                                        onChange={(e) => setFormData(prev => ({ ...prev, jobInfo: { ...prev.jobInfo, workLocation: e.target.value } }))}
                                        disabled={!canEditJob}
                                        placeholder="e.g. Karachi, Lahore Office, Islamabad Branch"
                                        className={`w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all ${disabledJobClass}`}
                                    />
                                    {!canEditJob && (
                                        <p className="text-[10px] text-gray-500 flex items-center gap-1 mt-1">
                                            <Shield size={10} /> Locked for employees
                                        </p>
                                    )}
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
                                    <CustomSelect
                                        label="Status"
                                        value={formData.employmentStatus.status}
                                        onChange={(val) => setFormData(prev => ({ ...prev, employmentStatus: { ...prev.employmentStatus, status: val } }))}
                                        options={['Probation', 'Permanent', 'Internship', 'Contract', 'Terminated', 'Resigned']}
                                        disabled={!canEditJob}
                                    />
                                    {!canEditJob && (
                                        <p className="text-[10px] text-gray-500 flex items-center gap-1 mt-1">
                                            <Shield size={10} /> Locked for employees
                                        </p>
                                    )}
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
                                                    <input type="date" value={eh.startDate} onChange={(e) => handleChange(e, 'employmentHistory', idx, 'startDate')} max={eh.endDate || new Date().toISOString().split('T')[0]} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all text-gray-500" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-xs font-medium text-gray-500">End Date</label>
                                                    <input type="date" value={eh.endDate} onChange={(e) => handleChange(e, 'employmentHistory', idx, 'endDate')} min={eh.startDate} max={new Date().toISOString().split('T')[0]} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all text-gray-500" />
                                                </div>
                                                <div className="space-y-1 md:col-span-2">
                                                    <label className="text-xs font-medium text-gray-500">Reason for Leaving</label>
                                                    <input type="text" value={eh.reasonForLeaving} onChange={(e) => handleChange(e, 'employmentHistory', idx, 'reasonForLeaving')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all" />
                                                </div>
                                                <div className="md:col-span-2 space-y-1 mt-2 pt-2 border-t border-gray-50">
                                                    <label className="text-xs font-medium text-gray-500 flex items-center gap-1">
                                                        Experience Letter <span className="text-red-500 font-bold">*</span>
                                                    </label>
                                                    <div className="flex items-center gap-2">
                                                        {(() => {
                                                            const typeKey = `Experience Letter - ${eh.companyName || idx}`;
                                                            const newFile = formData.files.find(f => f.type === typeKey);
                                                            const savedFile = rawEmployee?.attachments?.find((a: any) => a.fileType === typeKey);
                                                            const hasFile = !!newFile || !!savedFile;
                                                            const inputId = `file-input-${typeKey.replace(/[^a-zA-Z0-9-]/g, '-')}`;
                                                            return (
                                                                <div className="flex flex-col gap-2 w-full">
                                                                    <input
                                                                        type="file"
                                                                        id={inputId}
                                                                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                                                                        className="hidden"
                                                                        onChange={(e) => {
                                                                            if (e.target.files && e.target.files.length > 0) {
                                                                                setFormData(prev => ({
                                                                                    ...prev,
                                                                                    files: [...prev.files.filter(f => f.type !== typeKey), { file: e.target.files![0], type: typeKey }]
                                                                                }));
                                                                            }
                                                                        }}
                                                                    />
                                                                    {hasFile ? (
                                                                        <DocumentPreview
                                                                            typeKey={typeKey}
                                                                            existingFile={savedFile}
                                                                            localFile={newFile?.file}
                                                                            inputId={inputId}
                                                                            onPreview={(url, name, type) => setLightboxFile({ url, fileName: name, fileType: type })}
                                                                            onRemove={() => {
                                                                                if (newFile) {
                                                                                    setFormData(p => ({ ...p, files: p.files.filter(f => f.type !== typeKey) }));
                                                                                } else if (savedFile) {
                                                                                    handleDeleteDocument(savedFile._id, savedFile.fileName);
                                                                                }
                                                                            }}
                                                                        />
                                                                    ) : (
                                                                        <label htmlFor={inputId} className="flex items-center gap-2 cursor-pointer px-3 py-1.5 border border-dashed border-gray-300 rounded-lg bg-gray-50 hover:bg-white text-gray-500 hover:text-indigo-600 hover:border-indigo-300 transition-all text-xs w-full justify-center animate-fade-in">
                                                                            <Upload size={14} className="pointer-events-none" />
                                                                            <span className="truncate pointer-events-none">Upload Experience Letter</span>
                                                                        </label>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
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
                                                        {(() => {
                                                            const typeKey = `Degree - ${edu.level || idx}`;
                                                            const newFile = formData.files.find(f => f.type === typeKey);
                                                            const savedFile = rawEmployee?.attachments?.find((a: any) => a.fileType === typeKey);
                                                            const hasFile = !!newFile || !!savedFile;
                                                            const inputId = `file-input-${typeKey.replace(/[^a-zA-Z0-9-]/g, '-')}`;
                                                            return (
                                                                <div className="flex flex-col gap-2 w-full">
                                                                    <input
                                                                        type="file"
                                                                        id={inputId}
                                                                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                                                                        className="hidden"
                                                                        onChange={(e) => {
                                                                            if (e.target.files && e.target.files.length > 0) {
                                                                                setFormData(prev => ({
                                                                                    ...prev,
                                                                                    files: [...prev.files.filter(f => f.type !== typeKey), { file: e.target.files![0], type: typeKey }]
                                                                                }));
                                                                            }
                                                                        }}
                                                                    />
                                                                    {hasFile ? (
                                                                        <DocumentPreview
                                                                            typeKey={typeKey}
                                                                            existingFile={savedFile}
                                                                            localFile={newFile?.file}
                                                                            inputId={inputId}
                                                                            onPreview={(url, name, type) => setLightboxFile({ url, fileName: name, fileType: type })}
                                                                            onRemove={() => {
                                                                                if (newFile) {
                                                                                    setFormData(p => ({ ...p, files: p.files.filter(f => f.type !== typeKey) }));
                                                                                } else if (savedFile) {
                                                                                    handleDeleteDocument(savedFile._id, savedFile.fileName);
                                                                                }
                                                                            }}
                                                                        />
                                                                    ) : (
                                                                        <label htmlFor={inputId} className="flex items-center gap-2 cursor-pointer px-3 py-1.5 border border-dashed border-gray-300 rounded-lg bg-gray-50 hover:bg-white text-gray-500 hover:text-indigo-600 hover:border-indigo-300 transition-all text-xs w-full justify-center animate-fade-in">
                                                                            <Upload size={14} className="pointer-events-none" />
                                                                            <span className="truncate pointer-events-none">Upload Degree/Transcript Scan</span>
                                                                        </label>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}
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
                                                    placeholder="Add a professional skill"
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
                                                                showToast('Please provide a valid LinkedIn link or username.', 'error');
                                                                val = '';
                                                            } else if (platform === 'github' && !val.includes('github.com')) {
                                                                showToast('Please provide a valid GitHub link or username.', 'error');
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

                                {/* Certifications */}
                                <div>
                                    <div className="flex justify-between items-center mb-4 mt-8">
                                        <h3 className="text-lg font-medium text-gray-700">Certifications</h3>
                                        <button onClick={() => setFormData(p => ({ ...p, certifications: [...p.certifications, { title: '' }] }))} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 border border-indigo-200 transition-all shadow-sm">
                                            + Add Certification
                                        </button>
                                    </div>
                                    {formData.certifications.map((cert, idx) => (
                                        <div key={idx} className="mb-4 p-5 border border-gray-100 rounded-xl bg-white shadow-sm hover:shadow-md transition-all relative group">
                                            <div className="flex justify-end mb-2">
                                                <button
                                                    onClick={() => {
                                                        setFormData(p => ({ 
                                                            ...p, 
                                                            certifications: p.certifications.filter((_, i) => i !== idx),
                                                            files: p.files.filter(f => f.type !== `Certification - ${idx}`)
                                                        }));
                                                    }}
                                                    className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded-md hover:bg-red-50"
                                                    title="Delete Entry"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-1">
                                                    <label className="text-xs font-medium text-gray-500">Certification Title</label>
                                                    <input
                                                        type="text"
                                                        value={cert.title}
                                                        onChange={(e) => {
                                                            const newCerts = [...formData.certifications];
                                                            newCerts[idx].title = e.target.value;
                                                            setFormData(p => ({ ...p, certifications: newCerts }));
                                                        }}
                                                        placeholder="e.g. AWS Certified Solutions Architect"
                                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 outline-none transition-all"
                                                    />
                                                </div>
                                                <div className="space-y-1 mt-2 pt-2 border-t md:border-none md:mt-0 md:pt-0 border-gray-50">
                                                    <label className="text-xs font-medium text-gray-500 md:opacity-0 hidden md:block">Upload</label>
                                                    <div className="flex items-center gap-2">
                                                        {(() => {
                                                            const typeKey = `Certification - ${idx}`;
                                                            const newFile = formData.files.find(f => f.type === typeKey);
                                                            const savedFile = rawEmployee?.attachments?.find((a: any) => a.fileType === typeKey);
                                                            const hasFile = !!newFile || !!savedFile;
                                                            const inputId = `file-input-${typeKey.replace(/[^a-zA-Z0-9-]/g, '-')}`;
                                                            return (
                                                                <div className="flex flex-col gap-2 w-full">
                                                                    <input
                                                                        type="file"
                                                                        id={inputId}
                                                                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                                                                        className="hidden"
                                                                        onChange={(e) => {
                                                                            if (e.target.files && e.target.files.length > 0) {
                                                                                setFormData(prev => ({
                                                                                    ...prev,
                                                                                    files: [...prev.files.filter(f => f.type !== typeKey), { file: e.target.files![0], type: typeKey }]
                                                                                }));
                                                                            }
                                                                        }}
                                                                    />
                                                                    {hasFile ? (
                                                                        <DocumentPreview
                                                                            typeKey={typeKey}
                                                                            existingFile={savedFile}
                                                                            localFile={newFile?.file}
                                                                            inputId={inputId}
                                                                            onPreview={(url, name, type) => setLightboxFile({ url, fileName: name, fileType: type })}
                                                                            onRemove={() => {
                                                                                if (newFile) {
                                                                                    setFormData(p => ({ ...p, files: p.files.filter(f => f.type !== typeKey) }));
                                                                                } else if (savedFile) {
                                                                                    handleDeleteDocument(savedFile._id, savedFile.fileName);
                                                                                }
                                                                            }}
                                                                        />
                                                                    ) : (
                                                                        <label htmlFor={inputId} className="flex items-center gap-2 cursor-pointer px-3 py-1.5 border border-dashed border-gray-300 rounded-lg bg-gray-50 hover:bg-white text-gray-500 hover:text-indigo-600 hover:border-indigo-300 transition-all text-xs w-full justify-center animate-fade-in">
                                                                            <Upload size={14} className="pointer-events-none" />
                                                                            <span className="truncate pointer-events-none">Upload Cert Scan</span>
                                                                        </label>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {formData.certifications.length === 0 && (
                                        <div className="text-center py-6 text-sm text-gray-400">
                                            No certifications added yet. Click "+ Add Certification" to start.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Step 7: Finance */}
                        {step === 7 && (
                            <div className="space-y-8 animate-slide-up pb-20">
                                {/* Salary Structure */}
                                {isAdmin && (
                                    <div>
                                        {/* Salary & Employment Terms */}
                                        <div className="mb-8 p-6 bg-slate-50 rounded-2xl border border-slate-200 shadow-xs">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                                                <div>
                                                    <h4 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Salary & Employment Terms</h4>
                                                    <p className="text-xs text-gray-500 mt-0.5 font-medium">Select whether this employee is hired directly or under probation</p>
                                                </div>
                                                
                                                {/* Dropdown Style Plan Selector */}
                                                <div className="w-full sm:w-80">
                                                    <select
                                                        value={salaryPlanType}
                                                        onChange={(e) => {
                                                            const newType = e.target.value as 'direct' | 'probation';
                                                            setSalaryPlanType(newType);
                                                            if (newType === 'direct') {
                                                                const currentSalary = formData.financeInfo?.confirmedSalary || formData.financeInfo?.probationSalary || 0;
                                                                setFormData(prev => ({
                                                                    ...prev,
                                                                    financeInfo: {
                                                                        ...prev.financeInfo,
                                                                        probationSalary: currentSalary,
                                                                        confirmedSalary: currentSalary,
                                                                        probationMonths: 0,
                                                                        probationDays: 0
                                                                    }
                                                                }));
                                                            } else {
                                                                setFormData(prev => ({
                                                                    ...prev,
                                                                    financeInfo: {
                                                                        ...prev.financeInfo,
                                                                        probationMonths: prev.financeInfo?.probationMonths || 3,
                                                                        probationDays: prev.financeInfo?.probationDays || 90
                                                                    }
                                                                }));
                                                            }
                                                        }}
                                                        className="w-full bg-white border border-indigo-200 text-indigo-950 font-bold text-xs rounded-xl px-3.5 py-2.5 shadow-xs focus:ring-2 focus:ring-indigo-300 outline-none cursor-pointer"
                                                    >
                                                        <option value="direct">💼 Direct / Confirmed Salary (Permanent)</option>
                                                        <option value="probation">⏳ Probationary Terms (Probation → Confirmed)</option>
                                                    </select>
                                                </div>
                                            </div>

                                            {salaryPlanType === 'direct' ? (
                                                /* Single Clean Direct Salary Field */
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-200/70">
                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                                                            Direct Monthly Salary (PKR) <span className="text-rose-500">*</span>
                                                        </label>
                                                        <div className="relative">
                                                            <input
                                                                type="number"
                                                                value={formData.financeInfo?.confirmedSalary || ''}
                                                                onChange={(e) => {
                                                                    const val = Number(e.target.value);
                                                                    setFormData(prev => ({
                                                                        ...prev,
                                                                        financeInfo: {
                                                                            ...prev.financeInfo,
                                                                            confirmedSalary: val,
                                                                            probationSalary: val,
                                                                            probationMonths: 0,
                                                                            probationDays: 0
                                                                        }
                                                                    }));
                                                                }}
                                                                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-base focus:ring-2 focus:ring-indigo-200 outline-none bg-white font-black text-slate-900"
                                                                placeholder="e.g. 150000"
                                                            />
                                                        </div>
                                                        <p className="text-[11px] text-slate-500 mt-1.5 font-medium">
                                                            Standard monthly gross base salary for permanent / confirmed staff.
                                                        </p>
                                                    </div>
                                                </div>
                                            ) : (
                                                /* Probation Terms Breakdown Fields */
                                                <div className="pt-4 border-t border-slate-200/70">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                                        <div>
                                                            <label className="block text-xs font-bold text-amber-800 uppercase tracking-wider mb-2">Probation Salary (PKR)</label>
                                                            <input
                                                                type="number"
                                                                value={formData.financeInfo?.probationSalary || ''}
                                                                onChange={(e) => setFormData(prev => ({
                                                                    ...prev,
                                                                    financeInfo: {
                                                                        ...prev.financeInfo,
                                                                        probationSalary: Number(e.target.value)
                                                                    }
                                                                }))}
                                                                className="w-full border border-amber-300 bg-amber-50/50 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-amber-200 outline-none font-bold text-slate-800"
                                                                placeholder="e.g. 120000"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2">Confirmed Salary (PKR)</label>
                                                            <input
                                                                type="number"
                                                                value={formData.financeInfo?.confirmedSalary || ''}
                                                                onChange={(e) => setFormData(prev => ({
                                                                    ...prev,
                                                                    financeInfo: {
                                                                        ...prev.financeInfo,
                                                                        confirmedSalary: Number(e.target.value)
                                                                    }
                                                                }))}
                                                                className="w-full border border-emerald-300 bg-emerald-50/50 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-200 outline-none font-bold text-slate-800"
                                                                placeholder="e.g. 150000"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Probation (Months)</label>
                                                            <input
                                                                type="number"
                                                                value={formData.financeInfo?.probationMonths ?? 3}
                                                                onChange={(e) => {
                                                                    const months = Number(e.target.value);
                                                                    setFormData(prev => ({
                                                                        ...prev,
                                                                        financeInfo: {
                                                                            ...prev.financeInfo,
                                                                            probationMonths: months,
                                                                            probationDays: months * 30
                                                                        }
                                                                    }));
                                                                }}
                                                                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-200 outline-none bg-white font-bold text-slate-800"
                                                                placeholder="3"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Probation (Days)</label>
                                                            <input
                                                                type="number"
                                                                value={formData.financeInfo?.probationDays ?? 90}
                                                                onChange={(e) => setFormData(prev => ({
                                                                    ...prev,
                                                                    financeInfo: {
                                                                        ...prev.financeInfo,
                                                                        probationDays: Number(e.target.value)
                                                                    }
                                                                }))}
                                                                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-200 outline-none bg-white font-bold text-slate-800"
                                                                placeholder="90"
                                                            />
                                                        </div>
                                                    </div>
                                                    <p className="text-[11px] text-amber-800 bg-amber-50 p-2.5 rounded-xl mt-3 font-medium border border-amber-200/60">
                                                        ⏳ Employee will start at Probation Salary and automatically switch to Confirmed Salary upon probation completion.
                                                    </p>
                                                </div>
                                            )}
                                        </div>

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
                                                const commonOptions = salaryComponentOptions;
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
                                
                                {/* Provident Fund Details (Admin Only) */}
                                {isAdmin && (
                                    <div className="pt-8 border-t border-slate-100">
                                        <h3 className="text-lg font-bold text-gray-700 mb-6 flex items-center gap-2">
                                            <Banknote size={20} className="text-emerald-500" />
                                            Provident Fund Details
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <label className="text-xs font-medium text-gray-500">Provident Fund Balance (Rs.)</label>
                                                </div>
                                                <input
                                                    type="number"
                                                    placeholder="e.g. 150000"
                                                    value={formData.providentFundBalance || ''}
                                                    onChange={(e) => setFormData(p => ({ ...p, providentFundBalance: Number(e.target.value) }))}
                                                    className="w-full border rounded-lg px-4 py-2 text-sm outline-none transition-all border-gray-300 focus:ring-2 focus:ring-indigo-200"
                                                />
                                                <p className="text-[11px] text-slate-400 mt-1">Enter or update the employee's PF balance. Manual changes will be recorded in their PF history log.</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {isAdmin && (
                                    <div className="pt-8 border-t border-slate-100">
                                        <div className="flex justify-between items-center mb-6">
                                            <div>
                                                <h3 className="text-lg font-bold text-gray-700">Company Benefits</h3>
                                                <p className="text-sm text-gray-500">Assign specific benefits to this employee</p>
                                            </div>
                                            <button
                                                onClick={() => setFormData(p => ({
                                                    ...p,
                                                    benefits: [...p.benefits, { name: '', description: '', eligibleDate: '', status: 'Active' }]
                                                }))}
                                                className="text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2"
                                            >
                                                <Plus size={16} /> Add Benefit
                                            </button>
                                        </div>
                                        
                                        <div className="space-y-4">
                                            {formData.benefits.map((benefit, index) => (
                                                <div key={index} className="grid grid-cols-1 md:grid-cols-5 gap-4 p-5 bg-slate-50 border border-slate-200 rounded-2xl relative group hover:border-indigo-200 transition-all animate-fadeIn">
                                                    
                                                    <div className="space-y-1 col-span-1 md:col-span-1 border-r border-slate-200 pr-4">
                                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Benefit Name</label>
                                                        <input
                                                            type="text"
                                                            placeholder="Insurance..."
                                                            value={benefit.name}
                                                            onChange={(e) => {
                                                                const newBenefits = [...formData.benefits];
                                                                newBenefits[index].name = e.target.value;
                                                                setFormData(p => ({ ...p, benefits: newBenefits }));
                                                            }}
                                                            className="w-full bg-transparent border-none text-indigo-900 font-bold focus:ring-0 p-0 text-sm placeholder-indigo-200"
                                                        />
                                                    </div>

                                                    <div className="space-y-1 col-span-1 md:col-span-2">
                                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Description</label>
                                                        <input
                                                            type="text"
                                                            placeholder="Details..."
                                                            value={benefit.description}
                                                            onChange={(e) => {
                                                                const newBenefits = [...formData.benefits];
                                                                newBenefits[index].description = e.target.value;
                                                                setFormData(p => ({ ...p, benefits: newBenefits }));
                                                            }}
                                                            className="w-full border-none bg-white rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-100 outline-none"
                                                        />
                                                    </div>

                                                    <div className="space-y-1 col-span-1 md:col-span-1">
                                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Eligible Date</label>
                                                        <input
                                                            type="date"
                                                            value={benefit.eligibleDate}
                                                            onChange={(e) => {
                                                                const newBenefits = [...formData.benefits];
                                                                newBenefits[index].eligibleDate = e.target.value;
                                                                setFormData(p => ({ ...p, benefits: newBenefits }));
                                                            }}
                                                            className="w-full border-none bg-white rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-100 outline-none text-gray-600 font-medium"
                                                        />
                                                    </div>
                                                    
                                                    <div className="space-y-1 col-span-1 md:col-span-1 relative pr-10">
                                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</label>
                                                        <select
                                                            value={benefit.status}
                                                            onChange={(e: any) => {
                                                                const newBenefits = [...formData.benefits];
                                                                newBenefits[index].status = e.target.value;
                                                                setFormData(p => ({ ...p, benefits: newBenefits }));
                                                            }}
                                                            className="w-full border-none bg-white rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-100 outline-none font-bold text-slate-700"
                                                        >
                                                            <option value="Active">Active</option>
                                                            <option value="Pending">Pending</option>
                                                            <option value="Expired">Expired</option>
                                                        </select>

                                                        <button
                                                            onClick={() => {
                                                                const newBenefits = formData.benefits.filter((_, i) => i !== index);
                                                                setFormData(p => ({ ...p, benefits: newBenefits }));
                                                            }}
                                                            className="absolute top-1/2 -translate-y-1/2 right-0 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            {formData.benefits.length === 0 && (
                                                <div className="text-center py-6 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                                                    <p className="text-sm text-slate-400 italic">No benefits assigned. Click "+ Add Benefit" to start.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {isAdmin && (
                                    <div className="pt-8 border-t border-slate-100">
                                        <div className="flex justify-between items-center mb-6">
                                            <div>
                                                <h3 className="text-lg font-bold text-gray-700">Salary Revision History</h3>
                                                <p className="text-sm text-gray-500">Log past and current salary changes for historical tracking</p>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const sortedHist = [...formData.salaryHistory].sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime());
                                                    const lastBalance = sortedHist.length > 0 ? sortedHist[0].amount : 0;
                                                    setFormData(p => ({
                                                        ...p,
                                                        salaryHistory: [...p.salaryHistory, { 
                                                            effectiveDate: new Date().toISOString().split('T')[0], 
                                                            amount: p.salaryComponents.reduce((sum: number, c: any) => sum + (c.amount || 0), 0), 
                                                            changeType: sortedHist.length === 0 ? 'Joining Salary' : 'Increment', 
                                                            reason: '',
                                                            previousAmount: lastBalance
                                                        }]
                                                    }));
                                                }}
                                                className="text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2"
                                            >
                                                <Plus size={16} /> Add History Entry
                                            </button>
                                        </div>

                                        <div className="space-y-4">
                                            {formData.salaryHistory.map((hist: any, index: number) => (
                                                <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-4 p-5 bg-slate-50 border border-slate-200 rounded-2xl relative group hover:border-indigo-200 transition-all">
                                                    <div className="space-y-1">
                                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Effective Date</label>
                                                        <input
                                                            type="date"
                                                            value={hist.effectiveDate}
                                                            onChange={(e) => {
                                                                const newHist = [...formData.salaryHistory];
                                                                newHist[index].effectiveDate = e.target.value;
                                                                setFormData(p => ({ ...p, salaryHistory: newHist }));
                                                            }}
                                                            className="w-full border-none bg-white rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-100 outline-none text-gray-600 font-medium"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Type / Category</label>
                                                        <select
                                                            value={hist.changeType}
                                                            onChange={(e) => {
                                                                const newHist = [...formData.salaryHistory];
                                                                newHist[index].changeType = e.target.value;
                                                                setFormData(p => ({ ...p, salaryHistory: newHist }));
                                                            }}
                                                            className="w-full border-none bg-white rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-100 outline-none font-bold text-slate-700"
                                                        >
                                                            <option value="Increment">Increment</option>
                                                            <option value="Probation Completion">Probation Completion</option>
                                                            <option value="Joining Salary">Joining Salary</option>
                                                            <option value="Promotion">Promotion</option>
                                                            <option value="Market Adjustment">Market Adjustment</option>
                                                            <option value="Bonus / Other">Bonus / Other</option>
                                                        </select>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Gross Amount</label>
                                                        <input
                                                            type="number"
                                                            value={hist.amount}
                                                            onChange={(e) => {
                                                                const newHist = [...formData.salaryHistory];
                                                                newHist[index].amount = Number(e.target.value);
                                                                setFormData(p => ({ ...p, salaryHistory: newHist }));
                                                            }}
                                                            className="w-full border-none bg-white rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-100 outline-none font-black text-indigo-600"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Prev. Amount (Optional)</label>
                                                        <input
                                                            type="number"
                                                            value={hist.previousAmount || ''}
                                                            onChange={(e) => {
                                                                const newHist = [...formData.salaryHistory];
                                                                newHist[index].previousAmount = Number(e.target.value);
                                                                setFormData(p => ({ ...p, salaryHistory: newHist }));
                                                            }}
                                                            className="w-full border-none bg-white rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-100 outline-none text-slate-500"
                                                        />
                                                    </div>
                                                    <div className="space-y-1 relative pr-10 md:col-span-1">
                                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Reason / Remarks</label>
                                                        <input
                                                            type="text"
                                                            placeholder="Performance based..."
                                                            value={hist.reason}
                                                            onChange={(e) => {
                                                                const newHist = [...formData.salaryHistory];
                                                                newHist[index].reason = e.target.value;
                                                                setFormData(p => ({ ...p, salaryHistory: newHist }));
                                                            }}
                                                            className="w-full border-none bg-white rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-100 outline-none"
                                                        />
                                                        <button
                                                            onClick={() => {
                                                                const newHist = formData.salaryHistory.filter((_, i) => i !== index);
                                                                setFormData(p => ({ ...p, salaryHistory: newHist }));
                                                            }}
                                                            className="absolute top-1/2 -translate-y-1/2 right-0 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            {formData.salaryHistory.length === 0 && (
                                                <div className="text-center py-6 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                                                    <p className="text-sm text-slate-400 italic">No historical records. Add a entry to track salary changes.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
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
                                            <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Your Saved Documents</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                {rawEmployee.attachments.map((file: any, i: number) => {
                                                    const hasLocalOverride = formData.files.some(f => f.type === file.fileType);
                                                    if (hasLocalOverride) return null; // Render the staged draft instead

                                                    const url = apiHelpers.attachmentRaw(file._id);
                                                    const extension = file.fileName.split('.').pop()?.toLowerCase() || '';
                                                    const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(extension);
                                                    const isPdf = extension === 'pdf';
                                                    const inputId = `replace-file-input-${file._id}`;

                                                    return (
                                                        <div key={i} className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-sm flex flex-col gap-3 group relative transition-all duration-300 hover:shadow-md hover:border-indigo-200 animate-fade-in">
                                                            {/* Hidden Replace Input */}
                                                            <input
                                                                type="file"
                                                                id={inputId}
                                                                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                                                                className="hidden"
                                                                onChange={(e) => {
                                                                    if (e.target.files && e.target.files.length > 0) {
                                                                        setFormData(prev => ({
                                                                            ...prev,
                                                                            files: [...prev.files.filter(f => f.type !== file.fileType), { file: e.target.files![0], type: file.fileType }]
                                                                        }));
                                                                    }
                                                                }}
                                                            />
                                                            {/* Thumbnail */}
                                                            <div 
                                                                onClick={() => setLightboxFile({ url, fileName: file.fileName, fileType: extension })}
                                                                className="w-full h-24 bg-slate-50 border border-slate-100 rounded-lg overflow-hidden flex items-center justify-center relative cursor-pointer"
                                                            >
                                                                {isImage ? (
                                                                    <img src={url} alt={file.fileName} className="w-full h-full object-cover group-hover:scale-105 transition-all duration-300" />
                                                                ) : isPdf ? (
                                                                    <div className="flex flex-col items-center gap-1 text-rose-500 font-medium">
                                                                        <FileText size={24} />
                                                                        <span className="text-[9px] uppercase font-bold tracking-wider">PDF</span>
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex flex-col items-center gap-1 text-slate-400 font-medium">
                                                                        <FileText size={24} />
                                                                        <span className="text-[9px] uppercase font-bold tracking-wider">File</span>
                                                                    </div>
                                                                )}
                                                                <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                                    <span className="text-white text-[10px] font-bold flex items-center gap-1 bg-slate-950/30 px-2.5 py-1 rounded-full backdrop-blur-sm">
                                                                        <Eye size={12} /> Preview
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            {/* Info */}
                                                            <div className="min-w-0">
                                                                <p className="text-[11px] font-bold text-slate-700 truncate" title={file.fileName}>{file.fileName}</p>
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    <span className="text-[8px] font-bold text-indigo-500 uppercase tracking-wider">{file.fileType}</span>
                                                                    {file.status === 'approved' && <span className="text-[8px] text-emerald-600 font-bold px-1 bg-emerald-50 rounded italic">Approved</span>}
                                                                    {file.status === 'pending' && <span className="text-[8px] text-amber-600 font-bold px-1 bg-amber-50 rounded italic">Pending Review</span>}
                                                                </div>
                                                            </div>

                                                            {/* Actions */}
                                                            <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] font-bold mt-auto gap-2">
                                                                <label 
                                                                    htmlFor={inputId}
                                                                    className="flex-1 text-center cursor-pointer text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100/80 px-2 py-1 rounded transition-colors"
                                                                >
                                                                    Change
                                                                </label>
                                                                {!( (file.fileType === 'Contract' || file.fileType === 'Signed Contract') && !isAdmin) && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDeleteDocument(file._id, file.fileName)}
                                                                        className="flex-1 text-center text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100/80 px-2 py-1 rounded transition-colors"
                                                                    >
                                                                        Delete
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Upload Grid */}
                                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Upload New Documents</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/* Document Categories */}
                                        {(['Signed Contract', 'Other Documents'] as string[]).map((label) => {
                                            const existingFile = rawEmployee?.attachments?.find((a: any) => a.fileType === label);
                                            const localFiles = formData.files.filter(f => f.type === label);
                                            const hasFile = (label === 'Signed Contract' && (!!existingFile || localFiles.length > 0));
                                            const inputId = `file-input-${label.replace(/[^a-zA-Z0-9-]/g, '-')}`;

                                            if (hasFile && label === 'Signed Contract') {
                                                const localFileObj = localFiles[0];
                                                return (
                                                    <div key={label} className="flex flex-col gap-2">
                                                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</span>
                                                        <input
                                                            type="file"
                                                            id={inputId}
                                                            accept=".pdf,.doc,.docx,.jpg,.png"
                                                            className="hidden"
                                                            onChange={(e) => {
                                                                if (e.target.files && e.target.files.length > 0) {
                                                                    setFormData(prev => ({
                                                                        ...prev,
                                                                        files: [...prev.files.filter(f => f.type !== label), { file: e.target.files![0], type: label }]
                                                                    }));
                                                                }
                                                            }}
                                                        />
                                                        <DocumentPreview
                                                            typeKey={label}
                                                            existingFile={existingFile}
                                                            localFile={localFileObj?.file}
                                                            inputId={inputId}
                                                            onPreview={(url, name, type) => setLightboxFile({ url, fileName: name, fileType: type })}
                                                            onRemove={() => {
                                                                if (localFileObj) {
                                                                    setFormData(p => ({ ...p, files: p.files.filter(f => f.type !== label) }));
                                                                } else if (existingFile) {
                                                                    handleDeleteDocument(existingFile._id, existingFile.fileName);
                                                                }
                                                            }}
                                                        />
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div key={label} className="flex flex-col gap-4">
                                                    <div className="border border-dashed border-gray-300 rounded-2xl p-6 flex flex-col items-center justify-center bg-gray-50/50 hover:bg-white hover:border-indigo-400 hover:shadow-xl hover:shadow-indigo-50 transition-all relative group cursor-pointer h-full min-h-[160px]">
                                                        <input
                                                            type="file"
                                                            id={inputId}
                                                            multiple={label === 'Other Documents'}
                                                            accept=".pdf,.doc,.docx,.jpg,.png"
                                                            className="absolute inset-0 opacity-0 cursor-pointer z-20"
                                                            onChange={(e) => {
                                                                if (e.target.files && e.target.files.length > 0) {
                                                                    const newFiles = Array.from(e.target.files);
                                                                    if (label === 'Other Documents') {
                                                                        const currentOtherDocsCount = formData.files.filter(f => f.type === label).length;
                                                                        if (currentOtherDocsCount + newFiles.length > 5) {
                                                                            setLimitModalOpen(true);
                                                                            return;
                                                                        }
                                                                        setFormData(prev => ({
                                                                            ...prev,
                                                                            files: [...prev.files, ...newFiles.map(f => ({ file: f, type: label }))]
                                                                        }));
                                                                    } else {
                                                                        const file = newFiles[0];
                                                                        setFormData(prev => ({
                                                                            ...prev,
                                                                            files: [...prev.files.filter(f => f.type !== label), { file: file, type: label }]
                                                                        }));
                                                                    }
                                                                }
                                                            }}
                                                        />
                                                        <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center mb-4 text-indigo-500 group-hover:scale-110 group-hover:rotate-3 transition-all relative z-0">
                                                            <Upload size={28} />
                                                        </div>
                                                        <span className="text-sm font-bold text-gray-700 relative z-0">{label}</span>
                                                        {label === 'Signed Contract' && !isAdmin && (
                                                            <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest mt-1 relative z-0">Required *</span>
                                                        )}
                                                        {label === 'Signed Contract' && isAdmin && (
                                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1 relative z-0">Optional</span>
                                                        )}
                                                        {label === 'Other Documents' && (
                                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1 relative z-0">Click to upload (Max 5)</span>
                                                        )}
                                                    </div>

                                                    {/* Local Staged Lists */}
                                                    {label === 'Other Documents' && localFiles.length > 0 && (
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                                                            {localFiles.map((fObj, localIdx) => (
                                                                <DocumentPreview
                                                                    key={localIdx}
                                                                    typeKey={label}
                                                                    localFile={fObj.file}
                                                                    onPreview={(url, name, type) => setLightboxFile({ url, fileName: name, fileType: type })}
                                                                    onRemove={() => {
                                                                        setFormData(p => ({
                                                                            ...p,
                                                                            files: p.files.filter(fItem => fItem !== fObj)
                                                                        }));
                                                                    }}
                                                                />
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
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
                                        onClick={() => handleSubmit(false, true)}
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
                                    <div className="flex flex-col items-end gap-2">
                                        {!isStep8RequiredValid() && (
                                            <div className="text-[10px] font-bold text-red-500 uppercase tracking-widest bg-red-50 px-3 py-1 rounded-lg border border-red-100 flex items-center gap-1.5 animate-bounce">
                                                <AlertCircle size={12} /> Required: {getStep8RequiredErrors().join(', ')}
                                            </div>
                                        )}
                                        <button
                                            onClick={() => handleSubmit(true, false)}
                                            disabled={saving || !isStep8RequiredValid()}
                                            className={`px-8 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2 shadow-sm ${ (saving || !isStep8RequiredValid()) ? 'opacity-50 cursor-not-allowed bg-gray-300 text-gray-500' : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white hover:shadow-md'}`}
                                        >
                                            <Save size={18} /> {saving ? 'Saving...' : 'Save Information'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Delete Confirmation Modal */}
            {deleteModal.isOpen && createPortal(
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
            , document.body)}

            {/* Limit Modal */}
            {limitModalOpen && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden animate-scaleIn border border-white/20">
                        <div className="p-8 text-center">
                            <div className="w-20 h-20 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                                <AlertCircle size={40} />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-800 mb-2">Upload Limit Reached</h3>
                            <p className="text-gray-500 text-sm">You can only upload a maximum of 5 Other Documents.</p>
                        </div>
                        <div className="px-8 pb-8 pt-2 flex justify-center text-sm font-bold">
                            <button
                                onClick={() => setLimitModalOpen(false)}
                                className="px-8 py-3 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-500/30 hover:scale-105 transition-all text-sm font-bold w-full"
                            >
                                Got it
                            </button>
                        </div>
                    </div>
                </div>
            , document.body)}

            {/* Lightbox Modal */}
            {lightboxFile && createPortal(
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fade-in">
                    <div className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-scale-up">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                            <div className="min-w-0">
                                <h3 className="text-sm font-bold text-slate-800 truncate" title={lightboxFile.fileName}>
                                    {lightboxFile.fileName}
                                </h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                                    {lightboxFile.fileType} Document
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <a
                                    href={lightboxFile.url}
                                    download={lightboxFile.fileName}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                                    title="Download / Open in New Tab"
                                >
                                    <Download size={18} />
                                </a>
                                <button
                                    onClick={() => setLightboxFile(null)}
                                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                                    title="Close"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Content Body */}
                        <div className="flex-1 bg-slate-900/5 flex items-center justify-center p-6 overflow-auto min-h-[300px]">
                            {['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(lightboxFile.fileType.toLowerCase()) ? (
                                <img 
                                    src={lightboxFile.url} 
                                    alt={lightboxFile.fileName} 
                                    className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-md bg-white" 
                                />
                            ) : lightboxFile.fileType.toLowerCase() === 'pdf' ? (
                                <iframe 
                                    src={lightboxFile.url} 
                                    className="w-full h-[70vh] rounded-lg border border-slate-200/50 shadow-sm bg-white" 
                                    title={lightboxFile.fileName} 
                                />
                            ) : (
                                <div className="text-center p-8 max-w-sm">
                                    <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-200/50 shadow-inner">
                                        <FileText size={32} />
                                    </div>
                                    <h4 className="text-sm font-bold text-slate-700 mb-1">Preview not supported</h4>
                                    <p className="text-xs text-slate-400 mb-6">
                                        This document type ({lightboxFile.fileType.toUpperCase()}) cannot be previewed directly in the browser.
                                    </p>
                                    <a
                                        href={lightboxFile.url}
                                        download={lightboxFile.fileName}
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

            {/* 4-Digit Salary Security PIN Modal */}
            <SalaryPinModal
                isOpen={showSalaryPinModal}
                onClose={() => setShowSalaryPinModal(false)}
                onSuccess={handleSalaryUnlockSuccess}
                title="Verify 4-Digit Salary PIN"
                description="Enter your 4-digit PIN to securely view your confidential salary & PF details."
            />
        </div>
    );
};

export default MyInfo;
