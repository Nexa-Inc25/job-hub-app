// ***********************************************************
// This file is processed and loaded automatically before your test files.
//
// This is a great place to put global configuration and behavior
// that modifies Cypress.
// ***********************************************************

import './commands';
import '@testing-library/cypress/add-commands';

// Prevent Cypress from failing tests on uncaught exceptions from the app
Cypress.on('uncaught:exception', (err, runnable) => {
  // Ignore ResizeObserver loop errors (common in React apps)
  if (err.message.includes('ResizeObserver loop')) {
    return false;
  }
  // Ignore network errors during tests
  if (err.message.includes('Network Error') || err.message.includes('Failed to fetch')) {
    return false;
  }
  return true;
});

// Add custom command logging
beforeEach(() => {
  cy.log('Starting test:', Cypress.currentTest.title);
});

