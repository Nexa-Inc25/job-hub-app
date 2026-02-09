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
    console.warn('[Weather] No OPENWEATHER_API_KEY configured, returning placeholder');
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
      source: 'unavailable',
      error: 'API key not configured',
      capturedAt: new Date().toISOString()
    };
  }

  // Check cache first
  const cacheKey = getCacheKey(latitude, longitude);
  const cached = cache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('[Weather] Cache hit for', cacheKey);
    return { ...cached.data, source: 'cache' };
  }

  try {
    console.log('[Weather] Fetching weather for', latitude, longitude);
    
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
    console.error('[Weather] API error:', error.message);
    
    // Return cached data if available (even if expired)
    if (cached) {
      console.log('[Weather] Returning stale cache due to error');
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
 * Check if conditions are potentially hazardous
 * @param {Object} weather - Weather data
 * @returns {Object} Hazard assessment
 */
function assessHazards(weather) {
  const hazards = [];
  
  if (weather.temperature < 32) {
    hazards.push({ type: 'cold', severity: 'warning', message: 'Freezing temperatures' });
  }
  if (weather.temperature > 100) {
    hazards.push({ type: 'heat', severity: 'warning', message: 'Extreme heat' });
  }
  if (weather.windSpeed > 25) {
    hazards.push({ type: 'wind', severity: 'warning', message: 'High winds' });
  }
  if (weather.windSpeed > 40) {
    hazards.push({ type: 'wind', severity: 'danger', message: 'Dangerous wind speeds' });
  }
  if (weather.visibility && weather.visibility < 0.5) {
    hazards.push({ type: 'visibility', severity: 'warning', message: 'Low visibility' });
  }
  if (weather.precipitation > 0.1) {
    hazards.push({ type: 'precipitation', severity: 'info', message: 'Active precipitation' });
  }
  
  // Check condition codes for storms/severe weather
  if (weather.conditionCode) {
    const code = weather.conditionCode;
    if (code >= 200 && code < 300) {
      hazards.push({ type: 'storm', severity: 'danger', message: 'Thunderstorm conditions' });
    }
    if (code >= 600 && code < 700) {
      hazards.push({ type: 'snow', severity: 'warning', message: 'Snow/ice conditions' });
    }
  }
  
  return {
    hasHazards: hazards.length > 0,
    hazards,
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
  createWeatherLogEntry,
  formatWeatherString,
  shouldBlockWork,
};

