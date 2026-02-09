/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { Box, TextField, Button, Typography } from '@mui/material';

function EmergencyWO() {
  const [woNumber, setWoNumber] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // api module automatically adds Authorization header
      await api.post('/api/jobs/emergency', { woNumber });
      navigate('/dashboard');
    } catch (err) {
      console.error('Emergency WO creation failed:', err);
      alert('Failed to create emergency work order. Please try again.');
    }
  };

  return (
    <Box sx={{ p: 4, bgcolor: 'background.paper', borderRadius: 2, boxShadow: 3 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Create Emergency Work Order</Typography>
      <form onSubmit={handleSubmit}>
        <TextField
          id="emergency-wo-number"
          name="woNumber"
          label="WO Number"
          value={woNumber}
          onChange={e => setWoNumber(e.target.value)}
          fullWidth
          margin="normal"
          autoComplete="off"
          required
        />
        <Button type="submit" variant="contained" color="primary">Submit</Button>
      </form>
    </Box>
  );
}

export default EmergencyWO;