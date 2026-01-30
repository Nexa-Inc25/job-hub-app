/**
 * Job File System E2E Tests
 * 
 * Tests the job file management interface.
 */

describe('Job File System', () => {
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
    cy.waitForApi();

    // Mock API responses
    cy.intercept('GET', '**/api/jobs*', {
      statusCode: 200,
      body: [mockJob]
    }).as('getJobs');

    cy.intercept('GET', '**/api/jobs/job123**', {
      statusCode: 200,
      body: mockJob
    }).as('getJob');

    cy.intercept('GET', '**/api/jobs/job123/full-details', {
      statusCode: 200,
      body: mockJob
    }).as('getJobFullDetails');

    // Set authenticated state
    cy.window().then((win) => {
      win.localStorage.setItem('token', 'mock-token');
      win.localStorage.setItem('user', JSON.stringify({
        _id: 'user1',
        name: 'Test GF',
        email: 'gf@example.com',
        role: 'gf'
      }));
    });
  });

  describe('Navigation', () => {
    it('should display job file system page', () => {
      cy.visit('/jobs/job123/files');
      cy.wait('@getJob');
      
      // Should show job identifier
      cy.contains('PM-35440499').should('be.visible');
    });

    it('should have back navigation', () => {
      cy.visit('/jobs/job123/files');
      cy.wait('@getJob');
      
      // Should have back button
      cy.get('[aria-label*="back" i], button:contains("Back")').should('exist');
    });
  });

  describe('Folder Structure', () => {
    it('should display folder tree', () => {
      cy.visit('/jobs/job123/files');
      cy.wait('@getJob');
      
      // Should show main folders
      cy.contains('ACI').should('be.visible');
      cy.contains('UTCS').should('be.visible');
    });

    it('should expand folders on click', () => {
      cy.visit('/jobs/job123/files');
      cy.wait('@getJob');
      
      // Click on ACI folder to expand
      cy.contains('ACI').click();
      
      // Should show subfolders
      cy.contains('Close Out Documents').should('be.visible');
      cy.contains('Field As Built').should('be.visible');
    });

    it('should show document count in folders', () => {
      cy.visit('/jobs/job123/files');
      cy.wait('@getJob');
      
      // Should show count indicators
      cy.get('[class*="badge"], [class*="chip"]').should('exist');
    });
  });

  describe('Document Actions', () => {
    it('should have upload button', () => {
      cy.visit('/jobs/job123/files');
      cy.wait('@getJob');
      
      // Select a folder first
      cy.contains('ACI').click();
      cy.contains('GF Audit').click();
      
      // Should show upload options
      cy.get('input[type="file"]').should('exist');
    });

    it('should have export button when documents exist', () => {
      cy.visit('/jobs/job123/files');
      cy.wait('@getJob');
      
      // Navigate to folder with documents
      cy.contains('UTCS').click();
      cy.contains('TCP').click();
      
      // Should show export option
      cy.contains(/export|email|download/i).should('be.visible');
    });
  });

  describe('Photo Upload Flow', () => {
    it('should show photo upload options in GF Audit folder', () => {
      cy.visit('/jobs/job123/files');
      cy.wait('@getJob');
      
      // Navigate to GF Audit
      cy.contains('ACI').click();
      cy.contains('GF Audit').click();
      
      // Should show camera/library upload options
      cy.get('[aria-label*="camera" i], [aria-label*="photo" i], [aria-label*="upload" i]')
        .should('exist');
    });
  });

  describe('PDF Viewer', () => {
    it('should open PDF viewer when document clicked', () => {
      cy.visit('/jobs/job123/files');
      cy.wait('@getJob');
      
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
      cy.visit('/jobs/job123/files');
      cy.wait('@getJob');
      
      cy.contains('ACI').should('be.visible');
      cy.contains('PM-35440499').should('be.visible');
    });

    it('should work on mobile', () => {
      cy.viewport('iphone-x');
      cy.visit('/jobs/job123/files');
      cy.wait('@getJob');
      
      // Core elements should be visible
      cy.get('header').should('be.visible');
    });
  });
});

