/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * PG&E LME Form - Daily Statement of Labor, Material, and Equipment (Orchestrator)
 * Sub-components in frontend/src/components/lme/
 *
 * @module components/LMEForm
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, IconButton, TextField, Paper, Grid,
  Chip, Alert, CircularProgress, Fab,
} from '@mui/material';
import BackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import api from '../api';
import { LMELaborItems, LMEMaterialItems, LMESummary } from './lme';

const LMEForm = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [lmeNumber, setLmeNumber] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('07:00');
  const [endTime, setEndTime] = useState('15:30');
  const [workDescription, setWorkDescription] = useState('');
  const [subcontractorName, setSubcontractorName] = useState('');
  const [missedMeals, setMissedMeals] = useState(0);
  const [subsistanceCount, setSubsistanceCount] = useState(0);
  const [sheetNumber, setSheetNumber] = useState('1');
  const [totalSheets, setTotalSheets] = useState('1');
  const [defaultHours, setDefaultHours] = useState({ stHours: '', otHours: '', dtHours: '' });
  const [laborEntries, setLaborEntries] = useState([
    { craft: '', name: '', stHours: '', otHours: '', dtHours: '', rate: '', stAmount: 0, otAmount: 0, dtAmount: 0, totalAmount: 0, useCustomHours: false }
  ]);
  const [materialEntries, setMaterialEntries] = useState([]);
  const [equipmentEntries, setEquipmentEntries] = useState([]);

  useEffect(() => {
    const loadJob = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/api/jobs/${jobId}`);
        setJob(res.data);
        if (res.data.jobScope?.description) setWorkDescription(res.data.jobScope.description);
        else if (res.data.description) setWorkDescription(res.data.description);
        const dateStr = new Date().toISOString().split('T')[0].replaceAll('-', '');
        setLmeNumber(`${res.data.pmNumber || res.data.woNumber}-${dateStr}`);
      } catch (err) { setError(err.message); }
      finally { setLoading(false); }
    };
    if (jobId) loadJob();
  }, [jobId]);

  const laborTotal = laborEntries.reduce((sum, e) => sum + (e.totalAmount || 0), 0);
  const materialTotal = materialEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
  const equipmentTotal = equipmentEntries.reduce((sum, e) => sum + (e.amount || 0), 0);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      await api.post('/api/lme', {
        jobId, lmeNumber, date, startTime, endTime, workDescription, subcontractorName,
        missedMeals, subsistanceCount, sheetNumber, totalSheets,
        labor: laborEntries.filter(e => e.name),
        materials: materialEntries.filter(e => e.description),
        equipment: equipmentEntries.filter(e => e.type),
        totals: { labor: laborTotal, material: materialTotal, equipment: equipmentTotal, grand: laborTotal + materialTotal + equipmentTotal },
        jobInfo: {
          pmNumber: job?.pmNumber, woNumber: job?.woNumber, notificationNumber: job?.notificationNumber,
          address: job?.address, poNumber: job?.poNumber, fieldAuthNumber: job?.fieldAuthNumber, corNumber: job?.corNumber,
        },
      });
      setSuccess('LME saved successfully!');
      setTimeout(() => navigate(-1), 1500);
    } catch (err) { setError(err.response?.data?.error || err.message); }
    finally { setSaving(false); }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}><CircularProgress /></Box>;

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh', pb: 10 }}>
      <Paper sx={{ p: 2, mb: 2, borderRadius: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <IconButton onClick={() => navigate(-1)} aria-label="Go back"><BackIcon /></IconButton>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" fontWeight="bold" color="primary">Daily Statement of Labor, Material, and Equipment</Typography>
            <Typography variant="body2" color="text.secondary">Pacific Gas and Electric Company - LME Form</Typography>
          </Box>
          <Chip label="ALVAH CONTRACTORS" color="primary" />
        </Box>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Grid container spacing={1}>
                <Grid size={6}><TextField size="small" fullWidth label="PM/NOTIF NO." value={job?.pmNumber || job?.notificationNumber || ''} InputProps={{ readOnly: true }} /></Grid>
                <Grid size={6}><TextField size="small" fullWidth label="JOB NO." value={job?.woNumber || ''} InputProps={{ readOnly: true }} /></Grid>
                <Grid size={6}><TextField size="small" fullWidth label="PO / CWA NO." value={job?.poNumber || ''} InputProps={{ readOnly: true }} /></Grid>
                <Grid size={6}><TextField size="small" fullWidth label="FIELD AUTH. / COR NO." value={job?.fieldAuthNumber || job?.corNumber || ''} InputProps={{ readOnly: true }} /></Grid>
                <Grid size={12}><TextField size="small" fullWidth label="JOB LOCATION" value={`${job?.address || ''}, ${job?.city || ''}`} InputProps={{ readOnly: true }} /></Grid>
              </Grid>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Grid container spacing={1}>
                <Grid size={6}><TextField size="small" fullWidth label="LME No." value={lmeNumber} onChange={e => setLmeNumber(e.target.value)} /></Grid>
                <Grid size={6}><TextField size="small" fullWidth type="date" label="DATE" value={date} onChange={e => setDate(e.target.value)} InputLabelProps={{ shrink: true }} /></Grid>
                <Grid size={3}><TextField size="small" fullWidth type="time" label="START" value={startTime} onChange={e => setStartTime(e.target.value)} InputLabelProps={{ shrink: true }} /></Grid>
                <Grid size={3}><TextField size="small" fullWidth type="time" label="END" value={endTime} onChange={e => setEndTime(e.target.value)} InputLabelProps={{ shrink: true }} /></Grid>
                <Grid size={3}><TextField size="small" fullWidth type="number" label="Missed Meals" value={missedMeals} onChange={e => setMissedMeals(e.target.value)} helperText="0.5 hrs each" /></Grid>
                <Grid size={3}><TextField size="small" fullWidth type="number" label="Subsistance" value={subsistanceCount} onChange={e => setSubsistanceCount(e.target.value)} helperText="Count" /></Grid>
                <Grid size={4}><TextField size="small" fullWidth label="Sheet" value={sheetNumber} onChange={e => setSheetNumber(e.target.value)} /></Grid>
                <Grid size={2} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Typography>of</Typography></Grid>
                <Grid size={6}><TextField size="small" fullWidth value={totalSheets} onChange={e => setTotalSheets(e.target.value)} /></Grid>
              </Grid>
            </Paper>
          </Grid>
          <Grid size={12}><TextField fullWidth multiline rows={2} label="DESCRIPTION OF WORK" value={workDescription} onChange={e => setWorkDescription(e.target.value)} /></Grid>
          <Grid size={12}><TextField fullWidth label="IF SUBCONTRACTOR USED, ENTER NAME(S) HERE" value={subcontractorName} onChange={e => setSubcontractorName(e.target.value)} /></Grid>
        </Grid>
      </Paper>

      {error && <Alert severity="error" sx={{ mx: 2, mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mx: 2, mb: 2 }}>{success}</Alert>}

      <LMELaborItems entries={laborEntries} onEntriesChange={setLaborEntries} defaultHours={defaultHours} onDefaultHoursChange={setDefaultHours} />
      <LMEMaterialItems materialEntries={materialEntries} onMaterialEntriesChange={setMaterialEntries} equipmentEntries={equipmentEntries} onEquipmentEntriesChange={setEquipmentEntries} />
      <LMESummary laborTotal={laborTotal} materialTotal={materialTotal} equipmentTotal={equipmentTotal} />

      <Fab variant="extended" color="primary" onClick={handleSave} disabled={saving} sx={{ position: 'fixed', bottom: 24, right: 24 }}>
        {saving ? <CircularProgress size={20} sx={{ mr: 1 }} /> : <SaveIcon sx={{ mr: 1 }} />}
        {saving ? 'Saving...' : 'Save LME'}
      </Fab>
    </Box>
  );
};

export default LMEForm;
