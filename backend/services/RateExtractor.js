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
 * Handles formats: $9,888.04, 9888.04, 9,888.04$, $15.50
 * PG&E MSA format puts $ AFTER the number: "9,888.04$"
 */
function parseDollarAmounts(text) {
  // Match: optional $, digits with commas, decimal, optional trailing $
  const matches = text.match(/\$?\s*[\d,]+\.\d{2}\s*\$?/g) || [];
  return matches.map(m => parseFloat(m.replace(/[$,\s]/g, ''))).filter(n => !isNaN(n) && n > 0);
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
 * PG&E MSA format: ref code + description on one line, dollar amounts on the NEXT line.
 * Example:
 *   "07-1Pole"
 *   "9,888.04$  9,888.04$  ..."
 */
function extractUnitRatesFromPage(text, workType) {
  const rates = [];
  const lines = text.split('\n').filter(l => l.trim());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Look for lines starting with a ref code pattern (e.g., "07-1", "08S-1", "56A-1")
    const refMatch = line.match(/^(\d{2}[A-Z]?-\d+[A-Z]?)\s*(.*)/);
    if (!refMatch) continue;

    const refCode = refMatch[1];
    const descPart = refMatch[2].trim();

    // PG&E format: ref code line, then description+UOM line, then %  line, then amounts line
    // Look ahead up to 5 lines for dollar amounts, description, UOM, labor %
    let amounts = [];
    let laborPct = 0;
    let uom = 'Each';
    let description = descPart || '';

    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
      const checkLine = lines[j].trim();

      // Dollar amounts line (many amounts with $ signs)
      const lineAmounts = parseDollarAmounts(checkLine);
      if (lineAmounts.length > 3) {
        amounts = lineAmounts;
        break;
      }

      // Labor percent line (just a percentage)
      if (/^\d{1,3}%$/.test(checkLine)) {
        laborPct = parsePercent(checkLine);
        continue;
      }

      // Description + UOM line (e.g., "Pole Replacement - Type 1Each")
      if (/[A-Za-z]/.test(checkLine) && !checkLine.startsWith('$') && lineAmounts.length === 0) {
        if (!description && checkLine.length > 3) {
          description = checkLine;
        } else if (description.length < 5) {
          description = checkLine;
        }
        // Check for UOM at end of description
        if (/Each\s*$/i.test(checkLine)) uom = 'Each';
        if (/Foot\s*$/i.test(checkLine) || /Per\s+Foot/i.test(checkLine)) uom = 'Foot';
        if (/Lump\s*Sum/i.test(checkLine)) uom = 'Lump Sum';
        if (/Hourly\s*$/i.test(checkLine) || /Per\s+Hour/i.test(checkLine)) uom = 'Hourly';
        if (/Per\s+Day/i.test(checkLine)) uom = 'Daily';
        if (/Per\s+Run/i.test(checkLine)) uom = 'Per Run';
        if (/Cost\s*Plus/i.test(checkLine)) uom = 'Cost Plus';
      }

      // Stop if we hit another ref code
      if (/^\d{2}[A-Z]?-\d/.test(checkLine)) break;
    }

    if (amounts.length === 0) continue;

    // Clean up description
    description = description
      .replace(/Each\s*$/i, '')
      .replace(/Foot\s*$/i, '')
      .replace(/Hourly\s*$/i, '')
      .replace(/Per\s+(Day|Run|Foot|Hour)\s*$/i, '')
      .replace(/Lump\s*Sum\s*$/i, '')
      .trim() || refCode;

    // Map amounts to divisions
    const regionRates = [];
    for (let k = 0; k < Math.min(amounts.length, PGE_DIVISIONS.length); k++) {
      if (amounts[k] > 0) {
        regionRates.push({ division: PGE_DIVISIONS[k], rate: amounts[k] });
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
 * PG&E MSA format: classifications and amounts are on separate lines,
 * sometimes split across multiple lines (e.g., "Journeyman" then "Lineman").
 *
 * Strategy: join all text, find classification names, then grab the next
 * dollar amount as the burdened rate (from crew rate tables).
 */
function extractLaborRates(text) {
  const rates = [];

  // Join the text into one string for pattern matching across line breaks
  const joined = text.replace(/\n/g, ' ').replace(/\s+/g, ' ');

  // Known classifications and their typical burdened rates from the crew rate tables
  // We look for the classification name followed by a dollar amount
  const classifications = [
    'Journeyman Lineman',
    'General Foreman',
    'Foreman',
    'Cable Splicer Foreman',
    'Cable Splicer',
    'Underground Foreman',
    'Apprentice Lineman',
    'Equipment Operator',
    'Groundman',
    'Heavy Line Equipment Operator',
    'Line Equipment Man',
  ];

  const seenClassifications = new Set();

  for (const classification of classifications) {
    // Search for the classification name followed eventually by a dollar amount
    const escapedName = classification.replace(/\s+/g, '\\s+');
    const regex = new RegExp(`${escapedName}\\s*[\\d,.\\s$]{0,80}?(\\d[\\d,]*\\.\\d{2})\\s*\\$?`, 'i');
    const match = joined.match(regex);
    if (!match) continue;
    if (seenClassifications.has(classification)) continue;
    seenClassifications.add(classification);

    const firstAmount = parseFloat(match[1].replace(/,/g, ''));
    if (isNaN(firstAmount) || firstAmount <= 0) continue;

    // The first dollar amount near the classification is typically the burdened hourly rate
    // For crew rate tables: this is the all-in rate (base + fringes + OH&P)
    // For individual rate sheets: this is the base wage
    // Heuristic: if > 100, it's likely burdened; if < 100, it's base wage
    const isBurdened = firstAmount > 100;
    const baseWage = isBurdened ? Math.round(firstAmount / 2.17 * 100) / 100 : firstAmount;
    const totalBurdened = isBurdened ? firstAmount : Math.round(firstAmount * 2.17 * 100) / 100;

    rates.push({
      classification,
      baseWage,
      totalBurdenedRate: totalBurdened,
      fringes: {
        healthWelfare: 0,
        pension: 0,
        payrollTaxes: 0,
        insurance: 0,
        overheadProfit: 0,
        training: 0,
        subsistence: 0,
        other: 0,
      },
    });
  }

  return rates;
}

/**
 * Extract crew composition rates.
 * PG&E MSA format: text is heavily split across lines.
 * We look for classification names followed by dollar amounts.
 * The crew rate tables have the burdened hourly rate (e.g., 156.83$)
 * and then subtotals for each crew config (e.g., 470.48, 627.31).
 *
 * Strategy: find all dollar amounts on the page, find classification
 * names, and correlate them. The subtotals (crew config rates) are
 * the larger amounts that represent full crew hourly costs.
 */
function extractCrewRates(text) {
  const rates = [];
  const allAmounts = parseDollarAmounts(text);
  if (allAmounts.length === 0) return rates;

  // Detect crew sizes mentioned
  const crewSizes = [];
  const sizeMatches = text.matchAll(/(\d)\s*[-‐]\s*Man\s+Crew/gi);
  for (const m of sizeMatches) {
    const size = parseInt(m[1]);
    if (!crewSizes.includes(size)) crewSizes.push(size);
  }
  if (crewSizes.length === 0) return rates;

  // Find subtotal amounts — these are the crew config rates
  // They're typically the amounts > $200 that represent full crew hourly costs
  // Each classification's burdened rate (e.g., 156.83) appears first,
  // then subtotals for configs (e.g., 470.48 = 3 × 156.83)
  const crewSubtotals = allAmounts.filter(a => a > 200 && a < 5000);

  // Group subtotals into configs of 4 (configs #1-#4)
  for (const crewSize of crewSizes) {
    for (let config = 1; config <= 4; config++) {
      const idx = (config - 1);
      if (idx < crewSubtotals.length) {
        const stRate = crewSubtotals[idx];
        rates.push({
          crewSize,
          crewConfig: `${crewSize}-Man Crew #${config}`,
          straightTimeRate: stRate,
          overtimeRate: Math.round(stRate * 1.4 * 100) / 100,
          doubleTimeRate: Math.round(stRate * 1.8 * 100) / 100,
          composition: [],
        });
      }
    }
    // Shift past the used subtotals for this crew size
    crewSubtotals.splice(0, 4);
  }

  return rates;
}

/**
 * Extract equipment rates.
 * PG&E MSA format: lines have "#EquipmentDescription" followed by rates.
 * Some lines have the description and amounts together, others split.
 * Amounts use trailing $ format: "15.50$", "155.00$", "775.00$"
 */
function extractEquipmentRates(text) {
  const rates = [];
  const lines = text.split('\n').filter(l => l.trim());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Look for lines starting with a number (equipment index)
    const idxMatch = line.match(/^(\d{1,3})([A-Za-z])/);
    if (!idxMatch) continue;

    // Extract description — everything after the index number until dollar amounts
    const fullLine = line.substring(idxMatch[1].length);
    let description = fullLine.replace(/[\d,]+\.\d{2}\s*\$?/g, '').trim();

    // Also check next line for more description text
    if (description.length < 5 && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      if (/^[A-Za-z]/.test(nextLine) && !parseDollarAmounts(nextLine).length) {
        description += ' ' + nextLine;
      }
    }

    // Clean up description
    description = description
      .replace(/\(\d+\)/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (description.length < 3) continue;

    // Find amounts -- PG&E format has trailing $: "47.50$  475.00$  2,375.00$"
    // The weight field is concatenated without $, so we split carefully
    // Look for patterns: digits.2decimals$ (with trailing dollar sign)
    const dollarMatches = line.match(/(\d[\d,]*\.\d{2})\s*\$/g) || [];
    let amounts = dollarMatches.map(m => parseFloat(m.replace(/[$,\s]/g, ''))).filter(n => !isNaN(n) && n > 0);

    // Also check next line
    if (amounts.length === 0 && i + 1 < lines.length) {
      const nextMatches = (lines[i + 1] || '').match(/(\d[\d,]*\.\d{2})\s*\$/g) || [];
      amounts = nextMatches.map(m => parseFloat(m.replace(/[$,\s]/g, ''))).filter(n => !isNaN(n) && n > 0);
    }
    if (amounts.length === 0) continue;

    // Filter out obviously wrong amounts (weight values parsed as rates)
    // Equipment hourly rates are typically $5-500, daily $50-5000
    amounts = amounts.filter(a => a < 10000);

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

  // If no crew rates extracted from tables, compute from labor rates
  if (result.crewRates.length === 0 && result.laborRates.length > 0) {
    const jlRate = result.laborRates.find(r => r.classification === 'Journeyman Lineman')?.totalBurdenedRate || 0;
    const fmRate = result.laborRates.find(r => r.classification === 'Foreman')?.totalBurdenedRate || 0;
    const gfRate = result.laborRates.find(r => r.classification === 'General Foreman')?.totalBurdenedRate || 0;
    const gmRate = result.laborRates.find(r => r.classification === 'Groundman')?.totalBurdenedRate || 0;

    if (jlRate > 0 && fmRate > 0) {
      // Standard PG&E crew configurations
      const configs = [
        { size: 4, config: '4-Man Crew #1', comp: [{ classification: 'Journeyman Lineman', count: 3 }, { classification: 'Foreman', count: 1 }] },
        { size: 4, config: '4-Man Crew #2', comp: [{ classification: 'Journeyman Lineman', count: 2 }, { classification: 'Foreman', count: 1 }, { classification: 'Groundman', count: 1 }] },
        { size: 5, config: '5-Man Crew #1', comp: [{ classification: 'Journeyman Lineman', count: 4 }, { classification: 'Foreman', count: 1 }] },
        { size: 5, config: '5-Man Crew #2', comp: [{ classification: 'Journeyman Lineman', count: 3 }, { classification: 'Foreman', count: 1 }, { classification: 'Groundman', count: 1 }] },
        { size: 6, config: '6-Man Crew #1', comp: [{ classification: 'Journeyman Lineman', count: 5 }, { classification: 'Foreman', count: 1 }] },
        { size: 6, config: '6-Man Crew #2', comp: [{ classification: 'Journeyman Lineman', count: 4 }, { classification: 'Foreman', count: 1 }, { classification: 'Groundman', count: 1 }] },
      ];

      const rateMap = { 'Journeyman Lineman': jlRate, 'Foreman': fmRate, 'General Foreman': gfRate, 'Groundman': gmRate };

      for (const cfg of configs) {
        let stRate = 0;
        for (const member of cfg.comp) {
          stRate += (rateMap[member.classification] || 0) * member.count;
        }
        // Add GF allocation (typically 0.33 of a GF per crew)
        stRate += gfRate * 0.33;
        stRate = Math.round(stRate * 100) / 100;

        result.crewRates.push({
          crewSize: cfg.size,
          crewConfig: cfg.config,
          straightTimeRate: stRate,
          overtimeRate: Math.round(stRate * 1.5 * 100) / 100,
          doubleTimeRate: Math.round(stRate * 2 * 100) / 100,
          composition: cfg.comp,
        });
      }
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
