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
  color, 
  cardBg, 
  textPrimary, 
  textSecondary, 
  borderColor,
  height = '100%',
  onClick
}) => (
  <Card 
    onClick={onClick}
    sx={{ 
      bgcolor: cardBg, 
      border: `1px solid ${borderColor}`, 
      borderRadius: 2, 
      height,
      cursor: onClick ? 'pointer' : 'default',
      transition: 'transform 0.2s, box-shadow 0.2s',
      '&:hover': onClick ? { transform: 'translateY(-2px)', boxShadow: 4 } : {}
    }}
  >
    <CardContent>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="body2" sx={{ color: textSecondary, mb: 0.5 }}>{title}</Typography>
          <Typography variant="h4" component="p" sx={{ color: textPrimary, fontWeight: 700 }}>{value}</Typography>
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
  title: PropTypes.string.isRequired,
  value: PropTypes.node.isRequired,
  subtitle: PropTypes.string,
  icon: PropTypes.elementType.isRequired,
  color: PropTypes.string.isRequired,
  cardBg: PropTypes.string.isRequired,
  textPrimary: PropTypes.string.isRequired,
  textSecondary: PropTypes.string.isRequired,
  borderColor: PropTypes.string.isRequired,
  height: PropTypes.string,
  onClick: PropTypes.func,
};

export default StatCard;

