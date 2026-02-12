/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * LME Model and Routes Tests
 * 
 * Tests for Labor, Material, and Equipment daily statements.
 */

const LME = require('../models/LME');
const Job = require('../models/Job');
const User = require('../models/User');
const Company = require('../models/Company');

describe('LME Model', () => {
  let testUser;
  let testCompany;
  let testJob;

  beforeEach(async () => {
    // Create test company
    testCompany = await Company.create({
      name: 'Test Contractor LLC',
      slug: 'test-contractor'
    });

    // Create test user
    testUser = await User.create({
      email: 'gf@test.com',
      password: 'TestPassword123!',
      name: 'Test General Foreman',
      role: 'gf',
      companyId: testCompany._id
    });

    // Create test job
    testJob = await Job.create({
      title: 'Pole Replacement',
      woNumber: 'WO-123456',
      pmNumber: 'PM-35440499',
      address: '789 Oak Ave',
      city: 'Oakland',
      status: 'in_progress',
      userId: testUser._id,
      companyId: testCompany._id
    });
  });

  describe('LME Creation', () => {
    it('should create an LME with required fields', async () => {
      const lme = await LME.create({
        jobId: testJob._id,
        companyId: testCompany._id,
        lmeNumber: 'LME-001',
        date: new Date('2026-02-01'),
        labor: [
          {
            craft: 'GF',
            name: 'John Foreman',
            stHours: 8,
            rate: 85.50
          }
        ],
        createdBy: testUser._id
      });

      expect(lme._id).toBeDefined();
      expect(lme.lmeNumber).toBe('LME-001');
      expect(lme.labor).toHaveLength(1);
      expect(lme.labor[0].craft).toBe('GF');
    });

    it('should require jobId', async () => {
      await expect(LME.create({
        companyId: testCompany._id,
        lmeNumber: 'LME-002',
        date: new Date()
      })).rejects.toThrow();
    });

    it('should require lmeNumber', async () => {
      await expect(LME.create({
        jobId: testJob._id,
        companyId: testCompany._id,
        date: new Date()
      })).rejects.toThrow();
    });

    it('should require date', async () => {
      await expect(LME.create({
        jobId: testJob._id,
        companyId: testCompany._id,
        lmeNumber: 'LME-003'
      })).rejects.toThrow();
    });
  });

  describe('Labor Entries', () => {
    it('should store labor entries with all hour types', async () => {
      const lme = await LME.create({
        jobId: testJob._id,
        companyId: testCompany._id,
        lmeNumber: 'LME-LABOR-001',
        date: new Date(),
        labor: [
          {
            craft: 'JL',
            name: 'Jack Lineman',
            stHours: 8,
            otHours: 2,
            dtHours: 0,
            rate: 75.00
          },
          {
            craft: 'AL',
            name: 'Amy Apprentice',
            stHours: 8,
            otHours: 2,
            dtHours: 1,
            rate: 45.00
          }
        ],
        createdBy: testUser._id
      });

      expect(lme.labor).toHaveLength(2);
      expect(lme.labor[0].stHours).toBe(8);
      expect(lme.labor[0].otHours).toBe(2);
      expect(lme.labor[1].dtHours).toBe(1);
    });

    it('should track missed meals per worker', async () => {
      const lme = await LME.create({
        jobId: testJob._id,
        companyId: testCompany._id,
        lmeNumber: 'LME-MEALS-001',
        date: new Date(),
        labor: [
          {
            craft: 'F',
            name: 'Fred Foreman',
            stHours: 10,
            rate: 80.00,
            missedMeals: 1
          }
        ],
        createdBy: testUser._id
      });

      expect(lme.labor[0].missedMeals).toBe(1);
    });

    it('should validate craft codes', async () => {
      const lme = await LME.create({
        jobId: testJob._id,
        companyId: testCompany._id,
        lmeNumber: 'LME-CRAFT-001',
        date: new Date(),
        labor: [
          { craft: 'GF', name: 'General Foreman', stHours: 8, rate: 90 },
          { craft: 'F', name: 'Foreman', stHours: 8, rate: 85 },
          { craft: 'JL', name: 'Journeyman Lineman', stHours: 8, rate: 75 },
          { craft: 'AL', name: 'Apprentice Lineman', stHours: 8, rate: 45 },
          { craft: 'GM', name: 'Groundman', stHours: 8, rate: 35 },
          { craft: 'EO', name: 'Equipment Operator', stHours: 8, rate: 55 }
        ],
        createdBy: testUser._id
      });

      expect(lme.labor).toHaveLength(6);
    });
  });

  describe('Material Entries', () => {
    it('should store material entries', async () => {
      const lme = await LME.create({
        jobId: testJob._id,
        companyId: testCompany._id,
        lmeNumber: 'LME-MAT-001',
        date: new Date(),
        materials: [
          {
            description: '40ft Class 2 Pole',
            unit: 'EA',
            quantity: 1,
            unitCost: 1500.00,
            amount: 1500.00
          },
          {
            description: '#2 ACSR Conductor',
            unit: 'LF',
            quantity: 500,
            unitCost: 1.25,
            amount: 625.00
          }
        ],
        createdBy: testUser._id
      });

      expect(lme.materials).toHaveLength(2);
      expect(lme.materials[0].quantity).toBe(1);
      expect(lme.materials[1].quantity).toBe(500);
    });

    it('should default unit to EA', async () => {
      const lme = await LME.create({
        jobId: testJob._id,
        companyId: testCompany._id,
        lmeNumber: 'LME-MAT-002',
        date: new Date(),
        materials: [
          { description: 'Insulator', quantity: 4, unitCost: 50 }
        ],
        createdBy: testUser._id
      });

      expect(lme.materials[0].unit).toBe('EA');
    });
  });

  describe('Equipment Entries', () => {
    it('should store equipment entries', async () => {
      const lme = await LME.create({
        jobId: testJob._id,
        companyId: testCompany._id,
        lmeNumber: 'LME-EQUIP-001',
        date: new Date(),
        equipment: [
          {
            type: 'Bucket Truck',
            unitNumber: 'BT-101',
            hours: 10,
            rate: 125.00,
            amount: 1250.00
          },
          {
            type: 'Digger Derrick',
            unitNumber: 'DD-202',
            hours: 6,
            rate: 175.00,
            amount: 1050.00
          }
        ],
        createdBy: testUser._id
      });

      expect(lme.equipment).toHaveLength(2);
      expect(lme.equipment[0].type).toBe('Bucket Truck');
      expect(lme.equipment[0].hours).toBe(10);
    });
  });

  describe('Totals Calculation', () => {
    it('should store totals object', async () => {
      const lme = await LME.create({
        jobId: testJob._id,
        companyId: testCompany._id,
        lmeNumber: 'LME-TOTALS-001',
        date: new Date(),
        labor: [
          { craft: 'JL', name: 'Jack', stHours: 8, rate: 75, totalAmount: 600 }
        ],
        materials: [
          { description: 'Wire', quantity: 100, unitCost: 1, amount: 100 }
        ],
        equipment: [
          { type: 'Truck', hours: 8, rate: 50, amount: 400 }
        ],
        totals: {
          labor: 600,
          material: 100,
          equipment: 400,
          grand: 1100
        },
        createdBy: testUser._id
      });

      expect(lme.totals.labor).toBe(600);
      expect(lme.totals.material).toBe(100);
      expect(lme.totals.equipment).toBe(400);
      expect(lme.totals.grand).toBe(1100);
    });
  });

  describe('Job Info Denormalization', () => {
    it('should store denormalized job info', async () => {
      const lme = await LME.create({
        jobId: testJob._id,
        companyId: testCompany._id,
        lmeNumber: 'LME-JOB-001',
        date: new Date(),
        jobInfo: {
          pmNumber: 'PM-35440499',
          woNumber: 'WO-123456',
          address: '789 Oak Ave',
          city: 'Oakland',
          poNumber: 'PO-999',
          cwaNumber: 'CWA-555'
        },
        createdBy: testUser._id
      });

      expect(lme.jobInfo.pmNumber).toBe('PM-35440499');
      expect(lme.jobInfo.poNumber).toBe('PO-999');
    });
  });

  describe('Querying LMEs', () => {
    beforeEach(async () => {
      await LME.create([
        {
          jobId: testJob._id,
          companyId: testCompany._id,
          lmeNumber: 'LME-Q-001',
          date: new Date('2026-02-01'),
          createdBy: testUser._id
        },
        {
          jobId: testJob._id,
          companyId: testCompany._id,
          lmeNumber: 'LME-Q-002',
          date: new Date('2026-02-02'),
          createdBy: testUser._id
        },
        {
          jobId: testJob._id,
          companyId: testCompany._id,
          lmeNumber: 'LME-Q-003',
          date: new Date('2026-02-03'),
          createdBy: testUser._id
        }
      ]);
    });

    it('should find LMEs by job', async () => {
      const lmes = await LME.find({ jobId: testJob._id });
      expect(lmes).toHaveLength(3);
    });

    it('should find LMEs by company', async () => {
      const lmes = await LME.find({ companyId: testCompany._id });
      expect(lmes).toHaveLength(3);
    });

    it('should find LME by lmeNumber', async () => {
      const lme = await LME.findOne({ lmeNumber: 'LME-Q-002' });
      expect(lme).toBeDefined();
      expect(lme.lmeNumber).toBe('LME-Q-002');
    });

    it('should sort LMEs by date', async () => {
      const lmes = await LME.find({ jobId: testJob._id }).sort({ date: -1 });
      expect(lmes[0].lmeNumber).toBe('LME-Q-003');
      expect(lmes[2].lmeNumber).toBe('LME-Q-001');
    });

    it('should find LMEs by date range', async () => {
      const lmes = await LME.find({
        jobId: testJob._id,
        date: {
          $gte: new Date('2026-02-02'),
          $lte: new Date('2026-02-03')
        }
      });
      expect(lmes).toHaveLength(2);
    });
  });

  describe('Status Tracking', () => {
    it('should default status to draft', async () => {
      const lme = await LME.create({
        jobId: testJob._id,
        companyId: testCompany._id,
        lmeNumber: 'LME-STATUS-001',
        date: new Date(),
        createdBy: testUser._id
      });

      expect(lme.status).toBe('draft');
    });

    it('should allow status updates', async () => {
      const lme = await LME.create({
        jobId: testJob._id,
        companyId: testCompany._id,
        lmeNumber: 'LME-STATUS-002',
        date: new Date(),
        status: 'draft',
        createdBy: testUser._id
      });

      lme.status = 'submitted';
      lme.submittedAt = new Date();
      await lme.save();

      expect(lme.status).toBe('submitted');
      expect(lme.submittedAt).toBeDefined();
    });
  });
});

