/**
 * FieldLedger - Archive Adapter
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 *
 * Stores documents in long-term cold storage (Cloudflare R2 or AWS S3)
 * with retention metadata and lifecycle policies.
 *
 * Used for documents that don't need active routing but must be retained
 * per regulatory and business requirements.
 *
 * Retention classes:
 *   COMPLIANCE   — 10 years (CCSC, regulatory)
 *   ASSET        — 50 years (construction sketches, equipment records)
 *   REGULATORY   — 10 years (permits)
 *   FINANCIAL    — 7 years  (billing forms)
 *   EVIDENCE     — 10 years (photos)
 *   OPERATIONAL  — 7 years  (default)
 */

class ArchiveAdapter {
  constructor() {
    this.archiveBucket = process.env.R2_ARCHIVE_BUCKET || 'fieldledger-archive';
    this.archiveRegion = process.env.R2_ARCHIVE_REGION || 'auto';
    this.archiveEndpoint = process.env.R2_ARCHIVE_ENDPOINT || '';
    this.archiveAccessKeyId = process.env.R2_ARCHIVE_ACCESS_KEY_ID || '';
    this.archiveSecretAccessKey = process.env.R2_ARCHIVE_SECRET_ACCESS_KEY || '';
  }

  // -------------------------------------------------------------------
  // Public API (required adapter interface)
  // -------------------------------------------------------------------

  /**
   * Archive document
   * @returns {{ success: boolean, details: Object }}
   */
  async deliver(submission, section, _sectionIndex) {
    const archiveRecord = this._buildArchiveRecord(submission, section);

    if (this._isConfigured()) {
      return this._storeViaS3(archiveRecord, section);
    }

    console.warn('[ArchiveAdapter] R2/S3 credentials not configured — using mock');
    return this._simulateStore(archiveRecord);
  }

  // -------------------------------------------------------------------
  // R2 / S3 Upload
  // -------------------------------------------------------------------

  _isConfigured() {
    return !!(this.archiveEndpoint && this.archiveAccessKeyId);
  }

  /**
   * Store document in R2/S3 using AWS SDK v3.
   * 1. Copy the section PDF to the archive bucket with Infrequent Access storage class
   * 2. Tag the object with retention metadata
   * 3. Store the archive record in the database (caller handles this)
   */
  async _storeViaS3(archiveRecord, section) {
    // Lazy-load AWS SDK to avoid bundling when not needed
    const { S3Client, CopyObjectCommand, PutObjectTaggingCommand } = require('@aws-sdk/client-s3');

    const s3 = new S3Client({
      region: this.archiveRegion,
      endpoint: this.archiveEndpoint,
      credentials: {
        accessKeyId: this.archiveAccessKeyId,
        secretAccessKey: this.archiveSecretAccessKey,
      },
    });

    const archiveKey = `archive/${archiveRecord.archiveId}/${archiveRecord.sectionType}.pdf`;

    // Step 1: Copy from hot bucket to archive bucket
    try {
      const sourceBucket = process.env.R2_BUCKET || 'fieldledger-uploads';
      await s3.send(new CopyObjectCommand({
        Bucket: this.archiveBucket,
        Key: archiveKey,
        CopySource: `${sourceBucket}/${section.fileKey}`,
        StorageClass: 'STANDARD_IA', // Infrequent Access for cost savings
        MetadataDirective: 'REPLACE',
        Metadata: {
          'x-archive-id': archiveRecord.archiveId,
          'x-pm-number': archiveRecord.metadata.pmNumber || '',
          'x-section-type': archiveRecord.sectionType,
          'x-retention-class': archiveRecord.retention.class,
          'x-retention-years': String(archiveRecord.retention.years),
          'x-expires-at': archiveRecord.retention.expiresAt,
          'x-content-hash': archiveRecord.document.hash || '',
        },
      }));
    } catch (copyErr) {
      console.error('[ArchiveAdapter] Copy failed:', copyErr.message);
      return { success: false, details: { error: `Archive copy failed: ${copyErr.message}` } };
    }

    // Step 2: Tag with retention metadata (used by lifecycle policies)
    try {
      await s3.send(new PutObjectTaggingCommand({
        Bucket: this.archiveBucket,
        Key: archiveKey,
        Tagging: {
          TagSet: [
            { Key: 'RetentionClass', Value: archiveRecord.retention.class },
            { Key: 'RetentionYears', Value: String(archiveRecord.retention.years) },
            { Key: 'ExpiresAt', Value: archiveRecord.retention.expiresAt },
            { Key: 'PMNumber', Value: archiveRecord.metadata.pmNumber || '' },
            { Key: 'SectionType', Value: archiveRecord.sectionType },
          ],
        },
      }));
    } catch (tagErr) {
      console.warn('[ArchiveAdapter] Tagging failed (non-fatal):', tagErr.message);
    }

    console.log(`[ArchiveAdapter] Archived: ${archiveRecord.archiveId} → ${archiveKey}`);

    return {
      success: true,
      details: {
        referenceId: archiveRecord.archiveId,
        archiveKey,
        retention: archiveRecord.retention,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // -------------------------------------------------------------------
  // Archive Record Builder
  // -------------------------------------------------------------------

  _buildArchiveRecord(submission, section) {
    return {
      archiveId: `ARC-${submission.submissionId}-${section.sectionType}`,
      sourceSubmission: submission.submissionId,
      sourceFile: submission.originalFile?.key,
      sectionType: section.sectionType,
      pageRange: { start: section.pageStart, end: section.pageEnd },
      document: {
        key: section.fileKey,
        hash: section.fileHash,
        size: section.fileSize,
      },
      metadata: {
        pmNumber: submission.pmNumber,
        jobNumber: submission.jobNumber,
        circuitId: submission.circuitId,
        companyId: submission.companyId?.toString(),
        utilityId: submission.utilityId?.toString(),
      },
      retention: {
        class: this._getRetentionClass(section.sectionType),
        years: this._getRetentionYears(section.sectionType),
        expiresAt: this._calculateExpirationDate(section.sectionType),
      },
      archivedAt: new Date().toISOString(),
      originalSubmitDate: submission.submittedAt,
    };
  }

  // -------------------------------------------------------------------
  // Retention Policies
  // -------------------------------------------------------------------

  _getRetentionClass(sectionType) {
    const classes = {
      ccsc: 'COMPLIANCE',
      construction_sketch: 'ASSET',
      permits: 'REGULATORY',
      billing_form: 'FINANCIAL',
      equipment_info: 'ASSET',
      photos: 'EVIDENCE',
      default: 'OPERATIONAL',
    };
    return classes[sectionType] || classes.default;
  }

  _getRetentionYears(sectionType) {
    const years = {
      ccsc: 10,
      construction_sketch: 50,
      permits: 10,
      billing_form: 7,
      equipment_info: 50,
      photos: 10,
      default: 7,
    };
    return years[sectionType] || years.default;
  }

  _calculateExpirationDate(sectionType) {
    const years = this._getRetentionYears(sectionType);
    const expDate = new Date();
    expDate.setFullYear(expDate.getFullYear() + years);
    return expDate.toISOString();
  }

  // -------------------------------------------------------------------
  // Simulation
  // -------------------------------------------------------------------

  async _simulateStore(archiveRecord) {
    // NOSONAR: Math.random() used for simulation timing jitter
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100)); // NOSONAR

    console.log(`[ArchiveAdapter] Simulated archive: ${archiveRecord.archiveId}`);
    console.log(`[ArchiveAdapter] Retention: ${archiveRecord.retention.class} — ${archiveRecord.retention.years} years`);

    return {
      success: true,
      details: {
        referenceId: archiveRecord.archiveId,
        retention: archiveRecord.retention,
        timestamp: new Date().toISOString(),
        simulated: true,
      },
    };
  }
}

module.exports = ArchiveAdapter;
