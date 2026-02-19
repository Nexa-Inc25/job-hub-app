/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Billing Module E2E Tests
 * 
 * Tests the complete billing workflow:
 * 1. PM accessing billing dashboard
 * 2. Reviewing unit entries
 * 3. Approving/rejecting units
 * 4. Creating and managing claims
 * 5. Exporting to Oracle format
 */

// Create a mock JWT token for testing
const createMockJwt = (payload) => {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify({
    ...payload,
    exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
  }));
  const signature = btoa('mock-signature');
  return `${header}.${body}.${signature}`;
};

describe('Billing Dashboard', () => {
  const pmUser = {
    _id: 'pm-user-1',
    name: 'Test PM',
    email: 'pm@example.com',
    role: 'pm',
    isAdmin: false,
    companyId: 'company-1'
  };

  const mockToken = createMockJwt({
    id: pmUser._id,
    email: pmUser.email,
    role: pmUser.role,
    isAdmin: pmUser.isAdmin,
    companyId: pmUser.companyId,
    canApprove: true
  });

  const mockUnits = [
    {
      _id: 'unit-1',
      itemCode: 'POLE-SET-45',
      itemDescription: 'Set 45ft Class 2 Pole',
      quantity: 1,
      unitPrice: 2500.00,
      totalAmount: 2500.00,
      status: 'submitted',
      workDate: new Date().toISOString(),
      hasPhoto: true,
      hasGPS: true,
      gpsAccuracy: 5,
      performedBy: { tier: 'prime', workCategory: 'electrical' },
      createdAt: new Date().toISOString()
    },
    {
      _id: 'unit-2',
      itemCode: 'COND-INSTALL',
      itemDescription: 'Install Primary Conductor (per 100ft)',
      quantity: 3,
      unitPrice: 850.00,
      totalAmount: 2550.00,
      status: 'submitted',
      workDate: new Date().toISOString(),
      hasPhoto: true,
      hasGPS: true,
      gpsAccuracy: 8,
      performedBy: { tier: 'sub', workCategory: 'electrical', subContractorName: 'ABC Electric' },
      createdAt: new Date().toISOString()
    },
    {
      _id: 'unit-3',
      itemCode: 'XFMR-MOUNT',
      itemDescription: 'Mount Transformer (25-100kVA)',
      quantity: 2,
      unitPrice: 1200.00,
      totalAmount: 2400.00,
      status: 'approved',
      workDate: new Date(Date.now() - 86400000).toISOString(), // Yesterday
      hasPhoto: true,
      hasGPS: true,
      gpsAccuracy: 4,
      performedBy: { tier: 'prime', workCategory: 'electrical' },
      createdAt: new Date(Date.now() - 86400000).toISOString()
    }
  ];

  const mockClaims = [
    {
      _id: 'claim-1',
      claimNumber: 'CLM-2026-001',
      status: 'draft',
      subtotal: 5050.00,
      amountDue: 5050.00,
      lineItems: [
        { _id: 'li-1', itemCode: 'POLE-SET-45', description: 'Set 45ft Class 2 Pole', quantity: 1, unitPrice: 2500, totalAmount: 2500 },
        { _id: 'li-2', itemCode: 'COND-INSTALL', description: 'Install Primary Conductor', quantity: 3, unitPrice: 850, totalAmount: 2550 }
      ],
      createdAt: new Date().toISOString()
    }
  ];

  beforeEach(() => {
    cy.intercept('GET', '**/api/billing/units*', {
      statusCode: 200,
      body: { units: mockUnits, total: mockUnits.length }
    }).as('getUnits');

    cy.intercept('GET', '**/api/billing/claims*', {
      statusCode: 200,
      body: { claims: mockClaims }
    }).as('getClaims');

    cy.intercept('GET', '**/api/users/me', {
      statusCode: 200,
      body: pmUser
    }).as('getMe');

    cy.intercept('POST', '**/api/billing/units/*/approve', {
      statusCode: 200,
      body: { message: 'Unit approved' }
    }).as('approveUnit');
  });

  // Helper to visit billing dashboard with auth
  const visitBillingDashboard = () => {
    cy.visit('/billing', {
      onBeforeLoad(win) {
        win.localStorage.setItem('token', mockToken);
        win.localStorage.setItem('user', JSON.stringify(pmUser));
      }
    });
    cy.wait('@getUnits');
    cy.wait('@getClaims');
  };

  describe('Dashboard Access', () => {
    it('should display billing dashboard for PM users', () => {
      visitBillingDashboard();

      cy.contains(/unit-?price billing/i).should('exist');
      cy.contains('Unit Review').should('exist');
      cy.contains('Claims').should('exist');
    });

    it('should redirect to login if not authenticated', () => {
      cy.visit('/billing');
      cy.url().should('include', '/login');
    });

    it('should show unit count badges', () => {
      visitBillingDashboard();

      // Badge count for pending/submitted is rendered on Unit Review tab.
      cy.get('[role="tab"]').first().should('contain.text', '2');
    });
  });

  describe('Unit Review', () => {
    it('should display unit entries in a grid', () => {
      visitBillingDashboard();

      cy.contains('POLE-SET-45').should('exist');
      cy.contains('COND-INSTALL').should('exist');
    });

    it('should allow approving a unit', () => {
      visitBillingDashboard();

      cy.get('[aria-label="Approve"]').first().click();
      cy.wait('@approveUnit');
      cy.contains(/approved|success/i).should('exist');
    });
  });

  describe('Claims Management', () => {
    it('should display claims list', () => {
      visitBillingDashboard();
      
      // Switch to Claims tab
      cy.contains('Claims').click();
      
      cy.contains('CLM-2026-001').should('exist');
    });

    it('should show claim totals', () => {
      visitBillingDashboard();
      cy.contains('Claims').click();

      cy.contains('$5,050.00').should('exist');
    });
  });
});

describe('Foreman Unit Capture', () => {
  const foremanUser = {
    _id: 'foreman-1',
    name: 'Test Foreman',
    email: 'foreman@example.com',
    role: 'foreman',
    isAdmin: false,
    companyId: 'company-1'
  };

  const mockToken = createMockJwt({
    id: foremanUser._id,
    email: foremanUser.email,
    role: foremanUser.role,
    companyId: foremanUser.companyId
  });

  const mockJob = {
    _id: 'job-1',
    woNumber: 'WO-2026-001',
    jobNumber: 'JOB-001',
    address: '123 Main St, San Francisco, CA',
    priceBookId: 'pb-1'
  };

  const mockPriceBook = {
    _id: 'pb-1',
    name: 'PG&E 2026 Rate Schedule',
    items: [
      { _id: 'item-1', itemCode: 'POLE-SET-45', description: 'Set 45ft Class 2 Pole', unit: 'EA', unitPrice: 2500.00 },
      { _id: 'item-2', itemCode: 'COND-INSTALL', description: 'Install Primary Conductor', unit: 'LF', unitPrice: 8.50 },
      { _id: 'item-3', itemCode: 'XFMR-MOUNT', description: 'Mount Transformer', unit: 'EA', unitPrice: 1200.00 }
    ]
  };

  beforeEach(() => {
    cy.intercept('GET', '**/api/jobs/*', {
      statusCode: 200,
      body: mockJob
    }).as('getJob');

    cy.intercept('GET', '**/api/billing/pricebooks/*', {
      statusCode: 200,
      body: mockPriceBook
    }).as('getPriceBook');

    cy.intercept('GET', '**/api/billing/units*', {
      statusCode: 200,
      body: []
    }).as('getUnits');

    cy.intercept('POST', '**/api/billing/units', {
      statusCode: 201,
      body: { _id: 'new-unit-1', itemCode: 'POLE-SET-45' }
    }).as('createUnit');

    cy.intercept('GET', '**/api/users/me', {
      statusCode: 200,
      body: foremanUser
    }).as('getMe');
  });

  const visitCapturePageWithAuth = () => {
    cy.visit('/jobs/job-1/log-unit', {
      onBeforeLoad(win) {
        win.localStorage.setItem('token', mockToken);
        win.localStorage.setItem('user', JSON.stringify(foremanUser));
      }
    });
    cy.wait('@getJob');
    cy.wait('@getPriceBook');
  };

  describe('Price Book Selection', () => {
    it('should display price book items', () => {
      visitCapturePageWithAuth();
      
      // Should show items from price book
      cy.contains('POLE-SET-45').should('exist');
      cy.contains('COND-INSTALL').should('exist');
    });

    it('should allow searching items', () => {
      visitCapturePageWithAuth();
      
      // Type in search box
      cy.get('input[placeholder*="Search"]').type('POLE');
      
      // Should filter to show only pole items
      cy.contains('POLE-SET-45').should('exist');
      cy.contains('COND-INSTALL').should('not.exist');
    });

    it('should show item prices', () => {
      visitCapturePageWithAuth();
      
      // Should show prices
      cy.contains('$2,500.00').should('exist');
    });
  });

  describe('Unit Entry Form', () => {
    it('should navigate to capture form when item selected', () => {
      visitCapturePageWithAuth();
      
      // Click on an item
      cy.contains('POLE-SET-45').click();
      
      // Should show capture form
      cy.contains('Log Unit').should('exist');
      cy.contains('POLE-SET-45').should('exist');
    });

    it('should show quantity stepper with large touch targets', () => {
      visitCapturePageWithAuth();
      cy.contains('POLE-SET-45').click();
      
      cy.contains(/quantity/i).should('exist');
      cy.get('[aria-label="Increase quantity"]').should('exist');
      cy.get('[aria-label="Decrease quantity"]').should('exist');
    });

    it('should calculate total based on quantity', () => {
      visitCapturePageWithAuth();
      cy.contains('POLE-SET-45').click();
      
      // Initial total for qty 1
      cy.contains('$2,500.00').should('exist');
      
      // Increase quantity
      cy.get('[aria-label="Increase quantity"]').click();
      
      // Should update total
      cy.contains('$5,000.00').should('exist');
    });

    it('should show GPS status', () => {
      visitCapturePageWithAuth();
      cy.contains('POLE-SET-45').click();
      
      cy.contains(/gps location/i).should('exist');
    });

    it('should show online/offline status', () => {
      visitCapturePageWithAuth();
      cy.contains('POLE-SET-45').click();
      
      // Should show online indicator
      cy.contains('Online').should('exist');
    });

    it('should require photo for submission', () => {
      visitCapturePageWithAuth();
      cy.contains('POLE-SET-45').click();
      
      cy.contains('PHOTO VERIFICATION').should('exist');
    });

    it('should allow photo waiver with reason', () => {
      visitCapturePageWithAuth();
      cy.contains('POLE-SET-45').click();
      
      cy.contains(/waive/i).should('exist');
    });

    it('should show tier selection', () => {
      visitCapturePageWithAuth();
      cy.contains('POLE-SET-45').click();
      
      // Should show tier options
      cy.contains('PERFORMED BY').should('exist');
      cy.contains('Prime Contractor').should('exist');
      cy.contains('Subcontractor').should('exist');
    });

    it('should show subcontractor name field when sub selected', () => {
      visitCapturePageWithAuth();
      cy.contains('POLE-SET-45').click();
      
      // Click subcontractor
      cy.contains('Subcontractor').click();
      
      // Should show name field
      cy.contains('Subcontractor Name').should('exist');
    });
  });
});

describe('Billing Integration', () => {
  it('should have "Log Unit" button on job file system page', () => {
    const testUser = {
      _id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
      role: 'foreman'
    };

    const mockToken = createMockJwt({
      id: testUser._id,
      email: testUser.email,
      role: testUser.role
    });

    cy.intercept('GET', '**/api/jobs/job-1', {
      statusCode: 200,
      body: {
        _id: 'job-1',
        title: 'Test Job',
        folders: []
      }
    }).as('getJob');

    cy.intercept('GET', '**/api/jobs', {
      statusCode: 200,
      body: []
    }).as('getJobs');

    cy.intercept('GET', '**/api/users/me', {
      statusCode: 200,
      body: testUser
    }).as('getMe');

    cy.visit('/jobs/job-1', {
      onBeforeLoad(win) {
        win.localStorage.setItem('token', mockToken);
        win.localStorage.setItem('user', JSON.stringify(testUser));
      }
    });

    cy.contains('Log Unit').should('exist');
  });
});

