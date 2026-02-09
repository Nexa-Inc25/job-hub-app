/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Bidding Dashboard - Executive Intelligence
 * 
 * Main dashboard for cost analytics and bidding intelligence.
 * Shows historical performance, trends, and top-performing items.
 * 
 * Features:
 * - Company-wide billing overview
 * - Monthly revenue trends
 * - Top items by volume
 * - T&M vs Unit Price breakdown
 */

import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  CircularProgress,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import ReceiptIcon from '@mui/icons-material/Receipt';
import BuildIcon from '@mui/icons-material/Build';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import api from '../../api';
import CostAnalysisChart from './CostAnalysisChart';
import { useAppColors } from '../shared/themeUtils';

// Format currency
const formatCurrency = (amount) => {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}K`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(amount);
};

// Metric Card Component
const MetricCard = ({ title, value, subtitle, icon: Icon, color }) => {
  const COLORS = useAppColors();
  const displayColor = color || COLORS.primary;
  
  return (
  <Card sx={{ bgcolor: COLORS.surface, height: '100%' }}>
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="body2" sx={{ color: COLORS.textSecondary, mb: 0.5 }}>
            {title}
          </Typography>
            <Typography variant="h4" sx={{ color: displayColor, fontWeight: 700 }}>
            {value}
          </Typography>
          {subtitle && (
            <Typography variant="caption" sx={{ color: COLORS.textSecondary }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        <Box sx={{ 
          bgcolor: COLORS.surfaceLight, 
          borderRadius: 2, 
          p: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
            <Icon sx={{ color: displayColor, fontSize: 28 }} />
        </Box>
      </Box>
    </CardContent>
  </Card>
);
};

MetricCard.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  subtitle: PropTypes.string,
  icon: PropTypes.elementType.isRequired,
  color: PropTypes.string,
};

const BiddingDashboard = () => {
  const COLORS = useAppColors();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState(365);
  const [analytics, setAnalytics] = useState(null);

  // Fetch analytics data
  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/api/bidding/analytics?dateRange=${dateRange}`);
      setAnalytics(response.data);
    } catch (err) {
      console.error('Error fetching analytics:', err);
      setError(err.response?.data?.error || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Calculate trend indicator
  const calculateTrend = () => {
    if (!analytics?.monthlyTrend || analytics.monthlyTrend.length < 2) return null;
    
    const recent = analytics.monthlyTrend.slice(-3);
    const older = analytics.monthlyTrend.slice(-6, -3);
    
    if (recent.length === 0 || older.length === 0) return null;
    
    const recentAvg = recent.reduce((sum, m) => sum + m.amount, 0) / recent.length;
    const olderAvg = older.reduce((sum, m) => sum + m.amount, 0) / older.length;
    
    const change = ((recentAvg - olderAvg) / olderAvg) * 100;
    return { change: Math.round(change), direction: change >= 0 ? 'up' : 'down' };
  };

  const trend = calculateTrend();

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
            Bidding Intelligence
          </Typography>
          <Typography variant="body2" sx={{ color: COLORS.textSecondary }}>
            Historical cost analysis & estimating insights
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel sx={{ color: COLORS.textSecondary }}>Period</InputLabel>
            <Select
              value={dateRange}
              label="Period"
              onChange={(e) => setDateRange(e.target.value)}
              sx={{ bgcolor: COLORS.surface, color: COLORS.text }}
            >
              <MenuItem value={90}>90 Days</MenuItem>
              <MenuItem value={180}>6 Months</MenuItem>
              <MenuItem value={365}>1 Year</MenuItem>
              <MenuItem value={730}>2 Years</MenuItem>
            </Select>
          </FormControl>
          <Button
            startIcon={<RefreshIcon />}
            onClick={fetchAnalytics}
            sx={{ color: COLORS.primary }}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {analytics && (
        <>
          {/* Key Metrics */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                title="Total Revenue"
                value={formatCurrency(analytics.combinedTotal)}
                subtitle={`Last ${dateRange} days`}
                icon={AttachMoneyIcon}
                color={COLORS.primary}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                title="Unit-Price Billing"
                value={formatCurrency(analytics.unitPriceBilling.totalAmount)}
                subtitle={`${analytics.unitPriceBilling.totalEntries} entries`}
                icon={ReceiptIcon}
                color={COLORS.secondary}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                title="T&M Billing"
                value={formatCurrency(analytics.timeAndMaterial.totalAmount)}
                subtitle={`${analytics.timeAndMaterial.totalTickets} tickets`}
                icon={BuildIcon}
                color={COLORS.warning}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ bgcolor: COLORS.surface, height: '100%' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="body2" sx={{ color: COLORS.textSecondary, mb: 0.5 }}>
                        T&M Ratio
                      </Typography>
                      <Typography variant="h4" sx={{ color: COLORS.text, fontWeight: 700 }}>
                        {analytics.tmRatio}%
                      </Typography>
                      <Typography variant="caption" sx={{ color: COLORS.textSecondary }}>
                        of total revenue
                      </Typography>
                    </Box>
                    <Box sx={{ 
                      bgcolor: COLORS.surfaceLight, 
                      borderRadius: 2, 
                      p: 1.5,
                      display: 'flex',
                      alignItems: 'center'
                    }}>
                      {trend && (
                        trend.direction === 'up' 
                          ? <TrendingUpIcon sx={{ color: COLORS.primary, fontSize: 28 }} />
                          : <TrendingDownIcon sx={{ color: COLORS.error, fontSize: 28 }} />
                      )}
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Monthly Trend Chart */}
          <Card sx={{ bgcolor: COLORS.surface, mb: 3 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6" sx={{ color: COLORS.text, fontWeight: 600 }}>
                  <ShowChartIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                  Revenue Trend
                </Typography>
                {trend && (
                  <Chip
                    icon={trend.direction === 'up' ? <TrendingUpIcon /> : <TrendingDownIcon />}
                    label={`${trend.direction === 'up' ? '+' : ''}${trend.change}% vs prior period`}
                    sx={{
                      bgcolor: trend.direction === 'up' ? COLORS.primary : COLORS.error,
                      color: COLORS.bg,
                    }}
                  />
                )}
              </Box>
              <CostAnalysisChart data={analytics.monthlyTrend} />
            </CardContent>
          </Card>

          {/* Top Items Table */}
          <Card sx={{ bgcolor: COLORS.surface }}>
            <CardContent>
              <Typography variant="h6" sx={{ color: COLORS.text, mb: 2, fontWeight: 600 }}>
                Top Items by Revenue
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ color: COLORS.textSecondary, borderColor: COLORS.border }}>
                        Item Code
                      </TableCell>
                      <TableCell sx={{ color: COLORS.textSecondary, borderColor: COLORS.border }} align="right">
                        Total Qty
                      </TableCell>
                      <TableCell sx={{ color: COLORS.textSecondary, borderColor: COLORS.border }} align="right">
                        Avg Price
                      </TableCell>
                      <TableCell sx={{ color: COLORS.textSecondary, borderColor: COLORS.border }} align="right">
                        Revenue
                      </TableCell>
                      <TableCell sx={{ color: COLORS.textSecondary, borderColor: COLORS.border }}>
                        % of Total
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {analytics.topItems.slice(0, 10).map((item, idx) => {
                      const percent = (item.totalAmount / analytics.unitPriceBilling.totalAmount) * 100;
                      return (
                        <TableRow key={item.itemCode} hover>
                          <TableCell sx={{ color: COLORS.text, borderColor: COLORS.border }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography 
                                variant="body2" 
                                sx={{ 
                                  bgcolor: COLORS.surfaceLight, 
                                  px: 1, 
                                  py: 0.5, 
                                  borderRadius: 1,
                                  fontFamily: 'monospace',
                                  fontSize: '0.8rem'
                                }}
                              >
                                #{idx + 1}
                              </Typography>
                              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                {item.itemCode}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell sx={{ color: COLORS.text, borderColor: COLORS.border }} align="right">
                            {item.totalQuantity.toLocaleString()}
                          </TableCell>
                          <TableCell sx={{ color: COLORS.text, borderColor: COLORS.border }} align="right">
                            ${item.avgUnitPrice.toFixed(2)}
                          </TableCell>
                          <TableCell sx={{ color: COLORS.primary, borderColor: COLORS.border, fontWeight: 600 }} align="right">
                            {formatCurrency(item.totalAmount)}
                          </TableCell>
                          <TableCell sx={{ borderColor: COLORS.border, width: 150 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <LinearProgress
                                variant="determinate"
                                value={Math.min(percent, 100)}
                                sx={{
                                  flex: 1,
                                  height: 8,
                                  borderRadius: 4,
                                  bgcolor: COLORS.surfaceLight,
                                  '& .MuiLinearProgress-bar': { 
                                    bgcolor: COLORS.primary,
                                    borderRadius: 4,
                                  }
                                }}
                              />
                              <Typography variant="caption" sx={{ color: COLORS.textSecondary, minWidth: 35 }}>
                                {percent.toFixed(1)}%
                              </Typography>
                            </Box>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>

          {/* T&M Breakdown */}
          {analytics.timeAndMaterial.totalAmount > 0 && (
            <Card sx={{ bgcolor: COLORS.surface, mt: 3 }}>
              <CardContent>
                <Typography variant="h6" sx={{ color: COLORS.text, mb: 2, fontWeight: 600 }}>
                  T&M Cost Breakdown
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={4}>
                    <Box sx={{ textAlign: 'center', p: 2, bgcolor: COLORS.surfaceLight, borderRadius: 2 }}>
                      <Typography variant="body2" sx={{ color: COLORS.textSecondary }}>
                        Labor
                      </Typography>
                      <Typography variant="h5" sx={{ color: COLORS.primary, fontWeight: 600 }}>
                        {formatCurrency(analytics.timeAndMaterial.laborTotal)}
                      </Typography>
                      <Typography variant="caption" sx={{ color: COLORS.textSecondary }}>
                        {Math.round((analytics.timeAndMaterial.laborTotal / analytics.timeAndMaterial.totalAmount) * 100)}%
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={4}>
                    <Box sx={{ textAlign: 'center', p: 2, bgcolor: COLORS.surfaceLight, borderRadius: 2 }}>
                      <Typography variant="body2" sx={{ color: COLORS.textSecondary }}>
                        Equipment
                      </Typography>
                      <Typography variant="h5" sx={{ color: COLORS.warning, fontWeight: 600 }}>
                        {formatCurrency(analytics.timeAndMaterial.equipmentTotal)}
                      </Typography>
                      <Typography variant="caption" sx={{ color: COLORS.textSecondary }}>
                        {Math.round((analytics.timeAndMaterial.equipmentTotal / analytics.timeAndMaterial.totalAmount) * 100)}%
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={4}>
                    <Box sx={{ textAlign: 'center', p: 2, bgcolor: COLORS.surfaceLight, borderRadius: 2 }}>
                      <Typography variant="body2" sx={{ color: COLORS.textSecondary }}>
                        Materials
                      </Typography>
                      <Typography variant="h5" sx={{ color: '#64b5f6', fontWeight: 600 }}>
                        {formatCurrency(analytics.timeAndMaterial.materialTotal)}
                      </Typography>
                      <Typography variant="caption" sx={{ color: COLORS.textSecondary }}>
                        {Math.round((analytics.timeAndMaterial.materialTotal / analytics.timeAndMaterial.totalAmount) * 100)}%
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </Box>
  );
};

export default BiddingDashboard;

