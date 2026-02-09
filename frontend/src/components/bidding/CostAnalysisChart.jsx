/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Cost Analysis Chart - Revenue Trend Visualization
 * 
 * Simple bar/line chart showing monthly revenue trends.
 * Uses pure CSS for visualization (no external charting library).
 */

import React from 'react';
import PropTypes from 'prop-types';
import { Box, Typography, Tooltip } from '@mui/material';

const COLORS = {
  bg: '#0a0a0f',
  surface: '#16161f',
  surfaceLight: '#1e1e2a',
  primary: '#00e676',
  primaryDark: '#00c853',
  secondary: '#7c4dff',
  text: '#ffffff',
  textSecondary: '#9e9e9e',
  border: '#333344',
};

// Format currency for tooltip
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(amount);
};

// Format month for display
const formatMonth = (monthStr) => {
  const [year, month] = monthStr.split('-');
  const date = new Date(year, parseInt(month) - 1);
  return date.toLocaleDateString('en-US', { month: 'short' });
};

const CostAnalysisChart = ({ data = [], height = 200 }) => {
  if (!data || data.length === 0) {
    return (
      <Box sx={{ 
        height, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        bgcolor: COLORS.surfaceLight,
        borderRadius: 2
      }}>
        <Typography variant="body2" sx={{ color: COLORS.textSecondary }}>
          No data available
        </Typography>
      </Box>
    );
  }

  // Calculate max value for scaling
  const maxAmount = Math.max(...data.map(d => d.amount));
  const chartHeight = height - 40; // Leave room for labels

  return (
    <Box sx={{ height, position: 'relative' }}>
      {/* Chart Area */}
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'flex-end', 
        height: chartHeight,
        gap: '2px',
        px: 1
      }}>
        {data.map((item, idx) => {
          const barHeight = maxAmount > 0 
            ? (item.amount / maxAmount) * (chartHeight - 20) 
            : 0;
          
          return (
            <Tooltip
              key={item.month}
              title={
                <Box>
                  <Typography variant="body2">{item.month}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {formatCurrency(item.amount)}
                  </Typography>
                  <Typography variant="caption">
                    {item.entries} entries
                  </Typography>
                </Box>
              }
              arrow
            >
              <Box
                sx={{
                  flex: 1,
                  minWidth: 20,
                  maxWidth: 60,
                  height: Math.max(barHeight, 4),
                  bgcolor: COLORS.primary,
                  borderRadius: '4px 4px 0 0',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer',
                  opacity: 0.8,
                  '&:hover': {
                    opacity: 1,
                    transform: 'scaleY(1.02)',
                    bgcolor: COLORS.primaryDark,
                  },
                  position: 'relative',
                }}
              >
                {/* Value label on hover - handled by tooltip */}
              </Box>
            </Tooltip>
          );
        })}
      </Box>

      {/* X-Axis Labels */}
      <Box sx={{ 
        display: 'flex', 
        gap: '2px',
        px: 1,
        mt: 1
      }}>
        {data.map((item, idx) => (
          <Box
            key={item.month}
            sx={{
              flex: 1,
              minWidth: 20,
              maxWidth: 60,
              textAlign: 'center',
            }}
          >
            <Typography 
              variant="caption" 
              sx={{ 
                color: COLORS.textSecondary,
                fontSize: '0.65rem'
              }}
            >
              {formatMonth(item.month)}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Y-Axis Reference Lines */}
      <Box sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: chartHeight,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        px: 1
      }}>
        {[0, 1, 2, 3].map((i) => (
          <Box
            key={i}
            sx={{
              borderBottom: `1px dashed ${COLORS.border}`,
              position: 'relative',
            }}
          >
            {i === 0 && (
              <Typography
                variant="caption"
                sx={{
                  position: 'absolute',
                  right: 0,
                  top: -10,
                  color: COLORS.textSecondary,
                  fontSize: '0.65rem',
                }}
              >
                {formatCurrency(maxAmount)}
              </Typography>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
};

CostAnalysisChart.propTypes = {
  data: PropTypes.arrayOf(PropTypes.shape({
    month: PropTypes.string.isRequired,
    amount: PropTypes.number.isRequired,
    entries: PropTypes.number,
  })),
  height: PropTypes.number,
};

export default CostAnalysisChart;

