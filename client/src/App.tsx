import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import MainLayout from './components/Layout/MainLayout';
import ProtectedRoute from './components/ProtectedRoute';
import RoleProtectedRoute from './components/RoleProtectedRoute';
import PIM from './pages/PIM/PIM';
import EmployeeList from './pages/PIM/EmployeeList';
import AddEmployeeWizard from './pages/PIM/AddEmployeeWizard';
import EmployeeProfile from './pages/PIM/EmployeeProfile';
import MyInfo from './pages/MyInfo/MyInfo';
import Dashboard from './pages/Dashboard/Dashboard';
import { SignIn } from './pages/SignIn';
import { AuthCallback } from './pages/AuthCallback';
import OnboardingWelcome from './pages/Onboarding/OnboardingWelcome';
import AuditLogs from './pages/Admin/AuditLogs';
import UserManagement from './pages/Admin/UserManagement';
import AdminSettings from './pages/Admin/AdminSettings';
import Directory from './pages/Directory/Directory';
import AttendanceDashboard from './pages/Attendance/AttendanceDashboard';
import ResetPassword from './pages/ResetPassword';
import ErrorBoundary from './components/ErrorBoundary';

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
        <Route path="leave" element={<div className="p-4">Leave Module Placeholder</div>} />
        <Route path="performance" element={<div className="p-4">Performance Module Placeholder</div>} />
        <Route path="directory" element={<Directory />} />
        <Route path="claim" element={<div className="p-4">Claim Module Placeholder</div>} />
        {/* Restricted to Admins & Managers */}
        <Route element={<RoleProtectedRoute allowedRoles={['super-admin', 'admin', 'manager']} />}>
          <Route path="search" element={<div className="p-4">Search Module Placeholder</div>} />
          <Route path="attendance" element={<AttendanceDashboard />} />
          <Route path="pim" element={<PIM />}>
            <Route index element={<EmployeeList />} />
            <Route path="add" element={<AddEmployeeWizard />} />
            <Route path="edit/:id" element={<AddEmployeeWizard />} />
            <Route path="view/:id" element={<EmployeeProfile />} />
          </Route>
        </Route>

        {/* Restricted to Super Admins only */}
        <Route element={<RoleProtectedRoute allowedRoles={['super-admin']} />}>
          <Route path="admin" element={<UserManagement />} />
        </Route>

        {/* Restricted to Admins only */}
        <Route element={<RoleProtectedRoute allowedRoles={['super-admin', 'admin']} />}>
          <Route path="admin/settings" element={<AdminSettings />} />
          <Route path="admin/audit" element={<AuditLogs />} />
          <Route path="recruitment" element={<div className="p-4">Recruitment Module Placeholder</div>} />
          <Route path="maintenance" element={<div className="p-4">Maintenance Module Placeholder</div>} />
        </Route>
        <Route path="*" element={<div className="p-4">Page Not Found</div>} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
