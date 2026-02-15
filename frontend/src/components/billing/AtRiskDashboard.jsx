/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * At-Risk Dashboard - Field Ticket Revenue Defense
 * 
 * PM/GF view showing the total dollar value of unapproved
 * change orders (T&M field tickets). Creates urgency to
 * get inspector signatures and internal approvals.
 * 
 * Features:
 * - Total "At Risk" dollar amount prominently displayed
 * - Breakdown by status (draft, pending_signature)
 * - Aging analysis (tickets getting stale)
 * - Quick actions to advance ticket workflow
 */

import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Chip,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Snackbar,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import WarningIcon from '@mui/icons-material/Warning';
import SignatureIcon from '@mui/icons-material/Draw';
import CheckIcon from '@mui/icons-material/Check';
import VisibilityIcon from '@mui/icons-material/Visibility';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import DeleteIcon from '@mui/icons-material/Delete';
import SendIcon from '@mui/icons-material/Send';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import api from '../../api';
import { useAppColors } from '../shared/themeUtils';

// Format currency
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

// Calculate days since date
const daysSince = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

// Get aging color based on configurable thresholds
const getAgingColor = (days, colors, thresholds = { warning: 3, critical: 7 }) => {
  if (days < thresholds.warning) return colors.primary;
  if (days <= thresholds.critical) return colors.warning;
  return colors.error;
};

// Get aging label
const getAgingLabel = (days, thresholds = { warning: 3, critical: 7 }) => {
  if (days < thresholds.warning) return 'Fresh';
  if (days <= thresholds.critical) return 'Aging';
  return 'Critical';
};

// Status chip component
const StatusChip = ({ status }) => {
  const COLORS = useAppColors();
  const statusConfig = {
    draft: { label: 'Draft', color: COLORS.textSecondary, bgcolor: COLORS.surfaceLight },
    pending_signature: { label: 'Needs Signature', color: COLORS.bg, bgcolor: COLORS.warning },
    signed: { label: 'Signed', color: COLORS.bg, bgcolor: '#64b5f6' },
    approved: { label: 'Approved', color: COLORS.bg, bgcolor: COLORS.primary },
  };

  const config = statusConfig[status] || statusConfig.draft;

  return (
    <Chip
      label={config.label}
      size="small"
      sx={{
        bgcolor: config.bgcolor,
        color: config.color,
        fontWeight: 600,
        fontSize: '0.75rem',
      }}
    />
  );
};

StatusChip.propTypes = {
  status: PropTypes.oneOf(['draft', 'pending_signature', 'signed', 'approved']).isRequired,
};

const AtRiskDashboard = () => {
  const COLORS = useAppColors();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({
    totalAtRisk: 0,
    ticketCount: 0,
    byStatus: { draft: [], pending_signature: [] },
    tickets: [],
    aging: { fresh: { count: 0, totalAmount: 0 }, warning: { count: 0, totalAmount: 0 }, critical: { count: 0, totalAmount: 0 } },
    trend: [],
    thresholds: { warning: 3, critical: 7 }
  });
  
  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ticketToDelete, setTicketToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Fetch at-risk data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/api/fieldtickets/at-risk');
      setData(response.data);
    } catch (err) {
      console.error('Error fetching at-risk data:', err);
      setError(err.response?.data?.error || 'Failed to load at-risk data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle delete ticket
  const handleDeleteClick = useCallback((ticket) => {
    setTicketToDelete(ticket);
    setDeleteDialogOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!ticketToDelete) return;
    
    setDeleteLoading(true);
    try {
      await api.delete(`/api/fieldtickets/${ticketToDelete._id}`);
      setSnackbar({ 
        open: true, 
        message: `Field ticket ${ticketToDelete.ticketNumber} deleted`, 
        severity: 'success' 
      });
      setDeleteDialogOpen(false);
      setTicketToDelete(null);
      fetchData(); // Refresh the list
    } catch (err) {
      console.error('Error deleting field ticket:', err);
      setSnackbar({ 
        open: true, 
        message: err.response?.data?.error || 'Failed to delete field ticket', 
        severity: 'error' 
      });
    } finally {
      setDeleteLoading(false);
    }
  }, [ticketToDelete, fetchData]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteDialogOpen(false);
    setTicketToDelete(null);
  }, []);

  // Workflow actions: submit for signature, approve
  const handleSubmitForSignature = useCallback(async (ticket) => {
    try {
      await api.post(`/api/fieldtickets/${ticket._id}/submit`);
      setSnackbar({ open: true, message: `Ticket ${ticket.ticketNumber} submitted for signature`, severity: 'success' });
      fetchData();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to submit ticket', severity: 'error' });
    }
  }, [fetchData]);

  const handleApprove = useCallback(async (ticket) => {
    try {
      await api.post(`/api/fieldtickets/${ticket._id}/approve`);
      setSnackbar({ open: true, message: `Ticket ${ticket.ticketNumber} approved`, severity: 'success' });
      fetchData();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to approve ticket', severity: 'error' });
    }
  }, [fetchData]);

  // Use server-provided aging data with thresholds
  const agingMetrics = {
    fresh: data.aging?.fresh?.count || 0,
    aging: data.aging?.warning?.count || 0,
    stale: data.aging?.critical?.count || 0,
  };
  const agingAmounts = {
    fresh: data.aging?.fresh?.totalAmount || 0,
    aging: data.aging?.warning?.totalAmount || 0,
    stale: data.aging?.critical?.totalAmount || 0,
  };
  const thresholds = data.thresholds || { warning: 3, critical: 7 };

  const totalTickets = agingMetrics.fresh + agingMetrics.aging + agingMetrics.stale;

  // Format trend data for chart
  const trendData = (data.trend || []).map(item => ({
    label: `W${item.week}`,
    amount: item.totalAmount,
    count: item.count,
  }));

  if (loading) {
    return (
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: 400,
        bgcolor: COLORS.bg 
      }}>
        <CircularProgress sx={{ color: COLORS.primary }} />
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: COLORS.bg, minHeight: '100%', p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ color: COLORS.text, fontWeight: 700 }}>
            Revenue at Risk
          </Typography>
          <Typography variant="body2" sx={{ color: COLORS.textSecondary }}>
            Unapproved T&M field tickets requiring action
          </Typography>
        </Box>
        <Button
          startIcon={<RefreshIcon />}
          onClick={fetchData}
          sx={{ color: COLORS.primary }}
        >
          Refresh
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Main Metric Card */}
      <Card sx={{ 
        mb: 3, 
        bgcolor: data.totalAtRisk > 0 ? COLORS.warning : COLORS.surface,
        border: data.totalAtRisk > 0 ? `2px solid ${COLORS.warning}` : 'none'
      }}>
        <CardContent sx={{ textAlign: 'center', py: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1 }}>
            <WarningIcon sx={{ fontSize: 32, color: data.totalAtRisk > 0 ? COLORS.bg : COLORS.textSecondary }} />
            <Typography 
              variant="h3" 
              sx={{ 
                fontWeight: 700, 
                color: data.totalAtRisk > 0 ? COLORS.bg : COLORS.primary 
              }}
            >
              {formatCurrency(data.totalAtRisk)}
            </Typography>
          </Box>
          <Typography 
            variant="body1" 
            sx={{ 
              color: data.totalAtRisk > 0 ? COLORS.bg : COLORS.textSecondary,
              fontWeight: 500
            }}
          >
            in {data.ticketCount} unapproved field ticket{data.ticketCount === 1 ? '' : 's'}
          </Typography>
        </CardContent>
      </Card>

      {/* Status Breakdown */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Card sx={{ flex: 1, bgcolor: COLORS.surface }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: COLORS.textSecondary }} />
              <Typography variant="body2" sx={{ color: COLORS.textSecondary }}>
                Drafts
              </Typography>
            </Box>
            <Typography variant="h4" sx={{ color: COLORS.text, fontWeight: 600 }}>
              {data.byStatus.draft?.length || 0}
            </Typography>
            <Typography variant="body2" sx={{ color: COLORS.textSecondary }}>
              {formatCurrency(data.byStatus.draft?.reduce((sum, t) => sum + t.totalAmount, 0) || 0)}
            </Typography>
          </CardContent>
        </Card>

        <Card sx={{ flex: 1, bgcolor: COLORS.surface, border: `1px solid ${COLORS.warning}` }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: COLORS.warning }} />
              <Typography variant="body2" sx={{ color: COLORS.warning }}>
                Needs Signature
              </Typography>
            </Box>
            <Typography variant="h4" sx={{ color: COLORS.text, fontWeight: 600 }}>
              {data.byStatus.pending_signature?.length || 0}
            </Typography>
            <Typography variant="body2" sx={{ color: COLORS.textSecondary }}>
              {formatCurrency(data.byStatus.pending_signature?.reduce((sum, t) => sum + t.totalAmount, 0) || 0)}
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Aging Analysis */}
      {totalTickets > 0 && (
        <Card sx={{ mb: 3, bgcolor: COLORS.surface }}>
          <CardContent>
            <Typography variant="subtitle1" sx={{ color: COLORS.text, mb: 2, fontWeight: 600 }}>
              <AccessTimeIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Ticket Aging
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <Box sx={{ flex: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" sx={{ color: COLORS.primary }}>
                    Fresh (&lt; {thresholds.warning}d)
                  </Typography>
                  <Typography variant="body2" sx={{ color: COLORS.text }}>
                    {agingMetrics.fresh}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={(agingMetrics.fresh / totalTickets) * 100}
                  sx={{
                    height: 8,
                    borderRadius: 4,
                    bgcolor: COLORS.surfaceLight,
                    '& .MuiLinearProgress-bar': { bgcolor: COLORS.primary }
                  }}
                />
                <Typography variant="caption" sx={{ color: COLORS.textSecondary }}>
                  {formatCurrency(agingAmounts.fresh)}
                </Typography>
              </Box>
              <Box sx={{ flex: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" sx={{ color: COLORS.warning }}>
                    Aging ({thresholds.warning}-{thresholds.critical}d)
                  </Typography>
                  <Typography variant="body2" sx={{ color: COLORS.text }}>
                    {agingMetrics.aging}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={(agingMetrics.aging / totalTickets) * 100}
                  sx={{
                    height: 8,
                    borderRadius: 4,
                    bgcolor: COLORS.surfaceLight,
                    '& .MuiLinearProgress-bar': { bgcolor: COLORS.warning }
                  }}
                />
                <Typography variant="caption" sx={{ color: COLORS.textSecondary }}>
                  {formatCurrency(agingAmounts.aging)}
                </Typography>
              </Box>
              <Box sx={{ flex: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" sx={{ color: COLORS.error }}>
                    Critical (&gt; {thresholds.critical}d)
                  </Typography>
                  <Typography variant="body2" sx={{ color: COLORS.text }}>
                    {agingMetrics.stale}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={(agingMetrics.stale / totalTickets) * 100}
                  sx={{
                    height: 8,
                    borderRadius: 4,
                    bgcolor: COLORS.surfaceLight,
                    '& .MuiLinearProgress-bar': { bgcolor: COLORS.error }
                  }}
                />
                <Typography variant="caption" sx={{ color: COLORS.textSecondary }}>
                  {formatCurrency(agingAmounts.stale)}
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Weekly Trend Chart */}
      {trendData.length > 1 && (
        <Card sx={{ mb: 3, bgcolor: COLORS.surface }}>
          <CardContent>
            <Typography variant="subtitle1" sx={{ color: COLORS.text, mb: 2, fontWeight: 600 }}>
              <TrendingUpIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              At-Risk Trend (Weekly)
            </Typography>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                <XAxis dataKey="label" tick={{ fill: COLORS.textSecondary, fontSize: 12 }} />
                <YAxis
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  tick={{ fill: COLORS.textSecondary, fontSize: 12 }}
                />
                <RechartsTooltip
                  formatter={(value) => [formatCurrency(value), 'At Risk']}
                  contentStyle={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}` }}
                  labelStyle={{ color: COLORS.text }}
                  itemStyle={{ color: COLORS.warning }}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke={COLORS.warning}
                  fill={COLORS.warning}
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Tickets Table */}
      {data.tickets.length > 0 ? (
        <Card sx={{ bgcolor: COLORS.surface }}>
          <CardContent>
            <Typography variant="subtitle1" sx={{ color: COLORS.text, mb: 2, fontWeight: 600 }}>
              Field Tickets Requiring Action
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: COLORS.textSecondary, borderColor: COLORS.border }}>
                      Ticket #
                    </TableCell>
                    <TableCell sx={{ color: COLORS.textSecondary, borderColor: COLORS.border }}>
                      Job
                    </TableCell>
                    <TableCell sx={{ color: COLORS.textSecondary, borderColor: COLORS.border }}>
                      Work Date
                    </TableCell>
                    <TableCell sx={{ color: COLORS.textSecondary, borderColor: COLORS.border }}>
                      Age
                    </TableCell>
                    <TableCell sx={{ color: COLORS.textSecondary, borderColor: COLORS.border }}>
                      Amount
                    </TableCell>
                    <TableCell sx={{ color: COLORS.textSecondary, borderColor: COLORS.border }}>
                      Status
                    </TableCell>
                    <TableCell sx={{ color: COLORS.textSecondary, borderColor: COLORS.border }} align="right">
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.tickets.map((ticket) => {
                    const days = daysSince(ticket.workDate);
                    return (
                      <TableRow key={ticket._id} hover>
                        <TableCell sx={{ color: COLORS.text, borderColor: COLORS.border }}>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                            {ticket.ticketNumber}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ color: COLORS.text, borderColor: COLORS.border }}>
                          <Typography variant="body2">
                            {ticket.jobId?.woNumber || 'N/A'}
                          </Typography>
                          <Typography variant="caption" sx={{ color: COLORS.textSecondary }}>
                            {ticket.jobId?.address?.substring(0, 30)}...
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ color: COLORS.text, borderColor: COLORS.border }}>
                          {new Date(ticket.workDate).toLocaleDateString()}
                        </TableCell>
                        <TableCell sx={{ borderColor: COLORS.border }}>
                          <Tooltip title={getAgingLabel(days, thresholds)}>
                            <Chip
                              label={`${days}d`}
                              size="small"
                              sx={{
                                bgcolor: getAgingColor(days, COLORS, thresholds),
                                color: COLORS.bg,
                                fontWeight: 600,
                                minWidth: 40
                              }}
                            />
                          </Tooltip>
                        </TableCell>
                        <TableCell sx={{ color: COLORS.primary, borderColor: COLORS.border, fontWeight: 600 }}>
                          {formatCurrency(ticket.totalAmount)}
                        </TableCell>
                        <TableCell sx={{ borderColor: COLORS.border }}>
                          <StatusChip status={ticket.status} />
                        </TableCell>
                        <TableCell sx={{ borderColor: COLORS.border }} align="right">
                          <Tooltip title="View Details">
                            <IconButton
                              size="small"
                              onClick={() => navigate(`/jobs/${ticket.jobId?._id || ticket.jobId}/field-ticket/${ticket._id}`)}
                              sx={{ color: COLORS.textSecondary }}
                            >
                              <VisibilityIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {ticket.status === 'draft' && (
                            <Tooltip title="Submit for Signature">
                              <IconButton
                                size="small"
                                onClick={() => handleSubmitForSignature(ticket)}
                                sx={{ color: COLORS.warning }}
                              >
                                <SendIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {ticket.status === 'pending_signature' && (
                            <Tooltip title="Get Signature">
                              <IconButton
                                size="small"
                                onClick={() => navigate(`/jobs/${ticket.jobId?._id || ticket.jobId}/field-ticket/${ticket._id}`)}
                                sx={{ color: COLORS.warning }}
                              >
                                <SignatureIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {ticket.status === 'signed' && (
                            <Tooltip title="Approve">
                              <IconButton
                                size="small"
                                onClick={() => handleApprove(ticket)}
                                sx={{ color: COLORS.primary }}
                              >
                                <CheckIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {(ticket.status === 'draft' || ticket.status === 'pending_signature') && (
                            <Tooltip title="Delete">
                              <IconButton
                                size="small"
                                onClick={() => handleDeleteClick(ticket)}
                                sx={{ color: COLORS.error }}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      ) : (
        <Card sx={{ bgcolor: COLORS.surface }}>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <TrendingUpIcon sx={{ fontSize: 64, color: COLORS.primary, mb: 2 }} />
            <Typography variant="h6" sx={{ color: COLORS.text, mb: 1 }}>
              No Revenue at Risk
            </Typography>
            <Typography variant="body2" sx={{ color: COLORS.textSecondary }}>
              All field tickets have been approved. Great job!
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        PaperProps={{ sx: { bgcolor: COLORS.surface } }}
      >
        <DialogTitle sx={{ color: COLORS.text }}>
          Delete Field Ticket?
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: COLORS.textSecondary }}>
            Are you sure you want to delete field ticket{' '}
            <strong>{ticketToDelete?.ticketNumber}</strong>?
            {ticketToDelete?.totalAmount > 0 && (
              <>
                {' '}This will remove {formatCurrency(ticketToDelete.totalAmount)} from your records.
              </>
            )}
            {' '}This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button 
            onClick={handleDeleteCancel} 
            sx={{ color: COLORS.textSecondary }}
            disabled={deleteLoading}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleDeleteConfirm} 
            variant="contained"
            color="error"
            disabled={deleteLoading}
            startIcon={deleteLoading ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon />}
          >
            {deleteLoading ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
      >
        <Alert 
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))} 
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default AtRiskDashboard;

