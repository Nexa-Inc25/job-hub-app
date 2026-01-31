/**
 * Job Hub Pro - TailboardForm Component
 * Copyright (c) 2024-2026 Job Hub Pro. All Rights Reserved.
 * 
 * Daily tailboard/JHA form for crew safety briefings.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Chip,
  Grid,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction,
  Checkbox,
  FormControlLabel,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Avatar,
  Tooltip,
  CircularProgress
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  ExpandMore as ExpandIcon,
  Warning as WarningIcon,
  Shield as ShieldIcon,
  People as PeopleIcon,
  CheckCircle as CheckCircleIcon,
  Save as SaveIcon,
  Send as SendIcon,
  LocalHospital as HospitalIcon,
  WbSunny as WeatherIcon
} from '@mui/icons-material';
import api from '../api';
import SignaturePad from './shared/SignaturePad';

// Hazard category definitions
const HAZARD_CATEGORIES = {
  electrical: {
    label: 'Electrical',
    icon: '⚡',
    color: '#f44336',
    commonHazards: ['Energized equipment', 'Arc flash potential', 'Exposed conductors', 'Working near power lines'],
    commonControls: ['De-energize and LOTO', 'Maintain clearance distances', 'Use insulated tools', 'Wear arc-rated PPE']
  },
  fall: {
    label: 'Fall Protection',
    icon: '🪜',
    color: '#ff9800',
    commonHazards: ['Working at heights', 'Ladder work', 'Unprotected edges', 'Unstable surfaces'],
    commonControls: ['Use fall protection harness', 'Set up guardrails', 'Inspect ladder before use', '3-point contact on ladders']
  },
  traffic: {
    label: 'Traffic Control',
    icon: '🚧',
    color: '#ff5722',
    commonHazards: ['Work zone traffic', 'Moving vehicles', 'Limited visibility', 'Pedestrian conflicts'],
    commonControls: ['Set up traffic control plan', 'Use flaggers', 'Wear high-visibility vest', 'Position escape routes']
  },
  excavation: {
    label: 'Excavation',
    icon: '🕳️',
    color: '#795548',
    commonHazards: ['Trench collapse', 'Underground utilities', 'Spoil pile hazards', 'Water accumulation'],
    commonControls: ['Call 811 / USA ticket', 'Shore or slope trench', 'Keep spoils back 2ft', 'Competent person inspection']
  },
  overhead: {
    label: 'Overhead Work',
    icon: '🏗️',
    color: '#9c27b0',
    commonHazards: ['Overhead power lines', 'Falling objects', 'Crane operations', 'Suspended loads'],
    commonControls: ['Maintain clearance from lines', 'Use tag lines', 'Establish drop zones', 'Wear hard hat']
  },
  environmental: {
    label: 'Environmental',
    icon: '🌡️',
    color: '#4caf50',
    commonHazards: ['Heat stress', 'Cold exposure', 'Severe weather', 'Sun exposure'],
    commonControls: ['Hydration breaks', 'Monitor weather conditions', 'Provide shade/shelter', 'Adjust work schedule']
  },
  confined_space: {
    label: 'Confined Space',
    icon: '🚪',
    color: '#607d8b',
    commonHazards: ['Oxygen deficiency', 'Toxic atmosphere', 'Engulfment hazard', 'Limited egress'],
    commonControls: ['Atmospheric testing', 'Ventilation', 'Entry permit', 'Rescue plan in place']
  },
  chemical: {
    label: 'Chemical/Materials',
    icon: '☢️',
    color: '#e91e63',
    commonHazards: ['Hazardous materials', 'Dust/fumes', 'Skin contact', 'Spill potential'],
    commonControls: ['Review SDS', 'Use appropriate PPE', 'Proper ventilation', 'Spill kit available']
  },
  ergonomic: {
    label: 'Ergonomic',
    icon: '💪',
    color: '#00bcd4',
    commonHazards: ['Heavy lifting', 'Repetitive motion', 'Awkward positions', 'Vibration exposure'],
    commonControls: ['Use mechanical aids', 'Team lifts for heavy items', 'Rotate tasks', 'Take stretch breaks']
  },
  other: {
    label: 'Other',
    icon: '⚠️',
    color: '#9e9e9e',
    commonHazards: [],
    commonControls: []
  }
};

// Standard PPE items
const STANDARD_PPE = [
  { item: 'Hard Hat', icon: '🪖' },
  { item: 'Safety Glasses', icon: '🥽' },
  { item: 'FR Clothing', icon: '👔' },
  { item: 'High-Visibility Vest', icon: '🦺' },
  { item: 'Leather Gloves', icon: '🧤' },
  { item: 'Rubber Insulating Gloves', icon: '🧤' },
  { item: 'Steel-Toe Boots', icon: '🥾' },
  { item: 'Hearing Protection', icon: '🎧' },
  { item: 'Face Shield', icon: '😷' },
  { item: 'Fall Protection Harness', icon: '🪢' }
];

const TailboardForm = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();
  
  // Form state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [job, setJob] = useState(null);
  const [tailboard, setTailboard] = useState(null);
  
  // Form fields
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState(
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  );
  const [taskDescription, setTaskDescription] = useState('');
  const [hazards, setHazards] = useState([]);
  const [ppeRequired, setPpeRequired] = useState(
    STANDARD_PPE.map(ppe => ({ item: ppe.item, checked: false }))
  );
  const [crewMembers, setCrewMembers] = useState([]);
  const [weatherConditions, setWeatherConditions] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('911');
  const [nearestHospital, setNearestHospital] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  
  // UI state
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [hazardDialogOpen, setHazardDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [customHazard, setCustomHazard] = useState('');
  const [selectedControls, setSelectedControls] = useState([]);
  const [customControl, setCustomControl] = useState('');
  const [riskLevel, setRiskLevel] = useState('medium');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Load job and existing tailboard
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        // Load job details
        const jobRes = await api.get(`/jobs/${jobId}`);
        setJob(jobRes.data);
        
        // Check for existing tailboard today
        try {
          const tailboardRes = await api.get(`/tailboards/job/${jobId}/today`);
          setTailboard(tailboardRes.data);
          
          // Populate form with existing data
          const tb = tailboardRes.data;
          if (tb.date) setDate(new Date(tb.date).toISOString().split('T')[0]);
          if (tb.startTime) setStartTime(tb.startTime);
          if (tb.taskDescription) setTaskDescription(tb.taskDescription);
          if (tb.hazards) setHazards(tb.hazards);
          if (tb.ppeRequired) setPpeRequired(tb.ppeRequired);
          if (tb.crewMembers) setCrewMembers(tb.crewMembers);
          if (tb.weatherConditions) setWeatherConditions(tb.weatherConditions);
          if (tb.emergencyContact) setEmergencyContact(tb.emergencyContact);
          if (tb.nearestHospital) setNearestHospital(tb.nearestHospital);
          if (tb.additionalNotes) setAdditionalNotes(tb.additionalNotes);
        } catch {
          // No tailboard for today - that's fine
        }
        
        // Pre-fill task description from job scope if available
        if (!taskDescription && jobRes.data.jobScope?.summary) {
          setTaskDescription(jobRes.data.jobScope.summary);
        }
      } catch (error) {
        console.error('Error loading data:', error);
        setSnackbar({ open: true, message: 'Failed to load job data', severity: 'error' });
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [jobId]);

  // Save tailboard (draft)
  const handleSave = async () => {
    try {
      setSaving(true);
      
      const data = {
        jobId,
        date: new Date(date),
        startTime,
        taskDescription,
        hazards,
        ppeRequired,
        crewMembers,
        weatherConditions,
        emergencyContact,
        nearestHospital,
        additionalNotes
      };
      
      if (tailboard?._id) {
        // Update existing
        const res = await api.put(`/tailboards/${tailboard._id}`, data);
        setTailboard(res.data);
      } else {
        // Create new
        const res = await api.post('/tailboards', data);
        setTailboard(res.data);
      }
      
      setSnackbar({ open: true, message: 'Tailboard saved', severity: 'success' });
    } catch (error) {
      console.error('Error saving tailboard:', error);
      setSnackbar({ open: true, message: 'Failed to save tailboard', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Complete tailboard
  const handleComplete = async () => {
    try {
      setSaving(true);
      
      // Save first
      await handleSave();
      
      // Then complete
      const res = await api.post(`/tailboards/${tailboard._id}/complete`);
      setTailboard(res.data);
      
      setSnackbar({ open: true, message: 'Tailboard completed!', severity: 'success' });
      
      // Navigate back after a moment
      setTimeout(() => navigate(`/jobs/${jobId}`), 1500);
    } catch (error) {
      console.error('Error completing tailboard:', error);
      const message = error.response?.data?.error || 'Failed to complete tailboard';
      setSnackbar({ open: true, message, severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Add hazard
  const handleAddHazard = () => {
    if (!selectedCategory || !customHazard.trim()) return;
    
    const newHazard = {
      category: selectedCategory,
      description: customHazard.trim(),
      controls: selectedControls,
      riskLevel
    };
    
    setHazards([...hazards, newHazard]);
    
    // Reset dialog
    setSelectedCategory('');
    setCustomHazard('');
    setSelectedControls([]);
    setRiskLevel('medium');
    setHazardDialogOpen(false);
  };

  // Remove hazard
  const handleRemoveHazard = (index) => {
    setHazards(hazards.filter((_, i) => i !== index));
  };

  // Toggle PPE item
  const handleTogglePPE = (index) => {
    const updated = [...ppeRequired];
    updated[index].checked = !updated[index].checked;
    setPpeRequired(updated);
  };

  // Add crew signature
  const handleAddSignature = async (signatureData) => {
    try {
      if (tailboard?._id) {
        // Save to server
        const res = await api.post(`/tailboards/${tailboard._id}/sign`, signatureData);
        setCrewMembers(res.data.crewMembers);
      } else {
        // Just add locally for now
        setCrewMembers([...crewMembers, { ...signatureData, signedAt: new Date() }]);
      }
      setSnackbar({ open: true, message: `${signatureData.name} signed`, severity: 'success' });
    } catch (error) {
      console.error('Error adding signature:', error);
      setSnackbar({ open: true, message: 'Failed to add signature', severity: 'error' });
    }
  };

  // Add control to list
  const handleAddControl = (control) => {
    if (!selectedControls.includes(control)) {
      setSelectedControls([...selectedControls, control]);
    }
  };

  // Remove control from list
  const handleRemoveControl = (control) => {
    setSelectedControls(selectedControls.filter(c => c !== control));
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  const isCompleted = tailboard?.status === 'completed';

  return (
    <Box sx={{ p: { xs: 1, sm: 2 }, maxWidth: 900, mx: 'auto' }}>
      {/* Header */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <IconButton onClick={() => navigate(`/jobs/${jobId}`)}>
            <BackIcon />
          </IconButton>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              Daily Tailboard / JHA
            </Typography>
            <Typography variant="body2" color="text.secondary">
              WO# {job?.woNumber} • {job?.address}
            </Typography>
          </Box>
          {isCompleted && (
            <Chip label="Completed" color="success" icon={<CheckCircleIcon />} />
          )}
        </Box>
        
        <Grid container spacing={2}>
          <Grid item xs={6} sm={3}>
            <TextField
              label="Date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              fullWidth
              size="small"
              disabled={isCompleted}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={6} sm={3}>
            <TextField
              label="Start Time"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              fullWidth
              size="small"
              disabled={isCompleted}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Weather Conditions"
              value={weatherConditions}
              onChange={(e) => setWeatherConditions(e.target.value)}
              fullWidth
              size="small"
              disabled={isCompleted}
              placeholder="e.g., Clear, 75°F, light wind"
              InputProps={{
                startAdornment: <WeatherIcon sx={{ mr: 1, color: 'text.secondary' }} />
              }}
            />
          </Grid>
        </Grid>
      </Paper>

      {/* Task Description */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          Work Description
        </Typography>
        <TextField
          value={taskDescription}
          onChange={(e) => setTaskDescription(e.target.value)}
          fullWidth
          multiline
          rows={3}
          disabled={isCompleted}
          placeholder="Describe the work to be performed today..."
        />
      </Paper>

      {/* Hazard Analysis */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <WarningIcon color="warning" />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Hazard Analysis
            </Typography>
          </Box>
          {!isCompleted && (
            <Button
              startIcon={<AddIcon />}
              onClick={() => setHazardDialogOpen(true)}
              variant="outlined"
              size="small"
            >
              Add Hazard
            </Button>
          )}
        </Box>

        {hazards.length === 0 ? (
          <Alert severity="info">
            No hazards identified yet. Click "Add Hazard" to identify job site hazards.
          </Alert>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {hazards.map((hazard, index) => {
              const category = HAZARD_CATEGORIES[hazard.category] || HAZARD_CATEGORIES.other;
              return (
                <Accordion key={index} defaultExpanded>
                  <AccordionSummary expandIcon={<ExpandIcon />}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                      <Typography>{category.icon}</Typography>
                      <Chip 
                        label={category.label} 
                        size="small" 
                        sx={{ bgcolor: category.color, color: 'white' }}
                      />
                      <Typography sx={{ flex: 1 }}>{hazard.description}</Typography>
                      <Chip 
                        label={hazard.riskLevel} 
                        size="small"
                        color={hazard.riskLevel === 'high' ? 'error' : hazard.riskLevel === 'medium' ? 'warning' : 'success'}
                      />
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Controls / Mitigations:
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {hazard.controls.map((control, ci) => (
                        <Chip key={ci} label={control} size="small" variant="outlined" />
                      ))}
                    </Box>
                    {!isCompleted && (
                      <Box sx={{ mt: 1, textAlign: 'right' }}>
                        <IconButton 
                          size="small" 
                          color="error"
                          onClick={() => handleRemoveHazard(index)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    )}
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </Box>
        )}
      </Paper>

      {/* PPE Requirements */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <ShieldIcon color="primary" />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            PPE Requirements
          </Typography>
        </Box>
        
        <Grid container spacing={1}>
          {ppeRequired.map((ppe, index) => {
            const ppeInfo = STANDARD_PPE.find(p => p.item === ppe.item) || { icon: '🛡️' };
            return (
              <Grid item xs={6} sm={4} md={3} key={ppe.item}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={ppe.checked}
                      onChange={() => handleTogglePPE(index)}
                      disabled={isCompleted}
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <span>{ppeInfo.icon}</span>
                      <Typography variant="body2">{ppe.item}</Typography>
                    </Box>
                  }
                />
              </Grid>
            );
          })}
        </Grid>
      </Paper>

      {/* Crew Signatures */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PeopleIcon color="primary" />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Crew Acknowledgment
            </Typography>
            <Chip label={`${crewMembers.length} signed`} size="small" />
          </Box>
          {!isCompleted && (
            <Button
              startIcon={<AddIcon />}
              onClick={() => setSignatureOpen(true)}
              variant="outlined"
              size="small"
            >
              Add Signature
            </Button>
          )}
        </Box>

        {crewMembers.length === 0 ? (
          <Alert severity="info">
            No signatures yet. Each crew member must sign to acknowledge the tailboard.
          </Alert>
        ) : (
          <Grid container spacing={1}>
            {crewMembers.map((member, index) => (
              <Grid item xs={6} sm={4} md={3} key={index}>
                <Paper 
                  variant="outlined" 
                  sx={{ p: 1, textAlign: 'center' }}
                >
                  <Avatar sx={{ mx: 'auto', mb: 0.5, bgcolor: 'primary.main' }}>
                    {member.name.charAt(0).toUpperCase()}
                  </Avatar>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {member.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {member.role}
                  </Typography>
                  {member.signatureData && (
                    <Box sx={{ mt: 1 }}>
                      <img 
                        src={member.signatureData} 
                        alt="Signature" 
                        style={{ 
                          maxWidth: '100%', 
                          maxHeight: 40,
                          border: '1px solid #ddd',
                          borderRadius: 4
                        }}
                      />
                    </Box>
                  )}
                  <Typography variant="caption" color="text.secondary" display="block">
                    {new Date(member.signedAt).toLocaleTimeString()}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        )}
      </Paper>

      {/* Emergency Info */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <HospitalIcon color="error" />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Emergency Information
          </Typography>
        </Box>
        
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Emergency Contact"
              value={emergencyContact}
              onChange={(e) => setEmergencyContact(e.target.value)}
              fullWidth
              size="small"
              disabled={isCompleted}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Nearest Hospital"
              value={nearestHospital}
              onChange={(e) => setNearestHospital(e.target.value)}
              fullWidth
              size="small"
              disabled={isCompleted}
              placeholder="Hospital name and address"
            />
          </Grid>
        </Grid>
      </Paper>

      {/* Additional Notes */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          Additional Notes
        </Typography>
        <TextField
          value={additionalNotes}
          onChange={(e) => setAdditionalNotes(e.target.value)}
          fullWidth
          multiline
          rows={2}
          disabled={isCompleted}
          placeholder="Any other safety concerns or notes..."
        />
      </Paper>

      {/* Action Buttons */}
      {!isCompleted && (
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
          <Button
            variant="outlined"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={saving}
          >
            Save Draft
          </Button>
          <Button
            variant="contained"
            color="success"
            startIcon={<SendIcon />}
            onClick={handleComplete}
            disabled={saving || hazards.length === 0 || crewMembers.length === 0}
          >
            Complete Tailboard
          </Button>
        </Box>
      )}

      {/* Signature Dialog */}
      <SignaturePad
        open={signatureOpen}
        onClose={() => setSignatureOpen(false)}
        onSave={handleAddSignature}
        title="Sign Tailboard Acknowledgment"
      />

      {/* Add Hazard Dialog */}
      <Dialog 
        open={hazardDialogOpen} 
        onClose={() => setHazardDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add Hazard</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>Hazard Category</InputLabel>
              <Select
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value);
                  setSelectedControls([]);
                }}
                label="Hazard Category"
              >
                {Object.entries(HAZARD_CATEGORIES).map(([key, cat]) => (
                  <MenuItem key={key} value={key}>
                    {cat.icon} {cat.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {selectedCategory && (
              <>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Common hazards (click to use):
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {HAZARD_CATEGORIES[selectedCategory]?.commonHazards.map((h) => (
                      <Chip
                        key={h}
                        label={h}
                        size="small"
                        onClick={() => setCustomHazard(h)}
                        sx={{ cursor: 'pointer' }}
                      />
                    ))}
                  </Box>
                </Box>

                <TextField
                  label="Hazard Description"
                  value={customHazard}
                  onChange={(e) => setCustomHazard(e.target.value)}
                  fullWidth
                  required
                  placeholder="Describe the specific hazard..."
                />

                <FormControl fullWidth>
                  <InputLabel>Risk Level</InputLabel>
                  <Select
                    value={riskLevel}
                    onChange={(e) => setRiskLevel(e.target.value)}
                    label="Risk Level"
                  >
                    <MenuItem value="low">Low</MenuItem>
                    <MenuItem value="medium">Medium</MenuItem>
                    <MenuItem value="high">High</MenuItem>
                  </Select>
                </FormControl>

                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Controls / Mitigations:
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                    {HAZARD_CATEGORIES[selectedCategory]?.commonControls.map((c) => (
                      <Chip
                        key={c}
                        label={c}
                        size="small"
                        onClick={() => handleAddControl(c)}
                        color={selectedControls.includes(c) ? 'primary' : 'default'}
                        sx={{ cursor: 'pointer' }}
                      />
                    ))}
                  </Box>
                  
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField
                      size="small"
                      value={customControl}
                      onChange={(e) => setCustomControl(e.target.value)}
                      placeholder="Add custom control..."
                      sx={{ flex: 1 }}
                    />
                    <Button
                      size="small"
                      onClick={() => {
                        if (customControl.trim()) {
                          handleAddControl(customControl.trim());
                          setCustomControl('');
                        }
                      }}
                    >
                      Add
                    </Button>
                  </Box>

                  {selectedControls.length > 0 && (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        Selected controls:
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                        {selectedControls.map((c) => (
                          <Chip
                            key={c}
                            label={c}
                            size="small"
                            onDelete={() => handleRemoveControl(c)}
                            color="primary"
                          />
                        ))}
                      </Box>
                    </Box>
                  )}
                </Box>
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHazardDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleAddHazard}
            variant="contained"
            disabled={!selectedCategory || !customHazard.trim() || selectedControls.length === 0}
          >
            Add Hazard
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={() => setSnackbar({ ...snackbar, open: false })} 
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default TailboardForm;
