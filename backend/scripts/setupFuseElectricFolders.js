/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Set up Fuse Electric's custom folder template
 * 
 * Run with: node backend/scripts/setupFuseElectricFolders.js
 * Or from backend folder: node scripts/setupFuseElectricFolders.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Company = require('../models/Company');

const FUSE_ELECTRIC_FOLDER_TEMPLATE = [
  {
    name: 'Fuse Electric',
    subfolders: [
      { name: 'Pre-Field Documents', subfolders: [] },
      { name: 'Job Package', subfolders: [] },
      { name: 'Job Photos', subfolders: [] }
    ]
  }
];

async function setupFuseElectricFolders() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Find Fuse Electric company
    const fuseElectric = await Company.findOne({ name: 'Fuse Electric' });
    
    if (!fuseElectric) {
      console.log('❌ Fuse Electric company not found!');
      console.log('\nAvailable companies:');
      const companies = await Company.find({ isActive: true }).select('name');
      companies.forEach(c => console.log(`  - ${c.name}`));
      process.exit(1);
    }

    console.log(`Found Fuse Electric: ${fuseElectric._id}`);
    
    // Set the folder template
    fuseElectric.folderTemplate = FUSE_ELECTRIC_FOLDER_TEMPLATE;
    await fuseElectric.save();
    
    console.log('✅ Fuse Electric folder template set:');
    console.log(JSON.stringify(FUSE_ELECTRIC_FOLDER_TEMPLATE, null, 2));
    
    console.log('\nNew jobs created by Fuse Electric users will have this folder structure.');

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

setupFuseElectricFolders();

