/**
 * Setup Super Admin accounts for FieldLedger platform owners
 * 
 * Run: node scripts/setupSuperAdmins.js
 * 
 * This creates/updates the three FieldLedger owner accounts with Super Admin privileges.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ========================================
// CONFIGURE THESE - FieldLedger Owner Accounts
// ========================================
const SUPER_ADMINS = [
  {
    name: 'Mike Moore',
    email: 'mike.v.moore@protonmail.com',
    password: 'JobHub2024!Mike',
    role: 'admin',
    title: 'Founder & CEO'
  },
  {
    name: 'Spencer Cook', 
    email: 'spencercook21@yahoo.com',
    password: 'JobHub2024!Spencer',
    role: 'admin',
    title: 'Founder'
  },
  {
    name: 'David Zeh',
    email: 'davidz@alvah.com',
    password: 'JobHub2024!David',
    role: 'admin', 
    title: 'COO'
  }
];

async function setupSuperAdmins() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected!\n');

    const User = require('../models/User');
    
    console.log('========================================');
    console.log('Setting up FieldLedger Super Admin accounts');
    console.log('========================================\n');

    for (const admin of SUPER_ADMINS) {
      // Check if user already exists
      let user = await User.findOne({ email: admin.email.toLowerCase() });
      
      if (user) {
        // Update existing user to be Super Admin
        user.isSuperAdmin = true;
        user.isAdmin = true;
        user.canApprove = true;
        user.role = admin.role;
        user.name = admin.name;
        await user.save();
        
        console.log(`✅ UPDATED: ${admin.name} (${admin.title})`);
        console.log(`   Email: ${admin.email}`);
        console.log(`   Password: (unchanged - use existing password)`);
        console.log(`   Super Admin: ✓\n`);
      } else {
        // Create new Super Admin user
        const hashedPassword = await bcrypt.hash(admin.password, 10);
        
        user = new User({
          email: admin.email.toLowerCase(),
          password: hashedPassword,
          name: admin.name,
          role: admin.role,
          isAdmin: true,
          isSuperAdmin: true,
          canApprove: true,
          userType: 'contractor'
        });
        
        // Skip the pre-save hook since we already hashed
        await User.collection.insertOne(user);
        
        console.log(`✅ CREATED: ${admin.name} (${admin.title})`);
        console.log(`   Email: ${admin.email}`);
        console.log(`   Password: ${admin.password}`);
        console.log(`   Super Admin: ✓\n`);
      }
    }

    console.log('========================================');
    console.log('LOGIN CREDENTIALS SUMMARY');
    console.log('========================================\n');
    
    for (const admin of SUPER_ADMINS) {
      const user = await User.findOne({ email: admin.email.toLowerCase() });
      console.log(`${admin.name} (${admin.title})`);
      console.log(`  Email:    ${admin.email}`);
      console.log(`  Password: ${user ? '(use password above or existing)' : admin.password}`);
      console.log('');
    }

    console.log('========================================');
    console.log('All Super Admins configured successfully!');
    console.log('They can now access the Owner Dashboard.');
    console.log('========================================\n');

  } catch (err) {
    console.error('Error setting up Super Admins:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

setupSuperAdmins();

