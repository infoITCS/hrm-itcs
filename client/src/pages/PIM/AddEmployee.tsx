import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Save } from 'lucide-react';
import CustomSelect from '../../components/UI/CustomSelect';
import api from '../../utils/api';

const AddEmployee = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        employeeId: '',
        firstName: '',
        middleName: '',
        lastName: '',
        email: '',
        phone: '',
        dateOfBirth: '',
        gender: '',
        maritalStatus: '',
        nationality: '',
        street: '',
        city: '',
        state: '',
        zipCode: '',
        country: '',
        designation: '',
        department: '',
        reportingManager: '',
        employmentStatus: '',
        employmentType: '',
        workLocation: '',
        joiningDate: ''
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSelectChange = (name: string, value: string) => {
        setFormData({ ...formData, [name]: value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const payload = {
            employeeId: formData.employeeId,
            firstName: formData.firstName,
            middleName: formData.middleName,
            lastName: formData.lastName,
            email: formData.email,
            phone: formData.phone,
            dateOfBirth: formData.dateOfBirth ? new Date(formData.dateOfBirth) : null,
            gender: formData.gender,
            maritalStatus: formData.maritalStatus,
            nationality: formData.nationality,
            address: {
                street: formData.street,
                city: formData.city,
                state: formData.state,
                zipCode: formData.zipCode,
                country: formData.country
            },
            employmentStatus: {
                status: formData.employmentStatus,
                startDate: new Date() // Defaulting to now, or add field if needed
            },
            jobInfo: {
                designation: formData.designation,
                department: formData.department,
                reportingManager: formData.reportingManager,
                employmentType: formData.employmentType,
                workLocation: formData.workLocation,
                joiningDate: formData.joiningDate ? new Date(formData.joiningDate) : null
            }
        };

        try {
            const response = await fetch(api.employees, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (response.ok) {
                navigate('/pim');
            } else {
                console.error('Failed to add employee');
            }
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4 mb-6">
                <button
                    onClick={() => navigate('/pim')}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors text-gray-500"
                >
                    <ChevronLeft size={24} />
                </button>
                <h2 className="text-xl font-semibold text-gray-700">Add Employee</h2>
            </div>

            <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-100 p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-8">

                    {/* --- Basic Information --- */}
                    <div className="md:col-span-3">
                        <h3 className="text-lg font-medium text-primary mb-4 pb-2 border-b border-gray-100">Personal Details</h3>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-600">Employee Id <span className="text-red-500">*</span></label>
                        <input type="text" name="employeeId" value={formData.employeeId} onChange={handleChange} required className="w-full form-input" />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-600">First Name <span className="text-red-500">*</span></label>
                        <input type="text" name="firstName" value={formData.firstName} onChange={handleChange} required className="w-full form-input" />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-600">Middle Name</label>
                        <input type="text" name="middleName" value={formData.middleName} onChange={handleChange} className="w-full form-input" />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-600">Last Name <span className="text-red-500">*</span></label>
                        <input type="text" name="lastName" value={formData.lastName} onChange={handleChange} required className="w-full form-input" />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-600">Date of Birth</label>
                        <input type="date" name="dateOfBirth" value={formData.dateOfBirth} onChange={handleChange} className="w-full form-input" />
                    </div>

                    <div className="space-y-2">
                        <CustomSelect label="Gender" value={formData.gender} onChange={(val) => handleSelectChange('gender', val)} options={['Male', 'Female', 'Other']} />
                    </div>

                    <div className="space-y-2">
                        <CustomSelect label="Marital Status" value={formData.maritalStatus} onChange={(val) => handleSelectChange('maritalStatus', val)} options={['Single', 'Married', 'Divorced', 'Widowed']} />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-600">Nationality</label>
                        <input type="text" name="nationality" value={formData.nationality} onChange={handleChange} className="w-full form-input" />
                    </div>


                    {/* --- Contact Information --- */}
                    <div className="md:col-span-3 mt-4">
                        <h3 className="text-lg font-medium text-primary mb-4 pb-2 border-b border-gray-100">Contact Details</h3>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-600">Email</label>
                        <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full form-input" />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-600">Phone</label>
                        <input type="text" name="phone" value={formData.phone} onChange={handleChange} className="w-full form-input" />
                    </div>


                    {/* --- Address --- */}
                    <div className="md:col-span-3 mt-4">
                        <h3 className="text-lg font-medium text-primary mb-4 pb-2 border-b border-gray-100">Address</h3>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-600">Street</label>
                        <input type="text" name="street" value={formData.street} onChange={handleChange} className="w-full form-input" />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-600">City</label>
                        <input type="text" name="city" value={formData.city} onChange={handleChange} className="w-full form-input" />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-600">State/Province</label>
                        <input type="text" name="state" value={formData.state} onChange={handleChange} className="w-full form-input" />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-600">Zip/Postal Code</label>
                        <input type="text" name="zipCode" value={formData.zipCode} onChange={handleChange} className="w-full form-input" />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-600">Country</label>
                        <input type="text" name="country" value={formData.country} onChange={handleChange} className="w-full form-input" />
                    </div>


                    {/* --- Job Information --- */}
                    <div className="md:col-span-3 mt-4">
                        <h3 className="text-lg font-medium text-primary mb-4 pb-2 border-b border-gray-100">Job Details</h3>
                    </div>

                    <div className="space-y-2">
                        <CustomSelect label="Job Title" value={formData.designation} onChange={(val) => handleSelectChange('designation', val)} options={['Software Engineer', 'Senior Software Engineer', 'QA Engineer', 'Designer', 'Product Manager', 'CEO', 'Director']} />
                    </div>

                    <div className="space-y-2">
                        <CustomSelect label="Employment Status" value={formData.employmentStatus} onChange={(val) => handleSelectChange('employmentStatus', val)} options={['Permanent', 'Probation', 'Contract', 'Internship']} />
                    </div>

                    <div className="space-y-2">
                        <CustomSelect
                            label="Sub Unit"
                            value={formData.department}
                            onChange={(val) => handleSelectChange('department', val)}
                            options={[
                                { value: 'ITCS', label: 'ITCS (IT Consulting and Services)', level: 0 },
                                { value: 'AdminHR', label: 'Administration and Human Resources', level: 1 },
                                { value: 'Management', label: 'Management', level: 1 },
                                { value: 'Administration', label: 'Administration', level: 2 },
                                { value: 'Human Resources', label: 'Human Resources', level: 2 },
                                { value: 'Technical', label: 'Technical', level: 1 },
                            ]}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-600">Supervisor Name</label>
                        <input type="text" name="reportingManager" value={formData.reportingManager} onChange={handleChange} className="w-full form-input" />
                    </div>

                    <div className="space-y-2">
                        <CustomSelect label="Employment Type" value={formData.employmentType} onChange={(val) => handleSelectChange('employmentType', val)} options={['Full-time', 'Part-time']} />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-600">Work Location</label>
                        <input type="text" name="workLocation" value={formData.workLocation} onChange={handleChange} className="w-full form-input" />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-600">Joining Date</label>
                        <input type="date" name="joiningDate" value={formData.joiningDate} onChange={handleChange} className="w-full form-input" />
                    </div>
                </div>

                <div className="flex justify-end pt-6 border-t border-gray-100 gap-4">
                    <button type="button" onClick={() => navigate('/pim')} className="px-6 py-2.5 rounded-full border border-gray-300 text-gray-600 font-medium hover:bg-gray-50 transition-colors">Cancel</button>
                    <button type="submit" disabled={loading} className="px-8 py-2.5 rounded-full bg-primary text-white font-medium hover:bg-purple-700 transition-colors shadow-lg shadow-purple-200 flex items-center gap-2">
                        <Save size={18} />
                        {loading ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </form>
            <style>{`
                .form-input {
                    border: 1px solid #e2e8f0;
                    border-radius: 0.5rem;
                    padding: 0.625rem 1rem;
                    font-size: 0.875rem;
                    transition: all 0.2s;
                    outline: none;
                }
                .form-input:focus {
                    border-color: #662d91;
                    box-shadow: 0 0 0 1px #662d91;
                }
            `}</style>
        </div>
    );
};

export default AddEmployee;
