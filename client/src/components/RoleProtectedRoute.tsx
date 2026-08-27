import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { usePermissions } from '../hooks/usePermissions';
import { useAuth } from '../contexts/AuthContext';

interface RoleProtectedRouteProps {
    allowedRoles: string[];
    moduleName?: string;
    subTabKey?: string;
}

const RoleProtectedRoute = ({ allowedRoles, moduleName, subTabKey }: RoleProtectedRouteProps) => {
    const { role, hasAccess, hasSubAccess } = usePermissions();
    const { user } = useAuth();
    const location = useLocation();

    // Direct role match
    if (allowedRoles.includes(role)) {
        return <Outlet />;
    }

    // Check explicit module override if moduleName is specified
    if (moduleName) {
        const moduleAllowed = hasAccess(moduleName);
        const subAllowed = subTabKey ? hasSubAccess(moduleName, subTabKey) : true;
        if (moduleAllowed && subAllowed) {
            return <Outlet />;
        }
    }

    // Dynamic fallback: extract primary segment from route (e.g. /pim -> 'pim', /payroll -> 'payroll')
    const primarySegment = location.pathname.split('/')[1]?.toLowerCase();
    if (primarySegment && user?.permissions?.[primarySegment]) {
        return <Outlet />;
    }

    // If user's role is not in the allowedRoles array and no override, redirect to dashboard
    return <Navigate to="/dashboard" replace />;
};

export default RoleProtectedRoute;
