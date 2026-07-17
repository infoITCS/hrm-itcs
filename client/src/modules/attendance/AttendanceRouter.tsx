import { usePermissions } from '../../hooks/usePermissions';
import V2AdminDashboard from './pages/AdminDashboard';
import V2EmployeeDashboard from './pages/EmployeeDashboard';

const AttendanceRouter = () => {
    const { role } = usePermissions();
    const isAdmin = ['super-admin', 'admin', 'hr', 'finance', 'manager'].includes(role);

    return isAdmin ? <V2AdminDashboard /> : <V2EmployeeDashboard />;
};

export default AttendanceRouter;
