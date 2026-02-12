/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Oracle Enterprise Asset Management (EAM) Adapter
 * 
 * Integrates with Oracle Cloud EAM for:
 * - Updating asset records (poles, transformers, equipment)
 * - Completing work orders
 * - Recording maintenance/installation data
 * 
 * API Reference: https://docs.oracle.com/en/cloud/saas/supply-chain-management/
 */

const axios = require('axios');

class EAMAdapter {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || process.env.ORACLE_EAM_BASE_URL;
    this.clientId = config.clientId || process.env.ORACLE_EAM_CLIENT_ID;
    this.clientSecret = config.clientSecret || process.env.ORACLE_EAM_CLIENT_SECRET;
    
    this.accessToken = null;
    this.tokenExpiry = null;
    
    // API client
    this.client = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
  }
  
  /**
   * Check if adapter is configured
   */
  isConfigured() {
    return Boolean(this.baseUrl && this.clientId && this.clientSecret);
  }
  
  /**
   * Authenticate with Oracle Cloud OAuth 2.0
   */
  async authenticate() {
    if (this.accessToken && this.tokenExpiry > Date.now()) {
      return this.accessToken;
    }
    
    if (!this.isConfigured()) {
      throw new Error('EAM adapter not configured. Set ORACLE_EAM_* environment variables');
    }
    
    try {
      // Oracle Cloud uses OAuth 2.0 client credentials
      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      
      const response = await this.client.post(
        `${this.baseUrl}/oauth2/v1/token`,
        'grant_type=client_credentials&scope=urn:opc:resource:consumer::all',
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      
      this.accessToken = response.data.access_token;
      // Token valid for 1 hour, refresh at 50 minutes
      this.tokenExpiry = Date.now() + (50 * 60 * 1000);
      
      return this.accessToken;
    } catch (error) {
      console.error('[EAMAdapter] Authentication failed:', error.message);
      throw new Error(`Oracle EAM authentication failed: ${error.message}`);
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
   * Complete a maintenance work order
   * 
   * @param {Object} options
   * @param {string} options.workOrderNumber - Work order number
   * @param {string} options.completionDate - Completion date (ISO format)
   * @param {Object} options.completionData - Completion details
   */
  async completeWorkOrder(options) {
    const { workOrderNumber, completionDate, completionData = {} } = options;
    
    console.log(`[EAMAdapter] Completing work order ${workOrderNumber}`);
    
    if (!this.isConfigured()) {
      return this.mockWorkOrderResponse(options);
    }
    
    try {
      const headers = await this.getHeaders();
      
      // Get work order ID
      const workOrder = await this.getWorkOrder(workOrderNumber, headers);
      
      // Update work order status
      await this.client.patch(
        `${this.baseUrl}/fscmRestApi/resources/11.13.18.05/maintenanceWorkOrders/${workOrder.WorkOrderId}`,
        {
          WorkOrderStatusCode: 'COMPLETE',
          ActualCompletionDate: completionDate,
          ActualStartDate: completionData.startDate || completionDate,
          CompletionComments: completionData.comments || 'Completed via FieldLedger',
          // Flexfields for custom data
          AttributeCategory: 'FIELDLEDGER',
          Attribute1: completionData.foremanName,
          Attribute2: completionData.pmNumber,
          Attribute3: completionData.submissionId
        },
        { headers }
      );
      
      return {
        success: true,
        workOrderId: workOrder.WorkOrderId,
        workOrderNumber,
        newStatus: 'COMPLETE',
        completionDate,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('[EAMAdapter] Work order completion failed:', error.message);
      throw new Error(`Work order completion failed: ${error.message}`);
    }
  }
  
  /**
   * Get work order by number
   */
  async getWorkOrder(workOrderNumber, headers) {
    const response = await this.client.get(
      `${this.baseUrl}/fscmRestApi/resources/11.13.18.05/maintenanceWorkOrders`,
      {
        headers,
        params: {
          q: `WorkOrderNumber='${workOrderNumber}'`
        }
      }
    );
    
    if (!response.data.items || response.data.items.length === 0) {
      throw new Error(`Work order ${workOrderNumber} not found`);
    }
    
    return response.data.items[0];
  }
  
  /**
   * Update asset record (e.g., pole installation/replacement)
   * 
   * @param {Object} options
   * @param {string} options.assetNumber - Asset/equipment number
   * @param {string} options.assetType - Type (POLE, TRANSFORMER, etc.)
   * @param {Object} options.assetData - Updated asset data
   */
  async updateAsset(options) {
    const { assetNumber, assetType, assetData = {} } = options;
    
    console.log(`[EAMAdapter] Updating asset ${assetNumber} (${assetType})`);
    
    if (!this.isConfigured()) {
      return this.mockAssetResponse(options);
    }
    
    try {
      const headers = await this.getHeaders();
      
      // Get asset ID
      const asset = await this.getAsset(assetNumber, headers);
      
      // Build update payload based on asset type
      const updatePayload = this.buildAssetPayload(assetType, assetData);
      
      await this.client.patch(
        `${this.baseUrl}/fscmRestApi/resources/11.13.18.05/assets/${asset.AssetId}`,
        updatePayload,
        { headers }
      );
      
      return {
        success: true,
        assetId: asset.AssetId,
        assetNumber,
        assetType,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('[EAMAdapter] Asset update failed:', error.message);
      throw new Error(`Asset update failed: ${error.message}`);
    }
  }
  
  /**
   * Get asset by number
   */
  async getAsset(assetNumber, headers) {
    const response = await this.client.get(
      `${this.baseUrl}/fscmRestApi/resources/11.13.18.05/assets`,
      {
        headers,
        params: {
          q: `AssetNumber='${assetNumber}'`
        }
      }
    );
    
    if (!response.data.items || response.data.items.length === 0) {
      throw new Error(`Asset ${assetNumber} not found`);
    }
    
    return response.data.items[0];
  }
  
  /**
   * Create new asset record
   * 
   * @param {Object} options
   * @param {string} options.assetType - POLE, TRANSFORMER, etc.
   * @param {Object} options.assetData - Asset creation data
   */
  async createAsset(options) {
    const { assetType, assetData } = options;
    
    console.log(`[EAMAdapter] Creating new ${assetType} asset`);
    
    if (!this.isConfigured()) {
      return this.mockAssetResponse({ ...options, action: 'create' });
    }
    
    try {
      const headers = await this.getHeaders();
      
      const payload = {
        AssetType: assetType,
        AssetNumber: assetData.assetNumber,
        AssetDescription: assetData.description,
        SerialNumber: assetData.serialNumber,
        InstallationDate: assetData.installationDate,
        LocationCode: assetData.locationCode,
        // GPS coordinates
        LatitudeValue: assetData.latitude,
        LongitudeValue: assetData.longitude,
        // Flexfields
        AttributeCategory: 'DISTRIBUTION_ASSET',
        Attribute1: assetData.poleClass || assetData.rating,
        Attribute2: assetData.height || assetData.kva,
        Attribute3: assetData.manufacturer,
        Attribute4: assetData.installationWorkOrder,
        Attribute5: 'FieldLedger'
      };
      
      const response = await this.client.post(
        `${this.baseUrl}/fscmRestApi/resources/11.13.18.05/assets`,
        payload,
        { headers }
      );
      
      return {
        success: true,
        assetId: response.data.AssetId,
        assetNumber: response.data.AssetNumber,
        assetType,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('[EAMAdapter] Asset creation failed:', error.message);
      throw new Error(`Asset creation failed: ${error.message}`);
    }
  }
  
  /**
   * Build asset update payload based on type
   */
  buildAssetPayload(assetType, data) {
    const basePayload = {
      LastUpdateDate: new Date().toISOString(),
      AttributeCategory: 'DISTRIBUTION_ASSET',
      Attribute5: 'FieldLedger'
    };
    
    switch (assetType.toUpperCase()) {
      case 'POLE':
        return {
          ...basePayload,
          AssetDescription: data.description || `Pole ${data.poleClass}`,
          InstallationDate: data.installationDate,
          LatitudeValue: data.latitude,
          LongitudeValue: data.longitude,
          Attribute1: data.poleClass,  // e.g., "45-5"
          Attribute2: data.height,     // e.g., "45"
          Attribute3: data.material,   // e.g., "WOOD", "STEEL"
          Attribute4: data.framing     // Framing type
        };
        
      case 'TRANSFORMER':
        return {
          ...basePayload,
          AssetDescription: data.description || `Transformer ${data.kva}kVA`,
          InstallationDate: data.installationDate,
          Attribute1: data.kva,
          Attribute2: data.voltage,
          Attribute3: data.manufacturer,
          Attribute4: data.serialNumber
        };
        
      case 'RECLOSER':
      case 'REGULATOR':
      case 'CAPACITOR':
        return {
          ...basePayload,
          AssetDescription: data.description,
          InstallationDate: data.installationDate,
          Attribute1: data.rating,
          Attribute2: data.manufacturer,
          Attribute3: data.model,
          Attribute4: data.serialNumber
        };
        
      default:
        return {
          ...basePayload,
          AssetDescription: data.description,
          InstallationDate: data.installationDate
        };
    }
  }
  
  /**
   * Attach document to work order
   */
  async attachDocument(options) {
    const { workOrderNumber, fileName, fileContent, contentType = 'application/pdf' } = options;
    
    console.log(`[EAMAdapter] Attaching ${fileName} to work order ${workOrderNumber}`);
    
    if (!this.isConfigured()) {
      return {
        success: true,
        mock: true,
        attachmentId: `MOCK-ATT-${Date.now()}`,
        message: 'Document attachment simulated'
      };
    }
    
    try {
      const headers = await this.getHeaders();
      const workOrder = await this.getWorkOrder(workOrderNumber, headers);
      
      const fileBase64 = Buffer.isBuffer(fileContent)
        ? fileContent.toString('base64')
        : fileContent;
      
      const response = await this.client.post(
        `${this.baseUrl}/fscmRestApi/resources/11.13.18.05/maintenanceWorkOrders/${workOrder.WorkOrderId}/child/attachments`,
        {
          DatatypeCode: 'FILE',
          FileName: fileName,
          FileContentType: contentType,
          FileContents: fileBase64,
          Title: fileName,
          Description: `Uploaded from FieldLedger`
        },
        { headers }
      );
      
      return {
        success: true,
        attachmentId: response.data.AttachmentId,
        fileName,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('[EAMAdapter] Document attachment failed:', error.message);
      throw new Error(`Document attachment failed: ${error.message}`);
    }
  }
  
  /**
   * Report asset meter reading (for tracked equipment)
   */
  async reportMeterReading(options) {
    const { assetNumber, meterType, reading, readingDate } = options;
    
    console.log(`[EAMAdapter] Reporting ${meterType} reading for ${assetNumber}`);
    
    if (!this.isConfigured()) {
      return {
        success: true,
        mock: true,
        readingId: `MOCK-RDG-${Date.now()}`,
        message: 'Meter reading simulated'
      };
    }
    
    try {
      const headers = await this.getHeaders();
      const asset = await this.getAsset(assetNumber, headers);
      
      const response = await this.client.post(
        `${this.baseUrl}/fscmRestApi/resources/11.13.18.05/assetMeterReadings`,
        {
          AssetId: asset.AssetId,
          MeterType: meterType,
          Reading: reading,
          ReadingDate: readingDate || new Date().toISOString(),
          SourceType: 'FIELDLEDGER'
        },
        { headers }
      );
      
      return {
        success: true,
        readingId: response.data.MeterReadingId,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('[EAMAdapter] Meter reading failed:', error.message);
      throw error;
    }
  }
  
  /**
   * Mock responses for unconfigured environments
   */
  mockWorkOrderResponse(options) {
    console.log('[EAMAdapter] Using mock response (adapter not configured)');
    return {
      success: true,
      mock: true,
      workOrderId: `MOCK-WO-${Date.now()}`,
      workOrderNumber: options.workOrderNumber,
      newStatus: 'COMPLETE',
      message: 'Work order completion simulated. Configure ORACLE_EAM_* env vars for production.',
      timestamp: new Date().toISOString()
    };
  }
  
  mockAssetResponse(options) {
    console.log('[EAMAdapter] Using mock response (adapter not configured)');
    return {
      success: true,
      mock: true,
      assetId: `MOCK-ASSET-${Date.now()}`,
      assetNumber: options.assetNumber || `NEW-${Date.now()}`,
      assetType: options.assetType,
      message: 'Asset operation simulated. Configure ORACLE_EAM_* env vars for production.',
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Process as-built submission for EAM updates
   * High-level method for full workflow
   */
  async processAsBuilt(submission) {
    console.log(`[EAMAdapter] Processing as-built for EAM: ${submission.pmNumber}`);
    
    const results = {
      pmNumber: submission.pmNumber,
      workOrderUpdate: null,
      assetUpdates: [],
      documents: [],
      errors: []
    };
    
    try {
      // 1. Complete work order if provided
      if (submission.workOrderNumber) {
        try {
          results.workOrderUpdate = await this.completeWorkOrder({
            workOrderNumber: submission.workOrderNumber,
            completionDate: submission.completedAt || new Date().toISOString(),
            completionData: {
              foremanName: submission.submittedBy,
              pmNumber: submission.pmNumber,
              submissionId: submission.submissionId
            }
          });
        } catch (err) {
          results.errors.push({ type: 'workOrder', error: err.message });
        }
      }
      
      // 2. Update assets (poles, equipment)
      const assetSections = (submission.sections || []).filter(s => 
        s.sectionType === 'equipment_info' && s.extractedData
      );
      
      for (const section of assetSections) {
        const assets = section.extractedData.assets || [];
        for (const asset of assets) {
          try {
            const result = await this.updateAsset({
              assetNumber: asset.assetNumber,
              assetType: asset.type,
              assetData: {
                ...asset,
                installationDate: submission.completedAt
              }
            });
            results.assetUpdates.push(result);
          } catch (err) {
            results.errors.push({ type: 'asset', assetNumber: asset.assetNumber, error: err.message });
          }
        }
      }
      
      // 3. Attach key documents to work order
      if (submission.workOrderNumber) {
        const docSections = ['construction_sketch', 'ccsc', 'photos'];
        for (const section of (submission.sections || [])) {
          if (docSections.includes(section.sectionType) && section.fileContent) {
            try {
              const result = await this.attachDocument({
                workOrderNumber: submission.workOrderNumber,
                fileName: `${submission.pmNumber}_${section.sectionType}.pdf`,
                fileContent: section.fileContent
              });
              results.documents.push(result);
            } catch (err) {
              results.errors.push({ type: 'document', sectionType: section.sectionType, error: err.message });
            }
          }
        }
      }
      
      results.success = results.errors.length === 0;
      results.timestamp = new Date().toISOString();
      
      return results;
      
    } catch (error) {
      console.error('[EAMAdapter] Processing failed:', error.message);
      results.success = false;
      results.errors.push({ type: 'general', error: error.message });
      return results;
    }
  }
}

module.exports = EAMAdapter;

