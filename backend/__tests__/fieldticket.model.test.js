/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * FieldTicket Model Tests
 * 
 * Tests the T&M / Change Order model including:
 * - Schema validation
 * - Pre-save calculations (labor, equipment, materials)
 * - Auto-generated ticket numbers
 * - Instance methods (submitForSignature, addSignature, approve, dispute)
 * - Static methods (getAtRisk, getAtRiskTotal, getApprovedForBilling)
 * - Virtual properties (isAtRisk)
 */

const mongoose = require('mongoose');
const FieldTicket = require('../models/FieldTicket');
const Company = require('../models/Company');
const User = require('../models/User');
const Job = require('../models/Job');

describe('FieldTicket Model', () => {
  let company, user, job;

  beforeEach(async () => {
    company = await Company.create({ name: 'Test Co' });
    const bcrypt = require('bcryptjs');
    user = await User.create({
      email: `ft-${Date.now()}@test.com`,
      password: await bcrypt.hash('TestPass123!', 10),
      name: 'Foreman',
      role: 'foreman',
      companyId: company._id,
    });
    job = await Job.create({
      title: 'Test Job',
      pmNumber: `PM-${Date.now()}`,
      companyId: company._id,
    });
  });

  const validTicketData = () => ({
    jobId: job._id,
    companyId: company._id,
    createdBy: user._id,
    changeReason: 'scope_change',
    changeDescription: 'Additional pole replacement required',
    workDate: new Date(),
    location: { latitude: 37.7749, longitude: -122.4194 },
  });

  // === SCHEMA VALIDATION ===
  describe('Schema Validation', () => {
    it('should create a field ticket with valid data', async () => {
      const ticket = await FieldTicket.create(validTicketData());
      expect(ticket._id).toBeDefined();
      expect(ticket.status).toBe('draft');
      expect(ticket.ticketNumber).toMatch(/^FT-\d{4}-\d{5}$/);
    });

    it('should require jobId', async () => {
      const data = validTicketData();
      delete data.jobId;
      await expect(FieldTicket.create(data)).rejects.toThrow();
    });

    it('should require companyId', async () => {
      const data = validTicketData();
      delete data.companyId;
      await expect(FieldTicket.create(data)).rejects.toThrow();
    });

    it('should require changeReason', async () => {
      const data = validTicketData();
      delete data.changeReason;
      await expect(FieldTicket.create(data)).rejects.toThrow();
    });

    it('should require changeDescription', async () => {
      const data = validTicketData();
      delete data.changeDescription;
      await expect(FieldTicket.create(data)).rejects.toThrow();
    });

    it('should only accept valid changeReason values', async () => {
      const data = validTicketData();
      data.changeReason = 'invalid_reason';
      await expect(FieldTicket.create(data)).rejects.toThrow();
    });

    it('should only accept valid status values', async () => {
      const data = validTicketData();
      data.status = 'invalid_status';
      await expect(FieldTicket.create(data)).rejects.toThrow();
    });

    it('should default isDeleted to false', async () => {
      const ticket = await FieldTicket.create(validTicketData());
      expect(ticket.isDeleted).toBe(false);
    });
  });

  // === PRE-SAVE CALCULATIONS ===
  describe('Pre-save Calculations', () => {
    it('should auto-generate ticket number', async () => {
      const ticket = await FieldTicket.create(validTicketData());
      expect(ticket.ticketNumber).toMatch(/^FT-\d{4}-00001$/);
    });

    it('should increment ticket number', async () => {
      await FieldTicket.create(validTicketData());
      const ticket2 = await FieldTicket.create(validTicketData());
      expect(ticket2.ticketNumber).toMatch(/^FT-\d{4}-00002$/);
    });

    it('should calculate labor totals correctly', async () => {
      const data = validTicketData();
      data.laborEntries = [{
        workerName: 'John Doe',
        regularHours: 8,
        overtimeHours: 2,
        regularRate: 50,
        totalAmount: 0,
      }];
      const ticket = await FieldTicket.create(data);
      // regular: 8*50=400, overtime: 2*(50*1.5)=150
      expect(ticket.laborEntries[0].totalAmount).toBe(550);
      expect(ticket.laborTotal).toBe(550);
    });

    it('should calculate equipment totals correctly', async () => {
      const data = validTicketData();
      data.equipmentEntries = [{
        equipmentType: 'bucket_truck',
        description: '60ft Bucket Truck',
        hours: 8,
        hourlyRate: 150,
        standbyHours: 2,
        totalAmount: 0,
      }];
      const ticket = await FieldTicket.create(data);
      // operating: 8*150=1200, standby: 2*(150*0.5)=150
      expect(ticket.equipmentEntries[0].totalAmount).toBe(1350);
      expect(ticket.equipmentTotal).toBe(1350);
    });

    it('should calculate material totals correctly', async () => {
      const data = validTicketData();
      data.materialEntries = [{
        description: 'Pole 40ft Class 3',
        quantity: 2,
        unit: 'EA',
        unitCost: 800,
        markup: 15, // 15%
        totalAmount: 0,
      }];
      const ticket = await FieldTicket.create(data);
      // base: 2*800=1600, markup: 1600*0.15=240 => total: 1840
      expect(ticket.materialEntries[0].totalAmount).toBe(1840);
      expect(ticket.materialTotal).toBe(1840);
    });

    it('should calculate aggregate totals with markup', async () => {
      const data = validTicketData();
      data.laborEntries = [{
        workerName: 'Worker', regularHours: 8, regularRate: 50, totalAmount: 0,
      }];
      data.equipmentEntries = [{
        equipmentType: 'crane', description: 'Crane', hours: 4, hourlyRate: 200, totalAmount: 0,
      }];
      data.materialEntries = [{
        description: 'Wire', quantity: 100, unit: 'LF', unitCost: 5, totalAmount: 0,
      }];
      data.markupRate = 10; // 10% markup
      const ticket = await FieldTicket.create(data);
      // labor: 400, equipment: 800, materials: 500
      expect(ticket.laborTotal).toBe(400);
      expect(ticket.equipmentTotal).toBe(800);
      expect(ticket.materialTotal).toBe(500);
      expect(ticket.subtotal).toBe(1700);
      expect(ticket.markup).toBe(170); // 10% of 1700
      expect(ticket.totalAmount).toBe(1870);
    });
  });

  // === VIRTUAL PROPERTIES ===
  describe('Virtual Properties', () => {
    it('should return isAtRisk=true for draft tickets', async () => {
      const ticket = await FieldTicket.create(validTicketData());
      expect(ticket.isAtRisk).toBe(true);
    });

    it('should return isAtRisk=true for pending_signature tickets', async () => {
      const data = validTicketData();
      data.status = 'pending_signature';
      data.photos = [{ url: 'test.jpg', capturedAt: new Date() }];
      const ticket = await FieldTicket.create(data);
      expect(ticket.isAtRisk).toBe(true);
    });

    it('should return isAtRisk=false for signed tickets', async () => {
      const data = validTicketData();
      data.status = 'signed';
      const ticket = await FieldTicket.create(data);
      expect(ticket.isAtRisk).toBe(false);
    });
  });

  // === INSTANCE METHODS ===
  describe('Instance Methods', () => {
    it('submitForSignature should throw if no photos', async () => {
      const ticket = await FieldTicket.create(validTicketData());
      expect(() => ticket.submitForSignature(user._id)).toThrow('At least one photo is required');
    });

    it('submitForSignature should update status with photos', async () => {
      const data = validTicketData();
      data.photos = [{ url: 'photo.jpg', capturedAt: new Date() }];
      const ticket = await FieldTicket.create(data);
      const updated = await ticket.submitForSignature(user._id);
      expect(updated.status).toBe('pending_signature');
      expect(updated.submittedBy.toString()).toBe(user._id.toString());
    });

    it('addSignature should set status to signed', async () => {
      const data = validTicketData();
      data.status = 'pending_signature';
      const ticket = await FieldTicket.create(data);
      const updated = await ticket.addSignature({
        signatureData: 'base64data',
        signerName: 'Inspector John',
      });
      expect(updated.status).toBe('signed');
      expect(updated.inspectorSignature.signerName).toBe('Inspector John');
    });

    it('approve should throw if no signature', async () => {
      const ticket = await FieldTicket.create(validTicketData());
      expect(() => ticket.approve(user._id, 'Approved')).toThrow('Inspector signature required');
    });

    it('approve should work with signature', async () => {
      const data = validTicketData();
      data.status = 'signed';
      data.inspectorSignature = { signatureData: 'sig', signerName: 'Inspector' };
      const ticket = await FieldTicket.create(data);
      const updated = await ticket.approve(user._id, 'Looks good');
      expect(updated.status).toBe('approved');
      expect(updated.approvalNotes).toBe('Looks good');
    });

    it('dispute should update status and fields', async () => {
      const data = validTicketData();
      data.status = 'signed';
      const ticket = await FieldTicket.create(data);
      const updated = await ticket.dispute(user._id, 'Incorrect hours');
      expect(updated.status).toBe('disputed');
      expect(updated.isDisputed).toBe(true);
      expect(updated.disputeReason).toBe('Incorrect hours');
    });

    it('dispute should accept category and evidence', async () => {
      const data = validTicketData();
      data.status = 'signed';
      const ticket = await FieldTicket.create(data);
      const evidence = [
        { url: 'https://example.com/photo.jpg', documentType: 'photo', description: 'Site photo' },
        { url: 'https://example.com/doc.pdf', documentType: 'document', description: 'Original scope' }
      ];
      const updated = await ticket.dispute(user._id, 'Hours overstated', 'hours', evidence);
      expect(updated.disputeCategory).toBe('hours');
      expect(updated.disputeEvidence).toHaveLength(2);
      expect(updated.disputeEvidence[0].documentType).toBe('photo');
      expect(updated.disputeEvidence[1].documentType).toBe('document');
    });

    it('resolveDispute should revert status to signed', async () => {
      const data = validTicketData();
      data.status = 'disputed';
      data.isDisputed = true;
      data.disputeReason = 'Wrong hours';
      data.inspectorSignature = { signatureData: 'sig', signerName: 'Inspector' };
      const ticket = await FieldTicket.create(data);
      const updated = await ticket.resolveDispute(user._id, 'Verified hours on-site');
      expect(updated.status).toBe('signed');
      expect(updated.disputeResolution).toBe('Verified hours on-site');
      expect(updated.disputeResolvedAt).toBeDefined();
      expect(updated.disputeResolvedBy.toString()).toBe(user._id.toString());
    });

    it('resolveDispute should throw if ticket is not disputed', async () => {
      const data = validTicketData();
      data.status = 'draft';
      const ticket = await FieldTicket.create(data);
      expect(() => ticket.resolveDispute(user._id, 'Resolved')).toThrow('Only disputed tickets can be resolved');
    });

    it('resolveDispute should append evidence to existing', async () => {
      const data = validTicketData();
      data.status = 'disputed';
      data.isDisputed = true;
      data.disputeEvidence = [{ url: 'existing.jpg', documentType: 'photo', description: 'Original' }];
      const ticket = await FieldTicket.create(data);
      const newEvidence = [{ url: 'resolution.jpg', documentType: 'photo', description: 'Resolution proof' }];
      const updated = await ticket.resolveDispute(user._id, 'Resolved', newEvidence);
      expect(updated.disputeEvidence).toHaveLength(2);
    });
  });

  // === STATIC METHODS ===
  describe('Static Methods', () => {
    it('getAtRisk should return draft and pending_signature tickets', async () => {
      const base = validTicketData();
      await FieldTicket.create({ ...base, status: 'draft' });
      await FieldTicket.create({ ...base, status: 'pending_signature' });
      await FieldTicket.create({ ...base, status: 'signed' });
      await FieldTicket.create({ ...base, status: 'approved' });

      const atRisk = await FieldTicket.getAtRisk(company._id);
      expect(atRisk).toHaveLength(2);
    });

    it('getAtRisk should exclude soft-deleted tickets', async () => {
      const base = validTicketData();
      await FieldTicket.create({ ...base, status: 'draft', isDeleted: true });
      await FieldTicket.create({ ...base, status: 'draft', isDeleted: false });

      const atRisk = await FieldTicket.getAtRisk(company._id);
      expect(atRisk).toHaveLength(1);
    });

    it('getAtRiskTotal should aggregate dollar values', async () => {
      const base = validTicketData();
      base.laborEntries = [{ workerName: 'A', regularHours: 8, regularRate: 100, totalAmount: 0 }];
      await FieldTicket.create({ ...base, status: 'draft' });
      await FieldTicket.create({ ...base, status: 'pending_signature' });

      const result = await FieldTicket.getAtRiskTotal(company._id);
      expect(result.count).toBe(2);
      expect(result.totalAtRisk).toBe(1600); // 800 * 2
    });

    it('getApprovedForBilling should return only approved unbilled tickets', async () => {
      const base = validTicketData();
      await FieldTicket.create({ ...base, status: 'approved', claimId: null });
      await FieldTicket.create({ ...base, status: 'approved', claimId: new mongoose.Types.ObjectId() });
      await FieldTicket.create({ ...base, status: 'signed' });

      const billable = await FieldTicket.getApprovedForBilling(company._id);
      expect(billable).toHaveLength(1);
    });

    it('getAtRiskAging should bucket tickets by age', async () => {
      const base = validTicketData();
      const now = new Date();

      // Fresh: 1 day old
      const freshDate = new Date(now);
      freshDate.setDate(freshDate.getDate() - 1);
      await FieldTicket.create({ ...base, status: 'draft', workDate: freshDate });

      // Warning: 5 days old
      const warningDate = new Date(now);
      warningDate.setDate(warningDate.getDate() - 5);
      await FieldTicket.create({ ...base, status: 'pending_signature', workDate: warningDate });

      // Critical: 10 days old
      const criticalDate = new Date(now);
      criticalDate.setDate(criticalDate.getDate() - 10);
      await FieldTicket.create({ ...base, status: 'draft', workDate: criticalDate });

      const aging = await FieldTicket.getAtRiskAging(company._id, { warning: 3, critical: 7 });
      expect(aging.fresh.count).toBe(1);
      expect(aging.warning.count).toBe(1);
      expect(aging.critical.count).toBe(1);
    });

    it('getAtRiskTrend should return weekly aggregation', async () => {
      const base = validTicketData();
      base.laborEntries = [{ workerName: 'A', regularHours: 8, regularRate: 100, totalAmount: 0 }];
      await FieldTicket.create({ ...base, status: 'draft' });

      const trend = await FieldTicket.getAtRiskTrend(company._id, 4);
      expect(Array.isArray(trend)).toBe(true);
      // At least one week of data
      expect(trend.length).toBeGreaterThanOrEqual(1);
      expect(trend[0]).toHaveProperty('totalAmount');
      expect(trend[0]).toHaveProperty('count');
    });
  });

  // === CALCULATION EDGE CASES ===
  describe('Calculation Edge Cases', () => {
    it('should handle zero hours gracefully', async () => {
      const data = validTicketData();
      data.laborEntries = [{
        workerName: 'Worker', regularHours: 0, overtimeHours: 0, doubleTimeHours: 0,
        regularRate: 50, totalAmount: 0,
      }];
      const ticket = await FieldTicket.create(data);
      expect(ticket.laborEntries[0].totalAmount).toBe(0);
      expect(ticket.laborTotal).toBe(0);
    });

    it('should use custom overtime rate when provided', async () => {
      const data = validTicketData();
      data.laborEntries = [{
        workerName: 'Worker', regularHours: 8, overtimeHours: 2,
        regularRate: 50, overtimeRate: 80, totalAmount: 0,
      }];
      const ticket = await FieldTicket.create(data);
      // regular: 8*50=400, overtime: 2*80=160
      expect(ticket.laborEntries[0].totalAmount).toBe(560);
    });

    it('should use custom double time rate when provided', async () => {
      const data = validTicketData();
      data.laborEntries = [{
        workerName: 'Worker', regularHours: 8, doubleTimeHours: 2,
        regularRate: 50, doubleTimeRate: 110, totalAmount: 0,
      }];
      const ticket = await FieldTicket.create(data);
      // regular: 8*50=400, doubleTime: 2*110=220
      expect(ticket.laborEntries[0].totalAmount).toBe(620);
    });

    it('should use custom standby rate when provided', async () => {
      const data = validTicketData();
      data.equipmentEntries = [{
        equipmentType: 'crane', description: 'Crane', hours: 4,
        hourlyRate: 200, standbyHours: 2, standbyRate: 80, totalAmount: 0,
      }];
      const ticket = await FieldTicket.create(data);
      // operating: 4*200=800, standby: 2*80=160
      expect(ticket.equipmentEntries[0].totalAmount).toBe(960);
    });

    it('should handle zero markup on materials', async () => {
      const data = validTicketData();
      data.materialEntries = [{
        description: 'Wire', quantity: 10, unit: 'LF', unitCost: 5,
        markup: 0, totalAmount: 0,
      }];
      const ticket = await FieldTicket.create(data);
      expect(ticket.materialEntries[0].totalAmount).toBe(50);
    });

    it('should handle multiple entries of each type', async () => {
      const data = validTicketData();
      data.laborEntries = [
        { workerName: 'A', regularHours: 8, regularRate: 50, totalAmount: 0 },
        { workerName: 'B', regularHours: 4, regularRate: 75, totalAmount: 0 },
      ];
      data.equipmentEntries = [
        { equipmentType: 'crane', description: 'Crane', hours: 2, hourlyRate: 200, totalAmount: 0 },
      ];
      data.materialEntries = [
        { description: 'Wire', quantity: 100, unit: 'LF', unitCost: 2, totalAmount: 0 },
        { description: 'Poles', quantity: 2, unit: 'EA', unitCost: 800, markup: 10, totalAmount: 0 },
      ];
      const ticket = await FieldTicket.create(data);
      expect(ticket.laborTotal).toBe(700); // 400 + 300
      expect(ticket.equipmentTotal).toBe(400); // 2*200
      expect(ticket.materialTotal).toBe(1960); // 200 + (1600+160)
      expect(ticket.subtotal).toBe(3060);
    });
  });
});

