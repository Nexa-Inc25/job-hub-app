import React, { useState } from 'react';
import api from '../api';
import { useNavigate, Link } from 'react-router-dom';
import {
  Box,
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  IconButton,
  Tooltip,
  InputAdornment,
} from '@mui/material';
import {
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
  Visibility,
  VisibilityOff,
  PersonAdd as PersonAddIcon,
} from '@mui/icons-material';
import { useThemeMode } from '../ThemeContext';

const Signup = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { darkMode, toggleDarkMode } = useThemeMode();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await api.post('/api/signup', { email, password });
      localStorage.setItem('token', response.data.token);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Theme Toggle */}
      <Box sx={{ position: 'absolute', top: 16, right: 16 }}>
        <Tooltip title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
          <IconButton onClick={toggleDarkMode} color="primary">
            {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>
        </Tooltip>
      </Box>

      <Container maxWidth="sm" sx={{ flex: 1, display: 'flex', alignItems: 'center', py: 4 }}>
        <Paper
          elevation={0}
          sx={{
            p: 5,
            width: '100%',
            borderRadius: 3,
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Typography variant="h4" fontWeight={700} gutterBottom>
              JobHub
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Work Order Management System
            </Typography>
          </Box>

          <Typography variant="h5" fontWeight={600} sx={{ mb: 3 }}>
            Create Account
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              sx={{ mb: 2 }}
              autoComplete="email"
            />
            <TextField
              fullWidth
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              sx={{ mb: 2 }}
              autoComplete="new-password"
              helperText="Must be at least 6 characters"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              fullWidth
              label="Confirm Password"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              sx={{ mb: 3 }}
              autoComplete="new-password"
              error={confirmPassword && password !== confirmPassword}
              helperText={confirmPassword && password !== confirmPassword ? 'Passwords do not match' : ''}
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={loading}
              startIcon={<PersonAddIcon />}
              sx={{ mb: 2, py: 1.5 }}
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </Button>
          </form>

          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'inherit', fontWeight: 600 }}>
              Sign In
            </Link>
          </Typography>
        </Paper>
      </Container>
    </Box>
  );
};

export default Signup;
