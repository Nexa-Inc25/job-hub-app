/**
 * TailboardPPESection - PPE checklist for tailboard form
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 */

import React, { useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  Box, Typography, Grid, Checkbox, FormControlLabel,
} from '@mui/material';
import ShieldIcon from '@mui/icons-material/Shield';
import { STANDARD_PPE } from './constants';

const TailboardPPESection = ({ value, onChange, disabled }) => {
  const handleToggle = useCallback((index) => {
    const updated = [...value];
    updated[index] = { ...updated[index], checked: !updated[index].checked };
    onChange(updated);
  }, [value, onChange]);

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <ShieldIcon color="primary" />
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>PPE Requirements</Typography>
      </Box>

      <Grid container spacing={1}>
        {value.map((ppe, index) => {
          const ppeInfo = STANDARD_PPE.find(p => p.item === ppe.item) || { icon: '🛡️' };
          return (
            <Grid size={{ xs: 6, sm: 4, md: 3 }} key={ppe.item}>
              <FormControlLabel
                control={
                  <Checkbox checked={ppe.checked} onChange={() => handleToggle(index)} disabled={disabled} />
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
    </>
  );
};

TailboardPPESection.propTypes = {
  value: PropTypes.arrayOf(PropTypes.shape({
    item: PropTypes.string.isRequired,
    checked: PropTypes.bool.isRequired,
  })).isRequired,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

export default TailboardPPESection;
