/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Weather Service Tests
 * 
 * Tests weather data fetching, caching, and hazard assessment.
 * Mocks the OpenWeatherMap API to avoid external calls.
 */

const axios = require('axios');

// Mock axios
jest.mock('axios');

// Set API key for testing
process.env.OPENWEATHER_API_KEY = 'test-api-key';

// Import after setting env and mocking
const weatherService = require('../services/weather.service');

describe('Weather Service', () => {
  const mockWeatherResponse = {
    data: {
      main: {
        temp: 72,
        feels_like: 70,
        humidity: 45,
        pressure: 1013,
      },
      weather: [{
        id: 800,
        description: 'clear sky',
        icon: '01d',
      }],
      wind: {
        speed: 8,
        deg: 180,
        gust: 12,
      },
      visibility: 10000,
      clouds: { all: 5 },
      rain: {},
      sys: {
        sunrise: Math.floor(Date.now() / 1000) - 3600,
        sunset: Math.floor(Date.now() / 1000) + 3600,
        country: 'US',
      },
      name: 'San Francisco',
      dt: Math.floor(Date.now() / 1000),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    axios.get.mockResolvedValue(mockWeatherResponse);
  });

  describe('getCurrentWeather', () => {
    it('should fetch weather data for coordinates', async () => {
      const weather = await weatherService.getCurrentWeather(37.7749, -122.4194);
      expect(weather).toBeDefined();
      expect(weather.temperature).toBe(72);
      expect(weather.conditions).toBe('clear sky');
      expect(weather.humidity).toBe(45);
      expect(weather.windSpeed).toBe(8);
      expect(weather.source).toBe('api');
    });

    it('should call OpenWeatherMap API with correct params', async () => {
      // Use unique coordinates to avoid cache hits from other tests
      await weatherService.getCurrentWeather(38.1234, -121.5678);
      expect(axios.get).toHaveBeenCalledWith(
        'https://api.openweathermap.org/data/2.5/weather',
        expect.objectContaining({
          params: expect.objectContaining({
            lat: 38.1234,
            lon: -121.5678,
            units: 'imperial',
          }),
        })
      );
    });
  });

  describe('assessHazards', () => {
    it('should detect CAUTION wind at 25 mph', () => {
      const result = weatherService.assessHazards({
        windSpeed: 28,
        temperature: 70,
        humidity: 50,
        conditionCode: 800,
      });
      expect(result.hasHazards).toBe(true);
      expect(result.hazards).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'wind', severity: 'warning' })
        ])
      );
      expect(result.stopWorkRecommended).toBe(false);
    });

    it('should detect STOP_WORK wind at 35 mph', () => {
      const result = weatherService.assessHazards({
        windSpeed: 38,
        temperature: 70,
        humidity: 50,
        conditionCode: 800,
      });
      expect(result.hasHazards).toBe(true);
      expect(result.hazards).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'wind', severity: 'danger' })
        ])
      );
      expect(result.stopWorkRecommended).toBe(true);
    });

    it('should NOT flag wind below 25 mph', () => {
      const result = weatherService.assessHazards({
        windSpeed: 20,
        temperature: 70,
        humidity: 50,
        conditionCode: 800,
      });
      const windHazards = result.hazards.filter(h => h.type === 'wind');
      expect(windHazards).toHaveLength(0);
    });

    it('should detect extreme cold', () => {
      const result = weatherService.assessHazards({
        windSpeed: 5,
        temperature: 20,
        humidity: 40,
        visibility: 10,
        conditionCode: 800,
      });
      expect(result.hasHazards).toBe(true);
      expect(result.hazards).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'cold' })
        ])
      );
    });

    it('should detect extreme heat', () => {
      const result = weatherService.assessHazards({
        windSpeed: 5,
        temperature: 105,
        humidity: 30,
        visibility: 10,
        conditionCode: 800,
      });
      expect(result.hasHazards).toBe(true);
      expect(result.hazards).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'heat' })
        ])
      );
    });

    it('should return no hazards for mild conditions', () => {
      const result = weatherService.assessHazards({
        windSpeed: 5,
        temperature: 72,
        visibility: 10,
        conditionCode: 800,
        humidity: 50,
      });
      expect(result.hasHazards).toBe(false);
      expect(result.hazards).toHaveLength(0);
      expect(result.stopWorkRecommended).toBe(false);
    });

    it('should detect lightning/thunderstorm and recommend STOP_WORK (code 200-232)', () => {
      const result = weatherService.assessHazards({
        windSpeed: 10,
        temperature: 70,
        humidity: 60,
        conditionCode: 211,
      });
      expect(result.hazards).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'lightning', severity: 'danger' })
        ])
      );
      expect(result.stopWorkRecommended).toBe(true);
    });

    it('should detect lightning at boundary code 200', () => {
      const result = weatherService.assessHazards({
        windSpeed: 5,
        temperature: 75,
        humidity: 60,
        conditionCode: 200,
      });
      expect(result.hazards.some(h => h.type === 'lightning')).toBe(true);
      expect(result.stopWorkRecommended).toBe(true);
    });

    it('should detect lightning at boundary code 232', () => {
      const result = weatherService.assessHazards({
        windSpeed: 5,
        temperature: 75,
        humidity: 60,
        conditionCode: 232,
      });
      expect(result.hazards.some(h => h.type === 'lightning')).toBe(true);
    });

    it('should detect snow from condition code', () => {
      const result = weatherService.assessHazards({
        windSpeed: 10,
        temperature: 28,
        humidity: 80,
        conditionCode: 601,
      });
      expect(result.hazards).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'snow' })
        ])
      );
    });

    it('should calculate heat index STOP_WORK when temp + humidity are extreme', () => {
      // 100°F + 70% humidity → heat index well above 105°F
      const result = weatherService.assessHazards({
        windSpeed: 5,
        temperature: 100,
        humidity: 70,
        conditionCode: 800,
      });
      expect(result.hazards).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'heat_index', severity: 'danger' })
        ])
      );
      expect(result.stopWorkRecommended).toBe(true);
    });

    it('should calculate heat index warning at moderate levels', () => {
      // 88°F + 65% humidity → heat index ~95°F
      const result = weatherService.assessHazards({
        windSpeed: 5,
        temperature: 88,
        humidity: 65,
        conditionCode: 800,
      });
      const heatIndexHazard = result.hazards.find(h => h.type === 'heat_index');
      expect(heatIndexHazard).toBeDefined();
      expect(heatIndexHazard.severity).toBe('warning');
    });

    it('should produce a combined hazard score', () => {
      const result = weatherService.assessHazards({
        windSpeed: 40,
        temperature: 100,
        humidity: 80,
        conditionCode: 211,
      });
      expect(result.hazardScore).toBeGreaterThan(0);
      expect(result.hazardScore).toBeLessThanOrEqual(100);
    });
    
    it('should return hazardScore of 0 for mild conditions', () => {
      const result = weatherService.assessHazards({
        windSpeed: 5,
        temperature: 72,
        humidity: 50,
        conditionCode: 800,
      });
      expect(result.hazardScore).toBe(0);
    });
  });

  describe('formatWeatherString', () => {
    it('should format complete weather data', () => {
      const str = weatherService.formatWeatherString({
        temperature: 72,
        conditions: 'clear sky',
        windSpeed: 8,
        humidity: 45,
        source: 'api',
      });
      expect(str).toContain('72°F');
      expect(str).toContain('clear sky');
      expect(str).toContain('Wind: 8 mph');
    });

    it('should return unavailable for error source', () => {
      const str = weatherService.formatWeatherString({ source: 'error' });
      expect(str).toContain('unavailable');
    });

    it('should return unavailable for null weather', () => {
      const str = weatherService.formatWeatherString(null);
      expect(str).toContain('unavailable');
    });
  });

  describe('calculateHeatIndex', () => {
    it('should return temp for temperatures below 80°F', () => {
      expect(weatherService.calculateHeatIndex(75, 50)).toBe(75);
    });

    it('should calculate elevated heat index for high temp + humidity', () => {
      const hi = weatherService.calculateHeatIndex(100, 70);
      expect(hi).toBeGreaterThan(100);
    });

    it('should return reasonable values for moderate conditions', () => {
      const hi = weatherService.calculateHeatIndex(85, 50);
      expect(hi).toBeGreaterThanOrEqual(85);
      expect(hi).toBeLessThan(100);
    });
  });

  describe('shouldBlockWork', () => {
    it('should block for dangerous wind (>=35 mph)', () => {
      const result = weatherService.shouldBlockWork({
        windSpeed: 40,
        temperature: 70,
        humidity: 50,
        conditionCode: 800,
      });
      expect(result.blocked).toBe(true);
      expect(result.reason.toLowerCase()).toContain('wind');
    });

    it('should not block for mild conditions', () => {
      const result = weatherService.shouldBlockWork({
        windSpeed: 5,
        temperature: 72,
        humidity: 50,
        conditionCode: 800,
      });
      expect(result.blocked).toBe(false);
    });

    it('should block for thunderstorms', () => {
      const result = weatherService.shouldBlockWork({
        windSpeed: 15,
        temperature: 72,
        humidity: 50,
        conditionCode: 211,
      });
      expect(result.blocked).toBe(true);
    });

    it('should block for extreme heat index', () => {
      const result = weatherService.shouldBlockWork({
        windSpeed: 5,
        temperature: 105,
        humidity: 70,
        conditionCode: 800,
      });
      expect(result.blocked).toBe(true);
    });
  });

  describe('createWeatherLogEntry', () => {
    it('should create a log entry with all fields', () => {
      const entry = weatherService.createWeatherLogEntry({
        temperature: 72,
        conditions: 'clear',
        conditionCode: 800,
        humidity: 45,
        windSpeed: 8,
        windDirection: 180,
        precipitation: 0,
        visibility: 10,
        source: 'api',
      });
      expect(entry.capturedAt).toBeDefined();
      expect(entry.temperature).toBe(72);
      expect(entry.hazards).toBeDefined();
      expect(entry.hazards.hasHazards).toBe(false);
    });
  });
});
