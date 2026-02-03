/**
 * ProofPanel Component - Digital Receipt Verification
 * 
 * Displays the forensic evidence for a unit entry:
 * - Photo evidence with metadata
 * - Static map showing GPS capture location
 * - GPS accuracy indicator
 * - Timestamp verification
 * 
 * Used in the Master-Detail DataGrid for PM review workflow.
 * 
 * @module components/billing/ProofPanel
 */

import React, { useState } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Paper,
  Typography,
  Chip,
  IconButton,
  Dialog,
  DialogContent,
  Alert,
  Skeleton,
  Tooltip,
  Divider,
  Grid,
} from '@mui/material';
import LocationIcon from '@mui/icons-material/LocationOn';
import PhotoIcon from '@mui/icons-material/PhotoCamera';
import WarningIcon from '@mui/icons-material/Warning';
import VerifiedIcon from '@mui/icons-material/CheckCircle';
import ZoomIcon from '@mui/icons-material/ZoomIn';
import TimeIcon from '@mui/icons-material/AccessTime';
import PersonIcon from '@mui/icons-material/Person';
import WorkIcon from '@mui/icons-material/Construction';
import CloseIcon from '@mui/icons-material/Close';
import NoPhotoIcon from '@mui/icons-material/BrokenImage';

// GPS accuracy thresholds
const GPS_QUALITY = {
  HIGH: { max: 10, color: '#00e676', label: 'Excellent' },
  GOOD: { max: 30, color: '#8bc34a', label: 'Good' },
  ACCEPTABLE: { max: 50, color: '#ff9800', label: 'Acceptable' },
  POOR: { max: Infinity, color: '#f44336', label: 'Poor' },
};

/**
 * Get GPS quality based on accuracy
 */
function getGPSQuality(accuracy) {
  if (!accuracy) return null;
  if (accuracy <= GPS_QUALITY.HIGH.max) return GPS_QUALITY.HIGH;
  if (accuracy <= GPS_QUALITY.GOOD.max) return GPS_QUALITY.GOOD;
  if (accuracy <= GPS_QUALITY.ACCEPTABLE.max) return GPS_QUALITY.ACCEPTABLE;
  return GPS_QUALITY.POOR;
}

/**
 * Generate Google Maps Static API URL
 */
function getStaticMapUrl(lat, lng, options = {}) {
  const {
    zoom = 18,
    width = 300,
    height = 150,
    mapType = 'satellite',
  } = options;

  // Use environment variable for API key
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  
  if (!apiKey) {
    // Return placeholder if no API key
    return null;
  }

  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: zoom.toString(),
    size: `${width}x${height}`,
    maptype: mapType,
    markers: `color:red|${lat},${lng}`,
    key: apiKey,
    scale: '2', // Retina
  });

  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp) {
  if (!timestamp) return 'Unknown';
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Get tier chip color - extracted to avoid nested ternary
 */
function getTierChipColor(tier) {
  if (tier === 'sub_of_sub') return 'secondary';
  if (tier === 'sub') return 'info';
  return 'default';
}

/**
 * Get photo verification status chip - extracted to reduce complexity
 */
function getPhotoStatusChip(isPhotoVerified) {
  if (isPhotoVerified) {
    return (
      <Chip 
        icon={<VerifiedIcon />} 
        label="Verified" 
        size="small" 
        color="success" 
        variant="outlined"
      />
    );
  }
  return (
    <Chip 
      icon={<WarningIcon />} 
      label="Missing" 
      size="small" 
      color="error" 
      variant="outlined"
    />
  );
}

/**
 * Get GPS verification status chip - extracted to reduce complexity
 */
function getGPSStatusChip(isGPSVerified, hasLocation, location, gpsQuality) {
  if (isGPSVerified) {
    return (
      <Chip 
        icon={<VerifiedIcon />} 
        label={`${location.accuracy?.toFixed(0)}m`}
        size="small" 
        sx={{ 
          bgcolor: gpsQuality?.color,
          color: 'white',
        }}
      />
    );
  }
  if (hasLocation) {
    return (
      <Chip 
        icon={<WarningIcon />} 
        label={`${location.accuracy?.toFixed(0)}m - Poor`}
        size="small" 
        color="error"
      />
    );
  }
  return (
    <Chip 
      icon={<WarningIcon />} 
      label="Missing" 
      size="small" 
      color="error" 
      variant="outlined"
    />
  );
}

/**
 * Render photo evidence section content - extracted to reduce complexity
 */
function renderPhotoContent(hasPhotos, photos, photoWaived, photoWaivedReason, photoError, setPhotoError, handlePhotoClick) {
  if (hasPhotos) {
    return (
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {photos.map((photo, index) => (
          <Box
            key={photo._id || `photo-${index}`}
            sx={{
              position: 'relative',
              width: 120,
              height: 90,
              borderRadius: 1,
              overflow: 'hidden',
              cursor: 'pointer',
              border: '2px solid',
              borderColor: 'divider',
              '&:hover': {
                borderColor: 'primary.main',
              },
            }}
            onClick={() => handlePhotoClick(photo)}
          >
            {photoError[index] ? (
              <Box
                sx={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: 'action.disabledBackground',
                }}
              >
                <NoPhotoIcon color="disabled" />
              </Box>
            ) : (
              <Box
                component="img"
                src={photo.url || photo.thumbnailUrl}
                alt={`Evidence ${index + 1}`}
                onError={() => setPhotoError(prev => ({ ...prev, [index]: true }))}
                sx={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            )}
            <Box
              sx={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                bgcolor: 'rgba(0,0,0,0.6)',
                color: 'white',
                px: 0.5,
                py: 0.25,
              }}
            >
              <Typography variant="caption">
                {photo.photoType || 'Photo'}
              </Typography>
            </Box>
            <IconButton
              size="small"
              sx={{
                position: 'absolute',
                top: 2,
                right: 2,
                bgcolor: 'rgba(0,0,0,0.5)',
                color: 'white',
                p: 0.25,
                '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
              }}
              onClick={(e) => {
                e.stopPropagation();
                handlePhotoClick(photo);
              }}
            >
              <ZoomIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
      </Box>
    );
  }
  
  if (photoWaived) {
    return (
      <Alert severity="warning" sx={{ py: 0.5 }}>
        <Typography variant="body2">
          Photo waived: {photoWaivedReason || 'No reason provided'}
        </Typography>
      </Alert>
    );
  }
  
  return (
    <Alert severity="error" sx={{ py: 0.5 }}>
      <Typography variant="body2">
        No photo evidence provided
      </Typography>
    </Alert>
  );
}

/**
 * ProofPanel Component
 */
const ProofPanel = ({ unit }) => {
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [photoError, setPhotoError] = useState({});

  const { location, photos, photoWaived, photoWaivedReason, performedBy, workDate, checksum } = unit;
  const hasLocation = location?.latitude && location?.longitude;
  const hasPhotos = photos && photos.length > 0;
  const gpsQuality = hasLocation ? getGPSQuality(location.accuracy) : null;
  const staticMapUrl = hasLocation ? getStaticMapUrl(location.latitude, location.longitude) : null;

  // Determine verification status
  const isGPSVerified = gpsQuality && location.accuracy <= 50;
  const isPhotoVerified = hasPhotos || photoWaived;
  const isFullyVerified = isGPSVerified && isPhotoVerified && checksum;

  const handlePhotoClick = (photo) => {
    setSelectedPhoto(photo);
    setPhotoDialogOpen(true);
  };

  return (
    <Paper 
      elevation={0} 
      sx={{ 
        p: 2, 
        bgcolor: 'background.paper',
        borderTop: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Grid container spacing={2}>
        {/* Left Column: Photo Evidence */}
        <Grid item xs={12} md={6}>
          <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <PhotoIcon fontSize="small" color="primary" />
            <Typography variant="subtitle2" color="text.primary">Photo Evidence</Typography>
            {getPhotoStatusChip(isPhotoVerified)}
          </Box>

          {renderPhotoContent(hasPhotos, photos, photoWaived, photoWaivedReason, photoError, setPhotoError, handlePhotoClick)}
        </Grid>

        {/* Right Column: Location & Metadata */}
        <Grid item xs={12} md={6}>
          <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <LocationIcon fontSize="small" color="primary" />
            <Typography variant="subtitle2" color="text.primary">Location Verification</Typography>
            {getGPSStatusChip(isGPSVerified, hasLocation, location, gpsQuality)}
          </Box>

          {hasLocation && (
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
              {/* Static Map */}
              <Box
                sx={{
                  width: 150,
                  height: 100,
                  borderRadius: 1,
                  overflow: 'hidden',
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'action.hover',
                  flexShrink: 0,
                }}
              >
                {/* With API key - show map */}
                {staticMapUrl && (
                  <>
                    {!mapLoaded && (
                      <Skeleton variant="rectangular" width="100%" height="100%" />
                    )}
                    <Box
                      component="img"
                      src={staticMapUrl}
                      alt="Capture location"
                      onLoad={() => setMapLoaded(true)}
                      sx={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: mapLoaded ? 'block' : 'none',
                      }}
                    />
                  </>
                )}
                {/* Without API key - show coordinates */}
                {!staticMapUrl && (
                  <Box
                    sx={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'column',
                    }}
                  >
                    <LocationIcon color="disabled" />
                    <Typography variant="caption" color="text.secondary">
                      {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                    </Typography>
                  </Box>
                )}
              </Box>

              {/* GPS Details */}
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" color="text.secondary" display="block">
                  Coordinates
                </Typography>
                <Typography variant="body2" color="text.primary" sx={{ fontFamily: 'monospace', mb: 1 }}>
                  {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                </Typography>

                {location.altitude && (
                  <>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Altitude
                    </Typography>
                    <Typography variant="body2" color="text.primary" sx={{ mb: 1 }}>
                      {location.altitude.toFixed(0)}m
                    </Typography>
                  </>
                )}

                {location.capturedAt && (
                  <>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Captured
                    </Typography>
                    <Typography variant="body2" color="text.primary">
                      {formatTimestamp(location.capturedAt)}
                    </Typography>
                  </>
                )}
              </Box>
            </Box>
          )}
          {!hasLocation && (
            <Alert severity="error" sx={{ py: 0.5 }}>
              <Typography variant="body2">
                No GPS coordinates captured
              </Typography>
            </Alert>
          )}
        </Grid>

        {/* Bottom Row: Additional Metadata */}
        <Grid item xs={12}>
          <Divider sx={{ my: 1 }} />
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Work Date */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <TimeIcon fontSize="small" color="action" />
              <Typography variant="body2" color="text.secondary">
                {formatTimestamp(workDate)}
              </Typography>
            </Box>

            {/* Performed By */}
            {performedBy && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <PersonIcon fontSize="small" color="action" />
                <Chip
                  label={performedBy.tier?.replace('_', ' ') || 'Prime'}
                  size="small"
                  variant="outlined"
                  color={getTierChipColor(performedBy.tier)}
                />
                {performedBy.subContractorName && (
                  <Typography variant="body2" color="text.secondary">
                    {performedBy.subContractorName}
                  </Typography>
                )}
              </Box>
            )}

            {/* Work Category */}
            {performedBy?.workCategory && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <WorkIcon fontSize="small" color="action" />
                <Typography variant="body2" color="text.secondary">
                  {performedBy.workCategory.replace('_', ' ')}
                </Typography>
              </Box>
            )}

            {/* Digital Receipt Hash */}
            {checksum && (
              <Tooltip title={`Full hash: ${checksum}`}>
                <Chip
                  icon={<VerifiedIcon />}
                  label={`Hash: ${checksum.slice(0, 8)}...`}
                  size="small"
                  color="success"
                  variant="outlined"
                  sx={{ fontFamily: 'monospace' }}
                />
              </Tooltip>
            )}

            {/* Verification Status */}
            <Box sx={{ ml: 'auto' }}>
              {isFullyVerified ? (
                <Chip
                  icon={<VerifiedIcon />}
                  label="Fully Verified"
                  color="success"
                />
              ) : (
                <Chip
                  icon={<WarningIcon />}
                  label="Requires Review"
                  color="warning"
                />
              )}
            </Box>
          </Box>
        </Grid>
      </Grid>

      {/* Photo Zoom Dialog */}
      <Dialog
        open={photoDialogOpen}
        onClose={() => setPhotoDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogContent sx={{ p: 0, position: 'relative', bgcolor: 'black' }}>
          <IconButton
            onClick={() => setPhotoDialogOpen(false)}
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              bgcolor: 'rgba(0,0,0,0.5)',
              color: 'white',
              zIndex: 1,
              '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
            }}
          >
            <CloseIcon />
          </IconButton>
          {selectedPhoto && (
            <Box
              component="img"
              src={selectedPhoto.url || selectedPhoto.thumbnailUrl}
              alt="Full size evidence"
              sx={{
                width: '100%',
                maxHeight: '80vh',
                objectFit: 'contain',
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </Paper>
  );
};

ProofPanel.propTypes = {
  unit: PropTypes.shape({
    _id: PropTypes.string,
    location: PropTypes.shape({
      latitude: PropTypes.number,
      longitude: PropTypes.number,
      accuracy: PropTypes.number,
      altitude: PropTypes.number,
      capturedAt: PropTypes.string,
    }),
    photos: PropTypes.arrayOf(PropTypes.shape({
      _id: PropTypes.string,
      url: PropTypes.string,
      thumbnailUrl: PropTypes.string,
      photoType: PropTypes.string,
    })),
    photoWaived: PropTypes.bool,
    photoWaivedReason: PropTypes.string,
    performedBy: PropTypes.shape({
      tier: PropTypes.string,
      subContractorName: PropTypes.string,
      workCategory: PropTypes.string,
    }),
    workDate: PropTypes.string,
    checksum: PropTypes.string,
  }).isRequired,
};

export default ProofPanel;

