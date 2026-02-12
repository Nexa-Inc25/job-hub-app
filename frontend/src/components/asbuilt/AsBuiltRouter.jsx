/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  Box, Paper, Typography, Grid, Chip, Button, IconButton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  LinearProgress, Alert, Tabs, Tab, Card, CardContent,
  Dialog, DialogTitle, DialogContent, DialogActions,
  List, ListItem, ListItemIcon, ListItemText, Divider,
  Tooltip, CircularProgress
} from '@mui/material';

// Direct imports for tree-shaking
import RefreshIcon from '@mui/icons-material/Refresh';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import PendingIcon from '@mui/icons-material/Pending';
import SendIcon from '@mui/icons-material/Send';
import DescriptionIcon from '@mui/icons-material/Description';
import MapIcon from '@mui/icons-material/Map';
import EmailIcon from '@mui/icons-material/Email';
import StorageIcon from '@mui/icons-material/Storage';
import GavelIcon from '@mui/icons-material/Gavel';
import FolderIcon from '@mui/icons-material/Folder';
import ReplayIcon from '@mui/icons-material/Replay';
import TimelineIcon from '@mui/icons-material/Timeline';
import ArticleIcon from '@mui/icons-material/Article';

import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

// Destination icons and labels
const destinationConfig = {
  oracle_ppm: { icon: <StorageIcon />, label: 'Oracle PPM', color: '#e53935' },
  oracle_eam: { icon: <StorageIcon />, label: 'Oracle EAM', color: '#d81b60' },
  oracle_payables: { icon: <StorageIcon />, label: 'Oracle Payables', color: '#8e24aa' },
  gis_esri: { icon: <MapIcon />, label: 'ESRI GIS', color: '#5e35b1' },
  sharepoint_do: { icon: <FolderIcon />, label: 'DO SharePoint', color: '#3949ab' },
  sharepoint_permits: { icon: <FolderIcon />, label: 'Permits SP', color: '#1e88e5' },
  sharepoint_utcs: { icon: <FolderIcon />, label: 'UTCS SP', color: '#039be5' },
  email_mapping: { icon: <EmailIcon />, label: 'Email: Mapping', color: '#00acc1' },
  email_do: { icon: <EmailIcon />, label: 'Email: DO', color: '#00897b' },
  email_compliance: { icon: <EmailIcon />, label: 'Email: Compliance', color: '#43a047' },
  email_estimating: { icon: <EmailIcon />, label: 'Email: Estimating', color: '#ff7043' },
  regulatory_portal: { icon: <GavelIcon />, label: 'CPUC Portal', color: '#7cb342' },
  archive: { icon: <ArticleIcon />, label: 'Archive', color: '#757575' },
  pending: { icon: <PendingIcon />, label: 'Pending', color: '#ff9800' },
  manual_review: { icon: <ErrorIcon />, label: 'Manual Review', color: '#f44336' }
};

// Section type labels
const sectionLabels = {
  face_sheet: 'Face Sheet',
  crew_instructions: 'Crew Instructions',
  crew_materials: 'Crew Materials',
  equipment_info: 'Equipment Info',
  feedback_form: 'Feedback Form',
  construction_sketch: 'Construction Sketch',
  circuit_map: 'Circuit Map',
  permits: 'Permits',
  tcp: 'Traffic Control Plan',
  job_checklist: 'Job Checklist',
  billing_form: 'Billing Form',
  paving_form: 'Paving Form',
  ccsc: 'CCSC',
  photos: 'Photos',
  other: 'Other'
};

// Status badge component
const StatusBadge = ({ status }) => {
  const statusConfig = {
    uploaded: { color: 'info', label: 'Uploaded' },
    processing: { color: 'warning', label: 'Processing' },
    classified: { color: 'info', label: 'Classified' },
    routing: { color: 'warning', label: 'Routing' },
    partially_delivered: { color: 'warning', label: 'Partial' },
    delivered: { color: 'success', label: 'Delivered' },
    failed: { color: 'error', label: 'Failed' },
    manual_review: { color: 'error', label: 'Review Needed' }
  };
  
  const config = statusConfig[status] || { color: 'default', label: status };
  return <Chip size="small" color={config.color} label={config.label} />;
};

StatusBadge.propTypes = {
  status: PropTypes.string.isRequired,
};

// Delivery status icon
const DeliveryStatusIcon = ({ status }) => {
  switch (status) {
    case 'delivered':
    case 'acknowledged':
      return <CheckCircleIcon sx={{ color: '#4caf50' }} />;
    case 'failed':
      return <ErrorIcon sx={{ color: '#f44336' }} />;
    case 'sending':
      return <CircularProgress size={20} />;
    case 'skipped':
      return <PendingIcon sx={{ color: '#9e9e9e' }} />;
    default:
      return <PendingIcon sx={{ color: '#ff9800' }} />;
  }
};

DeliveryStatusIcon.propTypes = {
  status: PropTypes.string,
};

const AsBuiltRouter = () => {
  const [submissions, setSubmissions] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };
  
  // Fetch submissions
  const fetchSubmissions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/api/asbuilt`, { headers });
      setSubmissions(res.data.submissions || []);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch submissions');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- headers from localStorage, stable
  }, []);
  
  // Fetch analytics
  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/asbuilt/analytics/summary`, { headers });
      setAnalytics(res.data);
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- headers from localStorage, stable
  }, []);
  
  // Fetch submission details
  const fetchSubmissionDetails = async (id) => {
    try {
      const res = await axios.get(`${API_URL}/api/asbuilt/${id}/status`, { headers });
      setSelectedSubmission(res.data);
      setDetailOpen(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch details');
    }
  };
  
  // Retry failed sections
  const handleRetry = async (id) => {
    try {
      await axios.post(`${API_URL}/api/asbuilt/${id}/retry`, {}, { headers });
      fetchSubmissions();
      if (selectedSubmission?.submissionId === id) {
        fetchSubmissionDetails(id);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to retry');
    }
  };
  
  useEffect(() => {
    fetchSubmissions();
    fetchAnalytics();
  }, [fetchSubmissions, fetchAnalytics]);
  
  return (
    <Box sx={{ p: 3, bgcolor: '#0a0a0f', minHeight: '100vh', color: '#ffffff' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#ffffff' }}>
            As-Built Document Router
          </Typography>
          <Typography variant="body2" sx={{ color: '#888888', mt: 0.5 }}>
            Intelligent routing to GIS, Oracle, SharePoint, and more
          </Typography>
        </Box>
        <Box>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => { fetchSubmissions(); fetchAnalytics(); }}
            sx={{ mr: 1, borderColor: '#333344', color: '#ffffff' }}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<CloudUploadIcon />}
            sx={{ bgcolor: '#00e676', color: '#0a0a0f', '&:hover': { bgcolor: '#00c853' } }}
          >
            Upload Package
          </Button>
        </Box>
      </Box>
      
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      
      {/* Analytics Cards */}
      {analytics?.summary && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} md={2}>
            <Card sx={{ bgcolor: '#16161f', borderRadius: 2 }}>
              <CardContent>
                <Typography variant="h4" sx={{ color: '#00e676', fontWeight: 700 }}>
                  {analytics.summary.totalSubmissions}
                </Typography>
                <Typography variant="body2" sx={{ color: '#888888' }}>
                  Total Submissions
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} md={2}>
            <Card sx={{ bgcolor: '#16161f', borderRadius: 2 }}>
              <CardContent>
                <Typography variant="h4" sx={{ color: '#4caf50', fontWeight: 700 }}>
                  {analytics.summary.deliveredCount}
                </Typography>
                <Typography variant="body2" sx={{ color: '#888888' }}>
                  Fully Delivered
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} md={2}>
            <Card sx={{ bgcolor: '#16161f', borderRadius: 2 }}>
              <CardContent>
                <Typography variant="h4" sx={{ color: '#ff9800', fontWeight: 700 }}>
                  {analytics.summary.partialCount}
                </Typography>
                <Typography variant="body2" sx={{ color: '#888888' }}>
                  Partial
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} md={2}>
            <Card sx={{ bgcolor: '#16161f', borderRadius: 2 }}>
              <CardContent>
                <Typography variant="h4" sx={{ color: '#f44336', fontWeight: 700 }}>
                  {analytics.summary.failedCount}
                </Typography>
                <Typography variant="body2" sx={{ color: '#888888' }}>
                  Failed
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} md={2}>
            <Card sx={{ bgcolor: '#16161f', borderRadius: 2 }}>
              <CardContent>
                <Typography variant="h4" sx={{ color: '#2196f3', fontWeight: 700 }}>
                  {analytics.summary.deliveredSections}
                </Typography>
                <Typography variant="body2" sx={{ color: '#888888' }}>
                  Sections Routed
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} md={2}>
            <Card sx={{ bgcolor: '#16161f', borderRadius: 2 }}>
              <CardContent>
                <Typography variant="h4" sx={{ color: '#9c27b0', fontWeight: 700 }}>
                  {analytics.summary.avgProcessingTime ? 
                    `${(analytics.summary.avgProcessingTime / 1000).toFixed(1)}s` : 
                    '0s'}
                </Typography>
                <Typography variant="body2" sx={{ color: '#888888' }}>
                  Avg Processing
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
      
      {/* Tabs */}
      <Tabs
        value={tab}
        onChange={(e, v) => setTab(v)}
        sx={{ 
          mb: 2,
          '& .MuiTab-root': { color: '#888888' },
          '& .Mui-selected': { color: '#00e676' },
          '& .MuiTabs-indicator': { bgcolor: '#00e676' }
        }}
      >
        <Tab label="Recent Submissions" icon={<DescriptionIcon />} iconPosition="start" />
        <Tab label="By Destination" icon={<SendIcon />} iconPosition="start" />
        <Tab label="Activity Log" icon={<TimelineIcon />} iconPosition="start" />
      </Tabs>
      
      {/* Submissions Table */}
      {tab === 0 && (
        <TableContainer component={Paper} sx={{ bgcolor: '#16161f' }}>
          {loading && <LinearProgress sx={{ bgcolor: '#333344', '& .MuiLinearProgress-bar': { bgcolor: '#00e676' } }} />}
          <Table>
            <TableHead>
              <TableRow sx={{ '& th': { color: '#888888', borderColor: '#333344' } }}>
                <TableCell>Submission ID</TableCell>
                <TableCell>PM Number</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Sections</TableCell>
                <TableCell>Submitted</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {submissions.map((sub) => (
                <TableRow 
                  key={sub._id} 
                  hover
                  onClick={() => fetchSubmissionDetails(sub._id)}
                  sx={{ 
                    cursor: 'pointer',
                    '& td': { color: '#ffffff', borderColor: '#333344' },
                    '&:hover': { bgcolor: '#1a1a24' }
                  }}
                >
                  <TableCell>
                    <Typography sx={{ fontFamily: 'monospace', color: '#00e676' }}>
                      {sub.submissionId}
                    </Typography>
                  </TableCell>
                  <TableCell>{sub.pmNumber}</TableCell>
                  <TableCell><StatusBadge status={sub.status} /></TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Chip 
                        size="small" 
                        label={`${sub.routingSummary?.deliveredSections || 0} ✓`} 
                        sx={{ bgcolor: '#1b5e20', color: '#fff', fontSize: '0.75rem' }}
                      />
                      {sub.routingSummary?.failedSections > 0 && (
                        <Chip 
                          size="small" 
                          label={`${sub.routingSummary.failedSections} ✗`} 
                          sx={{ bgcolor: '#b71c1c', color: '#fff', fontSize: '0.75rem' }}
                        />
                      )}
                      {sub.routingSummary?.pendingSections > 0 && (
                        <Chip 
                          size="small" 
                          label={`${sub.routingSummary.pendingSections} ⏳`} 
                          sx={{ bgcolor: '#e65100', color: '#fff', fontSize: '0.75rem' }}
                        />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    {new Date(sub.submittedAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell align="right">
                    {sub.routingSummary?.failedSections > 0 && (
                      <Tooltip title="Retry Failed">
                        <IconButton 
                          size="small" 
                          onClick={(e) => { e.stopPropagation(); handleRetry(sub._id); }}
                          sx={{ color: '#ff9800' }}
                        >
                          <ReplayIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {submissions.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, color: '#888888' }}>
                    No submissions yet. Upload an as-built package to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      
      {/* By Destination */}
      {tab === 1 && analytics?.byDestination && (
        <Grid container spacing={2}>
          {analytics.byDestination.map((dest) => {
            const config = destinationConfig[dest._id] || { icon: <DescriptionIcon />, label: dest._id, color: '#888888' };
            return (
              <Grid item xs={12} sm={6} md={4} key={dest._id}>
                <Paper sx={{ bgcolor: '#16161f', p: 2, borderRadius: 2, borderLeft: `4px solid ${config.color}` }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Box sx={{ color: config.color }}>{config.icon}</Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      {config.label}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Box>
                      <Typography variant="h5" sx={{ color: '#ffffff', fontWeight: 700 }}>
                        {dest.count}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#888888' }}>
                        Total
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="h5" sx={{ color: '#4caf50', fontWeight: 700 }}>
                        {dest.delivered}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#888888' }}>
                        Delivered
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="h5" sx={{ color: '#f44336', fontWeight: 700 }}>
                        {dest.failed}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#888888' }}>
                        Failed
                      </Typography>
                    </Box>
                  </Box>
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      )}
      
      {/* Submission Detail Dialog */}
      <Dialog 
        open={detailOpen} 
        onClose={() => setDetailOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { bgcolor: '#16161f', color: '#ffffff' } }}
      >
        <DialogTitle sx={{ borderBottom: '1px solid #333344' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="h6" component="span" sx={{ fontFamily: 'monospace', color: '#00e676' }}>
                {selectedSubmission?.submissionId}
              </Typography>
              <Typography variant="body2" sx={{ color: '#888888' }}>
                PM: {selectedSubmission?.pmNumber}
              </Typography>
            </Box>
            <StatusBadge status={selectedSubmission?.status} />
          </Box>
        </DialogTitle>
        <DialogContent dividers sx={{ borderColor: '#333344' }}>
          {selectedSubmission?.sections && (
            <List>
              {selectedSubmission.sections.map((section, idx) => {
                const destConfig = destinationConfig[section.destination] || 
                  { icon: <DescriptionIcon />, label: section.destination, color: '#888888' };
                return (
                  <React.Fragment key={section._id || section.type || `section-${idx}`}>
                    <ListItem sx={{ py: 1.5 }}>
                      <ListItemIcon>
                        <DeliveryStatusIcon status={section.status} />
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography sx={{ fontWeight: 600 }}>
                              {sectionLabels[section.type] || section.type}
                            </Typography>
                            <Chip 
                              size="small" 
                              label={`pp. ${section.pages}`}
                              sx={{ bgcolor: '#333344', color: '#888888', fontSize: '0.7rem' }}
                            />
                          </Box>
                        }
                        secondary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                            <Box sx={{ color: destConfig.color, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              {destConfig.icon}
                              <Typography variant="caption">{destConfig.label}</Typography>
                            </Box>
                            {section.externalRef && (
                              <Typography variant="caption" sx={{ color: '#4caf50', fontFamily: 'monospace' }}>
                                Ref: {section.externalRef}
                              </Typography>
                            )}
                            {section.error && (
                              <Typography variant="caption" sx={{ color: '#f44336' }}>
                                {section.error}
                              </Typography>
                            )}
                          </Box>
                        }
                        sx={{ '& .MuiListItemText-secondary': { color: '#888888' } }}
                      />
                    </ListItem>
                    {idx < selectedSubmission.sections.length - 1 && <Divider sx={{ borderColor: '#333344' }} />}
                  </React.Fragment>
                );
              })}
            </List>
          )}
        </DialogContent>
        <DialogActions sx={{ borderTop: '1px solid #333344', p: 2 }}>
          {selectedSubmission?.summary?.failedSections > 0 && (
            <Button
              startIcon={<ReplayIcon />}
              onClick={() => handleRetry(selectedSubmission._id)}
              sx={{ color: '#ff9800' }}
            >
              Retry Failed ({selectedSubmission.summary.failedSections})
            </Button>
          )}
          <Button onClick={() => setDetailOpen(false)} sx={{ color: '#888888' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AsBuiltRouter;

