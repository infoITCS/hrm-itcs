import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Save, Upload, Check, User, Briefcase, FileText, Trash2, Globe, Users, GraduationCap } from 'lucide-react';
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
        employeeId: '', firstName: '', lastName: '', cnic: '',
        email: '', phone: '', dateOfBirth: '', gender: '',
        maritalStatus: '', nationality: '', fatherName: '', bloodGroup: '',

        // Address
        address: { street: '', city: '', country: '' },

        // Job
        jobInfo: {
            designation: '', department: '', joiningDate: ''
        },

        // Status
        employmentStatus: { status: 'Probation', autoUpdated: false },

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
        files: [] as { file: File; type: string }[]
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
                                ? { status: found.employmentStatus, autoUpdated: false }
                                : (found.employmentStatus || prev.employmentStatus),
                            emergencyContacts: found.emergencyContacts?.length ? found.emergencyContacts : prev.emergencyContacts,
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
        } else if (section === 'immigrationHistory' && index !== undefined && subfield) {
            const newHistory = [...formData.immigrationHistory];
            (newHistory[index] as any)[subfield] = value;
            setFormData(prev => ({ ...prev, immigrationHistory: newHistory }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

<<<<<<< HEAD


    const addEmergencyContact = () => {
        setFormData(prev => ({ ...prev, emergencyContacts: [...prev.emergencyContacts, { name: '', relation: '', phone: '' }] }));
    };
=======
>>>>>>> bf804904067a08fedd653d1aab8613ba2d8f218a

    const removeEmergencyContact = (index: number) => {
        setFormData(prev => ({
            ...prev,
            emergencyContacts: prev.emergencyContacts.filter((_, i) => i !== index)
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
                    for (const fileObj of formData.files) {
                        const fileData = new FormData();
                        fileData.append('file', fileObj.file);
                        fileData.append('fileType', fileObj.type || 'Document');

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
        { id: 2, title: 'Contact & Dependents', icon: Users },
        { id: 3, title: 'Immigration', icon: Globe },
        { id: 4, title: 'Job & Status', icon: Briefcase },
        { id: 5, title: 'History & Education', icon: GraduationCap },
        { id: 6, title: 'Documents', icon: FileText }
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
<<<<<<< HEAD

=======

>>>>>>> bf804904067a08fedd653d1aab8613ba2d8f218a
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
                            <p className="text-indigo-600 font-medium">Saving...</p>
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
                            <label className="block text-sm font-medium text-gray-600">CNIC / Govt ID</label>
                            <input type="text" name="cnic" value={formData.cnic} onChange={handleChange} placeholder="e.g. 12345-1234567-1" className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-600">Date of Birth</label>
                            <input type="date" name="dateOfBirth" value={formData.dateOfBirth} onChange={handleChange} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-600">Father Name</label>
                            <input type="text" name="fatherName" value={formData.fatherName} onChange={handleChange} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-600">Nationality</label>
                            <input type="text" name="nationality" value={formData.nationality} onChange={handleChange} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                        </div>
                        <div className="space-y-2">
                            <CustomSelect label="Blood Group" value={formData.bloodGroup} onChange={(val) => setFormData({ ...formData, bloodGroup: val })} options={['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']} />
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
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-600">Joining Date</label>
                                <input type="date" name="joiningDate" value={formData.jobInfo.joiningDate} onChange={(e) => handleChange(e, 'jobInfo')} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
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
                        </div>
                    </div>
                )}

                {/* Step 6: Additional Documents */}
                {step === 6 && (
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

                {/* Navigation Buttons */}
                <div className="flex justify-between pt-6 border-t border-gray-100">
                    <button
                        onClick={() => setStep(s => Math.max(1, s - 1))}
                        disabled={step === 1}
                        className={`px-6 py-2.5 rounded-xl border border-gray-300 font-medium flex items-center gap-2 transition-all ${step === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary-50 hover:border-primary-300 hover:text-primary-700'}`}
                    >
                        <ChevronLeft size={16} /> Back
                    </button>

                    {step < 6 ? (
                        <button
                            onClick={() => {
                                if (!completedSteps.includes(step)) {
                                    setCompletedSteps([...completedSteps, step]);
                                    setShowCompletion(step);
                                    // Hide completion notification after 2 seconds
                                    setTimeout(() => setShowCompletion(null), 2000);
                                }
                                setStep(s => Math.min(6, s + 1));
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
        </div>
    );
};

export default AddEmployeeWizard;
