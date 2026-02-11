/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
// src/components/OwnerDashboard.js
// Admin-only dashboard for platform owners to monitor business health,
// user adoption, API costs, and system performance.

import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import {
  Container,
  Typography,
  Grid,
  Box,
  Paper,
  Divider,
  IconButton,
  Button,
  LinearProgress,
  Alert,
  AppBar,
  Toolbar,
  Tooltip,
  Chip,
  CircularProgress,
  Snackbar,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import WorkIcon from '@mui/icons-material/Work';
import SpeedIcon from '@mui/icons-material/Speed';
import MoneyIcon from '@mui/icons-material/AttachMoney';
import CheckIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import MemoryIcon from '@mui/icons-material/Memory';
import CloudIcon from '@mui/icons-material/Cloud';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import ScheduleIcon from '@mui/icons-material/Schedule';
import AIIcon from '@mui/icons-material/Psychology';
import BusinessIcon from '@mui/icons-material/Business';
import FeedbackIcon from '@mui/icons-material/Feedback';
import BugIcon from '@mui/icons-material/BugReport';
import FeatureIcon from '@mui/icons-material/Lightbulb';
import QuestionIcon from '@mui/icons-material/Help';
import { useThemeMode } from '../ThemeContext';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell as RechartsCell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { getThemeColors, CHART_COLORS, STATUS_COLORS, StatCard } from './shared';

// Extracted HealthIndicator component
const HealthIndicator = ({ status, label, textPrimary }) => {
  const isHealthy = status === 'connected' || status === 'configured' || status === true;
  
  const getStatusLabel = () => {
    if (typeof status === 'boolean') {
      return status ? 'OK' : 'Missing';
    }
    return status;
  };
  
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
      {isHealthy ? <CheckIcon sx={{ color: '#22c55e', fontSize: 20 }} /> : <ErrorIcon sx={{ color: '#ef4444', fontSize: 20 }} />}
      <Typography variant="body2" sx={{ color: textPrimary }}>{label}</Typography>
      <Chip 
        label={getStatusLabel()}
        size="small"
        sx={{ bgcolor: isHealthy ? '#22c55e20' : '#ef444420', color: isHealthy ? '#22c55e' : '#ef4444', fontWeight: 600, fontSize: '0.7rem' }}
      />
    </Box>
  );
};
HealthIndicator.propTypes = { status: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]), label: PropTypes.string, textPrimary: PropTypes.string };

// Status message map for feedback updates
const statusMessages = {
  'acknowledged': 'Feedback acknowledged! User will know you\'ve seen their report.',
  'in_progress': 'Marked as in progress.',
  'resolved': 'Marked as resolved!'
};

// Helper to validate super admin token
const validateSuperAdminToken = () => {
  const token = localStorage.getItem('token');
  if (!token) return { valid: false, redirect: true };
  
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return { valid: payload.isSuperAdmin === true, redirect: false };
  } catch {
    return { valid: false, redirect: true };
  }
};

// Helper to handle fetch errors
const handleFetchError = (err, navigate) => {
  console.error('Error fetching owner stats:', err);
  const status = err.response?.status;
  
  if (status === 403) {
    return 'Super Admin access required. This dashboard is only for FieldLedger platform owners.';
  }
  if (status === 401) {
    navigate('/login');
    return null;
  }
  return 'Failed to load dashboard data. Please try again.';
};

const OwnerDashboard = () => {
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);
  const [feedback, setFeedback] = useState([]);
  const [feedbackCounts, setFeedbackCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [updatingFeedback, setUpdatingFeedback] = useState(null);
  const navigate = useNavigate();
  const { darkMode } = useThemeMode();
  const mode = darkMode ? 'dark' : 'light';
  
  // Helper to get feedback item background color (avoids nested ternary)
  const getFeedbackBgColor = (status) => {
    if (status !== 'new') return 'transparent';
    return darkMode ? '#1a1a2e' : '#fefce8';
  };

  // Update feedback status
  const handleUpdateFeedbackStatus = async (feedbackId, newStatus) => {
    setUpdatingFeedback(feedbackId);
    try {
      await api.put(`/api/admin/feedback/${feedbackId}`, { status: newStatus });
      
      // Update local state
      setFeedback(prev => prev.map(item => 
        item._id === feedbackId ? { ...item, status: newStatus } : item
      ));
      
      // Update counts
      setFeedbackCounts(prev => {
        const oldItem = feedback.find(f => f._id === feedbackId);
        const oldStatus = oldItem?.status || 'new';
        return {
          ...prev,
          [oldStatus]: Math.max(0, (prev[oldStatus] || 1) - 1),
          [newStatus]: (prev[newStatus] || 0) + 1
        };
      });
      
      setSnackbar({ 
        open: true, 
        message: statusMessages[newStatus] || `Status updated to ${newStatus}`, 
        severity: 'success' 
      });
    } catch (err) {
      console.error('Update feedback error:', err);
      setSnackbar({ 
        open: true, 
        message: 'Failed to update feedback status', 
        severity: 'error' 
      });
    } finally {
      setUpdatingFeedback(null);
    }
  };

  // Handle token validation separately to reduce cognitive complexity
  const handleTokenValidation = useCallback(() => {
    const tokenCheck = validateSuperAdminToken();
    if (tokenCheck.redirect) {
      navigate('/login');
      return { shouldProceed: false };
    }
    if (!tokenCheck.valid) {
      setError('Super Admin access required. This dashboard is only for FieldLedger platform owners.');
      setLoading(false);
      return { shouldProceed: false };
    }
    return { shouldProceed: true };
  }, [navigate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    
    const { shouldProceed } = handleTokenValidation();
    if (!shouldProceed) return;

    try {
      const [statsRes, healthRes, feedbackRes] = await Promise.all([
        api.get('/api/admin/owner-stats'),
        api.get('/api/admin/system-health'),
        api.get('/api/admin/feedback?limit=20'),
      ]);

      setStats(statsRes.data);
      setHealth(healthRes.data);
      setFeedback(feedbackRes.data.feedback || []);
      setFeedbackCounts(feedbackRes.data.counts || {});
      setLastRefresh(new Date());
    } catch (err) {
      const errorMsg = handleFetchError(err, navigate);
      if (errorMsg) setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [navigate, handleTokenValidation]);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Theme-aware colors
  const { cardBg, textPrimary, textSecondary, borderColor, chartGridColor } = getThemeColors(mode);

  // Theme props to pass to extracted components
  const themeProps = { cardBg, textPrimary, textSecondary, borderColor, chartGridColor, mode };

  if (loading && !stats) {
    return (
      <Box sx={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        bgcolor: mode === 'dark' ? '#0f0f1a' : '#f8fafc'
      }}>
        <Box sx={{ textAlign: 'center' }}>
          <CircularProgress size={48} sx={{ color: '#6366f1', mb: 2 }} />
          <Typography variant="h6" sx={{ color: textPrimary }}>
            Loading Owner Dashboard...
          </Typography>
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        bgcolor: mode === 'dark' ? '#0f0f1a' : '#f8fafc',
        p: 3
      }}>
        <Alert severity="error" sx={{ maxWidth: 500 }}>
          {error}
        </Alert>
      </Box>
    );
  }

  // Prepare chart data
  const jobStatusData = stats?.jobs?.byStatus 
    ? Object.entries(stats.jobs.byStatus).map(([name, value]) => ({ name, value }))
    : [];

  const userRoleData = stats?.users?.byRole
    ? Object.entries(stats.users.byRole).map(([name, value]) => ({ name, value }))
    : [];

  const jobTrendData = stats?.jobs?.creationTrend || [];
  const userTrendData = stats?.users?.growthTrend || [];

  return (
    <Box sx={{ 
      minHeight: '100vh', 
      bgcolor: mode === 'dark' ? '#0f0f1a' : '#f1f5f9'
    }}>
      {/* Header */}
      <AppBar 
        position="sticky" 
        elevation={0}
        sx={{ 
          bgcolor: mode === 'dark' ? '#1e1e2e' : '#ffffff',
          borderBottom: `1px solid ${borderColor}`
        }}
      >
        <Toolbar>
          <IconButton 
            onClick={() => navigate('/dashboard')} 
            sx={{ mr: 2, color: textPrimary }}
            aria-label="Back to dashboard"
          >
            <ArrowBackIcon />
          </IconButton>
          <DashboardIcon sx={{ mr: 1.5, color: '#6366f1' }} />
          <Typography variant="h6" sx={{ flexGrow: 1, color: textPrimary, fontWeight: 700 }}>
            Owner Dashboard
          </Typography>
          <Button
            variant="contained"
            startIcon={<BusinessIcon />}
            onClick={() => navigate('/admin/onboarding')}
            sx={{ 
              bgcolor: '#22c55e', 
              '&:hover': { bgcolor: '#16a34a' },
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              mr: 2
            }}
          >
            Add Customer
          </Button>
          <Tooltip title="Refresh Data">
            <IconButton onClick={fetchData} disabled={loading} sx={{ color: textSecondary }} aria-label="Refresh data">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          {lastRefresh && (
            <Typography variant="caption" sx={{ color: textSecondary, ml: 1 }}>
              Updated: {lastRefresh.toLocaleTimeString()}
            </Typography>
          )}
        </Toolbar>
        {loading && <LinearProgress sx={{ height: 2 }} />}
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 4 }}>
        {/* Key Metrics Row */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard 
              title="Total Users"
              value={stats?.users?.total || 0}
              subtitle={`+${stats?.users?.newThisWeek || 0} this week`}
              icon={PeopleIcon}
              color="#6366f1"
              trend={stats?.users?.newThisMonth > 0 ? `+${stats?.users?.newThisMonth} this month` : null}
              onClick={() => navigate('/admin/users')}
              {...themeProps}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard 
              title="Total Jobs"
              value={stats?.jobs?.total || 0}
              subtitle={`${stats?.jobs?.today || 0} today`}
              icon={WorkIcon}
              color="#22c55e"
              trend={stats?.jobs?.thisWeek > 0 ? `+${stats?.jobs?.thisWeek} this week` : null}
              onClick={() => navigate('/admin/jobs-overview')}
              {...themeProps}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard 
              title="AI Extractions"
              value={stats?.aiExtraction?.totalJobsProcessed || 0}
              subtitle={`Avg ${Math.round(stats?.aiExtraction?.performance?.avgProcessingTimeMs / 1000 || 0)}s processing`}
              icon={AIIcon}
              color="#f59e0b"
              onClick={() => navigate('/admin/ai-costs')}
              {...themeProps}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard 
              title="API Cost (30d)"
              value={`$${stats?.apiUsage?.totalCostThisMonthDollars || '0.00'}`}
              subtitle={`${stats?.apiUsage?.openai?.totalCalls || 0} API calls`}
              icon={MoneyIcon}
              color="#ef4444"
              onClick={() => navigate('/admin/ai-costs')}
              {...themeProps}
            />
          </Grid>
        </Grid>

        {/* Charts Row */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {/* Job Creation Trend */}
          <Grid item xs={12} md={8}>
            <Paper sx={{ 
              p: 3, 
              bgcolor: cardBg, 
              border: `1px solid ${borderColor}`,
              borderRadius: 3
            }}>
              <Typography variant="h6" sx={{ color: textPrimary, mb: 3, fontWeight: 600 }}>
                Job Creation Trend (30 Days)
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={jobTrendData}>
                  <defs>
                    <linearGradient id="colorJobs" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                  <XAxis 
                    dataKey="date" 
                    stroke={textSecondary}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis stroke={textSecondary} tick={{ fontSize: 11 }} />
                  <RechartsTooltip 
                    contentStyle={{ 
                      backgroundColor: cardBg, 
                      border: `1px solid ${borderColor}`,
                      borderRadius: 8
                    }}
                    labelStyle={{ color: textPrimary }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="count" 
                    stroke="#6366f1" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorJobs)" 
                    name="Jobs Created"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>

          {/* Job Status Distribution */}
          <Grid item xs={12} md={4}>
            <Paper sx={{ 
              p: 3, 
              bgcolor: cardBg, 
              border: `1px solid ${borderColor}`,
              borderRadius: 3,
              height: '100%'
            }}>
              <Typography variant="h6" sx={{ color: textPrimary, mb: 3, fontWeight: 600 }}>
                Jobs by Status
              </Typography>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={jobStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={{ stroke: textSecondary }}
                  >
                    {jobStatusData.map((entry) => (
                      <RechartsCell 
                        key={entry.name} 
                        fill={STATUS_COLORS[entry.name] || '#64748b'} 
                      />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ 
                      backgroundColor: cardBg, 
                      border: `1px solid ${borderColor}`,
                      borderRadius: 8
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>
        </Grid>

        {/* Second Row - Users & AI */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {/* User Growth */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ 
              p: 3, 
              bgcolor: cardBg, 
              border: `1px solid ${borderColor}`,
              borderRadius: 3
            }}>
              <Typography variant="h6" sx={{ color: textPrimary, mb: 3, fontWeight: 600 }}>
                User Signups (30 Days)
              </Typography>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={userTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                  <XAxis 
                    dataKey="date" 
                    stroke={textSecondary}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis stroke={textSecondary} tick={{ fontSize: 11 }} />
                  <RechartsTooltip 
                    contentStyle={{ 
                      backgroundColor: cardBg, 
                      border: `1px solid ${borderColor}`,
                      borderRadius: 8
                    }}
                  />
                  <Bar dataKey="count" fill="#22c55e" radius={[4, 4, 0, 0]} name="New Users" />
                </BarChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>

          {/* Users by Role */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ 
              p: 3, 
              bgcolor: cardBg, 
              border: `1px solid ${borderColor}`,
              borderRadius: 3
            }}>
              <Typography variant="h6" sx={{ color: textPrimary, mb: 3, fontWeight: 600 }}>
                Users by Role
              </Typography>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={userRoleData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                  <XAxis type="number" stroke={textSecondary} tick={{ fontSize: 11 }} />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    stroke={textSecondary} 
                    tick={{ fontSize: 11 }}
                    width={80}
                  />
                  <RechartsTooltip 
                    contentStyle={{ 
                      backgroundColor: cardBg, 
                      border: `1px solid ${borderColor}`,
                      borderRadius: 8
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} name="Users">
                    {userRoleData.map((entry) => (
                      <RechartsCell key={entry.name} fill={CHART_COLORS[userRoleData.indexOf(entry) % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>
        </Grid>

        {/* System Health & Platform Stats */}
        <Grid container spacing={3}>
          {/* System Health */}
          <Grid item xs={12} md={4}>
            <Paper sx={{ 
              p: 3, 
              bgcolor: cardBg, 
              border: `1px solid ${borderColor}`,
              borderRadius: 3,
              height: '100%'
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <SpeedIcon sx={{ color: '#6366f1', mr: 1 }} />
                <Typography variant="h6" sx={{ color: textPrimary, fontWeight: 600 }}>
                  System Health
                </Typography>
              </Box>
              
              <HealthIndicator status={health?.database?.status} label="MongoDB" textPrimary={textPrimary} />
              <HealthIndicator status={health?.storage?.status} label="R2 Storage" textPrimary={textPrimary} />
              <HealthIndicator status={health?.environment?.hasOpenAIKey} label="OpenAI API Key" textPrimary={textPrimary} />
              <HealthIndicator status={health?.environment?.hasJwtSecret} label="JWT Secret" textPrimary={textPrimary} />
              
              <Divider sx={{ my: 2, borderColor }} />
              
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <MemoryIcon sx={{ color: '#f59e0b', fontSize: 20 }} />
                <Typography variant="body2" sx={{ color: textPrimary }}>
                  Memory: {health?.server?.memoryUsage?.heapUsed || 0} / {health?.server?.memoryUsage?.heapTotal || 0} MB
                </Typography>
              </Box>
              
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <ScheduleIcon sx={{ color: '#22c55e', fontSize: 20 }} />
                <Typography variant="body2" sx={{ color: textPrimary }}>
                  Uptime: {health?.server?.uptimeFormatted || 'N/A'}
                </Typography>
              </Box>
              
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CloudIcon sx={{ color: '#6366f1', fontSize: 20 }} />
                <Typography variant="body2" sx={{ color: textPrimary }}>
                  Node: {health?.server?.nodeVersion || 'N/A'}
                </Typography>
              </Box>
            </Paper>
          </Grid>

          {/* AI & Documents Stats */}
          <Grid item xs={12} md={4}>
            <Paper sx={{ 
              p: 3, 
              bgcolor: cardBg, 
              border: `1px solid ${borderColor}`,
              borderRadius: 3,
              height: '100%'
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <AIIcon sx={{ color: '#f59e0b', mr: 1 }} />
                <Typography variant="h6" sx={{ color: textPrimary, fontWeight: 600 }}>
                  AI & Documents
                </Typography>
              </Box>
              
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" sx={{ color: textSecondary, mb: 0.5 }}>
                  PDF Extractions Completed
                </Typography>
                <Typography variant="h5" sx={{ color: textPrimary, fontWeight: 700 }}>
                  {stats?.aiExtraction?.totalJobsProcessed || 0}
                </Typography>
              </Box>
              
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" sx={{ color: textSecondary, mb: 0.5 }}>
                  Avg Processing Time
                </Typography>
                <Typography variant="h5" sx={{ color: textPrimary, fontWeight: 700 }}>
                  {((stats?.aiExtraction?.performance?.avgProcessingTimeMs || 0) / 1000).toFixed(1)}s
                </Typography>
              </Box>
              
              <Divider sx={{ my: 2, borderColor }} />
              
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" sx={{ color: textSecondary, mb: 0.5 }}>
                  AI Training Records
                </Typography>
                <Typography variant="h5" sx={{ color: textPrimary, fontWeight: 700 }}>
                  {stats?.aiTraining?.totalRecords || 0}
                </Typography>
                <Typography variant="caption" sx={{ color: textSecondary }}>
                  {stats?.aiTraining?.completionRate || '0%'} complete
                </Typography>
              </Box>
              
              <Box>
                <Typography variant="body2" sx={{ color: textSecondary, mb: 0.5 }}>
                  Total Documents
                </Typography>
                <Typography variant="h5" sx={{ color: textPrimary, fontWeight: 700 }}>
                  {stats?.documents?.totalDocuments || 0}
                </Typography>
                <Typography variant="caption" sx={{ color: textSecondary }}>
                  {stats?.documents?.pendingDocuments || 0} pending approval
                </Typography>
              </Box>
            </Paper>
          </Grid>

          {/* Platform Overview */}
          <Grid item xs={12} md={4}>
            <Paper sx={{ 
              p: 3, 
              bgcolor: cardBg, 
              border: `1px solid ${borderColor}`,
              borderRadius: 3,
              height: '100%'
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <BusinessIcon sx={{ color: '#8b5cf6', mr: 1 }} />
                <Typography variant="h6" sx={{ color: textPrimary, fontWeight: 600 }}>
                  Platform Overview
                </Typography>
              </Box>
              
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" sx={{ color: textSecondary, mb: 0.5 }}>
                  Active Companies
                </Typography>
                <Typography variant="h5" sx={{ color: textPrimary, fontWeight: 700 }}>
                  {stats?.platform?.companies || 0}
                </Typography>
              </Box>
              
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" sx={{ color: textSecondary, mb: 0.5 }}>
                  Utilities Connected
                </Typography>
                <Typography variant="h5" sx={{ color: textPrimary, fontWeight: 700 }}>
                  {stats?.platform?.utilities || 0}
                </Typography>
              </Box>
              
              <Divider sx={{ my: 2, borderColor }} />
              
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" sx={{ color: textSecondary, mb: 0.5 }}>
                  Emergency Jobs
                </Typography>
                <Typography variant="h5" sx={{ color: '#ef4444', fontWeight: 700 }}>
                  {stats?.jobs?.emergency || 0}
                </Typography>
              </Box>
              
              <Box>
                <Typography variant="body2" sx={{ color: textSecondary, mb: 0.5 }}>
                  Workflow Efficiency
                </Typography>
                <Typography variant="h5" sx={{ color: textPrimary, fontWeight: 700 }}>
                  {stats?.workflow?.avgCompletionTimeHours 
                    ? `${Math.round(stats.workflow.avgCompletionTimeHours)}h avg`
                    : 'N/A'
                  }
                </Typography>
                <Typography variant="caption" sx={{ color: textSecondary }}>
                  {stats?.workflow?.completedJobs || 0} jobs completed (30d)
                </Typography>
              </Box>
            </Paper>
          </Grid>
        </Grid>

        {/* API Usage Details (if available) */}
        {stats?.apiUsage?.openai && (
          <Paper sx={{ 
            p: 3, 
            mt: 3,
            bgcolor: cardBg, 
            border: `1px solid ${borderColor}`,
            borderRadius: 3
          }}>
            <Typography variant="h6" sx={{ color: textPrimary, mb: 3, fontWeight: 600 }}>
              OpenAI API Usage Details
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={6} sm={3}>
                <Typography variant="body2" sx={{ color: textSecondary, mb: 0.5 }}>
                  Total Calls
                </Typography>
                <Typography variant="h5" sx={{ color: textPrimary, fontWeight: 700 }}>
                  {stats.apiUsage.openai.totalCalls || 0}
                </Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="body2" sx={{ color: textSecondary, mb: 0.5 }}>
                  Successful
                </Typography>
                <Typography variant="h5" sx={{ color: '#22c55e', fontWeight: 700 }}>
                  {stats.apiUsage.openai.successfulCalls || 0}
                </Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="body2" sx={{ color: textSecondary, mb: 0.5 }}>
                  Total Tokens
                </Typography>
                <Typography variant="h5" sx={{ color: textPrimary, fontWeight: 700 }}>
                  {(stats.apiUsage.openai.totalTokens || 0).toLocaleString()}
                </Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="body2" sx={{ color: textSecondary, mb: 0.5 }}>
                  Avg Response Time
                </Typography>
                <Typography variant="h5" sx={{ color: textPrimary, fontWeight: 700 }}>
                  {Math.round(stats.apiUsage.openai.avgResponseTimeMs || 0)}ms
                </Typography>
              </Grid>
            </Grid>
          </Paper>
        )}

        {/* Pilot Feedback Section */}
        <Paper sx={{ 
          p: 3, 
          mt: 3,
          bgcolor: cardBg, 
          border: `1px solid ${borderColor}`,
          borderRadius: 3
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <FeedbackIcon sx={{ color: '#f59e0b' }} />
              <Typography variant="h6" sx={{ color: textPrimary, fontWeight: 600 }}>
                Pilot Feedback
              </Typography>
              {feedbackCounts.new > 0 && (
                <Chip 
                  label={`${feedbackCounts.new} new`} 
                  size="small" 
                  color="error"
                  sx={{ fontWeight: 600 }}
                />
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Chip label={`Total: ${feedback.length}`} size="small" variant="outlined" />
            </Box>
          </Box>
          
          {feedback.length === 0 ? (
            <Typography variant="body2" sx={{ color: textSecondary, textAlign: 'center', py: 4 }}>
              No feedback submitted yet. The feedback button appears in the app header for all users.
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {feedback.map((item) => (
                <Paper 
                  key={item._id} 
                  variant="outlined" 
                  sx={{ 
                    p: 2, 
                    borderRadius: 2,
                    borderLeft: `4px solid ${
                      { bug: '#ef4444', feature_request: '#f59e0b', question: '#3b82f6' }[item.type] || '#6b7280'
                    }`,
                    bgcolor: getFeedbackBgColor(item.status)
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {item.type === 'bug' && <BugIcon sx={{ color: '#ef4444', fontSize: 20 }} />}
                      {item.type === 'feature_request' && <FeatureIcon sx={{ color: '#f59e0b', fontSize: 20 }} />}
                      {item.type === 'question' && <QuestionIcon sx={{ color: '#3b82f6', fontSize: 20 }} />}
                      <Typography variant="subtitle2" sx={{ color: textPrimary, fontWeight: 600 }}>
                        {item.subject}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Chip 
                        label={item.status} 
                        size="small" 
                        color={{ new: 'error', resolved: 'success' }[item.status] || 'default'}
                        sx={{ fontSize: '0.65rem', height: 20 }}
                      />
                      {item.priority === 'critical' && (
                        <Chip label="CRITICAL" size="small" color="error" sx={{ fontSize: '0.65rem', height: 20 }} />
                      )}
                      {item.priority === 'high' && (
                        <Chip label="HIGH" size="small" color="warning" sx={{ fontSize: '0.65rem', height: 20 }} />
                      )}
                    </Box>
                  </Box>
                  
                  <Typography variant="body2" sx={{ color: textSecondary, mb: 1.5, whiteSpace: 'pre-wrap' }}>
                    {item.description.length > 300 ? item.description.substring(0, 300) + '...' : item.description}
                  </Typography>
                  
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                    <Typography variant="caption" sx={{ color: textSecondary }}>
                      From: <strong>{item.userName || item.userEmail}</strong> ({item.userRole})
                      {item.currentPage && ` • Page: ${item.currentPage}`}
                      {' • '}{new Date(item.createdAt).toLocaleString()}
                    </Typography>
                    
                    {/* Action Buttons */}
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      {item.status === 'new' && (
                        <Button
                          size="small"
                          variant="outlined"
                          color="primary"
                          disabled={updatingFeedback === item._id}
                          onClick={() => handleUpdateFeedbackStatus(item._id, 'acknowledged')}
                          sx={{ fontSize: '0.7rem', py: 0.25, minWidth: 'auto' }}
                        >
                          {updatingFeedback === item._id ? '...' : 'Acknowledge'}
                        </Button>
                      )}
                      {(item.status === 'new' || item.status === 'acknowledged') && (
                        <Button
                          size="small"
                          variant="outlined"
                          color="info"
                          disabled={updatingFeedback === item._id}
                          onClick={() => handleUpdateFeedbackStatus(item._id, 'in_progress')}
                          sx={{ fontSize: '0.7rem', py: 0.25, minWidth: 'auto' }}
                        >
                          {updatingFeedback === item._id ? '...' : 'In Progress'}
                        </Button>
                      )}
                      {item.status !== 'resolved' && item.status !== 'closed' && (
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          disabled={updatingFeedback === item._id}
                          onClick={() => handleUpdateFeedbackStatus(item._id, 'resolved')}
                          sx={{ fontSize: '0.7rem', py: 0.25, minWidth: 'auto' }}
                        >
                          {updatingFeedback === item._id ? '...' : 'Resolved'}
                        </Button>
                      )}
                    </Box>
                  </Box>
                </Paper>
              ))}
            </Box>
          )}
        </Paper>
      </Container>
      
      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default OwnerDashboard;

