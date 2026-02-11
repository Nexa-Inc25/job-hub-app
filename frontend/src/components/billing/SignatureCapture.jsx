/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Signature Capture Component
 * 
 * Touch-friendly signature pad for capturing inspector signatures
 * on field tickets. Designed for mobile use with gloved hands.
 * 
 * Features:
 * - Canvas-based signature drawing
 * - Touch and mouse support
 * - Clear and undo functionality
 * - Exports as base64 PNG
 * - Optional GPS capture at time of signature
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Typography,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Alert,
  CircularProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import UndoIcon from '@mui/icons-material/Undo';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckIcon from '@mui/icons-material/Check';
import GPSIcon from '@mui/icons-material/MyLocation';
import { useGeolocation } from '../../hooks/useGeolocation';
import { useAppColors } from '../shared/themeUtils';

const SignatureCapture = ({
  open,
  onClose,
  onComplete,
  title = 'Inspector Signature',
  requireName = true,
  requireCompany = false,
  showGPS = true,
}) => {
  const COLORS = useAppColors();
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [paths, setPaths] = useState([]);
  const [currentPath, setCurrentPath] = useState([]);
  const [signerName, setSignerName] = useState('');
  const [signerTitle, setSignerTitle] = useState('');
  const [signerCompany, setSignerCompany] = useState('');
  const [signerEmployeeId, setSignerEmployeeId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const { position, error: gpsError, getCurrentPosition } = useGeolocation();

  // Canvas setup
  useEffect(() => {
    if (!open || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    
    // Set canvas size to match container
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = 200;

    // Configure drawing context
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = COLORS.primary;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Fill with dark background
    ctx.fillStyle = COLORS.surface;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw signature line
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, canvas.height - 40);
    ctx.lineTo(canvas.width - 20, canvas.height - 40);
    ctx.stroke();

    // Reset stroke style for signature
    ctx.strokeStyle = COLORS.primary;
    ctx.lineWidth = 3;
  }, [open, COLORS.border, COLORS.primary, COLORS.surface]);

  // Redraw all paths when they change
  useEffect(() => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Clear and redraw background
    ctx.fillStyle = COLORS.surface;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw signature line
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, canvas.height - 40);
    ctx.lineTo(canvas.width - 20, canvas.height - 40);
    ctx.stroke();

    // Draw all paths
    ctx.strokeStyle = COLORS.primary;
    ctx.lineWidth = 3;
    
    paths.forEach(path => {
      if (path.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x, path[i].y);
      }
      ctx.stroke();
    });

    // Draw current path
    if (currentPath.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(currentPath[0].x, currentPath[0].y);
      for (let i = 1; i < currentPath.length; i++) {
        ctx.lineTo(currentPath[i].x, currentPath[i].y);
      }
      ctx.stroke();
    }

    setHasSignature(paths.length > 0 || currentPath.length > 0);
  }, [paths, currentPath, COLORS.border, COLORS.primary, COLORS.surface]);

  // Get coordinates from event
  const getCoordinates = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    if (e.touches) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }, []);

  // Start drawing
  const handleStart = useCallback((e) => {
    e.preventDefault();
    setIsDrawing(true);
    const coords = getCoordinates(e);
    setCurrentPath([coords]);
  }, [getCoordinates]);

  // Continue drawing
  const handleMove = useCallback((e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const coords = getCoordinates(e);
    setCurrentPath(prev => [...prev, coords]);
  }, [isDrawing, getCoordinates]);

  // End drawing
  const handleEnd = useCallback((e) => {
    if (!isDrawing) return;
    e.preventDefault();
    setIsDrawing(false);
    if (currentPath.length > 1) {
      setPaths(prev => [...prev, currentPath]);
    }
    setCurrentPath([]);
  }, [isDrawing, currentPath]);

  // Clear signature
  const handleClear = () => {
    setPaths([]);
    setCurrentPath([]);
    setHasSignature(false);
  };

  // Undo last stroke
  const handleUndo = () => {
    setPaths(prev => prev.slice(0, -1));
  };

  // Submit signature
  const handleSubmit = async () => {
    if (!hasSignature) {
      setError('Please sign in the box above');
      return;
    }

    if (requireName && !signerName.trim()) {
      setError('Please enter your name');
      return;
    }

    if (requireCompany && !signerCompany.trim()) {
      setError('Please enter your company');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Get current GPS if available
      let signatureLocation = null;
      if (showGPS && position) {
        signatureLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: new Date().toISOString()
        };
      }

      // Export canvas as base64 PNG
      const canvas = canvasRef.current;
      const signatureData = canvas.toDataURL('image/png');

      const result = {
        signatureData,
        signedAt: new Date().toISOString(),
        signerName: signerName.trim(),
        signerTitle: signerTitle.trim() || undefined,
        signerCompany: signerCompany.trim() || undefined,
        signerEmployeeId: signerEmployeeId.trim() || undefined,
        signatureLocation
      };

      await onComplete(result);
      
      // Reset form
      handleClear();
      setSignerName('');
      setSignerTitle('');
      setSignerCompany('');
      setSignerEmployeeId('');
      
    } catch (err) {
      setError(err.message || 'Failed to save signature');
    } finally {
      setSubmitting(false);
    }
  };

  // Get fresh GPS reading
  const handleRefreshGPS = () => {
    getCurrentPosition();
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: COLORS.bg,
          backgroundImage: 'none',
        }
      }}
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        bgcolor: COLORS.surface,
        color: COLORS.text,
        borderBottom: `1px solid ${COLORS.border}`
      }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        <IconButton onClick={onClose} sx={{ color: COLORS.textSecondary }} aria-label="Close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ bgcolor: COLORS.bg, pt: 3 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Signature Canvas */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" sx={{ color: COLORS.textSecondary, mb: 1 }}>
            Sign below with your finger or stylus
          </Typography>
          <Box 
            ref={containerRef}
            sx={{ 
              border: `2px solid ${COLORS.border}`,
              borderRadius: 2,
              overflow: 'hidden',
              touchAction: 'none',
              cursor: 'crosshair',
            }}
          >
            <canvas
              ref={canvasRef}
              onMouseDown={handleStart}
              onMouseMove={handleMove}
              onMouseUp={handleEnd}
              onMouseLeave={handleEnd}
              onTouchStart={handleStart}
              onTouchMove={handleMove}
              onTouchEnd={handleEnd}
              style={{ display: 'block', width: '100%', height: 200 }}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
            <Button
              size="small"
              startIcon={<UndoIcon />}
              onClick={handleUndo}
              disabled={paths.length === 0}
              sx={{ color: COLORS.textSecondary }}
            >
              Undo
            </Button>
            <Button
              size="small"
              startIcon={<DeleteIcon />}
              onClick={handleClear}
              disabled={!hasSignature}
              sx={{ color: COLORS.error }}
            >
              Clear
            </Button>
          </Box>
        </Box>

        {/* Signer Information */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="Full Name"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            required={requireName}
            fullWidth
            placeholder="Inspector Name"
            InputProps={{
              sx: { bgcolor: COLORS.surface, color: COLORS.text }
            }}
            InputLabelProps={{
              sx: { color: COLORS.textSecondary }
            }}
          />

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Title"
              value={signerTitle}
              onChange={(e) => setSignerTitle(e.target.value)}
              fullWidth
              placeholder="e.g., Field Inspector"
              InputProps={{
                sx: { bgcolor: COLORS.surface, color: COLORS.text }
              }}
              InputLabelProps={{
                sx: { color: COLORS.textSecondary }
              }}
            />
            <TextField
              label="Employee ID"
              value={signerEmployeeId}
              onChange={(e) => setSignerEmployeeId(e.target.value)}
              fullWidth
              placeholder="Badge #"
              InputProps={{
                sx: { bgcolor: COLORS.surface, color: COLORS.text }
              }}
              InputLabelProps={{
                sx: { color: COLORS.textSecondary }
              }}
            />
          </Box>

          <TextField
            label="Company / Utility"
            value={signerCompany}
            onChange={(e) => setSignerCompany(e.target.value)}
            required={requireCompany}
            fullWidth
            placeholder="e.g., PG&E"
            InputProps={{
              sx: { bgcolor: COLORS.surface, color: COLORS.text }
            }}
            InputLabelProps={{
              sx: { color: COLORS.textSecondary }
            }}
          />
        </Box>

        {/* GPS Status */}
        {showGPS && (
          <Box sx={{ 
            mt: 3, 
            p: 2, 
            bgcolor: COLORS.surface, 
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <GPSIcon sx={{ 
                color: position ? COLORS.primary : COLORS.warning,
                fontSize: 20 
              }} />
              <Typography variant="body2" sx={{ color: COLORS.text }}>
                {(() => {
                  if (position) {
                    return `GPS: ${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`;
                  }
                  return gpsError ? 'GPS unavailable' : 'Acquiring GPS...';
                })()}
              </Typography>
            </Box>
            <Button
              size="small"
              onClick={handleRefreshGPS}
              sx={{ color: COLORS.primary }}
            >
              Refresh
            </Button>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ 
        bgcolor: COLORS.surface, 
        borderTop: `1px solid ${COLORS.border}`,
        p: 2,
        gap: 2
      }}>
        <Button 
          onClick={onClose}
          sx={{ color: COLORS.textSecondary }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || !hasSignature}
          startIcon={submitting ? <CircularProgress size={20} /> : <CheckIcon />}
          sx={{
            bgcolor: COLORS.primary,
            color: COLORS.bg,
            fontWeight: 600,
            px: 4,
            '&:hover': { bgcolor: COLORS.primaryDark },
            '&:disabled': { bgcolor: COLORS.border }
          }}
        >
          {submitting ? 'Saving...' : 'Confirm Signature'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

SignatureCapture.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onComplete: PropTypes.func.isRequired,
  title: PropTypes.string,
  requireName: PropTypes.bool,
  requireCompany: PropTypes.bool,
  showGPS: PropTypes.bool,
};

export default SignatureCapture;

