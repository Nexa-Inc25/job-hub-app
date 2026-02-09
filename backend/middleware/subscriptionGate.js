/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 * 
 * Subscription Gate Middleware
 * Restricts access to features based on subscription plan
 */

const Company = require('../models/Company');

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
 * Middleware to check and decrement AI credits
 * Use this for AI-powered features that consume credits
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
      
      const company = await Company.findById(req.companyId);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }
      
      const subscription = company.subscription || {};
      const plan = subscription.plan || 'free';
      const planFeatures = PLAN_FEATURES[plan];
      
      // Check if unlimited credits (enterprise)
      if (planFeatures.aiCredits === -1) {
        req.planFeatures = planFeatures;
        return next();
      }
      
      // Check if credits reset is needed
      const now = new Date();
      if (subscription.aiCreditsResetDate && now > subscription.aiCreditsResetDate) {
        subscription.aiCreditsUsed = 0;
        subscription.aiCreditsResetDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
        await company.save();
      }
      
      const creditsIncluded = subscription.aiCreditsIncluded || planFeatures.aiCredits;
      const creditsUsed = subscription.aiCreditsUsed || 0;
      const creditsRemaining = creditsIncluded - creditsUsed;
      
      if (creditsRemaining < creditsRequired) {
        return res.status(403).json({
          error: 'AI credits exhausted for this billing period',
          code: 'AI_CREDITS_EXHAUSTED',
          creditsRemaining,
          creditsRequired,
          resetsAt: subscription.aiCreditsResetDate,
          upgradeUrl: '/settings/billing'
        });
      }
      
      // Decrement credits
      subscription.aiCreditsUsed = creditsUsed + creditsRequired;
      await company.save();
      
      // Attach remaining credits to response header for frontend
      res.setHeader('X-AI-Credits-Remaining', creditsRemaining - creditsRequired);
      
      req.planFeatures = planFeatures;
      return next();
      
    } catch (error) {
      console.error('[SubscriptionGate] Error checking AI credits:', error);
      return next(error);
    }
  };
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
        error: `Seat limit reached. Your ${plan} plan allows ${planFeatures.maxUsers} users.`,
        code: 'SEAT_LIMIT_REACHED',
        seatsUsed: seatsUsed,
        seatsAllowed: planFeatures.maxUsers,
        upgradeUrl: '/settings/billing'
      });
    }
    
    next();
    
  } catch (error) {
    console.error('[SubscriptionGate] Error checking seat limit:', error);
    next(error);
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
  checkSeatLimit,
  attachSubscription
};

