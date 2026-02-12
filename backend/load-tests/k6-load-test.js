/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * k6 Load Testing Script
 * 
 * Tests API performance under load.
 * 
 * Installation:
 *   brew install k6 (macOS)
 *   choco install k6 (Windows)
 *   sudo apt install k6 (Ubuntu)
 * 
 * Usage:
 *   k6 run load-tests/k6-load-test.js
 *   k6 run --vus 50 --duration 5m load-tests/k6-load-test.js
 * 
 * Environment variables:
 *   BASE_URL - API base URL (default: http://localhost:5000)
 *   AUTH_TOKEN - Valid JWT token for authenticated requests
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const loginDuration = new Trend('login_duration');
const jobsListDuration = new Trend('jobs_list_duration');
const _jobDetailDuration = new Trend('job_detail_duration');

// Test configuration
export const options = {
  // Ramp up pattern
  stages: [
    { duration: '30s', target: 10 },   // Ramp up to 10 users
    { duration: '1m', target: 10 },    // Stay at 10 users
    { duration: '30s', target: 25 },   // Ramp up to 25 users
    { duration: '2m', target: 25 },    // Stay at 25 users
    { duration: '30s', target: 50 },   // Ramp up to 50 users
    { duration: '1m', target: 50 },    // Stay at 50 users
    { duration: '30s', target: 0 },    // Ramp down
  ],
  
  // Performance thresholds
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% of requests under 500ms
    http_req_failed: ['rate<0.01'],    // Less than 1% failures
    errors: ['rate<0.05'],              // Less than 5% error rate
    login_duration: ['p(95)<1000'],     // Login under 1s
    jobs_list_duration: ['p(95)<800'],  // Job list under 800ms
    job_detail_duration: ['p(95)<600'], // Job detail under 600ms
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

// Test data
const testCredentials = {
  email: 'loadtest@example.com',
  password: 'LoadTest123!',
};

export function setup() {
  // Verify API is healthy before starting
  const healthRes = http.get(`${BASE_URL}/api/health`);
  check(healthRes, {
    'API is healthy': (r) => r.status === 200,
  });
  
  if (healthRes.status !== 200) {
    throw new Error('API is not healthy, aborting load test');
  }
  
  console.log('Load test starting against:', BASE_URL);
  return { baseUrl: BASE_URL };
}

export default function(_data) {
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': AUTH_TOKEN ? `Bearer ${AUTH_TOKEN}` : '',
    },
  };

  // ============================================
  // Health Check (unauthenticated)
  // ============================================
  group('Health Check', () => {
    const res = http.get(`${BASE_URL}/api/health`);
    
    const success = check(res, {
      'health status 200': (r) => r.status === 200,
      'health response time < 100ms': (r) => r.timings.duration < 100,
    });
    
    errorRate.add(!success);
  });

  sleep(0.5);

  // ============================================
  // Login Flow
  // ============================================
  group('Login', () => {
    const startTime = Date.now();
    
    const res = http.post(
      `${BASE_URL}/api/login`,
      JSON.stringify(testCredentials),
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    loginDuration.add(Date.now() - startTime);
    
    const success = check(res, {
      'login returns token or error': (r) => r.status === 200 || r.status === 401,
      'login response time < 1s': (r) => r.timings.duration < 1000,
    });
    
    errorRate.add(!success);
  });

  sleep(1);

  // Skip authenticated tests if no token
  if (!AUTH_TOKEN) {
    return;
  }

  // ============================================
  // Jobs List
  // ============================================
  group('Jobs List', () => {
    const startTime = Date.now();
    
    const res = http.get(`${BASE_URL}/api/jobs`, params);
    
    jobsListDuration.add(Date.now() - startTime);
    
    const success = check(res, {
      'jobs list status 200': (r) => r.status === 200,
      'jobs list is array': (r) => {
        try {
          const data = JSON.parse(r.body);
          return Array.isArray(data);
        } catch {
          return false;
        }
      },
      'jobs list response time < 800ms': (r) => r.timings.duration < 800,
    });
    
    errorRate.add(!success);
  });

  sleep(0.5);

  // ============================================
  // Jobs with Pagination
  // ============================================
  group('Jobs Pagination', () => {
    const res = http.get(`${BASE_URL}/api/jobs?limit=10&skip=0`, params);
    
    const success = check(res, {
      'paginated jobs status 200': (r) => r.status === 200,
    });
    
    errorRate.add(!success);
  });

  sleep(0.5);

  // ============================================
  // Jobs with Filter
  // ============================================
  group('Jobs Filter', () => {
    const statuses = ['new', 'in_progress', 'pre_fielding', 'scheduled'];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    
    const res = http.get(`${BASE_URL}/api/jobs?status=${status}`, params);
    
    const success = check(res, {
      'filtered jobs status 200': (r) => r.status === 200,
    });
    
    errorRate.add(!success);
  });

  sleep(1);

  // ============================================
  // Admin Audit Logs (if admin)
  // ============================================
  group('Admin Audit Logs', () => {
    const res = http.get(`${BASE_URL}/api/admin/audit-logs?limit=10`, params);
    
    // May return 403 if not admin, that's ok
    check(res, {
      'audit logs accessible or forbidden': (r) => r.status === 200 || r.status === 403,
    });
  });

  sleep(2);
}

export function teardown(_data) {
  console.log('Load test completed');
}

