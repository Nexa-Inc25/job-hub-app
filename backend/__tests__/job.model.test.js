/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Job Model Tests
 * 
 * Tests for Job model including status workflow,
 * folder structure, and document management.
 */

const mongoose = require('mongoose');
const Job = require('../models/Job');
const User = require('../models/User');
const Company = require('../models/Company');

describe('Job Model', () => {
  let testUser, testCompany;
  
  beforeEach(async () => {
    testCompany = await Company.create({
      name: `Test Company ${Date.now()}`,
      contactEmail: `company${Date.now()}@test.com`
    });
    
    testUser = await User.create({
      email: `user${Date.now()}@test.com`,
      password: 'TestPassword123',
      name: 'Test User',
      companyId: testCompany._id
    });
  });
  
  // ==================== Basic Creation ====================
  describe('Job Creation', () => {
    it('should create a job with minimal fields', async () => {
      const job = await Job.create({
        title: 'Test Job',
        userId: testUser._id,
        companyId: testCompany._id
      });
      
      expect(job._id).toBeDefined();
      expect(job.title).toBe('Test Job');
      expect(job.status).toBe('new');
    });
    
    it('should create job with PM number', async () => {
      const job = await Job.create({
        title: 'PM Test Job',
        pmNumber: `PM-${Date.now()}`,
        userId: testUser._id,
        companyId: testCompany._id
      });
      
      expect(job.pmNumber).toContain('PM-');
    });
    
    it('should create job with WO number', async () => {
      const job = await Job.create({
        title: 'WO Test Job',
        woNumber: `WO-${Date.now()}`,
        userId: testUser._id,
        companyId: testCompany._id
      });
      
      expect(job.woNumber).toContain('WO-');
    });
    
    it('should set default status to new', async () => {
      const job = await Job.create({
        title: 'Status Test',
        userId: testUser._id,
        companyId: testCompany._id
      });
      
      expect(job.status).toBe('new');
    });
    
    it('should set createdAt timestamp', async () => {
      const job = await Job.create({
        title: 'Timestamp Test',
        userId: testUser._id,
        companyId: testCompany._id
      });
      
      expect(job.createdAt).toBeDefined();
      expect(job.createdAt instanceof Date).toBe(true);
    });
  });
  
  // ==================== Status Workflow ====================
  describe('Status Workflow', () => {
    it('should allow valid status values', async () => {
      const validStatuses = [
        'new', 'assigned_to_gf', 'pre_fielding', 'scheduled',
        'in_progress', 'pending_gf_review', 'pending_qa_review',
        'pending_pm_approval', 'ready_to_submit', 'submitted',
        'billed', 'invoiced'
      ];
      
      for (const status of validStatuses) {
        const job = await Job.create({
          title: `Status ${status}`,
          userId: testUser._id,
          companyId: testCompany._id,
          status
        });
        
        expect(job.status).toBe(status);
      }
    });
    
    it('should update status', async () => {
      const job = await Job.create({
        title: 'Status Update Test',
        userId: testUser._id,
        companyId: testCompany._id,
        status: 'new'
      });
      
      job.status = 'pre_fielding';
      await job.save();
      
      const updated = await Job.findById(job._id);
      expect(updated.status).toBe('pre_fielding');
    });
  });
  
  // ==================== Folder Structure ====================
  describe('Folder Structure', () => {
    it('should initialize with folders array', async () => {
      const job = await Job.create({
        title: 'Folder Test',
        userId: testUser._id,
        companyId: testCompany._id,
        folders: [
          { name: 'ACI', documents: [], subfolders: [] }
        ]
      });
      
      expect(job.folders).toBeDefined();
      expect(job.folders.length).toBe(1);
      expect(job.folders[0].name).toBe('ACI');
    });
    
    it('should support nested subfolders', async () => {
      const job = await Job.create({
        title: 'Nested Folder Test',
        userId: testUser._id,
        companyId: testCompany._id,
        folders: [
          {
            name: 'ACI',
            documents: [],
            subfolders: [
              { name: 'Pre-Field Documents', documents: [] },
              { name: 'Photos', documents: [] }
            ]
          }
        ]
      });
      
      expect(job.folders[0].subfolders.length).toBe(2);
      expect(job.folders[0].subfolders[0].name).toBe('Pre-Field Documents');
    });
    
    it('should store documents in folders', async () => {
      const job = await Job.create({
        title: 'Document Test',
        userId: testUser._id,
        companyId: testCompany._id,
        folders: [
          {
            name: 'Documents',
            documents: [
              { name: 'test.pdf', url: '/uploads/test.pdf', uploadedAt: new Date() }
            ],
            subfolders: []
          }
        ]
      });
      
      expect(job.folders[0].documents.length).toBe(1);
      expect(job.folders[0].documents[0].name).toBe('test.pdf');
    });
  });
  
  // ==================== Assignment ====================
  describe('Job Assignment', () => {
    it('should assign to user', async () => {
      const assignee = await User.create({
        email: `assignee${Date.now()}@test.com`,
        password: 'TestPassword123',
        name: 'Assignee',
        companyId: testCompany._id
      });
      
      const job = await Job.create({
        title: 'Assignment Test',
        userId: testUser._id,
        companyId: testCompany._id,
        assignedTo: assignee._id
      });
      
      expect(job.assignedTo.toString()).toBe(assignee._id.toString());
    });
    
    it('should assign to GF', async () => {
      const gf = await User.create({
        email: `gf${Date.now()}@test.com`,
        password: 'TestPassword123',
        name: 'General Foreman',
        role: 'gf',
        companyId: testCompany._id
      });
      
      const job = await Job.create({
        title: 'GF Assignment Test',
        userId: testUser._id,
        companyId: testCompany._id,
        assignedToGF: gf._id
      });
      
      expect(job.assignedToGF.toString()).toBe(gf._id.toString());
    });
  });
  
  // ==================== Soft Delete ====================
  describe('Soft Delete', () => {
    it('should default isDeleted to false', async () => {
      const job = await Job.create({
        title: 'Delete Test',
        userId: testUser._id,
        companyId: testCompany._id
      });
      
      expect(job.isDeleted).toBeFalsy();
    });
    
    it('should support soft delete', async () => {
      const job = await Job.create({
        title: 'Soft Delete Test',
        userId: testUser._id,
        companyId: testCompany._id
      });
      
      job.isDeleted = true;
      job.deletedAt = new Date();
      job.deletedBy = testUser._id;
      job.deleteReason = 'Test deletion';
      await job.save();
      
      const deleted = await Job.findById(job._id);
      expect(deleted.isDeleted).toBe(true);
      expect(deleted.deleteReason).toBe('Test deletion');
    });
  });
  
  // ==================== Archive ====================
  describe('Archive', () => {
    it('should default isArchived to false', async () => {
      const job = await Job.create({
        title: 'Archive Test',
        userId: testUser._id,
        companyId: testCompany._id
      });
      
      expect(job.isArchived).toBeFalsy();
    });
    
    it('should support archiving', async () => {
      const job = await Job.create({
        title: 'Archive Test',
        userId: testUser._id,
        companyId: testCompany._id
      });
      
      job.isArchived = true;
      job.archivedAt = new Date();
      await job.save();
      
      const archived = await Job.findById(job._id);
      expect(archived.isArchived).toBe(true);
    });
  });
  
  // ==================== Scheduling ====================
  describe('Scheduling', () => {
    it('should set crew scheduled date', async () => {
      const scheduledDate = new Date('2026-02-15');
      
      const job = await Job.create({
        title: 'Schedule Test',
        userId: testUser._id,
        companyId: testCompany._id,
        crewScheduledDate: scheduledDate
      });
      
      expect(job.crewScheduledDate).toBeDefined();
    });
    
    it('should set due date', async () => {
      const dueDate = new Date('2026-03-01');
      
      const job = await Job.create({
        title: 'Due Date Test',
        userId: testUser._id,
        companyId: testCompany._id,
        dueDate
      });
      
      expect(job.dueDate).toBeDefined();
    });
  });
  
  // ==================== Multi-tenant ====================
  describe('Multi-tenant Isolation', () => {
    it('should require companyId', async () => {
      const job = await Job.create({
        title: 'Company Test',
        userId: testUser._id,
        companyId: testCompany._id
      });
      
      expect(job.companyId.toString()).toBe(testCompany._id.toString());
    });
    
    it('should find jobs by company', async () => {
      const otherCompany = await Company.create({
        name: `Other Company ${Date.now()}`,
        contactEmail: `other${Date.now()}@test.com`
      });
      
      await Job.create({
        title: 'Company A Job',
        userId: testUser._id,
        companyId: testCompany._id
      });
      
      await Job.create({
        title: 'Company B Job',
        userId: testUser._id,
        companyId: otherCompany._id
      });
      
      const companyAJobs = await Job.find({ companyId: testCompany._id });
      const companyBJobs = await Job.find({ companyId: otherCompany._id });
      
      expect(companyAJobs.length).toBe(1);
      expect(companyBJobs.length).toBe(1);
      expect(companyAJobs[0].title).toBe('Company A Job');
    });
  });
});

