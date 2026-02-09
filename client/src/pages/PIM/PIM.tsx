
import { NavLink, Outlet } from 'react-router-dom';
import { ChevronDown, HelpCircle, Plus } from 'lucide-react';

const PIM = () => {
    return (
        <div className="space-y-6">
            {/* Sub Navigation */}
            <div className="flex justify-between items-center bg-white p-2 rounded-lg shadow-sm">
                <div className="flex gap-2">
                    <button className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200">
                        Configuration <ChevronDown size={14} />
                    </button>
                    <NavLink to="/pim" end className={({ isActive }) => `px-4 py-2 text-sm font-medium rounded-md transition-colors ${isActive ? 'bg-gray-200 text-gray-800' : 'text-gray-600 hover:bg-gray-100'}`}>
                        Employee List
                    </NavLink>
                    <NavLink to="/pim/add" className={({ isActive }) => `px-4 py-2 text-sm font-medium rounded-md transition-colors ${isActive ? 'bg-gray-200 text-gray-800' : 'text-gray-600 hover:bg-gray-100'}`}>
                        Add Employee
                    </NavLink>
                    <NavLink to="/pim/reports" className={({ isActive }) => `px-4 py-2 text-sm font-medium rounded-md transition-colors ${isActive ? 'bg-gray-200 text-gray-800' : 'text-gray-600 hover:bg-gray-100'}`}>
                        Reports
                    </NavLink>
                </div>
                <button className="p-2 text-gray-400 hover:text-gray-600">
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
