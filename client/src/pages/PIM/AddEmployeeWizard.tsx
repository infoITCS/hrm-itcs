
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Save, Upload, User, Phone, Briefcase, FileText } from 'lucide-react';
import CustomSelect from '../../components/UI/CustomSelect';

const AddEmployeeWizard = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const isEditMode = !!id;
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);

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

        // Attachments (Files are handled separately usually, but for now just placeholder logic or state)
        // We will need to handle file uploads in a real form submission via FormData
        files: [] as File[]
    });

    // Fetch Data for Edit Mode
    useEffect(() => {
        if (isEditMode) {
            setLoading(true);
            fetch(`http://localhost:5000/api/employees`)
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

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setFormData(prev => ({ ...prev, files: [...prev.files, ...Array.from(e.target.files!)] }));
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
            const response = await fetch('http://localhost:5000/api/employees', {
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

                        await fetch(`http://localhost:5000/api/employees/${newEmp.employeeId}/attachments`, {
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
        { id: 4, title: 'Documents', icon: FileText },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4 mb-2">
                <button onClick={() => navigate('/pim')} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-gray-500">
                    <ChevronLeft size={24} />
                </button>
                <div className="flex-1">
                    <h2 className="text-xl font-semibold text-gray-700">{isEditMode ? 'Edit Employee' : 'Add New Employee'}</h2>
                    <p className="text-sm text-gray-500">Step {step} of 4: {steps[step - 1].title}</p>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="flex items-center justify-between mb-8 px-8">
                {steps.map((s, i) => (
                    <div key={s.id} className="flex flex-col items-center relative z-10">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${step >= s.id ? 'bg-primary text-white' : 'bg-gray-200 text-gray-500'}`}>
                            <s.icon size={18} />
                        </div>
                        <span className={`text-xs mt-2 font-medium ${step >= s.id ? 'text-primary' : 'text-gray-400'}`}>{s.title}</span>
                        {i !== steps.length - 1 && (
                            <div className={`absolute top-5 left-1/2 w-full h-0.5 -z-10 ${step > s.id ? 'bg-primary' : 'bg-gray-200'}`} style={{ width: 'calc(100% + 4rem)' }} />
                        )}
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-8 min-h-[400px]">

                {/* Step 1: Personal Details */}
                {step === 1 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fadeIn">
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-600">Employee ID *</label>
                            <input type="text" name="employeeId" value={formData.employeeId} onChange={handleChange} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
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
                    <div className="space-y-8 animate-fadeIn">
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
                                <button onClick={() => addArrayItem('emergencyContacts')} className="text-sm text-primary hover:underline">+ Add Contact</button>
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeIn">
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-600">Job Title</label>
                            <input type="text" name="designation" value={formData.jobInfo.designation} onChange={(e) => handleChange(e, 'jobInfo')} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                        </div>
                        <div className="space-y-2">
                            <CustomSelect label="Department" value={formData.jobInfo.department} onChange={(val) => setFormData(p => ({ ...p, jobInfo: { ...p.jobInfo, department: val } }))} options={['ITCS', 'HR', 'Admin']} />
                        </div>
                        <div className="space-y-2">
                            <CustomSelect label="Employment Status" value={formData.employmentStatus.status} onChange={(val) => setFormData(p => ({ ...p, employmentStatus: { ...p.employmentStatus, status: val } }))} options={['Probation', 'Permanent', 'Contract']} />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-600">Joining Date</label>
                            <input type="date" name="joiningDate" value={formData.jobInfo.joiningDate} onChange={(e) => handleChange(e, 'jobInfo')} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                        </div>
                    </div>
                )}

                {/* Step 4: Documents */}
                {step === 4 && (
                    <div className="space-y-6 animate-fadeIn">
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 flex flex-col items-center justify-center text-gray-500 hover:border-primary hover:bg-purple-50 transition-all cursor-pointer relative">
                            <input type="file" multiple onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer" />
                            <Upload size={48} className="mb-4 text-gray-400" />
                            <p className="text-lg font-medium">Drop files here or click to upload</p>
                            <p className="text-sm">ID, Contracts, Certificates (PDF, Images)</p>
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
                    className={`px-6 py-2.5 rounded-full border border-gray-300 font-medium flex items-center gap-2 ${step === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`}
                >
                    <ChevronLeft size={16} /> Back
                </button>

                {step < 4 ? (
                    <button
                        onClick={() => setStep(s => Math.min(4, s + 1))}
                        className="px-6 py-2.5 rounded-full bg-primary text-white font-medium hover:bg-purple-700 flex items-center gap-2"
                    >
                        Next <ChevronRight size={16} />
                    </button>
                ) : (
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="px-8 py-2.5 rounded-full bg-green-600 text-white font-medium hover:bg-green-700 flex items-center gap-2 shadow-lg shadow-green-200"
                    >
                        <Save size={18} /> {loading ? 'Saving...' : 'Submit Employee'}
                    </button>
                )}
            </div>
        </div>
    );
};

export default AddEmployeeWizard;
