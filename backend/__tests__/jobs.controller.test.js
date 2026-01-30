/**
 * Jobs Controller Tests
 * 
 * Tests for the jobs controller functions.
 * Uses the new modular controller for better coverage.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { createTestApp } = require('./helpers/testApp');
const Job = require('../models/Job');
const User = require('../models/User');

describe('Jobs Controller', () => {
  let app;
  let adminUser;
  let gfUser;
  let companyId;
  let testJob;
  
  beforeEach(async () => {
    app = createTestApp();
    companyId = new mongoose.Types.ObjectId();
    
    // Create admin user
    adminUser = await User.create({
      name: 'Admin User',
      email: `admin-${Date.now()}@test.com`,
      password: 'Admin123!@#',
      role: 'admin',
      isAdmin: true,
      companyId
    });
    
    // Create GF user
    gfUser = await User.create({
      name: 'GF User',
      email: `gf-${Date.now()}@test.com`,
      password: 'GF123!@#',
      role: 'gf',
      companyId
    });
    
    // Create test job
    testJob = await Job.create({
      title: 'Test Job',
      pmNumber: `PM-${Date.now()}`,
      status: 'new',
      address: '123 Test Street',
      createdBy: adminUser._id,
      companyId
    });
  });
  
  // ==================== List Jobs ====================
  describe('GET /api/jobs (listJobs)', () => {
    it('should list all jobs for admin', async () => {
      const res = await request(app)
        .get('/api/jobs')
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .set('X-Test-Company-Id', companyId.toString())
        .expect(200);
      
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });
    
    it('should filter jobs by status', async () => {
      // Create jobs with different statuses
      await Job.create({
        title: 'In Progress Job',
        pmNumber: `PM-PROG-${Date.now()}`,
        status: 'in_progress',
        companyId
      });
      
      const res = await request(app)
        .get('/api/jobs?status=in_progress')
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .expect(200);
      
      expect(res.body.every(job => job.status === 'in_progress')).toBe(true);
    });
    
    it('should support pagination with limit and skip', async () => {
      const res = await request(app)
        .get('/api/jobs?limit=5&skip=0')
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .expect(200);
      
      expect(res.body.length).toBeLessThanOrEqual(5);
    });
    
    it('should filter by assigned user for non-admins', async () => {
      // Assign job to GF
      await Job.findByIdAndUpdate(testJob._id, { assignedTo: gfUser._id });
      
      const res = await request(app)
        .get('/api/jobs')
        .set('X-Test-User-Id', gfUser._id.toString())
        .set('X-Test-Is-Admin', 'false')
        .set('X-Test-Company-Id', companyId.toString())
        .expect(200);
      
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
  
  // ==================== Get Job ====================
  describe('GET /api/jobs/:id (getJob)', () => {
    it('should return job details', async () => {
      const res = await request(app)
        .get(`/api/jobs/${testJob._id}`)
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .expect(200);
      
      expect(res.body.pmNumber).toBe(testJob.pmNumber);
      expect(res.body.title).toBe(testJob.title);
    });
    
    it('should return 404 for non-existent job', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      
      const res = await request(app)
        .get(`/api/jobs/${fakeId}`)
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .expect(404);
      
      expect(res.body.error).toBe('Job not found');
    });
    
    it('should allow access to assigned users', async () => {
      // Assign job to GF user
      await Job.findByIdAndUpdate(testJob._id, { assignedTo: gfUser._id });
      
      const res = await request(app)
        .get(`/api/jobs/${testJob._id}`)
        .set('X-Test-User-Id', gfUser._id.toString())
        .set('X-Test-Is-Admin', 'false')
        .set('X-Test-Company-Id', companyId.toString())
        .expect(200);
      
      expect(res.body.pmNumber).toBe(testJob.pmNumber);
    });
  });
  
  // ==================== Create Job ====================
  describe('POST /api/jobs (createJob)', () => {
    it('should create a new job', async () => {
      const res = await request(app)
        .post('/api/jobs')
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .set('X-Test-Company-Id', companyId.toString())
        .send({
          title: 'New Test Job',
          pmNumber: `PM-NEW-${Date.now()}`,
          address: '456 New Street'
        })
        .expect(201);
      
      expect(res.body.title).toBe('New Test Job');
      expect(res.body.status).toBe('new');
    });
    
    it('should require title or PM number', async () => {
      const res = await request(app)
        .post('/api/jobs')
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .send({
          address: '789 No Title Street'
        })
        .expect(400);
      
      expect(res.body.error).toBe('Title or PM Number is required');
    });
    
    it('should reject duplicate PM numbers', async () => {
      const res = await request(app)
        .post('/api/jobs')
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .send({
          pmNumber: testJob.pmNumber // Duplicate
        })
        .expect(400);
      
      expect(res.body.error).toBe('PM Number already exists');
    });
    
    it('should use PM number as title if no title provided', async () => {
      const pmNum = `PM-NOTITLE-${Date.now()}`;
      
      const res = await request(app)
        .post('/api/jobs')
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .send({
          pmNumber: pmNum
        })
        .expect(201);
      
      expect(res.body.title).toBe(pmNum);
    });
  });
  
  // ==================== Update Job ====================
  describe('PUT /api/jobs/:id (updateJob)', () => {
    it('should update job fields', async () => {
      const res = await request(app)
        .put(`/api/jobs/${testJob._id}`)
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .send({
          address: 'Updated Address',
          description: 'Updated description'
        })
        .expect(200);
      
      expect(res.body.address).toBe('Updated Address');
      expect(res.body.description).toBe('Updated description');
    });
    
    it('should return 404 for non-existent job', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      
      const res = await request(app)
        .put(`/api/jobs/${fakeId}`)
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .send({ address: 'New Address' })
        .expect(404);
      
      expect(res.body.error).toBe('Job not found');
    });
    
    it('should track status changes', async () => {
      const res = await request(app)
        .put(`/api/jobs/${testJob._id}`)
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .send({
          status: 'in_progress'
        })
        .expect(200);
      
      expect(res.body.status).toBe('in_progress');
    });
  });
  
  // ==================== Delete Job ====================
  describe('DELETE /api/jobs/:id (deleteJob)', () => {
    it('should delete job as admin', async () => {
      const res = await request(app)
        .delete(`/api/jobs/${testJob._id}`)
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .expect(200);
      
      expect(res.body.message).toBe('Job deleted successfully');
      
      // Verify deletion
      const deleted = await Job.findById(testJob._id);
      expect(deleted).toBeNull();
    });
    
    it('should deny delete for non-admins', async () => {
      const res = await request(app)
        .delete(`/api/jobs/${testJob._id}`)
        .set('X-Test-User-Id', gfUser._id.toString())
        .set('X-Test-Is-Admin', 'false')
        .expect(403);
      
      expect(res.body.error).toBe('Only admins can delete jobs');
    });
    
    it('should return 404 for non-existent job', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      
      const res = await request(app)
        .delete(`/api/jobs/${fakeId}`)
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .expect(404);
      
      expect(res.body.error).toBe('Job not found');
    });
  });
  
  // ==================== Update Status ====================
  describe('PATCH /api/jobs/:id/status (updateStatus)', () => {
    it('should update job status', async () => {
      const res = await request(app)
        .patch(`/api/jobs/${testJob._id}/status`)
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .send({ status: 'pre_fielding' })
        .expect(200);
      
      expect(res.body.status).toBe('pre_fielding');
    });
    
    it('should require status field', async () => {
      const res = await request(app)
        .patch(`/api/jobs/${testJob._id}/status`)
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .send({})
        .expect(400);
      
      expect(res.body.error).toBe('Status is required');
    });
    
    it('should return 404 for non-existent job', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      
      const res = await request(app)
        .patch(`/api/jobs/${fakeId}/status`)
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .send({ status: 'in_progress' })
        .expect(404);
      
      expect(res.body.error).toBe('Job not found');
    });
  });
  
  // ==================== Assign Job ====================
  describe('PATCH /api/jobs/:id/assign (assignJob)', () => {
    it('should assign job to user', async () => {
      const res = await request(app)
        .patch(`/api/jobs/${testJob._id}/assign`)
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .send({
          userId: gfUser._id.toString(),
          userName: gfUser.name
        })
        .expect(200);
      
      expect(res.body.assignedTo.toString()).toBe(gfUser._id.toString());
    });
    
    it('should require userId', async () => {
      const res = await request(app)
        .patch(`/api/jobs/${testJob._id}/assign`)
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .send({})
        .expect(400);
      
      expect(res.body.error).toBe('User ID is required');
    });
    
    it('should return 404 for non-existent job', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      
      const res = await request(app)
        .patch(`/api/jobs/${fakeId}/assign`)
        .set('X-Test-User-Id', adminUser._id.toString())
        .set('X-Test-Is-Admin', 'true')
        .send({ userId: gfUser._id.toString() })
        .expect(404);
      
      expect(res.body.error).toBe('Job not found');
    });
  });
});

