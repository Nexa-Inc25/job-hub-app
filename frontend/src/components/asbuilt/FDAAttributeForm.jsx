/**
 * FieldLedger - EC FDA Attribute Form
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Structured equipment data entry for the Asset Registry.
 * Per PG&E TD-2051P-10 Section 10, EC notifications require Field Data
 * Acquisition attributes for poles, conductors, transformers, and switchgear.
 * 
 * Mapping uses this data to update GIS and SAP.
 * 
 * This form is work-scope-aware: it only shows attribute sections
 * relevant to the equipment being worked on (detected from EC tag item details).
 */

import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  Box, Typography, Button, Paper, TextField, Card, CardContent,
  Grid, Chip, IconButton, Alert, MenuItem, Accordion,
  AccordionSummary, AccordionDetails,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import ElectricBoltIcon from '@mui/icons-material/ElectricBolt';

// Action options
const ACTIONS = [
  { value: 'install', label: 'Install (New)' },
  { value: 'replace', label: 'Replace' },
  { value: 'remove', label: 'Remove' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'no_change', label: 'No Change' },
];

// Pole species options (PG&E common)
const POLE_SPECIES = [
  { value: 'DF', label: 'Douglas Fir (DF)' },
  { value: 'WRC', label: 'Western Red Cedar (WRC)' },
  { value: 'SP', label: 'Southern Pine (SP)' },
  { value: 'WP', label: 'Western Pine (WP)' },
  { value: 'STEEL', label: 'Steel' },
  { value: 'CONCRETE', label: 'Concrete' },
  { value: 'FIBERGLASS', label: 'Fiberglass' },
];

// Pole treatment options
const POLE_TREATMENTS = [
  { value: 'PENTA', label: 'Penta' },
  { value: 'CCA', label: 'CCA' },
  { value: 'CU-NAP', label: 'Copper Naphthenate' },
  { value: 'CREO', label: 'Creosote' },
  { value: 'NONE', label: 'None (Steel/Concrete)' },
];

// Conductor material options
const CONDUCTOR_MATERIALS = [
  { value: 'ACSR', label: 'ACSR (Aluminum/Steel)' },
  { value: 'AAC', label: 'AAC (All Aluminum)' },
  { value: 'AAAC', label: 'AAAC (All Aluminum Alloy)' },
  { value: 'CU', label: 'Copper' },
  { value: 'COVERED', label: 'Covered Conductor' },
  { value: 'SPACER', label: 'Spacer Cable' },
];

/**
 * Select field helper
 */
const SelectField = ({ label, value, onChange, options, ...props }) => (
  <TextField
    label={label}
    value={value || ''}
    onChange={(e) => onChange(e.target.value)}
    select
    size="small"
    fullWidth
    {...props}
  >
    <MenuItem value="">—</MenuItem>
    {options.map(opt => (
      <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
    ))}
  </TextField>
);

SelectField.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  options: PropTypes.array.isRequired,
};

/**
 * Pole attributes section
 */
const PoleSection = ({ data, onChange }) => {
  const update = (path, value) => {
    const newData = { ...data };
    const parts = path.split('.');
    let obj = newData;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!obj[parts[i]]) obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    obj[parts.at(-1)] = value;
    onChange(newData);
  };

  return (
    <Box>
      <SelectField
        label="Pole Action"
        value={data.action}
        onChange={(v) => update('action', v)}
        options={ACTIONS}
        sx={{ mb: 2 }}
      />

      {(data.action === 'replace' || data.action === 'remove') && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5, color: 'error.main' }}>
            Old Pole (Removed)
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, sm: 4 }}>
              <TextField label="Class" value={data.oldPole?.class || ''} onChange={(e) => update('oldPole.class', e.target.value)} size="small" fullWidth placeholder="e.g., 4" />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <TextField label="Height (ft)" value={data.oldPole?.height || ''} onChange={(e) => update('oldPole.height', e.target.value)} size="small" fullWidth type="number" placeholder="e.g., 45" />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <SelectField label="Species" value={data.oldPole?.species} onChange={(v) => update('oldPole.species', v)} options={POLE_SPECIES} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <SelectField label="Treatment" value={data.oldPole?.treatment} onChange={(v) => update('oldPole.treatment', v)} options={POLE_TREATMENTS} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <TextField label="Year Set" value={data.oldPole?.yearSet || ''} onChange={(e) => update('oldPole.yearSet', e.target.value)} size="small" fullWidth type="number" placeholder="e.g., 1985" />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <TextField label="SAP Equipment #" value={data.oldPole?.sapEquipment || ''} onChange={(e) => update('oldPole.sapEquipment', e.target.value)} size="small" fullWidth />
            </Grid>
          </Grid>
        </Paper>
      )}

      {(data.action === 'install' || data.action === 'replace') && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5, color: 'primary.main' }}>
            New Pole (Installed)
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, sm: 4 }}>
              <TextField label="Class" value={data.newPole?.class || ''} onChange={(e) => update('newPole.class', e.target.value)} size="small" fullWidth placeholder="e.g., 2" />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <TextField label="Height (ft)" value={data.newPole?.height || ''} onChange={(e) => update('newPole.height', e.target.value)} size="small" fullWidth type="number" placeholder="e.g., 55" />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <SelectField label="Species" value={data.newPole?.species} onChange={(v) => update('newPole.species', v)} options={POLE_SPECIES} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <SelectField label="Treatment" value={data.newPole?.treatment} onChange={(v) => update('newPole.treatment', v)} options={POLE_TREATMENTS} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <TextField label="Year Set" value={data.newPole?.yearSet || ''} onChange={(e) => update('newPole.yearSet', e.target.value)} size="small" fullWidth type="number" placeholder={new Date().getFullYear().toString()} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <TextField label="Manufacturer" value={data.newPole?.manufacturer || ''} onChange={(e) => update('newPole.manufacturer', e.target.value)} size="small" fullWidth />
            </Grid>
          </Grid>
        </Paper>
      )}
    </Box>
  );
};

PoleSection.propTypes = {
  data: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
};

/**
 * Conductor row
 */
const ConductorRow = ({ conductor, index, onChange, onRemove }) => {
  const update = (field, value) => {
    onChange(index, { ...conductor, [field]: value });
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Chip label={`Conductor ${index + 1}`} size="small" sx={{ mr: 1 }} />
        <Box sx={{ flexGrow: 1 }} />
        <IconButton size="small" onClick={() => onRemove(index)} color="error" aria-label="Remove conductor">
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Box>
      <Grid container spacing={2}>
        <Grid size={{ xs: 6, sm: 4 }}>
          <SelectField label="Action" value={conductor.action} onChange={(v) => update('action', v)} options={ACTIONS} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          <SelectField
            label="Type"
            value={conductor.type}
            onChange={(v) => update('type', v)}
            options={[
              { value: 'primary', label: 'Primary' },
              { value: 'secondary', label: 'Secondary' },
              { value: 'neutral', label: 'Neutral' },
              { value: 'service', label: 'Service Drop' },
            ]}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          <TextField label="Size" value={conductor.size || ''} onChange={(e) => update('size', e.target.value)} size="small" fullWidth placeholder="e.g., #4 ACSR" />
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          <SelectField label="Material" value={conductor.material} onChange={(v) => update('material', v)} options={CONDUCTOR_MATERIALS} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          <TextField label="Span Length (ft)" value={conductor.spanLength || ''} onChange={(e) => update('spanLength', e.target.value)} size="small" fullWidth type="number" />
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          <TextField label="Phases" value={conductor.phaseCount || ''} onChange={(e) => update('phaseCount', e.target.value)} size="small" fullWidth type="number" placeholder="1, 2, or 3" />
        </Grid>
      </Grid>
    </Paper>
  );
};

ConductorRow.propTypes = {
  conductor: PropTypes.object.isRequired,
  index: PropTypes.number.isRequired,
  onChange: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
};

/**
 * FDA Attribute Form — Main Component
 */
const FDAAttributeForm = ({
  // Initial data (from job/EC tag)
  initialData = {},
  jobData = {},
  // What equipment types are in scope (auto-detected from EC tag)
  equipmentInScope = ['pole'], // Default to pole for pole replacement jobs
  // Callbacks
  onComplete,
  disabled = false,
}) => {
  const [poleData, setPoleData] = useState(initialData.pole || { action: 'replace', oldPole: {}, newPole: {} });
  const [conductors, setConductors] = useState(initialData.conductors || []);
  const [transformerData, setTransformerData] = useState(initialData.transformer || {});
  const [mappingNotes, setMappingNotes] = useState(initialData.mappingNotes || '');

  const addConductor = useCallback(() => {
    setConductors(prev => [...prev, { action: 'no_change', type: 'primary', size: '', material: '' }]);
  }, []);

  const updateConductor = useCallback((index, data) => {
    setConductors(prev => prev.map((c, i) => i === index ? data : c));
  }, []);

  const removeConductor = useCallback((index) => {
    setConductors(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleComplete = () => {
    const data = {
      workPerformed: {
        type: jobData.ecTagItemType || '',
        description: jobData.ecTagDescription || jobData.description || '',
        action: poleData.action || 'replace',
      },
      pole: equipmentInScope.includes('pole') ? poleData : undefined,
      conductors: conductors.length > 0 ? conductors : undefined,
      transformer: equipmentInScope.includes('transformer') ? transformerData : undefined,
      mappingNotes,
    };

    if (onComplete) onComplete(data);
  };

  return (
    <Box sx={{ maxWidth: 700, mx: 'auto' }}>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <ElectricBoltIcon color="warning" />
            <Typography variant="h6" fontWeight={700}>
              Equipment Attributes (FDA)
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Record equipment attributes for the Asset Registry. Mapping uses this to update GIS and SAP.
          </Typography>
          {jobData.pmNumber && (
            <Chip label={`PM# ${jobData.pmNumber}`} size="small" sx={{ mt: 1 }} />
          )}
        </CardContent>
      </Card>

      {/* Pole Section */}
      {equipmentInScope.includes('pole') && (
        <Accordion defaultExpanded variant="outlined" sx={{ mb: 2 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography fontWeight={600}>Pole Attributes</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <PoleSection data={poleData} onChange={setPoleData} />
          </AccordionDetails>
        </Accordion>
      )}

      {/* Conductors Section */}
      <Accordion defaultExpanded={conductors.length > 0 || equipmentInScope.includes('conductor')} variant="outlined" sx={{ mb: 2 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
            <Typography fontWeight={600}>Conductors</Typography>
            {conductors.length > 0 && (
              <Chip label={conductors.length} size="small" />
            )}
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          {conductors.map((cond, i) => (
            <ConductorRow
              key={i}
              conductor={cond}
              index={i}
              onChange={updateConductor}
              onRemove={removeConductor}
            />
          ))}
          <Button
            startIcon={<AddIcon />}
            onClick={addConductor}
            size="small"
            sx={{ mt: 1 }}
          >
            Add Conductor
          </Button>
        </AccordionDetails>
      </Accordion>

      {/* Transformer Section */}
      {equipmentInScope.includes('transformer') && (
        <Accordion variant="outlined" sx={{ mb: 2 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography fontWeight={600}>Transformer Attributes</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6, sm: 4 }}>
                <SelectField label="Action" value={transformerData.action} onChange={(v) => setTransformerData(prev => ({ ...prev, action: v }))} options={ACTIONS} />
              </Grid>
              <Grid size={{ xs: 6, sm: 4 }}>
                <TextField label="KVA" value={transformerData.new?.kva || ''} onChange={(e) => setTransformerData(prev => ({ ...prev, new: { ...prev.new, kva: e.target.value } }))} size="small" fullWidth type="number" placeholder="e.g., 25" />
              </Grid>
              <Grid size={{ xs: 6, sm: 4 }}>
                <TextField label="Voltage" value={transformerData.new?.voltage || ''} onChange={(e) => setTransformerData(prev => ({ ...prev, new: { ...prev.new, voltage: e.target.value } }))} size="small" fullWidth placeholder="e.g., 12470-120/240" />
              </Grid>
              <Grid size={{ xs: 6, sm: 4 }}>
                <TextField label="Serial Number" value={transformerData.new?.serialNumber || ''} onChange={(e) => setTransformerData(prev => ({ ...prev, new: { ...prev.new, serialNumber: e.target.value } }))} size="small" fullWidth />
              </Grid>
              <Grid size={{ xs: 6, sm: 4 }}>
                <TextField label="Manufacturer" value={transformerData.new?.manufacturer || ''} onChange={(e) => setTransformerData(prev => ({ ...prev, new: { ...prev.new, manufacturer: e.target.value } }))} size="small" fullWidth />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Mapping Notes */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <TextField
          label="Notes for Mapping Team"
          fullWidth
          multiline
          minRows={2}
          value={mappingNotes}
          onChange={(e) => setMappingNotes(e.target.value)}
          placeholder="Any additional info the Mapping team needs to update the Asset Registry..."
          disabled={disabled}
        />
      </Paper>

      {/* Info */}
      <Alert severity="info" sx={{ mb: 2 }}>
        This data feeds directly into the Asset Registry (GIS + SAP). Accurate attributes help Mapping process your as-built faster.
      </Alert>

      {/* Submit */}
      <Button
        fullWidth
        variant="contained"
        size="large"
        startIcon={<SaveIcon />}
        onClick={handleComplete}
        disabled={disabled}
        sx={{ py: 1.5, fontWeight: 700, fontSize: '1rem' }}
      >
        Save Equipment Attributes
      </Button>
    </Box>
  );
};

FDAAttributeForm.propTypes = {
  initialData: PropTypes.object,
  jobData: PropTypes.object,
  equipmentInScope: PropTypes.arrayOf(PropTypes.string),
  onComplete: PropTypes.func,
  disabled: PropTypes.bool,
};

export default FDAAttributeForm;

