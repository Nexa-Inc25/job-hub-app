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

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// Register service worker for offline functionality
serviceWorkerRegistration.register({
  onSuccess: () => {
    console.warn('App is ready for offline use!');
  },
  onUpdate: (registration) => {
    console.warn('New version available! Refresh to update.');
    // Optionally show a prompt to the user
    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }
});
