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
  Flip as FlipIcon,
  Chat as ChatIcon,
  Construction as ConstructionIcon,
  Build as BuildIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Today as TodayIcon,
  EventNote as EventNoteIcon,
  Block as BlockIcon,
} from '@mui/icons-material';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Collapse from '@mui/material/Collapse';
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
  const [userRole, setUserRole] = useState(null); // crew, foreman, gf, pm, admin
  const [canApprove, setCanApprove] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [flippedCards, setFlippedCards] = useState({}); // Track which cards are flipped
  const [jobDetails, setJobDetails] = useState({}); // Cache full job details for flipped cards
  const [preFieldChecklist, setPreFieldChecklist] = useState({}); // Pre-field checklist state per job
  const [flipLock, setFlipLock] = useState(false); // Prevent rapid flipping
  const [stuckDialogOpen, setStuckDialogOpen] = useState(false);
  const [stuckReason, setStuckReason] = useState('');
  const [stuckJobId, setStuckJobId] = useState(null);
  const [depScheduleDialogOpen, setDepScheduleDialogOpen] = useState(false);
  const [depScheduleData, setDepScheduleData] = useState({ jobId: null, depId: null, date: '' });
  const navigate = useNavigate();
  const { darkMode, toggleDarkMode } = useThemeMode();

  // Check user role from token
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setIsAdmin(payload.isAdmin || false);
        setUserRole(payload.role || null);
        setCanApprove(payload.canApprove || payload.isAdmin || ['gf', 'pm', 'admin'].includes(payload.role));
      } catch (e) {
        setIsAdmin(false);
        setUserRole(null);
        setCanApprove(false);
      }
    }
  }, []);

  // Fetch pending approvals for GF/PM/Admin
  const fetchPendingApprovals = useCallback(async () => {
    if (!canApprove) return;
    try {
      const response = await api.get('/api/admin/pending-approvals');
      setPendingApprovals(response.data || []);
    } catch (err) {
      console.error('Error fetching pending approvals:', err);
    }
  }, [canApprove]);

  useEffect(() => {
    if (canApprove) {
      fetchPendingApprovals();
    }
  }, [canApprove, fetchPendingApprovals]);

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

  // Handle card flip - load full details on first flip
  const handleCardFlip = (jobId) => {
    // Prevent rapid clicking
    if (flipLock) return;
    setFlipLock(true);
    
    const isCurrentlyFlipped = flippedCards[jobId];
    const job = jobs.find(j => j._id === jobId);
    
    // Toggle flip state immediately
    setFlippedCards(prev => ({ ...prev, [jobId]: !isCurrentlyFlipped }));
    
    // If flipping to back side, load data
    if (!isCurrentlyFlipped) {
      // Initialize pre-field checklist if job needs pre-fielding
      if (job && needsPreField(job.status)) {
        initPreFieldChecklist(jobId);
      }
      
      // Fetch full details if not already cached (don't await - fire and forget)
      if (!jobDetails[jobId]) {
        api.get(`/api/jobs/${jobId}/full-details`)
          .then(response => {
            setJobDetails(prev => ({ ...prev, [jobId]: response.data }));
          })
          .catch(err => {
            console.error('Error fetching job details:', err);
          });
      }
    }
    
    // Release lock after animation completes
    setTimeout(() => setFlipLock(false), 700);
  };

  // Format dependency status
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

  const getDependencyTypeLabel = (type) => {
    const labels = {
      'usa': 'USA',
      'vegetation': 'Vegetation',
      'traffic_control': 'Traffic Control',
      'no_parks': 'No Parks',
      'cwc': 'CWC',
      'afw_type': 'AFW Type',
      'special_equipment': 'Special Equipment',
      'civil': 'Civil'
    };
    return labels[type] || type;
  };

  // Pre-field checklist items
  const preFieldItems = [
    { key: 'usa', label: 'USA', description: 'Underground utility locate needed' },
    { key: 'vegetation', label: 'Vegetation', description: 'Vegetation management needed' },
    { key: 'traffic_control', label: 'Traffic Control', description: 'TC plan or flaggers needed' },
    { key: 'no_parks', label: 'No Parks', description: 'No parks restriction applies' },
    { key: 'cwc', label: 'CWC', description: 'CWC coordination required' },
    { key: 'afw_type', label: 'AFW Type', description: 'AFW type specification (if CWC)' },
    { key: 'special_equipment', label: 'Special Equipment', description: 'Special equipment needed' },
    { key: 'civil', label: 'Civil', description: 'Trenching, boring, or excavation' },
  ];

  // Initialize pre-field checklist for a job
  const initPreFieldChecklist = (jobId) => {
    if (!preFieldChecklist[jobId]) {
      setPreFieldChecklist(prev => ({
        ...prev,
        [jobId]: preFieldItems.reduce((acc, item) => {
          acc[item.key] = { checked: false, notes: '' };
          return acc;
        }, {})
      }));
    }
  };

  // Handle pre-field checkbox toggle
  const handlePreFieldCheck = (jobId, key, checked) => {
    setPreFieldChecklist(prev => ({
      ...prev,
      [jobId]: {
        ...prev[jobId],
        [key]: { ...prev[jobId]?.[key], checked, notes: prev[jobId]?.[key]?.notes || '' }
      }
    }));
  };

  // Handle pre-field notes change
  const handlePreFieldNotes = (jobId, key, notes) => {
    setPreFieldChecklist(prev => ({
      ...prev,
      [jobId]: {
        ...prev[jobId],
        [key]: { ...prev[jobId]?.[key], checked: prev[jobId]?.[key]?.checked || false, notes }
      }
    }));
  };

  // Save pre-field checklist and create dependencies
  const handleSavePreField = async (jobId) => {
    const checklist = preFieldChecklist[jobId];
    if (!checklist) return;

    try {
      // Create dependencies for each checked item
      const checkedItems = Object.entries(checklist).filter(([_, value]) => value.checked);
      
      for (const [key, value] of checkedItems) {
        await api.post(`/api/jobs/${jobId}/dependencies`, {
          type: key,  // Use the key directly - all match enum values
          description: value.notes || preFieldItems.find(i => i.key === key)?.description || '',
          status: 'required',  // Must match enum: required, check, scheduled, not_required
          notes: value.notes
        });
      }

      // === CAPTURE FOR AI TRAINING ===
      // Send checklist decisions to train AI for future auto-suggestions
      try {
        await api.post(`/api/jobs/${jobId}/prefield-checklist`, { decisions: checklist });
        console.log('[AI Training] Pre-field checklist captured for job', jobId);
      } catch (aiErr) {
        console.warn('[AI Training] Failed to capture pre-field data:', aiErr);
        // Don't fail the main operation if AI capture fails
      }

      // Update job status to pre_fielding
      await api.put(`/api/jobs/${jobId}/status`, { status: 'pre_fielding' });

      // Refresh job list
      const response = await api.get('/api/jobs');
      setJobs(response.data);
      
      // Flip card back
      setFlippedCards(prev => ({ ...prev, [jobId]: false }));
      
      setSnackbar({ 
        open: true, 
        message: `Pre-field complete! ${checkedItems.length} dependencies added.`, 
        severity: 'success' 
      });
    } catch (err) {
      console.error('Save pre-field error:', err);
      setSnackbar({ open: true, message: 'Failed to save pre-field data', severity: 'error' });
    }
  };

  // Check if job needs pre-fielding (not yet pre-fielded)
  const needsPreField = (status) => {
    return ['new', 'assigned_to_gf', 'pending'].includes(status);
  };

  // Handle marking a job as stuck
  const handleOpenStuckDialog = (jobId, e) => {
    if (e) e.stopPropagation();
    setStuckJobId(jobId);
    setStuckReason('');
    setStuckDialogOpen(true);
    handleJobMenuClose();
  };

  const handleMarkAsStuck = async () => {
    if (!stuckJobId || !stuckReason.trim()) return;
    
    try {
      await api.put(`/api/jobs/${stuckJobId}/status`, { 
        status: 'stuck',
        stuckReason: stuckReason.trim()
      });
      
      // Refresh jobs
      const response = await api.get('/api/jobs');
      setJobs(response.data);
      
      setSnackbar({ 
        open: true, 
        message: 'Job marked as stuck', 
        severity: 'warning' 
      });
      setStuckDialogOpen(false);
      setStuckJobId(null);
      setStuckReason('');
    } catch (err) {
      console.error('Mark as stuck error:', err);
      setSnackbar({ open: true, message: 'Failed to update job status', severity: 'error' });
    }
  };

  // Handle unsticking a job (move back to pre_fielding or scheduled)
  const handleUnstickJob = async (jobId, e) => {
    if (e) e.stopPropagation();
    
    try {
      await api.put(`/api/jobs/${jobId}/status`, { status: 'pre_fielding' });
      
      // Refresh jobs
      const response = await api.get('/api/jobs');
      setJobs(response.data);
      
      setSnackbar({ 
        open: true, 
        message: 'Job moved back to Pre-Fielding', 
        severity: 'success' 
      });
    } catch (err) {
      console.error('Unstick job error:', err);
      setSnackbar({ open: true, message: 'Failed to update job status', severity: 'error' });
    }
  };

  // Cycle dependency status on click: required → scheduled (with date picker) → not_required → required
  const handleDependencyStatusClick = async (jobId, depId, currentStatus, e) => {
    e.stopPropagation(); // Prevent card flip
    
    const statusCycle = ['required', 'scheduled', 'not_required'];
    const currentIndex = statusCycle.indexOf(currentStatus);
    const nextStatus = statusCycle[(currentIndex + 1) % statusCycle.length];
    
    // If moving to 'scheduled', open date picker dialog
    if (nextStatus === 'scheduled') {
      setDepScheduleData({ 
        jobId, 
        depId, 
        date: new Date().toISOString().split('T')[0] // Default to today
      });
      setDepScheduleDialogOpen(true);
      return;
    }
    
    try {
      await api.put(`/api/jobs/${jobId}/dependencies/${depId}`, { status: nextStatus });
      
      // Update local cache
      setJobDetails(prev => ({
        ...prev,
        [jobId]: {
          ...prev[jobId],
          dependencies: prev[jobId]?.dependencies?.map(dep => 
            dep._id === depId ? { ...dep, status: nextStatus, scheduledDate: null } : dep
          )
        }
      }));
      
      setSnackbar({ 
        open: true, 
        message: `Status changed to ${getDependencyStatusLabel(nextStatus)}`, 
        severity: 'success' 
      });
    } catch (err) {
      console.error('Update dependency error:', err);
      setSnackbar({ open: true, message: 'Failed to update status', severity: 'error' });
    }
  };

  // Save scheduled dependency with date
  const handleSaveDepSchedule = async () => {
    const { jobId, depId, date } = depScheduleData;
    if (!jobId || !depId || !date) return;
    
    try {
      // Create date at noon local time to avoid timezone issues
      const scheduledDate = new Date(date + 'T12:00:00');
      
      await api.put(`/api/jobs/${jobId}/dependencies/${depId}`, { 
        status: 'scheduled',
        scheduledDate: scheduledDate.toISOString()
      });
      
      // Update local cache
      setJobDetails(prev => ({
        ...prev,
        [jobId]: {
          ...prev[jobId],
          dependencies: prev[jobId]?.dependencies?.map(dep => 
            dep._id === depId ? { ...dep, status: 'scheduled', scheduledDate: scheduledDate.toISOString() } : dep
          )
        }
      }));
      
      setSnackbar({ 
        open: true, 
        message: `Scheduled for ${new Date(scheduledDate).toLocaleDateString()}`, 
        severity: 'success' 
      });
      setDepScheduleDialogOpen(false);
      setDepScheduleData({ jobId: null, depId: null, date: '' });
    } catch (err) {
      console.error('Schedule dependency error:', err);
      setSnackbar({ open: true, message: 'Failed to schedule dependency', severity: 'error' });
    }
  };

  // Status colors for new workflow + legacy statuses
  const statusColors = {
    // New workflow statuses
    'new': 'warning',
    'assigned_to_gf': 'info',
    'pre_fielding': 'info',
    'scheduled': 'primary',
    'stuck': 'error',
    'in_progress': 'primary',
    'pending_gf_review': 'warning',
    'pending_pm_approval': 'warning',
    'ready_to_submit': 'success',
    'submitted': 'success',
    'billed': 'secondary',
    'invoiced': 'default',
    // Legacy statuses (backwards compatibility)
    'pending': 'warning',
    'pre-field': 'info',
    'in-progress': 'primary',
    'completed': 'success',
  };

  // Human-readable status labels
  const statusLabels = {
    'new': 'New',
    'assigned_to_gf': 'Assigned to GF',
    'pre_fielding': 'Pre-Fielding',
    'scheduled': 'Scheduled',
    'stuck': 'Stuck',
    'in_progress': 'In Progress',
    'pending_gf_review': 'Awaiting GF Review',
    'pending_pm_approval': 'Awaiting PM Approval',
    'ready_to_submit': 'Ready to Submit',
    'submitted': 'Submitted',
    'billed': 'Billed',
    'invoiced': 'Invoiced',
    // Legacy
    'pending': 'Pending',
    'pre-field': 'Pre-Field',
    'in-progress': 'In Progress',
    'completed': 'Completed',
  };

  // State for collapsible sections (GF View)
  const [expandedSections, setExpandedSections] = useState({
    pendingPreField: true,
    needsScheduling: true,
    stuck: true,
    todaysWork: true,
    scheduled: false,
  });

  // Toggle section expansion
  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Helper to get local date string (YYYY-MM-DD) from any date
  const getLocalDateString = (date) => {
    const d = new Date(date);
    return d.getFullYear() + '-' + 
           String(d.getMonth() + 1).padStart(2, '0') + '-' + 
           String(d.getDate()).padStart(2, '0');
  };

  // Categorize jobs for GF view
  const categorizeJobsForGF = useCallback(() => {
    const todayStr = getLocalDateString(new Date());

    return {
      // Jobs actively being pre-fielded (show as cards with flip)
      preFieldingInProgress: jobs.filter(job => 
        ['pre_fielding', 'pre-field'].includes(job.status) && !job.assignedTo
      ),
      // Jobs assigned to GF but not yet started pre-field (simple list)
      pendingPreField: jobs.filter(job => 
        ['new', 'assigned_to_gf', 'pending'].includes(job.status)
      ),
      // Needs scheduling - pre-fielded AND has assignedTo but no scheduled date
      needsScheduling: jobs.filter(job => 
        ['pre_fielding', 'pre-field'].includes(job.status) && !job.crewScheduledDate
      ),
      // Jobs marked as stuck
      stuck: jobs.filter(job => job.status === 'stuck'),
      // Jobs scheduled for today (compare local date strings)
      todaysWork: jobs.filter(job => {
        if (!job.crewScheduledDate) return false;
        const schedDateStr = getLocalDateString(job.crewScheduledDate);
        return schedDateStr === todayStr && 
               ['scheduled', 'in_progress', 'in-progress'].includes(job.status);
      }),
      // Scheduled but not today (future work)
      scheduled: jobs.filter(job => {
        if (!job.crewScheduledDate) return false;
        const schedDateStr = getLocalDateString(job.crewScheduledDate);
        return schedDateStr > todayStr && 
               ['scheduled', 'in_progress'].includes(job.status);
      }),
    };
  }, [jobs]);

  const gfCategories = categorizeJobsForGF();

  // Render a simple collapsible section header
  const renderSectionHeader = (title, icon, count, sectionKey) => (
    <Box 
      sx={{ 
        py: 1.5, 
        px: 2,
        mb: 1, 
        cursor: 'pointer',
        borderBottom: '1px solid',
        borderColor: 'divider',
        '&:hover': { bgcolor: 'action.hover' },
        transition: 'background 0.2s ease',
      }}
      onClick={() => toggleSection(sectionKey)}
    >
      <Box display="flex" alignItems="center" justifyContent="space-between">
        <Box display="flex" alignItems="center" gap={1}>
          <Box sx={{ color: 'text.secondary', display: 'flex' }}>{icon}</Box>
          <Typography variant="subtitle1" fontWeight="medium" color="text.primary">
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
            ({count})
          </Typography>
        </Box>
        <Box sx={{ color: 'text.secondary' }}>
          {expandedSections[sectionKey] ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </Box>
      </Box>
    </Box>
  );

  const statusIcons = {
    // New workflow statuses
    'new': <ScheduleIcon />,
    'assigned_to_gf': <DescriptionIcon />,
    'pre_fielding': <DescriptionIcon />,
    'scheduled': <ScheduleIcon />,
    'stuck': <WarningIcon />,
    'in_progress': <DescriptionIcon />,
    'pending_gf_review': <ScheduleIcon />,
    'pending_pm_approval': <ScheduleIcon />,
    'ready_to_submit': <CheckCircleIcon />,
    'submitted': <CheckCircleIcon />,
    'billed': <CheckCircleIcon />,
    'invoiced': <CheckCircleIcon />,
    // Legacy statuses
    'pending': <ScheduleIcon />,
    'pre-field': <DescriptionIcon />,
    'in-progress': <DescriptionIcon />,
    'completed': <CheckCircleIcon />,
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
      // Fix timezone issue: set dates at noon local time to avoid day boundary shifts
      const dataToSend = { ...assignmentData };
      if (dataToSend.crewScheduledDate) {
        // Create date at noon local time
        dataToSend.crewScheduledDate = new Date(dataToSend.crewScheduledDate + 'T12:00:00').toISOString();
      }
      if (dataToSend.crewScheduledEndDate) {
        dataToSend.crewScheduledEndDate = new Date(dataToSend.crewScheduledEndDate + 'T12:00:00').toISOString();
      }
      
      // api module automatically adds Authorization header
      await api.put(`/api/jobs/${selectedJobId}/assign`, dataToSend);
      
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

  // Update job status (workflow progression)
  const handleUpdateStatus = async (newStatus, confirmMessage) => {
    if (!selectedJobId) return;
    
    // Optional confirmation
    if (confirmMessage && !window.confirm(confirmMessage)) {
      handleJobMenuClose();
      return;
    }
    
    try {
      await api.put(`/api/jobs/${selectedJobId}/status`, { status: newStatus });
      
      // Update local state
      setJobs(jobs.map(job => 
        job._id === selectedJobId ? { ...job, status: newStatus } : job
      ));
      
      setSnackbar({
        open: true,
        message: `Status updated to "${getStatusLabel(newStatus)}"`,
        severity: 'success'
      });
      } catch (err) {
      console.error('Error updating status:', err);
      setSnackbar({
        open: true,
        message: err.response?.data?.error || 'Failed to update status',
        severity: 'error'
      });
    } finally {
      handleJobMenuClose();
    }
  };

  // Get next available status transitions based on current status and role
  const getAvailableTransitions = (job) => {
    if (!job) return [];
    const status = job.status;
    const transitions = [];
    
    // PM/Admin transitions
    if (isAdmin || userRole === 'pm' || userRole === 'admin') {
      if (status === 'new' || status === 'pending') {
        transitions.push({ status: 'assigned_to_gf', label: 'Assign to GF', icon: 'assign' });
      }
      if (status === 'pending_pm_approval') {
        transitions.push({ status: 'ready_to_submit', label: 'Approve & Ready to Submit', icon: 'approve' });
      }
      if (status === 'ready_to_submit') {
        transitions.push({ status: 'submitted', label: 'Mark as Submitted', icon: 'submit' });
      }
      if (status === 'submitted') {
        transitions.push({ status: 'billed', label: 'Mark as Billed', icon: 'bill' });
      }
      if (status === 'billed') {
        transitions.push({ status: 'invoiced', label: 'Mark as Invoiced', icon: 'invoice' });
      }
    }
    
    // GF transitions
    if (isAdmin || userRole === 'gf' || userRole === 'pm' || userRole === 'admin') {
      if (status === 'assigned_to_gf') {
        transitions.push({ status: 'pre_fielding', label: 'Start Pre-Field', icon: 'prefield' });
      }
      if (status === 'pre_fielding') {
        transitions.push({ status: 'scheduled', label: 'Schedule Crew', icon: 'schedule' });
      }
      if (status === 'pending_gf_review') {
        transitions.push({ status: 'pending_pm_approval', label: 'Approve → Send to PM', icon: 'approve' });
      }
    }
    
    // Foreman/Crew transitions
    if (isAdmin || userRole === 'foreman' || userRole === 'crew' || userRole === 'gf' || userRole === 'pm') {
      if (status === 'scheduled') {
        transitions.push({ status: 'in_progress', label: 'Start Work', icon: 'start' });
      }
      if (status === 'in_progress') {
        transitions.push({ status: 'pending_gf_review', label: 'Submit for Review', icon: 'submit' });
      }
    }
    
    return transitions;
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

  const getStatusLabel = (status) => {
    return statusLabels[status] || status?.replace(/_/g, ' ') || 'Unknown';
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'No date';
    return new Date(dateString).toLocaleDateString();
  };

  const getJobStats = () => {
    // Calculate stats from filteredJobs to match displayed results
    // Group statuses into logical categories for the stats display
    const total = filteredJobs.length;
    
    // "Pending" = new jobs awaiting assignment or pre-field
    const pending = filteredJobs.filter(job => 
      ['new', 'pending', 'assigned_to_gf'].includes(job.status)
    ).length;
    
    // "Pre-Field" = being pre-fielded or scheduled
    const preField = filteredJobs.filter(job => 
      ['pre_fielding', 'pre-field', 'scheduled'].includes(job.status)
    ).length;
    
    // "In Progress" = crew working or awaiting review
    const inProgress = filteredJobs.filter(job => 
      ['in_progress', 'in-progress', 'pending_gf_review', 'pending_pm_approval'].includes(job.status)
    ).length;
    
    // "Completed" = ready to submit through invoiced
    const completed = filteredJobs.filter(job => 
      ['ready_to_submit', 'submitted', 'billed', 'invoiced', 'completed'].includes(job.status)
    ).length;

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
              {userRole === 'foreman' || userRole === 'crew' 
                ? 'My Assigned Jobs' 
                : userRole === 'gf' 
                  ? 'Jobs to Pre-Field & Review' 
                  : 'Work Order Dashboard'}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {userRole === 'foreman' || userRole === 'crew'
                ? 'Your scheduled work and assigned jobs'
                : userRole === 'gf'
                  ? 'Pre-field, schedule, and review crew work'
                  : 'Manage and track your work orders with AI-powered automation'}
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

      {/* Pending Approvals Alert - for GF/PM/Admin */}
      {canApprove && pendingApprovals.length > 0 && (
        <Alert 
          severity="warning" 
          sx={{ mb: 3, borderRadius: 2 }}
          action={
            <Button 
              color="inherit" 
              size="small"
              onClick={() => {
                // Navigate to first job with pending approval
                if (pendingApprovals[0]?.jobId) {
                  navigate(`/jobs/${pendingApprovals[0].jobId}/files`);
                }
              }}
            >
              Review Now
            </Button>
          }
        >
          <Typography variant="body2">
            <strong>{pendingApprovals.length} document{pendingApprovals.length > 1 ? 's' : ''} awaiting approval</strong>
            {' '}- Draft documents need GF/PM review before submission
          </Typography>
        </Alert>
      )}

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
            <Divider />
            <MenuItem disabled sx={{ opacity: 0.7, fontSize: '0.75rem' }}>— New Jobs —</MenuItem>
            <MenuItem onClick={() => { setFilter('new'); handleMenuClose(); }}>New</MenuItem>
            <MenuItem onClick={() => { setFilter('assigned_to_gf'); handleMenuClose(); }}>Assigned to GF</MenuItem>
            <Divider />
            <MenuItem disabled sx={{ opacity: 0.7, fontSize: '0.75rem' }}>— Pre-Field —</MenuItem>
            <MenuItem onClick={() => { setFilter('pre_fielding'); handleMenuClose(); }}>Pre-Fielding</MenuItem>
            <MenuItem onClick={() => { setFilter('scheduled'); handleMenuClose(); }}>Scheduled</MenuItem>
            <Divider />
            <MenuItem disabled sx={{ opacity: 0.7, fontSize: '0.75rem' }}>— In Progress —</MenuItem>
            <MenuItem onClick={() => { setFilter('in_progress'); handleMenuClose(); }}>In Progress</MenuItem>
            <MenuItem onClick={() => { setFilter('pending_gf_review'); handleMenuClose(); }}>Awaiting GF Review</MenuItem>
            <MenuItem onClick={() => { setFilter('pending_pm_approval'); handleMenuClose(); }}>Awaiting PM Approval</MenuItem>
            <Divider />
            <MenuItem disabled sx={{ opacity: 0.7, fontSize: '0.75rem' }}>— Completed —</MenuItem>
            <MenuItem onClick={() => { setFilter('ready_to_submit'); handleMenuClose(); }}>Ready to Submit</MenuItem>
            <MenuItem onClick={() => { setFilter('submitted'); handleMenuClose(); }}>Submitted</MenuItem>
            <MenuItem onClick={() => { setFilter('billed'); handleMenuClose(); }}>Billed</MenuItem>
            <MenuItem onClick={() => { setFilter('invoiced'); handleMenuClose(); }}>Invoiced</MenuItem>
            <Divider />
            <MenuItem onClick={() => { setFilter('stuck'); handleMenuClose(); }}>
              <BlockIcon fontSize="small" sx={{ mr: 1, color: 'error.main' }} />
              Stuck
            </MenuItem>
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

      {/* Work Orders Grid - GF View vs Standard View */}
      {/* Show GF categorized view for GF role, or Admin/PM who want the organized view */}
      {!loading && !error && (userRole === 'gf' || userRole === 'admin' || userRole === 'pm' || isAdmin) && filter === 'all' && !search ? (
        /* ========== GF CATEGORIZED VIEW ========== */
        <Box>
          {/* PRE-FIELDING IN PROGRESS - Show as flip cards at the top */}
          {gfCategories.preFieldingInProgress.length > 0 && (
            <Box sx={{ mb: 4 }}>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <ConstructionIcon fontSize="small" color="primary" />
                Pre-Fielding In Progress ({gfCategories.preFieldingInProgress.length})
              </Typography>
              <Grid container spacing={2}>
                {gfCategories.preFieldingInProgress.map((job) => {
                  const isFlipped = !!flippedCards[job._id];
                  
                  return (
                    <Grid item xs={12} md={6} lg={4} key={job._id}>
                      <Box sx={{ height: 340, position: 'relative' }}>
                        {/* FRONT SIDE */}
                        {!isFlipped && (
                          <Card sx={{
                            position: 'absolute',
                            top: 0, left: 0, width: '100%', height: '100%',
                            borderRadius: 2, boxShadow: 2,
                            display: 'flex', flexDirection: 'column',
                            border: '2px solid',
                            borderColor: 'primary.main',
                          }}>
                            <CardContent sx={{ flexGrow: 1 }}>
                              <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                                <Box flex={1}>
                                  <Typography variant="h6" component="h2" gutterBottom sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {job.pmNumber || job.woNumber || job.title || 'Untitled'}
                                  </Typography>
                                  {job.address && (
                                    <Typography variant="body2" color="text.secondary">
                                      📍 {job.address}
                                    </Typography>
                                  )}
                                </Box>
                                <Chip label="PRE-FIELDING" color="primary" size="small" />
                              </Box>
                              
                              {/* Workflow Info */}
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                {job.userId && (
                                  <Typography variant="caption" color="text.secondary">
                                    📝 Created by {job.userId.name || job.userId.email}
                                  </Typography>
                                )}
                                {job.dueDate && (
                                  <Typography variant="caption" color={new Date(job.dueDate) < new Date() ? 'error.main' : 'text.secondary'}>
                                    ⏰ Due: {new Date(job.dueDate).toLocaleDateString()}
                                  </Typography>
                                )}
                              </Box>
                              
                              {/* Dependencies Preview */}
                              {job.dependencies && job.dependencies.length > 0 && (
                                <Box sx={{ mt: 2 }}>
                                  <Typography variant="caption" color="text.secondary" fontWeight="bold">Dependencies:</Typography>
                                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                                    {job.dependencies.map((dep, i) => (
                                      <Chip key={i} size="small" label={getDependencyTypeLabel(dep.type)} color={getDependencyStatusColor(dep.status)} variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
                                    ))}
                                  </Box>
                                </Box>
                              )}
                            </CardContent>
                            <Divider />
                            <CardActions sx={{ justifyContent: 'space-between', px: 2 }}>
                              <Tooltip title="Flip to see checklist">
                                <IconButton size="small" onClick={() => handleCardFlip(job._id)} color="primary">
                                  <FlipIcon />
                                </IconButton>
                              </Tooltip>
                              <Button size="small" component={Link} to={`/jobs/${job._id}/files`}>Files</Button>
                              <Button size="small" component={Link} to={`/jobs/${job._id}/details`}>Details</Button>
                              <IconButton size="small" onClick={(e) => handleJobMenuOpen(e, job._id)}><MoreVertIcon /></IconButton>
                            </CardActions>
                          </Card>
                        )}
                        
                        {/* BACK SIDE - Pre-field Checklist */}
                        {isFlipped && (
                          <Card sx={{
                            position: 'absolute',
                            top: 0, left: 0, width: '100%', height: '100%',
                            borderRadius: 2, boxShadow: 2,
                            display: 'flex', flexDirection: 'column',
                            bgcolor: 'background.paper',
                          }}>
                            <CardContent sx={{ flexGrow: 1, overflow: 'auto', py: 1 }}>
                              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                                <Typography variant="subtitle2" fontWeight="bold">
                                  {job.pmNumber || job.woNumber || job.title}
                                </Typography>
                                <Chip label="PRE-FIELD" color="primary" size="small" sx={{ height: 20, fontSize: '0.65rem' }} />
                              </Box>
                              
                              <Typography variant="caption" color="primary" fontWeight="bold" display="flex" alignItems="center" gap={0.5} mb={1}>
                                <ConstructionIcon fontSize="small" />
                                Pre-Field Checklist
                              </Typography>
                              <Box sx={{ maxHeight: 220, overflow: 'auto' }}>
                                {preFieldItems.map((item) => {
                                  const isChecked = preFieldChecklist[job._id]?.[item.key]?.checked || false;
                                  const notes = preFieldChecklist[job._id]?.[item.key]?.notes || '';
                                  
                                  return (
                                    <Box key={item.key} sx={{ mb: 0.5 }}>
                                      <FormControlLabel
                                        control={
                                          <Checkbox 
                                            size="small"
                                            checked={isChecked}
                                            onChange={(e) => handlePreFieldCheck(job._id, item.key, e.target.checked)}
                                            sx={{ py: 0 }}
                                          />
                                        }
                                        label={<Typography variant="caption" fontWeight={isChecked ? 'bold' : 'normal'}>{item.label}</Typography>}
                                        sx={{ m: 0, height: 24 }}
                                      />
                                      <Collapse in={isChecked}>
                                        <TextField
                                          size="small"
                                          placeholder={`Details for ${item.label}...`}
                                          value={notes}
                                          onChange={(e) => handlePreFieldNotes(job._id, item.key, e.target.value)}
                                          multiline rows={2} fullWidth
                                          sx={{ ml: 3, mb: 1, '& .MuiInputBase-input': { fontSize: '0.75rem', py: 0.5 } }}
                                        />
                                      </Collapse>
                                    </Box>
                                  );
                                })}
                              </Box>
                            </CardContent>
                            <Divider />
                            <CardActions sx={{ justifyContent: 'space-between', px: 2 }}>
                              <Tooltip title="Flip back">
                                <IconButton size="small" onClick={() => handleCardFlip(job._id)} color="primary">
                                  <FlipIcon />
                                </IconButton>
                              </Tooltip>
                              <Button size="small" variant="contained" color="primary" onClick={() => handleSavePreField(job._id)} sx={{ borderRadius: 1, fontSize: '0.7rem' }}>
                                Save & Schedule
                              </Button>
                              <Button size="small" component={Link} to={`/jobs/${job._id}/details`}>Full Details</Button>
                            </CardActions>
                          </Card>
                        )}
                      </Box>
                    </Grid>
                  );
                })}
              </Grid>
            </Box>
          )}

          {/* TODAY'S WORK */}
          {renderSectionHeader("Today's Work", <TodayIcon fontSize="small" />, gfCategories.todaysWork.length, 'todaysWork')}
          <Collapse in={expandedSections.todaysWork}>
            {gfCategories.todaysWork.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2, px: 2 }}>
                No jobs scheduled for today
              </Typography>
            ) : (
              <Box sx={{ mb: 2 }}>
                {gfCategories.todaysWork.map((job) => (
                  <Box 
                    key={job._id} 
                    sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      py: 1, 
                      px: 2, 
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight="medium" noWrap>
                        {job.pmNumber || job.woNumber || job.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {job.address} {job.assignedTo && `• ${job.assignedTo.name || job.assignedTo.email}`}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Button size="small" component={Link} to={`/jobs/${job._id}/files`}>Files</Button>
                      <IconButton size="small" component={Link} to={`/jobs/${job._id}/details`}><MoreVertIcon fontSize="small" /></IconButton>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Collapse>

          {/* STUCK JOBS */}
          {gfCategories.stuck.length > 0 && (
            <>
              {renderSectionHeader("Stuck", <BlockIcon fontSize="small" />, gfCategories.stuck.length, 'stuck')}
              <Collapse in={expandedSections.stuck}>
                <Box sx={{ mb: 2 }}>
                  {gfCategories.stuck.map((job) => (
                    <Box 
                      key={job._id} 
                      sx={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        py: 1, 
                        px: 2, 
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        bgcolor: 'error.50',
                        '&:hover': { bgcolor: 'error.100' },
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" fontWeight="medium" noWrap color="error.main">
                          {job.pmNumber || job.woNumber || job.title}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {job.stuckReason || job.address}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Button size="small" color="success" onClick={(e) => handleUnstickJob(job._id, e)}>Resume</Button>
                        <IconButton size="small" component={Link} to={`/jobs/${job._id}/details`}><MoreVertIcon fontSize="small" /></IconButton>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Collapse>
            </>
          )}

          {/* NEEDS SCHEDULING */}
          {renderSectionHeader("Needs Scheduling", <EventNoteIcon fontSize="small" />, gfCategories.needsScheduling.length, 'needsScheduling')}
          <Collapse in={expandedSections.needsScheduling}>
            {gfCategories.needsScheduling.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2, px: 2 }}>
                All pre-fielded jobs are scheduled
              </Typography>
            ) : (
              <Box sx={{ mb: 2 }}>
                {gfCategories.needsScheduling.map((job) => (
                  <Box 
                    key={job._id} 
                    sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      py: 1, 
                      px: 2, 
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight="medium" noWrap>
                        {job.pmNumber || job.woNumber || job.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {job.address}
                        {job.dueDate && ` • Due: ${new Date(job.dueDate).toLocaleDateString()}`}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Button size="small" onClick={() => { setSelectedJobId(job._id); handleOpenAssignDialog(); }}>Assign</Button>
                      <Button size="small" component={Link} to={`/jobs/${job._id}/files`}>Files</Button>
                      <IconButton size="small" component={Link} to={`/jobs/${job._id}/details`}><MoreVertIcon fontSize="small" /></IconButton>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Collapse>

          {/* PENDING PRE-FIELD */}
          {renderSectionHeader("Pending Pre-Field", <ScheduleIcon fontSize="small" />, gfCategories.pendingPreField.length, 'pendingPreField')}
          <Collapse in={expandedSections.pendingPreField}>
            {gfCategories.pendingPreField.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2, px: 2 }}>
                No jobs pending pre-field
              </Typography>
            ) : (
              <Box sx={{ mb: 2 }}>
                {gfCategories.pendingPreField.map((job) => (
                  <Box 
                    key={job._id} 
                    sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      py: 1, 
                      px: 2, 
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight="medium" noWrap>
                        {job.pmNumber || job.woNumber || job.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {job.address}
                        {job.dueDate && ` • Due: ${new Date(job.dueDate).toLocaleDateString()}`}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Button 
                        size="small" 
                        variant="outlined"
                        color="primary"
                        onClick={async () => {
                          try {
                            await api.put(`/api/jobs/${job._id}/status`, { status: 'pre_fielding' });
                            const response = await api.get('/api/jobs');
                            setJobs(response.data);
                            // Initialize checklist for this job
                            initPreFieldChecklist(job._id);
                            setSnackbar({ open: true, message: 'Started pre-fielding', severity: 'success' });
                          } catch (err) {
                            setSnackbar({ open: true, message: 'Failed to start pre-field', severity: 'error' });
                          }
                        }}
                      >
                        Start Pre-Field
                      </Button>
                      <Button size="small" component={Link} to={`/jobs/${job._id}/files`}>Files</Button>
                      <IconButton size="small" component={Link} to={`/jobs/${job._id}/details`}><MoreVertIcon fontSize="small" /></IconButton>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Collapse>

          {/* SCHEDULED (Future) */}
          {gfCategories.scheduled.length > 0 && (
            <>
              {renderSectionHeader("Scheduled", <CalendarIcon fontSize="small" />, gfCategories.scheduled.length, 'scheduled')}
              <Collapse in={expandedSections.scheduled}>
                <Box sx={{ mb: 2 }}>
                  {gfCategories.scheduled.map((job) => (
                    <Box 
                      key={job._id} 
                      sx={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        py: 1, 
                        px: 2, 
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" fontWeight="medium" noWrap>
                          {job.pmNumber || job.woNumber || job.title}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {new Date(job.crewScheduledDate).toLocaleDateString()} • {job.assignedTo?.name || job.assignedTo?.email || 'Unassigned'}
                          {job.address && ` • ${job.address}`}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Button size="small" component={Link} to={`/jobs/${job._id}/files`}>Files</Button>
                        <IconButton size="small" component={Link} to={`/jobs/${job._id}/details`}><MoreVertIcon fontSize="small" /></IconButton>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Collapse>
            </>
          )}
        </Box>
      ) : !loading && !error && (
        /* ========== STANDARD VIEW (for non-GF or filtered/searched) ========== */
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
            filteredJobs.map((job) => {
              const isFlipped = !!flippedCards[job._id];
              const details = jobDetails[job._id] || job;
              
              return (
              <Grid item xs={12} md={6} lg={4} key={job._id}>
                {/* Flip Card Container - No animation, just show/hide */}
                <Box sx={{ height: 340, position: 'relative' }}>
                  {/* Show front or back based on flip state */}
                  {/* FRONT SIDE - only render when not flipped */}
                  {!isFlipped && (
                    <Card sx={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      borderRadius: 2,
                      boxShadow: 2,
                      display: 'flex',
                      flexDirection: 'column',
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
                            label={getStatusLabel(job.status)}
                            color={getStatusColor(job.status)}
                            size="small"
                            variant="filled"
                          />
                        </Box>

                        {job.description && (
                          <Typography variant="body2" color="text.secondary" sx={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            mb: 2
                          }}>
                            {job.description}
                          </Typography>
                        )}

                        {/* Workflow Info */}
                        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                          {/* Created By */}
                          <Typography variant="caption" color="text.secondary" display="flex" alignItems="center" gap={0.5}>
                            📝 Created: {formatDate(job.createdAt)}
                            {job.userId && (
                              <span style={{ fontWeight: 'bold' }}>
                                {' '}by {job.userId.name || job.userId.email || 'Unknown'}
                                {job.userId._id && <span style={{ opacity: 0.6 }}> ({job.userId._id.toString().slice(-6)})</span>}
                              </span>
                            )}
                          </Typography>
                          
                          {/* Pre-fielded By */}
                          {job.preFieldDate && (
                            <Typography variant="caption" color="info.main" display="flex" alignItems="center" gap={0.5}>
                              🔍 Pre-fielded: {formatDate(job.preFieldDate)}
                              {job.assignedToGF && (
                                <span style={{ fontWeight: 'bold' }}>
                                  {' '}by {job.assignedToGF.name || job.assignedToGF.email || 'GF'}
                                  {job.assignedToGF._id && <span style={{ opacity: 0.6 }}> ({job.assignedToGF._id.toString().slice(-6)})</span>}
                                </span>
                              )}
                            </Typography>
                          )}
                          
                          {/* Scheduled For */}
                          {job.crewScheduledDate && (
                            <Typography variant="caption" color="primary.main" display="flex" alignItems="center" gap={0.5}>
                              📅 Scheduled: {formatDate(job.crewScheduledDate)}
                              {job.assignedTo && (
                                <span style={{ fontWeight: 'bold' }}>
                                  {' '}→ {job.assignedTo.name || job.assignedTo.email || 'Crew'}
                                  {job.assignedTo._id && <span style={{ opacity: 0.6 }}> ({job.assignedTo._id.toString().slice(-6)})</span>}
                                </span>
                              )}
                            </Typography>
                          )}
                          
                          {/* Due Date */}
                          {job.dueDate && (
                            <Typography variant="caption" color={new Date(job.dueDate) < new Date() ? 'error.main' : 'text.secondary'} display="flex" alignItems="center" gap={0.5}>
                              ⏰ Due: {formatDate(job.dueDate)}
                            </Typography>
                          )}
                        </Box>
                        
                        {/* Quick Dependencies Preview */}
                        {job.dependencies && job.dependencies.length > 0 && (
                          <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {job.dependencies.slice(0, 3).map((dep, i) => (
                              <Chip 
                                key={i}
                                size="small"
                                label={getDependencyTypeLabel(dep.type)}
                                color={getDependencyStatusColor(dep.status)}
                                variant="outlined"
                                sx={{ fontSize: '0.65rem', height: 20 }}
                              />
                            ))}
                            {job.dependencies.length > 3 && (
                              <Chip 
                                size="small"
                                label={`+${job.dependencies.length - 3}`}
                                variant="outlined"
                                sx={{ fontSize: '0.65rem', height: 20 }}
                              />
                            )}
                          </Box>
                        )}
                        
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
                      </CardContent>

                      <Divider />

                      <CardActions sx={{ justifyContent: 'space-between', px: 2 }}>
                        <Tooltip title="Flip card for details">
                          <IconButton 
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCardFlip(job._id);
                            }}
                            color="primary"
                          >
                            <FlipIcon />
                          </IconButton>
                        </Tooltip>
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
                  )}

                  {/* BACK SIDE - only render when flipped */}
                  {isFlipped && (
                    <Card sx={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      borderRadius: 2,
                      boxShadow: 2,
                      display: 'flex',
                      flexDirection: 'column',
                      bgcolor: 'background.paper',
                    }}>
                      <CardContent sx={{ flexGrow: 1, overflow: 'auto', py: 1 }}>
                        {/* Header */}
                        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                          <Typography variant="subtitle2" fontWeight="bold" sx={{ 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis', 
                            whiteSpace: 'nowrap',
                            maxWidth: '70%'
                          }}>
                            {job.pmNumber || job.woNumber || job.title}
                          </Typography>
                          <Chip
                            label={getStatusLabel(job.status)}
                            color={getStatusColor(job.status)}
                            size="small"
                            sx={{ height: 20, fontSize: '0.65rem' }}
                          />
                        </Box>

                        {/* CONDITIONAL: Pre-Field Checklist OR Dependencies View */}
                        {needsPreField(job.status) ? (
                          /* PRE-FIELD CHECKLIST */
                          <Box>
                            <Typography variant="caption" color="primary" fontWeight="bold" display="flex" alignItems="center" gap={0.5} mb={1}>
                              <ConstructionIcon fontSize="small" />
                              Pre-Field Checklist
                            </Typography>
                            <Box sx={{ maxHeight: 220, overflow: 'auto' }}>
                              {preFieldItems.map((item) => {
                                const isChecked = preFieldChecklist[job._id]?.[item.key]?.checked || false;
                                const notes = preFieldChecklist[job._id]?.[item.key]?.notes || '';
                                
                                return (
                                  <Box key={item.key} sx={{ mb: 0.5 }}>
                                    <FormControlLabel
                                      control={
                                        <Checkbox 
                                          size="small"
                                          checked={isChecked}
                                          onChange={(e) => handlePreFieldCheck(job._id, item.key, e.target.checked)}
                                          sx={{ py: 0 }}
                                        />
                                      }
                                      label={
                                        <Typography variant="caption" fontWeight={isChecked ? 'bold' : 'normal'}>
                                          {item.label}
                                        </Typography>
                                      }
                                      sx={{ m: 0, height: 24 }}
                                    />
                                    <Collapse in={isChecked}>
                                      <TextField
                                        size="small"
                                        placeholder={`Details for ${item.label}...`}
                                        value={notes}
                                        onChange={(e) => handlePreFieldNotes(job._id, item.key, e.target.value)}
                                        multiline
                                        rows={2}
                                        fullWidth
                                        sx={{ 
                                          ml: 3, 
                                          mb: 1,
                                          '& .MuiInputBase-input': { fontSize: '0.75rem', py: 0.5 }
                                        }}
                                      />
                                    </Collapse>
                                  </Box>
                                );
                              })}
                            </Box>
                          </Box>
                        ) : (
                          /* DEPENDENCIES/SCHEDULE VIEW (for pre-fielded jobs) */
                          <>
                            {/* Schedule Info */}
                            <Paper variant="outlined" sx={{ p: 1, mb: 1, bgcolor: 'action.hover' }}>
                              <Typography variant="caption" color="text.secondary" fontWeight="bold" display="flex" alignItems="center" gap={0.5}>
                                <CalendarIcon fontSize="small" />
                                Schedule
                              </Typography>
                              <Box sx={{ mt: 0.5, pl: 2 }}>
                                {details.crewScheduledDate ? (
                                  <Typography variant="caption" display="block">
                                    🗓️ Scheduled: {formatDate(details.crewScheduledDate)}
                                  </Typography>
                                ) : (
                                  <Typography variant="caption" color="text.secondary" display="block">
                                    Not scheduled
                                  </Typography>
                                )}
                                {details.dueDate && (
                                  <Typography variant="caption" display="block" color={new Date(details.dueDate) < new Date() ? 'error.main' : 'text.secondary'}>
                                    ⏰ Due: {formatDate(details.dueDate)}
                                  </Typography>
                                )}
                                {details.assignedTo && (
                                  <Typography variant="caption" display="block">
                                    👷 Crew: {details.assignedTo.name || details.assignedTo.email || 'Assigned'}
                                  </Typography>
                                )}
                              </Box>
                            </Paper>

                            {/* Dependencies */}
                            <Paper variant="outlined" sx={{ p: 1, mb: 1 }}>
                              <Typography variant="caption" color="text.secondary" fontWeight="bold" display="flex" alignItems="center" gap={0.5}>
                                <BuildIcon fontSize="small" />
                                Dependencies ({details.dependencies?.length || 0})
                              </Typography>
                              <Box sx={{ mt: 0.5, maxHeight: 80, overflow: 'auto' }}>
                                {details.dependencies && details.dependencies.length > 0 ? (
                                  details.dependencies.map((dep, i) => (
                                    <Box key={dep._id || i} display="flex" alignItems="center" gap={0.5} mb={0.5} flexWrap="wrap">
                                      <Chip 
                                        size="small"
                                        label={getDependencyTypeLabel(dep.type)}
                                        variant="outlined"
                                        sx={{ fontSize: '0.6rem', height: 18 }}
                                      />
                                      <Tooltip title="Click to change status" arrow>
                                        <Chip 
                                          size="small"
                                          label={getDependencyStatusLabel(dep.status)}
                                          color={getDependencyStatusColor(dep.status)}
                                          onClick={(e) => handleDependencyStatusClick(job._id, dep._id, dep.status, e)}
                                          sx={{ 
                                            fontSize: '0.55rem', 
                                            height: 16, 
                                            fontWeight: 'bold',
                                            cursor: 'pointer',
                                            '&:hover': { opacity: 0.8 }
                                          }}
                                        />
                                      </Tooltip>
                                      {dep.ticketNumber && (
                                        <Typography variant="caption" color="text.secondary">
                                          #{dep.ticketNumber}
                                        </Typography>
                                      )}
                                      {dep.scheduledDate && (
                                        <Typography variant="caption" color="text.secondary">
                                          {new Date(dep.scheduledDate).toLocaleDateString()}
                                        </Typography>
                                      )}
                                    </Box>
                                  ))
                                ) : (
                                  <Typography variant="caption" color="text.secondary">
                                    No dependencies tracked
                                  </Typography>
                                )}
                              </Box>
                            </Paper>

                            {/* Recent Notes Preview */}
                            <Paper variant="outlined" sx={{ p: 1 }}>
                              <Typography variant="caption" color="text.secondary" fontWeight="bold" display="flex" alignItems="center" gap={0.5}>
                                <ChatIcon fontSize="small" />
                                Notes ({details.notes?.length || 0})
                              </Typography>
                              <Box sx={{ mt: 0.5, maxHeight: 50, overflow: 'auto' }}>
                                {details.notes && details.notes.length > 0 ? (
                                  details.notes.slice(-2).map((note, i) => (
                                    <Typography key={i} variant="caption" display="block" sx={{ 
                                      overflow: 'hidden', 
                                      textOverflow: 'ellipsis', 
                                      whiteSpace: 'nowrap' 
                                    }}>
                                      <strong>{note.userName || 'User'}:</strong> {note.message}
                                    </Typography>
                                  ))
                                ) : (
                                  <Typography variant="caption" color="text.secondary">
                                    No notes yet
                                  </Typography>
                                )}
                              </Box>
                            </Paper>
                          </>
                        )}
                      </CardContent>

                      <Divider />

                      <CardActions sx={{ justifyContent: 'space-between', px: 2 }}>
                        <Tooltip title="Flip back">
                          <IconButton 
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCardFlip(job._id);
                            }}
                            color="primary"
                          >
                            <FlipIcon />
                          </IconButton>
                        </Tooltip>
                        
                        {/* Show "Save Pre-Field" for jobs needing pre-field, otherwise "Full Details" */}
                        {needsPreField(job.status) ? (
                          <Button
                            size="small"
                            variant="contained"
                            color="primary"
                            onClick={() => handleSavePreField(job._id)}
                            sx={{ borderRadius: 1, fontSize: '0.7rem' }}
                          >
                            Save Pre-Field
                          </Button>
                        ) : (
                          <Button
                            size="small"
                            component={Link}
                            to={`/jobs/${job._id}/details`}
                            sx={{ borderRadius: 1 }}
                          >
                            Full Details
                          </Button>
                        )}
                        
                        <IconButton 
                          size="small"
                          onClick={(e) => handleJobMenuOpen(e, job._id)}
                        >
                          <MoreVertIcon />
                        </IconButton>
                      </CardActions>
                    </Card>
                  )}
                </Box>
              </Grid>
            );})
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
        {(isAdmin || userRole === 'gf') && (
          <MenuItem onClick={handleOpenAssignDialog}>
            <AssignIcon fontSize="small" sx={{ mr: 1 }} />
            Assign to Foreman
          </MenuItem>
        )}
        
        {/* Mark as Stuck option for GF/PM/Admin */}
        {(isAdmin || ['gf', 'pm'].includes(userRole)) && selectedJobId && (() => {
          const job = jobs.find(j => j._id === selectedJobId);
          if (!job || job.status === 'stuck') return null;
          if (['ready_to_submit', 'submitted', 'billed', 'invoiced'].includes(job.status)) return null;
          return (
            <MenuItem onClick={(e) => handleOpenStuckDialog(selectedJobId, e)} sx={{ color: 'error.main' }}>
              <BlockIcon fontSize="small" sx={{ mr: 1 }} />
              Mark as Stuck
            </MenuItem>
          );
        })()}
        
        {/* Unstick option for stuck jobs */}
        {(isAdmin || ['gf', 'pm'].includes(userRole)) && selectedJobId && (() => {
          const job = jobs.find(j => j._id === selectedJobId);
          if (!job || job.status !== 'stuck') return null;
          return (
            <MenuItem onClick={(e) => handleUnstickJob(selectedJobId, e)} sx={{ color: 'success.main' }}>
              <CheckCircleIcon fontSize="small" sx={{ mr: 1 }} />
              Resume Job
            </MenuItem>
          );
        })()}
        
        {/* Workflow Status Transitions */}
        {selectedJobId && (() => {
          const job = jobs.find(j => j._id === selectedJobId);
          const transitions = getAvailableTransitions(job);
          if (transitions.length === 0) return null;
          return (
            <>
              <Divider />
              <MenuItem disabled sx={{ opacity: 0.7, fontSize: '0.75rem', py: 0.5 }}>
                — Update Status —
              </MenuItem>
              {transitions.map((t) => (
                <MenuItem 
                  key={t.status} 
                  onClick={() => handleUpdateStatus(t.status)}
                  sx={{ color: 'primary.main' }}
                >
                  <CheckCircleIcon fontSize="small" sx={{ mr: 1 }} />
                  {t.label}
                </MenuItem>
              ))}
            </>
          );
        })()}
        
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

      {/* Mark as Stuck Dialog */}
      <Dialog open={stuckDialogOpen} onClose={() => setStuckDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
            <BlockIcon />
            Mark Job as Stuck
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Use this when a job has a design discrepancy, missing materials, utility issue, 
            or any problem that will delay completion.
          </Typography>
          <TextField
            id="stuckReason"
            name="stuckReason"
            label="Reason for Delay"
            multiline
            rows={3}
            value={stuckReason}
            onChange={(e) => setStuckReason(e.target.value)}
            placeholder="Describe the issue blocking this job..."
            fullWidth
            required
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStuckDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleMarkAsStuck} 
            variant="contained" 
            color="error"
            startIcon={<BlockIcon />}
            disabled={!stuckReason.trim()}
          >
            Mark as Stuck
          </Button>
        </DialogActions>
      </Dialog>

      {/* Schedule Dependency Dialog */}
      <Dialog open={depScheduleDialogOpen} onClose={() => setDepScheduleDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CalendarIcon color="primary" />
            Schedule Dependency
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            When is this scheduled for?
          </Typography>
          <TextField
            id="depScheduleDate"
            name="depScheduleDate"
            label="Scheduled Date"
            type="date"
            value={depScheduleData.date}
            onChange={(e) => setDepScheduleData({ ...depScheduleData, date: e.target.value })}
            InputLabelProps={{ shrink: true }}
            fullWidth
            required
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDepScheduleDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleSaveDepSchedule} 
            variant="contained" 
            startIcon={<CalendarIcon />}
            disabled={!depScheduleData.date}
          >
            Schedule
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