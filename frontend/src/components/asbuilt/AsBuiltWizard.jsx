/**
 * FieldLedger - As-Built Wizard
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Step-by-step guided flow for completing an as-built package.
 * Replaces "here's a PDF, figure it out" with a guided process
 * that auto-fills everything possible and validates before submission.
 * 
 * Driven entirely by UtilityAsBuiltConfig — the wizard doesn't know
 * PG&E from SCE. The config tells it what docs are needed, what
 * fields to auto-fill, what to validate.
 * 
 * Steps:
 *  1. Work Type → determines required documents
 *  2. EC Tag Completion → auto-filled, foreman confirms + signs
 *  3. Construction Sketch → SketchMarkupEditor or "Built As Designed"
 *  4. Completion Checklist → native CCSC or equivalent
 *  5. Review & Submit → UTVAC validation gate
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  Box, Typography, Button, Paper, Stepper, Step, StepLabel, StepContent,
  Alert, AlertTitle, Chip, Card, CardContent,
  CircularProgress, Divider, List, ListItem, ListItemIcon, ListItemText,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SendIcon from '@mui/icons-material/Send';
import EditIcon from '@mui/icons-material/Edit';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';

import ECTagCompletion from './ECTagCompletion';
import CCSCChecklist from './CCSCChecklist';
import FDAAttributeForm from './FDAAttributeForm';

// Lazy-load PDF editor — only needed when foreman opens a form page
const PDFFormEditor = React.lazy(() => import('../PDFFormEditor'));

/**
 * Detect which equipment types are in scope based on job/EC tag data.
 * Used to show only relevant FDA attribute sections.
 */
function detectEquipmentInScope(job) {
  const scope = ['pole']; // Pole is almost always relevant
  
  if (!job) return scope;
  
  const desc = (job.description || '').toLowerCase() + ' ' + (job.ecTagItemType || '').toLowerCase();
  
  if (desc.includes('xfmr') || desc.includes('transformer') || desc.includes('trans')) {
    scope.push('transformer');
  }
  if (desc.includes('conductor') || desc.includes('reconductor') || desc.includes('wire') || desc.includes('cable')) {
    scope.push('conductor');
  }
  if (desc.includes('switch') || desc.includes('fuse') || desc.includes('recloser') || desc.includes('sectionalizer')) {
    scope.push('switchgear');
  }
  if (desc.includes('capacitor') || desc.includes('regulator') || desc.includes('streetlight') || desc.includes('riser')) {
    scope.push('other_equipment');
  }
  
  return scope;
}

/**
 * As-Built Wizard Component
 */
const AsBuiltWizard = ({
  // Utility configuration (from UtilityAsBuiltConfig)
  utilityConfig,
  // Job data
  job,
  // User data
  user,
  // Timesheet hours (if available)
  timesheetHours = null,
  // PDF URLs
  sketchPdfUrl = null,
  // Full job package PDF URL (for extracting form pages)
  jobPackagePdfUrl = null,
  // Callbacks
  onComplete,         // Final submission with all collected data
  onSaveProgress: _onSaveProgress,     // Save wizard state (for resume later)
  onOpenSketchEditor, // Opens the SketchMarkupEditor for the construction sketch
  // Loading state
  loading = false,
}) => {
  const [activeStep, setActiveStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState({});
  const [stepData, setStepData] = useState({});
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);

  // ---- Determine work type and required docs ----
  const [selectedWorkType, setSelectedWorkType] = useState(null);

  const workTypes = useMemo(() => utilityConfig?.workTypes || [], [utilityConfig]);

  // Auto-detect work type from job data if possible
  useEffect(() => {
    if (selectedWorkType || workTypes.length === 0) return;
    
    // Heuristics for auto-detection
    if (job?.orderType) {
      const match = workTypes.find(wt => 
        wt.code === job.orderType || 
        wt.label.toLowerCase().includes(job.orderType.toLowerCase())
      );
      if (match) {
        setSelectedWorkType(match);
        return;
      }
    }
    
    // If job has an EC tag / notification, likely corrective
    if (job?.notificationNumber && !job?.pmNumber) {
      const ec = workTypes.find(wt => wt.code === 'ec_corrective');
      if (ec) { setSelectedWorkType(ec); return; }
    }
    
    // If job has a PM number, likely estimated
    if (job?.pmNumber) {
      const est = workTypes.find(wt => wt.code === 'estimated');
      if (est) { setSelectedWorkType(est); return; }
    }
  }, [job, workTypes, selectedWorkType]);

  // ---- Build steps based on work type ----
  const steps = useMemo(() => {
    const result = [
      { key: 'work_type', label: 'Work Type', description: 'Confirm the type of work performed' },
    ];

    if (!selectedWorkType) return result;

    const requiredDocs = selectedWorkType.requiredDocs || [];

    if (requiredDocs.includes('ec_tag')) {
      result.push({
        key: 'ec_tag',
        label: 'EC Tag Completion',
        description: 'Complete the EC tag with hours, status, and signature',
      });
    }

    // PDF page steps — foreman fills these in the PDFFormEditor
    // Pages are extracted from the job package using utility config page ranges
    if (requiredDocs.includes('face_sheet')) {
      result.push({
        key: 'face_sheet',
        label: 'Face Sheet',
        description: 'Review and sign the face sheet',
        isPdfStep: true,
        sectionType: 'face_sheet',
      });
    }

    if (requiredDocs.includes('equipment_info') || requiredDocs.includes('ec_tag')) {
      result.push({
        key: 'equipment_info',
        label: 'Equipment Info',
        description: 'Fill in old/new pole numbers, equipment serial numbers',
        isPdfStep: true,
        sectionType: 'equipment_info',
      });
    }

    if (requiredDocs.includes('construction_sketch') || selectedWorkType.requiresSketchMarkup) {
      result.push({
        key: 'sketch',
        label: 'Construction Sketch',
        description: selectedWorkType.allowBuiltAsDesigned
          ? 'Redline/blueline the sketch, or mark "Built As Designed"'
          : 'Redline/blueline the construction sketch',
      });
    }

    if (requiredDocs.includes('ccsc')) {
      result.push({
        key: 'ccsc',
        label: 'Completion Checklist',
        description: utilityConfig?.checklist?.formName || 'Complete the construction checklist',
      });
    }

    if (requiredDocs.includes('billing_form')) {
      result.push({
        key: 'billing_form',
        label: 'Billing Form',
        description: 'Complete the progress billing / project completion form',
        isPdfStep: true,
        sectionType: 'billing_form',
      });
    }

    // FDA attributes for EC corrective and estimated work (pole/conductor/transformer data)
    if (requiredDocs.includes('ec_tag') || selectedWorkType.code === 'estimated') {
      result.push({
        key: 'fda',
        label: 'Equipment Attributes',
        description: 'Record equipment details for the Asset Registry (GIS/SAP)',
      });
    }

    // Always end with review
    result.push({
      key: 'review',
      label: 'Review & Submit',
      description: 'Verify completeness and submit the as-built package',
    });

    return result;
  }, [selectedWorkType, utilityConfig]);

  // ---- Step completion handlers ----

  const markStepComplete = useCallback((stepKey, data = {}) => {
    setCompletedSteps(prev => ({ ...prev, [stepKey]: true }));
    setStepData(prev => ({ ...prev, [stepKey]: data }));
    // Auto-advance to next step
    setActiveStep(prev => Math.min(prev + 1, steps.length - 1));
  }, [steps.length]);

  const handleWorkTypeSelect = (wt) => {
    setSelectedWorkType(wt);
    markStepComplete('work_type', { workType: wt.code, workTypeLabel: wt.label });
  };

  const handleECTagComplete = (data) => {
    markStepComplete('ec_tag', data);
  };

  const handleSketchBuiltAsDesigned = () => {
    markStepComplete('sketch', { builtAsDesigned: true });
  };

  const handleCCSCComplete = (data) => {
    markStepComplete('ccsc', data);
  };

  const handleFDAComplete = (data) => {
    markStepComplete('fda', data);
  };

  // Handler for PDF form page saves (face sheet, equipment info, billing form)
  const handlePdfFormSave = useCallback(async (stepKey, base64Data, docName) => {
    markStepComplete(stepKey, {
      pdfSaved: true,
      documentName: docName,
      savedAt: new Date().toISOString(),
    });
  }, [markStepComplete]);

  // getPageRangeLabel kept for future use when page classification is wired in
  // const getPageRangeLabel = (sectionType) => { ... };

  // ---- Validation for final review ----
  const reviewValidation = useMemo(() => {
    const errors = [];
    const warnings = [];

    if (!completedSteps.work_type) errors.push('Work type not selected');

    const requiredDocs = selectedWorkType?.requiredDocs || [];

    if (requiredDocs.includes('ec_tag') && !completedSteps.ec_tag) {
      errors.push('EC Tag completion required');
    }
    if ((requiredDocs.includes('construction_sketch') || selectedWorkType?.requiresSketchMarkup) && !completedSteps.sketch) {
      errors.push('Construction sketch markup required');
    }
    if (requiredDocs.includes('ccsc') && !completedSteps.ccsc) {
      errors.push('Completion checklist required');
    }

    // Check utility validation rules
    if (utilityConfig?.validationRules) {
      for (const rule of utilityConfig.validationRules) {
        if (rule.rule === 'required_unless' && rule.target === 'sketch_markup') {
          if (!completedSteps.sketch && !stepData.sketch?.builtAsDesigned) {
            if (rule.severity === 'error') errors.push(rule.description);
            else warnings.push(rule.description);
          }
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }, [completedSteps, selectedWorkType, stepData, utilityConfig]);

  // ---- Final submission ----
  const handleFinalSubmit = () => {
    if (!reviewValidation.valid) return;

    const submission = {
      utilityCode: utilityConfig?.utilityCode,
      workType: selectedWorkType?.code,
      jobId: job?._id,
      pmNumber: job?.pmNumber,
      notificationNumber: job?.notificationNumber,
      stepData,
      completedSteps,
      submittedAt: new Date().toISOString(),
      submittedBy: user?._id,
    };

    setSubmitDialogOpen(false);
    if (onComplete) onComplete(submission);
  };

  // ---- Render step content ----
  const renderStepContent = (step) => {
    switch (step.key) {
      case 'work_type':
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {workTypes.map(wt => (
              <Card
                key={wt.code}
                variant="outlined"
                sx={{
                  cursor: 'pointer',
                  border: selectedWorkType?.code === wt.code ? '2px solid' : '1px solid',
                  borderColor: selectedWorkType?.code === wt.code ? 'primary.main' : 'divider',
                  '&:hover': { borderColor: 'primary.light' },
                }}
                onClick={() => handleWorkTypeSelect(wt)}
              >
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Typography variant="subtitle2" fontWeight={700}>{wt.label}</Typography>
                  {wt.description && (
                    <Typography variant="caption" color="text.secondary">{wt.description}</Typography>
                  )}
                  <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                    {wt.requiredDocs?.map(doc => (
                      <Chip key={doc} label={doc.replaceAll('_', ' ')} size="small" variant="outlined" sx={{ fontSize: '0.65rem' }} />
                    ))}
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        );

      case 'ec_tag':
        return (
          <ECTagCompletion
            fields={utilityConfig?.documentCompletions?.find(dc => dc.sectionType === 'ec_tag')?.fields || []}
            jobData={job || {}}
            userData={user || {}}
            timesheetHours={timesheetHours}
            onComplete={handleECTagComplete}
          />
        );

      // Generic PDF form steps (face sheet, equipment info, billing form)
      case 'face_sheet':
      case 'equipment_info':
      case 'billing_form':
        return (
          <Box>
            {/* Auto-fill info banner */}
            <Alert severity="success" sx={{ mb: 1 }}>
              <strong>Auto-filled:</strong> PM# {job?.pmNumber || '—'} | {job?.address || '—'} | {new Date().toLocaleDateString()} | {user?.name || user?.email || '—'}
            </Alert>
            {jobPackagePdfUrl ? (
              <Box sx={{ minHeight: 500 }}>
                <Alert severity="info" sx={{ mb: 1 }} variant="outlined">
                  <strong>{step.label}</strong> — Scroll to find this form in the job package.
                  Use the toolbar tools to fill in fields, check boxes, and sign. Tap <strong>Save</strong> when done.
                </Alert>
                <React.Suspense fallback={<CircularProgress />}>
                  <PDFFormEditor
                    pdfUrl={jobPackagePdfUrl}
                    jobInfo={{
                      pmNumber: job?.pmNumber,
                      woNumber: job?.woNumber,
                      notificationNumber: job?.notificationNumber,
                      address: job?.address,
                      city: job?.city,
                      userName: user?.name,
                      userEmail: user?.email,
                      userLanId: user?.lanId || user?.username || (user?.email ? user.email.split('@')[0] : ''),
                    }}
                    documentName={step.label}
                    onSave={(base64, name) => handlePdfFormSave(step.key, base64, name)}
                  />
                </React.Suspense>
              </Box>
            ) : (
              <Alert severity="warning">
                No job package PDF found. Upload the job package from the Job File System first,
                then return to the wizard.
              </Alert>
            )}
            {completedSteps[step.key] && (
              <Alert severity="success" sx={{ mt: 2 }}>
                {step.label} saved.
              </Alert>
            )}
          </Box>
        );

      case 'sketch':
        return (
          <Box>
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              {sketchPdfUrl && (
                <Button
                  variant="contained"
                  startIcon={<EditIcon />}
                  onClick={() => {
                    if (onOpenSketchEditor) onOpenSketchEditor();
                  }}
                  sx={{ flex: 1, py: 1.5, fontWeight: 700 }}
                >
                  Open Sketch Markup Editor
                </Button>
              )}
              {selectedWorkType?.allowBuiltAsDesigned && (
                <Button
                  variant="outlined"
                  color="success"
                  startIcon={<CheckCircleIcon />}
                  onClick={handleSketchBuiltAsDesigned}
                  sx={{ flex: 1, py: 1.5, fontWeight: 700 }}
                >
                  Built As Designed
                </Button>
              )}
            </Box>
            {!sketchPdfUrl && (
              <Alert severity="info">
                No construction sketch PDF found in the job package. If this job has a sketch,
                upload it first from the Job File System.
              </Alert>
            )}
            {completedSteps.sketch && (
              <Alert severity="success" icon={<CheckCircleIcon />}>
                {stepData.sketch?.builtAsDesigned
                  ? 'Marked as "Built As Designed" — no redlines needed.'
                  : `Sketch markup saved (${stepData.sketch?.strokeCount || 0} strokes, ${stepData.sketch?.lineCount || 0} lines, ${stepData.sketch?.symbolCount || 0} symbols)`
                }
              </Alert>
            )}
          </Box>
        );

      case 'ccsc':
        return (
          <CCSCChecklist
            checklist={utilityConfig?.checklist}
            pmNumber={job?.pmNumber || ''}
            address={job?.address || ''}
            jobScope={job?.jobScope || null}
            onComplete={handleCCSCComplete}
          />
        );

      case 'fda':
        return (
          <FDAAttributeForm
            jobData={job || {}}
            equipmentInScope={detectEquipmentInScope(job)}
            onComplete={handleFDAComplete}
          />
        );

      case 'review':
        return (
          <Box>
            {/* Step summary */}
            <List>
              {steps.slice(0, -1).map(s => {
                const done = completedSteps[s.key];
                return (
                  <ListItem key={s.key} sx={{ py: 0.5 }}>
                    <ListItemIcon>
                      {done
                        ? <CheckCircleIcon color="success" />
                        : <RadioButtonUncheckedIcon color="disabled" />
                      }
                    </ListItemIcon>
                    <ListItemText
                      primary={s.label}
                      secondary={done ? 'Completed' : 'Not completed'}
                      primaryTypographyProps={{ fontWeight: done ? 400 : 600 }}
                    />
                    {!done && (
                      <Button size="small" onClick={() => setActiveStep(steps.indexOf(s))}>
                        Go to step
                      </Button>
                    )}
                  </ListItem>
                );
              })}
            </List>

            <Divider sx={{ my: 2 }} />

            {/* Validation */}
            {reviewValidation.errors.length > 0 && (
              <Alert severity="error" sx={{ mb: 2 }} icon={<ErrorIcon />}>
                <AlertTitle>Cannot Submit</AlertTitle>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {reviewValidation.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </Alert>
            )}
            {reviewValidation.warnings.length > 0 && (
              <Alert severity="warning" sx={{ mb: 2 }} icon={<WarningIcon />}>
                <AlertTitle>Review</AlertTitle>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {reviewValidation.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </Alert>
            )}
            {reviewValidation.valid && reviewValidation.warnings.length === 0 && (
              <Alert severity="success" sx={{ mb: 2 }}>
                All required steps completed. Ready to submit.
              </Alert>
            )}

            {/* Submit button */}
            <Button
              fullWidth
              variant="contained"
              color="primary"
              size="large"
              startIcon={<SendIcon />}
              onClick={() => setSubmitDialogOpen(true)}
              disabled={!reviewValidation.valid || loading}
              sx={{ py: 1.5, fontWeight: 700, fontSize: '1rem' }}
            >
              Submit As-Built Package
            </Button>
          </Box>
        );

      default:
        return <Typography color="text.secondary">Step not configured.</Typography>;
    }
  };

  // ---- Loading state ----
  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 8, gap: 2 }}>
        <CircularProgress size={32} />
        <Typography>Loading utility configuration...</Typography>
      </Box>
    );
  }

  if (!utilityConfig) {
    return (
      <Alert severity="warning">
        <AlertTitle>No Utility Configuration</AlertTitle>
        As-Built configuration not found for this job&apos;s utility.
        Contact your administrator to set up the utility configuration.
      </Alert>
    );
  }

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', px: 2, py: 2 }}>
      {/* Header */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <AssignmentTurnedInIcon color="primary" />
          <Typography variant="h6" fontWeight={700}>As-Built Package</Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          {utilityConfig.utilityName} • {utilityConfig.procedureId} {utilityConfig.procedureVersion}
        </Typography>
        {job?.pmNumber && (
          <Chip label={`PM# ${job.pmNumber}`} size="small" sx={{ mt: 1 }} />
        )}
      </Paper>

      {/* Stepper */}
      <Stepper activeStep={activeStep} orientation="vertical">
        {steps.map((step, index) => (
          <Step key={step.key} completed={completedSteps[step.key]}>
            <StepLabel
              optional={
                <Typography variant="caption" color="text.secondary">
                  {step.description}
                </Typography>
              }
              sx={{ cursor: 'pointer' }}
              onClick={() => setActiveStep(index)}
            >
              <Typography fontWeight={activeStep === index ? 700 : 400}>
                {step.label}
              </Typography>
            </StepLabel>
            <StepContent
              TransitionProps={{ unmountOnExit: true }}
            >
              <Box sx={{ py: 1 }}>
                {activeStep === index ? renderStepContent(step) : null}
              </Box>

              {/* Navigation (except for steps with their own submit buttons) */}
              {step.key !== 'review' && step.key !== 'ec_tag' && step.key !== 'ccsc' && step.key !== 'work_type' && (
                <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                  <Button
                    disabled={index === 0}
                    onClick={() => setActiveStep(index - 1)}
                    startIcon={<ArrowBackIcon />}
                  >
                    Back
                  </Button>
                  {completedSteps[step.key] && (
                    <Button
                      variant="contained"
                      onClick={() => setActiveStep(index + 1)}
                      endIcon={<ArrowForwardIcon />}
                    >
                      Next
                    </Button>
                  )}
                </Box>
              )}
            </StepContent>
          </Step>
        ))}
      </Stepper>

      {/* Submit Confirmation Dialog */}
      <Dialog open={submitDialogOpen} onClose={() => setSubmitDialogOpen(false)}>
        <DialogTitle>Submit As-Built Package?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            This will submit the as-built package for <strong>{job?.pmNumber}</strong> to
            your supervisor for review, then to Clerical for processing.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Make sure all markups are accurate and all required documents are complete.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSubmitDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleFinalSubmit} startIcon={<SendIcon />}>
            Submit
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

AsBuiltWizard.propTypes = {
  utilityConfig: PropTypes.shape({
    utilityCode: PropTypes.string,
    utilityName: PropTypes.string,
    procedureId: PropTypes.string,
    procedureVersion: PropTypes.string,
    workTypes: PropTypes.array,
    checklist: PropTypes.object,
    documentCompletions: PropTypes.array,
    validationRules: PropTypes.array,
    colorConventions: PropTypes.array,
    symbolLibrary: PropTypes.object,
    pageRanges: PropTypes.array,
  }),
  job: PropTypes.object,
  user: PropTypes.object,
  timesheetHours: PropTypes.number,
  jobPackagePdfUrl: PropTypes.string,
  sketchPdfUrl: PropTypes.string,
  onComplete: PropTypes.func,
  onSaveProgress: PropTypes.func,
  onOpenSketchEditor: PropTypes.func,
  loading: PropTypes.bool,
};

export default AsBuiltWizard;

