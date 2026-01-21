// src/components/CreateWorkOrder.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import {
  Box,
  Container,
  Typography,
  TextField,
  Button,
  Paper,
  Grid,
  Alert,
  CircularProgress,
  AppBar,
  Toolbar,
  IconButton,
  Tooltip,
  MenuItem,
  Divider,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  CloudUpload as CloudUploadIcon,
  Save as SaveIcon,
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
} from '@mui/icons-material';
import { useThemeMode } from '../ThemeContext';

const CreateWorkOrder = ({ token }) => {
  const navigate = useNavigate();
  const { darkMode, toggleDarkMode } = useThemeMode();
  const [file, setFile] = useState(null);
  const [woNumber, setWoNumber] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [client, setClient] = useState('');
  const [pmNumber, setPmNumber] = useState('');
  const [notificationNumber, setNotificationNumber] = useState('');
  const [projectName, setProjectName] = useState('');
  const [orderType, setOrderType] = useState('');
  const [division, setDivision] = useState('DA');
  const [matCode, setMatCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [localToken, setLocalToken] = useState(token || '');

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken && !localToken) {
      setLocalToken(storedToken);
    }
  }, [localToken]);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a PDF file');
      return;
    }
    if (!localToken) {
      setError('Authentication required - please log in');
      return;
    }

    setLoading(true);
    setError('');

    const jobFormData = new FormData();
    jobFormData.append('pdf', file);
    jobFormData.append('woNumber', woNumber);
    jobFormData.append('pmNumber', pmNumber);
    jobFormData.append('notificationNumber', notificationNumber);
    jobFormData.append('address', address);
    jobFormData.append('city', city);
    jobFormData.append('client', client);
    jobFormData.append('projectName', projectName);
    jobFormData.append('orderType', orderType);
    jobFormData.append('division', division);
    jobFormData.append('matCode', matCode);

    try {
      const jobRes = await api.post('/api/jobs', jobFormData, {
        headers: { Authorization: `Bearer ${localToken}` }
      });
      console.log('Job created:', jobRes.data);
      setSuccess(true);
      
      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.msg || 'Server error - check backend logs');
      console.error('Job creation error:', err);
    } finally {
      setLoading(false);
    }
  };

  const divisions = [
    { value: 'DA', label: 'DA - De Anza' },
    { value: 'SF', label: 'SF - San Francisco' },
    { value: 'SJ', label: 'SJ - San Jose' },
    { value: 'EB', label: 'EB - East Bay' },
    { value: 'PN', label: 'PN - Peninsula' },
    { value: 'SC', label: 'SC - Santa Cruz' },
    { value: 'FR', label: 'FR - Fresno' },
    { value: 'ST', label: 'ST - Stockton' },
  ];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" elevation={0}>
        <Toolbar>
          <Tooltip title="Back to Dashboard">
            <IconButton color="inherit" onClick={() => navigate('/dashboard')} sx={{ mr: 2 }}>
              <ArrowBackIcon />
            </IconButton>
          </Tooltip>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
            Create Work Order
          </Typography>
          <Tooltip title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
            <IconButton color="inherit" onClick={toggleDarkMode}>
              {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ py: 4 }}>
        <Paper sx={{ p: 4, borderRadius: 3 }}>
          <Typography variant="h5" fontWeight={600} sx={{ mb: 3 }}>
            New Work Order
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 3 }}>Work order created successfully! Redirecting...</Alert>}

          <form onSubmit={handleSubmit}>
            {/* File Upload */}
            <Paper 
              variant="outlined" 
              sx={{ 
                p: 3, 
                mb: 3, 
                textAlign: 'center',
                borderStyle: 'dashed',
                borderColor: file ? 'success.main' : 'divider',
                bgcolor: file ? 'success.light' : 'transparent',
                cursor: 'pointer',
                '&:hover': { borderColor: 'primary.main' }
              }}
              onClick={() => document.getElementById('file-input').click()}
            >
              <input
                id="file-input"
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
                <Box>
                <CloudUploadIcon sx={{ fontSize: 48, color: file ? 'success.main' : 'text.secondary', mb: 1 }} />
                <Typography variant="h6" color={file ? 'success.main' : 'text.secondary'}>
                  {file ? file.name : 'Upload Job Package (PDF)'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {file ? 'Click to change file' : 'Click or drag to upload'}
                </Typography>
              </Box>
            </Paper>

            <Divider sx={{ my: 3 }} />

            {/* Form Fields */}
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  id="pmNumber"
                  name="pmNumber"
                  fullWidth
                  label="PM Number"
                  value={pmNumber}
                  onChange={(e) => setPmNumber(e.target.value)}
                  placeholder="e.g., 35611981"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  id="notificationNumber"
                  name="notificationNumber"
                  fullWidth
                  label="Notification Number"
                  value={notificationNumber}
                  onChange={(e) => setNotificationNumber(e.target.value)}
                  placeholder="e.g., 126940062"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  id="woNumber"
                  name="woNumber"
                  fullWidth
                  label="WO Number"
                  value={woNumber}
                  onChange={(e) => setWoNumber(e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  id="orderType"
                  name="orderType"
                  fullWidth
                  label="Order Type"
                  value={orderType}
                  onChange={(e) => setOrderType(e.target.value)}
                  placeholder="e.g., E460"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  id="address"
                  name="address"
                  fullWidth
                  label="Address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  id="city"
                  name="city"
                  fullWidth
                  label="City"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  id="client"
                  name="client"
                  fullWidth
                  label="Client"
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  id="projectName"
                  name="projectName"
                  fullWidth
                  label="Project Name"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  id="division"
                  name="division"
                  fullWidth
                  select
                  label="Division"
                  value={division}
                  onChange={(e) => setDivision(e.target.value)}
                >
                  {divisions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  id="matCode"
                  name="matCode"
                  fullWidth
                  label="MAT Code"
                  value={matCode}
                  onChange={(e) => setMatCode(e.target.value.toUpperCase())}
                  placeholder="e.g., 2AA"
                />
              </Grid>
            </Grid>

            {/* Submit Button */}
            <Box sx={{ mt: 4, display: 'flex', gap: 2 }}>
              <Button
                variant="outlined"
                onClick={() => navigate('/dashboard')}
                sx={{ flex: 1 }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={loading || !file}
                startIcon={loading ? <CircularProgress size={20} /> : <SaveIcon />}
                sx={{ flex: 2 }}
              >
                {loading ? 'Creating...' : 'Create Work Order'}
              </Button>
            </Box>
          </form>
        </Paper>
      </Container>
    </Box>
  );
};

export default CreateWorkOrder;
