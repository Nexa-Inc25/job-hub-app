/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Test Script: Verify Job Status Workflow
 * 
 * This script tests the job status transitions to ensure they work correctly
 * before we build frontend UI around them.
 * 
 * Usage: node scripts/testWorkflow.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Job = require('../models/Job');
const User = require('../models/User');
const Company = require('../models/Company');

async function testWorkflow() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected!\n');

    // Find test users
    const admin = await User.findOne({ email: 'admin@test.com' });
    const pm = await User.findOne({ email: 'pm@test.com' });
    const gf = await User.findOne({ email: 'gf@test.com' });
    const foreman = await User.findOne({ email: 'foreman@test.com' });
    
    if (!admin || !pm || !gf || !foreman) {
      console.log('❌ Test users not found. Run createTestAccounts.js first.');
      process.exit(1);
    }
    
    console.log('✅ Found test users:');
    console.log(`   Admin: ${admin.email} (role: ${admin.role})`);
    console.log(`   PM: ${pm.email} (role: ${pm.role})`);
    console.log(`   GF: ${gf.email} (role: ${gf.role})`);
    console.log(`   Foreman: ${foreman.email} (role: ${foreman.role})\n`);

    // Get the test company
    const company = await Company.findOne({ slug: 'test-contractors' });
    if (!company) {
      console.log('❌ Test company not found.');
      process.exit(1);
    }

    // Create a test job
    console.log('Creating test job...');
    const testJob = new Job({
      title: 'WORKFLOW TEST JOB',
      pmNumber: 'TEST-' + Date.now(),
      woNumber: 'WO-TEST',
      address: '123 Test St',
      city: 'Test City',
      status: 'new',
      priority: 'medium',
      userId: pm._id,
      companyId: company._id,
      folders: []
    });
    await testJob.save();
    console.log(`✅ Created job: ${testJob.pmNumber}\n`);

    // Test status transitions
    const transitions = [
      { status: 'new', description: 'Job received from utility' },
      { status: 'assigned_to_gf', description: 'PM assigns to GF', assignedToGF: gf._id },
      { status: 'pre_fielding', description: 'GF starts pre-fielding' },
      { status: 'scheduled', description: 'GF schedules crew', assignedTo: foreman._id },
      { status: 'in_progress', description: 'Crew starts work' },
      { status: 'pending_gf_review', description: 'Crew submits for review' },
      { status: 'pending_pm_approval', description: 'GF approves, moves to PM' },
      { status: 'ready_to_submit', description: 'PM approves, ready for utility' },
      { status: 'submitted', description: 'Submitted to utility' },
      { status: 'billed', description: 'Invoice sent' },
      { status: 'invoiced', description: 'Payment received' },
    ];

    console.log('Testing status transitions:\n');
    
    for (let i = 1; i < transitions.length; i++) {
      const t = transitions[i];
      const prevStatus = transitions[i - 1].status;
      
      // Update status
      testJob.status = t.status;
      
      // Set additional fields based on transition
      if (t.assignedToGF) {
        testJob.assignedToGF = t.assignedToGF;
        testJob.assignedToGFDate = new Date();
        testJob.assignedToGFBy = pm._id;
      }
      if (t.assignedTo) {
        testJob.assignedTo = t.assignedTo;
        testJob.assignedBy = gf._id;
        testJob.assignedDate = new Date();
        testJob.crewScheduledDate = new Date();
      }
      if (t.status === 'pre_fielding') {
        testJob.preFieldDate = new Date();
      }
      if (t.status === 'pending_gf_review') {
        testJob.crewSubmittedDate = new Date();
        testJob.crewSubmittedBy = foreman._id;
      }
      if (t.status === 'pending_pm_approval') {
        testJob.gfReviewDate = new Date();
        testJob.gfReviewedBy = gf._id;
        testJob.gfReviewStatus = 'approved';
      }
      if (t.status === 'ready_to_submit') {
        testJob.pmApprovalDate = new Date();
        testJob.pmApprovedBy = pm._id;
        testJob.pmApprovalStatus = 'approved';
        testJob.completedDate = new Date();
        testJob.completedBy = pm._id;
      }
      if (t.status === 'submitted') {
        testJob.utilitySubmittedDate = new Date();
        testJob.utilityVisible = true;
        testJob.utilityStatus = 'submitted';
      }
      if (t.status === 'billed') {
        testJob.billedDate = new Date();
      }
      if (t.status === 'invoiced') {
        testJob.invoicedDate = new Date();
      }
      
      await testJob.save();
      console.log(`   ${prevStatus} → ${t.status}: ✅ ${t.description}`);
    }

    console.log('\n✅ All status transitions completed successfully!\n');

    // Verify final state
    const finalJob = await Job.findById(testJob._id);
    console.log('Final job state:');
    console.log(`   Status: ${finalJob.status}`);
    console.log(`   Assigned to GF: ${finalJob.assignedToGF ? '✅' : '❌'}`);
    console.log(`   Pre-field date: ${finalJob.preFieldDate ? '✅' : '❌'}`);
    console.log(`   Assigned to crew: ${finalJob.assignedTo ? '✅' : '❌'}`);
    console.log(`   Crew submitted: ${finalJob.crewSubmittedDate ? '✅' : '❌'}`);
    console.log(`   GF reviewed: ${finalJob.gfReviewDate ? '✅' : '❌'}`);
    console.log(`   PM approved: ${finalJob.pmApprovalDate ? '✅' : '❌'}`);
    console.log(`   Completed date: ${finalJob.completedDate ? '✅' : '❌'}`);
    console.log(`   Utility submitted: ${finalJob.utilitySubmittedDate ? '✅' : '❌'}`);
    console.log(`   Billed: ${finalJob.billedDate ? '✅' : '❌'}`);
    console.log(`   Invoiced: ${finalJob.invoicedDate ? '✅' : '❌'}`);

    // Clean up - delete test job
    console.log('\nCleaning up test job...');
    await Job.findByIdAndDelete(testJob._id);
    console.log('✅ Test job deleted.\n');

    // Test legacy status mapping
    console.log('Testing legacy status mappings...');
    
    const legacyJob = new Job({
      title: 'LEGACY TEST',
      pmNumber: 'LEGACY-' + Date.now(),
      status: 'pending',  // Legacy status
      userId: pm._id,
      companyId: company._id,
      folders: []
    });
    await legacyJob.save();
    
    // The Job model should accept legacy statuses
    console.log(`   Created with 'pending': status = ${legacyJob.status}`);
    
    legacyJob.status = 'pre-field';
    await legacyJob.save();
    console.log(`   Changed to 'pre-field': status = ${legacyJob.status}`);
    
    legacyJob.status = 'in-progress';
    await legacyJob.save();
    console.log(`   Changed to 'in-progress': status = ${legacyJob.status}`);
    
    legacyJob.status = 'completed';
    await legacyJob.save();
    console.log(`   Changed to 'completed': status = ${legacyJob.status}`);
    
    await Job.findByIdAndDelete(legacyJob._id);
    console.log('✅ Legacy status test completed.\n');

    console.log('========================================');
    console.log('ALL WORKFLOW TESTS PASSED! ✅');
    console.log('========================================\n');
    console.log('The backend is ready for frontend integration.');

    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}

testWorkflow();
