/**
 * FieldLedger - UTVAC Validator Service
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Validates an As-Built submission against utility-specific rules
 * before it leaves the foreman's hands.
 * 
 * UTVAC = Unambiguous, Traceable, Verifiable, Accurate, Complete
 * (PG&E standard, but the same quality criteria apply across utilities)
 * 
 * This service is config-driven via UtilityAsBuiltConfig.validationRules.
 * PG&E is the first implementation; other utilities plug in via config.
 */

const UtilityAsBuiltConfig = require('../../models/UtilityAsBuiltConfig');

class UTVACValidator {
  /**
   * Validate a complete wizard submission
   * 
   * @param {Object} submission - The wizard submission data
   * @param {string} submission.utilityCode - Utility identifier (e.g., 'PGE')
   * @param {string} submission.workType - Work type code (e.g., 'estimated')
   * @param {Object} submission.stepData - Data collected from each wizard step
   * @param {Object} submission.completedSteps - Which steps were completed
   * @param {Object} options - Additional context
   * @param {Object} options.job - Full job record
   * @param {Array} options.photos - Uploaded photos
   * @returns {Object} { valid, errors, warnings, score }
   */
  async validate(submission, options = {}) {
    const errors = [];
    const warnings = [];
    const checks = [];

    // Load utility config
    const config = await UtilityAsBuiltConfig.findByUtilityCode(
      submission.utilityCode || 'PGE'
    );

    if (!config) {
      return {
        valid: false,
        errors: [{ code: 'NO_CONFIG', message: 'No utility configuration found' }],
        warnings: [],
        score: 0,
        checks: [],
      };
    }

    // Get the work type definition
    const workType = config.workTypes.find(wt => wt.code === submission.workType);
    if (!workType) {
      errors.push({ code: 'INVALID_WORK_TYPE', message: `Unknown work type: ${submission.workType}` });
    }

    // ---- Run each validation category ----
    this._validateCompleteness(submission, workType, config, errors, warnings, checks);
    this._validateTraceability(submission, options, errors, warnings, checks);
    this._validateSignatures(submission, config, errors, warnings, checks);
    this._validateSketchMarkup(submission, workType, errors, warnings, checks);
    this._validateChecklist(submission, config, errors, warnings, checks);
    this._validatePhotos(options.photos, errors, warnings, checks);
    this._validateGPS(submission, options, errors, warnings, checks);

    // Run config-defined validation rules
    if (config.validationRules) {
      this._runConfigRules(config.validationRules, submission, options, errors, warnings, checks);
    }

    // Calculate UTVAC score (0-100)
    const passedChecks = checks.filter(c => c.passed).length;
    const score = checks.length > 0 ? Math.round((passedChecks / checks.length) * 100) : 0;

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      score,
      checks,
      totalChecks: checks.length,
      passedChecks,
    };
  }

  /**
   * Completeness: All required documents present for the work type
   */
  _validateCompleteness(submission, workType, _config, errors, _warnings, checks) {
    if (!workType) return;

    const requiredDocs = workType.requiredDocs || [];
    const completedSteps = submission.completedSteps || {};
    const stepData = submission.stepData || {};

    for (const doc of requiredDocs) {
      // Map document types to wizard steps
      const stepKey = this._docToStepKey(doc);
      const isComplete = completedSteps[stepKey] || false;

      checks.push({
        category: 'completeness',
        code: `DOC_${doc.toUpperCase()}`,
        description: `Required document: ${doc.replaceAll('_', ' ')}`,
        passed: isComplete,
      });

      if (!isComplete) {
        errors.push({
          code: `MISSING_DOC_${doc.toUpperCase()}`,
          message: `Required document not completed: ${doc.replaceAll('_', ' ')}`,
          category: 'completeness',
        });
      }
    }

    // Check work type is confirmed
    checks.push({
      category: 'completeness',
      code: 'WORK_TYPE_CONFIRMED',
      description: 'Work type confirmed',
      passed: !!completedSteps.work_type,
    });
  }

  /**
   * Traceability: Identify who completed the work
   */
  _validateTraceability(submission, options, errors, warnings, checks) {
    const ecTagData = submission.stepData?.ec_tag;

    // LAN ID / user identity
    const hasIdentity = ecTagData?.lanId || options.job?.assignedTo;
    checks.push({
      category: 'traceability',
      code: 'USER_IDENTITY',
      description: 'Preparer identity (LAN ID) captured',
      passed: !!hasIdentity,
    });

    if (!hasIdentity) {
      errors.push({
        code: 'MISSING_IDENTITY',
        message: 'LAN ID or user identity required for traceability',
        category: 'traceability',
      });
    }

    // Completion date
    const hasDate = ecTagData?.completionDate || ecTagData?.completedAt;
    checks.push({
      category: 'traceability',
      code: 'COMPLETION_DATE',
      description: 'Completion date recorded',
      passed: !!hasDate,
    });

    if (!hasDate) {
      warnings.push({
        code: 'MISSING_DATE',
        message: 'Completion date not recorded',
        category: 'traceability',
      });
    }
  }

  /**
   * Signatures: Required signatures are captured
   */
  _validateSignatures(submission, config, errors, _warnings, checks) {
    // EC Tag signature
    const ecTagSig = submission.stepData?.ec_tag?.signatureData;
    checks.push({
      category: 'signatures',
      code: 'EC_TAG_SIGNATURE',
      description: 'EC Tag signed',
      passed: !!ecTagSig,
    });
    if (!ecTagSig && submission.completedSteps?.ec_tag) {
      errors.push({
        code: 'MISSING_EC_TAG_SIG',
        message: 'EC Tag signature required',
        category: 'signatures',
      });
    }

    // CCSC signature
    if (config?.checklist?.requiresCrewLeadSignature) {
      const ccscSig = submission.stepData?.ccsc?.signatureData;
      checks.push({
        category: 'signatures',
        code: 'CCSC_SIGNATURE',
        description: 'Checklist signed by crew lead',
        passed: !!ccscSig,
      });
      if (!ccscSig && submission.completedSteps?.ccsc) {
        errors.push({
          code: 'MISSING_CCSC_SIG',
          message: 'Checklist crew lead signature required',
          category: 'signatures',
        });
      }
    }
  }

  /**
   * Sketch markup: Construction sketch has markup or is marked "Built As Designed"
   */
  _validateSketchMarkup(submission, workType, errors, _warnings, checks) {
    if (!workType?.requiresSketchMarkup) return;

    const sketchData = submission.stepData?.sketch;
    const hasMarkup = sketchData && (
      sketchData.builtAsDesigned ||
      (sketchData.strokeCount || 0) > 0 ||
      (sketchData.lineCount || 0) > 0 ||
      (sketchData.symbolCount || 0) > 0
    );

    checks.push({
      category: 'accuracy',
      code: 'SKETCH_MARKUP',
      description: 'Construction sketch marked up or "Built As Designed"',
      passed: !!hasMarkup,
    });

    if (!hasMarkup) {
      errors.push({
        code: 'MISSING_SKETCH_MARKUP',
        message: 'Construction sketch must have redline/blueline markup or be marked "Built As Designed"',
        category: 'accuracy',
      });
    }

    // If marked up (not BAD), check that at least red or blue was used
    if (sketchData && !sketchData.builtAsDesigned && hasMarkup) {
      const colorsUsed = sketchData.colorsUsed || [];
      const hasRedOrBlue = colorsUsed.includes('red') || colorsUsed.includes('blue');
      checks.push({
        category: 'accuracy',
        code: 'SKETCH_COLORS',
        description: 'Sketch uses red (remove/change) or blue (new/add) markup',
        passed: hasRedOrBlue,
      });
    }
  }

  /**
   * Checklist: All applicable items addressed
   */
  _validateChecklist(submission, config, errors, warnings, checks) {
    const ccscData = submission.stepData?.ccsc;
    if (!ccscData || !config?.checklist) return;

    for (const [sectionCode, sectionData] of Object.entries(ccscData.sections || {})) {
      const configSection = config.checklist.sections.find(s => s.code === sectionCode);
      if (!configSection) continue;

      const items = sectionData.items || [];
      const unchecked = items.filter(i => !i.checked);
      // Look up safetyCritical from the config, not the submission data
      // (submission items only have { number, checked }, not safetyCritical)
      const configItems = configSection.items || [];
      const safetyCriticalMissing = unchecked.filter(i => {
        const configItem = configItems.find(ci => ci.number === i.number);
        return configItem?.safetyCritical;
      });

      checks.push({
        category: 'completeness',
        code: `CCSC_${sectionCode}_COMPLETE`,
        description: `${configSection.label} checklist items all addressed`,
        passed: unchecked.length === 0,
      });

      if (safetyCriticalMissing.length > 0) {
        errors.push({
          code: `CCSC_SAFETY_${sectionCode}`,
          message: `${configSection.label}: ${safetyCriticalMissing.length} safety-critical item(s) not addressed`,
          category: 'completeness',
        });
      } else if (unchecked.length > 0) {
        warnings.push({
          code: `CCSC_INCOMPLETE_${sectionCode}`,
          message: `${configSection.label}: ${unchecked.length} item(s) not checked`,
          category: 'completeness',
        });
      }
    }
  }

  /**
   * Photos: At least one completion photo
   */
  _validatePhotos(photos, _errors, warnings, checks) {
    const hasPhotos = photos && photos.length > 0;
    checks.push({
      category: 'verifiable',
      code: 'COMPLETION_PHOTOS',
      description: 'Completion photo(s) uploaded',
      passed: !!hasPhotos,
    });
    if (!hasPhotos) {
      warnings.push({
        code: 'NO_PHOTOS',
        message: 'Completion photos recommended for verifiability',
        category: 'verifiable',
      });
    }
  }

  /**
   * GPS: Location data captured
   */
  _validateGPS(submission, options, _errors, warnings, checks) {
    const job = options.job;
    const hasGPS = job?.address || job?.latitude || submission.stepData?.gps;
    checks.push({
      category: 'verifiable',
      code: 'GPS_LOCATION',
      description: 'GPS/address data captured',
      passed: !!hasGPS,
    });
    if (!hasGPS) {
      warnings.push({
        code: 'NO_GPS',
        message: 'GPS coordinates recommended for asset location verification',
        category: 'verifiable',
      });
    }
  }

  /**
   * Run config-defined validation rules
   */
  _runConfigRules(rules, submission, options, errors, warnings, checks) {
    for (const rule of rules) {
      // Skip rules already covered by specific validators above
      // COMPLETION_PHOTOS → _validatePhotos, GPS_PRESENT → _validateGPS
      if (['SKETCH_MARKUP', 'CCSC_COMPLETE', 'CCSC_SIGNED', 'EC_TAG_SIGNED', 'COMPLETION_PHOTOS', 'GPS_PRESENT'].includes(rule.code)) {
        continue;
      }

      const value = this._resolveRuleTarget(rule.target, submission, options);
      let passed = false;

      switch (rule.rule) {
        case 'required':
          passed = !!value;
          break;
        case 'required_unless':
          passed = !!value || !!this._resolveRuleTarget(rule.condition, submission, options);
          break;
        case 'min_count':
          passed = Array.isArray(value) ? value.length >= rule.minValue : (value || 0) >= rule.minValue;
          break;
        case 'signature_required':
        case 'photo_required':
        case 'gps_required':
          passed = !!value;
          break;
        default:
          continue;
      }

      checks.push({
        category: 'config_rule',
        code: rule.code,
        description: rule.description,
        passed,
      });

      if (!passed) {
        const target = rule.severity === 'error' ? errors : warnings;
        target.push({
          code: rule.code,
          message: rule.description,
          category: 'config_rule',
        });
      }
    }
  }

  /**
   * Resolve a rule target to a value from submission/options
   */
  _resolveRuleTarget(target, submission, options) {
    if (!target) return null;

    // Check stepData
    const stepData = submission.stepData || {};
    if (target in stepData) return stepData[target];

    // Check completedSteps
    if (target in (submission.completedSteps || {})) return submission.completedSteps[target];

    // Check nested stepData (e.g., 'ec_tag.signature')
    const parts = target.split('.');
    if (parts.length === 2 && stepData[parts[0]]) {
      return stepData[parts[0]][parts[1]];
    }

    // Check options
    if (target === 'completion_photos') return options.photos;
    if (target === 'gps_coordinates') return options.job?.latitude || options.job?.address;

    return null;
  }

  /**
   * Map document type to wizard step key
   */
  _docToStepKey(docType) {
    const map = {
      ec_tag: 'ec_tag',
      construction_sketch: 'sketch',
      ccsc: 'ccsc',
      face_sheet: 'face_sheet',
      crew_instructions: 'crew_instructions',
      billing_form: 'billing_form',
      emergency_checklist: 'emergency_checklist',
    };
    return map[docType] || docType;
  }
}

module.exports = new UTVACValidator();

