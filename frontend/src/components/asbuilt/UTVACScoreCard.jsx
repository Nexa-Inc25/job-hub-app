/**
 * FieldLedger - UTVAC Score Card
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Visual score card showing UTVAC validation results.
 * Used in the As-Built Wizard Review step to show the foreman
 * what's passing, what's failing, and what needs attention before submit.
 * 
 * Calls POST /api/asbuilt/wizard/validate for server-side validation.
 */

import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
  Box, Typography, Paper, Chip, Alert, AlertTitle,
  List, ListItem, ListItemIcon, ListItemText, CircularProgress,
  Accordion, AccordionSummary, AccordionDetails, Button,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import WarningIcon from '@mui/icons-material/Warning';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ShieldIcon from '@mui/icons-material/Shield';
import RefreshIcon from '@mui/icons-material/Refresh';

import api from '../../api';

/**
 * Circular score display
 */
const ScoreCircle = ({ score }) => {
  const color = score >= 80 ? 'success' : score >= 50 ? 'warning' : 'error';
  const size = 100;

  return (
    <Box sx={{ position: 'relative', display: 'inline-flex' }}>
      <CircularProgress
        variant="determinate"
        value={score}
        size={size}
        thickness={6}
        color={color}
      />
      <CircularProgress
        variant="determinate"
        value={100}
        size={size}
        thickness={6}
        sx={{
          position: 'absolute',
          color: 'grey.200',
          zIndex: -1,
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          bottom: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography variant="h4" fontWeight={700} color={`${color}.main`}>
          {score}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          UTVAC
        </Typography>
      </Box>
    </Box>
  );
};

ScoreCircle.propTypes = {
  score: PropTypes.number.isRequired,
};

/**
 * UTVAC Score Card Component
 */
const UTVACScoreCard = ({
  submission,     // Wizard submission data to validate
  onValidated,    // Callback with validation result { valid, score }
}) => {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const runValidation = async () => {
    if (!submission) return;
    setLoading(true);
    setError(null);

    try {
      const response = await api.post('/api/asbuilt/wizard/validate', { submission });
      setResult(response.data);
      if (onValidated) onValidated(response.data);
    } catch (err) {
      console.error('Validation error:', err);
      setError(err.response?.data?.error || 'Validation failed');
      // Return a failed validation
      if (onValidated) onValidated({ valid: false, score: 0, errors: [{ message: 'Validation service unavailable' }] });
    } finally {
      setLoading(false);
    }
  };

  // Run validation on mount and when submission changes
  useEffect(() => {
    runValidation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submission?.workType, submission?.completedSteps]);

  // Group checks by category
  const checksByCategory = result?.checks?.reduce((acc, check) => {
    const cat = check.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(check);
    return acc;
  }, {}) || {};

  const categoryLabels = {
    completeness: 'Completeness',
    traceability: 'Traceability',
    signatures: 'Signatures',
    accuracy: 'Accuracy',
    verifiable: 'Verifiability',
    config_rule: 'Utility Rules',
  };

  if (loading) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <CircularProgress size={40} sx={{ mb: 2 }} />
        <Typography>Running UTVAC validation...</Typography>
      </Paper>
    );
  }

  if (error) {
    return (
      <Alert severity="error" action={
        <Button size="small" startIcon={<RefreshIcon />} onClick={runValidation}>Retry</Button>
      }>
        {error}
      </Alert>
    );
  }

  if (!result) return null;

  return (
    <Box>
      {/* Score Header */}
      <Paper sx={{ p: 3, mb: 2, textAlign: 'center' }}>
        <ScoreCircle score={result.score || 0} />
        <Typography variant="subtitle1" sx={{ mt: 1.5, fontWeight: 600 }}>
          {result.passedChecks || 0} / {result.totalChecks || 0} checks passed
        </Typography>
        {result.valid ? (
          <Chip
            icon={<CheckCircleIcon />}
            label="Ready to Submit"
            color="success"
            sx={{ mt: 1 }}
          />
        ) : (
          <Chip
            icon={<CancelIcon />}
            label="Issues Must Be Resolved"
            color="error"
            sx={{ mt: 1 }}
          />
        )}
      </Paper>

      {/* Errors */}
      {result.errors?.length > 0 && (
        <Alert severity="error" sx={{ mb: 2 }} icon={<CancelIcon />}>
          <AlertTitle>{result.errors.length} Error{result.errors.length > 1 ? 's' : ''}</AlertTitle>
          <List dense disablePadding>
            {result.errors.map((err, i) => (
              <ListItem key={i} sx={{ px: 0, py: 0.25 }}>
                <ListItemText
                  primary={err.message}
                  primaryTypographyProps={{ variant: 'body2' }}
                />
              </ListItem>
            ))}
          </List>
        </Alert>
      )}

      {/* Warnings */}
      {result.warnings?.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }} icon={<WarningIcon />}>
          <AlertTitle>{result.warnings.length} Warning{result.warnings.length > 1 ? 's' : ''}</AlertTitle>
          <List dense disablePadding>
            {result.warnings.map((warn, i) => (
              <ListItem key={i} sx={{ px: 0, py: 0.25 }}>
                <ListItemText
                  primary={warn.message}
                  primaryTypographyProps={{ variant: 'body2' }}
                />
              </ListItem>
            ))}
          </List>
        </Alert>
      )}

      {/* Detailed Checks by Category */}
      {Object.entries(checksByCategory).map(([category, checks]) => (
        <Accordion key={category} defaultExpanded={checks.some(c => !c.passed)} variant="outlined" sx={{ mb: 1 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
              <ShieldIcon fontSize="small" color={checks.every(c => c.passed) ? 'success' : 'warning'} />
              <Typography variant="subtitle2" fontWeight={600} sx={{ flexGrow: 1 }}>
                {categoryLabels[category] || category}
              </Typography>
              <Chip
                label={`${checks.filter(c => c.passed).length}/${checks.length}`}
                size="small"
                color={checks.every(c => c.passed) ? 'success' : 'default'}
              />
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ py: 0 }}>
            <List dense disablePadding>
              {checks.map((check, i) => (
                <ListItem key={i} sx={{ px: 0 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    {check.passed
                      ? <CheckCircleIcon color="success" fontSize="small" />
                      : <CancelIcon color="error" fontSize="small" />
                    }
                  </ListItemIcon>
                  <ListItemText
                    primary={check.description}
                    primaryTypographyProps={{
                      variant: 'body2',
                      color: check.passed ? 'text.secondary' : 'text.primary',
                    }}
                  />
                </ListItem>
              ))}
            </List>
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
};

UTVACScoreCard.propTypes = {
  submission: PropTypes.object,
  onValidated: PropTypes.func,
};

export default UTVACScoreCard;

