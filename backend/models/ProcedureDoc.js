const mongoose = require('mongoose');

/**
 * ProcedureDoc Model
 * Stores PG&E and utility procedure documents that teach the AI
 * how to fill out as-builts and other field documentation.
 */
const procedureDocSchema = new mongoose.Schema({
  // Document identification
  name: { type: String, required: true },
  description: String,
  
  // Document type
  docType: {
    type: String,
    enum: [
      'as-built-procedure',    // How to fill out as-builts
      'as-built-template',     // Blank as-built form template
      'field-checklist',       // Field verification checklists
      'safety-procedure',      // Safety requirements
      'construction-standard', // Construction standards (e.g., G.O. 95)
      'material-spec',         // Material specifications
      'inspection-guide',      // QA/QC inspection guides
      'other'
    ],
    default: 'as-built-procedure'
  },
  
  // Work type this applies to (for filtering relevant docs)
  applicableWorkTypes: [{
    type: String,
    enum: [
      'overhead',
      'underground', 
      'pole-replacement',
      'transformer',
      'service-install',
      'meter',
      'switching',
      'streetlight',
      'all'
    ]
  }],
  
  // The actual content extracted from the PDF
  extractedContent: {
    rawText: String,           // Full text extracted from PDF
    sections: [{               // Parsed sections
      title: String,
      content: String,
      pageNumber: Number
    }],
    // Structured requirements extracted by AI
    requirements: [{
      field: String,           // e.g., "Pole Height"
      description: String,     // What should be recorded
      required: Boolean,
      dataType: String,        // text, number, date, photo, signature
      validationRules: String, // e.g., "Must match material list"
      exampleValue: String
    }],
    // Questions the AI should ask foremen
    questions: [{
      field: String,           // Which field this populates
      question: String,        // The question to ask
      helpText: String,        // Additional context for the foreman
      inputType: String,       // text, number, select, multiselect, photo
      options: [String],       // For select/multiselect
      dependsOn: String        // Conditional question based on previous answer
    }]
  },
  
  // File storage
  fileKey: String,             // R2/S3 key for original PDF
  fileName: String,
  fileSize: Number,
  mimeType: String,
  
  // Processing status
  processingStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  processingError: String,
  lastProcessedAt: Date,
  
  // Version control
  version: { type: String, default: '1.0' },
  effectiveDate: Date,         // When this procedure became effective
  supersedes: { type: mongoose.Schema.Types.ObjectId, ref: 'ProcedureDoc' },
  
  // Organization
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // Metadata
  tags: [String],
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

// Indexes for efficient querying
procedureDocSchema.index({ companyId: 1, docType: 1, isActive: 1 });
procedureDocSchema.index({ applicableWorkTypes: 1 });
procedureDocSchema.index({ 'extractedContent.requirements.field': 1 });

// Static method to find relevant procedures for a work type
procedureDocSchema.statics.findForWorkType = function(workType, companyId) {
  return this.find({
    companyId,
    isActive: true,
    processingStatus: 'completed',
    $or: [
      { applicableWorkTypes: workType },
      { applicableWorkTypes: 'all' }
    ]
  }).sort({ effectiveDate: -1 });
};

// Static method to get all questions for an as-built
procedureDocSchema.statics.getAsBuiltQuestions = async function(workType, companyId) {
  const docs = await this.find({
    companyId,
    isActive: true,
    processingStatus: 'completed',
    docType: { $in: ['as-built-procedure', 'as-built-template'] },
    $or: [
      { applicableWorkTypes: workType },
      { applicableWorkTypes: 'all' }
    ]
  });
  
  // Aggregate all questions from matching procedures
  const questions = [];
  for (const doc of docs) {
    if (doc.extractedContent?.questions) {
      questions.push(...doc.extractedContent.questions.map(q => ({
        ...q,
        sourceDoc: doc.name,
        sourceDocId: doc._id
      })));
    }
  }
  
  return questions;
};

module.exports = mongoose.model('ProcedureDoc', procedureDocSchema);

