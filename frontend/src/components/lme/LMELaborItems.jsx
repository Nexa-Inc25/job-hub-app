/**
 * LMELaborItems - Labor line items with add/remove for LME form
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 */

import React, { useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  Box, Typography, Button, TextField, Paper, IconButton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Select, MenuItem, FormControl, FormControlLabel, Checkbox, Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonIcon from '@mui/icons-material/Person';
import { CRAFT_CODES, RATE_TYPES } from './constants';

/**
 * Single labor entry row (3 sub-rows for ST/OT/DT)
 */
const LaborRow = ({ entry, index, onUpdate, onRemove, defaultHours }) => {
  const calculateAmount = (hours, rateType, baseRate) => {
    const multiplier = RATE_TYPES.find(r => r.code === rateType)?.multiplier || 1;
    return (Number.parseFloat(hours) || 0) * (Number.parseFloat(baseRate) || 0) * multiplier;
  };

  const handleChange = (field, value) => {
    const updated = { ...entry, [field]: value };
    if (['stHours', 'otHours', 'dtHours'].includes(field)) updated.useCustomHours = true;
    if (['stHours', 'otHours', 'dtHours', 'rate'].includes(field)) {
      updated.stAmount = calculateAmount(updated.stHours, 'ST', updated.rate);
      updated.otAmount = calculateAmount(updated.otHours, 'OT', updated.rate);
      updated.dtAmount = calculateAmount(updated.dtHours, 'DT', updated.rate);
      updated.totalAmount = updated.stAmount + updated.otAmount + updated.dtAmount;
    }
    onUpdate(index, updated);
  };

  const handleCustomToggle = (e) => {
    if (e.target.checked) {
      onUpdate(index, { ...entry, useCustomHours: true });
    } else {
      const rate = Number.parseFloat(entry.rate) || 0;
      const st = Number.parseFloat(defaultHours.stHours) || 0;
      const ot = Number.parseFloat(defaultHours.otHours) || 0;
      const dt = Number.parseFloat(defaultHours.dtHours) || 0;
      const stAmt = st * rate, otAmt = ot * rate * 1.5, dtAmt = dt * rate * 2;
      onUpdate(index, {
        ...entry, stHours: defaultHours.stHours, otHours: defaultHours.otHours, dtHours: defaultHours.dtHours,
        stAmount: stAmt, otAmount: otAmt, dtAmount: dtAmt, totalAmount: stAmt + otAmt + dtAmt, useCustomHours: false,
      });
    }
  };

  const isCustom = entry.useCustomHours;
  const rowBg = isCustom ? 'action.hover' : 'transparent';
  const inputSx = { '& input': { textAlign: 'center', p: 0.5 }, opacity: isCustom ? 1 : 0.7 };

  return (
    <>
      <TableRow sx={{ '& td': { py: 0.5, borderBottom: 'none' }, bgcolor: rowBg }}>
        <TableCell rowSpan={3} sx={{ verticalAlign: 'top', width: 80 }}>
          <FormControl size="small" fullWidth>
            <Select value={entry.craft || ''} onChange={e => handleChange('craft', e.target.value)} displayEmpty>
              <MenuItem value="" disabled><em>Craft</em></MenuItem>
              {CRAFT_CODES.map(c => <MenuItem key={c.code} value={c.code}>{c.code}</MenuItem>)}
            </Select>
          </FormControl>
        </TableCell>
        <TableCell rowSpan={3} sx={{ verticalAlign: 'top' }}>
          <TextField size="small" fullWidth placeholder="Name" value={entry.name || ''} onChange={e => handleChange('name', e.target.value)} />
          <Tooltip title={isCustom ? 'Using custom hours for this person' : 'Using default hours for all crew'}>
            <FormControlLabel
              control={<Checkbox size="small" checked={isCustom} onChange={handleCustomToggle} />}
              label={<Typography variant="caption" color="text.secondary">Custom hrs</Typography>}
              sx={{ mt: 0.5, ml: 0 }}
            />
          </Tooltip>
        </TableCell>
        <TableCell sx={{ width: 60, textAlign: 'center', fontWeight: 600 }}>ST</TableCell>
        <TableCell sx={{ width: 70 }}>
          <TextField size="small" type="number" inputProps={{ step: 0.5, min: 0 }} value={entry.stHours || ''} onChange={e => handleChange('stHours', e.target.value)} disabled={!isCustom} sx={inputSx} />
        </TableCell>
        <TableCell rowSpan={3} sx={{ verticalAlign: 'top', width: 80 }}>
          <TextField size="small" type="number" inputProps={{ step: 0.01, min: 0 }} value={entry.rate || ''} onChange={e => handleChange('rate', e.target.value)} placeholder="$/hr" sx={{ '& input': { textAlign: 'right', p: 0.5 } }} />
        </TableCell>
        <TableCell sx={{ width: 90, textAlign: 'right' }}>${(entry.stAmount || 0).toFixed(2)}</TableCell>
        <TableCell rowSpan={3} sx={{ verticalAlign: 'top', width: 40 }}>
          <IconButton size="small" color="error" onClick={() => onRemove(index)} aria-label="Remove item"><DeleteIcon fontSize="small" /></IconButton>
        </TableCell>
      </TableRow>
      <TableRow sx={{ '& td': { py: 0.5, borderBottom: 'none' }, bgcolor: rowBg }}>
        <TableCell sx={{ textAlign: 'center', fontWeight: 600 }}>OT/PT</TableCell>
        <TableCell><TextField size="small" type="number" inputProps={{ step: 0.5, min: 0 }} value={entry.otHours || ''} onChange={e => handleChange('otHours', e.target.value)} disabled={!isCustom} sx={inputSx} /></TableCell>
        <TableCell sx={{ textAlign: 'right' }}>${(entry.otAmount || 0).toFixed(2)}</TableCell>
      </TableRow>
      <TableRow sx={{ '& td': { py: 0.5 }, bgcolor: rowBg }}>
        <TableCell sx={{ textAlign: 'center', fontWeight: 600 }}>DT</TableCell>
        <TableCell><TextField size="small" type="number" inputProps={{ step: 0.5, min: 0 }} value={entry.dtHours || ''} onChange={e => handleChange('dtHours', e.target.value)} disabled={!isCustom} sx={inputSx} /></TableCell>
        <TableCell sx={{ textAlign: 'right', fontWeight: 600 }}>${(entry.totalAmount || 0).toFixed(2)}</TableCell>
      </TableRow>
    </>
  );
};

LaborRow.propTypes = {
  entry: PropTypes.object.isRequired,
  index: PropTypes.number.isRequired,
  onUpdate: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
  defaultHours: PropTypes.object,
};

const LMELaborItems = ({ entries, onEntriesChange, defaultHours, onDefaultHoursChange }) => {
  const laborTotal = entries.reduce((sum, e) => sum + (e.totalAmount || 0), 0);

  const addEntry = useCallback(() => {
    // NOSONAR: Math.random() for local form element IDs is safe
    onEntriesChange([...entries, {
      id: `labor-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, // NOSONAR
      craft: '', name: '', stHours: defaultHours.stHours, otHours: defaultHours.otHours, dtHours: defaultHours.dtHours,
      rate: '', stAmount: 0, otAmount: 0, dtAmount: 0, totalAmount: 0, useCustomHours: false,
    }]);
  }, [entries, onEntriesChange, defaultHours]);

  const updateEntry = useCallback((index, entry) => {
    const updated = [...entries]; updated[index] = entry; onEntriesChange(updated);
  }, [entries, onEntriesChange]);

  const removeEntry = useCallback((index) => {
    onEntriesChange(entries.filter((_, i) => i !== index));
  }, [entries, onEntriesChange]);

  const applyDefaults = useCallback((newDefaults) => {
    onDefaultHoursChange(newDefaults);
    onEntriesChange(entries.map(entry => {
      if (entry.useCustomHours) return entry;
      const rate = Number.parseFloat(entry.rate) || 0;
      const st = Number.parseFloat(newDefaults.stHours) || 0;
      const ot = Number.parseFloat(newDefaults.otHours) || 0;
      const dt = Number.parseFloat(newDefaults.dtHours) || 0;
      const stAmt = st * rate, otAmt = ot * rate * 1.5, dtAmt = dt * rate * 2;
      return { ...entry, stHours: newDefaults.stHours, otHours: newDefaults.otHours, dtHours: newDefaults.dtHours, stAmount: stAmt, otAmount: otAmt, dtAmount: dtAmt, totalAmount: stAmt + otAmt + dtAmt };
    }));
  }, [entries, onEntriesChange, onDefaultHoursChange]);

  return (
    <Paper sx={{ mx: 2, mb: 2, p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PersonIcon color="primary" />
          <Typography variant="h6" fontWeight="bold">CONTRACTOR&apos;S LABOR</Typography>
        </Box>
        <Button startIcon={<AddIcon />} onClick={addEntry} variant="outlined" size="small">Add Worker</Button>
      </Box>

      <Paper variant="outlined" sx={{ mb: 2, p: 2, bgcolor: 'primary.50', borderColor: 'primary.200', borderRadius: 2 }}>
        <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1.5, color: 'primary.main' }}>Default Hours (Applied to All Crew)</Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          {[{ label: 'ST', key: 'stHours' }, { label: 'OT/PT', key: 'otHours' }, { label: 'DT', key: 'dtHours' }].map(({ label, key }) => (
            <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" fontWeight={600} sx={{ minWidth: 40 }}>{label}:</Typography>
              <TextField size="small" type="number" inputProps={{ step: 0.5, min: 0 }} value={defaultHours[key]}
                onChange={e => applyDefaults({ ...defaultHours, [key]: e.target.value })}
                sx={{ width: 80, '& input': { textAlign: 'center' } }} placeholder="0" />
            </Box>
          ))}
          <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>Check &quot;Custom hrs&quot; on individual workers to override</Typography>
        </Box>
      </Paper>

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'primary.main' }}>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>CRAFT</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>NAME</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold', textAlign: 'center' }}>HRS/DYS</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold', textAlign: 'center' }}>ST/PT</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold', textAlign: 'right' }}>RATE</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold', textAlign: 'right' }}>AMOUNT</TableCell>
              <TableCell sx={{ width: 40 }}></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map((entry, idx) => (
              <LaborRow key={entry.id || `labor-${idx}`} entry={entry} index={idx} onUpdate={updateEntry} onRemove={removeEntry} defaultHours={defaultHours} />
            ))}
            <TableRow sx={{ bgcolor: 'grey.100' }}>
              <TableCell colSpan={5} sx={{ textAlign: 'right', fontWeight: 'bold' }}>LABOR TOTAL:</TableCell>
              <TableCell sx={{ textAlign: 'right', fontWeight: 'bold', fontSize: '1.1rem' }}>${laborTotal.toFixed(2)}</TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
};

LMELaborItems.propTypes = {
  entries: PropTypes.array.isRequired,
  onEntriesChange: PropTypes.func.isRequired,
  defaultHours: PropTypes.object.isRequired,
  onDefaultHoursChange: PropTypes.func.isRequired,
};

export default LMELaborItems;
