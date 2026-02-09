/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Offline Indicator Component
 * 
 * Shows offline/online status and pending sync count.
 * Can trigger manual sync when clicked.
 */

import React, { useState } from 'react';
import PropTypes from 'prop-types';
import {
  Badge,
  IconButton,
  Tooltip,
  Snackbar,
  Alert,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Typography,
  Box,
  CircularProgress,
  Chip
} from '@mui/material';
import CloudOff from '@mui/icons-material/CloudOff';
import CloudDone from '@mui/icons-material/CloudDone';
import CloudSync from '@mui/icons-material/CloudSync';
import Sync from '@mui/icons-material/Sync';
import Photo from '@mui/icons-material/Photo';
import Description from '@mui/icons-material/Description';
import { useOffline } from '../hooks/useOffline';

const OfflineIndicator = ({ color = 'inherit' }) => {
  const { 
    isOnline, 
    isSyncing, 
    pendingCounts, 
    hasPendingItems,
    triggerSync,
    lastSyncResult
  } = useOffline();

  const [anchorEl, setAnchorEl] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSync = async () => {
    handleClose();
    
    if (!isOnline) {
      setSnackbar({
        open: true,
        message: 'Cannot sync while offline. Connect to the internet first.',
        severity: 'warning'
      });
      return;
    }

    if (!hasPendingItems) {
      setSnackbar({
        open: true,
        message: 'Nothing to sync - all data is up to date!',
        severity: 'info'
      });
      return;
    }

    const result = await triggerSync();
    
    if (result.synced > 0 || result.failed > 0) {
      setSnackbar({
        open: true,
        message: result.failed > 0 
          ? `Sync complete: ${result.synced} uploaded, ${result.failed} failed`
          : `Sync complete: ${result.synced} uploaded`,
        severity: result.failed > 0 ? 'warning' : 'success'
      });
    }
  };

  // Determine icon based on status
  const getIcon = () => {
    if (isSyncing) {
      return <CloudSync sx={{ animation: 'spin 1s linear infinite', '@keyframes spin': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } } }} />;
    }
    if (!isOnline) {
      return <CloudOff />;
    }
    return <CloudDone />;
  };

  return (
    <>
      <Tooltip title={(() => {
        if (!isOnline) return 'Offline Mode';
        return hasPendingItems ? `${pendingCounts.total} pending` : 'Online - All synced';
      })()}>
        <IconButton
          color={color}
          onClick={handleClick}
          sx={{ position: 'relative' }}
        >
          <Badge 
            badgeContent={hasPendingItems ? pendingCounts.total : 0} 
            color="error"
            max={99}
          >
            {getIcon()}
          </Badge>
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        slotProps={{ paper: { sx: { minWidth: 280 } } }}
      >
        {/* Status header */}
        <Box sx={{ px: 2, py: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Chip
              size="small"
              icon={isOnline ? <CloudDone /> : <CloudOff />}
              label={isOnline ? 'Online' : 'Offline'}
              color={isOnline ? 'success' : 'warning'}
            />
            {isSyncing && (
              <Chip
                size="small"
                icon={<CircularProgress size={14} />}
                label="Syncing..."
                variant="outlined"
              />
            )}
          </Box>
          <Typography variant="body2" color="text.secondary">
            {(() => {
              if (!isOnline) return 'Data will sync when online';
              return hasPendingItems ? 'Some items are waiting to sync' : 'All data is synchronized';
            })()}
          </Typography>
        </Box>

        <Divider />

        {/* Pending items breakdown */}
        {hasPendingItems && (
          <>
            <MenuItem disabled sx={{ opacity: 1 }}>
              <ListItemIcon>
                <Description fontSize="small" />
              </ListItemIcon>
              <ListItemText 
                primary={`${pendingCounts.operations} pending operations`}
                secondary="Form submissions, updates"
              />
            </MenuItem>
            <MenuItem disabled sx={{ opacity: 1 }}>
              <ListItemIcon>
                <Photo fontSize="small" />
              </ListItemIcon>
              <ListItemText 
                primary={`${pendingCounts.photos} pending photos`}
                secondary="Captured but not uploaded"
              />
            </MenuItem>
            <Divider />
          </>
        )}

        {/* Sync button */}
        <MenuItem 
          onClick={handleSync}
          disabled={isSyncing || !isOnline}
        >
          <ListItemIcon>
            {isSyncing ? <CircularProgress size={20} /> : <Sync />}
          </ListItemIcon>
          <ListItemText primary={isSyncing ? 'Syncing...' : 'Sync Now'} />
        </MenuItem>

        {/* Last sync result */}
        {lastSyncResult && (
          <Box sx={{ px: 2, py: 1, bgcolor: 'action.hover' }}>
            <Typography variant="caption" color="text.secondary">
              Last sync: {lastSyncResult.synced} uploaded, {lastSyncResult.failed} failed
            </Typography>
          </Box>
        )}
      </Menu>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          severity={snackbar.severity} 
          onClose={() => setSnackbar({ ...snackbar, open: false })}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
};

OfflineIndicator.propTypes = {
  color: PropTypes.string,
};

export default OfflineIndicator;

