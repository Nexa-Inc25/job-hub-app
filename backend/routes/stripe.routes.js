/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 * 
 * Stripe Billing Routes
 * Handles subscription checkout, webhooks, and customer portal
 */

const express = require('express');
const router = express.Router();
const Company = require('../models/Company');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

// Initialize Stripe with secret key (conditionally - may not be configured)
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  console.log('[Stripe] Initialized with API key');
} else {
  console.warn('[Stripe] STRIPE_SECRET_KEY not configured - billing features disabled');
}

// Webhook endpoint secret for signature verification
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Middleware to check if Stripe is configured
function requireStripe(req, res, next) {
  if (!stripe) {
    return res.status(503).json({ 
      error: 'Billing is not configured. Please contact support.',
      code: 'STRIPE_NOT_CONFIGURED'
    });
  }
  next();
}

/**
 * Subscription Plans Configuration
 * These should match the products/prices created in Stripe Dashboard
 */
const PLANS = {
  starter: {
    name: 'Starter',
    monthlyPriceId: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID,
    yearlyPriceId: process.env.STRIPE_STARTER_YEARLY_PRICE_ID,
    seats: 10,
    aiCredits: 100,
    features: {
      smartForms: false,
      oracleExport: false,
      apiAccess: false,
      ssoEnabled: false,
      prioritySupport: false,
      customBranding: false,
      advancedAnalytics: false,
      unlimitedStorage: false
    }
  },
  professional: {
    name: 'Professional',
    monthlyPriceId: process.env.STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID,
    yearlyPriceId: process.env.STRIPE_PROFESSIONAL_YEARLY_PRICE_ID,
    seats: 50,
    aiCredits: 500,
    features: {
      smartForms: true,
      oracleExport: true,
      apiAccess: false,
      ssoEnabled: false,
      prioritySupport: true,
      customBranding: true,
      advancedAnalytics: true,
      unlimitedStorage: false
    }
  },
  enterprise: {
    name: 'Enterprise',
    monthlyPriceId: process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID,
    yearlyPriceId: process.env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID,
    seats: -1, // Unlimited
    aiCredits: -1, // Unlimited
    features: {
      smartForms: true,
      oracleExport: true,
      apiAccess: true,
      ssoEnabled: true,
      prioritySupport: true,
      customBranding: true,
      advancedAnalytics: true,
      unlimitedStorage: true
    }
  }
};

/**
 * @swagger
 * /api/stripe/plans:
 *   get:
 *     summary: Get available subscription plans
 *     tags: [Billing]
 *     responses:
 *       200:
 *         description: List of available plans
 */
router.get('/plans', (req, res) => {
  // Return plans without sensitive price IDs
  const publicPlans = Object.entries(PLANS).map(([key, plan]) => ({
    id: key,
    name: plan.name,
    seats: plan.seats === -1 ? 'Unlimited' : plan.seats,
    aiCredits: plan.aiCredits === -1 ? 'Unlimited' : plan.aiCredits,
    features: plan.features
  }));
  
  res.json({ plans: publicPlans });
});

/**
 * @swagger
 * /api/stripe/create-checkout-session:
 *   post:
 *     summary: Create a Stripe Checkout session for subscription
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               plan:
 *                 type: string
 *                 enum: [starter, professional, enterprise]
 *               billingInterval:
 *                 type: string
 *                 enum: [monthly, yearly]
 *     responses:
 *       200:
 *         description: Checkout session URL
 */
router.post('/create-checkout-session', authenticateToken, requireStripe, async (req, res) => {
  try {
    const { plan, billingInterval = 'monthly' } = req.body;
    const userId = req.userId;
    
    // Validate plan
    if (!PLANS[plan]) {
      return res.status(400).json({ error: 'Invalid plan selected' });
    }
    
    // Get user and company
    const user = await User.findById(userId).lean();
    if (!user || !user.companyId) {
      return res.status(400).json({ error: 'User must belong to a company' });
    }
    
    const company = await Company.findById(user.companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    // Check if user is admin/owner
    if (!user.isAdmin && String(company.ownerId) !== String(userId)) {
      return res.status(403).json({ error: 'Only admins can manage subscriptions' });
    }
    
    // Get the price ID based on billing interval
    const priceId = billingInterval === 'yearly' 
      ? PLANS[plan].yearlyPriceId 
      : PLANS[plan].monthlyPriceId;
    
    if (!priceId) {
      return res.status(500).json({ error: 'Price not configured for this plan' });
    }
    
    // Create or get Stripe customer
    let customerId = company.subscription?.stripeCustomerId;
    
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: company.email || user.email,
        name: company.name,
        metadata: {
          companyId: String(company._id),
          userId: String(userId)
        }
      });
      customerId = customer.id;
      
      // Save customer ID immediately
      company.subscription = company.subscription || {};
      company.subscription.stripeCustomerId = customerId;
      company.subscription.billingEmail = company.email || user.email;
      await company.save();
    }
    
    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1
      }],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/settings/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/settings/billing?canceled=true`,
      subscription_data: {
        trial_period_days: company.subscription?.status === 'trialing' ? undefined : 14,
        metadata: {
          companyId: String(company._id),
          plan
        }
      },
      metadata: {
        companyId: String(company._id),
        plan,
        billingInterval
      }
    });
    
    res.json({ url: session.url, sessionId: session.id });
    
  } catch (error) {
    console.error('[Stripe] Checkout session error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

/**
 * @swagger
 * /api/stripe/create-portal-session:
 *   post:
 *     summary: Create a Stripe Customer Portal session
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Portal session URL
 */
router.post('/create-portal-session', authenticateToken, requireStripe, async (req, res) => {
  try {
    const userId = req.userId;
    
    const user = await User.findById(userId).lean();
    if (!user || !user.companyId) {
      return res.status(400).json({ error: 'User must belong to a company' });
    }
    
    const company = await Company.findById(user.companyId).lean();
    if (!company?.subscription?.stripeCustomerId) {
      return res.status(400).json({ error: 'No billing account found. Please subscribe first.' });
    }
    
    // Check if user is admin/owner
    if (!user.isAdmin && String(company.ownerId) !== String(userId)) {
      return res.status(403).json({ error: 'Only admins can manage subscriptions' });
    }
    
    const session = await stripe.billingPortal.sessions.create({
      customer: company.subscription.stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL}/settings/billing`
    });
    
    res.json({ url: session.url });
    
  } catch (error) {
    console.error('[Stripe] Portal session error:', error);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

/**
 * @swagger
 * /api/stripe/subscription:
 *   get:
 *     summary: Get current subscription status
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current subscription details
 */
router.get('/subscription', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    
    const user = await User.findById(userId).lean();
    if (!user || !user.companyId) {
      return res.status(400).json({ error: 'User must belong to a company' });
    }
    
    const company = await Company.findById(user.companyId).lean();
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    const subscription = company.subscription || { plan: 'free', status: 'active' };
    
    // Get plan details
    const planConfig = PLANS[subscription.plan] || PLANS.starter;
    
    res.json({
      plan: subscription.plan,
      status: subscription.status,
      seats: subscription.seats || planConfig.seats,
      seatsUsed: subscription.seatsUsed || 0,
      aiCreditsIncluded: subscription.aiCreditsIncluded || planConfig.aiCredits,
      aiCreditsUsed: subscription.aiCreditsUsed || 0,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd || false,
      trialEnd: subscription.trialEnd,
      features: subscription.features || planConfig.features,
      hasPaymentMethod: !!subscription.stripeCustomerId
    });
    
  } catch (error) {
    console.error('[Stripe] Get subscription error:', error);
    res.status(500).json({ error: 'Failed to get subscription' });
  }
});

/**
 * @swagger
 * /api/stripe/webhook:
 *   post:
 *     summary: Stripe webhook endpoint
 *     tags: [Billing]
 *     description: Handles Stripe events (subscription updates, payments, etc.)
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  // Early return if Stripe not configured
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe not configured' });
  }
  
  const sig = req.headers['stripe-signature'];
  
  let event;
  
  try {
    // Verify webhook signature
    if (endpointSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } else {
      // For development without signature verification
      event = JSON.parse(req.body.toString());
      console.warn('[Stripe] Webhook signature not verified (no endpoint secret)');
    }
  } catch (err) {
    console.error('[Stripe] Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  console.log(`[Stripe] Webhook received: ${event.type}`);
  
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        await handleCheckoutComplete(session);
        break;
      }
      
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        await handleSubscriptionUpdate(subscription);
        break;
      }
      
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await handleSubscriptionCanceled(subscription);
        break;
      }
      
      case 'invoice.paid': {
        const invoice = event.data.object;
        await handleInvoicePaid(invoice);
        break;
      }
      
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await handlePaymentFailed(invoice);
        break;
      }
      
      case 'customer.subscription.trial_will_end': {
        const subscription = event.data.object;
        await handleTrialEnding(subscription);
        break;
      }
      
      default:
        console.log(`[Stripe] Unhandled event type: ${event.type}`);
    }
    
    res.json({ received: true });
    
  } catch (error) {
    console.error(`[Stripe] Webhook handler error for ${event.type}:`, error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

/**
 * Handle successful checkout completion
 */
async function handleCheckoutComplete(session) {
  const companyId = session.metadata?.companyId;
  const plan = session.metadata?.plan;
  
  if (!companyId) {
    console.error('[Stripe] No companyId in checkout session metadata');
    return;
  }
  
  const company = await Company.findById(companyId);
  if (!company) {
    console.error(`[Stripe] Company not found: ${companyId}`);
    return;
  }
  
  // Get subscription details
  const subscription = await stripe.subscriptions.retrieve(session.subscription);
  const planConfig = PLANS[plan] || PLANS.starter;
  
  // Update company subscription
  company.subscription = {
    ...company.subscription,
    plan,
    stripeCustomerId: session.customer,
    stripeSubscriptionId: session.subscription,
    stripePriceId: subscription.items.data[0]?.price?.id,
    status: subscription.status,
    currentPeriodStart: new Date(subscription.current_period_start * 1000),
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    seats: planConfig.seats,
    aiCreditsIncluded: planConfig.aiCredits,
    aiCreditsUsed: 0,
    aiCreditsResetDate: new Date(subscription.current_period_end * 1000),
    features: planConfig.features
  };
  
  if (subscription.trial_end) {
    company.subscription.trialStart = new Date(subscription.trial_start * 1000);
    company.subscription.trialEnd = new Date(subscription.trial_end * 1000);
  }
  
  await company.save();
  console.log(`[Stripe] Checkout complete for company ${company.name}, plan: ${plan}`);
}

/**
 * Handle subscription updates (plan changes, renewals)
 */
async function handleSubscriptionUpdate(subscription) {
  const companyId = subscription.metadata?.companyId;
  
  if (!companyId) {
    // Try to find by customer ID
    const company = await Company.findOne({ 
      'subscription.stripeCustomerId': subscription.customer 
    });
    if (!company) {
      console.error('[Stripe] Could not find company for subscription update');
      return;
    }
    return updateCompanySubscription(company, subscription);
  }
  
  const company = await Company.findById(companyId);
  if (!company) {
    console.error(`[Stripe] Company not found: ${companyId}`);
    return;
  }
  
  await updateCompanySubscription(company, subscription);
}

async function updateCompanySubscription(company, subscription) {
  const plan = subscription.metadata?.plan || company.subscription?.plan || 'starter';
  const planConfig = PLANS[plan] || PLANS.starter;
  
  company.subscription = {
    ...company.subscription,
    stripeSubscriptionId: subscription.id,
    stripePriceId: subscription.items.data[0]?.price?.id,
    status: subscription.status,
    currentPeriodStart: new Date(subscription.current_period_start * 1000),
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null
  };
  
  // Reset AI credits on new billing period
  const lastResetDate = company.subscription.aiCreditsResetDate;
  const newPeriodStart = new Date(subscription.current_period_start * 1000);
  
  if (!lastResetDate || newPeriodStart > lastResetDate) {
    company.subscription.aiCreditsUsed = 0;
    company.subscription.aiCreditsResetDate = new Date(subscription.current_period_end * 1000);
  }
  
  await company.save();
  console.log(`[Stripe] Subscription updated for company ${company.name}, status: ${subscription.status}`);
}

/**
 * Handle subscription cancellation
 */
async function handleSubscriptionCanceled(subscription) {
  const company = await Company.findOne({ 
    'subscription.stripeSubscriptionId': subscription.id 
  });
  
  if (!company) {
    console.error('[Stripe] Could not find company for canceled subscription');
    return;
  }
  
  company.subscription.status = 'canceled';
  company.subscription.canceledAt = new Date();
  company.subscription.plan = 'free';
  company.subscription.features = PLANS.starter.features; // Reset to free features
  
  await company.save();
  console.log(`[Stripe] Subscription canceled for company ${company.name}`);
  
  // TODO: Send cancellation email
}

/**
 * Handle successful invoice payment
 */
async function handleInvoicePaid(invoice) {
  const company = await Company.findOne({ 
    'subscription.stripeCustomerId': invoice.customer 
  });
  
  if (!company) return;
  
  company.subscription.lastPaymentAmount = invoice.amount_paid / 100;
  company.subscription.lastPaymentDate = new Date();
  company.subscription.lastPaymentStatus = 'paid';
  
  if (company.subscription.status === 'past_due') {
    company.subscription.status = 'active';
  }
  
  await company.save();
  console.log(`[Stripe] Invoice paid for company ${company.name}: $${invoice.amount_paid / 100}`);
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(invoice) {
  const company = await Company.findOne({ 
    'subscription.stripeCustomerId': invoice.customer 
  });
  
  if (!company) return;
  
  company.subscription.status = 'past_due';
  company.subscription.lastPaymentStatus = 'failed';
  
  await company.save();
  console.log(`[Stripe] Payment failed for company ${company.name}`);
  
  // TODO: Send payment failed email
}

/**
 * Handle trial ending notification
 */
async function handleTrialEnding(subscription) {
  const company = await Company.findOne({ 
    'subscription.stripeSubscriptionId': subscription.id 
  });
  
  if (!company) return;
  
  console.log(`[Stripe] Trial ending in 3 days for company ${company.name}`);
  
  // TODO: Send trial ending email
}

module.exports = router;

