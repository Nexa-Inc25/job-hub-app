// src/components/CreateWorkOrder.js
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
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
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import SaveIcon from '@mui/icons-material/Save';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
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
  const [jobScope, setJobScope] = useState(null);  // Scope extracted from Face Sheet
  const [preFieldLabels, setPreFieldLabels] = useState(null);  // Pre-field crew labels
  const [ecTag, setEcTag] = useState(null);  // EC Tag info
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [localToken, setLocalToken] = useState(token || '');

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken && !localToken) {
      setLocalToken(storedToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  const [extracting, setExtracting] = useState(false);
  
  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    setError('');
    
    // Trigger AI extraction to autofill form fields (non-blocking)
    if (selectedFile && localToken) {
      setExtracting(true);
      // Don't await - let it run in background
      // api module automatically adds Authorization header
      const formData = new FormData();
      formData.append('pdf', selectedFile);
      
      // AI extraction needs a longer timeout (3 minutes) for large PDFs
      api.post('/api/ai/extract', formData, { 
        timeout: 180000 // 3 minute timeout for AI processing
      }).then(response => {
        if (response.data.success && response.data.structured) {
          const data = response.data.structured;
          // Apply extracted data to form fields
          const fieldSetters = {
            pmNumber: setPmNumber,
            woNumber: setWoNumber,
            notificationNumber: setNotificationNumber,
            matCode: setMatCode,
            address: setAddress,
            city: setCity,
            client: setClient,
            projectName: setProjectName,
            orderType: setOrderType,
          };
          Object.entries(fieldSetters).forEach(([key, setter]) => {
            if (data[key]) setter(data[key]);
          });
          // Store job scope from Face Sheet
          if (data.jobScope) {
            setJobScope(data.jobScope);
          }
          // Store pre-field labels for crew planning
          if (data.preFieldLabels) {
            setPreFieldLabels(data.preFieldLabels);
          }
          // Store EC tag info
          if (data.ecTag) {
            setEcTag(data.ecTag);
          }
        }
      }).catch(err => {
        // AI extraction is optional - user can fill fields manually
        // Only log for debugging, don't show error to user
        if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
          console.warn('AI extraction timed out - user can fill fields manually');
        } else {
          console.warn('AI extraction failed:', err.message);
        }
      }).finally(() => {
        setExtracting(false);
      });
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
    // Include job scope extracted from Face Sheet
    if (jobScope) {
      jobFormData.append('jobScope', JSON.stringify(jobScope));
    }
    // Include pre-field labels for crew planning
    if (preFieldLabels) {
      jobFormData.append('preFieldLabels', JSON.stringify(preFieldLabels));
    }
    // Include EC tag info
    if (ecTag) {
      jobFormData.append('ecTag', JSON.stringify(ecTag));
    }
    // Skip AI text extraction since we already did it on file select
    jobFormData.append('skipAiExtract', 'true');

    try {
      // api module automatically adds Authorization header
      const jobRes = await api.post('/api/jobs', jobFormData);
      console.log('Job created:', jobRes.data);
      setSuccess(true);
      
      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.msg || 'Server error - check backend logs');
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
                borderColor: file ? '#16a34a' : 'divider',
                bgcolor: file ? 'rgba(22, 163, 74, 0.1)' : 'transparent',
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
                <CloudUploadIcon sx={{ fontSize: 48, color: file ? '#16a34a' : 'text.secondary', mb: 1 }} />
                <Typography variant="h6" color={file ? '#16a34a' : 'text.secondary'}>
                  {file ? file.name : 'Upload Job Package (PDF)'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {(() => {
                    if (extracting) return 'Extracting job details...';
                    return file ? 'Click to change file' : 'Click or drag to upload';
                  })()}
                </Typography>
                {extracting && <CircularProgress size={20} sx={{ mt: 1 }} />}
              </Box>
            </Paper>

            <Divider sx={{ my: 3 }} />

            {/* Job Scope Preview (if extracted from Face Sheet) */}
            {jobScope?.summary && (
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  mb: 3,
                  bgcolor: 'rgba(59, 130, 246, 0.08)',
                  borderColor: '#3b82f6',
                  borderRadius: 2
                }}
              >
                <Typography variant="subtitle2" sx={{ color: '#1e40af', fontWeight: 700, mb: 1 }}>
                  📋 Job Scope (from Face Sheet)
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.primary', mb: 1 }}>
                  {jobScope.summary}
                </Typography>
                {(jobScope.workType || jobScope.footage || jobScope.voltage) && (
                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 1 }}>
                    {jobScope.workType && (
                      <Typography variant="caption" sx={{ bgcolor: 'rgba(255,255,255,0.9)', px: 1, py: 0.5, borderRadius: 1 }}>
                        <strong>Work:</strong> {jobScope.workType}
                      </Typography>
                    )}
                    {jobScope.footage && (
                      <Typography variant="caption" sx={{ bgcolor: 'rgba(255,255,255,0.9)', px: 1, py: 0.5, borderRadius: 1 }}>
                        <strong>Footage:</strong> {jobScope.footage}
                      </Typography>
                    )}
                    {jobScope.voltage && (
                      <Typography variant="caption" sx={{ bgcolor: 'rgba(255,255,255,0.9)', px: 1, py: 0.5, borderRadius: 1 }}>
                        <strong>Voltage:</strong> {jobScope.voltage}
                      </Typography>
                    )}
                    {jobScope.phases && (
                      <Typography variant="caption" sx={{ bgcolor: 'rgba(255,255,255,0.9)', px: 1, py: 0.5, borderRadius: 1 }}>
                        <strong>Phases:</strong> {jobScope.phases}
                      </Typography>
                    )}
                  </Box>
                )}
                {jobScope.equipment?.length > 0 && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      <strong>Equipment:</strong> {jobScope.equipment.join(', ')}
                    </Typography>
                  </Box>
                )}
              </Paper>
            )}

            {/* Form Fields */}
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  id="pmNumber"
                  name="pmNumber"
                  autoComplete="off"
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
                  autoComplete="off"
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
                  autoComplete="off"
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
                  autoComplete="off"
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
                  autoComplete="street-address"
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
                  autoComplete="address-level2"
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
                  autoComplete="organization"
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
                  autoComplete="off"
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
                  autoComplete="off"
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
                  autoComplete="off"
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

CreateWorkOrder.propTypes = {
  token: PropTypes.string,
};

export default CreateWorkOrder;
