/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Card,
  CardContent,
  CardActions,
  Grid,
  CircularProgress,
  Alert,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  LinearProgress,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions
} from '@mui/material';
import UploadIcon from '@mui/icons-material/CloudUpload';
import DocIcon from '@mui/icons-material/Description';
import ExpandIcon from '@mui/icons-material/ExpandMore';
import CheckIcon from '@mui/icons-material/CheckCircle';
import PendingIcon from '@mui/icons-material/HourglassEmpty';
import ErrorIcon from '@mui/icons-material/Error';
import QuestionIcon from '@mui/icons-material/QuestionAnswer';
import DeleteIcon from '@mui/icons-material/Delete';
import api from '../api';

const docTypes = [
  { value: 'as-built-procedure', label: 'As-Built Procedure' },
  { value: 'as-built-template', label: 'As-Built Template' },
  { value: 'field-checklist', label: 'Field Checklist' },
  { value: 'safety-procedure', label: 'Safety Procedure' },
  { value: 'construction-standard', label: 'Construction Standard' },
  { value: 'material-spec', label: 'Material Specification' },
  { value: 'inspection-guide', label: 'Inspection Guide' },
  { value: 'other', label: 'Other' }
];

const workTypes = [
  { value: 'all', label: 'All Work Types' },
  { value: 'overhead', label: 'Overhead' },
  { value: 'underground', label: 'Underground' },
  { value: 'pole-replacement', label: 'Pole Replacement' },
  { value: 'transformer', label: 'Transformer' },
  { value: 'service-install', label: 'Service Install' },
  { value: 'meter', label: 'Meter' },
  { value: 'switching', label: 'Switching' },
  { value: 'streetlight', label: 'Streetlight' }
];

// Helper: Empty state component
const EmptyState = () => (
  <Paper sx={{ p: 4, textAlign: 'center' }}>
    <DocIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
    <Typography variant="body1" color="text.secondary">
      No procedure documents uploaded yet.
    </Typography>
    <Typography variant="body2" color="text.secondary">
      Upload PG&E procedure documents above to get started.
    </Typography>
  </Paper>
);

// Helper: Loading state component
const LoadingState = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
    <CircularProgress />
  </Box>
);

export default function ProcedureManager() {
  const [procedures, setProcedures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Upload form state
  const [file, setFile] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [docType, setDocType] = useState('as-built-procedure');
  const [selectedWorkTypes, setSelectedWorkTypes] = useState(['all']);
  
  // Delete state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    loadProcedures();
  }, []);

  const loadProcedures = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/procedures');
      setProcedures(response.data);
    } catch (err) {
      console.error('Load procedures error:', err);
      setError('Failed to load procedure documents');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a PDF file');
      return;
    }

    try {
      setUploading(true);
      setError(null);
      
      const formData = new FormData();
      formData.append('document', file);
      formData.append('name', name || file.name.replace('.pdf', ''));
      formData.append('description', description);
      formData.append('docType', docType);
      formData.append('applicableWorkTypes', selectedWorkTypes.join(','));

      const response = await api.post('/api/procedures/upload', formData);
      
      setSuccess(`${response.data.procedureDoc.name} uploaded! AI is processing the document to learn the requirements.`);
      setFile(null);
      setName('');
      setDescription('');
      
      // Reload to show the new document
      setTimeout(loadProcedures, 1000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/api/procedures/${deleteTarget._id}`);
      setSuccess(`"${deleteTarget.name}" deleted successfully.`);
      setDeleteTarget(null);
      loadProcedures();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete procedure');
    } finally {
      setDeleteLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckIcon color="success" />;
      case 'processing':
        return <CircularProgress size={20} />;
      case 'failed':
        return <ErrorIcon color="error" />;
      default:
        return <PendingIcon color="warning" />;
    }
  };

  // Custom status chip styles for better contrast (WCAG AA compliant)
  const getStatusChipSx = (status) => {
    switch (status) {
      case 'completed': 
        return { bgcolor: '#15803d', color: '#fff', fontWeight: 600 }; // darker green
      case 'processing': 
        return { bgcolor: '#0369a1', color: '#fff', fontWeight: 600 }; // darker blue  
      case 'failed': 
        return { bgcolor: '#b91c1c', color: '#fff', fontWeight: 600 }; // darker red
      default: 
        return { bgcolor: '#a16207', color: '#fff', fontWeight: 600 }; // darker amber
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Procedure Document Manager
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Upload PG&E procedure documents to teach the AI how to help foremen fill out as-builts and other field documentation.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>{success}</Alert>}

      {/* Upload Form */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography variant="h5" component="h2" gutterBottom>
          Upload New Procedure Document
        </Typography>
        <form onSubmit={handleUpload}>
          <Grid container spacing={2}>
            <Grid size={12}>
              <Button
                variant="outlined"
                component="label"
                startIcon={<UploadIcon />}
                fullWidth
                sx={{ height: 56, borderStyle: 'dashed' }}
              >
                {file ? file.name : 'Select PDF Document'}
                <input
                  id="procedure-manager-file-input"
                  name="procedure-manager-file-input"
                  type="file"
                  hidden
                  accept=".pdf"
                  onChange={(e) => setFile(e.target.files[0])}
                  aria-label="Select PDF procedure document"
                />
              </Button>
            </Grid>
            
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Document Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., PG&E As-Built Procedure Rev 2024"
              />
            </Grid>
            
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth>
                <InputLabel id="doc-type-label">Document Type</InputLabel>
                <Select
                  labelId="doc-type-label"
                  id="doc-type-select"
                  value={docType}
                  label="Document Type"
                  onChange={(e) => setDocType(e.target.value)}
                >
                  {docTypes.map(dt => (
                    <MenuItem key={dt.value} value={dt.value}>{dt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid size={12}>
              <TextField
                fullWidth
                multiline
                rows={2}
                label="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of what this document covers..."
              />
            </Grid>
            
            <Grid size={12}>
              <FormControl fullWidth>
                <InputLabel id="work-types-label">Applicable Work Types</InputLabel>
                <Select
                  labelId="work-types-label"
                  id="work-types-select"
                  multiple
                  value={selectedWorkTypes}
                  label="Applicable Work Types"
                  onChange={(e) => setSelectedWorkTypes(e.target.value)}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {selected.map((value) => (
                        <Chip 
                          key={value} 
                          label={workTypes.find(w => w.value === value)?.label || value} 
                          size="small" 
                        />
                      ))}
                    </Box>
                  )}
                >
                  {workTypes.map(wt => (
                    <MenuItem key={wt.value} value={wt.value}>{wt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid size={12}>
              <Button
                type="submit"
                variant="contained"
                disabled={!file || uploading}
                startIcon={uploading ? <CircularProgress size={20} /> : <UploadIcon />}
              >
                {uploading ? 'Uploading & Processing...' : 'Upload Document'}
              </Button>
            </Grid>
          </Grid>
        </form>
      </Paper>

      <Divider sx={{ my: 4 }} />

      {/* Uploaded Documents List */}
      <Typography variant="h5" component="h2" gutterBottom>
        Uploaded Procedure Documents ({procedures.length})
      </Typography>
      
      {loading && <LoadingState />}
      {!loading && procedures.length === 0 && <EmptyState />}
      {!loading && procedures.length > 0 && (
        <Grid container spacing={2}>
          {procedures.map((proc) => (
            <Grid size={{ xs: 12, md: 6 }} key={proc._id}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Typography variant="h6" sx={{ fontSize: '1rem' }}>
                      {proc.name}
                    </Typography>
                    {getStatusIcon(proc.processingStatus)}
                  </Box>
                  
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
                    <Chip 
                      size="small" 
                      label={docTypes.find(d => d.value === proc.docType)?.label || proc.docType}
                      color="primary"
                      variant="outlined"
                    />
                    <Chip 
                      size="small" 
                      label={proc.processingStatus}
                      sx={getStatusChipSx(proc.processingStatus)}
                    />
                  </Box>
                  
                  {proc.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {proc.description}
                    </Typography>
                  )}
                  
                  <Typography variant="caption" color="text.secondary" display="block">
                    Work Types: {proc.applicableWorkTypes?.join(', ') || 'All'}
                  </Typography>
                  
                  {proc.processingStatus === 'completed' && proc.extractedContent && (
                    <Accordion sx={{ mt: 2, boxShadow: 'none', border: '1px solid', borderColor: 'divider' }}>
                      <AccordionSummary expandIcon={<ExpandIcon />}>
                        <Typography variant="body2">
                          <QuestionIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />
                          {proc.extractedContent.questions?.length || 0} Questions Extracted
                        </Typography>
                      </AccordionSummary>
                      <AccordionDetails>
                        <List dense>
                          {proc.extractedContent.questions?.slice(0, 5).map((q, idx) => (
                            <ListItem key={q.field || `q-${proc._id}-${idx}`}>
                              <ListItemIcon sx={{ minWidth: 32 }}>
                                <Typography variant="caption" color="text.secondary">{idx + 1}.</Typography>
                              </ListItemIcon>
                              <ListItemText 
                                primary={q.question}
                                secondary={`Field: ${q.field} | Type: ${q.inputType}`}
                              />
                            </ListItem>
                          ))}
                          {(proc.extractedContent.questions?.length || 0) > 5 && (
                            <ListItem>
                              <ListItemText 
                                secondary={`... and ${proc.extractedContent.questions.length - 5} more questions`}
                              />
                            </ListItem>
                          )}
                        </List>
                      </AccordionDetails>
                    </Accordion>
                  )}
                  
                  {proc.processingStatus === 'processing' && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="caption" color="info.main">
                        AI is analyzing this document...
                      </Typography>
                      <LinearProgress sx={{ mt: 1 }} />
                    </Box>
                  )}
                  
                  {proc.processingStatus === 'failed' && proc.processingError && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                      {proc.processingError}
                    </Alert>
                  )}
                </CardContent>
                
                <CardActions sx={{ justifyContent: 'space-between' }}>
                  <Typography variant="caption" color="text.secondary">
                    Uploaded {new Date(proc.createdAt).toLocaleDateString()}
                    {proc.uploadedBy && ` by ${proc.uploadedBy.name || proc.uploadedBy.email}`}
                  </Typography>
                  <Tooltip title="Delete procedure">
                    <IconButton
                      size="small"
                      onClick={() => setDeleteTarget(proc)}
                      sx={{ color: '#ef4444' }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onClose={() => !deleteLoading && setDeleteTarget(null)}>
        <DialogTitle>Delete Procedure?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
            {deleteTarget?.processingStatus === 'failed' && ' This document failed processing and can be safely removed.'}
            {deleteTarget?.processingStatus === 'completed' && ' This will remove the extracted AI data as well.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleteLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            color="error"
            variant="contained"
            disabled={deleteLoading}
            startIcon={deleteLoading ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon />}
          >
            {deleteLoading ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

