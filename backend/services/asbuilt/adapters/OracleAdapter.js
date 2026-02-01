/**
 * Oracle ERP Adapter
 * Delivers documents to Oracle PPM, EAM, or Payables
 */
class OracleAdapter {
  constructor(destination) {
    this.destination = destination;
    this.module = destination.replace('oracle_', '');
    
    // Oracle endpoints (would come from config)
    this.endpoints = {
      ppm: process.env.ORACLE_PPM_ENDPOINT || 'https://oracle.pge.com/fscmRestApi/resources/latest/projects',
      eam: process.env.ORACLE_EAM_ENDPOINT || 'https://oracle.pge.com/fscmRestApi/resources/latest/maintenanceWorkOrders',
      payables: process.env.ORACLE_PAYABLES_ENDPOINT || 'https://oracle.pge.com/fscmRestApi/resources/latest/invoices'
    };
  }
  
  /**
   * Deliver document to Oracle
   */
  async deliver(submission, section, sectionIndex) {
    console.log(`[OracleAdapter] Delivering ${section.sectionType} to Oracle ${this.module}`);
    
    // Build payload based on module
    const payload = this.buildPayload(submission, section);
    
    // In production, this would make actual API calls
    // For now, simulate the delivery
    const result = await this.simulateDelivery(payload);
    
    return {
      referenceId: result.documentId,
      status: 'success',
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Build Oracle-specific payload
   */
  buildPayload(submission, section) {
    const basePayload = {
      // Common fields
      SourceSystem: 'FieldLedger',
      SourceDocumentId: `${submission.submissionId}-${section.sectionType}`,
      ProjectNumber: submission.pmNumber,
      Description: `As-Built: ${section.sectionType} for ${submission.pmNumber}`,
      DocumentDate: new Date().toISOString().split('T')[0],
      
      // Attachment info
      Attachment: {
        FileName: `${submission.pmNumber}_${section.sectionType}.pdf`,
        FileType: 'application/pdf',
        Category: this.getDocumentCategory(section.sectionType),
        ContentHash: section.fileHash,
        SourceUrl: section.fileUrl || section.fileKey
      }
    };
    
    // Module-specific fields
    switch (this.module) {
      case 'ppm':
        return {
          ...basePayload,
          ProjectId: submission.pmNumber,
          TaskNumber: 'CONSTRUCTION',
          DocumentCategory: 'AS_BUILT',
          MilestoneCode: this.getMilestoneCode(section.sectionType),
          Attribute1: submission.circuitId,
          Attribute2: section.extractedData?.workDate || ''
        };
        
      case 'eam':
        return {
          ...basePayload,
          WorkOrderNumber: submission.workOrderNumber || submission.pmNumber,
          AssetGroup: 'DISTRIBUTION',
          ObjectType: this.getAssetObjectType(section),
          ObjectIds: section.extractedData?.poleIds || [],
          DocumentType: 'INSTALLATION_RECORD',
          // GPS coordinates for asset location verification
          Locations: section.extractedData?.gpsCoordinates || []
        };
        
      case 'payables':
        return {
          ...basePayload,
          InvoiceType: 'CONTRACTOR_BACKUP',
          VendorId: submission.companyId?.toString(),
          BackupDocumentType: section.sectionType,
          AmountApplicable: section.sectionType === 'billing_form'
        };
        
      default:
        return basePayload;
    }
  }
  
  /**
   * Get document category for Oracle
   */
  getDocumentCategory(sectionType) {
    const categories = {
      face_sheet: 'PROJECT_DOCUMENTATION',
      equipment_info: 'ASSET_RECORD',
      construction_sketch: 'AS_BUILT_DRAWING',
      billing_form: 'INVOICE_BACKUP',
      ccsc: 'COMPLIANCE_RECORD',
      photos: 'FIELD_PHOTOGRAPHY'
    };
    return categories[sectionType] || 'GENERAL_DOCUMENT';
  }
  
  /**
   * Get milestone code for PPM
   */
  getMilestoneCode(sectionType) {
    const milestones = {
      construction_sketch: 'CONSTRUCTION_COMPLETE',
      ccsc: 'QC_APPROVED',
      billing_form: 'BILLING_SUBMITTED'
    };
    return milestones[sectionType] || 'DOCUMENT_UPLOADED';
  }
  
  /**
   * Get asset object type for EAM
   */
  getAssetObjectType(section) {
    if (section.extractedData?.poleIds?.length > 0) return 'POLE';
    if (section.extractedData?.transformerIds?.length > 0) return 'TRANSFORMER';
    return 'EQUIPMENT';
  }
  
  /**
   * Simulate delivery (replace with actual API calls in production)
   */
  async simulateDelivery(payload) {
    // Simulate network latency
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
    
    // 95% success rate simulation
    if (Math.random() > 0.95) {
      throw new Error('Oracle API temporarily unavailable');
    }
    
    return {
      documentId: `ORA-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      status: 'RECEIVED',
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = OracleAdapter;

