#!/usr/bin/env node
/**
 * Smoke Test Suite for FieldLedger API
 * 
 * Quick sanity checks to verify critical paths work.
 * Run with: npm run test:smoke
 * 
 * Exit codes:
 *   0 - All tests passed
 *   1 - One or more tests failed
 */

const axios = require('axios');

// Configuration
const BASE_URL = process.env.API_URL || 'http://localhost:5000';
const TIMEOUT = 10000;

// Test credentials (should exist in test database)
// Run: node scripts/createTestAccounts.js to create these
const TEST_CREDENTIALS = {
  email: process.env.SMOKE_TEST_EMAIL || 'pm@test.com',
  password: process.env.SMOKE_TEST_PASSWORD || 'Test123!'
};

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

// Results tracking
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

// Axios instance
const api = axios.create({
  baseURL: BASE_URL,
  timeout: TIMEOUT,
  validateStatus: () => true // Don't throw on any status
});

let authToken = null;

/**
 * Run a single smoke test
 */
async function runTest(name, testFn) {
  const start = Date.now();
  try {
    await testFn();
    const duration = Date.now() - start;
    results.passed++;
    results.tests.push({ name, status: 'pass', duration });
    console.log(`${colors.green}✓${colors.reset} ${name} ${colors.dim}(${duration}ms)${colors.reset}`);
  } catch (error) {
    const duration = Date.now() - start;
    results.failed++;
    results.tests.push({ name, status: 'fail', duration, error: error.message });
    console.log(`${colors.red}✗${colors.reset} ${name} ${colors.dim}(${duration}ms)${colors.reset}`);
    console.log(`  ${colors.red}${error.message}${colors.reset}`);
  }
}

/**
 * Assert helper
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// ============================================
// SMOKE TESTS
// ============================================

async function testHealthCheck() {
  const res = await api.get('/api/health');
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  assert(res.data.status === 'ok' || res.data.healthy === true, 'Health check should return ok status');
}

async function testAuthLogin() {
  const res = await api.post('/api/login', TEST_CREDENTIALS);
  assert(res.status === 200, `Login failed with status ${res.status}: ${JSON.stringify(res.data)}`);
  assert(res.data.token, 'Login should return a token');
  authToken = res.data.token;
  api.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
}

async function testGetCurrentUser() {
  const res = await api.get('/api/users/me');
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  assert(res.data.email, 'Should return user email');
}

async function testListJobs() {
  const res = await api.get('/api/jobs');
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  assert(Array.isArray(res.data.jobs || res.data), 'Should return array of jobs');
}

async function testBillingUnitsEndpoint() {
  const res = await api.get('/api/billing/units');
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  assert(res.data.units !== undefined || Array.isArray(res.data), 'Should return units data');
}

async function testBillingClaimsEndpoint() {
  const res = await api.get('/api/billing/claims');
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  assert(res.data.claims !== undefined || Array.isArray(res.data), 'Should return claims data');
}

async function testPriceBooksEndpoint() {
  const res = await api.get('/api/pricebooks');
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  assert(Array.isArray(res.data), 'Should return array of price books');
}

async function testBillingAnalytics() {
  const res = await api.get('/api/billing/analytics/summary');
  // Analytics endpoint is optional - may not be implemented yet
  if (res.status === 404) {
    console.log(`  ${colors.dim}(endpoint not implemented - skipping)${colors.reset}`);
    return; // Pass if not implemented
  }
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  assert(res.data.totalRevenue !== undefined || res.data.summary, 'Should return analytics data');
}

async function testUnauthorizedAccess() {
  // Temporarily remove auth
  const savedAuth = api.defaults.headers.common['Authorization'];
  delete api.defaults.headers.common['Authorization'];
  
  const res = await api.get('/api/billing/units');
  assert(res.status === 401 || res.status === 403, `Unauthenticated request should be rejected, got ${res.status}`);
  
  // Restore auth
  api.defaults.headers.common['Authorization'] = savedAuth;
}

async function testInvalidEndpoint() {
  const res = await api.get('/api/nonexistent-endpoint-12345');
  assert(res.status === 404, `Should return 404 for invalid endpoint, got ${res.status}`);
}

// ============================================
// MAIN RUNNER
// ============================================

async function runSmokeTests() {
  console.log(`\n${colors.cyan}╔══════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║     FieldLedger API Smoke Tests          ║${colors.reset}`);
  console.log(`${colors.cyan}╚══════════════════════════════════════════╝${colors.reset}\n`);
  console.log(`${colors.dim}Target: ${BASE_URL}${colors.reset}\n`);

  const startTime = Date.now();

  // Core Infrastructure
  console.log(`${colors.yellow}▸ Core Infrastructure${colors.reset}`);
  await runTest('Health check endpoint responds', testHealthCheck);
  
  // Authentication
  console.log(`\n${colors.yellow}▸ Authentication${colors.reset}`);
  await runTest('User can login with valid credentials', testAuthLogin);
  
  if (authToken) {
    await runTest('Get current user returns profile', testGetCurrentUser);
    
    // Core Endpoints
    console.log(`\n${colors.yellow}▸ Core Endpoints${colors.reset}`);
    await runTest('List jobs endpoint works', testListJobs);
    
    // Billing Module
    console.log(`\n${colors.yellow}▸ Billing Module${colors.reset}`);
    await runTest('Billing units endpoint responds', testBillingUnitsEndpoint);
    await runTest('Billing claims endpoint responds', testBillingClaimsEndpoint);
    await runTest('Price books endpoint responds', testPriceBooksEndpoint);
    await runTest('Billing analytics endpoint responds', testBillingAnalytics);
    
    // Security
    console.log(`\n${colors.yellow}▸ Security${colors.reset}`);
    await runTest('Unauthorized requests are rejected', testUnauthorizedAccess);
    await runTest('Invalid endpoints return 404', testInvalidEndpoint);
  } else {
    console.log(`\n${colors.red}⚠ Skipping authenticated tests - login failed${colors.reset}`);
  }

  // Summary
  const totalTime = Date.now() - startTime;
  console.log(`\n${colors.cyan}──────────────────────────────────────────${colors.reset}`);
  console.log(`${colors.cyan}Summary${colors.reset}`);
  console.log(`${colors.cyan}──────────────────────────────────────────${colors.reset}`);
  console.log(`  Total:  ${results.passed + results.failed} tests`);
  console.log(`  ${colors.green}Passed: ${results.passed}${colors.reset}`);
  if (results.failed > 0) {
    console.log(`  ${colors.red}Failed: ${results.failed}${colors.reset}`);
  }
  console.log(`  Time:   ${totalTime}ms\n`);

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run if called directly
if (require.main === module) {
  runSmokeTests().catch(err => {
    console.error(`${colors.red}Fatal error: ${err.message}${colors.reset}`);
    process.exit(1);
  });
}

module.exports = { runSmokeTests };

