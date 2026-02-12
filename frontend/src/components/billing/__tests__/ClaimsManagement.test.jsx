/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * ClaimsManagement Component Tests
 * 
 * Tests for the claims management UI used by PMs to create,
 * review, export, and track payment claims.
 */

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import ClaimsManagement from '../ClaimsManagement';

// Mock oracleMapper
vi.mock('../../../utils/oracleMapper', () => ({
  formatForOracle: vi.fn((claim, units) => ({
    InvoiceNumber: claim.claimNumber || 'CLM-001',
    lines: units.map(u => ({ itemCode: u.itemCode, amount: u.totalAmount })),
  })),
  exportToCSV: vi.fn(() => 'csv-content'),
  validateForExport: vi.fn(() => ({
    valid: true,
    warnings: [],
    errors: [],
  })),
}));

const theme = createTheme();

// Helper to render with MUI theme
const renderWithTheme = (ui) => {
  return render(
    <ThemeProvider theme={theme}>
      {ui}
    </ThemeProvider>
  );
};

// Test data
const mockClaims = [
  {
    _id: 'claim-1',
    claimNumber: 'CLM-2025-001',
    description: 'January Pole Replacements',
    status: 'draft',
    subtotal: 15000,
    lineItems: [
      { _id: 'unit-1', itemCode: 'EC-001', description: 'Install transformer', quantity: 2, unitPrice: 5000, totalAmount: 10000 },
      { _id: 'unit-2', itemCode: 'CV-001', description: 'Trench excavation', quantity: 100, unitPrice: 50, totalAmount: 5000 },
    ],
    createdAt: '2025-01-15T00:00:00Z',
  },
  {
    _id: 'claim-2',
    claimNumber: 'CLM-2025-002',
    description: 'February Service Upgrades',
    status: 'submitted',
    subtotal: 8500,
    lineItems: [],
    createdAt: '2025-02-01T00:00:00Z',
  },
  {
    _id: 'claim-3',
    claimNumber: 'CLM-2025-003',
    description: 'March Emergency Work',
    status: 'approved',
    subtotal: 22000,
    lineItems: [],
    createdAt: '2025-03-10T00:00:00Z',
  },
];

const mockUnitsMap = {
  'claim-1': [
    { _id: 'unit-1', itemCode: 'EC-001', description: 'Install transformer', quantity: 2, unitPrice: 5000, totalAmount: 10000 },
    { _id: 'unit-2', itemCode: 'CV-001', description: 'Trench excavation', quantity: 100, unitPrice: 50, totalAmount: 5000 },
  ],
};

const mockSelectedUnits = [
  { _id: 'unit-3', itemCode: 'EC-002', description: 'Pole replacement', quantity: 1, unitPrice: 3500, totalAmount: 3500 },
];

const defaultProps = {
  claims: mockClaims,
  unitsMap: mockUnitsMap,
  loading: false,
  onCreateClaim: vi.fn(),
  onUpdateClaim: vi.fn(),
  onDeleteClaim: vi.fn(),
  onExportOracle: vi.fn(),
  onExportFBDI: vi.fn(),
  onExportCSV: vi.fn(),
  onRecordPayment: vi.fn(),
  onViewClaim: vi.fn(),
  selectedUnits: mockSelectedUnits,
};

describe('ClaimsManagement Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render the component with claim cards', () => {
      renderWithTheme(<ClaimsManagement {...defaultProps} />);

      expect(screen.getByText('CLM-2025-001')).toBeInTheDocument();
      expect(screen.getByText('CLM-2025-002')).toBeInTheDocument();
      expect(screen.getByText('CLM-2025-003')).toBeInTheDocument();
    });

    it('should display claim descriptions', () => {
      renderWithTheme(<ClaimsManagement {...defaultProps} />);

      expect(screen.getByText('January Pole Replacements')).toBeInTheDocument();
      expect(screen.getByText('February Service Upgrades')).toBeInTheDocument();
    });

    it('should show status chips for each claim', () => {
      renderWithTheme(<ClaimsManagement {...defaultProps} />);

      // Status labels may appear multiple times (in cards, summaries, etc.)
      expect(screen.getAllByText('Draft').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Submitted').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Approved').length).toBeGreaterThanOrEqual(1);
    });

    it('should show create claim button when units are selected', () => {
      renderWithTheme(<ClaimsManagement {...defaultProps} />);

      expect(screen.getByText(/Create Claim/)).toBeInTheDocument();
    });

    it('should show loading indicator when loading', () => {
      renderWithTheme(<ClaimsManagement {...defaultProps} loading={true} />);

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('should render empty state when no claims', () => {
      renderWithTheme(<ClaimsManagement {...defaultProps} claims={[]} />);

      expect(screen.getByText(/no claims/i)).toBeInTheDocument();
    });
  });

  describe('Create Claim Dialog', () => {
    it('should open create dialog when button is clicked', async () => {
      const user = userEvent.setup();
      renderWithTheme(<ClaimsManagement {...defaultProps} />);

      const createButton = screen.getByText(/Create Claim/);
      await user.click(createButton);

      expect(screen.getByText('Create Payment Claim')).toBeInTheDocument();
    });

    it('should show selected units in the dialog', async () => {
      const user = userEvent.setup();
      renderWithTheme(<ClaimsManagement {...defaultProps} />);

      await user.click(screen.getByText(/Create Claim/));

      expect(screen.getByText('EC-002')).toBeInTheDocument();
    });

    it('should call onCreateClaim with form data when submitted', async () => {
      const user = userEvent.setup();
      renderWithTheme(<ClaimsManagement {...defaultProps} />);

      await user.click(screen.getByText(/Create Claim/));

      // Click the Create Claim button in the dialog
      const dialog = screen.getByRole('dialog');
      const submitButton = within(dialog).getByRole('button', { name: /Create Claim/ });
      await user.click(submitButton);

      expect(defaultProps.onCreateClaim).toHaveBeenCalledWith(
        expect.objectContaining({
          unitIds: ['unit-3'],
          subtotal: 3500,
        })
      );
    });

    it('should close dialog on cancel', async () => {
      const user = userEvent.setup();
      renderWithTheme(<ClaimsManagement {...defaultProps} />);

      await user.click(screen.getByText(/Create Claim/));
      expect(screen.getByText('Create Payment Claim')).toBeInTheDocument();

      await user.click(screen.getByText('Cancel'));
      await waitFor(() => {
        expect(screen.queryByText('Create Payment Claim')).not.toBeInTheDocument();
      });
    });
  });

  describe('Claim Card Interactions', () => {
    it('should expand claim details when clicked', async () => {
      const user = userEvent.setup();
      renderWithTheme(<ClaimsManagement {...defaultProps} />);

      // Find and click the expand button for the first claim
      const expandButtons = screen.getAllByLabelText(/expand/i);
      if (expandButtons.length > 0) {
        await user.click(expandButtons[0]);
      }
    });

    it('should format currency amounts correctly', () => {
      renderWithTheme(<ClaimsManagement {...defaultProps} />);

      // $15,000 should appear formatted
      expect(screen.getByText('$15,000.00')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle claims with no line items', () => {
      const claimsNoItems = [
        { _id: 'c1', claimNumber: 'CLM-X', description: 'Empty', status: 'draft', subtotal: 0, lineItems: [], createdAt: '2025-01-01' },
      ];
      renderWithTheme(<ClaimsManagement {...defaultProps} claims={claimsNoItems} />);

      expect(screen.getByText('CLM-X')).toBeInTheDocument();
      // $0.00 may appear multiple times
      expect(screen.getAllByText('$0.00').length).toBeGreaterThanOrEqual(1);
    });

    it('should handle empty selectedUnits disabling create button', () => {
      renderWithTheme(<ClaimsManagement {...defaultProps} selectedUnits={[]} />);

      // With no units selected the create button should not appear or be disabled
      const createBtn = screen.queryByText(/Create Claim/);
      if (createBtn) {
        expect(createBtn.closest('button')).toBeDisabled();
      }
    });

    it('should handle missing unitsMap gracefully', () => {
      renderWithTheme(<ClaimsManagement {...defaultProps} unitsMap={{}} />);

      // Should still render without crashing
      expect(screen.getByText('CLM-2025-001')).toBeInTheDocument();
    });
  });
});

