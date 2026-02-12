/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
// src/components/SecurityDashboard.js - PG&E Compliance Security Dashboard
import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import {
  Container,
  Typography,
  Box,
  Paper,
  Grid,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  TextField,
  MenuItem,
  IconButton,
  Tooltip,
  LinearProgress,
  Alert,
  Tabs,
  Tab,
} from '@mui/material';
import SecurityIcon from '@mui/icons-material/Security';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import DescriptionIcon from '@mui/icons-material/Description';
import PersonIcon from '@mui/icons-material/Person';
import ShieldIcon from '@mui/icons-material/Shield';
import FilterIcon from '@mui/icons-material/FilterList';
import { useThemeMode } from '../ThemeContext';
import { getThemeColors } from './shared/themeUtils';

// Severity colors - theme-aware with proper contrast
// Uses explicit dark backgrounds for dark mode, light tints for light mode
const getSeverityColors = (mode) => {
  if (mode === 'dark') {
    return {
      critical: { 
        bg: '#2d1f1f',      // Dark red-tinted background
        text: '#f87171',    // Light red for chip
        cellText: '#ffffff', // White text for cells
        border: '#991b1b'   // Dark red border
      },
      warning: { 
        bg: '#2d2a1f',      // Dark amber-tinted background
        text: '#fbbf24',    // Light amber for chip
        cellText: '#ffffff', // White text for cells
        border: '#92400e'   // Dark amber border
      },
      info: { 
        bg: '#1e293b',      // Dark blue background
        text: '#60a5fa',    // Light blue for chip
        cellText: '#ffffff', // White text for cells
        border: '#1e40af'   // Dark blue border
      },
    };
  }
  // Light mode
  return {
    critical: { 
      bg: '#fef2f2',      // Light pink background
      text: '#dc2626',    // Red for chip
      cellText: '#450a0a', // Very dark red text
      border: '#fecaca'   // Light red border
    },
    warning: { 
      bg: '#fffbeb',      // Light cream background
      text: '#d97706',    // Amber for chip
      cellText: '#451a03', // Very dark amber text
      border: '#fde68a'   // Light amber border
    },
    info: { 
      bg: '#eff6ff',      // Light blue background
      text: '#2563eb',    // Blue for chip
      cellText: '#1e3a8a', // Dark blue text
      border: '#bfdbfe'   // Light blue border
    },
  };
};

// Action icons
const getActionIcon = (action) => {
  if (action?.startsWith('LOGIN')) return <LoginIcon fontSize="small" />;
  if (action?.startsWith('LOGOUT')) return <LogoutIcon fontSize="small" />;
  if (action?.includes('DOCUMENT')) return <DescriptionIcon fontSize="small" />;
  if (action?.includes('USER')) return <PersonIcon fontSize="small" />;
  return <ShieldIcon fontSize="small" />;
};

// Format timestamp
const formatTime = (date) => {
  if (!date) return '-';
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Stat card component - extracted to module level to avoid re-creation on each render
const StatCard = ({ title, value, icon, color, cardBg, textPrimary, borderColor }) => (
  <Card sx={{ bgcolor: cardBg, border: `1px solid ${borderColor}` }}>
    <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <Box
        sx={{
          p: 1.5,
          borderRadius: 2,
          bgcolor: `${color}15`,
          color: color,
          display: 'flex',
        }}
      >
        {icon}
      </Box>
      <Box>
        <Typography variant="h4" fontWeight={700} color={textPrimary}>
          {value}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {title}
        </Typography>
      </Box>
    </CardContent>
  </Card>
);

StatCard.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  icon: PropTypes.node.isRequired,
  color: PropTypes.string.isRequired,
  cardBg: PropTypes.string.isRequired,
  textPrimary: PropTypes.string.isRequired,
  borderColor: PropTypes.string.isRequired,
};

const SecurityDashboard = () => {
  const navigate = useNavigate();
  const { darkMode } = useThemeMode();
  const mode = darkMode ? 'dark' : 'light';
  const { cardBg, textPrimary, borderColor } = getThemeColors(mode);
  const SEVERITY_COLORS = getSeverityColors(mode);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tabValue, setTabValue] = useState(0);

  // Stats data
  const [stats, setStats] = useState(null);

  // Audit logs
  const [logs, setLogs] = useState([]);
  const [logsPage, setLogsPage] = useState(1);
  const [logsPagination, setLogsPagination] = useState({ total: 0, pages: 1 });

  // Filters
  const [filters, setFilters] = useState({
    action: '',
    severity: '',
    category: '',
    startDate: '',
    endDate: '',
  });

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await api.get('/api/admin/audit-stats?days=30');
      setStats(response.data);
    } catch (err) {
      console.error('Error fetching audit stats:', err);
    }
  }, []);

  // Fetch logs
  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: logsPage.toString(),
        limit: '25',
      });

      if (filters.action) params.append('action', filters.action);
      if (filters.severity) params.append('severity', filters.severity);
      if (filters.category) params.append('category', filters.category);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);

      const response = await api.get(`/api/admin/audit-logs?${params}`);
      setLogs(response.data.logs || []);
      setLogsPagination(response.data.pagination || { total: 0, pages: 1 });
      setError('');
    } catch (err) {
      console.error('Error fetching audit logs:', err);
      setError('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [logsPage, filters]);

  useEffect(() => {
    fetchStats();
    fetchLogs();
  }, [fetchStats, fetchLogs]);

  // Export logs as CSV
  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      params.append('format', 'csv');

      const response = await api.get(`/api/admin/audit-logs/export?${params}`, {
        responseType: 'blob',
      });

      const url = globalThis.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `audit-logs-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Export error:', err);
      setError('Failed to export logs');
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Header */}
      <Paper
        sx={{
          p: 2,
          mb: 3,
          bgcolor: cardBg,
          borderBottom: `1px solid ${borderColor}`,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <IconButton onClick={() => navigate('/dashboard')} aria-label="Go back to dashboard">
          <ArrowBackIcon />
        </IconButton>
        <SecurityIcon sx={{ color: '#6366f1', fontSize: 28 }} />
        <Typography variant="h5" fontWeight={700} color={textPrimary}>
          Security & Compliance
        </Typography>
        <Chip 
          label="PG&E Exhibit 5" 
          sx={{ 
            ml: 'auto', 
            bgcolor: mode === 'dark' ? '#4338ca' : '#6366f1',
            color: '#ffffff',
            fontWeight: 600,
          }} 
        />
      </Paper>

      <Container maxWidth="xl">
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Stats Overview */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 6, md: 3 }}>
            <StatCard
              title="Total Events (30d)"
              value={stats ? Object.values(stats.actionCounts || {}).reduce((a, b) => a + b, 0) : '-'}
              icon={<ShieldIcon />}
              color="#6366f1"
              cardBg={cardBg}
              textPrimary={textPrimary}
              borderColor={borderColor}
            />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <StatCard
              title="Login Events"
              value={stats?.actionCounts?.LOGIN_SUCCESS || 0}
              icon={<LoginIcon />}
              color="#22c55e"
              cardBg={cardBg}
              textPrimary={textPrimary}
              borderColor={borderColor}
            />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <StatCard
              title="Warnings"
              value={stats?.severityCounts?.warning || 0}
              icon={<WarningIcon />}
              color="#f59e0b"
              cardBg={cardBg}
              textPrimary={textPrimary}
              borderColor={borderColor}
            />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <StatCard
              title="Critical Events"
              value={stats?.severityCounts?.critical || 0}
              icon={<ErrorIcon />}
              color="#ef4444"
              cardBg={cardBg}
              textPrimary={textPrimary}
              borderColor={borderColor}
            />
          </Grid>
        </Grid>

        {/* Recent Security Events */}
        {stats?.recentSecurityEvents?.length > 0 && (
          <Alert
            severity="warning"
            icon={<WarningIcon />}
            sx={{ mb: 3 }}
            action={
              <Button size="small" onClick={() => setTabValue(1)}>
                View All
              </Button>
            }
          >
            <strong>{stats.recentSecurityEvents.length} security events</strong> in the last 30 days
            require attention
          </Alert>
        )}

        {/* Tabs */}
        <Paper sx={{ bgcolor: cardBg, mb: 3 }}>
          <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)}>
            <Tab label="Audit Logs" icon={<DescriptionIcon />} iconPosition="start" />
            <Tab label="Security Events" icon={<WarningIcon />} iconPosition="start" />
          </Tabs>
        </Paper>

        {/* Tab Content */}
        {tabValue === 0 && (
          <Paper sx={{ bgcolor: cardBg, p: 2 }}>
            {/* Filters */}
            <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              <FilterIcon color="action" />
              <TextField
                select
                size="small"
                label="Category"
                value={filters.category}
                onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                sx={{ minWidth: 150 }}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="authentication">Authentication</MenuItem>
                <MenuItem value="data_access">Data Access</MenuItem>
                <MenuItem value="data_modification">Data Modification</MenuItem>
                <MenuItem value="security">Security</MenuItem>
                <MenuItem value="admin">Admin</MenuItem>
              </TextField>
              <TextField
                select
                size="small"
                label="Severity"
                value={filters.severity}
                onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
                sx={{ minWidth: 120 }}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="info">Info</MenuItem>
                <MenuItem value="warning">Warning</MenuItem>
                <MenuItem value="critical">Critical</MenuItem>
              </TextField>
              <TextField
                type="date"
                size="small"
                label="Start Date"
                InputLabelProps={{ shrink: true }}
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              />
              <TextField
                type="date"
                size="small"
                label="End Date"
                InputLabelProps={{ shrink: true }}
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              />
              <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
                <Tooltip title="Refresh">
                  <IconButton onClick={fetchLogs} aria-label="Refresh audit logs">
                    <RefreshIcon />
                  </IconButton>
                </Tooltip>
                <Button startIcon={<DownloadIcon />} variant="outlined" onClick={handleExport}>
                  Export CSV
                </Button>
              </Box>
            </Box>

            {loading && <LinearProgress sx={{ mb: 2 }} />}

            {/* Logs Table */}
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Time</TableCell>
                    <TableCell>User</TableCell>
                    <TableCell>Action</TableCell>
                    <TableCell>Resource</TableCell>
                    <TableCell>Severity</TableCell>
                    <TableCell>IP Address</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {logs.map((log, idx) => (
                    <TableRow key={log._id || idx} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatTime(log.timestamp)}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <PersonIcon fontSize="small" color="action" />
                          {log.userEmail || log.userName || '-'}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          icon={getActionIcon(log.action)}
                          label={log.action?.replaceAll('_', ' ')}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>{log.resourceName || log.resourceType || '-'}</TableCell>
                      <TableCell>
                        <Chip
                          label={log.severity}
                          size="small"
                          sx={{
                            bgcolor: SEVERITY_COLORS[log.severity]?.bg,
                            color: SEVERITY_COLORS[log.severity]?.text,
                            fontWeight: 600,
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {log.ipAddress || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {logs.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">No audit logs found</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Pagination */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Showing {logs.length} of {logsPagination.total} events
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  size="small"
                  disabled={logsPage <= 1}
                  onClick={() => setLogsPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="small"
                  disabled={logsPage >= logsPagination.pages}
                  onClick={() => setLogsPage((p) => p + 1)}
                >
                  Next
                </Button>
              </Box>
            </Box>
          </Paper>
        )}

        {tabValue === 1 && (
          <Paper sx={{ bgcolor: cardBg, p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Security Events (Warning & Critical)
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Time</TableCell>
                    <TableCell>Severity</TableCell>
                    <TableCell>Action</TableCell>
                    <TableCell>User</TableCell>
                    <TableCell>Details</TableCell>
                    <TableCell>IP Address</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(stats?.recentSecurityEvents || []).map((event, idx) => {
                    const severityConfig = SEVERITY_COLORS[event.severity] || SEVERITY_COLORS.warning;
                    // Use sx prop with !important to override MUI dark mode CSS specificity
                    const cellSx = { 
                      color: `${severityConfig.cellText} !important`, 
                      backgroundColor: 'inherit',
                    };
                    return (
                    <TableRow
                      key={event._id || idx}
                      sx={{ 
                        backgroundColor: `${severityConfig.bg} !important`,
                        '&:hover': { backgroundColor: `${severityConfig.bg} !important` },
                      }}
                    >
                      <TableCell sx={cellSx}>{formatTime(event.timestamp)}</TableCell>
                      <TableCell sx={cellSx}>
                        <Chip
                          icon={event.severity === 'critical' ? <ErrorIcon /> : <WarningIcon />}
                          label={event.severity}
                          size="small"
                          sx={{
                            bgcolor: mode === 'dark' ? severityConfig.border : severityConfig.bg,
                            color: `${severityConfig.text} !important`,
                            fontWeight: 600,
                            border: `1px solid ${severityConfig.border}`,
                            '& .MuiChip-icon': { color: `${severityConfig.text} !important` },
                          }}
                        />
                      </TableCell>
                      <TableCell sx={cellSx}>{event.action?.replaceAll('_', ' ')}</TableCell>
                      <TableCell sx={cellSx}>{event.userEmail || '-'}</TableCell>
                      <TableCell sx={cellSx}>
                        {event.errorMessage || event.details?.reason || '-'}
                      </TableCell>
                      <TableCell sx={{ ...cellSx, fontFamily: 'monospace' }}>{event.ipAddress}</TableCell>
                    </TableRow>
                    );
                  })}
                  {(!stats?.recentSecurityEvents || stats.recentSecurityEvents.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                        <CheckCircleIcon sx={{ fontSize: 48, color: '#22c55e', mb: 1 }} />
                        <Typography color="text.secondary">
                          No security events in the last 30 days
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}

        {/* Compliance Info */}
        <Paper sx={{ bgcolor: cardBg, p: 3, mt: 3 }}>
          <Typography variant="h6" gutterBottom display="flex" alignItems="center" gap={1}>
            <ShieldIcon color="primary" /> Compliance Status
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircleIcon sx={{ color: '#22c55e' }} />
                <Typography>Audit Logging: Active</Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircleIcon sx={{ color: '#22c55e' }} />
                <Typography>Data Retention: 7 Years</Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircleIcon sx={{ color: '#22c55e' }} />
                <Typography>MFA: Available</Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircleIcon sx={{ color: '#22c55e' }} />
                <Typography>Encryption: AES-256</Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircleIcon sx={{ color: '#22c55e' }} />
                <Typography>RBAC: 6 Roles</Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircleIcon sx={{ color: '#22c55e' }} />
                <Typography>Rate Limiting: Active</Typography>
              </Box>
            </Grid>
          </Grid>
        </Paper>
      </Container>
    </Box>
  );
};

export default SecurityDashboard;

