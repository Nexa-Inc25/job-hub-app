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

const TailboardWeatherDisplay = ({ value, onChange, weatherLoading, weatherData, weatherError, onRefresh, disabled }) => {
  const isUnavailable = weatherData?.mock || weatherData?.source === 'placeholder' || weatherData?.source === 'error';
  const allowManualEntry = isUnavailable && !disabled;

  const iconColor = (() => {
    if (weatherLoading) return 'text.secondary';
    if (isUnavailable || weatherError) return 'warning.main';
    return 'success.main';
  })();

  const helperText = (() => {
    if (weatherError) return weatherError;
    if (isUnavailable) return 'Weather API not configured — type conditions manually';
    if (weatherData?.source === 'api') return 'Auto-fetched from weather service';
    if (weatherData?.source === 'cache') return 'Cached weather data';
    return '';
  })();

  return (
    <Grid container spacing={2}>
      <Grid size={12}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TextField
            label={allowManualEntry ? 'Weather Conditions (Manual)' : 'Weather Conditions (Auto)'}
            value={value} fullWidth size="small"
            disabled={!allowManualEntry}
            placeholder={allowManualEntry ? 'e.g. Sunny, 72°F, light winds' : 'Fetching weather...'}
            onChange={allowManualEntry ? (e) => onChange(e.target.value) : undefined}
            InputProps={{
              startAdornment: <WeatherIcon sx={{ mr: 1, color: iconColor }} />,
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
  onChange: PropTypes.func.isRequired,
  weatherLoading: PropTypes.bool.isRequired,
  weatherData: PropTypes.object,
  weatherError: PropTypes.string,
  onRefresh: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

export default TailboardWeatherDisplay;
