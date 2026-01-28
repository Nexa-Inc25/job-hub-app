// src/components/WorkOrderDetails.js - Full Job Details & Management Page
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api';
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
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Schedule as ScheduleIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Send as SendIcon,
  Build as BuildIcon,
  LocalShipping as LocalShippingIcon,
  Security as SecurityIcon,
  Construction as ConstructionIcon,
  Description as DescriptionIcon,
  Person as PersonIcon,
  CalendarMonth as CalendarIcon,
  Chat as ChatIcon,
  Folder as FolderIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
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
            sx={{ mr: 2 }}
          />
          <Tooltip title="Refresh">
            <IconButton onClick={fetchJobDetails} aria-label="Refresh">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
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
        <Grid container spacing={3}>
          {/* Left Column - Job Info & Schedule */}
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
                      bgcolor: 'info.light', 
                      borderRadius: 2,
                      borderLeft: '4px solid',
                      borderColor: 'info.main'
                    }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'info.dark', mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        📋 Job Scope
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
                            {job.jobScope.equipment.map((item, idx) => (
                              <Chip key={idx} label={item} size="small" variant="outlined" />
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

            {/* Workflow Progress */}
            <Card sx={{ borderRadius: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom display="flex" alignItems="center" gap={1}>
                  <CheckCircleIcon color="primary" />
                  Workflow Progress
                </Typography>
                <Divider sx={{ mb: 2 }} />
                
                {/* Audit Trail - Who did what and when */}
                <Box sx={{ '& > *': { mb: 1.5 } }}>
                  {/* Job Created */}
                  {job.createdAt && (
                    <Box sx={{ pl: 1, borderLeft: '3px solid', borderColor: 'info.main' }}>
                      <Typography variant="caption" display="block" fontWeight="bold" color="info.main">
                        Job Created
                      </Typography>
                      <Typography variant="caption" display="block" color="text.secondary">
                        {formatDateTime(job.createdAt)}
                      </Typography>
                      {job.userId && (
                        <Typography variant="caption" display="block" color="text.primary">
                          By: {job.userId.name || job.userId.email || 'Unknown'}
                          {job.userId._id && <span style={{ opacity: 0.6 }}> (ID: {job.userId._id.toString().slice(-6)})</span>}
                        </Typography>
                      )}
                    </Box>
                  )}

                  {/* Assigned to GF */}
                  {job.assignedToGFDate && (
                    <Box sx={{ pl: 1, borderLeft: '3px solid', borderColor: 'primary.main' }}>
                      <Typography variant="caption" display="block" fontWeight="bold" color="primary.main">
                        👔 Assigned to GF
                      </Typography>
                      <Typography variant="caption" display="block" color="text.secondary">
                        {formatDateTime(job.assignedToGFDate)}
                      </Typography>
                      {job.assignedToGFBy && (
                        <Typography variant="caption" display="block" color="text.primary">
                          By: {job.assignedToGFBy.name || job.assignedToGFBy.email || 'Unknown'}
                          {job.assignedToGFBy._id && <span style={{ opacity: 0.6 }}> (ID: {job.assignedToGFBy._id.toString().slice(-6)})</span>}
                        </Typography>
                      )}
                      {job.assignedToGF && (
                        <Typography variant="caption" display="block" color="text.primary">
                          To: <strong>{job.assignedToGF.name || job.assignedToGF.email}</strong>
                          {job.assignedToGF._id && <span style={{ opacity: 0.6 }}> (ID: {job.assignedToGF._id.toString().slice(-6)})</span>}
                        </Typography>
                      )}
                    </Box>
                  )}

                  {/* Pre-fielded */}
                  {job.preFieldDate && (
                    <Box sx={{ pl: 1, borderLeft: '3px solid', borderColor: 'info.main' }}>
                      <Typography variant="caption" display="block" fontWeight="bold" color="info.main">
                        🔍 Pre-Fielded
                      </Typography>
                      <Typography variant="caption" display="block" color="text.secondary">
                        {formatDateTime(job.preFieldDate)}
                      </Typography>
                      {job.assignedToGF && (
                        <Typography variant="caption" display="block" color="text.primary">
                          By: {job.assignedToGF.name || job.assignedToGF.email}
                        </Typography>
                      )}
                    </Box>
                  )}

                  {/* Crew Assigned */}
                  {job.assignedDate && job.assignedTo && (
                    <Box sx={{ pl: 1, borderLeft: '3px solid', borderColor: 'secondary.main' }}>
                      <Typography variant="caption" display="block" fontWeight="bold" color="secondary.main">
                        👷 Crew Assigned
                      </Typography>
                      <Typography variant="caption" display="block" color="text.secondary">
                        {formatDateTime(job.assignedDate)}
                      </Typography>
                      {job.assignedBy && (
                        <Typography variant="caption" display="block" color="text.primary">
                          By: {job.assignedBy.name || job.assignedBy.email || 'Unknown'}
                          {job.assignedBy._id && <span style={{ opacity: 0.6 }}> (ID: {job.assignedBy._id.toString().slice(-6)})</span>}
                        </Typography>
                      )}
                      <Typography variant="caption" display="block" color="text.primary">
                        To: <strong>{job.assignedTo.name || job.assignedTo.email}</strong>
                        {job.assignedTo._id && <span style={{ opacity: 0.6 }}> (ID: {job.assignedTo._id.toString().slice(-6)})</span>}
                      </Typography>
                    </Box>
                  )}

                  {/* Crew Submitted */}
                  {job.crewSubmittedDate && (
                    <Box sx={{ pl: 1, borderLeft: '3px solid', borderColor: 'warning.main' }}>
                      <Typography variant="caption" display="block" fontWeight="bold" color="warning.main">
                        📤 Crew Submitted
                      </Typography>
                      <Typography variant="caption" display="block" color="text.secondary">
                        {formatDateTime(job.crewSubmittedDate)}
                      </Typography>
                      {job.crewSubmittedBy && (
                        <Typography variant="caption" display="block" color="text.primary">
                          By: {job.crewSubmittedBy.name || job.crewSubmittedBy.email || 'Unknown'}
                          {job.crewSubmittedBy._id && <span style={{ opacity: 0.6 }}> (ID: {job.crewSubmittedBy._id.toString().slice(-6)})</span>}
                        </Typography>
                      )}
                      {job.crewSubmissionNotes && (
                        <Typography variant="caption" display="block" color="text.secondary" sx={{ fontStyle: 'italic', mt: 0.5 }}>
                          "{job.crewSubmissionNotes}"
                        </Typography>
                      )}
                    </Box>
                  )}

                  {/* GF Reviewed */}
                  {job.gfReviewDate && (
                    <Box sx={{ pl: 1, borderLeft: '3px solid', borderColor: job.gfReviewStatus === 'approved' ? 'success.main' : 'error.main' }}>
                      <Typography variant="caption" display="block" fontWeight="bold" color={job.gfReviewStatus === 'approved' ? 'success.main' : 'error.main'}>
                        GF Review: {job.gfReviewStatus?.toUpperCase()}
                      </Typography>
                      <Typography variant="caption" display="block" color="text.secondary">
                        {formatDateTime(job.gfReviewDate)}
                      </Typography>
                      {job.gfReviewedBy && (
                        <Typography variant="caption" display="block" color="text.primary">
                          By: {job.gfReviewedBy.name || job.gfReviewedBy.email || 'Unknown'}
                          {job.gfReviewedBy._id && <span style={{ opacity: 0.6 }}> (ID: {job.gfReviewedBy._id.toString().slice(-6)})</span>}
                        </Typography>
                      )}
                      {job.gfReviewNotes && (
                        <Typography variant="caption" display="block" color="text.secondary" sx={{ fontStyle: 'italic', mt: 0.5 }}>
                          "{job.gfReviewNotes}"
                        </Typography>
                      )}
                    </Box>
                  )}

                  {/* PM Approved */}
                  {job.pmApprovalDate && (
                    <Box sx={{ pl: 1, borderLeft: '3px solid', borderColor: job.pmApprovalStatus === 'approved' ? 'success.main' : 'error.main' }}>
                      <Typography variant="caption" display="block" fontWeight="bold" color={job.pmApprovalStatus === 'approved' ? 'success.main' : 'error.main'}>
                        PM Approval: {job.pmApprovalStatus?.toUpperCase()}
                      </Typography>
                      <Typography variant="caption" display="block" color="text.secondary">
                        {formatDateTime(job.pmApprovalDate)}
                      </Typography>
                      {job.pmApprovedBy && (
                        <Typography variant="caption" display="block" color="text.primary">
                          By: {job.pmApprovedBy.name || job.pmApprovedBy.email || 'Unknown'}
                          {job.pmApprovedBy._id && <span style={{ opacity: 0.6 }}> (ID: {job.pmApprovedBy._id.toString().slice(-6)})</span>}
                        </Typography>
                      )}
                      {job.pmApprovalNotes && (
                        <Typography variant="caption" display="block" color="text.secondary" sx={{ fontStyle: 'italic', mt: 0.5 }}>
                          "{job.pmApprovalNotes}"
                        </Typography>
                      )}
                    </Box>
                  )}

                  {/* Completed */}
                  {job.completedDate && (
                    <Box sx={{ pl: 1, borderLeft: '3px solid', borderColor: 'success.main' }}>
                      <Typography variant="caption" display="block" fontWeight="bold" color="success.main">
                        Completed
                      </Typography>
                      <Typography variant="caption" display="block" color="text.secondary">
                        {formatDateTime(job.completedDate)}
                      </Typography>
                      {job.completedBy && (
                        <Typography variant="caption" display="block" color="text.primary">
                          By: {job.completedBy.name || job.completedBy.email || 'Unknown'}
                          {job.completedBy._id && <span style={{ opacity: 0.6 }}> (ID: {job.completedBy._id.toString().slice(-6)})</span>}
                        </Typography>
                      )}
                    </Box>
                  )}

                  {/* Submitted to Utility */}
                  {job.utilitySubmittedDate && (
                    <Box sx={{ pl: 1, borderLeft: '3px solid', borderColor: 'primary.main' }}>
                      <Typography variant="caption" display="block" fontWeight="bold" color="primary.main">
                        📨 Submitted to Utility
                      </Typography>
                      <Typography variant="caption" display="block" color="text.secondary">
                        {formatDateTime(job.utilitySubmittedDate)}
                      </Typography>
                    </Box>
                  )}

                  {/* Billed */}
                  {job.billedDate && (
                    <Box sx={{ pl: 1, borderLeft: '3px solid', borderColor: 'secondary.main' }}>
                      <Typography variant="caption" display="block" fontWeight="bold" color="secondary.main">
                        💵 Billed
                      </Typography>
                      <Typography variant="caption" display="block" color="text.secondary">
                        {formatDateTime(job.billedDate)}
                      </Typography>
                    </Box>
                  )}

                  {/* Invoiced */}
                  {job.invoicedDate && (
                    <Box sx={{ pl: 1, borderLeft: '3px solid', borderColor: 'success.main' }}>
                      <Typography variant="caption" display="block" fontWeight="bold" color="success.main">
                        💰 Invoiced (Paid)
                      </Typography>
                      <Typography variant="caption" display="block" color="text.secondary">
                        {formatDateTime(job.invoicedDate)}
                      </Typography>
                    </Box>
                  )}

                  {/* No activity yet */}
                  {!job.assignedToGFDate && !job.preFieldDate && !job.crewSubmittedDate && (
                    <Typography variant="caption" color="text.secondary" textAlign="center" display="block">
                      No workflow activity yet
                    </Typography>
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
                              sx={{ height: 20, fontSize: '0.65rem' }}
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

          {/* Right Column - Notes/Chat */}
          <Grid item xs={12} md={4}>
            <Card sx={{ borderRadius: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                <Typography variant="h6" gutterBottom display="flex" alignItems="center" gap={1}>
                  <ChatIcon color="primary" />
                  Job Notes ({notes.length})
                </Typography>
                <Divider sx={{ mb: 2 }} />
                
                {/* Notes List */}
                <Box sx={{ flexGrow: 1, overflow: 'auto', maxHeight: 400, mb: 2 }}>
                  {notes.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>
                      No notes yet. Add updates, issues, or questions.
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
                          <Box display="flex" alignItems="center" gap={1} width="100%">
                            <Typography variant="caption" fontWeight="bold">
                              {note.userName || 'User'}
                            </Typography>
                            {note.userRole && (
                              <Chip 
                                size="small" 
                                label={note.userRole.toUpperCase()}
                                sx={{ height: 16, fontSize: '0.6rem' }}
                              />
                            )}
                            {note.noteType && (
                              <Chip 
                                size="small" 
                                label={note.noteType}
                                color={getNoteTypeColor(note.noteType)}
                                sx={{ height: 16, fontSize: '0.6rem' }}
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
                
                {/* Add Note Form */}
                <Box>
                  <Box display="flex" gap={1} mb={1}>
                    <FormControl size="small" sx={{ minWidth: 100 }}>
                      <Select
                        value={noteType}
                        onChange={(e) => setNoteType(e.target.value)}
                        displayEmpty
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
