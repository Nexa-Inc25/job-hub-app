/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Migration Script: Add url/path fields to existing LME documents
 * 
 * This fixes LME documents saved to Close Out folders that are missing
 * the url field needed by the frontend to display them.
 * 
 * Run with: node scripts/migrateLmeUrls.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fieldledger';

async function migrate() {
  console.log('=== LME URL Migration ===');
  console.log('Connecting to MongoDB...');
  
  await mongoose.connect(MONGODB_URI);
  console.log('Connected successfully');
  
  const Job = require('../models/Job');
  
  // Find all jobs that have LME documents in their folders
  const jobs = await Job.find({
    'folders.subfolders.documents.type': 'lme'
  });
  
  console.log(`Found ${jobs.length} jobs with LME documents`);
  
  let updatedCount = 0;
  let documentsFixed = 0;
  
  for (const job of jobs) {
    let jobModified = false;
    
    // Traverse folder structure to find LME documents
    for (const folder of job.folders || []) {
      for (const subfolder of folder.subfolders || []) {
        for (const doc of subfolder.documents || []) {
          // Check if it's an LME document missing url field
          if (doc.type === 'lme' && doc.lmeId && !doc.url) {
            console.log(`  Fixing: ${doc.name} (lmeId: ${doc.lmeId})`);
            
            // Add the missing url and path fields
            doc.url = `/api/lme/${doc.lmeId}/pdf`;
            doc.path = `/api/lme/${doc.lmeId}/pdf`;
            
            jobModified = true;
            documentsFixed++;
          }
        }
        
        // Also check nested subfolders (Close Out Documents is often nested)
        for (const nestedFolder of subfolder.subfolders || []) {
          for (const doc of nestedFolder.documents || []) {
            if (doc.type === 'lme' && doc.lmeId && !doc.url) {
              console.log(`  Fixing: ${doc.name} (lmeId: ${doc.lmeId})`);
              
              doc.url = `/api/lme/${doc.lmeId}/pdf`;
              doc.path = `/api/lme/${doc.lmeId}/pdf`;
              
              jobModified = true;
              documentsFixed++;
            }
          }
        }
      }
    }
    
    if (jobModified) {
      await job.save();
      updatedCount++;
      console.log(`  ✓ Updated job: ${job.pmNumber || job.woNumber || job._id}`);
    }
  }
  
  console.log('\n=== Migration Complete ===');
  console.log(`Jobs updated: ${updatedCount}`);
  console.log(`LME documents fixed: ${documentsFixed}`);
  
  await mongoose.disconnect();
  console.log('Disconnected from MongoDB');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

