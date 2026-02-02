// src/components/WorkOrderDetails.js - Full Job Details & Management Page
import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api';
import { getPhotoUrl, getDocumentUrl, exportFolderToEmail } from './shared';
import {
  Container,
  Typography,
  Box,
  Grid,
  Card,
  CardContent,
  Button,
  TextField,
  Chip,
  Divider,
  IconButton,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  List,
  ListItem,
  ListItemIcon,
  Tooltip,
  CircularProgress,
  AppBar,
  Toolbar,
  LinearProgress,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ScheduleIcon from '@mui/icons-material/Schedule';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SendIcon from '@mui/icons-material/Send';
import BuildIcon from '@mui/icons-material/Build';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import SecurityIcon from '@mui/icons-material/Security';
import ConstructionIcon from '@mui/icons-material/Construction';
import DescriptionIcon from '@mui/icons-material/Description';
import PersonIcon from '@mui/icons-material/Person';
import CalendarIcon from '@mui/icons-material/CalendarMonth';
import ChatIcon from '@mui/icons-material/Chat';
import FolderIcon from '@mui/icons-material/Folder';
import RefreshIcon from '@mui/icons-material/Refresh';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import AssignmentIcon from '@mui/icons-material/Assignment';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import EmailIcon from '@mui/icons-material/Email';
import PdfIcon from '@mui/icons-material/PictureAsPdf';
import SketchIcon from '@mui/icons-material/Architecture';
import InstructionsIcon from '@mui/icons-material/Assignment';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

// Helper to determine status color (avoids nested ternary) - uses high-contrast colors
const getTimelineStatusColor = (status, defaultColor) => {
  if (status === 'approved') return '#2e7d32'; // success dark
  if (status === 'rejected') return '#c62828'; // error dark
  return defaultColor;
};

// Extracted component to reduce cognitive complexity
const WorkflowTimelineItem = ({ date, label, color, status }) => {
  if (!date) return null;
  const statusColor = getTimelineStatusColor(status, color);
  const displayLabel = status ? label + ': ' + status.toUpperCase() : label;
  
  return (
    <Box sx={{ pl: 1, borderLeft: '3px solid', borderColor: statusColor, minWidth: 150 }}>
      <Typography variant="caption" display="block" fontWeight="bold" color={statusColor}>
        {displayLabel}
      </Typography>
      <Typography variant="caption" display="block" color="text.secondary">
        {new Date(date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
      </Typography>
    </Box>
  );
};

WorkflowTimelineItem.propTypes = {
  date: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
  label: PropTypes.string.isRequired,
  color: PropTypes.string.isRequired,
  status: PropTypes.string
};

// High-contrast color palette for accessibility
const A11Y_COLORS = {
  info: '#0369a1',      // Darker blue for better contrast
  warning: '#b45309',   // Darker amber for better contrast
  primary: '#1565c0',   // MUI primary dark
  secondary: '#7b1fa2', // MUI secondary dark
  success: '#2e7d32',   // MUI success dark
};

// Workflow Progress Timeline component
const WorkflowProgressTimeline = ({ job }) => {
  const hasActivity = job.assignedToGFDate || job.preFieldDate || job.crewSubmittedDate;
  
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
      <WorkflowTimelineItem date={job.createdAt} label="Job Created" color={A11Y_COLORS.info} />
      <WorkflowTimelineItem date={job.assignedToGFDate} label="Assigned to GF" color={A11Y_COLORS.primary} />
      <WorkflowTimelineItem date={job.preFieldDate} label="Pre-Fielded" color={A11Y_COLORS.info} />
      {job.assignedDate && job.assignedTo && (
        <WorkflowTimelineItem date={job.assignedDate} label="Crew Assigned" color={A11Y_COLORS.secondary} />
      )}
      <WorkflowTimelineItem date={job.crewSubmittedDate} label="Crew Submitted" color={A11Y_COLORS.warning} />
      <WorkflowTimelineItem date={job.gfReviewDate} label="GF Review" color={A11Y_COLORS.success} status={job.gfReviewStatus} />
      <WorkflowTimelineItem date={job.pmApprovalDate} label="PM Approval" color={A11Y_COLORS.success} status={job.pmApprovalStatus} />
      <WorkflowTimelineItem date={job.completedDate} label="Completed" color={A11Y_COLORS.success} />
      <WorkflowTimelineItem date={job.billedDate} label="Billed" color="secondary.main" />
      <WorkflowTimelineItem date={job.invoicedDate} label="Invoiced (Paid)" color="success.main" />
      {!hasActivity && (
        <Typography variant="caption" color="text.secondary">
          No workflow activity yet
        </Typography>
      )}
    </Box>
  );
};

WorkflowProgressTimeline.propTypes = {
  job: PropTypes.shape({
    createdAt: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
    assignedToGFDate: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
    preFieldDate: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
    assignedDate: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
    assignedTo: PropTypes.object,
    crewSubmittedDate: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
    gfReviewDate: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
    gfReviewStatus: PropTypes.string,
    pmApprovalDate: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
    pmApprovalStatus: PropTypes.string,
    completedDate: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
    billedDate: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
    invoicedDate: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)])
  }).isRequired
};

const WorkOrderDetails = () => {
  const { id: jobId } = useParams();
  const navigate = useNavigate();
  
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  
  // Dependencies state
  const [dependencies, setDependencies] = useState([]);
  const [depDialogOpen, setDepDialogOpen] = useState(false);
  const [editingDep, setEditingDep] = useState(null);
  const [depForm, setDepForm] = useState({
    type: 'usa',
    description: '',
    status: 'required',
    scheduledDate: '',
    ticketNumber: '',
    notes: ''
  });
  
  // Notes/Chat state
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [noteType, setNoteType] = useState('update');
  
  // Pre-field photo upload state
  const [preFieldPhotos, setPreFieldPhotos] = useState([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUploadProgress, setPhotoUploadProgress] = useState(0);
  const photoInputRef = React.useRef(null);
  
  // Export to email state
  const [exportLoading, setExportLoading] = useState(false);
  
  // Construction sketches and crew instructions
  const [constructionSketches, setConstructionSketches] = useState([]);
  const [crewInstructions, setCrewInstructions] = useState([]);
  
  // User info - reserved for future role-based features
  // const [userRole, setUserRole] = useState(null);
  // const [canApprove, setCanApprove] = useState(false);

  // Fetch job details
  const fetchJobDetails = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/jobs/${jobId}/full-details`);
      setJob(response.data);
      setDependencies(response.data.dependencies || []);
      setNotes(response.data.notes || []);
      setError('');
    } catch (err) {
      console.error('Failed to fetch job details:', err);
      setError('Failed to load job details');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchJobDetails();
  }, [fetchJobDetails]);

  // Fetch pre-field photos, construction sketches, and crew instructions from folder structure
  const fetchPreFieldAssets = useCallback(() => {
    if (!job?.folders) return;
    
    // Find ACI folder
    const aciFolder = job.folders.find(f => f.name === 'ACI');
    if (!aciFolder?.subfolders) return;
    
    // GF Audit photos (pre-field photos)
    const gfAuditFolder = aciFolder.subfolders.find(sf => sf.name === 'GF Audit');
    if (gfAuditFolder?.documents) {
      setPreFieldPhotos(gfAuditFolder.documents);
    }
    
    // Construction Sketches from Pre-Field Documents
    const preFieldFolder = aciFolder.subfolders.find(sf => sf.name === 'Pre-Field Documents');
    if (preFieldFolder?.subfolders) {
      const sketchesFolder = preFieldFolder.subfolders.find(sf => sf.name === 'Construction Sketches');
      if (sketchesFolder?.documents) {
        setConstructionSketches(sketchesFolder.documents);
      }
    }
    
    // Crew Instructions from Field As Built (job package PDF)
    const fieldAsBuiltFolder = aciFolder.subfolders.find(sf => sf.name === 'Field As Built');
    if (fieldAsBuiltFolder?.documents) {
      setCrewInstructions(fieldAsBuiltFolder.documents);
    }
  }, [job]);

  useEffect(() => {
    fetchPreFieldAssets();
  }, [fetchPreFieldAssets]);

  // Handle pre-field photo upload
  const handlePhotoUpload = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setPhotoUploading(true);
    setPhotoUploadProgress(0);

    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append('photos', file);
      }
      formData.append('folder', 'ACI');
      formData.append('subfolder', 'GF Audit');

      const response = await api.post(`/api/jobs/${jobId}/photos`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setPhotoUploadProgress(percentCompleted);
        }
      });

      if (response.data.photos) {
        setPreFieldPhotos(prev => [...prev, ...response.data.photos]);
      }
      
      setSnackbar({ open: true, message: `${files.length} photo(s) uploaded successfully`, severity: 'success' });
      
      // Refresh job data to get updated folder structure
      fetchJobDetails();
    } catch (err) {
      console.error('Photo upload error:', err);
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to upload photos', severity: 'error' });
    } finally {
      setPhotoUploading(false);
      setPhotoUploadProgress(0);
      // Reset file input
      if (photoInputRef.current) {
        photoInputRef.current.value = '';
      }
    }
  };

  // Export GF Audit photos to email - uses shared utility
  const handleExportToEmail = async () => {
    if (!job || preFieldPhotos.length === 0) {
      setSnackbar({ open: true, message: 'No photos to export', severity: 'warning' });
      return;
    }
    
    setExportLoading(true);
    try {
      const apiBase = import.meta.env.VITE_API_URL || 'https://api.fieldledger.io';
      const exportUrl = `${apiBase}/api/jobs/${job._id}/folders/ACI/export?subfolder=GF%20Audit`;
      
      const result = await exportFolderToEmail({ exportUrl, job, folderName: 'GF Audit' });
      setSnackbar({ open: true, message: result.message, severity: 'success' });
    } catch (err) {
      console.error('Export to email error:', err);
      setSnackbar({ open: true, message: err.message || 'Failed to export', severity: 'error' });
    } finally {
      setExportLoading(false);
    }
  };

  // Format date helper
  const formatDate = (date) => {
    if (!date) return 'Not set';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatDateTime = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  // Helper to get photo display name (avoids nested template literals)
  const getPhotoDisplayName = (photo, idx) => {
    return photo.name || 'Photo ' + (idx + 1);
  };

  // Status helpers
  const getStatusColor = (status) => {
    const colors = {
      'new': 'warning',
      'assigned_to_gf': 'info',
      'pre_fielding': 'info',
      'scheduled': 'primary',
      'in_progress': 'primary',
      'pending_gf_review': 'warning',
      'pending_pm_approval': 'warning',
      'ready_to_submit': 'success',
      'submitted': 'success',
      'billed': 'secondary',
      'invoiced': 'default',
    };
    return colors[status] || 'default';
  };

  // Get high-contrast chip styles for status (accessibility fix)
  const getStatusChipSx = (status) => {
    const color = getStatusColor(status);
    if (color === 'info') {
      return { bgcolor: '#0369a1', color: '#fff', fontWeight: 600 };
    }
    if (color === 'warning') {
      return { bgcolor: '#b45309', color: '#fff', fontWeight: 600 };
    }
    return { fontWeight: 600 };
  };

  const getStatusLabel = (status) => {
    const labels = {
      'new': 'New',
      'assigned_to_gf': 'Assigned to GF',
      'pre_fielding': 'Pre-Fielding',
      'scheduled': 'Scheduled',
      'in_progress': 'In Progress',
      'pending_gf_review': 'Awaiting GF Review',
      'pending_pm_approval': 'Awaiting PM Approval',
      'ready_to_submit': 'Ready to Submit',
      'submitted': 'Submitted',
      'billed': 'Billed',
      'invoiced': 'Invoiced',
    };
    return labels[status] || status;
  };

  // Dependency type helpers
  const getDependencyIcon = (type) => {
    const icons = {
      'usa': <ConstructionIcon />,
      'vegetation': <DescriptionIcon />,
      'traffic_control': <SecurityIcon />,
      'no_parks': <DescriptionIcon />,
      'cwc': <BuildIcon />,
      'afw_type': <BuildIcon />,
      'special_equipment': <LocalShippingIcon />,
      'civil': <ConstructionIcon />,
    };
    return icons[type] || <BuildIcon />;
  };

  const getDependencyLabel = (type) => {
    const labels = {
      'usa': 'USA',
      'vegetation': 'Vegetation',
      'traffic_control': 'Traffic Control',
      'no_parks': 'No Parks',
      'cwc': 'CWC',
      'afw_type': 'AFW Type',
      'special_equipment': 'Special Equipment',
      'civil': 'Civil',
    };
    return labels[type] || type;
  };

  const getDependencyStatusColor = (status) => {
    switch (status) {
      case 'not_required': return 'success';
      case 'scheduled': return 'info';
      case 'required': return 'warning';
      case 'check': return 'default';
      default: return 'default';
    }
  };

  // Get high-contrast chip styles for dependency status (accessibility fix)
  const getDependencyChipSx = (status) => {
    const base = { height: 20, fontSize: '0.65rem', fontWeight: 600 };
    if (status === 'required') {
      return { ...base, bgcolor: '#fef3c7', color: '#92400e', border: '1px solid #b45309' };
    }
    if (status === 'scheduled') {
      return { ...base, bgcolor: '#e0f2fe', color: '#0369a1', border: '1px solid #0369a1' };
    }
    if (status === 'check') {
      return { ...base, bgcolor: '#f3f4f6', color: '#1f2937', border: '1px solid #374151' };
    }
    return base;
  };

  const getDependencyStatusLabel = (status) => {
    const labels = {
      'required': 'REQUIRED',
      'check': 'CHECK',
      'scheduled': 'SCHEDULED',
      'not_required': 'NOT REQUIRED',
    };
    return labels[status] || status;
  };

  // Add dependency
  const handleAddDependency = async () => {
    try {
      const response = await api.post(`/api/jobs/${jobId}/dependencies`, depForm);
      setDependencies([...dependencies, response.data]);
      setDepDialogOpen(false);
      setDepForm({
        type: 'usa',
        description: '',
        status: 'required',
        scheduledDate: '',
        ticketNumber: '',
        notes: ''
      });
      setSnackbar({ open: true, message: 'Dependency added', severity: 'success' });
    } catch (err) {
      console.error('Add dependency error:', err);
      setSnackbar({ open: true, message: 'Failed to add dependency', severity: 'error' });
    }
  };

  // Update dependency
  const handleUpdateDependency = async () => {
    if (!editingDep) return;
    try {
      const response = await api.put(`/api/jobs/${jobId}/dependencies/${editingDep._id}`, depForm);
      setDependencies(dependencies.map(d => d._id === editingDep._id ? response.data : d));
      setDepDialogOpen(false);
      setEditingDep(null);
      setDepForm({
        type: 'usa',
        description: '',
        status: 'required',
        scheduledDate: '',
        ticketNumber: '',
        notes: ''
      });
      setSnackbar({ open: true, message: 'Dependency updated', severity: 'success' });
    } catch (err) {
      console.error('Update dependency error:', err);
      setSnackbar({ open: true, message: 'Failed to update dependency', severity: 'error' });
    }
  };

  // Delete dependency
  const handleDeleteDependency = async (depId) => {
    if (!globalThis.confirm('Delete this dependency?')) return;
    try {
      await api.delete(`/api/jobs/${jobId}/dependencies/${depId}`);
      setDependencies(dependencies.filter(d => d._id !== depId));
      setSnackbar({ open: true, message: 'Dependency deleted', severity: 'success' });
    } catch (err) {
      console.error('Delete dependency error:', err);
      setSnackbar({ open: true, message: 'Failed to delete dependency', severity: 'error' });
    }
  };

  // Open edit dialog
  const handleEditDependency = (dep) => {
    setEditingDep(dep);
    setDepForm({
      type: dep.type,
      description: dep.description || '',
      status: dep.status,
      scheduledDate: dep.scheduledDate ? dep.scheduledDate.split('T')[0] : '',
      ticketNumber: dep.ticketNumber || '',
      notes: dep.notes || ''
    });
    setDepDialogOpen(true);
  };

  // Add note
  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    try {
      const response = await api.post(`/api/jobs/${jobId}/notes`, {
        message: newNote,
        noteType: noteType
      });
      setNotes([...notes, response.data]);
      setNewNote('');
      setSnackbar({ open: true, message: 'Note added', severity: 'success' });
    } catch (err) {
      console.error('Add note error:', err);
      setSnackbar({ open: true, message: 'Failed to add note', severity: 'error' });
    }
  };

  // Note type colors
  const getNoteTypeColor = (type) => {
    switch (type) {
      case 'issue': return 'error';
      case 'question': return 'warning';
      case 'resolution': return 'success';
      default: return 'info';
    }
  };

  // High-contrast chip styles for note types (accessibility fix)
  const getNoteTypeChipSx = (type) => {
    const base = { height: 16, fontSize: '0.6rem', fontWeight: 600 };
    const color = getNoteTypeColor(type);
    if (color === 'info') {
      return { ...base, bgcolor: '#0369a1', color: '#fff' };
    }
    if (color === 'warning') {
      return { ...base, bgcolor: '#b45309', color: '#fff' };
    }
    return base;
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error || !job) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error">{error || 'Job not found'}</Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/dashboard')} sx={{ mt: 2 }}>
          Back to Dashboard
        </Button>
      </Container>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* App Bar */}
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar>
          <IconButton edge="start" onClick={() => navigate('/dashboard')} sx={{ mr: 2 }} aria-label="Back to dashboard">
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {job.pmNumber || job.woNumber || job.title || 'Work Order Details'}
          </Typography>
          <Chip
            label={getStatusLabel(job.status)}
            color={getStatusColor(job.status)}
            sx={{ mr: 2, ...getStatusChipSx(job.status) }}
          />
          <Tooltip title="Refresh">
            <IconButton onClick={fetchJobDetails} aria-label="Refresh">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            component={Link}
            to={`/jobs/${jobId}/tailboard`}
            startIcon={<PlaylistAddCheckIcon />}
            variant="contained"
            color="primary"
            sx={{ ml: 1 }}
          >
            Tailboard
          </Button>
          <Button
            component={Link}
            to={`/jobs/${jobId}/log-unit`}
            startIcon={<ReceiptLongIcon />}
            variant="contained"
            color="success"
            sx={{ ml: 1 }}
          >
            Log Unit
          </Button>
          <Button
            component={Link}
            to={`/jobs/${jobId}/files`}
            startIcon={<FolderIcon />}
            variant="outlined"
            sx={{ ml: 1 }}
          >
            Files
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 3 }}>
        <Grid container spacing={2}>

          {/* Quick Actions Bar - Always visible */}
          <Grid item xs={12}>
            <Card sx={{ 
              borderRadius: 2, 
              bgcolor: 'primary.dark',
              color: 'primary.contrastText',
              mb: 1
            }}>
              <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
                  <Box>
                    <Typography variant="h6" fontWeight="bold">
                      {job.pmNumber || job.woNumber || job.title || 'Work Order'}
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                      {job.address || 'No address specified'}
                    </Typography>
                  </Box>
                  <Box display="flex" gap={1.5} flexWrap="wrap">
                    <Button
                      component={Link}
                      to={`/jobs/${jobId}/tailboard`}
                      startIcon={<PlaylistAddCheckIcon />}
                      variant="contained"
                      size="large"
                      sx={{ 
                        bgcolor: 'warning.main',
                        color: 'warning.contrastText',
                        fontWeight: 700,
                        px: 3,
                        '&:hover': { bgcolor: 'warning.dark' }
                      }}
                    >
                      Tailboard
                    </Button>
                    <Button
                      component={Link}
                      to={`/jobs/${jobId}/log-unit`}
                      startIcon={<ReceiptLongIcon />}
                      variant="contained"
                      size="large"
                      sx={{ 
                        bgcolor: 'success.main',
                        color: 'success.contrastText',
                        fontWeight: 700,
                        px: 3,
                        '&:hover': { bgcolor: 'success.dark' }
                      }}
                    >
                      Log Unit
                    </Button>
                    <Button
                      component={Link}
                      to={`/jobs/${jobId}/closeout`}
                      startIcon={<AssignmentIcon />}
                      variant="contained"
                      size="large"
                      sx={{ 
                        bgcolor: 'info.main',
                        color: 'info.contrastText',
                        fontWeight: 700,
                        px: 3,
                        '&:hover': { bgcolor: 'info.dark' }
                      }}
                    >
                      Close Out
                    </Button>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* ROW 1: Three vertical columns - Job Info | Dependencies | Notes */}
          
          {/* COLUMN 1 - Job Info & Schedule */}
          <Grid item xs={12} md={4}>
            {/* Job Info Card */}
            <Card sx={{ mb: 3, borderRadius: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom display="flex" alignItems="center" gap={1}>
                  <DescriptionIcon color="primary" />
                  Job Information
                </Typography>
                <Divider sx={{ mb: 2 }} />
                
                <Box sx={{ '& > *': { mb: 1.5 } }}>
                  <Typography variant="body2">
                    <strong>Title:</strong> {job.title || 'Untitled'}
                  </Typography>
                  {job.pmNumber && (
                    <Typography variant="body2">
                      <strong>PM Number:</strong> {job.pmNumber}
                    </Typography>
                  )}
                  {job.woNumber && (
                    <Typography variant="body2">
                      <strong>WO Number:</strong> {job.woNumber}
                    </Typography>
                  )}
                  {job.address && (
                    <Typography variant="body2">
                      <strong>Address:</strong> {job.address}
                    </Typography>
                  )}
                  {job.client && (
                    <Typography variant="body2">
                      <strong>Client:</strong> {job.client}
                    </Typography>
                  )}
                  {job.description && (
                    <Typography variant="body2" color="text.secondary">
                      {job.description}
                    </Typography>
                  )}
                  
                  {/* Job Scope from Face Sheet */}
                  {job.jobScope?.summary && (
                    <Box sx={{ 
                      mt: 2, 
                      p: 2, 
                      bgcolor: 'rgba(59, 130, 246, 0.1)', 
                      borderRadius: 2,
                      borderLeft: '4px solid',
                      borderColor: '#3b82f6'
                    }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e40af', mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        Job Scope
                      </Typography>
                      <Typography variant="body2" sx={{ mb: 1 }}>
                        {job.jobScope.summary}
                      </Typography>
                      
                      <Grid container spacing={1}>
                        {job.jobScope.workType && (
                          <Grid item xs={6} sm={4}>
                            <Typography variant="caption" color="text.secondary">Work Type</Typography>
                            <Typography variant="body2" fontWeight="medium">{job.jobScope.workType}</Typography>
                          </Grid>
                        )}
                        {job.jobScope.footage && (
                          <Grid item xs={6} sm={4}>
                            <Typography variant="caption" color="text.secondary">Footage</Typography>
                            <Typography variant="body2" fontWeight="medium">{job.jobScope.footage}</Typography>
                          </Grid>
                        )}
                        {job.jobScope.voltage && (
                          <Grid item xs={6} sm={4}>
                            <Typography variant="caption" color="text.secondary">Voltage</Typography>
                            <Typography variant="body2" fontWeight="medium">{job.jobScope.voltage}</Typography>
                          </Grid>
                        )}
                        {job.jobScope.phases && (
                          <Grid item xs={6} sm={4}>
                            <Typography variant="caption" color="text.secondary">Phases</Typography>
                            <Typography variant="body2" fontWeight="medium">{job.jobScope.phases}</Typography>
                          </Grid>
                        )}
                      </Grid>
                      
                      {job.jobScope.equipment?.length > 0 && (
                        <Box sx={{ mt: 1.5 }}>
                          <Typography variant="caption" color="text.secondary">Equipment</Typography>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                            {job.jobScope.equipment.map((item) => (
                              <Chip key={`equip-${item}`} label={item} size="small" variant="outlined" />
                            ))}
                          </Box>
                        </Box>
                      )}
                      
                      {job.jobScope.specialNotes && (
                        <Box sx={{ mt: 1.5 }}>
                          <Typography variant="caption" color="text.secondary">Special Notes</Typography>
                          <Typography variant="body2">{job.jobScope.specialNotes}</Typography>
                        </Box>
                      )}
                    </Box>
                  )}
                </Box>
              </CardContent>
            </Card>

            {/* Schedule Card */}
            <Card sx={{ mb: 3, borderRadius: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom display="flex" alignItems="center" gap={1}>
                  <CalendarIcon color="primary" />
                  Schedule
                </Typography>
                <Divider sx={{ mb: 2 }} />
                
                <Box sx={{ '& > *': { mb: 1.5 } }}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <ScheduleIcon fontSize="small" color="action" />
                    <Typography variant="body2">
                      <strong>Created:</strong> {formatDate(job.createdAt)}
                    </Typography>
                  </Box>
                  
                  {job.dueDate && (
                    <Box display="flex" alignItems="center" gap={1}>
                      <WarningIcon fontSize="small" color={new Date(job.dueDate) < new Date() ? 'error' : 'warning'} />
                      <Typography variant="body2" color={new Date(job.dueDate) < new Date() ? 'error.main' : 'inherit'}>
                        <strong>Due:</strong> {formatDate(job.dueDate)}
                      </Typography>
                    </Box>
                  )}
                  
                  {job.crewScheduledDate && (
                    <Box display="flex" alignItems="center" gap={1}>
                      <CalendarIcon fontSize="small" color="info" />
                      <Typography variant="body2">
                        <strong>Scheduled:</strong> {formatDate(job.crewScheduledDate)}
                        {job.crewScheduledEndDate && ` - ${formatDate(job.crewScheduledEndDate)}`}
                      </Typography>
                    </Box>
                  )}
                  
                  {job.assignedToGF && (
                    <Box display="flex" alignItems="center" gap={1}>
                      <PersonIcon fontSize="small" color="action" />
                      <Typography variant="body2">
                        <strong>GF:</strong> {job.assignedToGF.name || job.assignedToGF.email}
                      </Typography>
                    </Box>
                  )}
                  
                  {job.assignedTo && (
                    <Box display="flex" alignItems="center" gap={1}>
                      <PersonIcon fontSize="small" color="action" />
                      <Typography variant="body2">
                        <strong>Crew:</strong> {job.assignedTo.name || job.assignedTo.email}
                      </Typography>
                    </Box>
                  )}
                </Box>
              </CardContent>
            </Card>

          </Grid>

          {/* Middle Column - Dependencies */}
          <Grid item xs={12} md={4}>
            <Card sx={{ borderRadius: 2, height: '100%' }}>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                  <Typography variant="h6" display="flex" alignItems="center" gap={1}>
                    <BuildIcon color="primary" />
                    Dependencies ({dependencies.length})
                  </Typography>
                  <Tooltip title="Add Dependency">
                    <IconButton 
                      color="primary" 
                      onClick={() => {
                        setEditingDep(null);
                        setDepForm({
                          type: 'usa',
                          description: '',
                          status: 'required',
                          scheduledDate: '',
                          ticketNumber: '',
                          notes: ''
                        });
                        setDepDialogOpen(true);
                      }}
                      aria-label="Add Dependency"
                    >
                      <AddIcon />
                    </IconButton>
                  </Tooltip>
                </Box>
                <Divider sx={{ mb: 2 }} />
                
                {dependencies.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>
                    No dependencies tracked yet.
                    <br />
                    Click + to add USA Dig, permits, etc.
                  </Typography>
                ) : (
                  <List dense>
                    {dependencies.map((dep) => (
                      <ListItem 
                        key={dep._id}
                        sx={{ 
                          bgcolor: 'action.hover', 
                          borderRadius: 1, 
                          mb: 1,
                          flexDirection: 'column',
                          alignItems: 'flex-start'
                        }}
                      >
                        <Box display="flex" alignItems="center" width="100%" justifyContent="space-between">
                          <Box display="flex" alignItems="center" gap={1}>
                            <ListItemIcon sx={{ minWidth: 32 }}>
                              {getDependencyIcon(dep.type)}
                            </ListItemIcon>
                            <Typography variant="subtitle2">
                              {getDependencyLabel(dep.type)}
                            </Typography>
                            <Chip 
                              size="small" 
                              label={getDependencyStatusLabel(dep.status)}
                              color={getDependencyStatusColor(dep.status)}
                              variant="outlined"
                              sx={getDependencyChipSx(dep.status)}
                            />
                          </Box>
                          <Box>
                            <IconButton size="small" onClick={() => handleEditDependency(dep)} aria-label="Edit dependency">
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" onClick={() => handleDeleteDependency(dep._id)} aria-label="Delete dependency">
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </Box>
                        {(dep.ticketNumber || dep.scheduledDate || dep.description) && (
                          <Box pl={5} width="100%">
                            {dep.ticketNumber && (
                              <Typography variant="caption" display="block" color="text.secondary">
                                Ticket: #{dep.ticketNumber}
                              </Typography>
                            )}
                            {dep.scheduledDate && (
                              <Typography variant="caption" display="block" color="text.secondary">
                                Scheduled: {formatDate(dep.scheduledDate)}
                              </Typography>
                            )}
                            {dep.description && (
                              <Typography variant="caption" display="block" color="text.secondary">
                                {dep.description}
                              </Typography>
                            )}
                          </Box>
                        )}
                      </ListItem>
                    ))}
                  </List>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* COLUMN 3 - Notes/Chat */}
          <Grid item xs={12} md={4}>
            <Card sx={{ borderRadius: 2, height: '100%' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom display="flex" alignItems="center" gap={1}>
                  <ChatIcon color="primary" />
                  Job Notes ({notes.length})
                </Typography>
                <Divider sx={{ mb: 2 }} />
                
                {/* Add Note Form */}
                <Box sx={{ mb: 2 }}>
                  <Box display="flex" gap={1}>
                    <FormControl size="small" sx={{ minWidth: 80 }}>
                      <Select
                        id="note-type"
                        name="noteType"
                        value={noteType}
                        onChange={(e) => setNoteType(e.target.value)}
                        displayEmpty
                        inputProps={{ 'aria-label': 'Note type' }}
                      >
                        <MenuItem value="update">Update</MenuItem>
                        <MenuItem value="issue">Issue</MenuItem>
                        <MenuItem value="question">Question</MenuItem>
                        <MenuItem value="resolution">Resolution</MenuItem>
                      </Select>
                    </FormControl>
                    <TextField
                      fullWidth
                      size="small"
                      placeholder="Add a note..."
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                    />
                    <IconButton color="primary" onClick={handleAddNote} disabled={!newNote.trim()} aria-label="Add note">
                      <SendIcon />
                    </IconButton>
                  </Box>
                </Box>
                
                {/* Notes List */}
                <Box sx={{ overflow: 'auto', maxHeight: 300 }}>
                  {notes.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" textAlign="center" py={2}>
                      No notes yet.
                    </Typography>
                  ) : (
                    <List dense>
                      {notes.map((note) => (
                        <ListItem 
                          key={note._id || note.createdAt}
                          sx={{ 
                            bgcolor: 'action.hover', 
                            borderRadius: 1, 
                            mb: 1,
                            flexDirection: 'column',
                            alignItems: 'flex-start'
                          }}
                        >
                          <Box display="flex" alignItems="center" gap={0.5} width="100%">
                            <Typography variant="caption" fontWeight="bold">
                              {note.userName || 'User'}
                            </Typography>
                            {note.noteType && (
                              <Chip 
                                size="small" 
                                label={note.noteType}
                                color={getNoteTypeColor(note.noteType)}
                                sx={getNoteTypeChipSx(note.noteType)}
                              />
                            )}
                            <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                              {formatDateTime(note.createdAt)}
                            </Typography>
                          </Box>
                          <Typography variant="body2" sx={{ mt: 0.5 }}>
                            {note.message}
                          </Typography>
                        </ListItem>
                      ))}
                    </List>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>
                
          {/* ROW 2: Pre-Field Photos - Horizontal full width */}
          {['assigned_to_gf', 'pre_fielding', 'scheduled'].includes(job?.status) && (
            <Grid item xs={12}>
              <Card sx={{ borderRadius: 2 }}>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Typography variant="h6" display="flex" alignItems="center" gap={1}>
                      <CameraAltIcon color="primary" />
                      Pre-Field Photos ({preFieldPhotos.length})
                    </Typography>
                    <Box display="flex" gap={1} flexWrap="wrap">
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*,.heic,.heif"
                        multiple
                        onChange={handlePhotoUpload}
                        style={{ display: 'none' }}
                        id="prefield-photo-upload"
                        name="prefield-photo-upload"
                      />
                      <Button
                        variant="contained"
                        startIcon={<CloudUploadIcon />}
                        onClick={() => photoInputRef.current?.click()}
                        disabled={photoUploading}
                        size="large"
                      >
                        Upload Photos
                      </Button>
                      <Button
                        variant="contained"
                        color="success"
                        startIcon={exportLoading ? <CircularProgress size={20} color="inherit" /> : <EmailIcon />}
                        onClick={handleExportToEmail}
                        disabled={exportLoading || preFieldPhotos.length === 0}
                        size="large"
                      >
                        {exportLoading ? 'Exporting...' : 'Export to Email'}
                      </Button>
                      <Button
                        variant="outlined"
                        startIcon={<PhotoLibraryIcon />}
                        onClick={() => navigate(`/jobs/${jobId}/files`)}
                      >
                        Open File System
                      </Button>
                    </Box>
                  </Box>
                  
                  {photoUploading && (
                    <Box sx={{ mb: 2 }}>
                      <LinearProgress variant="determinate" value={photoUploadProgress} />
                      <Typography variant="caption" color="text.secondary" textAlign="center" display="block" mt={0.5}>
                        Uploading... {photoUploadProgress}%
                      </Typography>
                    </Box>
                  )}
                  
                  {preFieldPhotos.length === 0 ? (
                    <Box 
                      sx={{ 
                        py: 3, 
                        textAlign: 'center',
                        border: '2px dashed',
                        borderColor: 'divider',
                        borderRadius: 2,
                        cursor: 'pointer',
                        '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' }
                      }}
                      onClick={() => photoInputRef.current?.click()}
                    >
                      <CameraAltIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
                      <Typography variant="body2" color="text.secondary">
                        No pre-field photos yet - Click to upload
                      </Typography>
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      {preFieldPhotos.map((photo, idx) => (
                        <Tooltip key={photo._id || idx} title={'Click to view: ' + getPhotoDisplayName(photo, idx)}>
                          <Box
                            sx={{
                              position: 'relative',
                              border: '2px solid',
                              borderColor: 'divider',
                              borderRadius: 2,
                              overflow: 'hidden',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              '&:hover': { 
                                borderColor: 'primary.main',
                                boxShadow: 3,
                                transform: 'scale(1.05)'
                              }
                            }}
                            onClick={() => globalThis.open(getPhotoUrl(photo), '_blank')}
                          >
                            <img
                              src={getPhotoUrl(photo)}
                              alt={getPhotoDisplayName(photo, idx)}
                              loading="lazy"
                              style={{ 
                                width: 100, 
                                height: 80, 
                                objectFit: 'cover',
                                display: 'block'
                              }}
                            />
                            <Box 
                              sx={{ 
                                position: 'absolute', 
                                bottom: 0, 
                                left: 0, 
                                right: 0, 
                                bgcolor: 'rgba(0,0,0,0.6)',
                                px: 0.5,
                                py: 0.25
                              }}
                            >
                              <Typography variant="caption" color="white" noWrap sx={{ fontSize: '0.65rem' }}>
                                {idx + 1}. {photo.name?.substring(0, 12) || 'Photo'}
                              </Typography>
                            </Box>
                          </Box>
                        </Tooltip>
                      ))}
                      {/* Add more photos button */}
                      <Box
                        sx={{
                          width: 100,
                          height: 80,
                          border: '2px dashed',
                          borderColor: 'divider',
                          borderRadius: 2,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' }
                        }}
                        onClick={() => photoInputRef.current?.click()}
                      >
                        <AddIcon color="action" />
                        <Typography variant="caption" color="text.secondary">Add More</Typography>
                      </Box>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          )}

          {/* ROW 2.5: Construction Sketches & Crew Instructions - Side by side */}
          {(constructionSketches.length > 0 || crewInstructions.length > 0) && (
            <Grid item xs={12}>
              <Grid container spacing={2}>
                {/* Construction Sketches */}
                {constructionSketches.length > 0 && (
                  <Grid item xs={12} md={6}>
                    <Card sx={{ borderRadius: 2, height: '100%' }}>
                      <CardContent>
                        <Typography variant="h6" display="flex" alignItems="center" gap={1} mb={2}>
                          <SketchIcon color="primary" />
                          Construction Sketches ({constructionSketches.length})
                        </Typography>
                        <Divider sx={{ mb: 2 }} />
                        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                          {constructionSketches.map((sketch, idx) => (
                            <Box 
                              key={sketch._id || idx}
                              sx={{ 
                                border: '1px solid',
                                borderColor: 'divider',
                                borderRadius: 2,
                                overflow: 'hidden',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                '&:hover': { 
                                  boxShadow: 3,
                                  transform: 'scale(1.02)'
                                }
                              }}
                              onClick={() => globalThis.open(getDocumentUrl(sketch), '_blank')}
                            >
                              <img
                                src={getDocumentUrl(sketch)}
                                alt={sketch.name || `Construction Sketch ${idx + 1}`}
                                style={{ 
                                  width: 200, 
                                  height: 150, 
                                  objectFit: 'cover'
                                }}
                              />
                              <Box sx={{ p: 1, bgcolor: 'background.paper' }}>
                                <Typography variant="caption" noWrap display="block" sx={{ maxWidth: 180 }}>
                                  {sketch.name || `Sketch ${idx + 1}`}
                                </Typography>
                                <Chip 
                      size="small"
                                  icon={<OpenInNewIcon fontSize="small" />}
                                  label="View Full Size" 
                                  sx={{ mt: 0.5, cursor: 'pointer' }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    globalThis.open(getDocumentUrl(sketch), '_blank');
                                  }}
                                />
                  </Box>
                            </Box>
                          ))}
                </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                )}

                {/* Crew Instructions (Field As Built) */}
                {crewInstructions.length > 0 && (
                  <Grid item xs={12} md={constructionSketches.length > 0 ? 6 : 12}>
                    <Card sx={{ borderRadius: 2, height: '100%' }}>
                      <CardContent>
                        <Typography variant="h6" display="flex" alignItems="center" gap={1} mb={2}>
                          <InstructionsIcon color="primary" />
                          Crew Instructions ({crewInstructions.length})
                        </Typography>
                        <Divider sx={{ mb: 2 }} />
                        <List dense>
                          {crewInstructions.map((doc, idx) => (
                            <ListItem 
                              key={doc._id || idx}
                              sx={{ 
                                bgcolor: 'action.hover', 
                                borderRadius: 1, 
                                mb: 1,
                                cursor: 'pointer',
                                '&:hover': { bgcolor: 'action.selected' }
                              }}
                              onClick={() => globalThis.open(getDocumentUrl(doc), '_blank')}
                            >
                              <ListItemIcon sx={{ minWidth: 40 }}>
                                <PdfIcon color="error" />
                              </ListItemIcon>
                              <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
                                <Typography variant="body2" noWrap fontWeight="medium">
                                  {doc.name || `Document ${idx + 1}`}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  Job Package PDF - Click to view
                                </Typography>
                              </Box>
                              <IconButton 
                                size="small" 
                                color="primary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  globalThis.open(getDocumentUrl(doc), '_blank');
                                }}
                                aria-label={`Open ${doc.name || 'document'}`}
                              >
                                <OpenInNewIcon fontSize="small" />
                    </IconButton>
                            </ListItem>
                          ))}
                        </List>
                      </CardContent>
                    </Card>
                  </Grid>
                )}
              </Grid>
            </Grid>
          )}

          {/* ROW 3: Workflow Progress - Horizontal timeline */}
          <Grid item xs={12}>
            <Card sx={{ borderRadius: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom display="flex" alignItems="center" gap={1}>
                  <CheckCircleIcon color="primary" />
                  Workflow Progress
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <WorkflowProgressTimeline job={job} />
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>

      {/* Dependency Dialog */}
      <Dialog open={depDialogOpen} onClose={() => setDepDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingDep ? 'Edit Dependency' : 'Add Dependency'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Type</InputLabel>
              <Select
                id="dependency-type"
                name="dependencyType"
                value={depForm.type}
                onChange={(e) => setDepForm({ ...depForm, type: e.target.value })}
                label="Type"
              >
                <MenuItem value="usa">USA</MenuItem>
                <MenuItem value="vegetation">Vegetation</MenuItem>
                <MenuItem value="traffic_control">Traffic Control</MenuItem>
                <MenuItem value="no_parks">No Parks</MenuItem>
                <MenuItem value="cwc">CWC</MenuItem>
                <MenuItem value="afw_type">AFW Type</MenuItem>
                <MenuItem value="special_equipment">Special Equipment</MenuItem>
                <MenuItem value="civil">Civil</MenuItem>
              </Select>
            </FormControl>
            
            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                id="dependency-status"
                name="dependencyStatus"
                value={depForm.status}
                onChange={(e) => setDepForm({ ...depForm, status: e.target.value })}
                label="Status"
              >
                <MenuItem value="required">Required</MenuItem>
                <MenuItem value="check">Check</MenuItem>
                <MenuItem value="scheduled">Scheduled</MenuItem>
                <MenuItem value="not_required">Not Required</MenuItem>
              </Select>
            </FormControl>
            
            <TextField
              label="Ticket/Permit Number"
              value={depForm.ticketNumber}
              onChange={(e) => setDepForm({ ...depForm, ticketNumber: e.target.value })}
              fullWidth
            />
            
            <TextField
              label="Scheduled Date"
              type="date"
              value={depForm.scheduledDate}
              onChange={(e) => setDepForm({ ...depForm, scheduledDate: e.target.value })}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            
            <TextField
              label="Description"
              value={depForm.description}
              onChange={(e) => setDepForm({ ...depForm, description: e.target.value })}
              multiline
              rows={2}
              fullWidth
            />
            
            <TextField
              label="Notes"
              value={depForm.notes}
              onChange={(e) => setDepForm({ ...depForm, notes: e.target.value })}
              multiline
              rows={2}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDepDialogOpen(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            onClick={editingDep ? handleUpdateDependency : handleAddDependency}
          >
            {editingDep ? 'Update' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default WorkOrderDetails;
