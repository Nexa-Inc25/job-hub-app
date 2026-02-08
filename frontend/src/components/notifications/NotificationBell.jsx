/**
 * FieldLedger - Notification Bell
 * Header icon with unread count badge
 */

import React, { useState } from 'react';
import {
  IconButton,
  Badge,
  Popover,
  Box,
  Typography,
  Button,
  Divider,
  CircularProgress
} from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import { useNotificationContext } from '../../contexts/NotificationContext';
import NotificationList from './NotificationList';

export default function NotificationBell() {
  const [anchorEl, setAnchorEl] = useState(null);
  const { 
    notifications, 
    unreadCount, 
    loading, 
    markAllAsRead,
    fetchNotifications 
  } = useNotificationContext();

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead();
  };

  const handleLoadMore = () => {
    fetchNotifications({ skip: notifications.length });
  };

  const open = Boolean(anchorEl);
  const id = open ? 'notification-popover' : undefined;

  return (
    <>
      <IconButton
        aria-describedby={id}
        onClick={handleClick}
        color="inherit"
        sx={{ 
          position: 'relative',
          '&:hover': {
            backgroundColor: 'action.hover'
          }
        }}
      >
        <Badge 
          badgeContent={unreadCount} 
          color="error"
          max={99}
          sx={{
            '& .MuiBadge-badge': {
              fontSize: '0.7rem',
              height: 18,
              minWidth: 18,
              padding: '0 4px'
            }
          }}
        >
          {unreadCount > 0 ? (
            <NotificationsIcon />
          ) : (
            <NotificationsNoneIcon />
          )}
        </Badge>
      </IconButton>

      <Popover
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        slotProps={{
          paper: {
            sx: {
              width: 360,
              maxHeight: 480,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }
          }
        }}
      >
        {/* Header */}
        <Box 
          sx={{ 
            p: 2, 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            borderBottom: 1,
            borderColor: 'divider'
          }}
        >
          <Typography variant="h6" fontWeight="bold">
            Notifications
          </Typography>
          {unreadCount > 0 && (
            <Button
              size="small"
              startIcon={<DoneAllIcon />}
              onClick={handleMarkAllRead}
              disabled={loading}
            >
              Mark all read
            </Button>
          )}
        </Box>

        {/* Notification List */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {loading && notifications.length === 0 ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress size={32} />
            </Box>
          ) : notifications.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <NotificationsNoneIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
              <Typography color="text.secondary">
                No notifications yet
              </Typography>
            </Box>
          ) : (
            <NotificationList 
              notifications={notifications} 
              onClose={handleClose}
            />
          )}
        </Box>

        {/* Footer - Load More */}
        {notifications.length >= 20 && (
          <>
            <Divider />
            <Box sx={{ p: 1, textAlign: 'center' }}>
              <Button
                size="small"
                onClick={handleLoadMore}
                disabled={loading}
              >
                {loading ? 'Loading...' : 'Load more'}
              </Button>
            </Box>
          </>
        )}
      </Popover>
    </>
  );
}

