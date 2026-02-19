/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 *
 * Sentry initialization for frontend error monitoring.
 * Imported once at the top of index.jsx — must run before React renders.
 * Silent no-op when VITE_SENTRY_DSN is not set.
 */

import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE || 'development',
    release: import.meta.env.VITE_APP_VERSION || '1.0.0',
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    tracesSampleRate: import.meta.env.MODE === 'production' ? 0.2 : 1.0,
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers.Authorization;
      }
      return event;
    },
  });
}

export default Sentry;
