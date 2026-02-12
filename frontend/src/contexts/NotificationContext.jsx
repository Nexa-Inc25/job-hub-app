/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * FieldLedger - Notification Context
 * Provides global notification state and toast display
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useSocket } from './SocketContext';
import { Snackbar, Alert, IconButton, Typography, Box } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import api from '../api';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { socket, isConnected } = useSocket();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  
  // Toast state
  const [toast, setToast] = useState(null);
  const [toastOpen, setToastOpen] = useState(false);

  // Fetch notifications from API
  const fetchNotifications = useCallback(async ({ limit = 20, skip = 0 } = {}) => {
    try {
      setLoading(true);
      const response = await api.get('/api/notifications', { params: { limit, skip } });
      
      if (skip === 0) {
        setNotifications(response.data.notifications);
      } else {
        setNotifications(prev => [...prev, ...response.data.notifications]);
      }
      setUnreadCount(response.data.unreadCount);
      return response.data;
    } catch (err) {
      console.error('[Notifications] Fetch error:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await api.get('/api/notifications/unread/count');
      setUnreadCount(response.data.count);
      return response.data.count;
    } catch (err) {
      console.error('[Notifications] Count error:', err);
      return null;
    }
  }, []);

  // Mark notification as read
  const markAsRead = useCallback(async (notificationId) => {
    try {
      await api.put(`/api/notifications/${notificationId}/read`);
      setNotifications(prev => 
        prev.map(n => n._id === notificationId ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
      return true;
    } catch (err) {
      console.error('[Notifications] Mark read error:', err);
      return false;
    }
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    try {
      await api.put('/api/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
      return true;
    } catch (err) {
      console.error('[Notifications] Mark all read error:', err);
      return false;
    }
  }, []);

  // Show toast notification
  const showToast = useCallback((notification) => {
    setToast(notification);
    setToastOpen(true);
  }, []);

  // Close toast
  const closeToast = useCallback(() => {
    setToastOpen(false);
  }, []);

  // Get severity based on notification type
  const getSeverity = useCallback((type) => {
    const severityMap = {
      unit_approved: 'success',
      unit_rejected: 'error',
      unit_submitted: 'info',
      claim_created: 'success',
      job_assigned: 'info',
      document_uploaded: 'info',
      system: 'warning'
    };
    return severityMap[type] || 'info';
  }, []);

  // Listen for real-time notifications
  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleNotification = (notification) => {
      console.warn('[Notifications] Real-time:', notification);
      
      // Add to notification list
      setNotifications(prev => [notification, ...prev]);
      setUnreadCount(prev => prev + 1);
      
      // Show toast
      showToast(notification);
    };

    socket.on('notification', handleNotification);

    return () => {
      socket.off('notification', handleNotification);
    };
  }, [socket, isConnected, showToast]);

  // Initial fetch on mount (if logged in)
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetchNotifications();
    }
  }, [fetchNotifications]);

  const value = useMemo(() => ({
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    showToast
  }), [notifications, unreadCount, loading, fetchNotifications, fetchUnreadCount, markAsRead, markAllAsRead, showToast]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      
      {/* Toast notification */}
      <Snackbar
        open={toastOpen}
        autoHideDuration={6000}
        onClose={closeToast}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {toast && (
          <Alert
            severity={getSeverity(toast.type)}
            onClose={closeToast}
            sx={{ 
              width: '100%',
              minWidth: 300,
              boxShadow: 3
            }}
            action={
              <IconButton
                size="small"
                aria-label="close"
                color="inherit"
                onClick={closeToast}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            }
          >
            <Box>
              <Typography variant="subtitle2" fontWeight="bold">
                {toast.title}
              </Typography>
              <Typography variant="body2">
                {toast.message}
              </Typography>
            </Box>
          </Alert>
        )}
      </Snackbar>
    </NotificationContext.Provider>
  );
}

NotificationProvider.propTypes = {
  children: PropTypes.node.isRequired
};

export function useNotificationContext() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotificationContext must be used within a NotificationProvider');
  }
  return context;
}

export default NotificationContext;

