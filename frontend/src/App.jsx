/**
 * FieldLedger - Unit-Price Billing for Utility Contractors
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and Confidential. Unauthorized copying or distribution prohibited.
 */

import React, { Suspense, lazy } from 'react';
import PropTypes from 'prop-types';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { ThemeProvider } from './ThemeContext';
import { SocketProvider } from './contexts/SocketContext';
import { NotificationProvider } from './contexts/NotificationContext';
import ErrorBoundary from './components/ErrorBoundary';
import NetworkStatus from './components/NetworkStatus';

// Lazy load layout components
const AppShell = lazy(() => import('./components/layout/AppShell'));

// Lazy load all route components for code splitting
const Login = lazy(() => import('./components/Login'));
const Signup = lazy(() => import('./components/Signup'));
const DemoLanding = lazy(() => import('./components/DemoLanding'));
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
const ForemanCloseOut = lazy(() => import('./components/ForemanCloseOut'));
const TimesheetEntry = lazy(() => import('./components/TimesheetEntry'));
const LMEForm = lazy(() => import('./components/LMEForm'));
const BillingDashboard = lazy(() => import('./components/billing/BillingDashboard'));
const UnitEntryForm = lazy(() => import('./components/billing/UnitEntryForm'));
const ForemanCapturePage = lazy(() => import('./components/billing/ForemanCapturePage'));
const PriceBookAdmin = lazy(() => import('./components/billing/PriceBookAdmin'));
const PricingPage = lazy(() => import('./components/billing/PricingPage'));
const BillingSettings = lazy(() => import('./components/billing/BillingSettings'));
const AsBuiltRouter = lazy(() => import('./components/asbuilt/AsBuiltRouter'));

// SmartForms - PDF template field mapping and filling
const SmartFormsPage = lazy(() => import('./components/smartforms/SmartFormsPage'));
const TemplateEditor = lazy(() => import('./components/smartforms/TemplateEditor'));
const TemplateFill = lazy(() => import('./components/smartforms/TemplateFill'));

// Field Tickets (T&M / Change Orders) - Phase 2
const FieldTicketForm = lazy(() => import('./components/billing/FieldTicketForm'));
const AtRiskDashboard = lazy(() => import('./components/billing/AtRiskDashboard'));

// Bidding Intelligence - Phase 2
const BiddingDashboard = lazy(() => import('./components/bidding/BiddingDashboard'));
const EstimateBuilder = lazy(() => import('./components/bidding/EstimateBuilder'));

// CSS-only loading spinner - avoids MUI import in critical path
const spinnerStyle = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  minHeight: '100vh',
  background: 'hsl(210 20% 98%)',
};

const loaderStyle = {
  width: 48,
  height: 48,
  border: '4px solid hsl(214 32% 91%)',
  borderTopColor: 'hsl(238 83% 66%)',
  borderRadius: '50%',
  animation: 'spin 1s linear infinite',
};

// Loading fallback component - pure CSS to minimize bundle in critical path
const PageLoader = () => (
  <>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    <div style={spinnerStyle}>
      <div style={loaderStyle} />
    </div>
  </>
);

// Wrapper component for protected routes with AppShell
const ProtectedRoute = ({ children }) => (
  <AppShell>{children}</AppShell>
);

ProtectedRoute.propTypes = {
  children: PropTypes.node.isRequired,
};

// Wrapper that blocks demo users from accessing certain routes
const DemoRestrictedRoute = ({ children }) => {
  const isDemo = localStorage.getItem('isDemo') === 'true';
  
  if (isDemo) {
    return (
      <AppShell>
        <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Access Restricted</h1>
          <p className="text-muted-foreground mb-4">
            This feature is not available in demo mode.
          </p>
          <a href="/dashboard" className="text-primary hover:underline">
            Return to Dashboard
          </a>
        </div>
      </AppShell>
    );
  }
  
  return <AppShell>{children}</AppShell>;
};

DemoRestrictedRoute.propTypes = {
  children: PropTypes.node.isRequired,
};

// 404 component with styling
const NotFound = () => (
  <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground">
    <h1 className="text-6xl font-bold text-primary">404</h1>
    <p className="mt-4 text-xl text-muted-foreground">Page not found</p>
    <a href="/dashboard" className="mt-6 text-primary hover:underline">
      Return to Dashboard
    </a>
  </div>
);

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <SocketProvider>
          <NotificationProvider>
        <NetworkStatus />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Auth routes - no AppShell */}
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/demo" element={<DemoLanding />} />

              {/* Protected routes with AppShell layout */}
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/jobs/:id" element={<ProtectedRoute><JobFileSystem /></ProtectedRoute>} />
              <Route path="/jobs/:id/files" element={<ProtectedRoute><JobFileSystem /></ProtectedRoute>} />
              <Route path="/jobs/:id/details" element={<ProtectedRoute><WorkOrderDetails /></ProtectedRoute>} />
              <Route path="/create-wo" element={<ProtectedRoute><CreateWorkOrder /></ProtectedRoute>} />
              <Route path="/emergency-wo" element={<ProtectedRoute><EmergencyWO /></ProtectedRoute>} />
              <Route path="/forms" element={<ProtectedRoute><Forms /></ProtectedRoute>} />
              <Route path="/admin/templates" element={<DemoRestrictedRoute><TemplateManager /></DemoRestrictedRoute>} />
              <Route path="/admin/owner-dashboard" element={<ProtectedRoute><OwnerDashboard /></ProtectedRoute>} />
              <Route path="/admin/security" element={<DemoRestrictedRoute><SecurityDashboard /></DemoRestrictedRoute>} />
              <Route path="/admin/onboarding" element={<ProtectedRoute><CompanyOnboarding /></ProtectedRoute>} />
              <Route path="/admin/users" element={<ProtectedRoute><AdminUsersList /></ProtectedRoute>} />
              <Route path="/admin/jobs-overview" element={<ProtectedRoute><AdminJobsOverview /></ProtectedRoute>} />
              <Route path="/admin/ai-costs" element={<ProtectedRoute><AdminAICosts /></ProtectedRoute>} />
              <Route path="/qa/dashboard" element={<ProtectedRoute><QADashboard /></ProtectedRoute>} />
              <Route path="/qa/spec-library" element={<ProtectedRoute><SpecLibrary /></ProtectedRoute>} />
              <Route path="/admin/procedures" element={<DemoRestrictedRoute><ProcedureManager /></DemoRestrictedRoute>} />
              <Route path="/jobs/:jobId/asbuilt-assistant" element={<ProtectedRoute><AsBuiltAssistant /></ProtectedRoute>} />
              <Route path="/jobs/:jobId/tailboard" element={<ProtectedRoute><TailboardForm /></ProtectedRoute>} />
              <Route path="/jobs/:jobId/closeout" element={<ProtectedRoute><ForemanCloseOut /></ProtectedRoute>} />
              <Route path="/jobs/:jobId/timesheet" element={<ProtectedRoute><TimesheetEntry /></ProtectedRoute>} />
              <Route path="/jobs/:jobId/lme" element={<ProtectedRoute><LMEForm /></ProtectedRoute>} />
              <Route path="/calendar" element={<ProtectedRoute><Calendar /></ProtectedRoute>} />
              <Route path="/billing" element={<ProtectedRoute><BillingDashboard /></ProtectedRoute>} />
              <Route path="/billing/pricebooks" element={<ProtectedRoute><PriceBookAdmin /></ProtectedRoute>} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/settings/billing" element={<ProtectedRoute><BillingSettings /></ProtectedRoute>} />
              <Route path="/billing/capture" element={<ProtectedRoute><UnitEntryForm /></ProtectedRoute>} />
              <Route path="/billing/capture/:jobId" element={<ProtectedRoute><ForemanCapturePage /></ProtectedRoute>} />
              <Route path="/jobs/:jobId/log-unit" element={<ProtectedRoute><ForemanCapturePage /></ProtectedRoute>} />
              <Route path="/asbuilt-router" element={<ProtectedRoute><AsBuiltRouter /></ProtectedRoute>} />
              
              {/* SmartForms - PDF template field mapping and filling */}
              <Route path="/smartforms" element={<ProtectedRoute><SmartFormsPage /></ProtectedRoute>} />
              <Route path="/smartforms/editor/:templateId" element={<ProtectedRoute><TemplateEditor /></ProtectedRoute>} />
              <Route path="/smartforms/fill/:templateId" element={<ProtectedRoute><TemplateFill /></ProtectedRoute>} />
              
              {/* Field Tickets (T&M / Change Orders) - Phase 2 */}
              <Route path="/jobs/:jobId/field-ticket" element={<ProtectedRoute><FieldTicketForm /></ProtectedRoute>} />
              <Route path="/jobs/:jobId/field-ticket/:ticketId" element={<ProtectedRoute><FieldTicketForm /></ProtectedRoute>} />
              <Route path="/billing/change-orders" element={<ProtectedRoute><AtRiskDashboard /></ProtectedRoute>} />
              
              {/* Bidding Intelligence - Phase 2 */}
              <Route path="/bidding" element={<ProtectedRoute><BiddingDashboard /></ProtectedRoute>} />
              <Route path="/bidding/estimate" element={<ProtectedRoute><EstimateBuilder /></ProtectedRoute>} />
              
              {/* 404 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Analytics />
          </NotificationProvider>
        </SocketProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
