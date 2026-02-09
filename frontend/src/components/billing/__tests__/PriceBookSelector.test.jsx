/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * PriceBookSelector Component Tests
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PriceBookSelector from '../PriceBookSelector';

// Mock dependencies
vi.mock('../../../hooks/useOffline', () => ({
  useOffline: vi.fn(() => ({
    isOnline: true,
  })),
}));

vi.mock('../../../utils/offlineStorage', () => ({
  default: {
    cachePriceBook: vi.fn().mockResolvedValue({}),
    getCachedPriceBook: vi.fn().mockResolvedValue(null),
    getUserData: vi.fn().mockResolvedValue([]),
    saveUserData: vi.fn().mockResolvedValue(),
  },
}));

vi.mock('../../../api', () => ({
  default: {
    get: vi.fn(),
  },
}));

const mockPriceBook = {
  _id: 'pb-123',
  utilityId: 'utility-1',
  name: 'Test Price Book',
  status: 'active',
  items: [
    {
      _id: 'item-1',
      itemCode: 'EC-001',
      description: 'Install transformer',
      category: 'electrical',
      unit: 'EA',
      unitPrice: 1500.00,
      isActive: true,
    },
    {
      _id: 'item-2',
      itemCode: 'CV-001',
      description: 'Trench excavation',
      category: 'civil',
      unit: 'LF',
      unitPrice: 45.50,
      isActive: true,
    },
    {
      _id: 'item-3',
      itemCode: 'OH-001',
      description: 'Overhead line installation',
      category: 'overhead',
      unit: 'FT',
      unitPrice: 25.00,
      isActive: true,
    },
    {
      _id: 'item-4',
      itemCode: 'EC-002',
      description: 'Meter installation',
      category: 'electrical',
      unit: 'EA',
      unitPrice: 250.00,
      isActive: false, // Inactive item
    },
  ],
};

describe('PriceBookSelector Component', () => {
  const defaultProps = {
    utilityId: 'utility-1',
    onSelect: vi.fn(),
    onClose: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    
    const api = await import('../../../api');
    api.default.get.mockResolvedValue({ data: mockPriceBook });
  });

  describe('Loading State', () => {
    it('should show loading spinner while fetching', async () => {
      const api = await import('../../../api');
      api.default.get.mockImplementation(() => new Promise(() => {})); // Never resolves
      
      render(<PriceBookSelector {...defaultProps} />);
      
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('should hide loading spinner after fetch', async () => {
      render(<PriceBookSelector {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });
    });
  });

  describe('Header', () => {
    it('should render header with title', async () => {
      render(<PriceBookSelector {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Select Rate Item')).toBeInTheDocument();
      });
    });

    it('should have close button', async () => {
      render(<PriceBookSelector {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByLabelText('Close')).toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByLabelText('Close'));
      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  describe('Search', () => {
    it('should render search input', async () => {
      render(<PriceBookSelector {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search by code or description/i)).toBeInTheDocument();
      });
    });

    it('should filter items by search query', async () => {
      const user = userEvent.setup();
      render(<PriceBookSelector {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('EC-001')).toBeInTheDocument();
      });
      
      const searchInput = screen.getByPlaceholderText(/Search by code or description/i);
      await user.type(searchInput, 'transformer');
      
      await waitFor(() => {
        expect(screen.getByText('EC-001')).toBeInTheDocument();
        expect(screen.queryByText('CV-001')).not.toBeInTheDocument();
      });
    });

    it('should filter items by item code', async () => {
      const user = userEvent.setup();
      render(<PriceBookSelector {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('EC-001')).toBeInTheDocument();
      });
      
      const searchInput = screen.getByPlaceholderText(/Search by code or description/i);
      await user.type(searchInput, 'CV-001');
      
      await waitFor(() => {
        expect(screen.getByText('CV-001')).toBeInTheDocument();
        expect(screen.queryByText('EC-001')).not.toBeInTheDocument();
      });
    });

    it('should have clear search button', async () => {
      const user = userEvent.setup();
      render(<PriceBookSelector {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('EC-001')).toBeInTheDocument();
      });
      
      const searchInput = screen.getByPlaceholderText(/Search by code or description/i);
      await user.type(searchInput, 'test');
      
      const clearButton = screen.getByLabelText('Clear search');
      expect(clearButton).toBeInTheDocument();
      
      fireEvent.click(clearButton);
      expect(searchInput).toHaveValue('');
    });
  });

  describe('Category Filters', () => {
    it('should render category filter chips', async () => {
      render(<PriceBookSelector {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('All')).toBeInTheDocument();
        expect(screen.getByText('Electrical')).toBeInTheDocument();
        expect(screen.getByText('Civil')).toBeInTheDocument();
      });
    });

    it('should filter by category when clicked', async () => {
      const user = userEvent.setup();
      render(<PriceBookSelector {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('EC-001')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Civil'));
      
      await waitFor(() => {
        expect(screen.getByText('CV-001')).toBeInTheDocument();
        expect(screen.queryByText('EC-001')).not.toBeInTheDocument();
      });
    });
  });

  describe('Rate Items Display', () => {
    it('should display rate items', async () => {
      render(<PriceBookSelector {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('EC-001')).toBeInTheDocument();
        expect(screen.getByText('Install transformer')).toBeInTheDocument();
        expect(screen.getByText('$1500.00')).toBeInTheDocument();
      });
    });

    it('should not display inactive items', async () => {
      render(<PriceBookSelector {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('EC-001')).toBeInTheDocument();
      });
      
      // EC-002 is inactive
      expect(screen.queryByText('EC-002')).not.toBeInTheDocument();
    });

    it('should display item count', async () => {
      render(<PriceBookSelector {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('3 items')).toBeInTheDocument();
      });
    });

    it('should show category chip on each item', async () => {
      render(<PriceBookSelector {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('ELECTRICAL')).toBeInTheDocument();
        expect(screen.getByText('CIVIL')).toBeInTheDocument();
      });
    });
  });

  describe('Item Selection', () => {
    it('should call onSelect when item is clicked', async () => {
      const user = userEvent.setup();
      render(<PriceBookSelector {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('EC-001')).toBeInTheDocument();
      });
      
      // Click on the item card (the parent of EC-001 text)
      const itemCard = screen.getByText('EC-001').closest('[class*="MuiCard"]');
      await user.click(itemCard);
      
      expect(defaultProps.onSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          itemCode: 'EC-001',
          priceBookId: 'pb-123',
        })
      );
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no items match search', async () => {
      const user = userEvent.setup();
      render(<PriceBookSelector {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('EC-001')).toBeInTheDocument();
      });
      
      const searchInput = screen.getByPlaceholderText(/Search by code or description/i);
      await user.type(searchInput, 'nonexistent');
      
      await waitFor(() => {
        expect(screen.getByText('No items found')).toBeInTheDocument();
      });
    });
  });

  describe('Offline Mode', () => {
    it('should show cached chip when using offline data', async () => {
      const { useOffline } = await import('../../../hooks/useOffline');
      useOffline.mockReturnValue({ isOnline: false });
      
      const offlineStorage = await import('../../../utils/offlineStorage');
      offlineStorage.default.getCachedPriceBook.mockResolvedValue(mockPriceBook);
      
      render(<PriceBookSelector {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Cached')).toBeInTheDocument();
      });
    });

    it('should show error when offline with no cache', async () => {
      const { useOffline } = await import('../../../hooks/useOffline');
      useOffline.mockReturnValue({ isOnline: false });
      
      const offlineStorage = await import('../../../utils/offlineStorage');
      offlineStorage.default.getCachedPriceBook.mockResolvedValue(null);
      
      render(<PriceBookSelector {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText(/No cached price book/)).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error message when API fails and no cache', async () => {
      const api = await import('../../../api');
      api.default.get.mockRejectedValue(new Error('Network error'));
      
      const offlineStorage = await import('../../../utils/offlineStorage');
      offlineStorage.default.getCachedPriceBook.mockRejectedValue(new Error('No cache'));
      
      render(<PriceBookSelector {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should fallback to cache on API error', async () => {
      const api = await import('../../../api');
      api.default.get.mockRejectedValue(new Error('Network error'));
      
      const offlineStorage = await import('../../../utils/offlineStorage');
      offlineStorage.default.getCachedPriceBook.mockResolvedValue(mockPriceBook);
      
      render(<PriceBookSelector {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('EC-001')).toBeInTheDocument();
      }, { timeout: 3000 });
      
      expect(screen.getByText('Cached')).toBeInTheDocument();
    });
  });
});

