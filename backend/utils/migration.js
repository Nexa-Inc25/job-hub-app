/**
 * Database Migration Script
 * 
 * This script runs on server startup to ensure:
 * 1. Default PG&E utility exists
 * 2. Default company exists for existing users/jobs
 * 3. Existing data is linked to defaults
 * 
 * All operations are idempotent - safe to run multiple times
 */

const mongoose = require('mongoose');

// Run migration after models are loaded
async function runMigration() {
  console.log('=== Running database migration ===');
  
  try {
    // Import models (must be done after mongoose connection)
    const Utility = require('../models/Utility');
    const Company = require('../models/Company');
    const User = require('../models/User');
    const Job = require('../models/Job');
    
    // Step 1: Create default PG&E utility if it doesn't exist
    let pgeUtility = await Utility.findOne({ slug: 'pge' });
    if (pgeUtility) {
      console.log('PG&E utility already exists:', pgeUtility._id);
    } else {
      console.log('Creating default PG&E utility...');
      pgeUtility = await Utility.create({
        name: 'Pacific Gas & Electric',
        slug: 'pge',
        shortName: 'PG&E',
        region: 'California',
        contractorPortalUrl: 'https://www.pge.com/en/about/doing-business-with-pge/contractor-resources.html',
        folderStructure: [
          { name: 'ACI', subfolders: ['Pre-Field Documents', 'Field As Built', 'Job Photos'] },
          { name: 'UTC', subfolders: ['Dispatch Documents', 'Pre-Field Docs'] }
        ],
        submission: {
          method: 'portal',
          requiredDocuments: ['As-Built PDF', 'Completed CWC', 'Photos'],
          namingConvention: '{pmNumber}_{docType}.pdf'
        },
        aiHints: 'PG&E documents use PM Order # for job numbers, Notification # for work orders. Look for CMCS (Circuit Map Change Sheet), ADHOC maps, CWC (Contractor Work Checklist).',
        isActive: true
      });
      console.log('Created PG&E utility:', pgeUtility._id);
    }
    
    // Step 2: Create default company for existing users if needed
    let defaultCompany = await Company.findOne({ slug: 'default-company' });
    
    // Check if there are users without a companyId
    const usersWithoutCompany = await User.countDocuments({ companyId: { $exists: false } });
    
    if (usersWithoutCompany > 0 && !defaultCompany) {
      console.log(`Found ${usersWithoutCompany} users without company, creating default company...`);
      
      // Find the first admin user to be the owner
      const adminUser = await User.findOne({ isAdmin: true });
      
      defaultCompany = await Company.create({
        name: 'Default Company',
        slug: 'default-company',
        utilities: [pgeUtility._id],
        defaultUtility: pgeUtility._id,
        ownerId: adminUser?._id,
        subscription: {
          plan: 'pro',
          seats: 100,
          status: 'active'
        },
        isActive: true
      });
      console.log('Created default company:', defaultCompany._id);
    } else if (defaultCompany) {
      console.log('Default company already exists:', defaultCompany._id);
    }
    
    // Step 3: Link existing users to default company (if they don't have one)
    if (defaultCompany) {
      const updateResult = await User.updateMany(
        { companyId: { $exists: false } },
        { $set: { companyId: defaultCompany._id } }
      );
      if (updateResult.modifiedCount > 0) {
        console.log(`Linked ${updateResult.modifiedCount} users to default company`);
      }
    }
    
    // Step 4: Link existing jobs to default company and PG&E utility
    if (defaultCompany && pgeUtility) {
      // Update jobs without companyId
      const jobCompanyResult = await Job.updateMany(
        { companyId: { $exists: false } },
        { $set: { companyId: defaultCompany._id } }
      );
      if (jobCompanyResult.modifiedCount > 0) {
        console.log(`Linked ${jobCompanyResult.modifiedCount} jobs to default company`);
      }
      
      // Update jobs without utilityId
      const jobUtilityResult = await Job.updateMany(
        { utilityId: { $exists: false } },
        { $set: { utilityId: pgeUtility._id } }
      );
      if (jobUtilityResult.modifiedCount > 0) {
        console.log(`Linked ${jobUtilityResult.modifiedCount} jobs to PG&E utility`);
      }
    }
    
    // Step 5: Fix LME documents missing url field
    await migrateLmeUrls(Job);
    
    console.log('=== Migration complete ===');
    return { success: true };
    
  } catch (err) {
    console.error('Migration error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Fix LME documents in Close Out folders that are missing the url field
 * This is needed for the frontend to display them correctly
 */
async function migrateLmeUrls(Job) {
  try {
    // Find jobs with LME documents missing url field
    const jobs = await Job.find({
      $or: [
        { 'folders.subfolders.documents': { $elemMatch: { type: 'lme', url: { $exists: false } } } },
        { 'folders.subfolders.subfolders.documents': { $elemMatch: { type: 'lme', url: { $exists: false } } } }
      ]
    });
    
    if (jobs.length === 0) {
      return; // No LME documents need fixing
    }
    
    console.log(`Found ${jobs.length} jobs with LME documents needing URL fix`);
    
    let documentsFixed = 0;
    
    for (const job of jobs) {
      let jobModified = false;
      
      // Traverse folder structure to find LME documents
      for (const folder of job.folders || []) {
        for (const subfolder of folder.subfolders || []) {
          for (const doc of subfolder.documents || []) {
            if (doc.type === 'lme' && doc.lmeId && !doc.url) {
              doc.url = `/api/lme/${doc.lmeId}/pdf`;
              doc.path = `/api/lme/${doc.lmeId}/pdf`;
              jobModified = true;
              documentsFixed++;
            }
          }
          
          // Check nested subfolders
          for (const nestedFolder of subfolder.subfolders || []) {
            for (const doc of nestedFolder.documents || []) {
              if (doc.type === 'lme' && doc.lmeId && !doc.url) {
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
      }
    }
    
    if (documentsFixed > 0) {
      console.log(`Fixed ${documentsFixed} LME documents with missing URLs`);
    }
  } catch (err) {
    console.warn('LME URL migration warning:', err.message);
  }
}

module.exports = { runMigration };
