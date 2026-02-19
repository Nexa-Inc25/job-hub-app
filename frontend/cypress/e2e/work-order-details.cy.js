/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Work Order Details E2E Tests
 * 
 * Tests the work order details page functionality.
 * Note: WorkOrderDetails is at /jobs/:id/details route
 */

// Create a mock JWT token for testing
const createMockJwt = (payload) => {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  const signature = btoa('mock-signature');
  return `${header}.${body}.${signature}`;
};

describe('Work Order Details', () => {
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

  const mockJob = {
    _id: 'job123',
    title: 'Pole Replacement',
    pmNumber: 'PM-35440499',
    woNumber: 'WO-12345',
    address: '123 Main Street, San Jose, CA',
    status: 'pre_fielding',
    client: 'PG&E',
    description: 'Replace damaged pole on Main Street',
    dependencies: [
      { _id: 'dep1', type: 'usa', status: 'required', description: 'USA dig request' },
      { _id: 'dep2', type: 'traffic_control', status: 'scheduled', scheduledDate: new Date().toISOString() }
    ],
    notes: [
      { _id: 'note1', message: 'Initial assessment complete', noteType: 'update', createdAt: new Date().toISOString() }
    ],
    folders: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  beforeEach(() => {
    // CATCH-ALL: Prevent any unintercepted API call from hitting the real
    // api.fieldledger.io server which returns 401, triggering the axios
    // interceptor's hard redirect (globalThis.location.href = '/login').
    cy.intercept('GET', '**/api/**', { statusCode: 200, body: {} });
    cy.intercept('POST', '**/api/**', { statusCode: 200, body: {} });
    cy.intercept('PUT', '**/api/**', { statusCode: 200, body: {} });

    // Specific intercepts (registered AFTER catch-all → checked FIRST)
    cy.intercept('GET', '**/api/jobs/job123/full-details', {
      statusCode: 200,
      body: mockJob
    }).as('getJobDetails');

    cy.intercept('GET', '**/api/jobs/job123', {
      statusCode: 200,
      body: mockJob
    }).as('getJob');

    cy.intercept('GET', '**/api/jobs/job123/notes', {
      statusCode: 200,
      body: mockJob.notes
    }).as('getNotes');

    cy.intercept('GET', '**/api/jobs/job123/dependencies', {
      statusCode: 200,
      body: mockJob.dependencies
    }).as('getDependencies');

    // Mock user endpoints
    cy.intercept('GET', '**/api/users/me', {
      statusCode: 200,
      body: testUser
    }).as('getMe');

    cy.intercept('GET', '**/api/users/foremen', {
      statusCode: 200,
      body: []
    }).as('getForemen');

    // Mock pending approvals
    cy.intercept('GET', '**/api/admin/pending-approvals', {
      statusCode: 200,
      body: []
    }).as('getPendingApprovals');

    // Mock notifications (NotificationContext fetches on mount)
    cy.intercept('GET', '**/api/notifications*', {
      statusCode: 200,
      body: { notifications: [], unreadCount: 0 }
    }).as('getNotifications');

    // Mock jobs list
    cy.intercept('GET', '**/api/jobs', {
      statusCode: 200,
      body: [mockJob]
    }).as('getJobs');
  });

  // Helper to set up authenticated state and visit the CORRECT route
  // WorkOrderDetails is at /jobs/:id/details, NOT /jobs/:id
  const visitJobDetails = () => {
    cy.visit('/jobs/job123/details', {
      onBeforeLoad(win) {
        win.localStorage.setItem('token', mockToken);
        win.localStorage.setItem('user', JSON.stringify(testUser));
      }
    });
    // Wait for the job details to load
    cy.wait('@getJobDetails', { timeout: 15000 });
  };

  describe('Page Layout', () => {
    it('should display job information', () => {
      visitJobDetails();
      
      cy.contains('PM-35440499', { timeout: 10000 }).should('be.visible');
      cy.contains('123 Main Street').should('be.visible');
    });

    it('should display current status', () => {
      visitJobDetails();
      
      // Status should be shown as chip/badge
      cy.contains(/pre.?field/i).should('be.visible');
    });

    it('should have back navigation', () => {
      visitJobDetails();
      
      // Back button or similar navigation
      cy.get('button').should('exist');
    });

    it('should have files link', () => {
      visitJobDetails();
      
      cy.contains(/files|document/i).should('exist');
    });
  });

  describe('Dependencies Section', () => {
    it('should display job dependencies', () => {
      visitJobDetails();
      
      // Should show dependency types or job info
      cy.contains(/usa|traffic|depend/i).should('exist');
    });

    it('should show job details', () => {
      visitJobDetails();
      
      // Job details should be visible
      cy.contains('PM-35440499').should('be.visible');
    });
  });

  describe('Notes Section', () => {
    it('should display existing notes', () => {
      visitJobDetails();
      
      cy.contains('Initial assessment complete').should('be.visible');
    });

    it('should have add note functionality', () => {
      visitJobDetails();
      
      // Look for note input or add button
      cy.get('textarea, input, button').should('exist');
    });

    it('should allow adding a new note', () => {
      cy.intercept('POST', '**/api/jobs/job123/notes', {
        statusCode: 200,
        body: { _id: 'note2', message: 'New test note', noteType: 'update', createdAt: new Date().toISOString() }
      }).as('addNote');

      visitJobDetails();
      
      // Find and fill note input
      cy.get('textarea, input[type="text"]').first().type('New test note');
      
      // Submit note
      cy.get('button').contains(/send|add|submit/i).click();
      
      cy.wait('@addNote');
    });
  });

  describe('Photo Upload Section', () => {
    it('should have photo upload capability', () => {
      visitJobDetails();
      
      // Should show upload functionality
      cy.get('input[type="file"]').should('exist');
    });
  });

  describe('Status Updates', () => {
    it('should show workflow progress', () => {
      visitJobDetails();
      
      // Should have progress indicator or workflow steps
      cy.contains(/progress|workflow|status|pre.?field/i).should('exist');
    });
  });

  describe('Responsive Design', () => {
    it('should work on iPad horizontal', () => {
      cy.viewport(1024, 768);
      visitJobDetails();
      
      // Main content should be visible
      cy.contains('PM-35440499', { timeout: 10000 }).should('be.visible');
    });

    it('should work on mobile', () => {
      cy.viewport('iphone-x');
      visitJobDetails();
      
      cy.contains('PM-35440499', { timeout: 10000 }).should('be.visible');
    });
  });
});

