import { usePermissions } from '../../hooks/usePermissions';
import V2AdminDashboard from './pages/AdminDashboard';
import V2EmployeeDashboard from './pages/EmployeeDashboard';

const AttendanceRouter = () => {
    const { role, isModuleAdmin, isModuleManagerOrAbove, hasSubAccess } = usePermissions();
    const isAdmin = role === 'super-admin' || isModuleAdmin('attendance') || isModuleManagerOrAbove('attendance') || hasSubAccess('attendance', 'attendance-dashboard');

    return isAdmin ? <V2AdminDashboard /> : <V2EmployeeDashboard />;
};

export default AttendanceRouter;
