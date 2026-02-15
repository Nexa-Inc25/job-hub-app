/**
 * TailboardHazardSection - Hazard identification grid with add/remove dialog
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 */

import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  Box, Typography, Button, Chip, IconButton, Alert,
  Accordion, AccordionSummary, AccordionDetails,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandIcon from '@mui/icons-material/ExpandMore';
import WarningIcon from '@mui/icons-material/Warning';
import { HAZARD_CATEGORIES, getRiskLevelColor } from './constants';

const TailboardHazardSection = ({ hazards, onChange, disabled }) => {
  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [customHazard, setCustomHazard] = useState('');
  const [selectedControls, setSelectedControls] = useState([]);
  const [customControl, setCustomControl] = useState('');
  const [riskLevel, setRiskLevel] = useState('medium');

  const handleAddHazard = useCallback(() => {
    if (!selectedCategory || !customHazard.trim()) return;

    // NOSONAR: Math.random() for local form element IDs is safe - not security-sensitive
    const newHazard = {
      id: `hazard-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, // NOSONAR
      category: selectedCategory,
      description: customHazard.trim(),
      controls: selectedControls,
      riskLevel
    };

    onChange([...hazards, newHazard]);
    setSelectedCategory('');
    setCustomHazard('');
    setSelectedControls([]);
    setRiskLevel('medium');
    setDialogOpen(false);
  }, [selectedCategory, customHazard, selectedControls, riskLevel, hazards, onChange]);

  const handleRemoveHazard = useCallback((index) => {
    onChange(hazards.filter((_, i) => i !== index));
  }, [hazards, onChange]);

  const handleAddControl = useCallback((control) => {
    if (!selectedControls.includes(control)) {
      setSelectedControls([...selectedControls, control]);
    }
  }, [selectedControls]);

  const handleRemoveControl = useCallback((control) => {
    setSelectedControls(selectedControls.filter(c => c !== control));
  }, [selectedControls]);

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningIcon color="warning" />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Hazard Analysis</Typography>
        </Box>
        {!disabled && (
          <Button startIcon={<AddIcon />} onClick={() => setDialogOpen(true)} variant="outlined" size="small">
            Add Hazard
          </Button>
        )}
      </Box>

      {hazards.length === 0 ? (
        <Alert severity="info">No hazards identified yet. Click &quot;Add Hazard&quot; to identify job site hazards.</Alert>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {hazards.map((hazard, index) => {
            const category = HAZARD_CATEGORIES[hazard.category] || HAZARD_CATEGORIES.other;
            return (
              <Accordion key={hazard.id || `hazard-${index}`} defaultExpanded>
                <AccordionSummary expandIcon={<ExpandIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                    <Typography>{category.icon}</Typography>
                    <Chip label={category.label} size="small" sx={{ bgcolor: category.color, color: 'white' }} />
                    <Typography sx={{ flex: 1 }}>{hazard.description}</Typography>
                    <Chip label={hazard.riskLevel} size="small" color={getRiskLevelColor(hazard.riskLevel)} />
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Controls / Mitigations:</Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {hazard.controls.map((control) => (
                      <Chip key={`${hazard.id}-${control}`} label={control} size="small" variant="outlined" />
                    ))}
                  </Box>
                  {!disabled && (
                    <Box sx={{ mt: 1, textAlign: 'right' }}>
                      <IconButton size="small" color="error" onClick={() => handleRemoveHazard(index)}>
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

      {/* Add Hazard Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Hazard</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>Hazard Category</InputLabel>
              <Select
                value={selectedCategory}
                onChange={(e) => { setSelectedCategory(e.target.value); setSelectedControls([]); }}
                label="Hazard Category"
              >
                {Object.entries(HAZARD_CATEGORIES).map(([key, cat]) => (
                  <MenuItem key={key} value={key}>{cat.icon} {cat.label}</MenuItem>
                ))}
              </Select>
            </FormControl>

            {selectedCategory && (
              <>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Common hazards (click to use):</Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {HAZARD_CATEGORIES[selectedCategory]?.commonHazards.map((h) => (
                      <Chip key={h} label={h} size="small" onClick={() => setCustomHazard(h)} sx={{ cursor: 'pointer' }} />
                    ))}
                  </Box>
                </Box>

                <TextField
                  label="Hazard Description" value={customHazard}
                  onChange={(e) => setCustomHazard(e.target.value)}
                  fullWidth required placeholder="Describe the specific hazard..."
                />

                <FormControl fullWidth>
                  <InputLabel>Risk Level</InputLabel>
                  <Select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)} label="Risk Level">
                    <MenuItem value="low">Low</MenuItem>
                    <MenuItem value="medium">Medium</MenuItem>
                    <MenuItem value="high">High</MenuItem>
                  </Select>
                </FormControl>

                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Controls / Mitigations:</Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                    {HAZARD_CATEGORIES[selectedCategory]?.commonControls.map((c) => (
                      <Chip
                        key={c} label={c} size="small"
                        onClick={() => handleAddControl(c)}
                        color={selectedControls.includes(c) ? 'primary' : 'default'}
                        sx={{ cursor: 'pointer' }}
                      />
                    ))}
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField
                      size="small" value={customControl}
                      onChange={(e) => setCustomControl(e.target.value)}
                      placeholder="Add custom control..." sx={{ flex: 1 }}
                    />
                    <Button size="small" onClick={() => {
                      if (customControl.trim()) { handleAddControl(customControl.trim()); setCustomControl(''); }
                    }}>Add</Button>
                  </Box>
                  {selectedControls.length > 0 && (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" color="text.secondary">Selected controls:</Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                        {selectedControls.map((c) => (
                          <Chip key={c} label={c} size="small" onDelete={() => handleRemoveControl(c)} color="primary" />
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
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleAddHazard} variant="contained"
            disabled={!selectedCategory || !customHazard.trim() || selectedControls.length === 0}
          >Add Hazard</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

TailboardHazardSection.propTypes = {
  hazards: PropTypes.array.isRequired,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

export default TailboardHazardSection;
