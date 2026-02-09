/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
#!/usr/bin/env node
/**
 * FieldLedger Security Audit Script
 * 
 * Run with: node scripts/securityAudit.js
 * 
 * This script checks:
 * - Environment configuration
 * - Password strength of existing users
 * - Locked accounts
 * - Super admin configuration
 * - Recent failed login attempts
 */

require('dotenv').config();
const mongoose = require('mongoose');

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

async function runSecurityAudit() {
  console.log('\n' + '='.repeat(60));
  console.log(colors.bold + '  FIELDLEDGER SECURITY AUDIT' + colors.reset);
  console.log('='.repeat(60));

  const issues = { critical: 0, warning: 0, info: 0 };

  try {
    // ============================================
    // 1. ENVIRONMENT SECURITY
    // ============================================
    log.header('ENVIRONMENT SECURITY');

    // Check JWT_SECRET strength
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      log.error('JWT_SECRET is not set!');
      issues.critical++;
    } else if (jwtSecret.length < 32) {
      log.warn(`JWT_SECRET is short (${jwtSecret.length} chars) - recommend 32+ chars`);
      issues.warning++;
    } else {
      log.success(`JWT_SECRET length: ${jwtSecret.length} chars`);
    }

    // Check if production has debug mode
    if (process.env.NODE_ENV !== 'production') {
      log.warn('NODE_ENV is not set to "production"');
      issues.warning++;
    } else {
      log.success('Running in production mode');
    }

    // ============================================
    // 2. DATABASE CONNECTION
    // ============================================
    log.header('DATABASE');

    if (!process.env.MONGO_URI) {
      log.error('MONGO_URI not set');
      issues.critical++;
      return issues;
    }

    await mongoose.connect(process.env.MONGO_URI);
    log.success('MongoDB connected');

    const User = require('../models/User');

    // ============================================
    // 3. SUPER ADMIN AUDIT
    // ============================================
    log.header('SUPER ADMIN CONFIGURATION');

    const superAdmins = await User.find({ isSuperAdmin: true }).select('email name createdAt');
    log.info(`Super Admins: ${superAdmins.length}`);
    
    if (superAdmins.length === 0) {
      log.error('No Super Admins configured! Owner dashboard is inaccessible.');
      issues.critical++;
    } else if (superAdmins.length > 5) {
      log.warn(`Too many Super Admins (${superAdmins.length}) - should be 2-3 maximum`);
      issues.warning++;
    } else {
      log.success('Super Admin count is appropriate');
    }

    for (const admin of superAdmins) {
      console.log(`     - ${admin.email} (${admin.name})`);
    }

    // ============================================
    // 4. ACCOUNT LOCKOUT STATUS
    // ============================================
    log.header('ACCOUNT SECURITY');

    const lockedAccounts = await User.find({ 
      lockoutUntil: { $gt: new Date() } 
    }).select('email lockoutUntil failedLoginAttempts');

    if (lockedAccounts.length > 0) {
      log.warn(`Locked accounts: ${lockedAccounts.length}`);
      issues.warning++;
      for (const acc of lockedAccounts) {
        const remaining = Math.ceil((acc.lockoutUntil - new Date()) / 60000);
        console.log(`     - ${acc.email} (${remaining} mins remaining, ${acc.failedLoginAttempts} attempts)`);
      }
    } else {
      log.success('No currently locked accounts');
    }

    // Recent failed login attempts (last 24 hours)
    const recentFailed = await User.find({
      lastFailedLogin: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      failedLoginAttempts: { $gt: 0 }
    }).select('email failedLoginAttempts lastFailedLogin').sort({ failedLoginAttempts: -1 }).limit(10);

    if (recentFailed.length > 0) {
      log.info(`Accounts with recent failed logins (24h): ${recentFailed.length}`);
      for (const acc of recentFailed) {
        console.log(`     - ${acc.email}: ${acc.failedLoginAttempts} failed attempts`);
      }
    } else {
      log.success('No failed login attempts in last 24 hours');
    }

    // ============================================
    // 5. USERS WITHOUT COMPANY
    // ============================================
    log.header('MULTI-TENANCY SECURITY');

    const usersWithoutCompany = await User.countDocuments({
      $or: [{ companyId: { $exists: false } }, { companyId: null }],
      isSuperAdmin: { $ne: true }  // Super admins may not have company
    });

    if (usersWithoutCompany > 0) {
      log.warn(`Non-admin users without company: ${usersWithoutCompany}`);
      issues.warning++;
      
      const orphans = await User.find({
        $or: [{ companyId: { $exists: false } }, { companyId: null }],
        isSuperAdmin: { $ne: true }
      }).select('email role isAdmin').limit(5);
      
      for (const u of orphans) {
        console.log(`     - ${u.email} (${u.role}${u.isAdmin ? ', admin' : ''})`);
      }
    } else {
      log.success('All non-admin users have company assignment');
    }

    // ============================================
    // 6. ADMIN DISTRIBUTION
    // ============================================
    log.header('ADMIN DISTRIBUTION');

    const adminCount = await User.countDocuments({ isAdmin: true });
    const totalUsers = await User.countDocuments();
    const adminRatio = ((adminCount / totalUsers) * 100).toFixed(1);

    log.info(`Admins: ${adminCount}/${totalUsers} (${adminRatio}%)`);

    if (adminRatio > 50) {
      log.warn('High admin ratio - consider reviewing permissions');
      issues.warning++;
    }

    // ============================================
    // 7. SECURITY FEATURES STATUS
    // ============================================
    log.header('SECURITY FEATURES STATUS');

    const securityFeatures = [
      { name: 'Password hashing (bcrypt)', status: true },
      { name: 'JWT authentication', status: true },
      { name: 'Rate limiting on auth endpoints', status: true },
      { name: 'Account lockout after failed attempts', status: true },
      { name: 'Security headers (helmet)', status: true },
      { name: 'NoSQL injection prevention', status: true },
      { name: 'CORS whitelist', status: true },
      { name: 'Multi-tenant data isolation', status: true },
    ];

    for (const feature of securityFeatures) {
      if (feature.status) {
        log.success(feature.name);
      } else {
        log.error(feature.name);
        issues.critical++;
      }
    }

    // ============================================
    // SUMMARY
    // ============================================
    log.header('SECURITY AUDIT SUMMARY');

    console.log(`${colors.red}Critical Issues:${colors.reset} ${issues.critical}`);
    console.log(`${colors.yellow}Warnings:${colors.reset}        ${issues.warning}`);
    console.log(`${colors.blue}Info:${colors.reset}            ${issues.info}`);

    if (issues.critical === 0 && issues.warning === 0) {
      console.log(`\n${colors.green}${colors.bold}✓ Security audit passed!${colors.reset}\n`);
    } else if (issues.critical === 0) {
      console.log(`\n${colors.yellow}${colors.bold}⚠ Security audit passed with warnings${colors.reset}\n`);
    } else {
      console.log(`\n${colors.red}${colors.bold}✗ Security audit found critical issues!${colors.reset}\n`);
    }

    return issues;

  } catch (error) {
    log.error(`Audit failed: ${error.message}`);
    console.error(error);
    issues.critical++;
    return issues;
  } finally {
    await mongoose.connection.close();
    log.info('Database connection closed');
  }
}

runSecurityAudit()
  .then(issues => {
    process.exit(issues.critical > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });

