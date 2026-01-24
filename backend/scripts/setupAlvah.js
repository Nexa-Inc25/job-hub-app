/**
 * Setup script for Alvah contractor company
 * 
 * Run with: node scripts/setupAlvah.js
 * 
 * EDIT THE USER DETAILS BELOW BEFORE RUNNING!
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Company = require('../models/Company');
const User = require('../models/User');

// ============================================
// EDIT THESE USER DETAILS BEFORE RUNNING
// ============================================

const COMPANY_INFO = {
  name: 'Alvah',
  email: 'info@alvah.com',  // Company contact email
  phone: '',                 // Company phone (optional)
  address: '',               // Company address (optional)
  city: '',
  state: 'CA',
  zip: '',
};

const USERS = [
  {
    email: 'leek@alvah.com',
    name: 'Lee Kizer',
    password: 'Alvah2025!',       // <-- CHANGE PASSWORD IF NEEDED
    role: 'gf',                   // General Foreman
    isAdmin: false,
    canApprove: true,             // GF can approve
  },
  {
    email: 'mattf@alvah.com',
    name: 'Matt Ferrier',
    password: 'Alvah2025!',       // <-- CHANGE PASSWORD IF NEEDED
    role: 'foreman',
    isAdmin: false,
    canApprove: false,
  },
  {
    email: 'stephens@alvah.com',
    name: 'Stephen Shay',
    password: 'Alvah2025!',       // <-- CHANGE PASSWORD IF NEEDED
    role: 'foreman',
    isAdmin: false,
    canApprove: false,
  },
  {
    email: 'joeb@alvah.com',
    name: 'Joe Bodner',
    password: 'Alvah2025!',       // <-- CHANGE PASSWORD IF NEEDED
    role: 'foreman',
    isAdmin: false,
    canApprove: false,
  },
];

// ============================================
// SETUP SCRIPT - DO NOT EDIT BELOW
// ============================================

async function setupAlvah() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable is not set');
    }
    
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Check if company already exists
    let company = await Company.findOne({ name: COMPANY_INFO.name });
    
    if (company) {
      console.log(`Company "${COMPANY_INFO.name}" already exists with ID: ${company._id}`);
    } else {
      // Create the company
      company = new Company({
        ...COMPANY_INFO,
        subscription: {
          plan: 'starter',
          seats: 10,
          status: 'active'
        },
        settings: {
          timezone: 'America/Los_Angeles',
          defaultDivision: 'DA'
        },
        isActive: true
      });
      
      await company.save();
      console.log(`✅ Company "${company.name}" created with ID: ${company._id}`);
    }

    // Create users
    console.log('\nCreating users...\n');
    
    for (const userData of USERS) {
      // Check if user already exists
      const existingUser = await User.findOne({ email: userData.email });
      
      if (existingUser) {
        console.log(`⚠️  User ${userData.email} already exists - skipping`);
        
        // Update companyId if not set
        if (!existingUser.companyId) {
          existingUser.companyId = company._id;
          await existingUser.save();
          console.log(`   Updated companyId for ${userData.email}`);
        }
        continue;
      }
      
      // Create new user
      const user = new User({
        email: userData.email,
        name: userData.name,
        password: userData.password,  // Will be hashed by pre-save hook
        role: userData.role,
        isAdmin: userData.isAdmin,
        canApprove: userData.canApprove,
        companyId: company._id,
        userType: 'contractor'
      });
      
      await user.save();
      console.log(`✅ Created ${userData.role.toUpperCase().padEnd(7)} - ${userData.email} (${userData.name})`);
    }

    console.log('\n========================================');
    console.log('SETUP COMPLETE!');
    console.log('========================================');
    console.log(`Company ID: ${company._id}`);
    console.log(`Company Name: ${company.name}`);
    console.log(`Users Created: ${USERS.length}`);
    console.log('\nUsers can now log in with their email and password.');
    console.log('========================================\n');

  } catch (error) {
    console.error('Setup failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the setup
setupAlvah();
