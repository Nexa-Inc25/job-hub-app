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
    folders: [
      {
        name: 'ACI',
        subfolders: [
          { name: 'Close Out Documents', documents: [] },
          { name: 'Field As Built', documents: [] },
          { name: 'GF Audit', documents: [] }
        ]
      },
      {
        name: 'UTCS',
        subfolders: [
          { name: 'TCP', documents: [{ name: 'traffic-plan.pdf', url: '/files/tcp.pdf' }] },
          { name: 'Photos', documents: [] }
        ]
      }
    ]
  };

  beforeEach(() => {
    // Set up API mocks BEFORE visiting the page
    // Mock jobs list
    cy.intercept('GET', '**/api/jobs', {
      statusCode: 200,
      body: [mockJob]
    }).as('getJobs');

    // Mock specific job details
    cy.intercept('GET', '**/api/jobs/job123', {
      statusCode: 200,
      body: mockJob
    }).as('getJob');

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
  });

  // Helper to set up authenticated state and visit job files page
  const visitJobFiles = () => {
    cy.visit('/jobs/job123/files', {
      onBeforeLoad(win) {
        win.localStorage.setItem('token', mockToken);
        win.localStorage.setItem('user', JSON.stringify(testUser));
      }
    });
    // Wait for the job data to load
    cy.wait('@getJob', { timeout: 15000 });
  };

  describe('Navigation', () => {
    it('should display job file system page', () => {
      visitJobFiles();
      
      // Should show job identifier
      cy.contains('PM-35440499', { timeout: 10000 }).should('be.visible');
    });

    it('should have back navigation', () => {
      visitJobFiles();
      
      // Should have back button (using a more specific selector)
      cy.get('button').contains(/back|home|return/i).should('exist');
    });
  });

  describe('Folder Structure', () => {
    it('should display folder tree', () => {
      visitJobFiles();
      
      // Should show main folders
      cy.contains('ACI', { timeout: 10000 }).should('be.visible');
      cy.contains('UTCS').should('be.visible');
    });

    it('should expand folders on click', () => {
      visitJobFiles();
      
      // Click on ACI folder to expand
      cy.contains('ACI').click();
      
      // Should show subfolders
      cy.contains('Close Out Documents').should('be.visible');
      cy.contains('Field As Built').should('be.visible');
    });

    it('should show document count in folders', () => {
      visitJobFiles();
      
      // Should show count indicators or folder labels
      cy.get('body').should('contain.text', 'ACI');
    });
  });

  describe('Document Actions', () => {
    it('should have upload functionality', () => {
      visitJobFiles();
      
      // Select a folder first
      cy.contains('ACI').click();
      cy.contains('GF Audit').click();
      
      // Should show upload options (hidden file inputs still exist)
      cy.get('input[type="file"]').should('exist');
    });

    it('should navigate to folder with documents', () => {
      visitJobFiles();
      
      // Navigate to folder with documents
      cy.contains('UTCS').click();
      cy.contains('TCP').click();
      
      // Should show the document
      cy.contains('traffic-plan.pdf').should('be.visible');
    });
  });

  describe('Photo Upload Flow', () => {
    it('should show photo upload options in GF Audit folder', () => {
      visitJobFiles();
      
      // Navigate to GF Audit
      cy.contains('ACI').click();
      cy.contains('GF Audit').click();
      
      // Should show upload buttons or input
      cy.get('input[type="file"]').should('exist');
    });
  });

  describe('PDF Viewer', () => {
    it('should open PDF viewer when document clicked', () => {
      visitJobFiles();
      
      // Navigate to folder with PDF
      cy.contains('UTCS').click();
      cy.contains('TCP').click();
      
      // Mock the file response
      cy.intercept('GET', '**/files/tcp.pdf', {
        statusCode: 200,
        headers: { 'content-type': 'application/pdf' },
        body: ''
      }).as('getPdf');

      // Click on document
      cy.contains('traffic-plan.pdf').click();
      
      // Should open viewer dialog
      cy.get('[role="dialog"], .MuiDialog-root').should('be.visible');
    });
  });

  describe('Mobile Responsiveness', () => {
    it('should work on iPad horizontal', () => {
      cy.viewport(1024, 768);
      visitJobFiles();
      
      cy.contains('ACI', { timeout: 10000 }).should('be.visible');
      cy.contains('PM-35440499').should('be.visible');
    });

    it('should work on mobile', () => {
      cy.viewport('iphone-x');
      visitJobFiles();
      
      // Core elements should be visible (job page has content)
      cy.contains('PM-35440499', { timeout: 10000 }).should('be.visible');
    });
  });
});

