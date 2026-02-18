/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 * 
 * Subscription Gate Middleware
 * Restricts access to features based on subscription plan
 *
 * SECURITY — Ghost Ship Audit Fix #3: Atomic AI Credits
 * AI credit consumption uses a single findOneAndUpdate with $inc and a $lte
 * precondition. No read-check-write race. If the AI call fails downstream,
 * credits are refunded atomically via $inc of -cost.
 */

const Company = require('../models/Company');
const log = require('../utils/logger');

/**
 * Plan feature matrix
 * Defines which features are available on each plan
 */
const PLAN_FEATURES = {
  free: {
    maxUsers: 3,
    maxJobs: 10,
    maxStorage: 100, // MB
    smartForms: false,
    oracleExport: false,
    apiAccess: false,
    ssoEnabled: false,
    prioritySupport: false,
    customBranding: false,
    advancedAnalytics: false,
    unlimitedStorage: false,
    aiCredits: 10
  },
  starter: {
    maxUsers: 10,
    maxJobs: -1, // Unlimited
    maxStorage: 5000, // 5GB
    smartForms: false,
    oracleExport: false,
    apiAccess: false,
    ssoEnabled: false,
    prioritySupport: false,
    customBranding: false,
    advancedAnalytics: false,
    unlimitedStorage: false,
    aiCredits: 100
  },
  professional: {
    maxUsers: 50,
    maxJobs: -1,
    maxStorage: 50000, // 50GB
    smartForms: true,
    oracleExport: true,
    apiAccess: false,
    ssoEnabled: false,
    prioritySupport: true,
    customBranding: true,
    advancedAnalytics: true,
    unlimitedStorage: false,
    aiCredits: 500
  },
  enterprise: {
    maxUsers: -1, // Unlimited
    maxJobs: -1,
    maxStorage: -1, // Unlimited
    smartForms: true,
    oracleExport: true,
    apiAccess: true,
    ssoEnabled: true,
    prioritySupport: true,
    customBranding: true,
    advancedAnalytics: true,
    unlimitedStorage: true,
    aiCredits: -1 // Unlimited
  }
};

/**
 * Get plan features for a company
 */
async function getPlanFeatures(companyId) {
  const company = await Company.findById(companyId).lean();
  if (!company) return PLAN_FEATURES.free;
  
  const plan = company.subscription?.plan || 'free';
  const status = company.subscription?.status || 'active';
  
  // If subscription is not active, downgrade to free
  if (!['active', 'trialing'].includes(status)) {
    return PLAN_FEATURES.free;
  }
  
  // Merge plan defaults with any custom overrides
  const planDefaults = PLAN_FEATURES[plan] || PLAN_FEATURES.free;
  const customFeatures = company.subscription?.features || {};
  
  return { ...planDefaults, ...customFeatures };
}

/**
 * Middleware factory to require a specific feature
 * @param {string} feature - Feature name from PLAN_FEATURES
 * @returns {Function} Express middleware
 */
function requireFeature(feature) {
  return async (req, res, next) => {
    try {
      if (!req.companyId) {
        return res.status(401).json({ 
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }
      
      const features = await getPlanFeatures(req.companyId);
      
      if (!features[feature]) {
        return res.status(403).json({
          error: 'This feature requires a higher subscription plan',
          code: 'UPGRADE_REQUIRED',
          feature,
          upgradeUrl: '/settings/billing'
        });
      }
      
      // Attach features to request for downstream use
      req.planFeatures = features;
      return next();
      
    } catch (error) {
      console.error('[SubscriptionGate] Error checking feature:', error);
      return next(error);
    }
  };
}

/**
 * Middleware to require a minimum plan level
 * @param {string} minPlan - Minimum plan required (starter, professional, enterprise)
 * @returns {Function} Express middleware
 */
function requirePlan(minPlan) {
  const planHierarchy = ['free', 'starter', 'professional', 'enterprise'];
  const minPlanIndex = planHierarchy.indexOf(minPlan);
  
  return async (req, res, next) => {
    try {
      if (!req.companyId) {
        return res.status(401).json({ 
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }
      
      const company = await Company.findById(req.companyId).lean();
      const currentPlan = company?.subscription?.plan || 'free';
      const status = company?.subscription?.status || 'active';
      
      // Check subscription status
      if (!['active', 'trialing'].includes(status)) {
        return res.status(403).json({
          error: 'Your subscription is not active',
          code: 'SUBSCRIPTION_INACTIVE',
          status,
          upgradeUrl: '/settings/billing'
        });
      }
      
      const currentPlanIndex = planHierarchy.indexOf(currentPlan);
      
      if (currentPlanIndex < minPlanIndex) {
        return res.status(403).json({
          error: 'This feature requires the ' + minPlan + ' plan or higher',
          code: 'UPGRADE_REQUIRED',
          currentPlan,
          requiredPlan: minPlan,
          upgradeUrl: '/settings/billing'
        });
      }
      
      req.planFeatures = PLAN_FEATURES[currentPlan];
      return next();
      
    } catch (error) {
      console.error('[SubscriptionGate] Error checking plan:', error);
      return next(error);
    }
  };
}

/**
 * Middleware to atomically reserve AI credits before an AI service call.
 *
 * Uses a single findOneAndUpdate with $inc and a $lte precondition so that
 * two concurrent requests can never both pass the balance check — the second
 * one will see the updated counter from the first and fail if insufficient.
 *
 * Attaches `req.aiCreditsReserved` (number) so downstream error handlers can
 * call `refundAICredits(req)` if the AI service call fails.
 *
 * @param {number} creditsRequired - Number of credits this operation costs
 * @returns {Function} Express middleware
 */
function requireAICredits(creditsRequired = 1) {
  return async (req, res, next) => {
    try {
      if (!req.companyId) {
        return res.status(401).json({ 
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      // --- Fast path: look up plan to check for unlimited / inactive ---
      const company = await Company.findById(req.companyId)
        .select('subscription')
        .lean();

      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      const subscription = company.subscription || {};
      const plan = subscription.plan || 'free';
      const planFeatures = PLAN_FEATURES[plan] || PLAN_FEATURES.free;
      const status = subscription.status || 'active';

      // Inactive subscription → deny
      if (!['active', 'trialing'].includes(status)) {
        return res.status(403).json({
          error: 'Your subscription is not active',
          code: 'SUBSCRIPTION_INACTIVE',
          upgradeUrl: '/settings/billing'
        });
      }

      // Unlimited credits (enterprise) → skip metering
      if (planFeatures.aiCredits === -1) {
        req.planFeatures = planFeatures;
        req.aiCreditsReserved = 0;
        return next();
      }

      const creditsIncluded = subscription.aiCreditsIncluded || planFeatures.aiCredits;
      const maxAllowed = creditsIncluded - creditsRequired;
      const now = new Date();

      // --- Atomic credit reservation ---
      // Conditions:
      //   1. Company matches
      //   2. Credits used is within budget (used <= included - cost)
      //   3. Reset date has not passed (if it has, we reset first)
      //
      // We handle the reset-date case by attempting the atomic update first.
      // If it fails because the reset date has passed, we reset and retry once.

      let result = await Company.findOneAndUpdate(
        {
          _id: req.companyId,
          'subscription.aiCreditsUsed': { $lte: maxAllowed },
          $or: [
            { 'subscription.aiCreditsResetDate': { $gte: now } },
            { 'subscription.aiCreditsResetDate': null },
            { 'subscription.aiCreditsResetDate': { $exists: false } }
          ]
        },
        {
          $inc: { 'subscription.aiCreditsUsed': creditsRequired }
        },
        { new: true, select: 'subscription' }
      );

      // If no match, either credits exhausted OR reset date has passed
      if (!result) {
        // Check if we need a period reset
        if (subscription.aiCreditsResetDate && now > new Date(subscription.aiCreditsResetDate)) {
          // Atomically reset credits and reserve in one shot
          const nextReset = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          result = await Company.findOneAndUpdate(
            {
              _id: req.companyId,
              'subscription.aiCreditsResetDate': { $lt: now }
            },
            {
              $set: {
                'subscription.aiCreditsUsed': creditsRequired,
                'subscription.aiCreditsResetDate': nextReset
              }
            },
            { new: true, select: 'subscription' }
          );
        }

        // Still no match → genuinely out of credits
        if (!result) {
          const currentUsed = subscription.aiCreditsUsed || 0;
          const remaining = Math.max(0, creditsIncluded - currentUsed);

          log.warn({
            companyId: req.companyId,
            userId: req.userId,
            creditsRequired,
            creditsRemaining: remaining,
            requestId: req.requestId
          }, 'AI credits exhausted');

          return res.status(403).json({
            error: 'AI credits exhausted for this billing period',
            code: 'AI_CREDITS_EXHAUSTED',
            creditsRemaining: remaining,
            creditsRequired,
            resetsAt: subscription.aiCreditsResetDate,
            upgradeUrl: '/settings/billing'
          });
        }
      }

      // Success — credits atomically reserved
      const updatedUsed = result.subscription?.aiCreditsUsed || 0;
      const remaining = Math.max(0, creditsIncluded - updatedUsed);

      res.setHeader('X-AI-Credits-Remaining', remaining);

      req.planFeatures = planFeatures;
      req.aiCreditsReserved = creditsRequired;
      req.aiCreditsCompanyId = req.companyId;
      return next();

    } catch (error) {
      log.error({ err: error, requestId: req.requestId }, '[SubscriptionGate] AI credit check failed');
      return next(error);
    }
  };
}

/**
 * Refund AI credits atomically after a failed AI service call.
 * Call this in the catch block of any route that uses requireAICredits.
 *
 * @param {import('express').Request} req - Must have aiCreditsReserved and aiCreditsCompanyId
 * @returns {Promise<boolean>} true if refund succeeded
 */
async function refundAICredits(req) {
  const amount = req.aiCreditsReserved;
  const companyId = req.aiCreditsCompanyId;

  if (!amount || !companyId) return false;

  try {
    await Company.findOneAndUpdate(
      { _id: companyId },
      { $inc: { 'subscription.aiCreditsUsed': -amount } }
    );

    log.info({
      companyId,
      userId: req.userId,
      refunded: amount,
      requestId: req.requestId
    }, 'AI credits refunded after service failure');

    req.aiCreditsReserved = 0;
    return true;
  } catch (err) {
    log.error({
      err,
      companyId,
      amount,
      requestId: req.requestId
    }, 'CRITICAL: AI credit refund failed — manual adjustment needed');
    return false;
  }
}

/**
 * Middleware to check seat limit
 * Use this when adding new users to a company
 */
async function checkSeatLimit(req, res, next) {
  try {
    if (!req.companyId) {
      return next();
    }
    
    const company = await Company.findById(req.companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    const subscription = company.subscription || {};
    const plan = subscription.plan || 'free';
    const planFeatures = PLAN_FEATURES[plan];
    
    // Check if unlimited seats (enterprise)
    if (planFeatures.maxUsers === -1) {
      return next();
    }
    
    const seatsUsed = subscription.seatsUsed || 0;
    
    if (seatsUsed >= planFeatures.maxUsers) {
      return res.status(403).json({
        error: 'Seat limit reached. Your ' + plan + ' plan allows ' + planFeatures.maxUsers + ' users.',
        code: 'SEAT_LIMIT_REACHED',
        seatsUsed,
        seatsAllowed: planFeatures.maxUsers,
        upgradeUrl: '/settings/billing'
      });
    }
    
    return next();
    
  } catch (error) {
    console.error('[SubscriptionGate] Error checking seat limit:', error);
    return next(error);
  }
}

/**
 * Attach subscription info to request without blocking
 * Useful for conditional UI rendering
 */
async function attachSubscription(req, res, next) {
  try {
    if (!req.companyId) {
      req.planFeatures = PLAN_FEATURES.free;
      return next();
    }
    
    req.planFeatures = await getPlanFeatures(req.companyId);
    next();
    
  } catch (error) {
    console.error('[SubscriptionGate] Error attaching subscription:', error);
    req.planFeatures = PLAN_FEATURES.free;
    next();
  }
}

module.exports = {
  PLAN_FEATURES,
  getPlanFeatures,
  requireFeature,
  requirePlan,
  requireAICredits,
  refundAICredits,
  checkSeatLimit,
  attachSubscription
};

