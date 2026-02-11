/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * GPS Photo Capture Component
 * 
 * High-contrast, mobile-first camera component for field workers.
 * Captures photos with embedded GPS coordinates for "Digital Receipt" verification.
 * 
 * Design Constraints:
 * - Touch targets: 44px+ (glove-friendly)
 * - Contrast: AAA for sunlight visibility
 * - GPS accuracy: < 50m required, < 10m for "high quality"
 * - Offline-capable with local storage
 * 
 * @module components/billing/GPSPhotoCapture
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
  Dialog,
  DialogContent,
  Box,
  Typography,
  IconButton,
  Button,
  CircularProgress,
  Alert,
  Fade,
  LinearProgress,
} from '@mui/material';
import CameraIcon from '@mui/icons-material/CameraAlt';
import FlipIcon from '@mui/icons-material/FlipCameraIos';
import CloseIcon from '@mui/icons-material/Close';
import GPSIcon from '@mui/icons-material/MyLocation';
import GPSLockedIcon from '@mui/icons-material/GpsFixed';
import GPSOffIcon from '@mui/icons-material/GpsOff';
import CheckIcon from '@mui/icons-material/Check';
import RetryIcon from '@mui/icons-material/Refresh';
import GalleryIcon from '@mui/icons-material/PhotoLibrary';
import WarningIcon from '@mui/icons-material/Warning';
import { useGeolocation, GPS_THRESHOLDS } from '../../hooks/useGeolocation';
import { useAppColors } from '../shared/themeUtils';

// Get GPS color based on quality - fallback to hardcoded colors if theme colors unavailable
const getGPSColor = (quality, colors) => {
  const fallback = { gpsHigh: '#00e676', gpsGood: '#69f0ae', gpsAcceptable: '#ffab00', gpsPoor: '#ff5252' };
  const c = colors || fallback;
  switch (quality) {
    case 'high': return c.gpsHigh;
    case 'good': return c.gpsGood;
    case 'acceptable': return c.gpsAcceptable;
    default: return c.gpsPoor;
  }
};

/**
 * GPS Status Badge Component
 */
const GPSBadge = ({ position, loading, error, onRetry }) => {
  const COLORS = useAppColors();
  if (loading) {
    return (
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 1, 
        px: 2, 
        py: 1, 
        bgcolor: 'rgba(0,0,0,0.7)', 
        borderRadius: 2,
        backdropFilter: 'blur(8px)',
      }}>
        <CircularProgress size={20} sx={{ color: COLORS.primary }} />
        <Typography sx={{ color: COLORS.text, fontWeight: 600, fontSize: '0.875rem' }}>
          Acquiring GPS...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box 
        onClick={onRetry}
        sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1, 
          px: 2, 
          py: 1, 
          bgcolor: 'rgba(255,82,82,0.9)', 
          borderRadius: 2,
          cursor: 'pointer',
          '&:active': { transform: 'scale(0.98)' }
        }}
      >
        <GPSOffIcon sx={{ color: COLORS.text }} />
        <Typography sx={{ color: COLORS.text, fontWeight: 600, fontSize: '0.875rem' }}>
          GPS Failed - Tap to Retry
        </Typography>
      </Box>
    );
  }

  if (!position) {
    return (
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 1, 
        px: 2, 
        py: 1, 
        bgcolor: 'rgba(0,0,0,0.7)', 
        borderRadius: 2,
      }}>
        <GPSIcon sx={{ color: COLORS.textSecondary }} />
        <Typography sx={{ color: COLORS.textSecondary, fontWeight: 600, fontSize: '0.875rem' }}>
          GPS Not Started
        </Typography>
      </Box>
    );
  }

  const quality = position.quality;
  const color = getGPSColor(quality, COLORS);
  const accuracy = Math.round(position.accuracy);

  return (
    <Box sx={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: 1, 
      px: 2, 
      py: 1, 
      bgcolor: 'rgba(0,0,0,0.7)', 
      borderRadius: 2,
      backdropFilter: 'blur(8px)',
      border: `2px solid ${color}`,
    }}>
      <GPSLockedIcon sx={{ color }} />
      <Box>
        <Typography sx={{ color, fontWeight: 700, fontSize: '0.875rem', lineHeight: 1 }}>
          {accuracy}m accuracy
        </Typography>
        <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.7rem', textTransform: 'uppercase' }}>
          {quality} quality
        </Typography>
      </Box>
      {quality === 'high' && (
        <CheckIcon sx={{ color: COLORS.gpsHigh, ml: 0.5 }} />
      )}
    </Box>
  );
};

GPSBadge.propTypes = {
  position: PropTypes.object,
  loading: PropTypes.bool,
  error: PropTypes.object,
  onRetry: PropTypes.func,
};

/**
 * Main GPS Photo Capture Component
 */
const GPSPhotoCapture = ({ 
  open, 
  onClose, 
  onCapture,
  photoType = 'after',
  requireGPS = true,
  maxAccuracy = GPS_THRESHOLDS.ACCEPTABLE,
}) => {
  const COLORS = useAppColors();
  // Camera state
  const [stream, setStream] = useState(null);
  const [facingMode, setFacingMode] = useState('environment');
  const [capturedImage, setCapturedImage] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  
  // Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  // GPS hook
  const {
    position,
    error: gpsError,
    loading: gpsLoading,
    getCurrentPosition,
    isValid: gpsValid,
    quality: gpsQuality,
  } = useGeolocation({
    enableHighAccuracy: true,
    timeout: 30000,
    minAccuracy: maxAccuracy,
  });

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      
      // Stop existing stream
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false
      });

      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.error('Camera error:', err);
      if (err.name === 'NotAllowedError') {
        setCameraError('Camera permission denied. Please allow camera access.');
      } else if (err.name === 'NotFoundError') {
        setCameraError('No camera found on this device.');
      } else {
        setCameraError(`Camera error: ${err.message}`);
      }
    }
  }, [facingMode, stream]);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  }, [stream]);

  // Capture photo
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    
    setCapturing(true);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    // Convert to blob for better handling
    canvas.toBlob((blob) => {
      const reader = new FileReader();
      reader.onload = () => {
        setCapturedImage({
          dataUrl: reader.result,
          blob,
          width: canvas.width,
          height: canvas.height,
          capturedAt: new Date(),
        });
        setCapturing(false);
        stopCamera();
      };
      reader.readAsDataURL(blob);
    }, 'image/jpeg', 0.85);
  }, [stopCamera]);

  // Handle gallery selection
  const handleGallerySelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setCameraError('Please select an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      // Create image to get dimensions
      const img = new Image();
      img.onload = () => {
        setCapturedImage({
          dataUrl: e.target.result,
          blob: file,
          width: img.width,
          height: img.height,
          capturedAt: new Date(),
          fromGallery: true,
        });
        stopCamera();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Switch camera
  const switchCamera = () => {
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  };

  // Retake photo
  const handleRetake = () => {
    setCapturedImage(null);
    startCamera();
  };

  // Confirm and save
  const handleConfirm = () => {
    if (!capturedImage) return;
    
    // Build photo data with GPS
    const photoData = {
      dataUrl: capturedImage.dataUrl,
      blob: capturedImage.blob,
      fileName: `unit_${photoType}_${Date.now()}.jpg`,
      mimeType: 'image/jpeg',
      photoType,
      capturedAt: capturedImage.capturedAt.toISOString(),
      fromGallery: capturedImage.fromGallery || false,
      dimensions: {
        width: capturedImage.width,
        height: capturedImage.height,
      },
      gpsCoordinates: position ? {
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
        altitude: position.altitude,
        capturedAt: position.capturedAt.toISOString(),
      } : null,
      gpsQuality: gpsQuality,
      gpsValid: gpsValid,
    };

    onCapture(photoData);
    handleClose();
  };

  // Close and cleanup
  const handleClose = () => {
    stopCamera();
    setCapturedImage(null);
    setCameraError(null);
    onClose();
  };

  // Start camera and GPS when dialog opens
  useEffect(() => {
    if (open) {
      startCamera();
      getCurrentPosition();
    } else {
      stopCamera();
    }
    
    return () => stopCamera();
  // Camera lifecycle tied to dialog open state; startCamera/stopCamera are stable refs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Restart camera when facing mode changes
  useEffect(() => {
    if (open && !capturedImage) {
      startCamera();
    }
  // Intentionally only restart camera on facingMode change when dialog is open
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  // Can confirm?
  const canConfirm = capturedImage && (!requireGPS || gpsValid || gpsError);
  const gpsWarning = requireGPS && !gpsValid && !gpsLoading;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullScreen
      PaperProps={{
        sx: {
          bgcolor: COLORS.bg,
          overflow: 'hidden',
        }
      }}
    >
      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          px: 2, 
          py: 1.5,
          bgcolor: COLORS.surface,
          borderBottom: `1px solid ${COLORS.textSecondary}30`,
        }}>
          <Typography sx={{ color: COLORS.text, fontWeight: 700, fontSize: '1.1rem' }}>
            {capturedImage ? 'Review Photo' : 'Capture Photo'}
          </Typography>
          <IconButton 
            onClick={handleClose}
            sx={{ 
              color: COLORS.text, 
              minWidth: 48, 
              minHeight: 48,
              '&:active': { bgcolor: 'rgba(255,255,255,0.1)' }
            }}
            aria-label="Close camera"
          >
            <CloseIcon />
          </IconButton>
        </Box>

        {/* GPS Status Bar */}
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          py: 1.5, 
          bgcolor: COLORS.surface,
        }}>
          <GPSBadge 
            position={position} 
            loading={gpsLoading} 
            error={gpsError}
            onRetry={getCurrentPosition}
          />
        </Box>

        {/* Camera/Preview Area */}
        <Box sx={{ 
          flex: 1, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          bgcolor: COLORS.bg,
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Camera Error State */}
          {cameraError && (
            <Box sx={{ textAlign: 'center', p: 4 }}>
              <WarningIcon sx={{ fontSize: 64, color: COLORS.error, mb: 2 }} />
              <Typography sx={{ color: COLORS.text, mb: 3 }}>{cameraError}</Typography>
              <Button
                variant="contained"
                onClick={startCamera}
                startIcon={<RetryIcon />}
                sx={{ 
                  bgcolor: COLORS.primary, 
                  color: COLORS.bg,
                  minHeight: 48,
                  fontWeight: 700,
                }}
              >
                Retry Camera
              </Button>
            </Box>
          )}
          {/* Preview captured image */}
          {!cameraError && capturedImage && (
            <Box sx={{ width: '100%', height: '100%', position: 'relative' }}>
              <img 
                src={capturedImage.dataUrl} 
                alt="Captured" 
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  objectFit: 'contain',
                }}
              />
              {/* GPS overlay on preview */}
              {position && (
                <Box sx={{ 
                  position: 'absolute', 
                  bottom: 16, 
                  left: 16, 
                  right: 16,
                  bgcolor: 'rgba(0,0,0,0.8)',
                  borderRadius: 2,
                  p: 1.5,
                }}>
                  <Typography sx={{ color: getGPSColor(gpsQuality, COLORS), fontSize: '0.75rem', fontWeight: 600 }}>
                    📍 {position.latitude.toFixed(6)}, {position.longitude.toFixed(6)}
                  </Typography>
                  <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.7rem' }}>
                    Accuracy: {Math.round(position.accuracy)}m • {gpsQuality.toUpperCase()}
                  </Typography>
                </Box>
              )}
            </Box>
          )}
          {/* Live camera feed */}
          {!cameraError && !capturedImage && (
            <>
              <video 
                ref={videoRef}
                autoPlay 
                playsInline 
                muted
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  objectFit: 'cover',
                }}
              />
              {/* Capture indicator */}
              <Fade in={capturing}>
                <Box sx={{ 
                  position: 'absolute', 
                  inset: 0, 
                  bgcolor: 'white',
                  opacity: 0.3,
                }} />
              </Fade>
              {/* Focus reticle */}
              <Box sx={{ 
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 80,
                height: 80,
                border: `2px solid ${COLORS.text}50`,
                borderRadius: 1,
                pointerEvents: 'none',
              }} />
            </>
          )}
        </Box>

        {/* GPS Warning */}
        {gpsWarning && !gpsLoading && (
          <Alert 
            severity="warning" 
            sx={{ 
              mx: 2, 
              mb: 1,
              bgcolor: `${COLORS.warning}20`,
              color: COLORS.warning,
              '& .MuiAlert-icon': { color: COLORS.warning },
            }}
          >
            GPS accuracy is {position ? `${Math.round(position.accuracy)}m` : 'unavailable'}. 
            {position?.accuracy > maxAccuracy 
              ? ' Move to an open area for better signal.' 
              : ' Photo may require supervisor approval.'}
          </Alert>
        )}

        {/* Action Buttons */}
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          gap: 2,
          px: 2, 
          py: 3,
          bgcolor: COLORS.surface,
        }}>
          {capturedImage ? (
            // Preview mode buttons
            <>
              <Button
                variant="outlined"
                onClick={handleRetake}
                startIcon={<CameraIcon />}
                sx={{ 
                  color: COLORS.text, 
                  borderColor: COLORS.textSecondary,
                  minHeight: 56,
                  minWidth: 120,
                  fontWeight: 700,
                  fontSize: '1rem',
                }}
              >
                Retake
              </Button>
              <Button
                variant="contained"
                onClick={handleConfirm}
                disabled={!canConfirm}
                startIcon={<CheckIcon />}
                sx={{ 
                  bgcolor: canConfirm ? COLORS.primary : COLORS.textSecondary, 
                  color: COLORS.bg,
                  minHeight: 56,
                  minWidth: 140,
                  fontWeight: 700,
                  fontSize: '1rem',
                  '&:disabled': {
                    bgcolor: COLORS.textSecondary,
                    color: COLORS.bg,
                  }
                }}
              >
                {gpsLoading ? 'Getting GPS...' : 'Use Photo'}
              </Button>
            </>
          ) : (
            // Capture mode buttons
            <>
              {/* Gallery button */}
              <IconButton
                onClick={() => fileInputRef.current?.click()}
                sx={{ 
                  color: COLORS.text, 
                  minWidth: 56, 
                  minHeight: 56,
                  bgcolor: COLORS.surface,
                  border: `1px solid ${COLORS.textSecondary}50`,
                }}
                aria-label="Choose from gallery"
              >
                <GalleryIcon />
              </IconButton>
              <input
                id="gps-photo-gallery-input"
                name="gps-photo-gallery-input"
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleGallerySelect}
                style={{ display: 'none' }}
                aria-label="Select photo from gallery"
              />

              {/* Main capture button */}
              <IconButton
                onClick={capturePhoto}
                disabled={!stream || capturing}
                sx={{ 
                  width: 80, 
                  height: 80,
                  bgcolor: COLORS.primary,
                  border: `4px solid ${COLORS.text}`,
                  '&:hover': { bgcolor: COLORS.primary },
                  '&:active': { transform: 'scale(0.95)' },
                  '&:disabled': { bgcolor: COLORS.textSecondary },
                }}
                aria-label="Capture photo"
              >
                <CameraIcon sx={{ fontSize: 40, color: COLORS.bg }} />
              </IconButton>

              {/* Switch camera button */}
              <IconButton
                onClick={switchCamera}
                sx={{ 
                  color: COLORS.text, 
                  minWidth: 56, 
                  minHeight: 56,
                  bgcolor: COLORS.surface,
                  border: `1px solid ${COLORS.textSecondary}50`,
                }}
                aria-label="Switch camera"
              >
                <FlipIcon />
              </IconButton>
            </>
          )}
        </Box>

        {/* GPS loading indicator */}
        {gpsLoading && (
          <LinearProgress 
            sx={{ 
              position: 'absolute', 
              bottom: 0, 
              left: 0, 
              right: 0,
              '& .MuiLinearProgress-bar': { bgcolor: COLORS.primary },
            }} 
          />
        )}
      </DialogContent>

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </Dialog>
  );
};

GPSPhotoCapture.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onCapture: PropTypes.func.isRequired,
  photoType: PropTypes.oneOf(['before', 'during', 'after', 'measurement', 'issue', 'verification', 'other']),
  requireGPS: PropTypes.bool,
  maxAccuracy: PropTypes.number,
};

export default GPSPhotoCapture;

