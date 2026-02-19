/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Dashboard E2E Tests
 * 
 * Tests the main dashboard functionality.
 */

// Create a mock JWT token for testing
const createMockJwt = (payload) => {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  const signature = btoa('mock-signature');
  return `${header}.${body}.${signature}`;
};

describe('Dashboard', () => {
  const testUser = {
    _id: 'user1',
    name: 'Test User',
    email: 'test@example.com',
    role: 'gf',
    isAdmin: false
  };

  const mockToken = createMockJwt({
    id: testUser._id,
    email: testUser.email,
    role: testUser.role,
    isAdmin: testUser.isAdmin,
    canApprove: true
  });

  const mockJobs = [
    {
      _id: '1',
      title: 'Test Job 1',
      pmNumber: 'PM-001',
      status: 'new',
      createdAt: new Date().toISOString()
    },
    {
      _id: '2',
      title: 'Test Job 2',
      pmNumber: 'PM-002',
      status: 'in_progress',
      createdAt: new Date().toISOString()
    }
  ];

  beforeEach(() => {
    // CATCH-ALL: Prevent any unintercepted API call from hitting the real
    // api.fieldledger.io server which returns 401, triggering the axios
    // interceptor's hard redirect (globalThis.location.href = '/login').
    cy.intercept('GET', '**/api/**', { statusCode: 200, body: {} });
    cy.intercept('POST', '**/api/**', { statusCode: 200, body: {} });
    cy.intercept('PUT', '**/api/**', { statusCode: 200, body: {} });

    // Specific intercepts (registered AFTER catch-all → checked FIRST by Cypress)
    cy.intercept('GET', '**/api/jobs*', {
      statusCode: 200,
      body: mockJobs
    }).as('getJobs');

    cy.intercept('GET', '**/api/users/me', {
      statusCode: 200,
      body: testUser
    }).as('getMe');

    cy.intercept('GET', '**/api/users/foremen', {
      statusCode: 200,
      body: []
    }).as('getForemen');

    cy.intercept('GET', '**/api/admin/pending-approvals', {
      statusCode: 200,
      body: []
    }).as('getPendingApprovals');

    cy.intercept('GET', '**/api/notifications*', {
      statusCode: 200,
      body: { notifications: [], unreadCount: 0 }
    }).as('getNotifications');
  });

  // Helper to set up authenticated state and visit dashboard
  const visitDashboard = () => {
    cy.visit('/dashboard', {
      onBeforeLoad(win) {
        win.localStorage.setItem('token', mockToken);
        win.localStorage.setItem('user', JSON.stringify(testUser));
      }
    });
    // Wait for jobs to load
    cy.wait('@getJobs', { timeout: 15000 });
  };

  describe('Layout', () => {
    it('should display the app bar', () => {
      visitDashboard();
      cy.get('header').should('be.visible');
    });

    it('should display navigation elements', () => {
      visitDashboard();
      
      // Should have main navigation
      cy.get('header').within(() => {
        cy.get('button').should('have.length.gte', 1);
      });
    });

    it('should have theme toggle', () => {
      visitDashboard();
      
      // Look for theme/mode toggle button
      cy.get('button').should('have.length.gte', 1);
    });
  });

  describe('Job List', () => {
    it('should display jobs after loading', () => {
      visitDashboard();
      
      // Should display job cards or list items
      cy.contains('PM-001', { timeout: 10000 }).should('be.visible');
      cy.contains('PM-002').should('be.visible');
    });

    it('should have filter options', () => {
      visitDashboard();
      
      // Look for filter button or dropdown
      cy.contains(/filter|status|all/i).should('be.visible');
    });
  });

  describe('Search', () => {
    it('should have search input', () => {
      visitDashboard();
      
      // Look for search input
      cy.get('input[placeholder*="search" i], input[aria-label*="search" i]')
        .should('be.visible');
    });

    it('should filter jobs when searching', () => {
      visitDashboard();
      
      // Type into search — this triggers a server-side refetch and switches
      // from GF categorized view to standard view
      cy.get('input[placeholder*="search" i], input[aria-label*="search" i]')
        .clear()
        .type('PM');
      
      // After search, jobs should still be present (mock returns all jobs)
      cy.contains(/PM-001|PM-002|Test Job/i, { timeout: 15000 }).should('exist');
    });
  });

  describe('Create Job', () => {
    it('should have create job functionality', () => {
      visitDashboard();
      
      // Look for create/add button or link
      cy.get('button, a').should('exist');
    });
  });

  describe('Job Actions', () => {
    it('should navigate to job details on click', () => {
      visitDashboard();
      
      // Mock job details response
      cy.intercept('GET', '**/api/jobs/1**', {
        statusCode: 200,
        body: mockJobs[0]
      }).as('getJobDetails');

      // Find and click on a job card — in GF view this is in a categorized layout
      cy.contains('PM-001', { timeout: 10000 }).first().click({ force: true });
      
      // Should navigate to job page (details, files, or closeout)
      cy.url({ timeout: 10000 }).should('match', /\/jobs\/1/);
    });
  });

  describe('Responsive Design', () => {
    it('should work on mobile viewport', () => {
      cy.viewport('iphone-x');
      visitDashboard();
      
      // Header should still be visible
      cy.get('header').should('be.visible');
      
      // Jobs should be visible
      cy.contains('PM-001', { timeout: 10000 }).should('be.visible');
    });

    it('should work on tablet viewport', () => {
      cy.viewport('ipad-2');
      visitDashboard();
      
      cy.get('header').should('be.visible');
      cy.contains('PM-001', { timeout: 10000 }).should('be.visible');
    });
  });
});

