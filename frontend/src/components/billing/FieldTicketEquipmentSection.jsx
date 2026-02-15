/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Field Ticket Equipment Section
 *
 * Extracted from FieldTicketForm.jsx to reduce file size.
 * Renders the equipment accordion with asset entry rows and add/remove controls.
 *
 * @module components/billing/FieldTicketEquipmentSection
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import BuildIcon from '@mui/icons-material/Build';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useAppColors } from '../shared/themeUtils';

// Equipment type options
const EQUIPMENT_TYPES = [
  { value: 'bucket_truck', label: 'Bucket Truck', rate: 125 },
  { value: 'digger_derrick', label: 'Digger Derrick', rate: 175 },
  { value: 'crane', label: 'Crane', rate: 250 },
  { value: 'excavator', label: 'Excavator', rate: 150 },
  { value: 'backhoe', label: 'Backhoe', rate: 95 },
  { value: 'trencher', label: 'Trencher', rate: 85 },
  { value: 'dump_truck', label: 'Dump Truck', rate: 95 },
  { value: 'flatbed', label: 'Flatbed', rate: 75 },
  { value: 'trailer', label: 'Trailer', rate: 45 },
  { value: 'generator', label: 'Generator', rate: 35 },
  { value: 'compressor', label: 'Compressor', rate: 40 },
  { value: 'pump', label: 'Pump', rate: 30 },
  { value: 'welder', label: 'Welder', rate: 25 },
  { value: 'tensioner', label: 'Tensioner', rate: 150 },
  { value: 'puller', label: 'Puller', rate: 175 },
  { value: 'other', label: 'Other', rate: 50 },
];

/**
 * Individual Equipment Entry Row Component
 */
const EquipmentEntry = ({ entry, onChange, onRemove }) => {
  const COLORS = useAppColors();
  const total = (entry.hours * entry.hourlyRate) +
                (entry.standbyHours * (entry.standbyRate || entry.hourlyRate * 0.5));

  return (
    <Card sx={{ mb: 2, bgcolor: COLORS.surface }}>
      <CardContent sx={{ pb: '16px !important' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BuildIcon sx={{ color: COLORS.warning }} />
            <Typography variant="subtitle2" sx={{ color: COLORS.text }}>
              {entry.description || 'Equipment'}
            </Typography>
          </Box>
          <IconButton size="small" onClick={onRemove} sx={{ color: COLORS.error }} aria-label="Remove entry">
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel sx={{ color: COLORS.textSecondary }}>Type</InputLabel>
            <Select
              value={entry.equipmentType}
              label="Type"
              onChange={(e) => {
                const newType = EQUIPMENT_TYPES.find(t => t.value === e.target.value);
                onChange({
                  ...entry,
                  equipmentType: e.target.value,
                  description: newType?.label || entry.description,
                  hourlyRate: newType?.rate || entry.hourlyRate
                });
              }}
              sx={{ bgcolor: COLORS.surfaceLight, color: COLORS.text }}
            >
              {EQUIPMENT_TYPES.map(t => (
                <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Description"
            value={entry.description}
            onChange={(e) => onChange({ ...entry, description: e.target.value })}
            size="small"
            fullWidth
            placeholder="e.g., 60' Bucket #BT-42"
            InputProps={{ sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text } }}
            InputLabelProps={{ sx: { color: COLORS.textSecondary } }}
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            label="Operating Hrs"
            type="number"
            value={entry.hours}
            onChange={(e) => onChange({ ...entry, hours: Number.parseFloat(e.target.value) || 0 })}
            size="small"
            inputProps={{ min: 0, step: 0.5 }}
            InputProps={{ sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text } }}
            InputLabelProps={{ sx: { color: COLORS.textSecondary } }}
          />
          <TextField
            label="Standby Hrs"
            type="number"
            value={entry.standbyHours}
            onChange={(e) => onChange({ ...entry, standbyHours: Number.parseFloat(e.target.value) || 0 })}
            size="small"
            inputProps={{ min: 0, step: 0.5 }}
            InputProps={{ sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text } }}
            InputLabelProps={{ sx: { color: COLORS.textSecondary } }}
          />
          <TextField
            label="$/Hour"
            type="number"
            value={entry.hourlyRate}
            onChange={(e) => onChange({ ...entry, hourlyRate: Number.parseFloat(e.target.value) || 0 })}
            size="small"
            inputProps={{ min: 0 }}
            InputProps={{ sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text } }}
            InputLabelProps={{ sx: { color: COLORS.textSecondary } }}
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

EquipmentEntry.propTypes = {
  entry: PropTypes.shape({
    equipmentType: PropTypes.string,
    description: PropTypes.string,
    hours: PropTypes.number,
    hourlyRate: PropTypes.number,
    standbyHours: PropTypes.number,
    standbyRate: PropTypes.number,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
};

/**
 * Equipment Section Accordion Component
 */
const FieldTicketEquipmentSection = ({ entries, onChange, expanded, onToggle, total }) => {
  const COLORS = useAppColors();

  const addEntry = () => {
    onChange([...entries, {
      id: `equip-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      equipmentType: 'bucket_truck',
      description: 'Bucket Truck',
      hours: 0,
      standbyHours: 0,
      hourlyRate: 125,
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
      sx={{ bgcolor: COLORS.surface, mb: 1 }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: COLORS.text }} />}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
          <BuildIcon sx={{ color: COLORS.warning }} />
          <Typography sx={{ color: COLORS.text, flex: 1 }}>
            Equipment ({entries.length})
          </Typography>
          <Typography sx={{ color: COLORS.primary, fontWeight: 600 }}>
            ${total.toFixed(2)}
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        {entries.map((entry) => (
          <EquipmentEntry
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
          sx={{ color: COLORS.warning, borderColor: COLORS.warning, minHeight: 44 }}
          variant="outlined"
        >
          Add Equipment
        </Button>
      </AccordionDetails>
    </Accordion>
  );
};

FieldTicketEquipmentSection.propTypes = {
  entries: PropTypes.array.isRequired,
  onChange: PropTypes.func.isRequired,
  expanded: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  total: PropTypes.number.isRequired,
};

export default FieldTicketEquipmentSection;
