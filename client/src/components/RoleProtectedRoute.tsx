import { Navigate, Outlet } from 'react-router-dom';
import { usePermissions } from '../hooks/usePermissions';

interface RoleProtectedRouteProps {
    allowedRoles: string[];
}

const RoleProtectedRoute = ({ allowedRoles }: RoleProtectedRouteProps) => {
    const { role } = usePermissions();

    // If user's role is not in the allowedRoles array, redirect them to dashboard
    if (!allowedRoles.includes(role)) {
        return <Navigate to="/dashboard" replace />;
    }

    return <Outlet />;
};

export default RoleProtectedRoute;
