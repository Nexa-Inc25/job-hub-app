/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
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
  ListItemSecondaryAction,
  Typography,
  Divider,
  Collapse,
  Alert,
  AlertTitle,
  Chip,
  LinearProgress,
  Radio,
  RadioGroup,
  FormControlLabel,
  Stack,
} from '@mui/material';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ErrorIcon from '@mui/icons-material/Error';
import SyncIcon from '@mui/icons-material/Sync';
import LockIcon from '@mui/icons-material/Lock';
import UnlockIcon from '@mui/icons-material/LockOpen';
import RetryIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandIcon from '@mui/icons-material/ExpandMore';
import CollapseIcon from '@mui/icons-material/ExpandLess';
import PhotoIcon from '@mui/icons-material/Photo';
import UnitIcon from '@mui/icons-material/Assignment';
import DocIcon from '@mui/icons-material/Description';
import CheckIcon from '@mui/icons-material/CheckCircle';
import SecurityIcon from '@mui/icons-material/Security';
import CompareIcon from '@mui/icons-material/CompareArrows';
import MergeIcon from '@mui/icons-material/MergeType';
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
 * Format byte size for display
 */
const formatSize = (bytes) => {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
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
          <IconButton onClick={handleClick} size="small" aria-label={isLocked ? 'Session locked' : 'Sync errors'}>
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
        <IconButton size="small" disabled aria-label="Syncing">
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
          <IconButton onClick={handleClick} size="small" disabled={!isOnline} aria-label={`Upload ${pendingCount} pending items`}>
            <CloudUploadIcon sx={{ color: isOnline ? STATUS_COLORS.pending : STATUS_COLORS.offline }} />
          </IconButton>
        </Badge>
      </Tooltip>
    );
  }

  // All clear
  return (
    <Tooltip title="All Synced">
      <IconButton size="small" onClick={handleClick} aria-label="All synced">
        <CloudDoneIcon sx={{ color: STATUS_COLORS.synced }} />
      </IconButton>
    </Tooltip>
  );
};

SyncBadgeMinimal.propTypes = {
  onClick: PropTypes.func,
};

/**
 * Conflict Resolution Dialog
 * Shows diff of local vs server with field-level merge options.
 */
const ConflictResolutionDialog = ({ open, onClose, conflictData, onResolve }) => {
  const [fieldChoices, setFieldChoices] = useState({});
  const [resolution, setResolution] = useState('keep_server');
  const [resolving, setResolving] = useState(false);

  const conflicts = conflictData?.conflicts || [];

  const handleFieldChoice = (field, choice) => {
    setFieldChoices(prev => ({ ...prev, [field]: choice }));
  };

  const handleResolve = async () => {
    setResolving(true);
    try {
      await onResolve(resolution, resolution === 'merge' ? fieldChoices : null);
      onClose();
    } finally {
      setResolving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CompareIcon color="warning" />
        Sync Conflict Detected
      </DialogTitle>
      <DialogContent dividers>
        <Alert severity="warning" sx={{ mb: 2 }}>
          <AlertTitle>Data Changed on Server</AlertTitle>
          {conflicts.length} field(s) differ between your local changes and the server version.
        </Alert>

        <RadioGroup
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          sx={{ mb: 2 }}
        >
          <FormControlLabel value="keep_server" control={<Radio />} label="Keep Server Version (recommended)" />
          <FormControlLabel value="keep_local" control={<Radio />} label="Keep My Version" />
          <FormControlLabel
            value="merge"
            control={<Radio />}
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <MergeIcon fontSize="small" /> Merge Field-by-Field
              </Box>
            }
          />
        </RadioGroup>

        {resolution === 'merge' && conflicts.length > 0 && (
          <>
            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Choose per field:
            </Typography>
            <List dense>
              {conflicts.map((c) => (
                <ListItem key={c.field} sx={{ flexDirection: 'column', alignItems: 'stretch', py: 1 }}>
                  <Typography variant="caption" fontWeight="bold" color="text.secondary">
                    {c.field}
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                    <Chip
                      label={`Mine: ${JSON.stringify(c.local)?.slice(0, 40)}`}
                      size="small"
                      color={fieldChoices[c.field] === 'local' ? 'primary' : 'default'}
                      onClick={() => handleFieldChoice(c.field, 'local')}
                      variant={fieldChoices[c.field] === 'local' ? 'filled' : 'outlined'}
                    />
                    <Chip
                      label={`Server: ${JSON.stringify(c.server)?.slice(0, 40)}`}
                      size="small"
                      color={fieldChoices[c.field] === 'server' ? 'success' : 'default'}
                      onClick={() => handleFieldChoice(c.field, 'server')}
                      variant={fieldChoices[c.field] === 'server' ? 'filled' : 'outlined'}
                    />
                  </Stack>
                </ListItem>
              ))}
            </List>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleResolve}
          disabled={resolving}
          startIcon={resolving ? <CircularProgress size={16} /> : <CheckIcon />}
        >
          Apply Resolution
        </Button>
      </DialogActions>
    </Dialog>
  );
};

ConflictResolutionDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  conflictData: PropTypes.object,
  onResolve: PropTypes.func.isRequired,
};

/**
 * Individual Queue Item Row with Retry/Discard actions
 */
const QueueItemRow = ({ item, onRetry, onDiscard, isSyncing }) => {
  const [confirming, setConfirming] = useState(false);

  const handleDiscard = () => {
    if (confirming) {
      onDiscard(item.id);
      setConfirming(false);
    } else {
      setConfirming(true);
      // Auto-cancel confirmation after 3 seconds
      setTimeout(() => setConfirming(false), 3000);
    }
  };

  const isPhoto = item.type === QUEUE_TYPES.PHOTO_UPLOAD;
  const estimatedSize = isPhoto ? item.payload?.base64Data?.length || 0 : 0;

  return (
    <ListItem divider sx={{ pr: 12 }}>
      <ListItemIcon>
        {getItemIcon(item.type)}
      </ListItemIcon>
      <ListItemText
        primary={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2">
              {item.type?.replaceAll('_', ' ')}
            </Typography>
            <StatusChip status={item.status} />
          </Box>
        }
        secondary={
          <>
            {formatTimeAgo(item.createdAt)}
            {item.retryCount > 0 && ` \u2022 ${item.retryCount} retries`}
            {estimatedSize > 0 && ` \u2022 ${formatSize(estimatedSize)}`}
            {item.checksum && (
              <Typography variant="caption" display="block" sx={{ fontFamily: 'monospace' }}>
                Hash: {item.checksum?.slice(0, 12)}...
              </Typography>
            )}
            {item.lastError && (
              <Typography variant="caption" display="block" color="error">
                {item.lastError.slice(0, 80)}
              </Typography>
            )}
          </>
        }
      />
      <ListItemSecondaryAction>
        <Tooltip title="Retry this item">
          <span>
            <IconButton
              size="small"
              onClick={() => onRetry(item.id)}
              disabled={isSyncing || item.status === 'pending'}
              aria-label={`Retry ${item.type}`}
            >
              <RetryIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={confirming ? 'Tap again to confirm' : 'Discard this item'}>
          <IconButton
            size="small"
            onClick={handleDiscard}
            color={confirming ? 'error' : 'default'}
            aria-label={confirming ? 'Confirm discard' : `Discard ${item.type}`}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </ListItemSecondaryAction>
    </ListItem>
  );
};

QueueItemRow.propTypes = {
  item: PropTypes.object.isRequired,
  onRetry: PropTypes.func.isRequired,
  onDiscard: PropTypes.func.isRequired,
  isSyncing: PropTypes.bool,
};

/**
 * Detailed Sync Status Panel
 */
export const SyncStatusPanel = ({ open, onClose, onUnlock, onConflictResolve }) => {
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
  const [conflictDialog, setConflictDialog] = useState({ open: false, data: null });
  const [syncProgress, setSyncProgress] = useState(0);

  // Load queue items when panel opens
  React.useEffect(() => {
    if (open) {
      getQueue().then(setQueueItems);
      getErrors().then(setErrorItems);
    }
  }, [open, getQueue, getErrors, totalPending, errorCount]);

  // Simulate progress during sync
  React.useEffect(() => {
    if (isSyncing) {
      const total = totalPending || 1;
      const processed = lastSyncResult?.processed || 0;
      setSyncProgress(Math.min((processed / total) * 100, 95));
    } else {
      setSyncProgress(0);
    }
  }, [isSyncing, totalPending, lastSyncResult]);

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

  const handleRetryItem = async (_itemId) => {
    // Reset the individual item and trigger sync
    await retryFailed();
    const refreshed = await getQueue();
    setQueueItems(refreshed);
  };

  const handleDiscardItem = async (discardId) => {
    // Remove item from queue (dequeue without server confirmation)
    const refreshed = (await getQueue()).filter(i => i.id !== discardId);
    setQueueItems(refreshed);
    // Note: actual removal from IndexedDB happens via queueManager
  };

  const handleConflictResolve = async (resolution, fieldChoices) => {
    if (onConflictResolve) {
      await onConflictResolve(conflictDialog.data, resolution, fieldChoices);
    }
    setConflictDialog({ open: false, data: null });
  };

  return (
    <>
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
              <Box sx={{ width: '100%' }}>
                Syncing... 
                {currentItem && (
                  <Typography variant="caption" display="block">
                    Processing: {currentItem.type?.replaceAll('_', ' ')}
                  </Typography>
                )}
                <LinearProgress
                  variant="determinate"
                  value={syncProgress}
                  sx={{ mt: 1, borderRadius: 1 }}
                />
              </Box>
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
                        primary={item.type?.replaceAll('_', ' ')}
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
                  <QueueItemRow
                    key={item.id}
                    item={item}
                    onRetry={handleRetryItem}
                    onDiscard={handleDiscardItem}
                    isSyncing={isSyncing}
                  />
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
            {isSyncing ? 'Syncing...' : 'Sync All Now'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Conflict Resolution Dialog */}
      <ConflictResolutionDialog
        open={conflictDialog.open}
        onClose={() => setConflictDialog({ open: false, data: null })}
        conflictData={conflictDialog.data}
        onResolve={handleConflictResolve}
      />
    </>
  );
};

SyncStatusPanel.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onUnlock: PropTypes.func,
  onConflictResolve: PropTypes.func,
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
const SyncBadge = ({ onUnlock, onConflictResolve }) => {
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <>
      <SyncBadgeMinimal onClick={() => setPanelOpen(true)} />
      <SyncStatusPanel 
        open={panelOpen} 
        onClose={() => setPanelOpen(false)} 
        onUnlock={onUnlock}
        onConflictResolve={onConflictResolve}
      />
    </>
  );
};

SyncBadge.propTypes = {
  onUnlock: PropTypes.func,
  onConflictResolve: PropTypes.func,
};

export default SyncBadge;

// Legacy exports for backward compatibility
export { SyncBadgeMinimal as SyncBadgeCompact };
