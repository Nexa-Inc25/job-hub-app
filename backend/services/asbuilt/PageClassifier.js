/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Page Classifier Service
 *
 * Classifies each page of an uploaded job package PDF by its content,
 * NOT by page number. This handles out-of-order uploads correctly.
 *
 * Strategy:
 *  1. Extract text from each page individually using pdf-parse
 *  2. Match page text against detectionKeywords from UtilityAsBuiltConfig
 *  3. Score matches: exact keyword = high, partial = medium, page-position fallback = low
 *  4. Return classification map: [{ pageIndex, sectionType, confidence, detectedKeyword }]
 *
 * @module services/asbuilt/PageClassifier
 */

const { PDFDocument } = require('pdf-lib');
const pdfParse = require('pdf-parse');
const log = require('../../utils/logger');

/**
 * Extract text from a single PDF page.
 * Creates a temporary single-page PDF and runs pdf-parse on it.
 *
 * @param {PDFDocument} pdfDoc - Loaded pdf-lib document
 * @param {number} pageIndex - 0-based page index
 * @returns {Promise<string>} Extracted text (empty string if extraction fails)
 */
async function extractPageText(pdfDoc, pageIndex) {
  try {
    // Create a new single-page PDF containing only the target page
    const singlePageDoc = await PDFDocument.create();
    const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [pageIndex]);
    singlePageDoc.addPage(copiedPage);
    const singlePageBytes = await singlePageDoc.save();

    // Extract text using pdf-parse
    const parsed = await pdfParse(Buffer.from(singlePageBytes), {
      max: 1, // Only 1 page
    });

    return parsed?.text?.trim() || '';
  } catch (err) {
    log.warn({ pageIndex, err: err.message }, '[PageClassifier] Failed to extract text from page');
    return '';
  }
}

/**
 * Match page text against a single detection keyword.
 * Returns a confidence score.
 *
 * @param {string} pageText - Extracted text from the page
 * @param {string} keyword - Detection keyword to search for
 * @returns {{ matched: boolean, confidence: string }}
 */
function matchKeyword(pageText, keyword) {
  if (!pageText || !keyword) return { matched: false, confidence: 'low' };

  const normalizedText = pageText.toUpperCase().replace(/\s+/g, ' ');
  const normalizedKeyword = keyword.toUpperCase().trim();

  // Exact substring match = high confidence
  if (normalizedText.includes(normalizedKeyword)) {
    return { matched: true, confidence: 'high' };
  }

  // Try matching each word of the keyword (for OCR/extraction imperfections)
  const keywordWords = normalizedKeyword.split(/\s+/).filter(w => w.length > 3);
  if (keywordWords.length > 1) {
    const matchedWords = keywordWords.filter(word => normalizedText.includes(word));
    const matchRatio = matchedWords.length / keywordWords.length;

    if (matchRatio >= 0.75) {
      return { matched: true, confidence: 'medium' };
    }
  }

  return { matched: false, confidence: 'low' };
}

/**
 * Classify all pages of a job package PDF using utility config detection keywords.
 *
 * @param {Buffer} pdfBuffer - The raw PDF buffer
 * @param {Array} pageRanges - From UtilityAsBuiltConfig.pageRanges
 *   Each: { sectionType, label, start, end, detectionKeyword, variableLength }
 * @returns {Promise<Array<{pageIndex, sectionType, confidence, detectedKeyword, textSnippet}>>}
 */
async function classifyPages(pdfBuffer, pageRanges) {
  if (!pdfBuffer || !pageRanges?.length) {
    return [];
  }

  // Load PDF
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const pageCount = pdfDoc.getPageCount();

  log.info({ pageCount, sectionCount: pageRanges.length }, '[PageClassifier] Starting classification');

  // Extract text from every page
  const pageTexts = [];
  for (let i = 0; i < pageCount; i++) {
    const text = await extractPageText(pdfDoc, i);
    pageTexts.push(text);
  }

  // Phase 1: Keyword-based classification (high/medium confidence)
  const classifications = new Array(pageCount).fill(null);
  const usedSections = new Map(); // sectionType → [pageIndexes]

  for (let pageIdx = 0; pageIdx < pageCount; pageIdx++) {
    const text = pageTexts[pageIdx];
    if (!text) continue;

    let bestMatch = null;

    for (const range of pageRanges) {
      // Try primary keyword, then any alternates
      const keywords = [range.detectionKeyword, ...(range.detectionKeywordsAlt || [])].filter(Boolean);
      if (!keywords.length) continue;

      for (const kw of keywords) {
        const { matched, confidence } = matchKeyword(text, kw);
        if (!matched) continue;

        if (!bestMatch || (confidence === 'high' && bestMatch.confidence !== 'high')) {
          bestMatch = {
            pageIndex: pageIdx,
            sectionType: range.sectionType,
            confidence,
            detectedKeyword: kw,
            textSnippet: text.substring(0, 100),
          };
        }
        break; // first matching keyword for this range is enough
      }
    }

    if (bestMatch) {
      classifications[pageIdx] = bestMatch;
      const existing = usedSections.get(bestMatch.sectionType) || [];
      existing.push(pageIdx);
      usedSections.set(bestMatch.sectionType, existing);
    }
  }

  // Phase 2: For unclassified pages, try page-position fallback
  for (let pageIdx = 0; pageIdx < pageCount; pageIdx++) {
    if (classifications[pageIdx]) continue;

    // Find any section whose expected page range includes this page index
    // (using 1-based page numbers from config, converting to 0-based)
    const pageNum = pageIdx + 1;
    for (const range of pageRanges) {
      if (pageNum >= range.start && pageNum <= range.end) {
        // Only use position fallback if this section wasn't already claimed by keyword match
        const keywordClaimed = usedSections.get(range.sectionType);
        if (!keywordClaimed || keywordClaimed.length === 0) {
          classifications[pageIdx] = {
            pageIndex: pageIdx,
            sectionType: range.sectionType,
            confidence: 'low',
            detectedKeyword: null,
            textSnippet: pageTexts[pageIdx]?.substring(0, 100) || '',
          };
          const existing = usedSections.get(range.sectionType) || [];
          existing.push(pageIdx);
          usedSections.set(range.sectionType, existing);
          break;
        }
      }
    }
  }

  // Phase 3: Any remaining unclassified pages get tagged as 'other'
  for (let pageIdx = 0; pageIdx < pageCount; pageIdx++) {
    if (!classifications[pageIdx]) {
      classifications[pageIdx] = {
        pageIndex: pageIdx,
        sectionType: 'other',
        confidence: 'low',
        detectedKeyword: null,
        textSnippet: pageTexts[pageIdx]?.substring(0, 100) || '',
      };
    }
  }

  // Log summary
  const summary = {};
  for (const c of classifications) {
    if (!c) continue;
    summary[c.sectionType] = (summary[c.sectionType] || 0) + 1;
  }
  log.info({ summary, totalPages: pageCount }, '[PageClassifier] Classification complete');

  return classifications.filter(Boolean);
}

/**
 * Get pages for a specific section type from a classification result.
 *
 * @param {Array} classification - Result from classifyPages()
 * @param {string} sectionType - e.g. 'face_sheet', 'construction_sketch'
 * @returns {Array<number>} Sorted array of 0-based page indexes
 */
function getPagesForSection(classification, sectionType) {
  return classification
    .filter(c => c.sectionType === sectionType)
    .map(c => c.pageIndex)
    .sort((a, b) => a - b);
}

module.exports = {
  classifyPages,
  extractPageText,
  matchKeyword,
  getPagesForSection,
};
