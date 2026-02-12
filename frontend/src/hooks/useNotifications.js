/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * FieldLedger - useNotifications Hook
 * Manages real-time notification state and API interactions
 */

import { useState, useEffect, useCallback } from 'react';
import { useSocket } from '../contexts/SocketContext';
import api from '../api';

export function useNotifications() {
  const { socket, isConnected } = useSocket();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch notifications from API
  const fetchNotifications = useCallback(async ({ limit = 20, skip = 0 } = {}) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await api.get('/api/notifications', {
        params: { limit, skip }
      });
      
      if (skip === 0) {
        setNotifications(response.data.notifications);
      } else {
        // Append for pagination
        setNotifications(prev => [...prev, ...response.data.notifications]);
      }
      setUnreadCount(response.data.unreadCount);
      
      return response.data;
    } catch (err) {
      console.error('[Notifications] Fetch error:', err);
      setError(err.response?.data?.error || 'Failed to load notifications');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch unread count only
  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await api.get('/api/notifications/unread/count');
      setUnreadCount(response.data.count);
      return response.data.count;
    } catch (err) {
      console.error('[Notifications] Unread count error:', err);
      return null;
    }
  }, []);

  // Mark a notification as read
  const markAsRead = useCallback(async (notificationId) => {
    try {
      await api.put(`/api/notifications/${notificationId}/read`);
      
      // Update local state
      setNotifications(prev => 
        prev.map(n => 
          n._id === notificationId ? { ...n, read: true } : n
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
      
      return true;
    } catch (err) {
      console.error('[Notifications] Mark read error:', err);
      return false;
    }
  }, []);

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    try {
      await api.put('/api/notifications/read-all');
      
      // Update local state
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
      
      return true;
    } catch (err) {
      console.error('[Notifications] Mark all read error:', err);
      return false;
    }
  }, []);

  // Add a new notification (from socket)
  const addNotification = useCallback((notification) => {
    setNotifications(prev => [notification, ...prev]);
    setUnreadCount(prev => prev + 1);
  }, []);

  // Listen for real-time notifications via socket
  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleNotification = (notification) => {
      console.warn('[Notifications] Received:', notification);
      addNotification(notification);
    };

    socket.on('notification', handleNotification);

    return () => {
      socket.off('notification', handleNotification);
    };
  }, [socket, isConnected, addNotification]);

  // Initial fetch on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetchNotifications();
    }
  }, [fetchNotifications]);

  // Get notification icon based on type
  const getNotificationIcon = useCallback((type) => {
    const icons = {
      unit_approved: '✅',
      unit_rejected: '❌',
      unit_submitted: '📝',
      claim_created: '💰',
      job_assigned: '🔧',
      job_status_changed: '🔄',
      document_uploaded: '📄',
      mention: '@',
      system: 'ℹ️'
    };
    return icons[type] || '🔔';
  }, []);

  // Get notification color based on type
  const getNotificationColor = useCallback((type) => {
    const colors = {
      unit_approved: 'success',
      unit_rejected: 'error',
      unit_submitted: 'info',
      claim_created: 'warning',
      job_assigned: 'primary',
      job_status_changed: 'info',
      document_uploaded: 'info',
      mention: 'secondary',
      system: 'default'
    };
    return colors[type] || 'default';
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    addNotification,
    getNotificationIcon,
    getNotificationColor
  };
}

export default useNotifications;

