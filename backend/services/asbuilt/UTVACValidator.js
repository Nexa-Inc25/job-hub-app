/**
 * FieldLedger - UTVAC Validator Service
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Validates an As-Built submission against utility-specific rules
 * before it leaves the foreman's hands.
 * 
 * UTVAC dimensions:
 *   U  = Usability      — can the document be read/understood?
 *   T  = Traceability    — can work items be traced to specs / crew materials?
 *   V  = Verification    — are signatures, dates, GPS present?
 *   AC = Accuracy/Completeness — are all required sections filled & consistent?
 * 
 * Score: 0-100 per dimension, overall = weighted average.
 * Weights and thresholds come from UtilityAsBuiltConfig.validationRules.
 * 
 * PG&E is the first implementation; other utilities plug in via config.
 */

const UtilityAsBuiltConfig = require('../../models/UtilityAsBuiltConfig');

/** Default dimension weights when config doesn't specify */
const DEFAULT_WEIGHTS = {
  usability: 0.15,
  traceability: 0.25,
  verification: 0.25,
  accuracy: 0.35,
};

/** Default minimum passing score per dimension */
const DEFAULT_THRESHOLDS = {
  usability: 60,
  traceability: 70,
  verification: 70,
  accuracy: 80,
  overall: 70,
};

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
   * @returns {Object} { valid, errors, warnings, score, dimensions }
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
        dimensions: this._emptyDimensions(),
        checks: [],
      };
    }

    // Get the work type definition
    const workType = config.workTypes.find(wt => wt.code === submission.workType);
    if (!workType) {
      errors.push({ code: 'INVALID_WORK_TYPE', message: `Unknown work type: ${submission.workType}` });
    }

    // ---- Run each UTVAC dimension ----

    // AC = Accuracy / Completeness
    this._validateCompleteness(submission, workType, config, errors, warnings, checks);
    this._validateAccuracyCrossRef(submission, workType, config, options, errors, warnings, checks);

    // T = Traceability
    this._validateTraceability(submission, options, errors, warnings, checks);
    this._validateMaterialTraceability(submission, options, errors, warnings, checks);

    // V = Verification
    this._validateSignatures(submission, config, errors, warnings, checks);
    this._validatePhotos(options.photos, errors, warnings, checks);
    this._validateGPS(submission, options, errors, warnings, checks);

    // U = Usability
    this._validateUsability(submission, workType, errors, warnings, checks);
    this._validateSketchMarkup(submission, workType, errors, warnings, checks);
    this._validateChecklist(submission, config, errors, warnings, checks);

    // Run config-defined validation rules
    if (config.validationRules) {
      this._runConfigRules(config.validationRules, submission, options, errors, warnings, checks);
    }

    // ---- Calculate per-dimension scores ----
    const dimensions = this._calculateDimensionScores(checks, config);

    // ---- Overall weighted score ----
    const weights = config.scoreWeights || DEFAULT_WEIGHTS;
    const overall = Math.round(
      dimensions.usability.score * (weights.usability || DEFAULT_WEIGHTS.usability) +
      dimensions.traceability.score * (weights.traceability || DEFAULT_WEIGHTS.traceability) +
      dimensions.verification.score * (weights.verification || DEFAULT_WEIGHTS.verification) +
      dimensions.accuracy.score * (weights.accuracy || DEFAULT_WEIGHTS.accuracy)
    );

    // ---- Apply thresholds ----
    const thresholds = config.scoreThresholds || DEFAULT_THRESHOLDS;
    const thresholdFailures = [];

    for (const [dim, dimData] of Object.entries(dimensions)) {
      const threshold = thresholds[dim] ?? DEFAULT_THRESHOLDS[dim] ?? 0;
      dimData.threshold = threshold;
      dimData.passing = dimData.score >= threshold;
      if (!dimData.passing) {
        thresholdFailures.push(dim);
      }
    }

    const overallThreshold = thresholds.overall ?? DEFAULT_THRESHOLDS.overall;
    const overallPassing = overall >= overallThreshold;

    if (!overallPassing) {
      warnings.push({
        code: 'OVERALL_SCORE_LOW',
        message: `Overall UTVAC score ${overall}% is below the ${overallThreshold}% threshold`,
        category: 'score',
      });
    }

    for (const dim of thresholdFailures) {
      warnings.push({
        code: `${dim.toUpperCase()}_SCORE_LOW`,
        message: `${dim} score ${dimensions[dim].score}% is below the ${dimensions[dim].threshold}% threshold`,
        category: 'score',
      });
    }

    const passedChecks = checks.filter(c => c.passed).length;

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      score: overall,
      dimensions,
      overallPassing,
      checks,
      totalChecks: checks.length,
      passedChecks,
    };
  }

  // ==================================================================
  // ACCURACY / COMPLETENESS (AC)
  // ==================================================================

  /**
   * Completeness: All required documents present for the work type
   */
  _validateCompleteness(submission, workType, _config, errors, _warnings, checks) {
    if (!workType) return;

    const requiredDocs = workType.requiredDocs || [];
    const completedSteps = submission.completedSteps || {};

    for (const doc of requiredDocs) {
      // Map document types to wizard steps
      const stepKey = this._docToStepKey(doc);
      const isComplete = completedSteps[stepKey] || false;

      checks.push({
        category: 'accuracy',
        code: `DOC_${doc.toUpperCase()}`,
        description: `Required document: ${doc.replaceAll('_', ' ')}`,
        passed: isComplete,
      });

      if (!isComplete) {
        errors.push({
          code: `MISSING_DOC_${doc.toUpperCase()}`,
          message: `Required document not completed: ${doc.replaceAll('_', ' ')}`,
          category: 'accuracy',
        });
      }
    }

    // Check work type is confirmed
    checks.push({
      category: 'accuracy',
      code: 'WORK_TYPE_CONFIRMED',
      description: 'Work type confirmed',
      passed: !!completedSteps.work_type,
    });
  }

  /**
   * Accuracy cross-reference: Checklist answers are consistent with
   * which sections are present, and equipment data matches job scope.
   */
  _validateAccuracyCrossRef(submission, workType, config, options, errors, warnings, checks) {
    if (!workType) return;

    const stepData = submission.stepData || {};
    const completedSteps = submission.completedSteps || {};

    // 1. If checklist mentions overhead items, verify OH sections are addressed
    const ccscData = stepData.ccsc;
    if (ccscData?.sections && config?.checklist?.sections) {
      for (const [sectionCode, sectionData] of Object.entries(ccscData.sections)) {
        const items = sectionData.items || [];
        const checkedItems = items.filter(i => i.checked);

        // If the foreman checked OH items, ensure construction sketch is done
        if (sectionCode === 'OH' && checkedItems.length > 0 && !completedSteps.sketch) {
          warnings.push({
            code: 'CCSC_OH_NO_SKETCH',
            message: 'Overhead checklist items checked but construction sketch not completed',
            category: 'accuracy',
          });
        }

        // If UG items checked, verify equipment info is completed (pad-mount data)
        if (sectionCode === 'UG' && checkedItems.length > 0 && !completedSteps.equipment_info) {
          warnings.push({
            code: 'CCSC_UG_NO_EQUIPMENT',
            message: 'Underground checklist items checked but equipment info not completed',
            category: 'accuracy',
          });
        }
      }
    }

    // 2. Cross-reference FDA attributes against job scope
    const fdaData = stepData.fda;
    const job = options.job;
    if (fdaData && job) {
      // If job description mentions transformer but no transformer FDA data
      const jobDesc = (job.description || '').toLowerCase();
      if ((jobDesc.includes('transformer') || jobDesc.includes('xfmr')) && !fdaData.transformer) {
        warnings.push({
          code: 'FDA_MISSING_TRANSFORMER',
          message: 'Job mentions transformer work but no transformer attributes recorded',
          category: 'accuracy',
        });
      }

      // If FDA has pole replacement data, verify old and new pole entries
      if (fdaData.pole?.action === 'replace') {
        const hasOld = fdaData.pole.oldPole?.class || fdaData.pole.oldPole?.height;
        const hasNew = fdaData.pole.newPole?.class || fdaData.pole.newPole?.height;

        checks.push({
          category: 'accuracy',
          code: 'FDA_POLE_REPLACE_OLD',
          description: 'Pole replacement: old pole attributes recorded',
          passed: !!hasOld,
        });

        checks.push({
          category: 'accuracy',
          code: 'FDA_POLE_REPLACE_NEW',
          description: 'Pole replacement: new pole attributes recorded',
          passed: !!hasNew,
        });

        if (!hasOld) {
          warnings.push({
            code: 'FDA_POLE_NO_OLD',
            message: 'Pole replacement selected but old pole attributes not recorded',
            category: 'accuracy',
          });
        }
        if (!hasNew) {
          errors.push({
            code: 'FDA_POLE_NO_NEW',
            message: 'Pole replacement selected but new pole attributes not recorded',
            category: 'accuracy',
          });
        }
      }
    }

    // 3. Verify billing form data consistency with unit entries (if provided)
    const billingData = stepData.billing_form;
    if (billingData && options.unitEntries?.length > 0) {
      const unitEntryTotal = options.unitEntries.reduce((sum, ue) => sum + (ue.quantity || 0), 0);
      checks.push({
        category: 'accuracy',
        code: 'BILLING_UNIT_ENTRIES',
        description: 'Billing form has associated unit entries',
        passed: unitEntryTotal > 0,
      });
    }
  }

  // ==================================================================
  // TRACEABILITY (T)
  // ==================================================================

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
   * Material traceability: Verify material codes in the submission
   * can be traced back to crew materials from the job package.
   */
  _validateMaterialTraceability(submission, options, _errors, warnings, checks) {
    const job = options.job;
    if (!job) return;

    const crewMaterials = job.crewMaterials || [];
    const fdaData = submission.stepData?.fda;

    // 1. If job has crew materials, check that they're acknowledged
    if (crewMaterials.length > 0) {
      checks.push({
        category: 'traceability',
        code: 'CREW_MATERIALS_PRESENT',
        description: 'Job has crew materials list for traceability',
        passed: true, // Materials exist on the job
      });

      // 2. Cross-reference FDA conductor data against crew materials
      if (fdaData?.conductors?.length > 0) {
        let matchedCount = 0;
        const totalConductors = fdaData.conductors.length;

        for (const conductor of fdaData.conductors) {
          // Check if conductor size/material appears in crew materials description
          const condSize = (conductor.size || '').toUpperCase();
          const condMaterial = (conductor.material || '').toUpperCase();

          const hasMatch = crewMaterials.some(m => {
            const desc = (m.description || '').toUpperCase();
            const code = (m.mCode || '').toUpperCase();
            return (condSize && (desc.includes(condSize) || code.includes(condSize))) ||
                   (condMaterial && (desc.includes(condMaterial) || code.includes(condMaterial)));
          });

          if (hasMatch) matchedCount++;
        }

        const traceRate = totalConductors > 0 ? matchedCount / totalConductors : 0;
        checks.push({
          category: 'traceability',
          code: 'MATERIAL_TRACE_CONDUCTORS',
          description: `Conductor materials traceable to crew materials (${matchedCount}/${totalConductors})`,
          passed: traceRate >= 0.5, // At least 50% should match
        });

        if (traceRate < 0.5 && totalConductors > 0) {
          warnings.push({
            code: 'LOW_MATERIAL_TRACEABILITY',
            message: `Only ${matchedCount} of ${totalConductors} conductors match crew materials list`,
            category: 'traceability',
          });
        }
      }

      // 3. If pole replacement, verify pole material is in crew materials
      if (fdaData?.pole?.action === 'replace' || fdaData?.pole?.action === 'install') {
        const newPole = fdaData.pole?.newPole;
        if (newPole?.species || newPole?.class) {
          const poleSpec = `${newPole.class || ''} ${newPole.height || ''} ${newPole.species || ''}`.toUpperCase();
          const hasPoleInMaterials = crewMaterials.some(m => {
            const desc = (m.description || '').toUpperCase();
            return desc.includes('POLE') || desc.includes(newPole.species?.toUpperCase() || '___');
          });

          checks.push({
            category: 'traceability',
            code: 'MATERIAL_TRACE_POLE',
            description: 'New pole traceable to crew materials',
            passed: hasPoleInMaterials,
          });

          if (!hasPoleInMaterials) {
            warnings.push({
              code: 'POLE_NOT_IN_MATERIALS',
              message: `New pole (${poleSpec.trim()}) not found in crew materials list`,
              category: 'traceability',
            });
          }
        }
      }
    } else {
      // No crew materials — not necessarily an error, but note it
      checks.push({
        category: 'traceability',
        code: 'CREW_MATERIALS_PRESENT',
        description: 'Job has crew materials list for traceability',
        passed: false,
      });
    }

    // 4. Work order number traceability
    const hasWO = job.workOrderNumber || job.pmNumber;
    checks.push({
      category: 'traceability',
      code: 'WORK_ORDER_NUMBER',
      description: 'Work order / PM number present for traceability',
      passed: !!hasWO,
    });
  }

  // ==================================================================
  // VERIFICATION (V)
  // ==================================================================

  /**
   * Signatures: Required signatures are captured
   */
  _validateSignatures(submission, config, errors, _warnings, checks) {
    // EC Tag signature
    const ecTagSig = submission.stepData?.ec_tag?.signatureData;
    checks.push({
      category: 'verification',
      code: 'EC_TAG_SIGNATURE',
      description: 'EC Tag signed',
      passed: !!ecTagSig,
    });
    if (!ecTagSig && submission.completedSteps?.ec_tag) {
      errors.push({
        code: 'MISSING_EC_TAG_SIG',
        message: 'EC Tag signature required',
        category: 'verification',
      });
    }

    // CCSC signature
    if (config?.checklist?.requiresCrewLeadSignature) {
      const ccscSig = submission.stepData?.ccsc?.signatureData;
      checks.push({
        category: 'verification',
        code: 'CCSC_SIGNATURE',
        description: 'Checklist signed by crew lead',
        passed: !!ccscSig,
      });
      if (!ccscSig && submission.completedSteps?.ccsc) {
        errors.push({
          code: 'MISSING_CCSC_SIG',
          message: 'Checklist crew lead signature required',
          category: 'verification',
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
      category: 'verification',
      code: 'COMPLETION_PHOTOS',
      description: 'Completion photo(s) uploaded',
      passed: !!hasPhotos,
    });
    if (!hasPhotos) {
      warnings.push({
        code: 'NO_PHOTOS',
        message: 'Completion photos recommended for verifiability',
        category: 'verification',
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
      category: 'verification',
      code: 'GPS_LOCATION',
      description: 'GPS/address data captured',
      passed: !!hasGPS,
    });
    if (!hasGPS) {
      warnings.push({
        code: 'NO_GPS',
        message: 'GPS coordinates recommended for asset location verification',
        category: 'verification',
      });
    }
  }

  // ==================================================================
  // USABILITY (U)
  // ==================================================================

  /**
   * Usability: Can the documents be read and understood?
   */
  _validateUsability(submission, workType, _errors, warnings, checks) {
    if (!workType) return;

    const stepData = submission.stepData || {};

    // 1. Sketch usability — if sketch was marked up, check it has enough annotations
    const sketchData = stepData.sketch;
    if (sketchData && !sketchData.builtAsDesigned) {
      const totalAnnotations = (sketchData.strokeCount || 0) +
        (sketchData.lineCount || 0) +
        (sketchData.symbolCount || 0) +
        (sketchData.textCount || 0);

      // Minimum annotation check — a useful sketch typically has at least
      // a few annotations (symbols, lines, or text labels)
      const hasEnoughAnnotations = totalAnnotations >= 2;

      checks.push({
        category: 'usability',
        code: 'SKETCH_ANNOTATION_COUNT',
        description: 'Sketch has sufficient annotations for clarity',
        passed: hasEnoughAnnotations,
      });

      if (!hasEnoughAnnotations) {
        warnings.push({
          code: 'SKETCH_FEW_ANNOTATIONS',
          message: `Sketch has only ${totalAnnotations} annotation(s) — consider adding labels or symbols for clarity`,
          category: 'usability',
        });
      }

      // Text labels improve usability
      const hasTextLabels = (sketchData.textCount || 0) > 0;
      checks.push({
        category: 'usability',
        code: 'SKETCH_HAS_TEXT',
        description: 'Sketch includes text annotations for readability',
        passed: hasTextLabels,
      });
    }

    // 2. EC Tag completeness for usability — all fields filled
    const ecTagData = stepData.ec_tag;
    if (ecTagData) {
      const requiredFields = ['lanId', 'completionDate', 'completionType'];
      const filledCount = requiredFields.filter(f => !!ecTagData[f]).length;
      const allFilled = filledCount === requiredFields.length;

      checks.push({
        category: 'usability',
        code: 'EC_TAG_FIELDS_COMPLETE',
        description: 'EC Tag has all key fields filled for readability',
        passed: allFilled,
      });
    }

    // 3. CCSC has comments where applicable
    const ccscData = stepData.ccsc;
    if (ccscData?.comments) {
      checks.push({
        category: 'usability',
        code: 'CCSC_HAS_COMMENTS',
        description: 'Checklist includes clarifying comments',
        passed: true,
      });
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
        category: 'usability',
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
        category: 'accuracy',
        code: `CCSC_${sectionCode}_COMPLETE`,
        description: `${configSection.label} checklist items all addressed`,
        passed: unchecked.length === 0,
      });

      if (safetyCriticalMissing.length > 0) {
        errors.push({
          code: `CCSC_SAFETY_${sectionCode}`,
          message: `${configSection.label}: ${safetyCriticalMissing.length} safety-critical item(s) not addressed`,
          category: 'accuracy',
        });
      } else if (unchecked.length > 0) {
        warnings.push({
          code: `CCSC_INCOMPLETE_${sectionCode}`,
          message: `${configSection.label}: ${unchecked.length} item(s) not checked`,
          category: 'accuracy',
        });
      }
    }
  }

  // ==================================================================
  // CONFIG-DRIVEN RULES
  // ==================================================================

  /**
   * Run config-defined validation rules
   */
  _runConfigRules(rules, submission, options, errors, warnings, checks) {
    for (const rule of rules) {
      // Skip rules already covered by specific validators above
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

  // ==================================================================
  // SCORING
  // ==================================================================

  /**
   * Calculate scores for each UTVAC dimension based on checks
   */
  _calculateDimensionScores(checks, _config) {
    const dims = {
      usability:     { score: 0, total: 0, passed: 0, checks: [], passing: true, threshold: 0 },
      traceability:  { score: 0, total: 0, passed: 0, checks: [], passing: true, threshold: 0 },
      verification:  { score: 0, total: 0, passed: 0, checks: [], passing: true, threshold: 0 },
      accuracy:      { score: 0, total: 0, passed: 0, checks: [], passing: true, threshold: 0 },
    };

    // Map check categories to UTVAC dimensions
    const categoryMap = {
      usability: 'usability',
      traceability: 'traceability',
      verification: 'verification',
      verifiable: 'verification',     // Legacy alias
      signatures: 'verification',
      accuracy: 'accuracy',
      completeness: 'accuracy',
      config_rule: 'accuracy',         // Config rules default to accuracy
    };

    for (const check of checks) {
      const dim = categoryMap[check.category] || 'accuracy';
      if (!dims[dim]) continue;

      dims[dim].total++;
      dims[dim].checks.push(check);
      if (check.passed) dims[dim].passed++;
    }

    // Calculate percentage score per dimension
    for (const dim of Object.values(dims)) {
      dim.score = dim.total > 0 ? Math.round((dim.passed / dim.total) * 100) : 100;
    }

    return dims;
  }

  /**
   * Return empty dimension scores (used when config is missing)
   */
  _emptyDimensions() {
    return {
      usability:    { score: 0, total: 0, passed: 0, checks: [], passing: false, threshold: 0 },
      traceability: { score: 0, total: 0, passed: 0, checks: [], passing: false, threshold: 0 },
      verification: { score: 0, total: 0, passed: 0, checks: [], passing: false, threshold: 0 },
      accuracy:     { score: 0, total: 0, passed: 0, checks: [], passing: false, threshold: 0 },
    };
  }

  // ==================================================================
  // HELPERS
  // ==================================================================

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
