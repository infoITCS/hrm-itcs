
import { NavLink, Outlet } from 'react-router-dom';
import { ChevronDown, HelpCircle, Plus } from 'lucide-react';

const PIM = () => {
    return (
        <div className="space-y-6">
            {/* Sub Navigation */}
            <div className="flex justify-between items-center bg-white p-3 rounded-lg shadow-sm border border-slate-200/50">
                <div className="flex gap-2">
                    <button className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-all border border-indigo-200">
                        Configuration <ChevronDown size={14} />
                    </button>
                    <NavLink 
                        to="/pim" 
                        end 
                        className={({ isActive }) => `px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                            isActive 
                                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm' 
                                : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-600'
                        }`}
                    >
                        Employee List
                    </NavLink>
                    <NavLink 
                        to="/pim/add" 
                        className={({ isActive }) => `px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                            isActive 
                                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm' 
                                : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-600'
                        }`}
                    >
                        Add Employee
                    </NavLink>
                    <NavLink 
                        to="/pim/reports" 
                        className={({ isActive }) => `px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                            isActive 
                                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm' 
                                : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-600'
                        }`}
                    >
                        Reports
                    </NavLink>
                </div>
                <button className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all">
                    <HelpCircle size={20} />
                </button>
            </div>

            {/* Content Area */}
            <div>
                <Outlet />
            </div>
        </div>
    );
};

export default PIM;
