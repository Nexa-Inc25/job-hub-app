// src/components/AdminAICosts.js
// Detailed view of AI/API usage and costs

import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';
import {
  Container,
  Typography,
  Box,
  Paper,
  Grid,
} from '@mui/material';
import MoneyIcon from '@mui/icons-material/AttachMoney';
import AIIcon from '@mui/icons-material/Psychology';
import SpeedIcon from '@mui/icons-material/Speed';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import CheckIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { useThemeMode } from '../ThemeContext';
import { getThemeColors } from './shared/themeUtils';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import { StatCard, LoadingState, ErrorState, AdminPageHeader } from './shared';

const AdminAICosts = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { mode } = useThemeMode();
  const { cardBg, textPrimary, textSecondary, borderColor, chartGridColor, pageBg } = getThemeColors(mode);

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
        setError('Failed to load API usage data');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return <LoadingState bgcolor={pageBg} />;
  }

  if (error) {
    return <ErrorState message={error} bgcolor={pageBg} />;
  }

  // Theme props to pass to StatCard
  const themeProps = { cardBg, textPrimary, textSecondary, borderColor };

  const dailyCosts = stats?.apiUsage?.dailyCosts || [];
  const openaiStats = stats?.apiUsage?.openai;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: pageBg }}>
      <AdminPageHeader
        title="AI & API Costs"
        icon={MoneyIcon}
        iconColor="#ef4444"
        chipLabel={`$${stats?.apiUsage?.totalCostThisMonthDollars || '0.00'} this month`}
        chipColor="#ef4444"
        cardBg={cardBg}
        textPrimary={textPrimary}
        borderColor={borderColor}
      />

      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Cost Summary */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={6} sm={3}>
            <StatCard 
              title="Total Cost (30d)" 
              value={`$${stats?.apiUsage?.totalCostThisMonthDollars || '0.00'}`}
              icon={MoneyIcon} 
              color="#ef4444" 
              {...themeProps}
            />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatCard 
              title="AI Extractions" 
              value={stats?.aiExtraction?.totalJobsProcessed || 0}
              icon={AIIcon} 
              color="#f59e0b" 
              {...themeProps}
            />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatCard 
              title="Avg Processing" 
              value={`${((stats?.aiExtraction?.performance?.avgProcessingTimeMs || 0) / 1000).toFixed(1)}s`}
              icon={SpeedIcon} 
              color="#6366f1" 
              {...themeProps}
            />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatCard 
              title="API Calls" 
              value={openaiStats?.totalCalls || 0}
              subtitle={openaiStats ? `${openaiStats.successfulCalls || 0} successful` : ''}
              icon={TrendingUpIcon} 
              color="#22c55e" 
              {...themeProps}
            />
          </Grid>
        </Grid>

        {/* OpenAI Details */}
        {openaiStats && (
          <Paper sx={{ p: 3, mb: 3, bgcolor: cardBg, border: `1px solid ${borderColor}`, borderRadius: 3 }}>
            <Typography variant="h6" sx={{ color: textPrimary, mb: 3, fontWeight: 600 }}>
              OpenAI Usage Details
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={6} sm={2}>
                <Typography variant="body2" sx={{ color: textSecondary }}>Total Calls</Typography>
                <Typography variant="h5" sx={{ color: textPrimary, fontWeight: 700 }}>
                  {openaiStats.totalCalls || 0}
                </Typography>
              </Grid>
              <Grid item xs={6} sm={2}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <CheckIcon sx={{ color: '#22c55e', fontSize: 16 }} />
                  <Typography variant="body2" sx={{ color: textSecondary }}>Successful</Typography>
                </Box>
                <Typography variant="h5" sx={{ color: '#22c55e', fontWeight: 700 }}>
                  {openaiStats.successfulCalls || 0}
                </Typography>
              </Grid>
              <Grid item xs={6} sm={2}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <ErrorIcon sx={{ color: '#ef4444', fontSize: 16 }} />
                  <Typography variant="body2" sx={{ color: textSecondary }}>Failed</Typography>
                </Box>
                <Typography variant="h5" sx={{ color: '#ef4444', fontWeight: 700 }}>
                  {openaiStats.failedCalls || 0}
                </Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="body2" sx={{ color: textSecondary }}>Total Tokens</Typography>
                <Typography variant="h5" sx={{ color: textPrimary, fontWeight: 700 }}>
                  {(openaiStats.totalTokens || 0).toLocaleString()}
                </Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="body2" sx={{ color: textSecondary }}>Avg Response Time</Typography>
                <Typography variant="h5" sx={{ color: textPrimary, fontWeight: 700 }}>
                  {Math.round(openaiStats.avgResponseTimeMs || 0)}ms
                </Typography>
              </Grid>
            </Grid>
          </Paper>
        )}

        {/* AI Training Data */}
        <Paper sx={{ p: 3, mb: 3, bgcolor: cardBg, border: `1px solid ${borderColor}`, borderRadius: 3 }}>
          <Typography variant="h6" sx={{ color: textPrimary, mb: 3, fontWeight: 600 }}>
            AI Training Data
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={4}>
              <Typography variant="body2" sx={{ color: textSecondary }}>Total Records</Typography>
              <Typography variant="h4" component="p" sx={{ color: textPrimary, fontWeight: 700 }}>
                {stats?.aiTraining?.totalRecords || 0}
              </Typography>
            </Grid>
            <Grid item xs={4}>
              <Typography variant="body2" sx={{ color: textSecondary }}>Complete</Typography>
              <Typography variant="h4" component="p" sx={{ color: '#22c55e', fontWeight: 700 }}>
                {stats?.aiTraining?.completeRecords || 0}
              </Typography>
            </Grid>
            <Grid item xs={4}>
              <Typography variant="body2" sx={{ color: textSecondary }}>Completion Rate</Typography>
              <Typography variant="h4" component="p" sx={{ color: '#6366f1', fontWeight: 700 }}>
                {stats?.aiTraining?.completionRate || '0%'}
              </Typography>
            </Grid>
          </Grid>
        </Paper>

        {/* Daily Cost Chart */}
        {dailyCosts.length > 0 && (
          <Paper sx={{ p: 3, bgcolor: cardBg, border: `1px solid ${borderColor}`, borderRadius: 3 }}>
            <Typography variant="h6" sx={{ color: textPrimary, mb: 2, fontWeight: 600 }}>
              Daily API Costs (Last 30 Days)
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={dailyCosts}>
                <defs>
                  <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                <XAxis 
                  dataKey="date" 
                  stroke={textSecondary}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                />
                <YAxis 
                  stroke={textSecondary}
                  tickFormatter={(value) => `$${(value / 100).toFixed(2)}`}
                />
                <RechartsTooltip 
                  contentStyle={{ bgcolor: cardBg, border: `1px solid ${borderColor}`, borderRadius: 8 }}
                  formatter={(value) => [`$${(value / 100).toFixed(2)}`, 'Cost']}
                  labelFormatter={(value) => new Date(value).toLocaleDateString()}
                />
                <Area 
                  type="monotone" 
                  dataKey="costCents" 
                  stroke="#ef4444" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorCost)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </Paper>
        )}

        {/* No Data Message */}
        {!openaiStats && dailyCosts.length === 0 && (
          <Paper sx={{ p: 6, bgcolor: cardBg, border: `1px solid ${borderColor}`, borderRadius: 3, textAlign: 'center' }}>
            <AIIcon sx={{ fontSize: 64, color: textSecondary, mb: 2 }} />
            <Typography variant="h6" sx={{ color: textSecondary, mb: 1 }}>
              No API usage data yet
            </Typography>
            <Typography variant="body2" sx={{ color: textSecondary }}>
              API usage will be tracked here as users upload PDFs for AI extraction.
            </Typography>
          </Paper>
        )}
      </Container>
    </Box>
  );
};

export default AdminAICosts;

