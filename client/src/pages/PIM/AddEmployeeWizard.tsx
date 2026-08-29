import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Save, Upload, Check, X, User, Briefcase, FileText, Trash2, Globe, Users, GraduationCap, CreditCard, Banknote, Plus, Download, AlertCircle, Eye, Shield, Lock, Unlock} from 'lucide-react';
import CustomSelect from '../../components/UI/CustomSelect';
import AddressForm from '../../components/UI/AddressForm';
import RelationSelect from '../../components/UI/RelationSelect';
import DeleteModal from '../../components/UI/DeleteModal';
import SalaryPinModal from '../../components/UI/SalaryPinModal';

import countriesData from '../../data/countries.json';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import { attendanceApi } from '../../modules/attendance/api/attendanceApi';
import { DEFAULT_EMPLOYEE_SALARY_COMPONENTS } from '../../utils/defaultSalaryComponents';
import EntryAttachmentsEditor from '../../components/PIM/EntryAttachmentsEditor';
import { EMPLOYMENT_STATUS_OPTIONS } from '../../utils/employmentStatus';

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

    const url = localFile ? localUrl : (existingFile ? api.attachmentRaw(existingFile._id) : null);
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

const AddEmployeeWizard = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const isEditMode = !!id;
    const { user: authUser, login } = useAuth();
    const { showToast } = useToast();
    const { canEditSensitiveData, canCreateUser, role } = usePermissions();
    const isAdmin = ['super-admin', 'admin', 'hr', 'manager'].includes(role);
    const canEditFinancials = ['super-admin', 'finance', 'hr'].includes(role);
    const [isFinancialUnlocked, setIsFinancialUnlocked] = useState(false);
    const [showMasterPinModal, setShowMasterPinModal] = useState(false);
    const [step, setStep] = useState(1);
    const [isSameAddress, setIsSameAddress] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [completedSteps, setCompletedSteps] = useState<number[]>([]);
    const [showCompletion, setShowCompletion] = useState<number | null>(null);
    const [showMissingModal, setShowMissingModal] = useState(false);
    const [missingFieldsList, setMissingFieldsList] = useState<string[]>([]);
    const [pendingNextStep, setPendingNextStep] = useState<number | null>(null);
    const [lightboxFile, setLightboxFile] = useState<{
        url: string;
        fileName: string;
        fileType: string;
    } | null>(null);
    const [initialLockedFields, setInitialLockedFields] = useState<{ [key: string]: boolean }>({});
    const [stepErrors, setStepErrors] = useState<string[]>([]);
    const [employeesList, setEmployeesList] = useState<{ value: string; label: string }[]>([]);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [limitModalOpen, setLimitModalOpen] = useState(false);
    const [departments, setDepartments] = useState<{ value: string; label: string }[]>([]);
    const [designations, setDesignations] = useState<{ value: string; label: string }[]>([]);
    const [salaryComponentOptions, setSalaryComponentOptions] = useState<string[]>([
        "Basic Salary", "Medical Allowance", "HRA", "Conveyance Allowance", "Fuel Allowance", "Bonus", "Special Allowance", "Utilities"
    ]);
    const [availableShifts, setAvailableShifts] = useState<{ value: string; label: string }[]>([]);
    const [locations, setLocations] = useState<{ value: string; label: string }[]>([]);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [attachmentToDelete, setAttachmentToDelete] = useState<any>(null);
    const [salaryPlanType, setSalaryPlanType] = useState<'direct' | 'probation'>('direct');


    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const token = localStorage.getItem('token');
                const [deptRes, desigRes, salaryCompRes, locs] = await Promise.all([
                    fetch(`${api.config}/departments`, { headers: { 'Authorization': `Bearer ${token}` } }),
                    fetch(`${api.config}/designations`, { headers: { 'Authorization': `Bearer ${token}` } }),
                    fetch(`${api.config}/salary-components?activeOnly=true&type=earning`, { headers: { 'Authorization': `Bearer ${token}` } }),
                    attendanceApi.getLocations()
                ]);
                
                if (deptRes.ok) {
                    const data = await deptRes.json();
                    setDepartments(data.filter((d: any) => d.isActive).map((d: any) => ({ value: d.name, label: d.name })));
                }
                if (desigRes.ok) {
                    const data = await desigRes.json();
                    setDesignations(data.filter((d: any) => d.isActive).map((d: any) => ({ value: d.name, label: d.name })));
                }
                if (salaryCompRes.ok) {
                    const data = await salaryCompRes.json();
                    if (Array.isArray(data) && data.length > 0) {
                        setSalaryComponentOptions(data.map((c: any) => c.name));
                    }
                }
                if (locs) {
                    setLocations(locs.map((l: string) => ({ value: l, label: l })));
                }
            } catch (err) {
                console.error('Failed to fetch config', err);
            }
        };
        fetchConfig();
    }, []);
    useEffect(() => {
        const fetchShifts = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await fetch(api.workShifts, { headers: { 'Authorization': `Bearer ${token}` } });
                if (res.ok) {
                    const data = await res.json();
                    setAvailableShifts(data.filter((s: any) => s.isActive).map((s: any) => ({ 
                        value: s._id, 
                        label: `${s.name} (${s.startTime}-${s.endTime})` 
                    })));
                }
            } catch (err) {
                console.error('Failed to fetch shifts', err);
            }
        };
        fetchShifts();
    }, []);

    useEffect(() => {
        const fetchEmployees = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await fetch(api.employeesDropdown, { headers: { 'Authorization': `Bearer ${token}` } });
                if (res.ok) {
                    const data = await res.json();
                    setEmployeesList(Array.isArray(data) ? data : []);
                }
            } catch (err) {
                console.error('Failed to fetch employees list for dropdown', err);
            }
        };
        fetchEmployees();
    }, []);

    // Required fields on step 1 (Personal) – must be filled before Next
    const isStep1RequiredValid = () => {
        const hasProfilePicture = formData.files.some(f => f.type === 'Profile Picture') || formData.existingAttachments.some(a => a.fileType === 'Profile Picture') || !!avatarPreview;
        const hasCNICFront = formData.files.some(f => f.type === 'CNIC Front') || formData.existingAttachments.some(a => a.fileType === 'CNIC Front');
        const hasCNICBack = formData.files.some(f => f.type === 'CNIC Back') || formData.existingAttachments.some(a => a.fileType === 'CNIC Back');
        const hasResume = formData.files.some(f => f.type === 'Resume/CV') || formData.existingAttachments.some(a => a.fileType === 'Resume/CV');

        // Text fields strictly required for EVERYONE
        const hasCoreFields = !!(
            formData.firstName?.trim() &&
            formData.lastName?.trim()
        );

        // If admin, they only need first and last name
        if (isAdmin) {
            return hasCoreFields;
        }

        // Additional text fields for Employees
        const hasExtendedFields = !!(
            formData.cnic?.trim() &&
            formData.dateOfBirth &&
            formData.fatherName?.trim() &&
            formData.religion?.trim() &&
            formData.nationality?.trim() &&
            formData.domicile?.trim() &&
            formData.gender &&
            formData.maritalStatus
        );

        // Files are only rigidly required upon First Time creation, not during future edits
        if (!isEditMode) {
            return hasCoreFields && hasExtendedFields && hasProfilePicture && hasCNICFront && hasCNICBack && hasResume;
        }

        return hasCoreFields && hasExtendedFields;
    };

    const getMissingFields = (s: number = step): string[] => {
        const missing: string[] = [];
        const check = (val: any, label: string) => { if (!val || (typeof val === 'string' && val.trim() === '')) missing.push(label); };
        
        switch (s) {
            case 1:
                check(formData.firstName, 'First Name');
                check(formData.lastName, 'Last Name');
                check(formData.cnic, 'CNIC / Govt ID');
                check(formData.dateOfBirth, 'Date of Birth');
                check(formData.fatherName, 'Father Name');
                check(formData.gender, 'Gender');
                check(formData.maritalStatus, 'Marital Status');
                check(formData.religion, 'Religion');
                check(formData.nationality, 'Nationality');
                check(formData.domicile, 'Domicile');
                break;
            case 2:
                check(formData.phone, 'Phone Number');
                check(formData.email, 'Email Address');
                check(formData.address.street, 'Street Address');
                check(formData.address.city, 'City');
                check(formData.address.state, 'State');
                check(formData.address.country, 'Country');
                if (formData.emergencyContacts.some(c => !c.name || !c.phone || !c.relation)) missing.push('Complete Emergency Contacts');
                if (formData.dependents.some(d => !d.name || !d.relation || !d.dateOfBirth)) missing.push('Complete Dependents Info');
                break;
            case 3:
                if (formData.immigrationHistory.some(doc => !doc.documentNumber || !doc.issueDate || !doc.expiryDate)) missing.push('Complete Immigration Docs');
                break;
            case 4:
                check(formData.jobInfo.designation, 'Designation');
                check(formData.jobInfo.department, 'Department');
                check(formData.jobInfo.joiningDate, 'Joining Date');
                break;
            case 5:
                if (!isAdmin) {
                    if (formData.employmentHistory.some((h) => h.companyName || h.jobTitle || h.startDate)) {
                        if (formData.employmentHistory.some((h) => (h.companyName || h.jobTitle || h.startDate) && (!h.companyName || !h.jobTitle || !h.startDate))) {
                            missing.push('Complete Employment History fields');
                        }
                    }
                    if (formData.education.some((e) => e.level || e.institute || e.year)) {
                        if (formData.education.some((e) => (e.level || e.institute || e.year) && (!e.level || !e.institute || !e.year))) {
                            missing.push('Complete Education fields');
                        }
                    }
                }
                break;
            case 6:
                if (formData.skills.length === 0) missing.push('Professional Skills');
                if (formData.socialProfiles.every(p => !p.link)) missing.push('At least one Social Profile');
                break;
            case 7:
                if (isAdmin) {
                    check(formData.bankDetails.bankName, 'Bank Name');
                    check(formData.bankDetails.accountName, 'Account Name');
                    check(formData.bankDetails.accountNumber, 'Account Number');
                }
                break;
            case 8:
                // Admin Finance step handled above; no contract requirement for admins
                break;
        }
        return missing;
    };

    const getStep1RequiredErrors = (): string[] => {
        const err: string[] = [];
        const hasProfilePicture = formData.files.some(f => f.type === 'Profile Picture') || formData.existingAttachments.some(a => a.fileType === 'Profile Picture') || !!avatarPreview;
        const hasCNICFront = formData.files.some(f => f.type === 'CNIC Front') || formData.existingAttachments.some(a => a.fileType === 'CNIC Front');
        const hasCNICBack = formData.files.some(f => f.type === 'CNIC Back') || formData.existingAttachments.some(a => a.fileType === 'CNIC Back');
        const hasResume = formData.files.some(f => f.type === 'Resume/CV') || formData.existingAttachments.some(a => a.fileType === 'Resume/CV');

        // Core required fields for both Admin and Employee
        if (!formData.firstName?.trim()) err.push('First Name');
        if (!formData.lastName?.trim()) err.push('Last Name');

        // Only enforce additional strict validation if it is NOT an admin
        if (!isAdmin) {
            if (!formData.cnic?.trim()) err.push('CNIC / Govt ID');
            if (!formData.dateOfBirth) err.push('Date of Birth');
            if (!formData.fatherName?.trim()) err.push('Father Name');
            if (!formData.religion?.trim()) err.push('Religion');
            if (!formData.nationality?.trim()) err.push('Nationality');
            if (!formData.domicile?.trim()) err.push('Domicile');
            if (!formData.gender) err.push('Gender');
            if (!formData.maritalStatus) err.push('Marital Status');

            if (!isEditMode) {
                if (!hasProfilePicture) err.push('Profile Picture');
                if (!hasResume) err.push('Resume/CV');
                if (!hasCNICFront) err.push('CNIC Front Image');
                if (!hasCNICBack) err.push('CNIC Back Image');
            }
        }

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
        employeeId: '', biometricPin: '', firstName: '', lastName: '', middleName: '', cnic: '',
        email: '', phone: '', dateOfBirth: '', gender: '',
        maritalStatus: '', nationality: '', domicile: '', fatherName: '', bloodGroup: '',
        religion: '', licenseNumber: '', simNumber: '', workEmail: '', otherEmail: '',
        userId: '', // Link to the Auth User ID

        // Address
        address: { street: '', city: '', state: '', zipCode: '', country: '' },
        temporaryAddress: { street: '', city: '', state: '', zipCode: '', country: '' },

        // Job
        jobInfo: {
            designation: '', department: '', reportingManager: '', workLocation: '', joiningDate: '', shift: ''
        },

        // Status
        employmentStatus: { status: 'Probation', autoUpdated: false, probationEndDate: '', offboardingDate: '' },

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
        existingAttachments: [] as any[],

        // Phase 2: Supplemental
        skills: [] as string[],
        certifications: [] as { title: string }[],
        socialProfiles: [
            { platform: 'LinkedIn', link: '' },
            { platform: 'GitHub', link: '' },
            { platform: 'Portfolio', link: '' }
        ],
        salaryComponents: DEFAULT_EMPLOYEE_SALARY_COMPONENTS.map(c => ({ ...c })),
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
        benefits: [] as { name: string; description: string; eligibleDate: string; status: 'Active' | 'Pending' | 'Expired' }[],
        salaryHistory: [] as { effectiveDate: string; amount: number; changeType: string; reason: string; previousAmount: number }[],
        providentFundBalance: 0
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
                            biometricPin: found.biometricPin || found.employeeId || '', // Default to employeeId if pin missing
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
                            domicile: found.domicile || '',
                            fatherName: found.fatherName || '',
                            bloodGroup: found.bloodGroup || '',
                            religion: found.religion || '',
                            licenseNumber: found.licenseNumber || '',
                            simNumber: found.simNumber || '',
                            workEmail: found.workEmail || '',
                            otherEmail: found.otherEmail || '',
                            userId: found.userId || '',

                            // Address
                            address: {
                                street: found.address?.street || '',
                                city: found.address?.city || '',
                                state: found.address?.state || '',
                                zipCode: found.address?.zipCode || '',
                                country: found.address?.country || ''
                            },
                            temporaryAddress: {
                                street: found.temporaryAddress?.street || '',
                                city: found.temporaryAddress?.city || '',
                                state: found.temporaryAddress?.state || '',
                                zipCode: found.temporaryAddress?.zipCode || '',
                                country: found.temporaryAddress?.country || ''
                            },

                            // Job Info
                            jobInfo: {
                                designation: found.jobInfo?.designation || '',
                                department: found.jobInfo?.department || '',
                                reportingManager: found.jobInfo?.reportingManager || '',
                                workLocation: found.jobInfo?.workLocation || '',
                                joiningDate: formatDate(found.jobInfo?.joiningDate),
                                shift: found.jobInfo?.shift || ''
                            },

                            // Employment Status
                            employmentStatus: typeof found.employmentStatus === 'string'
                                ? { status: found.employmentStatus, autoUpdated: false, probationEndDate: '', offboardingDate: '' }
                                : {
                                    status: found.employmentStatus?.status || 'Probation',
                                    autoUpdated: found.employmentStatus?.autoUpdated || false,
                                    probationEndDate: formatDate(found.employmentStatus?.probationEndDate),
                                    offboardingDate: formatDate(found.employmentStatus?.offboardingDate)
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

                            // Files 
                            files: [],
                            existingAttachments: found.attachments || [],

                            // Supplemental info
                            skills: found.skills || [],
                            certifications: found.certifications?.length ? found.certifications : [],
                            socialProfiles: found.socialProfiles?.length ? found.socialProfiles : [
                                { platform: 'LinkedIn', link: '' },
                                { platform: 'GitHub', link: '' },
                                { platform: 'Portfolio', link: '' }
                            ],
                            salaryComponents: (found.salaryComponents && found.salaryComponents.length > 0) ? found.salaryComponents : DEFAULT_EMPLOYEE_SALARY_COMPONENTS.map(c => ({ ...c })),
                            bankDetails: found.bankDetails || {
                                bankName: '',
                                accountName: '',
                                accountNumber: '',
                                iban: '',
                                swiftCode: ''
                            },
                            financeInfo: {
                                probationSalary: found.financeInfo?.probationSalary || 0,
                                confirmedSalary: found.financeInfo?.confirmedSalary || 0,
                                probationMonths: found.financeInfo?.probationMonths || 0,
                                probationDays: found.financeInfo?.probationDays || 0
                            },
                            benefits: found.benefits?.length
                                ? found.benefits.map((b: any) => ({
                                    name: b.name || '',
                                    description: b.description || '',
                                    eligibleDate: formatDate(b.eligibleDate),
                                    status: b.status || 'Active'
                                }))
                                : [],
                            salaryHistory: found.salaryHistory?.length
                                ? found.salaryHistory.map((sh: any) => ({
                                    ...sh,
                                    effectiveDate: formatDate(sh.effectiveDate)
                                }))
                                : [],
                            providentFundBalance: found.providentFundBalance || 0
                        });

                        // Track fields that were already filled to lock them for non-admins
                        setInitialLockedFields({
                            cnic: !!found.cnic,
                            dateOfBirth: !!found.dateOfBirth,
                            fatherName: !!found.fatherName,
                            nationality: !!found.nationality,
                            domicile: !!found.domicile,
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
 
    // Pre-fill for New Employees (Onboarding)
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const isOnboarding = params.get('onboarding') === 'true';

        if (!isEditMode && authUser && isOnboarding) {
            setFormData(prev => ({
                ...prev,
                workEmail: authUser.email || '',
                firstName: authUser.firstName || '',
                lastName: authUser.lastName || '',
                email: '' // Keep personal email empty by default
            }));
        }
    }, [isEditMode, authUser]);

    const handleChange = (e: any, section?: string, index?: number, subfield?: string) => {
        const { name, value } = e.target;

        if (section === 'address') {
            setFormData(prev => ({ ...prev, address: { ...prev.address, [name]: value } }));
        } else if (section === 'temporaryAddress') {
            setFormData(prev => ({ ...prev, temporaryAddress: { ...prev.temporaryAddress, [name]: value } }));
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
    
    const copyPermanentAddress = () => {
        setFormData(prev => ({
            ...prev,
            temporaryAddress: { ...prev.address }
        }));
    };

    const handleSubmit = async (shouldNavigate = true, isBackground = false) => {
        if (!isBackground) setLoading(true);
        setError(null);

        try {
            const token = localStorage.getItem('token');
            if (!token) {
                setError('You must be logged in to submit. Please log in and try again.');
                if (!isBackground) setLoading(false);
                return;
            }

            // Check permission to create employees
            if (!isEditMode && !canCreateUser()) {
                setError('You do not have permission to create employees.');
                if (!isBackground) setLoading(false);
                return;
            }

            // 1. Create or Update Employee (without files - files are uploaded separately)
            const { files, ...employeeData } = formData;

            // Automatically link the authenticated user's ID if they are creating their own onboarding record
            const params = new URLSearchParams(window.location.search);
            if (!isEditMode && authUser?.id && params.get('onboarding') === 'true') {
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

            // 2. Upload Files (Parallelize for speed)
            if (files.length > 0) {
                const uploadPromises = files.map(async (fileObj) => {
                    try {
                        const fileData = new FormData();
                        fileData.append('file', fileObj.file);
                        fileData.append('fileType', fileObj.type || 'Document');

                        const fileResponse = await fetch(api.employeeAttachments(employeeId), {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}` },
                            body: fileData
                        });

                        if (fileResponse.ok && fileObj.type === 'Profile Picture') {
                            const attachment = await fileResponse.json();
                            const isSelf = 
                                formData.userId === authUser?.id || 
                                formData.workEmail === authUser?.email || 
                                formData.email === authUser?.email;

                            if (isSelf) {
                                const newUrl = `${api.baseURL}/api/employees/attachments/raw/${attachment._id}?token=${token}&t=${Date.now()}`;
                                login((prev: any) => prev ? { ...prev, avatar: newUrl } : prev as any);
                            }
                        }
                        return true;
                    } catch (e) {
                        console.error('File upload failed', e);
                        return false;
                    }
                });

                if (isBackground) {
                    // Don't await in background mode
                    Promise.all(uploadPromises).then(() => {
                        console.log('Background file uploads complete');
                        setSaveSuccess(true);
                        setTimeout(() => setSaveSuccess(false), 2000);
                    });
                } else {
                    await Promise.all(uploadPromises);
                }
                
                // Add the newly uploaded files to existing attachments locally
                setFormData(prev => {
                    const newExisting = [...prev.existingAttachments];
                    prev.files.forEach(f => {
                        newExisting.push({
                            _id: 'temp-' + Date.now() + Math.random(),
                            fileType: f.type,
                            fileName: f.file.name
                        });
                    });
                    return { ...prev, existingAttachments: newExisting, files: [] };
                });
            }


            // Update initialLockedFields after successful save
            setInitialLockedFields({
                cnic: !!employeeData.cnic,
                dateOfBirth: !!employeeData.dateOfBirth,
                fatherName: !!employeeData.fatherName,
                nationality: !!employeeData.nationality,
                domicile: !!employeeData.domicile,
                bloodGroup: !!employeeData.bloodGroup
            });

            // Success - navigate if requested and not in background
            if (shouldNavigate && !isBackground) {
                const params = new URLSearchParams(window.location.search);
                if (params.get('onboarding') === 'true') {
                    navigate('/dashboard');
                } else {
                    navigate('/pim');
                }
            } else if (!isBackground) {
                setSaveSuccess(true);
                setTimeout(() => setSaveSuccess(false), 2000);
            } else if (isBackground && files.length === 0) {
                // Instantly show success if no files were pending
                setSaveSuccess(true);
                setTimeout(() => setSaveSuccess(false), 1500);
            }
            return savedEmp;
        } catch (error: any) {
            console.error('Error submitting form:', error);
            setError(error.message || 'Failed to submit employee. Please try again.');
        } finally {
            if (!isBackground) setLoading(false);
        }
    };

    const steps = [
        { id: 1, title: 'Personal', icon: User },
        { id: 2, title: 'Contact & Dependents', icon: Users },
        { id: 3, title: 'Immigration', icon: Globe },
        { id: 4, title: 'Job & Status', icon: Briefcase },
        { id: 5, title: 'History & Education', icon: GraduationCap },
        { id: 6, title: 'Skills & Profiles', icon: User },
        ...(isAdmin ? [
            { id: 7, title: 'Finance', icon: CreditCard },
        ] : []),
        { id: isAdmin ? 8 : 7, title: 'Documents', icon: FileText }
    ];

    const handleNext = async () => {
        // On step 1, require essential fields
        if (step === 1) {
            if (!isStep1RequiredValid()) {
                setStepErrors(getStep1RequiredErrors());
                return;
            }
            setStepErrors([]);
        }

        // Determine if we need to await the save (Creation on Step 1 needs the Returned ID)
        const isCreationOnStep1 = !isEditMode && step === 1;

        if (formData.firstName && formData.lastName) {
            if (isCreationOnStep1) {
                // Must await for ID to continue
                const savedEmp = await handleSubmit(false, false);
                if (!savedEmp) return;

                if (savedEmp.employeeId) {
                    const params = new URLSearchParams(window.location.search);
                    const query = params.get('onboarding') === 'true' ? '?onboarding=true' : '';
                    navigate(`/pim/edit/${savedEmp.employeeId}${query}`, { replace: true });
                }
            } else {
                // Background save - don't await, just fire and move on!
                handleSubmit(false, true);
            }
        }

        if (step < steps.length) {
            const nextStep = Math.min(steps.length, step + 1);
            const missing = getMissingFields(step);
            
            // If there are missing fields, we show a modal but allow skipping
            if (missing.length > 0) {
                setMissingFieldsList(missing);
                setPendingNextStep(nextStep);
                setShowMissingModal(true);
                return;
            }
            processNextStep(nextStep);
        }
    };

    const processNextStep = (targetStepId: number) => {
        if (!completedSteps.includes(step)) {
            setCompletedSteps([...completedSteps, step]);
            setShowCompletion(step);
            setTimeout(() => setShowCompletion(null), 2000);
        }
        setStep(targetStepId);
        setShowMissingModal(false);
        setPendingNextStep(null);
    };

    const confirmDeleteAttachment = async () => {
        if (!attachmentToDelete) return;
        const token = localStorage.getItem('token');
        const res = await fetch(`${api.employees}/${id}/attachments/${attachmentToDelete._id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            setFormData(p => ({
                ...p,
                existingAttachments: p.existingAttachments.filter((a: any) => a._id !== attachmentToDelete._id)
            }));
            setShowDeleteModal(false);
            setAttachmentToDelete(null);
        }
    };


    const handleStepClick = async (targetStepId: number) => {
        // If clicking the current step, do nothing
        if (targetStepId === step) return;

        // If jumping forward from step 1, validate it first
        if (step === 1 && targetStepId > 1) {
            if (!isStep1RequiredValid()) {
                setStepErrors(getStep1RequiredErrors());
                return;
            }
            setStepErrors([]);
            const result = await handleSubmit(false);
            if (!result) return;
        }



        const missing = getMissingFields(step);
        if (missing.length > 0 && targetStepId > step) {
            setMissingFieldsList(missing);
            setPendingNextStep(targetStepId);
            setShowMissingModal(true);
            return;
        }

        processNextStep(targetStepId);
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

                {steps.map((s) => {
                    const isCompleted = step > s.id;
                    const isCurrent = step === s.id;
                    return (
                        <div key={s.id} className="flex flex-col items-center relative z-10 cursor-pointer group" onClick={() => handleStepClick(s.id)}>
                            {/* Step Circle with Completion Animation */}
                            <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-500 shadow-md relative group-hover:shadow-lg group-hover:scale-105 active:scale-95 ${isCompleted
                                ? 'bg-gradient-to-r from-emerald-500 to-green-500 text-white scale-110 ring-4 ring-emerald-200'
                                : isCurrent
                                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white scale-110 ring-4 ring-indigo-200'
                                    : 'bg-slate-200 text-slate-500 scale-100 hover:bg-slate-300'
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

                {stepErrors.length > 0 && (
                    <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl animate-fadeIn">
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

                {/* Step 1: Personal Details */}
                {step === 1 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-slide-up pb-20">
                        {/* New Upload Fields for Step 1 */}
                        <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-4">
                            {/* Profile Picture — with preview (#13) */}
                        {['Profile Picture', 'Resume/CV', 'CNIC Front', 'CNIC Back'].map((label) => {
                                    const existingFile = formData.existingAttachments?.find(a => a.fileType === label);
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
                                                            setAvatarPreview(previewUrl);
                                                        }
                                                    }
                                                }}
                                            />

                                            {hasFile ? (
                                                label === 'Profile Picture' ? (
                                                    <div className="border border-dashed border-gray-300 rounded-xl p-4 flex flex-col items-center justify-center bg-gray-50/50 hover:bg-gray-50 transition-colors h-full">
                                                        {avatarPreview ? (
                                                            <div className="relative cursor-pointer group/avatar" onClick={() => setLightboxFile({ url: avatarPreview, fileName: 'Profile Picture', fileType: 'png' })}>
                                                                <img src={avatarPreview} alt="Preview" className="w-20 h-20 rounded-full object-cover border-2 border-indigo-300 shadow-md mb-2" />
                                                                <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                                                                    <Eye className="text-white" size={18} />
                                                                </div>
                                                            </div>
                                                        ) : existingFile ? (
                                                            <div className="relative cursor-pointer group/avatar" onClick={() => setLightboxFile({ url: api.attachmentRaw(existingFile._id), fileName: existingFile.fileName, fileType: 'png' })}>
                                                                    <img src={api.attachmentRaw(existingFile._id)} alt="Existing Profile" className="w-20 h-20 rounded-full object-cover border-2 border-indigo-300 shadow-md mb-2 opacity-80" />
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
                                                                    if (avatarPreview) {
                                                                        setAvatarPreview(null);
                                                                        setFormData(p => ({ ...p, files: p.files.filter(f => f.type !== 'Profile Picture') }));
                                                                    } else if (existingFile) {
                                                                        setAttachmentToDelete(existingFile);
                                                                        setShowDeleteModal(true);
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
                                                                setAttachmentToDelete(existingFile);
                                                                setShowDeleteModal(true);
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
                        {/* Employee ID - Admin Only */}
                        {isAdmin && (
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-600">Employee ID</label>
                                <input 
                                    type="text" 
                                    name="employeeId" 
                                    value={formData.employeeId} 
                                    disabled={true}
                                    placeholder="Auto-generated (e.g. itcs-001)"
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-gray-50 cursor-not-allowed outline-none transition-all" 
                                />
                                <p className="text-[10px] text-gray-400">This ID is automatically generated by the system.</p>
                            </div>
                        )}
                        {/* First and Last Name */}
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
                                max={new Date().toISOString().split('T')[0]}
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
                            {initialLockedFields.nationality && !canEditSensitiveData() ? (
                                <input
                                    type="text"
                                    name="nationality"
                                    value={formData.nationality}
                                    disabled
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-gray-50 cursor-not-allowed"
                                />
                            ) : (
                                <CustomSelect
                                    label=""
                                    value={formData.nationality}
                                    onChange={(val) => setFormData({ ...formData, nationality: val })}
                                    options={countriesData.map(c => c.name)}
                                />
                            )}
                            {initialLockedFields.nationality && !canEditSensitiveData() && <p className="text-xs text-gray-500">This field cannot be edited once filled</p>}
                            {initialLockedFields.nationality && canEditSensitiveData() && <p className="text-xs text-indigo-500">Admin: This field can be edited</p>}
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-600">Domicile *</label>
                            <input
                                type="text"
                                name="domicile"
                                value={formData.domicile}
                                onChange={handleChange}
                                disabled={initialLockedFields.domicile && !canEditSensitiveData()}
                                className={`w-full border border-gray-300 rounded px-3 py-2 text-sm ${initialLockedFields.domicile && !canEditSensitiveData() ? 'bg-gray-50 cursor-not-allowed' : ''}`}
                            />
                            {initialLockedFields.domicile && !canEditSensitiveData() && <p className="text-xs text-gray-500">This field cannot be edited once filled</p>}
                            {initialLockedFields.domicile && canEditSensitiveData() && <p className="text-xs text-indigo-500">Admin: This field can be edited</p>}
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
                            <CustomSelect 
                                label="Religion *" 
                                value={formData.religion} 
                                onChange={(val) => setFormData({ ...formData, religion: val })} 
                                options={['Islam', 'Christianity', 'Hinduism', 'Buddhism', 'Sikhism', 'Other']} 
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-600">License Number</label>
                            <input type="text" name="licenseNumber" value={formData.licenseNumber} onChange={handleChange} className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all" />
                        </div>
                        <div className="space-y-2">
                            <CustomSelect label="Gender *" value={formData.gender} onChange={(val) => setFormData({ ...formData, gender: val })} options={['Male', 'Female', 'Other']} />
                        </div>
                        <div className="space-y-2">
                            <CustomSelect label="Marital Status *" value={formData.maritalStatus} onChange={(val) => setFormData({ ...formData, maritalStatus: val })} options={['Single', 'Married', 'Divorced', 'Widowed', 'Other']} />
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

                        <AddressForm
                            title="Permanent Address"
                            subtitle="Official home / registered address"
                            value={formData.address}
                            onChange={(field, val) =>
                                setFormData(prev => ({ ...prev, address: { ...prev.address, [field]: val } }))
                            }
                            inputClass="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all bg-white"
                        />

                        <AddressForm
                            title="Temporary Address"
                            subtitle="Current / temporary residence (if different)"
                            value={formData.temporaryAddress}
                            onChange={(field, val) =>
                                setFormData(prev => ({ ...prev, temporaryAddress: { ...prev.temporaryAddress, [field]: val } }))
                            }
                            inputClass="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all bg-white"
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
                                            <RelationSelect
                                                value={dep.relation}
                                                onChange={(val) => handleChange({ target: { name: 'relation', value: val } } as any, 'dependents', idx, 'relation')}
                                                options={['Mother','Father','Spouse','Son','Daughter']}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-medium text-gray-500">Date of Birth</label>
                                            <input type="date" value={dep.dateOfBirth ? dep.dateOfBirth.split('T')[0] : ''} onChange={(e) => handleChange(e, 'dependents', idx, 'dateOfBirth')} max={new Date().toISOString().split('T')[0]} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all text-gray-500" />
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
                                            <label className="text-xs font-medium text-gray-500">Issue Date</label>
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
                                            <label className="text-xs font-medium text-gray-500">Expiry Date</label>
                                            <input 
                                                type="date" 
                                                name="expiryDate" 
                                                value={doc.expiryDate} 
                                                onChange={(e) => handleChange(e, 'immigrationHistory', idx, 'expiryDate')} 
                                                min={doc.issueDate || new Date().toISOString().split('T')[0]}
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all text-gray-500" 
                                            />
                                        </div>

                                        {/* Document Upload */}
                                        <div className="md:col-span-2 lg:col-span-3 space-y-1 mt-2 pt-2 border-t border-gray-50">
                                            <div className="md:col-span-2 lg:col-span-3 space-y-1 mt-2 pt-2 border-t border-gray-50">
                                            {(() => {
                                                const typeKey = `Immigration - ${doc.documentNumber || idx}`;
                                                const existingFile = formData.existingAttachments?.find(a => a.fileType === typeKey);
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
                                                                        setAttachmentToDelete(existingFile);
                                                                        setShowDeleteModal(true);
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
                                <CustomSelect 
                                    label="Job Title" 
                                    value={formData.jobInfo.designation} 
                                    onChange={(val) => setFormData(p => ({ ...p, jobInfo: { ...p.jobInfo, designation: val } }))} 
                                    options={designations} 
                                    placeholder="Select Designation"
                                />
                            </div>
                            <div className="space-y-2">
                                <CustomSelect 
                                    label="Department" 
                                    value={formData.jobInfo.department} 
                                    onChange={(val) => setFormData(p => ({ ...p, jobInfo: { ...p.jobInfo, department: val } }))} 
                                    options={departments} 
                                    placeholder="Select Department"
                                />
                            </div>
                            <div className="space-y-2">
                                <CustomSelect label="Employment Status" value={formData.employmentStatus.status} onChange={(val) => setFormData(p => ({ ...p, employmentStatus: { ...p.employmentStatus, status: val } }))} options={[...EMPLOYMENT_STATUS_OPTIONS]} />
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
                                <input type="date" name="joiningDate" value={formData.jobInfo.joiningDate} onChange={(e) => handleChange(e, 'jobInfo')} className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-100 outline-none" />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-600">Offboarding Date</label>
                                <input
                                    type="date"
                                    value={formData.employmentStatus.offboardingDate}
                                    onChange={(e) => setFormData(p => ({ ...p, employmentStatus: { ...p.employmentStatus, offboardingDate: e.target.value } }))}
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-100 outline-none"
                                />
                            </div>
                            <div className="space-y-2">
                                <CustomSelect 
                                    label="Reporting Manager" 
                                    value={formData.jobInfo.reportingManager} 
                                    onChange={(val) => setFormData(p => ({ ...p, jobInfo: { ...p.jobInfo, reportingManager: val } }))} 
                                    options={employeesList} 
                                    placeholder="Select Manager"
                                />
                            </div>
                            <div className="space-y-2">
                                <CustomSelect 
                                    label="Work Location" 
                                    value={formData.jobInfo.workLocation} 
                                    onChange={(val) => setFormData(p => ({ ...p, jobInfo: { ...p.jobInfo, workLocation: val } }))} 
                                    options={locations} 
                                    placeholder="Select Location"
                                />
                            </div>
                            <div className="space-y-2">
                                <CustomSelect 
                                    label="Assigned Shift" 
                                    value={formData.jobInfo.shift} 
                                    onChange={(val) => setFormData(p => ({ ...p, jobInfo: { ...p.jobInfo, shift: val } }))} 
                                    options={availableShifts} 
                                    placeholder="Select Shift (Optional)"
                                />
                            </div>
                            {/* Biometric PIN — admin only, links employee to ZKTeco machine */}
                            {isAdmin && (
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-600 flex items-center gap-1.5">
                                        Biometric Machine PIN
                                        <span className="text-xs font-normal text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">Admin Only</span>
                                    </label>
                                    <input
                                        type="text"
                                        name="biometricPin"
                                        value={formData.biometricPin || ''}
                                        onChange={handleChange}
                                        placeholder="e.g. 1, 3, 42 — match with ZKTeco machine enrollment"
                                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all"
                                    />
                                    <p className="text-[11px] text-gray-400">
                                        This PIN must match the employee's enrollment PIN on the biometric device. Required for attendance sync.
                                    </p>
                                </div>
                            )}
                            <div className="space-y-2 col-span-1 md:col-span-2">
                                <label className="block text-sm font-medium text-gray-600 mb-2">Employment Contract</label>
                                {(() => {
                                    const typeKey = 'Employment Contract';
                                    const existingFile = formData.existingAttachments?.find(a => a.fileType === typeKey || a.fileType === 'Contract');
                                    const localFileObj = formData.files.find(f => f.type === typeKey);
                                    const hasFile = !!existingFile || !!localFileObj;
                                    const inputId = 'file-input-Employment-Contract';

                                    return (
                                        <div className="flex flex-col gap-2">
                                            <input
                                                type="file"
                                                id={inputId}
                                                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                                                className="hidden"
                                                onChange={(e) => {
                                                    if (e.target.files && e.target.files.length > 0) {
                                                        const file = e.target.files[0];
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            files: [...prev.files.filter(f => f.type !== typeKey), { file, type: typeKey }]
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
                                                            setAttachmentToDelete(existingFile);
                                                            setShowDeleteModal(true);
                                                        }
                                                    }}
                                                />
                                            ) : (
                                                <label htmlFor={inputId} className="flex items-center gap-4 border border-dashed border-gray-300 rounded-lg p-3 bg-gray-50/50 hover:bg-gray-50 transition-colors cursor-pointer justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
                                                            <FileText size={20} />
                                                        </div>
                                                        <span className="text-sm text-gray-500">Upload contract (PDF/DOC)</span>
                                                    </div>
                                                    <Upload size={18} className="text-gray-400" />
                                                </label>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>

                    </div>
                )}

                {/* Step 5: History & Education */}
                {step === 5 && (
                    <div className="space-y-12 animate-slide-up pb-20">
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
                                            }} max={history.endDate || new Date().toISOString().split('T')[0]} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all text-gray-600" />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-medium text-gray-500">End Date</label>
                                            <input type="date" value={history.endDate} onChange={(e) => {
                                                const newHistory = [...formData.employmentHistory];
                                                newHistory[idx].endDate = e.target.value;
                                                setFormData({ ...formData, employmentHistory: newHistory });
                                            }} min={history.startDate} max={new Date().toISOString().split('T')[0]} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all text-gray-600" />
                                        </div>
                                        <div className="md:col-span-2 space-y-1">
                                            <label className="text-xs font-medium text-gray-500">Reason for Leaving</label>
                                            <input type="text" placeholder="Optional" value={history.reasonForLeaving} onChange={(e) => {
                                                const newHistory = [...formData.employmentHistory];
                                                newHistory[idx].reasonForLeaving = e.target.value;
                                                setFormData({ ...formData, employmentHistory: newHistory });
                                            }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all" />
                                        </div>
                                        <EntryAttachmentsEditor
                                            entryKind="experience"
                                            entryIndex={idx}
                                            entryMeta={{ companyName: history.companyName, jobTitle: history.jobTitle }}
                                            attachments={formData.existingAttachments}
                                            stagedFiles={formData.files}
                                            DocumentPreview={DocumentPreview}
                                            onStageFile={(typeKey, file) => setFormData(prev => ({
                                                ...prev,
                                                files: [...prev.files.filter(f => f.type !== typeKey), { file, type: typeKey }],
                                            }))}
                                            onRemoveStaged={(typeKey) => setFormData(p => ({ ...p, files: p.files.filter(f => f.type !== typeKey) }))}
                                            onDeleteSaved={(_id, _name) => {
                                                const saved = formData.existingAttachments?.find((a: any) => a._id === _id);
                                                if (saved) {
                                                    setAttachmentToDelete(saved);
                                                    setShowDeleteModal(true);
                                                }
                                            }}
                                            onPreview={(url, name, type) => setLightboxFile({ url, fileName: name, fileType: type })}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="pt-8 border-t border-gray-100">
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
                                        <EntryAttachmentsEditor
                                            entryKind="education"
                                            entryIndex={idx}
                                            entryMeta={{ level: edu.level, institute: edu.institute }}
                                            attachments={formData.existingAttachments}
                                            stagedFiles={formData.files}
                                            DocumentPreview={DocumentPreview}
                                            onStageFile={(typeKey, file) => setFormData(prev => ({
                                                ...prev,
                                                files: [...prev.files.filter(f => f.type !== typeKey), { file, type: typeKey }],
                                            }))}
                                            onRemoveStaged={(typeKey) => setFormData(p => ({ ...p, files: p.files.filter(f => f.type !== typeKey) }))}
                                            onDeleteSaved={(_id, _name) => {
                                                const saved = formData.existingAttachments?.find((a: any) => a._id === _id);
                                                if (saved) {
                                                    setAttachmentToDelete(saved);
                                                    setShowDeleteModal(true);
                                                }
                                            }}
                                            onPreview={(url, name, type) => setLightboxFile({ url, fileName: name, fileType: type })}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        </div>
                    </div>
                )}

                {/* Step 6: Skills & Social Profiles (was at bottom of Step 5) */}
                {step === 6 && (
                    <div className="space-y-8 animate-slide-up pb-20">
                        <div>
                            <h3 className="text-xl font-semibold text-gray-700 mb-1">Skills & Digital Presence</h3>
                            <p className="text-sm text-gray-400 mb-8">Add the employee's technical skills and online profiles.</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="bg-slate-50/50 rounded-2xl border border-slate-100 p-6">
                                    <h4 className="text-base font-semibold text-gray-700 mb-4">Professional Skills</h4>
                                    <div className="flex flex-wrap gap-2 mb-4 min-h-[40px]">
                                        {formData.skills.map((skill, idx) => (
                                            <span key={idx} className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-sm font-medium">
                                                {skill}
                                                <button onClick={() => setFormData(p => ({ ...p, skills: p.skills.filter((_, i) => i !== idx) }))} className="hover:text-red-500 ml-1">
                                                    <X size={12} />
                                                </button>
                                            </span>
                                        ))}
                                        {formData.skills.length === 0 && <p className="text-sm text-gray-400">No skills added yet.</p>}
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
                                                const val = input?.value.trim();
                                                if (val && !formData.skills.includes(val)) {
                                                    setFormData(p => ({ ...p, skills: [...p.skills, val] }));
                                                    input.value = '';
                                                }
                                            }}
                                            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 flex items-center gap-1"
                                        >
                                            <Plus size={14} /> Add
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-slate-50/50 rounded-2xl border border-slate-100 p-6">
                                    <h4 className="text-base font-semibold text-gray-700 mb-4">Digital Presence</h4>
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

                            <div className="mt-8 bg-slate-50/50 rounded-2xl border border-slate-100 p-6">
                                <div className="flex justify-between items-center mb-4">
                                    <div>
                                        <h4 className="text-base font-semibold text-gray-700">Certifications</h4>
                                        <p className="text-xs text-gray-500">Upload your professional certifications here.</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setFormData(p => ({ ...p, certifications: [...p.certifications, { title: '' }] }))}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 border border-indigo-200 transition-all shadow-sm"
                                    >
                                        <Plus size={14} /> Add Certification
                                    </button>
                                </div>
                                
                                <div className="space-y-4">
                                    {formData.certifications.map((cert, idx) => (
                                        <div key={idx} className="p-4 bg-white border border-gray-200 rounded-xl relative group hover:border-indigo-300 transition-colors">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setFormData(p => ({ 
                                                        ...p, 
                                                        certifications: p.certifications.filter((_, i) => i !== idx),
                                                        files: p.files.filter(f => f.type !== `Certification - ${idx}`)
                                                    }));
                                                }}
                                                className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-red-500 rounded-md hover:bg-red-50 transition-colors"
                                                title="Delete this certification"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-1 pr-8 md:pr-0">
                                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Certification Title</label>
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
                                                <div className="space-y-1">
                                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Certificate File</label>
                                                    <div className="flex items-center gap-3">
                                                        {(() => {
                                                            const typeKey = `Certification - ${idx}`;
                                                            const newFile = formData.files.find(f => f.type === typeKey);
                                                            const savedFile = formData.existingAttachments?.find(a => a.fileType === typeKey);
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
                                                                                const file = e.target.files[0];
                                                                                setFormData(prev => ({
                                                                                    ...prev,
                                                                                    files: [...prev.files.filter(f => f.type !== typeKey), { file, type: typeKey }]
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
                                                                                    setAttachmentToDelete(savedFile);
                                                                                    setShowDeleteModal(true);
                                                                                }
                                                                            }}
                                                                        />
                                                                    ) : (
                                                                        <label htmlFor={inputId} className="flex items-center gap-2 cursor-pointer px-3 py-1.5 border border-dashed border-gray-300 text-gray-500 hover:text-indigo-600 hover:border-indigo-300 rounded-lg bg-gray-50 hover:bg-white transition-all text-xs w-full justify-center animate-fade-in">
                                                                            <Upload size={14} className="pointer-events-none" />
                                                                            <span className="truncate max-w-[150px] pointer-events-none">Upload Cert Scan</span>
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
                                            No certifications added yet. Click "Add Certification" to start.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 7: Finance — admin only (#9) */}
                {step === 7 && isAdmin && (
                    !isFinancialUnlocked ? (
                        <div className="p-8 sm:p-12 bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-100/50 text-center max-w-lg mx-auto my-8 space-y-5 animate-fadeIn">
                            <div className="w-16 h-16 bg-amber-50 ring-8 ring-amber-50/50 rounded-2xl flex items-center justify-center mx-auto text-amber-600">
                                <Lock size={30} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">Financial Configuration Locked</h3>
                                <p className="text-xs text-slate-500 mt-1.5 max-w-sm mx-auto leading-relaxed">
                                    Configuring base salary, probation terms, bank details, and Provident Fund balance requires Universal Master Security authorization.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowMasterPinModal(true)}
                                className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-indigo-200 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
                            >
                                <Lock size={15} /> Unlock with Master Security PIN
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-8 animate-slide-up pb-20">
                            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200/80 px-4 py-2.5 rounded-2xl">
                                <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                                    <Unlock size={16} className="text-emerald-600" />
                                    <span>Financial Session Unlocked (Master Security Active)</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsFinancialUnlocked(false)}
                                    className="px-3 py-1 bg-white hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200 transition-all cursor-pointer flex items-center gap-1"
                                >
                                    <Lock size={12} /> Lock
                                </button>
                            </div>

                            {/* Salary & Employment Terms */}
                            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 shadow-xs">
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

                        {/* Salary Structure & Bank Details (Restricted to Super-Admin & Finance) */}
                        {canEditFinancials ? (
                            <>
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
                            </>
                        ) : (
                            <div className="bg-amber-50/70 border border-amber-200/80 p-5 rounded-2xl flex items-center gap-3.5">
                                <Shield size={22} className="text-amber-600 shrink-0" />
                                <div>
                                    <h4 className="text-sm font-bold text-amber-900">Confidential Compensation & Financials</h4>
                                    <p className="text-xs text-amber-800/90 mt-0.5 leading-relaxed">
                                        Salary structure, compensation packages, and bank details are strictly restricted and managed directly by Finance / Super-Admin.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Benefits Section */}
                        <div className="pt-8 border-t border-slate-100">
                            <div className="flex justify-between items-center mb-6 mt-8">
                                <h3 className="text-lg font-bold text-gray-700">Company Benefits</h3>
                                <button
                                    onClick={() => setFormData(p => ({
                                        ...p,
                                        benefits: [...p.benefits, { name: '', description: '', eligibleDate: '', status: 'Active' }]
                                    }))}
                                    className="text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2"
                                >
                                    + Add Benefit
                                </button>
                            </div>
                            
                            <div className="space-y-4">
                                {formData.benefits.map((benefit, index) => (
                                    <div key={index} className="grid grid-cols-1 md:grid-cols-5 gap-4 p-5 bg-slate-50 border border-slate-200 rounded-2xl relative group hover:border-indigo-200 transition-all">
                                        
                                        <div className="space-y-1 col-span-1 md:col-span-1 border-r border-slate-200 pr-4">
                                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Benefit Name</label>
                                            <input
                                                type="text"
                                                placeholder="e.g. Health Insurance"
                                                value={benefit.name}
                                                onChange={(e) => {
                                                    const newBenefits = [...formData.benefits];
                                                    newBenefits[index].name = e.target.value;
                                                    setFormData({ ...formData, benefits: newBenefits });
                                                }}
                                                className="w-full bg-transparent border-none text-indigo-900 font-bold focus:ring-0 p-0 text-lg placeholder-indigo-200"
                                            />
                                        </div>

                                        <div className="space-y-1 col-span-1 md:col-span-2">
                                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Description</label>
                                            <input
                                                type="text"
                                                placeholder="Benefit details..."
                                                value={benefit.description}
                                                onChange={(e) => {
                                                    const newBenefits = [...formData.benefits];
                                                    newBenefits[index].description = e.target.value;
                                                    setFormData({ ...formData, benefits: newBenefits });
                                                }}
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 outline-none"
                                            />
                                        </div>

                                        <div className="space-y-1 col-span-1 md:col-span-1">
                                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Eligible Date</label>
                                            <input
                                                type="date"
                                                value={benefit.eligibleDate}
                                                onChange={(e) => {
                                                    const newBenefits = [...formData.benefits];
                                                    newBenefits[index].eligibleDate = e.target.value;
                                                    setFormData({ ...formData, benefits: newBenefits });
                                                }}
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 outline-none"
                                            />
                                        </div>
                                        
                                        <div className="space-y-1 col-span-1 md:col-span-1 relative pr-10">
                                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Status</label>
                                            <select
                                                value={benefit.status}
                                                onChange={(e: any) => {
                                                    const newBenefits = [...formData.benefits];
                                                    newBenefits[index].status = e.target.value;
                                                    setFormData({ ...formData, benefits: newBenefits });
                                                }}
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 outline-none"
                                            >
                                                <option value="Active">Active</option>
                                                <option value="Pending">Pending</option>
                                                <option value="Expired">Expired</option>
                                            </select>

                                            <button
                                                onClick={() => {
                                                    const newBenefits = formData.benefits.filter((_, i) => i !== index);
                                                    setFormData({ ...formData, benefits: newBenefits });
                                                }}
                                                className="absolute top-1/2 -translate-y-1/2 right-0 p-2 bg-red-100 text-red-600 rounded-full opacity-0 group-hover:opacity-100 hover:scale-110 transition-all shadow-sm border border-red-200"
                                                aria-label="Remove Benefit"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>

                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Provident Fund Details */}
                        <div className="pt-8 border-t border-gray-100">
                            <h3 className="text-lg font-medium text-gray-700 mb-6 flex items-center gap-2">
                                <Banknote size={20} className="text-emerald-500" />
                                Provident Fund
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

                    </div>
                ))}

                {/* Step 7: Documents — step 8 for admins, step 7 for non-admins */}
                {step === (isAdmin ? 8 : 7) && (
                    <div className="animate-slide-up pb-20">
                        <div>
                            <h3 className="text-lg font-medium text-gray-700 mb-6">Documents & Attachments</h3>
                            
                            {/* Existing Documents From Server */}
                                    {formData.existingAttachments?.length > 0 && (
                                        <div className="mb-12">
                                            <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Your Saved Documents</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
                                                {formData.existingAttachments.map((file: any, i: number) => {
                                                    const hasLocalOverride = formData.files.some(f => f.type === file.fileType);
                                                    if (hasLocalOverride) return null; // Render the staged draft instead

                                                    const url = api.attachmentRaw(file._id);
                                                    const extension = file.fileName.split('.').pop()?.toLowerCase() || '';
                                                    const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(extension);
                                                    const isPdf = extension === 'pdf';
                                                    const inputId = `replace-file-input-${file._id}`;

                                                    return (
                                                        <div key={i} className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-sm flex flex-col gap-3 group relative transition-all duration-300 hover:shadow-md hover:border-indigo-200 animate-fade-in text-left">
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
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setAttachmentToDelete(file);
                                                                        setShowDeleteModal(true);
                                                                    }}
                                                                    className="flex-1 text-center text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100/80 px-2 py-1 rounded transition-colors"
                                                                >
                                                                    Delete
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Upload Grid */}
                                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 text-left">Upload New Documents</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {/* Document Categories */}
                                        {(['Contract', 'Other Documents'] as string[]).map((label) => {
                                            const existingFile = formData.existingAttachments?.find(a => a.fileType === label);
                                            const localFiles = formData.files.filter(f => f.type === label);
                                            const hasFile = (label === 'Contract' && (!!existingFile || localFiles.length > 0));
                                            const inputId = `file-input-${label.replace(/[^a-zA-Z0-9-]/g, '-')}`;

                                            if (hasFile && label === 'Contract') {
                                                const localFileObj = localFiles[0];
                                                return (
                                                    <div key={label} className="flex flex-col gap-2 text-left">
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
                                                                    setAttachmentToDelete(existingFile);
                                                                    setShowDeleteModal(true);
                                                                }
                                                            }}
                                                        />
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div key={label} className="flex flex-col gap-4 text-left">
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
                                                        {label === 'Contract' && (
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

                {/* Error Message */}
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2 mb-4">
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

                {/* Success Message */}
                {saveSuccess && (
                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 flex items-center justify-between rounded-lg animate-fadeIn mb-4">
                        <div className="flex items-center gap-2">
                            <Check size={18} className="text-emerald-500" />
                            <span className="font-medium">Progress saved successfully!</span>
                        </div>
                    </div>
                )}


                {/* Navigation Buttons */}
                <div className="flex justify-between pt-6 border-t border-gray-100">
                    <button
                        onClick={() => { setStepErrors([]); setStep(s => Math.max(1, s - 1)); }}
                        disabled={step === 1 || loading}
                        className={`px-6 py-2.5 rounded-xl border border-gray-300 font-medium flex items-center gap-2 transition-all ${step === 1 || loading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary-50 hover:border-primary-300 hover:text-primary-700'}`}
                    >
                        <ChevronLeft size={16} /> Back
                    </button>

                    <div className="flex gap-3">
                        {step > 1 && step < steps.length && formData.firstName && formData.lastName && (
                            <button
                                onClick={() => handleSubmit(false, true)}
                                disabled={loading}
                                className="px-6 py-2.5 rounded-lg border border-indigo-200 text-indigo-700 font-medium hover:bg-indigo-50 transition-all flex items-center gap-2"
                            >
                                <Save size={16} /> Save Progress
                            </button>
                        )}
                        {step < steps.length ? (
                            <button
                                onClick={handleNext}
                                disabled={(step === 1 && !isStep1RequiredValid()) || loading}
                                className={`px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-all shadow-sm ${step === 1 && !isStep1RequiredValid() ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 hover:shadow-md'}`}
                            >
                                {loading && step !== steps.length ? 'Saving...' : 'Save & Next'} 
                                {loading && step !== steps.length ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <ChevronRight size={16} />}
                            </button>
                        ) : (
                            <button
                                onClick={() => handleSubmit(true)}
                                disabled={loading}
                                className="px-8 py-2.5 rounded-lg bg-success text-white font-medium hover:bg-success/90 flex items-center gap-2 shadow-sm hover:shadow-md transition-all"
                            >
                                <Save size={18} /> {loading ? (isEditMode ? 'Updating...' : 'Saving...') : (isEditMode ? 'Update Employee' : 'Submit Employee')}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Limit Modal */}
            {limitModalOpen && (
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
            )}

            {/* Lightbox Modal */}
            {lightboxFile && (
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
                                <div className="text-center p-8 max-w-sm text-center">
                                    <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-200/50 shadow-inner">
                                        <FileText size={32} />
                                    </div>
                                    <h4 className="text-sm font-bold text-slate-700 mb-1">Preview not supported</h4>
                                    <p className="text-xs text-slate-400 mb-6 font-normal">
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
            )}

            {/* Missing Fields Modal */}
            {showMissingModal && pendingNextStep !== null && (
                <div className="fixed inset-0 z-[9999] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center animate-fadeIn p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-slide-up">
                        <div className="p-6">
                            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 mb-4">
                                <AlertCircle size={24} />
                            </div>
                            <h3 className="text-lg font-bold text-gray-800 mb-2">Incomplete Step</h3>
                            <p className="text-sm text-gray-500 mb-4">
                                To reach 100% completion for this step, it is recommended to fill the following missing details before proceeding:
                            </p>
                            <ul className="mb-6 space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                                {missingFieldsList.map((f, i) => (
                                    <li key={i} className="text-sm text-gray-700 flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500" /> {f}
                                    </li>
                                ))}
                            </ul>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowMissingModal(false)}
                                    className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                                >
                                    Complete Now
                                </button>
                                <button
                                    onClick={() => pendingNextStep !== null && processNextStep(pendingNextStep)}
                                    className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors shadow-sm"
                                >
                                    Skip & Continue
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            <DeleteModal
                isOpen={showDeleteModal}
                onClose={() => {
                    setShowDeleteModal(false);
                    setAttachmentToDelete(null);
                }}
                onConfirm={confirmDeleteAttachment}
                title="Delete Document?"
                message={`Are you sure you want to delete ${attachmentToDelete?.fileName}? This action cannot be undone.`}
            />

            {/* Universal Master Financial Security Modal */}
            <SalaryPinModal
                isOpen={showMasterPinModal}
                onClose={() => setShowMasterPinModal(false)}
                onSuccess={() => setIsFinancialUnlocked(true)}
                requireMasterPin={true}
                title="Universal Master Financial PIN"
                description="Enter the 4-digit Master Financial PIN to configure compensation and banking details."
            />
        </div>
    );
};

export default AddEmployeeWizard;