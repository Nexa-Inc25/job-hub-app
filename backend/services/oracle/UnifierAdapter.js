/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Oracle Primavera Unifier Adapter
 * 
 * Integrates with Oracle Primavera Unifier for:
 * - Document uploads to project shells
 * - Business process record creation
 * - Project status updates
 * 
 * API Reference: https://docs.oracle.com/en/cloud/saas/primavera-unifier/
 */

const axios = require('axios');
const log = require('../../utils/logger');
const { createCircuitBreaker } = require('../../utils/circuitBreaker');

class UnifierAdapter {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || process.env.UNIFIER_BASE_URL;
    this.clientId = config.clientId || process.env.UNIFIER_CLIENT_ID;
    this.clientSecret = config.clientSecret || process.env.UNIFIER_CLIENT_SECRET;
    this.companyId = config.companyId || process.env.UNIFIER_COMPANY_ID;
    
    this.accessToken = null;
    this.tokenExpiry = null;
    this.adapterName = 'Unifier';
    
    // Circuit breaker: open after 5 consecutive failures, half-open after 30s
    this.breaker = createCircuitBreaker('oracle-unifier', {
      failureThreshold: 5,
      resetTimeout: 30000,
    });
    
    // API client
    this.client = axios.create({
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
  }
  
  /**
   * Execute a function with retry (exponential backoff) and circuit breaker
   * 3 retries with 1s, 2s, 4s delays
   */
  async _executeWithRetry(fn, operation) {
    const retryDelays = [1000, 2000, 4000];
    const maxAttempts = retryDelays.length + 1;
    
    return this.breaker.execute(async () => {
      let lastError;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          if (attempt > 1) {
            const delay = retryDelays[attempt - 2];
            log.info({ adapter: this.adapterName, operation, attempt, delayMs: delay }, 'Retrying after delay');
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          const startTime = Date.now();
          const result = await fn();
          const durationMs = Date.now() - startTime;
          log.info({ adapter: this.adapterName, operation, attempt, durationMs }, 'Request succeeded');
          return result;
        } catch (error) {
          lastError = error;
          log.warn({ adapter: this.adapterName, operation, attempt, err: error }, 'Request attempt failed');
          if (attempt === maxAttempts) {
            log.error({ adapter: this.adapterName, operation, attempts: maxAttempts, err: error }, 'All retries exhausted');
            throw error;
          }
        }
      }
      throw lastError;
    });
  }
  
  /**
   * Check if adapter is configured
   */
  isConfigured() {
    return Boolean(this.baseUrl && this.clientId && this.clientSecret);
  }
  
  /**
   * Authenticate with Unifier OAuth
   */
  async authenticate() {
    if (this.accessToken && this.tokenExpiry > Date.now()) {
      return this.accessToken;
    }
    
    if (!this.isConfigured()) {
      throw new Error('Unifier adapter not configured. Set UNIFIER_BASE_URL, UNIFIER_CLIENT_ID, UNIFIER_CLIENT_SECRET');
    }
    
    try {
      const response = await this.client.post(
        `${this.baseUrl}/ws/rest/service/v1/login`,
        {
          username: this.clientId,
          password: this.clientSecret,
          company: this.companyId
        }
      );
      
      this.accessToken = response.data.token;
      // Token valid for 1 hour, refresh at 50 minutes
      this.tokenExpiry = Date.now() + (50 * 60 * 1000);
      
      return this.accessToken;
    } catch (error) {
      log.error({ adapter: this.adapterName, err: error }, 'Authentication failed');
      throw new Error(`Unifier authentication failed: ${error.message}`);
    }
  }
  
  /**
   * Get authenticated headers
   */
  async getHeaders() {
    const token = await this.authenticate();
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }
  
  /**
   * Upload document to Unifier project
   * 
   * @param {Object} options
   * @param {string} options.projectNumber - Unifier project/shell number
   * @param {string} options.folderPath - Document folder path (e.g., "/As-Builts/Completed")
   * @param {string} options.fileName - Document file name
   * @param {Buffer|string} options.fileContent - File content (Buffer or base64)
   * @param {Object} options.metadata - Additional metadata
   */
  async uploadDocument(options) {
    const { projectNumber, folderPath, fileName, fileContent, metadata = {} } = options;
    
    log.info({ adapter: this.adapterName, projectNumber, fileName }, 'Uploading document');
    
    if (!this.isConfigured()) {
      // Return mock response for demo/unconfigured environments
      return this.mockUploadResponse(options);
    }
    
    return this._executeWithRetry(async () => {
      const headers = await this.getHeaders();
      
      // Step 1: Get project shell ID
      const shellId = await this.getShellId(projectNumber, headers);
      
      // Step 2: Get or create folder
      const folderId = await this.ensureFolder(shellId, folderPath, headers);
      
      // Step 3: Upload document
      const fileBase64 = Buffer.isBuffer(fileContent) 
        ? fileContent.toString('base64')
        : fileContent;
      
      const response = await this.client.post(
        `${this.baseUrl}/ws/rest/service/v1/document/upload`,
        {
          shellId,
          folderId,
          fileName,
          fileContent: fileBase64,
          contentType: this.getContentType(fileName),
          title: metadata.title || fileName,
          description: metadata.description || '',
          attributes: {
            SourceSystem: 'FieldLedger',
            PMNumber: projectNumber,
            DocumentType: metadata.documentType || 'AS_BUILT',
            UploadDate: new Date().toISOString(),
            ...metadata.customAttributes
          }
        },
        { headers }
      );
      
      return {
        success: true,
        documentId: response.data.documentId,
        version: response.data.version,
        url: response.data.url,
        timestamp: new Date().toISOString()
      };
    }, 'uploadDocument');
  }
  
  /**
   * Create business process record (e.g., As-Built Submittal)
   * 
   * @param {Object} options
   * @param {string} options.projectNumber - Project number
   * @param {string} options.bpName - Business process name (e.g., "As-Built Submittal")
   * @param {Object} options.recordData - Record field values
   */
  async createBPRecord(options) {
    const { projectNumber, bpName, recordData } = options;
    
    log.info({ adapter: this.adapterName, projectNumber, bpName }, 'Creating BP record');
    
    if (!this.isConfigured()) {
      return this.mockBPResponse(options);
    }
    
    return this._executeWithRetry(async () => {
      const headers = await this.getHeaders();
      const shellId = await this.getShellId(projectNumber, headers);
      
      const response = await this.client.post(
        `${this.baseUrl}/ws/rest/service/v1/bp/record`,
        {
          shellId,
          bpName,
          record: {
            uuu_title: recordData.title || `As-Built Submittal - ${projectNumber}`,
            uuu_status: 'Submitted',
            uuu_creation_date: new Date().toISOString(),
            // Standard as-built fields
            contractor_name: recordData.contractorName,
            pm_number: projectNumber,
            work_order_number: recordData.workOrderNumber,
            completion_date: recordData.completionDate,
            foreman_name: recordData.foremanName,
            // Custom fields as configured in Unifier
            ...recordData.customFields
          }
        },
        { headers }
      );
      
      return {
        success: true,
        recordId: response.data.recordId,
        recordNumber: response.data.recordNumber,
        status: response.data.status,
        timestamp: new Date().toISOString()
      };
    }, 'createBPRecord');
  }
  
  /**
   * Update project status/milestone
   */
  async updateProjectStatus(projectNumber, status, milestone) {
    log.info({ adapter: this.adapterName, projectNumber, status }, 'Updating project status');
    
    if (!this.isConfigured()) {
      return {
        success: true,
        projectNumber,
        newStatus: status,
        milestone,
        timestamp: new Date().toISOString()
      };
    }
    
    return this._executeWithRetry(async () => {
      const headers = await this.getHeaders();
      const shellId = await this.getShellId(projectNumber, headers);
      
      await this.client.patch(
        `${this.baseUrl}/ws/rest/service/v1/shell/${shellId}`,
        {
          attributes: {
            uuu_status: status,
            uuu_current_milestone: milestone,
            uuu_last_update: new Date().toISOString()
          }
        },
        { headers }
      );
      
      return {
        success: true,
        projectNumber,
        newStatus: status,
        timestamp: new Date().toISOString()
      };
    }, 'updateProjectStatus');
  }
  
  /**
   * Get shell/project ID from project number
   */
  async getShellId(projectNumber, headers) {
    const response = await this.client.get(
      `${this.baseUrl}/ws/rest/service/v1/shell`,
      {
        headers,
        params: {
          filter: `uuu_shell_number eq '${projectNumber}'`
        }
      }
    );
    
    if (!response.data.items || response.data.items.length === 0) {
      throw new Error(`Project ${projectNumber} not found in Unifier`);
    }
    
    return response.data.items[0].shellId;
  }
  
  /**
   * Ensure folder exists, create if necessary
   */
  async ensureFolder(shellId, folderPath, headers) {
    const pathParts = folderPath.split('/').filter(Boolean);
    let currentFolderId = null;
    
    for (const folderName of pathParts) {
      const response = await this.client.get(
        `${this.baseUrl}/ws/rest/service/v1/document/folder`,
        {
          headers,
          params: {
            shellId,
            parentFolderId: currentFolderId,
            folderName
          }
        }
      );
      
      if (response.data.folderId) {
        currentFolderId = response.data.folderId;
      } else {
        // Create folder
        const createResponse = await this.client.post(
          `${this.baseUrl}/ws/rest/service/v1/document/folder`,
          {
            shellId,
            parentFolderId: currentFolderId,
            folderName
          },
          { headers }
        );
        currentFolderId = createResponse.data.folderId;
      }
    }
    
    return currentFolderId;
  }
  
  /**
   * Get content type from file name
   */
  getContentType(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    const types = {
      pdf: 'application/pdf',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };
    return types[ext] || 'application/octet-stream';
  }
  
  /**
   * Mock response for unconfigured/demo environments
   */
  mockUploadResponse(_options) {
    log.debug({ adapter: this.adapterName }, 'Using mock response (adapter not configured)');
    return {
      success: true,
      mock: true,
      documentId: `MOCK-DOC-${Date.now()}`,
      version: 1,
      message: 'Document upload simulated. Configure UNIFIER_* env vars for production.',
      timestamp: new Date().toISOString()
    };
  }
  
  mockBPResponse(_options) {
    log.debug({ adapter: this.adapterName }, 'Using mock response (adapter not configured)');
    return {
      success: true,
      mock: true,
      recordId: `MOCK-REC-${Date.now()}`,
      recordNumber: `ASB-${Date.now().toString().slice(-6)}`,
      message: 'BP record creation simulated. Configure UNIFIER_* env vars for production.',
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Submit complete as-built package to Unifier
   * High-level method that handles the full workflow
   */
  async submitAsBuiltPackage(submission) {
    log.info({ adapter: this.adapterName, pmNumber: submission.pmNumber }, 'Submitting as-built package');
    
    const results = {
      projectNumber: submission.pmNumber,
      documents: [],
      bpRecord: null,
      errors: []
    };
    
    try {
      // 1. Upload all documents
      for (const section of submission.sections || []) {
        try {
          const uploadResult = await this.uploadDocument({
            projectNumber: submission.pmNumber,
            folderPath: '/As-Builts/FieldLedger',
            fileName: `${submission.pmNumber}_${section.sectionType}.pdf`,
            fileContent: section.fileContent || '',
            metadata: {
              documentType: section.sectionType.toUpperCase(),
              title: `${section.sectionType} - ${submission.pmNumber}`,
              description: section.description || ''
            }
          });
          results.documents.push({ sectionType: section.sectionType, ...uploadResult });
        } catch (err) {
          results.errors.push({ sectionType: section.sectionType, error: err.message });
        }
      }
      
      // 2. Create BP record
      try {
        results.bpRecord = await this.createBPRecord({
          projectNumber: submission.pmNumber,
          bpName: 'As-Built Submittal',
          recordData: {
            title: `As-Built Package - ${submission.pmNumber}`,
            contractorName: submission.companyName,
            workOrderNumber: submission.woNumber,
            completionDate: submission.completedAt,
            foremanName: submission.submittedBy
          }
        });
      } catch (err) {
        results.errors.push({ type: 'bpRecord', error: err.message });
      }
      
      // 3. Update project status
      if (results.documents.length > 0 && results.errors.length === 0) {
        await this.updateProjectStatus(
          submission.pmNumber,
          'As-Built Submitted',
          'CONSTRUCTION_COMPLETE'
        );
      }
      
      results.success = results.errors.length === 0;
      results.timestamp = new Date().toISOString();
      
      return results;
      
    } catch (error) {
      log.error({ adapter: this.adapterName, err: error }, 'Package submission failed');
      results.success = false;
      results.errors.push({ type: 'general', error: error.message });
      return results;
    }
  }
}

module.exports = UnifierAdapter;

