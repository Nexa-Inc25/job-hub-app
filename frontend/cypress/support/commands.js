// ***********************************************
// Custom commands for Job Hub Pro E2E tests
// ***********************************************

/**
 * Login command - handles authentication
 * @param {string} email - User email
 * @param {string} password - User password
 */
Cypress.Commands.add('login', (email, password) => {
  cy.session([email, password], () => {
    cy.visit('/login');
    cy.get('input[name="email"]').type(email);
    cy.get('input[name="password"]').type(password);
    cy.get('button[type="submit"]').click();
    cy.url().should('include', '/dashboard');
  });
});

/**
 * Login via API - faster login for tests that don't test login flow
 * @param {string} email - User email
 * @param {string} password - User password
 */
Cypress.Commands.add('loginViaApi', (email, password) => {
  cy.request({
    method: 'POST',
    url: `${Cypress.env('apiUrl')}/api/login`,
    body: { email, password }
  }).then((response) => {
    expect(response.status).to.eq(200);
    window.localStorage.setItem('token', response.body.token);
    window.localStorage.setItem('user', JSON.stringify(response.body.user));
  });
});

/**
 * Logout command
 */
Cypress.Commands.add('logout', () => {
  window.localStorage.removeItem('token');
  window.localStorage.removeItem('user');
  cy.visit('/login');
});

/**
 * Create a test job via API
 * @param {object} jobData - Job data
 */
Cypress.Commands.add('createTestJob', (jobData = {}) => {
  const token = window.localStorage.getItem('token');
  
  const defaultJob = {
    title: `Test Job ${Date.now()}`,
    pmNumber: `PM-${Date.now()}`,
    woNumber: `WO-${Date.now()}`,
    address: '123 Test Street',
    status: 'new',
    ...jobData
  };

  return cy.request({
    method: 'POST',
    url: `${Cypress.env('apiUrl')}/api/jobs`,
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: defaultJob
  }).then((response) => {
    expect(response.status).to.eq(201);
    return response.body;
  });
});

/**
 * Delete a test job via API
 * @param {string} jobId - Job ID to delete
 */
Cypress.Commands.add('deleteTestJob', (jobId) => {
  const token = window.localStorage.getItem('token');
  
  return cy.request({
    method: 'DELETE',
    url: `${Cypress.env('apiUrl')}/api/jobs/${jobId}`,
    headers: {
      Authorization: `Bearer ${token}`
    },
    failOnStatusCode: false
  });
});

/**
 * Wait for API to be ready
 */
Cypress.Commands.add('waitForApi', () => {
  cy.request({
    method: 'GET',
    url: `${Cypress.env('apiUrl')}/api/health`,
    retryOnStatusCodeFailure: true,
    timeout: 30000
  }).then((response) => {
    expect(response.status).to.eq(200);
  });
});

/**
 * Get by data-testid attribute
 * @param {string} testId - The data-testid value
 */
Cypress.Commands.add('getByTestId', (testId) => {
  return cy.get(`[data-testid="${testId}"]`);
});

/**
 * Check if element is visible and enabled
 * @param {string} selector - CSS selector
 */
Cypress.Commands.add('shouldBeClickable', { prevSubject: true }, (subject) => {
  cy.wrap(subject)
    .should('be.visible')
    .and('not.be.disabled');
});

/**
 * Intercept and mock API response
 * @param {string} method - HTTP method
 * @param {string} url - URL pattern
 * @param {object} response - Mock response
 * @param {string} alias - Alias for the intercept
 */
Cypress.Commands.add('mockApi', (method, url, response, alias) => {
  cy.intercept(method, url, response).as(alias);
});

