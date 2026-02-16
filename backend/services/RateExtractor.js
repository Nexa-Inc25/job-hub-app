/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Rate Extractor Service
 *
 * Parses MSA contract PDFs to extract structured rate data:
 * - Unit pricing by work type and region
 * - IBEW labor classification rates with fringe breakdowns
 * - Crew composition rates (4/5/6-man crews, ST/OT/DT)
 * - Equipment rates (hourly, daily, weekly, monthly)
 *
 * The MSA PDF is typically an Excel workbook converted to PDF with
 * distinct rate sheet tabs. Text extraction produces tabular data
 * that can be parsed with pattern matching.
 *
 * @module services/RateExtractor
 */

const { PDFDocument } = require('pdf-lib');
const pdfParse = require('pdf-parse');
const log = require('../utils/logger');

// PG&E division names (in the order they appear in rate sheets)
const PGE_DIVISIONS = [
  'Humboldt', 'Sonoma', 'North Bay', 'North Valley', 'Sierra', 'Sacramento',
  'San Francisco', 'East Bay', 'Diablo', 'Mission', 'Peninsula', 'Deanza',
  'San Jose', 'Central Coast', 'Los Padres', 'Stockton', 'Yosemite', 'Fresno', 'Kern',
];

/**
 * Extract text from a single page of a PDF.
 */
async function extractPageText(pdfDoc, pageIndex) {
  try {
    const singleDoc = await PDFDocument.create();
    const [page] = await singleDoc.copyPages(pdfDoc, [pageIndex]);
    singleDoc.addPage(page);
    const singleBuf = await singleDoc.save();
    const parsed = await pdfParse(Buffer.from(singleBuf), { max: 1 });
    return parsed?.text?.trim() || '';
  } catch {
    return '';
  }
}

/**
 * Parse dollar amounts from a text string.
 * Handles formats: $9,888.04, 9888.04, $15.50
 */
function parseDollarAmounts(text) {
  const matches = text.match(/\$?\s*[\d,]+\.\d{2}/g) || [];
  return matches.map(m => parseFloat(m.replace(/[$,\s]/g, '')));
}

/**
 * Parse a percentage from text (e.g., "79%" → 0.79, "5%" → 0.05).
 */
function parsePercent(text) {
  const match = text.match(/([\d.]+)\s*%/);
  return match ? parseFloat(match[1]) / 100 : 0;
}

/**
 * Extract unit rates from a rate sheet page.
 * These pages have headers like "07 Pole Replacement" and rows with
 * ref codes, descriptions, and dollar amounts per division.
 */
function extractUnitRatesFromPage(text, workType) {
  const rates = [];
  const lines = text.split('\n').filter(l => l.trim());

  for (const line of lines) {
    // Look for lines starting with a ref code pattern (e.g., "07-1", "08S-1", "56A-1")
    const refMatch = line.match(/^(\d{2}[A-Z]?-\d+[A-Z]?)\s*/);
    if (!refMatch) continue;

    const refCode = refMatch[1];
    const rest = line.substring(refMatch[0].length);

    // Extract dollar amounts from the line
    const amounts = parseDollarAmounts(rest);
    if (amounts.length === 0) continue;

    // Try to extract description and labor percent
    const laborPct = parsePercent(rest);

    // Extract description — text between ref code and first dollar sign or percentage
    const descMatch = rest.match(/^([A-Za-z][^$%]*?)(?:\d|Each|Foot|Lump|\$)/);
    const description = descMatch ? descMatch[1].trim() : refCode;

    // Extract unit of measure
    let uom = 'Each';
    if (/foot|feet|ft/i.test(rest)) uom = 'Foot';
    if (/lump\s*sum/i.test(rest)) uom = 'Lump Sum';
    if (/hourly|hour|hr/i.test(rest)) uom = 'Hourly';
    if (/cost\s*plus/i.test(rest)) uom = 'Cost Plus';

    // Map amounts to divisions (amounts appear in division order)
    const regionRates = [];
    for (let i = 0; i < Math.min(amounts.length, PGE_DIVISIONS.length); i++) {
      if (amounts[i] > 0) {
        regionRates.push({ division: PGE_DIVISIONS[i], rate: amounts[i] });
      }
    }

    if (regionRates.length > 0) {
      rates.push({
        refCode,
        workType,
        unitDescription: `${workType} - ${description}`.substring(0, 200),
        unitOfMeasure: uom,
        laborPercent: laborPct,
        regionRates,
      });
    }
  }

  return rates;
}

/**
 * Extract IBEW labor classification rates.
 * These pages have columns: Classification, Base Wage, Fringes..., Total
 */
function extractLaborRates(text) {
  const rates = [];

  // Known classifications to look for
  const classifications = [
    'Journeyman Lineman', 'General Foreman', 'Foreman',
    'Cable Splicer Foreman', 'Cable Splicer', 'Underground Foreman',
    'Apprentice Lineman', 'Equipment Operator', 'Groundman',
    'Heavy Line Equipment Operator', 'Line Equipment Man',
  ];

  for (const classification of classifications) {
    // Find lines containing the classification name
    const escapedName = classification.replace(/\s+/g, '\\s+');
    const regex = new RegExp(`${escapedName}[\\s\\S]{0,500}`, 'i');
    const match = text.match(regex);
    if (!match) continue;

    const segment = match[0];
    const amounts = parseDollarAmounts(segment);

    if (amounts.length >= 1) {
      // First amount is typically the base wage
      const baseWage = amounts[0];

      // Total burdened rate is typically the last large amount, or calculate from known patterns
      // In PG&E MSAs: total ≈ base × 2.17 (typical burden multiplier)
      let totalBurdened = amounts.length > 5 ? amounts[amounts.length - 1] : baseWage * 2.17;

      // If we have the known rates from the crew rate tables, use those
      if (classification === 'Journeyman Lineman' && amounts.length > 1) {
        // Try to find the ~156 range number
        const burdenedCandidate = amounts.find(a => a > baseWage * 1.5 && a < baseWage * 3);
        if (burdenedCandidate) totalBurdened = burdenedCandidate;
      }

      rates.push({
        classification,
        baseWage,
        totalBurdenedRate: Math.round(totalBurdened * 100) / 100,
        fringes: {
          healthWelfare: amounts[1] || 0,
          pension: amounts[2] || 0,
          payrollTaxes: 0,
          insurance: 0,
          overheadProfit: 0,
          training: 0,
          subsistence: 0,
          other: 0,
        },
      });
    }
  }

  return rates;
}

/**
 * Extract crew composition rates.
 * These pages have tables like "Table 1: Straight Time Crew Rates: 4-Man Crew"
 */
function extractCrewRates(text) {
  const rates = [];

  // Look for crew rate sections
  const crewSections = text.split(/Table\s+\d+[A-Z]?:/i).filter(s => s.trim());

  for (const section of crewSections) {
    // Detect crew size
    const sizeMatch = section.match(/(\d)\s*[-‐]\s*Man\s+Crew/i);
    if (!sizeMatch) continue;
    const crewSize = parseInt(sizeMatch[1]);

    // Find dollar amounts — these are crew rates
    const amounts = parseDollarAmounts(section);
    if (amounts.length === 0) continue;

    // Look for crew configurations (#1, #2, #3, #4)
    for (let config = 1; config <= 4; config++) {
      const configLabel = `${crewSize}-Man Crew #${config}`;
      // Each config's rate is at a predictable position in the amounts array
      const rateIdx = (config - 1);
      if (rateIdx < amounts.length) {
        rates.push({
          crewSize,
          crewConfig: configLabel,
          straightTimeRate: amounts[rateIdx] || 0,
          overtimeRate: Math.round((amounts[rateIdx] || 0) * 1.4 * 100) / 100, // Approximate OT
          doubleTimeRate: Math.round((amounts[rateIdx] || 0) * 1.8 * 100) / 100, // Approximate DT
          composition: [],
        });
      }
    }
  }

  return rates;
}

/**
 * Extract equipment rates.
 * These pages have columns: #, Equipment, Description, Weight, Hourly, Daily, Weekly, Monthly
 */
function extractEquipmentRates(text) {
  const rates = [];
  const lines = text.split('\n').filter(l => l.trim());

  for (const line of lines) {
    // Look for lines starting with a number (equipment index)
    const idxMatch = line.match(/^(\d{1,3})\s*/);
    if (!idxMatch) continue;

    const rest = line.substring(idxMatch[0].length);
    const amounts = parseDollarAmounts(rest);
    if (amounts.length === 0) continue;

    // Extract equipment description — text before first dollar amount
    const descMatch = rest.match(/^([A-Za-z][^$]*?)(?:\d{2,}|\$)/);
    const description = descMatch ? descMatch[1].trim() : `Equipment #${idxMatch[1]}`;
    if (description.length < 3) continue;

    rates.push({
      equipmentType: description.substring(0, 100),
      hourlyRate: amounts[0] || 0,
      dailyRate: amounts[1] || 0,
      weeklyRate: amounts[2] || 0,
      monthlyRate: amounts[3] || 0,
    });
  }

  return rates;
}

/**
 * Detect the work type from a rate sheet page's header text.
 */
function detectWorkType(text) {
  const headers = [
    { pattern: /07\s+Pole\s+Replacement/i, type: 'Pole Replacement' },
    { pattern: /08S\s+OH\s+Replc?\s+Switches/i, type: 'OH Replace Switches' },
    { pattern: /08J\s+OH\s+Bare\s+Wire/i, type: 'OH Bare Wire' },
    { pattern: /56A\s+UG\s+Cable/i, type: 'UG Cable' },
    { pattern: /56B\s+UG\s+Equipment/i, type: 'UG Equipment' },
    { pattern: /01\s+Tree/i, type: 'Tree Work' },
    { pattern: /Pole\s+Replacement.*Progress\s+Billing/i, type: 'Billing' },
  ];

  for (const h of headers) {
    if (h.pattern.test(text)) return h.type;
  }
  return null;
}

/**
 * Extract all rates from an MSA PDF buffer.
 *
 * @param {Buffer} pdfBuffer - The raw MSA PDF
 * @returns {Promise<Object>} Extracted rate data matching ContractRates schema shape
 */
async function extractRatesFromMSA(pdfBuffer) {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const pageCount = pdfDoc.getPageCount();

  log.info({ pageCount }, '[RateExtractor] Starting MSA rate extraction');

  const result = {
    unitRates: [],
    laborRates: [],
    crewRates: [],
    equipmentRates: [],
    contractNumber: null,
    effectiveDate: null,
    expirationDate: null,
  };

  // Extract text from every page and classify
  for (let i = 0; i < pageCount; i++) {
    const text = await extractPageText(pdfDoc, i);
    if (!text || text.length < 50) continue;

    const upperText = text.toUpperCase();

    // Detect contract number from first few pages
    if (i < 5 && !result.contractNumber) {
      const contractMatch = text.match(/Contract\s+(?:No\.?\s*)?([A-Z]?\d{4,})/i);
      if (contractMatch) result.contractNumber = contractMatch[1];
    }

    // Detect expiration date
    if (i < 5 && !result.expirationDate) {
      const dateMatch = text.match(/(?:through|expir\w+|until)\s+(\w+\s+\d{1,2},?\s+\d{4})/i);
      if (dateMatch) {
        try { result.expirationDate = new Date(dateMatch[1]); } catch { /* ignore */ }
      }
    }

    // Unit rate sheets (pages 3-40 typically)
    const workType = detectWorkType(text);
    if (workType && i >= 2 && i <= 50) {
      const unitRates = extractUnitRatesFromPage(text, workType);
      result.unitRates.push(...unitRates);
    }

    // Labor rate pages (contain IBEW classifications)
    if (upperText.includes('JOURNEYMAN') && upperText.includes('FOREMAN') && upperText.includes('BASE WAGE')) {
      const laborRates = extractLaborRates(text);
      if (laborRates.length > result.laborRates.length) {
        result.laborRates = laborRates; // Keep the best extraction
      }
    }

    // Crew rate pages
    if (upperText.includes('MAN CREW') && (upperText.includes('STRAIGHT TIME') || upperText.includes('TABLE'))) {
      const crewRates = extractCrewRates(text);
      result.crewRates.push(...crewRates);
    }

    // Equipment rate pages
    if (upperText.includes('EQUIPMENT') && (upperText.includes('HOURLY RATE') || upperText.includes('DAILY RATE') || upperText.includes('$/HR'))) {
      const equipmentRates = extractEquipmentRates(text);
      result.equipmentRates.push(...equipmentRates);
    }
  }

  // Deduplicate crew rates by config name
  const seenCrewConfigs = new Set();
  result.crewRates = result.crewRates.filter(r => {
    if (seenCrewConfigs.has(r.crewConfig)) return false;
    seenCrewConfigs.add(r.crewConfig);
    return true;
  });

  // Deduplicate equipment by type
  const seenEquipment = new Set();
  result.equipmentRates = result.equipmentRates.filter(r => {
    const key = r.equipmentType.toLowerCase();
    if (seenEquipment.has(key)) return false;
    seenEquipment.add(key);
    return true;
  });

  log.info({
    unitRates: result.unitRates.length,
    laborRates: result.laborRates.length,
    crewRates: result.crewRates.length,
    equipmentRates: result.equipmentRates.length,
    contractNumber: result.contractNumber,
  }, '[RateExtractor] Extraction complete');

  return result;
}

module.exports = {
  extractRatesFromMSA,
  extractUnitRatesFromPage,
  extractLaborRates,
  extractCrewRates,
  extractEquipmentRates,
  PGE_DIVISIONS,
};
