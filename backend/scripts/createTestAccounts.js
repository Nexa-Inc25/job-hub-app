/**
 * Create Test Accounts Script
 * 
 * Run this script to create test company with admin and user accounts
 * Usage: node scripts/createTestAccounts.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const Company = require('../models/Company');
const Utility = require('../models/Utility');

async function createTestAccounts() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected!\n');

    // Find PG&E utility
    const pgeUtility = await Utility.findOne({ slug: 'pge' });
    if (!pgeUtility) {
      console.error('PG&E utility not found. Run the server first to create it.');
      process.exit(1);
    }

    // Check if test company already exists
    let testCompany = await Company.findOne({ slug: 'test-contractors' });
    
    if (!testCompany) {
      console.log('Creating Test Company...');
      testCompany = await Company.create({
        name: 'Test Contractors Inc',
        slug: 'test-contractors',
        email: 'admin@testcontractors.com',
        phone: '(555) 123-4567',
        address: '123 Test Street',
        city: 'San Francisco',
        state: 'CA',
        zip: '94102',
        utilities: [pgeUtility._id],
        defaultUtility: pgeUtility._id,
        subscription: {
          plan: 'pro',
          seats: 10,
          status: 'active'
        },
        isActive: true
      });
      console.log('✅ Created company:', testCompany.name);
    } else {
      console.log('Test company already exists:', testCompany.name);
    }

    // Test accounts to create
    const testUsers = [
      {
        email: 'admin@test.com',
        password: 'Test123!',
        name: 'Test Admin',
        role: 'admin',
        isAdmin: true,
        canApprove: true
      },
      {
        email: 'pm@test.com',
        password: 'Test123!',
        name: 'Test Project Manager',
        role: 'pm',
        isAdmin: true,
        canApprove: true
      },
      {
        email: 'gf@test.com',
        password: 'Test123!',
        name: 'Test General Foreman',
        role: 'gf',
        isAdmin: true,
        canApprove: true
      },
      {
        email: 'foreman@test.com',
        password: 'Test123!',
        name: 'Test Foreman',
        role: 'foreman',
        isAdmin: false,
        canApprove: false
      },
      {
        email: 'crew@test.com',
        password: 'Test123!',
        name: 'Test Crew Member',
        role: 'crew',
        isAdmin: false,
        canApprove: false
      }
    ];

    console.log('\nCreating test users...\n');

    for (const userData of testUsers) {
      // Check if user already exists
      const existingUser = await User.findOne({ email: userData.email });
      
      if (existingUser) {
        // Update existing user with company and role
        existingUser.companyId = testCompany._id;
        existingUser.role = userData.role;
        existingUser.isAdmin = userData.isAdmin;
        existingUser.canApprove = userData.canApprove;
        existingUser.name = userData.name;
        await existingUser.save();
        console.log(`📝 Updated: ${userData.email} (${userData.role})`);
      } else {
        // Create new user
        const newUser = new User({
          ...userData,
          companyId: testCompany._id,
          userType: 'contractor'
        });
        await newUser.save();
        console.log(`✅ Created: ${userData.email} (${userData.role})`);
      }
    }

    // Set company owner to admin
    testCompany.ownerId = (await User.findOne({ email: 'admin@test.com' }))._id;
    await testCompany.save();

    console.log('\n========================================');
    console.log('TEST ACCOUNTS READY!');
    console.log('========================================\n');
    console.log('Company: Test Contractors Inc');
    console.log('');
    console.log('Login credentials (all use password: Test123!):\n');
    console.log('  ADMIN (full access):');
    console.log('    Email: admin@test.com');
    console.log('    Role: admin - Can do everything\n');
    console.log('  PROJECT MANAGER:');
    console.log('    Email: pm@test.com');
    console.log('    Role: pm - Can approve docs, manage jobs\n');
    console.log('  GENERAL FOREMAN:');
    console.log('    Email: gf@test.com');
    console.log('    Role: gf - Can approve docs, assign crews\n');
    console.log('  FOREMAN:');
    console.log('    Email: foreman@test.com');
    console.log('    Role: foreman - Can edit docs (saves as DRAFT)\n');
    console.log('  CREW MEMBER:');
    console.log('    Email: crew@test.com');
    console.log('    Role: crew - Limited access\n');
    console.log('========================================\n');

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

createTestAccounts();
