/**
 * TailboardCrewSignatures - Signature pads for each crew member
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 */

import React from 'react';
import PropTypes from 'prop-types';
import {
  Box, Typography, Grid, Paper, Button, Chip, Alert, Avatar,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PeopleIcon from '@mui/icons-material/People';

const TailboardCrewSignatures = ({ crewMembers, onOpenSignaturePad, disabled }) => {
  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PeopleIcon color="primary" />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Crew Acknowledgment</Typography>
          <Chip label={`${crewMembers.length} signed`} size="small" />
        </Box>
        {!disabled && (
          <Button startIcon={<AddIcon />} onClick={onOpenSignaturePad} variant="outlined" size="small">
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
            <Grid size={{ xs: 6, sm: 4, md: 3 }} key={member.id || member._id || `crew-${index}`}>
              <Paper variant="outlined" sx={{ p: 1, textAlign: 'center' }}>
                <Avatar sx={{ mx: 'auto', mb: 0.5, bgcolor: 'primary.main' }}>
                  {member.name.charAt(0).toUpperCase()}
                </Avatar>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{member.name}</Typography>
                <Typography variant="caption" color="text.secondary">{member.role}</Typography>
                {member.signatureData && (
                  <Box sx={{ mt: 1 }}>
                    <img
                      src={member.signatureData} alt="Signature"
                      style={{ maxWidth: '100%', maxHeight: 40, border: '1px solid #ddd', borderRadius: 4 }}
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
    </>
  );
};

TailboardCrewSignatures.propTypes = {
  crewMembers: PropTypes.array.isRequired,
  onOpenSignaturePad: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

export default TailboardCrewSignatures;
