/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * AI Data Capture Utility
 * 
 * Captures user actions and decisions for AI training.
 * Call these functions at key moments to build the training dataset.
 */

const AITrainingData = require('../models/AITrainingData');
const Job = require('../models/Job');

/**
 * Initialize training data record for a job
 * Call when job is created or first accessed
 */
async function initializeTrainingData(jobId, userId) {
  try {
    // Check if training data already exists for this job
    let trainingData = await AITrainingData.findOne({ jobId });
    if (trainingData) return trainingData;

    // Get job details for context
    const job = await Job.findById(jobId);
    if (!job) return null;

    // Create new training data record
    trainingData = new AITrainingData({
      jobId,
      jobType: job.orderType || 'unknown',
      orderType: job.orderType,
      division: job.division,
      matCode: job.matCode,
      address: job.address,
      city: job.city,
      companyId: job.companyId,
      utilityId: job.utilityId,
      capturedBy: userId,
    });

    await trainingData.save();
    console.log(`[AI Data] Initialized training data for job ${jobId}`);
    return trainingData;
  } catch (err) {
    console.error('[AI Data] Error initializing training data:', err);
    return null;
  }
}

/**
 * Capture pre-field checklist decisions
 * Call when GF saves pre-field data
 */
async function capturePreFieldDecisions(jobId, decisions, userId) {
  try {
    const trainingData = await AITrainingData.findOne({ jobId });
    if (!trainingData) {
      await initializeTrainingData(jobId, userId);
      return capturePreFieldDecisions(jobId, decisions, userId);
    }

    // decisions format: { usa_dig: { checked: true, notes: "..." }, ... }
    trainingData.preFieldDecisions = Object.entries(decisions).map(([key, value]) => ({
      checklistItem: key,
      wasChecked: value.checked || false,
      notes: value.notes || '',
      actuallyNeeded: null  // Will be filled after job completion
    }));

    await trainingData.save();
    console.log(`[AI Data] Captured pre-field decisions for job ${jobId}`);
    return trainingData;
  } catch (err) {
    console.error('[AI Data] Error capturing pre-field decisions:', err);
    return null;
  }
}

/**
 * Capture form field entries
 * Call when a form/document is saved
 */
async function captureFormCompletion(jobId, formType, fields, completionTimeSeconds, userId) {
  try {
    let trainingData = await AITrainingData.findOne({ jobId });
    if (!trainingData) {
      trainingData = await initializeTrainingData(jobId, userId);
    }
    if (!trainingData) return null;

    // Helper to determine field type
    const getFieldType = (data) => {
      if (typeof data === 'boolean') return 'boolean';
      if (typeof data === 'number') return 'number';
      return 'text';
    };

    // Helper to extract value from field data
    const extractValue = (data) => (data.value === undefined ? data : data.value);

    // Convert fields object to array of field entries
    const fieldEntries = Object.entries(fields).map(([fieldName, fieldData]) => ({
      fieldName,
      fieldType: getFieldType(fieldData),
      value: extractValue(fieldData),
      wasAISuggested: fieldData.wasAISuggested || false,
      wasAccepted: fieldData.wasAccepted !== false,
      userOverride: fieldData.userOverride || null,
    }));

    // Find existing form or create new
    const existingFormIndex = trainingData.formsCompleted.findIndex(
      f => f.formType === formType
    );

    if (existingFormIndex >= 0) {
      // Update existing form
      trainingData.formsCompleted[existingFormIndex].fields = fieldEntries;
      trainingData.formsCompleted[existingFormIndex].editCount += 1;
      if (completionTimeSeconds) {
        trainingData.formsCompleted[existingFormIndex].completionTime = completionTimeSeconds;
      }
    } else {
      // Add new form
      trainingData.formsCompleted.push({
        formType,
        fields: fieldEntries,
        completionTime: completionTimeSeconds || null,
        editCount: 0
      });
    }

    await trainingData.save();
    console.log(`[AI Data] Captured form completion: ${formType} for job ${jobId}`);
    return trainingData;
  } catch (err) {
    console.error('[AI Data] Error capturing form completion:', err);
    return null;
  }
}

/**
 * Capture site conditions from pre-field
 * Call when GF saves site assessment
 */
async function captureSiteConditions(jobId, conditions, userId) {
  try {
    let trainingData = await AITrainingData.findOne({ jobId });
    if (!trainingData) {
      trainingData = await initializeTrainingData(jobId, userId);
    }
    if (!trainingData) return null;

    // Update site conditions
    if (conditions.siteConditions) trainingData.siteConditions = conditions.siteConditions;
    if (conditions.soilType) trainingData.soilType = conditions.soilType;
    if (conditions.accessDifficulty) trainingData.accessDifficulty = conditions.accessDifficulty;
    if (conditions.trafficLevel) trainingData.trafficLevel = conditions.trafficLevel;
    if (conditions.residentialCommercial) trainingData.residentialCommercial = conditions.residentialCommercial;

    await trainingData.save();
    console.log(`[AI Data] Captured site conditions for job ${jobId}`);
    return trainingData;
  } catch (err) {
    console.error('[AI Data] Error capturing site conditions:', err);
    return null;
  }
}

/**
 * Capture crew and time data
 * Call when job is scheduled or completed
 */
async function captureCrewData(jobId, crewData, userId) {
  try {
    let trainingData = await AITrainingData.findOne({ jobId });
    if (!trainingData) {
      trainingData = await initializeTrainingData(jobId, userId);
    }
    if (!trainingData) return null;

    if (crewData.crewSize !== undefined) trainingData.crewSize = crewData.crewSize;
    if (crewData.estimatedHours !== undefined) trainingData.estimatedHours = crewData.estimatedHours;
    if (crewData.actualHours !== undefined) trainingData.actualHours = crewData.actualHours;
    if (crewData.foremanId) trainingData.foremanId = crewData.foremanId;

    await trainingData.save();
    console.log(`[AI Data] Captured crew data for job ${jobId}`);
    return trainingData;
  } catch (err) {
    console.error('[AI Data] Error capturing crew data:', err);
    return null;
  }
}

/**
 * Capture job outcome for quality scoring
 * Call when job is completed/approved
 */
async function captureJobOutcome(jobId, outcome, userId) {
  try {
    let trainingData = await AITrainingData.findOne({ jobId });
    if (!trainingData) {
      trainingData = await initializeTrainingData(jobId, userId);
    }
    if (!trainingData) return null;

    if (outcome.firstTimeSuccess !== undefined) trainingData.firstTimeSuccess = outcome.firstTimeSuccess;
    if (outcome.revisionsRequired !== undefined) trainingData.revisionsRequired = outcome.revisionsRequired;
    if (outcome.rejectionReasons) trainingData.rejectionReasons = outcome.rejectionReasons;
    if (outcome.qualityScore !== undefined) trainingData.qualityScore = outcome.qualityScore;
    if (outcome.utilityFeedback) trainingData.utilityFeedback = outcome.utilityFeedback;

    // Mark as complete if we have enough data
    const hasBasicData = trainingData.preFieldDecisions.length > 0 || 
                         trainingData.formsCompleted.length > 0;
    trainingData.isComplete = hasBasicData;

    await trainingData.save();
    console.log(`[AI Data] Captured job outcome for job ${jobId}`);
    return trainingData;
  } catch (err) {
    console.error('[AI Data] Error capturing job outcome:', err);
    return null;
  }
}

/**
 * Get AI suggestions based on similar past jobs
 * This is the INFERENCE side - using collected data to make predictions
 */
async function getAISuggestions(jobContext) {
  try {
    // Find similar completed jobs
    const similarJobs = await AITrainingData.find({
      isComplete: true,
      isTrainingData: true,
      // Match on key characteristics
      ...(jobContext.city && { city: jobContext.city }),
      ...(jobContext.orderType && { orderType: jobContext.orderType }),
      ...(jobContext.division && { division: jobContext.division }),
    })
    .sort({ createdAt: -1 })
    .limit(10);

    if (similarJobs.length === 0) {
      return { suggestions: [], confidence: 0, message: 'No similar jobs found' };
    }

    // Aggregate patterns from similar jobs
    const suggestions = {};
    
    // Pre-field checklist suggestions
    const checklistCounts = {};
    similarJobs.forEach(job => {
      job.preFieldDecisions.forEach(decision => {
        if (!checklistCounts[decision.checklistItem]) {
          checklistCounts[decision.checklistItem] = { checked: 0, total: 0 };
        }
        checklistCounts[decision.checklistItem].total += 1;
        if (decision.wasChecked) {
          checklistCounts[decision.checklistItem].checked += 1;
        }
      });
    });

    suggestions.preFieldChecklist = Object.entries(checklistCounts).map(([item, counts]) => ({
      item,
      suggestChecked: counts.checked / counts.total > 0.5,
      confidence: Math.abs((counts.checked / counts.total) - 0.5) * 2,  // 0-1 scale
      basedOnJobs: counts.total
    }));

    // Crew size suggestion
    const crewSizes = similarJobs.filter(j => j.crewSize).map(j => j.crewSize);
    if (crewSizes.length > 0) {
      const avgCrewSize = crewSizes.reduce((a, b) => a + b, 0) / crewSizes.length;
      suggestions.crewSize = {
        suggested: Math.round(avgCrewSize),
        confidence: crewSizes.length / 10,  // More data = more confidence
        basedOnJobs: crewSizes.length
      };
    }

    // Estimated hours suggestion
    const hours = similarJobs.filter(j => j.actualHours || j.estimatedHours)
      .map(j => j.actualHours || j.estimatedHours);
    if (hours.length > 0) {
      const avgHours = hours.reduce((a, b) => a + b, 0) / hours.length;
      suggestions.estimatedHours = {
        suggested: Math.round(avgHours * 10) / 10,
        confidence: hours.length / 10,
        basedOnJobs: hours.length
      };
    }

    return {
      suggestions,
      confidence: similarJobs.length / 10,
      basedOnJobs: similarJobs.length,
      message: `Based on ${similarJobs.length} similar jobs`
    };
  } catch (err) {
    console.error('[AI Data] Error getting suggestions:', err);
    return { suggestions: [], confidence: 0, message: 'Error getting suggestions' };
  }
}

module.exports = {
  initializeTrainingData,
  capturePreFieldDecisions,
  captureFormCompletion,
  captureSiteConditions,
  captureCrewData,
  captureJobOutcome,
  getAISuggestions,
};
