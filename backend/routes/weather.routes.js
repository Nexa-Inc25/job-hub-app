/**
 * FieldLedger - Weather Routes
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Endpoints for auto-weather integration:
 * - Get current weather by coordinates
 * - Weather logging for jobs
 * 
 * @swagger
 * tags:
 *   - name: Weather
 *     description: Auto-weather conditions for field operations
 */

const express = require('express');
const router = express.Router();
const weatherService = require('../services/weather.service');
const Job = require('../models/Job');
const User = require('../models/User');
const { sanitizeObjectId } = require('../utils/sanitize');

/**
 * @swagger
 * /api/weather/current:
 *   get:
 *     summary: Get current weather by coordinates
 *     tags: [Weather]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema:
 *           type: number
 *       - in: query
 *         name: lng
 *         required: true
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: Current weather conditions
 */
router.get('/current', async (req, res) => {
  try {
    const { lat, lng } = req.query;
    
    const latitude = Number.parseFloat(lat);
    const longitude = Number.parseFloat(lng);
    
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return res.status(400).json({ error: 'Valid lat and lng are required' });
    }
    
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: 'Invalid coordinates' });
    }

    const weather = await weatherService.getCurrentWeather(latitude, longitude);
    const hazards = weatherService.assessHazards(weather);
    const formatted = weatherService.formatWeatherString(weather);
    const workStatus = weatherService.shouldBlockWork(weather);

    res.json({
      ...weather,
      hazards,
      formatted,
      workStatus
    });
  } catch (err) {
    console.error('Error getting weather:', err);
    res.status(500).json({ error: 'Failed to get weather data' });
  }
});

/**
 * @swagger
 * /api/weather/job/{jobId}:
 *   get:
 *     summary: Get weather for a job's location
 *     tags: [Weather]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Weather at job location
 */
router.get('/job/:jobId', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const jobId = sanitizeObjectId(req.params.jobId);
    if (!jobId) {
      return res.status(400).json({ error: 'Valid job ID required' });
    }

    const job = await Job.findOne({
      _id: jobId,
      companyId: user.companyId,
      isDeleted: { $ne: true }
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Get job coordinates
    let latitude, longitude;
    
    if (job.preFieldLabels?.gpsCoordinates?.latitude) {
      latitude = job.preFieldLabels.gpsCoordinates.latitude;
      longitude = job.preFieldLabels.gpsCoordinates.longitude;
    } else {
      return res.status(400).json({ 
        error: 'Job location not available',
        message: 'GPS coordinates not set for this job'
      });
    }

    const weather = await weatherService.getCurrentWeather(latitude, longitude);
    const hazards = weatherService.assessHazards(weather);
    const formatted = weatherService.formatWeatherString(weather);
    const workStatus = weatherService.shouldBlockWork(weather);

    res.json({
      jobId: job._id,
      woNumber: job.woNumber,
      address: job.address,
      coordinates: { latitude, longitude },
      weather: {
        ...weather,
        hazards,
        formatted,
        workStatus
      }
    });
  } catch (err) {
    console.error('Error getting job weather:', err);
    res.status(500).json({ error: 'Failed to get weather data' });
  }
});

/**
 * @swagger
 * /api/weather/job/{jobId}/log:
 *   post:
 *     summary: Log current weather to job's weather history
 *     tags: [Weather]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Weather logged successfully
 */
router.post('/job/:jobId/log', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const jobId = sanitizeObjectId(req.params.jobId);
    if (!jobId) {
      return res.status(400).json({ error: 'Valid job ID required' });
    }

    const job = await Job.findOne({
      _id: jobId,
      companyId: user.companyId,
      isDeleted: { $ne: true }
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Get job coordinates
    let latitude, longitude;
    
    if (job.preFieldLabels?.gpsCoordinates?.latitude) {
      latitude = job.preFieldLabels.gpsCoordinates.latitude;
      longitude = job.preFieldLabels.gpsCoordinates.longitude;
    } else {
      return res.status(400).json({ 
        error: 'Job location not available',
        message: 'GPS coordinates not set for this job'
      });
    }

    const weather = await weatherService.getCurrentWeather(latitude, longitude);
    const logEntry = weatherService.createWeatherLogEntry(weather);

    // Add to job's weather log
    if (!job.weatherLog) {
      job.weatherLog = [];
    }
    job.weatherLog.push(logEntry);
    
    await job.save();

    res.json({
      success: true,
      message: 'Weather logged',
      entry: logEntry
    });
  } catch (err) {
    console.error('Error logging weather:', err);
    res.status(500).json({ error: 'Failed to log weather' });
  }
});

/**
 * @swagger
 * /api/weather/job/{jobId}/history:
 *   get:
 *     summary: Get weather history for a job
 *     tags: [Weather]
 *     security:
 *       - bearerAuth: []
 */
router.get('/job/:jobId/history', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const jobId = sanitizeObjectId(req.params.jobId);
    if (!jobId) {
      return res.status(400).json({ error: 'Valid job ID required' });
    }

    const job = await Job.findOne({
      _id: jobId,
      companyId: user.companyId,
      isDeleted: { $ne: true }
    }).select('weatherLog woNumber address');

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({
      jobId: job._id,
      woNumber: job.woNumber,
      address: job.address,
      weatherLog: job.weatherLog || [],
      count: (job.weatherLog || []).length
    });
  } catch (err) {
    console.error('Error getting weather history:', err);
    res.status(500).json({ error: 'Failed to get weather history' });
  }
});

module.exports = router;

