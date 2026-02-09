/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
#!/usr/bin/env node
/**
 * FieldLedger Health Check & Debugging Script
 * 
 * Run with: node scripts/healthCheck.js
 * 
 * This script verifies:
 * - MongoDB connection
 * - Data integrity (companyId assignments)
 * - Multi-tenancy isolation
 * - User role distribution
 * - Job status distribution
 * - API usage tracking
 * - Environment configuration
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

const log = {
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  header: (msg) => console.log(`\n${colors.bold}${colors.cyan}=== ${msg} ===${colors.reset}\n`)
};

async function runHealthCheck() {
  console.log('\n' + '='.repeat(60));
  console.log(colors.bold + '  FIELDLEDGER HEALTH CHECK & DEBUGGING SCRIPT' + colors.reset);
  console.log('='.repeat(60));

  const results = {
    passed: 0,
    failed: 0,
    warnings: 0
  };

  try {
    // ============================================
    // 1. ENVIRONMENT CHECK
    // ============================================
    log.header('ENVIRONMENT CONFIGURATION');
    
    const envVars = {
      'MONGO_URI': process.env.MONGO_URI ? '✓ Set' : '✗ Missing',
      'JWT_SECRET': process.env.JWT_SECRET ? '✓ Set' : '✗ Missing',
      'OPENAI_API_KEY': process.env.OPENAI_API_KEY ? '✓ Set' : '✗ Missing',
      'R2_ACCESS_KEY_ID': process.env.R2_ACCESS_KEY_ID ? '✓ Set' : '✗ Missing',
      'R2_SECRET_ACCESS_KEY': process.env.R2_SECRET_ACCESS_KEY ? '✓ Set' : '✗ Missing',
      'R2_BUCKET_NAME': process.env.R2_BUCKET_NAME ? '✓ Set' : '✗ Missing',
    };

    for (const [key, status] of Object.entries(envVars)) {
      if (status.includes('✓')) {
        log.success(`${key}: ${status}`);
        results.passed++;
      } else {
        log.error(`${key}: ${status}`);
        results.failed++;
      }
    }

    // ============================================
    // 2. DATABASE CONNECTION
    // ============================================
    log.header('DATABASE CONNECTION');

    if (!process.env.MONGO_URI) {
      log.error('Cannot connect - MONGO_URI not set');
      results.failed++;
      return results;
    }

    await mongoose.connect(process.env.MONGO_URI);
    log.success('MongoDB connected successfully');
    results.passed++;

    // Load models
    const User = require('../models/User');
    const Job = require('../models/Job');
    const Company = require('../models/Company');
    
    let APIUsage;
    try {
      APIUsage = require('../models/APIUsage');
    } catch (e) {
      APIUsage = null;
    }

    // ============================================
    // 3. DATA COUNTS
    // ============================================
    log.header('DATABASE STATISTICS');

    const [userCount, jobCount, companyCount] = await Promise.all([
      User.countDocuments(),
      Job.countDocuments(),
      Company.countDocuments()
    ]);

    log.info(`Total Users: ${userCount}`);
    log.info(`Total Jobs: ${jobCount}`);
    log.info(`Total Companies: ${companyCount}`);

    // ============================================
    // 4. COMPANY DATA
    // ============================================
    log.header('COMPANY BREAKDOWN');

    const companies = await Company.find().select('name folderTemplate');
    for (const company of companies) {
      const usersInCompany = await User.countDocuments({ companyId: company._id });
      const jobsInCompany = await Job.countDocuments({ companyId: company._id });
      const hasFolderTemplate = company.folderTemplate && company.folderTemplate.length > 0;
      
      log.info(`${company.name}:`);
      console.log(`     Users: ${usersInCompany}, Jobs: ${jobsInCompany}, Custom Folders: ${hasFolderTemplate ? 'Yes' : 'No (using default)'}`);
    }

    // ============================================
    // 5. MULTI-TENANCY INTEGRITY CHECK
    // ============================================
    log.header('MULTI-TENANCY INTEGRITY');

    // Check for users without companyId
    const usersWithoutCompany = await User.countDocuments({ 
      companyId: { $exists: false } 
    });
    const usersWithNullCompany = await User.countDocuments({ 
      companyId: null 
    });

    if (usersWithoutCompany > 0 || usersWithNullCompany > 0) {
      log.warn(`Users without companyId: ${usersWithoutCompany + usersWithNullCompany}`);
      results.warnings++;
      
      // List them
      const orphanUsers = await User.find({ 
        $or: [{ companyId: { $exists: false } }, { companyId: null }] 
      }).select('email name role isAdmin isSuperAdmin');
      
      for (const user of orphanUsers) {
        const isSuperAdmin = user.isSuperAdmin ? ' (Super Admin)' : '';
        console.log(`     - ${user.email} (${user.role || 'no role'})${isSuperAdmin}`);
      }
    } else {
      log.success('All users have companyId assigned');
      results.passed++;
    }

    // Check for jobs without companyId
    const jobsWithoutCompany = await Job.countDocuments({ 
      $or: [{ companyId: { $exists: false } }, { companyId: null }] 
    });

    if (jobsWithoutCompany > 0) {
      log.error(`Jobs without companyId: ${jobsWithoutCompany} - CRITICAL SECURITY ISSUE`);
      results.failed++;
      
      const orphanJobs = await Job.find({ 
        $or: [{ companyId: { $exists: false } }, { companyId: null }] 
      }).select('pmNumber title createdAt').limit(5);
      
      for (const job of orphanJobs) {
        console.log(`     - PM#${job.pmNumber || 'N/A'}: ${job.title}`);
      }
    } else {
      log.success('All jobs have companyId assigned');
      results.passed++;
    }

    // ============================================
    // 6. USER ROLES CHECK
    // ============================================
    log.header('USER ROLE DISTRIBUTION');

    const roleDistribution = await User.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);

    for (const role of roleDistribution) {
      log.info(`${role._id || 'undefined'}: ${role.count} users`);
    }

    // Check for Super Admins
    const superAdmins = await User.find({ isSuperAdmin: true }).select('email name');
    log.info(`Super Admins: ${superAdmins.length}`);
    for (const admin of superAdmins) {
      console.log(`     - ${admin.email} (${admin.name})`);
    }

    // ============================================
    // 7. JOB STATUS DISTRIBUTION
    // ============================================
    log.header('JOB STATUS DISTRIBUTION');

    const statusDistribution = await Job.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    for (const status of statusDistribution) {
      log.info(`${status._id || 'undefined'}: ${status.count} jobs`);
    }

    // Check for archived/deleted jobs
    const archivedJobs = await Job.countDocuments({ isArchived: true });
    const deletedJobs = await Job.countDocuments({ isDeleted: true });
    log.info(`Archived: ${archivedJobs}, Soft-deleted: ${deletedJobs}`);

    // ============================================
    // 8. JOBS WITH ASSIGNMENTS
    // ============================================
    log.header('JOB ASSIGNMENTS');

    const assignedJobs = await Job.countDocuments({ assignedTo: { $ne: null } });
    const unassignedJobs = await Job.countDocuments({ 
      $or: [{ assignedTo: null }, { assignedTo: { $exists: false } }] 
    });

    log.info(`Assigned to GF: ${assignedJobs}`);
    log.info(`Unassigned: ${unassignedJobs}`);

    if (unassignedJobs > 0 && unassignedJobs > assignedJobs) {
      log.warn('More unassigned jobs than assigned - consider assigning to foremen');
      results.warnings++;
    }

    // ============================================
    // 9. API USAGE (if model exists)
    // ============================================
    if (APIUsage) {
      log.header('API USAGE TRACKING');

      const totalUsage = await APIUsage.countDocuments();
      log.info(`Total API calls logged: ${totalUsage}`);

      if (totalUsage > 0) {
        const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentUsage = await APIUsage.countDocuments({ createdAt: { $gte: last24h } });
        log.info(`API calls (last 24h): ${recentUsage}`);

        // Cost summary
        const costSummary = await APIUsage.aggregate([
          { $group: { 
            _id: '$service', 
            totalCost: { $sum: '$estimatedCostCents' },
            calls: { $sum: 1 }
          }}
        ]);

        for (const service of costSummary) {
          const dollars = (service.totalCost / 100).toFixed(2);
          log.info(`${service._id}: ${service.calls} calls, $${dollars} total`);
        }

        // Check for failed API calls
        const failedCalls = await APIUsage.countDocuments({ success: false });
        if (failedCalls > 0) {
          log.warn(`Failed API calls: ${failedCalls}`);
          results.warnings++;
        } else {
          log.success('No failed API calls recorded');
          results.passed++;
        }
      }
    }

    // ============================================
    // 10. DOCUMENT INTEGRITY
    // ============================================
    log.header('DOCUMENT & FOLDER INTEGRITY');

    // Check jobs with folders
    const jobsWithFolders = await Job.countDocuments({ 
      folders: { $exists: true, $ne: [] } 
    });
    const jobsWithoutFolders = await Job.countDocuments({ 
      $or: [{ folders: { $exists: false } }, { folders: [] }] 
    });

    log.info(`Jobs with folder structure: ${jobsWithFolders}`);
    if (jobsWithoutFolders > 0) {
      log.warn(`Jobs without folder structure: ${jobsWithoutFolders}`);
      results.warnings++;
    }

    // Check for documents pending approval
    const pendingApproval = await Job.aggregate([
      { $unwind: '$folders' },
      { $unwind: '$folders.documents' },
      { $match: { 'folders.documents.approvalStatus': 'pending' } },
      { $count: 'total' }
    ]);
    
    const pendingCount = pendingApproval[0]?.total || 0;
    if (pendingCount > 0) {
      log.info(`Documents pending approval: ${pendingCount}`);
    }

    // ============================================
    // 11. CROSS-COMPANY ISOLATION TEST
    // ============================================
    log.header('CROSS-COMPANY ISOLATION TEST');

    if (companies.length >= 2) {
      const company1 = companies[0];
      const company2 = companies[1];

      // Get a job from company1
      const job1 = await Job.findOne({ companyId: company1._id });
      
      if (job1) {
        // Try to find this job with company2's ID (should fail)
        const crossAccessTest = await Job.findOne({ 
          _id: job1._id, 
          companyId: company2._id 
        });

        if (crossAccessTest) {
          log.error('CRITICAL: Cross-company job access detected!');
          results.failed++;
        } else {
          log.success('Cross-company isolation verified - jobs properly isolated');
          results.passed++;
        }
      } else {
        log.info('Skipped: No jobs in first company to test');
      }
    } else {
      log.info('Skipped: Need at least 2 companies to test isolation');
    }

    // ============================================
    // SUMMARY
    // ============================================
    log.header('HEALTH CHECK SUMMARY');

    console.log(`${colors.green}Passed:${colors.reset}   ${results.passed}`);
    console.log(`${colors.red}Failed:${colors.reset}   ${results.failed}`);
    console.log(`${colors.yellow}Warnings:${colors.reset} ${results.warnings}`);

    if (results.failed === 0) {
      console.log(`\n${colors.green}${colors.bold}✓ All critical checks passed!${colors.reset}\n`);
    } else {
      console.log(`\n${colors.red}${colors.bold}✗ Some critical checks failed - review above${colors.reset}\n`);
    }

    return results;

  } catch (error) {
    log.error(`Health check failed: ${error.message}`);
    console.error(error);
    results.failed++;
    return results;
  } finally {
    await mongoose.connection.close();
    log.info('Database connection closed');
  }
}

// Run the health check
runHealthCheck()
  .then(results => {
    process.exit(results.failed > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });

