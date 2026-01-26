/**
 * Error Boundary Component
 * 
 * Catches React rendering errors and displays a user-friendly fallback.
 * Prevents the entire app from crashing due to component errors.
 */

import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { Box, Typography, Button, Paper, Alert } from '@mui/material';
import { Refresh, BugReport, Home } from '@mui/icons-material';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null 
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    
    // Log error for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // You could send this to an error tracking service here
    // e.g., Sentry, LogRocket, etc.
  }

  handleReload = () => {
    globalThis.location.reload();
  };

  handleGoHome = () => {
    globalThis.location.href = '/dashboard';
  };

  handleReportBug = () => {
    // Open feedback mechanism if available
    const feedbackButton = document.querySelector('[data-feedback-button]');
    if (feedbackButton) {
      feedbackButton.click();
    } else {
      // Fallback - copy error to clipboard
      const errorText = `Error: ${this.state.error?.message}\n\nStack: ${this.state.error?.stack}`;
      navigator.clipboard?.writeText(errorText);
      alert('Error details copied to clipboard. Please share with support.');
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <Box
          sx={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'background.default',
            p: 3
          }}
        >
          <Paper
            elevation={3}
            sx={{
              maxWidth: 500,
              p: 4,
              textAlign: 'center',
              borderRadius: 3
            }}
          >
            <Typography variant="h4" gutterBottom sx={{ color: 'error.main' }}>
              ⚠️ Something went wrong
            </Typography>
            
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              We're sorry, but something unexpected happened. Your data is safe - 
              try refreshing the page or going back to the dashboard.
            </Typography>

            <Alert severity="error" sx={{ mb: 3, textAlign: 'left' }}>
              <Typography variant="body2" component="pre" sx={{ 
                whiteSpace: 'pre-wrap', 
                wordBreak: 'break-word',
                fontSize: '0.75rem',
                maxHeight: 100,
                overflow: 'auto'
              }}>
                {this.state.error?.message || 'Unknown error'}
              </Typography>
            </Alert>

            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                startIcon={<Refresh />}
                onClick={this.handleReload}
              >
                Refresh Page
              </Button>
              
              <Button
                variant="outlined"
                startIcon={<Home />}
                onClick={this.handleGoHome}
              >
                Go to Dashboard
              </Button>
              
              <Button
                variant="text"
                startIcon={<BugReport />}
                onClick={this.handleReportBug}
                color="secondary"
              >
                Report Bug
              </Button>
            </Box>

            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3 }}>
              If this keeps happening, please contact support.
            </Typography>
          </Paper>
        </Box>
      );
    }

    return this.props.children;
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
};

export default ErrorBoundary;

