/**
 * LMEMaterialItems - Material and Equipment line items for LME form
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 */

import React, { useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  Box, Typography, Button, TextField, Paper, IconButton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Select, MenuItem, FormControl,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import BuildIcon from '@mui/icons-material/Build';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import { EQUIPMENT_TYPES } from './constants';

/** Single material row */
const MaterialRow = ({ entry, index, onUpdate, onRemove }) => {
  const handleChange = (field, value) => {
    const updated = { ...entry, [field]: value };
    if (['quantity', 'unitCost'].includes(field)) {
      updated.amount = (Number.parseFloat(updated.quantity) || 0) * (Number.parseFloat(updated.unitCost) || 0);
    }
    onUpdate(index, updated);
  };
  return (
    <TableRow>
      <TableCell><TextField size="small" fullWidth placeholder="Material Description" value={entry.description || ''} onChange={e => handleChange('description', e.target.value)} /></TableCell>
      <TableCell sx={{ width: 100 }}><TextField size="small" placeholder="Unit" value={entry.unit || ''} onChange={e => handleChange('unit', e.target.value)} /></TableCell>
      <TableCell sx={{ width: 80 }}><TextField size="small" type="number" value={entry.quantity || ''} onChange={e => handleChange('quantity', e.target.value)} /></TableCell>
      <TableCell sx={{ width: 100 }}><TextField size="small" type="number" inputProps={{ step: 0.01 }} value={entry.unitCost || ''} onChange={e => handleChange('unitCost', e.target.value)} placeholder="$" /></TableCell>
      <TableCell sx={{ width: 100, textAlign: 'right' }}>${(entry.amount || 0).toFixed(2)}</TableCell>
      <TableCell sx={{ width: 40 }}><IconButton size="small" color="error" onClick={() => onRemove(index)}><DeleteIcon fontSize="small" /></IconButton></TableCell>
    </TableRow>
  );
};

MaterialRow.propTypes = { entry: PropTypes.object.isRequired, index: PropTypes.number.isRequired, onUpdate: PropTypes.func.isRequired, onRemove: PropTypes.func.isRequired };

/** Single equipment row */
const EquipmentRow = ({ entry, index, onUpdate, onRemove }) => {
  const handleChange = (field, value) => {
    const updated = { ...entry, [field]: value };
    if (['hours', 'rate'].includes(field)) {
      updated.amount = (Number.parseFloat(updated.hours) || 0) * (Number.parseFloat(updated.rate) || 0);
    }
    onUpdate(index, updated);
  };
  return (
    <TableRow>
      <TableCell>
        <FormControl size="small" fullWidth>
          <Select value={entry.type || ''} onChange={e => handleChange('type', e.target.value)} displayEmpty>
            <MenuItem value="" disabled><em>Select Equipment</em></MenuItem>
            {EQUIPMENT_TYPES.map(eq => <MenuItem key={eq} value={eq}>{eq}</MenuItem>)}
            <MenuItem value="other">Other...</MenuItem>
          </Select>
        </FormControl>
      </TableCell>
      <TableCell sx={{ width: 150 }}><TextField size="small" fullWidth placeholder="Unit/ID #" value={entry.unitNumber || ''} onChange={e => handleChange('unitNumber', e.target.value)} /></TableCell>
      <TableCell sx={{ width: 80 }}><TextField size="small" type="number" inputProps={{ step: 0.5 }} value={entry.hours || ''} onChange={e => handleChange('hours', e.target.value)} placeholder="Hrs" /></TableCell>
      <TableCell sx={{ width: 100 }}><TextField size="small" type="number" inputProps={{ step: 0.01 }} value={entry.rate || ''} onChange={e => handleChange('rate', e.target.value)} placeholder="$/hr" /></TableCell>
      <TableCell sx={{ width: 100, textAlign: 'right' }}>${(entry.amount || 0).toFixed(2)}</TableCell>
      <TableCell sx={{ width: 40 }}><IconButton size="small" color="error" onClick={() => onRemove(index)}><DeleteIcon fontSize="small" /></IconButton></TableCell>
    </TableRow>
  );
};

EquipmentRow.propTypes = { entry: PropTypes.object.isRequired, index: PropTypes.number.isRequired, onUpdate: PropTypes.func.isRequired, onRemove: PropTypes.func.isRequired };

const LMEMaterialItems = ({
  materialEntries, onMaterialEntriesChange,
  equipmentEntries, onEquipmentEntriesChange,
}) => {
  const materialTotal = materialEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
  const equipmentTotal = equipmentEntries.reduce((sum, e) => sum + (e.amount || 0), 0);

  const addMaterial = useCallback(() => {
    // NOSONAR: Math.random() for local form element IDs is safe
    onMaterialEntriesChange([...materialEntries, { id: `mat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, description: '', unit: 'EA', quantity: '', unitCost: '', amount: 0 }]); // NOSONAR
  }, [materialEntries, onMaterialEntriesChange]);

  const updateMaterial = useCallback((idx, entry) => { const u = [...materialEntries]; u[idx] = entry; onMaterialEntriesChange(u); }, [materialEntries, onMaterialEntriesChange]);
  const removeMaterial = useCallback((idx) => { onMaterialEntriesChange(materialEntries.filter((_, i) => i !== idx)); }, [materialEntries, onMaterialEntriesChange]);

  const addEquipment = useCallback(() => {
    // NOSONAR: Math.random() for local form element IDs is safe
    onEquipmentEntriesChange([...equipmentEntries, { id: `eq-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, type: '', unitNumber: '', hours: '', rate: '', amount: 0 }]); // NOSONAR
  }, [equipmentEntries, onEquipmentEntriesChange]);

  const updateEquipment = useCallback((idx, entry) => { const u = [...equipmentEntries]; u[idx] = entry; onEquipmentEntriesChange(u); }, [equipmentEntries, onEquipmentEntriesChange]);
  const removeEquipment = useCallback((idx) => { onEquipmentEntriesChange(equipmentEntries.filter((_, i) => i !== idx)); }, [equipmentEntries, onEquipmentEntriesChange]);

  return (
    <>
      {/* MATERIAL SECTION */}
      <Paper sx={{ mx: 2, mb: 2, p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><BuildIcon color="secondary" /><Typography variant="h6" fontWeight="bold">MATERIAL</Typography></Box>
          <Button startIcon={<AddIcon />} onClick={addMaterial} variant="outlined" size="small">Add Material</Button>
        </Box>
        {materialEntries.length > 0 ? (
          <TableContainer><Table size="small">
            <TableHead><TableRow sx={{ bgcolor: 'secondary.main' }}>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>DESCRIPTION</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>UNIT</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>QTY</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>UNIT COST</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold', textAlign: 'right' }}>AMOUNT</TableCell>
              <TableCell sx={{ width: 40 }}></TableCell>
            </TableRow></TableHead>
            <TableBody>
              {materialEntries.map((e, i) => <MaterialRow key={e.id || `mat-${i}`} entry={e} index={i} onUpdate={updateMaterial} onRemove={removeMaterial} />)}
              <TableRow sx={{ bgcolor: 'grey.100' }}>
                <TableCell colSpan={4} sx={{ textAlign: 'right', fontWeight: 'bold' }}>MATERIAL TOTAL:</TableCell>
                <TableCell sx={{ textAlign: 'right', fontWeight: 'bold', fontSize: '1.1rem' }}>${materialTotal.toFixed(2)}</TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableBody>
          </Table></TableContainer>
        ) : (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>No materials entered. Click &quot;Add Material&quot; to add items.</Typography>
        )}
      </Paper>

      {/* EQUIPMENT SECTION */}
      <Paper sx={{ mx: 2, mb: 2, p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><LocalShippingIcon color="warning" /><Typography variant="h6" fontWeight="bold">EQUIPMENT</Typography></Box>
          <Button startIcon={<AddIcon />} onClick={addEquipment} variant="outlined" size="small">Add Equipment</Button>
        </Box>
        {equipmentEntries.length > 0 ? (
          <TableContainer><Table size="small">
            <TableHead><TableRow sx={{ bgcolor: 'warning.main' }}>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>EQUIPMENT TYPE</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>UNIT #</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>HOURS</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>RATE</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold', textAlign: 'right' }}>AMOUNT</TableCell>
              <TableCell sx={{ width: 40 }}></TableCell>
            </TableRow></TableHead>
            <TableBody>
              {equipmentEntries.map((e, i) => <EquipmentRow key={e.id || `eq-${i}`} entry={e} index={i} onUpdate={updateEquipment} onRemove={removeEquipment} />)}
              <TableRow sx={{ bgcolor: 'grey.100' }}>
                <TableCell colSpan={4} sx={{ textAlign: 'right', fontWeight: 'bold' }}>EQUIPMENT TOTAL:</TableCell>
                <TableCell sx={{ textAlign: 'right', fontWeight: 'bold', fontSize: '1.1rem' }}>${equipmentTotal.toFixed(2)}</TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableBody>
          </Table></TableContainer>
        ) : (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>No equipment entered. Click &quot;Add Equipment&quot; to add items.</Typography>
        )}
      </Paper>
    </>
  );
};

LMEMaterialItems.propTypes = {
  materialEntries: PropTypes.array.isRequired,
  onMaterialEntriesChange: PropTypes.func.isRequired,
  equipmentEntries: PropTypes.array.isRequired,
  onEquipmentEntriesChange: PropTypes.func.isRequired,
};

export default LMEMaterialItems;
