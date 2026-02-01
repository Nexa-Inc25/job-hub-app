// src/components/shared/AuthLayout.js
// Shared layout wrapper for Login and Signup pages

import React from 'react';
import PropTypes from 'prop-types';
import { Box, Container, Paper, Typography } from '@mui/material';
import ThemeToggle from './ThemeToggle';
import { useThemeMode } from '../../ThemeContext';

const AuthLayout = ({ children, title }) => {
  const { darkMode, toggleDarkMode } = useThemeMode();

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <ThemeToggle darkMode={darkMode} onToggle={toggleDarkMode} />

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
            <Typography variant="h4" component="h1" fontWeight={700} gutterBottom>
              FieldLedger
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Work Order Management System
            </Typography>
          </Box>

          <Typography variant="h5" fontWeight={600} sx={{ mb: 3 }}>
            {title}
          </Typography>

          {children}
        </Paper>
      </Container>
    </Box>
  );
};

AuthLayout.propTypes = {
  children: PropTypes.node.isRequired,
  title: PropTypes.string.isRequired,
};

export default AuthLayout;

