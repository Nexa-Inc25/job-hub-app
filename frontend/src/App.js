import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { pdfjs } from 'react-pdf';
import Login from './components/Login';
import Signup from './components/Signup';
import Dashboard from './components/Dashboard';
// import Jobhub from './components/Jobhub'; // Currently unused
import CreateWorkOrder from './components/CreateWorkOrder';
import EmergencyWO from './components/EmergencyWO';
import Forms from './components/Forms';
import WorkOrderDetails from './components/WorkOrderDetails';
import JobFileSystem from './components/JobFileSystem';
import TemplateManager from './components/TemplateManager';
import Calendar from './components/Calendar';
import { ThemeProvider } from './ThemeContext';

// Set PDF.js worker globally - use non-ESM build for CRA compatibility
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/" element={<Dashboard />} />
          <Route path="/jobs/:id" element={<JobFileSystem />} />
          <Route path="/jobs/:id/files" element={<JobFileSystem />} />
          <Route path="/jobs/:id/details" element={<WorkOrderDetails />} />
          <Route path="/create-wo" element={<CreateWorkOrder />} />
          <Route path="/emergency-wo" element={<EmergencyWO />} />
          <Route path="/forms" element={<Forms />} />
          <Route path="/admin/templates" element={<TemplateManager />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="*" element={<div>404 - Not Found</div>} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
