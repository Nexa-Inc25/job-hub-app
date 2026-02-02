/**
 * Admin Controller
 * 
 * Handles administrative functions including:
 * - Audit log viewing and export
 * - System health monitoring
 * - User management
 */

const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const { sanitizeString, sanitizeObjectId, sanitizeInt, sanitizeDate } = require('../utils/sanitize');

/**
 * Get audit logs with pagination and filtering
 * 
 * @route GET /api/admin/audit-logs
 */
const getAuditLogs = async (req, res) => {
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
    
    // Sanitize and apply filters (prevent NoSQL injection)
    const safeAction = sanitizeString(action);
    const safeCategory = sanitizeString(category);
    const safeSeverity = sanitizeString(severity);
    const safeFilterUserId = sanitizeObjectId(filterUserId);
    const safeResourceType = sanitizeString(resourceType);
    
    if (safeAction) query.action = safeAction;
    if (safeCategory) query.category = safeCategory;
    if (safeSeverity) query.severity = safeSeverity;
    if (safeFilterUserId) query.userId = safeFilterUserId;
    if (safeResourceType) query.resourceType = safeResourceType;
    
    // Date range (sanitized)
    const safeStartDate = sanitizeDate(startDate);
    const safeEndDate = sanitizeDate(endDate);
    if (safeStartDate || safeEndDate) {
      query.timestamp = {};
      if (safeStartDate) query.timestamp.$gte = safeStartDate;
      if (safeEndDate) query.timestamp.$lte = safeEndDate;
    }
    
    // Sanitize pagination
    const safePage = sanitizeInt(page, 1, 10000);
    const safeLimit = sanitizeInt(limit, 50, 100);
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
};

/**
 * Get audit log statistics for compliance dashboard
 * 
 * @route GET /api/admin/audit-stats
 */
const getAuditStats = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
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
        { $match: { timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
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
      period: { days: parseInt(days), startDate },
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
};

/**
 * Export audit logs in CSV format for compliance
 * 
 * @route GET /api/admin/audit-logs/export
 */
const exportAuditLogs = async (req, res) => {
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
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }
    
    const logs = await AuditLog.find(query)
      .sort({ timestamp: -1 })
      .limit(10000) // Limit export to 10k records
      .lean();
    
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.json');
      return res.json(logs);
    }
    
    // Default to CSV
    const csvHeader = 'Timestamp,Action,User Email,User Role,Resource Type,Resource Name,IP Address,Severity,Success,Details\n';
    const csvRows = logs.map(log => {
      const details = log.details ? JSON.stringify(log.details).replace(/"/g, '""') : '';
      return [
        log.timestamp?.toISOString() || '',
        log.action || '',
        log.userEmail || '',
        log.userRole || '',
        log.resourceType || '',
        log.resourceName || '',
        log.ipAddress || '',
        log.severity || '',
        log.success ? 'Yes' : 'No',
        `"${details}"`
      ].join(',');
    }).join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.csv');
    res.send(csvHeader + csvRows);
  } catch (err) {
    console.error('Error exporting audit logs:', err);
    res.status(500).json({ error: 'Failed to export audit logs' });
  }
};

/**
 * Get list of users (admin only)
 * 
 * @route GET /api/admin/users
 */
const getUsers = async (req, res) => {
  try {
    // Build query based on permissions
    const query = { isDeleted: { $ne: true } };
    
    if (!req.isSuperAdmin) {
      const adminUser = await User.findById(req.userId).select('companyId');
      if (adminUser?.companyId) {
        query.companyId = adminUser.companyId;
      }
    }
    
    const users = await User.find(query)
      .select('name email role isAdmin isActive createdAt lastLogin companyId')
      .sort({ createdAt: -1 })
      .lean();
    
    res.json({ users });
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

/**
 * Update user role (admin only)
 * 
 * @route PUT /api/admin/users/:id/role
 */
const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, isAdmin } = req.body;
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check company access
    if (!req.isSuperAdmin) {
      const adminUser = await User.findById(req.userId).select('companyId');
      if (adminUser?.companyId?.toString() !== user.companyId?.toString()) {
        return res.status(403).json({ error: 'Cannot modify users from other companies' });
      }
    }
    
    // Update fields
    if (role) user.role = role;
    if (typeof isAdmin === 'boolean') {
      // Only super admins can make other admins
      if (isAdmin && !req.isSuperAdmin) {
        return res.status(403).json({ error: 'Only super admins can grant admin access' });
      }
      user.isAdmin = isAdmin;
    }
    
    await user.save();
    
    res.json({ 
      message: 'User updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isAdmin: user.isAdmin
      }
    });
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
};

/**
 * Deactivate user (soft delete)
 * 
 * @route DELETE /api/admin/users/:id
 */
const deactivateUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check company access
    if (!req.isSuperAdmin) {
      const adminUser = await User.findById(req.userId).select('companyId');
      if (adminUser?.companyId?.toString() !== user.companyId?.toString()) {
        return res.status(403).json({ error: 'Cannot modify users from other companies' });
      }
    }
    
    // Prevent self-deactivation
    if (user._id.toString() === req.userId) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }
    
    user.isActive = false;
    user.isDeleted = true;
    user.deletedAt = new Date();
    await user.save();
    
    res.json({ message: 'User deactivated successfully' });
  } catch (err) {
    console.error('Error deactivating user:', err);
    res.status(500).json({ error: 'Failed to deactivate user' });
  }
};

module.exports = {
  getAuditLogs,
  getAuditStats,
  exportAuditLogs,
  getUsers,
  updateUserRole,
  deactivateUser
};

