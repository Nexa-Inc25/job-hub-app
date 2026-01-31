// src/components/shared/StatCard.js
// Reusable stat card component for admin dashboards

import React from 'react';
import PropTypes from 'prop-types';
import { Box, Card, CardContent, Typography } from '@mui/material';

const StatCard = ({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  color = '#6366f1', 
  cardBg, 
  textPrimary, 
  textSecondary, 
  borderColor,
  height = '100%',
  onClick,
  trend,
  mode
}) => (
  <Card 
    onClick={onClick}
    sx={{ 
      bgcolor: cardBg, 
      border: `1px solid ${borderColor}`, 
      borderRadius: 3, 
      height,
      cursor: onClick ? 'pointer' : 'default',
      transition: 'transform 0.2s, box-shadow 0.2s',
      '&:hover': {
        transform: onClick ? 'translateY(-4px)' : 'translateY(-2px)',
        boxShadow: mode === 'dark' ? '0 8px 25px rgba(0,0,0,0.4)' : '0 8px 25px rgba(0,0,0,0.1)',
        borderColor: onClick ? color : borderColor,
      }
    }}
  >
    <CardContent>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="body2" sx={{ color: textSecondary, mb: 0.5, fontWeight: 500 }}>{title}</Typography>
          <Typography variant="h4" component="p" sx={{ color: textPrimary, fontWeight: 700, mb: 0.5 }}>{value}</Typography>
          {subtitle && <Typography variant="caption" sx={{ color: textSecondary }}>{subtitle}</Typography>}
          {trend && <Typography variant="caption" sx={{ color: textSecondary, display: 'block' }}>{trend}</Typography>}
        </Box>
        <Box sx={{ bgcolor: `${color}20`, borderRadius: 2, p: 1.5 }}>
          <Icon sx={{ color, fontSize: 28 }} />
        </Box>
      </Box>
    </CardContent>
  </Card>
);

StatCard.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.node.isRequired,
  subtitle: PropTypes.string,
  icon: PropTypes.elementType.isRequired,
  color: PropTypes.string,
  cardBg: PropTypes.string.isRequired,
  textPrimary: PropTypes.string.isRequired,
  textSecondary: PropTypes.string.isRequired,
  borderColor: PropTypes.string.isRequired,
  height: PropTypes.string,
  onClick: PropTypes.func,
  trend: PropTypes.node,
  mode: PropTypes.string,
};

export default StatCard;

