import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './components/Layout/MainLayout';
import PIM from './pages/PIM/PIM';
import EmployeeList from './pages/PIM/EmployeeList';
import AddEmployeeWizard from './pages/PIM/AddEmployeeWizard';
import EmployeeProfile from './pages/PIM/EmployeeProfile';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Navigate to="/pim" replace />} />
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
