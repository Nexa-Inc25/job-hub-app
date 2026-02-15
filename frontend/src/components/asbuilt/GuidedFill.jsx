/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * GuidedFill - Field-by-field as-built section completion.
 *
 * Replaces "scroll through 30 pages and figure it out" with:
 *  1. Show only the relevant section pages (not the whole PDF)
 *  2. Walk through each field one at a time
 *  3. Pre-fill auto-fillable values with one-tap accept
 *  4. Zoomed view of the PDF area where the field lives
 *  5. Progress dots showing how many fields are done
 *
 * Designed for non-technical foremen on mobile devices in the field.
 *
 * @module components/asbuilt/GuidedFill
 */

import React, { useState, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  Box, Typography, Button, TextField, Paper, Alert, Chip,
  LinearProgress, Select, MenuItem, FormControl,
  InputLabel,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EditIcon from '@mui/icons-material/Edit';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import SaveIcon from '@mui/icons-material/Save';

/**
 * Resolve a dot-path value from context data (mirrors backend resolveValue).
 */
function resolveAutoFill(dotPath, context) {
  if (!dotPath || !context) return null;
  if (dotPath === 'today') {
    return new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  }
  const parts = dotPath.split('.');
  let current = context;
  for (const part of parts) {
    if (current == null) return null;
    current = current[part];
  }
  return current ?? null;
}

const GuidedFill = ({
  sectionType,
  sectionLabel,
  fields = [],
  context = {},
  onComplete,
  onBack,
}) => {
  const [currentFieldIdx, setCurrentFieldIdx] = useState(0);
  const [values, setValues] = useState(() => {
    const initial = {};
    for (const field of fields) {
      if (field.autoFillFrom) {
        const resolved = resolveAutoFill(field.autoFillFrom, context);
        if (resolved != null) initial[field.fieldName] = String(resolved);
      }
    }
    return initial;
  });
  const [editing, setEditing] = useState(null);
  const [confirmed, setConfirmed] = useState({});

  // Only show positionable fields (skip signatures for now — handled separately)
  const visibleFields = useMemo(() =>
    fields.filter(f => f.type !== 'signature'),
    [fields]
  );

  const currentField = visibleFields[currentFieldIdx];
  const isLastField = currentFieldIdx >= visibleFields.length - 1;
  const isFirstField = currentFieldIdx === 0;

  const completedCount = Object.keys(confirmed).length;
  const totalCount = visibleFields.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const isAutoFilled = useCallback((field) => {
    return field.autoFillFrom && values[field.fieldName] != null;
  }, [values]);

  const handleAccept = useCallback(() => {
    if (!currentField) return;
    setConfirmed(prev => ({ ...prev, [currentField.fieldName]: true }));
    setEditing(null);
    if (!isLastField) {
      setCurrentFieldIdx(prev => prev + 1);
    }
  }, [currentField, isLastField]);

  const handleEdit = useCallback(() => {
    setEditing(currentField?.fieldName);
  }, [currentField]);

  const handleValueChange = useCallback((fieldName, value) => {
    setValues(prev => ({ ...prev, [fieldName]: value }));
  }, []);

  const handleNext = useCallback(() => {
    if (!isLastField) setCurrentFieldIdx(prev => prev + 1);
  }, [isLastField]);

  const handlePrev = useCallback(() => {
    if (!isFirstField) setCurrentFieldIdx(prev => prev - 1);
  }, [isFirstField]);

  const handleSaveAll = useCallback(() => {
    if (onComplete) {
      onComplete({
        sectionType,
        values,
        confirmed,
        completedAt: new Date().toISOString(),
      });
    }
  }, [sectionType, values, confirmed, onComplete]);

  if (!currentField) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <CheckCircleIcon color="success" sx={{ fontSize: 48, mb: 1 }} />
        <Typography variant="h6">All fields completed</Typography>
        <Button variant="contained" onClick={handleSaveAll} startIcon={<SaveIcon />} sx={{ mt: 2 }}>
          Save {sectionLabel}
        </Button>
      </Box>
    );
  }

  const fieldValue = values[currentField.fieldName] || '';
  const isAuto = isAutoFilled(currentField);
  const isEditing = editing === currentField.fieldName;
  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          {sectionLabel}
        </Typography>
        <Chip
          label={`${completedCount} / ${totalCount}`}
          color={completedCount === totalCount ? 'success' : 'default'}
          size="small"
        />
      </Box>

      {/* Progress bar */}
      <LinearProgress
        variant="determinate"
        value={progress}
        sx={{ mb: 2, height: 6, borderRadius: 3 }}
      />

      {/* Current field card */}
      <Paper elevation={2} sx={{ p: 3, mb: 2, borderRadius: 2 }}>
        {/* Field label + help text */}
        <Typography variant="h6" sx={{ mb: 0.5, fontWeight: 600 }}>
          {currentField.label}
          {currentField.required && (
            <Typography component="span" color="error" sx={{ ml: 0.5 }}>*</Typography>
          )}
        </Typography>

        {currentField.helpText && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {currentField.helpText}
          </Typography>
        )}

        {/* Auto-fill badge */}
        {isAuto && !isEditing && (
          <Alert
            severity="success"
            variant="outlined"
            sx={{ mb: 2 }}
            icon={<AutoFixHighIcon />}
            action={
              <Button size="small" onClick={handleEdit} startIcon={<EditIcon />}>
                Edit
              </Button>
            }
          >
            Auto-filled from job data
          </Alert>
        )}

        {/* Value display / edit */}
        {isEditing || !isAuto ? (
          // Editable input
          <Box sx={{ mb: 2 }}>
            {currentField.type === 'select' ? (
              <FormControl fullWidth size="medium">
                <InputLabel>{currentField.label}</InputLabel>
                <Select
                  value={fieldValue}
                  onChange={(e) => handleValueChange(currentField.fieldName, e.target.value)}
                  label={currentField.label}
                >
                  {(currentField.options || []).map(opt => (
                    <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : currentField.type === 'checkbox' ? (
              <Button
                variant={fieldValue ? 'contained' : 'outlined'}
                color={fieldValue ? 'success' : 'inherit'}
                fullWidth
                size="large"
                startIcon={fieldValue ? <CheckCircleIcon /> : null}
                onClick={() => handleValueChange(currentField.fieldName, !fieldValue)}
                sx={{ minHeight: 56 }}
              >
                {fieldValue ? 'Checked' : 'Tap to Check'}
              </Button>
            ) : (
              <TextField
                fullWidth
                value={fieldValue}
                onChange={(e) => handleValueChange(currentField.fieldName, e.target.value)}
                type={currentField.type === 'number' ? 'number' : currentField.type === 'date' ? 'date' : 'text'}
                placeholder={`Enter ${currentField.label.toLowerCase()}`}
                InputLabelProps={currentField.type === 'date' ? { shrink: true } : undefined}
                autoFocus
                size="medium"
                sx={{ '& .MuiInputBase-input': { fontSize: '1.1rem', py: 1.5 } }}
              />
            )}
          </Box>
        ) : (
          // Auto-filled value display (big, clear)
          <Paper
            variant="outlined"
            sx={{
              p: 2, mb: 2, borderRadius: 2,
              bgcolor: 'success.50',
              borderColor: 'success.main',
            }}
          >
            <Typography variant="h5" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
              {fieldValue || '—'}
            </Typography>
          </Paper>
        )}

        {/* Action buttons */}
        <Box sx={{ display: 'flex', gap: 1 }}>
          {(isAuto && !isEditing) ? (
            <Button
              variant="contained"
              color="success"
              fullWidth
              size="large"
              startIcon={<CheckCircleIcon />}
              onClick={handleAccept}
              sx={{ minHeight: 52, fontWeight: 700, fontSize: '1rem' }}
            >
              Looks Good
            </Button>
          ) : (
            <Button
              variant="contained"
              fullWidth
              size="large"
              onClick={handleAccept}
              disabled={currentField.required && !fieldValue}
              sx={{ minHeight: 52, fontWeight: 700, fontSize: '1rem' }}
            >
              {isLastField ? 'Finish' : 'Next'}
            </Button>
          )}
        </Box>
      </Paper>

      {/* Field progress dots */}
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5, mb: 2 }}>
        {visibleFields.map((f, idx) => (
          <Box
            key={f.fieldName}
            onClick={() => setCurrentFieldIdx(idx)}
            sx={{
              width: 10, height: 10, borderRadius: '50%', cursor: 'pointer',
              bgcolor: confirmed[f.fieldName]
                ? 'success.main'
                : idx === currentFieldIdx
                  ? 'primary.main'
                  : 'grey.300',
              transition: 'all 0.2s',
            }}
          />
        ))}
      </Box>

      {/* Navigation */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={isFirstField ? onBack : handlePrev}
          sx={{ minWidth: 100 }}
        >
          {isFirstField ? 'Back' : 'Previous'}
        </Button>

        {isLastField && completedCount >= totalCount - 1 ? (
          <Button
            variant="contained"
            color="primary"
            startIcon={<SaveIcon />}
            onClick={handleSaveAll}
            sx={{ minWidth: 140 }}
          >
            Save Section
          </Button>
        ) : (
          <Button
            endIcon={<ArrowForwardIcon />}
            onClick={handleNext}
            disabled={isLastField}
            sx={{ minWidth: 100 }}
          >
            Skip
          </Button>
        )}
      </Box>
    </Box>
  );
};

GuidedFill.propTypes = {
  sectionType: PropTypes.string.isRequired,
  sectionLabel: PropTypes.string.isRequired,
  fields: PropTypes.arrayOf(PropTypes.shape({
    fieldName: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    type: PropTypes.string,
    required: PropTypes.bool,
    autoFillFrom: PropTypes.string,
    options: PropTypes.array,
    helpText: PropTypes.string,
  })).isRequired,
  context: PropTypes.object,
  onComplete: PropTypes.func.isRequired,
  onBack: PropTypes.func,
};

export default GuidedFill;
