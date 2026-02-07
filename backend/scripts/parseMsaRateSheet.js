#!/usr/bin/env node
/**
 * MSA Rate Sheet CSV Parser
 * 
 * Parses messy PG&E MSA rate sheet CSVs and outputs a clean CSV
 * compatible with FieldLedger's pricebook import format.
 * 
 * Usage:
 *   node parseMsaRateSheet.js <input.csv> <output.csv>
 * 
 * Example:
 *   node parseMsaRateSheet.js "/Users/mike/MSA Alvah Group.csv" ./cleaned_pricebook.csv
 */

const fs = require('node:fs');
const path = require('node:path');

// Item code patterns to detect rate rows (e.g., OCE-13, PROV-1, 08S-01)
const ITEM_CODE_PATTERN = /^[A-Z0-9]{2,6}-\d{1,3}[A-Z]?$/i;

// Price pattern to extract dollar amounts (e.g., "$ 458.23", "$1,234.56")
const PRICE_PATTERN = /\$\s*([\d,]+\.?\d*)/;

// Valid pricebook categories (must match backend/routes/pricebook.routes.js VALID_CATEGORIES)
const VALID_CATEGORIES = ['civil', 'electrical', 'overhead', 'underground', 'traffic_control', 'vegetation', 'emergency', 'other'];

/**
 * Map MSA category/subcategory to valid pricebook category
 */
function mapToValidCategory(category, subcategory) {
  const combined = `${category} ${subcategory}`.toLowerCase();
  
  // Traffic control
  if (combined.includes('traffic') || combined.includes('flagg')) {
    return 'traffic_control';
  }
  
  // Electrical
  if (combined.includes('elect') || combined.includes('ecrew') || combined.includes('qew')) {
    return 'electrical';
  }
  
  // Overhead
  if (combined.includes('overhead') || combined.includes('pole') || combined.includes('oh ')) {
    return 'overhead';
  }
  
  // Underground
  if (combined.includes('underground') || combined.includes('conduit') || combined.includes('vault') || 
      combined.includes('manhole') || combined.includes('trench') || combined.includes('ug ')) {
    return 'underground';
  }
  
  // Vegetation
  if (combined.includes('vegetation') || combined.includes('tree') || combined.includes('brush')) {
    return 'vegetation';
  }
  
  // Emergency
  if (combined.includes('emergency') || combined.includes('storm')) {
    return 'emergency';
  }
  
  // Civil (default for civil work, excavation, paving, etc.)
  if (combined.includes('civil') || combined.includes('excavat') || combined.includes('pav') || 
      combined.includes('concrete') || combined.includes('asphalt') || combined.includes('restore') ||
      combined.includes('open cut') || combined.includes('saw') || combined.includes('pad')) {
    return 'civil';
  }
  
  // Default to other
  return 'other';
}

/**
 * Parse a CSV line handling quoted fields with commas
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  
  return result;
}

/**
 * Find item code in a row (check columns 11-12)
 */
function findItemCode(columns) {
  // Check columns 11-12 first (primary location)
  for (let i = 11; i <= 12; i++) {
    if (columns[i] && ITEM_CODE_PATTERN.test(columns[i])) {
      return columns[i].toUpperCase();
    }
  }
  
  // Also check nearby columns in case of format variation
  for (let i = 10; i <= 15; i++) {
    if (columns[i] && ITEM_CODE_PATTERN.test(columns[i])) {
      return columns[i].toUpperCase();
    }
  }
  
  return null;
}

/**
 * Extract category from columns (usually column 2)
 */
function findCategory(columns) {
  const category = columns[2] || '';
  return category.trim();
}

/**
 * Extract subcategory from columns (usually column 5)
 */
function findSubcategory(columns) {
  const subcategory = columns[5] || '';
  return subcategory.trim();
}

/**
 * Extract description from columns (usually columns 15-16)
 */
function findDescription(columns) {
  let description = '';
  
  // Try columns 15-16 for main description
  if (columns[15]) description = columns[15].trim();
  if (columns[16] && columns[16].trim()) {
    description = description ? `${description} ${columns[16].trim()}` : columns[16].trim();
  }
  
  // If empty, try column 17
  if (!description && columns[17]) {
    description = columns[17].trim();
  }
  
  // Clean up description
  description = description
    .replace(/\s+/g, ' ')      // Collapse whitespace
    .replace(/"/g, '')          // Remove quotes
    .trim();
  
  return description;
}

/**
 * Extract range info (e.g., "0-15LF", "16-30LF") from columns around 30-35
 */
function findRangeInfo(columns) {
  // Check columns 30-40 for range info
  for (let i = 30; i <= 40; i++) {
    const val = columns[i]?.trim();
    if (val && /^\d+-\d*\s*(?:LF|EA|SQ|FT)?$/i.test(val)) {
      return val;
    }
    if (val && /^\d+\s*(?:LF|EA|SQ|FT)\+?$/i.test(val)) {
      return val;
    }
  }
  return null;
}

/**
 * Extract unit from columns (usually column 37-38)
 */
function findUnit(columns) {
  // Check columns 37-40 for unit
  for (let i = 37; i <= 42; i++) {
    const val = columns[i]?.trim().toUpperCase();
    if (val && /^(EA|LF|HR|SQ\/FT|SQFT|CU\/FT|CUFT|DAY|LS|EACH|TON|GAL|CY|SY|LB)$/i.test(val)) {
      return val.replace('/', '');
    }
  }
  return 'EA'; // Default to EA
}

/**
 * Extract unit price from columns (look for $ pattern starting around column 55-70)
 */
function findUnitPrice(columns) {
  // Scan columns 50-80 for first price
  for (let i = 50; i <= 80; i++) {
    const val = columns[i]?.trim();
    if (val) {
      const match = val.match(PRICE_PATTERN);
      if (match) {
        // Remove commas and parse as float
        const price = parseFloat(match[1].replace(/,/g, ''));
        if (!isNaN(price) && price > 0) {
          return price;
        }
      }
    }
  }
  return null;
}

/**
 * Escape CSV field (wrap in quotes if contains comma)
 */
function escapeCSVField(field) {
  const str = String(field || '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Main parsing function
 */
function parseMsaRateSheet(inputPath, outputPath) {
  console.log(`\n📄 Parsing MSA Rate Sheet: ${inputPath}`);
  console.log(`📁 Output: ${outputPath}\n`);
  
  // Read input file
  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Input file not found: ${inputPath}`);
    process.exit(1);
  }
  
  const content = fs.readFileSync(inputPath, 'utf-8');
  const lines = content.split('\n');
  
  console.log(`📊 Total lines in input: ${lines.length}`);
  
  // Parse and extract rate items
  const items = [];
  const errors = [];
  let lastCategory = '';
  let lastSubcategory = '';
  
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    if (!line.trim()) continue;
    
    const columns = parseCSVLine(line);
    
    // Try to find an item code in this row
    const itemCode = findItemCode(columns);
    if (!itemCode) continue;
    
    // Track category/subcategory (they may persist across rows)
    const category = findCategory(columns) || lastCategory;
    const subcategory = findSubcategory(columns) || lastSubcategory;
    
    if (category) lastCategory = category;
    if (subcategory) lastSubcategory = subcategory;
    
    // Extract description
    let description = findDescription(columns);
    
    // Add range info if available
    const rangeInfo = findRangeInfo(columns);
    if (rangeInfo && !description.includes(rangeInfo)) {
      description = description ? `${description} (${rangeInfo})` : rangeInfo;
    }
    
    // Extract unit and price
    const unit = findUnit(columns);
    const unitPrice = findUnitPrice(columns);
    
    // Validate we have minimum required data
    if (!unitPrice) {
      errors.push({ line: lineNum + 1, itemCode, reason: 'No price found' });
      continue;
    }
    
    // Map to valid pricebook category
    const validCategory = mapToValidCategory(category, subcategory);
    
    // Build original category string for subcategory field
    const originalCategory = subcategory 
      ? `${category} - ${subcategory}`.trim().replace(/^- /, '')
      : category;
    
    items.push({
      itemcode: itemCode,
      description: description || itemCode,
      category: validCategory,
      subcategory: originalCategory || '',
      unit: unit,
      unitprice: unitPrice.toFixed(2)
    });
  }
  
  console.log(`✅ Extracted ${items.length} rate items`);
  if (errors.length > 0) {
    console.log(`⚠️  Skipped ${errors.length} rows (no valid price)`);
  }
  
  // Write output CSV
  const header = 'itemcode,description,category,subcategory,unit,unitprice';
  const rows = items.map(item => 
    [item.itemcode, item.description, item.category, item.subcategory, item.unit, item.unitprice]
      .map(escapeCSVField)
      .join(',')
  );
  
  const output = [header, ...rows].join('\n');
  
  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (outputDir && !fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  fs.writeFileSync(outputPath, output, 'utf-8');
  
  console.log(`\n📝 Output written to: ${outputPath}`);
  console.log(`   Total items: ${items.length}`);
  
  // Show sample of extracted items
  console.log('\n📋 Sample items:');
  items.slice(0, 5).forEach(item => {
    console.log(`   ${item.itemcode}: ${item.description.slice(0, 50)}... @ $${item.unitprice}/${item.unit}`);
  });
  
  // Show unique categories
  const categories = [...new Set(items.map(i => i.category))];
  console.log(`\n📂 Categories found (${categories.length}):`);
  categories.slice(0, 10).forEach(cat => console.log(`   - ${cat}`));
  if (categories.length > 10) {
    console.log(`   ... and ${categories.length - 10} more`);
  }
  
  console.log('\n✅ Done!\n');
  
  return { items, errors };
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: node parseMsaRateSheet.js <input.csv> <output.csv>');
    console.log('');
    console.log('Example:');
    console.log('  node parseMsaRateSheet.js "/Users/mike/MSA Alvah Group.csv" ./cleaned_pricebook.csv');
    process.exit(1);
  }
  
  const [inputPath, outputPath] = args;
  parseMsaRateSheet(inputPath, outputPath);
}

module.exports = { parseMsaRateSheet };

