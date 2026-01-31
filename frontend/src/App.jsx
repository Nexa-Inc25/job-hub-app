/**
 * Job Hub Pro - Work Order Management System
 * Copyright (c) 2024-2026 Job Hub Pro. All Rights Reserved.
 * Proprietary and Confidential. Unauthorized copying or distribution prohibited.
 */

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { pdfjs } from 'react-pdf';
import { ThemeProvider } from './ThemeContext';
import ErrorBoundary from './components/ErrorBoundary';
import NetworkStatus from './components/NetworkStatus';
import { Box, CircularProgress } from '@mui/material';

// Lazy load all route components for code splitting
const Login = lazy(() => import('./components/Login'));
const Signup = lazy(() => import('./components/Signup'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const CreateWorkOrder = lazy(() => import('./components/CreateWorkOrder'));
const EmergencyWO = lazy(() => import('./components/EmergencyWO'));
const Forms = lazy(() => import('./components/Forms'));
const WorkOrderDetails = lazy(() => import('./components/WorkOrderDetails'));
const JobFileSystem = lazy(() => import('./components/JobFileSystem'));
const TemplateManager = lazy(() => import('./components/TemplateManager'));
const Calendar = lazy(() => import('./components/Calendar'));
const OwnerDashboard = lazy(() => import('./components/OwnerDashboard'));
const SecurityDashboard = lazy(() => import('./components/SecurityDashboard'));
const CompanyOnboarding = lazy(() => import('./components/CompanyOnboarding'));
const AdminUsersList = lazy(() => import('./components/AdminUsersList'));
const AdminJobsOverview = lazy(() => import('./components/AdminJobsOverview'));
const AdminAICosts = lazy(() => import('./components/AdminAICosts'));
const QADashboard = lazy(() => import('./components/QADashboard'));
const SpecLibrary = lazy(() => import('./components/SpecLibrary'));
const ProcedureManager = lazy(() => import('./components/ProcedureManager'));
const AsBuiltAssistant = lazy(() => import('./components/AsBuiltAssistant'));
const TailboardForm = lazy(() => import('./components/TailboardForm'));

// Set PDF.js worker globally - use CDN for react-pdf v9 compatibility
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// Loading fallback component
const PageLoader = () => (
  <Box sx={{ 
    display: 'flex', 
    justifyContent: 'center', 
    alignItems: 'center', 
    minHeight: '100vh',
    bgcolor: 'background.default'
  }}>
    <CircularProgress size={48} />
  </Box>
);

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <NetworkStatus />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Suspense fallback={<PageLoader />}>
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
              <Route path="/admin/owner-dashboard" element={<OwnerDashboard />} />
              <Route path="/admin/security" element={<SecurityDashboard />} />
              <Route path="/admin/onboarding" element={<CompanyOnboarding />} />
              <Route path="/admin/users" element={<AdminUsersList />} />
              <Route path="/admin/jobs-overview" element={<AdminJobsOverview />} />
              <Route path="/admin/ai-costs" element={<AdminAICosts />} />
              <Route path="/qa/dashboard" element={<QADashboard />} />
              <Route path="/qa/spec-library" element={<SpecLibrary />} />
              <Route path="/admin/procedures" element={<ProcedureManager />} />
              <Route path="/jobs/:jobId/asbuilt-assistant" element={<AsBuiltAssistant />} />
              <Route path="/jobs/:jobId/tailboard" element={<TailboardForm />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="*" element={<div>404 - Not Found</div>} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
