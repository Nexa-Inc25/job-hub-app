/**
 * PG&E LME Form - Daily Statement of Labor, Material, and Equipment
 * 
 * Official PG&E contractor timesheet format.
 * Captures: Labor (craft, name, hours by type), Materials, Equipment
 * 
 * @module components/LMEForm
 */

import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  IconButton,
  TextField,
  Paper,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Select,
  MenuItem,
  FormControl,
  Chip,
  Alert,
  CircularProgress,
  Fab,
} from '@mui/material';
import BackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import PersonIcon from '@mui/icons-material/Person';
import BuildIcon from '@mui/icons-material/Build';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import api from '../api';

// PG&E craft codes
const CRAFT_CODES = [
  { code: 'GF', label: 'General Foreman' },
  { code: 'F', label: 'Foreman' },
  { code: 'JL', label: 'Journeyman Lineman' },
  { code: 'AL', label: 'Apprentice Lineman' },
  { code: 'GM', label: 'Groundman' },
  { code: 'EO', label: 'Equipment Operator' },
  { code: 'FL', label: 'Flagger' },
  { code: 'LAB', label: 'Laborer' },
  { code: 'DR', label: 'Driver' },
  { code: 'CAB', label: 'Cable Splicer' },
  { code: 'EL', label: 'Electrician' },
];

// Rate types
const RATE_TYPES = [
  { code: 'ST', label: 'Straight Time', multiplier: 1 },
  { code: 'OT', label: 'Overtime (1.5x)', multiplier: 1.5 },
  { code: 'PT', label: 'Premium Time', multiplier: 1.5 },
  { code: 'DT', label: 'Double Time', multiplier: 2 },
];

// Equipment types commonly used
const EQUIPMENT_TYPES = [
  'Bucket Truck',
  'Digger Derrick',
  'Crane',
  'Flatbed Truck',
  'Pickup Truck',
  'Backhoe',
  'Trencher',
  'Air Compressor',
  'Generator',
  'Trailer',
  'Pole Trailer',
  'Wire Trailer',
];

/**
 * Labor Entry Row Component
 */
const LaborRow = ({ entry, index, onUpdate, onRemove, rates }) => {
  const calculateAmount = (hours, rateType, baseRate) => {
    const multiplier = RATE_TYPES.find(r => r.code === rateType)?.multiplier || 1;
    return (Number.parseFloat(hours) || 0) * (Number.parseFloat(baseRate) || 0) * multiplier;
  };

  const handleChange = (field, value) => {
    const updated = { ...entry, [field]: value };
    
    // Recalculate amounts when hours or rate changes
    if (['stHours', 'otHours', 'dtHours', 'rate'].includes(field)) {
      updated.stAmount = calculateAmount(updated.stHours, 'ST', updated.rate);
      updated.otAmount = calculateAmount(updated.otHours, 'OT', updated.rate);
      updated.dtAmount = calculateAmount(updated.dtHours, 'DT', updated.rate);
      updated.totalAmount = updated.stAmount + updated.otAmount + updated.dtAmount;
    }
    
    onUpdate(index, updated);
  };

  return (
    <>
      {/* Main row */}
      <TableRow sx={{ '& td': { py: 0.5, borderBottom: 'none' } }}>
        <TableCell rowSpan={3} sx={{ verticalAlign: 'top', width: 80 }}>
          <FormControl size="small" fullWidth>
            <Select
              value={entry.craft || ''}
              onChange={(e) => handleChange('craft', e.target.value)}
              displayEmpty
            >
              <MenuItem value="" disabled><em>Craft</em></MenuItem>
              {CRAFT_CODES.map(c => (
                <MenuItem key={c.code} value={c.code}>{c.code}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </TableCell>
        <TableCell rowSpan={3} sx={{ verticalAlign: 'top' }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Name"
            value={entry.name || ''}
            onChange={(e) => handleChange('name', e.target.value)}
          />
        </TableCell>
        <TableCell sx={{ width: 60, textAlign: 'center', fontWeight: 600 }}>ST</TableCell>
        <TableCell sx={{ width: 70 }}>
          <TextField
            size="small"
            type="number"
            inputProps={{ step: 0.5, min: 0 }}
            value={entry.stHours || ''}
            onChange={(e) => handleChange('stHours', e.target.value)}
            sx={{ '& input': { textAlign: 'center', p: 0.5 } }}
          />
        </TableCell>
        <TableCell rowSpan={3} sx={{ verticalAlign: 'top', width: 80 }}>
          <TextField
            size="small"
            type="number"
            inputProps={{ step: 0.01, min: 0 }}
            value={entry.rate || ''}
            onChange={(e) => handleChange('rate', e.target.value)}
            placeholder="$/hr"
            sx={{ '& input': { textAlign: 'right', p: 0.5 } }}
          />
        </TableCell>
        <TableCell sx={{ width: 90, textAlign: 'right' }}>
          ${(entry.stAmount || 0).toFixed(2)}
        </TableCell>
        <TableCell rowSpan={3} sx={{ verticalAlign: 'top', width: 40 }}>
          <IconButton size="small" color="error" onClick={() => onRemove(index)}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </TableCell>
      </TableRow>
      {/* OT row */}
      <TableRow sx={{ '& td': { py: 0.5, borderBottom: 'none' } }}>
        <TableCell sx={{ textAlign: 'center', fontWeight: 600 }}>OT/PT</TableCell>
        <TableCell>
          <TextField
            size="small"
            type="number"
            inputProps={{ step: 0.5, min: 0 }}
            value={entry.otHours || ''}
            onChange={(e) => handleChange('otHours', e.target.value)}
            sx={{ '& input': { textAlign: 'center', p: 0.5 } }}
          />
        </TableCell>
        <TableCell sx={{ textAlign: 'right' }}>
          ${(entry.otAmount || 0).toFixed(2)}
        </TableCell>
      </TableRow>
      {/* DT row */}
      <TableRow sx={{ '& td': { py: 0.5 } }}>
        <TableCell sx={{ textAlign: 'center', fontWeight: 600 }}>DT</TableCell>
        <TableCell>
          <TextField
            size="small"
            type="number"
            inputProps={{ step: 0.5, min: 0 }}
            value={entry.dtHours || ''}
            onChange={(e) => handleChange('dtHours', e.target.value)}
            sx={{ '& input': { textAlign: 'center', p: 0.5 } }}
          />
        </TableCell>
        <TableCell sx={{ textAlign: 'right', fontWeight: 600 }}>
          ${(entry.totalAmount || 0).toFixed(2)}
        </TableCell>
      </TableRow>
    </>
  );
};

LaborRow.propTypes = {
  entry: PropTypes.shape({
    craft: PropTypes.string,
    name: PropTypes.string,
    stHours: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    otHours: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    dtHours: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    rate: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    stAmount: PropTypes.number,
    otAmount: PropTypes.number,
    dtAmount: PropTypes.number,
    totalAmount: PropTypes.number,
  }).isRequired,
  index: PropTypes.number.isRequired,
  onUpdate: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
  rates: PropTypes.object,
};

/**
 * Material Entry Row
 */
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
      <TableCell>
        <TextField
          size="small"
          fullWidth
          placeholder="Material Description"
          value={entry.description || ''}
          onChange={(e) => handleChange('description', e.target.value)}
        />
      </TableCell>
      <TableCell sx={{ width: 100 }}>
        <TextField
          size="small"
          placeholder="Unit"
          value={entry.unit || ''}
          onChange={(e) => handleChange('unit', e.target.value)}
        />
      </TableCell>
      <TableCell sx={{ width: 80 }}>
        <TextField
          size="small"
          type="number"
          value={entry.quantity || ''}
          onChange={(e) => handleChange('quantity', e.target.value)}
        />
      </TableCell>
      <TableCell sx={{ width: 100 }}>
        <TextField
          size="small"
          type="number"
          inputProps={{ step: 0.01 }}
          value={entry.unitCost || ''}
          onChange={(e) => handleChange('unitCost', e.target.value)}
          placeholder="$"
        />
      </TableCell>
      <TableCell sx={{ width: 100, textAlign: 'right' }}>
        ${(entry.amount || 0).toFixed(2)}
      </TableCell>
      <TableCell sx={{ width: 40 }}>
        <IconButton size="small" color="error" onClick={() => onRemove(index)}>
          <DeleteIcon fontSize="small" />
        </IconButton>
      </TableCell>
    </TableRow>
  );
};

MaterialRow.propTypes = {
  entry: PropTypes.shape({
    description: PropTypes.string,
    unit: PropTypes.string,
    quantity: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    unitCost: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    amount: PropTypes.number,
  }).isRequired,
  index: PropTypes.number.isRequired,
  onUpdate: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
};

/**
 * Equipment Entry Row
 */
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
          <Select
            value={entry.type || ''}
            onChange={(e) => handleChange('type', e.target.value)}
            displayEmpty
          >
            <MenuItem value="" disabled><em>Select Equipment</em></MenuItem>
            {EQUIPMENT_TYPES.map(eq => (
              <MenuItem key={eq} value={eq}>{eq}</MenuItem>
            ))}
            <MenuItem value="other">Other...</MenuItem>
          </Select>
        </FormControl>
      </TableCell>
      <TableCell sx={{ width: 150 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Unit/ID #"
          value={entry.unitNumber || ''}
          onChange={(e) => handleChange('unitNumber', e.target.value)}
        />
      </TableCell>
      <TableCell sx={{ width: 80 }}>
        <TextField
          size="small"
          type="number"
          inputProps={{ step: 0.5 }}
          value={entry.hours || ''}
          onChange={(e) => handleChange('hours', e.target.value)}
          placeholder="Hrs"
        />
      </TableCell>
      <TableCell sx={{ width: 100 }}>
        <TextField
          size="small"
          type="number"
          inputProps={{ step: 0.01 }}
          value={entry.rate || ''}
          onChange={(e) => handleChange('rate', e.target.value)}
          placeholder="$/hr"
        />
      </TableCell>
      <TableCell sx={{ width: 100, textAlign: 'right' }}>
        ${(entry.amount || 0).toFixed(2)}
      </TableCell>
      <TableCell sx={{ width: 40 }}>
        <IconButton size="small" color="error" onClick={() => onRemove(index)}>
          <DeleteIcon fontSize="small" />
        </IconButton>
      </TableCell>
    </TableRow>
  );
};

EquipmentRow.propTypes = {
  entry: PropTypes.shape({
    type: PropTypes.string,
    unitNumber: PropTypes.string,
    hours: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    rate: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    amount: PropTypes.number,
  }).isRequired,
  index: PropTypes.number.isRequired,
  onUpdate: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
};

/**
 * Main LME Form Component
 */
const LMEForm = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();

  // Form state
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // LME data
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

  // Labor, Material, Equipment entries
  const [laborEntries, setLaborEntries] = useState([
    { craft: '', name: '', stHours: '', otHours: '', dtHours: '', rate: '', stAmount: 0, otAmount: 0, dtAmount: 0, totalAmount: 0 }
  ]);
  const [materialEntries, setMaterialEntries] = useState([]);
  const [equipmentEntries, setEquipmentEntries] = useState([]);

  // Load job data
  useEffect(() => {
    const loadJob = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/api/jobs/${jobId}`);
        setJob(res.data);
        
        // Pre-fill work description from job
        if (res.data.jobScope?.description) {
          setWorkDescription(res.data.jobScope.description);
        } else if (res.data.description) {
          setWorkDescription(res.data.description);
        }
        
        // Generate LME number
        const dateStr = new Date().toISOString().split('T')[0].replaceAll('-', '');
        setLmeNumber(`${res.data.pmNumber || res.data.woNumber}-${dateStr}`);
        
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (jobId) loadJob();
  }, [jobId]);

  // Calculate totals
  const laborTotal = laborEntries.reduce((sum, e) => sum + (e.totalAmount || 0), 0);
  const materialTotal = materialEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
  const equipmentTotal = equipmentEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
  const grandTotal = laborTotal + materialTotal + equipmentTotal;

  // Handlers
  const addLaborEntry = () => {
    setLaborEntries([...laborEntries, { 
      id: `labor-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      craft: '', name: '', stHours: '', otHours: '', dtHours: '', rate: '', 
      stAmount: 0, otAmount: 0, dtAmount: 0, totalAmount: 0 
    }]);
  };

  const updateLaborEntry = (index, entry) => {
    const updated = [...laborEntries];
    updated[index] = entry;
    setLaborEntries(updated);
  };

  const removeLaborEntry = (index) => {
    setLaborEntries(laborEntries.filter((_, i) => i !== index));
  };

  const addMaterialEntry = () => {
    setMaterialEntries([...materialEntries, { 
      id: `material-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      description: '', unit: 'EA', quantity: '', unitCost: '', amount: 0 
    }]);
  };

  const updateMaterialEntry = (index, entry) => {
    const updated = [...materialEntries];
    updated[index] = entry;
    setMaterialEntries(updated);
  };

  const removeMaterialEntry = (index) => {
    setMaterialEntries(materialEntries.filter((_, i) => i !== index));
  };

  const addEquipmentEntry = () => {
    setEquipmentEntries([...equipmentEntries, { 
      id: `equipment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: '', unitNumber: '', hours: '', rate: '', amount: 0 
    }]);
  };

  const updateEquipmentEntry = (index, entry) => {
    const updated = [...equipmentEntries];
    updated[index] = entry;
    setEquipmentEntries(updated);
  };

  const removeEquipmentEntry = (index) => {
    setEquipmentEntries(equipmentEntries.filter((_, i) => i !== index));
  };

  // Save LME
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    
    try {
      const lmeData = {
        jobId,
        lmeNumber,
        date,
        startTime,
        endTime,
        workDescription,
        subcontractorName,
        missedMeals,
        subsistanceCount,
        sheetNumber,
        totalSheets,
        labor: laborEntries.filter(e => e.name),
        materials: materialEntries.filter(e => e.description),
        equipment: equipmentEntries.filter(e => e.type),
        totals: {
          labor: laborTotal,
          material: materialTotal,
          equipment: equipmentTotal,
          grand: grandTotal,
        },
        jobInfo: {
          pmNumber: job?.pmNumber,
          woNumber: job?.woNumber,
          notificationNumber: job?.notificationNumber,
          address: job?.address,
          poNumber: job?.poNumber,
          fieldAuthNumber: job?.fieldAuthNumber,
          corNumber: job?.corNumber,
        },
      };

      await api.post('/api/lme', lmeData);
      setSuccess('LME saved successfully!');
      
      // Navigate back after short delay
      setTimeout(() => navigate(-1), 1500);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh', pb: 10 }}>
      {/* Header */}
      <Paper sx={{ p: 2, mb: 2, borderRadius: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <IconButton onClick={() => navigate(-1)}>
            <BackIcon />
          </IconButton>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" fontWeight="bold" color="primary">
              Daily Statement of Labor, Material, and Equipment
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Pacific Gas and Electric Company - LME Form
            </Typography>
          </Box>
          <Chip label="ALVAH CONTRACTORS" color="primary" />
        </Box>

        {/* Job Info Header */}
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Grid container spacing={1}>
                <Grid item xs={6}>
                  <TextField
                    size="small"
                    fullWidth
                    label="PM/NOTIF NO."
                    value={job?.pmNumber || job?.notificationNumber || ''}
                    InputProps={{ readOnly: true }}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    size="small"
                    fullWidth
                    label="JOB NO."
                    value={job?.woNumber || ''}
                    InputProps={{ readOnly: true }}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    size="small"
                    fullWidth
                    label="PO / CWA NO."
                    value={job?.poNumber || ''}
                    InputProps={{ readOnly: true }}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    size="small"
                    fullWidth
                    label="FIELD AUTH. / COR NO."
                    value={job?.fieldAuthNumber || job?.corNumber || ''}
                    InputProps={{ readOnly: true }}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    size="small"
                    fullWidth
                    label="JOB LOCATION"
                    value={`${job?.address || ''}, ${job?.city || ''}`}
                    InputProps={{ readOnly: true }}
                  />
                </Grid>
              </Grid>
            </Paper>
          </Grid>

          <Grid item xs={12} md={6}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Grid container spacing={1}>
                <Grid item xs={6}>
                  <TextField
                    size="small"
                    fullWidth
                    label="LME No."
                    value={lmeNumber}
                    onChange={(e) => setLmeNumber(e.target.value)}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    size="small"
                    fullWidth
                    type="date"
                    label="DATE"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={3}>
                  <TextField
                    size="small"
                    fullWidth
                    type="time"
                    label="START"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={3}>
                  <TextField
                    size="small"
                    fullWidth
                    type="time"
                    label="END"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={3}>
                  <TextField
                    size="small"
                    fullWidth
                    type="number"
                    label="Missed Meals"
                    value={missedMeals}
                    onChange={(e) => setMissedMeals(e.target.value)}
                    helperText="0.5 hrs each"
                  />
                </Grid>
                <Grid item xs={3}>
                  <TextField
                    size="small"
                    fullWidth
                    type="number"
                    label="Subsistance"
                    value={subsistanceCount}
                    onChange={(e) => setSubsistanceCount(e.target.value)}
                    helperText="Count"
                  />
                </Grid>
                <Grid item xs={4}>
                  <TextField
                    size="small"
                    fullWidth
                    label="Sheet"
                    value={sheetNumber}
                    onChange={(e) => setSheetNumber(e.target.value)}
                  />
                </Grid>
                <Grid item xs={2} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography>of</Typography>
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    size="small"
                    fullWidth
                    value={totalSheets}
                    onChange={(e) => setTotalSheets(e.target.value)}
                  />
                </Grid>
              </Grid>
            </Paper>
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              multiline
              rows={2}
              label="DESCRIPTION OF WORK"
              value={workDescription}
              onChange={(e) => setWorkDescription(e.target.value)}
            />
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              label="IF SUBCONTRACTOR USED, ENTER NAME(S) HERE"
              value={subcontractorName}
              onChange={(e) => setSubcontractorName(e.target.value)}
            />
          </Grid>
        </Grid>
      </Paper>

      {/* Error/Success */}
      {error && <Alert severity="error" sx={{ mx: 2, mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mx: 2, mb: 2 }}>{success}</Alert>}

      {/* LABOR SECTION */}
      <Paper sx={{ mx: 2, mb: 2, p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PersonIcon color="primary" />
            <Typography variant="h6" fontWeight="bold">CONTRACTOR'S LABOR</Typography>
          </Box>
          <Button startIcon={<AddIcon />} onClick={addLaborEntry} variant="outlined" size="small">
            Add Worker
          </Button>
        </Box>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'primary.main' }}>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>CRAFT</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>NAME</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold', textAlign: 'center' }}>HRS/DYS</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold', textAlign: 'center' }}>ST/PT</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold', textAlign: 'right' }}>RATE</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold', textAlign: 'right' }}>AMOUNT</TableCell>
                <TableCell sx={{ width: 40 }}></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {laborEntries.map((entry, idx) => (
                <LaborRow
                  key={entry.id || `labor-${idx}`}
                  entry={entry}
                  index={idx}
                  onUpdate={updateLaborEntry}
                  onRemove={removeLaborEntry}
                />
              ))}
              <TableRow sx={{ bgcolor: 'grey.100' }}>
                <TableCell colSpan={5} sx={{ textAlign: 'right', fontWeight: 'bold' }}>
                  LABOR TOTAL:
                </TableCell>
                <TableCell sx={{ textAlign: 'right', fontWeight: 'bold', fontSize: '1.1rem' }}>
                  ${laborTotal.toFixed(2)}
                </TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* MATERIAL SECTION */}
      <Paper sx={{ mx: 2, mb: 2, p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BuildIcon color="secondary" />
            <Typography variant="h6" fontWeight="bold">MATERIAL</Typography>
          </Box>
          <Button startIcon={<AddIcon />} onClick={addMaterialEntry} variant="outlined" size="small">
            Add Material
          </Button>
        </Box>

        {materialEntries.length > 0 ? (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'secondary.main' }}>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>DESCRIPTION</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>UNIT</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>QTY</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>UNIT COST</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold', textAlign: 'right' }}>AMOUNT</TableCell>
                  <TableCell sx={{ width: 40 }}></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {materialEntries.map((entry, idx) => (
                  <MaterialRow
                    key={entry.id || `material-${idx}`}
                    entry={entry}
                    index={idx}
                    onUpdate={updateMaterialEntry}
                    onRemove={removeMaterialEntry}
                  />
                ))}
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell colSpan={4} sx={{ textAlign: 'right', fontWeight: 'bold' }}>
                    MATERIAL TOTAL:
                  </TableCell>
                  <TableCell sx={{ textAlign: 'right', fontWeight: 'bold', fontSize: '1.1rem' }}>
                    ${materialTotal.toFixed(2)}
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
            No materials entered. Click "Add Material" to add items.
          </Typography>
        )}
      </Paper>

      {/* EQUIPMENT SECTION */}
      <Paper sx={{ mx: 2, mb: 2, p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LocalShippingIcon color="warning" />
            <Typography variant="h6" fontWeight="bold">EQUIPMENT</Typography>
          </Box>
          <Button startIcon={<AddIcon />} onClick={addEquipmentEntry} variant="outlined" size="small">
            Add Equipment
          </Button>
        </Box>

        {equipmentEntries.length > 0 ? (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'warning.main' }}>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>EQUIPMENT TYPE</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>UNIT #</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>HOURS</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>RATE</TableCell>
                  <TableCell sx={{ color: 'white', fontWeight: 'bold', textAlign: 'right' }}>AMOUNT</TableCell>
                  <TableCell sx={{ width: 40 }}></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {equipmentEntries.map((entry, idx) => (
                  <EquipmentRow
                    key={entry.id || `equipment-${idx}`}
                    entry={entry}
                    index={idx}
                    onUpdate={updateEquipmentEntry}
                    onRemove={removeEquipmentEntry}
                  />
                ))}
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell colSpan={4} sx={{ textAlign: 'right', fontWeight: 'bold' }}>
                    EQUIPMENT TOTAL:
                  </TableCell>
                  <TableCell sx={{ textAlign: 'right', fontWeight: 'bold', fontSize: '1.1rem' }}>
                    ${equipmentTotal.toFixed(2)}
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
            No equipment entered. Click "Add Equipment" to add items.
          </Typography>
        )}
      </Paper>

      {/* GRAND TOTAL */}
      <Paper sx={{ mx: 2, mb: 2, p: 2, bgcolor: 'primary.main', color: 'white' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" fontWeight="bold">GRAND TOTAL</Typography>
          <Typography variant="h4" fontWeight="bold">${grandTotal.toFixed(2)}</Typography>
        </Box>
      </Paper>

      {/* Save FAB */}
      <Fab
        variant="extended"
        color="primary"
        onClick={handleSave}
        disabled={saving}
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
        }}
      >
        {saving ? <CircularProgress size={20} sx={{ mr: 1 }} /> : <SaveIcon sx={{ mr: 1 }} />}
        {saving ? 'Saving...' : 'Save LME'}
      </Fab>
    </Box>
  );
};

export default LMEForm;

