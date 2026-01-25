const mongoose = require('mongoose');

/**
 * Feedback Model
 * 
 * Stores user feedback, bug reports, and feature requests from pilot users.
 * Critical for pilot success - allows immediate issue reporting from the field.
 */

const feedbackSchema = new mongoose.Schema({
  // Who submitted
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: String,  // Denormalized for quick display
  userEmail: String,
  userRole: String,
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  
  // Feedback content
  type: { 
    type: String, 
    enum: ['bug', 'feature_request', 'question', 'other'], 
    default: 'bug' 
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  subject: { type: String, required: true, maxlength: 200 },
  description: { type: String, required: true, maxlength: 5000 },
  
  // Context - helps debug issues
  currentPage: String,  // URL/route where feedback was submitted
  userAgent: String,    // Browser info
  screenSize: String,   // Device screen size
  
  // Optional: attach a job context
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job' },
  
  // Admin tracking
  status: {
    type: String,
    enum: ['new', 'acknowledged', 'in_progress', 'resolved', 'closed'],
    default: 'new'
  },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  adminNotes: String,
  resolvedAt: Date,
  
}, { timestamps: true });

// Indexes for efficient querying
feedbackSchema.index({ status: 1, createdAt: -1 });
feedbackSchema.index({ companyId: 1, createdAt: -1 });
feedbackSchema.index({ userId: 1 });
feedbackSchema.index({ type: 1, priority: 1 });

module.exports = mongoose.model('Feedback', feedbackSchema);

