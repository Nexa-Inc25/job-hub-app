/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Cleanup Script: Delete empty emergency test jobs
 * 
 * Usage: node scripts/cleanupEmergencyJobs.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Job = require('../models/Job');

async function cleanup() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected!\n');

    // Find all emergency jobs with empty or minimal folders
    const emergencyJobs = await Job.find({
      $or: [
        { isEmergency: true },
        { title: /emergency/i },
        { priority: 'emergency' }
      ]
    });

    console.log(`Found ${emergencyJobs.length} emergency jobs:\n`);

    for (const job of emergencyJobs) {
      const docCount = job.folders?.reduce((sum, f) => sum + (f.documents?.length || 0), 0) || 0;
      console.log(`- ${job.pmNumber || job.woNumber || job._id}`);
      console.log(`  Title: ${job.title}`);
      console.log(`  Folders: ${job.folders?.length || 0}`);
      console.log(`  Documents: ${docCount}`);
      console.log(`  Created: ${job.createdAt}`);
      console.log('');
    }

    // Ask for confirmation
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('Delete ALL these emergency jobs? (yes/no): ', async (answer) => {
      if (answer.toLowerCase() === 'yes') {
        const result = await Job.deleteMany({
          $or: [
            { isEmergency: true },
            { title: /emergency/i },
            { priority: 'emergency' }
          ]
        });
        console.log(`\n✅ Deleted ${result.deletedCount} emergency jobs.`);
      } else {
        console.log('Cancelled. No jobs deleted.');
      }
      
      rl.close();
      process.exit(0);
    });

  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

cleanup();
