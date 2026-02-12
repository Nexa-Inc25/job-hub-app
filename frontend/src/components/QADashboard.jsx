/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
// src/components/QADashboard.js
// QA Dashboard - Review jobs, manage go-backs, access spec library

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
  Chip,
  CircularProgress,
  Alert,
  Grid,
  Button,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip,
  Badge,
} from '@mui/material';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import WarningIcon from '@mui/icons-material/Warning';
import ScheduleIcon from '@mui/icons-material/Schedule';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import VisibilityIcon from '@mui/icons-material/Visibility';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ReplayIcon from '@mui/icons-material/Replay';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { useThemeMode } from '../ThemeContext';
import { StatCard, getThemeColors, STATUS_COLORS, LoadingState, ErrorState } from './shared';

const INFRACTION_TYPE_LABELS = {
  workmanship: 'Workmanship Issue',
  materials: 'Wrong Materials',
  safety: 'Safety Violation',
  incomplete: 'Work Incomplete',
  as_built: 'As-Built Error',
  photos: 'Photo Issue',
  clearances: 'Clearance Violation',
  grounding: 'Grounding Issue',
  other: 'Other',
};

// Review Dialog Component
const ReviewDialog = ({ open, onClose, job, onSubmit, mode: _mode }) => {
  const [action, setAction] = useState('approve');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const { darkMode: themeDarkMode } = useThemeMode();
  const { dialogBg } = getThemeColors(themeDarkMode ? 'dark' : 'light');

  // Button color helpers to avoid nested ternaries
  const getButtonBgColor = (actionType) => {
    if (actionType === 'approve') return '#22c55e';
    if (actionType === 'reject') return '#ef4444';
    return '#f59e0b';
  };
  const getButtonHoverColor = (actionType) => {
    if (actionType === 'approve') return '#16a34a';
    if (actionType === 'reject') return '#dc2626';
    return '#d97706';
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await onSubmit(job._id, action, notes);
      onClose();
    } catch {
      // Error handled by parent
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ bgcolor: dialogBg }}>
        Review Job: {job?.pmNumber || job?.woNumber || 'N/A'}
      </DialogTitle>
      <DialogContent sx={{ bgcolor: dialogBg, pt: 2 }}>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Address: {job?.address}, {job?.city}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Client: {job?.client}
          </Typography>
        </Box>
        
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Decision</InputLabel>
          <Select id="review-action" name="reviewAction" value={action} onChange={(e) => setAction(e.target.value)} label="Decision">
            <MenuItem value="approve">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ThumbUpIcon sx={{ color: '#22c55e', fontSize: 18 }} /> Approve
              </Box>
            </MenuItem>
            <MenuItem value="reject">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ThumbDownIcon sx={{ color: '#ef4444', fontSize: 18 }} /> Reject
              </Box>
            </MenuItem>
            <MenuItem value="request_revision">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ReplayIcon sx={{ color: '#f59e0b', fontSize: 18 }} /> Request Revision
              </Box>
            </MenuItem>
          </Select>
        </FormControl>
        
        <TextField
          fullWidth
          multiline
          rows={3}
          label="Review Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={action === 'reject' ? 'Explain the issue...' : 'Optional notes...'}
          sx={{
            '& .MuiInputBase-input': {
              color: themeMode === 'dark' ? '#e2e8f0' : '#1e293b',
            },
            '& .MuiOutlinedInput-root': {
              bgcolor: themeMode === 'dark' ? '#252538' : '#f8fafc',
            }
          }}
        />
      </DialogContent>
      <DialogActions sx={{ bgcolor: dialogBg, p: 2 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button 
          variant="contained" 
          onClick={handleSubmit} 
          disabled={loading}
          sx={{ 
            bgcolor: getButtonBgColor(action),
            '&:hover': { bgcolor: getButtonHoverColor(action) }
          }}
        >
          {loading ? <CircularProgress size={20} color="inherit" /> : 'Submit Review'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
ReviewDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  job: PropTypes.object,
  onSubmit: PropTypes.func.isRequired,
  mode: PropTypes.string,
};

// Failed Audit Review Dialog
const AuditReviewDialog = ({ open, onClose, job, audit, onSubmit }) => {
  const [decision, setDecision] = useState('accepted');
  const [qaNotes, setQaNotes] = useState('');
  const [disputeReason, setDisputeReason] = useState('');
  const [correctionNotes, setCorrectionNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const { darkMode } = useThemeMode();
  const mode = darkMode ? 'dark' : 'light';
  const { dialogBg } = getThemeColors(mode);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await onSubmit(job._id, audit._id, {
        decision,
        qaNotes,
        disputeReason: decision === 'disputed' ? disputeReason : '',
        correctionNotes: decision === 'accepted' ? correctionNotes : '',
      });
      onClose();
    } catch {
      // Error handled by parent
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ bgcolor: dialogBg }}>
        Review Failed Audit: {job?.pmNumber || 'N/A'}
      </DialogTitle>
      <DialogContent sx={{ bgcolor: dialogBg, pt: 2 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          <Typography variant="subtitle2">
            {INFRACTION_TYPE_LABELS[audit?.infractionType] || audit?.infractionType}
          </Typography>
          <Typography variant="body2">{audit?.infractionDescription}</Typography>
          {audit?.inspectorName && (
            <Typography variant="caption" color="text.secondary" display="block">
              Inspector: {audit.inspectorName}
            </Typography>
          )}
          {audit?.auditNumber && (
            <Typography variant="caption" color="text.secondary">
              Audit #: {audit.auditNumber}
            </Typography>
          )}
          {audit?.specReference && (
            <Typography variant="caption" color="text.secondary" display="block">
              Spec: {audit.specReference}
            </Typography>
          )}
        </Alert>
        
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>QA Decision</InputLabel>
          <Select id="qa-decision" name="qaDecision" value={decision} onChange={(e) => setDecision(e.target.value)} label="QA Decision">
            <MenuItem value="accepted">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircleIcon sx={{ color: '#ef4444', fontSize: 18 }} /> 
                Accept (Infraction is valid - assign for correction)
              </Box>
            </MenuItem>
            <MenuItem value="disputed">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CancelIcon sx={{ color: '#22c55e', fontSize: 18 }} /> 
                Dispute (Challenge with utility)
              </Box>
            </MenuItem>
          </Select>
        </FormControl>
        
        <TextField
          fullWidth
          multiline
          rows={3}
          label="QA Notes"
          value={qaNotes}
          onChange={(e) => setQaNotes(e.target.value)}
          placeholder="Document your review findings..."
          sx={{ 
            mb: 2,
            '& .MuiInputBase-input': { color: mode === 'dark' ? '#e2e8f0' : '#1e293b' },
            '& .MuiOutlinedInput-root': { bgcolor: mode === 'dark' ? '#252538' : '#f8fafc' }
          }}
        />
        
        {decision === 'disputed' && (
          <TextField
            fullWidth
            multiline
            rows={2}
            label="Dispute Reason"
            value={disputeReason}
            onChange={(e) => setDisputeReason(e.target.value)}
            placeholder="Why are you disputing this audit finding?"
            required
            sx={{ 
              mb: 2,
              '& .MuiInputBase-input': { color: mode === 'dark' ? '#e2e8f0' : '#1e293b' },
              '& .MuiOutlinedInput-root': { bgcolor: mode === 'dark' ? '#252538' : '#f8fafc' }
            }}
          />
        )}
        
        {decision === 'accepted' && (
          <TextField
            fullWidth
            multiline
            rows={2}
            label="Correction Instructions for GF"
            value={correctionNotes}
            onChange={(e) => setCorrectionNotes(e.target.value)}
            placeholder="Instructions for the crew to fix the infraction..."
            sx={{ 
              '& .MuiInputBase-input': { color: mode === 'dark' ? '#e2e8f0' : '#1e293b' },
              '& .MuiOutlinedInput-root': { bgcolor: mode === 'dark' ? '#252538' : '#f8fafc' }
            }}
          />
        )}
      </DialogContent>
      <DialogActions sx={{ bgcolor: dialogBg, p: 2 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button 
          variant="contained" 
          onClick={handleSubmit} 
          disabled={loading || (decision === 'disputed' && !disputeReason)}
          sx={{ 
            bgcolor: decision === 'disputed' ? '#22c55e' : '#ef4444',
            '&:hover': { bgcolor: decision === 'disputed' ? '#16a34a' : '#dc2626' }
          }}
        >
          {loading ? <CircularProgress size={20} color="inherit" /> : 'Submit Decision'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
AuditReviewDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  job: PropTypes.object,
  audit: PropTypes.object,
  onSubmit: PropTypes.func.isRequired,
};

// Upload Failed Audit Dialog - Extract from PG&E audit PDF
const UploadAuditDialog = ({ open, onClose, onSuccess }) => {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const { darkMode } = useThemeMode();
  const mode = darkMode ? 'dark' : 'light';
  const { dialogBg, pageBg } = getThemeColors(mode);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please upload a PDF file');
      return;
    }

    setUploading(true);
    setError('');
    setResult(null);

    const formData = new FormData();
    formData.append('pdf', file);

    try {
      const response = await api.post('/api/qa/extract-audit', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (response.data.success) {
        setResult(response.data);
      } else {
        setError(response.data.error || 'Failed to extract audit');
        if (response.data.extracted) {
          setResult({ extracted: response.data.extracted, requiresManualEntry: true });
        }
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.response?.data?.error || 'Failed to upload and extract audit');
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    setResult(null);
    setError('');
    onClose();
    if (result?.success) {
      onSuccess();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ bgcolor: dialogBg, display: 'flex', alignItems: 'center', gap: 1 }}>
        <CloudUploadIcon sx={{ color: '#6366f1' }} />
        Upload Failed Audit from PG&E
      </DialogTitle>
      <DialogContent sx={{ bgcolor: dialogBg, pt: 2 }}>
        {!result && !uploading && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Upload the failed audit PDF received from PG&E. The system will:
            </Typography>
            <Box component="ul" sx={{ pl: 2, mb: 3, color: 'text.secondary' }}>
              <li>Extract PM number and find the original work order</li>
              <li>Extract inspector name, infraction details, and spec references</li>
              <li>Create the failed audit record on the job</li>
              <li>Upload the PDF to the &quot;QA Go Back&quot; folder</li>
            </Box>

            <input
              id="qa-dashboard-file-input"
              name="qa-dashboard-file-input"
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept=".pdf"
              onChange={handleFileSelect}
              aria-label="Upload QA go-back PDF"
            />
            <Button
              fullWidth
              variant="outlined"
              size="large"
              startIcon={<CloudUploadIcon />}
              onClick={() => fileInputRef.current?.click()}
              sx={{ 
                py: 3, 
                borderStyle: 'dashed',
                borderColor: '#6366f1',
                color: '#6366f1',
                '&:hover': { borderColor: '#4f46e5', bgcolor: '#6366f110' }
              }}
            >
              Select PG&E Audit PDF
            </Button>
          </>
        )}

        {uploading && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CircularProgress size={48} sx={{ color: '#6366f1', mb: 2 }} />
            <Typography variant="body1">Extracting audit information...</Typography>
            <Typography variant="caption" color="text.secondary">
              Finding job by PM number and creating audit record
            </Typography>
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {result?.success && (
          <Box>
            <Alert severity="success" sx={{ mb: 2 }}>
              Audit extracted and recorded successfully!
            </Alert>
            
            <Paper sx={{ p: 2, bgcolor: pageBg, mb: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                Job Found: {result.job?.pmNumber}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {result.job?.address}, {result.job?.city}
              </Typography>
            </Paper>

            <Paper sx={{ p: 2, bgcolor: pageBg }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, color: '#ef4444' }}>
                Failed Audit Details
              </Typography>
              <Grid container spacing={1}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Audit #</Typography>
                  <Typography variant="body2">{result.extracted?.auditNumber || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Inspector</Typography>
                  <Typography variant="body2">{result.extracted?.inspectorName || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Infraction Type</Typography>
                  <Typography variant="body2">
                    {INFRACTION_TYPE_LABELS[result.extracted?.infractionType] || result.extracted?.infractionType || 'N/A'}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">Spec Reference</Typography>
                  <Typography variant="body2">{result.extracted?.specReference || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary">Description</Typography>
                  <Typography variant="body2">{result.extracted?.infractionDescription || 'N/A'}</Typography>
                </Grid>
              </Grid>
            </Paper>
          </Box>
        )}

        {result?.requiresManualEntry && (
          <Box>
            <Alert severity="warning" sx={{ mb: 2 }}>
              Could not automatically match to a job. Please review the extracted data.
            </Alert>
            
            <Paper sx={{ p: 2, bgcolor: pageBg }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                Extracted Data (needs manual entry)
              </Typography>
              <Typography variant="body2">
                PM Number: {result.extracted?.pmNumber || 'Not found'}
              </Typography>
              <Typography variant="body2">
                Inspector: {result.extracted?.inspectorName || 'Not found'}
              </Typography>
              <Typography variant="body2">
                Description: {result.extracted?.infractionDescription || 'Not found'}
              </Typography>
            </Paper>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ bgcolor: dialogBg, p: 2 }}>
        <Button onClick={handleClose}>
          {result?.success ? 'Done' : 'Cancel'}
        </Button>
        {result?.success && (
          <Button
            variant="contained"
            onClick={() => {
              handleClose();
              // Navigate to the job
              globalThis.location.href = `/jobs/${result.job?._id}`;
            }}
            sx={{ bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}
          >
            View Job
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};
UploadAuditDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func.isRequired,
};

const QADashboard = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [stats, setStats] = useState(null);
  const [pendingJobs, setPendingJobs] = useState([]);
  const [failedAuditJobs, setFailedAuditJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewDialog, setReviewDialog] = useState({ open: false, job: null });
  const [auditDialog, setAuditDialog] = useState({ open: false, job: null, audit: null });
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  
  const navigate = useNavigate();
  const { darkMode } = useThemeMode();
  const mode = darkMode ? 'dark' : 'light';

  const { cardBg, textPrimary, textSecondary, borderColor, pageBg } = getThemeColors(mode);
  const themeProps = { cardBg, textPrimary, textSecondary, borderColor };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [statsRes, pendingRes, auditsRes] = await Promise.all([
        api.get('/api/qa/stats'),
        api.get('/api/qa/pending-review'),
        api.get('/api/qa/failed-audits'),
      ]);
      setStats(statsRes.data);
      setPendingJobs(pendingRes.data);
      setFailedAuditJobs(auditsRes.data);
    } catch (err) {
      console.error('Error fetching QA data:', err);
      if (err.response?.status === 403) {
        setError('QA role required. Failed audits go directly to QA from the utility.');
      } else {
        setError('Failed to load QA dashboard');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleReview = async (jobId, action, notes) => {
    try {
      await api.post(`/api/jobs/${jobId}/review`, { action, notes });
      fetchData(); // Refresh
    } catch (err) {
      console.error('Review error:', err);
      throw err;
    }
  };

  const handleAuditReview = async (jobId, auditId, data) => {
    try {
      await api.put(`/api/jobs/${jobId}/audit/${auditId}/review`, data);
      fetchData(); // Refresh
    } catch (err) {
      console.error('Audit review error:', err);
      throw err;
    }
  };

  if (loading) {
    return <LoadingState bgcolor={pageBg} />;
  }

  if (error) {
    return <ErrorState message={error} bgcolor={pageBg} />;
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: pageBg }}>
      {/* Page Header with Actions */}
      <Box sx={{ 
        bgcolor: cardBg, 
        borderBottom: `1px solid ${borderColor}`,
        px: 3,
        py: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 2
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <FactCheckIcon sx={{ color: '#6366f1', fontSize: 28 }} />
          <Typography variant="h5" sx={{ color: textPrimary, fontWeight: 700 }}>
            QA Dashboard
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button
            variant="contained"
            startIcon={<CloudUploadIcon />}
            onClick={() => setUploadDialogOpen(true)}
            sx={{ bgcolor: '#ef4444', '&:hover': { bgcolor: '#dc2626' } }}
          >
            Upload Failed Audit
          </Button>
          <Button
            variant="outlined"
            startIcon={<MenuBookIcon />}
            onClick={() => navigate('/qa/spec-library')}
            sx={{ borderColor: '#6366f1', color: '#6366f1' }}
          >
            Spec Library
          </Button>
          <Badge badgeContent={stats?.pendingReview || 0} color="warning">
            <Chip 
              label="Pending Review"
              sx={{ bgcolor: '#f59e0b20', color: '#f59e0b', fontWeight: 600 }}
            />
          </Badge>
        </Box>
      </Box>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Stats Cards */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={6} sm={3}>
            <StatCard 
              title="Pending Review" 
              value={stats?.pendingReview || 0} 
              icon={ScheduleIcon} 
              color="#f59e0b" 
              onClick={() => setActiveTab(0)}
              {...themeProps} 
            />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatCard 
              title="Failed Audits" 
              value={stats?.failedAudits || 0} 
              icon={WarningIcon} 
              color="#ef4444" 
              onClick={() => setActiveTab(1)}
              {...themeProps} 
            />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatCard 
              title="Reviewed This Month" 
              value={stats?.resolvedThisMonth || 0} 
              icon={CheckCircleIcon} 
              color="#22c55e" 
              {...themeProps} 
            />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatCard 
              title="Avg Review Time" 
              value={stats?.avgReviewTimeHours ? `${stats.avgReviewTimeHours}h` : 'N/A'} 
              icon={FactCheckIcon} 
              color="#6366f1" 
              {...themeProps} 
            />
          </Grid>
        </Grid>

        {/* Tabs */}
        <Paper sx={{ bgcolor: cardBg, border: `1px solid ${borderColor}`, borderRadius: 3 }}>
          <Tabs 
            value={activeTab} 
            onChange={(_, v) => setActiveTab(v)}
            sx={{ borderBottom: `1px solid ${borderColor}`, px: 2 }}
          >
            <Tab 
              label={
                <Badge badgeContent={pendingJobs.length} color="warning" sx={{ pr: 2 }}>
                  Pending Review
                </Badge>
              } 
            />
            <Tab 
              label={
                <Badge badgeContent={failedAuditJobs.length} color="error" sx={{ pr: 2 }}>
                  Failed Audits
                </Badge>
              } 
            />
          </Tabs>

          {/* Pending Review Tab */}
          {activeTab === 0 && (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: textSecondary, fontWeight: 600 }}>PM #</TableCell>
                    <TableCell sx={{ color: textSecondary, fontWeight: 600 }}>Address</TableCell>
                    <TableCell sx={{ color: textSecondary, fontWeight: 600 }}>Client</TableCell>
                    <TableCell sx={{ color: textSecondary, fontWeight: 600 }}>Submitted</TableCell>
                    <TableCell sx={{ color: textSecondary, fontWeight: 600 }}>GF</TableCell>
                    <TableCell sx={{ color: textSecondary, fontWeight: 600 }} align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pendingJobs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 4, color: textSecondary }}>
                        <CheckCircleIcon sx={{ fontSize: 48, color: '#22c55e', mb: 1 }} />
                        <Typography>No jobs pending QA review</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    pendingJobs.map((job) => (
                      <TableRow key={job._id} hover>
                        <TableCell sx={{ color: textPrimary, fontWeight: 600 }}>
                          {job.pmNumber || job.woNumber || 'N/A'}
                        </TableCell>
                        <TableCell sx={{ color: textPrimary }}>
                          {job.address}, {job.city}
                        </TableCell>
                        <TableCell sx={{ color: textSecondary }}>{job.client}</TableCell>
                        <TableCell sx={{ color: textSecondary }}>
                          {job.gfReviewDate ? new Date(job.gfReviewDate).toLocaleDateString() : 'N/A'}
                        </TableCell>
                        <TableCell sx={{ color: textSecondary }}>
                          {job.assignedToGF?.name || job.assignedToGF?.email || 'Unassigned'}
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="View Job">
                            <IconButton size="small" onClick={() => navigate(`/jobs/${job._id}`)}>
                              <VisibilityIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Button
                            size="small"
                            variant="contained"
                            sx={{ ml: 1, bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}
                            onClick={() => setReviewDialog({ open: true, job })}
                          >
                            Review
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* Failed Audits Tab */}
          {activeTab === 1 && (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: textSecondary, fontWeight: 600 }}>PM #</TableCell>
                    <TableCell sx={{ color: textSecondary, fontWeight: 600 }}>Infraction</TableCell>
                    <TableCell sx={{ color: textSecondary, fontWeight: 600 }}>Description</TableCell>
                    <TableCell sx={{ color: textSecondary, fontWeight: 600 }}>Status</TableCell>
                    <TableCell sx={{ color: textSecondary, fontWeight: 600 }}>Audit Date</TableCell>
                    <TableCell sx={{ color: textSecondary, fontWeight: 600 }} align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {failedAuditJobs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 4, color: textSecondary }}>
                        <CheckCircleIcon sx={{ fontSize: 48, color: '#22c55e', mb: 1 }} />
                        <Typography>No failed audits</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    failedAuditJobs.flatMap((job) => 
                      (job.auditHistory || [])
                        .filter(audit => audit.result === 'fail' && !['resolved', 'closed'].includes(audit.status))
                        .map((audit) => (
                          <TableRow key={`${job._id}-${audit._id}`} hover>
                            <TableCell sx={{ color: textPrimary, fontWeight: 600 }}>
                              {job.pmNumber || job.woNumber || 'N/A'}
                            </TableCell>
                            <TableCell>
                              <Chip 
                                label={INFRACTION_TYPE_LABELS[audit.infractionType] || audit.infractionType}
                                size="small"
                                sx={{ 
                                  bgcolor: audit.infractionType === 'safety' ? '#ef444420' : '#f59e0b20',
                                  color: audit.infractionType === 'safety' ? '#ef4444' : '#f59e0b',
                                  fontWeight: 600
                                }}
                              />
                            </TableCell>
                            <TableCell sx={{ color: textPrimary, maxWidth: 250 }}>
                              <Typography variant="body2" noWrap title={audit.infractionDescription}>
                                {audit.infractionDescription}
                              </Typography>
                              {audit.inspectorName && (
                                <Typography variant="caption" sx={{ color: textSecondary }}>
                                  Inspector: {audit.inspectorName}
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell>
                              <Chip 
                                label={audit.status.replaceAll('_', ' ').toUpperCase()}
                                size="small"
                                sx={{ 
                                  bgcolor: `${STATUS_COLORS[audit.status] || '#64748b'}20`,
                                  color: STATUS_COLORS[audit.status] || '#64748b',
                                  fontWeight: 600
                                }}
                              />
                            </TableCell>
                            <TableCell sx={{ color: textSecondary }}>
                              {audit.auditDate ? new Date(audit.auditDate).toLocaleDateString() : 'N/A'}
                            </TableCell>
                            <TableCell align="right">
                              <Tooltip title="View Job">
                                <IconButton size="small" onClick={() => navigate(`/jobs/${job._id}`)}>
                                  <VisibilityIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              {audit.status === 'pending_qa' && (
                                <Button
                                  size="small"
                                  variant="contained"
                                  sx={{ ml: 1, bgcolor: '#ef4444', '&:hover': { bgcolor: '#dc2626' } }}
                                  onClick={() => setAuditDialog({ open: true, job, audit })}
                                >
                                  Review
                                </Button>
                              )}
                              {audit.status === 'correction_submitted' && (
                                <Button
                                  size="small"
                                  variant="contained"
                                  sx={{ ml: 1, bgcolor: '#22c55e', '&:hover': { bgcolor: '#16a34a' } }}
                                  onClick={() => setAuditDialog({ open: true, job, audit })}
                                >
                                  Approve Fix
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                    )
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      </Container>

      {/* Review Dialog */}
      <ReviewDialog
        open={reviewDialog.open}
        job={reviewDialog.job}
        onClose={() => setReviewDialog({ open: false, job: null })}
        onSubmit={handleReview}
      />

      {/* Failed Audit Review Dialog */}
      <AuditReviewDialog
        open={auditDialog.open}
        job={auditDialog.job}
        audit={auditDialog.audit}
        onClose={() => setAuditDialog({ open: false, job: null, audit: null })}
        onSubmit={handleAuditReview}
      />

      {/* Upload Failed Audit Dialog */}
      <UploadAuditDialog
        open={uploadDialogOpen}
        onClose={() => setUploadDialogOpen(false)}
        onSuccess={fetchData}
      />
    </Box>
  );
};

export default QADashboard;

