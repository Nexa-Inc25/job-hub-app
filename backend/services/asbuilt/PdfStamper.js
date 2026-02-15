/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * PDF Stamper Service
 *
 * Stamps pre-filled values onto extracted PDF pages at configured positions.
 * Handles text, dates, checkboxes, and signatures.
 *
 * Used by the guided as-built completion engine to auto-fill the foreman's
 * data onto the original job package PDF pages.
 *
 * @module services/asbuilt/PdfStamper
 */

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const log = require('../../utils/logger');

// Checkmark unicode and drawing
const CHECKMARK = '\u2713';

/**
 * Resolve a dot-path value from a data context.
 * e.g., resolveValue('job.pmNumber', { job: { pmNumber: '123' } }) → '123'
 */
function resolveValue(dotPath, context) {
  if (!dotPath || !context) return null;

  // Special case: 'today' returns today's date
  if (dotPath === 'today') {
    return new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  }

  const parts = dotPath.split('.');
  let current = context;
  for (const part of parts) {
    if (current == null) return null;
    current = current[part];
  }
  return current ?? null;
}

/**
 * Stamp completion fields onto extracted PDF pages for a single document section.
 *
 * @param {Buffer} pdfBuffer - The PDF buffer containing the section's pages
 * @param {Array} fields - From UtilityAsBuiltConfig documentCompletions[].fields
 * @param {Object} context - Data context for auto-fill resolution:
 *   { job, user, company, timesheet, lme, manualValues }
 * @returns {Promise<Buffer>} The stamped PDF buffer
 */
async function stampSection(pdfBuffer, fields, context = {}) {
  if (!pdfBuffer || !fields?.length) return pdfBuffer;

  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();

  const { manualValues = {} } = context;

  let stamped = 0;

  for (const field of fields) {
    if (!field.position) continue;

    const { pageOffset = 0, x, y, width = 200, height = 14, fontSize = 10, align = 'left' } = field.position;

    // Get the target page
    const pageIdx = Math.min(pageOffset, pages.length - 1);
    if (pageIdx < 0) continue;
    const page = pages[pageIdx];

    // Resolve the value: manual override → autoFill → null
    let value = manualValues[field.fieldName] ?? null;
    if (value == null && field.autoFillFrom) {
      value = resolveValue(field.autoFillFrom, context);
    }
    if (value == null) continue;

    try {
      if (field.type === 'checkbox') {
        // Draw a checkmark if value is truthy
        if (value) {
          page.drawText(CHECKMARK, {
            x,
            y,
            size: fontSize + 2,
            font: boldFont,
            color: rgb(0, 0, 0),
          });
          stamped++;
        }
      } else if (field.type === 'signature') {
        // Embed signature image (base64 PNG)
        if (typeof value === 'string' && value.length > 100) {
          try {
            // Strip data URL prefix if present
            const base64Data = value.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
            const sigBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

            let sigImage;
            if (value.includes('image/png') || value.startsWith('iVBOR')) {
              sigImage = await pdfDoc.embedPng(sigBytes);
            } else {
              sigImage = await pdfDoc.embedJpg(sigBytes);
            }

            const sigDims = sigImage.scale(Math.min(width / sigImage.width, height / sigImage.height));
            page.drawImage(sigImage, {
              x,
              y,
              width: sigDims.width,
              height: sigDims.height,
            });
            stamped++;
          } catch (sigErr) {
            log.warn({ field: field.fieldName, err: sigErr.message }, '[PdfStamper] Failed to embed signature');
          }
        }
      } else {
        // Text, date, number, select, lanId — all rendered as text
        const textValue = String(value);
        if (!textValue) continue;

        // Calculate x position based on alignment
        let drawX = x;
        if (align === 'center') {
          const textWidth = font.widthOfTextAtSize(textValue, fontSize);
          drawX = x + (width - textWidth) / 2;
        } else if (align === 'right') {
          const textWidth = font.widthOfTextAtSize(textValue, fontSize);
          drawX = x + width - textWidth;
        }

        // Truncate if text exceeds width
        let displayText = textValue;
        while (font.widthOfTextAtSize(displayText, fontSize) > width && displayText.length > 3) {
          displayText = displayText.slice(0, -1);
        }
        if (displayText !== textValue && displayText.length > 3) {
          displayText = displayText.slice(0, -3) + '...';
        }

        page.drawText(displayText, {
          x: drawX,
          y,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
        stamped++;
      }
    } catch (fieldErr) {
      log.warn({ field: field.fieldName, err: fieldErr.message }, '[PdfStamper] Failed to stamp field');
    }
  }

  log.info({ stamped, total: fields.length }, '[PdfStamper] Section stamped');

  return Buffer.from(await pdfDoc.save());
}

/**
 * Stamp FDA grid checkboxes onto the FDA pages.
 *
 * @param {Buffer} pdfBuffer - The PDF buffer containing the FDA pages
 * @param {Object} fdaGrid - From UtilityAsBuiltConfig.fdaGrid
 * @param {Array} fdaSelections - Foreman's selections from FDAAttributeForm:
 *   [{ category, condition, action, isNew, priority, complete }]
 * @returns {Promise<Buffer>} The stamped PDF buffer
 */
async function stampFdaGrid(pdfBuffer, fdaGrid, fdaSelections = []) {
  if (!pdfBuffer || !fdaGrid || !fdaSelections.length) return pdfBuffer;

  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();
  const checkSize = fdaGrid.checkboxSize || 8;

  let checked = 0;

  for (const selection of fdaSelections) {
    const { category, condition, action, isNew, complete } = selection;

    // Find the matching row
    const row = fdaGrid.rows.find(
      r => r.category === category && r.condition === condition
    );
    if (!row) {
      log.warn({ category, condition }, '[PdfStamper:FDA] No matching row in grid');
      continue;
    }

    // Find the action column
    const actionCol = fdaGrid.actionColumns.find(c => c.columnName === action);
    if (!actionCol) {
      log.warn({ action }, '[PdfStamper:FDA] No matching action column');
      continue;
    }

    // Determine which page (relative to FDA start)
    const pageIdx = row.page || 0;
    if (pageIdx >= pages.length) continue;
    const page = pages[pageIdx];

    // Draw checkmark at the action column position
    page.drawText(CHECKMARK, {
      x: actionCol.x,
      y: row.y,
      size: checkSize + 2,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    checked++;

    // Draw status checkboxes (New, Priority, Comp)
    for (const statusCb of fdaGrid.statusCheckboxes || []) {
      let shouldCheck = false;
      if (statusCb.label === 'New' && isNew) shouldCheck = true;
      if (statusCb.label === 'Comp' && complete) shouldCheck = true;
      // Priority is pre-set by the utility — typically stamped from the tag's priority field
      if (statusCb.label === 'Priority' && selection.priority) shouldCheck = true;

      if (shouldCheck) {
        page.drawText(CHECKMARK, {
          x: statusCb.xOffset,
          y: row.y,
          size: checkSize + 2,
          font: boldFont,
          color: rgb(0, 0, 0),
        });
        checked++;
      }
    }
  }

  // Emergency causes
  if (fdaGrid.emergencyCauses?.length && fdaSelections.emergencyCause) {
    const cause = fdaGrid.emergencyCauses.find(c => c.label === fdaSelections.emergencyCause);
    if (cause) {
      const emergencyPage = pages[0]; // Emergency checkboxes are on the first FDA page
      emergencyPage.drawText(CHECKMARK, {
        x: cause.x,
        y: cause.y,
        size: checkSize + 2,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      checked++;
    }
  }

  log.info({ checked, selections: fdaSelections.length }, '[PdfStamper:FDA] Grid stamped');

  return Buffer.from(await pdfDoc.save());
}

/**
 * Extract specific pages from a PDF by their 0-based indexes.
 *
 * @param {Buffer} pdfBuffer - The full PDF buffer
 * @param {Array<number>} pageIndexes - 0-based page indexes to extract
 * @returns {Promise<Buffer>} New PDF containing only the specified pages
 */
async function extractPages(pdfBuffer, pageIndexes) {
  if (!pdfBuffer || !pageIndexes?.length) return pdfBuffer;

  const srcDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const newDoc = await PDFDocument.create();

  // Validate indexes
  const validIndexes = pageIndexes.filter(i => i >= 0 && i < srcDoc.getPageCount());
  if (validIndexes.length === 0) return pdfBuffer;

  const copiedPages = await newDoc.copyPages(srcDoc, validIndexes);
  for (const page of copiedPages) {
    newDoc.addPage(page);
  }

  return Buffer.from(await newDoc.save());
}

module.exports = {
  stampSection,
  stampFdaGrid,
  extractPages,
  resolveValue,
};
