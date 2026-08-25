import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import MainLayout from './components/Layout/MainLayout';
import ProtectedRoute from './components/ProtectedRoute';
import RoleProtectedRoute from './components/RoleProtectedRoute';
import { usePermissions } from './hooks/usePermissions';
import PIM from './pages/PIM/PIM';
import EmployeeList from './pages/PIM/EmployeeList';
import AddEmployeeWizard from './pages/PIM/AddEmployeeWizard';
import EmployeeProfile from './pages/PIM/EmployeeProfile';
import MyInfo from './pages/MyInfo/MyInfo';
import Dashboard from './pages/Dashboard/Dashboard';
import { SignIn } from './pages/SignIn';
import { AuthCallback } from './pages/AuthCallback';
import OnboardingWelcome from './pages/Onboarding/OnboardingWelcome';
// import AuditLogs from './pages/Admin/AuditLogs';
import UserManagement from './pages/Admin/UserManagement';
import AdminSettings from './pages/Admin/AdminSettings';
import Directory from './pages/Directory/Directory';

///test stash
// import AttendanceDashboard from './pages/Attendance/AttendanceDashboard';
// import EmployeeAttendanceReport from './pages/Attendance/EmployeeAttendanceReport';
import ResetPassword from './pages/ResetPassword';
import ErrorBoundary from './components/ErrorBoundary';
import ExpenseClaimDashboard from './pages/Claim/ExpenseClaimDashboard';
import LeaveDashboard from './pages/Leave/LeaveDashboard';
import PrivacyPolicy from './pages/PrivacyPolicy';
import Terms from './pages/Terms';
import CompanyPolicy from './pages/CompanyPolicy/CompanyPolicy';
import NotFound from './pages/NotFound';
//testing stash
// NEW V2 Attendance Pages
import AttendanceRouter from './modules/attendance/AttendanceRouter';
import V2ZktMonitor from './modules/attendance/pages/ZktMonitor';
import MyRequests from './pages/MyRequests/MyRequests';
import AdminRequests from './pages/MyRequests/AdminRequests';
import DocumentVerification from './pages/DocumentVerification/DocumentVerification';
import PayrollDashboard from './pages/Payroll/PayrollDashboard';
import PayrollRunDetail from './pages/Payroll/PayrollRunDetail';
import ProvidentFundReport from './pages/Payroll/ProvidentFundReport';
import MyPayslips from './pages/Payroll/MyPayslips';

// Dynamic Page Titles Mapping
const ROUTE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/my-info': 'My Profile',
  '/pim': 'Personnel Information (PIM)',
  '/pim/add': 'Add Employee',
  '/directory': 'Employee Directory',
  '/claim': 'Expense Claims',
  '/attendance': 'Attendance',
  '/leave': 'Leave Management',
  '/my-payslips': 'My Payslips',
  '/payroll': 'Payroll Management',
  '/provident-fund': 'Provident Fund Report',
  '/my-requests': 'My Requests',
  '/my-requests/manage': 'Manage Requests',
  '/company-policy': 'Company Policy Manual',
  '/privacy-policy': 'Privacy Policy',
  '/terms': 'Terms of Service',
  '/admin': 'User Management',
  '/admin/settings': 'System Settings',
  '/login': 'Sign In',
  '/reset-password': 'Reset Password',
  '/onboarding': 'Welcome Onboarding',
  '/zkt-monitor': 'Biometric Device Monitor',
};

const PageTitleHandler = () => {
  const location = useLocation();

  useEffect(() => {
    const pathname = location.pathname;
    let title = 'ITCS HRM';
    
    if (ROUTE_TITLES[pathname]) {
      title = `${ROUTE_TITLES[pathname]} | ITCS HRM`;
    } else {
      const matched = Object.keys(ROUTE_TITLES).find(key => key !== '/' && pathname.startsWith(key));
      if (matched) {
        title = `${ROUTE_TITLES[matched]} | ITCS HRM`;
      }
    }
    document.title = title;
  }, [location.pathname]);

  return null;
};

// Component to redirect if already logged in
const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-6 text-lg font-semibold text-gray-700">Loading...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

const ModuleProtectedRoute = ({ moduleName, children }: { moduleName: string; children: React.ReactNode }) => {
  const { hasAccess } = usePermissions();
  if (!hasAccess(moduleName)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
};

const SubModuleProtectedRoute = ({ moduleName, subTabKey, children }: { moduleName: string; subTabKey: string; children: React.ReactNode }) => {
  const { hasAccess, hasSubAccess } = usePermissions();
  if (!hasAccess(moduleName) || !hasSubAccess(moduleName, subTabKey)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
};

function AppRoutes() {
  const { login } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <SignIn onLogin={login} />
          </PublicRoute>
        }
      />
      <Route
        path="/reset-password"
        element={
          <PublicRoute>
            <ResetPassword />
          </PublicRoute>
        }
      />
      <Route
        path="/auth/callback"
        element={<AuthCallback />}
      />
      <Route
        path="/privacy-policy"
        element={<PrivacyPolicy />}
      />
      <Route
        path="/company-policy"
        element={<CompanyPolicy />}
      />
      <Route
        path="/terms"
        element={<Terms />}
      />
      <Route
        path="/verify/:documentId"
        element={<DocumentVerification />}
      />
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <OnboardingWelcome />
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        {/* Open to all authenticated users */}
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="my-info" element={<MyInfo />} />
        <Route path="performance" element={<div className="p-4">Performance Module Placeholder</div>} />
        <Route path="directory" element={<Directory />} />
        <Route path="company-policy" element={<CompanyPolicy />} />
        <Route path="claim" element={<ModuleProtectedRoute moduleName="claim"><ExpenseClaimDashboard /></ModuleProtectedRoute>} />
        <Route path="attendance" element={<ModuleProtectedRoute moduleName="attendance"><AttendanceRouter /></ModuleProtectedRoute>} />
        <Route path="leave" element={<ModuleProtectedRoute moduleName="leave"><LeaveDashboard /></ModuleProtectedRoute>} />
        <Route path="my-payslips" element={<MyPayslips />} />
        <Route path="payroll" element={<ModuleProtectedRoute moduleName="payroll"><PayrollDashboard /></ModuleProtectedRoute>} />
        <Route path="provident-fund" element={<ProvidentFundReport />} />
        
        {/* Restricted to Admins only */}
        <Route element={<RoleProtectedRoute allowedRoles={['super-admin', 'admin', 'hr', 'finance']} />}>
          <Route path="zkt-monitor" element={<ModuleProtectedRoute moduleName="attendance"><V2ZktMonitor /></ModuleProtectedRoute>} />
          <Route path="payroll/runs/:id" element={<ModuleProtectedRoute moduleName="payroll"><PayrollRunDetail /></ModuleProtectedRoute>} />
        </Route>

        {/* Restricted to Admins & Managers & HR */}
        <Route element={<RoleProtectedRoute allowedRoles={['super-admin', 'admin', 'manager', 'hr', 'finance']} />}>
          <Route path="search" element={<div className="p-4">Search Module Placeholder</div>} />
          <Route path="pim" element={<ModuleProtectedRoute moduleName="pim"><PIM /></ModuleProtectedRoute>}>
            <Route index element={<EmployeeList />} />
            <Route path="add" element={<AddEmployeeWizard />} />
            <Route path="edit/:id" element={<AddEmployeeWizard />} />
            <Route path="view/:id" element={<EmployeeProfile />} />
          </Route>
        </Route>

        {/* Restricted to Super Admins & Admins */}
        <Route element={<RoleProtectedRoute allowedRoles={['super-admin', 'admin']} />}>
          <Route path="admin" element={<UserManagement />} />
        </Route>

        <Route path="my-requests" element={<MyRequests />} />
        
        <Route element={<RoleProtectedRoute allowedRoles={['super-admin', 'admin', 'manager', 'hr', 'finance']} />}>
          <Route path="my-requests/manage" element={<SubModuleProtectedRoute moduleName="requests" subTabKey="manage-requests"><AdminRequests /></SubModuleProtectedRoute>} />
        </Route>
        
        {/* Restricted to Admins only */}
        <Route element={<RoleProtectedRoute allowedRoles={['super-admin', 'admin', 'hr', 'finance']} />}>
          <Route path="admin/settings" element={<ModuleProtectedRoute moduleName="settings"><AdminSettings /></ModuleProtectedRoute>} />
          <Route path="recruitment" element={<div className="p-4">Recruitment Module Placeholder</div>} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
      {/* Catch-all for any other unmatched routes */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <PageTitleHandler />
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
