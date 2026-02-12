/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Billing Analytics Dashboard
 * 
 * Provides revenue insights and forecasting for PM/GF:
 * - Revenue by period (daily, weekly, monthly)
 * - Revenue by contractor tier (prime vs subs)
 * - Revenue by work category
 * - Pending vs approved vs paid pipeline
 * - DSO (Days Sales Outstanding) tracking
 * - Forecast projections
 * 
 * @module components/billing/BillingAnalytics
 */

import React, { useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  LinearProgress,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Alert,
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import MoneyIcon from '@mui/icons-material/AttachMoney';
import TimerIcon from '@mui/icons-material/Timer';
import WarningIcon from '@mui/icons-material/Warning';
import CheckIcon from '@mui/icons-material/CheckCircle';
import PendingIcon from '@mui/icons-material/HourglassEmpty';

// Period options
const PERIOD_OPTIONS = [
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last 90 Days' },
  { value: 'ytd', label: 'Year to Date' },
  { value: 'all', label: 'All Time' },
];

// Work categories
const WORK_CATEGORIES = {
  electrical: { label: 'Electrical', color: '#2196f3' },
  civil: { label: 'Civil', color: '#ff9800' },
  traffic_control: { label: 'Traffic Control', color: '#f44336' },
  vegetation: { label: 'Vegetation', color: '#4caf50' },
  inspection: { label: 'Inspection', color: '#9c27b0' },
  other: { label: 'Other', color: '#607d8b' },
};

// Status pipeline stages
const PIPELINE_STAGES = [
  { status: 'submitted', label: 'Submitted', color: '#2196f3' },
  { status: 'verified', label: 'Verified', color: '#ff9800' },
  { status: 'approved', label: 'Approved', color: '#4caf50' },
  { status: 'invoiced', label: 'Invoiced', color: '#9c27b0' },
  { status: 'paid', label: 'Paid', color: '#00c853' },
];

/**
 * Metric Card Component
 */
const MetricCard = ({ 
  title, 
  value, 
  subtitle, 
  trend, 
  trendLabel, 
  icon: Icon,
  color = 'primary.main',
  loading = false 
}) => (
  <Card sx={{ height: '100%' }}>
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {title}
          </Typography>
          {loading ? (
            <CircularProgress size={24} />
          ) : (
            <>
              <Typography variant="h4" sx={{ fontWeight: 700, color }}>
                {value}
              </Typography>
              {subtitle && (
                <Typography variant="caption" color="text.secondary">
                  {subtitle}
                </Typography>
              )}
            </>
          )}
        </Box>
        {Icon && (
          <Box sx={{ 
            bgcolor: `${color}15`, 
            borderRadius: 2, 
            p: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Icon sx={{ color, fontSize: 28 }} />
          </Box>
        )}
      </Box>
      
      {trend !== undefined && (
        <Box sx={{ display: 'flex', alignItems: 'center', mt: 1, gap: 0.5 }}>
          {trend >= 0 ? (
            <TrendingUpIcon sx={{ fontSize: 16, color: 'success.main' }} />
          ) : (
            <TrendingDownIcon sx={{ fontSize: 16, color: 'error.main' }} />
          )}
          <Typography 
            variant="caption" 
            sx={{ 
              color: trend >= 0 ? 'success.main' : 'error.main',
              fontWeight: 600,
            }}
          >
            {trend >= 0 ? '+' : ''}{trend}%
          </Typography>
          {trendLabel && (
            <Typography variant="caption" color="text.secondary">
              {trendLabel}
            </Typography>
          )}
        </Box>
      )}
    </CardContent>
  </Card>
);

MetricCard.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  trend: PropTypes.number,
  trendLabel: PropTypes.string,
  icon: PropTypes.elementType,
  color: PropTypes.string,
  loading: PropTypes.bool,
};

/**
 * Pipeline Visualization
 */
const PipelineVisualization = ({ data, loading }) => {
  const total = useMemo(() => 
    Object.values(data).reduce((sum, val) => sum + (val.amount || 0), 0),
    [data]
  );

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle1" gutterBottom fontWeight={600}>
        Revenue Pipeline
      </Typography>
      
      {loading ? (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <CircularProgress />
        </Box>
      ) : (
        <Box>
          {/* Pipeline bars */}
          <Box sx={{ display: 'flex', height: 48, borderRadius: 1, overflow: 'hidden', mb: 2 }}>
            {PIPELINE_STAGES.map((stage) => {
              const stageData = data[stage.status] || { amount: 0, count: 0 };
              const percentage = total > 0 ? (stageData.amount / total) * 100 : 0;
              
              return percentage > 0 ? (
                <Tooltip 
                  key={stage.status}
                  title={`${stage.label}: $${stageData.amount.toLocaleString()} (${stageData.count} units)`}
                >
                  <Box 
                    sx={{ 
                      width: `${percentage}%`,
                      bgcolor: stage.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      minWidth: percentage > 5 ? 'auto' : 0,
                    }}
                  >
                    {percentage > 10 && `${percentage.toFixed(0)}%`}
                  </Box>
                </Tooltip>
              ) : null;
            })}
          </Box>
          
          {/* Legend */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {PIPELINE_STAGES.map((stage) => {
              const stageData = data[stage.status] || { amount: 0, count: 0 };
              return (
                <Box key={stage.status} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: stage.color }} />
                  <Typography variant="caption">
                    {stage.label}: ${stageData.amount.toLocaleString()}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}
    </Paper>
  );
};

PipelineVisualization.propTypes = {
  data: PropTypes.object.isRequired,
  loading: PropTypes.bool,
};

/**
 * Tier Breakdown Table
 */
const TierBreakdown = ({ data, loading }) => {
  const tiers = useMemo(() => [
    { tier: 'prime', label: 'Prime Contractor', ...data.prime },
    { tier: 'sub', label: 'Subcontractors', ...data.sub },
    { tier: 'sub_of_sub', label: 'Sub of Sub', ...data.sub_of_sub },
  ], [data]);

  const total = useMemo(() => 
    tiers.reduce((sum, t) => sum + (t.amount || 0), 0),
    [tiers]
  );

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle1" gutterBottom fontWeight={600}>
        Revenue by Contractor Tier
      </Typography>
      
      {loading ? (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Tier</TableCell>
                <TableCell align="right">Units</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell align="right">% of Total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tiers.map((tier) => (
                <TableRow key={tier.tier}>
                  <TableCell>{tier.label}</TableCell>
                  <TableCell align="right">{tier.count || 0}</TableCell>
                  <TableCell align="right">${(tier.amount || 0).toLocaleString()}</TableCell>
                  <TableCell align="right">
                    {total > 0 ? ((tier.amount / total) * 100).toFixed(1) : 0}%
                  </TableCell>
                </TableRow>
              ))}
              <TableRow sx={{ '& td': { fontWeight: 700 } }}>
                <TableCell>Total</TableCell>
                <TableCell align="right">
                  {tiers.reduce((sum, t) => sum + (t.count || 0), 0)}
                </TableCell>
                <TableCell align="right">${total.toLocaleString()}</TableCell>
                <TableCell align="right">100%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
};

TierBreakdown.propTypes = {
  data: PropTypes.object.isRequired,
  loading: PropTypes.bool,
};

/**
 * Category Breakdown
 */
const CategoryBreakdown = ({ data, loading }) => {
  const sortedCategories = useMemo(() => 
    Object.entries(data)
      .map(([category, stats]) => ({
        category,
        ...WORK_CATEGORIES[category] || { label: category, color: '#607d8b' },
        ...stats,
      }))
      .sort((a, b) => (b.amount || 0) - (a.amount || 0)),
    [data]
  );

  const total = useMemo(() => 
    sortedCategories.reduce((sum, c) => sum + (c.amount || 0), 0),
    [sortedCategories]
  );

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle1" gutterBottom fontWeight={600}>
        Revenue by Work Category
      </Typography>
      
      {loading ? (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <CircularProgress />
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {sortedCategories.map((cat) => {
            const percentage = total > 0 ? (cat.amount / total) * 100 : 0;
            return (
              <Box key={cat.category}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2">{cat.label}</Typography>
                  <Typography variant="body2" fontWeight={600}>
                    ${(cat.amount || 0).toLocaleString()}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={percentage}
                  sx={{
                    height: 8,
                    borderRadius: 4,
                    bgcolor: 'action.hover',
                    '& .MuiLinearProgress-bar': {
                      bgcolor: cat.color,
                      borderRadius: 4,
                    },
                  }}
                />
              </Box>
            );
          })}
        </Box>
      )}
    </Paper>
  );
};

CategoryBreakdown.propTypes = {
  data: PropTypes.object.isRequired,
  loading: PropTypes.bool,
};

/**
 * DSO (Days Sales Outstanding) Card
 */
const DSOCard = ({ data, loading }) => {
  const dsoStatus = useMemo(() => {
    if (!data.averageDSO) return 'unknown';
    if (data.averageDSO <= 30) return 'good';
    if (data.averageDSO <= 45) return 'warning';
    return 'critical';
  }, [data.averageDSO]);

  const statusColors = {
    good: 'success.main',
    warning: 'warning.main',
    critical: 'error.main',
    unknown: 'text.secondary',
  };

  return (
    <Paper sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          Days Sales Outstanding
        </Typography>
        <TimerIcon color="action" />
      </Box>
      
      {loading ? (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Typography variant="h3" sx={{ color: statusColors[dsoStatus], fontWeight: 700 }}>
            {data.averageDSO || 0} days
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Average time from invoice to payment
          </Typography>
          
          <Divider sx={{ my: 2 }} />
          
          <Grid container spacing={2}>
            <Grid size={6}>
              <Typography variant="caption" color="text.secondary">
                Outstanding Invoices
              </Typography>
              <Typography variant="h6">
                ${(data.outstandingAmount || 0).toLocaleString()}
              </Typography>
            </Grid>
            <Grid size={6}>
              <Typography variant="caption" color="text.secondary">
                Overdue (30+ days)
              </Typography>
              <Typography variant="h6" color="error.main">
                ${(data.overdueAmount || 0).toLocaleString()}
              </Typography>
            </Grid>
          </Grid>
        </>
      )}
    </Paper>
  );
};

DSOCard.propTypes = {
  data: PropTypes.object.isRequired,
  loading: PropTypes.bool,
};

/**
 * Forecast Card
 */
const ForecastCard = ({ data, loading }) => {
  return (
    <Paper sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          30-Day Forecast
        </Typography>
        <TrendingUpIcon color="primary" />
      </Box>
      
      {loading ? (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Typography variant="h3" color="primary.main" sx={{ fontWeight: 700 }}>
            ${(data.forecastedRevenue || 0).toLocaleString()}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Projected revenue based on pipeline
          </Typography>
          
          <Divider sx={{ my: 2 }} />
          
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckIcon sx={{ fontSize: 16, color: 'success.main' }} />
                <Typography variant="body2">Approved (ready to invoice)</Typography>
              </Box>
              <Typography variant="body2" fontWeight={600}>
                ${(data.readyToInvoice || 0).toLocaleString()}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <PendingIcon sx={{ fontSize: 16, color: 'warning.main' }} />
                <Typography variant="body2">Pending approval</Typography>
              </Box>
              <Typography variant="body2" fontWeight={600}>
                ${(data.pendingApproval || 0).toLocaleString()}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <WarningIcon sx={{ fontSize: 16, color: 'error.main' }} />
                <Typography variant="body2">Disputed</Typography>
              </Box>
              <Typography variant="body2" fontWeight={600}>
                ${(data.disputed || 0).toLocaleString()}
              </Typography>
            </Box>
          </Box>
        </>
      )}
    </Paper>
  );
};

ForecastCard.propTypes = {
  data: PropTypes.object.isRequired,
  loading: PropTypes.bool,
};

/**
 * Main Billing Analytics Component
 */
const BillingAnalytics = ({ units = [], claims = [] }) => {
  const [period, setPeriod] = useState('30d');
  const [loading] = useState(false);
  const [error] = useState(null);

  // Calculate analytics from units and claims
  const analytics = useMemo(() => {
    // Filter units by period
    const now = new Date();
    const periodDays = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
      'ytd': Math.ceil((now - new Date(now.getFullYear(), 0, 1)) / (1000 * 60 * 60 * 24)),
      'all': Infinity,
    };
    const cutoff = new Date(now.getTime() - periodDays[period] * 24 * 60 * 60 * 1000);
    
    const filteredUnits = period === 'all' 
      ? units 
      : units.filter(u => new Date(u.workDate || u.createdAt) >= cutoff);

    // Total revenue
    const totalRevenue = filteredUnits.reduce((sum, u) => sum + (u.totalAmount || 0), 0);
    const unitCount = filteredUnits.length;

    // Pipeline by status
    const pipeline = {};
    PIPELINE_STAGES.forEach(stage => {
      const stageUnits = filteredUnits.filter(u => u.status === stage.status);
      pipeline[stage.status] = {
        count: stageUnits.length,
        amount: stageUnits.reduce((sum, u) => sum + (u.totalAmount || 0), 0),
      };
    });

    // By tier
    const byTier = {
      prime: { count: 0, amount: 0 },
      sub: { count: 0, amount: 0 },
      sub_of_sub: { count: 0, amount: 0 },
    };
    filteredUnits.forEach(u => {
      const tier = u.performedBy?.tier || 'prime';
      if (byTier[tier]) {
        byTier[tier].count++;
        byTier[tier].amount += u.totalAmount || 0;
      }
    });

    // By category
    const byCategory = {};
    filteredUnits.forEach(u => {
      const cat = u.performedBy?.workCategory || 'other';
      if (!byCategory[cat]) {
        byCategory[cat] = { count: 0, amount: 0 };
      }
      byCategory[cat].count++;
      byCategory[cat].amount += u.totalAmount || 0;
    });

    // DSO calculation
    const paidClaims = claims.filter(c => c.status === 'paid' && c.paidInFullAt);
    const avgDSO = paidClaims.length > 0
      ? paidClaims.reduce((sum, c) => {
          const invoiced = new Date(c.submittedAt || c.createdAt);
          const paid = new Date(c.paidInFullAt);
          return sum + Math.ceil((paid - invoiced) / (1000 * 60 * 60 * 24));
        }, 0) / paidClaims.length
      : 0;

    const outstandingClaims = claims.filter(c => 
      c.status === 'invoiced' || c.status === 'submitted'
    );
    const outstandingAmount = outstandingClaims.reduce((sum, c) => 
      sum + (c.amountDue || 0) - (c.totalPaid || 0), 0
    );

    const overdueAmount = outstandingClaims
      .filter(c => {
        const age = Math.ceil((now - new Date(c.submittedAt || c.createdAt)) / (1000 * 60 * 60 * 24));
        return age > 30;
      })
      .reduce((sum, c) => sum + (c.amountDue || 0) - (c.totalPaid || 0), 0);

    // Forecast
    const approvedAmount = filteredUnits
      .filter(u => u.status === 'approved')
      .reduce((sum, u) => sum + (u.totalAmount || 0), 0);
    
    const pendingAmount = filteredUnits
      .filter(u => ['submitted', 'verified'].includes(u.status))
      .reduce((sum, u) => sum + (u.totalAmount || 0), 0);
    
    const disputedAmount = filteredUnits
      .filter(u => u.status === 'disputed' || u.isDisputed)
      .reduce((sum, u) => sum + (u.totalAmount || 0), 0);

    // Trend calculation (compare to previous period)
    const prevCutoff = new Date(cutoff.getTime() - periodDays[period] * 24 * 60 * 60 * 1000);
    const prevUnits = period === 'all'
      ? []
      : units.filter(u => {
          const date = new Date(u.workDate || u.createdAt);
          return date >= prevCutoff && date < cutoff;
        });
    const prevRevenue = prevUnits.reduce((sum, u) => sum + (u.totalAmount || 0), 0);
    const trend = prevRevenue > 0 
      ? Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 100)
      : 0;

    return {
      totalRevenue,
      unitCount,
      trend,
      pipeline,
      byTier,
      byCategory,
      dso: {
        averageDSO: Math.round(avgDSO),
        outstandingAmount,
        overdueAmount,
      },
      forecast: {
        forecastedRevenue: approvedAmount + (pendingAmount * 0.8), // 80% of pending expected
        readyToInvoice: approvedAmount,
        pendingApproval: pendingAmount,
        disputed: disputedAmount,
      },
    };
  }, [units, claims, period]);

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>
          Billing Analytics
        </Typography>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Period</InputLabel>
          <Select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            label="Period"
          >
            {PERIOD_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Top Metrics */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Total Revenue"
            value={`$${analytics.totalRevenue.toLocaleString()}`}
            subtitle={`${analytics.unitCount} units`}
            trend={analytics.trend}
            trendLabel="vs prev period"
            icon={MoneyIcon}
            color="success.main"
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Pending Approval"
            value={`$${analytics.forecast.pendingApproval.toLocaleString()}`}
            subtitle="Awaiting review"
            icon={PendingIcon}
            color="warning.main"
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Ready to Invoice"
            value={`$${analytics.forecast.readyToInvoice.toLocaleString()}`}
            subtitle="Approved units"
            icon={CheckIcon}
            color="primary.main"
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Disputed"
            value={`$${analytics.forecast.disputed.toLocaleString()}`}
            subtitle="Needs resolution"
            icon={WarningIcon}
            color="error.main"
            loading={loading}
          />
        </Grid>
      </Grid>

      {/* Pipeline */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={12}>
          <PipelineVisualization data={analytics.pipeline} loading={loading} />
        </Grid>
      </Grid>

      {/* Detailed Breakdowns */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <TierBreakdown data={analytics.byTier} loading={loading} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <CategoryBreakdown data={analytics.byCategory} loading={loading} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <DSOCard data={analytics.dso} loading={loading} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <ForecastCard data={analytics.forecast} loading={loading} />
        </Grid>
      </Grid>
    </Box>
  );
};

BillingAnalytics.propTypes = {
  units: PropTypes.array,
  claims: PropTypes.array,
};

export default BillingAnalytics;

