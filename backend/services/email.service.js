/**
 * Email Service
 * 
 * Handles email notifications and document sharing.
 * Currently a stub - integrate with SendGrid, SES, or similar.
 * 
 * @module services/email
 */

/**
 * Email configuration
 */
const config = {
  from: process.env.EMAIL_FROM || 'noreply@jobhubpro.com',
  replyTo: process.env.EMAIL_REPLY_TO || 'support@jobhubpro.com'
};

/**
 * Send an email
 * 
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML body
 * @param {string} options.text - Plain text body
 * @param {Object[]} options.attachments - File attachments
 * @returns {Promise<Object>} Send result
 */
async function sendEmail(options) {
  // TODO: Integrate with email provider (SendGrid, AWS SES, etc.)
  console.log('[EMAIL SERVICE] Would send email:', {
    to: options.to,
    subject: options.subject,
    attachmentCount: options.attachments?.length || 0
  });
  
  // Stub response
  return {
    success: true,
    messageId: `stub-${Date.now()}`,
    timestamp: new Date().toISOString()
  };
}

/**
 * Send job documents via email
 * 
 * @param {Object} options - Options
 * @param {string} options.to - Recipient email
 * @param {string} options.jobTitle - Job title for subject
 * @param {string} options.pmNumber - PM number
 * @param {Buffer} options.zipBuffer - Zip file buffer
 * @param {string} options.senderName - Name of sender
 * @returns {Promise<Object>} Send result
 */
async function sendJobDocuments(options) {
  const { to, jobTitle, pmNumber, zipBuffer, senderName } = options;
  
  return sendEmail({
    to,
    subject: `Job Documents: ${pmNumber || jobTitle}`,
    html: `
      <h2>Job Documents</h2>
      <p>${senderName} has shared job documents with you.</p>
      <p><strong>Job:</strong> ${pmNumber || jobTitle}</p>
      <p>Please find the documents attached as a ZIP file.</p>
      <hr>
      <p style="color: #666; font-size: 12px;">
        Sent via Job Hub Pro
      </p>
    `,
    text: `Job Documents: ${pmNumber || jobTitle}\n\n${senderName} has shared job documents with you.\n\nPlease find the documents attached.`,
    attachments: [
      {
        filename: `${pmNumber || 'documents'}.zip`,
        content: zipBuffer
      }
    ]
  });
}

/**
 * Send password reset email
 * 
 * @param {string} email - User email
 * @param {string} resetToken - Password reset token
 * @param {string} resetUrl - Full reset URL
 * @returns {Promise<Object>} Send result
 */
async function sendPasswordReset(email, resetToken, resetUrl) {
  return sendEmail({
    to: email,
    subject: 'Password Reset - Job Hub Pro',
    html: `
      <h2>Password Reset Request</h2>
      <p>You requested a password reset for your Job Hub Pro account.</p>
      <p>Click the link below to reset your password:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>This link expires in 1 hour.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `,
    text: `Password Reset\n\nClick this link to reset your password: ${resetUrl}\n\nThis link expires in 1 hour.`
  });
}

/**
 * Send MFA setup confirmation
 * 
 * @param {string} email - User email
 * @param {string} name - User name
 * @returns {Promise<Object>} Send result
 */
async function sendMfaEnabled(email, name) {
  return sendEmail({
    to: email,
    subject: 'Two-Factor Authentication Enabled - Job Hub Pro',
    html: `
      <h2>Two-Factor Authentication Enabled</h2>
      <p>Hi ${name},</p>
      <p>Two-factor authentication has been successfully enabled on your account.</p>
      <p>You will now need to enter a code from your authenticator app when logging in.</p>
      <p>If you didn't make this change, please contact support immediately.</p>
    `,
    text: `Two-Factor Authentication Enabled\n\nHi ${name},\n\nTwo-factor authentication has been enabled on your account.`
  });
}

module.exports = {
  sendEmail,
  sendJobDocuments,
  sendPasswordReset,
  sendMfaEnabled,
  config
};

