// frontend/src/components/Forms.js (already provided)
import React from 'react';
import { Typography, Box, List, ListItem, ListItemText } from '@mui/material';

const Forms = () => {
  const forms = ['Form A - Safety Checklist', 'Form B - Permit Request', 'Form C - Completion Report'];

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>General Forms</Typography>
      <List>
        {forms.map((form, index) => (
          <ListItem key={index} button onClick={() => alert(`Loading ${form}`)}>
            <ListItemText primary={form} />
          </ListItem>
        ))}
      </List>
    </Box>
  );
};

export default Forms;