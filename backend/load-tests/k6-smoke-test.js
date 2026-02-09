/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * k6 Smoke Test
 * 
 * Quick sanity check that the API is responding.
 * Run this in CI to catch basic issues.
 * 
 * Usage:
 *   k6 run load-tests/k6-smoke-test.js
 */

import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 1,
  duration: '10s',
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.1'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

export default function() {
  // Health check
  const healthRes = http.get(`${BASE_URL}/api/health`);
  
  check(healthRes, {
    'health check returns 200': (r) => r.status === 200,
    'health check has status ok': (r) => {
      try {
        return JSON.parse(r.body).status === 'ok';
      } catch {
        return false;
      }
    },
    'health check under 500ms': (r) => r.timings.duration < 500,
  });
}

