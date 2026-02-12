/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
const crypto = require('crypto');
const AsBuiltSubmission = require('../../models/AsBuiltSubmission');
const RoutingRule = require('../../models/RoutingRule');

/**
 * As-Built Router Service
 * Orchestrates the entire as-built package processing pipeline:
 * 1. Receive uploaded PDF
 * 2. Split into sections
 * 3. Classify each section
 * 4. Route to appropriate destinations
 * 5. Track delivery status
 */
class AsBuiltRouter {
  constructor() {
    // PG&E default page ranges (from memory)
    this.PGE_PAGE_RANGES = {
      face_sheet: { start: 1, end: 3 },
      crew_instructions: { start: 4, end: 6 },
      crew_materials: { start: 7, end: 7 },
      equipment_info: { start: 8, end: 9 },
      feedback_form: { start: 10, end: 10 },
      construction_sketch: { start: 11, end: 14 },
      circuit_map: { start: 15, end: 15 },
      permits: { start: 16, end: 21 },
      tcp: { start: 22, end: 23 },
      job_checklist: { start: 24, end: 24 },
      billing_form: { start: 27, end: 27 },
      paving_form: { start: 28, end: 29 },
      ccsc: { start: 32, end: 33 }
    };
    
    // Destination adapters (will be lazy-loaded)
    this.adapters = {};
  }
  
  /**
   * Process a new as-built submission
   */
  async processSubmission(submissionId) {
    const submission = await AsBuiltSubmission.findById(submissionId);
    if (!submission) {
      throw new Error(`Submission not found: ${submissionId}`);
    }
    
    try {
      submission.status = 'processing';
      submission.processingStartedAt = new Date();
      submission.addAuditEntry('processing_started', 'Started processing as-built package');
      await submission.save();
      
      // Step 1: Split PDF into sections
      await this.splitPdfIntoSections(submission);
      
      // Step 2: Classify each section
      await this.classifySections(submission);
      
      submission.status = 'classified';
      await submission.save();
      
      // Step 3: Determine routing for each section
      await this.determineRouting(submission);
      
      submission.status = 'routing';
      await submission.save();
      
      // Step 4: Deliver to destinations
      await this.deliverSections(submission);
      
      // Finalize
      submission.processingCompletedAt = new Date();
      submission.processingDuration = 
        submission.processingCompletedAt - submission.processingStartedAt;
      submission.updateRoutingSummary();
      submission.addAuditEntry('completed', 
        `Processing complete. ${submission.routingSummary.deliveredSections}/${submission.routingSummary.totalSections} delivered`);
      await submission.save();
      
      return submission;
      
    } catch (error) {
      submission.status = 'failed';
      submission.processingError = error.message;
      submission.addAuditEntry('failed', error.message);
      await submission.save();
      throw error;
    }
  }
  
  /**
   * Split PDF into sections based on page ranges
   */
  async splitPdfIntoSections(submission) {
    const pageCount = submission.originalFile.pageCount || 40;
    const sections = [];
    
    // Use PG&E page ranges as default (can be customized per utility)
    for (const [sectionType, range] of Object.entries(this.PGE_PAGE_RANGES)) {
      // Skip if section is beyond document page count
      if (range.start > pageCount) continue;
      
      const effectiveEnd = Math.min(range.end, pageCount);
      
      sections.push({
        sectionType,
        pageStart: range.start,
        pageEnd: effectiveEnd,
        pageCount: effectiveEnd - range.start + 1,
        classificationMethod: 'page_range',
        classificationConfidence: 0.9,
        deliveryStatus: 'pending',
        extractedAt: new Date()
      });
      
      submission.addAuditEntry('section_extracted', 
        `Extracted ${sectionType} (pages ${range.start}-${effectiveEnd})`);
    }
    
    submission.sections = sections;
    await submission.save();
    
    // In production, we would actually split the PDF here using pdf-lib
    // For now, we're just defining the sections
    await this.extractPdfSections(submission);
  }
  
  /**
   * Actually extract PDF sections (placeholder for pdf-lib implementation)
   * 
   * WARNING: This is currently a placeholder implementation.
   * Real PDF splitting is not yet implemented.
   */
  async extractPdfSections(submission) {
    // Log warning that real PDF splitting is not yet implemented
    console.warn('[AsBuiltRouter] PDF splitting is using PLACEHOLDER mode - actual extraction not yet implemented');
    submission.addAuditEntry('warning', 'PDF section extraction using placeholder mode - actual file splitting not performed');
    
    // TODO: In production, this should:
    // 1. Load the original PDF from R2/S3
    // 2. Use pdf-lib to split into separate PDFs
    // 3. Upload each section to R2/S3
    // 4. Update section.fileKey and section.fileHash
    
    for (let i = 0; i < submission.sections.length; i++) {
      const section = submission.sections[i];
      
      // Generate placeholder file key (not actual split file)
      section.fileKey = `asbuilt/${submission.submissionId}/${section.sectionType}.pdf`;
      section.placeholder = true; // Mark as placeholder
      
      // Generate hash (in production, hash actual file content)
      section.fileHash = crypto
        .createHash('sha256')
        .update(`${submission.submissionId}-${section.sectionType}-${Date.now()}`)
        .digest('hex');
    }
    
    await submission.save();
  }
  
  /**
   * Classify sections (enhance with AI if available)
   */
  async classifySections(submission) {
    for (let i = 0; i < submission.sections.length; i++) {
      const section = submission.sections[i];
      
      // Extract metadata from section (would use OCR in production)
      section.extractedData = await this.extractMetadataFromSection(submission, section);
      section.classifiedAt = new Date();
      
      submission.addAuditEntry('section_classified', 
        `Classified ${section.sectionType}`, null, i);
    }
    
    await submission.save();
  }
  
  /**
   * Extract metadata from a section (OCR placeholder)
   */
  async extractMetadataFromSection(submission, _section) {
    // In production, this would use OCR + AI to extract:
    // - PM numbers, job numbers
    // - Pole IDs, equipment numbers
    // - GPS coordinates from sketches
    // - Dates, crew info
    
    return {
      pmNumber: submission.pmNumber,
      jobNumber: submission.jobNumber,
      workOrderNumber: submission.workOrderNumber,
      circuitId: submission.circuitId,
      // These would be extracted via OCR
      poleIds: [],
      transformerIds: [],
      gpsCoordinates: []
    };
  }
  
  /**
   * Determine routing for each section based on rules
   */
  async determineRouting(submission) {
    for (let i = 0; i < submission.sections.length; i++) {
      const section = submission.sections[i];
      
      // Get applicable routing rules
      const rules = await RoutingRule.getApplicableRules(
        submission.utilityId,
        submission.companyId,
        section.sectionType
      );
      
      // Find first matching rule
      let matchedRule = null;
      for (const rule of rules) {
        if (rule.evaluateConditions({
          pmNumber: submission.pmNumber,
          jobType: submission.jobType,
          workCategory: submission.workCategory,
          workDate: submission.workDate
        })) {
          matchedRule = rule;
          break;
        }
      }
      
      // Apply routing
      if (matchedRule) {
        section.destination = this.mapRuleToDestination(matchedRule);
        section.routedAt = new Date();
        submission.addAuditEntry('section_routed', 
          `Routed to ${section.destination} via rule: ${matchedRule.name}`, null, i);
      } else {
        // Use default routing based on section type
        section.destination = this.getDefaultDestination(section.sectionType);
        section.routedAt = new Date();
        submission.addAuditEntry('section_routed', 
          `Routed to ${section.destination} (default)`, null, i);
      }
    }
    
    await submission.save();
  }
  
  /**
   * Map routing rule to destination enum
   */
  mapRuleToDestination(rule) {
    const typeMap = {
      'oracle_api': {
        'ppm': 'oracle_ppm',
        'eam': 'oracle_eam',
        'payables': 'oracle_payables'
      },
      'sharepoint': 'sharepoint_do',
      'email': 'email_mapping',
      'gis_api': 'gis_esri'
    };
    
    const destType = rule.destination?.type;
    if (destType === 'oracle_api') {
      return typeMap.oracle_api[rule.destination.oracle?.module] || 'oracle_ppm';
    }
    
    return typeMap[destType] || 'archive';
  }
  
  /**
   * Default destinations based on section type
   * 
   * NOTE: Crew instructions are routed to estimating/design department
   * IF they contain redlines/bluelines (field markups showing changes from design).
   * This allows the utility to update their design records.
   */
  getDefaultDestination(sectionType) {
    const defaults = {
      face_sheet: 'oracle_ppm',
      // Crew instructions with redlines/bluelines need to go to estimating/design
      // to update their records - not just archived!
      crew_instructions: 'email_estimating',
      crew_materials: 'archive',
      equipment_info: 'oracle_eam',
      feedback_form: 'email_estimating',  // Feedback also goes to estimating
      construction_sketch: 'gis_esri',
      circuit_map: 'email_do',
      permits: 'sharepoint_permits',
      tcp: 'sharepoint_utcs',
      job_checklist: 'archive',
      billing_form: 'oracle_payables',
      paving_form: 'archive',
      ccsc: 'regulatory_portal',
      photos: 'oracle_eam',
      other: 'manual_review'
    };
    
    return defaults[sectionType] || 'archive';
  }
  
  /**
   * Deliver sections to their destinations
   */
  async deliverSections(submission) {
    for (let i = 0; i < submission.sections.length; i++) {
      const section = submission.sections[i];
      
      if (section.destination === 'archive' || section.destination === 'manual_review') {
        section.deliveryStatus = 'skipped';
        continue;
      }
      
      try {
        section.deliveryStatus = 'sending';
        await submission.save();
        
        // Get adapter for destination
        const adapter = await this.getAdapter(section.destination);
        
        // Deliver
        const result = await adapter.deliver(submission, section, i);
        
        section.deliveryStatus = 'delivered';
        section.deliveredAt = new Date();
        section.externalReferenceId = result.referenceId;
        section.deliveryAttempts++;
        
        submission.addAuditEntry('section_delivered', 
          `Delivered to ${section.destination}. Ref: ${result.referenceId}`, null, i);
        
      } catch (error) {
        section.deliveryStatus = 'failed';
        section.deliveryError = error.message;
        section.deliveryAttempts++;
        
        submission.addAuditEntry('section_failed', 
          `Failed: ${error.message}`, null, i);
      }
      
      await submission.save();
    }
  }
  
  /**
   * Get adapter for a destination
   */
  async getAdapter(destination) {
    if (!this.adapters[destination]) {
      // Lazy load adapters
      switch (destination) {
        case 'oracle_ppm':
        case 'oracle_eam':
        case 'oracle_payables': {
          const OracleAdapter = require('./adapters/OracleAdapter');
          this.adapters[destination] = new OracleAdapter(destination);
          break;
        }
        case 'gis_esri': {
          const GISAdapter = require('./adapters/GISAdapter');
          this.adapters[destination] = new GISAdapter();
          break;
        }
        case 'email_mapping':
        case 'email_do':
        case 'email_permits':
        case 'email_compliance':
        case 'email_estimating': {
          const EmailAdapter = require('./adapters/EmailAdapter');
          this.adapters[destination] = new EmailAdapter(destination);
          break;
        }
        case 'sharepoint_do':
        case 'sharepoint_permits':
        case 'sharepoint_utcs': {
          const SharePointAdapter = require('./adapters/SharePointAdapter');
          this.adapters[destination] = new SharePointAdapter(destination);
          break;
        }
        case 'regulatory_portal': {
          const RegulatoryAdapter = require('./adapters/RegulatoryAdapter');
          this.adapters[destination] = new RegulatoryAdapter();
          break;
        }
        default: {
          // Fallback to archive adapter
          const ArchiveAdapter = require('./adapters/ArchiveAdapter');
          this.adapters[destination] = new ArchiveAdapter();
        }
      }
    }
    
    return this.adapters[destination];
  }
  
  /**
   * Retry failed sections
   */
  async retryFailedSections(submissionId) {
    const submission = await AsBuiltSubmission.findById(submissionId);
    if (!submission) {
      throw new Error(`Submission not found: ${submissionId}`);
    }
    
    // getFailedSections() validates there are sections to retry
    submission.getFailedSections();
    
    for (let i = 0; i < submission.sections.length; i++) {
      const section = submission.sections[i];
      if (section.deliveryStatus !== 'failed') continue;
      
      try {
        section.deliveryStatus = 'sending';
        await submission.save();
        
        const adapter = await this.getAdapter(section.destination);
        const result = await adapter.deliver(submission, section, i);
        
        section.deliveryStatus = 'delivered';
        section.deliveredAt = new Date();
        section.externalReferenceId = result.referenceId;
        section.deliveryAttempts++;
        section.deliveryError = null;
        
        submission.addAuditEntry('section_delivered', 
          `Retry successful. Ref: ${result.referenceId}`, null, i);
        
      } catch (error) {
        section.deliveryStatus = 'failed';
        section.deliveryError = error.message;
        section.deliveryAttempts++;
        
        submission.addAuditEntry('section_failed', 
          `Retry failed: ${error.message}`, null, i);
      }
    }
    
    submission.updateRoutingSummary();
    await submission.save();
    
    return submission;
  }
  
  /**
   * Get submission status with section details
   */
  async getSubmissionStatus(submissionId) {
    const submission = await AsBuiltSubmission.findById(submissionId)
      .populate('companyId', 'name')
      .populate('jobId', 'pmNumber title')
      .populate('submittedBy', 'name email');
    
    if (!submission) {
      return null;
    }
    
    return {
      submissionId: submission.submissionId,
      status: submission.status,
      pmNumber: submission.pmNumber,
      submittedAt: submission.submittedAt,
      submittedBy: submission.submittedBy?.name,
      processingDuration: submission.processingDuration,
      summary: submission.routingSummary,
      sections: submission.sections.map(s => ({
        type: s.sectionType,
        pages: `${s.pageStart}-${s.pageEnd}`,
        destination: s.destination,
        status: s.deliveryStatus,
        deliveredAt: s.deliveredAt,
        externalRef: s.externalReferenceId,
        error: s.deliveryError
      })),
      utilityAcknowledged: submission.utilityAcknowledged,
      auditLog: submission.auditLog.slice(-10)  // Last 10 entries
    };
  }
}

module.exports = new AsBuiltRouter();

