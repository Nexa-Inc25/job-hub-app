// src/components/shared/ThemeToggle.js
// Reusable theme toggle button for light/dark mode

import React from 'react';
import PropTypes from 'prop-types';
import { Box, IconButton, Tooltip } from '@mui/material';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';

const ThemeToggle = ({ darkMode, onToggle, position = 'absolute' }) => (
  <Box sx={{ position, top: 16, right: 16 }}>
    <Tooltip title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
      <IconButton onClick={onToggle} color="primary" aria-label="Toggle dark mode">
        {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
      </IconButton>
    </Tooltip>
  </Box>
);

ThemeToggle.propTypes = {
  darkMode: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  position: PropTypes.string,
};

export default ThemeToggle;

