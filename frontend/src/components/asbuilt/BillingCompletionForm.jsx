/**
 * FieldLedger - Distribution Unit Price Completion Form (PG&E Exhibit B)
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 *
 * Native form replacing PDF annotation for the billing/project completion page.
 * Auto-fills from job data, LME, unit entries, and preFieldLabels so the
 * foreman just confirms and signs.
 *
 * Fields auto-filled:
 *  - Date → today
 *  - PM Order # → job.pmNumber
 *  - Notification # → job.notificationNumber
 *  - Division → job.division
 *  - Accessibility → job.preFieldLabels.roadAccess
 *  - MAT Code / Tag Type → job.matCode
 *  - Specialized Equipment → job.preFieldLabels.craneRequired / craneType
 *  - Traffic Control → job.dependencies (traffic_control)
 *  - Crew Headcount & Hours → LME labor data
 */

import React, { useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import {
  Box, Typography, Button, Paper, TextField, Chip, Alert,
  Checkbox, FormControlLabel, FormGroup, FormControl, FormLabel,
  Card, CardContent,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';

// PG&E Division codes
const DIVISIONS = [
  'SJ', 'DA', 'CC', 'LP', 'DI', 'MI', 'PN', 'EB', 'SF',
  'NB', 'SO', 'HM', 'NC', 'NV', 'SA', 'SI', 'FR', 'KE', 'ST', 'YO',
];

// Specialized equipment options
const SPECIALIZED_EQUIPMENT = [
  { key: 'helicopter', label: 'Helicopter LZ' },
  { key: 'crane', label: 'Crane' },
  { key: 'backyard_machine', label: 'Backyard Machine' },
  { key: 'tracked', label: 'Tracked Equipment' },
];

// Restoration types
const RESTORATION_TYPES = [
  { key: 'concrete', label: 'Concrete' },
  { key: 'asphalt', label: 'Asphalt' },
  { key: 'other', label: 'Other' },
];

// Trip-O-Link adders
const TRIP_ADDERS = [
  { key: 'non_exempt_connector', label: 'Non-Exempt Connector' },
  { key: 'post_insulator', label: 'Post Insulator' },
  { key: 'crossarm', label: 'Crossarm' },
  { key: 'non_exempt_fuse_tx', label: 'Non-Exempt Fuse Protecting TX' },
  { key: 'non_exempt_surge', label: 'Non-Exempt Surge Arrestor' },
];

// Excavation methods
const EXCAVATION_METHODS = [
  { key: 'hand_dig', label: 'Hand Dig' },
  { key: 'machine_dig', label: 'Machine Dig' },
  { key: 'vac_truck', label: 'Vac Truck' },
];

/**
 * Derive initial form values from job data, LME, and preFieldLabels
 */
function deriveInitialValues(job, lmeData, unitEntries) {
  const preField = job?.preFieldLabels || {};
  const deps = job?.dependencies || [];

  // Division
  const division = (job?.division || '').toUpperCase();

  // Accessibility from preFieldLabels.roadAccess
  const accessMap = {
    accessible: 'assessible',
    limited: 'inaccessible',
    'non-accessible': 'inaccessible',
    inaccessible: 'inaccessible',
    backyard: 'inaccessible',
    easement: 'inaccessible',
  };
  const accessibility = accessMap[preField.roadAccess] || '';

  // MAT Code → tag type / maintenance code
  const matCode = (job?.matCode || '').toUpperCase();

  // Crane from preFieldLabels
  const specialEquip = {};
  if (preField.craneRequired) {
    specialEquip.crane = true;
  }
  if (preField.specialEquipment?.length > 0) {
    for (const eq of preField.specialEquipment) {
      const lower = eq.toLowerCase();
      if (lower.includes('helicopter')) specialEquip.helicopter = true;
      if (lower.includes('backyard')) specialEquip.backyard_machine = true;
      if (lower.includes('tracked')) specialEquip.tracked = true;
    }
  }

  // Traffic control from dependencies
  const tcpDep = deps.find(d => d.type === 'traffic_control');
  const trafficControl = tcpDep?.status === 'not_required' ? '' :
    tcpDep ? 'standard' : '';

  // Crew headcount and hours from LME
  const laborEntries = lmeData?.labor || [];
  const crewHeadcount = laborEntries.length;
  const stHoursTotal = laborEntries.reduce((sum, l) => sum + (l.stHours || 0), 0);
  const otHoursTotal = laborEntries.reduce((sum, l) => sum + (l.otHours || 0) + (l.dtHours || 0), 0);

  // Unit totals
  const unitTotal = (unitEntries || []).reduce((sum, u) => sum + (u.totalAmount || 0), 0);

  return {
    date: new Date().toLocaleDateString('en-US'),
    pmNumber: job?.pmNumber || '',
    notificationNumber: job?.notificationNumber || '',
    locationNumber: '',
    division,
    accessibility,
    fireWatch: '',
    tagTypePoles: '',
    matCode,
    cancel: false,
    specialEquipment: specialEquip,
    specialEquipmentOther: '',
    trafficControl,
    specializedTrafficCrewCount: '',
    excavationHours: '',
    excavationMethods: {},
    restoration: {},
    restorationOther: '',
    tripAdders: {},
    stCrewHeadcount: crewHeadcount > 0 ? crewHeadcount.toString() : '',
    stHours: stHoursTotal > 0 ? stHoursTotal.toString() : '',
    premiumCrewHeadcount: otHoursTotal > 0 ? crewHeadcount.toString() : '',
    premiumHours: otHoursTotal > 0 ? otHoursTotal.toString() : '',
    comments: '',
    unitTotal,
  };
}

/**
 * BillingCompletionForm — native Exhibit B form
 */
const BillingCompletionForm = ({
  jobData = {},
  lmeData = null,
  unitEntries = [],
  onComplete,
  disabled = false,
}) => {
  const initial = useMemo(
    () => deriveInitialValues(jobData, lmeData, unitEntries),
    [jobData, lmeData, unitEntries]
  );
  const [form, setForm] = useState(initial);

  // Helpers
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const toggleSet = (group, key) => {
    setForm(prev => ({
      ...prev,
      [group]: { ...prev[group], [key]: !prev[group][key] },
    }));
  };

  // Validation
  const validation = useMemo(() => {
    const errors = [];
    if (!form.pmNumber && !form.notificationNumber) errors.push('PM# or Notification# required');
    if (!form.division) errors.push('Division required');
    return { valid: errors.length === 0, errors };
  }, [form]);

  // Submit
  const handleSubmit = () => {
    if (!validation.valid) return;
    if (onComplete) {
      onComplete({
        ...form,
        completedAt: new Date().toISOString(),
      });
    }
  };

  // Count auto-filled fields
  const autoFilledCount = [
    form.pmNumber, form.notificationNumber, form.division, form.accessibility,
    form.matCode, form.stCrewHeadcount, form.stHours,
  ].filter(Boolean).length;

  return (
    <Box sx={{ maxWidth: 700, mx: 'auto' }}>
      {/* Header */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <ReceiptLongIcon color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Distribution Unit Price Completion Form
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            PG&E Exhibit B — {autoFilledCount} fields auto-filled from job data
          </Typography>
          {initial.unitTotal > 0 && (
            <Chip
              label={`Unit Total: $${initial.unitTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
              color="success"
              size="small"
              sx={{ mt: 1, fontWeight: 700 }}
            />
          )}
        </CardContent>
      </Card>

      {/* Row 1: Date / PM# / Notification # / Location # */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            label="Date"
            value={form.date}
            size="small"
            InputProps={{ readOnly: true }}
            sx={{ minWidth: 130 }}
            helperText="Auto-filled"
          />
          <TextField
            label="PM Order #"
            value={form.pmNumber}
            onChange={(e) => set('pmNumber', e.target.value)}
            size="small"
            sx={{ minWidth: 140 }}
            helperText={jobData.pmNumber ? 'From job' : ''}
          />
          <TextField
            label="Notification #"
            value={form.notificationNumber}
            onChange={(e) => set('notificationNumber', e.target.value)}
            size="small"
            sx={{ minWidth: 140 }}
            helperText={jobData.notificationNumber ? 'From job' : ''}
          />
          <TextField
            label="Location #"
            value={form.locationNumber}
            onChange={(e) => set('locationNumber', e.target.value)}
            size="small"
            sx={{ minWidth: 120 }}
          />
        </Box>
      </Paper>

      {/* Division */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <FormControl component="fieldset">
          <FormLabel sx={{ fontWeight: 600, mb: 0.5 }}>Division *</FormLabel>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {DIVISIONS.map(div => (
              <Chip
                key={div}
                label={div}
                size="small"
                variant={form.division === div ? 'filled' : 'outlined'}
                color={form.division === div ? 'primary' : 'default'}
                onClick={() => set('division', div)}
                sx={{
                  fontWeight: form.division === div ? 700 : 400,
                  cursor: 'pointer',
                  minWidth: 36,
                }}
              />
            ))}
          </Box>
          {jobData.division && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
              Auto-selected from job: {jobData.division}
            </Typography>
          )}
        </FormControl>
      </Paper>

      {/* Accessibility + Fire Watch */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <FormControl component="fieldset">
            <FormLabel sx={{ fontWeight: 600, mb: 0.5 }}>Accessibility</FormLabel>
            <FormGroup row>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.accessibility === 'assessible'}
                    onChange={() => set('accessibility', form.accessibility === 'assessible' ? '' : 'assessible')}
                    sx={{ '& .MuiSvgIcon-root': { fontSize: 28 } }}
                  />
                }
                label="Assessible"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.accessibility === 'inaccessible'}
                    onChange={() => set('accessibility', form.accessibility === 'inaccessible' ? '' : 'inaccessible')}
                    sx={{ '& .MuiSvgIcon-root': { fontSize: 28 } }}
                  />
                }
                label="Inaccessible"
              />
            </FormGroup>
            {jobData.preFieldLabels?.roadAccess && (
              <Typography variant="caption" color="text.secondary">
                From pre-field: {jobData.preFieldLabels.roadAccess}
              </Typography>
            )}
          </FormControl>

          <FormControl component="fieldset">
            <FormLabel sx={{ fontWeight: 600, mb: 0.5 }}>Fire Watch</FormLabel>
            <FormGroup row>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.fireWatch === 'R4'}
                    onChange={() => set('fireWatch', form.fireWatch === 'R4' ? '' : 'R4')}
                    sx={{ '& .MuiSvgIcon-root': { fontSize: 28 } }}
                  />
                }
                label="R4 (Energized Work Only)"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.fireWatch === 'R5'}
                    onChange={() => set('fireWatch', form.fireWatch === 'R5' ? '' : 'R5')}
                    sx={{ '& .MuiSvgIcon-root': { fontSize: 28 } }}
                  />
                }
                label="R5"
              />
            </FormGroup>
          </FormControl>
        </Box>
      </Paper>

      {/* Tag Type / MAT Code */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <FormControl component="fieldset">
            <FormLabel sx={{ fontWeight: 600, mb: 0.5 }}>Tag Type: Poles</FormLabel>
            <FormGroup row>
              {['1', '2', '3', '4', 'LUMP SUM'].map(tag => (
                <FormControlLabel
                  key={tag}
                  control={
                    <Checkbox
                      checked={form.tagTypePoles === tag}
                      onChange={() => set('tagTypePoles', form.tagTypePoles === tag ? '' : tag)}
                      sx={{ '& .MuiSvgIcon-root': { fontSize: 28 } }}
                    />
                  }
                  label={tag}
                />
              ))}
            </FormGroup>
          </FormControl>

          <FormControl component="fieldset">
            <FormLabel sx={{ fontWeight: 600, mb: 0.5 }}>Maintenance</FormLabel>
            <FormGroup row>
              {['2AA', 'KAA'].map(code => (
                <FormControlLabel
                  key={code}
                  control={
                    <Checkbox
                      checked={form.matCode === code}
                      onChange={() => set('matCode', form.matCode === code ? '' : code)}
                      sx={{ '& .MuiSvgIcon-root': { fontSize: 28 } }}
                    />
                  }
                  label={code}
                />
              ))}
            </FormGroup>
            {jobData.matCode && (
              <Typography variant="caption" color="text.secondary">
                From job: {jobData.matCode}
              </Typography>
            )}
          </FormControl>

          <FormControl component="fieldset">
            <FormLabel sx={{ fontWeight: 600, mb: 0.5 }}>Fuse</FormLabel>
            <FormGroup row>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.matCode === '2AJ'}
                    onChange={() => set('matCode', form.matCode === '2AJ' ? '' : '2AJ')}
                    sx={{ '& .MuiSvgIcon-root': { fontSize: 28 } }}
                  />
                }
                label="2AJ"
              />
            </FormGroup>
          </FormControl>

          <FormControlLabel
            control={
              <Checkbox
                checked={form.cancel}
                onChange={(e) => set('cancel', e.target.checked)}
                sx={{ '& .MuiSvgIcon-root': { fontSize: 28 } }}
              />
            }
            label="Cancel / COA"
          />
        </Box>
      </Paper>

      {/* Specialized Equipment */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <FormControl component="fieldset">
          <FormLabel sx={{ fontWeight: 600, mb: 0.5 }}>Specialized Equipment</FormLabel>
          <FormGroup row>
            {SPECIALIZED_EQUIPMENT.map(eq => (
              <FormControlLabel
                key={eq.key}
                control={
                  <Checkbox
                    checked={!!form.specialEquipment[eq.key]}
                    onChange={() => toggleSet('specialEquipment', eq.key)}
                    sx={{ '& .MuiSvgIcon-root': { fontSize: 28 } }}
                  />
                }
                label={eq.label}
              />
            ))}
          </FormGroup>
          <TextField
            label="Other"
            value={form.specialEquipmentOther}
            onChange={(e) => set('specialEquipmentOther', e.target.value)}
            size="small"
            fullWidth
            sx={{ mt: 1 }}
          />
          {jobData.preFieldLabels?.craneRequired && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
              Crane auto-checked from pre-field data
            </Typography>
          )}
        </FormControl>
      </Paper>

      {/* Traffic Control */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <FormControl component="fieldset">
          <FormLabel sx={{ fontWeight: 600, mb: 0.5 }}>Traffic Control</FormLabel>
          <FormGroup row>
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.trafficControl === 'standard'}
                  onChange={() => set('trafficControl', form.trafficControl === 'standard' ? '' : 'standard')}
                  sx={{ '& .MuiSvgIcon-root': { fontSize: 28 } }}
                />
              }
              label="Standard (2 Man Crew)"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.trafficControl === 'specialized'}
                  onChange={() => set('trafficControl', form.trafficControl === 'specialized' ? '' : 'specialized')}
                  sx={{ '& .MuiSvgIcon-root': { fontSize: 28 } }}
                />
              }
              label="Specialized Traffic"
            />
          </FormGroup>
          {form.trafficControl === 'specialized' && (
            <TextField
              label="Crew Count"
              value={form.specializedTrafficCrewCount}
              onChange={(e) => set('specializedTrafficCrewCount', e.target.value)}
              type="number"
              size="small"
              sx={{ mt: 1, maxWidth: 120 }}
            />
          )}
        </FormControl>
      </Paper>

      {/* Excavation */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <FormControl component="fieldset">
          <FormLabel sx={{ fontWeight: 600, mb: 0.5 }}>Excavation</FormLabel>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              label="Total Hours Spent"
              value={form.excavationHours}
              onChange={(e) => set('excavationHours', e.target.value)}
              type="number"
              size="small"
              sx={{ maxWidth: 150 }}
            />
            <FormGroup row>
              {EXCAVATION_METHODS.map(m => (
                <FormControlLabel
                  key={m.key}
                  control={
                    <Checkbox
                      checked={!!form.excavationMethods[m.key]}
                      onChange={() => toggleSet('excavationMethods', m.key)}
                      sx={{ '& .MuiSvgIcon-root': { fontSize: 28 } }}
                    />
                  }
                  label={m.label}
                />
              ))}
            </FormGroup>
          </Box>
        </FormControl>
      </Paper>

      {/* Restoration */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <FormControl component="fieldset">
          <FormLabel sx={{ fontWeight: 600, mb: 0.5 }}>Restoration</FormLabel>
          <FormGroup row>
            {RESTORATION_TYPES.map(r => (
              <FormControlLabel
                key={r.key}
                control={
                  <Checkbox
                    checked={!!form.restoration[r.key]}
                    onChange={() => toggleSet('restoration', r.key)}
                    sx={{ '& .MuiSvgIcon-root': { fontSize: 28 } }}
                  />
                }
                label={r.label}
              />
            ))}
          </FormGroup>
          {form.restoration.other && (
            <TextField
              label="Other Restoration"
              value={form.restorationOther}
              onChange={(e) => set('restorationOther', e.target.value)}
              size="small"
              sx={{ mt: 1 }}
            />
          )}
        </FormControl>
      </Paper>

      {/* Trip-O-Link Adders */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <FormControl component="fieldset">
          <FormLabel sx={{ fontWeight: 600, mb: 0.5 }}>Trip-O-Link Replacement Adders</FormLabel>
          <FormGroup row>
            {TRIP_ADDERS.map(a => (
              <FormControlLabel
                key={a.key}
                control={
                  <Checkbox
                    checked={!!form.tripAdders[a.key]}
                    onChange={() => toggleSet('tripAdders', a.key)}
                    sx={{ '& .MuiSvgIcon-root': { fontSize: 28 } }}
                  />
                }
                label={a.label}
              />
            ))}
          </FormGroup>
        </FormControl>
      </Paper>

      {/* Electric Crew Hours */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
          Electric Crew
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          <TextField
            label="ST Crew Headcount"
            value={form.stCrewHeadcount}
            onChange={(e) => set('stCrewHeadcount', e.target.value)}
            type="number"
            size="small"
            helperText={lmeData?.labor?.length ? 'From LME' : ''}
            sx={{ maxWidth: 160 }}
          />
          <TextField
            label="Standard Time Hours"
            value={form.stHours}
            onChange={(e) => set('stHours', e.target.value)}
            type="number"
            size="small"
            helperText={lmeData?.labor?.length ? 'From LME' : ''}
            sx={{ maxWidth: 170 }}
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            label="Premium Crew Headcount"
            value={form.premiumCrewHeadcount}
            onChange={(e) => set('premiumCrewHeadcount', e.target.value)}
            type="number"
            size="small"
            sx={{ maxWidth: 180 }}
          />
          <TextField
            label="Premium Time Hours"
            value={form.premiumHours}
            onChange={(e) => set('premiumHours', e.target.value)}
            type="number"
            size="small"
            sx={{ maxWidth: 170 }}
          />
        </Box>
        {lmeData?.labor?.length > 0 && (
          <Alert severity="info" variant="outlined" sx={{ mt: 1.5 }}>
            Hours auto-filled from LME: {lmeData.labor.length} worker{lmeData.labor.length > 1 ? 's' : ''} logged
          </Alert>
        )}
      </Paper>

      {/* Comments */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <TextField
          label="Comments"
          value={form.comments}
          onChange={(e) => set('comments', e.target.value)}
          multiline
          rows={3}
          fullWidth
        />
      </Paper>

      {/* Validation */}
      {validation.errors.length > 0 && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {validation.errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </Alert>
      )}

      {/* Submit */}
      <Button
        fullWidth
        variant="contained"
        size="large"
        startIcon={form.cancel ? <CheckCircleIcon /> : <SaveIcon />}
        onClick={handleSubmit}
        disabled={disabled || !validation.valid}
        sx={{ py: 1.5, fontWeight: 700, fontSize: '1rem' }}
      >
        {form.cancel ? 'Mark Canceled / COA' : 'Complete Billing Form'}
      </Button>
    </Box>
  );
};

BillingCompletionForm.propTypes = {
  jobData: PropTypes.object,
  lmeData: PropTypes.shape({
    labor: PropTypes.array,
    totals: PropTypes.object,
  }),
  unitEntries: PropTypes.array,
  onComplete: PropTypes.func,
  disabled: PropTypes.bool,
};

export default BillingCompletionForm;

