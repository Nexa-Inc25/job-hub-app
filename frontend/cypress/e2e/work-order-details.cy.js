/**
 * Work Order Details E2E Tests
 * 
 * Tests the work order details page functionality.
 */

describe('Work Order Details', () => {
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
    cy.waitForApi();

    // Mock user authentication endpoint (CRITICAL - app validates session)
    cy.intercept('GET', '**/api/users/me', {
      statusCode: 200,
      body: {
        _id: 'user1',
        name: 'Test User',
        email: 'test@example.com',
        role: 'gf',
        isAdmin: false
      }
    }).as('getMe');

    // Mock foremen list (may be called by app)
    cy.intercept('GET', '**/api/users/foremen', {
      statusCode: 200,
      body: []
    }).as('getForemen');

    // Mock jobs list (dashboard may call this)
    cy.intercept('GET', '**/api/jobs', {
      statusCode: 200,
      body: [mockJob]
    }).as('getJobs');

    // Mock API responses for job details
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

  });

  // Helper to set up authenticated state and visit page
  const visitJobDetails = () => {
    cy.visit('/jobs/job123', {
      onBeforeLoad(win) {
        win.localStorage.setItem('token', 'mock-token');
        win.localStorage.setItem('user', JSON.stringify({
          _id: 'user1',
          name: 'Test User',
          email: 'test@example.com',
          role: 'gf'
        }));
      }
    });
  };

  describe('Page Layout', () => {
    it('should display job information', () => {
      visitJobDetails();
      cy.wait('@getJobDetails');
      
      cy.contains('PM-35440499').should('be.visible');
      cy.contains('123 Main Street').should('be.visible');
    });

    it('should display current status', () => {
      visitJobDetails();
      cy.wait('@getJobDetails');
      
      // Status should be shown as chip/badge
      cy.contains(/pre.?field/i).should('be.visible');
    });

    it('should have back to dashboard navigation', () => {
      visitJobDetails();
      cy.wait('@getJobDetails');
      
      cy.get('[aria-label*="back" i]').should('exist');
    });

    it('should have files button', () => {
      visitJobDetails();
      cy.wait('@getJobDetails');
      
      cy.contains(/files/i).should('be.visible');
    });
  });

  describe('Dependencies Section', () => {
    it('should display dependencies list', () => {
      visitJobDetails();
      cy.wait('@getJobDetails');
      
      // Should show dependency types
      cy.contains(/usa/i).should('be.visible');
      cy.contains(/traffic/i).should('be.visible');
    });

    it('should show dependency status', () => {
      visitJobDetails();
      cy.wait('@getJobDetails');
      
      // Status indicators should be present
      cy.contains(/required|scheduled|check/i).should('be.visible');
    });
  });

  describe('Notes Section', () => {
    it('should display existing notes', () => {
      visitJobDetails();
      cy.wait('@getJobDetails');
      
      cy.contains('Initial assessment complete').should('be.visible');
    });

    it('should have add note input', () => {
      visitJobDetails();
      cy.wait('@getJobDetails');
      
      // Look for note input
      cy.get('textarea, input[placeholder*="note" i], input[placeholder*="message" i]')
        .should('exist');
    });

    it('should allow adding a new note', () => {
      cy.intercept('POST', '**/api/jobs/job123/notes', {
        statusCode: 200,
        body: { _id: 'note2', message: 'New test note', noteType: 'update', createdAt: new Date().toISOString() }
      }).as('addNote');

      visitJobDetails();
      cy.wait('@getJobDetails');
      
      cy.get('textarea, input[placeholder*="note" i], input[placeholder*="message" i]')
        .first()
        .type('New test note');
      
      // Submit note (look for send button)
      cy.get('button[aria-label*="send" i], button[type="submit"]').first().click();
      
      cy.wait('@addNote');
    });
  });

  describe('Photo Upload Section', () => {
    it('should have photo upload for pre-field', () => {
      visitJobDetails();
      cy.wait('@getJobDetails');
      
      // Should show upload photos section
      cy.contains(/upload|photo|camera/i).should('exist');
    });
  });

  describe('Status Updates', () => {
    it('should show workflow progress', () => {
      visitJobDetails();
      cy.wait('@getJobDetails');
      
      // Should have progress indicator or workflow steps
      cy.contains(/progress|workflow|status/i).should('exist');
    });
  });

  describe('Responsive Design', () => {
    it('should reorganize layout on horizontal iPad', () => {
      cy.viewport(1024, 768);
      visitJobDetails();
      cy.wait('@getJobDetails');
      
      // Main content should be visible
      cy.contains('PM-35440499').should('be.visible');
    });

    it('should stack sections on mobile', () => {
      cy.viewport('iphone-x');
      visitJobDetails();
      cy.wait('@getJobDetails');
      
      cy.get('header').should('be.visible');
      cy.contains('PM-35440499').should('be.visible');
    });
  });
});

