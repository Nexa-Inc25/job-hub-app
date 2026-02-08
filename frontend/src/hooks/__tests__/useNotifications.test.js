/**
 * FieldLedger - useNotifications Hook Tests
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useNotifications } from '../useNotifications';

// Mock the socket context
vi.mock('../../contexts/SocketContext', () => ({
  useSocket: () => ({
    socket: {
      on: vi.fn(),
      off: vi.fn()
    },
    isConnected: true
  })
}));

// Mock API
vi.mock('../../api', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn()
  }
}));

import api from '../../api';

describe('useNotifications', () => {
  const mockNotifications = [
    {
      _id: '1',
      type: 'unit_approved',
      title: 'Unit Approved',
      message: 'Unit XYZ approved',
      read: false,
      createdAt: new Date().toISOString(),
      data: { woNumber: 'WO-123' }
    },
    {
      _id: '2',
      type: 'job_assigned',
      title: 'Job Assigned',
      message: 'You were assigned a job',
      read: true,
      createdAt: new Date().toISOString(),
      data: { jobId: 'job123' }
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('token', 'test-token');
    
    // Default mock responses
    api.get.mockImplementation((url) => {
      if (url === '/notifications') {
        return Promise.resolve({
          data: {
            notifications: mockNotifications,
            unreadCount: 1,
            pagination: { limit: 20, skip: 0, hasMore: false }
          }
        });
      }
      if (url === '/notifications/unread/count') {
        return Promise.resolve({ data: { count: 1 } });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should fetch notifications on mount', async () => {
    const { result } = renderHook(() => useNotifications());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.notifications).toHaveLength(2);
    expect(result.current.unreadCount).toBe(1);
    expect(api.get).toHaveBeenCalledWith('/notifications', expect.any(Object));
  });

  it('should not fetch if no token', async () => {
    localStorage.removeItem('token');
    
    const { result } = renderHook(() => useNotifications());

    // Should still have initial state but not make API call
    expect(result.current.notifications).toEqual([]);
  });

  it('should fetch unread count', async () => {
    const { result } = renderHook(() => useNotifications());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.fetchUnreadCount();
    });

    expect(api.get).toHaveBeenCalledWith('/notifications/unread/count');
  });

  it('should mark notification as read', async () => {
    api.put.mockResolvedValueOnce({ data: { success: true } });

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      const success = await result.current.markAsRead('1');
      expect(success).toBe(true);
    });

    expect(api.put).toHaveBeenCalledWith('/notifications/1/read');
    
    // Check local state was updated
    const notification = result.current.notifications.find(n => n._id === '1');
    expect(notification.read).toBe(true);
  });

  it('should mark all notifications as read', async () => {
    api.put.mockResolvedValueOnce({ data: { success: true, modifiedCount: 1 } });

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      const success = await result.current.markAllAsRead();
      expect(success).toBe(true);
    });

    expect(api.put).toHaveBeenCalledWith('/notifications/read-all');
    expect(result.current.unreadCount).toBe(0);
    
    // All notifications should be marked read
    result.current.notifications.forEach(n => {
      expect(n.read).toBe(true);
    });
  });

  it('should return correct icon for notification type', async () => {
    const { result } = renderHook(() => useNotifications());

    expect(result.current.getNotificationIcon('unit_approved')).toBe('✅');
    expect(result.current.getNotificationIcon('unit_rejected')).toBe('❌');
    expect(result.current.getNotificationIcon('unit_submitted')).toBe('📝');
    expect(result.current.getNotificationIcon('claim_created')).toBe('💰');
    expect(result.current.getNotificationIcon('job_assigned')).toBe('🔧');
    expect(result.current.getNotificationIcon('unknown')).toBe('🔔');
  });

  it('should return correct color for notification type', async () => {
    const { result } = renderHook(() => useNotifications());

    expect(result.current.getNotificationColor('unit_approved')).toBe('success');
    expect(result.current.getNotificationColor('unit_rejected')).toBe('error');
    expect(result.current.getNotificationColor('unit_submitted')).toBe('info');
    expect(result.current.getNotificationColor('claim_created')).toBe('warning');
    expect(result.current.getNotificationColor('job_assigned')).toBe('primary');
    expect(result.current.getNotificationColor('unknown')).toBe('default');
  });

  it('should add notification to list', async () => {
    const { result } = renderHook(() => useNotifications());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const newNotification = {
      _id: '3',
      type: 'document_uploaded',
      title: 'Document Uploaded',
      message: 'New document added',
      read: false,
      createdAt: new Date().toISOString()
    };

    act(() => {
      result.current.addNotification(newNotification);
    });

    expect(result.current.notifications).toHaveLength(3);
    expect(result.current.notifications[0]._id).toBe('3'); // Added to front
    expect(result.current.unreadCount).toBe(2); // Incremented
  });

  it('should handle API errors gracefully', async () => {
    api.get.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.notifications).toEqual([]);
  });

  it('should paginate notifications', async () => {
    const page1 = mockNotifications;
    const page2 = [
      { _id: '3', type: 'system', title: 'Old', message: 'Old notification', read: true, createdAt: new Date().toISOString() }
    ];

    api.get
      .mockResolvedValueOnce({ data: { notifications: page1, unreadCount: 1 } })
      .mockResolvedValueOnce({ data: { notifications: page2, unreadCount: 1 } });

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.notifications).toHaveLength(2);

    // Fetch more
    await act(async () => {
      await result.current.fetchNotifications({ skip: 2 });
    });

    expect(result.current.notifications).toHaveLength(3);
    expect(api.get).toHaveBeenLastCalledWith('/notifications', { params: { limit: 20, skip: 2 } });
  });
});

