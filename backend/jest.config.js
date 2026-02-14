/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Jest Configuration for FieldLedger Backend
 * 
 * Uses mongodb-memory-server for isolated database testing.
 */

module.exports = {
  testEnvironment: 'node',
  
  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/*.spec.js'
  ],
  
  // Coverage configuration
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverageFrom: [
    'routes/**/*.js',
    'controllers/**/*.js',
    'services/**/*.js',
    'middleware/**/*.js',
    'models/**/*.js',
    'utils/**/*.js',
    '!**/node_modules/**',
    '!**/__tests__/**'
  ],
  
  // Coverage thresholds - enforced for CI
  // Note: thresholds set to current baseline (~16%); raise as test coverage grows
  coverageThreshold: {
    global: {
      branches: 12,
      functions: 18,
      lines: 14,
      statements: 14
    }
  },
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
  
  // Timeout for async operations
  testTimeout: 30000,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Verbose output
  verbose: true
};

