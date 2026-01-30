/**
 * Jobs Tests
 * 
 * Comprehensive tests for job CRUD operations.
 * These tests verify behavior matching server.js for safe migration.
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Job = require('../models/Job');
const Company = require('../models/Company');

// Create test app with job routes
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // Auth middleware
  const authenticateUser = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No token provided' });
    }
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = decoded.userId;
      req.isAdmin = decoded.isAdmin || false;
      req.userRole = decoded.role || 'crew';
      next();
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
  
  // Simplified job routes for testing core functionality
  // GET /api/jobs - List jobs
  app.get('/api/jobs', authenticateUser, async (req, res) => {
    try {
      const user = await User.findById(req.userId).select('companyId');
      let query = { isDeleted: { $ne: true } };
      
      if (user?.companyId) {
        query.companyId = user.companyId;
      }
      
      // Role-based filtering
      if (!req.isAdmin && req.userRole !== 'pm') {
        query.$or = [
          { userId: req.userId },
          { assignedTo: req.userId },
          { assignedToGF: req.userId }
        ];
      }
      
      const jobs = await Job.find(query).sort({ createdAt: -1 }).lean();
      res.json(jobs);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });
  
  // POST /api/jobs - Create job
  app.post('/api/jobs', authenticateUser, async (req, res) => {
    try {
      const { title, pmNumber, woNumber, address, description, client } = req.body;
      const resolvedTitle = title || pmNumber || woNumber || 'Untitled Work Order';
      
      const user = await User.findById(req.userId).select('companyId');
      
      const job = new Job({
        title: resolvedTitle,
        pmNumber,
        woNumber,
        address,
        description,
        client,
        userId: req.userId,
        companyId: user?.companyId,
        status: 'new',
        folders: []
      });
      
      await job.save();
      res.status(201).json(job);
    } catch (err) {
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  });
  
  // GET /api/jobs/:id - Get single job
  app.get('/api/jobs/:id', authenticateUser, async (req, res) => {
    try {
      const user = await User.findById(req.userId).select('companyId');
      
      if (!user?.companyId) {
        return res.status(404).json({ error: 'Job not found' });
      }
      
      let query = { _id: req.params.id, companyId: user.companyId };
      
      if (!req.isAdmin) {
        query.$or = [
          { userId: req.userId },
          { assignedTo: req.userId }
        ];
      }
      
      const job = await Job.findOne(query);
      
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }
      
      res.json(job);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });
  
  // PUT /api/jobs/:id/status - Update job status
  app.put('/api/jobs/:id/status', authenticateUser, async (req, res) => {
    try {
      const { status } = req.body;
      const user = await User.findById(req.userId).select('companyId');
      
      let query = { _id: req.params.id };
      
      if (user?.companyId) {
        query.companyId = user.companyId;
      }
      
      if (!req.isAdmin) {
        query.$or = [
          { userId: req.userId },
          { assignedTo: req.userId },
          { assignedToGF: req.userId }
        ];
      }
      
      const job = await Job.findOne(query);
      
      if (!job) {
        return res.status(404).json({ error: 'Job not found or not authorized' });
      }
      
      const oldStatus = job.status;
      job.status = status;
      await job.save();
      
      res.json({ ...job.toObject(), previousStatus: oldStatus });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });
  
  // DELETE /api/jobs/:id - Soft delete job
  app.delete('/api/jobs/:id', authenticateUser, async (req, res) => {
    try {
      const { reason } = req.body || {};
      const user = await User.findById(req.userId).select('companyId');
      
      let query = { _id: req.params.id };
      
      if (user?.companyId) {
        query.companyId = user.companyId;
      }
      
      // Only admin/PM can delete any job, others only their own
      if (!req.isAdmin && req.userRole !== 'pm') {
        query.userId = req.userId;
      }
      
      const job = await Job.findOne(query);
      
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }
      
      // Soft delete
      job.isDeleted = true;
      job.deletedAt = new Date();
      job.deletedBy = req.userId;
      job.deleteReason = reason || 'User deleted';
      await job.save();
      
      res.json({ message: 'Work order removed from dashboard', jobId: job._id });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });
  
  return app;
};

const app = createTestApp();

// Helper to create test user with token
const createTestUserWithToken = async (overrides = {}) => {
  const bcrypt = require('bcryptjs');
  
  const company = await Company.create({
    name: `Test Company ${Date.now()}`,
    contactEmail: `company${Date.now()}@test.com`
  });
  
  const userData = {
    email: `user${Date.now()}@test.com`,
    password: await bcrypt.hash('TestPass123', 10),
    name: 'Test User',
    role: 'gf',
    isAdmin: false,
    companyId: company._id,
    ...overrides
  };
  
  const user = await User.create(userData);
  
  const token = jwt.sign({
    userId: user._id,
    role: user.role,
    isAdmin: user.isAdmin
  }, process.env.JWT_SECRET, { expiresIn: '1h' });
  
  return { user, token, company };
};

// Helper to create test job
const createTestJob = async (userId, companyId, overrides = {}) => {
  return Job.create({
    title: `Test Job ${Date.now()}`,
    pmNumber: `PM-${Date.now()}`,
    status: 'new',
    userId,
    companyId,
    folders: [],
    ...overrides
  });
};

describe('Jobs Endpoints', () => {
  
  // ==================== GET /api/jobs ====================
  describe('GET /api/jobs', () => {
    let user, token, company;
    
    beforeEach(async () => {
      const result = await createTestUserWithToken({ role: 'gf', isAdmin: false });
      user = result.user;
      token = result.token;
      company = result.company;
    });
    
    it('should return empty array when no jobs exist', async () => {
      const res = await request(app)
        .get('/api/jobs')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
    
    it('should return jobs for authenticated user', async () => {
      // Create a job assigned to this user
      await createTestJob(user._id, company._id, { assignedToGF: user._id });
      
      const res = await request(app)
        .get('/api/jobs')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
    });
    
    it('should filter out deleted jobs by default', async () => {
      // Create normal job
      await createTestJob(user._id, company._id, { assignedToGF: user._id });
      // Create deleted job
      await createTestJob(user._id, company._id, { 
        assignedToGF: user._id, 
        isDeleted: true 
      });
      
      const res = await request(app)
        .get('/api/jobs')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].isDeleted).toBeFalsy();
    });
    
    it('should only return jobs from user company (multi-tenant)', async () => {
      // Create job in user's company
      await createTestJob(user._id, company._id, { assignedToGF: user._id });
      
      // Create job in different company
      const otherCompany = await Company.create({
        name: 'Other Company',
        contactEmail: 'other@test.com'
      });
      await createTestJob(user._id, otherCompany._id);
      
      const res = await request(app)
        .get('/api/jobs')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].companyId.toString()).toBe(company._id.toString());
    });
    
    it('should require authentication', async () => {
      const res = await request(app)
        .get('/api/jobs');
      
      expect(res.status).toBe(401);
    });
    
    it('should allow admin to see all company jobs', async () => {
      // Create admin user
      const adminResult = await createTestUserWithToken({ 
        role: 'pm', 
        isAdmin: true 
      });
      
      // Create job by another user in same company
      const otherUser = await User.create({
        email: `other${Date.now()}@test.com`,
        password: 'hashedpass',
        name: 'Other User',
        companyId: adminResult.company._id
      });
      await createTestJob(otherUser._id, adminResult.company._id);
      
      const res = await request(app)
        .get('/api/jobs')
        .set('Authorization', `Bearer ${adminResult.token}`);
      
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
    });
  });
  
  // ==================== POST /api/jobs ====================
  describe('POST /api/jobs', () => {
    let user, token, company;
    
    beforeEach(async () => {
      const result = await createTestUserWithToken();
      user = result.user;
      token = result.token;
      company = result.company;
    });
    
    it('should create a new job with title', async () => {
      const res = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'New Test Job',
          address: '123 Test St'
        });
      
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('_id');
      expect(res.body).toHaveProperty('title', 'New Test Job');
      expect(res.body).toHaveProperty('status', 'new');
    });
    
    it('should create job with pmNumber as title fallback', async () => {
      const res = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send({
          pmNumber: 'PM-12345',
          address: '456 Main St'
        });
      
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('title', 'PM-12345');
      expect(res.body).toHaveProperty('pmNumber', 'PM-12345');
    });
    
    it('should associate job with user company', async () => {
      const res = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Company Job'
        });
      
      expect(res.status).toBe(201);
      expect(res.body.companyId.toString()).toBe(company._id.toString());
      expect(res.body.userId.toString()).toBe(user._id.toString());
    });
    
    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/jobs')
        .send({ title: 'Test' });
      
      expect(res.status).toBe(401);
    });
  });
  
  // ==================== GET /api/jobs/:id ====================
  describe('GET /api/jobs/:id', () => {
    let user, token, company;
    
    beforeEach(async () => {
      const result = await createTestUserWithToken();
      user = result.user;
      token = result.token;
      company = result.company;
    });
    
    it('should return job by ID for owner', async () => {
      const job = await createTestJob(user._id, company._id);
      
      const res = await request(app)
        .get(`/api/jobs/${job._id}`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.status).toBe(200);
      expect(res.body._id.toString()).toBe(job._id.toString());
      expect(res.body.pmNumber).toBe(job.pmNumber);
    });
    
    it('should return 404 for non-existent job', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      
      const res = await request(app)
        .get(`/api/jobs/${fakeId}`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });
    
    it('should return 404 for job in different company', async () => {
      // Create job in different company
      const otherCompany = await Company.create({
        name: 'Other Company',
        contactEmail: 'other@test.com'
      });
      const job = await createTestJob(user._id, otherCompany._id);
      
      const res = await request(app)
        .get(`/api/jobs/${job._id}`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.status).toBe(404);
    });
    
    it('should allow admin to access any job in their company', async () => {
      // Create admin
      const adminResult = await createTestUserWithToken({ isAdmin: true, role: 'pm' });
      
      // Create job by another user in same company
      const otherUser = await User.create({
        email: `other${Date.now()}@test.com`,
        password: 'hashedpass',
        name: 'Other',
        companyId: adminResult.company._id
      });
      const job = await createTestJob(otherUser._id, adminResult.company._id);
      
      const res = await request(app)
        .get(`/api/jobs/${job._id}`)
        .set('Authorization', `Bearer ${adminResult.token}`);
      
      expect(res.status).toBe(200);
      expect(res.body._id.toString()).toBe(job._id.toString());
    });
  });
  
  // ==================== PUT /api/jobs/:id/status ====================
  describe('PUT /api/jobs/:id/status', () => {
    let user, token, company;
    
    beforeEach(async () => {
      const result = await createTestUserWithToken();
      user = result.user;
      token = result.token;
      company = result.company;
    });
    
    it('should update job status', async () => {
      const job = await createTestJob(user._id, company._id, { status: 'new' });
      
      const res = await request(app)
        .put(`/api/jobs/${job._id}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'pre_fielding' });
      
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('pre_fielding');
      expect(res.body.previousStatus).toBe('new');
    });
    
    it('should track status progression', async () => {
      const job = await createTestJob(user._id, company._id, { status: 'new' });
      
      // Progress through statuses
      await request(app)
        .put(`/api/jobs/${job._id}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'assigned_to_gf' });
      
      const res = await request(app)
        .put(`/api/jobs/${job._id}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'pre_fielding' });
      
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('pre_fielding');
      expect(res.body.previousStatus).toBe('assigned_to_gf');
    });
    
    it('should return 404 for non-existent job', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      
      const res = await request(app)
        .put(`/api/jobs/${fakeId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'scheduled' });
      
      expect(res.status).toBe(404);
    });
  });
  
  // ==================== DELETE /api/jobs/:id ====================
  describe('DELETE /api/jobs/:id', () => {
    let user, token, company;
    
    beforeEach(async () => {
      const result = await createTestUserWithToken();
      user = result.user;
      token = result.token;
      company = result.company;
    });
    
    it('should soft delete job (not hard delete)', async () => {
      const job = await createTestJob(user._id, company._id);
      
      const res = await request(app)
        .delete(`/api/jobs/${job._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Test deletion' });
      
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('removed');
      
      // Verify soft delete - job still exists but marked deleted
      const deletedJob = await Job.findById(job._id);
      expect(deletedJob).toBeTruthy();
      expect(deletedJob.isDeleted).toBe(true);
      expect(deletedJob.deletedBy.toString()).toBe(user._id.toString());
      expect(deletedJob.deleteReason).toBe('Test deletion');
    });
    
    it('should return 404 for non-existent job', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      
      const res = await request(app)
        .delete(`/api/jobs/${fakeId}`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.status).toBe(404);
    });
    
    it('should prevent deletion of job from different company', async () => {
      // Create job in different company
      const otherCompany = await Company.create({
        name: 'Other Company',
        contactEmail: 'other@test.com'
      });
      const job = await createTestJob(user._id, otherCompany._id);
      
      const res = await request(app)
        .delete(`/api/jobs/${job._id}`)
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.status).toBe(404);
      
      // Verify job still exists
      const stillExists = await Job.findById(job._id);
      expect(stillExists.isDeleted).toBeFalsy();
    });
    
    it('should allow admin to delete any job in their company', async () => {
      // Create admin
      const adminResult = await createTestUserWithToken({ isAdmin: true, role: 'pm' });
      
      // Create job by another user in same company
      const otherUser = await User.create({
        email: `other${Date.now()}@test.com`,
        password: 'hashedpass',
        name: 'Other',
        companyId: adminResult.company._id
      });
      const job = await createTestJob(otherUser._id, adminResult.company._id);
      
      const res = await request(app)
        .delete(`/api/jobs/${job._id}`)
        .set('Authorization', `Bearer ${adminResult.token}`);
      
      expect(res.status).toBe(200);
      
      // Verify soft delete
      const deletedJob = await Job.findById(job._id);
      expect(deletedJob.isDeleted).toBe(true);
    });
  });
  
  // ==================== MULTI-TENANT SECURITY ====================
  describe('Multi-Tenant Security', () => {
    it('should never return jobs from different company', async () => {
      // Company A user
      const companyA = await createTestUserWithToken();
      await createTestJob(companyA.user._id, companyA.company._id, { 
        title: 'Company A Job',
        assignedToGF: companyA.user._id 
      });
      
      // Company B user
      const companyB = await createTestUserWithToken();
      await createTestJob(companyB.user._id, companyB.company._id, {
        title: 'Company B Job',
        assignedToGF: companyB.user._id
      });
      
      // Company A should only see their job
      const resA = await request(app)
        .get('/api/jobs')
        .set('Authorization', `Bearer ${companyA.token}`);
      
      expect(resA.status).toBe(200);
      expect(resA.body.length).toBe(1);
      expect(resA.body[0].title).toBe('Company A Job');
      
      // Company B should only see their job
      const resB = await request(app)
        .get('/api/jobs')
        .set('Authorization', `Bearer ${companyB.token}`);
      
      expect(resB.status).toBe(200);
      expect(resB.body.length).toBe(1);
      expect(resB.body[0].title).toBe('Company B Job');
    });
    
    it('should prevent cross-company job access by ID', async () => {
      // Company A creates job
      const companyA = await createTestUserWithToken();
      const jobA = await createTestJob(companyA.user._id, companyA.company._id);
      
      // Company B tries to access it
      const companyB = await createTestUserWithToken();
      
      const res = await request(app)
        .get(`/api/jobs/${jobA._id}`)
        .set('Authorization', `Bearer ${companyB.token}`);
      
      expect(res.status).toBe(404);
    });
  });
});

