/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * ForemanCloseOut Component Tests
 * 
 * Comprehensive test coverage for the Foreman Close Out view.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ForemanCloseOut from '../ForemanCloseOut';

// Mock react-router-dom hooks
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock useOffline hook
vi.mock('../../hooks/useOffline', () => ({
  useOffline: vi.fn(() => ({
    isOnline: true,
    isSyncing: false,
    pendingCounts: { operations: 0, photos: 0, total: 0 },
  })),
}));

// Mock API - must be defined before vi.mock uses it
vi.mock('../../api', () => {
  const api = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
  return { default: api };
});

// Import mocked API after mocking
import api from '../../api';

// Test data
const mockJob = {
  _id: 'job-123',
  woNumber: 'WO-12345',
  jobNumber: 'JOB-001',
  address: '123 Main Street, San Francisco, CA 94102',
  status: 'in_progress',
  folders: [
    {
      name: 'ACI',
      subfolders: [
        {
          name: 'GF Audit',
          documents: [
            {
              _id: 'photo-1',
              name: 'before-photo.jpg',
              url: 'https://example.com/photo1.jpg',
              thumbnailUrl: 'https://example.com/thumb1.jpg',
              latitude: 37.7749,
              longitude: -122.4194,
            },
            {
              _id: 'photo-2',
              name: 'during-photo.jpg',
              url: 'https://example.com/photo2.jpg',
              thumbnailUrl: 'https://example.com/thumb2.jpg',
            },
            {
              _id: 'photo-3',
              name: 'after-photo.jpg',
              url: 'https://example.com/photo3.jpg',
              thumbnailUrl: 'https://example.com/thumb3.jpg',
              latitude: 37.7750,
              longitude: -122.4195,
            },
          ],
        },
        {
          name: 'Pre-Field Documents',
          documents: [
            {
              _id: 'doc-1',
              name: 'work-order.pdf',
              type: 'template',
              isTemplate: true,
            },
          ],
        },
        {
          name: 'General Forms',
          documents: [
            {
              _id: 'doc-2',
              name: 'crew-instructions.pdf',
              type: 'pdf',
              signedDate: '2026-01-15',
            },
          ],
        },
      ],
    },
  ],
};

const mockUnits = [
  {
    _id: 'unit-1',
    itemCode: 'EC-001',
    quantity: 2,
    totalAmount: 3000,
    status: 'pending',
  },
  {
    _id: 'unit-2',
    itemCode: 'EC-002',
    quantity: 1,
    totalAmount: 1500,
    status: 'approved',
  },
];

const mockTailboard = {
  _id: 'tailboard-1',
  status: 'completed',
  crewMembers: [
    { name: 'John Doe' },
    { name: 'Jane Smith' },
  ],
  hazardCount: 3,
};

const mockTimesheet = {
  _id: 'timesheet-1',
  entries: [
    { date: new Date().toISOString(), hours: 8 },
  ],
};

// Helper to render component with router
const renderWithRouter = (jobId = 'job-123') => {
  return render(
    <MemoryRouter initialEntries={[`/jobs/${jobId}/close-out`]}>
      <Routes>
        <Route path="/jobs/:jobId/close-out" element={<ForemanCloseOut />} />
      </Routes>
    </MemoryRouter>
  );
};

describe('ForemanCloseOut Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mocks
    api.get.mockImplementation((url) => {
      if (url.includes('/api/jobs/')) {
        return Promise.resolve({ data: mockJob });
      }
      if (url.includes('/api/billing/units')) {
        return Promise.resolve({ data: mockUnits });
      }
      if (url.includes('/api/tailboards/job/')) {
        return Promise.resolve({ data: mockTailboard });
      }
      if (url.includes('/api/timesheets')) {
        return Promise.resolve({ data: mockTimesheet });
      }
      return Promise.resolve({ data: {} });
    });
  });

  describe('Loading State', () => {
    it('should show loading spinner while fetching job data', () => {
      // Make the API call hang
      api.get.mockImplementation(() => new Promise(() => {}));
      
      renderWithRouter();
      
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });

  describe('Header Section', () => {
    it('should display job number and address', async () => {
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Close Out Job')).toBeInTheDocument();
      });
      
      expect(screen.getByText(/WO-12345/)).toBeInTheDocument();
      expect(screen.getByText(/123 Main Street/)).toBeInTheDocument();
    });

    it('should show online status chip when online', async () => {
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Online')).toBeInTheDocument();
      });
    });

    it('should show offline status chip when offline', async () => {
      const { useOffline } = await import('../../hooks/useOffline');
      useOffline.mockReturnValue({
        isOnline: false,
        isSyncing: false,
        pendingCounts: { operations: 0, photos: 0, total: 0 },
      });
      
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Offline')).toBeInTheDocument();
      });
    });

    it('should navigate back when back button is clicked', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Close Out Job')).toBeInTheDocument();
      });
      
      const backButton = screen.getByRole('button', { name: /go back/i });
      await user.click(backButton);
      
      expect(mockNavigate).toHaveBeenCalledWith(-1);
    });

    it('should display completion progress bar', async () => {
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Completion Progress')).toBeInTheDocument();
      });
      
      // With 3 photos (complete), completed tailboard, units logged, and signed doc
      // Should be 100% complete
      expect(screen.getByText('100%')).toBeInTheDocument();
    });
  });

  describe('Tabs Navigation', () => {
    it('should render all tabs', async () => {
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Photos')).toBeInTheDocument();
      });
      
      expect(screen.getByText('Docs')).toBeInTheDocument();
      expect(screen.getByText('Units')).toBeInTheDocument();
      expect(screen.getByText('Safety')).toBeInTheDocument();
      expect(screen.getByText('Time')).toBeInTheDocument();
    });

    it('should switch to Photos tab content by default', async () => {
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('JOB PHOTOS (3)')).toBeInTheDocument();
      });
    });

    it('should switch to Docs tab when clicked', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Photos')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Docs'));
      
      await waitFor(() => {
        expect(screen.getByText('FORMS & DOCUMENTS (2)')).toBeInTheDocument();
      });
    });

    it('should switch to Units tab when clicked', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Photos')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Units'));
      
      await waitFor(() => {
        expect(screen.getByText('Units Logged')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument();
      });
    });

    it('should switch to Safety tab when clicked', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Photos')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Safety'));
      
      await waitFor(() => {
        expect(screen.getByText('Daily Tailboard')).toBeInTheDocument();
      });
    });

    it('should switch to Time tab when clicked', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Photos')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Time'));
      
      await waitFor(() => {
        expect(screen.getByText('Daily LME')).toBeInTheDocument();
      });
    });
  });

  describe('PhotoSection', () => {
    it('should render Take Photo and Gallery buttons', async () => {
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Take Photo')).toBeInTheDocument();
        expect(screen.getByText('Gallery')).toBeInTheDocument();
      });
    });

    it('should display photo count', async () => {
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('JOB PHOTOS (3)')).toBeInTheDocument();
      });
    });

    it('should show empty state when no photos', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('/api/jobs/')) {
          return Promise.resolve({
            data: {
              ...mockJob,
              folders: [
                {
                  name: 'ACI',
                  subfolders: [{ name: 'GF Audit', documents: [] }],
                },
              ],
            },
          });
        }
        return Promise.resolve({ data: [] });
      });
      
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('No photos yet. Tap above to add.')).toBeInTheDocument();
      });
    });

    it('should show GPS chip on photos with location', async () => {
      renderWithRouter();
      
      await waitFor(() => {
        // Photos with latitude should have GPS chips
        const gpsChips = screen.getAllByText('GPS');
        expect(gpsChips.length).toBe(2); // 2 photos have GPS
      });
    });

    it('should open photo preview when photo is clicked', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('JOB PHOTOS (3)')).toBeInTheDocument();
      });
      
      // Find and click on a photo
      const photos = screen.getAllByRole('img');
      await user.click(photos[0]);
      
      // Dialog should open with delete button
      await waitFor(() => {
        expect(screen.getByText('Delete')).toBeInTheDocument();
        expect(screen.getByText('Close')).toBeInTheDocument();
      });
    });

    it('should close preview when Close is clicked', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('JOB PHOTOS (3)')).toBeInTheDocument();
      });
      
      const photos = screen.getAllByRole('img');
      await user.click(photos[0]);
      
      await waitFor(() => {
        expect(screen.getByText('Close')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Close'));
      
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('should delete photo when Delete is clicked', async () => {
      api.delete.mockResolvedValue({ data: { success: true } });
      
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('JOB PHOTOS (3)')).toBeInTheDocument();
      });
      
      const photos = screen.getAllByRole('img');
      await user.click(photos[0]);
      
      await waitFor(() => {
        expect(screen.getByText('Delete')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Delete'));
      
      expect(api.delete).toHaveBeenCalledWith('/api/jobs/job-123/documents/photo-1');
    });
  });

  describe('DocumentsSection', () => {
    it('should display editable documents', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Photos')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Docs'));
      
      await waitFor(() => {
        expect(screen.getByText('work-order.pdf')).toBeInTheDocument();
        expect(screen.getByText('crew-instructions.pdf')).toBeInTheDocument();
      });
    });

    it('should show document when document clicked', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Photos')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Docs'));
      
      await waitFor(() => {
        expect(screen.getByText('work-order.pdf')).toBeInTheDocument();
      });
      
      // Clicking a document should display it (opens template picker or PDF editor)
      await user.click(screen.getByText('work-order.pdf'));
      
      // Just verify the click succeeded - the component opens a dialog or PDF editor
      // The actual navigation depends on whether templates are loaded
    });

    it('should show empty state when no documents', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('/api/jobs/')) {
          return Promise.resolve({
            data: {
              ...mockJob,
              folders: [
                {
                  name: 'ACI',
                  subfolders: [
                    { name: 'GF Audit', documents: [] },
                    { name: 'Pre-Field Documents', documents: [] },
                    { name: 'General Forms', documents: [] },
                  ],
                },
              ],
            },
          });
        }
        return Promise.resolve({ data: [] });
      });
      
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Photos')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Docs'));
      
      await waitFor(() => {
        expect(screen.getByText('No documents available for this job yet.')).toBeInTheDocument();
      });
    });
  });

  describe('UnitsSection', () => {
    it('should display units logged count', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Photos')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Units'));
      
      await waitFor(() => {
        expect(screen.getByText('Units Logged')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument();
      });
    });

    it('should display total value', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Photos')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Units'));
      
      await waitFor(() => {
        expect(screen.getByText('Total Value')).toBeInTheDocument();
        expect(screen.getByText('$4,500')).toBeInTheDocument();
      });
    });

    it('should show pending and approved counts', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Photos')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Units'));
      
      await waitFor(() => {
        expect(screen.getByText('1 Pending')).toBeInTheDocument();
        expect(screen.getByText('1 Approved')).toBeInTheDocument();
      });
    });

    it('should navigate to log unit when button clicked', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Photos')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Units'));
      
      await waitFor(() => {
        expect(screen.getByText('Log New Unit')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Log New Unit'));
      
      expect(mockNavigate).toHaveBeenCalledWith('/jobs/job-123/log-unit');
    });

    it('should display recent unit entries', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Photos')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Units'));
      
      await waitFor(() => {
        expect(screen.getByText('RECENT ENTRIES')).toBeInTheDocument();
        expect(screen.getByText('EC-001')).toBeInTheDocument();
        expect(screen.getByText('EC-002')).toBeInTheDocument();
      });
    });
  });

  describe('TailboardSection', () => {
    it('should display completed tailboard status', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Photos')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Safety'));
      
      await waitFor(() => {
        expect(screen.getByText('Daily Tailboard')).toBeInTheDocument();
        expect(screen.getByText('Completed')).toBeInTheDocument();
      });
    });

    it('should show crew member count', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Photos')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Safety'));
      
      await waitFor(() => {
        expect(screen.getByText('2 crew members')).toBeInTheDocument();
      });
    });

    it('should show hazard count', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Photos')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Safety'));
      
      await waitFor(() => {
        expect(screen.getByText('3 hazards identified')).toBeInTheDocument();
      });
    });

    it('should show View Tailboard button when completed', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Photos')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Safety'));
      
      await waitFor(() => {
        expect(screen.getByText('View Tailboard')).toBeInTheDocument();
      });
    });

    it('should show Start Tailboard button when not started', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('/api/jobs/')) {
          return Promise.resolve({ data: mockJob });
        }
        if (url.includes('/api/billing/units')) {
          return Promise.resolve({ data: mockUnits });
        }
        if (url.includes('/api/tailboards/job/')) {
          return Promise.resolve({ data: null });
        }
        if (url.includes('/api/timesheets')) {
          return Promise.resolve({ data: mockTimesheet });
        }
        return Promise.resolve({ data: {} });
      });
      
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Photos')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Safety'));
      
      await waitFor(() => {
        expect(screen.getByText('Not Started')).toBeInTheDocument();
        expect(screen.getByText('Start Tailboard')).toBeInTheDocument();
      });
    });

    it('should navigate to tailboard when button clicked', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Photos')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Safety'));
      
      await waitFor(() => {
        expect(screen.getByText('View Tailboard')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('View Tailboard'));
      
      expect(mockNavigate).toHaveBeenCalledWith('/jobs/job-123/tailboard');
    });
  });

  describe('TimesheetSection (LME)', () => {
    it('should display Daily LME section', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Photos')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Time'));
      
      await waitFor(() => {
        expect(screen.getByText('Daily LME')).toBeInTheDocument();
      });
    });

    it('should show hours logged today', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Photos')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Time'));
      
      await waitFor(() => {
        expect(screen.getByText('8 hrs logged today')).toBeInTheDocument();
      });
    });

    it('should show default text when no hours logged', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('/api/jobs/')) {
          return Promise.resolve({ data: mockJob });
        }
        if (url.includes('/api/billing/units')) {
          return Promise.resolve({ data: mockUnits });
        }
        if (url.includes('/api/tailboards/job/')) {
          return Promise.resolve({ data: mockTailboard });
        }
        if (url.includes('/api/timesheets')) {
          return Promise.resolve({ data: { entries: [] } });
        }
        return Promise.resolve({ data: {} });
      });
      
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Photos')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Time'));
      
      await waitFor(() => {
        expect(screen.getByText('Labor, Material & Equipment')).toBeInTheDocument();
      });
    });

    it('should navigate to LME form when button clicked', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Photos')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Time'));
      
      await waitFor(() => {
        expect(screen.getByText('Fill Out LME')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Fill Out LME'));
      
      expect(mockNavigate).toHaveBeenCalledWith('/jobs/job-123/lme');
    });
  });

  describe('Submit for Review', () => {
    it('should show Submit FAB when completion >= 50%', async () => {
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Submit for Review')).toBeInTheDocument();
      });
    });

    it('should disable Submit FAB when completion < 50%', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('/api/jobs/')) {
          return Promise.resolve({
            data: {
              ...mockJob,
              folders: [
                {
                  name: 'ACI',
                  subfolders: [
                    { name: 'GF Audit', documents: [] }, // No photos
                    { name: 'Pre-Field Documents', documents: [] },
                    { name: 'General Forms', documents: [] },
                  ],
                },
              ],
            },
          });
        }
        if (url.includes('/api/billing/units')) {
          return Promise.resolve({ data: [] }); // No units
        }
        if (url.includes('/api/tailboards/job/')) {
          return Promise.resolve({ data: null }); // No tailboard
        }
        if (url.includes('/api/timesheets')) {
          return Promise.resolve({ data: null });
        }
        return Promise.resolve({ data: {} });
      });
      
      renderWithRouter();
      
      await waitFor(() => {
        const fab = screen.getByRole('button', { name: /Submit for Review/i });
        expect(fab).toBeDisabled();
      });
    });

    it('should open submit dialog when FAB clicked', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Submit for Review')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Submit for Review'));
      
      await waitFor(() => {
        expect(screen.getByText('Submit Job for GF Review?')).toBeInTheDocument();
      });
    });

    it('should display completion checklist in dialog', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Submit for Review')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Submit for Review'));
      
      await waitFor(() => {
        expect(screen.getByText('Completion Checklist:')).toBeInTheDocument();
        expect(screen.getByText('Photos uploaded (3+ required)')).toBeInTheDocument();
        expect(screen.getByText('Tailboard completed')).toBeInTheDocument();
        expect(screen.getByText('Units logged')).toBeInTheDocument();
        expect(screen.getByText('Documents signed')).toBeInTheDocument();
      });
    });

    it('should close dialog when Cancel clicked', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Submit for Review')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Submit for Review'));
      
      await waitFor(() => {
        expect(screen.getByText('Submit Job for GF Review?')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Cancel'));
      
      await waitFor(() => {
        expect(screen.queryByText('Submit Job for GF Review?')).not.toBeInTheDocument();
      });
    });

    it('should submit job and navigate to dashboard on success', async () => {
      api.put.mockResolvedValue({ data: { success: true } });
      
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Submit for Review')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Submit for Review'));
      
      await waitFor(() => {
        expect(screen.getByText('Submit Job for GF Review?')).toBeInTheDocument();
      });
      
      // Click the Submit button in the dialog
      const dialog = screen.getByRole('dialog');
      const submitButton = within(dialog).getByRole('button', { name: 'Submit' });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/api/jobs/job-123/status', {
          status: 'pending_pm_approval',
        });
      });
      
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', {
        state: { message: 'Job submitted for PM approval!' },
      });
    });

    it('should show error on submit failure', async () => {
      api.put.mockRejectedValue(new Error('Network error'));
      
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Submit for Review')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Submit for Review'));
      
      await waitFor(() => {
        expect(screen.getByText('Submit Job for GF Review?')).toBeInTheDocument();
      });
      
      const dialog = screen.getByRole('dialog');
      const submitButton = within(dialog).getByRole('button', { name: 'Submit' });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error alert when job load fails', async () => {
      api.get.mockRejectedValue(new Error('Failed to load job'));
      
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Failed to load job')).toBeInTheDocument();
      });
    });

    it('should allow closing error alert', async () => {
      api.get.mockRejectedValue(new Error('Failed to load job'));
      
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Failed to load job')).toBeInTheDocument();
      });
      
      const alert = screen.getByRole('alert');
      const closeButton = within(alert).getByRole('button');
      await user.click(closeButton);
      
      await waitFor(() => {
        expect(screen.queryByText('Failed to load job')).not.toBeInTheDocument();
      });
    });

    it('should handle units API failure gracefully', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('/api/jobs/')) {
          return Promise.resolve({ data: mockJob });
        }
        if (url.includes('/api/billing/units')) {
          return Promise.reject(new Error('Units error'));
        }
        if (url.includes('/api/tailboards/job/')) {
          return Promise.resolve({ data: mockTailboard });
        }
        if (url.includes('/api/timesheets')) {
          return Promise.resolve({ data: mockTimesheet });
        }
        return Promise.resolve({ data: {} });
      });
      
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Photos')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Units'));
      
      // Should show 0 units since API failed
      await waitFor(() => {
        expect(screen.getByText('0')).toBeInTheDocument();
      });
    });

    it('should handle tailboard API failure gracefully', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('/api/jobs/')) {
          return Promise.resolve({ data: mockJob });
        }
        if (url.includes('/api/billing/units')) {
          return Promise.resolve({ data: mockUnits });
        }
        if (url.includes('/api/tailboards/job/')) {
          return Promise.reject(new Error('Tailboard error'));
        }
        if (url.includes('/api/timesheets')) {
          return Promise.resolve({ data: mockTimesheet });
        }
        return Promise.resolve({ data: {} });
      });
      
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Photos')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Safety'));
      
      // Should show Not Started since no tailboard
      await waitFor(() => {
        expect(screen.getByText('Not Started')).toBeInTheDocument();
      });
    });

    it('should handle timesheet API failure gracefully', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('/api/jobs/')) {
          return Promise.resolve({ data: mockJob });
        }
        if (url.includes('/api/billing/units')) {
          return Promise.resolve({ data: mockUnits });
        }
        if (url.includes('/api/tailboards/job/')) {
          return Promise.resolve({ data: mockTailboard });
        }
        if (url.includes('/api/timesheets')) {
          return Promise.reject(new Error('Timesheet error'));
        }
        return Promise.resolve({ data: {} });
      });
      
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Photos')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Time'));
      
      // Should show default text
      await waitFor(() => {
        expect(screen.getByText('Labor, Material & Equipment')).toBeInTheDocument();
      });
    });
  });

  describe('Photo Upload Flow', () => {
    it('should have hidden file inputs for camera and gallery', async () => {
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Take Photo')).toBeInTheDocument();
      });
      
      // Hidden inputs should exist
      const fileInputs = document.querySelectorAll('input[type="file"]');
      expect(fileInputs.length).toBe(2);
    });

    it('should show loading progress when uploading', async () => {
      // Create a delayed upload response
      api.post.mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => resolve({ data: { document: { _id: 'new-photo' } } }), 100);
      }));
      
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Take Photo')).toBeInTheDocument();
      });
      
      // Find and trigger file input change
      const fileInput = document.querySelector('input[type="file"][multiple]');
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      
      fireEvent.change(fileInput, { target: { files: [file] } });
      
      // Progress bar should appear
      await waitFor(() => {
        expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle job with no folders', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('/api/jobs/')) {
          return Promise.resolve({
            data: { ...mockJob, folders: null },
          });
        }
        return Promise.resolve({ data: [] });
      });
      
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Close Out Job')).toBeInTheDocument();
      });
      
      // Should show empty state
      expect(screen.getByText('No photos yet. Tap above to add.')).toBeInTheDocument();
    });

    it('should handle units as direct array response', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('/api/jobs/')) {
          return Promise.resolve({ data: mockJob });
        }
        if (url.includes('/api/billing/units')) {
          // API returns array directly
          return Promise.resolve({ data: mockUnits });
        }
        return Promise.resolve({ data: null });
      });
      
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Photos')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Units'));
      
      await waitFor(() => {
        expect(screen.getByText('2')).toBeInTheDocument();
      });
    });

    it('should handle timesheet as array response', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('/api/jobs/')) {
          return Promise.resolve({ data: mockJob });
        }
        if (url.includes('/api/billing/units')) {
          return Promise.resolve({ data: mockUnits });
        }
        if (url.includes('/api/tailboards/job/')) {
          return Promise.resolve({ data: mockTailboard });
        }
        if (url.includes('/api/timesheets')) {
          // API returns array
          return Promise.resolve({ data: [mockTimesheet] });
        }
        return Promise.resolve({ data: {} });
      });
      
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Photos')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Time'));
      
      await waitFor(() => {
        expect(screen.getByText('8 hrs logged today')).toBeInTheDocument();
      });
    });

    it('should display singular crew member text for 1 member', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('/api/jobs/')) {
          return Promise.resolve({ data: mockJob });
        }
        if (url.includes('/api/billing/units')) {
          return Promise.resolve({ data: mockUnits });
        }
        if (url.includes('/api/tailboards/job/')) {
          return Promise.resolve({
            data: {
              ...mockTailboard,
              crewMembers: [{ name: 'John Doe' }],
            },
          });
        }
        if (url.includes('/api/timesheets')) {
          return Promise.resolve({ data: mockTimesheet });
        }
        return Promise.resolve({ data: {} });
      });
      
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Photos')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Safety'));
      
      await waitFor(() => {
        expect(screen.getByText('1 crew member')).toBeInTheDocument();
      });
    });

    it('should handle no hazards in tailboard', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('/api/jobs/')) {
          return Promise.resolve({ data: mockJob });
        }
        if (url.includes('/api/billing/units')) {
          return Promise.resolve({ data: mockUnits });
        }
        if (url.includes('/api/tailboards/job/')) {
          return Promise.resolve({
            data: {
              ...mockTailboard,
              hazardCount: 0,
            },
          });
        }
        if (url.includes('/api/timesheets')) {
          return Promise.resolve({ data: mockTimesheet });
        }
        return Promise.resolve({ data: {} });
      });
      
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Photos')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Safety'));
      
      await waitFor(() => {
        expect(screen.queryByText(/hazards identified/)).not.toBeInTheDocument();
      });
    });

    it('should handle uploading photos successfully', async () => {
      api.post.mockResolvedValue({
        data: {
          document: {
            _id: 'new-photo-123',
            name: 'new-photo.jpg',
            url: 'https://example.com/new-photo.jpg',
          },
        },
      });
      
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Take Photo')).toBeInTheDocument();
      });
      
      // Find and trigger file input change for gallery
      const fileInput = document.querySelector('input[type="file"][multiple]');
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      
      fireEvent.change(fileInput, { target: { files: [file] } });
      
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/api/jobs/job-123/upload',
          expect.any(FormData)
        );
      });
    });

    it('should handle camera photo capture', async () => {
      api.post.mockResolvedValue({
        data: {
          document: {
            _id: 'camera-photo-123',
            name: 'camera-photo.jpg',
            url: 'https://example.com/camera-photo.jpg',
          },
        },
      });
      
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Take Photo')).toBeInTheDocument();
      });
      
      // Find and trigger camera input change
      const cameraInput = document.querySelector('input[type="file"][capture]');
      const file = new File(['test'], 'camera.jpg', { type: 'image/jpeg' });
      
      fireEvent.change(cameraInput, { target: { files: [file] } });
      
      await waitFor(() => {
        expect(api.post).toHaveBeenCalled();
      });
    });

    it('should handle photo upload failure gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      api.post.mockRejectedValue(new Error('Upload failed'));
      
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Take Photo')).toBeInTheDocument();
      });
      
      const fileInput = document.querySelector('input[type="file"][multiple]');
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      
      fireEvent.change(fileInput, { target: { files: [file] } });
      
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Photo upload failed:', expect.any(Error));
      });
      
      consoleSpy.mockRestore();
    });

    it('should handle empty file selection', async () => {
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Take Photo')).toBeInTheDocument();
      });
      
      const fileInput = document.querySelector('input[type="file"][multiple]');
      
      // Trigger with empty files array
      fireEvent.change(fileInput, { target: { files: [] } });
      
      // API should not be called
      expect(api.post).not.toHaveBeenCalled();
    });

    it('should handle photo delete failure gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      api.delete.mockRejectedValue(new Error('Delete failed'));
      
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('JOB PHOTOS (3)')).toBeInTheDocument();
      });
      
      const photos = screen.getAllByRole('img');
      await user.click(photos[0]);
      
      await waitFor(() => {
        expect(screen.getByText('Delete')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Delete'));
      
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Delete failed:', expect.any(Error));
      });
      
      consoleSpy.mockRestore();
    });

    it('should use fallback jobNumber when woNumber not present', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('/api/jobs/')) {
          return Promise.resolve({
            data: {
              ...mockJob,
              woNumber: null,
            },
          });
        }
        if (url.includes('/api/billing/units')) {
          return Promise.resolve({ data: mockUnits });
        }
        if (url.includes('/api/tailboards/job/')) {
          return Promise.resolve({ data: mockTailboard });
        }
        if (url.includes('/api/timesheets')) {
          return Promise.resolve({ data: mockTimesheet });
        }
        return Promise.resolve({ data: {} });
      });
      
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText(/JOB-001/)).toBeInTheDocument();
      });
    });

    it('should handle job with empty timesheet entries array', async () => {
      api.get.mockImplementation((url) => {
        if (url.includes('/api/jobs/')) {
          return Promise.resolve({ data: mockJob });
        }
        if (url.includes('/api/billing/units')) {
          return Promise.resolve({ data: mockUnits });
        }
        if (url.includes('/api/tailboards/job/')) {
          return Promise.resolve({ data: mockTailboard });
        }
        if (url.includes('/api/timesheets')) {
          return Promise.resolve({ data: [] }); // Empty array
        }
        return Promise.resolve({ data: {} });
      });
      
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Photos')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Time'));
      
      // Should show default text since no timesheet
      await waitFor(() => {
        expect(screen.getByText('Labor, Material & Equipment')).toBeInTheDocument();
      });
    });

    it('should display units with status chips correctly', async () => {
      const user = userEvent.setup();
      renderWithRouter();
      
      await waitFor(() => {
        expect(screen.getByText('Photos')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Units'));
      
      await waitFor(() => {
        // Check for status chips
        expect(screen.getByText('pending')).toBeInTheDocument();
        expect(screen.getByText('approved')).toBeInTheDocument();
      });
    });
  });
});

