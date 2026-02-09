/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Email Adapter
 * Delivers documents via email to specific departments
 */
class EmailAdapter {
  constructor(destination) {
    this.destination = destination;
    
    // Email configuration by destination
    this.emailConfig = {
      email_mapping: {
        to: (process.env.EMAIL_MAPPING_DEPT || 'mapping@pge.com').split(','),
        cc: [],
        subject: 'As-Built Sketch: {{pmNumber}}',
        template: 'mapping_asbuilt'
      },
      email_do: {
        to: (process.env.EMAIL_DO_DEPT || 'district-office@pge.com').split(','),
        cc: [],
        subject: 'Circuit Map Update: {{pmNumber}} - {{circuitId}}',
        template: 'do_circuit_map'
      },
      email_permits: {
        to: (process.env.EMAIL_PERMITS_DEPT || 'permits@pge.com').split(','),
        cc: [],
        subject: 'Permit Completion: {{pmNumber}}',
        template: 'permits_completion'
      },
      email_compliance: {
        to: (process.env.EMAIL_COMPLIANCE_DEPT || 'compliance@pge.com').split(','),
        cc: [],
        subject: 'CCSC Submission: {{pmNumber}}',
        template: 'compliance_ccsc'
      },
      email_estimating: {
        to: (process.env.EMAIL_ESTIMATING_DEPT || 'estimating@pge.com').split(','),
        cc: [],
        subject: 'Field Redlines/Bluelines: {{pmNumber}} - Crew Instructions',
        template: 'estimating_redlines'
      }
    };
  }
  
  /**
   * Deliver document via email
   */
  async deliver(submission, section, sectionIndex) {
    console.log(`[EmailAdapter] Sending ${section.sectionType} to ${this.destination}`);
    
    const config = this.emailConfig[this.destination];
    if (!config) {
      throw new Error(`Unknown email destination: ${this.destination}`);
    }
    
    // Build email
    const email = this.buildEmail(submission, section, config);
    
    // Send email (using Resend or similar)
    const result = await this.sendEmail(email);
    
    return {
      referenceId: result.messageId,
      status: 'success',
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Build email content
   */
  buildEmail(submission, section, config) {
    // Replace placeholders in subject
    let subject = config.subject
      .replace('{{pmNumber}}', submission.pmNumber || 'N/A')
      .replace('{{circuitId}}', submission.circuitId || 'N/A')
      .replace('{{sectionType}}', section.sectionType);
    
    // Build body
    const body = this.buildEmailBody(submission, section, config.template);
    
    return {
      to: config.to,
      cc: config.cc,
      from: process.env.EMAIL_FROM || 'noreply@fieldledger.io',
      subject: subject,
      html: body,
      attachments: [{
        filename: `${submission.pmNumber}_${section.sectionType}.pdf`,
        path: section.fileUrl || section.fileKey,
        contentType: 'application/pdf'
      }]
    };
  }
  
  /**
   * Build email body based on template
   */
  buildEmailBody(submission, section, template) {
    const commonHeader = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a365d; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">FieldLedger As-Built Submission</h1>
        </div>
        <div style="padding: 20px; background: #f7fafc;">
    `;
    
    const commonFooter = `
        </div>
        <div style="background: #e2e8f0; padding: 15px; text-align: center; font-size: 12px; color: #4a5568;">
          <p>This is an automated message from FieldLedger.</p>
          <p>Submission ID: ${submission.submissionId}</p>
          <p>Document Hash: ${section.fileHash?.substring(0, 16)}...</p>
        </div>
      </div>
    `;
    
    let content = '';
    
    switch (template) {
      case 'mapping_asbuilt':
        content = `
          <h2 style="color: #2d3748;">New As-Built Sketch Available</h2>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">PM Number:</td>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${submission.pmNumber}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Circuit ID:</td>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${submission.circuitId || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Pages:</td>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${section.pageStart} - ${section.pageEnd}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Submitted:</td>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${new Date(submission.submittedAt).toLocaleString()}</td>
            </tr>
          </table>
          <p>Please update GIS mapping accordingly. The construction sketch is attached.</p>
        `;
        break;
        
      case 'do_circuit_map':
        content = `
          <h2 style="color: #2d3748;">Circuit Map Change Sheet</h2>
          <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 4px; margin: 20px 0;">
            <strong>⚡ Circuit Update Required</strong>
            <p>A circuit map change sheet has been submitted for your district.</p>
          </div>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">PM Number:</td>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${submission.pmNumber}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Circuit ID:</td>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${submission.circuitId || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Work Order:</td>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${submission.workOrderNumber || 'N/A'}</td>
            </tr>
          </table>
        `;
        break;
        
      case 'compliance_ccsc':
        content = `
          <h2 style="color: #2d3748;">CCSC Compliance Document</h2>
          <div style="background: #d4edda; border: 1px solid #28a745; padding: 15px; border-radius: 4px; margin: 20px 0;">
            <strong>✓ Construction Completion Standards Checklist</strong>
            <p>A CCSC has been submitted for regulatory compliance tracking.</p>
          </div>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">PM Number:</td>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${submission.pmNumber}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Contractor:</td>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${submission.companyId || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Submission Date:</td>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${new Date(submission.submittedAt).toLocaleString()}</td>
            </tr>
          </table>
          <p>Document attached for CPUC compliance records.</p>
        `;
        break;
        
      case 'estimating_redlines':
        content = `
          <h2 style="color: #2d3748;">Field Redlines/Bluelines Attached</h2>
          <div style="background: #e3f2fd; border: 1px solid #2196f3; padding: 15px; border-radius: 4px; margin: 20px 0;">
            <strong>📝 Design Record Update Required</strong>
            <p>The attached crew instructions contain field redlines/bluelines that may require updates to your design records.</p>
          </div>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">PM Number:</td>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${submission.pmNumber}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Circuit ID:</td>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${submission.circuitId || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Document Type:</td>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${section.sectionType === 'crew_instructions' ? 'Crew Instructions' : 'Feedback Form'}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Contractor:</td>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${submission.companyId || 'N/A'}</td>
            </tr>
          </table>
          <p><strong>Action Required:</strong> Review attached document for any redline or blueline markups that indicate changes from the original design. Update design records as necessary.</p>
        `;
        break;
        
      default:
        content = `
          <h2 style="color: #2d3748;">As-Built Document Submission</h2>
          <p>A new as-built document has been submitted.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">PM Number:</td>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${submission.pmNumber}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Document Type:</td>
              <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${section.sectionType}</td>
            </tr>
          </table>
        `;
    }
    
    return commonHeader + content + commonFooter;
  }
  
  /**
   * Send email (using Resend or similar service)
   */
  async sendEmail(email) {
    // In production, use Resend API
    // const { Resend } = require('resend');
    // const resend = new Resend(process.env.RESEND_API_KEY);
    // return await resend.emails.send(email);
    
    // Simulate for now
    // NOSONAR: Math.random() used for simulation timing jitter, not security-sensitive
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100)); // NOSONAR
    
    console.log(`[EmailAdapter] Would send email to: ${email.to.join(', ')}`);
    console.log(`[EmailAdapter] Subject: ${email.subject}`);
    
    return {
      // NOSONAR: Simulated message ID for dev/test, not security-sensitive
      messageId: `MSG-${Date.now()}-${Math.random().toString(36).substring(7)}`, // NOSONAR
      status: 'sent'
    };
  }
}

module.exports = EmailAdapter;

