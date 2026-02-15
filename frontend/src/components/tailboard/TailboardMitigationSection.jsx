/**
 * TailboardMitigationSection - Special mitigation measures & grounding section
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 */

import React, { useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  Box, Typography, Grid, TextField, Button, Checkbox, FormControlLabel,
  Divider, ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ElectricalIcon from '@mui/icons-material/ElectricalServices';
import EngineeringIcon from '@mui/icons-material/Engineering';
import { SPECIAL_MITIGATIONS } from './constants';

const TailboardMitigationSection = ({
  specialMitigations, onMitigationChange,
  groundingNeeded, onGroundingNeededChange,
  groundingAccountedFor, onGroundingAccountedForChange,
  groundingLocations, onGroundingLocationChange, onAddGroundingLocation,
  nominalVoltages, onNominalVoltagesChange,
  copperConditionInspected, onCopperConditionInspectedChange,
  notTiedIntoCircuit, onNotTiedIntoCircuitChange,
  disabled,
}) => {
  const handleMitigationToggle = useCallback((itemId, value) => {
    onMitigationChange(itemId, value);
  }, [onMitigationChange]);

  return (
    <>
      {/* Special Mitigation Measures */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <ElectricalIcon color="warning" />
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Special Mitigation Measures</Typography>
      </Box>

      <Grid container spacing={1} sx={{ mb: 3 }}>
        {SPECIAL_MITIGATIONS.map((mitigation) => {
          const current = specialMitigations.find(m => m.item === mitigation.id);
          return (
            <Grid size={{ xs: 12, sm: 6 }} key={mitigation.id}>
              <Box sx={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                p: 1, bgcolor: 'action.hover', borderRadius: 1, mb: 0.5
              }}>
                <Typography variant="body2" sx={{ flex: 1, color: 'text.primary' }}>{mitigation.label}</Typography>
                <ToggleButtonGroup
                  size="small" exclusive
                  value={current?.value || null}
                  onChange={(e, val) => handleMitigationToggle(mitigation.id, val)}
                  disabled={disabled}
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

      <Divider sx={{ my: 2 }} />

      {/* Grounding Section */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <EngineeringIcon color="primary" />
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Grounding Per Title 8, §2941</Typography>
      </Box>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2">Will Grounding Be Needed?</Typography>
            <ToggleButtonGroup
              size="small" exclusive value={groundingNeeded}
              onChange={(e, val) => onGroundingNeededChange(val)} disabled={disabled}
            >
              <ToggleButton value="yes">Yes</ToggleButton>
              <ToggleButton value="no">No</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2">Grounds accounted for by foreman?</Typography>
            <ToggleButtonGroup
              size="small" exclusive value={groundingAccountedFor}
              onChange={(e, val) => onGroundingAccountedForChange(val)} disabled={disabled}
            >
              <ToggleButton value="yes">Yes</ToggleButton>
              <ToggleButton value="no">No</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Grid>
      </Grid>

      {groundingNeeded === 'yes' && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            List ALL Locations Requiring Grounding:
          </Typography>
          {groundingLocations.map((loc, index) => (
            <Box key={loc.id || `grounding-${index}`} sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <TextField
                size="small" value={loc.location}
                onChange={(e) => onGroundingLocationChange(index, 'location', e.target.value)}
                placeholder="Grounding location" sx={{ flex: 1 }} disabled={disabled}
              />
              <FormControlLabel
                control={
                  <Checkbox checked={loc.installed}
                    onChange={(e) => onGroundingLocationChange(index, 'installed', e.target.checked)}
                    disabled={disabled} size="small" />
                }
                label="Installed"
              />
              <FormControlLabel
                control={
                  <Checkbox checked={loc.removed}
                    onChange={(e) => onGroundingLocationChange(index, 'removed', e.target.checked)}
                    disabled={disabled} size="small" />
                }
                label="Removed"
              />
            </Box>
          ))}
          {!disabled && (
            <Button size="small" startIcon={<AddIcon />} onClick={onAddGroundingLocation}>Add Location</Button>
          )}
        </Box>
      )}

      <Divider sx={{ my: 2 }} />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            label="Nominal Voltages of Lines/Equipment" value={nominalVoltages}
            onChange={(e) => onNominalVoltagesChange(e.target.value)}
            fullWidth size="small" disabled={disabled}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2">#6-Copper condition inspected?</Typography>
            <ToggleButtonGroup
              size="small" exclusive value={copperConditionInspected}
              onChange={(e, val) => onCopperConditionInspectedChange(val)} disabled={disabled}
            >
              <ToggleButton value="yes">Yes</ToggleButton>
              <ToggleButton value="no">No</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Grid>
        <Grid size={12}>
          <FormControlLabel
            control={
              <Checkbox checked={notTiedIntoCircuit}
                onChange={(e) => onNotTiedIntoCircuitChange(e.target.checked)} disabled={disabled} />
            }
            label="Not Tied Into Circuit"
          />
        </Grid>
      </Grid>
    </>
  );
};

TailboardMitigationSection.propTypes = {
  specialMitigations: PropTypes.array.isRequired,
  onMitigationChange: PropTypes.func.isRequired,
  groundingNeeded: PropTypes.string,
  onGroundingNeededChange: PropTypes.func.isRequired,
  groundingAccountedFor: PropTypes.string,
  onGroundingAccountedForChange: PropTypes.func.isRequired,
  groundingLocations: PropTypes.array.isRequired,
  onGroundingLocationChange: PropTypes.func.isRequired,
  onAddGroundingLocation: PropTypes.func.isRequired,
  nominalVoltages: PropTypes.string.isRequired,
  onNominalVoltagesChange: PropTypes.func.isRequired,
  copperConditionInspected: PropTypes.string,
  onCopperConditionInspectedChange: PropTypes.func.isRequired,
  notTiedIntoCircuit: PropTypes.bool.isRequired,
  onNotTiedIntoCircuitChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

export default TailboardMitigationSection;
