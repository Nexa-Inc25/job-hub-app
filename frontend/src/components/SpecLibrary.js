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
import {
  ArrowBack as ArrowBackIcon,
  MenuBook as MenuBookIcon,
  Search as SearchIcon,
  Add as AddIcon,
  CloudUpload as CloudUploadIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  ExpandMore as ExpandMoreIcon,
  History as HistoryIcon,
  Description as DescriptionIcon,
  ElectricalServices as ElectricalServicesIcon,
  Landscape as LandscapeIcon,
  Security as SecurityIcon,
  Build as BuildIcon,
  Category as CategoryIcon,
  FilterList as FilterListIcon,
} from '@mui/icons-material';
import { useThemeMode } from '../ThemeContext';

// Category icons and colors
const CATEGORY_CONFIG = {
  overhead: { icon: ElectricalServicesIcon, color: '#f59e0b', label: 'Overhead Construction' },
  underground: { icon: LandscapeIcon, color: '#8b5cf6', label: 'Underground Construction' },
  safety: { icon: SecurityIcon, color: '#ef4444', label: 'Safety Standards' },
  equipment: { icon: BuildIcon, color: '#06b6d4', label: 'Equipment Specs' },
  materials: { icon: CategoryIcon, color: '#22c55e', label: 'Material Specifications' },
  procedures: { icon: DescriptionIcon, color: '#6366f1', label: 'Work Procedures' },
  forms: { icon: DescriptionIcon, color: '#ec4899', label: 'Required Forms' },
  traffic_control: { icon: SecurityIcon, color: '#f97316', label: 'Traffic Control Plans' },
  environmental: { icon: LandscapeIcon, color: '#14b8a6', label: 'Environmental Requirements' },
  other: { icon: DescriptionIcon, color: '#64748b', label: 'Other' },
};

// Spec Card Component
const SpecCard = ({ spec, onDownload, onEdit, onDelete, onViewVersions, themeProps }) => {
  const { cardBg, textPrimary, textSecondary, borderColor } = themeProps;
  const config = CATEGORY_CONFIG[spec.category] || CATEGORY_CONFIG.other;
  const CategoryIcon = config.icon;

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
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1.5 }}>
          <Box sx={{ bgcolor: `${config.color}20`, borderRadius: 2, p: 1 }}>
            <CategoryIcon sx={{ color: config.color, fontSize: 24 }} />
          </Box>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ color: textPrimary, fontWeight: 600, lineHeight: 1.3 }} noWrap title={spec.name}>
              {spec.name}
            </Typography>
            {spec.documentNumber && (
              <Typography variant="caption" sx={{ color: textSecondary }}>
                {spec.documentNumber}
              </Typography>
            )}
          </Box>
        </Box>
        
        <Chip 
          label={config.label}
          size="small"
          sx={{ 
            bgcolor: `${config.color}20`,
            color: config.color,
            fontWeight: 600,
            fontSize: '0.7rem',
            mb: 1
          }}
        />
        
        {spec.description && (
          <Typography variant="body2" sx={{ color: textSecondary, mt: 1 }} noWrap title={spec.description}>
            {spec.description}
          </Typography>
        )}
        
        <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
          {spec.currentVersion && (
            <Chip 
              label={`v${spec.currentVersion}`}
              size="small"
              sx={{ bgcolor: '#6366f120', color: '#6366f1', fontSize: '0.65rem' }}
            />
          )}
          {spec.utilityId?.shortName && (
            <Chip 
              label={spec.utilityId.shortName}
              size="small"
              sx={{ bgcolor: '#22c55e20', color: '#22c55e', fontSize: '0.65rem' }}
            />
          )}
        </Box>
      </CardContent>
      
      <CardActions sx={{ borderTop: `1px solid ${borderColor}`, px: 2, py: 1 }}>
        <Tooltip title="Download">
          <IconButton size="small" onClick={() => onDownload(spec)}>
            <DownloadIcon fontSize="small" sx={{ color: '#22c55e' }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Version History">
          <IconButton size="small" onClick={() => onViewVersions(spec)}>
            <HistoryIcon fontSize="small" sx={{ color: '#6366f1' }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Edit">
          <IconButton size="small" onClick={() => onEdit(spec)}>
            <EditIcon fontSize="small" sx={{ color: '#f59e0b' }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Delete">
          <IconButton size="small" onClick={() => onDelete(spec)}>
            <DeleteIcon fontSize="small" sx={{ color: '#ef4444' }} />
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
    category: 'overhead',
    subcategory: '',
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

  useEffect(() => {
    if (spec) {
      setFormData({
        name: spec.name || '',
        description: spec.description || '',
        documentNumber: spec.documentNumber || '',
        category: spec.category || 'overhead',
        subcategory: spec.subcategory || '',
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
        category: 'overhead',
        subcategory: '',
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
        {isEdit ? (isNewVersion ? 'Upload New Version' : 'Edit Spec') : 'Add New Spec'}
      </DialogTitle>
      <DialogContent sx={{ bgcolor: mode === 'dark' ? '#1e1e2e' : '#fff', pt: 2 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Spec Name"
              value={formData.name}
              onChange={handleChange('name')}
              required
            />
          </Grid>
          
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth required>
              <InputLabel>Category</InputLabel>
              <Select value={formData.category} onChange={handleChange('category')} label="Category">
                {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                  <MenuItem key={key} value={key}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <config.icon sx={{ color: config.color, fontSize: 18 }} />
                      {config.label}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth required>
              <InputLabel>Utility</InputLabel>
              <Select value={formData.utilityId} onChange={handleChange('utilityId')} label="Utility">
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
              label="Document Number"
              value={formData.documentNumber}
              onChange={handleChange('documentNumber')}
              placeholder="e.g., TD-0100S-001"
            />
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
              label="Description"
              value={formData.description}
              onChange={handleChange('description')}
            />
          </Grid>
          
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Subcategory"
              value={formData.subcategory}
              onChange={handleChange('subcategory')}
              placeholder="e.g., Pole Installation"
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
          
          <Grid item xs={12}>
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
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept=".pdf,.doc,.docx,.xls,.xlsx"
              onChange={handleFileChange}
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
              {file ? file.name : (isEdit ? 'Upload New Version (optional)' : 'Select File')}
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
          {loading ? <CircularProgress size={20} color="inherit" /> : (isEdit ? 'Save' : 'Upload')}
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
                    <IconButton onClick={() => onDownloadVersion(spec._id, version.versionNumber)}>
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
  const [categoryFilter, setCategoryFilter] = useState('');
  const [specDialog, setSpecDialog] = useState({ open: false, spec: null });
  const [versionDialog, setVersionDialog] = useState({ open: false, spec: null });
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, spec: null });
  
  const navigate = useNavigate();
  const { mode } = useThemeMode();

  const cardBg = mode === 'dark' ? '#1e1e2e' : '#ffffff';
  const textPrimary = mode === 'dark' ? '#e2e8f0' : '#1e293b';
  const textSecondary = mode === 'dark' ? '#94a3b8' : '#64748b';
  const borderColor = mode === 'dark' ? '#334155' : '#e2e8f0';

  const themeProps = { cardBg, textPrimary, textSecondary, borderColor };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [specsRes, utilitiesRes] = await Promise.all([
        api.get('/api/specs', { params: { search, category: categoryFilter } }),
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
  }, [search, categoryFilter]);

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
      const url = window.URL.createObjectURL(new Blob([response.data]));
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
      const url = window.URL.createObjectURL(new Blob([response.data]));
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

  // Group specs by category
  const groupedSpecs = specs.reduce((acc, spec) => {
    const cat = spec.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(spec);
    return acc;
  }, {});

  if (loading && specs.length === 0) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: mode === 'dark' ? '#0f0f1a' : '#f8fafc' }}>
        <CircularProgress size={48} sx={{ color: '#6366f1' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: mode === 'dark' ? '#0f0f1a' : '#f1f5f9' }}>
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: mode === 'dark' ? '#1e1e2e' : '#ffffff', borderBottom: `1px solid ${borderColor}` }}>
        <Toolbar>
          <IconButton onClick={() => navigate('/qa/dashboard')} sx={{ mr: 2, color: textPrimary }}>
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
              <FormControl fullWidth size="small">
                <InputLabel>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <FilterListIcon fontSize="small" /> Category
                  </Box>
                </InputLabel>
                <Select 
                  value={categoryFilter} 
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  label="Category"
                >
                  <MenuItem value="">All Categories</MenuItem>
                  {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                    <MenuItem key={key} value={key}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <config.icon sx={{ color: config.color, fontSize: 18 }} />
                        {config.label}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </Paper>

        {/* Specs by Category */}
        {Object.keys(groupedSpecs).length === 0 ? (
          <Paper sx={{ p: 6, textAlign: 'center', bgcolor: cardBg, border: `1px solid ${borderColor}`, borderRadius: 3 }}>
            <MenuBookIcon sx={{ fontSize: 64, color: textSecondary, mb: 2 }} />
            <Typography variant="h6" sx={{ color: textPrimary, mb: 1 }}>No specs found</Typography>
            <Typography variant="body2" sx={{ color: textSecondary, mb: 3 }}>
              {search || categoryFilter ? 'Try adjusting your search or filter' : 'Get started by adding your first spec'}
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
          Object.entries(groupedSpecs)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([category, categorySpecs]) => {
              const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.other;
              return (
                <Accordion 
                  key={category} 
                  defaultExpanded 
                  sx={{ 
                    bgcolor: cardBg, 
                    border: `1px solid ${borderColor}`, 
                    borderRadius: '12px !important',
                    mb: 2,
                    '&:before': { display: 'none' }
                  }}
                >
                  <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: textPrimary }} />}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Box sx={{ bgcolor: `${config.color}20`, borderRadius: 2, p: 0.75 }}>
                        <config.icon sx={{ color: config.color, fontSize: 20 }} />
                      </Box>
                      <Typography sx={{ color: textPrimary, fontWeight: 600 }}>
                        {config.label}
                      </Typography>
                      <Chip 
                        label={categorySpecs.length}
                        size="small"
                        sx={{ bgcolor: `${config.color}20`, color: config.color }}
                      />
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Grid container spacing={2}>
                      {categorySpecs.map((spec) => (
                        <Grid item xs={12} sm={6} md={4} key={spec._id}>
                          <SpecCard
                            spec={spec}
                            onDownload={handleDownload}
                            onEdit={(s) => setSpecDialog({ open: true, spec: s })}
                            onDelete={(s) => setDeleteConfirm({ open: true, spec: s })}
                            onViewVersions={(s) => setVersionDialog({ open: true, spec: s })}
                            themeProps={themeProps}
                          />
                        </Grid>
                      ))}
                    </Grid>
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

