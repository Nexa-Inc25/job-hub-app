/**
 * FieldLedger - Voice AI Routes
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Endpoints for voice-to-data capture:
 * - Audio transcription
 * - Structured data parsing
 * - Multilingual support
 * 
 * @swagger
 * tags:
 *   - name: Voice
 *     description: Voice AI for hands-free field data capture
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const voiceAIService = require('../services/voiceAI.service');
const PriceBook = require('../models/PriceBook');
const User = require('../models/User');
const { sanitizeString, sanitizeObjectId } = require('../utils/sanitize');

// Configure multer for audio uploads
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB max (Whisper limit)
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'audio/mp3', 'audio/mpeg', 'audio/mp4', 'audio/m4a',
      'audio/wav', 'audio/webm', 'audio/ogg', 'audio/x-m4a',
      'video/mp4', 'video/webm' // Some browsers record as video
    ];
    // Also check extension for cases where mimetype is wrong
    const allowedExt = ['.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm', '.ogg'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(file.mimetype) || allowedExt.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid audio format. Allowed: ${allowedExt.join(', ')}`), false);
    }
  }
});

/**
 * @swagger
 * /api/voice/transcribe:
 *   post:
 *     summary: Transcribe audio file to text
 *     description: Uses OpenAI Whisper for speech-to-text. Supports multiple languages.
 *     tags: [Voice]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - audio
 *             properties:
 *               audio:
 *                 type: string
 *                 format: binary
 *                 description: Audio file (mp3, mp4, m4a, wav, webm)
 *               language:
 *                 type: string
 *                 description: Language hint (en, es, pt)
 *     responses:
 *       200:
 *         description: Transcription result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 text:
 *                   type: string
 *                 language:
 *                   type: string
 *                 duration:
 *                   type: number
 */
router.post('/transcribe', audioUpload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const language = sanitizeString(req.body.language);
    
    console.log('[Voice:Transcribe] Processing audio:', {
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      language
    });

    const result = await voiceAIService.transcribeBuffer(
      req.file.buffer,
      req.file.originalname,
      language
    );

    res.json(result);
  } catch (err) {
    console.error('Error transcribing audio:', err);
    res.status(500).json({ error: err.message || 'Failed to transcribe audio' });
  }
});

/**
 * @swagger
 * /api/voice/parse-unit:
 *   post:
 *     summary: Parse transcribed text into unit entry data
 *     description: Uses GPT-4 to extract structured unit entry from spoken description
 *     tags: [Voice]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *             properties:
 *               text:
 *                 type: string
 *                 description: Transcribed text to parse
 *               jobId:
 *                 type: string
 *                 description: Job ID for price book lookup
 *               utilityId:
 *                 type: string
 *                 description: Utility ID for price book lookup
 *     responses:
 *       200:
 *         description: Parsed unit entry data
 */
router.post('/parse-unit', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const { text, jobId, utilityId } = req.body;
    
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Get price book items for matching
    let priceBookItems = [];
    const safeUtilityId = sanitizeObjectId(utilityId);
    
    if (safeUtilityId) {
      const priceBook = await PriceBook.getActive(user.companyId, safeUtilityId);
      if (priceBook && priceBook.items) {
        priceBookItems = priceBook.items.map(item => ({
          itemCode: item.itemCode,
          description: item.description,
          unit: item.unit,
          category: item.category,
        }));
      }
    }

    const result = await voiceAIService.parseUnitEntry(text.trim(), priceBookItems);

    res.json(result);
  } catch (err) {
    console.error('Error parsing unit entry:', err);
    res.status(500).json({ error: err.message || 'Failed to parse unit entry' });
  }
});

/**
 * @swagger
 * /api/voice/parse-fieldticket:
 *   post:
 *     summary: Parse transcribed text into field ticket (T&M) data
 *     description: Uses GPT-4 to extract labor, equipment, and material entries
 *     tags: [Voice]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *             properties:
 *               text:
 *                 type: string
 *                 description: Transcribed text describing extra work
 *     responses:
 *       200:
 *         description: Parsed field ticket data
 */
router.post('/parse-fieldticket', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const result = await voiceAIService.parseFieldTicket(text.trim());

    res.json(result);
  } catch (err) {
    console.error('Error parsing field ticket:', err);
    res.status(500).json({ error: err.message || 'Failed to parse field ticket' });
  }
});

/**
 * @swagger
 * /api/voice/process:
 *   post:
 *     summary: Full voice-to-data pipeline
 *     description: Transcribes audio, translates if needed, and parses into structured data
 *     tags: [Voice]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - audio
 *             properties:
 *               audio:
 *                 type: string
 *                 format: binary
 *               dataType:
 *                 type: string
 *                 enum: [unit, fieldticket]
 *                 default: unit
 *               utilityId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Complete processing result
 */
router.post('/process', audioUpload.single('audio'), async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const dataType = req.body.dataType === 'fieldticket' ? 'fieldticket' : 'unit';
    const safeUtilityId = sanitizeObjectId(req.body.utilityId);

    // Get price book items for unit matching
    let priceBookItems = [];
    if (dataType === 'unit' && safeUtilityId) {
      const priceBook = await PriceBook.getActive(user.companyId, safeUtilityId);
      if (priceBook && priceBook.items) {
        priceBookItems = priceBook.items.map(item => ({
          itemCode: item.itemCode,
          description: item.description,
          unit: item.unit,
          category: item.category,
        }));
      }
    }

    console.log('[Voice:Process] Processing audio:', {
      originalName: req.file.originalname,
      size: req.file.size,
      dataType,
      priceBookItemCount: priceBookItems.length
    });

    const result = await voiceAIService.processVoiceInput(
      req.file.buffer,
      req.file.originalname,
      dataType,
      priceBookItems
    );

    res.json(result);
  } catch (err) {
    console.error('Error processing voice input:', err);
    res.status(500).json({ error: err.message || 'Failed to process voice input' });
  }
});

/**
 * @swagger
 * /api/voice/translate:
 *   post:
 *     summary: Translate text to English
 *     description: Translates non-English text while preserving technical terms
 *     tags: [Voice]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *               - sourceLanguage
 *             properties:
 *               text:
 *                 type: string
 *               sourceLanguage:
 *                 type: string
 *                 description: Source language code (es, pt, etc.)
 *     responses:
 *       200:
 *         description: Translation result
 */
router.post('/translate', async (req, res) => {
  try {
    const { text, sourceLanguage } = req.body;
    
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text is required' });
    }

    if (!sourceLanguage) {
      return res.status(400).json({ error: 'Source language is required' });
    }

    const result = await voiceAIService.translateToEnglish(
      text.trim(),
      sanitizeString(sourceLanguage)
    );

    res.json(result);
  } catch (err) {
    console.error('Error translating text:', err);
    res.status(500).json({ error: err.message || 'Failed to translate text' });
  }
});

module.exports = router;

