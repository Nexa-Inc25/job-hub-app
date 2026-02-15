/**
 * TailboardUGChecklist - Underground work completed checklist
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 */

import React, { useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  Box, Typography, Grid, Checkbox, FormControlLabel,
  ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import ChecklistIcon from '@mui/icons-material/Checklist';
import { UG_CHECKLIST_ITEMS } from './constants';

const TailboardUGChecklist = ({ ugChecklist, onChecklistChange, showChecklist, onShowChecklistChange, disabled }) => {
  const handleChange = useCallback((itemId, value) => {
    onChecklistChange(itemId, value);
  }, [onChecklistChange]);

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ChecklistIcon color="primary" />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>UG Work Completed Checklist</Typography>
        </Box>
        <FormControlLabel
          control={
            <Checkbox checked={showChecklist} onChange={(e) => onShowChecklistChange(e.target.checked)} disabled={disabled} />
          }
          label="Show UG Checklist"
        />
      </Box>

      {showChecklist ? (
        <Grid container spacing={1}>
          {UG_CHECKLIST_ITEMS.map((checkItem) => {
            const current = ugChecklist.find(c => c.item === checkItem.id);
            return (
              <Grid size={12} key={checkItem.id}>
                <Box sx={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  p: 1, bgcolor: 'action.hover', borderRadius: 1, mb: 0.5
                }}>
                  <Typography variant="body2" sx={{ flex: 1, color: 'text.primary' }}>{checkItem.label}</Typography>
                  <ToggleButtonGroup
                    size="small" exclusive value={current?.value || null}
                    onChange={(e, val) => handleChange(checkItem.id, val)} disabled={disabled}
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
      ) : (
        <Typography variant="body2" color="text.secondary">
          Enable &quot;Show UG Checklist&quot; if performing underground electrical work.
        </Typography>
      )}
    </>
  );
};

TailboardUGChecklist.propTypes = {
  ugChecklist: PropTypes.array.isRequired,
  onChecklistChange: PropTypes.func.isRequired,
  showChecklist: PropTypes.bool.isRequired,
  onShowChecklistChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

export default TailboardUGChecklist;
