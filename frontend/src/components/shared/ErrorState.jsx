/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
// src/components/shared/ErrorState.js
// Shared full-page error display component

import React from 'react';
import PropTypes from 'prop-types';
import { Box, Alert, Button } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate } from 'react-router-dom';

const ErrorState = ({ 
  message, 
  bgcolor = 'background.default', 
  showBackButton = false, 
  backPath = '/',
  severity = 'error' 
}) => {
  const navigate = useNavigate();
  
  return (
    <Box sx={{ 
      minHeight: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center', 
      justifyContent: 'center', 
      bgcolor,
      p: 3,
      gap: 2
    }}>
      <Alert severity={severity}>{message}</Alert>
      {showBackButton && (
        <Button 
          startIcon={<ArrowBackIcon />} 
          onClick={() => navigate(backPath)}
          variant="outlined"
        >
          Go Back
        </Button>
      )}
    </Box>
  );
};

ErrorState.propTypes = {
  message: PropTypes.string.isRequired,
  bgcolor: PropTypes.string,
  showBackButton: PropTypes.bool,
  backPath: PropTypes.string,
  severity: PropTypes.oneOf(['error', 'warning', 'info', 'success']),
};

export default ErrorState;

