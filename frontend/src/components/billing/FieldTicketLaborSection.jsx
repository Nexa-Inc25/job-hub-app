/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Field Ticket Labor Section
 *
 * Extracted from FieldTicketForm.jsx to reduce file size.
 * Renders the labor accordion with worker entry rows and add/remove controls.
 *
 * @module components/billing/FieldTicketLaborSection
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
import PersonIcon from '@mui/icons-material/Person';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useAppColors } from '../shared/themeUtils';

// Worker role options
const WORKER_ROLES = [
  { value: 'foreman', label: 'Foreman', rate: 95 },
  { value: 'journeyman', label: 'Journeyman', rate: 85 },
  { value: 'apprentice', label: 'Apprentice', rate: 55 },
  { value: 'laborer', label: 'Laborer', rate: 45 },
  { value: 'operator', label: 'Operator', rate: 90 },
  { value: 'other', label: 'Other', rate: 65 },
];

/**
 * Individual Labor Entry Row Component
 */
const LaborEntry = ({ entry, onChange, onRemove }) => {
  const COLORS = useAppColors();
  const total = (entry.regularHours * entry.regularRate) +
                (entry.overtimeHours * (entry.overtimeRate || entry.regularRate * 1.5)) +
                (entry.doubleTimeHours * (entry.doubleTimeRate || entry.regularRate * 2));

  return (
    <Card sx={{ mb: 2, bgcolor: COLORS.surface }}>
      <CardContent sx={{ pb: '16px !important' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PersonIcon sx={{ color: COLORS.primary }} />
            <Typography variant="subtitle2" sx={{ color: COLORS.text }}>
              {entry.workerName || 'Worker'}
            </Typography>
          </Box>
          <IconButton size="small" onClick={onRemove} sx={{ color: COLORS.error }} aria-label="Remove entry">
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            label="Worker Name"
            value={entry.workerName}
            onChange={(e) => onChange({ ...entry, workerName: e.target.value })}
            size="small"
            fullWidth
            InputProps={{ sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text } }}
            InputLabelProps={{ sx: { color: COLORS.textSecondary } }}
          />
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel sx={{ color: COLORS.textSecondary }}>Role</InputLabel>
            <Select
              value={entry.role}
              label="Role"
              onChange={(e) => {
                const newRole = WORKER_ROLES.find(r => r.value === e.target.value);
                onChange({
                  ...entry,
                  role: e.target.value,
                  regularRate: newRole?.rate || entry.regularRate
                });
              }}
              sx={{ bgcolor: COLORS.surfaceLight, color: COLORS.text }}
            >
              {WORKER_ROLES.map(r => (
                <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            label="Regular Hrs"
            type="number"
            value={entry.regularHours}
            onChange={(e) => onChange({ ...entry, regularHours: Number.parseFloat(e.target.value) || 0 })}
            size="small"
            inputProps={{ min: 0, step: 0.5 }}
            InputProps={{ sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text } }}
            InputLabelProps={{ sx: { color: COLORS.textSecondary } }}
          />
          <TextField
            label="OT Hrs"
            type="number"
            value={entry.overtimeHours}
            onChange={(e) => onChange({ ...entry, overtimeHours: Number.parseFloat(e.target.value) || 0 })}
            size="small"
            inputProps={{ min: 0, step: 0.5 }}
            InputProps={{ sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text } }}
            InputLabelProps={{ sx: { color: COLORS.textSecondary } }}
          />
          <TextField
            label="DT Hrs"
            type="number"
            value={entry.doubleTimeHours}
            onChange={(e) => onChange({ ...entry, doubleTimeHours: Number.parseFloat(e.target.value) || 0 })}
            size="small"
            inputProps={{ min: 0, step: 0.5 }}
            InputProps={{ sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text } }}
            InputLabelProps={{ sx: { color: COLORS.textSecondary } }}
          />
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="body2" sx={{ color: COLORS.textSecondary }}>
            Rate: ${entry.regularRate}/hr
          </Typography>
          <Typography variant="subtitle1" sx={{ color: COLORS.primary, fontWeight: 600 }}>
            ${total.toFixed(2)}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

LaborEntry.propTypes = {
  entry: PropTypes.shape({
    workerName: PropTypes.string,
    role: PropTypes.string,
    regularHours: PropTypes.number,
    regularRate: PropTypes.number,
    overtimeHours: PropTypes.number,
    overtimeRate: PropTypes.number,
    doubleTimeHours: PropTypes.number,
    doubleTimeRate: PropTypes.number,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
};

/**
 * Labor Section Accordion Component
 */
const FieldTicketLaborSection = ({ entries, onChange, expanded, onToggle, total }) => {
  const COLORS = useAppColors();

  const addEntry = () => {
    onChange([...entries, {
      id: `labor-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      workerName: '',
      role: 'journeyman',
      regularHours: 0,
      overtimeHours: 0,
      doubleTimeHours: 0,
      regularRate: 85,
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
          <PersonIcon sx={{ color: COLORS.primary }} />
          <Typography sx={{ color: COLORS.text, flex: 1 }}>
            Labor ({entries.length})
          </Typography>
          <Typography sx={{ color: COLORS.primary, fontWeight: 600 }}>
            ${total.toFixed(2)}
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        {entries.map((entry) => (
          <LaborEntry
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
          sx={{ color: COLORS.primary, borderColor: COLORS.primary, minHeight: 44 }}
          variant="outlined"
        >
          Add Worker
        </Button>
      </AccordionDetails>
    </Accordion>
  );
};

FieldTicketLaborSection.propTypes = {
  entries: PropTypes.array.isRequired,
  onChange: PropTypes.func.isRequired,
  expanded: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  total: PropTypes.number.isRequired,
};

export default FieldTicketLaborSection;
