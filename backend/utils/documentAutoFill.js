/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Document Auto-Fill Engine
 * 
 * This is the core intelligence for auto-filling utility contractor paperwork.
 * Most fields on a CWC, As-Built, or Daily Report are predictable:
 * 
 * 1. FROM JOB PACKAGE (100% accurate - just copy from source):
 *    - PM Number, WO Number, Notification Number
 *    - Address, City
 *    - Order Type, MAT Code (unit pricing)
 *    - Service Type, Pipe Size/Type
 * 
 * 2. FROM CONTEXT (90%+ accurate - derived from job data):
 *    - Date (today's date)
 *    - Foreman Name, Employee ID
 *    - Crew Members (assigned crew)
 *    - Weather (can fetch from API)
 *    - Start/End Time (typical work hours)
 * 
 * 3. FROM PATTERNS (70-90% accurate - learned from similar jobs):
 *    - Excavation Depth (similar jobs in area)
 *    - Traffic Control Type (based on location)
 *    - Materials Used (based on job type)
 *    - Equipment Used (based on job type)
 * 
 * 4. REQUIRES HUMAN INPUT (can't predict):
 *    - Actual footage installed
 *    - Issues encountered
 *    - Signature
 */

const Job = require('../models/Job');
const AITrainingData = require('../models/AITrainingData');
const User = require('../models/User');

/**
 * Field definitions for common utility documents
 * These map to actual form fields and their data sources
 */
const DOCUMENT_TEMPLATES = {
  'CWC': {
    name: 'Completion Work Confirmation',
    fields: {
      // From Job Package (100% accurate)
      pm_number: { source: 'job', field: 'pmNumber', confidence: 1 },
      wo_number: { source: 'job', field: 'woNumber', confidence: 1 },
      notification_number: { source: 'job', field: 'notificationNumber', confidence: 1 },
      address: { source: 'job', field: 'address', confidence: 1 },
      city: { source: 'job', field: 'city', confidence: 1 },
      order_type: { source: 'job', field: 'orderType', confidence: 1 },
      mat_code: { source: 'job', field: 'matCode', confidence: 1 },
      
      // From Context (90%+)
      date: { source: 'context', generator: 'today', confidence: 0.95 },
      foreman_name: { source: 'user', field: 'name', confidence: 1 },
      foreman_id: { source: 'user', field: 'employeeId', confidence: 1 },
      
      // From Patterns (learned)
      excavation_depth: { source: 'pattern', field: 'excavation_depth', confidence: 0.75 },
      backfill_type: { source: 'pattern', field: 'backfill_type', confidence: 0.8 },
      compaction_method: { source: 'pattern', field: 'compaction_method', confidence: 0.85 },
      
      // Requires Human Input
      footage_installed: { source: 'human', confidence: 0 },
      as_built_verified: { source: 'human', confidence: 0 },
      signature: { source: 'human', confidence: 0 },
    }
  },
  
  'AS_BUILT': {
    name: 'As-Built Documentation',
    fields: {
      pm_number: { source: 'job', field: 'pmNumber', confidence: 1 },
      address: { source: 'job', field: 'address', confidence: 1 },
      date: { source: 'context', generator: 'today', confidence: 0.95 },
      foreman_name: { source: 'user', field: 'name', confidence: 1 },
      
      // These are often the same for similar job types
      pipe_size: { source: 'pattern', field: 'pipe_size', confidence: 0.85 },
      pipe_type: { source: 'pattern', field: 'pipe_type', confidence: 0.85 },
      depth_of_cover: { source: 'pattern', field: 'depth_of_cover', confidence: 0.7 },
      
      // Must be filled by human
      measurements: { source: 'human', confidence: 0 },
      photo_attached: { source: 'human', confidence: 0 },
    }
  },
  
  'DAILY_REPORT': {
    name: 'Daily Work Report',
    fields: {
      date: { source: 'context', generator: 'today', confidence: 1 },
      foreman_name: { source: 'user', field: 'name', confidence: 1 },
      crew_size: { source: 'job', field: 'crewSize', confidence: 0.9 },
      
      // These can be learned
      start_time: { source: 'pattern', field: 'start_time', defaultValue: '07:00', confidence: 0.85 },
      end_time: { source: 'pattern', field: 'end_time', defaultValue: '15:30', confidence: 0.8 },
      weather: { source: 'context', generator: 'weather', confidence: 0.9 },
      
      // Must be filled
      work_description: { source: 'human', confidence: 0 },
      issues: { source: 'human', confidence: 0 },
    }
  },

  'PRE_FIELD_REPORT': {
    name: 'Pre-Field Assessment',
    fields: {
      pm_number: { source: 'job', field: 'pmNumber', confidence: 1 },
      address: { source: 'job', field: 'address', confidence: 1 },
      date: { source: 'context', generator: 'today', confidence: 1 },
      gf_name: { source: 'user', field: 'name', confidence: 1 },
      
      // Learned from similar locations
      usa_dig_required: { source: 'pattern', field: 'usa_dig_required', confidence: 0.85 },
      traffic_control_needed: { source: 'pattern', field: 'traffic_control_needed', confidence: 0.8 },
      permit_required: { source: 'pattern', field: 'permit_required', confidence: 0.75 },
      estimated_crew_size: { source: 'pattern', field: 'crew_size', confidence: 0.7 },
      estimated_hours: { source: 'pattern', field: 'estimated_hours', confidence: 0.65 },
      
      // Human assessment
      site_conditions: { source: 'human', confidence: 0 },
      access_notes: { source: 'human', confidence: 0 },
    }
  }
};

// Helper to get field value based on source type
function getFieldValue(fieldDef, job, user, patterns) {
  switch (fieldDef.source) {
    case 'job':
      return { value: getNestedValue(job, fieldDef.field), confidence: fieldDef.confidence };
    case 'user':
      return { value: user ? getNestedValue(user, fieldDef.field) : null, confidence: fieldDef.confidence };
    case 'context':
      return { value: generateContextValue(fieldDef.generator, job), confidence: fieldDef.confidence };
    case 'pattern': {
      const patternResult = patterns[fieldDef.field];
      if (patternResult) {
        return { value: patternResult.value, confidence: patternResult.confidence };
      }
      if (fieldDef.defaultValue) {
        return { value: fieldDef.defaultValue, confidence: 0.5 };
      }
      return { value: null, confidence: 0 };
    }
    default:
      return { value: null, confidence: 0 };
  }
}

/**
 * Generate auto-fill values for a document
 * 
 * @param {string} documentType - Type of document (CWC, AS_BUILT, etc.)
 * @param {string} jobId - Job ID to pull data from
 * @param {string} userId - User (foreman) filling out the document
 * @returns {Object} - Field values with confidence scores
 */
async function generateAutoFill(documentType, jobId, userId) {
  const template = DOCUMENT_TEMPLATES[documentType];
  if (!template) {
    return { error: 'Unknown document type: ' + documentType, fields: {} };
  }

  const job = await Job.findById(jobId)
    .populate('assignedTo', 'name email employeeId')
    .populate('assignedToGF', 'name email employeeId');
  
  if (!job) {
    return { error: 'Job not found', fields: {} };
  }

  const user = await User.findById(userId);
  const patterns = await getPatternData(job);

  const result = {
    documentType,
    documentName: template.name,
    fields: {},
    autoFillPercentage: 0,
    humanInputRequired: [],
  };

  let autoFillCount = 0;
  const entries = Object.entries(template.fields);
  const totalFields = entries.length;

  for (const [fieldName, fieldDef] of entries) {
    if (fieldDef.source === 'human') {
      result.humanInputRequired.push(fieldName);
      continue;
    }

    const { value, confidence } = getFieldValue(fieldDef, job, user, patterns);

    if (value !== null && value !== undefined) {
      autoFillCount++;
      result.fields[fieldName] = { value, confidence, source: fieldDef.source, canOverride: true, isAutoFilled: true };
    } else {
      result.fields[fieldName] = { value: null, confidence: 0, source: fieldDef.source, canOverride: true, isAutoFilled: false, needsInput: true };
    }
  }

  result.autoFillPercentage = Math.round((autoFillCount / totalFields) * 100);
  result.message = `Auto-filled ${autoFillCount} of ${totalFields} fields (${result.autoFillPercentage}%)`;

  return result;
}

/**
 * Get pattern data from similar completed jobs
 */
async function getPatternData(job) {
  const patterns = {};

  try {
    // Find similar completed jobs
    const similarJobs = await AITrainingData.find({
      isComplete: true,
      isTrainingData: true,
      $or: [
        { city: job.city },
        { orderType: job.orderType },
        { division: job.division }
      ]
    })
    .sort({ createdAt: -1 })
    .limit(20);

    if (similarJobs.length === 0) {
      return patterns;
    }

    // Aggregate pattern data
    const fieldValues = {};

    similarJobs.forEach(trainingData => {
      // Collect pre-field decisions
      trainingData.preFieldDecisions?.forEach(decision => {
        const key = decision.checklistItem + '_required';
        if (!fieldValues[key]) fieldValues[key] = [];
        fieldValues[key].push(decision.wasChecked);
      });

      // Collect form field values
      trainingData.formsCompleted?.forEach(form => {
        form.fields?.forEach(field => {
          if (field.value !== null && field.value !== undefined) {
            if (!fieldValues[field.fieldName]) fieldValues[field.fieldName] = [];
            fieldValues[field.fieldName].push(field.value);
          }
        });
      });

      // Collect crew data
      if (trainingData.crewSize) {
        if (!fieldValues.crew_size) fieldValues.crew_size = [];
        fieldValues.crew_size.push(trainingData.crewSize);
      }
      if (trainingData.estimatedHours) {
        if (!fieldValues.estimated_hours) fieldValues.estimated_hours = [];
        fieldValues.estimated_hours.push(trainingData.estimatedHours);
      }
    });

    // Calculate most common values and confidence
    for (const [field, values] of Object.entries(fieldValues)) {
      if (values.length === 0) continue;

      if (typeof values[0] === 'boolean') {
        // For boolean fields, use majority vote
        const trueCount = values.filter(v => v === true).length;
        const ratio = trueCount / values.length;
        patterns[field] = {
          value: ratio > 0.5,
          confidence: Math.abs(ratio - 0.5) * 2,  // 0-1 scale
          basedOnJobs: values.length
        };
      } else if (typeof values[0] === 'number') {
        // For numeric fields, use average
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const stdDev = Math.sqrt(
          values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length
        );
        patterns[field] = {
          value: Math.round(avg * 10) / 10,
          confidence: Math.max(0, 1 - (stdDev / avg)),  // Lower variance = higher confidence
          basedOnJobs: values.length
        };
      } else {
        // For string fields, use most common value
        const counts = {};
        values.forEach(v => {
          counts[v] = (counts[v] || 0) + 1;
        });
        const mostCommon = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        patterns[field] = {
          value: mostCommon[0],
          confidence: mostCommon[1] / values.length,
          basedOnJobs: values.length
        };
      }
    }
  } catch (err) {
    console.error('[AutoFill] Error getting pattern data:', err);
  }

  return patterns;
}

/**
 * Generate context-based values
 */
function generateContextValue(generator, job) {
  switch (generator) {
    case 'today':
      return new Date().toISOString().split('T')[0];
    
    case 'weather':
      // Weather API integration planned for future release - using default for now
      return 'Clear';
    
    case 'time_now':
      return new Date().toTimeString().slice(0, 5);
    
    default:
      return null;
  }
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj, path) {
  if (!obj || !path) return null;
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Get available document types for auto-fill
 */
function getDocumentTypes() {
  return Object.entries(DOCUMENT_TEMPLATES).map(([key, template]) => ({
    key,
    name: template.name,
    fieldCount: Object.keys(template.fields).length,
    humanFieldCount: Object.values(template.fields).filter(f => f.source === 'human').length,
  }));
}

module.exports = {
  generateAutoFill,
  getPatternData,
  getDocumentTypes,
  DOCUMENT_TEMPLATES,
};
