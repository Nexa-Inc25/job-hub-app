/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Button,
  Chip,
  LinearProgress,
  Alert,
  Divider,
  CircularProgress,
  Card,
  CardContent,
  Grid,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import api from '../../api';

export default function BillingSettings() {
  const [searchParams] = useSearchParams();
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  useEffect(() => {
    // Check for success/cancel from Stripe checkout
    if (searchParams.get('success') === 'true') {
      setSuccessMessage('Subscription activated successfully! Welcome to FieldLedger.');
    }
    if (searchParams.get('canceled') === 'true') {
      setError('Checkout was canceled. Your subscription was not changed.');
    }

    fetchSubscription();
  }, [searchParams]);

  const fetchSubscription = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/stripe/subscription');
      setSubscription(response.data);
    } catch (err) {
      console.error('Failed to fetch subscription:', err);
      setError('Failed to load subscription details');
    } finally {
      setLoading(false);
    }
  };

  const handleManageBilling = async () => {
    setPortalLoading(true);
    try {
      const response = await api.post('/api/stripe/create-portal-session');
      window.location.href = response.data.url;
    } catch (err) {
      console.error('Failed to open billing portal:', err);
      setError(err.response?.data?.error || 'Failed to open billing portal');
      setPortalLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'success';
      case 'trialing':
        return 'info';
      case 'past_due':
        return 'warning';
      case 'canceled':
      case 'unpaid':
        return 'error';
      default:
        return 'default';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'active':
        return 'Active';
      case 'trialing':
        return 'Trial';
      case 'past_due':
        return 'Past Due';
      case 'canceled':
        return 'Canceled';
      case 'unpaid':
        return 'Unpaid';
      default:
        return status;
    }
  };

  const getPlanLabel = (plan) => {
    const labels = {
      free: 'Free',
      starter: 'Starter',
      professional: 'Professional',
      enterprise: 'Enterprise',
    };
    return labels[plan] || plan;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  const aiCreditsPercent = subscription?.aiCreditsIncluded > 0
    ? (subscription.aiCreditsUsed / subscription.aiCreditsIncluded) * 100
    : 0;

  const seatsPercent = subscription?.seats > 0
    ? (subscription.seatsUsed / subscription.seats) * 100
    : 0;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        Billing & Subscription
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Manage your subscription, view usage, and update payment methods.
      </Typography>

      {successMessage && (
        <Alert 
          severity="success" 
          sx={{ mb: 3 }}
          onClose={() => setSuccessMessage(null)}
        >
          {successMessage}
        </Alert>
      )}

      {error && (
        <Alert 
          severity="error" 
          sx={{ mb: 3 }}
          onClose={() => setError(null)}
        >
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Current Plan */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6" fontWeight={600}>
                Current Plan
              </Typography>
              <Chip
                label={getStatusLabel(subscription?.status)}
                color={getStatusColor(subscription?.status)}
                size="small"
                icon={subscription?.status === 'active' ? <CheckCircleIcon /> : <WarningIcon />}
              />
            </Box>

            <Typography variant="h4" fontWeight={700} color="primary" sx={{ mb: 1 }}>
              {getPlanLabel(subscription?.plan)}
            </Typography>

            {subscription?.cancelAtPeriodEnd && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                Your subscription will cancel at the end of the billing period.
              </Alert>
            )}

            {subscription?.trialEnd && new Date(subscription.trialEnd) > new Date() && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Trial ends: {new Date(subscription.trialEnd).toLocaleDateString()}
              </Typography>
            )}

            {subscription?.currentPeriodEnd && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                <AutorenewIcon sx={{ fontSize: 16, verticalAlign: 'middle', mr: 0.5 }} />
                {subscription.cancelAtPeriodEnd ? 'Ends' : 'Renews'}: {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </Typography>
            )}

            <Divider sx={{ my: 2 }} />

            <Box sx={{ display: 'flex', gap: 2 }}>
              {subscription?.hasPaymentMethod ? (
                <Button
                  variant="outlined"
                  startIcon={<CreditCardIcon />}
                  onClick={handleManageBilling}
                  disabled={portalLoading}
                >
                  {portalLoading ? <CircularProgress size={20} /> : 'Manage Billing'}
                </Button>
              ) : (
                <Button
                  variant="contained"
                  href="/pricing"
                >
                  Upgrade Plan
                </Button>
              )}

              {subscription?.plan !== 'enterprise' && subscription?.plan !== 'free' && (
                <Button
                  variant="text"
                  href="/pricing"
                >
                  Change Plan
                </Button>
              )}
            </Box>
          </Paper>
        </Grid>

        {/* Usage */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 3 }}>
              Usage This Period
            </Typography>

            {/* AI Credits */}
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" fontWeight={500}>
                  AI Credits
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {subscription?.aiCreditsUsed || 0} / {subscription?.aiCreditsIncluded === -1 ? '∞' : subscription?.aiCreditsIncluded || 0}
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={subscription?.aiCreditsIncluded === -1 ? 0 : Math.min(aiCreditsPercent, 100)}
                color={aiCreditsPercent > 90 ? 'error' : aiCreditsPercent > 70 ? 'warning' : 'primary'}
                sx={{ height: 8, borderRadius: 4 }}
              />
              {aiCreditsPercent > 80 && subscription?.aiCreditsIncluded !== -1 && (
                <Typography variant="caption" color="warning.main">
                  Running low on AI credits. Consider upgrading for more.
                </Typography>
              )}
            </Box>

            {/* Seats */}
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" fontWeight={500}>
                  Team Seats
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {subscription?.seatsUsed || 0} / {subscription?.seats === -1 ? '∞' : subscription?.seats || 0}
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={subscription?.seats === -1 ? 0 : Math.min(seatsPercent, 100)}
                color={seatsPercent > 90 ? 'error' : seatsPercent > 70 ? 'warning' : 'primary'}
                sx={{ height: 8, borderRadius: 4 }}
              />
            </Box>
          </Paper>
        </Grid>

        {/* Features */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
              Included Features
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {subscription?.features && Object.entries(subscription.features).map(([key, enabled]) => (
                <Chip
                  key={key}
                  label={key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                  color={enabled ? 'success' : 'default'}
                  variant={enabled ? 'filled' : 'outlined'}
                  size="small"
                  icon={enabled ? <CheckCircleIcon /> : undefined}
                />
              ))}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

