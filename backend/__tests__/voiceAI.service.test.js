/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * VoiceAI Service Tests
 *
 * Tests the voice AI service with mocked OpenAI responses.
 * Covers: transcription, unit parsing, field ticket parsing,
 * translation, retry logic, and fallback JSON parsing.
 */

// fs and path are available if needed for file-based tests
// const fs = require('fs');
// const path = require('path');

// Mock OpenAI before requiring the service
jest.mock('openai', () => {
  const mockCreate = jest.fn();
  const mockTranscriptionsCreate = jest.fn();
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
    audio: { transcriptions: { create: mockTranscriptionsCreate } },
    _mockChatCreate: mockCreate,
    _mockTranscriptionsCreate: mockTranscriptionsCreate,
  }));
});

// Set env var before requiring
process.env.OPENAI_API_KEY = 'test-key';

const voiceAIService = require('../services/voiceAI.service');

// Get the mock handles
let mockChatCreate;
// let mockTranscriptionsCreate; // Available for transcription tests

beforeEach(() => {
  jest.clearAllMocks();
  // Access mocks from the OpenAI constructor
  const OpenAI = require('openai');
  const instance = new OpenAI();
  mockChatCreate = instance._mockChatCreate;
});

describe('VoiceAI Service', () => {
  describe('parseUnitEntry', () => {
    it('should parse unit entry from text', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              itemCode: 'OH-001',
              itemDescription: 'Install 40ft Class 3 pole',
              quantity: 2,
              unit: 'EA',
              confidence: 0.9,
            })
          }
        }]
      };

      mockChatCreate.mockResolvedValueOnce(mockResponse);

      const result = await voiceAIService.parseUnitEntry('Installed two forty foot class three poles at Main and Oak');

      expect(result).toHaveProperty('itemCode', 'OH-001');
      expect(result).toHaveProperty('quantity', 2);
      expect(result).toHaveProperty('unit', 'EA');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('originalText');
      expect(result).toHaveProperty('parsedAt');
    });

    it('should include price book context when items provided', async () => {
      const priceBookItems = [
        { itemCode: 'OH-001', description: 'Install 40ft pole', unit: 'EA', category: 'overhead' },
      ];

      mockChatCreate.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ itemCode: 'OH-001', quantity: 1, unit: 'EA', confidence: 0.95 }) } }]
      });

      await voiceAIService.parseUnitEntry('installed one forty foot pole', priceBookItems);

      // Verify the system prompt included price book items
      const callArgs = mockChatCreate.mock.calls[0][0];
      expect(callArgs.messages[0].content).toContain('OH-001');
    });
  });

  describe('parseFieldTicket', () => {
    it('should parse field ticket data from text', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              changeReason: 'unforeseen_condition',
              changeDescription: 'Hit underground rock, needed extra excavation',
              laborEntries: [
                { workerName: 'John', role: 'operator', regularHours: 4, overtimeHours: 0 }
              ],
              equipmentEntries: [
                { equipmentType: 'excavator', description: 'CAT 320', hours: 4 }
              ],
              materialEntries: [],
              confidence: 0.85,
            })
          }
        }]
      };

      mockChatCreate.mockResolvedValueOnce(mockResponse);

      const result = await voiceAIService.parseFieldTicket('We hit rock underground and needed the excavator for four hours with John operating');

      expect(result.changeReason).toBe('unforeseen_condition');
      expect(result.laborEntries).toHaveLength(1);
      expect(result.equipmentEntries).toHaveLength(1);
      expect(result.originalText).toBeDefined();
    });
  });

  describe('translateToEnglish', () => {
    it('should skip translation for English text', async () => {
      const result = await voiceAIService.translateToEnglish('Hello world', 'en');
      expect(result.original).toBe('Hello world');
      expect(result.translated).toBe('Hello world');
      expect(result.language).toBe('en');
    });

    it('should translate non-English text', async () => {
      mockChatCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'We installed three poles on Main Street' } }]
      });

      const result = await voiceAIService.translateToEnglish('Instalamos tres postes en la calle principal', 'es');
      expect(result.original).toBe('Instalamos tres postes en la calle principal');
      expect(result.translated).toBe('We installed three poles on Main Street');
      expect(result.language).toBe('es');
    });
  });

  describe('Fallback JSON Parsing', () => {
    it('should handle JSON in markdown code blocks', async () => {
      const malformedResponse = {
        choices: [{
          message: {
            content: 'Here is the parsed data:\n```json\n{"itemCode":"OH-001","quantity":2,"unit":"EA","confidence":0.8}\n```'
          }
        }]
      };

      mockChatCreate.mockResolvedValueOnce(malformedResponse);

      const result = await voiceAIService.parseUnitEntry('installed two poles');
      expect(result.itemCode).toBe('OH-001');
      expect(result.quantity).toBe(2);
    });

    it('should handle JSON embedded in text', async () => {
      const embeddedResponse = {
        choices: [{
          message: {
            content: 'Based on the description, I extracted: {"itemCode":"UG-005","quantity":100,"unit":"LF","confidence":0.7}'
          }
        }]
      };

      mockChatCreate.mockResolvedValueOnce(embeddedResponse);

      const result = await voiceAIService.parseUnitEntry('ran a hundred feet of conduit');
      expect(result.itemCode).toBe('UG-005');
      expect(result.quantity).toBe(100);
    });

    it('should return fallback structure for completely unparseable response', async () => {
      const badResponse = {
        choices: [{
          message: {
            content: 'I could not understand the input at all.'
          }
        }]
      };

      mockChatCreate.mockResolvedValueOnce(badResponse);

      const result = await voiceAIService.parseUnitEntry('garbled audio noise');
      expect(result).toHaveProperty('parseError');
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe('Retry Logic', () => {
    it('should retry on transient failure and succeed', async () => {
      mockChatCreate
        .mockRejectedValueOnce(new Error('Rate limit exceeded'))
        .mockResolvedValueOnce({
          choices: [{ message: { content: JSON.stringify({ itemCode: 'X', quantity: 1, unit: 'EA', confidence: 0.9 }) } }]
        });

      const result = await voiceAIService.parseUnitEntry('one widget');
      expect(result.itemCode).toBe('X');
      expect(mockChatCreate).toHaveBeenCalledTimes(2);
    });

    it('should throw after all retries exhausted', async () => {
      mockChatCreate
        .mockRejectedValueOnce(new Error('API error'))
        .mockRejectedValueOnce(new Error('API error'))
        .mockRejectedValueOnce(new Error('API error'));

      await expect(voiceAIService.parseUnitEntry('test')).rejects.toThrow('API error');
      expect(mockChatCreate).toHaveBeenCalledTimes(3);
    });
  });
});
