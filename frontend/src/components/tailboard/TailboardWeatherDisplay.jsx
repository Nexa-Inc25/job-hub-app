/**
 * TailboardWeatherDisplay - Auto-filled weather display (read-only)
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 */

import React from 'react';
import PropTypes from 'prop-types';
import {
  Box, Grid, TextField, Button, Alert, CircularProgress,
} from '@mui/material';
import WeatherIcon from '@mui/icons-material/WbSunny';

const TailboardWeatherDisplay = ({ value, weatherLoading, weatherData, weatherError, onRefresh, disabled }) => {
  const helperText = (() => {
    if (weatherError) return weatherError;
    if (weatherData?.source === 'api') return 'Auto-fetched from weather service';
    if (weatherData?.source === 'cache') return 'Cached weather data';
    return '';
  })();

  return (
    <Grid container spacing={2}>
      <Grid size={12}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TextField
            label="Weather Conditions (Auto)" value={value} fullWidth size="small"
            disabled={true} placeholder="Fetching weather..."
            InputProps={{
              startAdornment: <WeatherIcon sx={{ mr: 1, color: weatherLoading ? 'text.secondary' : 'success.main' }} />,
              endAdornment: weatherLoading && <CircularProgress size={16} />
            }}
            helperText={helperText}
          />
          <Button size="small" onClick={onRefresh} disabled={weatherLoading || disabled} sx={{ minWidth: 80 }}>
            Refresh
          </Button>
        </Box>
        {weatherData?.hazards?.hasHazards && (
          <Alert
            severity={weatherData.hazards.maxSeverity === 'danger' ? 'error' : 'warning'}
            sx={{ mt: 1 }}
          >
            {weatherData.hazards.hazards.map(h => h.message).join('; ')}
          </Alert>
        )}
      </Grid>
    </Grid>
  );
};

TailboardWeatherDisplay.propTypes = {
  value: PropTypes.string.isRequired,
  weatherLoading: PropTypes.bool.isRequired,
  weatherData: PropTypes.object,
  weatherError: PropTypes.string,
  onRefresh: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

export default TailboardWeatherDisplay;
