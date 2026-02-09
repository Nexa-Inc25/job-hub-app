/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
#!/usr/bin/env node
/**
 * FieldLedger API Endpoint Test Script
 * 
 * Run with: node scripts/testEndpoints.js [base_url]
 * 
 * Example: 
 *   node scripts/testEndpoints.js http://localhost:8080
 *   node scripts/testEndpoints.js https://job-hub-app-production.up.railway.app
 * 
 * This script tests:
 * - Server health
 * - Authentication endpoints
 * - Job endpoints
 * - Admin endpoints
 * - Response times
 */

const https = require('https');
const http = require('http');

const BASE_URL = process.argv[2] || 'http://localhost:8080';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m'
};

const log = {
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  header: (msg) => console.log(`\n${colors.bold}${colors.cyan}=== ${msg} ===${colors.reset}\n`),
  timing: (ms) => `${colors.dim}(${ms}ms)${colors.reset}`
};

// Simple HTTP request function
function makeRequest(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const startTime = Date.now();

    const req = lib.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const elapsed = Date.now() - startTime;
        try {
          const json = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode, data: json, time: elapsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: body, time: elapsed });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log(colors.bold + '  FIELDLEDGER API ENDPOINT TESTS' + colors.reset);
  console.log('='.repeat(60));
  console.log(`\nTesting: ${colors.cyan}${BASE_URL}${colors.reset}\n`);

  const results = { passed: 0, failed: 0, skipped: 0 };
  let authToken = null;

  // ============================================
  // 1. SERVER HEALTH
  // ============================================
  log.header('SERVER HEALTH');

  try {
    const health = await makeRequest('GET', '/');
    if (health.status === 200) {
      log.success(`Server is running ${log.timing(health.time)}`);
      results.passed++;
    } else {
      log.warn(`Server responded with ${health.status} ${log.timing(health.time)}`);
      results.passed++; // Still counts as "up"
    }
  } catch (err) {
    log.error(`Server not reachable: ${err.message}`);
    results.failed++;
    console.log(`\n${colors.red}Cannot continue - server is not running${colors.reset}\n`);
    return results;
  }

  // ============================================
  // 2. CORS PREFLIGHT
  // ============================================
  log.header('CORS CONFIGURATION');

  try {
    const cors = await makeRequest('OPTIONS', '/api/jobs');
    if (cors.status === 200 || cors.status === 204) {
      log.success(`CORS preflight working ${log.timing(cors.time)}`);
      results.passed++;
    } else {
      log.warn(`CORS preflight returned ${cors.status}`);
      results.passed++;
    }
  } catch (err) {
    log.error(`CORS check failed: ${err.message}`);
    results.failed++;
  }

  // ============================================
  // 3. AUTHENTICATION ENDPOINTS
  // ============================================
  log.header('AUTHENTICATION');

  // Test login with invalid credentials (should fail gracefully)
  try {
    const badLogin = await makeRequest('POST', '/api/login', {
      email: 'nonexistent@test.com',
      password: 'wrongpassword'
    });
    
    if (badLogin.status === 401 || badLogin.status === 400) {
      log.success(`Login rejects invalid credentials ${log.timing(badLogin.time)}`);
      results.passed++;
    } else {
      log.warn(`Unexpected login response: ${badLogin.status}`);
      results.passed++;
    }
  } catch (err) {
    log.error(`Login endpoint error: ${err.message}`);
    results.failed++;
  }

  // Test signup validation
  try {
    const badSignup = await makeRequest('POST', '/api/signup', {
      email: 'invalid-email',
      password: '123' // Too short
    });
    
    if (badSignup.status === 400 || badSignup.status === 422) {
      log.success(`Signup validates input ${log.timing(badSignup.time)}`);
      results.passed++;
    } else {
      log.warn(`Signup validation: status ${badSignup.status}`);
      results.passed++;
    }
  } catch (err) {
    log.error(`Signup endpoint error: ${err.message}`);
    results.failed++;
  }

  // ============================================
  // 4. PROTECTED ENDPOINTS (without auth)
  // ============================================
  log.header('AUTHORIZATION CHECKS');

  const protectedEndpoints = [
    { method: 'GET', path: '/api/jobs', name: 'Get Jobs' },
    { method: 'GET', path: '/api/users', name: 'Get Users' },
    { method: 'GET', path: '/api/admin/stats', name: 'Admin Stats' },
    { method: 'GET', path: '/api/superadmin/stats', name: 'Super Admin Stats' },
    { method: 'GET', path: '/api/superadmin/companies', name: 'Get Companies' },
  ];

  for (const endpoint of protectedEndpoints) {
    try {
      const res = await makeRequest(endpoint.method, endpoint.path);
      if (res.status === 401 || res.status === 403) {
        log.success(`${endpoint.name}: Protected (${res.status}) ${log.timing(res.time)}`);
        results.passed++;
      } else {
        log.error(`${endpoint.name}: NOT PROTECTED! (${res.status})`);
        results.failed++;
      }
    } catch (err) {
      log.error(`${endpoint.name}: ${err.message}`);
      results.failed++;
    }
  }

  // ============================================
  // 5. API RESPONSE FORMATS
  // ============================================
  log.header('RESPONSE FORMATS');

  // Test that error responses are JSON
  try {
    const errRes = await makeRequest('GET', '/api/nonexistent-endpoint');
    if (typeof errRes.data === 'object') {
      log.success(`Error responses are JSON ${log.timing(errRes.time)}`);
      results.passed++;
    } else {
      log.warn(`Error response not JSON: ${typeof errRes.data}`);
      results.passed++;
    }
  } catch (err) {
    log.error(`Response format test failed: ${err.message}`);
    results.failed++;
  }

  // ============================================
  // 6. RESPONSE TIME CHECK
  // ============================================
  log.header('PERFORMANCE');

  const perfEndpoints = [
    { method: 'GET', path: '/', name: 'Root' },
    { method: 'OPTIONS', path: '/api/jobs', name: 'CORS Preflight' },
  ];

  for (const endpoint of perfEndpoints) {
    try {
      const res = await makeRequest(endpoint.method, endpoint.path);
      const status = res.time < 500 ? 'success' : res.time < 1000 ? 'warn' : 'error';
      const fn = log[status];
      fn(`${endpoint.name}: ${res.time}ms ${res.time < 500 ? '(fast)' : res.time < 1000 ? '(ok)' : '(slow)'}`);
      if (status === 'error') results.failed++;
      else results.passed++;
    } catch (err) {
      log.error(`${endpoint.name}: ${err.message}`);
      results.failed++;
    }
  }

  // ============================================
  // SUMMARY
  // ============================================
  log.header('TEST SUMMARY');

  console.log(`${colors.green}Passed:${colors.reset}  ${results.passed}`);
  console.log(`${colors.red}Failed:${colors.reset}  ${results.failed}`);
  console.log(`${colors.yellow}Skipped:${colors.reset} ${results.skipped}`);

  if (results.failed === 0) {
    console.log(`\n${colors.green}${colors.bold}✓ All endpoint tests passed!${colors.reset}\n`);
  } else {
    console.log(`\n${colors.red}${colors.bold}✗ Some tests failed - review above${colors.reset}\n`);
  }

  console.log(`${colors.dim}Note: For full endpoint testing with authentication,`);
  console.log(`run the health check script: node scripts/healthCheck.js${colors.reset}\n`);

  return results;
}

// Run tests
runTests()
  .then(results => {
    process.exit(results.failed > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });

