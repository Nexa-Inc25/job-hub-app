/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */

import { useState } from 'react';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  CardActions,
  Button,
  Switch,
  FormControlLabel,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  Alert,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import StarIcon from '@mui/icons-material/Star';
import api from '../../api';

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    monthlyPrice: 99,
    yearlyPrice: 990,
    description: 'Perfect for small crews getting started',
    seats: '10 users',
    features: [
      { name: 'Work order management', included: true },
      { name: 'Job file storage (5GB)', included: true },
      { name: 'LME generation', included: true },
      { name: 'Unit-price billing', included: true },
      { name: '100 AI credits/month', included: true },
      { name: 'SmartForms', included: false },
      { name: 'Oracle export', included: false },
      { name: 'API access', included: false },
      { name: 'Priority support', included: false },
    ],
  },
  {
    id: 'professional',
    name: 'Professional',
    monthlyPrice: 299,
    yearlyPrice: 2990,
    description: 'For growing contractors with multiple crews',
    seats: '50 users',
    popular: true,
    features: [
      { name: 'Everything in Starter', included: true },
      { name: 'Job file storage (50GB)', included: true },
      { name: '500 AI credits/month', included: true },
      { name: 'SmartForms PDF editor', included: true },
      { name: 'Oracle FBDI export', included: true },
      { name: 'Advanced analytics', included: true },
      { name: 'Custom branding', included: true },
      { name: 'Priority support', included: true },
      { name: 'API access', included: false },
      { name: 'SSO/SAML', included: false },
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    monthlyPrice: null,
    yearlyPrice: null,
    description: 'For large organizations with custom needs',
    seats: 'Unlimited users',
    features: [
      { name: 'Everything in Professional', included: true },
      { name: 'Unlimited storage', included: true },
      { name: 'Unlimited AI credits', included: true },
      { name: 'Full API access', included: true },
      { name: 'SSO/SAML integration', included: true },
      { name: 'Dedicated account manager', included: true },
      { name: 'Custom integrations', included: true },
      { name: 'On-premise option', included: true },
      { name: 'SLA guarantee', included: true },
    ],
  },
];

export default function PricingPage() {
  const [yearly, setYearly] = useState(true);
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState(null);

  const handleSubscribe = async (planId) => {
    if (planId === 'enterprise') {
      globalThis.location.href = 'mailto:sales@fieldledger.io?subject=Enterprise%20Inquiry';
      return;
    }

    setLoading(planId);
    setError(null);

    try {
      const response = await api.post('/api/stripe/create-checkout-session', {
        plan: planId,
        billingInterval: yearly ? 'yearly' : 'monthly',
      });

      // Redirect to Stripe Checkout
      globalThis.location.href = response.data.url;
    } catch (err) {
      console.error('Checkout error:', err);
      setError(err.response?.data?.error || 'Failed to start checkout');
      setLoading(null);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 6 }}>
      {/* Header */}
      <Box sx={{ textAlign: 'center', mb: 6 }}>
        <Typography variant="h3" fontWeight={700} gutterBottom>
          Simple, Transparent Pricing
        </Typography>
        <Typography variant="h6" color="text.secondary" sx={{ mb: 4 }}>
          Start with a 14-day free trial. No credit card required.
        </Typography>

        {/* Billing Toggle */}
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2 }}>
          <Typography color={yearly ? 'text.secondary' : 'primary'}>Monthly</Typography>
          <FormControlLabel
            control={
              <Switch
                checked={yearly}
                onChange={(e) => setYearly(e.target.checked)}
                color="primary"
              />
            }
            label=""
          />
          <Typography color={yearly ? 'primary' : 'text.secondary'}>
            Yearly
            <Chip
              label="Save 17%"
              size="small"
              color="success"
              sx={{ ml: 1 }}
            />
          </Typography>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 4 }}>
          {error}
        </Alert>
      )}

      {/* Pricing Cards */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
          gap: 4,
        }}
      >
        {PLANS.map((plan) => (
          <Card
            key={plan.id}
            elevation={plan.popular ? 8 : 2}
            sx={{
              position: 'relative',
              border: plan.popular ? 2 : 1,
              borderColor: plan.popular ? 'primary.main' : 'divider',
              borderRadius: 3,
              overflow: 'visible',
            }}
          >
            {plan.popular && (
              <Chip
                label="Most Popular"
                color="primary"
                icon={<StarIcon />}
                sx={{
                  position: 'absolute',
                  top: -16,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  fontWeight: 600,
                }}
              />
            )}

            <CardContent sx={{ p: 4 }}>
              <Typography variant="h5" fontWeight={700} gutterBottom>
                {plan.name}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                {plan.description}
              </Typography>

              {/* Price */}
              <Box sx={{ mb: 3 }}>
                {plan.monthlyPrice ? (
                  <>
                    <Typography variant="h3" component="span" fontWeight={700}>
                      ${yearly ? Math.round(plan.yearlyPrice / 12) : plan.monthlyPrice}
                    </Typography>
                    <Typography variant="body1" component="span" color="text.secondary">
                      /month
                    </Typography>
                    {yearly && (
                      <Typography variant="body2" color="text.secondary">
                        Billed ${plan.yearlyPrice}/year
                      </Typography>
                    )}
                  </>
                ) : (
                  <Typography variant="h4" fontWeight={700}>
                    Custom Pricing
                  </Typography>
                )}
              </Box>

              <Typography variant="subtitle2" color="primary" sx={{ mb: 2 }}>
                {plan.seats}
              </Typography>

              {/* Features */}
              <List dense disablePadding>
                {plan.features.map((feature) => (
                  <ListItem key={feature.name} disableGutters sx={{ py: 0.5 }}>
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      {feature.included ? (
                        <CheckCircleIcon color="success" fontSize="small" />
                      ) : (
                        <CancelIcon color="disabled" fontSize="small" />
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary={feature.name}
                      primaryTypographyProps={{
                        variant: 'body2',
                        color: feature.included ? 'text.primary' : 'text.disabled',
                      }}
                    />
                  </ListItem>
                ))}
              </List>
            </CardContent>

            <CardActions sx={{ p: 4, pt: 0 }}>
              <Button
                fullWidth
                variant={plan.popular ? 'contained' : 'outlined'}
                size="large"
                onClick={() => handleSubscribe(plan.id)}
                disabled={loading === plan.id}
                sx={{ py: 1.5, fontWeight: 600 }}
              >
                {(() => {
                  if (loading === plan.id) return <CircularProgress size={24} />;
                  if (plan.id === 'enterprise') return 'Contact Sales';
                  return 'Start Free Trial';
                })()}
              </Button>
            </CardActions>
          </Card>
        ))}
      </Box>

      {/* FAQ/Trust */}
      <Box sx={{ textAlign: 'center', mt: 8 }}>
        <Typography variant="body2" color="text.secondary">
          All plans include: SSL encryption, 99.9% uptime SLA, daily backups, and 24/7 monitoring
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Questions? Contact us at{' '}
          <a href="mailto:support@fieldledger.io">support@fieldledger.io</a>
        </Typography>
      </Box>
    </Container>
  );
}

