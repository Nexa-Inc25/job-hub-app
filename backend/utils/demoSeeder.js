/**
 * FieldLedger - Demo Data Seeder
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Generates realistic sample data for demo sessions.
 * All data uses fake names, addresses, and identifiers
 * that cannot be confused with real customer data.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const Company = require('../models/Company');
const User = require('../models/User');
const Job = require('../models/Job');
const LME = require('../models/LME');

// Generate unique session ID
const generateSessionId = () => {
  return `demo_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
};

// Sample data constants - clearly fake
const DEMO_COMPANY = {
  name: 'Valley Electric Contractors',
  slug: null, // Will be generated with session ID
  email: 'demo@valleyelectric.example',
  phone: '(555) 123-4567',
  address: '1234 Demo Boulevard',
  city: 'Demoville',
  state: 'CA',
  zip: '94500',
  contractorLicense: 'DEMO-123456'
};

const DEMO_USER = {
  email: null, // Will be generated with session ID
  password: 'Demo123!',
  name: 'Demo User',
  role: 'admin',
  isAdmin: true,
  canApprove: true
};

// Sample crew members for LMEs - uses craft codes matching LME schema
const DEMO_CREW = [
  { name: 'John Smith', craft: 'JL', classification: 'Journeyman Lineman', rate: 85 },
  { name: 'Maria Garcia', craft: 'F', classification: 'Foreman', rate: 95 },
  { name: 'David Chen', craft: 'AL', classification: 'Apprentice Lineman', rate: 55 },
  { name: 'Sarah Johnson', craft: 'EO', classification: 'Equipment Operator', rate: 75 },
  { name: 'Michael Brown', craft: 'GM', classification: 'Groundman', rate: 45 }
];

// Sample jobs with various statuses
const DEMO_JOBS = [
  {
    pmNumber: '35440499',
    woNumber: 'WO-2026-0001',
    notificationNumber: '126940001',
    matCode: '2AA',
    title: 'Pole Replacement - Oak Street',
    address: '123 Oak Street',
    city: 'Walnut Creek',
    client: 'Pacific Power Co.',
    status: 'in_progress',
    division: 'DA',
    projectName: 'Grid Modernization Phase 1',
    orderType: 'E460',
    description: 'Replace aging wooden pole with new composite pole. Install new transformer.',
    jobScope: {
      summary: 'Remove existing 45ft Class 3 wooden pole and install new 50ft composite pole with 25kVA transformer',
      workType: 'Pole Replacement',
      equipment: ['50ft Composite Pole', '25kVA Transformer', '1/0 AL Conductor'],
      footage: '75 ft OH',
      voltage: '12kV Primary',
      phases: '1-phase'
    }
  },
  {
    pmNumber: '35611234',
    woNumber: 'WO-2026-0002',
    notificationNumber: '126940002',
    matCode: '3BB',
    title: 'Service Upgrade - Maple Ave',
    address: '456 Maple Avenue',
    city: 'Concord',
    client: 'Pacific Power Co.',
    status: 'new',
    division: 'DA',
    projectName: 'Residential Service Upgrades',
    orderType: 'E420',
    description: 'Upgrade residential service from 100A to 200A panel.',
    jobScope: {
      summary: 'Upgrade service entrance from 100A to 200A, replace meter socket and weatherhead',
      workType: 'Service Upgrade',
      equipment: ['200A Meter Socket', 'Service Entrance Cable 4/0'],
      footage: '25 ft',
      voltage: '120/240V Secondary',
      phases: '1-phase'
    }
  },
  {
    pmNumber: '35622345',
    woNumber: 'WO-2026-0003',
    notificationNumber: '126940003',
    matCode: '4CC',
    title: 'Underground Conversion - Pine Blvd',
    address: '789 Pine Boulevard',
    city: 'Martinez',
    client: 'Pacific Power Co.',
    status: 'completed',
    division: 'DB',
    projectName: 'Rule 20A Undergrounding',
    orderType: 'E480',
    description: 'Convert overhead distribution to underground per Rule 20A.',
    jobScope: {
      summary: 'Install 350ft underground primary in new conduit system, remove overhead facilities',
      workType: 'Underground Conversion',
      equipment: ['4" PVC Conduit', '1/0 AL URD Cable', 'Padmount Transformer 50kVA'],
      footage: '350 ft UG',
      voltage: '12kV Primary',
      phases: '3-phase'
    }
  },
  {
    pmNumber: '35633456',
    woNumber: 'WO-2026-0004',
    notificationNumber: '126940004',
    matCode: '5DD',
    title: 'Transformer Install - Cedar Lane',
    address: '321 Cedar Lane',
    city: 'Antioch',
    client: 'Pacific Power Co.',
    status: 'stuck',
    stuckReason: 'Waiting for city permit approval - resubmitted 2/1/2026',
    division: 'DA',
    projectName: 'Commercial Development',
    orderType: 'E460',
    description: 'Install new 3-phase padmount transformer for commercial building.',
    jobScope: {
      summary: 'Install 300kVA 3-phase padmount transformer with concrete pad and secondary service',
      workType: 'New Construction',
      equipment: ['300kVA Padmount Transformer', '500 MCM AL Secondary'],
      footage: '150 ft UG',
      voltage: '480V 3-phase',
      phases: '3-phase'
    }
  },
  {
    pmNumber: '35644567',
    woNumber: 'WO-2026-0005',
    notificationNumber: '126940005',
    matCode: '6EE',
    title: 'Street Light Installation - Birch Road',
    address: '654 Birch Road',
    city: 'Pittsburg',
    client: 'Pacific Power Co.',
    status: 'pending',
    division: 'DC',
    projectName: 'Street Lighting Project',
    orderType: 'L100',
    description: 'Install 10 new LED street lights along Birch Road.',
    jobScope: {
      summary: 'Install 10 new 100W LED cobra head fixtures on existing utility poles',
      workType: 'Street Lighting',
      equipment: ['100W LED Cobra Head (10)', 'Photocell Controls (10)'],
      footage: '2000 ft circuit',
      voltage: '240V',
      phases: '1-phase'
    }
  }
];

// Default folder structure for demo jobs
const DEFAULT_FOLDERS = [
  {
    name: 'ACI',
    documents: [],
    subfolders: [
      { name: 'Close Out Documents', documents: [], subfolders: [] },
      { name: 'Field As Built', documents: [], subfolders: [] },
      { name: 'Field Reports', documents: [], subfolders: [] },
      { name: 'Photos', documents: [], subfolders: [] },
      { 
        name: 'Pre-Field Documents', 
        documents: [],
        subfolders: [
          { name: 'Job Photos', documents: [], subfolders: [] },
          { name: 'Construction Sketches', documents: [], subfolders: [] },
          { name: 'Circuit Maps', documents: [], subfolders: [] }
        ]
      },
      { name: 'General Forms', documents: [], subfolders: [] },
      { name: 'GF Audit', documents: [], subfolders: [] }
    ]
  },
  {
    name: 'UCS',
    documents: [],
    subfolders: [
      { name: 'Dispatch Docs', documents: [], subfolders: [] },
      { name: 'Civil Plans', documents: [], subfolders: [] },
      { name: 'Photos', documents: [], subfolders: [] },
      { name: 'Time Sheets', documents: [], subfolders: [] }
    ]
  },
  {
    name: 'UTCS',
    documents: [],
    subfolders: [
      { name: 'Dispatch Docs', documents: [], subfolders: [] },
      { name: 'No Parks', documents: [], subfolders: [] },
      { name: 'Photos', documents: [], subfolders: [] },
      { name: 'Time Sheets', documents: [], subfolders: [] },
      { 
        name: 'TCP',
        documents: [],
        subfolders: [
          { name: 'TCP Maps', documents: [], subfolders: [] }
        ]
      }
    ]
  }
];

/**
 * Create a new demo session with isolated data
 * @param {Object} options - Session options
 * @param {number} options.sessionHours - Hours until session expires
 * @returns {Promise<Object>} Demo session with company, user, and jobs
 */
async function createDemoSession(options = {}) {
  const { sessionHours = 2 } = options;
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + sessionHours * 60 * 60 * 1000);
  
  console.log(`Creating demo session: ${sessionId}`);
  
  // Create demo company
  const company = await Company.create({
    ...DEMO_COMPANY,
    slug: `demo-${sessionId}`,
    isDemo: true,
    demoSessionId: sessionId,
    demoExpiresAt: expiresAt,
    subscription: {
      plan: 'enterprise',
      seats: 100,
      status: 'active'
    }
  });
  
  // Create demo user
  const hashedPassword = await bcrypt.hash(DEMO_USER.password, 10);
  const user = await User.create({
    ...DEMO_USER,
    email: `demo-${sessionId}@fieldledger.demo`,
    password: hashedPassword,
    companyId: company._id,
    isDemo: true,
    demoSessionId: sessionId,
    demoExpiresAt: expiresAt
  });
  
  // Create sample jobs
  const jobs = [];
  for (const jobData of DEMO_JOBS) {
    const job = await Job.create({
      ...jobData,
      companyId: company._id,
      userId: user._id,
      isDemo: true,
      demoSessionId: sessionId,
      folders: structuredClone(DEFAULT_FOLDERS),
      createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000), // Random date in last week
    });
    jobs.push(job);
  }
  
  // Create sample LMEs for in_progress job
  const lmes = [];
  const inProgressJob = jobs.find(j => j.status === 'in_progress');
  if (inProgressJob) {
    const today = new Date();
    const lmeNumber = `${inProgressJob.pmNumber}-${today.toISOString().slice(0, 10).replaceAll('-', '')}`;
    
    const lme = await LME.create({
      jobId: inProgressJob._id,
      companyId: company._id,
      lmeNumber,
      date: today,
      status: 'draft',
      isDemo: true,
      demoSessionId: sessionId,
      jobInfo: {
        pmNumber: inProgressJob.pmNumber,
        woNumber: inProgressJob.woNumber,
        notificationNumber: inProgressJob.notificationNumber,
        address: inProgressJob.address,
        city: inProgressJob.city,
      },
      workDescription: 'Pole replacement and transformer install',
      startTime: '07:00',
      endTime: '15:30',
      labor: DEMO_CREW.map((crew, idx) => {
        const stHours = idx === 0 ? 8 : 6 + Math.floor(Math.random() * 3);
        const otHours = idx < 2 ? 2 : 0;
        const stAmount = stHours * crew.rate;
        const otAmount = otHours * crew.rate * 1.5;
        return {
          name: crew.name,
          craft: crew.craft,
          rate: crew.rate,
          stHours,
          otHours,
          dtHours: 0,
          stAmount,
          otAmount,
          dtAmount: 0,
          totalAmount: stAmount + otAmount,
          missedMeals: idx === 0 ? 1 : 0,
          subsistence: 1
        };
      }),
      equipment: [
        { type: 'Digger Derrick Truck', unitNumber: 'DD-101', hours: 8, rate: 150, amount: 1200 },
        { type: 'Aerial Lift', unitNumber: 'AL-205', hours: 4, rate: 85, amount: 340 }
      ],
      materials: [
        { description: '50ft Composite Pole', quantity: 1, unit: 'EA', unitCost: 2500, amount: 2500 },
        { description: '1/0 AL Conductor', quantity: 150, unit: 'FT', unitCost: 3.5, amount: 525 }
      ],
      totals: {
        labor: 3500,
        material: 3025,
        equipment: 1540,
        grand: 8065
      }
    });
    lmes.push(lme);
  }
  
  console.log(`Demo session created: ${sessionId} with ${jobs.length} jobs`);
  
  return {
    sessionId,
    expiresAt,
    company,
    user,
    jobs,
    lmes
  };
}

/**
 * Reset an existing demo session to fresh state
 * @param {string} sessionId - The demo session ID
 * @returns {Promise<Object|null>} Updated session or null if not found
 */
async function resetDemoSession(sessionId) {
  console.log(`Resetting demo session: ${sessionId}`);
  
  // Find the demo company
  const company = await Company.findOne({ 
    demoSessionId: sessionId,
    isDemo: true,
    demoExpiresAt: { $gt: new Date() }
  });
  
  if (!company) {
    console.log(`Demo session not found or expired: ${sessionId}`);
    return null;
  }
  
  // Find the demo user
  const user = await User.findOne({ 
    demoSessionId: sessionId,
    isDemo: true 
  });
  
  if (!user) {
    return null;
  }
  
  // Delete existing demo data for this session
  await Job.deleteMany({ demoSessionId: sessionId });
  await LME.deleteMany({ demoSessionId: sessionId });
  
  // Recreate sample jobs
  const jobs = [];
  for (const jobData of DEMO_JOBS) {
    const job = await Job.create({
      ...jobData,
      companyId: company._id,
      userId: user._id,
      isDemo: true,
      demoSessionId: sessionId,
      folders: structuredClone(DEFAULT_FOLDERS),
      createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
    });
    jobs.push(job);
  }
  
  // Recreate sample LMEs
  const lmes = [];
  const inProgressJob = jobs.find(j => j.status === 'in_progress');
  if (inProgressJob) {
    const today = new Date();
    const lmeNumber = `${inProgressJob.pmNumber}-${today.toISOString().slice(0, 10).replaceAll('-', '')}`;
    
    const lme = await LME.create({
      jobId: inProgressJob._id,
      companyId: company._id,
      lmeNumber,
      date: today,
      status: 'draft',
      isDemo: true,
      demoSessionId: sessionId,
      jobInfo: {
        pmNumber: inProgressJob.pmNumber,
        woNumber: inProgressJob.woNumber,
        notificationNumber: inProgressJob.notificationNumber,
        address: inProgressJob.address,
        city: inProgressJob.city,
      },
      workDescription: 'Pole replacement and transformer install',
      startTime: '07:00',
      endTime: '15:30',
      labor: DEMO_CREW.map((crew, idx) => {
        const stHours = idx === 0 ? 8 : 6 + Math.floor(Math.random() * 3);
        const otHours = idx < 2 ? 2 : 0;
        const stAmount = stHours * crew.rate;
        const otAmount = otHours * crew.rate * 1.5;
        return {
          name: crew.name,
          craft: crew.craft,
          rate: crew.rate,
          stHours,
          otHours,
          dtHours: 0,
          stAmount,
          otAmount,
          dtAmount: 0,
          totalAmount: stAmount + otAmount,
          missedMeals: idx === 0 ? 1 : 0,
          subsistence: 1
        };
      }),
      equipment: [
        { type: 'Digger Derrick Truck', unitNumber: 'DD-101', hours: 8, rate: 150, amount: 1200 },
        { type: 'Aerial Lift', unitNumber: 'AL-205', hours: 4, rate: 85, amount: 340 }
      ],
      materials: [
        { description: '50ft Composite Pole', quantity: 1, unit: 'EA', unitCost: 2500, amount: 2500 },
        { description: '1/0 AL Conductor', quantity: 150, unit: 'FT', unitCost: 3.5, amount: 525 }
      ],
      totals: {
        labor: 3500,
        material: 3025,
        equipment: 1540,
        grand: 8065
      }
    });
    lmes.push(lme);
  }
  
  console.log(`Demo session reset: ${sessionId} with ${jobs.length} jobs`);
  
  return {
    sessionId,
    company,
    user,
    jobs,
    lmes
  };
}

module.exports = {
  createDemoSession,
  resetDemoSession,
  DEMO_JOBS,
  DEMO_CREW
};

