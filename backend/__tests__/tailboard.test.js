/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Tailboard Controller Tests
 * 
 * Tests for tailboard/JHA meeting CRUD operations.
 */

const mongoose = require('mongoose');
const Tailboard = require('../models/Tailboard');
const Job = require('../models/Job');
const User = require('../models/User');
const Company = require('../models/Company');

describe('Tailboard Model', () => {
  let testUser;
  let testCompany;
  let testJob;

  beforeEach(async () => {
    // Create test company
    testCompany = await Company.create({
      name: 'Test Electric Company',
      slug: 'test-electric'
    });

    // Create test user
    testUser = await User.create({
      email: 'foreman@test.com',
      password: 'TestPassword123!',
      name: 'Test Foreman',
      role: 'foreman',
      companyId: testCompany._id
    });

    // Create test job
    testJob = await Job.create({
      title: 'Test Job',
      woNumber: 'WO-12345',
      pmNumber: 'PM-67890',
      address: '123 Main St',
      city: 'San Francisco',
      status: 'in_progress',
      userId: testUser._id,
      companyId: testCompany._id,
      folders: [
        {
          name: 'ACI',
          documents: [],
          subfolders: [
            { name: 'GF Audit', documents: [], subfolders: [] },
            { name: 'Pre-Field Documents', documents: [], subfolders: [] }
          ]
        }
      ]
    });
  });

  describe('Tailboard Creation', () => {
    it('should create a tailboard with required fields', async () => {
      const tailboard = await Tailboard.create({
        jobId: testJob._id,
        companyId: testCompany._id,
        foremanId: testUser._id,
        date: new Date(),
        taskDescription: 'Replace pole #123',
        crewMembers: [
          { name: 'John Doe', role: 'foreman' },
          { name: 'Jane Smith', role: 'crew' }
        ],
        hazards: [
          {
            category: 'electrical',
            description: 'Live wires overhead',
            controls: ['De-energize circuit', 'Use rubber gloves'],
            riskLevel: 'high'
          }
        ],
        createdBy: testUser._id
      });

      expect(tailboard._id).toBeDefined();
      expect(tailboard.jobId.toString()).toBe(testJob._id.toString());
      expect(tailboard.crewMembers).toHaveLength(2);
      expect(tailboard.hazards).toHaveLength(1);
      expect(tailboard.hazards[0].category).toBe('electrical');
    });

    it('should require jobId field', async () => {
      await expect(Tailboard.create({
        foremanId: testUser._id,
        date: new Date(),
        taskDescription: 'Test task'
      })).rejects.toThrow();
    });

    it('should require date field', async () => {
      await expect(Tailboard.create({
        jobId: testJob._id,
        foremanId: testUser._id,
        taskDescription: 'Test task'
      })).rejects.toThrow();
    });

    it('should allow weather conditions', async () => {
      const tailboard = await Tailboard.create({
        jobId: testJob._id,
        companyId: testCompany._id,
        foremanId: testUser._id,
        date: new Date(),
        taskDescription: 'Weather test',
        weatherConditions: 'Sunny, 72°F, light winds',
        createdBy: testUser._id
      });

      expect(tailboard.weatherConditions).toBe('Sunny, 72°F, light winds');
    });

    it('should track PPE requirements', async () => {
      const tailboard = await Tailboard.create({
        jobId: testJob._id,
        companyId: testCompany._id,
        foremanId: testUser._id,
        date: new Date(),
        taskDescription: 'PPE test',
        ppeRequired: [
          { item: 'Hard Hat', checked: true },
          { item: 'Safety Glasses', checked: true },
          { item: 'FR Clothing', checked: false }
        ],
        createdBy: testUser._id
      });

      expect(tailboard.ppeRequired).toHaveLength(3);
      expect(tailboard.ppeRequired[0].checked).toBe(true);
      expect(tailboard.ppeRequired[2].checked).toBe(false);
    });
  });

  describe('Tailboard Status', () => {
    it('should default to draft status', async () => {
      const tailboard = await Tailboard.create({
        jobId: testJob._id,
        companyId: testCompany._id,
        foremanId: testUser._id,
        date: new Date(),
        taskDescription: 'Status test',
        createdBy: testUser._id
      });

      expect(tailboard.status).toBe('draft');
    });

    it('should allow status transitions', async () => {
      const tailboard = await Tailboard.create({
        jobId: testJob._id,
        companyId: testCompany._id,
        foremanId: testUser._id,
        date: new Date(),
        taskDescription: 'Status test',
        status: 'draft',
        createdBy: testUser._id
      });

      tailboard.status = 'completed';
      tailboard.completedAt = new Date();
      await tailboard.save();

      expect(tailboard.status).toBe('completed');
      expect(tailboard.completedAt).toBeDefined();
    });
  });

  describe('Crew Signatures', () => {
    it('should store crew member signatures', async () => {
      const tailboard = await Tailboard.create({
        jobId: testJob._id,
        companyId: testCompany._id,
        foremanId: testUser._id,
        date: new Date(),
        taskDescription: 'Signature test',
        crewMembers: [
          {
            name: 'John Doe',
            role: 'foreman',
            signatureData: 'data:image/png;base64,iVBORw0KGgo=',
            signedAt: new Date()
          }
        ],
        createdBy: testUser._id
      });

      expect(tailboard.crewMembers[0].signatureData).toContain('data:image');
      expect(tailboard.crewMembers[0].signedAt).toBeDefined();
    });
  });

  describe('Hazard Analysis', () => {
    it('should validate hazard categories', async () => {
      const validCategories = [
        'electrical',
        'fall',
        'traffic',
        'excavation',
        'overhead',
        'environmental',
        'confined_space'
      ];

      for (const category of validCategories) {
        const tailboard = await Tailboard.create({
          jobId: testJob._id,
          companyId: testCompany._id,
          foremanId: testUser._id,
          date: new Date(),
          taskDescription: `Hazard test: ${category}`,
          hazards: [
            {
              category,
              description: `Test ${category} hazard`,
              controls: ['Control measure'],
              riskLevel: 'medium'
            }
          ],
          createdBy: testUser._id
        });

        expect(tailboard.hazards[0].category).toBe(category);
        
        // Clean up for next iteration
        await Tailboard.deleteOne({ _id: tailboard._id });
      }
    });

    it('should validate risk levels', async () => {
      const tailboard = await Tailboard.create({
        jobId: testJob._id,
        companyId: testCompany._id,
        foremanId: testUser._id,
        date: new Date(),
        taskDescription: 'Risk level test',
        hazards: [
          { category: 'electrical', description: 'Low risk', riskLevel: 'low' },
          { category: 'fall', description: 'Medium risk', riskLevel: 'medium' },
          { category: 'traffic', description: 'High risk', riskLevel: 'high' }
        ],
        createdBy: testUser._id
      });

      expect(tailboard.hazards[0].riskLevel).toBe('low');
      expect(tailboard.hazards[1].riskLevel).toBe('medium');
      expect(tailboard.hazards[2].riskLevel).toBe('high');
    });
  });

  describe('Querying Tailboards', () => {
    beforeEach(async () => {
      // Create multiple tailboards
      await Tailboard.create([
        {
          jobId: testJob._id,
          companyId: testCompany._id,
          foremanId: testUser._id,
          date: new Date('2026-01-15'),
          taskDescription: 'Task 1',
          status: 'completed',
          createdBy: testUser._id
        },
        {
          jobId: testJob._id,
          companyId: testCompany._id,
          foremanId: testUser._id,
          date: new Date('2026-01-16'),
          taskDescription: 'Task 2',
          status: 'draft',
          createdBy: testUser._id
        },
        {
          jobId: testJob._id,
          companyId: testCompany._id,
          foremanId: testUser._id,
          date: new Date('2026-01-17'),
          taskDescription: 'Task 3',
          status: 'completed',
          createdBy: testUser._id
        }
      ]);
    });

    it('should find tailboards by job', async () => {
      const tailboards = await Tailboard.find({ jobId: testJob._id });
      expect(tailboards).toHaveLength(3);
    });

    it('should find tailboards by status', async () => {
      const completed = await Tailboard.find({ status: 'completed' });
      expect(completed).toHaveLength(2);
    });

    it('should find tailboards by company', async () => {
      const companyTailboards = await Tailboard.find({ companyId: testCompany._id });
      expect(companyTailboards).toHaveLength(3);
    });

    it('should sort tailboards by date', async () => {
      const tailboards = await Tailboard.find({ jobId: testJob._id })
        .sort({ date: -1 });
      
      expect(tailboards[0].taskDescription).toBe('Task 3');
      expect(tailboards[2].taskDescription).toBe('Task 1');
    });
  });

  describe('Special Mitigations', () => {
    it('should store special mitigation checks', async () => {
      const tailboard = await Tailboard.create({
        jobId: testJob._id,
        companyId: testCompany._id,
        foremanId: testUser._id,
        date: new Date(),
        taskDescription: 'Mitigation test',
        specialMitigations: [
          { item: 'Barricades in place', value: 'yes' },
          { item: 'Traffic control', value: 'no' },
          { item: 'Confined space', value: 'na' }
        ],
        createdBy: testUser._id
      });

      expect(tailboard.specialMitigations).toHaveLength(3);
      expect(tailboard.specialMitigations[0].value).toBe('yes');
      expect(tailboard.specialMitigations[1].value).toBe('no');
      expect(tailboard.specialMitigations[2].value).toBe('na');
    });
  });
});

