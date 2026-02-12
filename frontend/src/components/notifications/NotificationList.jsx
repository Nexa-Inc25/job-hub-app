/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * FieldLedger - Notification List
 * Displays list of notifications with navigation
 */

import React from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import {
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography,
  Box,
  Avatar,
  Chip
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import DescriptionIcon from '@mui/icons-material/Description';
import ReceiptIcon from '@mui/icons-material/Receipt';
import AssignmentIcon from '@mui/icons-material/Assignment';
import SyncIcon from '@mui/icons-material/Sync';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import InfoIcon from '@mui/icons-material/Info';
import { useNotificationContext } from '../../contexts/NotificationContext';

// Format relative time
function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString();
}

// Get icon for notification type
function getNotificationIcon(type) {
  const iconMap = {
    unit_approved: <CheckCircleIcon color="success" />,
    unit_rejected: <CancelIcon color="error" />,
    unit_submitted: <DescriptionIcon color="info" />,
    claim_created: <ReceiptIcon color="warning" />,
    job_assigned: <AssignmentIcon color="primary" />,
    job_status_changed: <SyncIcon color="info" />,
    document_uploaded: <AttachFileIcon color="info" />,
    system: <InfoIcon color="action" />
  };
  return iconMap[type] || <InfoIcon />;
}

// Get background color for unread notifications
function _getBackgroundColor(read, theme) {
  if (read) return 'transparent';
  return theme === 'dark' 
    ? 'rgba(25, 118, 210, 0.08)' 
    : 'rgba(25, 118, 210, 0.04)';
}

export default function NotificationList({ notifications, onClose }) {
  const navigate = useNavigate();
  const { markAsRead } = useNotificationContext();

  const handleClick = async (notification) => {
    // Mark as read
    if (!notification.read) {
      await markAsRead(notification._id);
    }

    // Navigate based on notification type
    const { data } = notification;
    
    if (data?.jobId) {
      navigate(`/jobs/${data.jobId}`);
    } else if (data?.claimId) {
      navigate('/billing/claims');
    } else if (data?.unitEntryId) {
      navigate('/billing');
    }

    // Close the popover
    if (onClose) onClose();
  };

  return (
    <List sx={{ p: 0 }}>
      {notifications.map((notification) => (
        <ListItem
          key={notification._id}
          onClick={() => handleClick(notification)}
          sx={{
            cursor: 'pointer',
            backgroundColor: notification.read ? 'transparent' : 'action.hover',
            borderBottom: 1,
            borderColor: 'divider',
            '&:hover': {
              backgroundColor: 'action.selected'
            },
            '&:last-child': {
              borderBottom: 0
            }
          }}
        >
          <ListItemIcon sx={{ minWidth: 44 }}>
            <Avatar
              sx={{
                width: 32,
                height: 32,
                backgroundColor: notification.read ? 'grey.200' : 'primary.light'
              }}
            >
              {getNotificationIcon(notification.type)}
            </Avatar>
          </ListItemIcon>
          
          <ListItemText
            primary={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography
                  variant="body2"
                  fontWeight={notification.read ? 'normal' : 'bold'}
                  sx={{ 
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {notification.title}
                </Typography>
                {!notification.read && (
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: 'primary.main',
                      flexShrink: 0
                    }}
                  />
                )}
              </Box>
            }
            secondary={
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {notification.message}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                  <Typography variant="caption" color="text.disabled">
                    {formatRelativeTime(notification.createdAt)}
                  </Typography>
                  {notification.data?.woNumber && (
                    <Chip
                      label={`WO ${notification.data.woNumber}`}
                      size="small"
                      variant="outlined"
                      sx={{ height: 18, fontSize: '0.65rem' }}
                    />
                  )}
                </Box>
              </Box>
            }
          />
        </ListItem>
      ))}
    </List>
  );
}

NotificationList.propTypes = {
  notifications: PropTypes.arrayOf(PropTypes.shape({
    _id: PropTypes.string.isRequired,
    type: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    message: PropTypes.string,
    read: PropTypes.bool,
    createdAt: PropTypes.string,
    data: PropTypes.object
  })).isRequired,
  onClose: PropTypes.func
};
