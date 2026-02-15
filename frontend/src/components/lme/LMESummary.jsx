/**
 * LMESummary - Grand total display for LME form
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 */

import React from 'react';
import PropTypes from 'prop-types';
import { Box, Typography, Paper } from '@mui/material';

const LMESummary = ({ laborTotal, materialTotal, equipmentTotal }) => {
  const grandTotal = laborTotal + materialTotal + equipmentTotal;

  return (
    <Paper sx={{ mx: 2, mb: 2, p: 2, bgcolor: 'primary.main', color: 'white' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" fontWeight="bold">GRAND TOTAL</Typography>
        <Typography variant="h4" fontWeight="bold">${grandTotal.toFixed(2)}</Typography>
      </Box>
    </Paper>
  );
};

LMESummary.propTypes = {
  laborTotal: PropTypes.number.isRequired,
  materialTotal: PropTypes.number.isRequired,
  equipmentTotal: PropTypes.number.isRequired,
};

export default LMESummary;
