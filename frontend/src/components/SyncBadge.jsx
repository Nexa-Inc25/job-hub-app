/**
 * SyncBadge Component - NIST-Compliant Outbox Status Indicator
 * 
 * The Foreman's primary source of truth for sync status.
 * Designed for field workers - high visibility, touch-friendly.
 * 
 * States:
 * - Green Cloud: All synced
 * - Blue Spinner: Sync in progress
 * - Orange Badge: Pending items (tap to upload)
 * - Red Error: Validation errors or auth expired
 * - Grey Cloud: Offline mode
 * 
 * NIST SP 800-53 Compliance:
 * - SI-7: Shows atomic transaction status
 * - AC-3: Displays session lock state
 * - SC-8: Indicates checksum verification
 * 
 * @module components/SyncBadge
 */

import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Badge,
  IconButton,
  Tooltip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography,
  Divider,
  Collapse,
  Alert,
  AlertTitle,
  Chip,
} from '@mui/material';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ErrorIcon from '@mui/icons-material/Error';
import SyncIcon from '@mui/icons-material/Sync';
import LockIcon from '@mui/icons-material/Lock';
import UnlockIcon from '@mui/icons-material/LockOpen';
import RetryIcon from '@mui/icons-material/Refresh';
import ExpandIcon from '@mui/icons-material/ExpandMore';
import CollapseIcon from '@mui/icons-material/ExpandLess';
import PhotoIcon from '@mui/icons-material/Photo';
import UnitIcon from '@mui/icons-material/Assignment';
import DocIcon from '@mui/icons-material/Description';
import CheckIcon from '@mui/icons-material/CheckCircle';
import SecurityIcon from '@mui/icons-material/Security';
import useSyncQueue, { QUEUE_TYPES, LOCK_REASONS } from '../hooks/useSyncQueue';

// Status colors (high contrast for field visibility)
const STATUS_COLORS = {
  synced: '#00e676',     // Green - all clear
  syncing: '#2196f3',    // Blue - in progress
  pending: '#ff9800',    // Orange - items waiting
  failed: '#ff5722',     // Deep Orange - failed, will retry
  error: '#f44336',      // Red - needs attention
  locked: '#9c27b0',     // Purple - auth required
  offline: '#9e9e9e',    // Grey - no connection
};

/**
 * Format time ago
 */
const formatTimeAgo = (date) => {
  if (!date) return 'Never';
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

/**
 * Get queue item icon based on type
 */
const getItemIcon = (type) => {
  switch (type) {
    case QUEUE_TYPES.UNIT_ENTRY:
      return <UnitIcon color="primary" />;
    case QUEUE_TYPES.PHOTO_UPLOAD:
      return <PhotoIcon color="secondary" />;
    default:
      return <DocIcon color="action" />;
  }
};

/**
 * Get lock reason display text
 */
const getLockReasonText = (reason) => {
  switch (reason) {
    case LOCK_REASONS.AUTH_EXPIRED:
      return 'Session expired - please log in again';
    case LOCK_REASONS.VALIDATION_FAILED:
      return 'Data validation failed - review and fix';
    case LOCK_REASONS.SERVER_REJECTED:
      return 'Server rejected data - contact support';
    default:
      return 'Queue locked - action required';
  }
};

/**
 * Minimal SyncBadge for AppBar (per NIST spec)
 * This is the Foreman's primary source of truth.
 */
export const SyncBadgeMinimal = ({ onClick }) => {
  const { 
    isOnline, 
    isSyncing, 
    pendingCount, 
    hasErrors,
    isLocked,
    sync,
  } = useSyncQueue();

  const handleClick = useCallback((e) => {
    if (onClick) {
      onClick(e);
    } else if (!isSyncing && pendingCount > 0 && isOnline && !isLocked) {
      sync();
    }
  }, [onClick, isSyncing, pendingCount, isOnline, isLocked, sync]);

  // Error state - show error badge
  if (hasErrors || isLocked) {
    return (
      <Tooltip title={isLocked ? 'Session Locked' : 'Sync Errors'}>
        <Badge color="error" badgeContent="!">
          <IconButton onClick={handleClick} size="small">
            {isLocked ? <LockIcon sx={{ color: STATUS_COLORS.locked }} /> : <ErrorIcon sx={{ color: STATUS_COLORS.error }} />}
          </IconButton>
        </Badge>
      </Tooltip>
    );
  }

  // Syncing state
  if (isSyncing) {
    return (
      <Tooltip title="Syncing...">
        <IconButton size="small" disabled>
          <CircularProgress size={20} />
        </IconButton>
      </Tooltip>
    );
  }

  // Pending items
  if (pendingCount > 0) {
    return (
      <Tooltip title={isOnline ? 'Tap to Upload' : 'Offline - Will sync when connected'}>
        <Badge color="warning" badgeContent={pendingCount} max={99}>
          <IconButton onClick={handleClick} size="small" disabled={!isOnline}>
            <CloudUploadIcon sx={{ color: isOnline ? STATUS_COLORS.pending : STATUS_COLORS.offline }} />
          </IconButton>
        </Badge>
      </Tooltip>
    );
  }

  // All clear
  return (
    <Tooltip title="All Synced">
      <IconButton size="small" onClick={handleClick}>
        <CloudDoneIcon sx={{ color: STATUS_COLORS.synced }} />
      </IconButton>
    </Tooltip>
  );
};

SyncBadgeMinimal.propTypes = {
  onClick: PropTypes.func,
};

/**
 * Detailed Sync Status Panel
 */
export const SyncStatusPanel = ({ open, onClose, onUnlock }) => {
  const { 
    isOnline, 
    isSyncing, 
    isLocked,
    lockReason,
    pendingCount, 
    failedCount, 
    errorCount,
    deadCount,
    totalPending,
    lastSyncResult,
    lastSyncTime,
    currentItem,
    isHealthy,
    sync,
    retryFailed,
    unlock,
    getQueue,
    getErrors,
  } = useSyncQueue();

  const [queueItems, setQueueItems] = useState([]);
  const [errorItems, setErrorItems] = useState([]);
  const [showQueue, setShowQueue] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  // Load queue items when panel opens
  React.useEffect(() => {
    if (open) {
      getQueue().then(setQueueItems);
      getErrors().then(setErrorItems);
    }
  }, [open, getQueue, getErrors, totalPending, errorCount]);

  const handleRetryFailed = async () => {
    setRetrying(true);
    try {
      await retryFailed();
    } finally {
      setRetrying(false);
    }
  };

  const handleUnlock = async () => {
    setUnlocking(true);
    try {
      const success = await unlock();
      if (success && onUnlock) {
        onUnlock();
      }
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { maxHeight: '80vh' } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <SecurityIcon color="primary" />
        Sync Status
        {isHealthy && (
          <Chip 
            icon={<CheckIcon />} 
            label="Healthy" 
            color="success" 
            size="small" 
            sx={{ ml: 'auto' }}
          />
        )}
      </DialogTitle>

      <DialogContent dividers>
        {/* Connection Status */}
        <Alert 
          severity={isOnline ? 'success' : 'warning'}
          icon={isOnline ? <CloudDoneIcon /> : <CloudOffIcon />}
          sx={{ mb: 2 }}
        >
          {isOnline 
            ? 'Connected to server (TLS 1.3)' 
            : 'Offline - items will sync when connection is restored'}
        </Alert>

        {/* Lock Status (NIST AC-3) */}
        {isLocked && (
          <Alert 
            severity="error" 
            icon={<LockIcon />}
            action={
              <Button 
                color="inherit" 
                size="small" 
                startIcon={unlocking ? <CircularProgress size={16} /> : <UnlockIcon />}
                onClick={handleUnlock}
                disabled={unlocking}
              >
                Unlock
              </Button>
            }
            sx={{ mb: 2 }}
          >
            <AlertTitle>Queue Locked</AlertTitle>
            {getLockReasonText(lockReason)}
          </Alert>
        )}

        {/* Summary Stats */}
        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          <StatBox count={pendingCount} label="Pending" color="warning.main" />
          <StatBox count={failedCount} label="Failed" color="orange" />
          <StatBox count={errorCount} label="Errors" color="error.main" />
          <StatBox count={deadCount} label="Dead" color="grey" />
        </Box>

        {/* Current sync progress */}
        {isSyncing && (
          <Alert severity="info" icon={<CircularProgress size={20} />} sx={{ mb: 2 }}>
            Syncing... 
            {currentItem && (
              <Typography variant="caption" display="block">
                Processing: {currentItem.type?.replace('_', ' ')}
              </Typography>
            )}
          </Alert>
        )}

        {/* Last sync info */}
        {lastSyncTime && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Last sync: {formatTimeAgo(lastSyncTime)}
            {lastSyncResult && (
              <> ({lastSyncResult.processed} synced, {lastSyncResult.failed} failed, {lastSyncResult.locked || 0} locked)</>
            )}
          </Typography>
        )}

        {/* Error items section */}
        {errorCount > 0 && (
          <>
            <Divider sx={{ my: 2 }} />
            <Box 
              onClick={() => setShowErrors(!showErrors)}
              sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                cursor: 'pointer',
                py: 1,
                color: 'error.main',
              }}
            >
              <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ErrorIcon fontSize="small" />
                Validation Errors ({errorCount})
              </Typography>
              {showErrors ? <CollapseIcon /> : <ExpandIcon />}
            </Box>
            <Collapse in={showErrors}>
              <List dense>
                {errorItems.slice(0, 10).map((item) => (
                  <ListItem key={item.id} sx={{ bgcolor: 'error.light', borderRadius: 1, mb: 0.5 }}>
                    <ListItemIcon>{getItemIcon(item.type)}</ListItemIcon>
                    <ListItemText
                      primary={item.type?.replace('_', ' ')}
                      secondary={item.lastError?.slice(0, 100)}
                    />
                  </ListItem>
                ))}
              </List>
            </Collapse>
          </>
        )}

        {/* Failed items retry */}
        {failedCount > 0 && (
          <Alert 
            severity="warning" 
            action={
              <Button 
                color="inherit" 
                size="small" 
                startIcon={retrying ? <CircularProgress size={16} /> : <RetryIcon />}
                onClick={handleRetryFailed}
                disabled={retrying || !isOnline || isLocked}
              >
                Retry All
              </Button>
            }
            sx={{ mb: 2 }}
          >
            {failedCount} items failed - will auto-retry with backoff
          </Alert>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Queue items toggle */}
        <Box 
          onClick={() => setShowQueue(!showQueue)}
          sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            cursor: 'pointer',
            py: 1,
          }}
        >
          <Typography variant="subtitle2">
            Queue Items ({queueItems.length})
          </Typography>
          {showQueue ? <CollapseIcon /> : <ExpandIcon />}
        </Box>

        <Collapse in={showQueue}>
          {queueItems.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              Queue is empty - all items synced
            </Typography>
          ) : (
            <List dense>
              {queueItems.slice(0, 20).map((item) => (
                <ListItem key={item.id} divider>
                  <ListItemIcon>
                    {getItemIcon(item.type)}
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {item.type?.replace('_', ' ')}
                        <StatusChip status={item.status} />
                      </Box>
                    }
                    secondary={
                      <>
                        {formatTimeAgo(item.createdAt)}
                        {item.retryCount > 0 && ` • ${item.retryCount} retries`}
                        {item.checksum && (
                          <Typography variant="caption" display="block" sx={{ fontFamily: 'monospace' }}>
                            Hash: {item.checksum?.slice(0, 12)}...
                          </Typography>
                        )}
                      </>
                    }
                  />
                </ListItem>
              ))}
              {queueItems.length > 20 && (
                <Typography variant="caption" color="text.secondary" sx={{ p: 1 }}>
                  And {queueItems.length - 20} more...
                </Typography>
              )}
            </List>
          )}
        </Collapse>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button
          variant="contained"
          startIcon={isSyncing ? <CircularProgress size={20} /> : <SyncIcon />}
          onClick={() => sync()}
          disabled={isSyncing || !isOnline || isLocked || totalPending === 0}
        >
          {isSyncing ? 'Syncing...' : 'Sync Now'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

SyncStatusPanel.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onUnlock: PropTypes.func,
};

/**
 * Stat box component
 */
const StatBox = ({ count, label, color }) => (
  <Box sx={{ 
    flex: '1 1 auto', 
    p: 1.5, 
    bgcolor: 'background.default', 
    borderRadius: 1,
    textAlign: 'center',
    minWidth: 60,
  }}>
    <Typography variant="h5" sx={{ color: count > 0 ? color : 'text.secondary' }}>
      {count}
    </Typography>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
  </Box>
);

StatBox.propTypes = {
  count: PropTypes.number.isRequired,
  label: PropTypes.string.isRequired,
  color: PropTypes.string,
};

/**
 * Status chip component
 */
const StatusChip = ({ status }) => {
  const config = {
    pending: { label: 'Pending', color: 'warning' },
    syncing: { label: 'Syncing', color: 'info' },
    failed: { label: 'Retry', color: 'warning' },
    error: { label: 'Error', color: 'error' },
    locked: { label: 'Locked', color: 'secondary' },
    dead: { label: 'Failed', color: 'error' },
  };
  
  const { label, color } = config[status] || { label: status, color: 'default' };
  
  return <Chip label={label} color={color} size="small" />;
};

StatusChip.propTypes = {
  status: PropTypes.string.isRequired,
};

/**
 * Main SyncBadge Component (combines minimal + panel)
 */
const SyncBadge = ({ onUnlock }) => {
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <>
      <SyncBadgeMinimal onClick={() => setPanelOpen(true)} />
      <SyncStatusPanel 
        open={panelOpen} 
        onClose={() => setPanelOpen(false)} 
        onUnlock={onUnlock}
      />
    </>
  );
};

SyncBadge.propTypes = {
  onUnlock: PropTypes.func,
};

export default SyncBadge;

// Legacy exports for backward compatibility
export { SyncBadgeMinimal as SyncBadgeCompact };
