/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Field Ticket Form - T&M / Change Order Capture
 * 
 * Mobile-first form for capturing Time & Material work.
 * Used when scope changes or unforeseen conditions occur.
 * 
 * Features:
 * - Labor hours by worker (regular, OT, DT)
 * - Equipment hours by asset
 * - Materials used with costs
 * - Photo documentation
 * - Inspector signature capture
 * - GPS verification
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
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import CameraIcon from '@mui/icons-material/CameraAlt';
import PersonIcon from '@mui/icons-material/Person';
import BuildIcon from '@mui/icons-material/Build';
import InventoryIcon from '@mui/icons-material/Inventory';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckIcon from '@mui/icons-material/Check';
import WarningIcon from '@mui/icons-material/Warning';
import { useGeolocation } from '../../hooks/useGeolocation';
import GPSPhotoCapture from './GPSPhotoCapture';
import SignatureCapture from './SignatureCapture';
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

// Worker role options
const WORKER_ROLES = [
  { value: 'foreman', label: 'Foreman', rate: 95 },
  { value: 'journeyman', label: 'Journeyman', rate: 85 },
  { value: 'apprentice', label: 'Apprentice', rate: 55 },
  { value: 'laborer', label: 'Laborer', rate: 45 },
  { value: 'operator', label: 'Operator', rate: 90 },
  { value: 'other', label: 'Other', rate: 65 },
];

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
 * Labor Entry Row Component
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
          <IconButton size="small" onClick={onRemove} sx={{ color: COLORS.error }}>
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
 * Equipment Entry Row Component
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
          <IconButton size="small" onClick={onRemove} sx={{ color: COLORS.error }}>
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
 * Material Entry Row Component
 */
const MaterialEntry = ({ entry, onChange, onRemove }) => {
  const COLORS = useAppColors();
  const base = entry.quantity * entry.unitCost;
  const markup = base * ((entry.markup || 0) / 100);
  const total = base + markup;

  return (
    <Card sx={{ mb: 2, bgcolor: COLORS.surface }}>
      <CardContent sx={{ pb: '16px !important' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <InventoryIcon sx={{ color: '#64b5f6' }} />
            <Typography variant="subtitle2" sx={{ color: COLORS.text }}>
              {entry.description || 'Material'}
            </Typography>
          </Box>
          <IconButton size="small" onClick={onRemove} sx={{ color: COLORS.error }}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            label="M-Code"
            value={entry.materialCode}
            onChange={(e) => onChange({ ...entry, materialCode: e.target.value })}
            size="small"
            placeholder="M123456"
            InputProps={{ sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text } }}
            InputLabelProps={{ sx: { color: COLORS.textSecondary } }}
            sx={{ width: 120 }}
          />
          <TextField
            label="Description"
            value={entry.description}
            onChange={(e) => onChange({ ...entry, description: e.target.value })}
            size="small"
            fullWidth
            InputProps={{ sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text } }}
            InputLabelProps={{ sx: { color: COLORS.textSecondary } }}
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            label="Qty"
            type="number"
            value={entry.quantity}
            onChange={(e) => onChange({ ...entry, quantity: Number.parseFloat(e.target.value) || 0 })}
            size="small"
            inputProps={{ min: 0 }}
            InputProps={{ sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text } }}
            InputLabelProps={{ sx: { color: COLORS.textSecondary } }}
            sx={{ width: 80 }}
          />
          <TextField
            label="Unit"
            value={entry.unit}
            onChange={(e) => onChange({ ...entry, unit: e.target.value })}
            size="small"
            placeholder="EA"
            InputProps={{ sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text } }}
            InputLabelProps={{ sx: { color: COLORS.textSecondary } }}
            sx={{ width: 80 }}
          />
          <TextField
            label="Unit Cost"
            type="number"
            value={entry.unitCost}
            onChange={(e) => onChange({ ...entry, unitCost: Number.parseFloat(e.target.value) || 0 })}
            size="small"
            inputProps={{ min: 0, step: 0.01 }}
            InputProps={{ sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text } }}
            InputLabelProps={{ sx: { color: COLORS.textSecondary } }}
          />
          <TextField
            label="Markup %"
            type="number"
            value={entry.markup}
            onChange={(e) => onChange({ ...entry, markup: Number.parseFloat(e.target.value) || 0 })}
            size="small"
            inputProps={{ min: 0 }}
            InputProps={{ sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text } }}
            InputLabelProps={{ sx: { color: COLORS.textSecondary } }}
            sx={{ width: 100 }}
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

MaterialEntry.propTypes = {
  entry: PropTypes.shape({
    materialCode: PropTypes.string,
    description: PropTypes.string,
    quantity: PropTypes.number,
    unit: PropTypes.string,
    unitCost: PropTypes.number,
    markup: PropTypes.number,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
};

/**
 * Main Field Ticket Form Component
 */
const FieldTicketForm = ({ jobId: propJobId, job: propJob, onSuccess, onCancel }) => {
  const COLORS = useAppColors();
  const { position } = useGeolocation();
  const { jobId: urlJobId } = useParams();
  const navigate = useNavigate();
  
  // Use prop jobId if provided, otherwise use URL param
  const jobId = propJobId || urlJobId;
  
  // Debug: log jobId source
  console.log('[FieldTicketForm] jobId sources:', { propJobId, urlJobId, resolved: jobId });
  
  // Job data state (can be passed as prop or fetched)
  const [job, setJob] = useState(propJob || null);
  const [loadingJob, setLoadingJob] = useState(!propJob && !!jobId);
  
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
  
  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const [expandedSection, setExpandedSection] = useState('labor');

  // Calculate totals
  const laborTotal = laborEntries.reduce((sum, e) => {
    return sum + (e.regularHours * e.regularRate) + 
           (e.overtimeHours * (e.overtimeRate || e.regularRate * 1.5)) +
           (e.doubleTimeHours * (e.doubleTimeRate || e.regularRate * 2));
  }, 0);

  const equipmentTotal = equipmentEntries.reduce((sum, e) => {
    return sum + (e.hours * e.hourlyRate) + 
           (e.standbyHours * (e.standbyRate || e.hourlyRate * 0.5));
  }, 0);

  const materialTotal = materialEntries.reduce((sum, e) => {
    const base = e.quantity * e.unitCost;
    const markup = base * ((e.markup || 0) / 100);
    return sum + base + markup;
  }, 0);

  const subtotal = laborTotal + equipmentTotal + materialTotal;
  const overallMarkup = subtotal * (markupRate / 100);
  const grandTotal = subtotal + overallMarkup;

  // Add labor entry
  const addLaborEntry = () => {
    setLaborEntries([...laborEntries, {
      id: `labor-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      workerName: '',
      role: 'journeyman',
      regularHours: 0,
      overtimeHours: 0,
      doubleTimeHours: 0,
      regularRate: 85,
    }]);
  };

  // Add equipment entry
  const addEquipmentEntry = () => {
    setEquipmentEntries([...equipmentEntries, {
      id: `equip-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      equipmentType: 'bucket_truck',
      description: 'Bucket Truck',
      hours: 0,
      standbyHours: 0,
      hourlyRate: 125,
    }]);
  };

  // Add material entry
  const addMaterialEntry = () => {
    setMaterialEntries([...materialEntries, {
      id: `mat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      materialCode: '',
      description: '',
      quantity: 1,
      unit: 'EA',
      unitCost: 0,
      markup: 15,
    }]);
  };

  // Handle photo capture
  const handlePhotoCapture = (photoData) => {
    setPhotos([...photos, photoData]);
    setShowCamera(false);
  };

  // Handle signature capture (submit for signature)
  const handleSignatureComplete = async (signatureData) => {
    // This would be used after the ticket is created and needs signature
    setShowSignature(false);
  };

  // Submit the field ticket
  const handleSubmit = async () => {
    // Validation
    if (!changeReason) {
      setError('Please select a reason for the extra work');
      return;
    }
    if (!changeDescription.trim()) {
      setError('Please describe the extra work');
      return;
    }
    if (laborEntries.length === 0 && equipmentEntries.length === 0 && materialEntries.length === 0) {
      setError('Please add at least one labor, equipment, or material entry');
      return;
    }
    if (photos.length === 0) {
      setError('Please add at least one photo documenting the extra work');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Get current GPS location
      let location = null;
      
      // Use existing position from hook if available and recent
      if (position) {
        location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: new Date().toISOString()
        };
      } else {
        // Get position directly with a Promise wrapper (getCurrentPosition from hook is callback-based)
        try {
          const geoPosition = await new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
              reject(new Error('Geolocation not supported'));
              return;
            }
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 15000,
              maximumAge: 60000
            });
          });
          location = {
            latitude: geoPosition.coords.latitude,
            longitude: geoPosition.coords.longitude,
            accuracy: geoPosition.coords.accuracy,
            capturedAt: new Date().toISOString()
          };
        } catch (geoError) {
          console.warn('GPS acquisition failed:', geoError);
          // Location will remain null, error handled below
        }
      }

      if (!location) {
        setError('GPS location is required. Please enable location services and try again.');
        setSubmitting(false);
        return;
      }

      // Validate jobId is present
      console.log('[FieldTicketForm] Submit - jobId:', jobId);
      if (!jobId) {
        setError('Job ID is missing. Please try again from the job details page.');
        setSubmitting(false);
        return;
      }

      const ticketData = {
        jobId: String(jobId), // Explicitly convert to string and assign
        changeReason,
        changeDescription,
        workDate,
        workStartTime,
        workEndTime,
        location,
        locationDescription: job?.address || '',
        laborEntries: laborEntries.map(e => ({
          ...e,
          totalAmount: (e.regularHours * e.regularRate) + 
                       (e.overtimeHours * (e.overtimeRate || e.regularRate * 1.5)) +
                       (e.doubleTimeHours * (e.doubleTimeRate || e.regularRate * 2))
        })),
        equipmentEntries: equipmentEntries.map(e => ({
          ...e,
          totalAmount: (e.hours * e.hourlyRate) + 
                       (e.standbyHours * (e.standbyRate || e.hourlyRate * 0.5))
        })),
        materialEntries: materialEntries.map(e => ({
          ...e,
          totalAmount: (e.quantity * e.unitCost) * (1 + (e.markup || 0) / 100)
        })),
        photos: photos.map(p => ({
          url: p.url || p.dataUrl,
          r2Key: p.r2Key,
          fileName: p.fileName,
          gpsCoordinates: p.gpsCoordinates,
          capturedAt: p.capturedAt,
          photoType: 'work_in_progress',
          description: p.description
        })),
        markupRate,
        internalNotes,
      };

      const response = await api.post('/api/fieldtickets', ticketData);
      
      if (onSuccess) {
        onSuccess(response.data);
      } else {
        // Navigate back to job details if no callback provided
        navigate(`/jobs/${jobId}`);
      }
    } catch (err) {
      console.error('Error creating field ticket:', err);
      setError(err.response?.data?.error || 'Failed to create field ticket');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle cancel - navigate back or call callback
  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      navigate(-1); // Go back
    }
  };

  // Show loading state while fetching job
  if (loadingJob) {
    return (
      <Box sx={{ bgcolor: COLORS.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress sx={{ color: COLORS.primary }} />
      </Box>
    );
  }

  // Show error if no jobId
  if (!jobId) {
    return (
      <Box sx={{ bgcolor: COLORS.bg, minHeight: '100vh', p: 4 }}>
        <Alert severity="error">
          No job ID provided. Please access this form from a job detail page.
        </Alert>
        <Button onClick={() => navigate('/jobs')} sx={{ mt: 2, color: COLORS.primary }}>
          Go to Jobs
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: COLORS.bg, minHeight: '100vh', pb: 10 }}>
      {/* Header */}
      <Box sx={{ 
        bgcolor: COLORS.surface, 
        p: 2, 
        borderBottom: `1px solid ${COLORS.border}`,
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="h6" sx={{ color: COLORS.text, fontWeight: 600 }}>
              T&M Field Ticket
            </Typography>
            <Typography variant="body2" sx={{ color: COLORS.textSecondary }}>
              WO: {job?.woNumber || 'Loading...'}
            </Typography>
          </Box>
          <Chip
            icon={<WarningIcon />}
            label="Extra Work"
            sx={{ bgcolor: COLORS.warning, color: COLORS.bg, fontWeight: 600 }}
          />
        </Box>
      </Box>

      <Box sx={{ p: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Reason for Extra Work */}
        <Card sx={{ mb: 2, bgcolor: COLORS.surface }}>
          <CardContent>
            <Typography variant="subtitle1" sx={{ color: COLORS.text, mb: 2, fontWeight: 600 }}>
              Reason for Extra Work *
            </Typography>
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel sx={{ color: COLORS.textSecondary }}>Select Reason</InputLabel>
              <Select
                value={changeReason}
                label="Select Reason"
                onChange={(e) => setChangeReason(e.target.value)}
                sx={{ bgcolor: COLORS.surfaceLight, color: COLORS.text }}
              >
                {CHANGE_REASONS.map(r => (
                  <MenuItem key={r.value} value={r.value}>
                    <Box>
                      <Typography variant="body2">{r.label}</Typography>
                      <Typography variant="caption" sx={{ color: COLORS.textSecondary }}>
                        {r.desc}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Description of Extra Work *"
              value={changeDescription}
              onChange={(e) => setChangeDescription(e.target.value)}
              multiline
              rows={3}
              fullWidth
              placeholder="Describe what happened and what extra work was required..."
              InputProps={{ sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text } }}
              InputLabelProps={{ sx: { color: COLORS.textSecondary } }}
            />
          </CardContent>
        </Card>

        {/* Date/Time */}
        <Card sx={{ mb: 2, bgcolor: COLORS.surface }}>
          <CardContent>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Work Date"
                type="date"
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
                size="small"
                InputProps={{ sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text } }}
                InputLabelProps={{ sx: { color: COLORS.textSecondary }, shrink: true }}
                sx={{ flex: 1 }}
              />
              <TextField
                label="Start"
                type="time"
                value={workStartTime}
                onChange={(e) => setWorkStartTime(e.target.value)}
                size="small"
                InputProps={{ sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text } }}
                InputLabelProps={{ sx: { color: COLORS.textSecondary }, shrink: true }}
              />
              <TextField
                label="End"
                type="time"
                value={workEndTime}
                onChange={(e) => setWorkEndTime(e.target.value)}
                size="small"
                InputProps={{ sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text } }}
                InputLabelProps={{ sx: { color: COLORS.textSecondary }, shrink: true }}
              />
            </Box>
          </CardContent>
        </Card>

        {/* Labor Section */}
        <Accordion 
          expanded={expandedSection === 'labor'}
          onChange={() => setExpandedSection(expandedSection === 'labor' ? '' : 'labor')}
          sx={{ bgcolor: COLORS.surface, mb: 1 }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: COLORS.text }} />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
              <PersonIcon sx={{ color: COLORS.primary }} />
              <Typography sx={{ color: COLORS.text, flex: 1 }}>
                Labor ({laborEntries.length})
              </Typography>
              <Typography sx={{ color: COLORS.primary, fontWeight: 600 }}>
                ${laborTotal.toFixed(2)}
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            {laborEntries.map((entry) => (
              <LaborEntry
                key={entry.id}
                entry={entry}
                onChange={(updated) => {
                  setLaborEntries(laborEntries.map(e => e.id === entry.id ? updated : e));
                }}
                onRemove={() => setLaborEntries(laborEntries.filter(e => e.id !== entry.id))}
              />
            ))}
            <Button
              startIcon={<AddIcon />}
              onClick={addLaborEntry}
              fullWidth
              sx={{ color: COLORS.primary, borderColor: COLORS.primary }}
              variant="outlined"
            >
              Add Worker
            </Button>
          </AccordionDetails>
        </Accordion>

        {/* Equipment Section */}
        <Accordion 
          expanded={expandedSection === 'equipment'}
          onChange={() => setExpandedSection(expandedSection === 'equipment' ? '' : 'equipment')}
          sx={{ bgcolor: COLORS.surface, mb: 1 }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: COLORS.text }} />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
              <BuildIcon sx={{ color: COLORS.warning }} />
              <Typography sx={{ color: COLORS.text, flex: 1 }}>
                Equipment ({equipmentEntries.length})
              </Typography>
              <Typography sx={{ color: COLORS.primary, fontWeight: 600 }}>
                ${equipmentTotal.toFixed(2)}
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            {equipmentEntries.map((entry) => (
              <EquipmentEntry
                key={entry.id}
                entry={entry}
                onChange={(updated) => {
                  setEquipmentEntries(equipmentEntries.map(e => e.id === entry.id ? updated : e));
                }}
                onRemove={() => setEquipmentEntries(equipmentEntries.filter(e => e.id !== entry.id))}
              />
            ))}
            <Button
              startIcon={<AddIcon />}
              onClick={addEquipmentEntry}
              fullWidth
              sx={{ color: COLORS.warning, borderColor: COLORS.warning }}
              variant="outlined"
            >
              Add Equipment
            </Button>
          </AccordionDetails>
        </Accordion>

        {/* Materials Section */}
        <Accordion 
          expanded={expandedSection === 'materials'}
          onChange={() => setExpandedSection(expandedSection === 'materials' ? '' : 'materials')}
          sx={{ bgcolor: COLORS.surface, mb: 2 }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: COLORS.text }} />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
              <InventoryIcon sx={{ color: '#64b5f6' }} />
              <Typography sx={{ color: COLORS.text, flex: 1 }}>
                Materials ({materialEntries.length})
              </Typography>
              <Typography sx={{ color: COLORS.primary, fontWeight: 600 }}>
                ${materialTotal.toFixed(2)}
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            {materialEntries.map((entry) => (
              <MaterialEntry
                key={entry.id}
                entry={entry}
                onChange={(updated) => {
                  setMaterialEntries(materialEntries.map(e => e.id === entry.id ? updated : e));
                }}
                onRemove={() => setMaterialEntries(materialEntries.filter(e => e.id !== entry.id))}
              />
            ))}
            <Button
              startIcon={<AddIcon />}
              onClick={addMaterialEntry}
              fullWidth
              sx={{ color: '#64b5f6', borderColor: '#64b5f6' }}
              variant="outlined"
            >
              Add Material
            </Button>
          </AccordionDetails>
        </Accordion>

        {/* Photos */}
        <Card sx={{ mb: 2, bgcolor: COLORS.surface }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="subtitle1" sx={{ color: COLORS.text, fontWeight: 600 }}>
                Photo Documentation ({photos.length})
              </Typography>
              <Button
                startIcon={<CameraIcon />}
                onClick={() => setShowCamera(true)}
                variant="outlined"
                size="small"
                sx={{ color: COLORS.primary, borderColor: COLORS.primary }}
              >
                Add Photo
              </Button>
            </Box>
            {photos.length > 0 ? (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {photos.map((photo) => (
                  <Box
                    key={photo.id || photo.url || photo.dataUrl}
                    sx={{
                      width: 80,
                      height: 80,
                      borderRadius: 1,
                      overflow: 'hidden',
                      position: 'relative'
                    }}
                  >
                    <img
                      src={photo.dataUrl || photo.url}
                      alt={photo.description || 'Field ticket documentation'}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <IconButton
                      size="small"
                      onClick={() => setPhotos(photos.filter(p => (p.id || p.url || p.dataUrl) !== (photo.id || photo.url || photo.dataUrl)))}
                      sx={{
                        position: 'absolute',
                        top: 2,
                        right: 2,
                        bgcolor: COLORS.error,
                        width: 20,
                        height: 20,
                        '&:hover': { bgcolor: COLORS.error }
                      }}
                    >
                      <DeleteIcon sx={{ fontSize: 14, color: COLORS.text }} />
                    </IconButton>
                  </Box>
                ))}
              </Box>
            ) : (
              <Typography variant="body2" sx={{ color: COLORS.textSecondary }}>
                At least one photo is required
              </Typography>
            )}
          </CardContent>
        </Card>

        {/* Totals */}
        <Card sx={{ mb: 2, bgcolor: COLORS.surfaceLight }}>
          <CardContent>
            <Typography variant="subtitle1" sx={{ color: COLORS.text, mb: 2, fontWeight: 600 }}>
              Ticket Summary
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography sx={{ color: COLORS.textSecondary }}>Labor</Typography>
              <Typography sx={{ color: COLORS.text }}>${laborTotal.toFixed(2)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography sx={{ color: COLORS.textSecondary }}>Equipment</Typography>
              <Typography sx={{ color: COLORS.text }}>${equipmentTotal.toFixed(2)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography sx={{ color: COLORS.textSecondary }}>Materials</Typography>
              <Typography sx={{ color: COLORS.text }}>${materialTotal.toFixed(2)}</Typography>
            </Box>
            <Divider sx={{ my: 1, borderColor: COLORS.border }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography sx={{ color: COLORS.textSecondary }}>Subtotal</Typography>
              <Typography sx={{ color: COLORS.text }}>${subtotal.toFixed(2)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
              <Typography sx={{ color: COLORS.textSecondary }}>Markup</Typography>
              <TextField
                type="number"
                value={markupRate}
                onChange={(e) => setMarkupRate(Number.parseFloat(e.target.value) || 0)}
                size="small"
                inputProps={{ min: 0, max: 100 }}
                sx={{ width: 80 }}
                InputProps={{
                  endAdornment: '%',
                  sx: { bgcolor: COLORS.surface, color: COLORS.text }
                }}
              />
              <Typography sx={{ color: COLORS.text, flex: 1, textAlign: 'right' }}>
                ${overallMarkup.toFixed(2)}
              </Typography>
            </Box>
            <Divider sx={{ my: 1, borderColor: COLORS.border }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="h6" sx={{ color: COLORS.primary, fontWeight: 700 }}>
                Total
              </Typography>
              <Typography variant="h6" sx={{ color: COLORS.primary, fontWeight: 700 }}>
                ${grandTotal.toFixed(2)}
              </Typography>
            </Box>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card sx={{ mb: 2, bgcolor: COLORS.surface }}>
          <CardContent>
            <TextField
              label="Internal Notes"
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              multiline
              rows={2}
              fullWidth
              placeholder="Notes for internal use only..."
              InputProps={{ sx: { bgcolor: COLORS.surfaceLight, color: COLORS.text } }}
              InputLabelProps={{ sx: { color: COLORS.textSecondary } }}
            />
          </CardContent>
        </Card>
      </Box>

      {/* Fixed Bottom Bar */}
      <Box sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        bgcolor: COLORS.surface,
        borderTop: `1px solid ${COLORS.border}`,
        p: 2,
        display: 'flex',
        gap: 2
      }}>
        <Button
          onClick={handleCancel}
          sx={{ flex: 1, color: COLORS.textSecondary }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting}
          startIcon={submitting ? <CircularProgress size={20} /> : <CheckIcon />}
          sx={{
            flex: 2,
            bgcolor: COLORS.primary,
            color: COLORS.bg,
            fontWeight: 600,
            '&:hover': { bgcolor: COLORS.primaryDark },
            '&:disabled': { bgcolor: COLORS.border }
          }}
        >
          {submitting ? 'Saving...' : `Create Ticket ($${grandTotal.toFixed(2)})`}
        </Button>
      </Box>

      {/* Photo Capture Dialog */}
      <GPSPhotoCapture
        open={showCamera}
        onClose={() => setShowCamera(false)}
        onCapture={handlePhotoCapture}
        photoType="work_in_progress"
      />

      {/* Signature Dialog */}
      <SignatureCapture
        open={showSignature}
        onClose={() => setShowSignature(false)}
        onComplete={handleSignatureComplete}
        title="Inspector Signature"
        requireName={true}
        requireCompany={true}
        showGPS={true}
      />
    </Box>
  );
};

FieldTicketForm.propTypes = {
  jobId: PropTypes.string, // Optional - can come from URL params
  job: PropTypes.object,
  onSuccess: PropTypes.func,
  onCancel: PropTypes.func,
};

export default FieldTicketForm;

