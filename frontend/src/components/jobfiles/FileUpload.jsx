/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * FileUpload - Photo upload panels for Pre-Field and GF Audit folders.
 *
 * Re-exports the PreFieldPhotoPanel and GFAuditPhotoPanel
 * components that were already extracted as static helpers.
 *
 * @module components/jobfiles/FileUpload
 */

import React from 'react';
import PropTypes from 'prop-types';
import { Paper, Button, Typography, Chip, CircularProgress } from '@mui/material';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import EmailIcon from '@mui/icons-material/Email';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

/**
 * Pre-Field photo upload panel with camera/library buttons.
 */
const PreFieldPhotoPanel = ({ cameraRef, libraryRef, onUpload, aiExtractionComplete }) => (
  <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
    <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>Pre-Field Photos:</Typography>
    <Button variant="contained" size="small" startIcon={<CameraAltIcon />} onClick={() => cameraRef.current?.click()}>Camera</Button>
    <Button variant="outlined" size="small" startIcon={<PhotoLibraryIcon />} onClick={() => libraryRef.current?.click()}>Library</Button>
    {aiExtractionComplete && (
      <Chip icon={<CheckCircleIcon />} label="AI Extracted" color="success" size="small" variant="outlined" />
    )}
    <input ref={cameraRef} type="file" accept="image/*" capture="environment" multiple onChange={onUpload} style={{ display: 'none' }} aria-label="Pre-field camera" />
    <input ref={libraryRef} type="file" accept="image/*" multiple onChange={onUpload} style={{ display: 'none' }} aria-label="Pre-field library" />
  </Paper>
);

PreFieldPhotoPanel.propTypes = {
  cameraRef: PropTypes.object.isRequired,
  libraryRef: PropTypes.object.isRequired,
  onUpload: PropTypes.func.isRequired,
  aiExtractionComplete: PropTypes.bool,
};

/**
 * GF Audit photo upload panel with camera/library + export buttons.
 */
const GFAuditPhotoPanel = ({ cameraRef, libraryRef, onUpload, exportLoading, onExport, documentCount }) => (
  <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
    <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>GF Audit:</Typography>
    <Button variant="contained" size="small" startIcon={<CameraAltIcon />} onClick={() => cameraRef.current?.click()}>Camera</Button>
    <Button variant="outlined" size="small" startIcon={<PhotoLibraryIcon />} onClick={() => libraryRef.current?.click()}>Library</Button>
    <Button variant="outlined" size="small" color="secondary" startIcon={exportLoading ? <CircularProgress size={16} /> : <EmailIcon />} onClick={onExport} disabled={exportLoading || documentCount === 0}>
      Export to Email
    </Button>
    <input ref={cameraRef} type="file" accept="image/*" capture="environment" multiple onChange={onUpload} style={{ display: 'none' }} aria-label="GF Audit camera" />
    <input ref={libraryRef} type="file" accept="image/*" multiple onChange={onUpload} style={{ display: 'none' }} aria-label="GF Audit library" />
  </Paper>
);

GFAuditPhotoPanel.propTypes = {
  cameraRef: PropTypes.object.isRequired,
  libraryRef: PropTypes.object.isRequired,
  onUpload: PropTypes.func.isRequired,
  exportLoading: PropTypes.bool.isRequired,
  onExport: PropTypes.func.isRequired,
  documentCount: PropTypes.number.isRequired,
};

export { PreFieldPhotoPanel, GFAuditPhotoPanel };
export default PreFieldPhotoPanel;
