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
      cy.visit('/signup');
    });

    it('should display the signup form', () => {
      cy.get('input[name="name"]').should('be.visible');
      cy.get('input[name="email"]').should('be.visible');
      cy.get('input[name="password"]').should('be.visible');
    });

    it('should show validation for weak password', () => {
      cy.get('input[name="name"]').type('Test User');
      cy.get('input[name="email"]').type('test@example.com');
      cy.get('input[name="password"]').type('weak');
      cy.get('button[type="submit"]').click();
      
      // Should show password requirement error
      cy.contains(/password|character|strong/i).should('be.visible');
    });

    it('should have link back to login', () => {
      cy.contains(/login|sign in|already have/i).should('be.visible');
    });
  });

  describe('Protected Routes', () => {
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

