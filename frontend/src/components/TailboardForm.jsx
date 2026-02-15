/**
 * FieldLedger - TailboardForm Component (Orchestrator)
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 *
 * Daily tailboard/JHA form for crew safety briefings.
 * Sub-components in frontend/src/components/tailboard/
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Paper, Typography, TextField, Button, Chip, Grid, IconButton,
  Alert, Snackbar, Select, MenuItem, FormControl, InputLabel, CircularProgress,
} from '@mui/material';
import BackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SaveIcon from '@mui/icons-material/Save';
import SendIcon from '@mui/icons-material/Send';
import HospitalIcon from '@mui/icons-material/LocalHospital';
import api from '../api';
import SignaturePad from './shared/SignaturePad';
import {
  TailboardHazardSection, TailboardPPESection, TailboardMitigationSection,
  TailboardCrewSignatures, TailboardWeatherDisplay, TailboardUGChecklist,
} from './tailboard';
import { STANDARD_PPE, SPECIAL_MITIGATIONS, UG_CHECKLIST_ITEMS, INSPECTOR_OPTIONS } from './tailboard/constants';
import { populateFormFromTailboard } from './tailboard/utils';

// Stable TextField wrapper - defined outside component to prevent focus loss on re-render
// eslint-disable-next-line react/prop-types
const F = ({ disabled, ...props }) => <TextField size="small" disabled={disabled} fullWidth {...props} />;

const TailboardForm = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [job, setJob] = useState(null);
  const [tailboard, setTailboard] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }));
  const [taskDescription, setTaskDescription] = useState('');
  const [jobSteps, setJobSteps] = useState('');
  const [hazards, setHazards] = useState([]);
  const [hazardsDescription, setHazardsDescription] = useState('');
  const [mitigationDescription, setMitigationDescription] = useState('');
  const [ppeRequired, setPpeRequired] = useState(STANDARD_PPE.map(p => ({ item: p.item, checked: false })));
  const [crewMembers, setCrewMembers] = useState([]);
  const [weatherConditions, setWeatherConditions] = useState('');
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherData, setWeatherData] = useState(null);
  const [weatherError, setWeatherError] = useState(null);
  const [emergencyContact, setEmergencyContact] = useState('911');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [nearestHospital, setNearestHospital] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [pmNumber, setPmNumber] = useState('');
  const [circuit, setCircuit] = useState('');
  const [showUpYardLocation, setShowUpYardLocation] = useState('');
  const [generalForemanName, setGeneralForemanName] = useState('');
  const [inspector, setInspector] = useState('');
  const [inspectorName, setInspectorName] = useState('');
  const [eicName, setEicName] = useState('');
  const [eicPhone, setEicPhone] = useState('');
  const [specialMitigations, setSpecialMitigations] = useState(SPECIAL_MITIGATIONS.map(m => ({ item: m.id, value: null })));
  const [groundingNeeded, setGroundingNeeded] = useState(null);
  const [groundingAccountedFor, setGroundingAccountedFor] = useState(null);
  const [groundingLocations, setGroundingLocations] = useState([]);
  const [sourceSideDevices, setSourceSideDevices] = useState([{ device: '', physicalLocation: '' }]);
  const [nominalVoltages, setNominalVoltages] = useState('');
  const [copperConditionInspected, setCopperConditionInspected] = useState(null);
  const [notTiedIntoCircuit, setNotTiedIntoCircuit] = useState(false);
  const [ugChecklist, setUgChecklist] = useState(UG_CHECKLIST_ITEMS.map(item => ({ item: item.id, value: null })));
  const [showUgChecklist, setShowUgChecklist] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const allSetters = {
    setDate, setStartTime, setTaskDescription, setJobSteps, setHazards, setHazardsDescription,
    setMitigationDescription, setPpeRequired, setCrewMembers, setWeatherConditions, setEmergencyContact,
    setEmergencyPhone, setNearestHospital, setAdditionalNotes, setPmNumber, setCircuit,
    setShowUpYardLocation, setGeneralForemanName, setInspector, setInspectorName, setEicName, setEicPhone,
    setSpecialMitigations, setGroundingNeeded, setGroundingAccountedFor, setGroundingLocations,
    setSourceSideDevices, setNominalVoltages, setCopperConditionInspected, setNotTiedIntoCircuit,
    setUgChecklist, setShowUgChecklist,
  };

  const fetchWeather = useCallback(async () => {
    if (!navigator.geolocation) { setWeatherError('Geolocation not supported'); return; }
    setWeatherLoading(true); setWeatherError(null);
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
      });
      const { latitude, longitude } = pos.coords;
      const res = await api.get(`/api/weather/current?lat=${latitude}&lng=${longitude}`);
      setWeatherData(res.data);
      // Handle placeholder/unavailable weather (API key not configured)
      if (res.data.mock || res.data.source === 'placeholder') {
        setWeatherConditions('');
        setWeatherError(res.data.warning || 'Weather service not configured');
      } else if (res.data.source === 'error') {
        setWeatherConditions('');
        setWeatherError(res.data.error || 'Weather service error');
      } else {
        setWeatherConditions(res.data.formatted || `${res.data.temperature}°F, ${res.data.conditions}`);
        if (res.data.workStatus?.blocked) setWeatherError(`Warning: ${res.data.workStatus.reason}`);
      }
    } catch (err) {
      // Mark weather as unavailable so manual entry is enabled
      setWeatherData({ source: 'error', mock: true });
      if (err.code === 1) setWeatherError('Location permission denied');
      else if (err.code === 2) setWeatherError('Location unavailable');
      else if (err.code === 3) setWeatherError('Location timeout');
      else setWeatherError(err.response?.data?.error || 'Failed to fetch weather');
    } finally { setWeatherLoading(false); }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const jobRes = await api.get(`/api/jobs/${jobId}`);
        setJob(jobRes.data);
        if (jobRes.data.pmNumber) setPmNumber(jobRes.data.pmNumber);
        try {
          const tbRes = await api.get(`/api/tailboard/job/${jobId}/today`);
          if (tbRes.data) { setTailboard(tbRes.data); populateFormFromTailboard(tbRes.data, allSetters); }
        } catch { /* No tailboard for today */ }
        if (!taskDescription && jobRes.data.jobScope?.summary) setTaskDescription(jobRes.data.jobScope.summary);
      } catch (error) {
        console.error('Error loading data:', error);
        setSnackbar({ open: true, message: 'Failed to load job data', severity: 'error' });
      } finally { setLoading(false); }
    };
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const isCompleted = tailboard?.status === 'completed';
  useEffect(() => { if (!weatherConditions && !isCompleted) fetchWeather(); }, [fetchWeather, weatherConditions, isCompleted]);

  const buildData = () => ({
    jobId, date: new Date(date), startTime, taskDescription, jobSteps, hazards, hazardsDescription,
    mitigationDescription, specialMitigations, ppeRequired, crewMembers, weatherConditions,
    emergencyContact, emergencyPhone, nearestHospital, additionalNotes, pmNumber, circuit,
    showUpYardLocation, generalForemanName, inspector, inspectorName, eicName, eicPhone,
    sourceSideDevices: sourceSideDevices.filter(d => d.device || d.physicalLocation),
    grounding: { needed: groundingNeeded, accountedFor: groundingAccountedFor, locations: groundingLocations },
    nominalVoltages, copperConditionInspected, notTiedIntoCircuit, ugChecklist: showUgChecklist ? ugChecklist : [],
  });

  const handleSave = async () => {
    try { setSaving(true);
      const res = tailboard?._id ? await api.put(`/api/tailboard/${tailboard._id}`, buildData()) : await api.post('/api/tailboard', buildData());
      setTailboard(res.data); setSnackbar({ open: true, message: 'Tailboard saved', severity: 'success' });
    } catch { setSnackbar({ open: true, message: 'Failed to save tailboard', severity: 'error' });
    } finally { setSaving(false); }
  };

  const handleComplete = async () => {
    try { setSaving(true);
      let cur = tailboard;
      const sRes = cur?._id ? await api.put(`/api/tailboard/${cur._id}`, buildData()) : await api.post('/api/tailboard', buildData());
      cur = sRes.data; setTailboard(cur);
      const cRes = await api.post(`/api/tailboard/${cur._id}/complete`);
      setTailboard(cRes.data); setSnackbar({ open: true, message: 'Tailboard completed!', severity: 'success' });
      setTimeout(() => navigate(`/jobs/${jobId}/closeout`), 1500);
    } catch (err) { setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to complete tailboard', severity: 'error' });
    } finally { setSaving(false); }
  };

  const handleAddSignature = async (sigData) => {
    try {
      if (tailboard?._id) { const r = await api.post(`/api/tailboard/${tailboard._id}/sign`, sigData); setCrewMembers(r.data.crewMembers); }
      else { setCrewMembers([...crewMembers, { id: `crew-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, ...sigData, signedAt: new Date() }]); } // NOSONAR
      setSnackbar({ open: true, message: `${sigData.name} signed`, severity: 'success' });
    } catch { setSnackbar({ open: true, message: 'Failed to add signature', severity: 'error' }); }
  };

  const handleMitigationChange = useCallback((itemId, v) => { setSpecialMitigations(p => p.map(m => m.item === itemId ? { ...m, value: v } : m)); }, []);
  const handleUgChecklistChange = useCallback((itemId, v) => { setUgChecklist(p => p.map(i => i.item === itemId ? { ...i, value: v } : i)); }, []);
  const handleAddGroundingLocation = useCallback(() => {
    setGroundingLocations(p => [...p, { id: `gnd-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, location: '', installed: false, removed: false }]); // NOSONAR
  }, []);
  const handleGroundingLocationChange = useCallback((idx, field, val) => {
    setGroundingLocations(p => { const u = [...p]; u[idx] = { ...u[idx], [field]: val }; return u; });
  }, []);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}><CircularProgress /></Box>;
  const canSubmit = (hazards.length > 0 || hazardsDescription.trim().length > 0) && crewMembers.length > 0;
  const d = isCompleted; // shorthand for disabled prop

  return (
    <Box sx={{ p: { xs: 1, sm: 2 }, maxWidth: 900, mx: 'auto' }}>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <IconButton onClick={() => navigate(`/jobs/${jobId}/closeout`)} aria-label="Go back to close out"><BackIcon /></IconButton>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>Daily Tailboard / JHA</Typography>
            <Typography variant="body2" color="text.secondary">WO# {job?.woNumber} • {job?.address}</Typography>
          </Box>
          {isCompleted && <Chip label="Completed" color="success" icon={<CheckCircleIcon />} />}
        </Box>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid size={{ xs: 6, sm: 3 }}><F disabled={d} label="Date" type="date" value={date} onChange={e => setDate(e.target.value)} InputLabelProps={{ shrink: true }} /></Grid>
          <Grid size={{ xs: 6, sm: 3 }}><F disabled={d} label="Start Time" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} InputLabelProps={{ shrink: true }} /></Grid>
          <Grid size={{ xs: 6, sm: 3 }}><F disabled={d} label="PM#" value={pmNumber} onChange={e => setPmNumber(e.target.value)} placeholder="Project #" /></Grid>
          <Grid size={{ xs: 6, sm: 3 }}><F disabled={d} label="Circuit#" value={circuit} onChange={e => setCircuit(e.target.value)} /></Grid>
        </Grid>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid size={{ xs: 12, sm: 6 }}><F disabled={d} label="General Foreman" value={generalForemanName} onChange={e => setGeneralForemanName(e.target.value)} /></Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <FormControl fullWidth size="small"><InputLabel>Inspector</InputLabel>
              <Select value={inspector} onChange={e => setInspector(e.target.value)} label="Inspector" disabled={isCompleted}>
                <MenuItem value="">None</MenuItem>{INSPECTOR_OPTIONS.map(o => <MenuItem key={o.id} value={o.id}>{o.label}</MenuItem>)}
              </Select></FormControl>
          </Grid>
          {inspector === 'other' && <Grid size={{ xs: 6, sm: 3 }}><F disabled={d} label="Inspector Name" value={inspectorName} onChange={e => setInspectorName(e.target.value)} /></Grid>}
        </Grid>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid size={{ xs: 6, sm: 4 }}><F disabled={d} label="EIC Name" value={eicName} onChange={e => setEicName(e.target.value)} placeholder="Employee In Charge" /></Grid>
          <Grid size={{ xs: 6, sm: 4 }}><F disabled={d} label="EIC Phone" value={eicPhone} onChange={e => setEicPhone(e.target.value)} /></Grid>
          <Grid size={{ xs: 12, sm: 4 }}><F disabled={d} label="Show Up Yard Location" value={showUpYardLocation} onChange={e => setShowUpYardLocation(e.target.value)} /></Grid>
        </Grid>
        <TailboardWeatherDisplay value={weatherConditions} onChange={setWeatherConditions} weatherLoading={weatherLoading} weatherData={weatherData} weatherError={weatherError} onRefresh={fetchWeather} disabled={isCompleted} />
      </Paper>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Summary of Work - Job Steps</Typography>
        <TextField value={jobSteps} onChange={e => setJobSteps(e.target.value)} fullWidth multiline rows={3} disabled={isCompleted} placeholder="Describe the work steps..." sx={{ mb: 2 }} />
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Hazards Associated with Work</Typography>
        <TextField value={hazardsDescription} onChange={e => setHazardsDescription(e.target.value)} fullWidth multiline rows={2} disabled={isCompleted} placeholder="Traffic, pedestrians, overhead loads..." sx={{ mb: 2 }} />
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Mitigation Measures</Typography>
        <TextField value={mitigationDescription} onChange={e => setMitigationDescription(e.target.value)} fullWidth multiline rows={2} disabled={isCompleted} placeholder="T/C, stay out from under loads..." />
      </Paper>
      <Paper sx={{ p: 2, mb: 2 }}><TailboardHazardSection hazards={hazards} onChange={setHazards} disabled={isCompleted} /></Paper>
      <Paper sx={{ p: 2, mb: 2 }}>
        <TailboardMitigationSection specialMitigations={specialMitigations} onMitigationChange={handleMitigationChange}
          groundingNeeded={groundingNeeded} onGroundingNeededChange={setGroundingNeeded} groundingAccountedFor={groundingAccountedFor} onGroundingAccountedForChange={setGroundingAccountedFor}
          groundingLocations={groundingLocations} onGroundingLocationChange={handleGroundingLocationChange} onAddGroundingLocation={handleAddGroundingLocation}
          nominalVoltages={nominalVoltages} onNominalVoltagesChange={setNominalVoltages} copperConditionInspected={copperConditionInspected} onCopperConditionInspectedChange={setCopperConditionInspected}
          notTiedIntoCircuit={notTiedIntoCircuit} onNotTiedIntoCircuitChange={setNotTiedIntoCircuit} disabled={isCompleted} />
      </Paper>
      <Paper sx={{ p: 2, mb: 2 }}><TailboardPPESection value={ppeRequired} onChange={setPpeRequired} disabled={isCompleted} /></Paper>
      <Paper sx={{ p: 2, mb: 2 }}><TailboardCrewSignatures crewMembers={crewMembers} onOpenSignaturePad={() => setSignatureOpen(true)} disabled={isCompleted} /></Paper>
      <Paper sx={{ p: 2, mb: 2 }}><TailboardUGChecklist ugChecklist={ugChecklist} onChecklistChange={handleUgChecklistChange} showChecklist={showUgChecklist} onShowChecklistChange={setShowUgChecklist} disabled={isCompleted} /></Paper>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}><HospitalIcon color="error" /><Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Emergency Information</Typography></Box>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 4 }}><F disabled={d} label="Emergency Contact" value={emergencyContact} onChange={e => setEmergencyContact(e.target.value)} /></Grid>
          <Grid size={{ xs: 12, sm: 4 }}><F disabled={d} label="Emergency Phone" value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)} placeholder="911" /></Grid>
          <Grid size={{ xs: 12, sm: 4 }}><F disabled={d} label="Nearest Hospital" value={nearestHospital} onChange={e => setNearestHospital(e.target.value)} placeholder="Hospital name" /></Grid>
        </Grid>
      </Paper>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Additional Notes</Typography>
        <TextField value={additionalNotes} onChange={e => setAdditionalNotes(e.target.value)} fullWidth multiline rows={2} disabled={isCompleted} placeholder="Any other safety concerns..." />
      </Paper>
      {!isCompleted && (
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mb: 4 }}>
          <Button variant="outlined" startIcon={<SaveIcon />} onClick={handleSave} disabled={saving}>Save Draft</Button>
          <Button variant="contained" color="success" startIcon={<SendIcon />} onClick={handleComplete} disabled={saving || !canSubmit}>Complete Tailboard</Button>
        </Box>
      )}
      <SignaturePad open={signatureOpen} onClose={() => setSignatureOpen(false)} onSave={handleAddSignature} title="Sign Tailboard Acknowledgment" />
      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar({ ...snackbar, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
};

export default TailboardForm;
