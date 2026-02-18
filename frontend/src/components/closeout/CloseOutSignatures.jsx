/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * CloseOutSignatures - Document viewing, editing, and template-based form filling.
 *
 * Combines DocumentsSection list with template picker and PDF editor dialogs.
 *
 * @module components/closeout/CloseOutSignatures
 */

import React, { useState } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Typography,
  Button,
  Card,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Alert,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import CloseIcon from '@mui/icons-material/Close';
import api from '../../api';
import PDFFormEditor from '../PDFFormEditor';
import { useAppColors } from '../shared/themeUtils';

/**
 * Resolve a document URL via signed URL (async).
 */
const getDocumentUrl = async (doc) => {
  if (!doc) return '';
  if (doc.url?.startsWith('http')) return doc.url;
  if (doc.r2Key) {
    try { return await api.getSignedFileUrl(doc.r2Key); } catch { return ''; }
  }
  if (doc.url) {
    // url may be a bare r2Key after migration
    try { return await api.getSignedFileUrl(doc.url); } catch { return doc.url; }
  }
  return '';
};

const CloseOutSignatures = ({
  jobId,
  job,
  documents,
  smartFormTemplates,
  onDocumentsChanged,
}) => {
  const COLORS = useAppColors();

  // PDF editor state
  const [pdfEditorOpen, setPdfEditorOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [selectedDocResolvedUrl, setSelectedDocResolvedUrl] = useState('');
  const [filledPdfUrl, setFilledPdfUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Template picker state
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);

  const editableDocs = documents.filter((d) => d.name?.endsWith('.pdf') || d.type === 'template');

  const handleNavigatePDF = async (doc) => {
    const resolved = await getDocumentUrl(doc);
    setSelectedDocResolvedUrl(resolved);
    if (smartFormTemplates.length > 0) {
      setSelectedDocument(doc);
      setTemplatePickerOpen(true);
    } else {
      setSelectedDocument(doc);
      setFilledPdfUrl(null);
      setPdfEditorOpen(true);
    }
  };

  const handleSelectTemplate = async (template) => {
    setTemplatePickerOpen(false);
    setPdfLoading(true);

    try {
      const response = await api.post(`/api/smartforms/templates/${template._id}/fill`, { jobId }, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setFilledPdfUrl(url);
      setPdfEditorOpen(true);
    } catch (err) {
      console.error('Failed to fill template:', err);
      setFilledPdfUrl(null);
      setPdfEditorOpen(true);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleSkipTemplate = () => {
    setTemplatePickerOpen(false);
    setFilledPdfUrl(null);
    setPdfEditorOpen(true);
  };

  const handlePdfSave = async (pdfBase64) => {
    try {
      const binaryString = atob(pdfBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i); // NOSONAR: charCodeAt is correct for binary data
      }

      const formData = new FormData();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      formData.append('file', blob, selectedDocument.name);
      formData.append('folder', 'ACI');
      formData.append('subfolder', 'Completed Forms');

      await api.post(`/api/jobs/${jobId}/files`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 180000,
      });

      setPdfEditorOpen(false);
      setSelectedDocument(null);

      // Notify parent to refresh documents
      if (onDocumentsChanged) onDocumentsChanged();
    } catch (err) {
      console.error('Failed to save PDF:', err);
    }
  };

  const handleClosePdfEditor = () => {
    setPdfEditorOpen(false);
    setSelectedDocument(null);
    setSelectedDocResolvedUrl('');
    if (filledPdfUrl) {
      URL.revokeObjectURL(filledPdfUrl);
      setFilledPdfUrl(null);
    }
  };

  return (
    <Box>
      {/* Documents list */}
      <Typography sx={{ color: COLORS.textSecondary, fontWeight: 600, fontSize: '0.75rem', mb: 1 }}>
        FORMS & DOCUMENTS ({editableDocs.length})
      </Typography>

      {editableDocs.length === 0 ? (
        <Alert severity="info" sx={{ bgcolor: COLORS.surface }}>
          No documents available for this job yet.
        </Alert>
      ) : (
        <List sx={{ p: 0 }}>
          {editableDocs.map((doc, idx) => (
            <Card
              key={doc._id || idx}
              sx={{
                bgcolor: COLORS.surface,
                mb: 1.5,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <ListItem sx={{ cursor: 'pointer' }} onClick={() => handleNavigatePDF(doc)}>
                <ListItemIcon>
                  <PictureAsPdfIcon sx={{ color: '#ff5252', fontSize: 32 }} />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Typography sx={{ color: COLORS.text, fontWeight: 600 }}>{doc.name}</Typography>
                  }
                  secondary={
                    <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.75rem' }}>
                      {doc.isTemplate ? 'Template' : 'Uploaded'} • Tap to edit
                    </Typography>
                  }
                />
                <ListItemSecondaryAction>
                  <IconButton onClick={() => handleNavigatePDF(doc)} aria-label="Edit document">
                    <EditIcon sx={{ color: COLORS.secondary }} />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            </Card>
          ))}
        </List>
      )}

      {/* Template Picker Dialog */}
      <Dialog
        open={templatePickerOpen}
        onClose={() => setTemplatePickerOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { bgcolor: COLORS.surface, color: COLORS.text } }}
      >
        <DialogTitle sx={{ borderBottom: `1px solid ${COLORS.border}` }}>
          <Typography sx={{ fontWeight: 700 }}>Select Form Template</Typography>
          <Typography variant="body2" sx={{ color: COLORS.textSecondary, mt: 0.5 }}>
            Choose a template to auto-fill with job data
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {pdfLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress sx={{ color: COLORS.primary }} />
            </Box>
          ) : (
            <List sx={{ p: 0 }}>
              {smartFormTemplates.map((template) => (
                <Card
                  key={template._id}
                  sx={{
                    bgcolor: COLORS.surfaceLight,
                    mb: 1.5,
                    border: `1px solid ${COLORS.border}`,
                    cursor: 'pointer',
                    '&:hover': { borderColor: COLORS.primary },
                  }}
                  onClick={() => handleSelectTemplate(template)}
                >
                  <ListItem>
                    <ListItemIcon>
                      <PictureAsPdfIcon sx={{ color: COLORS.primary, fontSize: 32 }} />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography sx={{ color: COLORS.text, fontWeight: 600 }}>
                          {template.name}
                        </Typography>
                      }
                      secondary={
                        <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.75rem' }}>
                          {template.description || template.category || 'SmartForm template'}
                        </Typography>
                      }
                    />
                    <Chip
                      label="Auto-fill"
                      size="small"
                      sx={{ bgcolor: COLORS.primary, color: COLORS.bg, fontWeight: 600 }}
                    />
                  </ListItem>
                </Card>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, borderTop: `1px solid ${COLORS.border}` }}>
          <Button onClick={handleSkipTemplate} sx={{ color: COLORS.textSecondary }}>
            Skip - Open Blank Form
          </Button>
        </DialogActions>
      </Dialog>

      {/* PDF Editor Dialog */}
      <Dialog
        open={pdfEditorOpen}
        onClose={handleClosePdfEditor}
        fullScreen
        PaperProps={{ sx: { bgcolor: COLORS.bg } }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            p: 1,
            borderBottom: `1px solid ${COLORS.border}`,
            bgcolor: COLORS.surface,
          }}
        >
          <Typography sx={{ color: COLORS.text, fontWeight: 600, ml: 1 }}>
            {selectedDocument?.name || 'Edit Document'}
          </Typography>
          <IconButton onClick={handleClosePdfEditor} sx={{ color: COLORS.text }}>
            <CloseIcon />
          </IconButton>
        </Box>
        {selectedDocument &&
          (selectedDocument.name?.match(/\.html?$/i) ? (
            <Box sx={{ flex: 1, p: 2, height: '100%' }}>
              <iframe
                src={selectedDocResolvedUrl || ''}
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  borderRadius: '8px',
                  minHeight: '600px',
                }}
                title={selectedDocument.name}
                sandbox="allow-scripts allow-popups allow-forms"
              />
            </Box>
          ) : (
            <PDFFormEditor
              pdfUrl={filledPdfUrl || selectedDocResolvedUrl || ''}
              jobInfo={{
                pmNumber: job?.pmNumber,
                woNumber: job?.woNumber,
                address: job?.address,
                city: job?.city,
              }}
              documentName={selectedDocument.name}
              onSave={handlePdfSave}
            />
          ))}
        {pdfLoading && (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 2,
            }}
          >
            <CircularProgress sx={{ color: COLORS.primary }} />
            <Typography sx={{ color: COLORS.text }}>Pre-filling form with job data...</Typography>
          </Box>
        )}
      </Dialog>
    </Box>
  );
};

CloseOutSignatures.propTypes = {
  jobId: PropTypes.string.isRequired,
  job: PropTypes.object,
  documents: PropTypes.arrayOf(
    PropTypes.shape({
      _id: PropTypes.string,
      name: PropTypes.string,
      type: PropTypes.string,
      isTemplate: PropTypes.bool,
    })
  ).isRequired,
  smartFormTemplates: PropTypes.array.isRequired,
  onDocumentsChanged: PropTypes.func,
};

export default CloseOutSignatures;
