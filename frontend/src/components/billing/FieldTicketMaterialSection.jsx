/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Field Ticket Material Section
 *
 * Extracted from FieldTicketForm.jsx to reduce file size.
 * Renders the material accordion with material entry rows and add/remove controls.
 *
 * @module components/billing/FieldTicketMaterialSection
 */

import React from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Typography,
  Button,
  IconButton,
  TextField,
  Card,
  CardContent,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import InventoryIcon from '@mui/icons-material/Inventory';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useAppColors } from '../shared/themeUtils';

/**
 * Individual Material Entry Row Component
 */
const MaterialEntry = ({ entry, onChange, onRemove }) => {
  const COLORS = useAppColors();
  const base = entry.quantity * entry.unitCost;
  const markup = base * ((entry.markup || 0) / 100);
  const total = base + markup;

  return (
    <Card sx={{ mb: 2, bgcolor: COLORS.surface }}>
      <CardContent sx={{ pb: '16px !important' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <InventoryIcon sx={{ color: '#64b5f6' }} />
            <Typography variant="subtitle2" sx={{ color: COLORS.text }}>
              {entry.description || 'Material'}
            </Typography>
          </Box>
          <IconButton size="small" onClick={onRemove} sx={{ color: COLORS.error }} aria-label="Remove entry">
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            label="M-Code"
            value={entry.materialCode}
            onChange={(e) => onChange({ ...entry, materialCode: e.target.value })}
            size="small"
            placeholder="M123456"
            InputProps={{ sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text } }}
            InputLabelProps={{ sx: { color: COLORS.textSecondary } }}
            sx={{ width: 120 }}
          />
          <TextField
            label="Description"
            value={entry.description}
            onChange={(e) => onChange({ ...entry, description: e.target.value })}
            size="small"
            fullWidth
            InputProps={{ sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text } }}
            InputLabelProps={{ sx: { color: COLORS.textSecondary } }}
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            label="Qty"
            type="number"
            value={entry.quantity}
            onChange={(e) => onChange({ ...entry, quantity: Number.parseFloat(e.target.value) || 0 })}
            size="small"
            inputProps={{ min: 0 }}
            InputProps={{ sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text } }}
            InputLabelProps={{ sx: { color: COLORS.textSecondary } }}
            sx={{ width: 80 }}
          />
          <TextField
            label="Unit"
            value={entry.unit}
            onChange={(e) => onChange({ ...entry, unit: e.target.value })}
            size="small"
            placeholder="EA"
            InputProps={{ sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text } }}
            InputLabelProps={{ sx: { color: COLORS.textSecondary } }}
            sx={{ width: 80 }}
          />
          <TextField
            label="Unit Cost"
            type="number"
            value={entry.unitCost}
            onChange={(e) => onChange({ ...entry, unitCost: Number.parseFloat(e.target.value) || 0 })}
            size="small"
            inputProps={{ min: 0, step: 0.01 }}
            InputProps={{ sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text } }}
            InputLabelProps={{ sx: { color: COLORS.textSecondary } }}
          />
          <TextField
            label="Markup %"
            type="number"
            value={entry.markup}
            onChange={(e) => onChange({ ...entry, markup: Number.parseFloat(e.target.value) || 0 })}
            size="small"
            inputProps={{ min: 0 }}
            InputProps={{ sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text } }}
            InputLabelProps={{ sx: { color: COLORS.textSecondary } }}
            sx={{ width: 100 }}
          />
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Typography variant="subtitle1" sx={{ color: COLORS.primary, fontWeight: 600 }}>
            ${total.toFixed(2)}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

MaterialEntry.propTypes = {
  entry: PropTypes.shape({
    materialCode: PropTypes.string,
    description: PropTypes.string,
    quantity: PropTypes.number,
    unit: PropTypes.string,
    unitCost: PropTypes.number,
    markup: PropTypes.number,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
};

/**
 * Material Section Accordion Component
 */
const FieldTicketMaterialSection = ({ entries, onChange, expanded, onToggle, total }) => {
  const COLORS = useAppColors();

  const addEntry = () => {
    onChange([...entries, {
      id: `mat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      materialCode: '',
      description: '',
      quantity: 1,
      unit: 'EA',
      unitCost: 0,
      markup: 15,
    }]);
  };

  const updateEntry = (updated) => {
    onChange(entries.map(e => e.id === updated.id ? updated : e));
  };

  const removeEntry = (id) => {
    onChange(entries.filter(e => e.id !== id));
  };

  return (
    <Accordion
      expanded={expanded}
      onChange={onToggle}
      sx={{ bgcolor: COLORS.surface, mb: 2 }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: COLORS.text }} />}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
          <InventoryIcon sx={{ color: '#64b5f6' }} />
          <Typography sx={{ color: COLORS.text, flex: 1 }}>
            Materials ({entries.length})
          </Typography>
          <Typography sx={{ color: COLORS.primary, fontWeight: 600 }}>
            ${total.toFixed(2)}
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        {entries.map((entry) => (
          <MaterialEntry
            key={entry.id}
            entry={entry}
            onChange={updateEntry}
            onRemove={() => removeEntry(entry.id)}
          />
        ))}
        <Button
          startIcon={<AddIcon />}
          onClick={addEntry}
          fullWidth
          sx={{ color: '#64b5f6', borderColor: '#64b5f6', minHeight: 44 }}
          variant="outlined"
        >
          Add Material
        </Button>
      </AccordionDetails>
    </Accordion>
  );
};

FieldTicketMaterialSection.propTypes = {
  entries: PropTypes.array.isRequired,
  onChange: PropTypes.func.isRequired,
  expanded: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  total: PropTypes.number.isRequired,
};

export default FieldTicketMaterialSection;
