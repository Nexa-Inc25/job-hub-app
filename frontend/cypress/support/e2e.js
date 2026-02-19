/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
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
  // Ignore chunk/script parse errors from stale cached assets in CI.
  if (err.message.includes("Unexpected token '<'")) {
    return false;
  }
  return true;
});

// Add custom command logging
beforeEach(() => {
  // Keep app-shell providers from hitting auth-protected endpoints in E2E mocks.
  cy.intercept('GET', '**/api/notifications*', {
    statusCode: 200,
    body: { notifications: [], unreadCount: 0 }
  }).as('getNotifications');
  cy.intercept('GET', '**/api/notifications/unread/count', {
    statusCode: 200,
    body: { count: 0 }
  }).as('getUnreadCount');
  cy.intercept('PUT', '**/api/notifications/**', {
    statusCode: 200,
    body: {}
  }).as('updateNotifications');

  cy.log('Starting test:', Cypress.currentTest.title);
});

