import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './components/Layout/MainLayout';
import PIM from './pages/PIM/PIM';
import EmployeeList from './pages/PIM/EmployeeList';
import AddEmployeeWizard from './pages/PIM/AddEmployeeWizard';
import EmployeeProfile from './pages/PIM/EmployeeProfile';
import { SignIn } from './pages/SignIn';
import { AuthCallback } from './pages/AuthCallback';

function App() {
  const handleLogin = (user: any) => {
    console.log('Logged in', user);
    // basic handling: redirect to /pim
    window.location.href = '/pim';
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<SignIn onLogin={handleLogin} />} />
        <Route path="/auth/callback" element={<AuthCallback onLogin={handleLogin} />} />
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Navigate to="/login" replace />} />
          <Route path="pim" element={<PIM />}>
            <Route index element={<EmployeeList />} />
            <Route path="add" element={<AddEmployeeWizard />} />
            <Route path="edit/:id" element={<AddEmployeeWizard />} />
            <Route path="view/:id" element={<EmployeeProfile />} />
          </Route>
          <Route path="admin" element={<div className="p-4">Admin Module Placeholder</div>} />
          <Route path="*" element={<div className="p-4">Page Not Found</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
