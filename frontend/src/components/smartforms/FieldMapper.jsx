/**
 * FieldMapper - Visual field mapping interface for SmartForms
 * Includes field edit dialog and field overlay rendering.
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 */

import React from 'react';
import PropTypes from 'prop-types';
import {
  Box, Button, IconButton, TextField, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Chip, Autocomplete,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import LinkIcon from '@mui/icons-material/Link';

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'date', label: 'Date' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'number', label: 'Number' },
];

/**
 * Convert a field to its screen overlay representation
 */
function fieldToOverlay(field, pdfToScreenCoords, pageElement) {
  if (!field?.bounds) return null;
  const { x, y, width, height } = field.bounds;
  if (width <= 0 || height <= 0) return null;
  const screenPos = pdfToScreenCoords(x, y, width, height, pageElement);
  if (screenPos.width <= 0 || screenPos.height <= 0) return null;
  return { field, screenPos };
}

/**
 * FieldOverlay - Renders a single field overlay on the PDF
 */
export function FieldOverlay({ field, screenPos, isSelected, hasMapping, onSelect, onEdit, onDelete }) {
  return (
    <Box
      sx={{
        position: 'absolute', left: screenPos.left, top: screenPos.top,
        width: screenPos.width, height: screenPos.height,
        border: isSelected ? '3px solid #1976d2' : '2px solid #4caf50',
        bgcolor: isSelected ? 'rgba(25, 118, 210, 0.2)' : 'rgba(76, 175, 80, 0.15)',
        cursor: 'pointer', '&:hover': { bgcolor: 'rgba(25, 118, 210, 0.3)' },
      }}
      onClick={(e) => { e.stopPropagation(); onSelect(field.id); }}
    >
      <Chip size="small" label={field.name} color={hasMapping ? 'success' : 'default'}
        icon={hasMapping ? <LinkIcon /> : undefined}
        sx={{ position: 'absolute', top: -12, left: 0, height: 20, fontSize: 10 }} />
      {isSelected && (
        <Box sx={{ position: 'absolute', top: -12, right: 0, display: 'flex', gap: 0.5 }}>
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); onEdit(field); }}
            sx={{ bgcolor: 'white', width: 24, height: 24 }}><EditIcon sx={{ fontSize: 14 }} /></IconButton>
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); onDelete(field.id); }}
            sx={{ bgcolor: 'white', width: 24, height: 24 }} color="error"><DeleteIcon sx={{ fontSize: 14 }} /></IconButton>
        </Box>
      )}
    </Box>
  );
}

FieldOverlay.propTypes = {
  field: PropTypes.shape({ id: PropTypes.string.isRequired, name: PropTypes.string.isRequired }).isRequired,
  screenPos: PropTypes.shape({ left: PropTypes.number, top: PropTypes.number, width: PropTypes.number, height: PropTypes.number }).isRequired,
  isSelected: PropTypes.bool.isRequired,
  hasMapping: PropTypes.bool.isRequired,
  onSelect: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};

/**
 * FieldEditDialog - Dialog for editing a field's properties and mapping
 */
export function FieldEditDialog({ open, field, dataPaths, mappings, onFieldChange, onMappingsChange, onDelete, onClose, onSave }) {
  if (!field) return null;
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Field</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField label="Field Name" value={field.name} onChange={e => onFieldChange({ ...field, name: e.target.value })} fullWidth helperText="Used for data mapping (no spaces)" />
          <TextField label="Label" value={field.label || ''} onChange={e => onFieldChange({ ...field, label: e.target.value })} fullWidth helperText="Display label (optional)" />
          <TextField select label="Field Type" value={field.type} onChange={e => onFieldChange({ ...field, type: e.target.value })} fullWidth>
            {FIELD_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
          </TextField>
          <TextField label="Font Size" type="number" value={field.fontSize} onChange={e => onFieldChange({ ...field, fontSize: Number.parseInt(e.target.value, 10) || 10 })} fullWidth inputProps={{ min: 6, max: 48 }} />
          {field.type === 'date' && (
            <TextField label="Date Format" value={field.dateFormat || 'MM/DD/YYYY'} onChange={e => onFieldChange({ ...field, dateFormat: e.target.value })} fullWidth helperText="e.g., MM/DD/YYYY, YYYY-MM-DD" />
          )}
          <TextField label="Default Value" value={field.defaultValue || ''} onChange={e => onFieldChange({ ...field, defaultValue: e.target.value })} fullWidth />
          <Autocomplete
            options={dataPaths} getOptionLabel={opt => `${opt.label} (${opt.path})`} groupBy={opt => opt.category}
            value={dataPaths.find(p => p.path === mappings[field.name]) || null}
            onChange={(e, newValue) => onMappingsChange({ ...mappings, [field.name]: newValue?.path || '' })}
            renderInput={params => <TextField {...params} label="Map to Data Field" helperText="Select which FieldLedger data to fill here" />}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button color="error" onClick={() => { onDelete(field.id); onClose(); }}>Delete Field</Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={onSave}>Save Field</Button>
      </DialogActions>
    </Dialog>
  );
}

FieldEditDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  field: PropTypes.object,
  dataPaths: PropTypes.array.isRequired,
  mappings: PropTypes.object.isRequired,
  onFieldChange: PropTypes.func.isRequired,
  onMappingsChange: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
};

/**
 * Render all field overlays for a given page
 */
export function renderFieldOverlays(fields, currentPage, pdfToScreenCoords, pageElement, selectedField, mappings, onSelect, onEdit, onDelete) {
  if (!pageElement) return null;
  return fields
    .filter(f => f.page === currentPage)
    .map(field => {
      const overlay = fieldToOverlay(field, pdfToScreenCoords, pageElement);
      if (!overlay) return null;
      return (
        <FieldOverlay
          key={field.id} field={overlay.field} screenPos={overlay.screenPos}
          isSelected={selectedField === field.id} hasMapping={!!mappings[field.name]}
          onSelect={onSelect} onEdit={onEdit} onDelete={onDelete}
        />
      );
    });
}

export { FIELD_TYPES, fieldToOverlay };
