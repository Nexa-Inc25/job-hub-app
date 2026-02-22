/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * FilePreview - PDF viewer/editor dialog and image viewer dialog.
 *
 * Handles both view-only (iframe) and edit (PDFFormEditor) modes.
 *
 * @module components/jobfiles/FilePreview
 */

import React from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Typography,
  Button,
  Chip,
  Paper,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import DownloadIcon from '@mui/icons-material/Download';
import EditIcon from '@mui/icons-material/Edit';
import CloseIcon from '@mui/icons-material/Close';
import PDFFormEditor from '../PDFFormEditor';

const FilePreview = ({
  // PDF viewer
  pdfViewerOpen,
  onClosePdfViewer,
  viewingDoc,
  viewingDocBlobUrl,
  editorMode,
  onToggleEditorMode,
  job,
  onDownload,
  onSaveEditedPdf,
  // Image viewer
  imageViewerOpen,
  onCloseImageViewer,
  viewingImage,
  viewingImageBlobUrl,
}) => (
  <>
    {/* PDF Viewer/Editor Dialog */}
    <Dialog
      open={pdfViewerOpen}
      onClose={onClosePdfViewer}
      maxWidth="xl"
      fullWidth
      fullScreen={globalThis.innerWidth < 1024}
      slotProps={{
        paper: {
          sx: {
            height: { xs: '100vh', md: '95vh' },
            maxHeight: { xs: '100vh', md: '95vh' },
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
          },
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1, flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <InsertDriveFileIcon color="primary" />
          <Typography variant="h6">{viewingDoc?.name || 'Document'}</Typography>
          {viewingDoc?.isTemplate && <Chip label="Template" size="small" color="primary" />}
          <Chip label={editorMode ? 'Edit Mode' : 'View Mode'} size="small" color={editorMode ? 'success' : 'default'} />
        </Box>
        <Box>
          <Button
            variant={editorMode ? 'outlined' : 'contained'}
            size="small"
            startIcon={<EditIcon />}
            onClick={onToggleEditorMode}
            sx={{ mr: 1 }}
          >
            {editorMode ? 'View Only' : 'Edit & Fill'}
          </Button>
          <Tooltip title="Download Original">
            <IconButton onClick={() => viewingDoc && onDownload(viewingDoc)} aria-label="Download">
              <DownloadIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Close">
            <IconButton onClick={onClosePdfViewer} aria-label="Close">
              <CloseIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
        {editorMode ? (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%', minHeight: 0 }}>
            <PDFFormEditor
              pdfUrl={viewingDocBlobUrl || ''}
              jobInfo={{
                pmNumber: job?.pmNumber,
                woNumber: job?.woNumber,
                notificationNumber: job?.notificationNumber,
                address: job?.address,
                city: job?.city,
                client: job?.client,
              }}
              documentName={viewingDoc?.name}
              onSave={onSaveEditedPdf}
            />
          </Box>
        ) : (
          <>
            {viewingDoc?.isTemplate && job && (
              <Paper sx={{ p: 2, m: 2, mb: 0, bgcolor: 'primary.light', color: 'primary.contrastText' }}>
                <Typography variant="subtitle2" gutterBottom>Job Information:</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                  <Typography variant="body2"><strong>PM#:</strong> {job.pmNumber || 'N/A'}</Typography>
                  <Typography variant="body2"><strong>WO#:</strong> {job.woNumber || 'N/A'}</Typography>
                  <Typography variant="body2"><strong>Address:</strong> {job.address || 'N/A'}, {job.city || ''}</Typography>
                </Box>
              </Paper>
            )}
            <Box sx={{ flex: 1, p: 2 }}>
              {viewingDoc && (
                <iframe
                  src={viewingDocBlobUrl || ''}
                  style={{ width: '100%', height: '100%', border: 'none', borderRadius: '8px', minHeight: '600px' }}
                  title={viewingDoc.name}
                  sandbox="allow-scripts allow-popups allow-forms"
                />
              )}
            </Box>
          </>
        )}
      </DialogContent>
      {!editorMode && (
        <DialogActions sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
            Click &quot;Edit &amp; Fill&quot; to add text and checkmarks to this document
          </Typography>
          <Button onClick={onClosePdfViewer}>Close</Button>
          <Button variant="contained" startIcon={<EditIcon />} onClick={onToggleEditorMode}>
            Edit & Fill Form
          </Button>
        </DialogActions>
      )}
    </Dialog>

    {/* Image Viewer Dialog */}
    <Dialog
      open={imageViewerOpen}
      onClose={onCloseImageViewer}
      maxWidth="lg"
      fullWidth
      slotProps={{ paper: { sx: { bgcolor: 'black', maxHeight: '95vh' } } }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1, bgcolor: 'rgba(0,0,0,0.8)', color: 'white' }}>
        <Typography variant="h6">{viewingImage?.name || 'Image'}</Typography>
        <Box>
          <Tooltip title="Download">
            <IconButton onClick={() => viewingImage && onDownload(viewingImage)} sx={{ color: 'white' }} aria-label="Download">
              <DownloadIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Close">
            <IconButton onClick={onCloseImageViewer} sx={{ color: 'white' }} aria-label="Close">
              <CloseIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ p: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', bgcolor: 'black', minHeight: '60vh' }}>
        {viewingImage && (
          <img
            src={viewingImageBlobUrl || ''}
            alt={viewingImage.name}
            style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }}
            onError={(e) => {
              e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="50%" y="50%" text-anchor="middle" fill="white">Failed to load image</text></svg>';
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  </>
);

FilePreview.propTypes = {
  pdfViewerOpen: PropTypes.bool.isRequired,
  onClosePdfViewer: PropTypes.func.isRequired,
  viewingDoc: PropTypes.object,
  viewingDocBlobUrl: PropTypes.string,
  editorMode: PropTypes.bool.isRequired,
  onToggleEditorMode: PropTypes.func.isRequired,
  job: PropTypes.object,
  onDownload: PropTypes.func.isRequired,
  onSaveEditedPdf: PropTypes.func.isRequired,
  imageViewerOpen: PropTypes.bool.isRequired,
  onCloseImageViewer: PropTypes.func.isRequired,
  viewingImage: PropTypes.object,
  viewingImageBlobUrl: PropTypes.string,
};

export default FilePreview;
