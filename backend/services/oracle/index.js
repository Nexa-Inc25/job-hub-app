/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Oracle Integration Services
 * 
 * Unified interface for all Oracle Cloud integrations:
 * - Primavera Unifier (Project/Document Management)
 * - EAM (Enterprise Asset Management)
 * - P6 EPPM (Project Scheduling)
 * - Fusion Cloud ERP (Already in billing routes as FBDI export)
 */

const UnifierAdapter = require('./UnifierAdapter');
const EAMAdapter = require('./EAMAdapter');
const P6Adapter = require('./P6Adapter');

class OracleIntegrationService {
  constructor() {
    this.unifier = new UnifierAdapter();
    this.eam = new EAMAdapter();
    this.p6 = new P6Adapter();
  }
  
  /**
   * Get status of all Oracle integrations
   */
  getStatus() {
    return {
      unifier: {
        configured: this.unifier.isConfigured(),
        description: 'Primavera Unifier - Document & Project Management'
      },
      eam: {
        configured: this.eam.isConfigured(),
        description: 'Enterprise Asset Management'
      },
      p6: {
        configured: this.p6.isConfigured(),
        description: 'Primavera P6 - Project Scheduling'
      },
      fbdi: {
        configured: true, // Always available as file export
        description: 'Fusion Cloud ERP - FBDI Invoice Export'
      }
    };
  }
  
  /**
   * Submit as-built to all configured Oracle systems
   * 
   * @param {Object} submission - As-built submission object
   * @param {Object} options - Which systems to push to
   */
  async submitToOracle(submission, options = {}) {
    const { 
      pushToUnifier = true, 
      pushToEAM = true, 
      pushToP6 = true 
    } = options;
    
    const results = {
      submissionId: submission.submissionId || submission._id,
      pmNumber: submission.pmNumber,
      timestamp: new Date().toISOString(),
      systems: {}
    };
    
    // Push to Unifier (documents & project records)
    if (pushToUnifier) {
      try {
        results.systems.unifier = await this.unifier.submitAsBuiltPackage(submission);
      } catch (error) {
        results.systems.unifier = { 
          success: false, 
          error: error.message,
          configured: this.unifier.isConfigured()
        };
      }
    }
    
    // Push to EAM (asset updates & work order completion)
    if (pushToEAM) {
      try {
        results.systems.eam = await this.eam.processAsBuilt(submission);
      } catch (error) {
        results.systems.eam = { 
          success: false, 
          error: error.message,
          configured: this.eam.isConfigured()
        };
      }
    }
    
    // Push to P6 (schedule updates)
    if (pushToP6) {
      try {
        results.systems.p6 = await this.p6.processAsBuiltCompletion(submission);
      } catch (error) {
        results.systems.p6 = { 
          success: false, 
          error: error.message,
          configured: this.p6.isConfigured()
        };
      }
    }
    
    // Overall success if at least one system succeeded
    const systemResults = Object.values(results.systems);
    results.success = systemResults.some(r => r.success);
    results.allSuccess = systemResults.every(r => r.success);
    results.errors = systemResults
      .filter(r => !r.success && r.error)
      .map(r => r.error);
    
    return results;
  }
  
  /**
   * Test connection to an Oracle system
   */
  async testConnection(system) {
    switch (system.toLowerCase()) {
      case 'unifier':
        if (!this.unifier.isConfigured()) {
          return { success: false, message: 'Unifier not configured' };
        }
        try {
          await this.unifier.authenticate();
          return { success: true, message: 'Unifier connection successful' };
        } catch (error) {
          return { success: false, message: error.message };
        }
        
      case 'eam':
        if (!this.eam.isConfigured()) {
          return { success: false, message: 'EAM not configured' };
        }
        try {
          await this.eam.authenticate();
          return { success: true, message: 'EAM connection successful' };
        } catch (error) {
          return { success: false, message: error.message };
        }
        
      case 'p6':
        if (!this.p6.isConfigured()) {
          return { success: false, message: 'P6 not configured' };
        }
        try {
          await this.p6.authenticate();
          return { success: true, message: 'P6 connection successful' };
        } catch (error) {
          return { success: false, message: error.message };
        }
        
      default:
        return { success: false, message: `Unknown system: ${system}` };
    }
  }
}

// Singleton instance
const oracleService = new OracleIntegrationService();

module.exports = {
  OracleIntegrationService,
  oracleService,
  UnifierAdapter,
  EAMAdapter,
  P6Adapter
};

