/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
const crypto = require('crypto');
const { PDFDocument } = require('pdf-lib');
const AsBuiltSubmission = require('../../models/AsBuiltSubmission');
const UtilityAsBuiltConfig = require('../../models/UtilityAsBuiltConfig');
const RoutingRule = require('../../models/RoutingRule');
const r2Storage = require('../../utils/storage');
const log = require('../../utils/logger');

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
    // Destination adapters (will be lazy-loaded)
    this.adapters = {};
    // Config cache: utilityId → { config, loadedAt }
    this._configCache = new Map();
    this._configCacheTTL = 10 * 60 * 1000; // 10 minutes
  }

  /**
   * Load page ranges for a utility from UtilityAsBuiltConfig.
   * Returns an array of { sectionType, start, end } objects.
   * The splitting logic is utility-agnostic — it takes any config that
   * matches this shape. PG&E (TD-2051P-10) is the first config;
   * SCE, SDG&E, etc. plug in as new config documents with zero code changes.
   *
   * @param {string} utilityId - Utility ObjectId from submission
   * @returns {Promise<Array<{sectionType: string, label: string, start: number, end: number}>>}
   */
  async getPageRanges(utilityId) {
    // Check cache first
    const cached = this._configCache.get(utilityId?.toString());
    if (cached && Date.now() - cached.loadedAt < this._configCacheTTL) {
      return cached.pageRanges;
    }

    let pageRanges = [];

    if (utilityId) {
      const config = await UtilityAsBuiltConfig.findOne({ utilityId, isActive: true })
        .select('pageRanges')
        .lean();

      if (config?.pageRanges?.length) {
        pageRanges = config.pageRanges;
        log.info({ utilityId, rangeCount: pageRanges.length }, '[AsBuiltRouter] Loaded utility config');
      }
    }

    // Fallback: if no config found, log a warning — do NOT hardcode PG&E ranges.
    // The operator must seed a config via the admin panel or seed script.
    if (pageRanges.length === 0) {
      log.warn({ utilityId }, '[AsBuiltRouter] No UtilityAsBuiltConfig found — cannot split PDF');
    }

    // Cache
    this._configCache.set(utilityId?.toString(), { pageRanges, loadedAt: Date.now() });

    return pageRanges;
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
   * Split PDF into sections based on utility-specific page ranges.
   * The page range config is loaded from UtilityAsBuiltConfig — no
   * hardcoded utility logic lives in the router.
   */
  async splitPdfIntoSections(submission) {
    const pageCount = submission.originalFile?.pageCount || 40;

    // Load config-driven page ranges for this utility
    const pageRanges = await this.getPageRanges(submission.utilityId);
    if (pageRanges.length === 0) {
      throw new Error(
        'No as-built page range config found for this utility. ' +
        'Seed a UtilityAsBuiltConfig before processing submissions.'
      );
    }

    const sections = [];

    for (const range of pageRanges) {
      if (range.start > pageCount) continue;

      const effectiveEnd = Math.min(range.end, pageCount);

      sections.push({
        sectionType: range.sectionType,
        pageStart: range.start,
        pageEnd: effectiveEnd,
        pageCount: effectiveEnd - range.start + 1,
        classificationMethod: 'page_range',
        classificationConfidence: 0.9,
        deliveryStatus: 'pending',
        extractedAt: new Date()
      });

      submission.addAuditEntry('section_extracted',
        `Defined ${range.sectionType} (pages ${range.start}-${effectiveEnd})`);
    }

    submission.sections = sections;
    await submission.save();

    // Perform the actual PDF splitting + hashing + R2 upload
    await this.extractPdfSections(submission);
  }
  
  /**
   * Extract PDF sections using pdf-lib.
   *
   * Ghost Ship Audit Fix #4 — replaces the placeholder implementation.
   *
   * Flow:
   *   1. Download the source PDF from R2 into a Uint8Array
   *   2. Load it once with pdf-lib
   *   3. For each section, copy the specified pages into a new PDFDocument
   *   4. Serialize → SHA-256 hash → upload to R2
   *   5. Update section.fileKey, section.fileHash, section.fileSize
   *
   * Memory: Each split document is serialized and discarded before the next
   * section is processed. The source document stays in memory for the
   * duration but is released when the method returns.
   *
   * Page indexing: Config uses 1-based page numbers. pdf-lib uses 0-based.
   * We subtract 1 when calling copyPages.
   *
   * @param {import('../../models/AsBuiltSubmission')} submission
   */
  async extractPdfSections(submission) {
    const sourceKey = submission.originalFile?.key;
    if (!sourceKey) {
      throw new Error('No source PDF key on submission — cannot split');
    }

    // ---- Step 1: Stream source PDF to temp file (no Buffer.concat) ----
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const { pipeline } = require('stream/promises');

    const tempDir = path.join(os.tmpdir(), 'fieldledger-asbuilt');
    fs.mkdirSync(tempDir, { recursive: true });
    const tempPath = path.join(tempDir, `${submission.submissionId}_source.pdf`);

    if (r2Storage.isR2Configured()) {
      const fileData = await r2Storage.getFileStream(sourceKey);
      if (!fileData?.stream) {
        throw new Error(`Source PDF not found in R2: ${sourceKey}`);
      }
      await pipeline(fileData.stream, fs.createWriteStream(tempPath));
    } else {
      const localPath = path.join(__dirname, '../../uploads', sourceKey);
      if (!fs.existsSync(localPath)) {
        throw new Error(`Source PDF not found locally: ${localPath}`);
      }
      fs.copyFileSync(localPath, tempPath);
    }

    const fileStat = fs.statSync(tempPath);
    log.info({
      submissionId: submission.submissionId,
      sourceKey,
      sourceSizeBytes: fileStat.size
    }, '[AsBuiltRouter] Source PDF downloaded to temp file');

    // ---- Step 2: Load source into pdf-lib (async, non-blocking) ----
    // fs.promises.readFile is async — does not block the event loop during I/O.
    // The resulting Buffer is wrapped in Uint8Array and nulled after pdf-lib parses it.
    let sourcePdf;
    try {
      let sourceBytes = new Uint8Array(await fs.promises.readFile(tempPath));
      sourcePdf = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
      sourceBytes = null; // Release raw bytes — pdf-lib has its own internal copy
    } catch (parseErr) {
      try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
      throw new Error(`Failed to parse source PDF: ${parseErr.message}`);
    }
    const totalPages = sourcePdf.getPageCount();

    log.info({
      submissionId: submission.submissionId,
      totalPages
    }, '[AsBuiltRouter] Source PDF parsed');

    // ---- Step 3: Split each section ----
    let sectionsProcessed = 0;
    let sectionsFailed = 0;

    for (let i = 0; i < submission.sections.length; i++) {
      const section = submission.sections[i];

      try {
        // Config uses 1-based pages; pdf-lib uses 0-based indices
        const startIdx = section.pageStart - 1;
        const endIdx = Math.min(section.pageEnd, totalPages) - 1;

        // Skip if start page is beyond document
        if (startIdx >= totalPages) {
          section.fileKey = null;
          section.fileHash = null;
          section.deliveryStatus = 'skipped';
          submission.addAuditEntry('section_skipped',
            `${section.sectionType}: pages ${section.pageStart}-${section.pageEnd} beyond document (${totalPages} pages)`,
            null, i);
          continue;
        }

        // Build array of page indices to copy
        const pageIndices = [];
        for (let p = startIdx; p <= endIdx; p++) {
          pageIndices.push(p);
        }

        // ---- Create new PDF with only these pages ----
        const splitPdf = await PDFDocument.create();
        const copiedPages = await splitPdf.copyPages(sourcePdf, pageIndices);
        for (const page of copiedPages) {
          splitPdf.addPage(page);
        }

        // ---- Serialize ----
        const splitBytes = await splitPdf.save();
        const splitBuffer = Buffer.from(splitBytes);

        // ---- SHA-256 hash for NERC CIP compliance ----
        const hash = crypto
          .createHash('sha256')
          .update(splitBuffer)
          .digest('hex');

        // ---- Upload to R2 ----
        const r2Key = `asbuilt/${submission.submissionId}/${section.sectionType}.pdf`;

        if (r2Storage.isR2Configured()) {
          await r2Storage.uploadBuffer(splitBuffer, r2Key, 'application/pdf');
        } else {
          // Local dev fallback: write to disk
          const fs = require('fs');
          const path = require('path');
          const localDir = path.join(__dirname, '../../uploads/asbuilt', submission.submissionId);
          fs.mkdirSync(localDir, { recursive: true });
          fs.writeFileSync(path.join(localDir, `${section.sectionType}.pdf`), splitBuffer);
        }

        // ---- Update section metadata ----
        section.fileKey = r2Key;
        section.fileHash = hash;
        section.fileSize = splitBuffer.length;
        section.placeholder = false;
        sectionsProcessed++;

        submission.addAuditEntry('section_extracted',
          `Split ${section.sectionType}: pages ${section.pageStart}-${Math.min(section.pageEnd, totalPages)}, ` +
          `${splitBuffer.length} bytes, SHA-256: ${hash.substring(0, 16)}...`,
          null, i);

        log.info({
          submissionId: submission.submissionId,
          section: section.sectionType,
          pages: `${section.pageStart}-${Math.min(section.pageEnd, totalPages)}`,
          sizeBytes: splitBuffer.length,
          hash: hash.substring(0, 16)
        }, '[AsBuiltRouter] Section split complete');

      } catch (sectionErr) {
        sectionsFailed++;
        section.fileKey = null;
        section.fileHash = null;
        section.deliveryStatus = 'failed';
        section.deliveryError = sectionErr.message;

        log.error({
          err: sectionErr,
          submissionId: submission.submissionId,
          section: section.sectionType
        }, '[AsBuiltRouter] Section split failed');

        submission.addAuditEntry('section_failed',
          `Failed to split ${section.sectionType}: ${sectionErr.message}`,
          null, i);
      }
    }

    await submission.save();

    log.info({
      submissionId: submission.submissionId,
      processed: sectionsProcessed,
      failed: sectionsFailed,
      total: submission.sections.length
    }, '[AsBuiltRouter] PDF splitting complete');

    // Clean up temp source file
    try { fs.unlinkSync(tempPath); } catch { /* ignore */ }

    if (sectionsFailed > 0 && sectionsProcessed === 0) {
      throw new Error(`All ${sectionsFailed} sections failed to split`);
    }
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
        
        // Deliver — adapters return { success, details } or legacy { referenceId }
        const result = await adapter.deliver(submission, section, i);
        const refId = result.referenceId || result.details?.referenceId;
        
        // Adapters may signal failure via result.success === false instead of throwing
        if (result.success === false) {
          throw new Error(result.details?.error || 'Adapter delivery failed');
        }
        
        section.deliveryStatus = 'delivered';
        section.deliveredAt = new Date();
        section.externalReferenceId = refId;
        section.deliveryAttempts++;
        
        submission.addAuditEntry('section_delivered', 
          `Delivered to ${section.destination}. Ref: ${refId}`, null, i);
        
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
        const refId = result.referenceId || result.details?.referenceId;
        
        if (result.success === false) {
          throw new Error(result.details?.error || 'Adapter delivery failed');
        }
        
        section.deliveryStatus = 'delivered';
        section.deliveredAt = new Date();
        section.externalReferenceId = refId;
        section.deliveryAttempts++;
        section.deliveryError = null;
        
        submission.addAuditEntry('section_delivered', 
          `Retry successful. Ref: ${refId}`, null, i);
        
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

