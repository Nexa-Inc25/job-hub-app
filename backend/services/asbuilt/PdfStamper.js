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

/**
 * Draw a checkmark at (x, y) using path lines.
 * pdf-lib standard fonts can't encode Unicode checkmarks,
 * so we draw two lines forming a "✓" shape.
 */
function drawCheckmark(page, x, y, size = 10) {
  const s = size * 0.8;
  // Short descending stroke (bottom-left to bottom of check)
  page.drawLine({
    start: { x, y: y + s * 0.5 },
    end: { x: x + s * 0.3, y },
    thickness: 1.5,
    color: rgb(0, 0, 0),
  });
  // Long ascending stroke (bottom of check to top-right)
  page.drawLine({
    start: { x: x + s * 0.3, y },
    end: { x: x + s, y: y + s },
    thickness: 1.5,
    color: rgb(0, 0, 0),
  });
}

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
  const pages = pdfDoc.getPages();

  const { manualValues = {} } = context;

  let stamped = 0;

  for (const field of fields) {
    if (!field.position) continue;

    const { pageOffset = 0, x, y, width = 200, height = 14, fontSize = 10, align = 'left' } = field.position;

    // Get the target page — skip if offset exceeds available pages
    if (pageOffset < 0 || pageOffset >= pages.length) {
      log.warn({ field: field.fieldName, pageOffset, pageCount: pages.length },
        '[PdfStamper] pageOffset exceeds section page count, skipping field');
      continue;
    }
    const page = pages[pageOffset];

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
          drawCheckmark(page, x, y, fontSize);
          stamped++;
        }
      } else if (field.type === 'select' && field.optionPositions) {
        // Select fields with optionPositions: draw checkmark at the selected option's position
        const textValue = String(value);
        const optPos = field.optionPositions[textValue];
        if (optPos) {
          drawCheckmark(page, optPos.x, optPos.y, fontSize);
          stamped++;
        } else {
          // Fallback: write text at default position
          page.drawText(textValue, { x, y, size: fontSize, font, color: rgb(0, 0, 0) });
          stamped++;
        }
      } else if (field.type === 'signature') {
        // Embed signature image (base64 PNG)
        if (typeof value === 'string' && value.length > 100) {
          try {
            const base64Data = value.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
            const sigBytes = Buffer.from(base64Data, 'base64');

            let sigImage;
            if (value.includes('image/png') || base64Data.startsWith('iVBOR')) {
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
 * @param {string} [emergencyCause] - Selected emergency cause label (if any)
 * @returns {Promise<Buffer>} The stamped PDF buffer
 */
async function stampFdaGrid(pdfBuffer, fdaGrid, fdaSelections = [], emergencyCause = null) {
  if (!pdfBuffer || !fdaGrid || !fdaSelections.length) return pdfBuffer;

  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const checkSize = fdaGrid.checkboxSize || 8;

  // Support both legacy (actionColumns) and new (columns) format
  const useColumnLayout = Array.isArray(fdaGrid.columns);

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

    // Determine which page (relative to FDA start)
    const pageIdx = row.page || 0;
    if (pageIdx >= pages.length) continue;
    const page = pages[pageIdx];

    if (useColumnLayout) {
      // New column-based layout: each row has a `column` index (0-3)
      const colIdx = row.column || 0;
      const col = fdaGrid.columns[colIdx];
      if (!col) {
        log.warn({ colIdx, category }, '[PdfStamper:FDA] Invalid column index');
        continue;
      }

      // Draw checkmark at the column's action x position
      drawCheckmark(page, col.actionX, row.y, checkSize);
      checked++;

      // Draw status checkboxes using column-specific x positions
      if (isNew && col.newX) {
        drawCheckmark(page, col.newX, row.y, checkSize);
        checked++;
      }
      if (selection.priority && col.priorityX) {
        drawCheckmark(page, col.priorityX, row.y, checkSize);
        checked++;
      }
      if (complete && col.compX) {
        drawCheckmark(page, col.compX, row.y, checkSize);
        checked++;
      }
    } else {
      // Legacy format: actionColumns + statusCheckboxes
      const actionCol = (fdaGrid.actionColumns || []).find(c => c.columnName === action);
      if (!actionCol) {
        log.warn({ action }, '[PdfStamper:FDA] No matching action column');
        continue;
      }

      drawCheckmark(page, actionCol.x, row.y, checkSize);
      checked++;

      for (const statusCb of fdaGrid.statusCheckboxes || []) {
        let shouldCheck = false;
        if (statusCb.label === 'New' && isNew) shouldCheck = true;
        if (statusCb.label === 'Comp' && complete) shouldCheck = true;
        if (statusCb.label === 'Priority' && selection.priority) shouldCheck = true;

        if (shouldCheck) {
          drawCheckmark(page, statusCb.xOffset, row.y, checkSize);
          checked++;
        }
      }
    }
  }

  // Emergency causes — passed as a separate parameter (not part of the selections array)
  if (fdaGrid.emergencyCauses?.length && emergencyCause) {
    const cause = fdaGrid.emergencyCauses.find(c => c.label === emergencyCause);
    if (cause) {
      const emergencyPage = pages[0];
      drawCheckmark(emergencyPage, cause.x, cause.y, checkSize);
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

/**
 * Generate a calibration proof PDF.
 *
 * Stamps every configured field position with a colored rectangle + label
 * so a human can visually verify alignment against the real document.
 *
 * @param {Buffer} pdfBuffer - The section's extracted PDF pages
 * @param {Array} fields - From documentCompletions[].fields
 * @param {string} sectionLabel - For labeling (e.g. "EC Tag Completion")
 * @returns {Promise<Buffer>} PDF with proof marks drawn
 */
async function generateCalibrationProof(pdfBuffer, fields, sectionLabel = '') {
  if (!pdfBuffer || !fields?.length) return pdfBuffer;

  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();

  const colors = [
    rgb(1, 0, 0),       // red
    rgb(0, 0, 1),       // blue
    rgb(0, 0.6, 0),     // green
    rgb(0.8, 0, 0.8),   // purple
    rgb(1, 0.5, 0),     // orange
    rgb(0, 0.7, 0.7),   // teal
  ];

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (!field.position) continue;

    const { pageOffset = 0, x, y, width = 200, height = 14, fontSize = 10 } = field.position;
    if (pageOffset < 0 || pageOffset >= pages.length) continue;

    const page = pages[pageOffset];
    const color = colors[i % colors.length];
    const h = field.type === 'signature' ? (height || 25) : Math.max(fontSize + 4, height || 14);
    const w = width || 200;

    // Draw translucent filled rectangle
    page.drawRectangle({
      x, y: y - 2, width: w, height: h,
      color: rgb(color.red, color.green, color.blue),
      opacity: 0.15,
      borderColor: color,
      borderWidth: 1.5,
    });

    // Label above the rectangle
    const labelText = `[${i + 1}] ${field.fieldName}`;
    const labelSize = 6;
    page.drawText(labelText, {
      x, y: y + h + 1,
      size: labelSize, font: boldFont, color,
    });

    // Stamp test value inside
    let testValue = '';
    if (field.type === 'checkbox') testValue = '✓';
    else if (field.type === 'signature') testValue = '[SIG]';
    else if (field.type === 'date') testValue = '02/14/2026';
    else if (field.type === 'number') testValue = '8.5';
    else if (field.type === 'select') testValue = field.options?.[0] || 'SELECT';
    else testValue = field.label || field.fieldName;

    if (field.type !== 'checkbox') {
      page.drawText(String(testValue), {
        x: x + 2, y: y + 2,
        size: Math.min(fontSize, 9), font, color,
      });
    }

    // For select fields with optionPositions, mark each option
    if (field.optionPositions) {
      for (const [optLabel, optPos] of Object.entries(field.optionPositions)) {
        page.drawRectangle({
          x: optPos.x, y: optPos.y - 2, width: 10, height: 12,
          borderColor: color, borderWidth: 1, opacity: 0,
        });
        page.drawText(optLabel.substring(0, 12), {
          x: optPos.x, y: optPos.y + 11,
          size: 5, font, color,
        });
      }
    }
  }

  // Add legend on first page
  if (pages.length > 0) {
    const legendPage = pages[0];
    const legendY = 20;
    legendPage.drawRectangle({
      x: 5, y: legendY - 5, width: 300, height: 16,
      color: rgb(1, 1, 1), opacity: 0.85,
    });
    legendPage.drawText(
      `CALIBRATION PROOF: ${sectionLabel} — ${fields.length} fields`,
      { x: 8, y: legendY, size: 7, font: boldFont, color: rgb(0.8, 0, 0) }
    );
  }

  return Buffer.from(await pdfDoc.save());
}

/**
 * Generate an FDA grid calibration proof.
 * Draws small marks at every row + column position in the grid.
 *
 * @param {Buffer} pdfBuffer - FDA section pages
 * @param {Object} fdaGrid - From UtilityAsBuiltConfig.fdaGrid
 * @returns {Promise<Buffer>} PDF with grid marks drawn
 */
async function generateFdaCalibrationProof(pdfBuffer, fdaGrid) {
  if (!pdfBuffer || !fdaGrid) return pdfBuffer;

  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  const checkSize = fdaGrid.checkboxSize || 8;

  const actionColor = rgb(1, 0, 0);
  const newColor = rgb(0, 0, 1);
  const compColor = rgb(0, 0.6, 0);
  const catColor = rgb(0.5, 0, 0.5);

  for (const row of fdaGrid.rows || []) {
    const pageIdx = row.page || 0;
    if (pageIdx >= pages.length) continue;
    const page = pages[pageIdx];

    const colIdx = row.column || 0;
    const col = fdaGrid.columns?.[colIdx];
    if (!col) continue;

    // Action position
    page.drawRectangle({
      x: col.actionX, y: row.y - 2, width: checkSize, height: checkSize,
      borderColor: actionColor, borderWidth: 0.75, opacity: 0,
    });

    // New/Priority/Comp positions
    if (col.newX) {
      page.drawRectangle({
        x: col.newX, y: row.y - 2, width: checkSize, height: checkSize,
        borderColor: newColor, borderWidth: 0.5, opacity: 0,
      });
    }
    if (col.compX) {
      page.drawRectangle({
        x: col.compX, y: row.y - 2, width: checkSize, height: checkSize,
        borderColor: compColor, borderWidth: 0.5, opacity: 0,
      });
    }

    // Category label (tiny, to the left)
    const catLabel = `${row.category}/${row.condition}`.substring(0, 25);
    page.drawText(catLabel, {
      x: Math.max(2, col.actionX - 90), y: row.y,
      size: 3.5, font, color: catColor,
    });
  }

  // Emergency causes
  if (fdaGrid.emergencyCauses?.length && pages.length > 0) {
    const ePage = pages[0];
    for (const cause of fdaGrid.emergencyCauses) {
      ePage.drawRectangle({
        x: cause.x, y: cause.y - 2, width: 8, height: 10,
        borderColor: rgb(1, 0.5, 0), borderWidth: 0.75, opacity: 0,
      });
      ePage.drawText(cause.label, {
        x: cause.x + 10, y: cause.y, size: 4, font, color: rgb(1, 0.5, 0),
      });
    }
  }

  return Buffer.from(await pdfDoc.save());
}

module.exports = {
  stampSection,
  stampFdaGrid,
  extractPages,
  resolveValue,
  generateCalibrationProof,
  generateFdaCalibrationProof,
};
