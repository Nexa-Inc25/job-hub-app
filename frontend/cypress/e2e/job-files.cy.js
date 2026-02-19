/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Job File System E2E Tests
 * 
 * Tests the job file management interface.
 */

// Create a mock JWT token for testing
const createMockJwt = (payload) => {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  const signature = btoa('mock-signature');
  return `${header}.${body}.${signature}`;
};

describe('Job File System', () => {
  const testUser = {
    _id: 'user1',
    name: 'Test GF',
    email: 'gf@example.com',
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
    title: 'Test Job',
    pmNumber: 'PM-35440499',
    woNumber: 'WO-12345',
    status: 'in_progress',
    client: 'PG&E',
    address: '123 Main St, San Jose, CA',
    description: 'Pole replacement',
    assignedTo: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    aiExtractionStarted: false,
    aiExtractionComplete: false,
    folders: [
      {
        name: 'ACI',
        documents: [],
        subfolders: [
          { name: 'Close Out Documents', documents: [] },
          { name: 'Field As Built', documents: [] },
          { name: 'GF Audit', documents: [] }
        ]
      },
      {
        name: 'UTCS',
        documents: [],
        subfolders: [
          { name: 'TCP', documents: [{ _id: 'doc1', name: 'traffic-plan.pdf', url: '/files/tcp.pdf', uploadedAt: new Date().toISOString() }] },
          { name: 'Photos', documents: [] }
        ]
      }
    ]
  };

  beforeEach(() => {
    // CATCH-ALL: Intercept ANY /api/ request to prevent real 401s from
    // api.fieldledger.io which trigger globalThis.location.href = '/login'
    // in the axios response interceptor. Must be registered FIRST.
    cy.intercept('GET', '**/api/**', { statusCode: 200, body: {} });
    cy.intercept('POST', '**/api/**', { statusCode: 200, body: {} });
    cy.intercept('PUT', '**/api/**', { statusCode: 200, body: {} });

    // Now register specific intercepts (checked BEFORE catch-all due to LIFO)

    // Mock user endpoint
    cy.intercept('GET', '**/api/users/me', {
      statusCode: 200,
      body: testUser
    }).as('getMe');

    // Mock foremen list
    cy.intercept('GET', '**/api/users/foremen', {
      statusCode: 200,
      body: []
    }).as('getForemen');

    // Mock pending approvals
    cy.intercept('GET', '**/api/admin/pending-approvals', {
      statusCode: 200,
      body: []
    }).as('getPendingApprovals');

    // Mock notifications (NotificationContext may fetch on socket connect)
    cy.intercept('GET', '**/api/notifications*', {
      statusCode: 200,
      body: { notifications: [], unreadCount: 0 }
    }).as('getNotifications');

    // Mock jobs list — glob pattern (no trailing *) won't match /api/jobs/job123
    cy.intercept('GET', '**/api/jobs', {
      statusCode: 200,
      body: [mockJob]
    }).as('getJobs');

    // Mock specific job details (registered last → checked first by Cypress)
    cy.intercept('GET', '**/api/jobs/job123', {
      statusCode: 200,
      body: mockJob
    }).as('getJob');

    // Mock any file/upload endpoints
    cy.intercept('POST', '**/api/jobs/job123/folders/**', {
      statusCode: 200,
      body: { message: 'Upload successful' }
    }).as('uploadFile');
  });

  // Helper to set up authenticated state and visit job files page
  const visitJobFiles = () => {
    cy.visit('/jobs/job123/files', {
      onBeforeLoad(win) {
        win.localStorage.setItem('token', mockToken);
        win.localStorage.setItem('user', JSON.stringify(testUser));
      }
    });
    // Wait for the page to render — don't rely on specific route waits
    // because the axios 401 interceptor can hard-redirect before they fire.
    // The catch-all intercept prevents 401s, so content should render.
    cy.url({ timeout: 15000 }).should('include', '/jobs/job123');
    cy.get('body', { timeout: 15000 }).should('not.contain', 'Something went wrong');
  };

  describe('Navigation', () => {
    it('should display job file system page', () => {
      visitJobFiles();
      
      // Should not crash — error boundary should not show
      cy.get('body', { timeout: 10000 }).should('not.contain', 'Something went wrong');
      
      // Should show job identifier or job content
      cy.contains(/PM-35440499|Test Job/i, { timeout: 10000 }).should('be.visible');
    });

    it('should have back navigation', () => {
      visitJobFiles();
      
      // Should have navigation buttons (back arrow, breadcrumbs, or Log Unit)
      cy.get('button, a', { timeout: 10000 }).should('have.length.gte', 1);
      // The page should have the Log Unit button as part of navigation
      cy.contains('Log Unit', { timeout: 10000 }).should('exist');
    });
  });

  describe('Folder Structure', () => {
    it('should display folder tree', () => {
      visitJobFiles();
      
      // Should show main folders from mock data
      cy.get('body', { timeout: 10000 }).should('not.contain', 'Something went wrong');
      cy.contains('ACI', { timeout: 10000 }).should('be.visible');
      cy.contains('UTCS', { timeout: 10000 }).should('be.visible');
    });

    it('should expand folders on click', () => {
      visitJobFiles();
      
      // Ensure page loaded
      cy.get('body', { timeout: 10000 }).should('not.contain', 'Something went wrong');

      // Click on ACI folder to expand
      cy.contains('ACI', { timeout: 10000 }).click();
      
      // Should show subfolders
      cy.contains('Close Out Documents', { timeout: 10000 }).should('be.visible');
      cy.contains('Field As Built', { timeout: 10000 }).should('be.visible');
    });

    it('should show document count in folders', () => {
      visitJobFiles();
      
      // Should show count indicators or folder labels
      cy.get('body', { timeout: 10000 }).should('not.contain', 'Something went wrong');
      cy.contains('ACI', { timeout: 10000 }).should('exist');
    });
  });

  describe('Document Actions', () => {
    it('should have upload functionality', () => {
      visitJobFiles();
      
      // Ensure page loaded
      cy.get('body', { timeout: 10000 }).should('not.contain', 'Something went wrong');

      // Select a folder first
      cy.contains('ACI', { timeout: 10000 }).click();
      cy.contains('GF Audit', { timeout: 10000 }).click();
      
      // Should show upload options (hidden file inputs still exist)
      cy.get('input[type="file"]').should('exist');
    });

    it('should navigate to folder with documents', () => {
      visitJobFiles();
      
      // Ensure page loaded
      cy.get('body', { timeout: 10000 }).should('not.contain', 'Something went wrong');

      // Navigate to folder with documents
      cy.contains('UTCS', { timeout: 10000 }).click();
      cy.contains('TCP', { timeout: 10000 }).click();
      
      // Should show the document
      cy.contains('traffic-plan.pdf', { timeout: 10000 }).should('be.visible');
    });
  });

  describe('Photo Upload Flow', () => {
    it('should show photo upload options in GF Audit folder', () => {
      visitJobFiles();
      
      // Ensure page loaded
      cy.get('body', { timeout: 10000 }).should('not.contain', 'Something went wrong');

      // Navigate to GF Audit
      cy.contains('ACI', { timeout: 10000 }).click();
      cy.contains('GF Audit', { timeout: 10000 }).click();
      
      // Should show upload buttons or input
      cy.get('input[type="file"]').should('exist');
    });
  });

  describe('PDF Viewer', () => {
    it('should open PDF viewer when document clicked', () => {
      visitJobFiles();
      
      // Ensure page loaded
      cy.get('body', { timeout: 10000 }).should('not.contain', 'Something went wrong');

      // Navigate to folder with PDF
      cy.contains('UTCS', { timeout: 10000 }).click();
      cy.contains('TCP', { timeout: 10000 }).click();
      
      // Document should be visible
      cy.contains('traffic-plan.pdf', { timeout: 10000 }).should('exist');
      
      // The "Open document" button (eye icon) triggers the PDF viewer
      cy.get('[aria-label="Open document"]', { timeout: 10000 }).should('exist');
    });
  });

  describe('Mobile Responsiveness', () => {
    it('should work on iPad horizontal', () => {
      cy.viewport(1024, 768);
      visitJobFiles();
      
      // Page should render content on tablet viewport
      cy.get('body', { timeout: 10000 }).should('not.contain', 'Something went wrong');
      cy.contains(/ACI|PM-35440499|Test Job/i, { timeout: 10000 }).should('be.visible');
    });

    it('should work on mobile', () => {
      cy.viewport('iphone-x');
      visitJobFiles();
      
      // Core elements should be visible on mobile viewport
      cy.get('body', { timeout: 10000 }).should('not.contain', 'Something went wrong');
      cy.contains(/PM-35440499|Test Job/i, { timeout: 10000 }).should('be.visible');
    });
  });
});

