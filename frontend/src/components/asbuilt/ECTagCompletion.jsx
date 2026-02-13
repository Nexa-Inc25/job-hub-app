/**
 * FieldLedger - EC Tag Completion Form
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Auto-fills the EC Tag completion section from job data + user profile.
 * The foreman only needs to confirm hours, tap Complete, and sign.
 * 
 * Fields auto-filled:
 *  - LAN ID → from user profile
 *  - Date → today
 *  - Crew type → from company type (Contractor by default for CC companies)
 *  - Hours → from timesheet if available
 * 
 * Fields requiring foreman input:
 *  - Actual hours (pre-filled from timesheet, editable)
 *  - Completion status (Completed / Canceled / Found Completed)
 *  - Signature
 * 
 * Config-driven: field definitions come from UtilityAsBuiltConfig.documentCompletions
 */

import React, { useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import {
  Box, Typography, Button, Paper, TextField, Card, CardContent,
  RadioGroup, Radio, FormControlLabel, FormControl, FormLabel,
  Alert, Chip,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import FindInPageIcon from '@mui/icons-material/FindInPage';
import SaveIcon from '@mui/icons-material/Save';
import PersonIcon from '@mui/icons-material/Person';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import GroupsIcon from '@mui/icons-material/Groups';

/**
 * EC Tag Completion Form
 */
const ECTagCompletion = ({
  // Config (from UtilityAsBuiltConfig.documentCompletions for 'ec_tag')
  fields = [],
  // Job data (auto-fill sources)
  jobData = {},
  userData = {},
  timesheetHours = null,
  // Close-out context data
  ecTagData = null,        // job.ecTag — tag type, due date, comments, urgency
  crewMembers = [],        // From tailboard — who worked today
  lmeData = null,          // Full LME — labor breakdown (ST/OT/DT hours per worker)
  // Callbacks
  onComplete,
  // State
  disabled = false,
}) => {
  // ---- Auto-fill logic ----
  const autoFilled = useMemo(() => {
    const values = {};
    for (const field of fields) {
      if (field.autoFillFrom) {
        const source = field.autoFillFrom;
        if (source === 'today') {
          values[field.fieldName] = new Date().toLocaleDateString('en-US');
        } else if (source === 'user.lanId') {
          values[field.fieldName] = userData.lanId || userData.username || 
            (userData.email ? userData.email.split('@')[0] : '') || userData.name || '';
        } else if (source === 'timesheet.totalHours') {
          values[field.fieldName] = timesheetHours || '';
        } else if (source.startsWith('job.')) {
          const key = source.replace('job.', '');
          values[field.fieldName] = jobData[key] || '';
        }
      }
    }
    return values;
  }, [fields, jobData, userData, timesheetHours]);

  // Derive LAN ID from user data — try lanId, username, or extract from email
  const derivedLanId = userData.lanId || userData.username || 
    (userData.email ? userData.email.split('@')[0] : '') || userData.name || '';

  // Compute best available hours from LME → timesheet → manual
  const computedHours = useMemo(() => {
    // LME has the most detailed breakdown (ST + OT + DT per worker)
    if (lmeData?.labor?.length > 0) {
      return lmeData.labor.reduce(
        (sum, l) => sum + (l.stHours || 0) + (l.otHours || 0) + (l.dtHours || 0), 0
      );
    }
    return timesheetHours || null;
  }, [lmeData, timesheetHours]);

  // Compute hours source label for helper text
  const hoursSource = lmeData?.labor?.length > 0 ? 'From LME' : (timesheetHours ? 'From timesheet' : 'Enter hours worked');

  // ---- Form state ----
  const [formValues, setFormValues] = useState(() => ({
    completionType: 'Completed',
    crewType: 'Contractor',
    actualHours: computedHours?.toString() || '',
    lanId: derivedLanId,
    completionDate: new Date().toLocaleDateString('en-US'),
    ...autoFilled,
  }));
  const [signatureData, setSignatureData] = useState(null);

  const handleChange = (fieldName, value) => {
    setFormValues(prev => ({ ...prev, [fieldName]: value }));
  };

  // ---- Validation ----
  const validation = useMemo(() => {
    const errors = [];
    if (!formValues.lanId) errors.push('LAN ID is required');
    if (!formValues.completionDate) errors.push('Completion date is required');
    if (!formValues.actualHours) errors.push('Actual hours required');
    if (!formValues.completionType) errors.push('Completion status required');
    if (!signatureData) errors.push('Signature required');
    return { valid: errors.length === 0, errors };
  }, [formValues, signatureData]);

  // ---- Submit ----
  const handleSubmit = () => {
    if (!validation.valid) return;
    if (onComplete) {
      onComplete({
        ...formValues,
        signatureData,
        completedAt: new Date().toISOString(),
      });
    }
  };

  // ---- Render ----
  return (
    <Box sx={{ maxWidth: 600, mx: 'auto' }}>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
            EC Tag Completion
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Complete the tag for <strong>{jobData.pmNumber || 'this job'}</strong>.
            Fields are pre-filled from your profile and job data.
          </Typography>

          {/* Job reference info */}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            {jobData.pmNumber && <Chip label={`PM# ${jobData.pmNumber}`} size="small" />}
            {jobData.notificationNumber && <Chip label={`Notif# ${jobData.notificationNumber}`} size="small" variant="outlined" />}
            {jobData.address && <Chip label={jobData.address} size="small" variant="outlined" />}
          </Box>
        </CardContent>
      </Card>

      {/* EC Tag Info — auto-filled from upload AI extraction */}
      {ecTagData && (ecTagData.tagType || ecTagData.commentsSummary) && (
        <Paper
          variant="outlined"
          sx={{
            p: 2, mb: 2,
            borderColor: ecTagData.isUrgent ? 'error.main' : 'info.main',
            bgcolor: ecTagData.isUrgent ? 'error.lighter' : 'info.lighter',
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {ecTagData.isUrgent && <WarningAmberIcon fontSize="small" color="error" />}
            EC Tag Details (from job package)
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
            {ecTagData.tagType && (
              <Chip
                label={`${ecTagData.tagType}-Tag`}
                size="small"
                color={ecTagData.isUrgent ? 'error' : 'info'}
                sx={{ fontWeight: 700 }}
              />
            )}
            {ecTagData.programCode && (
              <Chip label={ecTagData.programCode} size="small" variant="outlined" />
            )}
            {ecTagData.dateRequired && (
              <Chip
                label={`Due: ${new Date(ecTagData.dateRequired).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                size="small"
                variant="outlined"
              />
            )}
            {ecTagData.dateIdentified && (
              <Chip
                label={`ID: ${new Date(ecTagData.dateIdentified).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                size="small"
                variant="outlined"
              />
            )}
          </Box>
          {ecTagData.commentsSummary && (
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem', lineHeight: 1.4 }}>
              <strong>History:</strong> {ecTagData.commentsSummary}
            </Typography>
          )}
        </Paper>
      )}

      {/* Crew from today's Tailboard */}
      {crewMembers.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <GroupsIcon fontSize="small" /> Crew on Site ({crewMembers.length})
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {crewMembers.map((member, idx) => (
              <Chip
                key={member._id || member.name || idx}
                label={member.name || member.email || `Crew ${idx + 1}`}
                size="small"
                variant="outlined"
                icon={<PersonIcon />}
              />
            ))}
          </Box>
        </Paper>
      )}

      {/* LME Hour Breakdown */}
      {lmeData?.labor?.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <AccessTimeIcon fontSize="small" /> LME Hours Breakdown
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {lmeData.labor.map((l, idx) => {
              const totalHrs = (l.stHours || 0) + (l.otHours || 0) + (l.dtHours || 0);
              return (
                <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2">
                    <strong>{l.craft}</strong> — {l.name}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    {l.stHours > 0 && <Chip label={`ST: ${l.stHours}`} size="small" sx={{ fontSize: '0.7rem', height: 20 }} />}
                    {l.otHours > 0 && <Chip label={`OT: ${l.otHours}`} size="small" color="warning" sx={{ fontSize: '0.7rem', height: 20 }} />}
                    {l.dtHours > 0 && <Chip label={`DT: ${l.dtHours}`} size="small" color="error" sx={{ fontSize: '0.7rem', height: 20 }} />}
                    <Typography variant="body2" fontWeight={600} sx={{ minWidth: 40, textAlign: 'right' }}>
                      {totalHrs}h
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Paper>
      )}

      {/* Completion Status */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <FormControl component="fieldset">
          <FormLabel sx={{ fontWeight: 600, mb: 1 }}>Completion Status *</FormLabel>
          <RadioGroup
            value={formValues.completionType}
            onChange={(e) => handleChange('completionType', e.target.value)}
          >
            <FormControlLabel
              value="Completed"
              control={<Radio sx={{ '& .MuiSvgIcon-root': { fontSize: 28 } }} />}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CheckCircleIcon sx={{ color: 'success.main' }} />
                  <Typography variant="body1" fontWeight={500}>Completed</Typography>
                </Box>
              }
              sx={{ py: 1 }}
            />
            <FormControlLabel
              value="Canceled"
              control={<Radio sx={{ '& .MuiSvgIcon-root': { fontSize: 28 } }} />}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CancelIcon sx={{ color: 'error.main' }} />
                  <Typography variant="body1" fontWeight={500}>Canceled</Typography>
                </Box>
              }
              sx={{ py: 1 }}
            />
            <FormControlLabel
              value="Found Completed Upon Arrival"
              control={<Radio sx={{ '& .MuiSvgIcon-root': { fontSize: 28 } }} />}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <FindInPageIcon sx={{ color: 'info.main' }} />
                  <Typography variant="body1" fontWeight={500}>Found Completed Upon Arrival</Typography>
                </Box>
              }
              sx={{ py: 1 }}
            />
          </RadioGroup>
        </FormControl>
      </Paper>

      {/* Auto-filled fields */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <PersonIcon fontSize="small" /> Crew Information
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          <TextField
            label="LAN ID"
            value={formValues.lanId}
            onChange={(e) => handleChange('lanId', e.target.value)}
            size="small"
            required
            helperText="Auto-filled from your profile"
            sx={{ minWidth: 140 }}
          />
          <TextField
            label="Completion Date"
            value={formValues.completionDate}
            size="small"
            InputProps={{ readOnly: true }}
            sx={{ minWidth: 140 }}
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            label="Actual Hours"
            value={formValues.actualHours}
            onChange={(e) => handleChange('actualHours', e.target.value)}
            type="number"
            size="small"
            required
            helperText={hoursSource}
            InputProps={{ inputProps: { min: 0, step: 0.5 } }}
            sx={{ minWidth: 120 }}
          />
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <TextField
              label="Crew Type"
              value={formValues.crewType}
              onChange={(e) => handleChange('crewType', e.target.value)}
              select
              size="small"
              slotProps={{ select: { native: true } }}
            >
              <option value="Contractor">Contractor</option>
              <option value="PG&E Crew">PG&E Crew</option>
              <option value="T-Man">T-Man</option>
            </TextField>
          </FormControl>
        </Box>
      </Paper>

      {/* Signature */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
          Signature *
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
          &ldquo;I verify that all maintenance on this notification is addressed&rdquo;
        </Typography>
        {signatureData ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <img
              src={signatureData}
              alt="Signature"
              style={{ maxWidth: 200, maxHeight: 60, border: '1px solid #ccc', borderRadius: 4 }}
            />
            <Button size="small" onClick={() => setSignatureData(null)}>Clear</Button>
          </Box>
        ) : (
          <Button
            variant="outlined"
            onClick={() => {
              const saved = localStorage.getItem('pdfEditor_signature');
              if (saved) {
                setSignatureData(saved);
              }
            }}
            sx={{ minHeight: 52, minWidth: 200 }}
          >
            <AccessTimeIcon sx={{ mr: 1 }} /> Tap to Sign
          </Button>
        )}
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
        startIcon={<SaveIcon />}
        onClick={handleSubmit}
        disabled={disabled || !validation.valid}
        sx={{ py: 1.5, fontWeight: 700, fontSize: '1rem' }}
      >
        Complete EC Tag
      </Button>
    </Box>
  );
};

ECTagCompletion.propTypes = {
  fields: PropTypes.arrayOf(PropTypes.shape({
    fieldName: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    type: PropTypes.string,
    required: PropTypes.bool,
    autoFillFrom: PropTypes.string,
    options: PropTypes.arrayOf(PropTypes.string),
  })),
  jobData: PropTypes.object,
  userData: PropTypes.object,
  timesheetHours: PropTypes.number,
  ecTagData: PropTypes.shape({
    tagType: PropTypes.string,
    tagDueDate: PropTypes.string,
    programType: PropTypes.string,
    programCode: PropTypes.string,
    isUrgent: PropTypes.bool,
    dateIdentified: PropTypes.string,
    dateRequired: PropTypes.string,
    commentsSummary: PropTypes.string,
  }),
  crewMembers: PropTypes.arrayOf(PropTypes.shape({
    _id: PropTypes.string,
    name: PropTypes.string,
    email: PropTypes.string,
  })),
  lmeData: PropTypes.shape({
    labor: PropTypes.arrayOf(PropTypes.shape({
      craft: PropTypes.string,
      name: PropTypes.string,
      stHours: PropTypes.number,
      otHours: PropTypes.number,
      dtHours: PropTypes.number,
    })),
  }),
  onComplete: PropTypes.func,
  disabled: PropTypes.bool,
};

export default ECTagCompletion;

