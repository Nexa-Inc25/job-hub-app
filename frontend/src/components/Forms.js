// frontend/src/components/Forms.js
import React from 'react';
import { Typography, Box, List, ListItem, ListItemButton, ListItemText } from '@mui/material';

const Forms = () => {
  const forms = ['Form A - Safety Checklist', 'Form B - Permit Request', 'Form C - Completion Report'];

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>General Forms</Typography>
      <List>
        {forms.map((form, index) => (
          <ListItem key={index} disablePadding>
            <ListItemButton onClick={() => alert(`Loading ${form}`)}>
              <ListItemText primary={form} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );
};

export default Forms;