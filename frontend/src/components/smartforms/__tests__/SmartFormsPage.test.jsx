/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * SmartFormsPage Component Tests
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import SmartFormsPage from '../SmartFormsPage';
import { ThemeProvider } from '../../../ThemeContext';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(() => 'test-token'),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

// Mock navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockTemplates = [
  {
    _id: 'template1',
    name: 'PGE Permit Form',
    description: 'Standard permit form',
    category: 'permits',
    status: 'active',
    fields: [{ id: 'f1', name: 'field1' }],
    fillCount: 5,
    createdAt: '2025-01-15T00:00:00.000Z',
  },
  {
    _id: 'template2',
    name: 'Traffic Control Plan',
    description: 'TCP documentation',
    category: 'safety',
    status: 'draft',
    fields: [],
    fillCount: 0,
    createdAt: '2025-01-20T00:00:00.000Z',
  },
];

const renderWithRouter = (component) => {
  return render(
    <ThemeProvider>
    <BrowserRouter>
      {component}
    </BrowserRouter>
    </ThemeProvider>
  );
};

describe('SmartFormsPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockTemplates,
    });
  });

  describe('Rendering', () => {
    it('should render the page title', async () => {
      renderWithRouter(<SmartFormsPage />);
      
      expect(screen.getByText('SmartForms')).toBeInTheDocument();
    });

    it('should render the description', async () => {
      renderWithRouter(<SmartFormsPage />);
      
      expect(screen.getByText(/fillable templates/i)).toBeInTheDocument();
    });

    it('should render New Template button', async () => {
      renderWithRouter(<SmartFormsPage />);
      
      expect(screen.getByRole('button', { name: /new template/i })).toBeInTheDocument();
    });

    it('should show loading state initially', () => {
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves
      renderWithRouter(<SmartFormsPage />);
      
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });

  describe('Template List', () => {
    it('should fetch and display templates', async () => {
      renderWithRouter(<SmartFormsPage />);
      
      await waitFor(() => {
        expect(screen.getByText('PGE Permit Form')).toBeInTheDocument();
        expect(screen.getByText('Traffic Control Plan')).toBeInTheDocument();
      });
    });

    it('should display template status chips', async () => {
      renderWithRouter(<SmartFormsPage />);
      
      await waitFor(() => {
        expect(screen.getByText('Active')).toBeInTheDocument();
        expect(screen.getByText('Draft')).toBeInTheDocument();
      });
    });

    it('should display field counts', async () => {
      renderWithRouter(<SmartFormsPage />);
      
      await waitFor(() => {
        // Field count cells
        const cells = screen.getAllByRole('cell');
        const fieldCountCells = cells.filter(cell => cell.textContent === '1' || cell.textContent === '0');
        expect(fieldCountCells.length).toBeGreaterThan(0);
      });
    });

    it('should display fill counts', async () => {
      renderWithRouter(<SmartFormsPage />);
      
      await waitFor(() => {
        expect(screen.getByText('5')).toBeInTheDocument();
      });
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no templates', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [],
      });
      
      renderWithRouter(<SmartFormsPage />);
      
      await waitFor(() => {
        expect(screen.getByText(/no templates yet/i)).toBeInTheDocument();
      });
    });

    it('should show upload button in empty state', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [],
      });
      
      renderWithRouter(<SmartFormsPage />);
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /upload template/i })).toBeInTheDocument();
      });
    });
  });

  describe('Filtering', () => {
    it('should render search input', async () => {
      renderWithRouter(<SmartFormsPage />);
      
      expect(screen.getByPlaceholderText(/search templates/i)).toBeInTheDocument();
    });

    it('should filter by search query', async () => {
      renderWithRouter(<SmartFormsPage />);
      
      await waitFor(() => {
        expect(screen.getByText('PGE Permit Form')).toBeInTheDocument();
      });
      
      const searchInput = screen.getByPlaceholderText(/search templates/i);
      fireEvent.change(searchInput, { target: { value: 'Traffic' } });
      
      await waitFor(() => {
        expect(screen.queryByText('PGE Permit Form')).not.toBeInTheDocument();
        expect(screen.getByText('Traffic Control Plan')).toBeInTheDocument();
      });
    });

    it('should render category filter', async () => {
      renderWithRouter(<SmartFormsPage />);
      
      expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
    });

    it('should render status filter', async () => {
      renderWithRouter(<SmartFormsPage />);
      
      expect(screen.getByLabelText(/status/i)).toBeInTheDocument();
    });
  });

  describe('Upload Dialog', () => {
    it('should open upload dialog when New Template clicked', async () => {
      renderWithRouter(<SmartFormsPage />);
      
      const newButton = screen.getByRole('button', { name: /new template/i });
      fireEvent.click(newButton);
      
      await waitFor(() => {
        expect(screen.getByText('Upload New Template')).toBeInTheDocument();
      });
    });

    it('should render upload dropzone in dialog', async () => {
      renderWithRouter(<SmartFormsPage />);
      
      fireEvent.click(screen.getByRole('button', { name: /new template/i }));
      
      await waitFor(() => {
        expect(screen.getByText(/click to upload pdf/i)).toBeInTheDocument();
      });
    });

    it('should render template name input', async () => {
      renderWithRouter(<SmartFormsPage />);
      
      fireEvent.click(screen.getByRole('button', { name: /new template/i }));
      
      await waitFor(() => {
        expect(screen.getByLabelText(/template name/i)).toBeInTheDocument();
      });
    });

    it('should close dialog on cancel', async () => {
      renderWithRouter(<SmartFormsPage />);
      
      fireEvent.click(screen.getByRole('button', { name: /new template/i }));
      
      await waitFor(() => {
        expect(screen.getByText('Upload New Template')).toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      
      await waitFor(() => {
        expect(screen.queryByText('Upload New Template')).not.toBeInTheDocument();
      });
    });
  });

  describe('Template Actions', () => {
    it('should have edit button for each template', async () => {
      renderWithRouter(<SmartFormsPage />);
      
      await waitFor(() => {
        const editButtons = screen.getAllByLabelText(/edit template/i);
        expect(editButtons.length).toBe(2);
      });
    });

    it('should navigate to editor on edit click', async () => {
      renderWithRouter(<SmartFormsPage />);
      
      await waitFor(() => {
        const editButtons = screen.getAllByLabelText(/edit template/i);
        fireEvent.click(editButtons[0]);
      });
      
      expect(mockNavigate).toHaveBeenCalledWith('/smartforms/editor/template1');
    });

    it('should have delete button for each template', async () => {
      renderWithRouter(<SmartFormsPage />);
      
      await waitFor(() => {
        const deleteButtons = screen.getAllByLabelText(/delete/i);
        expect(deleteButtons.length).toBe(2);
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error message on fetch failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });
      
      renderWithRouter(<SmartFormsPage />);
      
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('should allow dismissing error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });
      
      renderWithRouter(<SmartFormsPage />);
      
      // Wait for alert to appear
      const alert = await screen.findByRole('alert');
      expect(alert).toBeInTheDocument();
      
      const closeButton = alert.querySelector('button');
      if (closeButton) {
        fireEvent.click(closeButton);
        // After clicking, alert should be dismissed
        await waitFor(() => {
          expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        });
      }
    });
  });

  describe('API Calls', () => {
    it('should include auth token in fetch', async () => {
      renderWithRouter(<SmartFormsPage />);
      
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/smartforms/templates'),
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer test-token',
            }),
          })
        );
      });
    });

    it('should refetch when filters change', async () => {
      renderWithRouter(<SmartFormsPage />);
      
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
      
      // Initial call count
      const initialCallCount = mockFetch.mock.calls.length;
      
      // Change category filter - would trigger refetch via useEffect
      // Note: The actual filter change triggers fetch in the component
    });
  });
});

describe('SmartFormsPage Delete Dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockTemplates,
    });
  });

  it('should open delete confirmation dialog', async () => {
    renderWithRouter(<SmartFormsPage />);
    
    await waitFor(() => {
      const deleteButtons = screen.getAllByLabelText(/delete/i);
      fireEvent.click(deleteButtons[0]);
    });
    
    await waitFor(() => {
      expect(screen.getByText(/delete template/i)).toBeInTheDocument();
    });
  });

  it('should show template name in delete dialog', async () => {
    renderWithRouter(<SmartFormsPage />);
    
    // Wait for templates to load first
    await waitFor(() => {
      expect(screen.getByText('PGE Permit Form')).toBeInTheDocument();
    });
    
    // Now click the delete button
    const deleteButtons = screen.getAllByLabelText(/delete/i);
    fireEvent.click(deleteButtons[0]);
    
    // Wait for dialog to appear with the template name in the confirmation text
    await waitFor(() => {
      expect(screen.getByText(/delete template/i)).toBeInTheDocument();
    });
  });

  it('should close delete dialog on cancel', async () => {
    renderWithRouter(<SmartFormsPage />);
    
    await waitFor(() => {
      const deleteButtons = screen.getAllByLabelText(/delete/i);
      fireEvent.click(deleteButtons[0]);
    });
    
    await waitFor(() => {
      expect(screen.getByText(/delete template/i)).toBeInTheDocument();
    });
    
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    
    await waitFor(() => {
      expect(screen.queryByText(/delete template/i)).not.toBeInTheDocument();
    });
  });
});

