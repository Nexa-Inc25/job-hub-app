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

// ——— Fuzzy Field Name Matching ———

/**
 * Normalise a field name for fuzzy comparison.
 * Strips punctuation, collapses whitespace, lowercases.
 * "PM#", "PM Number", "PM_Number" → "pm number"
 */
function normalizeFieldName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[#_\-./\\]+/g, ' ')   // replace common separators with space
    .replace(/[^a-z0-9\s]/g, '')    // strip remaining non-alphanumeric
    .replace(/\s+/g, ' ')           // collapse whitespace
    .trim();
}

/**
 * Build a set of common aliases for job-data field names.
 * Keys are normalised, values are the canonical job field path.
 */
const FIELD_ALIASES = {
  'pm number': 'pmNumber',
  'pm no': 'pmNumber',
  'pm': 'pmNumber',
  'project number': 'pmNumber',
  'project no': 'pmNumber',
  'wo number': 'woNumber',
  'wo no': 'woNumber',
  'wo': 'woNumber',
  'work order': 'woNumber',
  'work order number': 'woNumber',
  'notification number': 'notificationNumber',
  'notif no': 'notificationNumber',
  'notification no': 'notificationNumber',
  'address': 'address',
  'job address': 'address',
  'location': 'address',
  'job location': 'address',
  'city': 'city',
  'order type': 'orderType',
  'mat code': 'matCode',
  'material code': 'matCode',
  'date': '__context_today',
  'today': '__context_today',
  'foreman': 'user.name',
  'foreman name': 'user.name',
  'gf name': 'user.name',
  'general foreman': 'user.name',
  'employee id': 'user.employeeId',
  'foreman id': 'user.employeeId',
  'po number': 'poNumber',
  'po no': 'poNumber',
  'po': 'poNumber',
  'cor number': 'corNumber',
  'cor no': 'corNumber',
  'division': 'division',
};

/**
 * Compute similarity between two normalised strings using Dice coefficient.
 * Returns 0–1 where 1 is identical.
 */
function diceSimilarity(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigramsA = new Set();
  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.substring(i, i + 2));
  let overlap = 0;
  for (let i = 0; i < b.length - 1; i++) {
    if (bigramsA.has(b.substring(i, i + 2))) overlap++;
  }
  return (2 * overlap) / (a.length - 1 + b.length - 1);
}

/**
 * Given an arbitrary field name (e.g. from a PDF form), find the best
 * matching canonical field path and a confidence score.
 *
 * @param {string} fieldName - raw field name from a PDF form
 * @returns {{ path: string|null, confidence: number }}
 */
function fuzzyMatchFieldName(fieldName) {
  const norm = normalizeFieldName(fieldName);
  if (!norm) return { path: null, confidence: 0 };

  // 1) Exact alias match
  if (FIELD_ALIASES[norm]) {
    return { path: FIELD_ALIASES[norm], confidence: 1 };
  }

  // 2) Prefix / contains match on alias keys
  let bestPath = null;
  let bestScore = 0;

  for (const [alias, path] of Object.entries(FIELD_ALIASES)) {
    // Check if one contains the other
    if (norm.includes(alias) || alias.includes(norm)) {
      const score = Math.min(norm.length, alias.length) / Math.max(norm.length, alias.length);
      if (score > bestScore) { bestScore = score; bestPath = path; }
    }

    // Dice similarity
    const dice = diceSimilarity(norm, alias);
    if (dice > bestScore) { bestScore = dice; bestPath = path; }
  }

  // Only return if we're fairly confident (>0.6)
  if (bestScore >= 0.6) {
    return { path: bestPath, confidence: Math.round(bestScore * 100) / 100 };
  }

  return { path: null, confidence: 0 };
}

// ——— Field Type Detection ———

/**
 * Detect the likely field type from a field name and optionally a value.
 * Returns one of: 'date', 'number', 'phone', 'email', 'text'
 */
function detectFieldType(fieldName, value) {
  const norm = normalizeFieldName(fieldName);

  // Date patterns
  if (/\b(date|day|month|year)\b/.test(norm)) return 'date';
  if (value && /^\d{4}-\d{2}-\d{2}/.test(String(value))) return 'date';
  if (value && /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(String(value))) return 'date';

  // Phone patterns
  if (/\b(phone|tel|fax|mobile|cell)\b/.test(norm)) return 'phone';

  // Email patterns
  if (/\b(email|e mail)\b/.test(norm)) return 'email';

  // Number patterns
  if (/\b(number|no|qty|quantity|amount|total|cost|rate|hours|hrs|count|size|footage)\b/.test(norm)) return 'number';
  if (value !== null && value !== undefined && !isNaN(Number(value)) && String(value).trim() !== '') return 'number';

  return 'text';
}

/**
 * Format a value based on detected field type.
 */
function formatFieldValue(value, fieldType, options = {}) {
  if (value === null || value === undefined) return null;

  switch (fieldType) {
    case 'date': {
      const date = new Date(value);
      if (isNaN(date.getTime())) return String(value);
      const fmt = options.dateFormat || 'MM/DD/YYYY';
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const year = date.getFullYear();
      return fmt
        .replace('MM', month)
        .replace('DD', day)
        .replace('YYYY', String(year))
        .replace('YY', String(year).slice(-2));
    }
    case 'number': {
      const num = Number(value);
      if (isNaN(num)) return String(value);
      // If it looks like currency, format with 2 decimals
      if (options.isCurrency) return num.toFixed(2);
      // If it's a whole number, don't add decimals
      if (Number.isInteger(num)) return String(num);
      return String(Math.round(num * 100) / 100);
    }
    case 'phone': {
      const digits = String(value).replace(/\D/g, '');
      if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
      return String(value);
    }
    default:
      return String(value);
  }
}

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
function generateContextValue(generator, _job) {
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

/**
 * Auto-fill arbitrary PDF form fields using fuzzy matching.
 *
 * Given a list of PDF field names and a job context, returns the best
 * value and confidence for each field.
 *
 * @param {string[]} pdfFieldNames - field names from the PDF form
 * @param {string} jobId - Job to pull data from
 * @param {string} userId - Current user
 * @returns {Object} Map of fieldName → { value, confidence, fieldType, formattedValue, matchedPath }
 */
async function fuzzyAutoFill(pdfFieldNames, jobId, userId) {
  const job = await Job.findById(jobId)
    .populate('assignedTo', 'name email employeeId')
    .populate('assignedToGF', 'name email employeeId')
    .lean();

  if (!job) {
    return { error: 'Job not found', fields: {} };
  }

  const user = userId ? await User.findById(userId).lean() : null;

  // Build flat lookup from job + user
  const dataContext = {
    pmNumber: job.pmNumber,
    woNumber: job.woNumber,
    notificationNumber: job.notificationNumber,
    address: job.address,
    city: job.city,
    orderType: job.orderType,
    matCode: job.matCode,
    poNumber: job.poNumber,
    corNumber: job.corNumber,
    division: job.division,
    'user.name': user?.name,
    'user.employeeId': user?.employeeId,
    __context_today: new Date().toISOString().split('T')[0],
  };

  const result = { fields: {}, autoFillCount: 0, totalFields: pdfFieldNames.length };

  for (const fieldName of pdfFieldNames) {
    const match = fuzzyMatchFieldName(fieldName);

    if (match.path && match.confidence > 0) {
      const rawValue = dataContext[match.path] ?? null;
      const fieldType = detectFieldType(fieldName, rawValue);
      const formattedValue = rawValue !== null ? formatFieldValue(rawValue, fieldType) : null;

      result.fields[fieldName] = {
        value: rawValue,
        formattedValue,
        fieldType,
        confidence: match.confidence,
        matchedPath: match.path,
        isAutoFilled: rawValue !== null,
      };

      if (rawValue !== null) result.autoFillCount++;
    } else {
      result.fields[fieldName] = {
        value: null,
        formattedValue: null,
        fieldType: detectFieldType(fieldName),
        confidence: 0,
        matchedPath: null,
        isAutoFilled: false,
      };
    }
  }

  result.autoFillPercentage = result.totalFields > 0
    ? Math.round((result.autoFillCount / result.totalFields) * 100)
    : 0;

  return result;
}

module.exports = {
  generateAutoFill,
  fuzzyAutoFill,
  getPatternData,
  getDocumentTypes,
  DOCUMENT_TEMPLATES,
  // Exported for testing
  normalizeFieldName,
  fuzzyMatchFieldName,
  detectFieldType,
  formatFieldValue,
  diceSimilarity,
  FIELD_ALIASES,
};
