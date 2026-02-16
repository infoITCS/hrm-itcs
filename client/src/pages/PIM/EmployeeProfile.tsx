
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, User, Phone, Briefcase, FileText, Download, Edit2, History, GraduationCap, Users, Shield, AlertCircle } from 'lucide-react';
import api from '../../utils/api';

const EmployeeProfile = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('personal');
    const [employee, setEmployee] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [auditLogs, setAuditLogs] = useState<any[]>([]);

    useEffect(() => {
        // Fetch employee data
        fetch(api.employees) // In real app, endpoint should be /api/employees/:id
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

        // Fetch audit logs
        fetch(`${api.auditLogs}?targetResource=Employee&targetId=${id}`)
            .then(res => res.json())
            .then(data => setAuditLogs(data || []))
            .catch(err => console.error('Error fetching audit logs:', err));
    }, [id]);

    if (loading) return <div className="p-8 text-center">Loading Profile...</div>;
    if (!employee) return <div className="p-8 text-center">Employee Not Found</div>;

    const tabs = [
        { id: 'personal', label: 'Personal', icon: User },
        { id: 'contact', label: 'Contact', icon: Phone },
        { id: 'job', label: 'Job', icon: Briefcase },
        { id: 'history', label: 'Employment History', icon: History },
        { id: 'education', label: 'Education', icon: GraduationCap },
        { id: 'dependents', label: 'Dependents', icon: Users },
        { id: 'documents', label: 'Documents', icon: FileText },
        { id: 'audit', label: 'Audit Logs', icon: Shield },
    ];

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header / Banner */}
            <div className="flex items-center gap-4 animate-slide-up">
                <button onClick={() => navigate('/pim')} className="p-2 hover:bg-primary-50 rounded-xl text-gray-500 hover:text-primary-600 transition-all">
                    <ChevronLeft size={24} />
                </button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-gray-800">{employee.firstName} {employee.lastName}</h1>
                    <p className="text-gray-500">{employee.jobInfo?.designation} • {employee.jobInfo?.department}</p>
                </div>
                <button
                    onClick={() => navigate(`/pim/edit/${employee.employeeId}`)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all font-medium shadow-sm hover:shadow-md"
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
                        className={`flex items-center gap-2 px-6 py-3 font-medium text-sm transition-all border-b-2 ${activeTab === tab.id
                            ? 'border-indigo-600 text-indigo-600 bg-gradient-to-r from-indigo-50 to-purple-50'
                            : 'border-transparent text-slate-500 hover:text-indigo-600 hover:bg-indigo-50/50'
                            }`}
                    >
                        <tab.icon size={16} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content Body */}
            <div className="bg-white rounded-lg p-6 shadow-sm border border-slate-200/50 min-h-[400px] animate-slide-up">

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

                {/* Dependents Tab */}
                {activeTab === 'dependents' && (
                    <div className="space-y-6 animate-fadeIn">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-700 mb-4 border-b pb-2">Dependents</h3>
                            {employee.dependents?.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {employee.dependents.map((dep: any, i: number) => (
                                        <div key={i} className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200 hover:bg-gradient-to-br hover:from-blue-100 hover:to-indigo-100 transition-colors">
                                            <p className="font-medium text-gray-800">{dep.name}</p>
                                            <p className="text-sm text-gray-500">{dep.relation}</p>
                                            <p className="text-sm text-gray-500">DOB: {formatDate(dep.dateOfBirth)}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : <p className="text-gray-400 italic">No dependents listed</p>}
                        </div>
                    </div>
                )}

                {/* Employment History Tab */}
                {activeTab === 'history' && (
                    <div className="space-y-6 animate-fadeIn">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-700 mb-4 border-b pb-2">Previous Employment</h3>
                            {employee.employmentHistory?.length > 0 ? (
                                <div className="space-y-4">
                                    {employee.employmentHistory.map((history: any, i: number) => (
                                        <div key={i} className="p-4 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg border border-indigo-200 hover:bg-gradient-to-br hover:from-indigo-100 hover:to-purple-100 transition-colors">
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <p className="font-semibold text-gray-800">{history.companyName}</p>
                                                    <p className="text-sm text-gray-600">{history.jobTitle}</p>
                                                </div>
                                                <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded">
                                                    {formatDate(history.startDate)} - {formatDate(history.endDate)}
                                                </span>
                                            </div>
                                            {history.reasonForLeaving && (
                                                <p className="text-sm text-gray-500 mt-2">Reason: {history.reasonForLeaving}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : <p className="text-gray-400 italic">No employment history recorded</p>}
                        </div>
                    </div>
                )}

                {/* Education Tab */}
                {activeTab === 'education' && (
                    <div className="space-y-6 animate-fadeIn">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-700 mb-4 border-b pb-2">Educational Background</h3>
                            {employee.education?.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {employee.education.map((edu: any, i: number) => (
                                        <div key={i} className="p-4 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg border border-purple-200 hover:bg-gradient-to-br hover:from-purple-100 hover:to-indigo-100 transition-colors">
                                            <p className="font-semibold text-gray-800">{edu.level}</p>
                                            <p className="text-sm text-gray-600">{edu.institute}</p>
                                            <p className="text-sm text-gray-500">Year: {edu.year}</p>
                                            {edu.score && <p className="text-sm text-gray-500">Score: {edu.score}</p>}
                                        </div>
                                    ))}
                                </div>
                            ) : <p className="text-gray-400 italic">No education records</p>}
                        </div>
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
                                        <div key={i} className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200 hover:bg-gradient-to-br hover:from-blue-100 hover:to-indigo-100 transition-colors">
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

                        <div className="col-span-full mt-4 p-4 bg-gradient-to-r from-indigo-50 via-purple-50 to-indigo-50 rounded-lg border border-indigo-200">
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
                                {employee.attachments.map((file: any, i: number) => {
                                    const getFileTypeColor = (type: string) => {
                                        const colors: any = {
                                            'ID': 'from-blue-600 to-cyan-600',
                                            'Contract': 'from-green-600 to-emerald-600',
                                            'Certificate': 'from-purple-600 to-pink-600',
                                            'Degree': 'from-orange-600 to-amber-600',
                                            'Experience Letter': 'from-indigo-600 to-purple-600',
                                            'Document': 'from-gray-600 to-slate-600'
                                        };
                                        return colors[type] || colors['Document'];
                                    };
                                    return (
                                        <div key={i} className="flex items-center justify-between p-4 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg border border-indigo-200 hover:bg-gradient-to-br hover:from-indigo-100 hover:to-purple-100 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 bg-gradient-to-r ${getFileTypeColor(file.fileType)} rounded-lg shadow-sm text-white`}>
                                                    <FileText size={20} />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-medium text-gray-800">{file.fileName}</p>
                                                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">{file.fileType || 'Document'}</span>
                                                    </div>
                                                    <p className="text-xs text-gray-500">Uploaded on {formatDate(file.uploadDate)}</p>
                                                </div>
                                            </div>
                                            <button className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all">
                                                <Download size={20} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-12 text-gray-400">
                                <FileText size={48} className="mx-auto mb-4 opacity-20" />
                                <p>No documents uploaded yet</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Audit Logs Tab */}
                {activeTab === 'audit' && (
                    <div className="animate-fadeIn">
                        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="flex items-center gap-2 text-blue-800">
                                <AlertCircle size={16} />
                                <p className="text-sm font-medium">All changes to this employee record are tracked here</p>
                            </div>
                        </div>
                        {auditLogs.length > 0 ? (
                            <div className="space-y-3">
                                {auditLogs.map((log: any, i: number) => (
                                    <div key={i} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                                    log.action === 'CREATE' ? 'bg-green-100 text-green-700' :
                                                    log.action === 'UPDATE' ? 'bg-blue-100 text-blue-700' :
                                                    'bg-red-100 text-red-700'
                                                }`}>
                                                    {log.action}
                                                </span>
                                                <p className="text-sm text-gray-600 mt-1">By: {log.performedBy}</p>
                                            </div>
                                            <span className="text-xs text-gray-500">{formatDate(log.timestamp)}</span>
                                        </div>
                                        {log.details && (
                                            <div className="mt-2 text-sm text-gray-700">
                                                {typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : log.details}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-12 text-gray-400">
                                <Shield size={48} className="mx-auto mb-4 opacity-20" />
                                <p>No audit logs available</p>
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
