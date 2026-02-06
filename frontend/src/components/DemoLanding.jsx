/**
 * FieldLedger - Demo Landing Page
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Provides a welcoming landing page for demo users.
 * Starts a new demo session and auto-logs in the user.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import TimerIcon from '@mui/icons-material/Timer';
import FolderIcon from '@mui/icons-material/Folder';
import DescriptionIcon from '@mui/icons-material/Description';
import GroupsIcon from '@mui/icons-material/Groups';
import OfflineBoltIcon from '@mui/icons-material/OfflineBolt';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import api from '../api';

// Features to highlight
const DEMO_FEATURES = [
  {
    icon: <DescriptionIcon />,
    title: 'Smart Job Package Upload',
    description: 'AI extracts PM#, address, and scope from PDFs automatically'
  },
  {
    icon: <AutoFixHighIcon />,
    title: 'SmartForms Auto-Fill',
    description: 'Map utility forms once, batch-fill with job data instantly'
  },
  {
    icon: <GroupsIcon />,
    title: 'Crew Closeout',
    description: 'Mobile-friendly document completion and photo capture'
  },
  {
    icon: <FolderIcon />,
    title: 'File Organization',
    description: 'Automatic folder structure keeps everything organized'
  },
  {
    icon: <OfflineBoltIcon />,
    title: 'Offline Ready',
    description: 'Works without internet, syncs when connected'
  },
];

const DemoLanding = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [demoInfo, setDemoInfo] = useState(null);

  // Fetch demo info on mount
  useEffect(() => {
    const fetchDemoInfo = async () => {
      try {
        const response = await api.get('/api/demo/info');
        setDemoInfo(response.data);
      } catch {
        // Demo might not be enabled
        setDemoInfo({ enabled: false });
      }
    };
    fetchDemoInfo();
  }, []);

  const handleStartDemo = async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await api.post('/api/demo/start-session');
      
      if (response.data.success) {
        // Store the demo token
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('isAdmin', 'true');
        localStorage.setItem('isDemo', 'true');
        localStorage.setItem('demoSessionId', response.data.sessionId);
        localStorage.setItem('demoExpiresAt', response.data.expiresAt);
        
        // Navigate to dashboard
        navigate('/dashboard');
      } else {
        setError(response.data.error || 'Failed to start demo');
      }
    } catch (err) {
      console.error('Demo start error:', err);
      setError(
        err.response?.data?.message || 
        err.response?.data?.error || 
        'Failed to start demo. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Show loading while fetching demo info
  if (demoInfo === null) {
    return (
      <Box sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default'
      }}>
        <CircularProgress />
      </Box>
    );
  }

  // Demo not enabled
  if (!demoInfo.enabled) {
    return (
      <Box sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 3
      }}>
        <Card sx={{ maxWidth: 500, textAlign: 'center' }}>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h4" gutterBottom fontWeight={700}>
              Demo Currently Unavailable
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              The demo environment is not currently available.
              Please contact sales for a personalized demo.
            </Typography>
            <Button
              variant="outlined"
              onClick={() => navigate('/login')}
            >
              Back to Login
            </Button>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box sx={{
      minHeight: '100vh',
      bgcolor: 'background.default',
      py: 6,
      px: 3
    }}>
      <Box sx={{ maxWidth: 800, mx: 'auto' }}>
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Typography 
            variant="h2" 
            fontWeight={800}
            sx={{ 
              mb: 2,
              background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Try FieldLedger
          </Typography>
          <Typography variant="h5" color="text.secondary" sx={{ mb: 3 }}>
            The complete field operations platform for utility contractors
          </Typography>
          <Chip 
            icon={<TimerIcon />}
            label={`${demoInfo.sessionDurationHours || 2} Hour Demo Session`}
            color="primary"
            variant="outlined"
          />
        </Box>

        {/* Error Alert */}
        {error && (
          <Alert severity="error" sx={{ mb: 4 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {/* Features Card */}
        <Card sx={{ mb: 4 }}>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 3 }}>
              What You&apos;ll Explore
            </Typography>
            <List disablePadding>
              {DEMO_FEATURES.map((feature, index) => (
                <ListItem key={index} sx={{ px: 0, py: 1.5 }}>
                  <ListItemIcon sx={{ color: 'primary.main', minWidth: 44 }}>
                    {feature.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Typography fontWeight={600}>
                        {feature.title}
                      </Typography>
                    }
                    secondary={feature.description}
                  />
                  <CheckCircleIcon sx={{ color: 'success.main', fontSize: 20 }} />
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>

        {/* Sample Data Card */}
        <Card sx={{ mb: 4 }}>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
              Pre-loaded Sample Data
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Your demo environment includes:
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              <Chip label="5 Sample Jobs" variant="outlined" size="small" />
              <Chip label="Various Statuses" variant="outlined" size="small" />
              <Chip label="LME Entries" variant="outlined" size="small" />
              <Chip label="Folder Structure" variant="outlined" size="small" />
              <Chip label="Demo Company" variant="outlined" size="small" />
            </Box>
          </CardContent>
        </Card>

        {/* Restrictions Notice */}
        <Card sx={{ mb: 4, bgcolor: 'warning.50', borderColor: 'warning.main' }}>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="body2" color="text.secondary">
              <strong>Demo Limitations:</strong> Data resets when your session expires. 
              Emails/SMS are disabled. Exported PDFs are watermarked as DEMO.
            </Typography>
          </CardContent>
        </Card>

        {/* Start Demo Button */}
        <Box sx={{ textAlign: 'center' }}>
          <Button
            variant="contained"
            size="large"
            onClick={handleStartDemo}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
            sx={{ 
              py: 2, 
              px: 6, 
              fontSize: '1.1rem',
              fontWeight: 600,
              mb: 2,
            }}
          >
            {loading ? 'Starting Demo...' : 'Start Demo'}
          </Button>
          <Typography variant="body2" color="text.secondary">
            No account required. Your sandbox will be ready in seconds.
          </Typography>
          <Box sx={{ mt: 3 }}>
            <Button
              variant="text"
              onClick={() => navigate('/login')}
              sx={{ color: 'text.secondary' }}
            >
              Already have an account? Sign In
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default DemoLanding;

