/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
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

// ============================================================================
// MIGRATION STEP FUNCTIONS - Extracted to reduce cognitive complexity
// ============================================================================

/**
 * Step 1: Create default PG&E utility if it doesn't exist.
 *
 * @param {import('mongoose').Model} Utility - Utility model
 * @returns {Promise<Object>} The PG&E utility document
 */
async function ensurePgeUtility(Utility) {
  let pgeUtility = await Utility.findOne({ slug: 'pge' });
  
  if (pgeUtility) {
    console.log('PG&E utility already exists:', pgeUtility._id);
    return pgeUtility;
  }
  
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
  return pgeUtility;
}

/**
 * Step 2: Create default company for existing users if needed.
 *
 * @param {import('mongoose').Model} Company - Company model
 * @param {import('mongoose').Model} User - User model
 * @param {Object} pgeUtility - The PG&E utility document
 * @returns {Promise<Object|null>} The default company document or null
 */
async function ensureDefaultCompany(Company, User, pgeUtility) {
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
  
  return defaultCompany;
}

/**
 * Step 3: Link existing users to default company.
 *
 * @param {import('mongoose').Model} User - User model
 * @param {Object|null} defaultCompany - The default company document
 * @returns {Promise<void>}
 */
async function linkUsersToCompany(User, defaultCompany) {
  if (!defaultCompany) return;
  
  const updateResult = await User.updateMany(
    { companyId: { $exists: false } },
    { $set: { companyId: defaultCompany._id } }
  );
  
  if (updateResult.modifiedCount > 0) {
    console.log(`Linked ${updateResult.modifiedCount} users to default company`);
  }
}

/**
 * Step 4: Link existing jobs to default company and PG&E utility.
 *
 * @param {import('mongoose').Model} Job - Job model
 * @param {Object|null} defaultCompany - The default company document
 * @param {Object} pgeUtility - The PG&E utility document
 * @returns {Promise<void>}
 */
async function linkJobsToCompanyAndUtility(Job, defaultCompany, pgeUtility) {
  if (!defaultCompany || !pgeUtility) return;
  
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

/**
 * Count jobs that have LME documents needing URL fix.
 *
 * @param {Object[]} jobs - Array of job documents
 * @returns {number} Count of jobs needing fix
 */
function countJobsNeedingLmeFix(jobs) {
  let count = 0;
  for (const job of jobs) {
    if (jobHasLmeDocNeedingFix(job)) {
      count++;
    }
  }
  return count;
}

/**
 * Check if a job has any LME documents needing URL fix.
 *
 * @param {Object} job - Job document with folders
 * @returns {boolean} True if the job has LME docs needing fix
 */
function jobHasLmeDocNeedingFix(job) {
  for (const folder of job.folders || []) {
    for (const subfolder of folder.subfolders || []) {
      for (const doc of subfolder.documents || []) {
        if (doc.type === 'lme' && doc.lmeId && !doc.url) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Fix LME documents in a single job's folder structure
 * @returns {number} Number of documents fixed
 */
function fixLmeDocsInJob(job) {
  let documentsFixed = 0;
  
  for (const folder of job.folders || []) {
    for (const subfolder of folder.subfolders || []) {
      // Fix documents in subfolder
      documentsFixed += fixLmeDocsInDocList(subfolder.documents);
      
      // Check nested subfolders
      for (const nestedFolder of subfolder.subfolders || []) {
        documentsFixed += fixLmeDocsInDocList(nestedFolder.documents);
      }
    }
  }
  
  return documentsFixed;
}

/**
 * Fix LME documents in a document list.
 *
 * @param {Object[]} documents - Array of document objects
 * @returns {number} Number of documents fixed
 */
function fixLmeDocsInDocList(documents) {
  let fixed = 0;
  for (const doc of documents || []) {
    if (doc.type === 'lme' && doc.lmeId && !doc.url) {
      doc.url = `/api/lme/${doc.lmeId}/pdf`;
      doc.path = `/api/lme/${doc.lmeId}/pdf`;
      fixed++;
    }
  }
  return fixed;
}

/**
 * Step 5: Fix LME unique index to be compound (lmeNumber + companyId) for multi-tenancy
 * The old index was unique on lmeNumber alone, causing conflicts across companies
 */
async function fixLmeIndex() {
  try {
    const LME = require('../models/LME');
    const collection = LME.collection;
    
    // Always try to drop the old index by name - it's idempotent
    console.log('Checking for old lmeNumber_1 index to drop...');
    try {
      await collection.dropIndex('lmeNumber_1');
      console.log('Old lmeNumber_1 index dropped successfully');
    } catch (indexDropError) {
      // Index might already be dropped or not exist
      if (indexDropError.message.includes('index not found') || indexDropError.codeName === 'IndexNotFound') {
        console.log('lmeNumber_1 index already dropped or does not exist');
      } else {
        console.warn('Could not drop lmeNumber_1 index:', indexDropError.message);
      }
    }
    
    // Ensure the new compound index exists
    try {
      await collection.createIndex(
        { lmeNumber: 1, companyId: 1 }, 
        { unique: true, background: true }
      );
      console.log('Created compound unique index on (lmeNumber, companyId)');
    } catch (indexCreateError) {
      // Index might already exist
      if (indexCreateError.message.includes('already exists') || indexCreateError.code === 85) {
        console.log('Compound index (lmeNumber, companyId) already exists');
      } else {
        console.warn('Could not create compound index:', indexCreateError.message);
      }
    }
  } catch (err) {
    console.warn('LME index migration warning:', err.message);
  }
}

/**
 * Step 6: Fix LME documents in Close Out folders that are missing the url field
 * This is needed for the frontend to display them correctly
 */
async function migrateLmeUrls(Job) {
  try {
    const jobs = await Job.find({});
    
    const jobsNeedingFix = countJobsNeedingLmeFix(jobs);
    
    if (jobsNeedingFix === 0) {
      return; // No LME documents need fixing
    }
    
    console.log(`Found ${jobsNeedingFix} jobs with LME documents needing URL fix`);
    
    let documentsFixed = 0;
    
    for (const job of jobs) {
      const fixedInJob = fixLmeDocsInJob(job);
      
      if (fixedInJob > 0) {
        documentsFixed += fixedInJob;
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

// ============================================================================
// MAIN MIGRATION FUNCTION
// ============================================================================

/**
 * Run all migration steps.
 * Idempotent — safe to run multiple times on server startup.
 *
 * @returns {Promise<{success: boolean, error?: string}>} Migration result
 */
async function runMigration() {
  console.log('=== Running database migration ===');
  
  try {
    // Import models (must be done after mongoose connection)
    const Utility = require('../models/Utility');
    const Company = require('../models/Company');
    const User = require('../models/User');
    const Job = require('../models/Job');
    
    // Step 1: Create default PG&E utility if it doesn't exist
    const pgeUtility = await ensurePgeUtility(Utility);
    
    // Step 2: Create default company for existing users if needed
    const defaultCompany = await ensureDefaultCompany(Company, User, pgeUtility);
    
    // Step 3: Link existing users to default company
    await linkUsersToCompany(User, defaultCompany);
    
    // Step 4: Link existing jobs to default company and PG&E utility
    await linkJobsToCompanyAndUtility(Job, defaultCompany, pgeUtility);
    
    // Step 5: Fix LME unique index for multi-tenancy
    await fixLmeIndex();
    
    // Step 6: Fix LME documents missing url field
    await migrateLmeUrls(Job);
    
    console.log('=== Migration complete ===');
    return { success: true };
    
  } catch (err) {
    console.error('Migration error:', err);
    return { success: false, error: err.message };
  }
}

module.exports = { runMigration };
