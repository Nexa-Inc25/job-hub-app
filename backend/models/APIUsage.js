const mongoose = require('mongoose');

/**
 * API Usage Tracking Model
 * 
 * Tracks OpenAI API usage, costs, and other external service consumption
 * for owner dashboard metrics and cost monitoring.
 */

const apiUsageSchema = new mongoose.Schema({
  // What API was called
  service: { 
    type: String, 
    enum: ['openai', 'r2_storage', 'other'], 
    required: true 
  },
  
  // Specific operation/endpoint
  operation: { 
    type: String, 
    required: true 
  },  // e.g., 'gpt-4-vision', 'pdf-extraction', 'image-classification'
  
  // Which model was used (for OpenAI)
  model: String,  // e.g., 'gpt-4-vision-preview', 'gpt-4o-mini'
  
  // Token usage (OpenAI specific)
  promptTokens: { type: Number, default: 0 },
  completionTokens: { type: Number, default: 0 },
  totalTokens: { type: Number, default: 0 },
  
  // Estimated cost in cents (for easy aggregation)
  estimatedCostCents: { type: Number, default: 0 },
  
  // Storage usage (R2 specific)
  bytesStored: { type: Number, default: 0 },
  bytesTransferred: { type: Number, default: 0 },
  
  // Request metadata
  success: { type: Boolean, default: true },
  errorMessage: String,
  responseTimeMs: Number,
  
  // Context - what triggered this usage
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  
  // Additional details
  metadata: mongoose.Schema.Types.Mixed,  // Any extra data
  
}, { timestamps: true });

// Indexes for efficient aggregation queries
apiUsageSchema.index({ service: 1, createdAt: -1 });
apiUsageSchema.index({ companyId: 1, createdAt: -1 });
apiUsageSchema.index({ createdAt: -1 });
apiUsageSchema.index({ jobId: 1 });

// Static method to log OpenAI usage
apiUsageSchema.statics.logOpenAIUsage = async function(data) {
  // Pricing estimates (per 1M tokens as of 2024)
  // GPT-4 Vision: $10/1M input, $30/1M output
  // GPT-4o-mini: $0.15/1M input, $0.60/1M output
  const pricing = {
    'gpt-4-vision-preview': { input: 10, output: 30 },
    'gpt-4o': { input: 2.5, output: 10 },
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
    'gpt-4-turbo': { input: 10, output: 30 },
    'default': { input: 2.5, output: 10 }
  };
  
  const modelPricing = pricing[data.model] || pricing['default'];
  
  // Calculate cost in cents (pricing is in $/million tokens, multiply by 100 to convert dollars to cents)
  const inputCostCents = (data.promptTokens / 1000000) * modelPricing.input * 100;
  const outputCostCents = (data.completionTokens / 1000000) * modelPricing.output * 100;
  // Round to 2 decimal places of cents for precision
  const totalCostCents = Math.round((inputCostCents + outputCostCents) * 100) / 100;
  
  return this.create({
    service: 'openai',
    operation: data.operation,
    model: data.model,
    promptTokens: data.promptTokens || 0,
    completionTokens: data.completionTokens || 0,
    totalTokens: (data.promptTokens || 0) + (data.completionTokens || 0),
    estimatedCostCents: totalCostCents,
    success: data.success !== false,
    errorMessage: data.errorMessage,
    responseTimeMs: data.responseTimeMs,
    jobId: data.jobId,
    userId: data.userId,
    companyId: data.companyId,
    metadata: data.metadata
  });
};

// Static method to log R2 storage usage
apiUsageSchema.statics.logStorageUsage = async function(data) {
  // R2 pricing: $0.015/GB stored, $0/egress (free egress!)
  // 0.015 dollars = 1.5 cents per GB
  const storageCostCents = (data.bytesStored / (1024 * 1024 * 1024)) * 1.5;
  
  return this.create({
    service: 'r2_storage',
    operation: data.operation,
    bytesStored: data.bytesStored || 0,
    bytesTransferred: data.bytesTransferred || 0,
    // Round to 2 decimal places of cents (no additional multiplication needed)
    estimatedCostCents: Math.round(storageCostCents * 100) / 100,
    success: data.success !== false,
    errorMessage: data.errorMessage,
    jobId: data.jobId,
    userId: data.userId,
    companyId: data.companyId,
    metadata: data.metadata
  });
};

// Static method to get usage summary for a time period
apiUsageSchema.statics.getUsageSummary = async function(startDate, endDate, companyId = null) {
  const match = {
    createdAt: { $gte: startDate, $lte: endDate }
  };
  if (companyId) match.companyId = companyId;
  
  const summary = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$service',
        totalCalls: { $sum: 1 },
        successfulCalls: { $sum: { $cond: ['$success', 1, 0] } },
        failedCalls: { $sum: { $cond: ['$success', 0, 1] } },
        totalTokens: { $sum: '$totalTokens' },
        totalCostCents: { $sum: '$estimatedCostCents' },
        avgResponseTimeMs: { $avg: '$responseTimeMs' },
        totalBytesStored: { $sum: '$bytesStored' }
      }
    }
  ]);
  
  return summary;
};

// Static method to get daily usage for charts
apiUsageSchema.statics.getDailyUsage = async function(days = 30, service = null) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const match = { createdAt: { $gte: startDate } };
  if (service) match.service = service;
  
  const daily = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          service: '$service'
        },
        calls: { $sum: 1 },
        tokens: { $sum: '$totalTokens' },
        costCents: { $sum: '$estimatedCostCents' }
      }
    },
    { $sort: { '_id.date': 1 } }
  ]);
  
  return daily;
};

module.exports = mongoose.model('APIUsage', apiUsageSchema);

