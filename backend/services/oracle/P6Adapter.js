/**
 * Oracle Primavera P6 Adapter
 * 
 * Integrates with Oracle Primavera P6 EPPM for:
 * - Project schedule updates
 * - Activity progress reporting
 * - Resource assignment updates
 * - XER file export/import
 * 
 * API Reference: https://docs.oracle.com/cd/E80480_01/English/integration_api/
 */

const axios = require('axios');

class P6Adapter {
  constructor(config = {}) {
    // P6 Cloud (EPPM) settings
    this.baseUrl = config.baseUrl || process.env.P6_BASE_URL;
    this.clientId = config.clientId || process.env.P6_CLIENT_ID;
    this.clientSecret = config.clientSecret || process.env.P6_CLIENT_SECRET;
    this.databaseId = config.databaseId || process.env.P6_DATABASE_ID || 1;
    
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
   * Authenticate with P6 EPPM
   */
  async authenticate() {
    if (this.accessToken && this.tokenExpiry > Date.now()) {
      return this.accessToken;
    }
    
    if (!this.isConfigured()) {
      throw new Error('P6 adapter not configured. Set P6_BASE_URL, P6_CLIENT_ID, P6_CLIENT_SECRET');
    }
    
    try {
      // P6 Cloud OAuth
      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      
      const response = await this.client.post(
        `${this.baseUrl}/oauth/token`,
        'grant_type=client_credentials',
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      
      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (50 * 60 * 1000);
      
      return this.accessToken;
    } catch (error) {
      console.error('[P6Adapter] Authentication failed:', error.message);
      throw new Error(`P6 authentication failed: ${error.message}`);
    }
  }
  
  /**
   * Get authenticated headers
   */
  async getHeaders() {
    const token = await this.authenticate();
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'DatabaseId': this.databaseId.toString()
    };
  }
  
  /**
   * Get project by ID or code
   * 
   * @param {string} projectCode - P6 project code
   */
  async getProject(projectCode) {
    console.log(`[P6Adapter] Getting project ${projectCode}`);
    
    if (!this.isConfigured()) {
      return this.mockProjectResponse(projectCode);
    }
    
    try {
      const headers = await this.getHeaders();
      
      const response = await this.client.get(
        `${this.baseUrl}/restapi/project`,
        {
          headers,
          params: {
            Fields: 'ObjectId,Id,Name,Status,StartDate,FinishDate,PercentComplete',
            Filter: `Id = '${projectCode}'`
          }
        }
      );
      
      if (!response.data || response.data.length === 0) {
        throw new Error(`Project ${projectCode} not found`);
      }
      
      return response.data[0];
      
    } catch (error) {
      console.error('[P6Adapter] Get project failed:', error.message);
      throw error;
    }
  }
  
  /**
   * Get activities for a project
   * 
   * @param {string} projectCode - P6 project code
   * @param {Object} filter - Optional filter criteria
   */
  async getActivities(projectCode, filter = {}) {
    console.log(`[P6Adapter] Getting activities for project ${projectCode}`);
    
    if (!this.isConfigured()) {
      return this.mockActivitiesResponse(projectCode);
    }
    
    try {
      const headers = await this.getHeaders();
      const project = await this.getProject(projectCode);
      
      let filterStr = `ProjectObjectId = ${project.ObjectId}`;
      if (filter.activityCode) {
        filterStr += ` AND Id = '${filter.activityCode}'`;
      }
      if (filter.wbsCode) {
        filterStr += ` AND WBSCode = '${filter.wbsCode}'`;
      }
      
      const response = await this.client.get(
        `${this.baseUrl}/restapi/activity`,
        {
          headers,
          params: {
            Fields: 'ObjectId,Id,Name,Status,PlannedStartDate,PlannedFinishDate,ActualStartDate,ActualFinishDate,PercentComplete,RemainingDuration,WBSObjectId,WBSCode',
            Filter: filterStr
          }
        }
      );
      
      return response.data || [];
      
    } catch (error) {
      console.error('[P6Adapter] Get activities failed:', error.message);
      throw error;
    }
  }
  
  /**
   * Update activity progress
   * 
   * @param {Object} options
   * @param {string} options.projectCode - P6 project code
   * @param {string} options.activityCode - P6 activity code
   * @param {number} options.percentComplete - Progress percentage (0-100)
   * @param {string} options.actualStartDate - Actual start date (ISO)
   * @param {string} options.actualFinishDate - Actual finish date (ISO)
   * @param {Object} options.customFields - Additional custom fields
   */
  async updateActivityProgress(options) {
    const { projectCode, activityCode, percentComplete, actualStartDate, actualFinishDate, customFields = {} } = options;
    
    console.log(`[P6Adapter] Updating activity ${activityCode} in project ${projectCode}`);
    
    if (!this.isConfigured()) {
      return this.mockProgressResponse(options);
    }
    
    try {
      const headers = await this.getHeaders();
      
      // Get activity
      const activities = await this.getActivities(projectCode, { activityCode });
      if (activities.length === 0) {
        throw new Error(`Activity ${activityCode} not found in project ${projectCode}`);
      }
      const activity = activities[0];
      
      // Build update payload
      const updatePayload = {
        ObjectId: activity.ObjectId
      };
      
      if (percentComplete !== undefined) {
        updatePayload.PercentComplete = percentComplete;
        
        // Auto-set status based on progress
        if (percentComplete === 0) {
          updatePayload.Status = 'Not Started';
        } else if (percentComplete === 100) {
          updatePayload.Status = 'Completed';
        } else {
          updatePayload.Status = 'In Progress';
        }
      }
      
      if (actualStartDate) {
        updatePayload.ActualStartDate = actualStartDate;
      }
      
      if (actualFinishDate) {
        updatePayload.ActualFinishDate = actualFinishDate;
        updatePayload.RemainingDuration = 0;
      }
      
      // Custom UDF fields
      if (customFields.foremanName) {
        updatePayload.UDF_Foreman = customFields.foremanName;
      }
      if (customFields.crewSize) {
        updatePayload.UDF_CrewSize = customFields.crewSize;
      }
      if (customFields.notes) {
        updatePayload.UDF_Notes = customFields.notes;
      }
      
      const response = await this.client.put(
        `${this.baseUrl}/restapi/activity`,
        [updatePayload],
        { headers }
      );
      
      return {
        success: true,
        activityId: activity.ObjectId,
        activityCode,
        newStatus: updatePayload.Status,
        percentComplete: updatePayload.PercentComplete,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('[P6Adapter] Update activity failed:', error.message);
      throw new Error(`Activity update failed: ${error.message}`);
    }
  }
  
  /**
   * Complete an activity
   */
  async completeActivity(projectCode, activityCode, completionDate) {
    return this.updateActivityProgress({
      projectCode,
      activityCode,
      percentComplete: 100,
      actualFinishDate: completionDate || new Date().toISOString()
    });
  }
  
  /**
   * Add document to project
   * 
   * @param {Object} options
   * @param {string} options.projectCode - P6 project code
   * @param {string} options.fileName - Document file name
   * @param {string} options.category - Document category
   * @param {Buffer|string} options.fileContent - File content
   */
  async addProjectDocument(options) {
    const { projectCode, fileName, category = 'As-Built', fileContent } = options;
    
    console.log(`[P6Adapter] Adding document ${fileName} to project ${projectCode}`);
    
    if (!this.isConfigured()) {
      return {
        success: true,
        mock: true,
        documentId: `MOCK-DOC-${Date.now()}`,
        message: 'Document upload simulated'
      };
    }
    
    try {
      const headers = await this.getHeaders();
      const project = await this.getProject(projectCode);
      
      const fileBase64 = Buffer.isBuffer(fileContent)
        ? fileContent.toString('base64')
        : fileContent;
      
      const response = await this.client.post(
        `${this.baseUrl}/restapi/projectdocument`,
        {
          ProjectObjectId: project.ObjectId,
          Title: fileName,
          DocumentCategory: category,
          AttachmentType: 'FILE',
          FileName: fileName,
          FileData: fileBase64
        },
        { headers }
      );
      
      return {
        success: true,
        documentId: response.data.ObjectId,
        fileName,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('[P6Adapter] Document upload failed:', error.message);
      throw error;
    }
  }
  
  /**
   * Create or update resource assignment
   */
  async updateResourceAssignment(options) {
    const { projectCode, activityCode, resourceCode, actualUnits, actualHours } = options;
    
    console.log(`[P6Adapter] Updating resource ${resourceCode} on activity ${activityCode}`);
    
    if (!this.isConfigured()) {
      return {
        success: true,
        mock: true,
        message: 'Resource assignment simulated'
      };
    }
    
    try {
      const headers = await this.getHeaders();
      
      // Get activity
      const activities = await this.getActivities(projectCode, { activityCode });
      if (activities.length === 0) {
        throw new Error(`Activity ${activityCode} not found`);
      }
      
      // Get resource assignment
      const assignmentResponse = await this.client.get(
        `${this.baseUrl}/restapi/resourceassignment`,
        {
          headers,
          params: {
            Fields: 'ObjectId,ActivityObjectId,ResourceObjectId,ActualUnits,ActualRegularUnits',
            Filter: `ActivityObjectId = ${activities[0].ObjectId}`
          }
        }
      );
      
      if (assignmentResponse.data && assignmentResponse.data.length > 0) {
        // Update existing assignment
        await this.client.put(
          `${this.baseUrl}/restapi/resourceassignment`,
          [{
            ObjectId: assignmentResponse.data[0].ObjectId,
            ActualUnits: actualUnits,
            ActualRegularUnits: actualHours
          }],
          { headers }
        );
      }
      
      return {
        success: true,
        activityCode,
        resourceCode,
        actualUnits,
        actualHours,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('[P6Adapter] Resource assignment failed:', error.message);
      throw error;
    }
  }
  
  /**
   * Generate XER export for project
   * (For P6 Professional import)
   */
  async exportProjectXER(projectCode) {
    console.log(`[P6Adapter] Exporting XER for project ${projectCode}`);
    
    if (!this.isConfigured()) {
      return {
        success: true,
        mock: true,
        message: 'XER export not available in demo mode',
        xerContent: null
      };
    }
    
    try {
      const headers = await this.getHeaders();
      const project = await this.getProject(projectCode);
      
      const response = await this.client.post(
        `${this.baseUrl}/restapi/project/export`,
        {
          ProjectObjectIds: [project.ObjectId],
          ExportFormat: 'XER'
        },
        {
          headers,
          responseType: 'arraybuffer'
        }
      );
      
      return {
        success: true,
        projectCode,
        xerContent: response.data,
        fileName: `${projectCode}_export.xer`,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('[P6Adapter] XER export failed:', error.message);
      throw error;
    }
  }
  
  /**
   * Mock responses for unconfigured environments
   */
  mockProjectResponse(projectCode) {
    return {
      ObjectId: 12345,
      Id: projectCode,
      Name: `Project ${projectCode}`,
      Status: 'Active',
      StartDate: '2026-01-01',
      FinishDate: '2026-12-31',
      PercentComplete: 45.5,
      mock: true
    };
  }
  
  mockActivitiesResponse(projectCode) {
    return [
      {
        ObjectId: 1001,
        Id: `${projectCode}-A100`,
        Name: 'Construction Phase',
        Status: 'In Progress',
        PercentComplete: 50,
        mock: true
      },
      {
        ObjectId: 1002,
        Id: `${projectCode}-A200`,
        Name: 'As-Built Completion',
        Status: 'Not Started',
        PercentComplete: 0,
        mock: true
      }
    ];
  }
  
  mockProgressResponse(options) {
    return {
      success: true,
      mock: true,
      activityCode: options.activityCode,
      newStatus: options.percentComplete === 100 ? 'Completed' : 'In Progress',
      percentComplete: options.percentComplete,
      message: 'Activity update simulated. Configure P6_* env vars for production.',
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Process as-built completion for P6 updates
   * High-level method for full workflow
   */
  async processAsBuiltCompletion(submission) {
    console.log(`[P6Adapter] Processing as-built for P6: ${submission.pmNumber}`);
    
    const results = {
      pmNumber: submission.pmNumber,
      activityUpdates: [],
      documents: [],
      errors: []
    };
    
    try {
      const projectCode = submission.projectCode || submission.pmNumber;
      
      // 1. Update construction activity to complete
      try {
        const constructionResult = await this.updateActivityProgress({
          projectCode,
          activityCode: `${projectCode}-CONST`,
          percentComplete: 100,
          actualFinishDate: submission.completedAt,
          customFields: {
            foremanName: submission.submittedBy,
            notes: `Completed via FieldLedger submission ${submission.submissionId}`
          }
        });
        results.activityUpdates.push(constructionResult);
      } catch (err) {
        // Try alternative activity code
        try {
          const altResult = await this.updateActivityProgress({
            projectCode,
            activityCode: `${projectCode}-A100`,
            percentComplete: 100,
            actualFinishDate: submission.completedAt
          });
          results.activityUpdates.push(altResult);
        } catch (altErr) {
          results.errors.push({ type: 'activity', error: err.message });
        }
      }
      
      // 2. Update as-built activity
      try {
        const asbuiltResult = await this.updateActivityProgress({
          projectCode,
          activityCode: `${projectCode}-ASBLT`,
          percentComplete: 100,
          actualFinishDate: new Date().toISOString()
        });
        results.activityUpdates.push(asbuiltResult);
      } catch (err) {
        // Non-critical if this activity doesn't exist
        console.log(`[P6Adapter] As-built activity not found (may not exist)`);
      }
      
      // 3. Upload as-built documents
      for (const section of (submission.sections || [])) {
        if (['construction_sketch', 'face_sheet', 'ccsc'].includes(section.sectionType)) {
          try {
            const docResult = await this.addProjectDocument({
              projectCode,
              fileName: `${submission.pmNumber}_${section.sectionType}.pdf`,
              category: 'As-Built',
              fileContent: section.fileContent
            });
            results.documents.push(docResult);
          } catch (err) {
            results.errors.push({ type: 'document', sectionType: section.sectionType, error: err.message });
          }
        }
      }
      
      results.success = results.errors.length === 0;
      results.timestamp = new Date().toISOString();
      
      return results;
      
    } catch (error) {
      console.error('[P6Adapter] Processing failed:', error.message);
      results.success = false;
      results.errors.push({ type: 'general', error: error.message });
      return results;
    }
  }
}

module.exports = P6Adapter;

