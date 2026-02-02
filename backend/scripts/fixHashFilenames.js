#!/usr/bin/env node
/**
 * Fix R2 filenames that contain # characters
 * 
 * The # character breaks URLs because browsers treat it as a fragment delimiter.
 * This script:
 * 1. Finds all documents in the database with r2Key containing #
 * 2. Copies the file in R2 to a new key with # replaced by -
 * 3. Updates the database to use the new r2Key
 * 4. Optionally deletes the old file
 * 
 * Run: node scripts/fixHashFilenames.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Job = require('../models/Job');
const r2Storage = require('../utils/storage');

async function fixHashFilenames() {
  console.log('=== Fix # in R2 Filenames ===\n');
  
  // Connect to MongoDB
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('ERROR: No MongoDB URI found');
    process.exit(1);
  }
  
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB\n');
  
  if (!r2Storage.isR2Configured()) {
    console.error('ERROR: R2 storage not configured');
    process.exit(1);
  }
  console.log('R2 storage configured\n');
  
  // Find all jobs with documents that have # in their r2Key
  const jobs = await Job.find({}).select('_id pmNumber folders');
  
  let fixedCount = 0;
  let errorCount = 0;
  
  for (const job of jobs) {
    let jobModified = false;
    
    // Helper to process documents array
    const processDocuments = async (documents, path) => {
      for (const doc of documents) {
        if (doc.r2Key && doc.r2Key.includes('#')) {
          console.log(`Found: ${doc.r2Key}`);
          
          const oldKey = doc.r2Key;
          const newKey = oldKey.replace(/#/g, '-');
          
          try {
            // Copy file to new key
            await r2Storage.copyFile(oldKey, newKey);
            console.log(`  Copied to: ${newKey}`);
            
            // Update database
            doc.r2Key = newKey;
            doc.url = r2Storage.getPublicUrl(newKey);
            jobModified = true;
            fixedCount++;
            
            // Delete old file (optional - uncomment if you want to clean up)
            // await r2Storage.deleteFile(oldKey);
            // console.log(`  Deleted old: ${oldKey}`);
            
          } catch (err) {
            console.error(`  ERROR copying ${oldKey}: ${err.message}`);
            errorCount++;
          }
        }
      }
    };
    
    // Process all folders and subfolders
    if (job.folders) {
      for (const folder of job.folders) {
        if (folder.documents) {
          await processDocuments(folder.documents, `${folder.name}`);
        }
        if (folder.subfolders) {
          for (const subfolder of folder.subfolders) {
            if (subfolder.documents) {
              await processDocuments(subfolder.documents, `${folder.name}/${subfolder.name}`);
            }
            // Handle nested subfolders
            if (subfolder.subfolders) {
              for (const subsubfolder of subfolder.subfolders) {
                if (subsubfolder.documents) {
                  await processDocuments(subsubfolder.documents, `${folder.name}/${subfolder.name}/${subsubfolder.name}`);
                }
              }
            }
          }
        }
      }
    }
    
    if (jobModified) {
      await job.save();
      console.log(`  Saved job ${job.pmNumber || job._id}\n`);
    }
  }
  
  console.log('\n=== Summary ===');
  console.log(`Fixed: ${fixedCount} files`);
  console.log(`Errors: ${errorCount} files`);
  
  await mongoose.disconnect();
  console.log('\nDone!');
}

fixHashFilenames().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

