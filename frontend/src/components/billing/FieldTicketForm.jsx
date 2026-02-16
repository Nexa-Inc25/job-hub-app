/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Field Ticket Form - T&M / Change Order Capture (Orchestrator)
 *
 * Mobile-first form for capturing Time & Material work.
 * Sub-components extracted to keep this file focused on form state and submission.
 *
 * @module components/billing/FieldTicketForm
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import {
  Box,
  Typography,
  Button,
  IconButton,
  TextField,
  Card,
  CardContent,
  Chip,
  Alert,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import CameraIcon from '@mui/icons-material/CameraAlt';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckIcon from '@mui/icons-material/Check';
import WarningIcon from '@mui/icons-material/Warning';
import DrawIcon from '@mui/icons-material/Draw';
import { useGeolocation } from '../../hooks/useGeolocation';
import GPSPhotoCapture from './GPSPhotoCapture';
import SignatureCapture from './SignatureCapture';
import FieldTicketLaborSection from './FieldTicketLaborSection';
import FieldTicketEquipmentSection from './FieldTicketEquipmentSection';
import FieldTicketMaterialSection from './FieldTicketMaterialSection';
import FieldTicketSummary from './FieldTicketSummary';
import api from '../../api';
import { useAppColors } from '../shared/themeUtils';

// Change reason options
const CHANGE_REASONS = [
  { value: 'scope_change', label: 'Scope Change', desc: 'Utility changed work scope' },
  { value: 'unforeseen_condition', label: 'Unforeseen Condition', desc: 'Hit obstruction, rock, etc.' },
  { value: 'utility_request', label: 'Utility Request', desc: 'Utility asked for additional work' },
  { value: 'safety_requirement', label: 'Safety Requirement', desc: 'Safety issue required extra work' },
  { value: 'permit_requirement', label: 'Permit Requirement', desc: 'Permit required additional scope' },
  { value: 'design_error', label: 'Design Error', desc: 'Design was incorrect' },
  { value: 'weather_damage', label: 'Weather Damage', desc: 'Weather caused additional work' },
  { value: 'third_party_damage', label: 'Third Party Damage', desc: 'Someone else damaged work' },
  { value: 'other', label: 'Other', desc: 'Other reason' },
];

// Total calculation helpers
const calcLaborTotal = (entries) => entries.reduce((sum, e) => sum + (e.regularHours * e.regularRate) + (e.overtimeHours * (e.overtimeRate || e.regularRate * 1.5)) + (e.doubleTimeHours * (e.doubleTimeRate || e.regularRate * 2)), 0);
const calcEquipmentTotal = (entries) => entries.reduce((sum, e) => sum + (e.hours * e.hourlyRate) + (e.standbyHours * (e.standbyRate || e.hourlyRate * 0.5)), 0);
const calcMaterialTotal = (entries) => entries.reduce((sum, e) => { const b = e.quantity * e.unitCost; return sum + b + b * ((e.markup || 0) / 100); }, 0);

/**
 * Main Field Ticket Form Component (Orchestrator)
 */
const FieldTicketForm = ({ jobId: propJobId, job: propJob, onSuccess, onCancel }) => {
  const COLORS = useAppColors();
  const { position } = useGeolocation();
  const { jobId: urlJobId, ticketId } = useParams();
  const navigate = useNavigate();
  const jobId = propJobId || urlJobId;
  const isEditMode = Boolean(ticketId);

  // Job data state
  const [job, setJob] = useState(propJob || null);
  const [loadingJob, setLoadingJob] = useState(!propJob && !!jobId);
  const [loadingTicket, setLoadingTicket] = useState(isEditMode);

  // Form state
  const [changeReason, setChangeReason] = useState('');
  const [changeDescription, setChangeDescription] = useState('');
  const [workDate, setWorkDate] = useState(new Date().toISOString().split('T')[0]);
  const [workStartTime, setWorkStartTime] = useState('07:00');
  const [workEndTime, setWorkEndTime] = useState('15:30');
  const [laborEntries, setLaborEntries] = useState([]);
  const [equipmentEntries, setEquipmentEntries] = useState([]);
  const [materialEntries, setMaterialEntries] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [internalNotes, setInternalNotes] = useState('');
  const [markupRate, setMarkupRate] = useState(0);

  // Ticket status (needed to show signature section for pending_signature)
  const [ticketStatus, setTicketStatus] = useState(null);

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const [expandedSection, setExpandedSection] = useState('labor');

  // Calculated totals
  const laborTotal = calcLaborTotal(laborEntries);
  const equipmentTotal = calcEquipmentTotal(equipmentEntries);
  const materialTotal = calcMaterialTotal(materialEntries);
  const subtotal = laborTotal + equipmentTotal + materialTotal;
  const grandTotal = subtotal + subtotal * (markupRate / 100);

  // Fetch job data if not provided as prop
  useEffect(() => {
    if (!propJob && jobId) {
      setLoadingJob(true);
      api.get(`/api/jobs/${jobId}`)
        .then(res => setJob(res.data))
        .catch(err => console.error('Failed to load job:', err))
        .finally(() => setLoadingJob(false));
    }
  }, [propJob, jobId]);

  // Fetch existing field ticket when editing
  useEffect(() => {
    if (!ticketId) return;
    setLoadingTicket(true);
    api.get(`/api/fieldtickets/${ticketId}`)
      .then(res => {
        const t = res.data;
        if (t.status) setTicketStatus(t.status);
        if (t.changeReason) setChangeReason(t.changeReason);
        if (t.changeDescription) setChangeDescription(t.changeDescription);
        if (t.workDate) setWorkDate(new Date(t.workDate).toISOString().split('T')[0]);
        if (t.workStartTime) setWorkStartTime(t.workStartTime);
        if (t.workEndTime) setWorkEndTime(t.workEndTime);
        if (t.laborEntries?.length) setLaborEntries(t.laborEntries);
        if (t.equipmentEntries?.length) setEquipmentEntries(t.equipmentEntries);
        if (t.materialEntries?.length) setMaterialEntries(t.materialEntries);
        if (t.photos?.length) setPhotos(t.photos);
        if (t.internalNotes) setInternalNotes(t.internalNotes);
        if (t.markupRate != null) setMarkupRate(t.markupRate);
        // Populate job data from the populated jobId if we don't have it yet
        if (t.jobId && typeof t.jobId === 'object' && !job) {
          setJob(t.jobId);
        }
      })
      .catch(err => {
        console.error('Failed to load field ticket:', err);
        setError('Failed to load field ticket');
      })
      .finally(() => setLoadingTicket(false));
  }, [ticketId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Acquire GPS location
  const acquireLocation = async () => {
    if (position) {
      return { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, capturedAt: new Date().toISOString() };
    }
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('Geolocation not supported')); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy, capturedAt: new Date().toISOString() }),
        reject,
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
      );
    });
  };

  // Submit the field ticket
  const handleSubmit = async () => {
    if (!changeReason) { setError('Please select a reason for the extra work'); return; }
    if (!changeDescription.trim()) { setError('Please describe the extra work'); return; }
    if (laborEntries.length === 0 && equipmentEntries.length === 0 && materialEntries.length === 0) { setError('Please add at least one labor, equipment, or material entry'); return; }
    if (!isEditMode && photos.length === 0) { setError('Please add at least one photo documenting the extra work'); return; }
    if (!jobId) { setError('Job ID is missing. Please try again from the job details page.'); return; }

    setSubmitting(true);
    setError(null);

    try {
      // Build the update payload (no GPS/location needed for edits - already captured on creation)
      const ticketData = {
        changeDescription,
        workStartTime,
        workEndTime,
        laborEntries: laborEntries.map(e => ({ ...e, totalAmount: (e.regularHours * e.regularRate) + (e.overtimeHours * (e.overtimeRate || e.regularRate * 1.5)) + (e.doubleTimeHours * (e.doubleTimeRate || e.regularRate * 2)) })),
        equipmentEntries: equipmentEntries.map(e => ({ ...e, totalAmount: (e.hours * e.hourlyRate) + (e.standbyHours * (e.standbyRate || e.hourlyRate * 0.5)) })),
        materialEntries: materialEntries.map(e => ({ ...e, totalAmount: (e.quantity * e.unitCost) * (1 + (e.markup || 0) / 100) })),
        photos: photos.map(p => ({ url: p.url || p.dataUrl, r2Key: p.r2Key, fileName: p.fileName, gpsCoordinates: p.gpsCoordinates, capturedAt: p.capturedAt, photoType: 'work_in_progress', description: p.description })),
        markupRate,
        internalNotes,
      };

      if (isEditMode) {
        await api.put(`/api/fieldtickets/${ticketId}`, ticketData);
        if (onSuccess) { onSuccess(); } else { navigate('/billing/change-orders'); }
      } else {
        // New ticket: also requires GPS, jobId, and full metadata
        let location = null;
        try { location = await acquireLocation(); } catch (geoErr) { console.warn('GPS acquisition failed:', geoErr); }
        if (!location) { setError('GPS location is required. Please enable location services and try again.'); setSubmitting(false); return; }

        const createData = {
          ...ticketData,
          jobId: String(jobId),
          changeReason,
          workDate,
          location,
          locationDescription: job?.address || '',
        };

        const response = await api.post('/api/fieldtickets', createData);
        if (onSuccess) { onSuccess(response.data); } else { navigate(`/jobs/${jobId}/close-out`); }
      }
    } catch (err) {
      console.error(`Error ${isEditMode ? 'updating' : 'creating'} field ticket:`, err);
      setError(err.response?.data?.error || `Failed to ${isEditMode ? 'update' : 'create'} field ticket`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => { if (onCancel) { onCancel(); } else { navigate(-1); } };

  // Handle inspector signature submission
  const handleSignatureComplete = async (signatureResult) => {
    try {
      await api.post(`/api/fieldtickets/${ticketId}/sign`, {
        signatureData: signatureResult.signatureData,
        signerName: signatureResult.signerName,
        signerTitle: signatureResult.signerTitle,
        signerCompany: signatureResult.signerCompany,
        signerEmployeeId: signatureResult.signerEmployeeId,
        signatureLocation: signatureResult.signatureLocation,
      });
      setTicketStatus('signed');
      setShowSignature(false);
      if (onSuccess) { onSuccess(); } else { navigate('/billing/change-orders'); }
    } catch (err) {
      throw new Error(err.response?.data?.error || 'Failed to save signature');
    }
  };

  if (loadingJob || loadingTicket) {
    return (<Box sx={{ bgcolor: COLORS.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress sx={{ color: COLORS.primary }} /></Box>);
  }
  if (!jobId) {
    return (<Box sx={{ bgcolor: COLORS.bg, minHeight: '100vh', p: 4 }}><Alert severity="error">No job ID provided. Please access this form from a job detail page.</Alert><Button onClick={() => navigate('/jobs')} sx={{ mt: 2, color: COLORS.primary }}>Go to Jobs</Button></Box>);
  }

  return (
    <Box sx={{ bgcolor: COLORS.bg, minHeight: '100vh', pb: 10 }}>
      {/* Header */}
      <Box sx={{ bgcolor: COLORS.surface, p: 2, borderBottom: `1px solid ${COLORS.border}`, position: 'sticky', top: 0, zIndex: 10 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="h6" sx={{ color: COLORS.text, fontWeight: 600 }}>{isEditMode ? 'Review Field Ticket' : 'T&M Field Ticket'}</Typography>
            <Typography variant="body2" sx={{ color: COLORS.textSecondary }}>WO: {job?.woNumber || job?.pmNumber || 'N/A'}</Typography>
          </Box>
          <Chip icon={<WarningIcon />} label="Extra Work" sx={{ bgcolor: COLORS.warning, color: COLORS.bg, fontWeight: 600 }} />
        </Box>
      </Box>

      <Box sx={{ p: 2 }}>
        {error && (<Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>)}

        {/* Reason for Extra Work */}
        <Card sx={{ mb: 2, bgcolor: COLORS.surface }}>
          <CardContent>
            <Typography variant="subtitle1" sx={{ color: COLORS.text, mb: 2, fontWeight: 600 }}>Reason for Extra Work *</Typography>
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel sx={{ color: COLORS.textSecondary }}>Select Reason</InputLabel>
              <Select value={changeReason} label="Select Reason" onChange={(e) => setChangeReason(e.target.value)} sx={{ bgcolor: COLORS.surfaceLight, color: COLORS.text }}>
                {CHANGE_REASONS.map(r => (<MenuItem key={r.value} value={r.value}><Box><Typography variant="body2">{r.label}</Typography><Typography variant="caption" sx={{ color: COLORS.textSecondary }}>{r.desc}</Typography></Box></MenuItem>))}
              </Select>
            </FormControl>
            <TextField label="Description of Extra Work *" value={changeDescription} onChange={(e) => setChangeDescription(e.target.value)} multiline rows={3} fullWidth placeholder="Describe what happened and what extra work was required..." InputProps={{ sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text } }} InputLabelProps={{ sx: { color: COLORS.textSecondary } }} />
          </CardContent>
        </Card>

        {/* Date/Time */}
        <Card sx={{ mb: 2, bgcolor: COLORS.surface }}>
          <CardContent>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField label="Work Date" type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} size="small" InputProps={{ sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text } }} InputLabelProps={{ sx: { color: COLORS.textSecondary }, shrink: true }} sx={{ flex: 1 }} />
              <TextField label="Start" type="time" value={workStartTime} onChange={(e) => setWorkStartTime(e.target.value)} size="small" InputProps={{ sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text } }} InputLabelProps={{ sx: { color: COLORS.textSecondary }, shrink: true }} />
              <TextField label="End" type="time" value={workEndTime} onChange={(e) => setWorkEndTime(e.target.value)} size="small" InputProps={{ sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text } }} InputLabelProps={{ sx: { color: COLORS.textSecondary }, shrink: true }} />
            </Box>
          </CardContent>
        </Card>

        {/* Extracted Section Components */}
        <FieldTicketLaborSection entries={laborEntries} onChange={setLaborEntries} expanded={expandedSection === 'labor'} onToggle={() => setExpandedSection(expandedSection === 'labor' ? '' : 'labor')} total={laborTotal} />
        <FieldTicketEquipmentSection entries={equipmentEntries} onChange={setEquipmentEntries} expanded={expandedSection === 'equipment'} onToggle={() => setExpandedSection(expandedSection === 'equipment' ? '' : 'equipment')} total={equipmentTotal} />
        <FieldTicketMaterialSection entries={materialEntries} onChange={setMaterialEntries} expanded={expandedSection === 'materials'} onToggle={() => setExpandedSection(expandedSection === 'materials' ? '' : 'materials')} total={materialTotal} />

        {/* Photos */}
        <Card sx={{ mb: 2, bgcolor: COLORS.surface }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="subtitle1" sx={{ color: COLORS.text, fontWeight: 600 }}>Photo Documentation ({photos.length})</Typography>
              <Button startIcon={<CameraIcon />} onClick={() => setShowCamera(true)} variant="outlined" size="small" sx={{ color: COLORS.primary, borderColor: COLORS.primary, minHeight: 44 }}>Add Photo</Button>
            </Box>
            {photos.length > 0 ? (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {photos.map((photo) => (
                  <Box key={photo.id || photo.url || photo.dataUrl} sx={{ width: 80, height: 80, borderRadius: 1, overflow: 'hidden', position: 'relative' }}>
                    <img src={photo.dataUrl || photo.url} alt={photo.description || 'Field ticket documentation'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <IconButton size="small" onClick={() => setPhotos(photos.filter(p => (p.id || p.url || p.dataUrl) !== (photo.id || photo.url || photo.dataUrl)))} sx={{ position: 'absolute', top: 2, right: 2, bgcolor: COLORS.error, width: 20, height: 20, '&:hover': { bgcolor: COLORS.error } }}>
                      <DeleteIcon sx={{ fontSize: 14, color: COLORS.text }} />
                    </IconButton>
                  </Box>
                ))}
              </Box>
            ) : (<Typography variant="body2" sx={{ color: COLORS.textSecondary }}>At least one photo is required</Typography>)}
          </CardContent>
        </Card>

        {/* Summary */}
        <FieldTicketSummary laborTotal={laborTotal} equipmentTotal={equipmentTotal} materialTotal={materialTotal} markupRate={markupRate} onMarkupRateChange={setMarkupRate} />

        {/* Notes */}
        <Card sx={{ mb: 2, bgcolor: COLORS.surface }}>
          <CardContent>
            <TextField label="Internal Notes" value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} multiline rows={2} fullWidth placeholder="Notes for internal use only..." InputProps={{ sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text } }} InputLabelProps={{ sx: { color: COLORS.textSecondary } }} />
          </CardContent>
        </Card>

        {/* Inspector Signature Section - shown when ticket is pending_signature */}
        {ticketStatus === 'pending_signature' && (
          <Card sx={{ mb: 2, bgcolor: COLORS.surface, border: `2px solid ${COLORS.warning}` }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <DrawIcon sx={{ color: COLORS.warning }} />
                <Typography variant="subtitle1" sx={{ color: COLORS.text, fontWeight: 600 }}>
                  Inspector Signature Required
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ color: COLORS.textSecondary, mb: 2 }}>
                This change order is ready for the inspector to review and sign.
                Hand the device to the inspector to collect their signature.
              </Typography>
              <Button
                variant="contained"
                fullWidth
                size="large"
                startIcon={<DrawIcon />}
                onClick={() => setShowSignature(true)}
                sx={{
                  bgcolor: COLORS.warning,
                  color: COLORS.bg,
                  fontWeight: 700,
                  fontSize: '1rem',
                  minHeight: 56,
                  '&:hover': { bgcolor: COLORS.warning, filter: 'brightness(0.9)' },
                }}
              >
                Collect Inspector Signature
              </Button>
            </CardContent>
          </Card>
        )}
      </Box>

      {/* Fixed Bottom Bar */}
      <Box sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, bgcolor: COLORS.surface, borderTop: `1px solid ${COLORS.border}`, p: 2, display: 'flex', gap: 2 }}>
        <Button onClick={handleCancel} sx={{ flex: 1, color: COLORS.textSecondary, minHeight: 44 }}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={submitting} startIcon={submitting ? <CircularProgress size={20} /> : <CheckIcon />} sx={{ flex: 2, bgcolor: COLORS.primary, color: COLORS.bg, fontWeight: 600, minHeight: 44, '&:hover': { bgcolor: COLORS.primaryDark }, '&:disabled': { bgcolor: COLORS.border } }}>
          {submitting ? 'Saving...' : `${isEditMode ? 'Update' : 'Create'} Ticket ($${grandTotal.toFixed(2)})`}
        </Button>
      </Box>

      {/* Dialogs */}
      <GPSPhotoCapture open={showCamera} onClose={() => setShowCamera(false)} onCapture={(photoData) => { setPhotos([...photos, photoData]); setShowCamera(false); }} photoType="work_in_progress" />
      <SignatureCapture open={showSignature} onClose={() => setShowSignature(false)} onComplete={handleSignatureComplete} title="Inspector Signature" requireName={true} requireCompany={true} showGPS={true} />
    </Box>
  );
};

FieldTicketForm.propTypes = {
  jobId: PropTypes.string,
  job: PropTypes.object,
  onSuccess: PropTypes.func,
  onCancel: PropTypes.func,
};

export default FieldTicketForm;
