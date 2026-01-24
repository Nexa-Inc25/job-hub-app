// src/components/Dashboard.js
import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import {
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  TextField,
  InputAdornment,
  Chip,
  Box,
  Fab,
  Paper,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  LinearProgress,
  Alert,
  Snackbar,
  AppBar,
  Toolbar,
  Tooltip,
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  FilterList as FilterIcon,
  MoreVert as MoreVertIcon,
  Description as DescriptionIcon,
  Schedule as ScheduleIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  // Error as ErrorIcon, // Currently unused
  Person as PersonIcon,
  Upload as UploadIcon,
  Assessment as AssessmentIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Folder as FolderIcon,
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
  Logout as LogoutIcon,
  AssignmentInd as AssignIcon,
  CalendarMonth as CalendarIcon,
} from '@mui/icons-material';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import { useThemeMode } from '../ThemeContext';

const Dashboard = () => {
  const [jobs, setJobs] = useState([]);
  const [filteredJobs, setFilteredJobs] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [anchorEl, setAnchorEl] = useState(null);
  const [jobMenuAnchor, setJobMenuAnchor] = useState(null);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [foremen, setForemen] = useState([]);
  const [assignmentData, setAssignmentData] = useState({
    assignedTo: '',
    crewScheduledDate: '',
    crewScheduledEndDate: '',
    assignmentNotes: ''
  });
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();
  const { darkMode, toggleDarkMode } = useThemeMode();

  // Check if user is admin
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setIsAdmin(payload.isAdmin || false);
      } catch (e) {
        setIsAdmin(false);
      }
    }
  }, []);

  // Fetch foremen list for assignment
  const fetchForemen = async () => {
    try {
      // api module automatically adds Authorization header
      const response = await api.get('/api/users/foremen');
      setForemen(response.data);
    } catch (err) {
      console.error('Error fetching foremen:', err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  const statusColors = {
    'pending': 'warning',
    'pre-field': 'info',
    'in-progress': 'primary',
    'completed': 'success',
    'billed': 'secondary',
    'invoiced': 'default',
  };

  const statusIcons = {
    'pending': <ScheduleIcon />,
    'pre-field': <DescriptionIcon />,
    'in-progress': <DescriptionIcon />,
    'completed': <CheckCircleIcon />,
    'billed': <CheckCircleIcon />,
    'invoiced': <CheckCircleIcon />,
  };

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      const url = search ? `/api/jobs?search=${encodeURIComponent(search)}` : '/api/jobs';
      // api module automatically adds Authorization header
      const response = await api.get(url);
      setJobs(response.data);
      setError('');
    } catch (err) {
      console.error('Error fetching jobs:', err);
      setError('Failed to load work orders');
      if (err.response?.status === 401) {
        localStorage.removeItem('token');
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  }, [navigate, search]);

  const filterJobs = useCallback(() => {
    // Backend already handles search filtering, only apply status filter client-side
    let filtered = jobs;

    // Apply status filter
    if (filter !== 'all') {
      filtered = filtered.filter(job => job.status === filter);
    }

    setFilteredJobs(filtered);
  }, [jobs, filter]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }
    fetchJobs();
  }, [navigate, fetchJobs]);

  // Poll for extraction status on jobs that are still processing
  useEffect(() => {
    const jobsExtracting = jobs.filter(j => j.aiExtractionStarted && !j.aiExtractionComplete);
    if (jobsExtracting.length === 0) return;
    
    console.log(`Polling: ${jobsExtracting.length} job(s) still extracting...`);
    const pollInterval = setInterval(() => {
      fetchJobs();
    }, 10000); // Poll every 10 seconds
    
    return () => clearInterval(pollInterval);
  }, [jobs, fetchJobs]);

  useEffect(() => {
    filterJobs();
  }, [filterJobs]);

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  // Job card menu handlers
  const handleJobMenuOpen = (event, jobId) => {
    event.stopPropagation();
    setJobMenuAnchor(event.currentTarget);
    setSelectedJobId(jobId);
  };

  const handleJobMenuClose = () => {
    setJobMenuAnchor(null);
    // Only clear selection if dialog is not open
    if (!assignDialogOpen) {
      setSelectedJobId(null);
    }
  };

  const handleDeleteJob = async () => {
    if (!selectedJobId) {
      console.log('No job selected for deletion');
      return;
    }
    
    // Find the job to get its title for confirmation
    const jobToDelete = jobs.find(j => j._id === selectedJobId);
    const jobTitle = jobToDelete?.title || jobToDelete?.pmNumber || 'this work order';
    
    // Confirm deletion
    if (!window.confirm(`Are you sure you want to delete "${jobTitle}"? This action cannot be undone.`)) {
      handleJobMenuClose();
      return;
    }
    
    try {
      console.log('Deleting job:', selectedJobId);
      
      // api module automatically adds Authorization header
      const response = await api.delete(`/api/jobs/${selectedJobId}`);
      
      console.log('Delete response:', response.data);
      
      // Remove from local state
      setJobs(jobs.filter(job => job._id !== selectedJobId));
      setSnackbar({
        open: true,
        message: 'Work order deleted successfully',
        severity: 'success'
      });
    } catch (err) {
      console.error('Error deleting job:', err);
      console.error('Error response:', err.response?.data);
      setSnackbar({
        open: true,
        message: err.response?.data?.error || 'Failed to delete work order',
        severity: 'error'
      });
    } finally {
      handleJobMenuClose();
    }
  };

  const handleViewFiles = () => {
    if (selectedJobId) {
      navigate(`/jobs/${selectedJobId}/files`);
    }
    handleJobMenuClose();
  };

  const handleViewDetails = () => {
    if (selectedJobId) {
      navigate(`/jobs/${selectedJobId}`);
    }
    handleJobMenuClose();
  };

  // Assignment handlers
  const handleOpenAssignDialog = () => {
    fetchForemen();
    const job = jobs.find(j => j._id === selectedJobId);
    // Handle assignedTo being either a populated object or a string ID
    const assignedToId = job?.assignedTo?._id || job?.assignedTo || '';
    setAssignmentData({
      assignedTo: assignedToId,
      crewScheduledDate: job?.crewScheduledDate ? job.crewScheduledDate.split('T')[0] : '',
      crewScheduledEndDate: job?.crewScheduledEndDate ? job.crewScheduledEndDate.split('T')[0] : '',
      assignmentNotes: job?.assignmentNotes || ''
    });
    setAssignDialogOpen(true);
    // Close menu but keep selectedJobId (dialog is now open so handleJobMenuClose won't clear it)
    setJobMenuAnchor(null);
  };

  const handleCloseAssignDialog = () => {
    setAssignDialogOpen(false);
    setSelectedJobId(null); // Clear selection when dialog closes
    setAssignmentData({
      assignedTo: '',
      crewScheduledDate: '',
      crewScheduledEndDate: '',
      assignmentNotes: ''
    });
  };

  const handleAssignJob = async () => {
    try {
      // api module automatically adds Authorization header
      await api.put(`/api/jobs/${selectedJobId}/assign`, assignmentData);
      
      // Refresh jobs list
      fetchJobs();
      setSnackbar({
        open: true,
        message: 'Job assigned successfully',
        severity: 'success'
      });
      handleCloseAssignDialog();
    } catch (err) {
      console.error('Error assigning job:', err);
      setSnackbar({
        open: true,
        message: err.response?.data?.error || 'Failed to assign job',
        severity: 'error'
      });
    }
  };

  const handleGoToCalendar = () => {
    navigate('/calendar');
  };

  const handleCreateWorkOrder = () => {
    navigate('/create-wo');
  };

  const handleEmergencyWO = () => {
    navigate('/emergency-wo');
  };

  const handleUploadPDF = () => {
    // AI PDF parsing functionality would be implemented here
    setSnackbar({
      open: true,
      message: 'PDF upload feature coming soon with AI parsing!',
      severity: 'info'
    });
  };

  const getStatusColor = (status) => {
    return statusColors[status] || 'default';
  };

  const getStatusIcon = (status) => {
    return statusIcons[status] || <DescriptionIcon />;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'No date';
    return new Date(dateString).toLocaleDateString();
  };

  const getJobStats = () => {
    // Calculate stats from filteredJobs to match displayed results
    const total = filteredJobs.length;
    const pending = filteredJobs.filter(job => job.status === 'pending').length;
    const inProgress = filteredJobs.filter(job => job.status === 'in-progress').length;
    const completed = filteredJobs.filter(job => job.status === 'completed').length;
    const preField = filteredJobs.filter(job => job.status === 'pre-field').length;

    return { total, pending, inProgress, completed, preField };
  };

  const stats = getJobStats();

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Top Navigation Bar */}
      <AppBar position="static" elevation={0} sx={{ mb: 3 }}>
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 700 }}>
            JobHub
          </Typography>
          
          {/* Calendar Button */}
          <Tooltip title="My Schedule">
            <IconButton color="inherit" onClick={handleGoToCalendar} sx={{ mr: 1 }}>
              <CalendarIcon />
            </IconButton>
          </Tooltip>
          
          {/* Dark Mode Toggle */}
          <Tooltip title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
            <IconButton color="inherit" onClick={toggleDarkMode} sx={{ mr: 1 }}>
              {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>
          </Tooltip>
          
          {/* Logout Button */}
          <Tooltip title="Logout">
            <IconButton color="inherit" onClick={handleLogout}>
              <LogoutIcon />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 2 }}>
        {/* Header Section */}
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
          <Box>
            <Typography variant="h4" component="h1" gutterBottom fontWeight="bold">
              Work Order Dashboard
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Manage and track your work orders with AI-powered automation
            </Typography>
          </Box>

          <Box display="flex" gap={2}>
            <Button
              variant="outlined"
              startIcon={<UploadIcon />}
              onClick={handleUploadPDF}
              sx={{ borderRadius: 2 }}
            >
              Upload PDF (AI Parse)
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<WarningIcon />}
              onClick={handleEmergencyWO}
              sx={{ borderRadius: 2 }}
            >
              Emergency WO
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleCreateWorkOrder}
              sx={{ borderRadius: 2 }}
            >
              New Work Order
            </Button>
          </Box>
        </Box>

      {/* Stats Cards */}
      <Grid container spacing={3} mb={4}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 2, boxShadow: 2 }}>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" gutterBottom>
                    Total Orders
                  </Typography>
                  <Typography variant="h4" fontWeight="bold">
                    {stats.total}
                  </Typography>
                </Box>
                <AssessmentIcon sx={{ fontSize: 40, color: 'primary.main', opacity: 0.7 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 2, boxShadow: 2 }}>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" gutterBottom>
                    In Progress
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="info.main">
                    {stats.inProgress}
                  </Typography>
                </Box>
                <DescriptionIcon sx={{ fontSize: 40, color: 'info.main', opacity: 0.7 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 2, boxShadow: 2 }}>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" gutterBottom>
                    Completed
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="success.main">
                    {stats.completed}
                  </Typography>
                </Box>
                <CheckCircleIcon sx={{ fontSize: 40, color: 'success.main', opacity: 0.7 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 2, boxShadow: 2 }}>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" gutterBottom>
                    Pre-Field
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="info.main">
                    {stats.preField}
                  </Typography>
                </Box>
                <FolderIcon sx={{ fontSize: 40, color: 'info.main', opacity: 0.7 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Search and Filter Section */}
      <Paper sx={{ p: 3, mb: 4, borderRadius: 2, boxShadow: 1 }}>
        <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
          <TextField
            id="search"
            name="search"
            fullWidth
            variant="outlined"
            placeholder="Search work orders by title, description, or client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            sx={{ maxWidth: 500 }}
          />

          <Button
            variant="outlined"
            startIcon={<FilterIcon />}
            onClick={handleMenuOpen}
            sx={{ borderRadius: 2 }}
          >
            Filter: {filter === 'all' ? 'All Status' : filter.replace('_', ' ')}
          </Button>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
          >
            <MenuItem onClick={() => { setFilter('all'); handleMenuClose(); }}>All Status</MenuItem>
            <MenuItem onClick={() => { setFilter('pending'); handleMenuClose(); }}>Pending</MenuItem>
            <MenuItem onClick={() => { setFilter('pre-field'); handleMenuClose(); }}>Pre-Field</MenuItem>
            <MenuItem onClick={() => { setFilter('in-progress'); handleMenuClose(); }}>In Progress</MenuItem>
            <MenuItem onClick={() => { setFilter('completed'); handleMenuClose(); }}>Completed</MenuItem>
          </Menu>
        </Box>
      </Paper>

      {/* Loading State */}
      {loading && (
        <Box mb={4}>
          <LinearProgress sx={{ borderRadius: 1, height: 8 }} />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Loading work orders...
          </Typography>
        </Box>
      )}

      {/* Error State */}
      {error && (
        <Alert severity="error" sx={{ mb: 4, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      {/* Work Orders Grid */}
      {!loading && !error && (
        <Grid container spacing={3}>
          {filteredJobs.length === 0 ? (
            <Grid item xs={12}>
              <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 2, boxShadow: 1 }}>
                <DescriptionIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                <Typography variant="h6" gutterBottom>
                  No work orders found
                </Typography>
                <Typography variant="body2" color="text.secondary" mb={3}>
                  {search || filter !== 'all'
                    ? 'Try adjusting your search or filter criteria'
                    : 'Get started by creating your first work order'
                  }
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={handleCreateWorkOrder}
                  sx={{ borderRadius: 2 }}
                >
                  Create Work Order
                </Button>
              </Paper>
            </Grid>
          ) : (
            filteredJobs.map((job) => (
              <Grid item xs={12} md={6} lg={4} key={job._id}>
                <Card sx={{
                  borderRadius: 2,
                  boxShadow: 2,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 4,
                  }
                }}>
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                      <Box flex={1}>
                        <Typography variant="h6" component="h2" gutterBottom sx={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {job.title || 'Untitled Work Order'}
                        </Typography>
                        {job.client && (
                          <Typography variant="body2" color="text.secondary" display="flex" alignItems="center" gap={0.5}>
                            <PersonIcon fontSize="small" />
                            {job.client}
                          </Typography>
                        )}
                      </Box>
                      <Chip
                        icon={getStatusIcon(job.status)}
                        label={job.status?.replace('_', ' ') || 'pending'}
                        color={getStatusColor(job.status)}
                        size="small"
                        variant="filled"
                      />
                    </Box>

                    {job.description && (
                      <Typography variant="body2" color="text.secondary" sx={{
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        mb: 2
                      }}>
                        {job.description}
                      </Typography>
                    )}

                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Typography variant="caption" color="text.secondary">
                        Created: {formatDate(job.createdAt)}
                      </Typography>
                      {job.dueDate && (
                        <Typography variant="caption" color="text.secondary">
                          Due: {formatDate(job.dueDate)}
                        </Typography>
                      )}
                    </Box>
                    
                    {/* AI Extraction Status */}
                    {job.aiExtractionStarted && !job.aiExtractionComplete && (
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="caption" color="primary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <ScheduleIcon fontSize="small" sx={{ animation: 'spin 2s linear infinite', '@keyframes spin': { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } } }} />
                          Extracting assets...
                        </Typography>
                        <LinearProgress sx={{ mt: 0.5, borderRadius: 1 }} />
                      </Box>
                    )}
                    {job.aiExtractionComplete && job.aiProcessingTimeMs && (
                      <Typography variant="caption" color="success.main" sx={{ mt: 1, display: 'block' }}>
                        ✓ Extracted in {(job.aiProcessingTimeMs / 1000).toFixed(1)}s
                      </Typography>
                    )}
                  </CardContent>

                  <Divider />

                  <CardActions sx={{ justifyContent: 'space-between', px: 2 }}>
                    <Button
                      size="small"
                      component={Link}
                      to={`/jobs/${job._id}`}
                      sx={{ borderRadius: 1 }}
                    >
                      View Details
                    </Button>
                    <Button
                      size="small"
                      component={Link}
                      to={`/jobs/${job._id}/files`}
                      sx={{ borderRadius: 1 }}
                    >
                      Files
                    </Button>
                    <IconButton 
                      size="small"
                      onClick={(e) => handleJobMenuOpen(e, job._id)}
                    >
                      <MoreVertIcon />
                    </IconButton>
                  </CardActions>
                </Card>
              </Grid>
            ))
          )}
        </Grid>
      )}

      {/* Floating Action Button for Quick Create */}
      <Fab
        color="primary"
        aria-label="add"
        onClick={handleCreateWorkOrder}
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          boxShadow: 3
        }}
      >
        <AddIcon />
      </Fab>

      {/* Job Card Menu */}
      <Menu
        anchorEl={jobMenuAnchor}
        open={Boolean(jobMenuAnchor)}
        onClose={handleJobMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem onClick={handleViewDetails}>
          <EditIcon fontSize="small" sx={{ mr: 1 }} />
          View Details
        </MenuItem>
        <MenuItem onClick={handleViewFiles}>
          <FolderIcon fontSize="small" sx={{ mr: 1 }} />
          Open Files
        </MenuItem>
        {isAdmin && (
          <MenuItem onClick={handleOpenAssignDialog}>
            <AssignIcon fontSize="small" sx={{ mr: 1 }} />
            Assign to Foreman
          </MenuItem>
        )}
        <Divider />
        <MenuItem onClick={handleDeleteJob} sx={{ color: 'error.main' }}>
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
          Delete Work Order
        </MenuItem>
      </Menu>

      {/* Assignment Dialog */}
      <Dialog open={assignDialogOpen} onClose={handleCloseAssignDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AssignIcon color="primary" />
            Assign Work Order to Foreman
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {/* Show job info and due date */}
            {selectedJobId && (() => {
              const job = jobs.find(j => j._id === selectedJobId);
              return job ? (
                <Alert severity="info" sx={{ mb: 1 }}>
                  <Typography variant="subtitle2">
                    <strong>{job.pmNumber || job.woNumber || 'Work Order'}</strong>
                    {job.address && ` - ${job.address}`}
                  </Typography>
                  {job.dueDate && (
                    <Typography variant="body2" color="warning.main">
                      <strong>Due By:</strong> {new Date(job.dueDate).toLocaleDateString()}
                    </Typography>
                  )}
                </Alert>
              ) : null;
            })()}
            
            <FormControl fullWidth>
              <InputLabel id="assignTo-label">Assign To</InputLabel>
              <Select
                id="assignTo"
                name="assignTo"
                labelId="assignTo-label"
                value={assignmentData.assignedTo}
                label="Assign To"
                onChange={(e) => setAssignmentData({ ...assignmentData, assignedTo: e.target.value })}
              >
                <MenuItem value="">
                  <em>Unassigned</em>
                </MenuItem>
                {foremen.map((foreman) => (
                  <MenuItem key={foreman._id} value={foreman._id}>
                    {foreman.name || foreman.email} ({foreman.role})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            
            <TextField
              id="crewScheduledDate"
              name="crewScheduledDate"
              label="Crew Scheduled Date"
              type="date"
              value={assignmentData.crewScheduledDate}
              onChange={(e) => setAssignmentData({ ...assignmentData, crewScheduledDate: e.target.value })}
              InputLabelProps={{ shrink: true }}
              helperText="When the crew will work on this job"
              fullWidth
            />
            
            <TextField
              id="crewScheduledEndDate"
              name="crewScheduledEndDate"
              label="End Date (Optional - for multi-day jobs)"
              type="date"
              value={assignmentData.crewScheduledEndDate}
              onChange={(e) => setAssignmentData({ ...assignmentData, crewScheduledEndDate: e.target.value })}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            
            <TextField
              id="assignmentNotes"
              name="assignmentNotes"
              label="Assignment Notes"
              multiline
              rows={3}
              value={assignmentData.assignmentNotes}
              onChange={(e) => setAssignmentData({ ...assignmentData, assignmentNotes: e.target.value })}
              placeholder="Add any special instructions or notes for the foreman..."
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseAssignDialog}>Cancel</Button>
          <Button 
            onClick={handleAssignJob} 
            variant="contained" 
            startIcon={<AssignIcon />}
            disabled={!assignmentData.assignedTo || !assignmentData.crewScheduledDate}
          >
            Assign Job
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
      </Container>
    </Box>
  );
};

export default Dashboard;