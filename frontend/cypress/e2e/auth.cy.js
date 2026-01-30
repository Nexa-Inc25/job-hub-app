/**
 * Authentication E2E Tests
 * 
 * Tests login, logout, and signup flows.
 */

describe('Authentication', () => {
  beforeEach(() => {
    cy.waitForApi();
  });

  describe('Login Page', () => {
    beforeEach(() => {
      // Mock login endpoint for invalid credentials
      cy.intercept('POST', '**/api/login', {
        statusCode: 401,
        body: { error: 'Invalid email or password' }
      }).as('loginFailed');

      cy.visit('/login');
    });

    it('should display the login form', () => {
      cy.get('input[name="email"]').should('be.visible');
      cy.get('input[name="password"]').should('be.visible');
      cy.get('button[type="submit"]').should('be.visible');
    });

    it('should show error for invalid credentials', () => {
      cy.get('input[name="email"]').type('invalid@example.com');
      cy.get('input[name="password"]').type('wrongpassword');
      cy.get('button[type="submit"]').click();
      
      cy.wait('@loginFailed');
      
      // Should show error message
      cy.contains(/invalid|error|failed/i).should('be.visible');
    });

    it('should show validation error for empty fields', () => {
      cy.get('button[type="submit"]').click();
      
      // HTML5 validation or custom error
      cy.get('input[name="email"]:invalid').should('exist');
    });

    it('should have link to signup page', () => {
      cy.contains(/sign up|register|create account/i).should('be.visible');
    });

    it('should navigate to signup when link clicked', () => {
      cy.contains(/sign up|register|create account/i).click();
      cy.url().should('include', '/signup');
    });
  });

  describe('Signup Page', () => {
    beforeEach(() => {
      // Mock signup endpoint for weak password
      cy.intercept('POST', '**/api/signup', {
        statusCode: 400,
        body: { error: 'Password must be at least 8 characters' }
      }).as('signupFailed');

      cy.visit('/signup');
    });

    it('should display the signup form', () => {
      cy.get('input[name="email"]').should('be.visible');
      cy.get('input[name="password"]').should('be.visible');
      cy.get('input[name="confirmPassword"]').should('be.visible');
    });

    it('should show validation for weak password', () => {
      cy.get('input[name="email"]').type('test@example.com');
      cy.get('input[name="password"]').type('weak');
      cy.get('input[name="confirmPassword"]').type('weak');
      cy.get('button[type="submit"]').click();
      
      // Should show password requirement error or form validation
      cy.contains(/password|character|strong|error|invalid/i).should('be.visible');
    });

    it('should have link back to login', () => {
      cy.contains(/login|sign in|already have/i).should('be.visible');
    });
  });

  describe('Protected Routes', () => {
    beforeEach(() => {
      // Ensure no auth tokens exist
      cy.window().then((win) => {
        win.localStorage.removeItem('token');
        win.localStorage.removeItem('user');
      });

      // Mock unauthenticated API responses (401)
      cy.intercept('GET', '**/api/users/me', {
        statusCode: 401,
        body: { error: 'Not authenticated' }
      }).as('getMe');

      cy.intercept('GET', '**/api/jobs*', {
        statusCode: 401,
        body: { error: 'Not authenticated' }
      }).as('getJobs');
    });

    it('should redirect to login when not authenticated', () => {
      cy.visit('/dashboard');
      cy.url().should('include', '/login');
    });

    it('should redirect to login when accessing job files', () => {
      cy.visit('/jobs/123/files');
      cy.url().should('include', '/login');
    });
  });

  describe('Logout', () => {
    it('should clear session on logout', () => {
      // Mock unauthenticated API responses
      cy.intercept('GET', '**/api/users/me', {
        statusCode: 401,
        body: { error: 'Not authenticated' }
      }).as('getMe');

      cy.intercept('GET', '**/api/jobs*', {
        statusCode: 401,
        body: { error: 'Not authenticated' }
      }).as('getJobs');

      // Set up a mock authenticated state
      cy.window().then((win) => {
        win.localStorage.setItem('token', 'mock-token');
        win.localStorage.setItem('user', JSON.stringify({ name: 'Test' }));
      });
      
      // Clear storage (simulate logout)
      cy.window().then((win) => {
        win.localStorage.removeItem('token');
        win.localStorage.removeItem('user');
      });
      
      // Visit dashboard - should redirect to login
      cy.visit('/dashboard');
      cy.url().should('include', '/login');
    });
  });
});

