/**
 * FieldLedger - Weather Service
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Auto-logs weather conditions at job sites using OpenWeatherMap API.
 * Replaces manual weather input - creates irrefutable "Excusable Delay" records.
 * 
 * Features:
 * - Current weather by lat/long
 * - 15-minute caching to reduce API calls
 * - Scheduled logging every 4 hours for active jobs
 */

const axios = require('axios');
const log = require('../utils/logger');

// Simple in-memory cache (15 minute TTL)
const cache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

/**
 * Clean expired cache entries
 */
function cleanCache() {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      cache.delete(key);
    }
  }
}

/**
 * Generate cache key for coordinates
 * Rounds to 2 decimal places (~1.1km precision) for better cache hits
 */
function getCacheKey(lat, lng) {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

/**
 * Fetch current weather conditions from OpenWeatherMap
 * @param {number} latitude - Latitude
 * @param {number} longitude - Longitude
 * @returns {Promise<Object>} Weather conditions
 */
async function getCurrentWeather(latitude, longitude) {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  
  if (!apiKey) {
    console.warn('[Weather] No OPENWEATHER_API_KEY configured, returning placeholder data');
    return {
      temperature: null,
      conditions: 'unavailable',
      conditionCode: null,
      humidity: null,
      windSpeed: null,
      windDirection: null,
      precipitation: null,
      visibility: null,
      cloudCover: null,
      source: 'placeholder',
      mock: true,
      warning: 'OPENWEATHER_API_KEY not configured - weather data unavailable',
      error: 'API key not configured. Set OPENWEATHER_API_KEY in environment.',
      capturedAt: new Date().toISOString()
    };
  }

  // Check cache first
  const cacheKey = getCacheKey(latitude, longitude);
  const cached = cache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    log.debug({ cacheKey }, 'Weather cache hit');
    return { ...cached.data, source: 'cache' };
  }

  try {
    log.info({ latitude, longitude }, 'Fetching weather');
    
    const response = await axios.get(
      'https://api.openweathermap.org/data/2.5/weather',
      {
        params: {
          lat: latitude,
          lon: longitude,
          appid: apiKey,
          units: 'imperial' // Fahrenheit, mph
        },
        timeout: 10000
      }
    );

    const data = response.data;
    
    const weather = {
      temperature: Math.round(data.main.temp),
      feelsLike: Math.round(data.main.feels_like),
      conditions: data.weather[0]?.description || 'unknown',
      conditionCode: data.weather[0]?.id,
      conditionIcon: data.weather[0]?.icon,
      humidity: data.main.humidity,
      windSpeed: Math.round(data.wind.speed),
      windDirection: data.wind.deg,
      windGust: data.wind.gust ? Math.round(data.wind.gust) : null,
      precipitation: data.rain?.['1h'] || data.snow?.['1h'] || 0,
      visibility: data.visibility ? Math.round(data.visibility / 1609.34) : null, // Convert m to miles
      cloudCover: data.clouds?.all,
      pressure: data.main.pressure,
      sunrise: new Date(data.sys.sunrise * 1000).toISOString(),
      sunset: new Date(data.sys.sunset * 1000).toISOString(),
      source: 'api',
      capturedAt: new Date().toISOString(),
      location: {
        latitude,
        longitude,
        city: data.name,
        country: data.sys.country
      }
    };

    // Cache the result
    cache.set(cacheKey, {
      data: weather,
      timestamp: Date.now()
    });

    // Clean old entries periodically
    if (cache.size > 100) {
      cleanCache();
    }

    return weather;
  } catch (error) {
    log.error({ err: error }, 'Weather API error');
    
    // Return cached data if available (even if expired)
    if (cached) {
      log.info({ cacheKey }, 'Returning stale cache due to error');
      return { ...cached.data, source: 'stale_cache', error: error.message };
    }
    
    return {
      temperature: null,
      conditions: 'error',
      conditionCode: null,
      humidity: null,
      windSpeed: null,
      source: 'error',
      error: error.message,
      capturedAt: new Date().toISOString()
    };
  }
}

/**
 * Calculate heat index from temperature (°F) and relative humidity (%)
 * Uses the Rothfusz regression equation (NWS standard)
 * @param {number} tempF - Temperature in Fahrenheit
 * @param {number} rh - Relative humidity percentage
 * @returns {number} Heat index in Fahrenheit
 */
function calculateHeatIndex(tempF, rh) {
  // Simple formula for temps below 80°F
  if (tempF < 80) {
    return tempF;
  }
  
  // Rothfusz regression
  let hi = -42.379
    + 2.04901523 * tempF
    + 10.14333127 * rh
    - 0.22475541 * tempF * rh
    - 0.00683783 * tempF * tempF
    - 0.05481717 * rh * rh
    + 0.00122874 * tempF * tempF * rh
    + 0.00085282 * tempF * rh * rh
    - 0.00000199 * tempF * tempF * rh * rh;
  
  // Adjustments for low/high humidity
  if (rh < 13 && tempF >= 80 && tempF <= 112) {
    hi -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(tempF - 95)) / 17);
  } else if (rh > 85 && tempF >= 80 && tempF <= 87) {
    hi += ((rh - 85) / 10) * ((87 - tempF) / 5);
  }
  
  return Math.round(hi);
}

/**
 * Check if conditions are potentially hazardous
 * @param {Object} weather - Weather data
 * @returns {Object} Hazard assessment with combined score and stop-work recommendation
 */
function assessHazards(weather) {
  const hazards = [];
  let stopWorkRecommended = false;
  
  // Guard against null values - null < 32 is true in JS due to coercion to 0
  const temp = weather.temperature;
  const wind = weather.windSpeed;
  const humidity = weather.humidity;
  
  // === COLD ===
  if (temp !== null && temp !== undefined && temp < 32) {
    hazards.push({ type: 'cold', severity: 'warning', message: 'Freezing temperatures' });
  }
  
  // === HEAT (basic temperature) ===
  if (temp !== null && temp !== undefined && temp > 100) {
    hazards.push({ type: 'heat', severity: 'warning', message: 'Extreme heat' });
  }
  
  // === HEAT INDEX (combined temp + humidity) ===
  if (temp !== null && temp !== undefined && humidity !== null && humidity !== undefined) {
    const heatIndex = calculateHeatIndex(temp, humidity);
    if (heatIndex > 105) {
      hazards.push({ type: 'heat_index', severity: 'danger', message: `Heat index ${heatIndex}°F — STOP WORK recommended` });
      stopWorkRecommended = true;
    } else if (heatIndex > 90) {
      hazards.push({ type: 'heat_index', severity: 'warning', message: `Heat index ${heatIndex}°F — frequent breaks required` });
    }
  }
  
  // === WIND (tiered) ===
  if (wind !== null && wind !== undefined) {
    if (wind >= 35) {
      hazards.push({ type: 'wind', severity: 'danger', message: `Wind ${wind} mph — STOP WORK recommended` });
      stopWorkRecommended = true;
    } else if (wind >= 25) {
      hazards.push({ type: 'wind', severity: 'warning', message: `Wind ${wind} mph — CAUTION for elevated work` });
    }
  }
  
  // === VISIBILITY ===
  if (weather.visibility !== null && weather.visibility !== undefined && weather.visibility < 0.5) {
    hazards.push({ type: 'visibility', severity: 'warning', message: 'Low visibility' });
  }
  
  // === PRECIPITATION ===
  if (weather.precipitation !== null && weather.precipitation !== undefined && weather.precipitation > 0.1) {
    hazards.push({ type: 'precipitation', severity: 'info', message: 'Active precipitation' });
  }
  
  // === CONDITION CODES (storms / severe weather) ===
  if (weather.conditionCode) {
    const code = weather.conditionCode;
    // Lightning / thunderstorm: codes 200-232 = HIGH severity
    if (code >= 200 && code <= 232) {
      hazards.push({ type: 'lightning', severity: 'danger', message: 'Thunderstorm / lightning — STOP WORK recommended' });
      stopWorkRecommended = true;
    }
    if (code >= 600 && code < 700) {
      hazards.push({ type: 'snow', severity: 'warning', message: 'Snow/ice conditions' });
    }
  }
  
  // === COMBINED HAZARD SCORE (0-100) ===
  // Each hazard type contributes to the score; danger = 30, warning = 15, info = 5
  const severityWeights = { info: 5, warning: 15, danger: 30 };
  const hazardScore = Math.min(
    100,
    hazards.reduce((score, h) => score + (severityWeights[h.severity] || 0), 0)
  );
  
  return {
    hasHazards: hazards.length > 0,
    hazards,
    hazardScore,
    stopWorkRecommended,
    maxSeverity: hazards.reduce((max, h) => {
      const order = { info: 0, warning: 1, danger: 2 };
      return order[h.severity] > order[max] ? h.severity : max;
    }, 'info')
  };
}

/**
 * Log weather to a job's weather history
 * @param {Object} job - Mongoose job document
 * @param {Object} weather - Weather data
 * @returns {Object} Weather log entry
 */
function createWeatherLogEntry(weather) {
  return {
    capturedAt: new Date(),
    temperature: weather.temperature,
    conditions: weather.conditions,
    conditionCode: weather.conditionCode,
    humidity: weather.humidity,
    windSpeed: weather.windSpeed,
    windDirection: weather.windDirection,
    precipitation: weather.precipitation,
    visibility: weather.visibility,
    source: weather.source,
    hazards: assessHazards(weather)
  };
}

/**
 * Format weather for display in forms
 * @param {Object} weather - Weather data
 * @returns {string} Human-readable weather string
 */
function formatWeatherString(weather) {
  if (!weather || weather.source === 'error' || weather.source === 'unavailable') {
    return 'Weather data unavailable';
  }
  
  const parts = [];
  
  if (weather.temperature !== null) {
    parts.push(`${weather.temperature}°F`);
  }
  
  if (weather.conditions && weather.conditions !== 'unknown') {
    parts.push(weather.conditions);
  }
  
  if (weather.windSpeed !== null) {
    parts.push(`Wind: ${weather.windSpeed} mph`);
  }
  
  if (weather.humidity !== null) {
    parts.push(`Humidity: ${weather.humidity}%`);
  }
  
  return parts.join(', ') || 'Weather data incomplete';
}

/**
 * Check if weather conditions should block work
 * @param {Object} weather - Weather data
 * @returns {Object} Work recommendation
 */
function shouldBlockWork(weather) {
  const hazardAssessment = assessHazards(weather);
  
  // Block work for dangerous conditions
  const dangerHazards = hazardAssessment.hazards.filter(h => h.severity === 'danger');
  if (dangerHazards.length > 0) {
    return {
      blocked: true,
      reason: dangerHazards.map(h => h.message).join('; '),
      hazards: dangerHazards
    };
  }
  
  return {
    blocked: false,
    warnings: hazardAssessment.hazards.filter(h => h.severity === 'warning'),
    reason: null
  };
}

module.exports = {
  getCurrentWeather,
  assessHazards,
  calculateHeatIndex,
  createWeatherLogEntry,
  formatWeatherString,
  shouldBlockWork,
};

