/**
 * FieldLedger - TailboardForm Component
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Daily tailboard/JHA form for crew safety briefings.
 */

import React, { useState, useEffect } from 'react';
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
  CircularProgress,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import BackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandIcon from '@mui/icons-material/ExpandMore';
import WarningIcon from '@mui/icons-material/Warning';
import ShieldIcon from '@mui/icons-material/Shield';
import PeopleIcon from '@mui/icons-material/People';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SaveIcon from '@mui/icons-material/Save';
import SendIcon from '@mui/icons-material/Send';
import HospitalIcon from '@mui/icons-material/LocalHospital';
import WeatherIcon from '@mui/icons-material/WbSunny';
import ElectricalIcon from '@mui/icons-material/ElectricalServices';
import EngineeringIcon from '@mui/icons-material/Engineering';
import ChecklistIcon from '@mui/icons-material/Checklist';
import api from '../api';
import SignaturePad from './shared/SignaturePad';

// Helper function to get risk level color (avoids nested ternary)
const getRiskLevelColor = (riskLevel) => {
  if (riskLevel === 'high') return 'error';
  if (riskLevel === 'medium') return 'warning';
  return 'success';
};

// Hazard category definitions
const HAZARD_CATEGORIES = {
  electrical: {
    label: 'Electrical',
    icon: '⚡',
    color: '#f44336',
    commonHazards: ['Energized equipment', 'Arc flash potential', 'Exposed conductors', 'Working near power lines', 'Accidental contacts', 'Back-feed potential'],
    commonControls: ['De-energize and LOTO', 'Maintain clearance distances', 'Use insulated tools', 'Wear arc-rated PPE', 'Voltage testing', 'Rubber gloving']
  },
  fall: {
    label: 'Fall Protection',
    icon: '🪜',
    color: '#ff9800',
    commonHazards: ['Working at heights', 'Ladder work', 'Unprotected edges', 'Unstable surfaces', 'Open holes'],
    commonControls: ['Use fall protection harness', 'Set up guardrails', 'Inspect ladder before use', '3-point contact on ladders', 'Watch footing']
  },
  traffic: {
    label: 'Traffic Control',
    icon: '🚧',
    color: '#ff5722',
    commonHazards: ['Work zone traffic', 'Moving vehicles', 'Limited visibility', 'Pedestrian conflicts', 'Public safety'],
    commonControls: ['Set up traffic control plan', 'Use flaggers', 'Wear high-visibility vest', 'Position escape routes', 'Cone off work area']
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
    commonHazards: ['Overhead power lines', 'Falling objects', 'Crane operations', 'Suspended loads', 'Overhead loads'],
    commonControls: ['Maintain clearance from lines', 'Use tag lines', 'Establish drop zones', 'Wear hard hat', 'Stay out from under loads']
  },
  rigging: {
    label: 'Rigging',
    icon: '🪝',
    color: '#673ab7',
    commonHazards: ['Rigging failure', 'Load shift', 'Overloading', 'Improper rigging'],
    commonControls: ['Inspect rigging before use', 'Verify load weight', 'Use proper rigging techniques', 'Boom spotter/backup']
  },
  environmental: {
    label: 'Environmental',
    icon: '🌡️',
    color: '#4caf50',
    commonHazards: ['Heat stress', 'Cold exposure', 'Severe weather', 'Sun exposure', 'Atmosphere/COVID'],
    commonControls: ['Hydration breaks', 'Monitor weather conditions', 'Provide shade/shelter', 'Adjust work schedule', 'Drink water']
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
    commonHazards: ['Heavy lifting', 'Repetitive motion', 'Awkward positions', 'Pulling tension', 'Slip/trip hazards'],
    commonControls: ['Use mechanical aids', 'Team lifts for heavy items', 'Rotate tasks', 'Take stretch breaks']
  },
  backing: {
    label: 'Backing/Vehicles',
    icon: '🚛',
    color: '#ff7043',
    commonHazards: ['Backing incidents', 'Limited visibility', 'Pedestrians in area'],
    commonControls: ['Use spotter when backing', 'GOAL (Get Out And Look)', '360 walk-around', 'Back into parking spots']
  },
  third_party: {
    label: '3rd Party Contractors',
    icon: '👷',
    color: '#8d6e63',
    commonHazards: ['Coordination issues', 'Unknown hazards', 'Communication gaps', 'New crew members'],
    commonControls: ['Pre-job briefing with all parties', 'Ask questions', '3 points contact', 'Verify certifications']
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

// Special Mitigation Measures (from Alvah Electric Tailboard Form)
const SPECIAL_MITIGATIONS = [
  { id: 'liveLineWork', label: 'Live-Line Work' },
  { id: 'rubberGloving', label: 'Rubber Gloving' },
  { id: 'backfeedDiscussed', label: 'Possible Back-feed Discussed' },
  { id: 'groundingPerTitle8', label: 'Grounding per Title 8 §2941' },
  { id: 'madDiscussed', label: 'MAD Discussed' },
  { id: 'ppeDiscussed', label: 'Personal Protective Equipment' },
  { id: 'publicPedestrianSafety', label: 'Public / Pedestrian Safety - T/C' },
  { id: 'rotationDiscussed', label: 'Rotation Discussed' },
  { id: 'phaseMarkingDiscussed', label: 'Phase Marking Discussed' },
  { id: 'voltageTesting', label: 'Voltage Testing' },
  { id: 'switchLog', label: 'Switch Log' },
  { id: 'dielectricInspection', label: 'Di-Electric & Live-Line Tool Inspection' },
  { id: 'adequateCover', label: 'Adequate Cover on Secondary Points of Contact' }
];

// UG Work Completed Checklist Items
const UG_CHECKLIST_ITEMS = [
  { id: 'elbowsSeated', label: 'Are all Elbows Fully Seated?' },
  { id: 'deadbreakBails', label: 'Are all 200A Deadbreak Bails on?' },
  { id: 'groundsMadeUp', label: 'Are all Grounds Made Up (Splices, Switches, TX, etc.)?' },
  { id: 'bleedersInstalled', label: 'Bleeders all Installed?' },
  { id: 'tagsInstalledNewWork', label: 'Are all Tags Installed on New Work?' },
  { id: 'tagsUpdatedAdjacent', label: 'Have Tags Been Updated on Adjacent Equipment?' },
  { id: 'voltagePhaseTagsApplied', label: 'Correct Voltage & Phase Tags Applied?' },
  { id: 'primaryNeutralIdentified', label: 'Primary Neutral Identified - 4 KV & 21 KV?' },
  { id: 'spareDuctsPlugged', label: 'All Spare Ducts Plugged?' },
  { id: 'equipmentNumbersInstalled', label: 'Equipment Numbers Installed?' },
  { id: 'lidsFramesBonded', label: 'Lids or Frames Bonded?' },
  { id: 'allBoltsInstalled', label: 'All Bolts Installed on Lids?' },
  { id: 'equipmentBoltedDown', label: 'Is Equipment Bolted Down Correctly?' }
];

// Inspector options
const INSPECTOR_OPTIONS = [
  { id: 'pge', label: 'PG&E' },
  { id: 'sce', label: 'SCE' },
  { id: 'sdge', label: 'SDG&E' },
  { id: 'smud', label: 'SMUD' },
  { id: 'other', label: 'Other' }
];

/**
 * Populate basic form fields from tailboard data
 */
function populateBasicFields(tb, setters) {
  if (tb.date) setters.setDate(new Date(tb.date).toISOString().split('T')[0]);
  if (tb.startTime) setters.setStartTime(tb.startTime);
  if (tb.taskDescription) setters.setTaskDescription(tb.taskDescription);
  if (tb.jobSteps) setters.setJobSteps(tb.jobSteps);
  if (tb.hazards) setters.setHazards(tb.hazards);
  if (tb.hazardsDescription) setters.setHazardsDescription(tb.hazardsDescription);
  if (tb.mitigationDescription) setters.setMitigationDescription(tb.mitigationDescription);
  if (tb.ppeRequired) setters.setPpeRequired(tb.ppeRequired);
  if (tb.crewMembers) setters.setCrewMembers(tb.crewMembers);
  if (tb.weatherConditions) setters.setWeatherConditions(tb.weatherConditions);
  if (tb.emergencyContact) setters.setEmergencyContact(tb.emergencyContact);
  if (tb.emergencyPhone) setters.setEmergencyPhone(tb.emergencyPhone);
  if (tb.nearestHospital) setters.setNearestHospital(tb.nearestHospital);
  if (tb.additionalNotes) setters.setAdditionalNotes(tb.additionalNotes);
}

/**
 * Populate Alvah-specific fields from tailboard data
 */
function populateAlvahFields(tb, setters) {
  if (tb.pmNumber) setters.setPmNumber(tb.pmNumber);
  if (tb.circuit) setters.setCircuit(tb.circuit);
  if (tb.showUpYardLocation) setters.setShowUpYardLocation(tb.showUpYardLocation);
  if (tb.generalForemanName) setters.setGeneralForemanName(tb.generalForemanName);
  if (tb.inspector) setters.setInspector(tb.inspector);
  if (tb.inspectorName) setters.setInspectorName(tb.inspectorName);
  if (tb.eicName) setters.setEicName(tb.eicName);
  if (tb.eicPhone) setters.setEicPhone(tb.eicPhone);
  if (tb.specialMitigations?.length) setters.setSpecialMitigations(tb.specialMitigations);
}

/**
 * Populate electrical/grounding fields from tailboard data
 */
function populateElectricalFields(tb, setters) {
  if (tb.grounding) {
    setters.setGroundingNeeded(tb.grounding.needed);
    setters.setGroundingAccountedFor(tb.grounding.accountedFor);
    if (tb.grounding.locations?.length) setters.setGroundingLocations(tb.grounding.locations);
  }
  if (tb.sourceSideDevices?.length) setters.setSourceSideDevices(tb.sourceSideDevices);
  if (tb.nominalVoltages) setters.setNominalVoltages(tb.nominalVoltages);
  if (tb.copperConditionInspected !== undefined) setters.setCopperConditionInspected(tb.copperConditionInspected);
  if (tb.notTiedIntoCircuit) setters.setNotTiedIntoCircuit(tb.notTiedIntoCircuit);
  if (tb.ugChecklist?.length) {
    setters.setUgChecklist(tb.ugChecklist);
    setters.setShowUgChecklist(true);
  }
}

/**
 * Populate form state from existing tailboard data
 * Extracted to reduce cognitive complexity in loadData
 */
function populateFormFromTailboard(tb, setters) {
  populateBasicFields(tb, setters);
  populateAlvahFields(tb, setters);
  populateElectricalFields(tb, setters);
}

const TailboardForm = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();
  
  // Form state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [job, setJob] = useState(null);
  const [tailboard, setTailboard] = useState(null);
  
  // Basic form fields
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState(
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  );
  const [taskDescription, setTaskDescription] = useState('');
  const [jobSteps, setJobSteps] = useState('');
  const [hazards, setHazards] = useState([]);
  const [hazardsDescription, setHazardsDescription] = useState('');
  const [mitigationDescription, setMitigationDescription] = useState('');
  const [ppeRequired, setPpeRequired] = useState(
    STANDARD_PPE.map(ppe => ({ item: ppe.item, checked: false }))
  );
  const [crewMembers, setCrewMembers] = useState([]);
  const [weatherConditions, setWeatherConditions] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('911');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [nearestHospital, setNearestHospital] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  
  // Alvah-specific fields
  const [pmNumber, setPmNumber] = useState('');
  const [circuit, setCircuit] = useState('');
  const [showUpYardLocation, setShowUpYardLocation] = useState('');
  const [generalForemanName, setGeneralForemanName] = useState('');
  const [inspector, setInspector] = useState('');
  const [inspectorName, setInspectorName] = useState('');
  const [eicName, setEicName] = useState('');
  const [eicPhone, setEicPhone] = useState('');
  
  // Special Mitigation Measures (Yes/No/N/A)
  const [specialMitigations, setSpecialMitigations] = useState(
    SPECIAL_MITIGATIONS.map(m => ({ item: m.id, value: null }))
  );
  
  // Grounding section
  const [groundingNeeded, setGroundingNeeded] = useState(null);
  const [groundingAccountedFor, setGroundingAccountedFor] = useState(null);
  const [groundingLocations, setGroundingLocations] = useState([]);
  
  // Source Side Devices
  const [sourceSideDevices, setSourceSideDevices] = useState([
    { device: '', physicalLocation: '' }
  ]);
  
  // Line characteristics
  const [nominalVoltages, setNominalVoltages] = useState('');
  const [copperConditionInspected, setCopperConditionInspected] = useState(null);
  const [notTiedIntoCircuit, setNotTiedIntoCircuit] = useState(false);
  
  // UG Work Checklist
  const [ugChecklist, setUgChecklist] = useState(
    UG_CHECKLIST_ITEMS.map(item => ({ item: item.id, value: null }))
  );
  const [showUgChecklist, setShowUgChecklist] = useState(false);
  
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
        const jobRes = await api.get(`/api/jobs/${jobId}`);
        setJob(jobRes.data);
        
        // Pre-fill PM number from job if available
        if (jobRes.data.pmNumber) setPmNumber(jobRes.data.pmNumber);
        
        // Check for existing tailboard today
        try {
          const tailboardRes = await api.get(`/api/tailboards/job/${jobId}/today`);
          if (tailboardRes.data) {
            setTailboard(tailboardRes.data);
            
            // Populate form using helper function
            populateFormFromTailboard(tailboardRes.data, {
              setDate, setStartTime, setTaskDescription, setJobSteps, setHazards,
              setHazardsDescription, setMitigationDescription, setPpeRequired, setCrewMembers,
              setWeatherConditions, setEmergencyContact, setEmergencyPhone, setNearestHospital,
              setAdditionalNotes, setPmNumber, setCircuit, setShowUpYardLocation,
              setGeneralForemanName, setInspector, setInspectorName, setEicName, setEicPhone,
              setSpecialMitigations, setGroundingNeeded, setGroundingAccountedFor,
              setGroundingLocations, setSourceSideDevices, setNominalVoltages,
              setCopperConditionInspected, setNotTiedIntoCircuit, setUgChecklist, setShowUgChecklist
            });
          }
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

  // Build full data object for save/complete
  const buildTailboardData = () => ({
    jobId,
    date: new Date(date),
    startTime,
    taskDescription,
    jobSteps,
    hazards,
    hazardsDescription,
    mitigationDescription,
    specialMitigations,
    ppeRequired,
    crewMembers,
    weatherConditions,
    emergencyContact,
    emergencyPhone,
    nearestHospital,
    additionalNotes,
    // Alvah-specific fields
    pmNumber,
    circuit,
    showUpYardLocation,
    generalForemanName,
    inspector,
    inspectorName,
    eicName,
    eicPhone,
    sourceSideDevices: sourceSideDevices.filter(d => d.device || d.physicalLocation),
    grounding: {
      needed: groundingNeeded,
      accountedFor: groundingAccountedFor,
      locations: groundingLocations
    },
    nominalVoltages,
    copperConditionInspected,
    notTiedIntoCircuit,
    ugChecklist: showUgChecklist ? ugChecklist : []
  });

  // Save tailboard (draft)
  const handleSave = async () => {
    try {
      setSaving(true);
      
      const data = buildTailboardData();
      
      if (tailboard?._id) {
        // Update existing
        const res = await api.put(`/api/tailboards/${tailboard._id}`, data);
        setTailboard(res.data);
      } else {
        // Create new
        const res = await api.post('/api/tailboards', data);
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
      
      // Save first and get the tailboard ID
      let currentTailboard = tailboard;
      const saveData = buildTailboardData();
      
      if (currentTailboard?._id) {
        const res = await api.put(`/api/tailboards/${currentTailboard._id}`, saveData);
        currentTailboard = res.data;
      } else {
        const res = await api.post('/api/tailboards', saveData);
        currentTailboard = res.data;
      }
      setTailboard(currentTailboard);
      
      // Then complete
      const res = await api.post(`/api/tailboards/${currentTailboard._id}/complete`);
      setTailboard(res.data);
      
      setSnackbar({ open: true, message: 'Tailboard completed!', severity: 'success' });
      
      // Navigate back to Close Out page after a moment
      setTimeout(() => navigate(`/jobs/${jobId}/closeout`), 1500);
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
    
    // NOSONAR: Math.random() for local form element IDs is safe - not security-sensitive
    const newHazard = {
      id: `hazard-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, // NOSONAR
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
        const res = await api.post(`/api/tailboards/${tailboard._id}/sign`, signatureData);
        setCrewMembers(res.data.crewMembers);
      } else {
        // Just add locally for now
        // NOSONAR: Math.random() for local form element IDs is safe
        setCrewMembers([...crewMembers, { 
          id: `crew-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, // NOSONAR
          ...signatureData, 
          signedAt: new Date() 
        }]);
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

  // Toggle special mitigation value (yes/no/na)
  const handleMitigationChange = (itemId, value) => {
    setSpecialMitigations(prev => 
      prev.map(m => m.item === itemId ? { ...m, value } : m)
    );
  };

  // Toggle UG checklist value (yes/no/na)
  const handleUgChecklistChange = (itemId, value) => {
    setUgChecklist(prev => 
      prev.map(item => item.item === itemId ? { ...item, value } : item)
    );
  };

  // Add grounding location
  const handleAddGroundingLocation = () => {
    // NOSONAR: Math.random() for local form element IDs is safe
    setGroundingLocations([...groundingLocations, { 
      id: `grounding-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, // NOSONAR
      location: '', installed: false, removed: false 
    }]);
  };

  // Update grounding location
  const handleGroundingLocationChange = (index, field, value) => {
    const updated = [...groundingLocations];
    updated[index][field] = value;
    setGroundingLocations(updated);
  };

  // Check if form has required fields to complete
  const canComplete = () => {
    const hasHazards = hazards.length > 0 || hazardsDescription.trim().length > 0;
    const hasSignatures = crewMembers.length > 0;
    return hasHazards && hasSignatures;
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
          <IconButton onClick={() => navigate(`/jobs/${jobId}/closeout`)} aria-label="Go back to close out">
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
        
        {/* General Information - Row 1 */}
        <Grid container spacing={2} sx={{ mb: 2 }}>
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
          <Grid item xs={6} sm={3}>
            <TextField
              label="PM#"
              value={pmNumber}
              onChange={(e) => setPmNumber(e.target.value)}
              fullWidth
              size="small"
              disabled={isCompleted}
              placeholder="Project #"
            />
          </Grid>
          <Grid item xs={6} sm={3}>
            <TextField
              label="Circuit#"
              value={circuit}
              onChange={(e) => setCircuit(e.target.value)}
              fullWidth
              size="small"
              disabled={isCompleted}
            />
          </Grid>
        </Grid>

        {/* General Information - Row 2 */}
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={12} sm={6}>
            <TextField
              label="General Foreman"
              value={generalForemanName}
              onChange={(e) => setGeneralForemanName(e.target.value)}
              fullWidth
              size="small"
              disabled={isCompleted}
            />
          </Grid>
          <Grid item xs={6} sm={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Inspector</InputLabel>
              <Select
                value={inspector}
                onChange={(e) => setInspector(e.target.value)}
                label="Inspector"
                disabled={isCompleted}
              >
                <MenuItem value="">None</MenuItem>
                {INSPECTOR_OPTIONS.map(opt => (
                  <MenuItem key={opt.id} value={opt.id}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          {inspector === 'other' && (
            <Grid item xs={6} sm={3}>
              <TextField
                label="Inspector Name"
                value={inspectorName}
                onChange={(e) => setInspectorName(e.target.value)}
                fullWidth
                size="small"
                disabled={isCompleted}
              />
            </Grid>
          )}
        </Grid>

        {/* General Information - Row 3 */}
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={6} sm={4}>
            <TextField
              label="EIC Name"
              value={eicName}
              onChange={(e) => setEicName(e.target.value)}
              fullWidth
              size="small"
              disabled={isCompleted}
              placeholder="Employee In Charge"
            />
          </Grid>
          <Grid item xs={6} sm={4}>
            <TextField
              label="EIC Phone"
              value={eicPhone}
              onChange={(e) => setEicPhone(e.target.value)}
              fullWidth
              size="small"
              disabled={isCompleted}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              label="Show Up Yard Location"
              value={showUpYardLocation}
              onChange={(e) => setShowUpYardLocation(e.target.value)}
              fullWidth
              size="small"
              disabled={isCompleted}
            />
          </Grid>
        </Grid>

        {/* Weather */}
        <Grid container spacing={2}>
          <Grid item xs={12}>
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

      {/* Work Description & Job Steps */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          Summary of Work - Job Steps
        </Typography>
        <TextField
          value={jobSteps}
          onChange={(e) => setJobSteps(e.target.value)}
          fullWidth
          multiline
          rows={3}
          disabled={isCompleted}
          placeholder="Describe the work steps to be performed today..."
          sx={{ mb: 2 }}
        />
        
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          Hazards Associated with Work
        </Typography>
        <TextField
          value={hazardsDescription}
          onChange={(e) => setHazardsDescription(e.target.value)}
          fullWidth
          multiline
          rows={2}
          disabled={isCompleted}
          placeholder="Traffic, pedestrians, overhead loads, rigging failure, accidental contacts, pulling tension, slip/trip, open holes, atmosphere, COVID, new crew, backing incidents, 3rd party contractors..."
          sx={{ mb: 2 }}
        />
        
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          Mitigation Measures - What Will Be Done to Eliminate Hazards
        </Typography>
        <TextField
          value={mitigationDescription}
          onChange={(e) => setMitigationDescription(e.target.value)}
          fullWidth
          multiline
          rows={2}
          disabled={isCompleted}
          placeholder="T/C, stay out from under loads, inspect tools and rigging, boom spotter, watch footing, 3-way comm, ask questions, 3 points contact, drink water, test boxes before entering, TAPE TAPE TAPE..."
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
                <Accordion key={hazard.id || `hazard-${index}`} defaultExpanded>
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
                        color={getRiskLevelColor(hazard.riskLevel)}
                      />
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Controls / Mitigations:
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {hazard.controls.map((control) => (
                        <Chip key={`${hazard.id}-${control}`} label={control} size="small" variant="outlined" />
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

      {/* Special Mitigation Measures */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <ElectricalIcon color="warning" />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Special Mitigation Measures
          </Typography>
        </Box>
        
        <Grid container spacing={1}>
          {SPECIAL_MITIGATIONS.map((mitigation) => {
            const current = specialMitigations.find(m => m.item === mitigation.id);
            return (
              <Grid item xs={12} sm={6} key={mitigation.id}>
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  p: 1,
                  bgcolor: 'action.hover',
                  borderRadius: 1,
                  mb: 0.5
                }}>
                  <Typography variant="body2" sx={{ flex: 1, color: 'text.primary' }}>
                    {mitigation.label}
                  </Typography>
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={current?.value || null}
                    onChange={(e, val) => handleMitigationChange(mitigation.id, val)}
                    disabled={isCompleted}
                  >
                    <ToggleButton value="yes" sx={{ px: 1.5, py: 0.5 }}>
                      <Typography variant="caption">Yes</Typography>
                    </ToggleButton>
                    <ToggleButton value="no" sx={{ px: 1.5, py: 0.5 }}>
                      <Typography variant="caption">No</Typography>
                    </ToggleButton>
                  </ToggleButtonGroup>
                </Box>
              </Grid>
            );
          })}
        </Grid>
      </Paper>

      {/* Grounding Section */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <EngineeringIcon color="primary" />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Grounding Per Title 8, §2941
          </Typography>
        </Box>
        
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={12} sm={6}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="body2">Will Grounding Be Needed?</Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={groundingNeeded}
                onChange={(e, val) => setGroundingNeeded(val)}
                disabled={isCompleted}
              >
                <ToggleButton value="yes">Yes</ToggleButton>
                <ToggleButton value="no">No</ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="body2">Grounds accounted for by foreman?</Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={groundingAccountedFor}
                onChange={(e, val) => setGroundingAccountedFor(val)}
                disabled={isCompleted}
              >
                <ToggleButton value="yes">Yes</ToggleButton>
                <ToggleButton value="no">No</ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </Grid>
        </Grid>
        
        {groundingNeeded === 'yes' && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              List ALL Locations Requiring Grounding:
            </Typography>
            {groundingLocations.map((loc, index) => (
              <Box key={loc.id || `grounding-${index}`} sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <TextField
                  size="small"
                  value={loc.location}
                  onChange={(e) => handleGroundingLocationChange(index, 'location', e.target.value)}
                  placeholder="Grounding location"
                  sx={{ flex: 1 }}
                  disabled={isCompleted}
                />
                <FormControlLabel
                  control={
                    <Checkbox 
                      checked={loc.installed} 
                      onChange={(e) => handleGroundingLocationChange(index, 'installed', e.target.checked)}
                      disabled={isCompleted}
                      size="small"
                    />
                  }
                  label="Installed"
                />
                <FormControlLabel
                  control={
                    <Checkbox 
                      checked={loc.removed} 
                      onChange={(e) => handleGroundingLocationChange(index, 'removed', e.target.checked)}
                      disabled={isCompleted}
                      size="small"
                    />
                  }
                  label="Removed"
                />
              </Box>
            ))}
            {!isCompleted && (
              <Button size="small" startIcon={<AddIcon />} onClick={handleAddGroundingLocation}>
                Add Location
              </Button>
            )}
          </Box>
        )}
        
        <Divider sx={{ my: 2 }} />
        
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Nominal Voltages of Lines/Equipment"
              value={nominalVoltages}
              onChange={(e) => setNominalVoltages(e.target.value)}
              fullWidth
              size="small"
              disabled={isCompleted}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="body2">#6-Copper condition inspected?</Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={copperConditionInspected}
                onChange={(e, val) => setCopperConditionInspected(val)}
                disabled={isCompleted}
              >
                <ToggleButton value="yes">Yes</ToggleButton>
                <ToggleButton value="no">No</ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </Grid>
          <Grid item xs={12}>
            <FormControlLabel
              control={
                <Checkbox 
                  checked={notTiedIntoCircuit}
                  onChange={(e) => setNotTiedIntoCircuit(e.target.checked)}
                  disabled={isCompleted}
                />
              }
              label="Not Tied Into Circuit"
            />
          </Grid>
        </Grid>
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
              <Grid item xs={6} sm={4} md={3} key={member.id || member._id || `crew-${index}`}>
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

      {/* UG Work Completed Checklist */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ChecklistIcon color="primary" />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              UG Work Completed Checklist
            </Typography>
          </Box>
          <FormControlLabel
            control={
              <Checkbox
                checked={showUgChecklist}
                onChange={(e) => setShowUgChecklist(e.target.checked)}
                disabled={isCompleted}
              />
            }
            label="Show UG Checklist"
          />
        </Box>
        
        {showUgChecklist && (
          <Grid container spacing={1}>
            {UG_CHECKLIST_ITEMS.map((checkItem) => {
              const current = ugChecklist.find(c => c.item === checkItem.id);
              return (
                <Grid item xs={12} key={checkItem.id}>
                  <Box sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    p: 1,
                    bgcolor: 'action.hover',
                    borderRadius: 1,
                    mb: 0.5
                  }}>
                    <Typography variant="body2" sx={{ flex: 1, color: 'text.primary' }}>
                      {checkItem.label}
                    </Typography>
                    <ToggleButtonGroup
                      size="small"
                      exclusive
                      value={current?.value || null}
                      onChange={(e, val) => handleUgChecklistChange(checkItem.id, val)}
                      disabled={isCompleted}
                    >
                      <ToggleButton value="na" sx={{ px: 1, py: 0.5 }}>
                        <Typography variant="caption">N/A</Typography>
                      </ToggleButton>
                      <ToggleButton value="yes" color="success" sx={{ px: 1, py: 0.5 }}>
                        <Typography variant="caption">Yes</Typography>
                      </ToggleButton>
                      <ToggleButton value="no" color="error" sx={{ px: 1, py: 0.5 }}>
                        <Typography variant="caption">No</Typography>
                      </ToggleButton>
                    </ToggleButtonGroup>
                  </Box>
                </Grid>
              );
            })}
          </Grid>
        )}
        
        {!showUgChecklist && (
          <Typography variant="body2" color="text.secondary">
            Enable "Show UG Checklist" if performing underground electrical work.
          </Typography>
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
          <Grid item xs={12} sm={4}>
            <TextField
              label="Emergency Contact"
              value={emergencyContact}
              onChange={(e) => setEmergencyContact(e.target.value)}
              fullWidth
              size="small"
              disabled={isCompleted}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              label="Emergency Phone"
              value={emergencyPhone}
              onChange={(e) => setEmergencyPhone(e.target.value)}
              fullWidth
              size="small"
              disabled={isCompleted}
              placeholder="911"
            />
          </Grid>
          <Grid item xs={12} sm={4}>
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
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mb: 4 }}>
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
            disabled={saving || !canComplete()}
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
