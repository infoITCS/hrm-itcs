
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Save, Upload, User, Phone, Briefcase, FileText, Check } from 'lucide-react';
import CustomSelect from '../../components/UI/CustomSelect';
import api from '../../utils/api';

const AddEmployeeWizard = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const isEditMode = !!id;
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [completedSteps, setCompletedSteps] = useState<number[]>([]);
    const [showCompletion, setShowCompletion] = useState<number | null>(null);

    // Initial State including Nested Objects
    const [formData, setFormData] = useState({
        // Personal
        employeeId: '', firstName: '', middleName: '', lastName: '',
        email: '', phone: '', dateOfBirth: '', gender: '',
        maritalStatus: '', nationality: '', userId: '',

        // Address
        address: { street: '', city: '', state: '', zipCode: '', country: '' },

        // Job
        jobInfo: {
            designation: '', department: '', reportingManager: '',
            employmentType: '', workLocation: '', joiningDate: ''
        },

        // Status
        employmentStatus: { status: 'Probation', startDate: '', autoUpdated: false },

        // Emergency Contacts (Array)
        emergencyContacts: [{ name: '', relation: '', phone: '' }],

        // Dependents (Array)
        dependents: [{ name: '', relation: '', dateOfBirth: '' }],

        // Employment History
        employmentHistory: [{ companyName: '', jobTitle: '', startDate: '', endDate: '', reasonForLeaving: '' }],

        // Education
        education: [{ level: '', institute: '', year: '', score: '' }],

        // Attachments (Files are handled separately usually, but for now just placeholder logic or state)
        // We will need to handle file uploads in a real form submission via FormData
        files: [] as File[]
    });

    // Fetch Data for Edit Mode
    useEffect(() => {
        if (isEditMode) {
            setLoading(true);
            fetch(api.employees)
                .then(res => res.json())
                .then(data => {
                    const found = data.find((e: any) => e.employeeId === id) || data.find((e: any) => e._id === id);

                    if (found) {
                        setFormData(prev => ({
                            ...prev,
                            ...found,
                            address: found.address || prev.address,
                            jobInfo: {
                                ...prev.jobInfo,
                                ...(found.jobInfo || {}),
                                joiningDate: found.jobInfo?.joiningDate ? found.jobInfo.joiningDate.split('T')[0] : ''
                            },
                            employmentStatus: typeof found.employmentStatus === 'string'
                                ? { status: found.employmentStatus, startDate: '', autoUpdated: false }
                                : (found.employmentStatus || prev.employmentStatus),
                            emergencyContacts: found.emergencyContacts?.length ? found.emergencyContacts : prev.emergencyContacts,
                            dependents: found.dependents?.length ? found.dependents : prev.dependents,
                            // Date formatting for inputs
                            dateOfBirth: found.dateOfBirth ? found.dateOfBirth.split('T')[0] : ''
                        }));
                    }
                    setLoading(false);
                })
                .catch(err => {
                    console.error('Error fetching employee:', err);
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
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };


    const addArrayItem = (field: 'emergencyContacts' | 'dependents') => {
        if (field === 'emergencyContacts') {
            setFormData(prev => ({ ...prev, emergencyContacts: [...prev.emergencyContacts, { name: '', relation: '', phone: '' }] }));
        } else {
            setFormData(prev => ({ ...prev, dependents: [...prev.dependents, { name: '', relation: '', dateOfBirth: '' }] }));
        }
    };

    const removeArrayItem = (field: 'emergencyContacts' | 'dependents', index: number) => {
        setFormData(prev => ({
            ...prev,
            [field]: prev[field].filter((_, i) => i !== index)
        }));
    };

    const handleSubmit = async () => {
        setLoading(true);
        try {
            // 1. Create Employee Logic (JSON)
            const response = await fetch(api.employees, {
                method: 'POST',
                // Mock Auth Header
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer mock-token' },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                const newEmp = await response.json();

                // 2. Upload Files if any
                if (formData.files.length > 0) {
                    for (const file of formData.files) {
                        const fileData = new FormData();
                        fileData.append('file', file);
                        fileData.append('fileType', 'Document'); // Default for now

                        await fetch(api.employeeAttachments(newEmp.employeeId), {
                            method: 'POST',
                            headers: { 'Authorization': 'Bearer mock-token' },
                            body: fileData
                        });
                    }
                }
                navigate('/pim');
            } else {
                console.error('Failed to create employee');
            }
        } catch (error) {
            console.error('Error submitting form:', error);
        } finally {
            setLoading(false);
        }
    };

    const steps = [
        { id: 1, title: 'Personal', icon: User },
        { id: 2, title: 'Contact & Dependents', icon: Phone },
        { id: 3, title: 'Job & Status', icon: Briefcase },
        { id: 4, title: 'History & Education', icon: Briefcase },
        { id: 5, title: 'Documents', icon: FileText },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4 mb-2">
                <button onClick={() => navigate('/pim')} className="p-2 hover:bg-primary-50 rounded-xl transition-all text-gray-500 hover:text-primary-600">
                    <ChevronLeft size={24} />
                </button>
                <div className="flex-1">
                    <h2 className="text-xl font-semibold text-gray-700">{isEditMode ? 'Edit Employee' : 'Add New Employee'}</h2>
                    <p className="text-sm text-gray-500">Step {step} of 5: {steps[step - 1].title}</p>
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
                            <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-500 shadow-md relative ${
                                isCompleted 
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
                            <span className={`text-xs mt-3 font-semibold transition-all duration-300 ${
                                isCompleted || isCurrent 
                                    ? 'text-indigo-600 scale-105' 
                                    : 'text-gray-400 scale-100'
                            }`}>
                                {s.title}
                            </span>
                            
                            {/* Connecting Line */}
                            {i !== steps.length - 1 && (
                                <div className="absolute top-7 left-[60%] w-[calc(100%-4rem)] h-0.5 -z-0">
                                    <div 
                                        className={`h-full transition-all duration-1000 ease-out ${
                                            isCompleted 
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

            <div className="bg-white rounded-lg shadow-sm border border-slate-200/50 p-8 min-h-[400px] relative overflow-hidden">
                {/* Loading Overlay */}
                {loading && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center animate-fadeIn">
                        <div className="text-center">
                            <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
                            <p className="text-indigo-600 font-medium">Saving...</p>
                        </div>
                    </div>
                )}

                {/* Step 1: Personal Details */}
                {step === 1 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-slide-up">
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-600">Employee ID *</label>
                            <input type="text" name="employeeId" value={formData.employeeId} onChange={handleChange} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 bg-white transition-all" />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-600">First Name *</label>
                            <input type="text" name="firstName" value={formData.firstName} onChange={handleChange} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-600">Last Name *</label>
                            <input type="text" name="lastName" value={formData.lastName} onChange={handleChange} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-600">Date of Birth</label>
                            <input type="date" name="dateOfBirth" value={formData.dateOfBirth} onChange={handleChange} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-600">Nationality</label>
                            <input type="text" name="nationality" value={formData.nationality} onChange={handleChange} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                        </div>
                        <div className="space-y-2">
                            <CustomSelect label="Gender" value={formData.gender} onChange={(val) => setFormData({ ...formData, gender: val })} options={['Male', 'Female', 'Other']} />
                        </div>
                        <div className="space-y-2">
                            <CustomSelect label="Marital Status" value={formData.maritalStatus} onChange={(val) => setFormData({ ...formData, maritalStatus: val })} options={['Single', 'Married']} />
                        </div>
                    </div>
                )}

                {/* Step 2: Contact, Address, Dependents */}
                {step === 2 && (
                    <div className="space-y-8 animate-slide-up">
                        <div>
                            <h3 className="text-lg font-medium text-gray-700 mb-4">Contact Info</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <input type="email" name="email" placeholder="Email" value={formData.email} onChange={handleChange} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                                <input type="text" name="phone" placeholder="Phone" value={formData.phone} onChange={handleChange} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                            </div>
                        </div>

                        <div>
                            <h3 className="text-lg font-medium text-gray-700 mb-4">Address</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <input type="text" name="street" placeholder="Street" value={formData.address.street} onChange={(e) => handleChange(e, 'address')} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                                <input type="text" name="city" placeholder="City" value={formData.address.city} onChange={(e) => handleChange(e, 'address')} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                                <input type="text" name="country" placeholder="Country" value={formData.address.country} onChange={(e) => handleChange(e, 'address')} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                            </div>
                        </div>

                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-medium text-gray-700">Emergency Contacts</h3>
                                <button onClick={() => addArrayItem('emergencyContacts')} className="text-sm text-primary-600 hover:text-primary-700 font-semibold hover:underline transition-colors">+ Add Contact</button>
                            </div>
                            {formData.emergencyContacts.map((contact, idx) => (
                                <div key={idx} className="flex gap-4 mb-2 items-end">
                                    <input type="text" placeholder="Name" value={contact.name} onChange={(e) => handleChange(e, 'emergencyContacts', idx, 'name')} className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm" />
                                    <input type="text" placeholder="Relation" value={contact.relation} onChange={(e) => handleChange(e, 'emergencyContacts', idx, 'relation')} className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm" />
                                    <input type="text" placeholder="Phone" value={contact.phone} onChange={(e) => handleChange(e, 'emergencyContacts', idx, 'phone')} className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm" />
                                    <button onClick={() => removeArrayItem('emergencyContacts', idx)} className="text-red-500 p-2">x</button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Step 3: Job Info */}
                {step === 3 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-slide-up">
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-600">Job Title</label>
                            <input type="text" name="designation" value={formData.jobInfo.designation} onChange={(e) => handleChange(e, 'jobInfo')} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                        </div>
                        <div className="space-y-2">
                            <CustomSelect label="Department" value={formData.jobInfo.department} onChange={(val) => setFormData(p => ({ ...p, jobInfo: { ...p.jobInfo, department: val } }))} options={['ITCS', 'HR', 'Admin']} />
                        </div>
                        <div className="space-y-2">
                            <CustomSelect label="Employment Status" value={formData.employmentStatus.status} onChange={(val) => setFormData(p => ({ ...p, employmentStatus: { ...p.employmentStatus, status: val } }))} options={['Internship', 'Probation', 'Permanent', 'Contract', 'Part-time']} />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-600">Joining Date</label>
                            <input type="date" name="joiningDate" value={formData.jobInfo.joiningDate} onChange={(e) => handleChange(e, 'jobInfo')} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                        </div>
                    </div>
                )}

                {/* Step 4: Employment History & Education */}
                {step === 4 && (
                    <div className="space-y-8 animate-slide-up">
                        <div>
                            <h3 className="text-lg font-medium text-gray-700 mb-4">Employment History</h3>
                            {formData.employmentHistory.map((history, idx) => (
                                <div key={idx} className="mb-4 p-4 border border-gray-200 rounded-lg">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <input type="text" placeholder="Company Name" value={history.companyName} onChange={(e) => {
                                            const newHistory = [...formData.employmentHistory];
                                            newHistory[idx].companyName = e.target.value;
                                            setFormData({ ...formData, employmentHistory: newHistory });
                                        }} className="border border-gray-300 rounded px-3 py-2 text-sm" />
                                        <input type="text" placeholder="Job Title" value={history.jobTitle} onChange={(e) => {
                                            const newHistory = [...formData.employmentHistory];
                                            newHistory[idx].jobTitle = e.target.value;
                                            setFormData({ ...formData, employmentHistory: newHistory });
                                        }} className="border border-gray-300 rounded px-3 py-2 text-sm" />
                                        <input type="date" placeholder="Start Date" value={history.startDate} onChange={(e) => {
                                            const newHistory = [...formData.employmentHistory];
                                            newHistory[idx].startDate = e.target.value;
                                            setFormData({ ...formData, employmentHistory: newHistory });
                                        }} className="border border-gray-300 rounded px-3 py-2 text-sm" />
                                        <input type="date" placeholder="End Date" value={history.endDate} onChange={(e) => {
                                            const newHistory = [...formData.employmentHistory];
                                            newHistory[idx].endDate = e.target.value;
                                            setFormData({ ...formData, employmentHistory: newHistory });
                                        }} className="border border-gray-300 rounded px-3 py-2 text-sm" />
                                        <input type="text" placeholder="Reason for Leaving" value={history.reasonForLeaving} onChange={(e) => {
                                            const newHistory = [...formData.employmentHistory];
                                            newHistory[idx].reasonForLeaving = e.target.value;
                                            setFormData({ ...formData, employmentHistory: newHistory });
                                        }} className="border border-gray-300 rounded px-3 py-2 text-sm md:col-span-2" />
                                    </div>
                                </div>
                            ))}
                            <button onClick={() => setFormData(p => ({ ...p, employmentHistory: [...p.employmentHistory, { companyName: '', jobTitle: '', startDate: '', endDate: '', reasonForLeaving: '' }] }))} className="text-sm text-indigo-600 hover:underline">+ Add Employment History</button>
                        </div>

                        <div>
                            <h3 className="text-lg font-medium text-gray-700 mb-4">Education</h3>
                            {formData.education.map((edu, idx) => (
                                <div key={idx} className="mb-4 p-4 border border-gray-200 rounded-lg">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <input type="text" placeholder="Level (e.g., Bachelor, Master)" value={edu.level} onChange={(e) => {
                                            const newEdu = [...formData.education];
                                            newEdu[idx].level = e.target.value;
                                            setFormData({ ...formData, education: newEdu });
                                        }} className="border border-gray-300 rounded px-3 py-2 text-sm" />
                                        <input type="text" placeholder="Institute" value={edu.institute} onChange={(e) => {
                                            const newEdu = [...formData.education];
                                            newEdu[idx].institute = e.target.value;
                                            setFormData({ ...formData, education: newEdu });
                                        }} className="border border-gray-300 rounded px-3 py-2 text-sm" />
                                        <input type="text" placeholder="Year" value={edu.year} onChange={(e) => {
                                            const newEdu = [...formData.education];
                                            newEdu[idx].year = e.target.value;
                                            setFormData({ ...formData, education: newEdu });
                                        }} className="border border-gray-300 rounded px-3 py-2 text-sm" />
                                        <input type="text" placeholder="Score/GPA" value={edu.score} onChange={(e) => {
                                            const newEdu = [...formData.education];
                                            newEdu[idx].score = e.target.value;
                                            setFormData({ ...formData, education: newEdu });
                                        }} className="border border-gray-300 rounded px-3 py-2 text-sm" />
                                    </div>
                                </div>
                            ))}
                            <button onClick={() => setFormData(p => ({ ...p, education: [...p.education, { level: '', institute: '', year: '', score: '' }] }))} className="text-sm text-indigo-600 hover:underline">+ Add Education</button>
                        </div>
                    </div>
                )}

                {/* Step 5: Documents */}
                {step === 5 && (
                    <div className="space-y-6 animate-slide-up">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                            {['ID', 'Contract', 'Certificate', 'Degree', 'Experience Letter', 'Resume'].map((type) => (
                                <div key={type} className="border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center text-gray-500 hover:border-indigo-500 hover:bg-indigo-50 transition-all cursor-pointer relative">
                                    <input 
                                        type="file" 
                                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                        onChange={(e) => {
                                            if (e.target.files && e.target.files.length > 0) {
                                                const file = e.target.files[0];
                                                const fileData = new FormData();
                                                fileData.append('file', file);
                                                fileData.append('fileType', type);
                                                // Store for later upload
                                                setFormData(prev => ({ 
                                                    ...prev, 
                                                    files: [...prev.files, file] 
                                                }));
                                            }
                                        }}
                                        className="absolute inset-0 opacity-0 cursor-pointer" 
                                    />
                                    <Upload size={32} className="mb-2 text-gray-400" />
                                    <p className="text-sm font-medium text-center">{type}</p>
                                </div>
                            ))}
                        </div>

                        {formData.files.length > 0 && (
                            <div className="space-y-2">
                                <h4 className="font-medium text-gray-700">Selected Files:</h4>
                                {formData.files.map((file, i) => (
                                    <div key={i} className="flex justify-between bg-gray-50 p-2 rounded border border-gray-200 text-sm">
                                        <span>{file.name}</span>
                                        <span className="text-gray-400">{(file.size / 1024).toFixed(1)} KB</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

            </div>

            {/* Navigation Buttons */}
            <div className="flex justify-between pt-6 border-t border-gray-100">
                <button
                    onClick={() => setStep(s => Math.max(1, s - 1))}
                    disabled={step === 1}
                    className={`px-6 py-2.5 rounded-xl border border-gray-300 font-medium flex items-center gap-2 transition-all ${step === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary-50 hover:border-primary-300 hover:text-primary-700'}`}
                >
                    <ChevronLeft size={16} /> Back
                </button>

                {step < 5 ? (
                    <button
                        onClick={() => {
                            if (!completedSteps.includes(step)) {
                                setCompletedSteps([...completedSteps, step]);
                                setShowCompletion(step);
                                // Hide completion notification after 2 seconds
                                setTimeout(() => setShowCompletion(null), 2000);
                            }
                            setStep(s => Math.min(5, s + 1));
                        }}
                        className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium hover:from-indigo-700 hover:to-purple-700 flex items-center gap-2 transition-all shadow-sm hover:shadow-md"
                    >
                        Next <ChevronRight size={16} />
                    </button>
                ) : (
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="px-8 py-2.5 rounded-lg bg-success text-white font-medium hover:bg-success/90 flex items-center gap-2 shadow-sm hover:shadow-md transition-all"
                    >
                        <Save size={18} /> {loading ? 'Saving...' : 'Submit Employee'}
                    </button>
                )}
            </div>
        </div>
    );
};

export default AddEmployeeWizard;
