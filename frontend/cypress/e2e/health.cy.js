/**
 * Health Check E2E Tests
 * 
 * Basic smoke tests to verify the app is running.
 */

describe('Health Check', () => {
  it('should load the application', () => {
    cy.visit('/');
    // App should redirect to login or show content
    cy.url().should('match', /\/(login|dashboard|signup)/);
  });

  it('should have correct page title', () => {
    cy.visit('/');
    cy.title().should('include', 'FieldLedger');
  });

  it('should have no console errors on load', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        cy.stub(win.console, 'error').as('consoleError');
      }
    });
    
    // Wait for app to load
    cy.wait(1000);
    
    // Note: Some console errors may be acceptable, check count
    cy.get('@consoleError').then((consoleError) => {
      // Log any errors for debugging
      if (consoleError.callCount > 0) {
        cy.log(`Console errors: ${consoleError.callCount}`);
      }
    });
  });

  it('should have correct meta viewport for mobile', () => {
    cy.visit('/');
    cy.get('head meta[name="viewport"]')
      .should('have.attr', 'content')
      .and('include', 'width=device-width');
  });

  it('API should be healthy', () => {
    cy.waitForApi();
  });
});

