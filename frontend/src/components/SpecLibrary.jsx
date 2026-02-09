/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
// src/components/SpecLibrary.js
// Spec Library - Manage utility construction standards and specifications

import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import {
  Container,
  Typography,
  Box,
  Paper,
  IconButton,
  AppBar,
  Toolbar,
  Chip,
  CircularProgress,
  Alert,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip,
  InputAdornment,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HistoryIcon from '@mui/icons-material/History';
import ElectricalServicesIcon from '@mui/icons-material/ElectricalServices';
import LandscapeIcon from '@mui/icons-material/Landscape';
import CategoryIcon from '@mui/icons-material/Category';
import { useThemeMode } from '../ThemeContext';
import { getThemeColors, LoadingState } from './shared';

// Division configuration (Overhead vs Underground)
// Colors adjusted for WCAG AA contrast (4.5:1) with white text
const DIVISION_CONFIG = {
  overhead: { icon: ElectricalServicesIcon, color: '#d97706', label: 'OVERHEAD SPEC' },
  underground: { icon: LandscapeIcon, color: '#7c3aed', label: 'UNDERGROUND SPEC' },
};

// Spec Card Component - Shows Document Number prominently
const SpecCard = ({ spec, onDownload, onEdit, onDelete, onViewVersions, themeProps }) => {
  const { cardBg, textPrimary, textSecondary, borderColor } = themeProps;
  const divConfig = DIVISION_CONFIG[spec.division] || DIVISION_CONFIG.overhead;

  return (
    <Card sx={{ 
      bgcolor: cardBg, 
      border: `1px solid ${borderColor}`, 
      borderRadius: 2,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      transition: 'transform 0.2s, box-shadow 0.2s',
      '&:hover': { transform: 'translateY(-2px)', boxShadow: 4 }
    }}>
      <CardContent sx={{ flexGrow: 1 }}>
        {/* Document Number - Primary identifier */}
        {spec.documentNumber && (
          <Typography 
            variant="subtitle2" 
            sx={{ 
              color: divConfig.color, 
              fontWeight: 700, 
              fontFamily: 'monospace',
              fontSize: '0.9rem',
              mb: 0.5
            }}
          >
            {spec.documentNumber}
          </Typography>
        )}
        
        {/* Spec Name/Title */}
        <Typography 
          variant="body1" 
          sx={{ color: textPrimary, fontWeight: 600, lineHeight: 1.3, mb: 1 }} 
          title={spec.name}
        >
          {spec.name}
        </Typography>
        
        {spec.description && (
          <Typography variant="body2" sx={{ color: textSecondary, mb: 1.5 }} noWrap title={spec.description}>
            {spec.description}
          </Typography>
        )}
        
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {spec.currentVersion && (
            <Chip 
              label={`v${spec.currentVersion}`}
              size="small"
              sx={{ bgcolor: '#6366f120', color: '#6366f1', fontSize: '0.65rem', height: 20 }}
            />
          )}
          {spec.utilityId?.shortName && (
            <Chip 
              label={spec.utilityId.shortName}
              size="small"
              sx={{ bgcolor: '#22c55e20', color: '#22c55e', fontSize: '0.65rem', height: 20 }}
            />
          )}
        </Box>
      </CardContent>
      
      <CardActions sx={{ borderTop: `1px solid ${borderColor}`, px: 2, py: 1 }}>
        <Tooltip title="Download">
          <IconButton size="small" onClick={() => onDownload(spec)} aria-label="Download spec">
            <DownloadIcon fontSize="small" sx={{ color: '#16a34a' }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Version History">
          <IconButton size="small" onClick={() => onViewVersions(spec)} aria-label="View version history">
            <HistoryIcon fontSize="small" sx={{ color: '#6366f1' }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Edit">
          <IconButton size="small" onClick={() => onEdit(spec)} aria-label="Edit spec">
            <EditIcon fontSize="small" sx={{ color: '#d97706' }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Delete">
          <IconButton size="small" onClick={() => onDelete(spec)} aria-label="Delete spec">
            <DeleteIcon fontSize="small" sx={{ color: '#dc2626' }} />
          </IconButton>
        </Tooltip>
      </CardActions>
    </Card>
  );
};
SpecCard.propTypes = {
  spec: PropTypes.object.isRequired,
  onDownload: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onViewVersions: PropTypes.func.isRequired,
  themeProps: PropTypes.object.isRequired,
};

// Upload/Edit Dialog
const SpecDialog = ({ open, onClose, spec, utilities, onSubmit }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    documentNumber: '',
    division: 'overhead',
    section: '',
    utilityId: '',
    effectiveDate: '',
    tags: '',
    versionNumber: '1.0',
  });
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const { mode } = useThemeMode();

  const isEdit = Boolean(spec);
  const isNewVersion = Boolean(spec && file);
  
  // Pre-compute labels to avoid nested ternaries
  const getDialogTitle = () => {
    if (!isEdit) return 'Add New Spec';
    return isNewVersion ? 'Upload New Version' : 'Edit Spec';
  };
  const getFileButtonLabel = () => {
    if (file) return file.name;
    return isEdit ? 'Upload New Version (optional)' : 'Select File';
  };
  const getSubmitButtonLabel = () => {
    return isEdit ? 'Save' : 'Upload';
  };

  useEffect(() => {
    if (spec) {
      setFormData({
        name: spec.name || '',
        description: spec.description || '',
        documentNumber: spec.documentNumber || '',
        division: spec.division || 'overhead',
        section: spec.section || spec.category || '',
        utilityId: spec.utilityId?._id || spec.utilityId || '',
        effectiveDate: spec.effectiveDate ? spec.effectiveDate.split('T')[0] : '',
        tags: spec.tags?.join(', ') || '',
        versionNumber: spec.currentVersion ? incrementVersion(spec.currentVersion) : '1.0',
      });
    } else {
      setFormData({
        name: '',
        description: '',
        documentNumber: '',
        division: 'overhead',
        section: '',
        utilityId: utilities[0]?._id || '',
        effectiveDate: '',
        tags: '',
        versionNumber: '1.0',
      });
    }
    setFile(null);
    setError('');
  }, [spec, utilities, open]);

  const incrementVersion = (version) => {
    const parts = version.split('.');
    if (parts.length >= 2) {
      parts[1] = String(Number.parseInt(parts[1] || '0', 10) + 1);
      return parts.join('.');
    }
    return `${version}.1`;
  };

  const handleChange = (field) => (e) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.category || !formData.utilityId) {
      setError('Name, category, and utility are required');
      return;
    }

    if (!isEdit && !file) {
      setError('Please select a file to upload');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const data = new FormData();
      Object.entries(formData).forEach(([key, value]) => {
        if (value) data.append(key, value);
      });
      
      if (file) {
        data.append('file', file);
      }

      await onSubmit(data, isEdit ? spec._id : null, isNewVersion);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save spec');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ bgcolor: mode === 'dark' ? '#1e1e2e' : '#fff' }}>
        {getDialogTitle()}
      </DialogTitle>
      <DialogContent sx={{ bgcolor: mode === 'dark' ? '#1e1e2e' : '#fff', pt: 2 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        
        <Grid container spacing={2}>
          {/* Division Toggle - Overhead or Underground */}
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              {Object.entries(DIVISION_CONFIG).map(([key, config]) => (
                <Button
                  key={key}
                  variant={formData.division === key ? 'contained' : 'outlined'}
                  onClick={() => setFormData(prev => ({ ...prev, division: key }))}
                  startIcon={<config.icon />}
                  sx={{
                    flex: 1,
                    py: 1.5,
                    bgcolor: formData.division === key ? config.color : 'transparent',
                    borderColor: config.color,
                    color: formData.division === key ? 'white' : config.color,
                    fontWeight: 700,
                    '&:hover': {
                      bgcolor: formData.division === key ? config.color : `${config.color}20`,
                      borderColor: config.color,
                    }
                  }}
                >
                  {config.label}
                </Button>
              ))}
            </Box>
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Document Number"
              value={formData.documentNumber}
              onChange={handleChange('documentNumber')}
              placeholder="e.g., TD-0100S-001"
              required
              InputProps={{
                sx: { fontFamily: 'monospace', fontWeight: 600 }
              }}
            />
          </Grid>
          
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Section"
              value={formData.section}
              onChange={handleChange('section')}
              placeholder="e.g., Grounding, Pole Installation, Conduit"
              required
              helperText="Category within OH or UG specs"
            />
          </Grid>
          
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Spec Name / Title"
              value={formData.name}
              onChange={handleChange('name')}
              required
              placeholder="e.g., Pole Setting and Framing Standards"
            />
          </Grid>
          
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth required>
              <InputLabel>Utility</InputLabel>
              <Select id="spec-utility" name="utilityId" value={formData.utilityId} onChange={handleChange('utilityId')} label="Utility">
                {utilities.map((utility) => (
                  <MenuItem key={utility._id} value={utility._id}>
                    {utility.shortName || utility.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Version"
              value={formData.versionNumber}
              onChange={handleChange('versionNumber')}
              placeholder="e.g., 2024-01"
            />
          </Grid>
          
          <Grid item xs={12}>
            <TextField
              fullWidth
              multiline
              rows={2}
              label="Description (optional)"
              value={formData.description}
              onChange={handleChange('description')}
            />
          </Grid>
          
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              type="date"
              label="Effective Date"
              value={formData.effectiveDate}
              onChange={handleChange('effectiveDate')}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Tags"
              value={formData.tags}
              onChange={handleChange('tags')}
              placeholder="grounding, pole, meter (comma separated)"
            />
          </Grid>
          
          <Grid item xs={12}>
            <input
              id="spec-library-file-input"
              name="spec-library-file-input"
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept=".pdf,.doc,.docx,.xls,.xlsx"
              onChange={handleFileChange}
              aria-label="Upload spec document"
            />
            <Button
              fullWidth
              variant="outlined"
              startIcon={<CloudUploadIcon />}
              onClick={() => fileInputRef.current?.click()}
              sx={{ 
                py: 2, 
                borderStyle: 'dashed',
                borderColor: file ? '#22c55e' : undefined,
                color: file ? '#22c55e' : undefined
              }}
            >
              {getFileButtonLabel()}
            </Button>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ bgcolor: mode === 'dark' ? '#1e1e2e' : '#fff', p: 2 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button 
          variant="contained" 
          onClick={handleSubmit} 
          disabled={loading}
          sx={{ bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}
        >
          {loading ? <CircularProgress size={20} color="inherit" /> : getSubmitButtonLabel()}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
SpecDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  spec: PropTypes.object,
  utilities: PropTypes.array.isRequired,
  onSubmit: PropTypes.func.isRequired,
};

// Version History Dialog
const VersionHistoryDialog = ({ open, onClose, spec, onDownloadVersion }) => {
  const { mode } = useThemeMode();
  const textPrimary = mode === 'dark' ? '#e2e8f0' : '#1e293b';
  const textSecondary = mode === 'dark' ? '#94a3b8' : '#64748b';

  if (!spec) return null;

  const versions = spec.versions?.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)) || [];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ bgcolor: mode === 'dark' ? '#1e1e2e' : '#fff' }}>
        Version History: {spec.name}
      </DialogTitle>
      <DialogContent sx={{ bgcolor: mode === 'dark' ? '#1e1e2e' : '#fff', p: 0 }}>
        <List>
          {versions.map((version, idx) => (
            <React.Fragment key={version._id || idx}>
              <ListItem>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ color: textPrimary, fontWeight: 600 }}>
                        v{version.versionNumber}
                      </Typography>
                      {version.isActive && (
                        <Chip label="Current" size="small" sx={{ bgcolor: '#22c55e20', color: '#22c55e' }} />
                      )}
                    </Box>
                  }
                  secondary={
                    <Box>
                      <Typography variant="caption" sx={{ color: textSecondary }}>
                        {new Date(version.uploadedAt).toLocaleDateString()} by {version.uploadedBy?.name || 'Unknown'}
                      </Typography>
                      {version.notes && (
                        <Typography variant="body2" sx={{ color: textSecondary, mt: 0.5 }}>
                          {version.notes}
                        </Typography>
                      )}
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <Tooltip title="Download this version">
                    <IconButton onClick={() => onDownloadVersion(spec._id, version.versionNumber)} aria-label={`Download version ${version.versionNumber}`}>
                      <DownloadIcon sx={{ color: '#6366f1' }} />
                    </IconButton>
                  </Tooltip>
                </ListItemSecondaryAction>
              </ListItem>
              {idx < versions.length - 1 && <Divider />}
            </React.Fragment>
          ))}
        </List>
      </DialogContent>
      <DialogActions sx={{ bgcolor: mode === 'dark' ? '#1e1e2e' : '#fff' }}>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};
VersionHistoryDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  spec: PropTypes.object,
  onDownloadVersion: PropTypes.func.isRequired,
};

const SpecLibrary = () => {
  const [specs, setSpecs] = useState([]);
  const [utilities, setUtilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [divisionFilter, setDivisionFilter] = useState('');
  const [specDialog, setSpecDialog] = useState({ open: false, spec: null });
  const [versionDialog, setVersionDialog] = useState({ open: false, spec: null });
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, spec: null });
  
  const navigate = useNavigate();
  const { mode } = useThemeMode();

  const { cardBg, textPrimary, textSecondary, borderColor } = getThemeColors(mode);
  const themeProps = { cardBg, textPrimary, textSecondary, borderColor };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (search) params.search = search;
      if (divisionFilter) params.division = divisionFilter;
      
      const [specsRes, utilitiesRes] = await Promise.all([
        api.get('/api/specs', { params }),
        api.get('/api/utilities'),
      ]);
      setSpecs(specsRes.data);
      setUtilities(utilitiesRes.data);
    } catch (err) {
      console.error('Error fetching specs:', err);
      setError('Failed to load spec library');
    } finally {
      setLoading(false);
    }
  }, [search, divisionFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== '') fetchData();
    }, 300);
    return () => clearTimeout(timer);
  }, [search, fetchData]);

  const handleDownload = async (spec) => {
    try {
      const response = await api.get(`/api/specs/${spec._id}/download`, { responseType: 'blob' });
      const url = globalThis.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', spec.fileName || `${spec.name}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  const handleDownloadVersion = async (specId, version) => {
    try {
      const response = await api.get(`/api/specs/${specId}/download`, { 
        params: { version },
        responseType: 'blob' 
      });
      const url = globalThis.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `spec_v${version}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Download version error:', err);
    }
  };

  const handleSubmitSpec = async (formData, specId, isNewVersion) => {
    if (specId) {
      if (isNewVersion) {
        // Upload new version
        await api.post(`/api/specs/${specId}/versions`, formData);
      } else {
        // Update metadata only
        const data = {};
        formData.forEach((value, key) => {
          if (key !== 'file') data[key] = value;
        });
        await api.put(`/api/specs/${specId}`, data);
      }
    } else {
      // Create new spec
      await api.post('/api/specs', formData);
    }
    fetchData();
  };

  const handleDelete = async (spec) => {
    try {
      await api.delete(`/api/specs/${spec._id}`);
      setDeleteConfirm({ open: false, spec: null });
      fetchData();
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  // Extracted handlers to reduce nesting depth in SpecCard callbacks
  const handleEditSpec = useCallback((spec) => {
    setSpecDialog({ open: true, spec });
  }, []);

  const handleDeleteSpec = useCallback((spec) => {
    setDeleteConfirm({ open: true, spec });
  }, []);

  const handleViewVersions = useCallback((spec) => {
    setVersionDialog({ open: true, spec });
  }, []);

  // Group specs by division -> section -> document
  const groupedSpecs = specs.reduce((acc, spec) => {
    const div = spec.division || 'overhead';
    // Use section field, fallback to category for backwards compatibility
    const section = spec.section || spec.category || 'General';
    
    if (!acc[div]) acc[div] = {};
    if (!acc[div][section]) acc[div][section] = [];
    acc[div][section].push(spec);
    
    return acc;
  }, {});
  
  // Division order for display
  const divisionOrder = ['overhead', 'underground'];

  if (loading && specs.length === 0) {
    return <LoadingState bgcolor={mode === 'dark' ? '#0f0f1a' : '#f8fafc'} />;
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: mode === 'dark' ? '#0f0f1a' : '#f1f5f9' }}>
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: mode === 'dark' ? '#1e1e2e' : '#ffffff', borderBottom: `1px solid ${borderColor}` }}>
        <Toolbar>
          <IconButton 
            onClick={() => navigate('/qa/dashboard')} 
            sx={{ mr: 2, color: textPrimary }}
            aria-label="Go back to QA dashboard"
          >
            <ArrowBackIcon />
          </IconButton>
          <MenuBookIcon sx={{ mr: 1.5, color: '#6366f1' }} />
          <Typography variant="h6" sx={{ flexGrow: 1, color: textPrimary, fontWeight: 700 }}>
            Spec Library
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setSpecDialog({ open: true, spec: null })}
            sx={{ bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}
          >
            Add Spec
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

        {/* Search and Filter */}
        <Paper sx={{ p: 2, mb: 4, bgcolor: cardBg, border: `1px solid ${borderColor}`, borderRadius: 2 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                placeholder="Search specs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: textSecondary }} />
                    </InputAdornment>
                  ),
                }}
                size="small"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant={divisionFilter === '' ? 'contained' : 'outlined'}
                  onClick={() => setDivisionFilter('')}
                  size="small"
                  sx={{ 
                    minWidth: 60,
                    bgcolor: divisionFilter === '' ? '#6366f1' : 'transparent',
                    borderColor: '#6366f1',
                    color: divisionFilter === '' ? 'white' : '#6366f1',
                  }}
                >
                  All
                </Button>
                {Object.entries(DIVISION_CONFIG).map(([key, config]) => (
                  <Button
                    key={key}
                    variant={divisionFilter === key ? 'contained' : 'outlined'}
                    onClick={() => setDivisionFilter(key)}
                    size="small"
                    startIcon={<config.icon />}
                    sx={{ 
                      flex: 1,
                      bgcolor: divisionFilter === key ? config.color : 'transparent',
                      borderColor: config.color,
                      color: divisionFilter === key ? 'white' : config.color,
                      fontWeight: 600,
                      '&:hover': {
                        bgcolor: divisionFilter === key ? config.color : `${config.color}20`,
                      }
                    }}
                  >
                    {config.label.replace(' SPEC', '')}
                  </Button>
                ))}
              </Box>
            </Grid>
          </Grid>
        </Paper>

        {/* Specs by Division -> Section -> Document Number */}
        {Object.keys(groupedSpecs).length === 0 ? (
          <Paper sx={{ p: 6, textAlign: 'center', bgcolor: cardBg, border: `1px solid ${borderColor}`, borderRadius: 3 }}>
            <MenuBookIcon sx={{ fontSize: 64, color: textSecondary, mb: 2 }} />
            <Typography variant="h6" sx={{ color: textPrimary, mb: 1 }}>No specs found</Typography>
            <Typography variant="body2" sx={{ color: textSecondary, mb: 3 }}>
              {search || divisionFilter ? 'Try adjusting your search or filter' : 'Get started by adding your first spec'}
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setSpecDialog({ open: true, spec: null })}
              sx={{ bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}
            >
              Add First Spec
            </Button>
          </Paper>
        ) : (
          divisionOrder
            .filter(div => groupedSpecs[div])
            .map((division) => {
              const divConfig = DIVISION_CONFIG[division] || DIVISION_CONFIG.overhead;
              const divSections = groupedSpecs[division];
              const totalSpecs = Object.values(divSections).reduce((sum, arr) => sum + arr.length, 0);
              
              return (
                <Accordion 
                  key={division} 
                  defaultExpanded 
                  sx={{ 
                    bgcolor: cardBg, 
                    border: `3px solid ${divConfig.color}`, 
                    borderRadius: '16px !important',
                    mb: 3,
                    '&:before': { display: 'none' }
                  }}
                >
                  <AccordionSummary 
                    expandIcon={<ExpandMoreIcon sx={{ color: 'white' }} />}
                    sx={{ 
                      bgcolor: divConfig.color,
                      borderRadius: '12px 12px 0 0',
                      '& .MuiAccordionSummary-content': { my: 1.5 }
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <divConfig.icon sx={{ color: 'white', fontSize: 32 }} />
                      <Box>
                        <Typography variant="h5" sx={{ color: 'white', fontWeight: 800, letterSpacing: 1 }}>
                          {divConfig.label}
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.95)', fontWeight: 500 }}>
                          {totalSpecs} spec{totalSpecs === 1 ? '' : 's'} • {Object.keys(divSections).length} section{Object.keys(divSections).length === 1 ? '' : 's'}
                        </Typography>
                      </Box>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 2, px: 2 }}>
                    {/* Sections within this division */}
                    {Object.entries(divSections)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([section, sectionSpecs]) => (
                        <Accordion 
                          key={section} 
                          defaultExpanded={sectionSpecs.length <= 6}
                          sx={{ 
                            bgcolor: 'transparent',
                            boxShadow: 'none',
                            border: `1px solid ${borderColor}`,
                            borderLeft: `4px solid ${divConfig.color}`,
                            borderRadius: '0 8px 8px 0 !important',
                            mb: 1.5,
                            '&:before': { display: 'none' }
                          }}
                        >
                          <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: textSecondary }} />}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                              <CategoryIcon sx={{ color: divConfig.color, fontSize: 20 }} />
                              <Typography sx={{ color: textPrimary, fontWeight: 700, fontSize: '1rem' }}>
                                {section}
                              </Typography>
                              <Chip 
                                label={`${sectionSpecs.length} spec${sectionSpecs.length === 1 ? '' : 's'}`}
                                size="small"
                                sx={{ bgcolor: `${divConfig.color}30`, color: divConfig.color, fontSize: '0.75rem', fontWeight: 700 }}
                              />
                            </Box>
                          </AccordionSummary>
                          <AccordionDetails>
                            <Grid container spacing={2}>
                              {sectionSpecs
                                .sort((a, b) => (a.documentNumber || '').localeCompare(b.documentNumber || ''))
                                .map((spec) => (
                                  <Grid item xs={12} sm={6} md={4} key={spec._id}>
                                    <SpecCard
                                      spec={spec}
                                      onDownload={handleDownload}
                                      onEdit={handleEditSpec}
                                      onDelete={handleDeleteSpec}
                                      onViewVersions={handleViewVersions}
                                      themeProps={themeProps}
                                    />
                                  </Grid>
                                ))}
                            </Grid>
                          </AccordionDetails>
                        </Accordion>
                      ))}
                  </AccordionDetails>
                </Accordion>
              );
            })
        )}
      </Container>

      {/* Add/Edit Dialog */}
      <SpecDialog
        open={specDialog.open}
        spec={specDialog.spec}
        utilities={utilities}
        onClose={() => setSpecDialog({ open: false, spec: null })}
        onSubmit={handleSubmitSpec}
      />

      {/* Version History Dialog */}
      <VersionHistoryDialog
        open={versionDialog.open}
        spec={versionDialog.spec}
        onClose={() => setVersionDialog({ open: false, spec: null })}
        onDownloadVersion={handleDownloadVersion}
      />

      {/* Delete Confirmation */}
      <Dialog 
        open={deleteConfirm.open} 
        onClose={() => setDeleteConfirm({ open: false, spec: null })}
      >
        <DialogTitle>Delete Spec?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete &quot;{deleteConfirm.spec?.name}&quot;? 
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm({ open: false, spec: null })}>Cancel</Button>
          <Button 
            variant="contained" 
            color="error"
            onClick={() => handleDelete(deleteConfirm.spec)}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SpecLibrary;

