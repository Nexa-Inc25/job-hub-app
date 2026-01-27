// src/components/AdminJobsOverview.js
// Detailed view of all jobs across all companies

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
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Work as WorkIcon,
  Warning as WarningIcon,
  Schedule as ScheduleIcon,
  TrendingUp as TrendingUpIcon,
} from '@mui/icons-material';
import { useThemeMode } from '../ThemeContext';
import {
  PieChart,
  Pie,
  Cell as RechartsCell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from 'recharts';

// Priority color lookup
const PRIORITY_COLORS = {
  emergency: '#ef4444',
  high: '#f59e0b',
  medium: '#6366f1',
  low: '#22c55e',
};

// Extracted StatCard component
const StatCard = ({ title, value, subtitle, icon: Icon, color, cardBg, textPrimary, textSecondary, borderColor }) => (
  <Card sx={{ bgcolor: cardBg, border: `1px solid ${borderColor}`, borderRadius: 2 }}>
    <CardContent>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="body2" sx={{ color: textSecondary, mb: 0.5 }}>{title}</Typography>
          <Typography variant="h4" sx={{ color: textPrimary, fontWeight: 700 }}>{value}</Typography>
          {subtitle && <Typography variant="caption" sx={{ color: textSecondary }}>{subtitle}</Typography>}
        </Box>
        <Box sx={{ bgcolor: `${color}20`, borderRadius: 2, p: 1 }}>
          <Icon sx={{ color, fontSize: 24 }} />
        </Box>
      </Box>
    </CardContent>
  </Card>
);
StatCard.propTypes = { 
  title: PropTypes.string, value: PropTypes.node, subtitle: PropTypes.string, 
  icon: PropTypes.elementType, color: PropTypes.string,
  cardBg: PropTypes.string, textPrimary: PropTypes.string, textSecondary: PropTypes.string, borderColor: PropTypes.string
};

const STATUS_COLORS = {
  new: '#3b82f6',
  assigned_to_gf: '#8b5cf6',
  pre_fielding: '#f59e0b',
  scheduled: '#06b6d4',
  in_progress: '#22c55e',
  pending_gf_review: '#eab308',
  pending_qa_review: '#f59e0b',
  pending_pm_approval: '#f97316',
  ready_to_submit: '#10b981',
  submitted: '#6366f1',
  go_back: '#ef4444',
  billed: '#8b5cf6',
  invoiced: '#22c55e',
  stuck: '#ef4444',
  pending: '#64748b',
};

const STATUS_LABELS = {
  new: 'New',
  assigned_to_gf: 'Assigned to GF',
  pre_fielding: 'Pre-Fielding',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  pending_gf_review: 'GF Review',
  pending_qa_review: 'QA Review',
  pending_pm_approval: 'PM Approval',
  ready_to_submit: 'Ready to Submit',
  submitted: 'Submitted',
  go_back: 'Go-Back',
  billed: 'Billed',
  invoiced: 'Invoiced',
  stuck: 'Stuck',
  pending: 'Pending',
};

const AdminJobsOverview = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { mode } = useThemeMode();

  const cardBg = mode === 'dark' ? '#1e1e2e' : '#ffffff';
  const textPrimary = mode === 'dark' ? '#e2e8f0' : '#1e293b';
  const textSecondary = mode === 'dark' ? '#94a3b8' : '#64748b';
  const borderColor = mode === 'dark' ? '#334155' : '#e2e8f0';
  const chartGridColor = mode === 'dark' ? '#334155' : '#e5e7eb';

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/admin/owner-stats');
      setStats(response.data);
    } catch (err) {
      console.error('Error fetching data:', err);
      if (err.response?.status === 403) {
        setError('Super Admin access required');
      } else {
        setError('Failed to load job statistics');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  // Prepare chart data
  const statusData = stats?.jobs?.byStatus 
    ? Object.entries(stats.jobs.byStatus)
        .map(([status, count]) => ({ 
          name: STATUS_LABELS[status] || status, 
          value: count,
          status 
        }))
        .sort((a, b) => b.value - a.value)
    : [];

  const priorityData = stats?.jobs?.byPriority
    ? Object.entries(stats.jobs.byPriority).map(([name, value]) => ({ name, value }))
    : [];

  const trendData = stats?.jobs?.creationTrend || [];

  // Theme props to pass to StatCard
  const themeProps = { cardBg, textPrimary, textSecondary, borderColor };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: mode === 'dark' ? '#0f0f1a' : '#f1f5f9' }}>
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: mode === 'dark' ? '#1e1e2e' : '#ffffff', borderBottom: `1px solid ${borderColor}` }}>
        <Toolbar>
          <IconButton onClick={() => navigate('/admin/owner-dashboard')} sx={{ mr: 2, color: textPrimary }}>
            <ArrowBackIcon />
          </IconButton>
          <WorkIcon sx={{ mr: 1.5, color: '#22c55e' }} />
          <Typography variant="h6" sx={{ flexGrow: 1, color: textPrimary, fontWeight: 700 }}>
            Jobs Overview
          </Typography>
          <Chip 
            label={`${stats?.jobs?.total || 0} total jobs`}
            sx={{ bgcolor: '#22c55e20', color: '#22c55e', fontWeight: 600 }}
          />
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Quick Stats */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={6} sm={3}>
            <StatCard title="Total Jobs" value={stats?.jobs?.total || 0} icon={WorkIcon} color="#22c55e" {...themeProps} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatCard title="This Week" value={stats?.jobs?.thisWeek || 0} icon={TrendingUpIcon} color="#6366f1" {...themeProps} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatCard title="Today" value={stats?.jobs?.today || 0} icon={ScheduleIcon} color="#f59e0b" {...themeProps} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatCard title="Emergency" value={stats?.jobs?.emergency || 0} icon={WarningIcon} color="#ef4444" {...themeProps} />
          </Grid>
        </Grid>

        {/* Charts Row */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {/* Jobs by Status */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, bgcolor: cardBg, border: `1px solid ${borderColor}`, borderRadius: 3 }}>
              <Typography variant="h6" sx={{ color: textPrimary, mb: 2, fontWeight: 600 }}>
                Jobs by Status
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                {statusData.map(({ name, value, status }) => (
                  <Chip
                    key={status}
                    label={`${name}: ${value}`}
                    size="small"
                    sx={{
                      bgcolor: `${STATUS_COLORS[status] || '#64748b'}20`,
                      color: STATUS_COLORS[status] || '#64748b',
                      fontWeight: 600,
                      fontSize: '0.75rem'
                    }}
                  />
                ))}
              </Box>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {statusData.map((entry) => (
                      <RechartsCell key={entry.status} fill={STATUS_COLORS[entry.status] || '#64748b'} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ bgcolor: cardBg, border: `1px solid ${borderColor}`, borderRadius: 8 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>

          {/* Jobs by Priority */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, bgcolor: cardBg, border: `1px solid ${borderColor}`, borderRadius: 3 }}>
              <Typography variant="h6" sx={{ color: textPrimary, mb: 2, fontWeight: 600 }}>
                Jobs by Priority
              </Typography>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={priorityData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                  <XAxis type="number" stroke={textSecondary} />
                  <YAxis type="category" dataKey="name" stroke={textSecondary} width={80} />
                  <RechartsTooltip 
                    contentStyle={{ bgcolor: cardBg, border: `1px solid ${borderColor}`, borderRadius: 8 }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {priorityData.map((entry) => (
                      <RechartsCell 
                        key={entry.name} 
                        fill={PRIORITY_COLORS[entry.name] || '#22c55e'} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>
        </Grid>

        {/* Job Creation Trend */}
        <Paper sx={{ p: 3, bgcolor: cardBg, border: `1px solid ${borderColor}`, borderRadius: 3 }}>
          <Typography variant="h6" sx={{ color: textPrimary, mb: 2, fontWeight: 600 }}>
            Job Creation Trend (Last 30 Days)
          </Typography>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
              <XAxis 
                dataKey="date" 
                stroke={textSecondary}
                tick={{ fontSize: 11 }}
                tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              />
              <YAxis stroke={textSecondary} />
              <RechartsTooltip 
                contentStyle={{ bgcolor: cardBg, border: `1px solid ${borderColor}`, borderRadius: 8 }}
                labelFormatter={(value) => new Date(value).toLocaleDateString()}
              />
              <Bar dataKey="count" fill="#22c55e" radius={[4, 4, 0, 0]} name="Jobs Created" />
            </BarChart>
          </ResponsiveContainer>
        </Paper>

        {/* Workflow Stats */}
        {stats?.workflow && (
          <Paper sx={{ p: 3, mt: 3, bgcolor: cardBg, border: `1px solid ${borderColor}`, borderRadius: 3 }}>
            <Typography variant="h6" sx={{ color: textPrimary, mb: 2, fontWeight: 600 }}>
              Workflow Metrics
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={6} sm={3}>
                <Typography variant="body2" sx={{ color: textSecondary }}>Avg Completion Time</Typography>
                <Typography variant="h5" sx={{ color: textPrimary, fontWeight: 700 }}>
                  {stats.workflow.avgCompletionTimeHours 
                    ? `${Math.round(stats.workflow.avgCompletionTimeHours)}h`
                    : 'N/A'
                  }
                </Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="body2" sx={{ color: textSecondary }}>Jobs Completed (30d)</Typography>
                <Typography variant="h5" sx={{ color: '#22c55e', fontWeight: 700 }}>
                  {stats.workflow.completedJobs || 0}
                </Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="body2" sx={{ color: textSecondary }}>Active Companies</Typography>
                <Typography variant="h5" sx={{ color: textPrimary, fontWeight: 700 }}>
                  {stats.platform?.companies || 0}
                </Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="body2" sx={{ color: textSecondary }}>Documents</Typography>
                <Typography variant="h5" sx={{ color: textPrimary, fontWeight: 700 }}>
                  {stats.documents?.totalDocuments || 0}
                </Typography>
              </Grid>
            </Grid>
          </Paper>
        )}
      </Container>
    </Box>
  );
};

export default AdminJobsOverview;

