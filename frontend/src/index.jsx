/**
 * FieldLedger - Unit-Price Billing for Utility Contractors
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and Confidential. Unauthorized copying or distribution prohibited.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

const verboseClientLogs = (import.meta.env.VITE_VERBOSE_CLIENT_LOGS || '').toLowerCase() === 'true';
const enableServiceWorker = (import.meta.env.VITE_ENABLE_SERVICE_WORKER || '').toLowerCase() === 'true';
const isCypressRuntime = typeof window !== 'undefined' && Boolean(window.Cypress);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// Disable service worker in Cypress to avoid stale/offline cache test flakiness.
if (enableServiceWorker && !isCypressRuntime) {
  serviceWorkerRegistration.register({
    onSuccess: () => {
      if (verboseClientLogs) {
        console.warn('App is ready for offline use!');
      }
    },
    onUpdate: (registration) => {
      if (verboseClientLogs) {
        console.warn('New version available! Refresh to update.');
      }
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    }
  });
} else {
  serviceWorkerRegistration.unregister();
}
