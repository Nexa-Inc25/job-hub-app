/**
 * FieldLedger - Voice AI Service
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Speech-to-structured-data using OpenAI Whisper and GPT-4.
 * Enables hands-free unit entry and field ticket capture.
 * 
 * Features:
 * - Audio transcription via Whisper
 * - Multilingual support (Spanish, Portuguese to English)
 * - Structured data extraction via GPT-4
 * - Price book item matching
 */

const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

// Lazy-initialize OpenAI client (only when needed)
let openai = null;

function getOpenAIClient() {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is not configured');
    }
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

/**
 * Transcribe audio file to text using Whisper
 * @param {string} audioPath - Path to audio file (mp3, mp4, mpeg, mpga, m4a, wav, webm)
 * @param {string} language - Optional language hint (es, pt, en)
 * @returns {Promise<{text: string, language: string, duration: number}>}
 */
async function transcribeAudio(audioPath, language = null) {
  try {
    console.log('[VoiceAI] Transcribing audio:', audioPath);
    
    // Verify file exists
    if (!fs.existsSync(audioPath)) {
      throw new Error('Audio file not found');
    }

    const file = fs.createReadStream(audioPath);
    
    const transcription = await getOpenAIClient().audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: language || undefined,
      response_format: 'verbose_json',
    });

    console.log('[VoiceAI] Transcription complete:', transcription.text?.substring(0, 100));

    return {
      text: transcription.text,
      language: transcription.language,
      duration: transcription.duration,
      segments: transcription.segments,
    };
  } catch (error) {
    console.error('[VoiceAI] Transcription error:', error.message);
    throw error;
  }
}

/**
 * Transcribe audio buffer directly (from multipart upload)
 * @param {Buffer} audioBuffer - Audio data buffer
 * @param {string} filename - Original filename with extension
 * @param {string} language - Optional language hint
 * @returns {Promise<{text: string, language: string, duration: number}>}
 */
async function transcribeBuffer(audioBuffer, filename, language = null) {
  // Write to temp file (OpenAI API requires file path)
  const tempDir = path.join(__dirname, '..', 'uploads', 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const tempPath = path.join(tempDir, `voice_${Date.now()}_${filename}`);
  
  try {
    fs.writeFileSync(tempPath, audioBuffer);
    const result = await transcribeAudio(tempPath, language);
    return result;
  } finally {
    // Clean up temp file
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

/**
 * Parse transcribed text into structured unit entry data
 * @param {string} text - Transcribed text from foreman
 * @param {Array} priceBookItems - Available price book items for matching
 * @returns {Promise<Object>} Structured unit entry data
 */
async function parseUnitEntry(text, priceBookItems = []) {
  try {
    console.log('[VoiceAI] Parsing unit entry from text:', text);

    // Build price book context for better matching
    const priceBookContext = priceBookItems.length > 0
      ? `Available unit items:\n${priceBookItems.slice(0, 50).map(i => 
          `- ${i.itemCode}: ${i.description} (${i.unit})`
        ).join('\n')}`
      : 'No price book items provided. Extract general work information.';

    const systemPrompt = `You are an AI assistant for utility construction contractors. 
Parse the foreman's spoken description of work performed into structured data.

${priceBookContext}

Extract the following information:
1. Unit/Item: Match to the closest price book item if possible
2. Quantity: The amount of work (feet, each, hours, etc.)
3. Equipment used: Any equipment mentioned (bucket truck, crane, etc.)
4. Equipment hours: If equipment hours mentioned
5. Location description: Where the work was done (pole number, address reference)
6. Notes: Any additional context

Return a JSON object with these fields:
- itemCode: Best matching price book item code (or null if no match)
- itemDescription: Description of work
- quantity: Numeric quantity
- unit: Unit of measure (LF, EA, HR, etc.)
- equipmentType: Type of equipment if mentioned (bucket_truck, crane, etc.)
- equipmentHours: Equipment hours if mentioned
- locationDescription: Location reference
- notes: Additional notes
- confidence: 0-1 score for how confident you are in the parsing
- originalText: The original transcribed text`;

    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    console.log('[VoiceAI] Parsed unit entry:', parsed);

    return {
      ...parsed,
      originalText: text,
      parsedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[VoiceAI] Parse unit entry error:', error.message);
    throw error;
  }
}

/**
 * Parse transcribed text into structured field ticket (T&M) data
 * @param {string} text - Transcribed text describing extra work
 * @returns {Promise<Object>} Structured field ticket data
 */
async function parseFieldTicket(text) {
  try {
    console.log('[VoiceAI] Parsing field ticket from text:', text);

    const systemPrompt = `You are an AI assistant for utility construction contractors.
Parse the foreman's spoken description of EXTRA WORK (Time & Material) into structured data.

This is for change orders - work that was not part of the original contract.

Extract the following information:
1. Change reason: Why extra work was needed (scope_change, unforeseen_condition, utility_request, safety_requirement, design_error, weather_damage, third_party_damage, other)
2. Description: What extra work was performed
3. Labor: Workers involved and their hours (regular, overtime, double-time)
4. Equipment: Equipment used and hours
5. Materials: Materials consumed

Return a JSON object with these fields:
- changeReason: One of the enum values above
- changeDescription: Detailed description of extra work
- laborEntries: Array of {workerName, role, regularHours, overtimeHours, doubleTimeHours}
- equipmentEntries: Array of {equipmentType, description, hours, standbyHours}
- materialEntries: Array of {description, quantity, unit}
- notes: Additional context
- confidence: 0-1 score
- originalText: The original transcribed text`;

    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    console.log('[VoiceAI] Parsed field ticket:', parsed);

    return {
      ...parsed,
      originalText: text,
      parsedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[VoiceAI] Parse field ticket error:', error.message);
    throw error;
  }
}

/**
 * Translate non-English text to English
 * @param {string} text - Text to translate
 * @param {string} sourceLanguage - Source language code
 * @returns {Promise<{original: string, translated: string, language: string}>}
 */
async function translateToEnglish(text, sourceLanguage) {
  try {
    if (sourceLanguage === 'en' || sourceLanguage === 'english') {
      return { original: text, translated: text, language: 'en' };
    }

    console.log('[VoiceAI] Translating from', sourceLanguage, ':', text.substring(0, 50));

    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { 
          role: 'system', 
          content: 'Translate the following text to English. Preserve technical terms related to utility construction work. Return only the translation.' 
        },
        { role: 'user', content: text }
      ],
      temperature: 0.1,
    });

    const translated = response.choices[0].message.content;
    console.log('[VoiceAI] Translated:', translated.substring(0, 50));

    return {
      original: text,
      translated,
      language: sourceLanguage,
    };
  } catch (error) {
    console.error('[VoiceAI] Translation error:', error.message);
    throw error;
  }
}

/**
 * Full voice-to-data pipeline
 * Transcribes audio, translates if needed, then parses into structured data
 * @param {string|Buffer} audio - Audio file path or buffer
 * @param {string} filename - Filename if buffer provided
 * @param {string} dataType - 'unit' or 'fieldticket'
 * @param {Array} priceBookItems - Price book items for unit matching
 * @returns {Promise<Object>} Complete parsed result
 */
async function processVoiceInput(audio, filename, dataType = 'unit', priceBookItems = []) {
  try {
    // Step 1: Transcribe
    let transcription;
    if (Buffer.isBuffer(audio)) {
      transcription = await transcribeBuffer(audio, filename);
    } else {
      transcription = await transcribeAudio(audio);
    }

    // Step 2: Translate if not English
    let textToProcess = transcription.text;
    let translation = null;
    
    if (transcription.language && transcription.language !== 'en') {
      translation = await translateToEnglish(transcription.text, transcription.language);
      textToProcess = translation.translated;
    }

    // Step 3: Parse into structured data
    let parsed;
    if (dataType === 'fieldticket') {
      parsed = await parseFieldTicket(textToProcess);
    } else {
      parsed = await parseUnitEntry(textToProcess, priceBookItems);
    }

    return {
      success: true,
      transcription: {
        text: transcription.text,
        language: transcription.language,
        duration: transcription.duration,
      },
      translation,
      parsed,
      dataType,
    };
  } catch (error) {
    console.error('[VoiceAI] Process voice input error:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = {
  transcribeAudio,
  transcribeBuffer,
  parseUnitEntry,
  parseFieldTicket,
  translateToEnglish,
  processVoiceInput,
};

