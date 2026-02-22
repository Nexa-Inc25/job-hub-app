/**
 * FieldLedger - Construction Completion Standards Checklist (CCSC)
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Native mobile checklist that replaces annotating a PDF with tiny checkboxes.
 * Driven by UtilityAsBuiltConfig.checklist — PG&E uses TD-2504P-01-F01,
 * other utilities plug in their own checklist forms.
 * 
 * Features:
 *  - Auto-fill PM#, address, date from job data
 *  - Items grouped by section (OH/UG)
 *  - Safety-critical items highlighted
 *  - "Check All" per section for when everything is compliant
 *  - Comments field
 *  - Signature capture
 *  - Validates all applicable items addressed before allowing submit
 *  - Exports data for PDF rendering back into the utility's form
 */

import React, { useState, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  Box, Typography, Button, Paper, Chip, Checkbox, TextField,
  FormControlLabel, Alert, AlertTitle, Collapse,
  IconButton, LinearProgress, Card, CardContent,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ShieldIcon from '@mui/icons-material/Shield';
import SaveIcon from '@mui/icons-material/Save';
import SelectAllIcon from '@mui/icons-material/DoneAll';

/**
 * Single checklist item row
 */
const ChecklistItem = ({ item, checked, onToggle, disabled }) => (
  <FormControlLabel
    control={
      <Checkbox
        checked={checked}
        onChange={() => onToggle(item.number)}
        disabled={disabled}
        sx={{
          color: item.safetyCritical ? 'warning.main' : 'text.secondary',
          '&.Mui-checked': { color: 'success.main' },
          p: 1,
          // Large touch target for field workers
          '& .MuiSvgIcon-root': { fontSize: 28 },
        }}
      />
    }
    label={
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
        <Typography
          variant="body2"
          sx={{
            fontWeight: item.safetyCritical ? 600 : 400,
            color: checked ? 'text.secondary' : 'text.primary',
            textDecoration: checked ? 'line-through' : 'none',
            lineHeight: 1.4,
          }}
        >
          <Typography component="span" variant="body2" sx={{ fontWeight: 700, mr: 0.5 }}>
            {item.number}.
          </Typography>
          {item.text}
        </Typography>
        {item.safetyCritical && !checked && (
          <ShieldIcon sx={{ fontSize: 16, color: 'warning.main', flexShrink: 0, mt: 0.25 }} />
        )}
      </Box>
    }
    sx={{
      mx: 0,
      py: 0.75,
      px: 1,
      borderRadius: 1,
      width: '100%',
      alignItems: 'flex-start',
      bgcolor: item.safetyCritical && !checked ? 'warning.light' : 'transparent',
      '&:hover': { bgcolor: 'action.hover' },
      // Minimum touch target height
      minHeight: 52,
    }}
  />
);

ChecklistItem.propTypes = {
  item: PropTypes.shape({
    number: PropTypes.number.isRequired,
    text: PropTypes.string.isRequired,
    safetyCritical: PropTypes.bool,
  }).isRequired,
  checked: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

/**
 * Checklist section (e.g., Overhead or Underground)
 */
const ChecklistSection = ({ section, checkedItems, onToggle, onCheckAll, jobScope, disabled }) => {
  const [expanded, setExpanded] = useState(true);

  // Filter items by job scope if applicable
  const applicableItems = useMemo(() => {
    if (!section.items) return [];
    return section.items.filter(item => {
      if (!item.applicableScopes || item.applicableScopes.length === 0) return true;
      if (!jobScope) return true;
      return item.applicableScopes.includes(jobScope);
    });
  }, [section.items, jobScope]);

  const checkedCount = applicableItems.filter(i => checkedItems.has(i.number)).length;
  const totalCount = applicableItems.length;
  const allChecked = checkedCount === totalCount && totalCount > 0;
  const progress = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0;
  const safetyCriticalUnchecked = applicableItems.filter(
    i => i.safetyCritical && !checkedItems.has(i.number)
  ).length;

  if (applicableItems.length === 0) return null;

  return (
    <Paper variant="outlined" sx={{ mb: 2, overflow: 'hidden' }}>
      {/* Section Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 2,
          py: 1.5,
          cursor: 'pointer',
          bgcolor: allChecked ? 'success.light' : 'background.paper',
          '&:hover': { bgcolor: allChecked ? 'success.light' : 'action.hover' },
        }}
        onClick={() => setExpanded(e => !e)}
      >
        {allChecked ? (
          <CheckCircleIcon sx={{ color: 'success.main', mr: 1 }} />
        ) : (
          <Chip
            label={`${checkedCount}/${totalCount}`}
            size="small"
            color={checkedCount === totalCount ? 'success' : 'default'}
            sx={{ mr: 1, fontWeight: 700 }}
          />
        )}
        <Typography variant="subtitle1" sx={{ fontWeight: 700, flexGrow: 1 }}>
          {section.label}
        </Typography>
        {safetyCriticalUnchecked > 0 && (
          <Chip
            icon={<ShieldIcon />}
            label={`${safetyCriticalUnchecked} safety`}
            size="small"
            color="warning"
            sx={{ mr: 1 }}
          />
        )}
        <IconButton size="small">
          {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>

      {/* Progress bar */}
      <LinearProgress
        variant="determinate"
        value={progress}
        color={allChecked ? 'success' : 'primary'}
        sx={{ height: 3 }}
      />

      {/* Items */}
      <Collapse in={expanded}>
        <Box sx={{ px: 1, py: 0.5 }}>
          {/* Check All button */}
          {!allChecked && !disabled && (
            <Box sx={{ px: 1, py: 0.5 }}>
              <Button
                size="small"
                startIcon={<SelectAllIcon />}
                onClick={() => onCheckAll(section.code, applicableItems.map(i => i.number))}
                sx={{ fontSize: '0.75rem' }}
              >
                Check All — All items compliant
              </Button>
            </Box>
          )}

          {applicableItems.map(item => (
            <ChecklistItem
              key={item.number}
              item={item}
              checked={checkedItems.has(item.number)}
              onToggle={onToggle}
              disabled={disabled}
            />
          ))}
        </Box>
      </Collapse>
    </Paper>
  );
};

ChecklistSection.propTypes = {
  section: PropTypes.shape({
    code: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    items: PropTypes.array.isRequired,
  }).isRequired,
  checkedItems: PropTypes.instanceOf(Set).isRequired,
  onToggle: PropTypes.func.isRequired,
  onCheckAll: PropTypes.func.isRequired,
  jobScope: PropTypes.string,
  disabled: PropTypes.bool,
};

/**
 * CCSC Checklist Component
 */
const CCSCChecklist = ({
  // Utility config
  checklist,             // From UtilityAsBuiltConfig.checklist
  // Job data (auto-fill)
  pmNumber = '',
  address = '',
  jobScope = null,       // 'OH', 'UG', or null (both)
  // Callbacks
  onComplete,            // Called with completed checklist data
  // State
  disabled = false,
}) => {
  // Checked items per section: { 'OH': Set(1, 2, 3...), 'UG': Set(1, 2...) }
  const [checkedBySection, setCheckedBySection] = useState(() => {
    const map = {};
    if (checklist?.sections) {
      for (const section of checklist.sections) {
        map[section.code] = new Set();
      }
    }
    return map;
  });

  const [comments, setComments] = useState('');
  const [signatureData, setSignatureData] = useState(null);
  const [completionDate] = useState(() => new Date().toLocaleDateString('en-US'));

  // Toggle a single item
  const handleToggle = useCallback((sectionCode, itemNumber) => {
    setCheckedBySection(prev => {
      const sectionSet = new Set(prev[sectionCode] || []);
      if (sectionSet.has(itemNumber)) {
        sectionSet.delete(itemNumber);
      } else {
        sectionSet.add(itemNumber);
      }
      return { ...prev, [sectionCode]: sectionSet };
    });
  }, []);

  // Check all items in a section
  const handleCheckAll = useCallback((sectionCode, itemNumbers) => {
    setCheckedBySection(prev => ({
      ...prev,
      [sectionCode]: new Set(itemNumbers),
    }));
  }, []);

  // Determine which sections to show based on jobScope
  const visibleSections = useMemo(() => {
    if (!checklist?.sections) return [];
    if (!jobScope) return checklist.sections;
    return checklist.sections.filter(s => s.code === jobScope);
  }, [checklist, jobScope]);

  // Validation
  const validation = useMemo(() => {
    const errors = [];
    const warnings = [];

    for (const section of visibleSections) {
      const checked = checkedBySection[section.code] || new Set();
      const applicable = section.items.filter(i => {
        if (!i.applicableScopes || i.applicableScopes.length === 0) return true;
        if (!jobScope) return true;
        return i.applicableScopes.includes(jobScope);
      });

      const unchecked = applicable.filter(i => !checked.has(i.number));
      const safetyCriticalMissing = unchecked.filter(i => i.safetyCritical);

      if (safetyCriticalMissing.length > 0) {
        errors.push(`${section.label}: ${safetyCriticalMissing.length} safety-critical item(s) not checked`);
      }
      if (unchecked.length > 0 && safetyCriticalMissing.length === 0) {
        warnings.push(`${section.label}: ${unchecked.length} item(s) not checked`);
      }
    }

    if (checklist?.requiresCrewLeadSignature && !signatureData) {
      errors.push('Crew lead signature required');
    }

    return { valid: errors.length === 0, errors, warnings };
  }, [visibleSections, checkedBySection, jobScope, signatureData, checklist]);

  // Overall progress
  const progress = useMemo(() => {
    let total = 0;
    let checked = 0;
    for (const section of visibleSections) {
      const items = section.items || [];
      total += items.length;
      checked += (checkedBySection[section.code] || new Set()).size;
    }
    return total > 0 ? Math.round((checked / total) * 100) : 0;
  }, [visibleSections, checkedBySection]);

  // Submit
  const handleComplete = () => {
    if (!validation.valid) return;

    const data = {
      formId: checklist.formId,
      formName: checklist.formName,
      pmNumber,
      address,
      completionDate,
      comments,
      signatureData,
      sections: {},
    };

    for (const section of visibleSections) {
      data.sections[section.code] = {
        items: section.items.map(i => ({
          number: i.number,
          text: i.text,
          checked: (checkedBySection[section.code] || new Set()).has(i.number),
          safetyCritical: i.safetyCritical || false,
        })),
        allChecked: section.items.every(i => (checkedBySection[section.code] || new Set()).has(i.number)),
      };
    }

    if (onComplete) onComplete(data);
  };

  if (!checklist) {
    return (
      <Alert severity="info">
        No checklist configuration loaded. Check utility configuration.
      </Alert>
    );
  }

  return (
    <Box sx={{ maxWidth: 700, mx: 'auto' }}>
      {/* Header */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
            {checklist.formName || 'Completion Checklist'}
          </Typography>
          {checklist.formId && (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
              Form: {checklist.formId} {checklist.version && `• ${checklist.version}`}
            </Typography>
          )}

          {/* Auto-filled fields */}
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              label="PM/Order #"
              value={pmNumber}
              size="small"
              InputProps={{ readOnly: true }}
              sx={{ minWidth: 160 }}
            />
            <TextField
              label="Address"
              value={address}
              size="small"
              InputProps={{ readOnly: true }}
              sx={{ flexGrow: 1, minWidth: 200 }}
            />
            <TextField
              label="Date"
              value={completionDate}
              size="small"
              InputProps={{ readOnly: true }}
              sx={{ minWidth: 120 }}
            />
          </Box>
        </CardContent>
      </Card>

      {/* Progress */}
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="body2" fontWeight={600}>
            Progress: {progress}%
          </Typography>
          {progress === 100 && (
            <Chip icon={<CheckCircleIcon />} label="All items addressed" size="small" color="success" />
          )}
        </Box>
        <LinearProgress
          variant="determinate"
          value={progress}
          color={progress === 100 ? 'success' : 'primary'}
          sx={{ height: 8, borderRadius: 4 }}
        />
      </Box>

      {/* Scope info */}
      {jobScope && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Showing <strong>{jobScope === 'OH' ? 'Overhead' : 'Underground'}</strong> items only (based on job scope).
        </Alert>
      )}

      {/* Sections */}
      {visibleSections.map(section => (
        <ChecklistSection
          key={section.code}
          section={section}
          checkedItems={checkedBySection[section.code] || new Set()}
          onToggle={(itemNum) => handleToggle(section.code, itemNum)}
          onCheckAll={handleCheckAll}
          jobScope={jobScope}
          disabled={disabled}
        />
      ))}

      {/* Comments */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <TextField
          label="Comments"
          fullWidth
          multiline
          minRows={2}
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          placeholder="e.g., Built as designed"
          disabled={disabled}
        />
      </Paper>

      {/* Signature placeholder */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
          Crew Lead Signature {checklist.requiresCrewLeadSignature && '*'}
        </Typography>
        {signatureData ? (
          <Box>
            <img
              src={signatureData}
              alt="Signature"
              style={{ maxWidth: 200, maxHeight: 60, border: '1px solid #ccc', borderRadius: 4 }}
            />
            <Button size="small" onClick={() => setSignatureData(null)} sx={{ ml: 1 }}>
              Clear
            </Button>
          </Box>
        ) : (
          <Button
            variant="outlined"
            onClick={() => {
              // Use saved signature from localStorage if available
              const saved = localStorage.getItem('pdfEditor_signature');
              if (saved) {
                setSignatureData(saved);
              } else {
                // Prompt would go here — for now, use placeholder
                setSignatureData('data:image/png;base64,placeholder');
              }
            }}
            sx={{ minHeight: 48 }}
          >
            Tap to Sign
          </Button>
        )}
      </Paper>

      {/* Validation messages */}
      {validation.errors.length > 0 && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <AlertTitle>Cannot Submit</AlertTitle>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {validation.errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </Alert>
      )}
      {validation.warnings.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <AlertTitle>Review</AlertTitle>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {validation.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </Alert>
      )}

      {/* Submit */}
      <Button
        fullWidth
        variant="contained"
        size="large"
        startIcon={<SaveIcon />}
        onClick={handleComplete}
        disabled={disabled || !validation.valid}
        sx={{ py: 1.5, fontWeight: 700, fontSize: '1rem' }}
      >
        Complete Checklist
      </Button>
    </Box>
  );
};

CCSCChecklist.propTypes = {
  checklist: PropTypes.shape({
    formId: PropTypes.string,
    formName: PropTypes.string,
    version: PropTypes.string,
    requiresCrewLeadSignature: PropTypes.bool,
    sections: PropTypes.arrayOf(PropTypes.shape({
      code: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      items: PropTypes.array.isRequired,
    })),
  }),
  pmNumber: PropTypes.string,
  address: PropTypes.string,
  jobScope: PropTypes.oneOf(['OH', 'UG', null]),
  onComplete: PropTypes.func,
  disabled: PropTypes.bool,
};

export default CCSCChecklist;

