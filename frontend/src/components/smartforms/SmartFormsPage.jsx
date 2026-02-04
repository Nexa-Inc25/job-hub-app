/**
 * SmartFormsPage - Template listing and management for SmartForms
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  TextField,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Alert,
  Tooltip,
  InputAdornment,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import SearchIcon from '@mui/icons-material/Search';
import DescriptionIcon from '@mui/icons-material/Description';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DraftsIcon from '@mui/icons-material/Drafts';
import ArchiveIcon from '@mui/icons-material/Archive';

const API_BASE = import.meta.env.VITE_API_URL || '';

const CATEGORIES = [
  { value: 'permits', label: 'Permits' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'billing', label: 'Billing' },
  { value: 'safety', label: 'Safety' },
  { value: 'utility', label: 'Utility Forms' },
  { value: 'other', label: 'Other' },
];

const STATUS_CONFIG = {
  draft: { label: 'Draft', color: 'warning', icon: DraftsIcon },
  active: { label: 'Active', color: 'success', icon: CheckCircleIcon },
  archived: { label: 'Archived', color: 'default', icon: ArchiveIcon },
};

export default function SmartFormsPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Upload dialog state
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadCategory, setUploadCategory] = useState('other');
  const [uploading, setUploading] = useState(false);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (filterCategory) params.append('category', filterCategory);
      if (filterStatus) params.append('status', filterStatus);

      const response = await fetch(`${API_BASE}/api/smartforms/templates?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch templates');

      const data = await response.json();
      setTemplates(data);
      setError('');
    } catch (err) {
      console.error('Error fetching templates:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filterCategory, filterStatus]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      if (!uploadName) {
        // Auto-fill name from filename
        setUploadName(file.name.replace('.pdf', '').replace(/_/g, ' '));
      }
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !uploadName) return;

    try {
      setUploading(true);
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('pdf', uploadFile);
      formData.append('name', uploadName);
      formData.append('description', uploadDescription);
      formData.append('category', uploadCategory);

      const response = await fetch(`${API_BASE}/api/smartforms/templates`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload template');
      }

      const newTemplate = await response.json();
      setUploadDialogOpen(false);
      setUploadFile(null);
      setUploadName('');
      setUploadDescription('');
      setUploadCategory('other');

      // Navigate to editor
      navigate(`/smartforms/editor/${newTemplate._id}`);
    } catch (err) {
      console.error('Error uploading template:', err);
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!templateToDelete) return;

    try {
      setDeleting(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/api/smartforms/templates/${templateToDelete._id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to delete template');

      setTemplates((prev) => prev.filter((t) => t._id !== templateToDelete._id));
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
    } catch (err) {
      console.error('Error deleting template:', err);
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const filteredTemplates = templates.filter((t) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (
        !t.name?.toLowerCase().includes(query) &&
        !t.description?.toLowerCase().includes(query)
      ) {
        return false;
      }
    }
    return true;
  });

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            SmartForms
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Create fillable templates from utility PDFs and batch-fill with job data
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setUploadDialogOpen(true)}
          size="large"
        >
          New Template
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            size="small"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{ minWidth: 250 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" />
                </InputAdornment>
              ),
            }}
          />
          <TextField
            select
            size="small"
            label="Category"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">All Categories</MenuItem>
            {CATEGORIES.map((c) => (
              <MenuItem key={c.value} value={c.value}>
                {c.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            sx={{ minWidth: 130 }}
          >
            <MenuItem value="">All Status</MenuItem>
            <MenuItem value="draft">Draft</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="archived">Archived</MenuItem>
          </TextField>
        </Box>
      </Paper>

      {/* Templates Table */}
      <TableContainer component={Paper}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : filteredTemplates.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <DescriptionIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No templates yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Upload a utility PDF to create your first SmartForm template
            </Typography>
            <Button
              variant="contained"
              startIcon={<CloudUploadIcon />}
              onClick={() => setUploadDialogOpen(true)}
            >
              Upload Template
            </Button>
          </Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Template Name</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="center">Fields</TableCell>
                <TableCell align="center">Fill Count</TableCell>
                <TableCell>Created</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredTemplates.map((template) => {
                const statusConfig = STATUS_CONFIG[template.status] || STATUS_CONFIG.draft;
                const StatusIcon = statusConfig.icon;
                return (
                  <TableRow key={template._id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <DescriptionIcon color="action" />
                        <Box>
                          <Typography fontWeight={600}>{template.name}</Typography>
                          {template.description && (
                            <Typography variant="caption" color="text.secondary">
                              {template.description}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={CATEGORIES.find((c) => c.value === template.category)?.label || template.category}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        icon={<StatusIcon />}
                        label={statusConfig.label}
                        color={statusConfig.color}
                      />
                    </TableCell>
                    <TableCell align="center">{template.fields?.length || 0}</TableCell>
                    <TableCell align="center">{template.fillCount || 0}</TableCell>
                    <TableCell>
                      {new Date(template.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Edit Template">
                        <IconButton
                          onClick={() => navigate(`/smartforms/editor/${template._id}`)}
                          color="primary"
                        >
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Preview">
                        <IconButton
                          onClick={() => navigate(`/smartforms/fill/${template._id}`)}
                          disabled={template.status !== 'active'}
                        >
                          <VisibilityIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton
                          onClick={() => {
                            setTemplateToDelete(template);
                            setDeleteDialogOpen(true);
                          }}
                          color="error"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </TableContainer>

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onClose={() => setUploadDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Upload New Template</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box
              sx={{
                border: '2px dashed',
                borderColor: uploadFile ? 'success.main' : 'grey.400',
                borderRadius: 2,
                p: 3,
                textAlign: 'center',
                bgcolor: uploadFile ? 'success.light' : 'grey.50',
                cursor: 'pointer',
                '&:hover': { borderColor: 'primary.main', bgcolor: 'primary.light' },
              }}
              onClick={() => document.getElementById('pdf-upload-input').click()}
            >
              <input
                id="pdf-upload-input"
                type="file"
                accept="application/pdf"
                hidden
                onChange={handleFileSelect}
              />
              {uploadFile ? (
                <>
                  <CheckCircleIcon sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
                  <Typography fontWeight={600}>{uploadFile.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {(uploadFile.size / 1024 / 1024).toFixed(2)} MB
                  </Typography>
                </>
              ) : (
                <>
                  <CloudUploadIcon sx={{ fontSize: 48, color: 'grey.500', mb: 1 }} />
                  <Typography fontWeight={600}>Click to upload PDF</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Max 20MB
                  </Typography>
                </>
              )}
            </Box>
            <TextField
              label="Template Name"
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              required
              fullWidth
            />
            <TextField
              label="Description (optional)"
              value={uploadDescription}
              onChange={(e) => setUploadDescription(e.target.value)}
              multiline
              rows={2}
              fullWidth
            />
            <TextField
              select
              label="Category"
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
              fullWidth
            >
              {CATEGORIES.map((c) => (
                <MenuItem key={c.value} value={c.value}>
                  {c.label}
                </MenuItem>
              ))}
            </TextField>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setUploadDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleUpload}
            disabled={!uploadFile || !uploadName || uploading}
            startIcon={uploading ? <CircularProgress size={20} /> : <CloudUploadIcon />}
          >
            {uploading ? 'Uploading...' : 'Upload & Configure'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Template?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete <strong>{templateToDelete?.name}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            This action cannot be undone. The source PDF will also be deleted.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={20} /> : <DeleteIcon />}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

