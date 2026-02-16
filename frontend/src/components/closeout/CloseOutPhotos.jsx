/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * CloseOutPhotos - Photo capture and gallery for Foreman Close Out.
 *
 * Handles camera capture, gallery upload, GPS tagging, and photo preview.
 *
 * @module components/closeout/CloseOutPhotos
 */

import React, { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Typography,
  Button,
  Grid,
  Chip,
  Dialog,
  DialogContent,
  DialogActions,
  LinearProgress,
} from '@mui/material';
import CameraIcon from '@mui/icons-material/CameraAlt';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import AddAPhotoIcon from '@mui/icons-material/AddAPhoto';
import DeleteIcon from '@mui/icons-material/Delete';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import api from '../../api';
import { useAppColors } from '../shared/themeUtils';

const CloseOutPhotos = ({ jobId, photos, onPhotoAdded, onPhotoDeleted }) => {
  const COLORS = useAppColors();
  const [uploading, setUploading] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const handleFileSelect = async (e, source) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setUploading(true);
    try {
      // Get GPS once for all photos (not per-photo — saves 5s per image)
      let gpsCoords = null;
      if (navigator.geolocation) {
        try {
          const pos = await new Promise((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 })
          );
          gpsCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        } catch {
          // GPS not available, continue without
        }
      }

      // Upload photos sequentially to avoid OOM from concurrent HEIC conversions
      for (const file of files) {
        try {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('folder', 'ACI');
          formData.append('subfolder', 'GF Audit');
          formData.append('photoType', source === 'camera' ? 'field_capture' : 'uploaded');
          if (gpsCoords) {
            formData.append('latitude', gpsCoords.lat);
            formData.append('longitude', gpsCoords.lng);
          }
          const res = await api.post(`/api/jobs/${jobId}/upload`, formData);
          if (res.data?.document) onPhotoAdded(res.data.document);
        } catch (err) {
          console.error('Photo upload failed:', err);
        }
      }
    } catch (err) {
      console.error('Photo upload failed:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  return (
    <Box>
      {/* Upload buttons */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Button
          variant="contained"
          startIcon={<CameraIcon />}
          onClick={() => cameraInputRef.current?.click()}
          disabled={uploading}
          sx={{
            flex: 1,
            py: 2,
            bgcolor: COLORS.primary,
            color: COLORS.bg,
            fontWeight: 700,
            fontSize: '1rem',
            '&:hover': { bgcolor: COLORS.primaryDark },
          }}
        >
          Take Photo
        </Button>
        <Button
          variant="outlined"
          startIcon={<PhotoLibraryIcon />}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          sx={{
            flex: 1,
            py: 2,
            borderColor: COLORS.secondary,
            color: COLORS.secondary,
            fontWeight: 700,
            fontSize: '1rem',
          }}
        >
          Gallery
        </Button>
      </Box>

      {/* Hidden file inputs */}
      <input
        id="foreman-camera-input"
        name="foreman-camera-input"
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => handleFileSelect(e, 'camera')}
        aria-label="Take photo with camera"
      />
      <input
        id="foreman-gallery-input"
        name="foreman-gallery-input"
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => handleFileSelect(e, 'gallery')}
        aria-label="Select photos from gallery"
      />

      {uploading && <LinearProgress sx={{ mb: 2 }} />}

      {/* Photo grid */}
      <Typography sx={{ color: COLORS.textSecondary, fontWeight: 600, fontSize: '0.75rem', mb: 1 }}>
        JOB PHOTOS ({photos.length})
      </Typography>

      {photos.length === 0 ? (
        <Box
          sx={{
            border: `2px dashed ${COLORS.border}`,
            borderRadius: 2,
            p: 4,
            textAlign: 'center',
          }}
        >
          <AddAPhotoIcon sx={{ fontSize: 48, color: COLORS.textSecondary, mb: 1 }} />
          <Typography sx={{ color: COLORS.textSecondary }}>No photos yet. Tap above to add.</Typography>
        </Box>
      ) : (
        <Grid container spacing={1}>
          {photos.map((photo, idx) => (
            <Grid size={4} key={photo._id || idx}>
              <Box
                sx={{
                  position: 'relative',
                  paddingTop: '100%',
                  borderRadius: 1,
                  overflow: 'hidden',
                  bgcolor: COLORS.surface,
                  cursor: 'pointer',
                }}
                onClick={() => setPreviewPhoto(photo)}
              >
                <img
                  src={photo.url || photo.thumbnailUrl}
                  alt={photo.name}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
                {photo.latitude && (
                  <Chip
                    icon={<LocationOnIcon sx={{ fontSize: 12 }} />}
                    label="GPS"
                    size="small"
                    sx={{
                      position: 'absolute',
                      bottom: 4,
                      left: 4,
                      bgcolor: 'rgba(0,0,0,0.7)',
                      color: COLORS.success,
                      height: 20,
                      '& .MuiChip-label': { fontSize: '0.65rem', px: 0.5 },
                    }}
                  />
                )}
              </Box>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Photo preview dialog */}
      <Dialog
        open={!!previewPhoto}
        onClose={() => setPreviewPhoto(null)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { bgcolor: COLORS.bg } }}
      >
        <DialogContent sx={{ p: 0 }}>
          {previewPhoto && (
            <img src={previewPhoto.url} alt={previewPhoto.name} style={{ width: '100%', height: 'auto' }} />
          )}
        </DialogContent>
        <DialogActions sx={{ bgcolor: COLORS.surface }}>
          <Button
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => {
              onPhotoDeleted(previewPhoto);
              setPreviewPhoto(null);
            }}
          >
            Delete
          </Button>
          <Button onClick={() => setPreviewPhoto(null)} sx={{ color: COLORS.text }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

CloseOutPhotos.propTypes = {
  jobId: PropTypes.string.isRequired,
  photos: PropTypes.arrayOf(
    PropTypes.shape({
      _id: PropTypes.string,
      name: PropTypes.string,
      url: PropTypes.string,
      thumbnailUrl: PropTypes.string,
      latitude: PropTypes.number,
    })
  ).isRequired,
  onPhotoAdded: PropTypes.func.isRequired,
  onPhotoDeleted: PropTypes.func.isRequired,
};

export default CloseOutPhotos;
