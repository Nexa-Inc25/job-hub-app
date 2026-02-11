/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Subscription Gate Middleware Tests
 * 
 * Tests plan-based feature gating, AI credit management, seat limits.
 */

const mongoose = require('mongoose');
const Company = require('../models/Company');
const {
  PLAN_FEATURES,
  getPlanFeatures,
  requireFeature,
  requirePlan,
  requireAICredits,
  checkSeatLimit,
  attachSubscription,
} = require('../middleware/subscriptionGate');

describe('Subscription Gate Middleware', () => {
  let company;

  beforeEach(async () => {
    company = await Company.create({
      name: 'Test Co',
      subscription: {
        plan: 'professional',
        status: 'active',
        features: {
          smartForms: true,
          oracleExport: true,
          advancedAnalytics: true,
          prioritySupport: true,
          customBranding: true,
        },
      },
    });
  });

  // Helper to create mock req/res/next
  const mockReqResNext = (companyId) => {
    const req = { companyId };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
    };
    const next = jest.fn();
    return { req, res, next };
  };

  // === PLAN_FEATURES ===
  describe('PLAN_FEATURES', () => {
    it('should define all four plan tiers', () => {
      expect(PLAN_FEATURES).toHaveProperty('free');
      expect(PLAN_FEATURES).toHaveProperty('starter');
      expect(PLAN_FEATURES).toHaveProperty('professional');
      expect(PLAN_FEATURES).toHaveProperty('enterprise');
    });

    it('should have unlimited values for enterprise', () => {
      expect(PLAN_FEATURES.enterprise.maxUsers).toBe(-1);
      expect(PLAN_FEATURES.enterprise.maxJobs).toBe(-1);
      expect(PLAN_FEATURES.enterprise.aiCredits).toBe(-1);
    });

    it('should restrict free tier', () => {
      expect(PLAN_FEATURES.free.maxUsers).toBe(3);
      expect(PLAN_FEATURES.free.smartForms).toBe(false);
      expect(PLAN_FEATURES.free.oracleExport).toBe(false);
    });
  });

  // === getPlanFeatures ===
  describe('getPlanFeatures', () => {
    it('should return correct features for professional plan', async () => {
      const features = await getPlanFeatures(company._id);
      expect(features.smartForms).toBe(true);
      expect(features.oracleExport).toBe(true);
      expect(features.maxUsers).toBe(50);
    });

    it('should return free features if company not found', async () => {
      const features = await getPlanFeatures(new mongoose.Types.ObjectId());
      expect(features.maxUsers).toBe(3);
      expect(features.smartForms).toBe(false);
    });

    it('should downgrade to free if subscription inactive', async () => {
      await Company.findByIdAndUpdate(company._id, {
        'subscription.status': 'cancelled',
      });
      const features = await getPlanFeatures(company._id);
      expect(features.maxUsers).toBe(3);
    });

    it('should allow trialing status', async () => {
      await Company.findByIdAndUpdate(company._id, {
        'subscription.status': 'trialing',
      });
      const features = await getPlanFeatures(company._id);
      expect(features.smartForms).toBe(true);
    });
  });

  // === requireFeature ===
  describe('requireFeature', () => {
    it('should return 401 if no companyId', async () => {
      const { req, res, next } = mockReqResNext(null);
      await requireFeature('smartForms')(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next if feature is available', async () => {
      const { req, res, next } = mockReqResNext(company._id);
      await requireFeature('smartForms')(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.planFeatures).toBeDefined();
    });

    it('should return 403 if feature is not available', async () => {
      const freeCo = await Company.create({
        name: 'Free Co',
        subscription: { plan: 'free', status: 'active' },
      });
      const { req, res, next } = mockReqResNext(freeCo._id);
      await requireFeature('smartForms')(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'UPGRADE_REQUIRED' })
      );
    });
  });

  // === requirePlan ===
  describe('requirePlan', () => {
    it('should allow access for matching plan', async () => {
      const { req, res, next } = mockReqResNext(company._id);
      await requirePlan('professional')(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should allow access for higher plan', async () => {
      const entCo = await Company.create({
        name: 'Enterprise Co',
        subscription: { plan: 'enterprise', status: 'active' },
      });
      const { req, res, next } = mockReqResNext(entCo._id);
      await requirePlan('professional')(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should deny access for lower plan', async () => {
      const freeCo = await Company.create({
        name: 'Free Co',
        subscription: { plan: 'free', status: 'active' },
      });
      const { req, res, next } = mockReqResNext(freeCo._id);
      await requirePlan('professional')(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should return 403 for inactive subscription', async () => {
      await Company.findByIdAndUpdate(company._id, {
        'subscription.status': 'past_due',
      });
      const { req, res, next } = mockReqResNext(company._id);
      await requirePlan('starter')(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'SUBSCRIPTION_INACTIVE' })
      );
    });
  });

  // === requireAICredits ===
  describe('requireAICredits', () => {
    it('should allow enterprise unlimited credits', async () => {
      const entCo = await Company.create({
        name: 'Enterprise Co',
        subscription: { plan: 'enterprise', status: 'active' },
      });
      const { req, res, next } = mockReqResNext(entCo._id);
      await requireAICredits(10)(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should deny when credits exhausted', async () => {
      const co = await Company.create({
        name: 'Starter Co',
        subscription: {
          plan: 'starter',
          status: 'active',
          aiCreditsUsed: 100,
          aiCreditsIncluded: 100,
        },
      });
      const { req, res, next } = mockReqResNext(co._id);
      await requireAICredits(1)(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'AI_CREDITS_EXHAUSTED' })
      );
    });

    it('should decrement credits on successful check', async () => {
      const co = await Company.create({
        name: 'Pro Co',
        subscription: {
          plan: 'professional',
          status: 'active',
          aiCreditsUsed: 0,
          aiCreditsIncluded: 500,
        },
      });
      const { req, res, next } = mockReqResNext(co._id);
      await requireAICredits(5)(req, res, next);
      expect(next).toHaveBeenCalled();
      const updated = await Company.findById(co._id);
      expect(updated.subscription.aiCreditsUsed).toBe(5);
    });
  });

  // === checkSeatLimit ===
  describe('checkSeatLimit', () => {
    it('should pass if no companyId', async () => {
      const { req, res, next } = mockReqResNext(null);
      await checkSeatLimit(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should pass if under seat limit', async () => {
      await Company.findByIdAndUpdate(company._id, {
        'subscription.seatsUsed': 10,
      });
      const { req, res, next } = mockReqResNext(company._id);
      await checkSeatLimit(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should deny if at seat limit', async () => {
      const freeCo = await Company.create({
        name: 'Free Co',
        subscription: { plan: 'free', status: 'active', seatsUsed: 3 },
      });
      const { req, res, next } = mockReqResNext(freeCo._id);
      await checkSeatLimit(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'SEAT_LIMIT_REACHED' })
      );
    });

    it('should allow unlimited seats for enterprise', async () => {
      const entCo = await Company.create({
        name: 'Ent Co',
        subscription: { plan: 'enterprise', status: 'active', seatsUsed: 9999 },
      });
      const { req, res, next } = mockReqResNext(entCo._id);
      await checkSeatLimit(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  // === attachSubscription ===
  describe('attachSubscription', () => {
    it('should attach features to req without blocking', async () => {
      const { req, res, next } = mockReqResNext(company._id);
      await attachSubscription(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.planFeatures).toBeDefined();
      expect(req.planFeatures.smartForms).toBe(true);
    });

    it('should attach free features if no companyId', async () => {
      const { req, res, next } = mockReqResNext(null);
      await attachSubscription(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.planFeatures.maxUsers).toBe(3);
    });
  });
});

