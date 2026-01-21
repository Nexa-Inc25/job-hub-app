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
      const token = localStorage.getItem('token');
      await api.post('/api/jobs/emergency', { woNumber }, { headers: { Authorization: `Bearer ${token}` } });
      navigate('/dashboard');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Box sx={{ p: 4, bgcolor: 'background.paper', borderRadius: 2, boxShadow: 3 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Create Emergency Work Order</Typography>
      <form onSubmit={handleSubmit}>
        <TextField
          label="WO Number"
          value={woNumber}
          onChange={e => setWoNumber(e.target.value)}
          fullWidth
          margin="normal"
        />
        <Button type="submit" variant="contained" color="primary">Submit</Button>
      </form>
    </Box>
  );
}

export default EmergencyWO;