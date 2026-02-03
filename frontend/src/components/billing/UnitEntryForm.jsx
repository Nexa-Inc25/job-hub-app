/**
 * Unit Entry Form - Digital Receipt Capture
 * 
 * Mobile-first form for field workers to log unit-price work.
 * Implements the "Digital Receipt" workflow with:
 * - GPS-verified photo capture
 * - Rate lookup from cached price book
 * - Photo waiver logic with supervisor approval
 * - Offline queue for later sync
 * 
 * Design Constraints:
 * - Touch targets: 56px+ (glove-friendly)
 * - Contrast: AAA for sunlight visibility
 * - Single-column layout for one-handed use
 * 
 * @module components/billing/UnitEntryForm
 */

import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Typography,
  Button,
  IconButton,
  TextField,
  Card,
  CardContent,
  Chip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Fade,
  Collapse,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import CameraIcon from '@mui/icons-material/CameraAlt';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import GPSIcon from '@mui/icons-material/MyLocation';
import WarningIcon from '@mui/icons-material/Warning';
import OfflineIcon from '@mui/icons-material/CloudOff';
import OnlineIcon from '@mui/icons-material/CloudQueue';
import ExpandIcon from '@mui/icons-material/ExpandMore';
import CollapseIcon from '@mui/icons-material/ExpandLess';
import { useGeolocation, GPS_THRESHOLDS } from '../../hooks/useGeolocation';
import { useOffline } from '../../hooks/useOffline';
import GPSPhotoCapture from './GPSPhotoCapture';
import offlineStorage from '../../utils/offlineStorage';
import api from '../../api';

// Helper to get submit button text (avoids nested ternary)
const getSubmitButtonText = (submitting, isOnline) => {
  if (submitting) return 'Saving...';
  if (isOnline) return 'Submit';
  return 'Save Offline';
};

// High-contrast colors for field visibility
const COLORS = {
  bg: '#0a0a0f',
  surface: '#16161f',
  surfaceLight: '#1e1e2a',
  primary: '#00e676',
  primaryDark: '#00c853',
  error: '#ff5252',
  warning: '#ffab00',
  text: '#ffffff',
  textSecondary: '#9e9e9e',
  border: '#333344',
  success: '#00e676',
};

// Tier options
const TIER_OPTIONS = [
  { value: 'prime', label: 'Prime Contractor', color: '#00e676' },
  { value: 'sub', label: 'Subcontractor', color: '#64b5f6' },
  { value: 'sub_of_sub', label: 'Sub of Sub', color: '#ffab00' },
];

// Work category options
const WORK_CATEGORIES = [
  { value: 'electrical', label: 'Electrical' },
  { value: 'civil', label: 'Civil' },
  { value: 'traffic_control', label: 'Traffic Control' },
  { value: 'vegetation', label: 'Vegetation' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'other', label: 'Other' },
];

/**
 * Photo Thumbnail with GPS indicator
 */
const PhotoThumbnail = ({ photo, onRemove }) => {
  const hasGPS = photo.gpsCoordinates?.latitude;
  
  return (
    <Box sx={{ position: 'relative', width: 80, height: 80 }}>
      <img 
        src={photo.dataUrl} 
        alt="Captured"
        style={{ 
          width: '100%', 
          height: '100%', 
          objectFit: 'cover', 
          borderRadius: 8,
          border: `2px solid ${hasGPS ? COLORS.success : COLORS.warning}`,
        }}
      />
      {/* GPS indicator */}
      <Box sx={{ 
        position: 'absolute', 
        bottom: -4, 
        right: -4,
        bgcolor: hasGPS ? COLORS.success : COLORS.warning,
        borderRadius: '50%',
        width: 20,
        height: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <GPSIcon sx={{ fontSize: 12, color: COLORS.bg }} />
      </Box>
      {/* Remove button */}
      <IconButton
        size="small"
        onClick={() => onRemove(photo)}
        sx={{ 
          position: 'absolute', 
          top: -8, 
          right: -8,
          bgcolor: COLORS.error,
          width: 24,
          height: 24,
          '&:hover': { bgcolor: COLORS.error },
        }}
      >
        <CloseIcon sx={{ fontSize: 14, color: COLORS.text }} />
      </IconButton>
    </Box>
  );
};

PhotoThumbnail.propTypes = {
  photo: PropTypes.object.isRequired,
  onRemove: PropTypes.func.isRequired,
};

/**
 * Quantity Stepper - Large touch targets
 */
const QuantityStepper = ({ value, onChange, unit, min = 0, max = 9999 }) => {
  const handleIncrement = () => onChange(Math.min(max, value + 1));
  const handleDecrement = () => onChange(Math.max(min, value - 1));
  
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <IconButton
        onClick={handleDecrement}
        disabled={value <= min}
        sx={{ 
          bgcolor: COLORS.surface,
          border: `2px solid ${COLORS.border}`,
          width: 56,
          height: 56,
          '&:disabled': { opacity: 0.3 },
        }}
        aria-label="Decrease quantity"
      >
        <RemoveIcon sx={{ color: COLORS.text, fontSize: 28 }} />
      </IconButton>
      
      <Box sx={{ 
        minWidth: 100, 
        textAlign: 'center',
        bgcolor: COLORS.surfaceLight,
        borderRadius: 2,
        py: 1,
      }}>
        <Typography sx={{ color: COLORS.text, fontSize: '2rem', fontWeight: 700, lineHeight: 1 }}>
          {value}
        </Typography>
        <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.75rem', textTransform: 'uppercase' }}>
          {unit}
        </Typography>
      </Box>
      
      <IconButton
        onClick={handleIncrement}
        disabled={value >= max}
        sx={{ 
          bgcolor: COLORS.primary,
          width: 56,
          height: 56,
          '&:hover': { bgcolor: COLORS.primaryDark },
          '&:disabled': { opacity: 0.3 },
        }}
        aria-label="Increase quantity"
      >
        <AddIcon sx={{ color: COLORS.bg, fontSize: 28 }} />
      </IconButton>
    </Box>
  );
};

QuantityStepper.propTypes = {
  value: PropTypes.number.isRequired,
  onChange: PropTypes.func.isRequired,
  unit: PropTypes.string,
  min: PropTypes.number,
  max: PropTypes.number,
};

/**
 * Photo Waiver Dialog
 */
const PhotoWaiverDialog = ({ open, onClose, onConfirm }) => {
  const [reason, setReason] = useState('');
  
  const handleConfirm = () => {
    if (reason.trim().length >= 10) {
      onConfirm(reason.trim());
      setReason('');
    }
  };
  
  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      PaperProps={{ sx: { bgcolor: COLORS.surface, color: COLORS.text } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <WarningIcon sx={{ color: COLORS.warning }} />
        Photo Waiver Required
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ color: COLORS.textSecondary, mb: 2 }}>
          A photo is required for unit verification. To proceed without a photo, 
          you must provide a reason that will be reviewed by your supervisor.
        </Typography>
        <TextField
          fullWidth
          multiline
          rows={3}
          placeholder="Explain why photo cannot be captured (min 10 characters)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          sx={{
            '& .MuiOutlinedInput-root': {
              color: COLORS.text,
              '& fieldset': { borderColor: COLORS.border },
              '&:hover fieldset': { borderColor: COLORS.textSecondary },
              '&.Mui-focused fieldset': { borderColor: COLORS.warning },
            },
          }}
        />
        <Typography sx={{ 
          color: reason.length >= 10 ? COLORS.success : COLORS.textSecondary, 
          fontSize: '0.75rem', 
          mt: 1 
        }}>
          {reason.length}/10 characters minimum
        </Typography>
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button 
          onClick={onClose}
          sx={{ color: COLORS.textSecondary, minHeight: 48 }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={reason.trim().length < 10}
          variant="contained"
          sx={{ 
            bgcolor: COLORS.warning, 
            color: COLORS.bg,
            minHeight: 48,
            '&:disabled': { bgcolor: COLORS.border },
          }}
        >
          Submit Without Photo
        </Button>
      </DialogActions>
    </Dialog>
  );
};

PhotoWaiverDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
};

/**
 * Main Unit Entry Form Component
 */
const UnitEntryForm = ({ 
  jobId,
  priceBookId,
  selectedItem,
  onSuccess,
  onCancel,
}) => {
  // Form state
  const [quantity, setQuantity] = useState(1);
  const [photos, setPhotos] = useState([]);
  const [notes, setNotes] = useState('');
  const [tier, setTier] = useState('prime');
  const [workCategory, setWorkCategory] = useState(selectedItem?.category || 'electrical');
  const [subContractorName, setSubContractorName] = useState('');
  const [photoWaived, setPhotoWaived] = useState(false);
  const [photoWaivedReason, setPhotoWaivedReason] = useState('');
  
  // UI state
  const [cameraOpen, setCameraOpen] = useState(false);
  const [waiverDialogOpen, setWaiverDialogOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  
  // Hooks
  const { isOnline } = useOffline();
  const {
    position: gpsPosition,
    loading: gpsLoading,
    error: gpsError,
    getCurrentPosition,
    isValid: gpsValid,
  } = useGeolocation({ enableHighAccuracy: true });

  // Get GPS on mount
  useEffect(() => {
    getCurrentPosition();
  }, [getCurrentPosition]);

  // Handle photo capture
  const handlePhotoCapture = useCallback((photoData) => {
    setPhotos(prev => [...prev, photoData]);
    setPhotoWaived(false);
    setPhotoWaivedReason('');
  }, []);

  // Remove photo
  const handleRemovePhoto = useCallback((photoToRemove) => {
    setPhotos(prev => prev.filter(p => p !== photoToRemove));
  }, []);

  // Handle waiver confirmation
  const handleWaiverConfirm = useCallback((reason) => {
    setPhotoWaived(true);
    setPhotoWaivedReason(reason);
    setWaiverDialogOpen(false);
  }, []);

  // Calculate total
  const unitPrice = selectedItem?.unitPrice || 0;
  const totalAmount = quantity * unitPrice;

  // Validation
  const hasPhoto = photos.length > 0;
  const hasValidGPS = gpsPosition && gpsValid;
  const canSubmit = quantity > 0 && (hasPhoto || photoWaived) && hasValidGPS;

  // Submit unit entry
  const handleSubmit = async () => {
    if (!canSubmit) return;
    
    setSubmitting(true);
    setError(null);

    try {
      // Build payload matching backend schema
      const unitPayload = {
        jobId,
        priceBookId,
        priceBookItemId: selectedItem?._id,
        itemCode: selectedItem?.itemCode,
        quantity,
        workDate: new Date().toISOString(),
        location: {
          latitude: gpsPosition.latitude,
          longitude: gpsPosition.longitude,
          accuracy: gpsPosition.accuracy,
          altitude: gpsPosition.altitude,
          capturedAt: gpsPosition.capturedAt.toISOString(),
        },
        performedBy: {
          tier,
          workCategory,
          subContractorName: tier === 'prime' ? undefined : subContractorName,
          crewSize: 1, // Could add crew size input
        },
        photos: photos.map(p => ({
          url: p.dataUrl, // Will be uploaded separately
          fileName: p.fileName,
          photoType: p.photoType || 'after',
          capturedAt: p.capturedAt,
          gpsCoordinates: p.gpsCoordinates,
        })),
        photoWaived,
        photoWaivedReason: photoWaived ? photoWaivedReason : undefined,
        notes: notes.trim() || undefined,
      };

      if (isOnline) {
        // Direct API call
        const response = await api.post('/api/billing/units', unitPayload);
        setSuccess(true);
        
        setTimeout(() => {
          onSuccess?.(response.data);
        }, 1000);
      } else {
        // Save to offline queue
        const offlineEntry = await offlineStorage.savePendingUnit(unitPayload);
        setSuccess(true);
        
        setTimeout(() => {
          onSuccess?.({ ...unitPayload, offlineId: offlineEntry.offlineId, _offline: true });
        }, 1000);
      }
    } catch (err) {
      console.error('Submit error:', err);
      setError(err.response?.data?.error || err.message || 'Failed to save unit entry');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ 
      bgcolor: COLORS.bg, 
      minHeight: '100vh',
      pb: 12, // Space for fixed submit button
    }}>
      {/* Header */}
      <Box sx={{ 
        bgcolor: COLORS.surface, 
        px: 2, 
        py: 2,
        borderBottom: `1px solid ${COLORS.border}`,
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography sx={{ color: COLORS.text, fontWeight: 700, fontSize: '1.25rem' }}>
              Log Unit
            </Typography>
            <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.875rem' }}>
              {selectedItem?.itemCode} - {selectedItem?.description?.slice(0, 30)}...
            </Typography>
          </Box>
          <Chip
            icon={isOnline ? <OnlineIcon /> : <OfflineIcon />}
            label={isOnline ? 'Online' : 'Offline'}
            size="small"
            sx={{
              bgcolor: isOnline ? `${COLORS.success}20` : `${COLORS.warning}20`,
              color: isOnline ? COLORS.success : COLORS.warning,
              fontWeight: 600,
            }}
          />
        </Box>
      </Box>

      {/* Main Form */}
      <Box sx={{ p: 2 }}>
        {/* Quantity Section */}
        <Card sx={{ bgcolor: COLORS.surface, mb: 2, border: `1px solid ${COLORS.border}` }}>
          <CardContent>
            <Typography sx={{ color: COLORS.textSecondary, mb: 2, fontWeight: 600 }}>
              QUANTITY
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <QuantityStepper
                value={quantity}
                onChange={setQuantity}
                unit={selectedItem?.unit || 'EA'}
              />
            </Box>
            {/* Price display */}
            <Box sx={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              mt: 3, 
              pt: 2, 
              borderTop: `1px solid ${COLORS.border}` 
            }}>
              <Typography sx={{ color: COLORS.textSecondary }}>
                Rate: ${unitPrice.toFixed(2)} / {selectedItem?.unit || 'EA'}
              </Typography>
              <Typography sx={{ color: COLORS.primary, fontWeight: 700, fontSize: '1.25rem' }}>
                ${totalAmount.toFixed(2)}
              </Typography>
            </Box>
          </CardContent>
        </Card>

        {/* Photo Section */}
        <Card sx={{ bgcolor: COLORS.surface, mb: 2, border: `1px solid ${COLORS.border}` }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography sx={{ color: COLORS.textSecondary, fontWeight: 600 }}>
                PHOTO VERIFICATION
              </Typography>
              {!hasPhoto && !photoWaived && (
                <Chip 
                  label="Required" 
                  size="small" 
                  sx={{ bgcolor: COLORS.error, color: COLORS.text, fontWeight: 600 }}
                />
              )}
              {photoWaived && (
                <Chip 
                  label="Waived" 
                  size="small" 
                  sx={{ bgcolor: COLORS.warning, color: COLORS.bg, fontWeight: 600 }}
                />
              )}
            </Box>

            {/* Photo thumbnails */}
            {photos.length > 0 && (
              <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                {photos.map((photo) => (
                  <PhotoThumbnail 
                    key={photo.capturedAt || photo.dataUrl?.slice(-20)} 
                    photo={photo} 
                    onRemove={handleRemovePhoto}
                  />
                ))}
              </Box>
            )}

            {/* Waiver reason display */}
            {photoWaived && (
              <Alert 
                severity="warning" 
                sx={{ 
                  mb: 2,
                  bgcolor: `${COLORS.warning}15`,
                  color: COLORS.warning,
                  '& .MuiAlert-icon': { color: COLORS.warning },
                }}
              >
                <strong>Photo waived:</strong> {photoWaivedReason}
              </Alert>
            )}

            {/* Photo actions */}
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="contained"
                startIcon={<CameraIcon />}
                onClick={() => setCameraOpen(true)}
                sx={{ 
                  bgcolor: COLORS.primary, 
                  color: COLORS.bg,
                  flex: 1,
                  minHeight: 56,
                  fontWeight: 700,
                  fontSize: '1rem',
                }}
              >
                {photos.length > 0 ? 'Add Photo' : 'Take Photo'}
              </Button>
              
              {!hasPhoto && !photoWaived && (
                <Button
                  variant="outlined"
                  onClick={() => setWaiverDialogOpen(true)}
                  sx={{ 
                    borderColor: COLORS.warning,
                    color: COLORS.warning,
                    minHeight: 56,
                  }}
                >
                  Waive
                </Button>
              )}
            </Box>
          </CardContent>
        </Card>

        {/* GPS Status */}
        <Card sx={{ bgcolor: COLORS.surface, mb: 2, border: `1px solid ${COLORS.border}` }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <GPSIcon sx={{ color: hasValidGPS ? COLORS.success : COLORS.warning }} />
                <Typography sx={{ color: COLORS.textSecondary, fontWeight: 600 }}>
                  GPS LOCATION
                </Typography>
              </Box>
              {gpsLoading && <CircularProgress size={20} sx={{ color: COLORS.primary }} />}
            </Box>
            
            {/* GPS Position Display */}
            {gpsPosition && (
              <Box sx={{ mt: 1 }}>
                <Typography sx={{ color: COLORS.text, fontSize: '0.875rem' }}>
                  {gpsPosition.latitude.toFixed(6)}, {gpsPosition.longitude.toFixed(6)}
                </Typography>
                <Typography sx={{ 
                  color: hasValidGPS ? COLORS.success : COLORS.warning, 
                  fontSize: '0.75rem' 
                }}>
                  Accuracy: {Math.round(gpsPosition.accuracy)}m 
                  {hasValidGPS ? ' ✓' : ` (need < ${GPS_THRESHOLDS.ACCEPTABLE}m)`}
                </Typography>
              </Box>
            )}
            {/* GPS Error */}
            {!gpsPosition && gpsError && (
              <Typography sx={{ color: COLORS.error, fontSize: '0.875rem', mt: 1 }}>
                {gpsError.message}
              </Typography>
            )}
            {/* GPS Loading */}
            {!gpsPosition && !gpsError && (
              <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.875rem', mt: 1 }}>
                Acquiring GPS signal...
              </Typography>
            )}
          </CardContent>
        </Card>

        {/* Contractor Tier */}
        <Card sx={{ bgcolor: COLORS.surface, mb: 2, border: `1px solid ${COLORS.border}` }}>
          <CardContent>
            <Typography sx={{ color: COLORS.textSecondary, fontWeight: 600, mb: 2 }}>
              PERFORMED BY
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {TIER_OPTIONS.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  onClick={() => setTier(option.value)}
                  sx={{
                    bgcolor: tier === option.value ? option.color : COLORS.surfaceLight,
                    color: tier === option.value ? COLORS.bg : COLORS.text,
                    fontWeight: tier === option.value ? 700 : 400,
                    minHeight: 44,
                    fontSize: '0.9rem',
                    '&:hover': { bgcolor: tier === option.value ? option.color : COLORS.border },
                  }}
                />
              ))}
            </Box>
            
            {/* Sub name field */}
            <Collapse in={tier !== 'prime'}>
              <TextField
                fullWidth
                label="Subcontractor Name"
                value={subContractorName}
                onChange={(e) => setSubContractorName(e.target.value)}
                sx={{ 
                  mt: 2,
                  '& .MuiOutlinedInput-root': {
                    color: COLORS.text,
                    '& fieldset': { borderColor: COLORS.border },
                  },
                  '& .MuiInputLabel-root': { color: COLORS.textSecondary },
                }}
              />
            </Collapse>
          </CardContent>
        </Card>

        {/* Advanced Options */}
        <Card sx={{ bgcolor: COLORS.surface, mb: 2, border: `1px solid ${COLORS.border}` }}>
          <CardContent>
            <Box 
              onClick={() => setShowAdvanced(!showAdvanced)}
              sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                cursor: 'pointer',
              }}
            >
              <Typography sx={{ color: COLORS.textSecondary, fontWeight: 600 }}>
                ADDITIONAL DETAILS
              </Typography>
              {showAdvanced ? <CollapseIcon sx={{ color: COLORS.textSecondary }} /> : <ExpandIcon sx={{ color: COLORS.textSecondary }} />}
            </Box>
            
            <Collapse in={showAdvanced}>
              <Box sx={{ mt: 2 }}>
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel sx={{ color: COLORS.textSecondary }}>Work Category</InputLabel>
                  <Select
                    value={workCategory}
                    onChange={(e) => setWorkCategory(e.target.value)}
                    label="Work Category"
                    sx={{
                      color: COLORS.text,
                      '& .MuiOutlinedInput-notchedOutline': { borderColor: COLORS.border },
                    }}
                  >
                    {WORK_CATEGORIES.map((cat) => (
                      <MenuItem key={cat.value} value={cat.value}>{cat.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label="Notes (optional)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional details about this work..."
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      color: COLORS.text,
                      '& fieldset': { borderColor: COLORS.border },
                    },
                    '& .MuiInputLabel-root': { color: COLORS.textSecondary },
                  }}
                />
              </Box>
            </Collapse>
          </CardContent>
        </Card>

        {/* Error display */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Success display */}
        <Fade in={success}>
          <Alert 
            severity="success" 
            sx={{ 
              mb: 2,
              bgcolor: `${COLORS.success}20`,
              color: COLORS.success,
            }}
          >
            Unit entry saved successfully!
          </Alert>
        </Fade>
      </Box>

      {/* Fixed Submit Button */}
      <Box sx={{ 
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        p: 2,
        bgcolor: COLORS.surface,
        borderTop: `1px solid ${COLORS.border}`,
        display: 'flex',
        gap: 2,
      }}>
        <Button
          variant="outlined"
          onClick={onCancel}
          sx={{ 
            flex: 1,
            minHeight: 56,
            color: COLORS.textSecondary,
            borderColor: COLORS.border,
          }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          startIcon={submitting ? <CircularProgress size={20} /> : <CheckIcon />}
          sx={{ 
            flex: 2,
            minHeight: 56,
            bgcolor: canSubmit ? COLORS.primary : COLORS.border,
            color: COLORS.bg,
            fontWeight: 700,
            fontSize: '1.1rem',
            '&:disabled': {
              bgcolor: COLORS.border,
              color: COLORS.textSecondary,
            },
          }}
        >
          {getSubmitButtonText(submitting, isOnline)}
        </Button>
      </Box>

      {/* Camera Dialog */}
      <GPSPhotoCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={handlePhotoCapture}
        photoType="after"
        requireGPS={true}
        maxAccuracy={GPS_THRESHOLDS.ACCEPTABLE}
      />

      {/* Waiver Dialog */}
      <PhotoWaiverDialog
        open={waiverDialogOpen}
        onClose={() => setWaiverDialogOpen(false)}
        onConfirm={handleWaiverConfirm}
      />
    </Box>
  );
};

UnitEntryForm.propTypes = {
  jobId: PropTypes.string.isRequired,
  priceBookId: PropTypes.string,
  selectedItem: PropTypes.shape({
    _id: PropTypes.string,
    itemCode: PropTypes.string,
    description: PropTypes.string,
    category: PropTypes.string,
    unit: PropTypes.string,
    unitPrice: PropTypes.number,
  }),
  onSuccess: PropTypes.func,
  onCancel: PropTypes.func,
};

export default UnitEntryForm;

