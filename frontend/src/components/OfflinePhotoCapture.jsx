/**
 * Offline Photo Capture Component
 * 
 * Allows field workers to capture photos using device camera.
 * Photos are stored locally and synced when online.
 */

import React, { useState, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Alert,
  Chip,
  Stack
} from '@mui/material';
import CameraAlt from '@mui/icons-material/CameraAlt';
import FlipCameraIos from '@mui/icons-material/FlipCameraIos';
import Close from '@mui/icons-material/Close';
import CloudUpload from '@mui/icons-material/CloudUpload';
import CloudOff from '@mui/icons-material/CloudOff';
import CheckCircle from '@mui/icons-material/CheckCircle';
import PhotoLibrary from '@mui/icons-material/PhotoLibrary';
import { useOffline } from '../hooks/useOffline';

const OfflinePhotoCapture = ({ 
  open, 
  onClose, 
  jobId, 
  folders = [],
  onPhotoSaved 
}) => {
  const { isOnline, savePhoto } = useOffline();
  
  const [mode, setMode] = useState('camera'); // 'camera' or 'preview'
  const [capturedImage, setCapturedImage] = useState(null);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [selectedSubfolder, setSelectedSubfolder] = useState('');
  const [photoName, setPhotoName] = useState('');
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' (back) or 'user' (front)
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [stream, setStream] = useState(null);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      setError('');
      
      // Stop existing stream
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
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
        setError('Camera permission denied. Please allow camera access in your browser settings.');
      } else if (err.name === 'NotFoundError') {
        setError('No camera found on this device.');
      } else {
        setError(`Camera error: ${err.message}`);
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

  // Capture photo from camera
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedImage(dataUrl);
    setMode('preview');
    
    // Generate default name
    const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-').slice(0, 19);
    setPhotoName(`Photo_${timestamp}`);
    
    stopCamera();
  };

  // Handle file selection from gallery
  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setCapturedImage(e.target.result);
      setMode('preview');
      setPhotoName(file.name.replace(/\.[^/.]+$/, '')); // Remove extension
    };
    reader.onerror = () => {
      setError('Failed to read file');
    };
    reader.readAsDataURL(file);
  };

  // Switch camera (front/back)
  const switchCamera = () => {
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  };

  // Effect to restart camera when facing mode changes
  React.useEffect(() => {
    if (open && mode === 'camera') {
      startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [open, facingMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Retake photo
  const handleRetake = () => {
    setCapturedImage(null);
    setMode('camera');
    setError('');
    setSuccess(false);
    startCamera();
  };

  // Save photo (locally for offline or upload directly)
  const handleSave = async () => {
    if (!capturedImage || !selectedFolder || !photoName.trim()) {
      setError('Please fill in all required fields');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const photoData = {
        jobId,
        folderName: selectedFolder,
        subfolderName: selectedSubfolder || null,
        fileName: `${photoName.trim()}.jpg`,
        base64Data: capturedImage,
        mimeType: 'image/jpeg',
        capturedAt: new Date().toISOString()
      };

      // Save to offline storage (will sync when online)
      await savePhoto(photoData);
      
      setSuccess(true);
      
      if (onPhotoSaved) {
        onPhotoSaved(photoData);
      }

      // Close after short delay
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (err) {
      console.error('Save error:', err);
      setError('Failed to save photo: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Close and cleanup
  const handleClose = () => {
    stopCamera();
    setCapturedImage(null);
    setMode('camera');
    setSelectedFolder('');
    setSelectedSubfolder('');
    setPhotoName('');
    setError('');
    setSuccess(false);
    onClose();
  };

  // Get subfolders for selected folder
  const getSubfolders = () => {
    const folder = folders.find(f => f.name === selectedFolder);
    return folder?.subfolders || [];
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose} 
      maxWidth="sm" 
      fullWidth
      slotProps={{ paper: { sx: { bgcolor: 'background.paper', maxHeight: '90vh' } } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CameraAlt />
          <Typography variant="h6">Capture Photo</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip 
            size="small"
            icon={isOnline ? <CloudUpload /> : <CloudOff />}
            label={isOnline ? 'Online' : 'Offline'}
            color={isOnline ? 'success' : 'warning'}
          />
          <IconButton onClick={handleClose} size="small">
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 2 }} icon={<CheckCircle />}>
            Photo saved! {isOnline ? 'Uploading...' : 'Will upload when online.'}
          </Alert>
        )}

        {mode === 'camera' ? (
          // Camera view
          <Box sx={{ position: 'relative' }}>
            <Box
              sx={{
                width: '100%',
                aspectRatio: '4/3',
                bgcolor: 'black',
                borderRadius: 2,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  objectFit: 'cover',
                  transform: facingMode === 'user' ? 'scaleX(-1)' : 'none'
                }}
              />
            </Box>

            {/* Camera controls */}
            <Box 
              sx={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center',
                gap: 3,
                mt: 2
              }}
            >
              {/* Gallery button */}
              <IconButton 
                onClick={() => fileInputRef.current?.click()}
                sx={{ bgcolor: 'action.hover' }}
              >
                <PhotoLibrary />
              </IconButton>

              {/* Capture button */}
              <IconButton
                onClick={capturePhoto}
                disabled={!stream}
                sx={{
                  bgcolor: 'primary.main',
                  color: 'white',
                  width: 64,
                  height: 64,
                  '&:hover': { bgcolor: 'primary.dark' },
                  '&:disabled': { bgcolor: 'grey.400' }
                }}
              >
                <CameraAlt fontSize="large" />
              </IconButton>

              {/* Switch camera button */}
              <IconButton 
                onClick={switchCamera}
                sx={{ bgcolor: 'action.hover' }}
              >
                <FlipCameraIos />
              </IconButton>
            </Box>

            <input
              id="offline-photo-capture-input"
              name="offline-photo-capture-input"
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              aria-label="Capture photo for offline storage"
            />
          </Box>
        ) : (
          // Preview and save view
          <Stack spacing={2}>
            {/* Image preview */}
            <Box
              sx={{
                width: '100%',
                aspectRatio: '4/3',
                borderRadius: 2,
                overflow: 'hidden',
                bgcolor: 'black'
              }}
            >
              <img
                src={capturedImage}
                alt="Captured"
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  objectFit: 'contain' 
                }}
              />
            </Box>

            {/* Photo name */}
            <TextField
              label="Photo Name"
              value={photoName}
              onChange={(e) => setPhotoName(e.target.value)}
              fullWidth
              required
              size="small"
            />

            {/* Folder selection */}
            <FormControl fullWidth required size="small">
              <InputLabel>Folder</InputLabel>
              <Select
                id="photo-folder"
                name="folder"
                value={selectedFolder}
                onChange={(e) => {
                  setSelectedFolder(e.target.value);
                  setSelectedSubfolder('');
                }}
                label="Folder"
              >
                {folders.map((folder) => (
                  <MenuItem key={folder.name} value={folder.name}>
                    {folder.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Subfolder selection (if available) */}
            {getSubfolders().length > 0 && (
              <FormControl fullWidth size="small">
                <InputLabel>Subfolder (Optional)</InputLabel>
                <Select
                  id="photo-subfolder"
                  name="subfolder"
                  value={selectedSubfolder}
                  onChange={(e) => setSelectedSubfolder(e.target.value)}
                  label="Subfolder (Optional)"
                >
                  <MenuItem value="">None</MenuItem>
                  {getSubfolders().map((subfolder) => (
                    <MenuItem key={subfolder.name} value={subfolder.name}>
                      {subfolder.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {!isOnline && (
              <Alert severity="info" icon={<CloudOff />}>
                Photo will be saved locally and uploaded when you're back online.
              </Alert>
            )}
          </Stack>
        )}

        {/* Hidden canvas for capturing */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </DialogContent>

      <DialogActions sx={{ p: 2, pt: 0 }}>
        {mode === 'preview' && (
          <>
            <Button 
              onClick={handleRetake} 
              disabled={saving}
              startIcon={<CameraAlt />}
            >
              Retake
            </Button>
            <Button
              onClick={handleSave}
              variant="contained"
              disabled={saving || !selectedFolder || !photoName.trim()}
              startIcon={saving ? <CircularProgress size={20} /> : <CheckCircle />}
            >
              {saving ? 'Saving...' : 'Save Photo'}
            </Button>
          </>
        )}
        {mode === 'camera' && (
          <Button onClick={handleClose}>Cancel</Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

OfflinePhotoCapture.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  jobId: PropTypes.string,
  folders: PropTypes.array,
  onPhotoSaved: PropTypes.func,
};

export default OfflinePhotoCapture;

