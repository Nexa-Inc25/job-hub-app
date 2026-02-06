/**
 * FieldLedger - Demo Session Cleanup
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Cleans up expired demo sessions and their associated data.
 * Should be run periodically via cron job or scheduled task.
 */

const Company = require('../models/Company');
const User = require('../models/User');
const Job = require('../models/Job');
const LME = require('../models/LME');
const FormTemplate = require('../models/FormTemplate');

/**
 * Clean up all expired demo sessions
 * Deletes: Companies, Users, Jobs, LMEs, FormTemplates
 * @returns {Object} Cleanup statistics
 */
async function cleanupExpiredDemoSessions() {
  const now = new Date();
  console.log(`[Demo Cleanup] Starting cleanup at ${now.toISOString()}`);
  
  const stats = {
    companiesDeleted: 0,
    usersDeleted: 0,
    jobsDeleted: 0,
    lmesDeleted: 0,
    templatesDeleted: 0,
    errors: []
  };
  
  try {
    // Find all expired demo companies
    const expiredCompanies = await Company.find({
      isDemo: true,
      demoExpiresAt: { $lt: now }
    }).select('_id demoSessionId name');
    
    console.log(`[Demo Cleanup] Found ${expiredCompanies.length} expired demo sessions`);
    
    for (const company of expiredCompanies) {
      try {
        const sessionId = company.demoSessionId;
        console.log(`[Demo Cleanup] Cleaning session: ${sessionId}`);
        
        // Delete all associated data for this session
        const jobResult = await Job.deleteMany({ demoSessionId: sessionId });
        stats.jobsDeleted += jobResult.deletedCount;
        
        const lmeResult = await LME.deleteMany({ demoSessionId: sessionId });
        stats.lmesDeleted += lmeResult.deletedCount;
        
        const templateResult = await FormTemplate.deleteMany({ demoSessionId: sessionId });
        stats.templatesDeleted += templateResult.deletedCount;
        
        const userResult = await User.deleteMany({ demoSessionId: sessionId });
        stats.usersDeleted += userResult.deletedCount;
        
        // Finally delete the company
        await Company.deleteOne({ _id: company._id });
        stats.companiesDeleted += 1;
        
        console.log(`[Demo Cleanup] Cleaned session ${sessionId}: ${jobResult.deletedCount} jobs, ${lmeResult.deletedCount} LMEs`);
        
      } catch (sessionError) {
        console.error(`[Demo Cleanup] Error cleaning session ${company.demoSessionId}:`, sessionError.message);
        stats.errors.push({
          sessionId: company.demoSessionId,
          error: sessionError.message
        });
      }
    }
    
    console.log(`[Demo Cleanup] Completed. Deleted: ${stats.companiesDeleted} companies, ${stats.usersDeleted} users, ${stats.jobsDeleted} jobs, ${stats.lmesDeleted} LMEs`);
    
  } catch (error) {
    console.error('[Demo Cleanup] Fatal error:', error);
    stats.errors.push({ fatal: true, error: error.message });
  }
  
  return stats;
}

/**
 * Get statistics about active demo sessions
 * @returns {Object} Demo session statistics
 */
async function getDemoStats() {
  const now = new Date();
  
  const [activeCount, expiredCount, totalJobs, totalUsers] = await Promise.all([
    Company.countDocuments({ isDemo: true, demoExpiresAt: { $gt: now } }),
    Company.countDocuments({ isDemo: true, demoExpiresAt: { $lt: now } }),
    Job.countDocuments({ isDemo: true }),
    User.countDocuments({ isDemo: true })
  ]);
  
  // Get oldest active session
  const oldestActive = await Company.findOne({
    isDemo: true,
    demoExpiresAt: { $gt: now }
  }).sort({ createdAt: 1 }).select('createdAt demoExpiresAt');
  
  return {
    activeSessions: activeCount,
    expiredSessions: expiredCount,
    totalDemoJobs: totalJobs,
    totalDemoUsers: totalUsers,
    oldestActiveSession: oldestActive ? {
      createdAt: oldestActive.createdAt,
      expiresAt: oldestActive.demoExpiresAt
    } : null
  };
}

/**
 * Force cleanup a specific demo session (for admin use)
 * @param {string} sessionId - The demo session ID to clean up
 * @returns {Object} Cleanup result
 */
async function forceCleanupSession(sessionId) {
  console.log(`[Demo Cleanup] Force cleaning session: ${sessionId}`);
  
  const stats = {
    jobsDeleted: 0,
    lmesDeleted: 0,
    templatesDeleted: 0,
    usersDeleted: 0,
    companyDeleted: false
  };
  
  try {
    const jobResult = await Job.deleteMany({ demoSessionId: sessionId });
    stats.jobsDeleted = jobResult.deletedCount;
    
    const lmeResult = await LME.deleteMany({ demoSessionId: sessionId });
    stats.lmesDeleted = lmeResult.deletedCount;
    
    const templateResult = await FormTemplate.deleteMany({ demoSessionId: sessionId });
    stats.templatesDeleted = templateResult.deletedCount;
    
    const userResult = await User.deleteMany({ demoSessionId: sessionId });
    stats.usersDeleted = userResult.deletedCount;
    
    const companyResult = await Company.deleteOne({ demoSessionId: sessionId });
    stats.companyDeleted = companyResult.deletedCount > 0;
    
    console.log(`[Demo Cleanup] Force cleaned session ${sessionId}:`, stats);
    
  } catch (error) {
    console.error(`[Demo Cleanup] Error force cleaning ${sessionId}:`, error);
    stats.error = error.message;
  }
  
  return stats;
}

/**
 * Schedule periodic cleanup (call once on server start)
 * Runs cleanup every hour
 */
function scheduleCleanup() {
  const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
  
  console.log('[Demo Cleanup] Scheduling hourly cleanup');
  
  // Run immediately on start
  setTimeout(() => {
    cleanupExpiredDemoSessions().catch(err => {
      console.error('[Demo Cleanup] Initial cleanup failed:', err);
    });
  }, 10000); // Wait 10 seconds after server start
  
  // Then run every hour
  setInterval(() => {
    cleanupExpiredDemoSessions().catch(err => {
      console.error('[Demo Cleanup] Scheduled cleanup failed:', err);
    });
  }, CLEANUP_INTERVAL_MS);
}

module.exports = {
  cleanupExpiredDemoSessions,
  getDemoStats,
  forceCleanupSession,
  scheduleCleanup
};

