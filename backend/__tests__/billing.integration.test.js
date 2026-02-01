/**
 * Billing Integration Tests
 * 
 * End-to-end tests for the billing workflow:
 * 1. Authentication verification (401 without token)
 * 2. PriceBook CRUD operations
 * 3. Full billing workflow: Unit Entry → Verify → Approve → Claim → Oracle Export
 * 
 * Uses supertest + mongodb-memory-server for isolated testing.
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const multer = require('multer');

// Models
const User = require('../models/User');
const Job = require('../models/Job');
const Company = require('../models/Company');
const PriceBook = require('../models/PriceBook');
const UnitEntry = require('../models/UnitEntry');
const Claim = require('../models/Claim');
const Utility = require('../models/Utility');

// Routes
const priceBookRoutes = require('../routes/pricebook.routes');
const billingRoutes = require('../routes/billing.routes');

// ============================================================================
// TEST APP SETUP
// ============================================================================

/**
 * Create test Express app with auth middleware and billing routes
 */
function createBillingTestApp() {
  const app = express();
  app.use(express.json());
  
  // Auth middleware (matches server.js behavior)
  const authenticateUser = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
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
  
  // Mount routes with auth
  app.use('/api/pricebooks', authenticateUser, priceBookRoutes);
  app.use('/api/billing', authenticateUser, billingRoutes);
  
  return app;
}

/**
 * Generate JWT token for testing
 */
function generateToken(userId, role = 'crew', options = {}) {
  return jwt.sign({
    userId: userId.toString(),
    role,
    isAdmin: options.isAdmin || false,
    companyId: options.companyId?.toString() || null
  }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

// ============================================================================
// TEST DATA FACTORIES
// ============================================================================

let testData = {};

async function setupTestData() {
  // Create company
  const company = await Company.create({
    name: 'Test Contractor LLC',
    slug: 'test-contractor',
    status: 'active',
    subscription: { plan: 'enterprise' }
  });
  
  // Create utility
  const utility = await Utility.create({
    name: 'Pacific Gas & Electric',
    slug: `pge-${Date.now()}`, // Unique slug for each test run
    shortName: 'PG&E',
    type: 'iou',
    status: 'active',
    erpIntegration: {
      oracleVendorId: 'VENDOR-001',
      oracleBusinessUnit: 'PGE-ELEC',
      masterContractNumber: 'MSA-2024-001'
    }
  });
  
  // Create users with different roles
  const hashedPassword = await bcrypt.hash('TestPass123!', 10);
  
  const foremanUser = await User.create({
    email: 'foreman@test.com',
    password: hashedPassword,
    name: 'John Foreman',
    role: 'foreman',
    companyId: company._id,
    isAdmin: false
  });
  
  const gfUser = await User.create({
    email: 'gf@test.com',
    password: hashedPassword,
    name: 'Mike GF',
    role: 'gf',
    companyId: company._id,
    isAdmin: false
  });
  
  const pmUser = await User.create({
    email: 'pm@test.com',
    password: hashedPassword,
    name: 'Sarah PM',
    role: 'pm',
    companyId: company._id,
    isAdmin: false
  });
  
  const adminUser = await User.create({
    email: 'admin@test.com',
    password: hashedPassword,
    name: 'Admin User',
    role: 'admin',
    companyId: company._id,
    isAdmin: true
  });
  
  // Create a job
  const job = await Job.create({
    title: 'Pole Replacement - Main St',
    pmNumber: 'PM-35440500',
    woNumber: 'WO-2026-001',
    status: 'in_progress',
    address: '123 Main Street, San Francisco, CA',
    companyId: company._id,
    utilityId: utility._id,
    userId: pmUser._id
  });
  
  // Generate tokens
  testData = {
    company,
    utility,
    job,
    foremanUser,
    gfUser,
    pmUser,
    adminUser,
    foremanToken: generateToken(foremanUser._id, 'foreman', { companyId: company._id }),
    gfToken: generateToken(gfUser._id, 'gf', { companyId: company._id }),
    pmToken: generateToken(pmUser._id, 'pm', { companyId: company._id }),
    adminToken: generateToken(adminUser._id, 'admin', { isAdmin: true, companyId: company._id })
  };
  
  return testData;
}

async function cleanupTestData() {
  await Promise.all([
    User.deleteMany({}),
    Job.deleteMany({}),
    Company.deleteMany({}),
    Utility.deleteMany({}),
    PriceBook.deleteMany({}),
    UnitEntry.deleteMany({}),
    Claim.deleteMany({})
  ]);
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('Billing Integration Tests', () => {
  let app;
  
  beforeAll(async () => {
    app = createBillingTestApp();
  });
  
  beforeEach(async () => {
    await cleanupTestData();
    await setupTestData();
  });
  
  afterAll(async () => {
    await cleanupTestData();
  });

  // ==========================================================================
  // AUTHENTICATION TESTS
  // ==========================================================================
  
  describe('Authentication', () => {
    test('GET /api/billing/units returns 401 without token', async () => {
      const res = await request(app)
        .get('/api/billing/units');
      
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/no token/i);
    });
    
    test('GET /api/pricebooks returns 401 without token', async () => {
      const res = await request(app)
        .get('/api/pricebooks');
      
      expect(res.status).toBe(401);
    });
    
    test('POST /api/billing/units returns 401 with invalid token', async () => {
      const res = await request(app)
        .post('/api/billing/units')
        .set('Authorization', 'Bearer invalid-token-here')
        .send({});
      
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/invalid token/i);
    });
    
    test('GET /api/billing/claims returns 401 with expired token', async () => {
      // Generate expired token
      const expiredToken = jwt.sign(
        { userId: testData.pmUser._id.toString(), role: 'pm' },
        process.env.JWT_SECRET,
        { expiresIn: '-1h' } // Already expired
      );
      
      const res = await request(app)
        .get('/api/billing/claims')
        .set('Authorization', `Bearer ${expiredToken}`);
      
      expect(res.status).toBe(401);
    });
    
    test('Valid token grants access', async () => {
      const res = await request(app)
        .get('/api/billing/units')
        .set('Authorization', `Bearer ${testData.pmToken}`);
      
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ==========================================================================
  // PRICEBOOK CRUD TESTS
  // ==========================================================================
  
  describe('PriceBook CRUD', () => {
    test('PM can create a price book', async () => {
      const res = await request(app)
        .post('/api/pricebooks')
        .set('Authorization', `Bearer ${testData.pmToken}`)
        .send({
          name: 'PG&E 2026 Rate Sheet',
          utilityId: testData.utility._id.toString(),
          effectiveDate: '2026-01-01',
          contractNumber: 'MSA-2026-001',
          items: [
            {
              itemCode: 'POLE-40-2',
              description: '40ft Class 2 Pole Installation',
              category: 'overhead',
              unit: 'EA',
              unitPrice: 2500.00,
              laborRate: 1800.00,
              materialRate: 700.00
            },
            {
              itemCode: 'TRENCH-STD',
              description: 'Standard Trenching',
              category: 'civil',
              unit: 'LF',
              unitPrice: 45.00,
              laborRate: 35.00,
              materialRate: 10.00
            }
          ]
        });
      
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('PG&E 2026 Rate Sheet');
      expect(res.body.items).toHaveLength(2);
      expect(res.body.status).toBe('draft');
      expect(res.body.companyId.toString()).toBe(testData.company._id.toString());
    });
    
    test('Foreman cannot create price book (403)', async () => {
      const res = await request(app)
        .post('/api/pricebooks')
        .set('Authorization', `Bearer ${testData.foremanToken}`)
        .send({
          name: 'Unauthorized Price Book',
          utilityId: testData.utility._id.toString(),
          effectiveDate: '2026-01-01'
        });
      
      expect(res.status).toBe(403);
    });
    
    test('GET /api/pricebooks lists company price books', async () => {
      // Create a price book first
      await PriceBook.create({
        name: 'Test Rate Sheet',
        utilityId: testData.utility._id,
        companyId: testData.company._id,
        effectiveDate: new Date('2026-01-01'),
        status: 'active',
        items: [{
          itemCode: 'TEST-001',
          description: 'Test Item',
          category: 'civil',
          unit: 'EA',
          unitPrice: 100
        }]
      });
      
      const res = await request(app)
        .get('/api/pricebooks')
        .set('Authorization', `Bearer ${testData.pmToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Test Rate Sheet');
    });
    
    test('GET /api/pricebooks/:id returns price book with items', async () => {
      const priceBook = await PriceBook.create({
        name: 'Full Rate Sheet',
        utilityId: testData.utility._id,
        companyId: testData.company._id,
        effectiveDate: new Date('2026-01-01'),
        status: 'draft',
        items: [
          { itemCode: 'ITEM-1', description: 'First Item', category: 'civil', unit: 'EA', unitPrice: 100 },
          { itemCode: 'ITEM-2', description: 'Second Item', category: 'overhead', unit: 'LF', unitPrice: 50 }
        ]
      });
      
      const res = await request(app)
        .get(`/api/pricebooks/${priceBook._id}`)
        .set('Authorization', `Bearer ${testData.pmToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
    });
    
    test('POST /api/pricebooks/:id/activate activates draft and supersedes existing', async () => {
      // Create existing active price book
      await PriceBook.create({
        name: 'Old Rate Sheet',
        utilityId: testData.utility._id,
        companyId: testData.company._id,
        effectiveDate: new Date('2025-01-01'),
        status: 'active',
        items: [{ itemCode: 'OLD-1', description: 'Old Item', category: 'civil', unit: 'EA', unitPrice: 80 }]
      });
      
      // Create new draft
      const newPriceBook = await PriceBook.create({
        name: 'New Rate Sheet 2026',
        utilityId: testData.utility._id,
        companyId: testData.company._id,
        effectiveDate: new Date('2026-01-01'),
        status: 'draft',
        items: [{ itemCode: 'NEW-1', description: 'New Item', category: 'civil', unit: 'EA', unitPrice: 100 }]
      });
      
      const res = await request(app)
        .post(`/api/pricebooks/${newPriceBook._id}/activate`)
        .set('Authorization', `Bearer ${testData.pmToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('active');
      
      // Verify old one is superseded
      const oldPb = await PriceBook.findOne({ name: 'Old Rate Sheet' });
      expect(oldPb.status).toBe('superseded');
    });
    
    test('GET /api/pricebooks/:id/items filters by category', async () => {
      const priceBook = await PriceBook.create({
        name: 'Mixed Rate Sheet',
        utilityId: testData.utility._id,
        companyId: testData.company._id,
        effectiveDate: new Date('2026-01-01'),
        status: 'active',
        items: [
          { itemCode: 'CIVIL-1', description: 'Civil Work', category: 'civil', unit: 'EA', unitPrice: 100, isActive: true },
          { itemCode: 'CIVIL-2', description: 'More Civil', category: 'civil', unit: 'LF', unitPrice: 50, isActive: true },
          { itemCode: 'ELEC-1', description: 'Electrical', category: 'electrical', unit: 'EA', unitPrice: 200, isActive: true }
        ]
      });
      
      const res = await request(app)
        .get(`/api/pricebooks/${priceBook._id}/items?category=civil`)
        .set('Authorization', `Bearer ${testData.pmToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.itemCount).toBe(2);
      expect(res.body.items.every(i => i.category === 'civil')).toBe(true);
    });
  });

  // ==========================================================================
  // UNIT ENTRY WORKFLOW TESTS
  // ==========================================================================
  
  describe('Unit Entry Workflow', () => {
    let priceBook;
    
    beforeEach(async () => {
      // Create active price book for each test
      priceBook = await PriceBook.create({
        name: 'Active Rate Sheet',
        utilityId: testData.utility._id,
        companyId: testData.company._id,
        effectiveDate: new Date('2026-01-01'),
        status: 'active',
        items: [
          {
            itemCode: 'POLE-40-2',
            description: '40ft Class 2 Pole Installation',
            category: 'overhead',
            unit: 'EA',
            unitPrice: 2500.00,
            requiresPhoto: true,
            requiresGPS: true,
            isActive: true
          },
          {
            itemCode: 'TRENCH-STD',
            description: 'Standard Trenching per Linear Foot',
            category: 'civil',
            unit: 'LF',
            unitPrice: 45.00,
            requiresPhoto: true,
            requiresGPS: true,
            isActive: true
          }
        ]
      });
    });
    
    test('Foreman can create unit entry with GPS/photo (Digital Receipt)', async () => {
      const poleItem = priceBook.items[0];
      
      const res = await request(app)
        .post('/api/billing/units')
        .set('Authorization', `Bearer ${testData.foremanToken}`)
        .send({
          jobId: testData.job._id.toString(),
          priceBookId: priceBook._id.toString(),
          priceBookItemId: poleItem._id.toString(),
          quantity: 2,
          workDate: '2026-01-15',
          location: {
            latitude: 37.7749,
            longitude: -122.4194,
            accuracy: 5,
            altitude: 10,
            capturedAt: new Date().toISOString()
          },
          performedBy: {
            tier: 'prime',
            foremanName: 'John Foreman',
            workCategory: 'electrical',
            crewSize: 4
          },
          photos: [{
            url: 'https://storage.example.com/photo1.jpg',
            fileName: 'pole_install_1.jpg',
            photoType: 'before',
            capturedAt: new Date(),
            gpsCoordinates: {
              latitude: 37.7749,
              longitude: -122.4194,
              capturedAt: new Date()
            }
          }],
          notes: 'Installed two 40ft poles on Main St'
        });
      
      expect(res.status).toBe(201);
      expect(res.body.itemCode).toBe('POLE-40-2');
      expect(res.body.quantity).toBe(2);
      expect(res.body.unitPrice).toBe(2500);
      expect(res.body.totalAmount).toBe(5000); // 2 * 2500
      expect(res.body.status).toBe('draft');
      expect(res.body.location.latitude).toBe(37.7749);
      expect(res.body.performedBy.tier).toBe('prime');
    });
    
    test('Unit entry requires photos unless waived', async () => {
      const poleItem = priceBook.items[0];
      
      const res = await request(app)
        .post('/api/billing/units')
        .set('Authorization', `Bearer ${testData.foremanToken}`)
        .send({
          jobId: testData.job._id.toString(),
          priceBookId: priceBook._id.toString(),
          priceBookItemId: poleItem._id.toString(),
          quantity: 1,
          workDate: '2026-01-15',
          location: { latitude: 37.7749, longitude: -122.4194 },
          performedBy: { tier: 'prime', workCategory: 'electrical' }
          // No photos!
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/photo.*required/i);
    });
    
    test('Photo can be waived with reason', async () => {
      const poleItem = priceBook.items[0];
      
      const res = await request(app)
        .post('/api/billing/units')
        .set('Authorization', `Bearer ${testData.foremanToken}`)
        .send({
          jobId: testData.job._id.toString(),
          priceBookId: priceBook._id.toString(),
          priceBookItemId: poleItem._id.toString(),
          quantity: 1,
          workDate: '2026-01-15',
          location: { latitude: 37.7749, longitude: -122.4194 },
          performedBy: { tier: 'prime', workCategory: 'electrical' },
          photoWaived: true,
          photoWaivedReason: 'Camera malfunction - supervisor approved'
        });
      
      expect(res.status).toBe(201);
      expect(res.body.photoWaived).toBe(true);
    });
    
    test('Sub-tier contractor tracking works', async () => {
      const civilItem = priceBook.items[1]; // Trenching
      
      const res = await request(app)
        .post('/api/billing/units')
        .set('Authorization', `Bearer ${testData.foremanToken}`)
        .send({
          jobId: testData.job._id.toString(),
          priceBookId: priceBook._id.toString(),
          priceBookItemId: civilItem._id.toString(),
          quantity: 150, // 150 LF of trenching
          workDate: '2026-01-16',
          location: { latitude: 37.7750, longitude: -122.4195 },
          performedBy: {
            tier: 'sub',
            subContractorId: new mongoose.Types.ObjectId(),
            subContractorName: 'ABC Civil Contractors',
            subContractorLicense: 'CA-1234567',
            foremanName: 'Carlos Excavator',
            workCategory: 'civil',
            crewSize: 6
          },
          photos: [{
            url: 'https://storage.example.com/trench1.jpg',
            fileName: 'trench_progress.jpg',
            photoType: 'during',
            capturedAt: new Date()
          }]
        });
      
      expect(res.status).toBe(201);
      expect(res.body.performedBy.tier).toBe('sub');
      expect(res.body.performedBy.subContractorName).toBe('ABC Civil Contractors');
      expect(res.body.totalAmount).toBe(6750); // 150 * 45
    });
    
    test('Unit entry status workflow: draft → submitted → verified → approved', async () => {
      // Step 1: Create unit as foreman
      const poleItem = priceBook.items[0];
      const createRes = await request(app)
        .post('/api/billing/units')
        .set('Authorization', `Bearer ${testData.foremanToken}`)
        .send({
          jobId: testData.job._id.toString(),
          priceBookId: priceBook._id.toString(),
          priceBookItemId: poleItem._id.toString(),
          quantity: 1,
          workDate: '2026-01-15',
          location: { latitude: 37.7749, longitude: -122.4194 },
          performedBy: { tier: 'prime', workCategory: 'electrical' },
          photos: [{ url: 'https://example.com/p1.jpg', fileName: 'p1.jpg', photoType: 'after', capturedAt: new Date() }]
        });
      
      expect(createRes.status).toBe(201);
      const unitId = createRes.body._id;
      
      // Step 2: Submit for review
      const submitRes = await request(app)
        .post(`/api/billing/units/${unitId}/submit`)
        .set('Authorization', `Bearer ${testData.foremanToken}`);
      
      expect(submitRes.status).toBe(200);
      expect(submitRes.body.status).toBe('submitted');
      
      // Step 3: GF verifies
      const verifyRes = await request(app)
        .post(`/api/billing/units/${unitId}/verify`)
        .set('Authorization', `Bearer ${testData.gfToken}`)
        .send({ notes: 'Verified on-site' });
      
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.status).toBe('verified');
      
      // Step 4: PM approves for billing
      const approveRes = await request(app)
        .post(`/api/billing/units/${unitId}/approve`)
        .set('Authorization', `Bearer ${testData.pmToken}`)
        .send({ notes: 'Approved for invoice' });
      
      expect(approveRes.status).toBe(200);
      expect(approveRes.body.status).toBe('approved');
    });
    
    test('Foreman cannot verify units (403)', async () => {
      // Create and submit a unit
      const poleItem = priceBook.items[0];
      const unit = await UnitEntry.create({
        jobId: testData.job._id,
        companyId: testData.company._id,
        priceBookId: priceBook._id,
        priceBookItemId: poleItem._id,
        itemCode: poleItem.itemCode,
        description: poleItem.description,
        category: poleItem.category,
        quantity: 1,
        unit: 'EA',
        unitPrice: 2500,
        totalAmount: 2500,
        workDate: new Date(),
        location: { latitude: 37.7749, longitude: -122.4194 },
        performedBy: { tier: 'prime', workCategory: 'electrical' },
        photos: [{ url: 'https://example.com/p.jpg', fileName: 'p.jpg', capturedAt: new Date() }],
        enteredBy: testData.foremanUser._id,
        status: 'submitted'
      });
      
      const res = await request(app)
        .post(`/api/billing/units/${unit._id}/verify`)
        .set('Authorization', `Bearer ${testData.foremanToken}`);
      
      expect(res.status).toBe(403);
    });
    
    test('GET /api/billing/units/unbilled returns only approved units', async () => {
      const poleItem = priceBook.items[0];
      
      // Create units in different statuses
      await UnitEntry.create({
        jobId: testData.job._id,
        companyId: testData.company._id,
        priceBookId: priceBook._id,
        priceBookItemId: poleItem._id,
        itemCode: 'POLE-1', description: 'Pole 1', category: 'overhead',
        quantity: 1, unit: 'EA', unitPrice: 2500, totalAmount: 2500,
        workDate: new Date(), location: { latitude: 37.7749, longitude: -122.4194 },
        performedBy: { tier: 'prime', workCategory: 'electrical' },
        photos: [{ url: 'https://example.com/p1.jpg', fileName: 'p1.jpg', capturedAt: new Date() }],
        enteredBy: testData.foremanUser._id,
        status: 'approved' // UNBILLED
      });
      
      await UnitEntry.create({
        jobId: testData.job._id,
        companyId: testData.company._id,
        priceBookId: priceBook._id,
        priceBookItemId: poleItem._id,
        itemCode: 'POLE-2', description: 'Pole 2', category: 'overhead',
        quantity: 1, unit: 'EA', unitPrice: 2500, totalAmount: 2500,
        workDate: new Date(), location: { latitude: 37.7749, longitude: -122.4194 },
        performedBy: { tier: 'prime', workCategory: 'electrical' },
        photos: [{ url: 'https://example.com/p2.jpg', fileName: 'p2.jpg', capturedAt: new Date() }],
        enteredBy: testData.foremanUser._id,
        status: 'verified' // NOT YET APPROVED
      });
      
      await UnitEntry.create({
        jobId: testData.job._id,
        companyId: testData.company._id,
        priceBookId: priceBook._id,
        priceBookItemId: poleItem._id,
        itemCode: 'POLE-3', description: 'Pole 3', category: 'overhead',
        quantity: 1, unit: 'EA', unitPrice: 2500, totalAmount: 2500,
        workDate: new Date(), location: { latitude: 37.7749, longitude: -122.4194 },
        performedBy: { tier: 'prime', workCategory: 'electrical' },
        photos: [{ url: 'https://example.com/p3.jpg', fileName: 'p3.jpg', capturedAt: new Date() }],
        enteredBy: testData.foremanUser._id,
        status: 'draft' // NOT SUBMITTED
      });
      
      const res = await request(app)
        .get('/api/billing/units/unbilled')
        .set('Authorization', `Bearer ${testData.pmToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.totalUnits).toBe(1); // Only the approved one
      expect(res.body.totalAmount).toBe(2500);
    });
  });

  // ==========================================================================
  // CLAIM WORKFLOW TESTS
  // ==========================================================================
  
  describe('Claim Workflow', () => {
    let priceBook;
    let approvedUnits = [];
    
    beforeEach(async () => {
      // Create price book
      priceBook = await PriceBook.create({
        name: 'Rate Sheet for Claims',
        utilityId: testData.utility._id,
        companyId: testData.company._id,
        effectiveDate: new Date('2026-01-01'),
        status: 'active',
        items: [
          { itemCode: 'POLE-40', description: 'Pole Install', category: 'overhead', unit: 'EA', unitPrice: 2500, isActive: true },
          { itemCode: 'TRENCH', description: 'Trenching', category: 'civil', unit: 'LF', unitPrice: 45, isActive: true }
        ]
      });
      
      // Get item IDs from the price book
      const poleItem = priceBook.items[0];
      const trenchItem = priceBook.items[1];
      
      // Create approved units
      const unit1 = await UnitEntry.create({
        jobId: testData.job._id,
        companyId: testData.company._id,
        priceBookId: priceBook._id,
        priceBookItemId: poleItem._id,
        itemCode: 'POLE-40',
        description: 'Pole Install',
        category: 'overhead',
        quantity: 3,
        unit: 'EA',
        unitPrice: 2500,
        totalAmount: 7500,
        workDate: new Date('2026-01-15'),
        location: { latitude: 37.7749, longitude: -122.4194, accuracy: 3 },
        performedBy: { tier: 'prime', workCategory: 'electrical', foremanName: 'John' },
        photos: [{ url: 'https://example.com/p1.jpg', fileName: 'p1.jpg', capturedAt: new Date() }],
        enteredBy: testData.foremanUser._id,
        status: 'approved',
        approvedBy: testData.pmUser._id,
        approvedAt: new Date()
      });
      
      const unit2 = await UnitEntry.create({
        jobId: testData.job._id,
        companyId: testData.company._id,
        priceBookId: priceBook._id,
        priceBookItemId: trenchItem._id,
        itemCode: 'TRENCH',
        description: 'Trenching',
        category: 'civil',
        quantity: 200,
        unit: 'LF',
        unitPrice: 45,
        totalAmount: 9000,
        workDate: new Date('2026-01-16'),
        location: { latitude: 37.7750, longitude: -122.4195, accuracy: 4 },
        performedBy: { tier: 'sub', subContractorName: 'ABC Civil', workCategory: 'civil' },
        photos: [{ url: 'https://example.com/p2.jpg', fileName: 'p2.jpg', capturedAt: new Date() }],
        enteredBy: testData.foremanUser._id,
        status: 'approved',
        approvedBy: testData.pmUser._id,
        approvedAt: new Date()
      });
      
      approvedUnits = [unit1, unit2];
    });
    
    test('PM can create claim from approved units', async () => {
      const res = await request(app)
        .post('/api/billing/claims')
        .set('Authorization', `Bearer ${testData.pmToken}`)
        .send({
          unitIds: approvedUnits.map(u => u._id.toString()),
          periodStart: '2026-01-01',
          periodEnd: '2026-01-31'
        });
      
      expect(res.status).toBe(201);
      expect(res.body.claimNumber).toMatch(/^CLM-2026-/);
      expect(res.body.lineItems).toHaveLength(2);
      expect(res.body.subtotal).toBe(16500); // 7500 + 9000
      expect(res.body.status).toBe('draft');
      
      // Verify units are marked as invoiced
      const updatedUnit1 = await UnitEntry.findById(approvedUnits[0]._id);
      expect(updatedUnit1.status).toBe('invoiced');
      expect(updatedUnit1.claimId.toString()).toBe(res.body._id);
    });
    
    test('Cannot create claim from non-approved units', async () => {
      const poleItem = priceBook.items[0];
      
      // Create a verified (not approved) unit
      const verifiedUnit = await UnitEntry.create({
        jobId: testData.job._id,
        companyId: testData.company._id,
        priceBookId: priceBook._id,
        priceBookItemId: poleItem._id,
        itemCode: 'TEST', description: 'Test', category: 'civil',
        quantity: 1, unit: 'EA', unitPrice: 100, totalAmount: 100,
        workDate: new Date(), location: { latitude: 37, longitude: -122 },
        performedBy: { tier: 'prime', workCategory: 'civil' },
        photos: [{ url: 'https://example.com/p.jpg', fileName: 'p.jpg', capturedAt: new Date() }],
        enteredBy: testData.foremanUser._id,
        status: 'verified' // NOT approved
      });
      
      const res = await request(app)
        .post('/api/billing/claims')
        .set('Authorization', `Bearer ${testData.pmToken}`)
        .send({
          unitIds: [verifiedUnit._id.toString()]
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not eligible|not approved|no valid/i);
    });
    
    test('Claim workflow: draft → approved → submitted', async () => {
      // Create claim
      const createRes = await request(app)
        .post('/api/billing/claims')
        .set('Authorization', `Bearer ${testData.pmToken}`)
        .send({ unitIds: approvedUnits.map(u => u._id.toString()) });
      
      const claimId = createRes.body._id;
      
      // Approve
      const approveRes = await request(app)
        .post(`/api/billing/claims/${claimId}/approve`)
        .set('Authorization', `Bearer ${testData.pmToken}`)
        .send({ notes: 'Ready for billing' });
      
      expect(approveRes.status).toBe(200);
      expect(approveRes.body.status).toBe('approved');
      
      // Submit
      const submitRes = await request(app)
        .post(`/api/billing/claims/${claimId}/submit`)
        .set('Authorization', `Bearer ${testData.pmToken}`)
        .send({
          submissionMethod: 'portal',
          submissionReference: 'PGE-INV-2026-001',
          dueDate: '2026-03-01'
        });
      
      expect(submitRes.status).toBe(200);
      expect(submitRes.body.status).toBe('submitted');
      expect(submitRes.body.submissionReference).toBe('PGE-INV-2026-001');
    });
    
    test('Record payment on claim', async () => {
      const poleItem = priceBook.items[0];
      
      // Create a unit entry first (required for claim line items)
      const unitEntry = await UnitEntry.create({
        jobId: testData.job._id,
        companyId: testData.company._id,
        priceBookId: priceBook._id,
        priceBookItemId: poleItem._id,
        itemCode: 'TEST', description: 'Test', category: 'overhead',
        quantity: 1, unit: 'EA', unitPrice: 10000, totalAmount: 10000,
        workDate: new Date(), location: { latitude: 37, longitude: -122 },
        performedBy: { tier: 'prime', workCategory: 'electrical' },
        photos: [{ url: 'https://example.com/p.jpg', fileName: 'p.jpg', capturedAt: new Date() }],
        enteredBy: testData.foremanUser._id,
        status: 'approved'
      });
      
      // Create and submit claim
      const claim = await Claim.create({
        companyId: testData.company._id,
        jobId: testData.job._id,
        claimType: 'progress',
        lineItems: [{
          unitEntryId: unitEntry._id,
          itemCode: 'TEST', description: 'Test', quantity: 1, unit: 'EA',
          unitPrice: 10000, totalAmount: 10000, lineNumber: 1
        }],
        subtotal: 10000,
        totalAmount: 10000,
        amountDue: 10000,
        status: 'submitted',
        createdBy: testData.pmUser._id
      });
      
      const res = await request(app)
        .post(`/api/billing/claims/${claim._id}/payment`)
        .set('Authorization', `Bearer ${testData.pmToken}`)
        .send({
          amount: 5000,
          paymentDate: '2026-02-15',
          paymentMethod: 'ach',
          referenceNumber: 'ACH-12345'
        });
      
      expect(res.status).toBe(200);
      expect(res.body.payments).toHaveLength(1);
      expect(res.body.payments[0].amount).toBe(5000);
      expect(res.body.totalPaid).toBe(5000);
      // After $5000 payment on $10000 claim, status should be partially_paid
      expect(res.body.status).toBe('partially_paid');
    });
  });

  // ==========================================================================
  // ORACLE EXPORT TESTS
  // ==========================================================================
  
  describe('Oracle Payables Export', () => {
    test('GET /api/billing/claims/:id/export-oracle returns valid Oracle schema', async () => {
      // Create price book with items
      const priceBook = await PriceBook.create({
        name: 'Oracle Export Test PB',
        utilityId: testData.utility._id,
        companyId: testData.company._id,
        effectiveDate: new Date('2026-01-01'),
        status: 'active',
        items: [
          { itemCode: 'POLE-40-2', description: 'Pole Install', category: 'overhead', unit: 'EA', unitPrice: 2500, isActive: true },
          { itemCode: 'TRENCH-STD', description: 'Trenching', category: 'civil', unit: 'LF', unitPrice: 45, isActive: true }
        ]
      });
      
      // Create unit entries (required for claim line items)
      const unit1 = await UnitEntry.create({
        jobId: testData.job._id,
        companyId: testData.company._id,
        priceBookId: priceBook._id,
        priceBookItemId: priceBook.items[0]._id,
        itemCode: 'POLE-40-2', description: '40ft Class 2 Pole Installation', category: 'overhead',
        quantity: 5, unit: 'EA', unitPrice: 2500, totalAmount: 12500,
        workDate: new Date('2026-01-15'), location: { latitude: 37.7749, longitude: -122.4194 },
        performedBy: { tier: 'prime', workCategory: 'electrical' },
        photos: [{ url: 'https://example.com/p1.jpg', fileName: 'p1.jpg', capturedAt: new Date() }],
        enteredBy: testData.foremanUser._id, status: 'approved'
      });
      
      const unit2 = await UnitEntry.create({
        jobId: testData.job._id,
        companyId: testData.company._id,
        priceBookId: priceBook._id,
        priceBookItemId: priceBook.items[1]._id,
        itemCode: 'TRENCH-STD', description: 'Standard Trenching', category: 'civil',
        quantity: 300, unit: 'LF', unitPrice: 45, totalAmount: 13500,
        workDate: new Date('2026-01-16'), location: { latitude: 37.7750, longitude: -122.4195 },
        performedBy: { tier: 'sub', subContractorName: 'ABC Civil', workCategory: 'civil' },
        photos: [{ url: 'https://example.com/p2.jpg', fileName: 'p2.jpg', capturedAt: new Date() }],
        enteredBy: testData.foremanUser._id, status: 'approved'
      });
      
      // Create complete claim
      const claim = await Claim.create({
        companyId: testData.company._id,
        jobId: testData.job._id,
        utilityId: testData.utility._id,
        claimType: 'progress',
        claimNumber: 'CLM-2026-00099',
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-01-31'),
        lineItems: [
          {
            unitEntryId: unit1._id,
            itemCode: 'POLE-40-2',
            description: '40ft Class 2 Pole Installation',
            quantity: 5,
            unit: 'EA',
            unitPrice: 2500,
            totalAmount: 12500,
            lineNumber: 1,
            workDate: new Date('2026-01-15'),
            photoCount: 5,
            hasGPS: true,
            performedByTier: 'prime'
          },
          {
            unitEntryId: unit2._id,
            itemCode: 'TRENCH-STD',
            description: 'Standard Trenching',
            quantity: 300,
            unit: 'LF',
            unitPrice: 45,
            totalAmount: 13500,
            lineNumber: 2,
            workDate: new Date('2026-01-16'),
            photoCount: 3,
            hasGPS: true,
            performedByTier: 'sub',
            subContractorName: 'ABC Civil'
          }
        ],
        subtotal: 26000,
        retentionRate: 0.10,
        retentionAmount: 2600,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 26000,
        amountDue: 23400,
        status: 'approved',
        createdBy: testData.pmUser._id
      });
      
      const res = await request(app)
        .get(`/api/billing/claims/${claim._id}/export-oracle`)
        .set('Authorization', `Bearer ${testData.pmToken}`);
      
      expect(res.status).toBe(200);
      
      const { payload } = res.body;
      
      // Verify Oracle Payables schema structure
      expect(payload).toHaveProperty('InvoiceNumber', 'CLM-2026-00099');
      // InvoiceAmount = amountDue (after retention: 26000 - 2600 = 23400)
      expect(payload).toHaveProperty('InvoiceAmount', 23400);
      expect(payload).toHaveProperty('PaymentTerms');
      expect(payload).toHaveProperty('lines');
      expect(payload.lines).toHaveLength(2);
      
      // Verify line item structure
      const line1 = payload.lines[0];
      expect(line1).toHaveProperty('LineNumber', 1);
      expect(line1).toHaveProperty('Amount', 12500);
      expect(line1).toHaveProperty('Quantity', 5);
      expect(line1).toHaveProperty('UnitPrice', 2500);
      expect(line1).toHaveProperty('Description');
      
      // Verify export tracking
      const updatedClaim = await Claim.findById(claim._id);
      expect(updatedClaim.oracle.exportStatus).toBe('exported');
      expect(updatedClaim.oracle.exportedAt).toBeDefined();
    });
    
    test('CSV export returns proper format', async () => {
      // Create price book with items
      const priceBook = await PriceBook.create({
        name: 'CSV Export Test PB',
        utilityId: testData.utility._id,
        companyId: testData.company._id,
        effectiveDate: new Date('2026-01-01'),
        status: 'active',
        items: [
          { itemCode: 'ITEM-1', description: 'Item 1', category: 'civil', unit: 'EA', unitPrice: 100, isActive: true },
          { itemCode: 'ITEM-2', description: 'Item 2', category: 'civil', unit: 'LF', unitPrice: 50, isActive: true }
        ]
      });
      
      // Create unit entries
      const unit1 = await UnitEntry.create({
        jobId: testData.job._id,
        companyId: testData.company._id,
        priceBookId: priceBook._id,
        priceBookItemId: priceBook.items[0]._id,
        itemCode: 'ITEM-1', description: 'Test Item One', category: 'civil',
        quantity: 10, unit: 'EA', unitPrice: 100, totalAmount: 1000,
        workDate: new Date(), location: { latitude: 37, longitude: -122 },
        performedBy: { tier: 'prime', workCategory: 'civil' },
        photos: [{ url: 'https://example.com/p.jpg', fileName: 'p.jpg', capturedAt: new Date() }],
        enteredBy: testData.foremanUser._id, status: 'approved'
      });
      
      const unit2 = await UnitEntry.create({
        jobId: testData.job._id,
        companyId: testData.company._id,
        priceBookId: priceBook._id,
        priceBookItemId: priceBook.items[1]._id,
        itemCode: 'ITEM-2', description: 'Test Item Two', category: 'civil',
        quantity: 5, unit: 'LF', unitPrice: 50, totalAmount: 250,
        workDate: new Date(), location: { latitude: 37, longitude: -122 },
        performedBy: { tier: 'prime', workCategory: 'civil' },
        photos: [{ url: 'https://example.com/p2.jpg', fileName: 'p2.jpg', capturedAt: new Date() }],
        enteredBy: testData.foremanUser._id, status: 'approved'
      });
      
      const claim = await Claim.create({
        companyId: testData.company._id,
        jobId: testData.job._id,
        claimNumber: 'CLM-2026-CSV-001',
        claimType: 'progress',
        lineItems: [
          { unitEntryId: unit1._id, lineNumber: 1, itemCode: 'ITEM-1', description: 'Test Item One', quantity: 10, unit: 'EA', unitPrice: 100, totalAmount: 1000 },
          { unitEntryId: unit2._id, lineNumber: 2, itemCode: 'ITEM-2', description: 'Test Item Two', quantity: 5, unit: 'LF', unitPrice: 50, totalAmount: 250 }
        ],
        subtotal: 1250,
        totalAmount: 1250,
        amountDue: 1250,
        createdBy: testData.pmUser._id
      });
      
      const res = await request(app)
        .get(`/api/billing/claims/${claim._id}/export-csv`)
        .set('Authorization', `Bearer ${testData.pmToken}`);
      
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toContain('CLM-2026-CSV-001.csv');
      
      // Parse CSV
      const lines = res.text.split('\n');
      expect(lines[0]).toContain('Line#,ItemCode,Description');
      expect(lines).toHaveLength(3); // Header + 2 data rows
    });
  });

  // ==========================================================================
  // FULL END-TO-END WORKFLOW
  // ==========================================================================
  
  describe('Full End-to-End Billing Workflow', () => {
    test('Complete workflow: Create Price Book → Unit Entries → Verify → Claim → Oracle Export', async () => {
      // Step 1: PM creates and activates price book
      const pbRes = await request(app)
        .post('/api/pricebooks')
        .set('Authorization', `Bearer ${testData.pmToken}`)
        .send({
          name: 'E2E Test Rate Sheet',
          utilityId: testData.utility._id.toString(),
          effectiveDate: '2026-01-01',
          items: [
            { itemCode: 'E2E-POLE', description: 'E2E Pole', category: 'overhead', unit: 'EA', unitPrice: 3000 },
            { itemCode: 'E2E-TRENCH', description: 'E2E Trench', category: 'civil', unit: 'LF', unitPrice: 50 }
          ]
        });
      expect(pbRes.status).toBe(201);
      const priceBookId = pbRes.body._id;
      
      // Activate it
      const activateRes = await request(app)
        .post(`/api/pricebooks/${priceBookId}/activate`)
        .set('Authorization', `Bearer ${testData.pmToken}`);
      expect(activateRes.status).toBe(200);
      
      const poleItemId = activateRes.body.items[0]._id;
      const trenchItemId = activateRes.body.items[1]._id;
      
      // Step 2: Foreman creates unit entries
      const unit1Res = await request(app)
        .post('/api/billing/units')
        .set('Authorization', `Bearer ${testData.foremanToken}`)
        .send({
          jobId: testData.job._id.toString(),
          priceBookId,
          priceBookItemId: poleItemId,
          quantity: 2,
          workDate: '2026-01-20',
          location: { latitude: 37.7749, longitude: -122.4194, accuracy: 3 },
          performedBy: { tier: 'prime', workCategory: 'electrical', foremanName: 'John' },
          photos: [{ url: 'https://example.com/e2e-1.jpg', fileName: 'e2e-1.jpg', photoType: 'after', capturedAt: new Date() }]
        });
      expect(unit1Res.status).toBe(201);
      const unit1Id = unit1Res.body._id;
      
      const unit2Res = await request(app)
        .post('/api/billing/units')
        .set('Authorization', `Bearer ${testData.foremanToken}`)
        .send({
          jobId: testData.job._id.toString(),
          priceBookId,
          priceBookItemId: trenchItemId,
          quantity: 100,
          workDate: '2026-01-21',
          location: { latitude: 37.7750, longitude: -122.4195, accuracy: 4 },
          performedBy: { tier: 'sub', subContractorName: 'E2E Civil Co', workCategory: 'civil' },
          photos: [{ url: 'https://example.com/e2e-2.jpg', fileName: 'e2e-2.jpg', photoType: 'during', capturedAt: new Date() }]
        });
      expect(unit2Res.status).toBe(201);
      const unit2Id = unit2Res.body._id;
      
      // Step 3: Submit units
      await request(app)
        .post(`/api/billing/units/${unit1Id}/submit`)
        .set('Authorization', `Bearer ${testData.foremanToken}`);
      await request(app)
        .post(`/api/billing/units/${unit2Id}/submit`)
        .set('Authorization', `Bearer ${testData.foremanToken}`);
      
      // Step 4: GF verifies
      await request(app)
        .post(`/api/billing/units/${unit1Id}/verify`)
        .set('Authorization', `Bearer ${testData.gfToken}`);
      await request(app)
        .post(`/api/billing/units/${unit2Id}/verify`)
        .set('Authorization', `Bearer ${testData.gfToken}`);
      
      // Step 5: PM approves
      await request(app)
        .post(`/api/billing/units/${unit1Id}/approve`)
        .set('Authorization', `Bearer ${testData.pmToken}`);
      await request(app)
        .post(`/api/billing/units/${unit2Id}/approve`)
        .set('Authorization', `Bearer ${testData.pmToken}`);
      
      // Step 6: Create claim
      const claimRes = await request(app)
        .post('/api/billing/claims')
        .set('Authorization', `Bearer ${testData.pmToken}`)
        .send({
          unitIds: [unit1Id, unit2Id],
          periodStart: '2026-01-01',
          periodEnd: '2026-01-31'
        });
      
      expect(claimRes.status).toBe(201);
      expect(claimRes.body.lineItems).toHaveLength(2);
      expect(claimRes.body.subtotal).toBe(11000); // (2*3000) + (100*50)
      const claimId = claimRes.body._id;
      
      // Step 7: Approve and submit claim
      await request(app)
        .post(`/api/billing/claims/${claimId}/approve`)
        .set('Authorization', `Bearer ${testData.pmToken}`);
      
      await request(app)
        .post(`/api/billing/claims/${claimId}/submit`)
        .set('Authorization', `Bearer ${testData.pmToken}`)
        .send({ submissionMethod: 'email', dueDate: '2026-03-01' });
      
      // Step 8: Export to Oracle
      const oracleRes = await request(app)
        .get(`/api/billing/claims/${claimId}/export-oracle`)
        .set('Authorization', `Bearer ${testData.pmToken}`);
      
      expect(oracleRes.status).toBe(200);
      expect(oracleRes.body.payload.InvoiceAmount).toBe(11000);
      expect(oracleRes.body.payload.lines).toHaveLength(2);
      
      // Verify line items have correct data
      const lines = oracleRes.body.payload.lines;
      expect(lines.find(l => l.Amount === 6000)).toBeDefined(); // 2 poles @ 3000
      expect(lines.find(l => l.Amount === 5000)).toBeDefined(); // 100 LF trench @ 50
      
      // Step 9: Record payment
      const paymentRes = await request(app)
        .post(`/api/billing/claims/${claimId}/payment`)
        .set('Authorization', `Bearer ${testData.pmToken}`)
        .send({
          amount: 11000,
          paymentMethod: 'wire',
          referenceNumber: 'WIRE-E2E-001'
        });
      
      expect(paymentRes.status).toBe(200);
      expect(paymentRes.body.status).toBe('paid');
      expect(paymentRes.body.balanceDue).toBe(0);
      
      // Verify units are marked as paid
      const finalUnit1 = await UnitEntry.findById(unit1Id);
      expect(finalUnit1.status).toBe('paid');
    });
  });
});

