/**
 * Dispute Dialog - Create and Resolve Unit Disputes
 * 
 * Two modes:
 * 1. CREATE: Foreman/PM creates a dispute on a unit entry
 * 2. RESOLVE: PM/GF resolves an existing dispute
 * 
 * Dispute Categories:
 * - quantity: Wrong quantity reported
 * - rate: Rate doesn't match price book
 * - quality: Work quality issue
 * - location: Wrong job/location
 * - photo: Photo doesn't match work
 * - duplicate: Duplicate entry
 * - other: Other issue
 * 
 * @module components/billing/DisputeDialog
 */

import React, { useState } from 'react';
import PropTypes from 'prop-types';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Chip,
  Alert,
  AlertTitle,
  Divider,
  ToggleButton,
  ToggleButtonGroup,
  InputAdornment,
  CircularProgress,
} from '@mui/material';
import WarningIcon from '@mui/icons-material/Warning';
import ResolveIcon from '@mui/icons-material/CheckCircle';
import AdjustIcon from '@mui/icons-material/Edit';
import VoidIcon from '@mui/icons-material/Delete';
import ResubmitIcon from '@mui/icons-material/Replay';
import GavelIcon from '@mui/icons-material/Gavel';
import api from '../../api';

// Dispute categories
const DISPUTE_CATEGORIES = [
  { value: 'quantity', label: 'Quantity Issue', description: 'Reported quantity is incorrect' },
  { value: 'rate', label: 'Rate Mismatch', description: 'Rate doesn\'t match current price book' },
  { value: 'quality', label: 'Quality Issue', description: 'Work quality doesn\'t meet standards' },
  { value: 'location', label: 'Location Error', description: 'Wrong job or work location' },
  { value: 'photo', label: 'Photo Issue', description: 'Photo doesn\'t match reported work' },
  { value: 'duplicate', label: 'Duplicate Entry', description: 'This work was already billed' },
  { value: 'other', label: 'Other', description: 'Other issue not listed above' },
];

// Resolution actions
const RESOLUTION_ACTIONS = [
  { 
    value: 'accept', 
    label: 'Accept', 
    description: 'Accept unit as-is, approve for billing',
    icon: <ResolveIcon />,
    color: 'success'
  },
  { 
    value: 'adjust', 
    label: 'Adjust', 
    description: 'Modify quantity and approve',
    icon: <AdjustIcon />,
    color: 'warning'
  },
  { 
    value: 'void', 
    label: 'Void', 
    description: 'Remove unit from billing',
    icon: <VoidIcon />,
    color: 'error'
  },
  { 
    value: 'resubmit', 
    label: 'Resubmit', 
    description: 'Send back to foreman',
    icon: <ResubmitIcon />,
    color: 'info'
  },
];

/**
 * Create Dispute Dialog
 */
const CreateDisputeDialog = ({ open, onClose, unit, onSuccess }) => {
  const [category, setCategory] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError('Please provide a reason for the dispute');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await api.post(`/api/billing/units/${unit._id}/dispute`, {
        reason: reason.trim(),
        category: category || 'other'
      });
      
      onSuccess?.();
      handleClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create dispute');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setCategory('');
    setReason('');
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <WarningIcon color="warning" />
        Dispute Unit Entry
      </DialogTitle>
      
      <DialogContent>
        {/* Unit summary */}
        <Box sx={{ bgcolor: 'action.hover', p: 2, borderRadius: 1, mb: 3 }}>
          <Typography variant="subtitle2" color="text.secondary">
            Disputing:
          </Typography>
          <Typography variant="h6">
            {unit?.itemCode} - {unit?.itemDescription?.slice(0, 50)}...
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
            <Chip label={`Qty: ${unit?.quantity}`} size="small" />
            <Chip label={`$${unit?.totalAmount?.toFixed(2)}`} size="small" color="primary" />
          </Box>
        </Box>

        {/* Category selection */}
        <FormControl fullWidth sx={{ mb: 3 }}>
          <InputLabel>Dispute Category</InputLabel>
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            label="Dispute Category"
          >
            {DISPUTE_CATEGORIES.map((cat) => (
              <MenuItem key={cat.value} value={cat.value}>
                <Box>
                  <Typography variant="body1">{cat.label}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {cat.description}
                  </Typography>
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Reason input */}
        <TextField
          fullWidth
          multiline
          rows={4}
          label="Dispute Reason"
          placeholder="Explain why this unit entry is being disputed..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          helperText="Be specific - this helps with resolution"
          required
        />

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={handleClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          color="warning"
          disabled={submitting || !reason.trim()}
          startIcon={submitting ? <CircularProgress size={20} /> : <WarningIcon />}
        >
          {submitting ? 'Submitting...' : 'Submit Dispute'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

CreateDisputeDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  unit: PropTypes.object,
  onSuccess: PropTypes.func,
};

/**
 * Resolve Dispute Dialog
 */
const ResolveDisputeDialog = ({ open, onClose, unit, onSuccess }) => {
  const [action, setAction] = useState('accept');
  const [resolution, setResolution] = useState('');
  const [adjustedQuantity, setAdjustedQuantity] = useState(unit?.quantity || 0);
  const [adjustedReason, setAdjustedReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Update adjusted quantity when unit changes
  React.useEffect(() => {
    if (unit?.quantity) {
      setAdjustedQuantity(unit.quantity);
    }
  }, [unit?.quantity]);

  const handleSubmit = async () => {
    if (!resolution.trim()) {
      setError('Please provide a resolution explanation');
      return;
    }

    if (action === 'adjust') {
      if (!adjustedReason.trim()) {
        setError('Please provide a reason for the adjustment');
        return;
      }
      if (adjustedQuantity === unit?.quantity) {
        setError('Adjusted quantity must be different from the current quantity');
        return;
      }
    }

    setSubmitting(true);
    setError(null);

    try {
      await api.post(`/api/billing/units/${unit._id}/resolve-dispute`, {
        resolution: resolution.trim(),
        action,
        adjustedQuantity: action === 'adjust' ? adjustedQuantity : undefined,
        adjustedReason: action === 'adjust' ? adjustedReason.trim() : undefined
      });
      
      onSuccess?.();
      handleClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to resolve dispute');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setAction('accept');
    setResolution('');
    setAdjustedQuantity(unit?.quantity || 0);
    setAdjustedReason('');
    setError(null);
    onClose();
  };

  const newTotal = action === 'adjust' 
    ? adjustedQuantity * (unit?.unitPrice || 0)
    : unit?.totalAmount || 0;

  const selectedAction = RESOLUTION_ACTIONS.find(a => a.value === action);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <GavelIcon color="primary" />
        Resolve Dispute
      </DialogTitle>
      
      <DialogContent>
        {/* Dispute info */}
        <Alert severity="warning" sx={{ mb: 3 }}>
          <AlertTitle>
            Dispute: {DISPUTE_CATEGORIES.find(c => c.value === unit?.disputeCategory)?.label || 'General'}
          </AlertTitle>
          <Typography variant="body2">
            <strong>Reason:</strong> {unit?.disputeReason}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Disputed on {unit?.disputedAt ? new Date(unit.disputedAt).toLocaleString() : 'Unknown'}
          </Typography>
        </Alert>

        {/* Unit summary */}
        <Box sx={{ bgcolor: 'action.hover', p: 2, borderRadius: 1, mb: 3 }}>
          <Typography variant="subtitle2" color="text.secondary">
            Unit Entry:
          </Typography>
          <Typography variant="h6">
            {unit?.itemCode} - {unit?.itemDescription?.slice(0, 50)}...
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
            <Chip label={`Original Qty: ${unit?.quantity}`} size="small" />
            <Chip label={`$${unit?.totalAmount?.toFixed(2)}`} size="small" color="primary" />
            {unit?.performedBy?.tier !== 'prime' && (
              <Chip label={unit?.performedBy?.subContractorName || 'Subcontractor'} size="small" variant="outlined" />
            )}
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Action selection */}
        <Typography variant="subtitle1" gutterBottom>
          Resolution Action
        </Typography>
        <ToggleButtonGroup
          value={action}
          exclusive
          onChange={(e, val) => val && setAction(val)}
          fullWidth
          sx={{ mb: 3 }}
        >
          {RESOLUTION_ACTIONS.map((act) => (
            <ToggleButton 
              key={act.value} 
              value={act.value}
              sx={{
                flexDirection: 'column',
                py: 2,
                '&.Mui-selected': {
                  bgcolor: `${act.color}.main`,
                  color: 'white',
                  '&:hover': { bgcolor: `${act.color}.dark` }
                }
              }}
            >
              {act.icon}
              <Typography variant="body2" sx={{ mt: 0.5 }}>{act.label}</Typography>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {selectedAction?.description}
        </Typography>

        {/* Adjustment fields */}
        {action === 'adjust' && (
          <Box sx={{ bgcolor: 'warning.light', p: 2, borderRadius: 1, mb: 3, color: 'warning.contrastText' }}>
            <Typography variant="subtitle2" gutterBottom>
              Quantity Adjustment
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
              <TextField
                type="number"
                label="New Quantity"
                value={adjustedQuantity}
                onChange={(e) => setAdjustedQuantity(Number(e.target.value))}
                InputProps={{
                  endAdornment: <InputAdornment position="end">{unit?.unit || 'EA'}</InputAdornment>
                }}
                size="small"
                sx={{ width: 150 }}
              />
              <Typography>
                × ${unit?.unitPrice?.toFixed(2)} = 
              </Typography>
              <Typography variant="h6" color="primary.main">
                ${newTotal.toFixed(2)}
              </Typography>
            </Box>
            <TextField
              fullWidth
              label="Reason for Adjustment"
              placeholder="Explain why the quantity is being changed..."
              value={adjustedReason}
              onChange={(e) => setAdjustedReason(e.target.value)}
              size="small"
              required
            />
          </Box>
        )}

        {/* Resolution explanation */}
        <TextField
          fullWidth
          multiline
          rows={3}
          label="Resolution Explanation"
          placeholder="Document how this dispute was resolved..."
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          helperText="This will be recorded in the audit trail"
          required
        />

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={handleClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          color={selectedAction?.color || 'primary'}
          disabled={submitting || !resolution.trim()}
          startIcon={submitting ? <CircularProgress size={20} /> : selectedAction?.icon}
        >
          {submitting ? 'Resolving...' : `${selectedAction?.label} & Resolve`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

ResolveDisputeDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  unit: PropTypes.object,
  onSuccess: PropTypes.func,
};

/**
 * Combined Dispute Dialog - automatically picks mode based on unit state
 */
const DisputeDialog = ({ open, onClose, unit, onSuccess }) => {
  if (!unit) return null;
  
  // If unit is already disputed, show resolve dialog
  if (unit.isDisputed || unit.status === 'disputed') {
    return (
      <ResolveDisputeDialog
        open={open}
        onClose={onClose}
        unit={unit}
        onSuccess={onSuccess}
      />
    );
  }
  
  // Otherwise show create dispute dialog
  return (
    <CreateDisputeDialog
      open={open}
      onClose={onClose}
      unit={unit}
      onSuccess={onSuccess}
    />
  );
};

DisputeDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  unit: PropTypes.object,
  onSuccess: PropTypes.func,
};

export default DisputeDialog;
export { CreateDisputeDialog, ResolveDisputeDialog, DISPUTE_CATEGORIES, RESOLUTION_ACTIONS };

