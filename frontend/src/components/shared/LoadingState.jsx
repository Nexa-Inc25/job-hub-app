/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
// src/components/shared/LoadingState.js
// Shared full-page loading spinner component

import React from 'react';
import PropTypes from 'prop-types';
import { Box, CircularProgress } from '@mui/material';

const LoadingState = ({ bgcolor = 'background.default', color = '#6366f1', size = 48 }) => {
  return (
    <Box sx={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      bgcolor 
    }}>
      <CircularProgress size={size} sx={{ color }} />
    </Box>
  );
};

LoadingState.propTypes = {
  bgcolor: PropTypes.string,
  color: PropTypes.string,
  size: PropTypes.number,
};

export default LoadingState;

