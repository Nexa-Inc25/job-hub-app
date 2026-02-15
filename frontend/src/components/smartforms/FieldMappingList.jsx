/**
 * FieldMappingList - Data mapping drawer for SmartForms template editor
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 */

import React from 'react';
import PropTypes from 'prop-types';
import {
  Box, Typography, Button, TextField, Divider, Alert,
  Drawer, List, ListItem, Autocomplete,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';

const FieldMappingList = ({ open, onClose, fields, mappings, onMappingsChange, dataPaths, onSave }) => {
  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: 400, p: 2 }}>
        <Typography variant="h6" gutterBottom>Data Mappings</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Connect template fields to FieldLedger data for auto-fill
        </Typography>
        <Divider sx={{ mb: 2 }} />

        {fields.length === 0 ? (
          <Alert severity="info">Add fields to the template first</Alert>
        ) : (
          <List>
            {fields.map(field => (
              <ListItem key={field.id} sx={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <Typography variant="subtitle2" fontWeight={600}>{field.name}</Typography>
                <Autocomplete
                  size="small" options={dataPaths}
                  getOptionLabel={opt => `${opt.label} (${opt.path})`}
                  groupBy={opt => opt.category}
                  value={dataPaths.find(p => p.path === mappings[field.name]) || null}
                  onChange={(e, newValue) => onMappingsChange({ ...mappings, [field.name]: newValue?.path || '' })}
                  renderInput={params => <TextField {...params} placeholder="Select data source..." size="small" />}
                  sx={{ mt: 1 }}
                />
              </ListItem>
            ))}
          </List>
        )}

        <Box sx={{ mt: 3 }}>
          <Button variant="contained" fullWidth onClick={() => { onSave(); onClose(); }} startIcon={<SaveIcon />}>
            Save Mappings
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
};

FieldMappingList.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  fields: PropTypes.array.isRequired,
  mappings: PropTypes.object.isRequired,
  onMappingsChange: PropTypes.func.isRequired,
  dataPaths: PropTypes.array.isRequired,
  onSave: PropTypes.func.isRequired,
};

export default FieldMappingList;
