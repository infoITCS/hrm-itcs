
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, User, Phone, Briefcase, FileText, Download, Edit2 } from 'lucide-react';

const EmployeeProfile = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('personal');
    const [employee, setEmployee] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Fetch employee data
        fetch(`http://localhost:5000/api/employees`) // In real app, endpoint should be /api/employees/:id
            .then(res => res.json())
            .then(data => {
                // Mock filtering since our API currently returns all. 
                // Ideally backend has GET /:id
                const found = data.find((e: any) => e.employeeId === id) || data[0]; // Fallback for demo
                setEmployee(found);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, [id]);

    if (loading) return <div className="p-8 text-center">Loading Profile...</div>;
    if (!employee) return <div className="p-8 text-center">Employee Not Found</div>;

    const tabs = [
        { id: 'personal', label: 'Personal', icon: User },
        { id: 'contact', label: 'Contact', icon: Phone },
        { id: 'job', label: 'Job', icon: Briefcase },
        { id: 'documents', label: 'Documents', icon: FileText },
    ];

    return (
        <div className="space-y-6">
            {/* Header / Banner */}
            <div className="flex items-center gap-4">
                <button onClick={() => navigate('/pim')} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
                    <ChevronLeft size={24} />
                </button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-gray-800">{employee.firstName} {employee.lastName}</h1>
                    <p className="text-gray-500">{employee.jobInfo?.designation} • {employee.jobInfo?.department}</p>
                </div>
                <button
                    onClick={() => navigate(`/pim/edit/${employee.employeeId}`)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                    <Edit2 size={16} /> Edit Profile
                </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-6 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === tab.id
                            ? 'border-primary text-primary'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        <tab.icon size={16} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content Body */}
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 min-h-[400px]">

                {/* Personal Tab */}
                {activeTab === 'personal' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-6 gap-x-8 animate-fadeIn">
                        <Field label="Employee ID" value={employee.employeeId} />
                        <Field label="Full Name" value={`${employee.firstName} ${employee.middleName || ''} ${employee.lastName}`} />
                        <Field label="Date of Birth" value={formatDate(employee.dateOfBirth)} />
                        <Field label="Gender" value={employee.gender} />
                        <Field label="Marital Status" value={employee.maritalStatus} />
                        <Field label="Nationality" value={employee.nationality} />
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
                                        <div key={i} className="p-4 bg-gray-50 rounded-lg border border-gray-100">
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
                        <Field label="Reporting Manager" value={employee.jobInfo?.reportingManager} />
                        <Field label="Employment Type" value={employee.jobInfo?.employmentType} />
                        <Field label="Work Location" value={employee.jobInfo?.workLocation} />
                        <Field label="Joining Date" value={formatDate(employee.jobInfo?.joiningDate)} />

                        <div className="col-span-full mt-4 p-4 bg-purple-50 rounded-lg border border-purple-100">
                            <h4 className="font-medium text-purple-900 mb-2">Current Status</h4>
                            <div className="flex gap-4">
                                <Field
                                    label="Status"
                                    value={typeof employee.employmentStatus === 'string' ? employee.employmentStatus : employee.employmentStatus?.status}
                                />
                                <Field
                                    label="Start Date"
                                    value={formatDate(typeof employee.employmentStatus === 'string' ? '' : employee.employmentStatus?.startDate)}
                                />
                                {typeof employee.employmentStatus !== 'string' && employee.employmentStatus?.status === 'Probation' && (
                                    <Field label="Probation Ends" value={formatDate(employee.employmentStatus?.probationEndDate)} />
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Documents Tab */}
                {activeTab === 'documents' && (
                    <div className="animate-fadeIn">
                        {employee.attachments?.length > 0 ? (
                            <div className="space-y-4">
                                {employee.attachments.map((file: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100 hover:border-gray-300 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-white rounded shadow-sm text-primary">
                                                <FileText size={20} />
                                            </div>
                                            <div>
                                                <p className="font-medium text-gray-800">{file.fileName}</p>
                                                <p className="text-xs text-gray-500">Uploaded on {formatDate(file.uploadDate)}</p>
                                            </div>
                                        </div>
                                        <button className="p-2 text-gray-500 hover:text-primary transition-colors">
                                            <Download size={20} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-12 text-gray-400">
                                <FileText size={48} className="mx-auto mb-4 opacity-20" />
                                <p>No documents uploaded yet</p>
                            </div>
                        )}
                    </div>
                )}

            </div>
        </div>
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
