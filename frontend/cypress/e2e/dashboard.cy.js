/**
 * Dashboard E2E Tests
 * 
 * Tests the main dashboard functionality.
 */

describe('Dashboard', () => {
  beforeEach(() => {
    cy.waitForApi();
    
    // Mock user authentication endpoint (CRITICAL - Dashboard calls this)
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

    // Mock foremen list (Dashboard may call this)
    cy.intercept('GET', '**/api/users/foremen', {
      statusCode: 200,
      body: []
    }).as('getForemen');

    // Mock jobs list
    cy.intercept('GET', '**/api/jobs*', {
      statusCode: 200,
      body: [
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
      ]
    }).as('getJobs');

    cy.intercept('GET', '**/api/admin/pending-approvals', {
      statusCode: 200,
      body: []
    }).as('getPendingApprovals');

  });

  // Helper to set up authenticated state and visit dashboard
  const visitDashboard = () => {
    cy.visit('/dashboard', {
      onBeforeLoad(win) {
        win.localStorage.setItem('token', 'mock-token-for-testing');
        win.localStorage.setItem('user', JSON.stringify({
          _id: 'user1',
          name: 'Test User',
          email: 'test@example.com',
          role: 'gf',
          isAdmin: false
        }));
      }
    });
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

    it('should have dark mode toggle', () => {
      visitDashboard();
      
      // Look for dark mode toggle button
      cy.get('[aria-label*="dark" i], [aria-label*="mode" i], [aria-label*="theme" i]')
        .should('exist');
    });
  });

  describe('Job List', () => {
    it('should display loading state initially', () => {
      cy.intercept('GET', '**/api/jobs*', {
        delay: 1000,
        statusCode: 200,
        body: []
      }).as('getJobsDelayed');

      visitDashboard();
      
      // Should show loading indicator
      cy.get('[role="progressbar"], .MuiCircularProgress-root').should('be.visible');
    });

    it('should display jobs after loading', () => {
      visitDashboard();
      cy.wait('@getJobs');
      
      // Should display job cards or list items
      cy.contains('PM-001').should('be.visible');
      cy.contains('PM-002').should('be.visible');
    });

    it('should have filter options', () => {
      visitDashboard();
      cy.wait('@getJobs');
      
      // Look for filter button or dropdown
      cy.contains(/filter|status|all/i).should('be.visible');
    });
  });

  describe('Search', () => {
    it('should have search input', () => {
      visitDashboard();
      cy.wait('@getJobs');
      
      // Look for search input
      cy.get('input[placeholder*="search" i], input[aria-label*="search" i]')
        .should('be.visible');
    });

    it('should filter jobs when searching', () => {
      visitDashboard();
      cy.wait('@getJobs');
      
      cy.get('input[placeholder*="search" i], input[aria-label*="search" i]')
        .type('PM-001');
      
      // Should filter to show only matching job
      cy.contains('PM-001').should('be.visible');
    });
  });

  describe('Create Job', () => {
    it('should have create job button', () => {
      visitDashboard();
      cy.wait('@getJobs');
      
      // Look for create/add button
      cy.get('button[aria-label*="add" i], button[aria-label*="create" i], a[href*="create"]')
        .should('exist');
    });
  });

  describe('Job Actions', () => {
    it('should navigate to job details on click', () => {
      visitDashboard();
      cy.wait('@getJobs');
      
      // Mock job details response
      cy.intercept('GET', '**/api/jobs/1**', {
        statusCode: 200,
        body: {
          _id: '1',
          title: 'Test Job 1',
          pmNumber: 'PM-001',
          status: 'new'
        }
      }).as('getJobDetails');

      // Click on first job (looking for common patterns)
      cy.contains('PM-001').click();
      
      // Should navigate to job details or files
      cy.url().should('match', /jobs\/1/);
    });
  });

  describe('Responsive Design', () => {
    it('should work on mobile viewport', () => {
      cy.viewport('iphone-x');
      visitDashboard();
      cy.wait('@getJobs');
      
      // Header should still be visible
      cy.get('header').should('be.visible');
      
      // Jobs should be visible
      cy.contains('PM-001').should('be.visible');
    });

    it('should work on tablet viewport', () => {
      cy.viewport('ipad-2');
      visitDashboard();
      cy.wait('@getJobs');
      
      cy.get('header').should('be.visible');
      cy.contains('PM-001').should('be.visible');
    });
  });
});

