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
    it('should detect high wind hazard', () => {
      const result = weatherService.assessHazards({
        windSpeed: 35,
        windGust: 45,
        temperature: 70,
        visibility: 10,
        conditionCode: 800,
      });
      expect(result.hasHazards).toBe(true);
      expect(result.hazards).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'wind' })
        ])
      );
    });

    it('should detect extreme cold', () => {
      const result = weatherService.assessHazards({
        windSpeed: 5,
        temperature: 20,
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
    });

    it('should detect thunderstorm from condition code', () => {
      const result = weatherService.assessHazards({
        windSpeed: 10,
        temperature: 70,
        conditionCode: 211,
      });
      expect(result.hazards).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'storm', severity: 'danger' })
        ])
      );
    });

    it('should detect snow from condition code', () => {
      const result = weatherService.assessHazards({
        windSpeed: 10,
        temperature: 28,
        conditionCode: 601,
      });
      expect(result.hazards).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'snow' })
        ])
      );
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

  describe('shouldBlockWork', () => {
    it('should block for dangerous wind', () => {
      const result = weatherService.shouldBlockWork({
        windSpeed: 45,
        temperature: 70,
        conditionCode: 800,
      });
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('wind');
    });

    it('should not block for mild conditions', () => {
      const result = weatherService.shouldBlockWork({
        windSpeed: 5,
        temperature: 72,
        conditionCode: 800,
      });
      expect(result.blocked).toBe(false);
    });

    it('should block for thunderstorms', () => {
      const result = weatherService.shouldBlockWork({
        windSpeed: 15,
        temperature: 72,
        conditionCode: 211,
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
