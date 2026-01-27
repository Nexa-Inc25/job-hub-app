// src/components/QADashboard.js
// QA Dashboard - Review jobs, manage go-backs, access spec library

import React, { useState, useEffect, useCallback } from 'react';
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
import {
  ArrowBack as ArrowBackIcon,
  FactCheck as FactCheckIcon,
  Warning as WarningIcon,
  Schedule as ScheduleIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Visibility as VisibilityIcon,
  MenuBook as MenuBookIcon,
  Replay as ReplayIcon,
  ThumbUp as ThumbUpIcon,
  ThumbDown as ThumbDownIcon,
} from '@mui/icons-material';
import { useThemeMode } from '../ThemeContext';

// Status colors
const STATUS_COLORS = {
  pending_qa_review: '#f59e0b',
  pending_gf_review: '#eab308',
  // Audit statuses
  pending_qa: '#f59e0b',
  accepted: '#ef4444',
  disputed: '#22c55e',
  correction_assigned: '#8b5cf6',
  correction_submitted: '#06b6d4',
  resolved: '#22c55e',
  closed: '#6366f1',
};

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

// Stat Card Component
const StatCard = ({ title, value, icon: Icon, color, cardBg, textPrimary, textSecondary, borderColor, onClick }) => (
  <Card 
    sx={{ 
      bgcolor: cardBg, 
      border: `1px solid ${borderColor}`, 
      borderRadius: 2,
      cursor: onClick ? 'pointer' : 'default',
      transition: 'transform 0.2s, box-shadow 0.2s',
      '&:hover': onClick ? { transform: 'translateY(-2px)', boxShadow: 4 } : {}
    }}
    onClick={onClick}
  >
    <CardContent>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="body2" sx={{ color: textSecondary, mb: 0.5 }}>{title}</Typography>
          <Typography variant="h4" sx={{ color: textPrimary, fontWeight: 700 }}>{value}</Typography>
        </Box>
        <Box sx={{ bgcolor: `${color}20`, borderRadius: 2, p: 1 }}>
          <Icon sx={{ color, fontSize: 24 }} />
        </Box>
      </Box>
    </CardContent>
  </Card>
);
StatCard.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.node.isRequired,
  icon: PropTypes.elementType.isRequired,
  color: PropTypes.string.isRequired,
  cardBg: PropTypes.string.isRequired,
  textPrimary: PropTypes.string.isRequired,
  textSecondary: PropTypes.string.isRequired,
  borderColor: PropTypes.string.isRequired,
  onClick: PropTypes.func,
};

// Review Dialog Component
const ReviewDialog = ({ open, onClose, job, onSubmit, mode }) => {
  const [action, setAction] = useState('approve');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const { mode: themeMode } = useThemeMode();

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
      <DialogTitle sx={{ bgcolor: themeMode === 'dark' ? '#1e1e2e' : '#fff' }}>
        Review Job: {job?.pmNumber || job?.woNumber || 'N/A'}
      </DialogTitle>
      <DialogContent sx={{ bgcolor: themeMode === 'dark' ? '#1e1e2e' : '#fff', pt: 2 }}>
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
          <Select value={action} onChange={(e) => setAction(e.target.value)} label="Decision">
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
        />
      </DialogContent>
      <DialogActions sx={{ bgcolor: themeMode === 'dark' ? '#1e1e2e' : '#fff', p: 2 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button 
          variant="contained" 
          onClick={handleSubmit} 
          disabled={loading}
          sx={{ 
            bgcolor: action === 'approve' ? '#22c55e' : action === 'reject' ? '#ef4444' : '#f59e0b',
            '&:hover': { bgcolor: action === 'approve' ? '#16a34a' : action === 'reject' ? '#dc2626' : '#d97706' }
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
  const { mode } = useThemeMode();

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
      <DialogTitle sx={{ bgcolor: mode === 'dark' ? '#1e1e2e' : '#fff' }}>
        Review Failed Audit: {job?.pmNumber || 'N/A'}
      </DialogTitle>
      <DialogContent sx={{ bgcolor: mode === 'dark' ? '#1e1e2e' : '#fff', pt: 2 }}>
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
          <Select value={decision} onChange={(e) => setDecision(e.target.value)} label="QA Decision">
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
          sx={{ mb: 2 }}
          placeholder="Document your review findings..."
        />
        
        {decision === 'disputed' && (
          <TextField
            fullWidth
            multiline
            rows={2}
            label="Dispute Reason"
            value={disputeReason}
            onChange={(e) => setDisputeReason(e.target.value)}
            sx={{ mb: 2 }}
            placeholder="Why are you disputing this audit finding?"
            required
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
          />
        )}
      </DialogContent>
      <DialogActions sx={{ bgcolor: mode === 'dark' ? '#1e1e2e' : '#fff', p: 2 }}>
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

const QADashboard = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [stats, setStats] = useState(null);
  const [pendingJobs, setPendingJobs] = useState([]);
  const [failedAuditJobs, setFailedAuditJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewDialog, setReviewDialog] = useState({ open: false, job: null });
  const [auditDialog, setAuditDialog] = useState({ open: false, job: null, audit: null });
  
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
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: mode === 'dark' ? '#0f0f1a' : '#f8fafc' }}>
        <CircularProgress size={48} sx={{ color: '#6366f1' }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: mode === 'dark' ? '#0f0f1a' : '#f8fafc', p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: mode === 'dark' ? '#0f0f1a' : '#f1f5f9' }}>
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: mode === 'dark' ? '#1e1e2e' : '#ffffff', borderBottom: `1px solid ${borderColor}` }}>
        <Toolbar>
          <IconButton onClick={() => navigate('/dashboard')} sx={{ mr: 2, color: textPrimary }}>
            <ArrowBackIcon />
          </IconButton>
          <FactCheckIcon sx={{ mr: 1.5, color: '#6366f1' }} />
          <Typography variant="h6" sx={{ flexGrow: 1, color: textPrimary, fontWeight: 700 }}>
            QA Dashboard
          </Typography>
          <Button
            variant="outlined"
            startIcon={<MenuBookIcon />}
            onClick={() => navigate('/qa/spec-library')}
            sx={{ mr: 2, borderColor: '#6366f1', color: '#6366f1' }}
          >
            Spec Library
          </Button>
          <Badge badgeContent={stats?.pendingReview || 0} color="warning">
            <Chip 
              label="Pending Review"
              sx={{ bgcolor: '#f59e0b20', color: '#f59e0b', fontWeight: 600 }}
            />
          </Badge>
        </Toolbar>
      </AppBar>

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
                                label={audit.status.replace(/_/g, ' ').toUpperCase()}
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
    </Box>
  );
};

export default QADashboard;

