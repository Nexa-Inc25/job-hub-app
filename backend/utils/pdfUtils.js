/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
const fs = require('node:fs');
const OpenAI = require('openai');
const { openaiBreaker } = require('./circuitBreaker');

// Initialize OpenAI client lazily
let openai = null;

function getOpenAIClient() {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

// Simple PDF text extraction - fallback method
function extractTextFromPDF(buffer) {
  // Convert buffer to string and try to extract readable text
  // This is a basic fallback that works with many PDFs
  const text = buffer.toString('utf-8');

  // Clean up the text - remove non-printable characters
  const cleanText = text.replaceAll(/[^\x20-\x7E\n\r\t]/g, ' ').replaceAll(/\s+/g, ' ');

  // If we got meaningful text, return it
  if (cleanText.length > 100) {
    return cleanText;
  }

  // If basic extraction didn't work, return a generic message
  return 'PDF content extracted (advanced parsing not available). Please provide text content directly for AI analysis.';
}

// Load pdf-parse v1.1.1
const pdfParse = require('pdf-parse');

async function getPdfText(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  return getPdfTextFromBuffer(dataBuffer);
}

// Extract text from a PDF buffer (for use with R2 storage)
async function getPdfTextFromBuffer(dataBuffer) {
  try {
    // Use pdf-parse v1.1.1 - simple function call
    const data = await pdfParse(dataBuffer);
    
    if (data?.text?.trim().length > 10) {
      console.log('PDF parsed successfully with pdf-parse, pages:', data.numpages, 'text length:', data.text.length);
      return data.text;
    } else {
      console.log('pdf-parse returned insufficient text (length:', (data?.text?.length || 0), '), using fallback method');
      // Fallback: basic text extraction
      const extractedText = extractTextFromPDF(dataBuffer);
      console.log('Fallback extraction completed, text length:', extractedText.length);
      return extractedText;
    }
  } catch (error_) {
    console.log('pdf-parse failed with error:', error_.message);
    
    // Fallback: basic text extraction
    const extractedText = extractTextFromPDF(dataBuffer);
    console.log('Fallback extraction completed, text length:', extractedText.length);
    return extractedText;
  }
}

async function extractWithAI(filePath, prompt = "Extract all relevant information from this document, including key details, dates, amounts, and any structured data.") {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }

    // First extract text from PDF
    const pdfText = await getPdfText(filePath);
    console.log('getPdfText returned text length:', pdfText?.length || 0);
    console.log('getPdfText returned text preview:', pdfText?.substring(0, 200));

    if (!pdfText || pdfText.trim().length === 0) {
      throw new Error('No text could be extracted from the PDF');
    }

    // Allow processing even with minimal text (like the fallback message)
    // The AI can still provide some analysis even with limited content

    // Use OpenAI to extract structured information (protected by circuit breaker)
    const completion = await openaiBreaker.execute(async () => {
      return getOpenAIClient().chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: "You are an expert at extracting structured information from documents. Extract all relevant data points, dates, amounts, names, and other structured information from the provided text. Return the information in a clean, organized JSON format."
        },
        {
          role: "user",
          content: `${prompt}\n\nDocument text:\n${pdfText.substring(0, 12000)}` // Limit text length for API
        }
      ],
      max_tokens: 2000,
      temperature: 0.1,
      });
    });

    const extractedInfo = completion.choices[0]?.message?.content;
    console.log('AI extraction completed successfully');

    if (!extractedInfo) {
      throw new Error('No response from OpenAI API');
    }

    return {
      rawText: pdfText,
      extractedInfo,
      model: completion.model,
      usage: completion.usage
    };

  } catch (err) {
    console.error('AI extraction error:', err);
    throw new Error(`AI extraction failed: ${err.message}`);
  }
}

function getTextChunks(text) {
  return text.split('\n\n'); // Simple chunking; improve as needed
}

// Stubs for vector store/AI
function getVectorStore(chunks) {
  return chunks; // Implement with LangChain if adding
}

function getConversationalChain(_store) {
  return { ask: (_query) => 'Stub answer' };
}

module.exports = { getPdfText, getPdfTextFromBuffer, extractWithAI, getTextChunks, getVectorStore, getConversationalChain };