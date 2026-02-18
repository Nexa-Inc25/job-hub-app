/**
 * FieldLedger - Dashboard Component
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import {
  Container,
  Typography,
  Box,
  Fab,
  Divider,
  Menu,
  MenuItem,
  LinearProgress,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import FolderIcon from '@mui/icons-material/Folder';
import AssignIcon from '@mui/icons-material/AssignmentInd';
import BlockIcon from '@mui/icons-material/Block';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import DownloadIcon from '@mui/icons-material/Download';
import ScheduleIcon from '@mui/icons-material/Schedule';
import CalendarIcon from '@mui/icons-material/CalendarMonth';
import FeedbackButton from './FeedbackButton';
import OfflineIndicator from './OfflineIndicator';

// Sub-components
import { DashboardStats, DashboardFilters, DashboardJobList, DashboardCharts, DashboardSchedule } from './dashboard/index';

// Shared helpers
import {
  STATUS_LABELS_MAP,
  parseTokenPayload,
  extractUserPermissions,
  getWelcomeMessage,
  getJobDisplayTitle,
  canManageJobs,
  canMarkAsStuck,
  shouldShowGFView,
  createInitialChecklist,
  getLocalDateString,
  isPreFieldingInProgress,
  isPendingPreField,
  needsScheduling,
  isStuck,
  isScheduledForDate,
  isScheduledAfterDate,
  getAssignmentDataFromJob,
  prepareAssignmentDataForApi,
  EMPTY_ASSIGNMENT_DATA,
  statusCycle,
  getDependencyStatusLabel,
  preFieldItems,
} from './dashboard/dashboardHelpers';

const Dashboard = () => {
  // ---- State ----
  const [jobs, setJobs] = useState([]);
  const [filteredJobs, setFilteredJobs] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [jobMenuAnchor, setJobMenuAnchor] = useState(null);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [foremen, setForemen] = useState([]);
  const [assignmentData, setAssignmentData] = useState(EMPTY_ASSIGNMENT_DATA);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [userName, setUserName] = useState('');
  const [canApprove, setCanApprove] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [flippedCards, setFlippedCards] = useState({});
  const [jobDetails, setJobDetails] = useState({});
  const [preFieldChecklist, setPreFieldChecklist] = useState({});
  const [flipLock, setFlipLock] = useState(false);
  const [stuckDialogOpen, setStuckDialogOpen] = useState(false);
  const [stuckReason, setStuckReason] = useState('');
  const [stuckJobId, setStuckJobId] = useState(null);
  const [depScheduleDialogOpen, setDepScheduleDialogOpen] = useState(false);
  const [depScheduleData, setDepScheduleData] = useState({ jobId: null, depId: null, date: '' });
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelType, setCancelType] = useState('rescheduled');
  const [cancelJobId, setCancelJobId] = useState(null);
  const [expandedSections, setExpandedSections] = useState({
    pendingPreField: true, needsScheduling: true, stuck: true, todaysWork: true, scheduled: false,
  });
  const navigate = useNavigate();

  // ---- Auth & permissions ----
  useEffect(() => {
    const payload = parseTokenPayload(localStorage.getItem('token'));
    const perms = extractUserPermissions(payload);
    setIsAdmin(perms.isAdmin);
    setIsSuperAdmin(perms.isSuperAdmin);
    setUserRole(perms.userRole);
    setCanApprove(perms.canApprove);
    if (payload?.name) setUserName(payload.name);
    else api.get('/api/users/me').then((res) => setUserName(res.data?.name || '')).catch(() => setUserName(''));
  }, []);

  // ---- Data fetching ----
  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      const url = search ? `/api/jobs?search=${encodeURIComponent(search)}` : '/api/jobs';
      const response = await api.get(url);
      setJobs(Array.isArray(response.data) ? response.data : []);
      setError('');
    } catch (err) {
      console.error('Error fetching jobs:', err);
      setError('Failed to load work orders');
      if (err.response?.status === 401) { localStorage.removeItem('token'); navigate('/login'); }
    } finally {
      setLoading(false);
    }
  }, [navigate, search]);

  const fetchPendingApprovals = useCallback(async () => {
    if (!canApprove) return;
    try {
      const response = await api.get('/api/admin/pending-approvals');
      setPendingApprovals(response.data.pendingDocuments || response.data || []);
    } catch (err) { console.error('Error fetching pending approvals:', err); }
  }, [canApprove]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { navigate('/login'); return; }
    fetchJobs();
  }, [navigate, fetchJobs]);

  useEffect(() => { if (canApprove) fetchPendingApprovals(); }, [canApprove, fetchPendingApprovals]);

  // Extraction polling
  useEffect(() => {
    const extracting = jobs.filter((j) => j.aiExtractionStarted && !j.aiExtractionComplete);
    if (extracting.length === 0) return;
    const pollInterval = setInterval(() => fetchJobs(), 10000);
    return () => clearInterval(pollInterval);
  }, [jobs, fetchJobs]);

  // Filter
  const filterJobs = useCallback(() => {
    let filtered = jobs;
    if (filter !== 'all') filtered = filtered.filter((job) => job.status === filter);
    setFilteredJobs(filtered);
  }, [jobs, filter]);

  useEffect(() => { filterJobs(); }, [filterJobs]);

  // ---- GF Categories ----
  const categorizeJobsForGF = useCallback(() => {
    const todayStr = getLocalDateString(new Date());
    return {
      preFieldingInProgress: jobs.filter(isPreFieldingInProgress),
      pendingPreField: jobs.filter(isPendingPreField),
      needsScheduling: jobs.filter(needsScheduling),
      stuck: jobs.filter(isStuck),
      todaysWork: jobs.filter((j) => isScheduledForDate(j, todayStr)),
      scheduled: jobs.filter((j) => isScheduledAfterDate(j, todayStr)),
    };
  }, [jobs]);

  const gfCategories = categorizeJobsForGF();

  // ---- Stats ----
  const getJobStats = () => {
    const total = filteredJobs.length;
    const pending = filteredJobs.filter((j) => ['new', 'pending', 'assigned_to_gf'].includes(j.status)).length;
    const preField = filteredJobs.filter((j) => ['pre_fielding', 'pre-field', 'scheduled'].includes(j.status)).length;
    const inProgress = filteredJobs.filter((j) => ['in_progress', 'in-progress', 'pending_gf_review', 'pending_qa_review', 'pending_pm_approval'].includes(j.status)).length;
    const completed = filteredJobs.filter((j) => ['ready_to_submit', 'submitted', 'billed', 'invoiced', 'completed'].includes(j.status)).length;
    return { total, pending, inProgress, completed, preField };
  };

  // ---- Handlers ----
  const handleJobMenuClose = () => { setJobMenuAnchor(null); if (!assignDialogOpen) setSelectedJobId(null); };
  const handleJobMenuOpen = (event, jobId) => { event.stopPropagation(); setJobMenuAnchor(event.currentTarget); setSelectedJobId(jobId); };

  const handleCardFlip = (jobId) => {
    if (flipLock) return;
    setFlipLock(true);
    setFlippedCards((prev) => ({ ...prev, [jobId]: !prev[jobId] }));
    if (!flippedCards[jobId]) {
      if (!jobDetails[jobId]) {
        api.get(`/api/jobs/${jobId}/full-details`).then((res) => setJobDetails((prev) => ({ ...prev, [jobId]: res.data }))).catch(() => {});
      }
      if (!preFieldChecklist[jobId]) setPreFieldChecklist((prev) => ({ ...prev, [jobId]: createInitialChecklist() }));
    }
    setTimeout(() => setFlipLock(false), 700);
  };

  const handlePreFieldCheck = (jobId, key, checked) => {
    setPreFieldChecklist((prev) => ({ ...prev, [jobId]: { ...prev[jobId], [key]: { ...prev[jobId]?.[key], checked, notes: prev[jobId]?.[key]?.notes || '' } } }));
  };

  const handlePreFieldNotes = (jobId, key, notes) => {
    setPreFieldChecklist((prev) => ({ ...prev, [jobId]: { ...prev[jobId], [key]: { ...prev[jobId]?.[key], checked: prev[jobId]?.[key]?.checked || false, notes } } }));
  };

  const handleSavePreField = async (jobId) => {
    const checklist = preFieldChecklist[jobId];
    if (!checklist) return;
    try {
      const checkedItems = Object.entries(checklist).filter(([, v]) => v.checked);
      for (const [key, value] of checkedItems) {
        await api.post(`/api/jobs/${jobId}/dependencies`, { type: key, description: value.notes || preFieldItems.find((i) => i.key === key)?.description || '', status: 'required', notes: value.notes });
      }
      api.post(`/api/jobs/${jobId}/prefield-checklist`, { decisions: checklist }).catch(() => {});
      await api.put(`/api/jobs/${jobId}/status`, { status: 'pre_fielding' });
      const response = await api.get('/api/jobs');
      setJobs(response.data);
      setFlippedCards((prev) => ({ ...prev, [jobId]: false }));
      setSnackbar({ open: true, message: `Pre-field complete! ${checkedItems.length} dependencies added.`, severity: 'success' });
    } catch (err) {
      console.error('Save pre-field error:', err);
      setSnackbar({ open: true, message: 'Failed to save pre-field data', severity: 'error' });
    }
  };

  const handleMarkAsStuck = async () => {
    if (!stuckJobId || !stuckReason.trim()) return;
    try {
      await api.put(`/api/jobs/${stuckJobId}/status`, { status: 'stuck', stuckReason: stuckReason.trim() });
      setJobs((await api.get('/api/jobs')).data);
      setSnackbar({ open: true, message: 'Job marked as stuck', severity: 'warning' });
      setStuckDialogOpen(false);
      setStuckJobId(null);
      setStuckReason('');
    } catch (err) {
      console.error('Mark as stuck error:', err);
      setSnackbar({ open: true, message: 'Failed to update job status', severity: 'error' });
    }
  };

  const handleUnstickJob = async (jobId, _e) => {
    try {
      await api.put(`/api/jobs/${jobId}/status`, { status: 'pre_fielding' });
      setJobs((await api.get('/api/jobs')).data);
      setSnackbar({ open: true, message: 'Job moved back to Pre-Fielding', severity: 'success' });
    } catch (err) {
      console.error('Unstick job error:', err);
      setSnackbar({ open: true, message: 'Failed to update job status', severity: 'error' });
    }
  };

  const handleCancelJob = async () => {
    if (!cancelJobId || !cancelReason.trim()) return;
    try {
      await api.post(`/api/jobs/${cancelJobId}/cancel`, { reason: cancelReason.trim(), cancelType });
      setJobs((await api.get('/api/jobs')).data);
      setSnackbar({ open: true, message: cancelType === 'rescheduled' ? 'Job moved to needs scheduling' : 'Job canceled', severity: 'info' });
      setCancelDialogOpen(false);
      setCancelJobId(null);
      setCancelReason('');
    } catch (err) {
      console.error('Cancel job error:', err);
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to cancel job', severity: 'error' });
    }
  };

  const handleDependencyStatusClick = async (jobId, depId, currentStatus, e) => {
    e.stopPropagation();
    const currentIndex = statusCycle.indexOf(currentStatus);
    const nextStatus = statusCycle[(currentIndex + 1) % statusCycle.length];
    if (nextStatus === 'scheduled') {
      setDepScheduleData({ jobId, depId, date: new Date().toISOString().split('T')[0] });
      setDepScheduleDialogOpen(true);
      return;
    }
    try {
      await api.put(`/api/jobs/${jobId}/dependencies/${depId}`, { status: nextStatus });
      setJobDetails((prev) => ({ ...prev, [jobId]: { ...prev[jobId], dependencies: prev[jobId]?.dependencies?.map((d) => (d._id === depId ? { ...d, status: nextStatus, scheduledDate: null } : d)) } }));
      setSnackbar({ open: true, message: `Status changed to ${getDependencyStatusLabel(nextStatus)}`, severity: 'success' });
    } catch (err) {
      console.error('Update dependency error:', err);
      setSnackbar({ open: true, message: 'Failed to update status', severity: 'error' });
    }
  };

  const handleSaveDepSchedule = async () => {
    const { jobId, depId, date } = depScheduleData;
    if (!jobId || !depId || !date) return;
    try {
      const scheduledDate = new Date(date + 'T12:00:00');
      await api.put(`/api/jobs/${jobId}/dependencies/${depId}`, { status: 'scheduled', scheduledDate: scheduledDate.toISOString() });
      setJobDetails((prev) => ({ ...prev, [jobId]: { ...prev[jobId], dependencies: prev[jobId]?.dependencies?.map((d) => (d._id === depId ? { ...d, status: 'scheduled', scheduledDate: scheduledDate.toISOString() } : d)) } }));
      setSnackbar({ open: true, message: `Scheduled for ${scheduledDate.toLocaleDateString()}`, severity: 'success' });
      setDepScheduleDialogOpen(false);
    } catch (err) {
      console.error('Schedule dependency error:', err);
      setSnackbar({ open: true, message: 'Failed to schedule dependency', severity: 'error' });
    }
  };

  const handleDeleteJob = async () => {
    if (!selectedJobId) return;
    const jobTitle = getJobDisplayTitle(jobs.find((j) => j._id === selectedJobId));
    if (!globalThis.confirm(`Are you sure you want to delete "${jobTitle}"?`)) { handleJobMenuClose(); return; }
    try {
      await api.delete(`/api/jobs/${selectedJobId}`);
      setJobs(jobs.filter((j) => j._id !== selectedJobId));
      setSnackbar({ open: true, message: 'Work order deleted successfully', severity: 'success' });
    } catch (err) {
      console.error('Error deleting job:', err);
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to delete', severity: 'error' });
    } finally {
      handleJobMenuClose();
    }
  };

  const handleOpenAssignDialog = () => {
    api.get('/api/users/foremen').then((res) => setForemen(res.data)).catch(() => {});
    setAssignmentData(getAssignmentDataFromJob(jobs.find((j) => j._id === selectedJobId)));
    setAssignDialogOpen(true);
    setJobMenuAnchor(null);
  };

  const handleCloseAssignDialog = () => { setAssignDialogOpen(false); setSelectedJobId(null); setAssignmentData(EMPTY_ASSIGNMENT_DATA); };

  const handleAssignJob = async () => {
    try {
      await api.put(`/api/jobs/${selectedJobId}/assign`, prepareAssignmentDataForApi(assignmentData));
      fetchJobs();
      setSnackbar({ open: true, message: 'Job assigned successfully', severity: 'success' });
      handleCloseAssignDialog();
    } catch (err) {
      console.error('Error assigning job:', err);
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to assign', severity: 'error' });
    }
  };

  const handleUpdateStatus = async (newStatus) => {
    if (!selectedJobId) return;
    try {
      await api.put(`/api/jobs/${selectedJobId}/status`, { status: newStatus });
      setJobs(jobs.map((j) => (j._id === selectedJobId ? { ...j, status: newStatus } : j)));
      setSnackbar({ open: true, message: `Status updated to "${STATUS_LABELS_MAP[newStatus] || newStatus}"`, severity: 'success' });
    } catch (err) {
      console.error('Error updating status:', err);
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to update status', severity: 'error' });
    } finally {
      handleJobMenuClose();
    }
  };

  const handleStartPreField = async (jobId) => {
    try {
      await api.put(`/api/jobs/${jobId}/status`, { status: 'pre_fielding' });
      setJobs((await api.get('/api/jobs')).data);
      if (!preFieldChecklist[jobId]) setPreFieldChecklist((prev) => ({ ...prev, [jobId]: createInitialChecklist() }));
      setSnackbar({ open: true, message: 'Started pre-fielding', severity: 'success' });
    } catch (err) {
      console.error('Failed to start pre-field:', err);
      setSnackbar({ open: true, message: 'Failed to start pre-field', severity: 'error' });
    }
  };

  // Transition rules
  const transitionRules = {
    pmAdmin: { new: { status: 'assigned_to_gf', label: 'Assign to GF' }, pending: { status: 'assigned_to_gf', label: 'Assign to GF' }, pending_gf_review: { status: 'ready_to_submit', label: 'Approve & Ready to Submit' }, pending_qa_review: { status: 'ready_to_submit', label: 'Approve & Ready to Submit' }, pending_pm_approval: { status: 'ready_to_submit', label: 'Approve & Ready to Submit' }, ready_to_submit: { status: 'submitted', label: 'Mark as Submitted' }, submitted: { status: 'billed', label: 'Mark as Billed' }, billed: { status: 'invoiced', label: 'Mark as Invoiced' } },
    gf: { assigned_to_gf: { status: 'pre_fielding', label: 'Start Pre-Field' }, pre_fielding: { status: 'scheduled', label: 'Schedule Crew' }, pending_gf_review: { status: 'ready_to_submit', label: 'Approve & Ready to Submit' } },
    qa: { pending_qa_review: { status: 'ready_to_submit', label: 'Approve & Ready to Submit' } },
    field: { scheduled: { status: 'in_progress', label: 'Start Work' }, in_progress: { status: 'pending_pm_approval', label: 'Submit for Review' } },
  };

  const getAvailableTransitions = (job) => {
    if (!job) return [];
    const { status } = job;
    const transitions = [];
    const isPmAdmin = isAdmin || userRole === 'pm' || userRole === 'admin';
    if (isPmAdmin && transitionRules.pmAdmin[status]) transitions.push(transitionRules.pmAdmin[status]);
    if ((isPmAdmin || userRole === 'qa') && transitionRules.qa[status]) transitions.push(transitionRules.qa[status]);
    if ((isPmAdmin || userRole === 'gf') && transitionRules.gf[status]) transitions.push(transitionRules.gf[status]);
    if ((isPmAdmin || userRole === 'gf' || userRole === 'foreman' || userRole === 'crew') && transitionRules.field[status]) transitions.push(transitionRules.field[status]);
    return transitions;
  };

  const getDashboardTitle = () => {
    switch (userRole) {
      case 'foreman': return 'Field Dashboard';
      case 'crew': return 'My Work';
      case 'gf': return 'Jobs to Pre-Field & Review';
      default: return 'Work Order Dashboard';
    }
  };

  const getDashboardSubtitle = () => {
    switch (userRole) {
      case 'foreman': return "View and manage your crew's scheduled work";
      case 'crew': return 'Your scheduled work for today';
      case 'gf': return 'Pre-field, schedule, and review crew work';
      default: return 'Manage and track your work orders';
    }
  };

  const showGFView = !loading && !error && shouldShowGFView(userRole, isAdmin, filter, search);
  const showStandardView = !loading && !error && !showGFView;

  // ---- Render ----
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box sx={{ position: 'fixed', bottom: 16, right: 16, zIndex: 1000, display: 'flex', gap: 1 }}>
        <OfflineIndicator />
        <FeedbackButton />
      </Box>

      <Container maxWidth="xl" sx={{ py: 2 }}>
        {/* Header */}
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
          <Box>
            <Typography variant="h4" component="h1" gutterBottom fontWeight="bold">{getWelcomeMessage(userName)}</Typography>
            <Typography variant="h6" component="h2" color="text.secondary" sx={{ mb: 0.5 }}>{getDashboardTitle()}</Typography>
            <Typography variant="body2" color="text.secondary">{getDashboardSubtitle()}</Typography>
          </Box>
          <Box display="flex" gap={2} flexWrap="wrap">
            <Tooltip title="Export jobs to CSV spreadsheet">
              <Button variant="outlined" startIcon={<DownloadIcon />} sx={{ borderRadius: 2 }} onClick={async () => {
                try {
                  const response = await api.get('/api/jobs/export/csv', { responseType: 'blob' });
                  const blob = new Blob([response.data], { type: 'text/csv' });
                  const url = globalThis.URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = `jobs_export_${new Date().toISOString().split('T')[0]}.csv`;
                  document.body.appendChild(link);
                  link.click();
                  link.remove();
                  globalThis.URL.revokeObjectURL(url);
                } catch (err) { console.error('Export failed:', err); setSnackbar({ open: true, message: 'Export failed', severity: 'error' }); }
              }}>Export</Button>
            </Tooltip>
            <Button variant="outlined" color="error" startIcon={<WarningIcon />} onClick={() => navigate('/emergency-wo')} sx={{ borderRadius: 2 }}>Emergency WO</Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/create-wo')} sx={{ borderRadius: 2 }}>New Work Order</Button>
          </Box>
        </Box>

        <DashboardCharts canApprove={canApprove} pendingApprovals={pendingApprovals} onReviewFirst={() => { if (pendingApprovals[0]?.jobId) navigate(`/jobs/${pendingApprovals[0].jobId}/files`); }} />
        <DashboardStats stats={getJobStats()} />
        <DashboardFilters search={search} onSearchChange={setSearch} filter={filter} onFilterChange={setFilter} />

        {loading && (
          <Box mb={4}>
            <LinearProgress sx={{ borderRadius: 1, height: 8 }} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Loading work orders...</Typography>
          </Box>
        )}
        {error && <Alert severity="error" sx={{ mb: 4, borderRadius: 2 }}>{error}</Alert>}

        {showGFView && (
          <DashboardSchedule
            categories={gfCategories}
            expandedSections={expandedSections}
            onToggleSection={(s) => setExpandedSections((prev) => ({ ...prev, [s]: !prev[s] }))}
            userRole={userRole}
            onScheduleJob={(jobId) => { setSelectedJobId(jobId); handleOpenAssignDialog(); }}
            onStartPreField={handleStartPreField}
            onUnstickJob={handleUnstickJob}
            onJobMenuOpen={handleJobMenuOpen}
          />
        )}

        {showStandardView && (
          <DashboardJobList
            jobs={filteredJobs}
            flippedCards={flippedCards}
            jobDetails={jobDetails}
            preFieldChecklist={preFieldChecklist}
            userRole={userRole}
            onCardFlip={handleCardFlip}
            onJobMenuOpen={handleJobMenuOpen}
            onPreFieldCheck={handlePreFieldCheck}
            onPreFieldNotes={handlePreFieldNotes}
            onSavePreField={handleSavePreField}
            onDependencyStatusClick={handleDependencyStatusClick}
            onCreateWorkOrder={() => navigate('/create-wo')}
            search={search}
            filter={filter}
          />
        )}

        {/* Create FAB */}
        <Fab color="primary" aria-label="Create new work order" size="large" onClick={() => navigate('/create-wo')} sx={{ position: 'fixed', bottom: 24, right: 24, boxShadow: 3, minWidth: 56, minHeight: 56 }}>
          <AddIcon />
        </Fab>

        {/* Job Card Menu */}
        <Menu anchorEl={jobMenuAnchor} open={Boolean(jobMenuAnchor)} onClose={handleJobMenuClose} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }} disableRestoreFocus>
          <MenuItem onClick={() => { if (selectedJobId) navigate(`/jobs/${selectedJobId}/details`); handleJobMenuClose(); }}><EditIcon fontSize="small" sx={{ mr: 1 }} />View Details</MenuItem>
          <MenuItem onClick={() => { if (selectedJobId) navigate((userRole === 'foreman' || userRole === 'crew') ? `/jobs/${selectedJobId}/closeout` : `/jobs/${selectedJobId}/files`); handleJobMenuClose(); }}><FolderIcon fontSize="small" sx={{ mr: 1 }} />Open Files</MenuItem>
          {canManageJobs(userRole, isAdmin, isSuperAdmin) && <MenuItem onClick={handleOpenAssignDialog}><AssignIcon fontSize="small" sx={{ mr: 1 }} />Assign to Foreman</MenuItem>}
          {canManageJobs(userRole, isAdmin, isSuperAdmin) && selectedJobId && canMarkAsStuck(jobs.find((j) => j._id === selectedJobId)) && (
            <MenuItem onClick={() => { setStuckJobId(selectedJobId); setStuckReason(''); setStuckDialogOpen(true); handleJobMenuClose(); }} sx={{ color: 'error.main' }}><BlockIcon fontSize="small" sx={{ mr: 1 }} />Mark as Stuck</MenuItem>
          )}
          {canManageJobs(userRole, isAdmin, isSuperAdmin) && selectedJobId && ['scheduled', 'in_progress', 'assigned_to_gf'].includes(jobs.find((j) => j._id === selectedJobId)?.status) && (
            <MenuItem onClick={() => { setCancelJobId(selectedJobId); setCancelReason(''); setCancelType('rescheduled'); setCancelDialogOpen(true); handleJobMenuClose(); }} sx={{ color: 'warning.main' }}><EventBusyIcon fontSize="small" sx={{ mr: 1 }} />Cancel / Reschedule</MenuItem>
          )}
          {canManageJobs(userRole, isAdmin, isSuperAdmin) && selectedJobId && jobs.find((j) => j._id === selectedJobId)?.status === 'stuck' && (
            <MenuItem onClick={(e) => handleUnstickJob(selectedJobId, e)} sx={{ color: 'success.main' }}><CheckCircleIcon fontSize="small" sx={{ mr: 1 }} />Resume Job</MenuItem>
          )}
          {selectedJobId && (() => {
            const transitions = getAvailableTransitions(jobs.find((j) => j._id === selectedJobId));
            if (transitions.length === 0) return null;
            return (<><Divider /><MenuItem disabled sx={{ opacity: 0.7, fontSize: '0.75rem', py: 0.5 }}>— Update Status —</MenuItem>{transitions.map((t) => (<MenuItem key={t.status} onClick={() => handleUpdateStatus(t.status)} sx={{ color: 'primary.main' }}><CheckCircleIcon fontSize="small" sx={{ mr: 1 }} />{t.label}</MenuItem>))}</>);
          })()}
          <Divider />
          <MenuItem onClick={handleDeleteJob} sx={{ color: 'error.main' }}><DeleteIcon fontSize="small" sx={{ mr: 1 }} />Delete Work Order</MenuItem>
        </Menu>

        {/* Assignment Dialog */}
        <Dialog open={assignDialogOpen} onClose={handleCloseAssignDialog} maxWidth="sm" fullWidth>
          <DialogTitle><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><AssignIcon color="primary" />Assign Work Order to Foreman</Box></DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <FormControl fullWidth>
                <InputLabel id="assignTo-label">Assign To</InputLabel>
                <Select id="assignTo" name="assignTo" labelId="assignTo-label" value={assignmentData.assignedTo} label="Assign To" onChange={(e) => setAssignmentData({ ...assignmentData, assignedTo: e.target.value })}>
                  <MenuItem value=""><em>Unassigned</em></MenuItem>
                  {foremen.map((f) => <MenuItem key={f._id} value={f._id}>{f.name || f.email} ({f.role})</MenuItem>)}
                </Select>
              </FormControl>
              <TextField id="crewScheduledDate" name="crewScheduledDate" label="Crew Scheduled Date" type="date" value={assignmentData.crewScheduledDate} onChange={(e) => setAssignmentData({ ...assignmentData, crewScheduledDate: e.target.value })} InputLabelProps={{ shrink: true }} fullWidth />
              <TextField id="crewScheduledEndDate" name="crewScheduledEndDate" label="End Date (Optional)" type="date" value={assignmentData.crewScheduledEndDate} onChange={(e) => setAssignmentData({ ...assignmentData, crewScheduledEndDate: e.target.value })} InputLabelProps={{ shrink: true }} fullWidth />
              <TextField id="assignmentNotes" name="assignmentNotes" label="Assignment Notes" multiline rows={3} value={assignmentData.assignmentNotes} onChange={(e) => setAssignmentData({ ...assignmentData, assignmentNotes: e.target.value })} fullWidth />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseAssignDialog}>Cancel</Button>
            <Button onClick={handleAssignJob} variant="contained" startIcon={<AssignIcon />} disabled={!assignmentData.assignedTo || !assignmentData.crewScheduledDate}>Assign Job</Button>
          </DialogActions>
        </Dialog>

        {/* Stuck Dialog */}
        <Dialog open={stuckDialogOpen} onClose={() => setStuckDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle><Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}><BlockIcon />Mark Job as Stuck</Box></DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Use this when a job has a design discrepancy, missing materials, or other blocking issue.</Typography>
            <TextField id="stuckReason" name="stuckReason" label="Reason for Delay" multiline rows={3} value={stuckReason} onChange={(e) => setStuckReason(e.target.value)} fullWidth required sx={{ mt: 1 }} />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setStuckDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleMarkAsStuck} variant="contained" color="error" startIcon={<BlockIcon />} disabled={!stuckReason.trim()}>Mark as Stuck</Button>
          </DialogActions>
        </Dialog>

        {/* Cancel/Reschedule Dialog */}
        <Dialog open={cancelDialogOpen} onClose={() => setCancelDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><EventBusyIcon color="warning" />Cancel or Reschedule Job</Box></DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>This will move the job back to &quot;Needs Scheduling&quot; status.</Typography>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="cancel-type-label">Action Type</InputLabel>
              <Select labelId="cancel-type-label" id="cancelType" value={cancelType} label="Action Type" onChange={(e) => setCancelType(e.target.value)}>
                <MenuItem value="rescheduled"><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><ScheduleIcon fontSize="small" color="info" />Reschedule</Box></MenuItem>
                <MenuItem value="canceled"><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><BlockIcon fontSize="small" color="error" />Cancel</Box></MenuItem>
              </Select>
            </FormControl>
            <TextField id="cancelReason" name="cancelReason" label="Reason" multiline rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} fullWidth required />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCancelDialogOpen(false)}>Back</Button>
            <Button onClick={handleCancelJob} variant="contained" color={cancelType === 'canceled' ? 'error' : 'warning'} disabled={!cancelReason.trim()}>{cancelType === 'rescheduled' ? 'Reschedule Job' : 'Cancel Job'}</Button>
          </DialogActions>
        </Dialog>

        {/* Dependency Schedule Dialog */}
        <Dialog open={depScheduleDialogOpen} onClose={() => setDepScheduleDialogOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><CalendarIcon color="primary" />Schedule Dependency</Box></DialogTitle>
          <DialogContent>
            <TextField id="depScheduleDate" name="depScheduleDate" label="Scheduled Date" type="date" value={depScheduleData.date} onChange={(e) => setDepScheduleData({ ...depScheduleData, date: e.target.value })} InputLabelProps={{ shrink: true }} fullWidth required sx={{ mt: 1 }} />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDepScheduleDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveDepSchedule} variant="contained" startIcon={<CalendarIcon />} disabled={!depScheduleData.date}>Schedule</Button>
          </DialogActions>
        </Dialog>

        <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar({ ...snackbar, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
          <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} sx={{ width: '100%' }}>{snackbar.message}</Alert>
        </Snackbar>
      </Container>
    </Box>
  );
};

export default Dashboard;
