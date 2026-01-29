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
import {
  Security as SecurityIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  ArrowBack as ArrowBackIcon,
  Login as LoginIcon,
  Logout as LogoutIcon,
  Description as DescriptionIcon,
  Person as PersonIcon,
  Shield as ShieldIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material';
import { useThemeMode } from '../ThemeContext';
import { getThemeColors } from './shared/themeUtils';

// Severity colors
const SEVERITY_COLORS = {
  critical: { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
  warning: { bg: '#fffbeb', text: '#d97706', border: '#fde68a' },
  info: { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' },
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

const SecurityDashboard = () => {
  const navigate = useNavigate();
  const { mode } = useThemeMode();
  const { cardBg, textPrimary, borderColor } = getThemeColors(mode);

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

      const url = window.URL.createObjectURL(new Blob([response.data]));
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

  // Stat card component
  const StatCard = ({ title, value, icon, color }) => (
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
        <IconButton onClick={() => navigate('/dashboard')}>
          <ArrowBackIcon />
        </IconButton>
        <SecurityIcon sx={{ color: '#6366f1', fontSize: 28 }} />
        <Typography variant="h5" fontWeight={700} color={textPrimary}>
          Security & Compliance
        </Typography>
        <Chip label="PG&E Exhibit 5" sx={{ ml: 'auto', bgcolor: '#6366f120', color: '#6366f1' }} />
      </Paper>

      <Container maxWidth="xl">
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Stats Overview */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} md={3}>
            <StatCard
              title="Total Events (30d)"
              value={stats ? Object.values(stats.actionCounts || {}).reduce((a, b) => a + b, 0) : '-'}
              icon={<ShieldIcon />}
              color="#6366f1"
            />
          </Grid>
          <Grid item xs={6} md={3}>
            <StatCard
              title="Login Events"
              value={stats?.actionCounts?.LOGIN_SUCCESS || 0}
              icon={<LoginIcon />}
              color="#22c55e"
            />
          </Grid>
          <Grid item xs={6} md={3}>
            <StatCard
              title="Warnings"
              value={stats?.severityCounts?.warning || 0}
              icon={<WarningIcon />}
              color="#f59e0b"
            />
          </Grid>
          <Grid item xs={6} md={3}>
            <StatCard
              title="Critical Events"
              value={stats?.severityCounts?.critical || 0}
              icon={<ErrorIcon />}
              color="#ef4444"
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
                  <IconButton onClick={fetchLogs}>
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
                          label={log.action?.replace(/_/g, ' ')}
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
                  {(stats?.recentSecurityEvents || []).map((event, idx) => (
                    <TableRow
                      key={event._id || idx}
                      sx={{
                        bgcolor:
                          event.severity === 'critical'
                            ? SEVERITY_COLORS.critical.bg
                            : SEVERITY_COLORS.warning.bg,
                      }}
                    >
                      <TableCell>{formatTime(event.timestamp)}</TableCell>
                      <TableCell>
                        <Chip
                          icon={event.severity === 'critical' ? <ErrorIcon /> : <WarningIcon />}
                          label={event.severity}
                          size="small"
                          sx={{
                            bgcolor: SEVERITY_COLORS[event.severity]?.bg,
                            color: SEVERITY_COLORS[event.severity]?.text,
                            fontWeight: 600,
                          }}
                        />
                      </TableCell>
                      <TableCell>{event.action?.replace(/_/g, ' ')}</TableCell>
                      <TableCell>{event.userEmail || '-'}</TableCell>
                      <TableCell>
                        {event.errorMessage || event.details?.reason || '-'}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{event.ipAddress}</TableCell>
                    </TableRow>
                  ))}
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
            <Grid item xs={12} md={4}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircleIcon sx={{ color: '#22c55e' }} />
                <Typography>Audit Logging: Active</Typography>
              </Box>
            </Grid>
            <Grid item xs={12} md={4}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircleIcon sx={{ color: '#22c55e' }} />
                <Typography>Data Retention: 7 Years</Typography>
              </Box>
            </Grid>
            <Grid item xs={12} md={4}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircleIcon sx={{ color: '#22c55e' }} />
                <Typography>MFA: Available</Typography>
              </Box>
            </Grid>
            <Grid item xs={12} md={4}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircleIcon sx={{ color: '#22c55e' }} />
                <Typography>Encryption: AES-256</Typography>
              </Box>
            </Grid>
            <Grid item xs={12} md={4}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircleIcon sx={{ color: '#22c55e' }} />
                <Typography>RBAC: 6 Roles</Typography>
              </Box>
            </Grid>
            <Grid item xs={12} md={4}>
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

