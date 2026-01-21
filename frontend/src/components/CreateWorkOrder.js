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
  const [extracting, setExtracting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [localToken, setLocalToken] = useState(token || '');

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken && !localToken) {
      setLocalToken(storedToken);
    }
  }, [localToken]);

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    if (!selectedFile) return;

    if (!localToken) {
      setError('Authentication required - please log in to use AI PDF extraction');
      return;
    }

    // Verify token is still valid
    try {
      await api.get('/api/jobs', {
        headers: { Authorization: `Bearer ${localToken}` }
      });
    } catch (tokenErr) {
      if (tokenErr.response?.status === 401) {
        setError('Your session has expired - please log in again');
        localStorage.removeItem('token');
        setLocalToken('');
        return;
      }
    }

    // Upload to AI extraction endpoint
    const formData = new FormData();
    formData.append('pdf', selectedFile);

    try {
      setExtracting(true);
      setError('');
      console.log('Starting AI extraction...');
      const response = await api.post('/api/ai/extract', formData, {
        headers: {
          Authorization: `Bearer ${localToken}`,
        },
      });
      console.log('AI extraction successful:', response.data);

      const extractedData = response.data.extractedInfo || response.data.extractedData;
      const structured = response.data.structured;

      let extractedWO = '';
      let extractedAddr = '';
      let extractedClient = '';
      let extractedPm = '';
      let extractedNotification = '';
      let extractedCity = '';
      let extractedProjectName = '';
      let extractedOrderType = '';

      if (structured) {
        extractedWO = structured.woNumber || '';
        extractedAddr = structured.address || '';
        extractedClient = structured.client || '';
        extractedPm = structured.pmNumber || '';
        extractedNotification = structured.notificationNumber || '';
        if (structured.city) extractedCity = structured.city;
        if (structured.projectName) extractedProjectName = structured.projectName;
        if (structured.orderType) extractedOrderType = structured.orderType;
      } else if (typeof extractedData === 'string') {
        const text = extractedData.toLowerCase();
        const woMatch = text.match(/(?:wo|work order)[:\s#-]*([a-z0-9-]+)/i);
        if (woMatch) extractedWO = woMatch[1];
        const addrMatch = text.match(/(?:address|location)[:\s]*([^\n]+)/i);
        if (addrMatch) extractedAddr = addrMatch[1].trim();
        const clientMatch = text.match(/(?:client|customer|company)[:\s]*([^\n]+)/i);
        if (clientMatch) extractedClient = clientMatch[1].trim();
        const pmMatch = text.match(/(?:pm|pm number|pm#)[:\s#-]*([a-z0-9-]+)/i);
        if (pmMatch) extractedPm = pmMatch[1];
        const notifMatch = text.match(/(?:notification|notif)[:\s#-]*(\d+)/i);
        if (notifMatch) extractedNotification = notifMatch[1];
        const cityMatch = text.match(/(?:city)[:\s-]*([^\n,]+)/i);
        if (cityMatch) extractedCity = cityMatch[1].trim();
        const projectMatch = text.match(/(?:project name|project)[:\s-]*([^\n]+)/i);
        if (projectMatch) extractedProjectName = projectMatch[1].trim();
        const orderTypeMatch = text.match(/(?:order type)[:\s-]*([a-z0-9-]+)/i);
        if (orderTypeMatch) extractedOrderType = orderTypeMatch[1];
      }

      setWoNumber(extractedWO || '');
      setPmNumber(extractedPm || '');
      setNotificationNumber(extractedNotification || '');
      setAddress(extractedAddr || '');
      setClient(extractedClient || '');
      setCity(extractedCity || '');
      setProjectName(extractedProjectName || '');
      setOrderType(extractedOrderType || '');

    } catch (err) {
      console.error('Extraction error:', err);
      if (err.response?.status === 401) {
        setError('Authentication required - please log in');
      } else {
        setError('AI extraction failed - you can fill in the form manually');
      }
    } finally {
      setExtracting(false);
    }
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
              {extracting ? (
                <Box>
                  <CircularProgress size={40} sx={{ mb: 1 }} />
                  <Typography>Processing file...</Typography>
                </Box>
              ) : (
                <Box>
                  <CloudUploadIcon sx={{ fontSize: 48, color: file ? 'success.main' : 'text.secondary', mb: 1 }} />
                  <Typography variant="h6" color={file ? 'success.main' : 'text.secondary'}>
                    {file ? file.name : 'Upload Job Package (PDF)'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {file ? 'Click to change file' : 'Click or drag to upload'}
                  </Typography>
                </Box>
              )}
            </Paper>

            <Divider sx={{ my: 3 }} />

            {/* Form Fields */}
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="PM Number"
                  value={pmNumber}
                  onChange={(e) => setPmNumber(e.target.value)}
                  placeholder="e.g., 35611981"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Notification Number"
                  value={notificationNumber}
                  onChange={(e) => setNotificationNumber(e.target.value)}
                  placeholder="e.g., 126940062"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="WO Number"
                  value={woNumber}
                  onChange={(e) => setWoNumber(e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Order Type"
                  value={orderType}
                  onChange={(e) => setOrderType(e.target.value)}
                  placeholder="e.g., E460"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="City"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Client"
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Project Name"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
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
