/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Timesheet Entry Component
 * 
 * Mobile-first time tracking for field crews.
 * Features:
 * - Clock in/out with GPS
 * - Break tracking
 * - Crew member management
 * - Daily time summary
 * 
 * @module components/TimesheetEntry
 */

import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Card,
  CardContent,
  Grid,
  Chip,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Avatar,
  Fab,
  Snackbar,
} from '@mui/material';
import BackIcon from '@mui/icons-material/ArrowBack';
import PersonIcon from '@mui/icons-material/Person';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import api from '../api';

// High-contrast colors
const COLORS = {
  bg: '#0a0a0f',
  surface: '#16161f',
  surfaceLight: '#1e1e2a',
  primary: '#00e676',
  primaryDark: '#00c853',
  secondary: '#448aff',
  error: '#ff5252',
  warning: '#ffab00',
  text: '#ffffff',
  textSecondary: '#9e9e9e',
  border: '#333344',
  success: '#00e676',
};

// Work type options
const WORK_TYPES = [
  { value: 'regular', label: 'Regular Time', multiplier: 1 },
  { value: 'overtime', label: 'Overtime (1.5x)', multiplier: 1.5 },
  { value: 'double', label: 'Double Time (2x)', multiplier: 2 },
  { value: 'travel', label: 'Travel Time', multiplier: 1 },
  { value: 'standby', label: 'Standby', multiplier: 1 },
];

/**
 * Time display helper
 */
const formatTime = (date) => {
  if (!date) return '--:--';
  const d = new Date(date);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

const formatDuration = (minutes) => {
  if (!minutes || minutes < 0) return '0:00';
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hrs}:${mins.toString().padStart(2, '0')}`;
};

/**
 * Crew Member Time Card
 */
const CrewMemberCard = ({ member, onEdit, onDelete }) => {
  const totalMinutes = member.entries?.reduce((sum, e) => {
    if (e.clockIn && e.clockOut) {
      const diff = (new Date(e.clockOut) - new Date(e.clockIn)) / 60000;
      return sum + diff - (e.breakMinutes || 0);
    }
    return sum;
  }, 0) || 0;

  return (
    <Card sx={{ bgcolor: COLORS.surface, mb: 1.5, border: `1px solid ${COLORS.border}` }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar sx={{ bgcolor: COLORS.secondary, width: 44, height: 44 }}>
            <PersonIcon />
          </Avatar>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ color: COLORS.text, fontWeight: 600 }}>
              {member.name}
            </Typography>
            <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.75rem' }}>
              {member.classification || 'Field Worker'}
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Typography sx={{ color: COLORS.primary, fontWeight: 700, fontSize: '1.25rem' }}>
              {formatDuration(totalMinutes)}
            </Typography>
            <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.75rem' }}>
              hours
            </Typography>
          </Box>
        </Box>

        {/* Time entries */}
        {member.entries?.length > 0 && (
          <Box sx={{ mt: 2, pl: 6 }}>
            {member.entries.map((entry, idx) => (
              <Box key={entry._id || entry.clockIn || `entry-${idx}`} sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.8rem' }}>
                  {formatTime(entry.clockIn)} - {entry.clockOut ? formatTime(entry.clockOut) : 'Active'}
                </Typography>
                <Chip
                  size="small"
                  label={WORK_TYPES.find(t => t.value === entry.workType)?.label || 'Regular'}
                  sx={{ 
                    height: 20, 
                    bgcolor: COLORS.surfaceLight, 
                    color: COLORS.text,
                    '& .MuiChip-label': { fontSize: '0.65rem', px: 1 },
                  }}
                />
              </Box>
            ))}
          </Box>
        )}

        {/* Actions */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 1 }}>
          <IconButton size="small" onClick={() => onEdit(member)} sx={{ color: COLORS.secondary }}>
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={() => onDelete(member)} sx={{ color: COLORS.error }}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      </CardContent>
    </Card>
  );
};

CrewMemberCard.propTypes = {
  member: PropTypes.shape({
    _id: PropTypes.string,
    id: PropTypes.string,
    name: PropTypes.string,
    classification: PropTypes.string,
    entries: PropTypes.arrayOf(PropTypes.shape({
      clockIn: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
      clockOut: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
      breakMinutes: PropTypes.number,
      workType: PropTypes.string,
    })),
  }).isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};

/**
 * Add/Edit Time Entry Dialog
 */
const TimeEntryDialog = ({ open, onClose, onSave, member, entry }) => {
  const [clockIn, setClockIn] = useState(entry?.clockIn ? new Date(entry.clockIn).toTimeString().slice(0, 5) : '');
  const [clockOut, setClockOut] = useState(entry?.clockOut ? new Date(entry.clockOut).toTimeString().slice(0, 5) : '');
  const [breakMinutes, setBreakMinutes] = useState(entry?.breakMinutes || 30);
  const [workType, setWorkType] = useState(entry?.workType || 'regular');
  const [notes, setNotes] = useState(entry?.notes || '');

  const handleSave = () => {
    const today = new Date().toISOString().split('T')[0];
    onSave({
      memberId: member._id || member.id,
      memberName: member.name,
      clockIn: clockIn ? new Date(`${today}T${clockIn}`) : null,
      clockOut: clockOut ? new Date(`${today}T${clockOut}`) : null,
      breakMinutes: Number.parseInt(breakMinutes, 10) || 0,
      workType,
      notes,
    });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} PaperProps={{ sx: { bgcolor: COLORS.surface, minWidth: 320 } }}>
      <DialogTitle sx={{ color: COLORS.text }}>
        {entry ? 'Edit Time Entry' : 'Add Time Entry'}
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ color: COLORS.textSecondary, mb: 2 }}>
          {member?.name}
        </Typography>

        <Grid container spacing={2}>
          <Grid item xs={6}>
            <TextField
              fullWidth
              type="time"
              label="Clock In"
              value={clockIn}
              onChange={(e) => setClockIn(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  color: COLORS.text,
                  '& fieldset': { borderColor: COLORS.border },
                },
                '& .MuiInputLabel-root': { color: COLORS.textSecondary },
              }}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              fullWidth
              type="time"
              label="Clock Out"
              value={clockOut}
              onChange={(e) => setClockOut(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  color: COLORS.text,
                  '& fieldset': { borderColor: COLORS.border },
                },
                '& .MuiInputLabel-root': { color: COLORS.textSecondary },
              }}
            />
          </Grid>
        </Grid>

        <FormControl fullWidth sx={{ mt: 2 }}>
          <InputLabel sx={{ color: COLORS.textSecondary }}>Work Type</InputLabel>
          <Select
            value={workType}
            onChange={(e) => setWorkType(e.target.value)}
            label="Work Type"
            sx={{
              color: COLORS.text,
              '& .MuiOutlinedInput-notchedOutline': { borderColor: COLORS.border },
            }}
          >
            {WORK_TYPES.map((type) => (
              <MenuItem key={type.value} value={type.value}>
                {type.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          fullWidth
          type="number"
          label="Break (minutes)"
          value={breakMinutes}
          onChange={(e) => setBreakMinutes(e.target.value)}
          sx={{
            mt: 2,
            '& .MuiOutlinedInput-root': {
              color: COLORS.text,
              '& fieldset': { borderColor: COLORS.border },
            },
            '& .MuiInputLabel-root': { color: COLORS.textSecondary },
          }}
        />

        <TextField
          fullWidth
          multiline
          rows={2}
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes..."
          sx={{
            mt: 2,
            '& .MuiOutlinedInput-root': {
              color: COLORS.text,
              '& fieldset': { borderColor: COLORS.border },
            },
            '& .MuiInputLabel-root': { color: COLORS.textSecondary },
          }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ color: COLORS.textSecondary }}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={!clockIn}
          sx={{ bgcolor: COLORS.primary, color: COLORS.bg }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

TimeEntryDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  member: PropTypes.shape({
    _id: PropTypes.string,
    id: PropTypes.string,
    name: PropTypes.string,
  }),
  entry: PropTypes.shape({
    clockIn: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
    clockOut: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
    breakMinutes: PropTypes.number,
    workType: PropTypes.string,
    notes: PropTypes.string,
  }),
};

/**
 * Add Crew Member Dialog
 */
const AddCrewMemberDialog = ({ open, onClose, onAdd }) => {
  const [name, setName] = useState('');
  const [classification, setClassification] = useState('Lineman');

  const classifications = [
    'Foreman',
    'General Foreman',
    'Lineman',
    'Apprentice Lineman',
    'Groundman',
    'Equipment Operator',
    'Laborer',
    'Driver',
    'Flagger',
  ];

  const handleAdd = () => {
    if (!name.trim()) return;
    onAdd({ name: name.trim(), classification, entries: [] });
    setName('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} PaperProps={{ sx: { bgcolor: COLORS.surface, minWidth: 320 } }}>
      <DialogTitle sx={{ color: COLORS.text }}>Add Crew Member</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter name..."
          sx={{
            mt: 1,
            '& .MuiOutlinedInput-root': {
              color: COLORS.text,
              '& fieldset': { borderColor: COLORS.border },
            },
            '& .MuiInputLabel-root': { color: COLORS.textSecondary },
          }}
        />

        <FormControl fullWidth sx={{ mt: 2 }}>
          <InputLabel sx={{ color: COLORS.textSecondary }}>Classification</InputLabel>
          <Select
            value={classification}
            onChange={(e) => setClassification(e.target.value)}
            label="Classification"
            sx={{
              color: COLORS.text,
              '& .MuiOutlinedInput-notchedOutline': { borderColor: COLORS.border },
            }}
          >
            {classifications.map((c) => (
              <MenuItem key={c} value={c}>{c}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ color: COLORS.textSecondary }}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleAdd}
          disabled={!name.trim()}
          sx={{ bgcolor: COLORS.primary, color: COLORS.bg }}
        >
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
};

AddCrewMemberDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onAdd: PropTypes.func.isRequired,
};

/**
 * Main Timesheet Entry Component
 */
const TimesheetEntry = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();

  // State
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [crewMembers, setCrewMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showTimeEntry, setShowTimeEntry] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [timesheetDate, setTimesheetDate] = useState(new Date().toISOString().split('T')[0]);

  // Load job and existing timesheet
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        // Load job
        const jobRes = await api.get(`/api/jobs/${jobId}`);
        setJob(jobRes.data);

        // Try to load existing timesheet for today
        try {
          const tsRes = await api.get(`/api/timesheets?jobId=${jobId}&date=${timesheetDate}`);
          if (tsRes.data?.crewMembers) {
            setCrewMembers(tsRes.data.crewMembers);
          }
        } catch {
          // No existing timesheet, start fresh
          setCrewMembers([]);
        }
      } catch (err) {
        console.error('Failed to load:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (jobId) loadData();
  }, [jobId, timesheetDate]);

  // Calculate totals
  const totalHours = crewMembers.reduce((sum, member) => {
    const memberMinutes = member.entries?.reduce((entrySum, e) => {
      if (e.clockIn && e.clockOut) {
        const diff = (new Date(e.clockOut) - new Date(e.clockIn)) / 60000;
        return entrySum + diff - (e.breakMinutes || 0);
      }
      return entrySum;
    }, 0) || 0;
    return sum + memberMinutes;
  }, 0) / 60;

  // Handlers
  const handleAddMember = (member) => {
    setCrewMembers(prev => [...prev, { ...member, id: Date.now().toString() }]);
  };

  const handleDeleteMember = (member) => {
    setCrewMembers(prev => prev.filter(m => m.id !== member.id && m._id !== member._id));
  };

  const handleEditMember = (member) => {
    setSelectedMember(member);
    setEditingEntry(null);
    setShowTimeEntry(true);
  };

  const handleSaveTimeEntry = (entry) => {
    setCrewMembers(prev => prev.map(member => {
      if ((member._id || member.id) === entry.memberId) {
        return {
          ...member,
          entries: [...(member.entries || []), entry],
        };
      }
      return member;
    }));
  };

  const handleSaveTimesheet = async () => {
    setSaving(true);
    try {
      await api.post('/api/timesheets', {
        jobId,
        date: timesheetDate,
        crewMembers,
        totalHours,
        submittedBy: 'current_user', // Will be replaced with actual user
        submittedAt: new Date(),
      });
      setSuccess('Timesheet saved successfully!');
    } catch (err) {
      setError(err.message || 'Failed to save timesheet');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ bgcolor: COLORS.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress sx={{ color: COLORS.primary }} />
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: COLORS.bg, minHeight: '100vh', pb: 10 }}>
      {/* Header */}
      <Box sx={{ 
        bgcolor: COLORS.surface, 
        px: 2, 
        py: 2,
        borderBottom: `1px solid ${COLORS.border}`,
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton onClick={() => navigate(-1)} sx={{ color: COLORS.text, p: 0.5 }}>
            <BackIcon />
          </IconButton>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ color: COLORS.text, fontWeight: 700, fontSize: '1.1rem' }}>
              Timesheet
            </Typography>
            <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.75rem' }}>
              {job?.woNumber || job?.jobNumber}
            </Typography>
          </Box>
          <TextField
            type="date"
            value={timesheetDate}
            onChange={(e) => setTimesheetDate(e.target.value)}
            size="small"
            sx={{
              width: 140,
              '& .MuiOutlinedInput-root': {
                color: COLORS.text,
                '& fieldset': { borderColor: COLORS.border },
              },
            }}
          />
        </Box>
      </Box>

      {/* Error/Success */}
      {error && (
        <Alert severity="error" sx={{ m: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Snackbar
        open={!!success}
        autoHideDuration={3000}
        onClose={() => setSuccess(null)}
        message={success}
      />

      {/* Summary card */}
      <Box sx={{ p: 2 }}>
        <Card sx={{ bgcolor: COLORS.surfaceLight, border: `1px solid ${COLORS.primary}` }}>
          <CardContent>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={6}>
                <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.75rem' }}>
                  TOTAL CREW HOURS
                </Typography>
                <Typography sx={{ color: COLORS.primary, fontSize: '2.5rem', fontWeight: 700 }}>
                  {totalHours.toFixed(1)}
                </Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.75rem' }}>
                  CREW SIZE
                </Typography>
                <Typography sx={{ color: COLORS.text, fontSize: '2.5rem', fontWeight: 700 }}>
                  {crewMembers.length}
                </Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Box>

      {/* Crew members */}
      <Box sx={{ px: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography sx={{ color: COLORS.textSecondary, fontWeight: 600, fontSize: '0.75rem' }}>
            CREW MEMBERS
          </Typography>
          <Button
            startIcon={<AddIcon />}
            onClick={() => setShowAddMember(true)}
            sx={{ color: COLORS.primary, fontWeight: 600 }}
          >
            Add Member
          </Button>
        </Box>

        {crewMembers.length === 0 ? (
          <Card sx={{ bgcolor: COLORS.surface, border: `2px dashed ${COLORS.border}`, textAlign: 'center', py: 4 }}>
            <PersonIcon sx={{ fontSize: 48, color: COLORS.textSecondary, mb: 1 }} />
            <Typography sx={{ color: COLORS.textSecondary }}>
              No crew members added yet
            </Typography>
            <Button
              startIcon={<AddIcon />}
              onClick={() => setShowAddMember(true)}
              sx={{ mt: 2, color: COLORS.primary }}
            >
              Add First Member
            </Button>
          </Card>
        ) : (
          crewMembers.map((member) => (
            <CrewMemberCard
              key={member._id || member.id}
              member={member}
              onEdit={handleEditMember}
              onDelete={handleDeleteMember}
            />
          ))
        )}
      </Box>

      {/* Save FAB */}
      <Fab
        variant="extended"
        onClick={handleSaveTimesheet}
        disabled={saving || crewMembers.length === 0}
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          bgcolor: COLORS.primary,
          color: COLORS.bg,
          fontWeight: 700,
          '&:hover': { bgcolor: COLORS.primaryDark },
          '&.Mui-disabled': { bgcolor: COLORS.border, color: COLORS.textSecondary },
        }}
      >
        {saving ? <CircularProgress size={20} /> : <SaveIcon sx={{ mr: 1 }} />}
        {saving ? 'Saving...' : 'Save Timesheet'}
      </Fab>

      {/* Dialogs */}
      <AddCrewMemberDialog
        open={showAddMember}
        onClose={() => setShowAddMember(false)}
        onAdd={handleAddMember}
      />

      {selectedMember && (
        <TimeEntryDialog
          open={showTimeEntry}
          onClose={() => {
            setShowTimeEntry(false);
            setSelectedMember(null);
          }}
          onSave={handleSaveTimeEntry}
          member={selectedMember}
          entry={editingEntry}
        />
      )}
    </Box>
  );
};

export default TimesheetEntry;

