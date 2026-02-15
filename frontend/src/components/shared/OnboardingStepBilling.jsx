/** Copyright (c) 2024-2026 FieldLedger. All Rights Reserved. */

import React from 'react';
import PropTypes from 'prop-types';
import {
  Box, Paper, Typography, Chip
} from '@mui/material';

/**
 * Read-only subscription plan badge shown for each company.
 * Currently displays the plan name; will expand once Stripe
 * billing is wired through the onboarding flow.
 *
 * @param {Object} props
 * @param {Object} props.company - Company object with optional subscription data
 * @param {string} props.textSecondary - Theme colour for secondary text
 */
const OnboardingStepBilling = ({ company, textSecondary }) => {
  const plan = company?.subscription?.plan || 'free';

  const planColors = {
    free: { bg: '#64748b20', fg: '#64748b' },
    starter: { bg: '#22c55e20', fg: '#22c55e' },
    professional: { bg: '#6366f120', fg: '#6366f1' },
    enterprise: { bg: '#f59e0b20', fg: '#f59e0b' },
    pro: { bg: '#6366f120', fg: '#6366f1' }
  };

  const colors = planColors[plan] || planColors.free;

  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="body2" sx={{ color: textSecondary }}>
          Plan:
        </Typography>
        <Chip
          label={plan.charAt(0).toUpperCase() + plan.slice(1)}
          size="small"
          sx={{ bgcolor: colors.bg, color: colors.fg, fontWeight: 600 }}
        />
      </Box>
    </Paper>
  );
};

OnboardingStepBilling.propTypes = {
  company: PropTypes.shape({
    subscription: PropTypes.shape({
      plan: PropTypes.string
    })
  }),
  textSecondary: PropTypes.string
};

export default OnboardingStepBilling;
