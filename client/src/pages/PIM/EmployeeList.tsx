import React from 'react';
import { Plus, ArrowUpDown, Pencil, Trash } from 'lucide-react';
import DeleteModal from '../../components/UI/DeleteModal';
import { useNavigate } from 'react-router-dom';
import CustomSelect from '../../components/UI/CustomSelect';

const EmployeeList = () => {
    const navigate = useNavigate();
    const [employees, setEmployees] = React.useState<any[]>([]);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
    const [employeeToDelete, setEmployeeToDelete] = React.useState<string | null>(null);

    const handleDeleteClick = (id: string) => {
        setEmployeeToDelete(id);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = () => {
        if (!employeeToDelete) return;

        fetch(`http://localhost:5000/api/employees/${employeeToDelete}`, {
            method: 'DELETE',
        })
            .then(res => {
                if (res.ok) {
                    setEmployees(prev => prev.filter(emp => emp.employeeId !== employeeToDelete));
                    setIsDeleteModalOpen(false);
                    setEmployeeToDelete(null);
                } else {
                    console.error('Failed to delete');
                }
            })
            .catch(err => console.error('Error deleting employee:', err));
    };

    React.useEffect(() => {
        fetch('http://localhost:5000/api/employees')
            .then(res => res.json())
            .then(data => setEmployees(data))
            .catch(err => console.error('Error fetching employees:', err));
    }, []);

    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="bg-white rounded-lg shadow-sm border border-slate-200/50 p-6 animate-slide-up">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-gray-800 tracking-tight">Employee Information</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                    {/* Row 1 */}
                    <div className="space-y-1">
                        <label className="block text-sm font-semibold text-gray-700">Employee Name</label>
                        <input
                            type="text"
                            placeholder="Type for hints..."
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-200 bg-white transition-all"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="block text-sm font-semibold text-gray-700">Employee Id</label>
                        <input
                            type="text"
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-200 bg-white transition-all"
                        />
                    </div>

                    <div className="space-y-1">
                        <CustomSelect
                            label="Employment Status"
                            options={['Full Time Permanent', 'Part Time', 'Contract']}
                        />
                    </div>

                    {/* Row 2 */}
                    <div className="space-y-1">
                        <CustomSelect
                            label="Include"
                            options={['Current Employees Only', 'Past Employees Only', 'All']}
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="block text-sm font-semibold text-gray-700">Supervisor Name</label>
                        <input
                            type="text"
                            placeholder="Type for hints..."
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-200 bg-white transition-all"
                        />
                    </div>

                    <div className="space-y-1">
                        <CustomSelect
                            label="Job Title"
                            options={['Software Engineer', 'QA Engineer', 'Designer']}
                        />
                    </div>

                    {/* Row 3 */}
                    <div className="space-y-1">
                        <CustomSelect
                            label="Sub Unit"
                            options={[
                                { value: 'ITCS', label: 'ITCS (IT Consulting and Services)', level: 0 },
                                { value: 'AdminHR', label: 'Administration and Human Resources', level: 1 },
                                { value: 'Administration', label: 'Administration', level: 2 },
                                { value: 'Human Resources', label: 'Human Resources', level: 2 },
                                { value: 'MarketingSales', label: 'Marketing and Sales', level: 1 },
                                { value: 'Marketing', label: 'Marketing', level: 2 },
                                { value: 'Sales', label: 'Sales', level: 2 },
                                { value: 'Technical', label: 'Technical', level: 1 },
                                { value: 'Customer Support', label: 'Customer Support', level: 2 },
                                { value: 'Pre-Sales', label: 'Pre-Sales', level: 2 },
                                { value: 'Finance', label: 'Finance', level: 1 },
                                { value: 'Billing and Collection', label: 'Billing and Collection', level: 2 },
                                { value: 'Accounts', label: 'Accounts', level: 2 },
                                { value: 'Taxation', label: 'Taxation', level: 2 },
                            ]}
                        />
                    </div>
                </div>

                <div className="flex justify-start pt-4 border-t border-gray-100">
                    {/* Add button removed here as it is shown separate in screenshot */}
                </div>
            </div>

            <div className="flex justify-start">
                <button
                    onClick={() => navigate('/pim/add')}
                    className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-6 py-3 rounded-lg flex items-center gap-2 text-sm font-medium transition-all shadow-sm hover:shadow-md"
                >
                    <Plus size={18} /> Add Employee
                </button>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200/50 overflow-hidden animate-slide-up">
                <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-purple-50">
                    <h3 className="text-gray-700 font-semibold">({employees.length}) Records Found</h3>
                </div>
                <div className="overflow-visible">
                    <table className="w-full text-sm text-left border-separate border-spacing-y-0">
                        <thead className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 text-white font-semibold">
                            <tr>
                                <th className="px-6 py-4 rounded-l-lg w-10">
                                    <input type="checkbox" className="rounded border-gray-300 w-4 h-4 cursor-pointer" />
                                </th>
                                <th className="px-4 py-4 cursor-pointer group hover:bg-white/20 transition-colors">
                                    <div className="flex items-center gap-1">
                                        Id <ArrowUpDown size={14} className="text-white/80 group-hover:text-white" />
                                    </div>
                                </th>
                                <th className="px-4 py-4 cursor-pointer group hover:bg-white/20 transition-colors">
                                    <div className="flex items-center gap-1">
                                        <div className="flex flex-col leading-tight">
                                            <span>First (& Middle)</span>
                                            <span>Name</span>
                                        </div>
                                        <ArrowUpDown size={14} className="text-white/80 group-hover:text-white" />
                                    </div>
                                </th>
                                <th className="px-4 py-4 cursor-pointer group hover:bg-white/20 transition-colors">
                                    <div className="flex items-center gap-1">
                                        Last Name <ArrowUpDown size={14} className="text-white/80 group-hover:text-white" />
                                    </div>
                                </th>
                                <th className="px-4 py-4 cursor-pointer group hover:bg-white/20 transition-colors">
                                    <div className="flex items-center gap-1">
                                        Job Title <ArrowUpDown size={14} className="text-white/80 group-hover:text-white" />
                                    </div>
                                </th>
                                <th className="px-4 py-4 cursor-pointer group hover:bg-white/20 transition-colors">
                                    <div className="flex items-center gap-1">
                                        <div className="flex flex-col leading-tight">
                                            <span>Employment</span>
                                            <span>Status</span>
                                        </div>
                                        <ArrowUpDown size={14} className="text-white/80 group-hover:text-white" />
                                    </div>
                                </th>
                                <th className="px-4 py-4 cursor-pointer group hover:bg-white/20 transition-colors">
                                    <div className="flex items-center gap-1">
                                        Sub Unit <ArrowUpDown size={14} className="text-white/80 group-hover:text-white" />
                                    </div>
                                </th>
                                <th className="px-4 py-4 cursor-pointer group hover:bg-white/20 transition-colors">
                                    <div className="flex items-center gap-1">
                                        Supervisor <ArrowUpDown size={14} className="text-white/80 group-hover:text-white" />
                                    </div>
                                </th>
                                <th className="px-6 py-4 rounded-r-lg">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/50 bg-white">
                            {employees.map((emp) => (
                                <tr key={emp.employeeId} className="hover:bg-indigo-50/50 transition-colors group">
                                    <td className="px-6 py-4 rounded-l-lg border-y border-l border-transparent group-hover:border-gray-100">
                                        <input type="checkbox" className="rounded border-gray-300 w-4 h-4" />
                                    </td>
                                    <td className="px-4 py-4 border-y border-transparent group-hover:border-indigo-200 text-indigo-600 hover:text-indigo-700 hover:underline cursor-pointer font-medium">{emp.employeeId}</td>
                                    <td className="px-4 py-4 border-y border-transparent group-hover:border-gray-100">{emp.firstName} {emp.middleName ? emp.middleName : ''}</td>
                                    <td className="px-4 py-4 border-y border-transparent group-hover:border-gray-100">{emp.lastName}</td>
                                    <td className="px-4 py-4 border-y border-transparent group-hover:border-gray-100">{emp.jobInfo?.designation || '-'}</td>
                                    <td className="px-4 py-4 border-y border-transparent group-hover:border-gray-100">{emp.employmentStatus?.status || emp.jobInfo?.employmentType || '-'}</td>
                                    <td className="px-4 py-4 border-y border-transparent group-hover:border-gray-100">{emp.jobInfo?.department || '-'}</td>
                                    <td className="px-4 py-4 border-y border-transparent group-hover:border-gray-100">{emp.jobInfo?.reportingManager || '-'}</td>
                                    <td className="px-6 py-4 rounded-r-lg border-y border-r border-transparent group-hover:border-gray-100">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => navigate(`/pim/view/${emp.employeeId}`)}
                                                className="p-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                                            >
                                                <Pencil size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteClick(emp.employeeId)}
                                                className="p-2 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"
                                            >
                                                <Trash size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {employees.length === 0 && (
                                <tr>
                                    <td colSpan={9} className="px-6 py-12 text-center text-gray-400">
                                        No records found
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <DeleteModal
                    isOpen={isDeleteModalOpen}
                    onClose={() => setIsDeleteModalOpen(false)}
                    onConfirm={confirmDelete}
                />
            </div>
        </div>
    );
};

export default EmployeeList;
