/**
 * Email Service
 * 
 * Handles email notifications and document sharing.
 * Uses Resend as the email provider.
 * 
 * @module services/email
 */

const { Resend } = require('resend');

/**
 * Email configuration
 */
const config = {
  from: process.env.EMAIL_FROM || 'noreply@jobhubpro.com',
  replyTo: process.env.EMAIL_REPLY_TO || 'support@jobhubpro.com'
};

/**
 * Initialize Resend client (lazy initialization)
 */
let resendClient = null;

function getResendClient() {
  if (!resendClient && process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

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
  const client = getResendClient();
  
  // Stub mode for development/testing when no API key is configured
  if (!client) {
    console.log('[EMAIL SERVICE] No RESEND_API_KEY - running in stub mode:', {
      to: options.to,
      subject: options.subject,
      attachmentCount: options.attachments?.length || 0
    });
    
    return {
      success: true,
      messageId: `stub-${Date.now()}`,
      timestamp: new Date().toISOString()
    };
  }

  // Transform attachments to Resend format if present
  const attachments = options.attachments?.map(att => ({
    filename: att.filename,
    content: att.content instanceof Buffer ? att.content : Buffer.from(att.content)
  }));

  try {
    const { data, error } = await client.emails.send({
      from: config.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      reply_to: config.replyTo,
      attachments
    });

    if (error) {
      console.error('[EMAIL SERVICE] Resend error:', error);
      throw new Error(error.message);
    }

    console.log('[EMAIL SERVICE] Email sent successfully:', {
      to: options.to,
      subject: options.subject,
      messageId: data.id
    });

    return {
      success: true,
      messageId: data.id,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    console.error('[EMAIL SERVICE] Failed to send email:', err);
    throw err;
  }
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

/**
 * Send user invitation email with temporary password
 * 
 * @param {Object} options - Invitation options
 * @param {string} options.email - New user's email
 * @param {string} options.name - New user's name
 * @param {string} options.tempPassword - Temporary password
 * @param {string} options.inviterName - Name of person who sent invite
 * @param {string} options.companyName - Company name
 * @param {string} options.role - User's role
 * @returns {Promise<Object>} Send result
 */
async function sendInvitation(options) {
  const { email, name, tempPassword, inviterName, companyName, role } = options;
  const loginUrl = process.env.FRONTEND_URL || 'https://job-hub-frontend.vercel.app';
  
  const roleDisplay = {
    'admin': 'Administrator',
    'pm': 'Project Manager',
    'gf': 'General Foreman',
    'foreman': 'Foreman',
    'crew': 'Crew Member',
    'qa': 'QA Reviewer'
  }[role] || role;

  return sendEmail({
    to: email,
    subject: `You're invited to Job Hub Pro - ${companyName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1976d2;">Welcome to Job Hub Pro!</h2>
        <p>Hi ${name},</p>
        <p><strong>${inviterName}</strong> has invited you to join <strong>${companyName}</strong> on Job Hub Pro as a <strong>${roleDisplay}</strong>.</p>
        
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Your Login Credentials</h3>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Temporary Password:</strong> <code style="background: #e0e0e0; padding: 4px 8px; border-radius: 4px;">${tempPassword}</code></p>
        </div>
        
        <p><a href="${loginUrl}" style="display: inline-block; background-color: #1976d2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Log In to Job Hub Pro</a></p>
        
        <p style="color: #666; font-size: 14px;"><strong>Important:</strong> For security, please change your password after your first login.</p>
        
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
        <p style="color: #999; font-size: 12px;">
          This invitation was sent by ${inviterName} from ${companyName}.<br>
          If you didn't expect this invitation, you can safely ignore this email.
        </p>
      </div>
    `,
    text: `Welcome to Job Hub Pro!

Hi ${name},

${inviterName} has invited you to join ${companyName} on Job Hub Pro as a ${roleDisplay}.

Your Login Credentials:
- Email: ${email}
- Temporary Password: ${tempPassword}

Log in at: ${loginUrl}

Important: For security, please change your password after your first login.

---
This invitation was sent by ${inviterName} from ${companyName}.
If you didn't expect this invitation, you can safely ignore this email.`
  });
}

/**
 * Reset the Resend client (useful for testing)
 */
function resetClient() {
  resendClient = null;
}

module.exports = {
  sendEmail,
  sendJobDocuments,
  sendPasswordReset,
  sendMfaEnabled,
  sendInvitation,
  resetClient,
  config
};
