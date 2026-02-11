/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
// src/components/FeedbackButton.js
// In-app feedback system for pilot users to report issues
// Critical for pilot success - provides immediate issue reporting

import React, { useState } from 'react';
import PropTypes from 'prop-types';
import {
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Alert,
  Tooltip,
  Chip,
} from '@mui/material';
import FeedbackIcon from '@mui/icons-material/Feedback';
import BugIcon from '@mui/icons-material/BugReport';
import FeatureIcon from '@mui/icons-material/Lightbulb';
import QuestionIcon from '@mui/icons-material/Help';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';
import api from '../api';

const FeedbackButton = ({ variant = 'icon', color = 'inherit', jobId = null }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    type: 'bug',
    priority: 'medium',
    subject: '',
    description: '',
  });

  const handleOpen = () => {
    setOpen(true);
    setSuccess(false);
    setError('');
  };

  const handleClose = () => {
    if (!loading) {
      setOpen(false);
      // Reset form after close animation
      setTimeout(() => {
        setFormData({
          type: 'bug',
          priority: 'medium',
          subject: '',
          description: '',
        });
        setSuccess(false);
        setError('');
      }, 200);
    }
  };

  const handleSubmit = async () => {
    // Validate
    if (!formData.subject.trim()) {
      setError('Please enter a subject');
      return;
    }
    if (!formData.description.trim()) {
      setError('Please describe the issue or suggestion');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await api.post('/api/feedback', {
        ...formData,
        currentPage: globalThis.location.pathname,
        screenSize: `${globalThis.innerWidth}x${globalThis.innerHeight}`,
        jobId: jobId || null,
      });

      setSuccess(true);
      // Auto-close after success
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err) {
      console.error('Feedback submission error:', err);
      setError(err.response?.data?.error || 'Failed to submit feedback. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const typeOptions = [
    { value: 'bug', label: 'Bug Report', icon: <BugIcon fontSize="small" />, color: 'error' },
    { value: 'feature_request', label: 'Feature Request', icon: <FeatureIcon fontSize="small" />, color: 'warning' },
    { value: 'question', label: 'Question', icon: <QuestionIcon fontSize="small" />, color: 'info' },
    { value: 'other', label: 'Other', icon: <FeedbackIcon fontSize="small" />, color: 'default' },
  ];

  const priorityOptions = [
    { value: 'low', label: 'Low', color: 'success' },
    { value: 'medium', label: 'Medium', color: 'warning' },
    { value: 'high', label: 'High', color: 'error' },
    { value: 'critical', label: 'Critical - Blocking Work', color: 'error' },
  ];

  return (
    <>
      {/* Trigger Button */}
      {variant === 'icon' ? (
        <Tooltip title="Report Issue / Feedback">
          <IconButton 
            color={color} 
            onClick={handleOpen} 
            aria-label="Report issue or feedback"
            sx={{ 
              minWidth: 48, 
              minHeight: 48,
              // Ensure adequate touch target spacing
              margin: '4px'
            }}
          >
            <FeedbackIcon />
          </IconButton>
        </Tooltip>
      ) : (
        <Button
          variant="outlined"
          color={color === 'inherit' ? 'primary' : color}
          startIcon={<FeedbackIcon />}
          onClick={handleOpen}
          size="small"
        >
          Feedback
        </Button>
      )}

      {/* Feedback Dialog */}
      <Dialog 
        open={open} 
        onClose={handleClose} 
        maxWidth="sm"
        disableRestoreFocus
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 2 } } }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <FeedbackIcon color="primary" />
              <Typography variant="h6">Send Feedback</Typography>
            </Box>
            <IconButton size="small" onClick={handleClose} disabled={loading} aria-label="Close feedback">
              <CloseIcon />
            </IconButton>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Help us improve FieldLedger! Report bugs or suggest features.
          </Typography>
        </DialogTitle>

        <DialogContent>
          {success ? (
            <Alert severity="success" sx={{ mt: 1 }}>
              <Typography variant="subtitle1" fontWeight="bold">
                Thank you for your feedback!
              </Typography>
              <Typography variant="body2">
                Our team will review it shortly. Critical issues will be addressed within 24 hours.
              </Typography>
            </Alert>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              {error && (
                <Alert severity="error" onClose={() => setError('')}>
                  {error}
                </Alert>
              )}

              {/* Type Selection - Visual Chips */}
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  What type of feedback?
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {typeOptions.map((opt) => (
                    <Chip
                      key={opt.value}
                      icon={opt.icon}
                      label={opt.label}
                      color={formData.type === opt.value ? opt.color : 'default'}
                      variant={formData.type === opt.value ? 'filled' : 'outlined'}
                      onClick={() => setFormData({ ...formData, type: opt.value })}
                      sx={{ cursor: 'pointer' }}
                    />
                  ))}
                </Box>
              </Box>

              {/* Priority - only show for bugs */}
              {formData.type === 'bug' && (
                <FormControl fullWidth size="small">
                  <InputLabel>Priority</InputLabel>
                  <Select
                    id="feedback-priority"
                    name="priority"
                    value={formData.priority}
                    label="Priority"
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  >
                    {priorityOptions.map((opt) => (
                      <MenuItem key={opt.value} value={opt.value}>
                        <Chip 
                          size="small" 
                          label={opt.label} 
                          color={opt.color}
                          sx={{ mr: 1 }}
                        />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              {/* Subject */}
              <TextField
                label="Subject"
                placeholder={(() => {
                  if (formData.type === 'bug') return "Brief description of the issue";
                  if (formData.type === 'feature_request') return "What feature would help you?";
                  return "How can we help?";
                })()}
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                fullWidth
                required
                inputProps={{ maxLength: 200 }}
                helperText={`${formData.subject.length}/200`}
              />

              {/* Description */}
              <TextField
                label="Description"
                placeholder={(() => {
                  if (formData.type === 'bug') return "What happened? What were you trying to do? Include any error messages.";
                  if (formData.type === 'feature_request') return "Describe the feature and how it would help your work.";
                  return "Provide details...";
                })()}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                fullWidth
                required
                multiline
                rows={4}
                inputProps={{ maxLength: 5000 }}
                helperText={`${formData.description.length}/5000`}
              />

              {/* Context info (readonly) */}
              <Typography variant="caption" color="text.secondary">
                📍 Page: {globalThis.location.pathname}
                {jobId && ` • Job ID: ${jobId}`}
              </Typography>
            </Box>
          )}
        </DialogContent>

        {!success && (
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={loading || !formData.subject.trim() || !formData.description.trim()}
              startIcon={<SendIcon />}
            >
              {loading ? 'Sending...' : 'Submit Feedback'}
            </Button>
          </DialogActions>
        )}
      </Dialog>
    </>
  );
};

FeedbackButton.propTypes = {
  variant: PropTypes.oneOf(['icon', 'button']),
  color: PropTypes.string,
  jobId: PropTypes.string,
};

export default FeedbackButton;

