/**
 * FieldLedger - Admin Platform Routes
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Platform admin routes for owner dashboard, audit logs, security management.
 * Auth middleware applied at mount point in server.js.
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Job = require('../models/Job');
const Company = require('../models/Company');
const AuditLog = require('../models/AuditLog');
const APIUsage = require('../models/APIUsage');
const AITrainingData = require('../models/AITrainingData');
const Utility = require('../models/Utility');
const { logExport } = require('../middleware/auditLogger');
const { blockIP, unblockIP, getBlockedIPs } = require('../middleware/ipBlocker');
const r2Storage = require('../utils/storage');
const { sanitizeString, sanitizeObjectId, sanitizeInt } = require('../utils/sanitize');

// Helper: format uptime
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  return parts.join(' ');
}

router.get('/owner-stats', async (req, res) => {
  try {
    
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // === USER METRICS ===
    // Only count users with a companyId (excludes super admins and orphaned users)
    const userFilter = { companyId: { $exists: true, $ne: null }, isSuperAdmin: { $ne: true } };
    const totalUsers = await User.countDocuments(userFilter);
    const newUsersThisMonth = await User.countDocuments({ 
      ...userFilter,
      createdAt: { $gte: thirtyDaysAgo } 
    });
    const newUsersThisWeek = await User.countDocuments({ 
      ...userFilter,
      createdAt: { $gte: sevenDaysAgo } 
    });
    
    // Users by role (only company users)
    const usersByRole = await User.aggregate([
      { $match: userFilter },
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);
    
    // User growth trend (last 30 days, only company users)
    const userGrowth = await User.aggregate([
      { $match: { ...userFilter, createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // === JOB METRICS ===
    const totalJobs = await Job.countDocuments({ isDeleted: { $ne: true } });
    const jobsThisMonth = await Job.countDocuments({ 
      createdAt: { $gte: thirtyDaysAgo },
      isDeleted: { $ne: true }
    });
    const jobsThisWeek = await Job.countDocuments({ 
      createdAt: { $gte: sevenDaysAgo },
      isDeleted: { $ne: true }
    });
    const jobsToday = await Job.countDocuments({ 
      createdAt: { $gte: today },
      isDeleted: { $ne: true }
    });
    
    // Jobs by status
    const jobsByStatus = await Job.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    // Jobs by priority
    const jobsByPriority = await Job.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);
    
    // Emergency jobs count
    const emergencyJobs = await Job.countDocuments({ 
      isEmergency: true, 
      isDeleted: { $ne: true } 
    });
    
    // Job creation trend (last 30 days)
    const jobCreationTrend = await Job.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo }, isDeleted: { $ne: true } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // === AI EXTRACTION METRICS ===
    const jobsWithAIExtraction = await Job.countDocuments({ 
      aiExtractionComplete: true,
      isDeleted: { $ne: true }
    });
    
    // AI extraction performance stats
    const aiPerformanceStats = await Job.aggregate([
      { 
        $match: { 
          aiExtractionComplete: true, 
          aiProcessingTimeMs: { $exists: true, $gt: 0 } 
        } 
      },
      {
        $group: {
          _id: null,
          avgProcessingTimeMs: { $avg: '$aiProcessingTimeMs' },
          minProcessingTimeMs: { $min: '$aiProcessingTimeMs' },
          maxProcessingTimeMs: { $max: '$aiProcessingTimeMs' },
          totalExtractions: { $sum: 1 }
        }
      }
    ]);
    
    // Count extracted assets
    const extractedAssetsStats = await Job.aggregate([
      { $match: { aiExtractionComplete: true } },
      { $unwind: { path: '$aiExtractedAssets', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$aiExtractedAssets.type',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // === API USAGE & COSTS ===
    const apiUsageStats = { openai: null, r2_storage: null };
    let dailyApiCosts = [];
    let totalApiCostThisMonth = 0;
    
    try {
      // Get API usage summary for this month
      const usageSummary = await APIUsage.getUsageSummary(thirtyDaysAgo, now);
      usageSummary.forEach(stat => {
        apiUsageStats[stat._id] = stat;
        totalApiCostThisMonth += stat.totalCostCents || 0;
      });
      
      // Get daily API costs for chart
      dailyApiCosts = await APIUsage.getDailyUsage(30);
    } catch (err) {
      console.log('API usage tracking not yet populated:', err.message);
    }
    
    // === AI TRAINING DATA METRICS ===
    const aiTrainingStats = { total: 0, complete: 0, validated: 0 };
    try {
      aiTrainingStats.total = await AITrainingData.countDocuments();
      aiTrainingStats.complete = await AITrainingData.countDocuments({ isComplete: true });
      aiTrainingStats.validated = await AITrainingData.countDocuments({ isValidated: true });
    } catch (err) {
      console.log('AI training data not yet populated:', err.message);
    }
    
    // === COMPANY METRICS ===
    const totalCompanies = await Company.countDocuments({ isActive: true });
    const totalUtilities = await Utility.countDocuments({ isActive: true });
    
    // === DOCUMENT METRICS ===
    // Count total documents across all jobs
    const documentStats = await Job.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $unwind: '$folders' },
      { $unwind: { path: '$folders.documents', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: null,
          totalDocuments: { $sum: 1 },
          approvedDocuments: { 
            $sum: { $cond: [{ $eq: ['$folders.documents.approvalStatus', 'approved'] }, 1, 0] }
          },
          pendingDocuments: {
            $sum: { $cond: [{ $eq: ['$folders.documents.approvalStatus', 'pending_approval'] }, 1, 0] }
          }
        }
      }
    ]);
    
    // === WORKFLOW METRICS ===
    // Average time from job creation to completion
    const workflowStats = await Job.aggregate([
      { 
        $match: { 
          completedDate: { $exists: true },
          createdAt: { $gte: thirtyDaysAgo }
        } 
      },
      {
        $project: {
          completionTimeHours: {
            $divide: [
              { $subtract: ['$completedDate', '$createdAt'] },
              1000 * 60 * 60  // Convert ms to hours
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          avgCompletionTimeHours: { $avg: '$completionTimeHours' },
          minCompletionTimeHours: { $min: '$completionTimeHours' },
          maxCompletionTimeHours: { $max: '$completionTimeHours' },
          completedJobs: { $sum: 1 }
        }
      }
    ]);
    
    // === STORAGE METRICS (R2) ===
    const storageStats = { configured: r2Storage.isR2Configured() };
    
    res.json({
      timestamp: now.toISOString(),
      
      users: {
        total: totalUsers,
        newThisMonth: newUsersThisMonth,
        newThisWeek: newUsersThisWeek,
        byRole: usersByRole.reduce((acc, r) => ({ ...acc, [r._id || 'unknown']: r.count }), {}),
        growthTrend: userGrowth.map(d => ({ date: d._id, count: d.count }))
      },
      
      jobs: {
        total: totalJobs,
        thisMonth: jobsThisMonth,
        thisWeek: jobsThisWeek,
        today: jobsToday,
        emergency: emergencyJobs,
        byStatus: jobsByStatus.reduce((acc, s) => ({ ...acc, [s._id || 'unknown']: s.count }), {}),
        byPriority: jobsByPriority.reduce((acc, p) => ({ ...acc, [p._id || 'unknown']: p.count }), {}),
        creationTrend: jobCreationTrend.map(d => ({ date: d._id, count: d.count }))
      },
      
      aiExtraction: {
        totalJobsProcessed: jobsWithAIExtraction,
        performance: aiPerformanceStats[0] || { avgProcessingTimeMs: 0, totalExtractions: 0 },
        extractedAssets: extractedAssetsStats.reduce((acc, a) => ({ 
          ...acc, 
          [a._id || 'unknown']: a.count 
        }), {})
      },
      
      apiUsage: {
        openai: apiUsageStats.openai,
        storage: apiUsageStats.r2_storage,
        totalCostThisMonthCents: totalApiCostThisMonth,
        totalCostThisMonthDollars: (totalApiCostThisMonth / 100).toFixed(2),
        dailyCosts: dailyApiCosts.map(d => ({
          date: d._id.date,
          service: d._id.service,
          calls: d.calls,
          tokens: d.tokens,
          costCents: d.costCents
        }))
      },
      
      aiTraining: {
        totalRecords: aiTrainingStats.total,
        completeRecords: aiTrainingStats.complete,
        validatedRecords: aiTrainingStats.validated,
        completionRate: aiTrainingStats.total > 0 
          ? ((aiTrainingStats.complete / aiTrainingStats.total) * 100).toFixed(1) + '%'
          : '0%'
      },
      
      documents: documentStats[0] || { totalDocuments: 0, approvedDocuments: 0, pendingDocuments: 0 },
      
      workflow: workflowStats[0] || { avgCompletionTimeHours: 0, completedJobs: 0 },
      
      platform: {
        companies: totalCompanies,
        utilities: totalUtilities,
        storage: storageStats
      }
    });
    
  } catch (err) {
    console.error('Error fetching owner stats:', err);
    res.status(500).json({ error: 'Failed to fetch statistics', details: err.message });
  }
});

// Owner Dashboard: Get system health metrics (Super Admin only)
router.get('/system-health', async (req, res) => {
  try {
    
    const health = {
      timestamp: new Date().toISOString(),
      
      database: {
        status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        readyState: mongoose.connection.readyState
      },
      
      storage: {
        r2Configured: r2Storage.isR2Configured(),
        status: r2Storage.isR2Configured() ? 'configured' : 'local_only'
      },
      
      server: {
        uptime: process.uptime(),
        uptimeFormatted: formatUptime(process.uptime()),
        memoryUsage: {
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          external: Math.round(process.memoryUsage().external / 1024 / 1024),
          unit: 'MB'
        },
        nodeVersion: process.version
      },
      
      environment: {
        hasOpenAIKey: !!process.env.OPENAI_API_KEY,
        hasJwtSecret: !!process.env.JWT_SECRET,
        hasMongoUri: !!process.env.MONGO_URI,
        hasFrontendUrl: !!process.env.FRONTEND_URL
      }
    };
    
    res.json(health);
  } catch (err) {
    console.error('Error fetching system health:', err);
    res.status(500).json({ error: 'Failed to fetch system health' });
  }
});


// ========================================
// AUDIT LOG ENDPOINTS - PG&E/NERC Compliance
// ========================================

// Get audit logs (Admin for company, Super Admin for all)
router.get('/audit-logs', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      action, 
      category, 
      severity, 
      userId: filterUserId,
      startDate,
      endDate,
      resourceType
    } = req.query;
    
    // Build query based on permissions
    const query = {};
    
    // Super admins can see all, regular admins only see their company
    if (!req.isSuperAdmin) {
      const user = await User.findById(req.userId).select('companyId isAdmin');
      if (!user?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      if (user.companyId) {
        query.companyId = user.companyId;
      }
    }
    
    // Apply filters (sanitized to prevent NoSQL injection)
    if (action) query.action = sanitizeString(action);
    if (category) query.category = sanitizeString(category);
    if (severity) query.severity = sanitizeString(severity);
    if (filterUserId) query.userId = sanitizeObjectId(filterUserId);
    if (resourceType) query.resourceType = sanitizeString(resourceType);
    
    // Date range (flat conditions to reduce nesting complexity)
    if (startDate) {
      query.timestamp = { ...query.timestamp, $gte: new Date(startDate) };
    }
    if (endDate) {
      query.timestamp = { ...query.timestamp, $lte: new Date(endDate) };
    }
    
    const safePage = sanitizeInt(page, 1, 10000);
    const safeLimit = sanitizeInt(limit, 50, 200);
    const skip = (safePage - 1) * safeLimit;
    
    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      AuditLog.countDocuments(query)
    ]);
    
    res.json({
      logs,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        pages: Math.ceil(total / safeLimit)
      }
    });
  } catch (err) {
    console.error('Error fetching audit logs:', err);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Get audit log summary/stats (for compliance dashboard)
router.get('/audit-stats', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Number.parseInt(days, 10));
    
    // Build company filter
    const matchStage = { timestamp: { $gte: startDate } };
    if (!req.isSuperAdmin) {
      const user = await User.findById(req.userId).select('companyId');
      if (user?.companyId) {
        matchStage.companyId = user.companyId;
      }
    }
    
    const [
      actionCounts,
      severityCounts,
      categoryCounts,
      dailyActivity,
      securityEvents
    ] = await Promise.all([
      // Count by action type
      AuditLog.aggregate([
        { $match: matchStage },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 }
      ]),
      
      // Count by severity
      AuditLog.aggregate([
        { $match: matchStage },
        { $group: { _id: '$severity', count: { $sum: 1 } } }
      ]),
      
      // Count by category
      AuditLog.aggregate([
        { $match: matchStage },
        { $group: { _id: '$category', count: { $sum: 1 } } }
      ]),
      
      // Daily activity (last 7 days)
      AuditLog.aggregate([
        { $match: { timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, ...matchStage } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          count: { $sum: 1 }
        }},
        { $sort: { _id: 1 } }
      ]),
      
      // Recent security events (critical/warning)
      AuditLog.find({
        ...matchStage,
        severity: { $in: ['critical', 'warning'] }
      })
        .sort({ timestamp: -1 })
        .limit(10)
        .lean()
    ]);
    
    res.json({
      period: { days: Number.parseInt(days, 10), startDate },
      actionCounts: actionCounts.reduce((acc, { _id, count }) => ({ ...acc, [_id]: count }), {}),
      severityCounts: severityCounts.reduce((acc, { _id, count }) => ({ ...acc, [_id]: count }), {}),
      categoryCounts: categoryCounts.reduce((acc, { _id, count }) => ({ ...acc, [_id]: count }), {}),
      dailyActivity,
      recentSecurityEvents: securityEvents
    });
  } catch (err) {
    console.error('Error fetching audit stats:', err);
    res.status(500).json({ error: 'Failed to fetch audit stats' });
  }
});

// Export audit logs for compliance (CSV format)
router.get('/audit-logs/export', async (req, res) => {
  try {
    const { startDate, endDate, format = 'csv' } = req.query;
    
    // Build query
    const query = {};
    if (!req.isSuperAdmin) {
      const user = await User.findById(req.userId).select('companyId');
      if (user?.companyId) {
        query.companyId = user.companyId;
      }
    }
    
    if (startDate) query.timestamp = { $gte: new Date(startDate) };
    if (endDate) query.timestamp = { ...query.timestamp, $lte: new Date(endDate) };
    
    const logs = await AuditLog.find(query)
      .sort({ timestamp: -1 })
      .limit(10000) // Cap at 10k records for export
      .lean();
    
    // Log the export action itself
    logExport.bulkDownload(req, null, logs.length);
    
    if (format === 'csv') {
      const csvHeader = 'Timestamp,User,Email,Action,Category,Severity,Resource Type,Resource Name,IP Address,Success\n';
      const csvRows = logs.map(log => 
        `"${log.timestamp.toISOString()}","${log.userName || ''}","${log.userEmail || ''}","${log.action}","${log.category || ''}","${log.severity}","${log.resourceType || ''}","${log.resourceName || ''}","${log.ipAddress || ''}","${log.success}"`
      ).join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvHeader + csvRows);
    } else {
      res.json(logs);
    }
  } catch (err) {
    console.error('Error exporting audit logs:', err);
    res.status(500).json({ error: 'Failed to export audit logs' });
  }
});

// ========================================
// SECURITY - IP BLOCKLIST MANAGEMENT (Super Admin only)
// ========================================

// Get all blocked IPs
router.get('/security/blocked-ips', async (req, res) => {
  try {
    const blockedIPs = await getBlockedIPs();
    res.json({
      count: blockedIPs.length,
      blockedIPs
    });
  } catch (err) {
    console.error('Error getting blocked IPs:', err);
    res.status(500).json({ error: 'Failed to get blocked IPs' });
  }
});

// Block an IP manually
router.post('/security/block-ip', async (req, res) => {
  try {
    const { ip, reason, permanent = false, durationMinutes = 60 } = req.body;
    
    if (!ip) {
      return res.status(400).json({ error: 'IP address is required' });
    }
    
    // Validate IP format (basic check)
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([a-fA-F0-9:]+)$/;
    if (!ipv4Regex.test(ip) && !ipv6Regex.test(ip)) {
      return res.status(400).json({ error: 'Invalid IP address format' });
    }
    
    const durationMs = permanent ? null : durationMinutes * 60 * 1000;
    const result = await blockIP(ip, durationMs, reason || 'Manually blocked by admin', permanent);
    
    // Log the action
    await AuditLog.log({
      timestamp: new Date(),
      userId: req.userId,
      userEmail: req.userEmail,
      action: 'IP_BLOCKED',
      category: 'security',
      severity: 'warning',
      details: {
        blockedIP: ip,
        reason: reason || 'Manually blocked by admin',
        permanent,
        durationMinutes: permanent ? null : durationMinutes
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      success: true
    });
    
    res.json({
      message: `IP ${ip} has been blocked`,
      ...result
    });
  } catch (err) {
    console.error('Error blocking IP:', err);
    res.status(500).json({ error: 'Failed to block IP' });
  }
});

// Unblock an IP
router.delete('/security/unblock-ip/:ip', async (req, res) => {
  try {
    const { ip } = req.params;
    
    if (!ip) {
      return res.status(400).json({ error: 'IP address is required' });
    }
    
    const wasBlocked = await unblockIP(ip);
    
    if (!wasBlocked) {
      return res.status(404).json({ error: 'IP was not blocked' });
    }
    
    // Log the action
    await AuditLog.log({
      timestamp: new Date(),
      userId: req.userId,
      userEmail: req.userEmail,
      action: 'IP_UNBLOCKED',
      category: 'security',
      severity: 'info',
      details: { unblockedIP: ip },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      success: true
    });
    
    res.json({ message: `IP ${ip} has been unblocked` });
  } catch (err) {
    console.error('Error unblocking IP:', err);
    res.status(500).json({ error: 'Failed to unblock IP' });
  }
});

// ========================================
// SUPER ADMIN - COMPANY ONBOARDING
// Simple endpoints for non-technical owners to add companies/users
// ========================================


// Admin: Cleanup emergency test jobs
router.delete('/cleanup-emergency-jobs', async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const result = await Job.deleteMany({
      $or: [
        { isEmergency: true },
        { title: /emergency/i },
        { priority: 'emergency' }
      ]
    });
    
    console.log(`Admin cleanup: Deleted ${result.deletedCount} emergency jobs`);
    res.json({ message: `Deleted ${result.deletedCount} emergency jobs` });
  } catch (err) {
    console.error('Error cleaning up emergency jobs:', err);
    res.status(500).json({ error: 'Failed to cleanup jobs', details: err.message });
  }
});

module.exports = router;
