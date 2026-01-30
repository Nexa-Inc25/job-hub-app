/**
 * PDF Processing Service
 * 
 * Handles all PDF-related operations including:
 * - Document parsing and text extraction
 * - Form filling and annotations
 * - Image extraction from PDFs
 * - PDF merging and splitting
 * 
 * @module services/pdf
 */

const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

/**
 * Load a PDF document from buffer or file path
 * 
 * @param {Buffer|string} source - PDF buffer or file path
 * @returns {Promise<PDFDocument>} Loaded PDF document
 */
async function loadPdf(source) {
  let pdfBytes;
  
  if (Buffer.isBuffer(source)) {
    pdfBytes = source;
  } else if (typeof source === 'string') {
    pdfBytes = fs.readFileSync(source);
  } else {
    throw new Error('Invalid source: must be Buffer or file path');
  }
  
  return PDFDocument.load(pdfBytes, { ignoreEncryption: true });
}

/**
 * Get PDF metadata and page information
 * 
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @returns {Promise<Object>} PDF metadata
 */
async function getPdfInfo(pdfBuffer) {
  const pdfDoc = await loadPdf(pdfBuffer);
  
  return {
    pageCount: pdfDoc.getPageCount(),
    title: pdfDoc.getTitle() || null,
    author: pdfDoc.getAuthor() || null,
    subject: pdfDoc.getSubject() || null,
    creator: pdfDoc.getCreator() || null,
    creationDate: pdfDoc.getCreationDate() || null,
    modificationDate: pdfDoc.getModificationDate() || null
  };
}

/**
 * Merge multiple PDFs into one
 * 
 * @param {Buffer[]} pdfBuffers - Array of PDF buffers to merge
 * @returns {Promise<Buffer>} Merged PDF buffer
 */
async function mergePdfs(pdfBuffers) {
  const mergedPdf = await PDFDocument.create();
  
  for (const buffer of pdfBuffers) {
    const pdf = await loadPdf(buffer);
    const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    pages.forEach(page => mergedPdf.addPage(page));
  }
  
  return Buffer.from(await mergedPdf.save());
}

/**
 * Extract specific pages from a PDF
 * 
 * @param {Buffer} pdfBuffer - Source PDF buffer
 * @param {number[]} pageNumbers - Array of page numbers to extract (1-indexed)
 * @returns {Promise<Buffer>} New PDF with extracted pages
 */
async function extractPages(pdfBuffer, pageNumbers) {
  const sourcePdf = await loadPdf(pdfBuffer);
  const newPdf = await PDFDocument.create();
  
  // Convert to 0-indexed
  const indices = pageNumbers.map(n => n - 1);
  const pages = await newPdf.copyPages(sourcePdf, indices);
  
  pages.forEach(page => newPdf.addPage(page));
  
  return Buffer.from(await newPdf.save());
}

/**
 * Add text annotation to PDF
 * 
 * @param {Buffer} pdfBuffer - PDF buffer
 * @param {Object} annotation - Annotation details
 * @param {number} annotation.page - Page number (1-indexed)
 * @param {number} annotation.x - X position
 * @param {number} annotation.y - Y position
 * @param {string} annotation.text - Text to add
 * @param {number} annotation.fontSize - Font size
 * @param {Object} annotation.color - RGB color object
 * @returns {Promise<Buffer>} Modified PDF buffer
 */
async function addTextAnnotation(pdfBuffer, annotation) {
  const pdfDoc = await loadPdf(pdfBuffer);
  const page = pdfDoc.getPage(annotation.page - 1);
  
  const { rgb } = require('pdf-lib');
  
  page.drawText(annotation.text, {
    x: annotation.x,
    y: annotation.y,
    size: annotation.fontSize || 12,
    color: rgb(
      (annotation.color?.r || 0) / 255,
      (annotation.color?.g || 0) / 255,
      (annotation.color?.b || 0) / 255
    )
  });
  
  return Buffer.from(await pdfDoc.save());
}

/**
 * Apply multiple annotations to PDF
 * 
 * @param {Buffer} pdfBuffer - PDF buffer
 * @param {Object[]} annotations - Array of annotations
 * @returns {Promise<Buffer>} Modified PDF buffer
 */
async function applyAnnotations(pdfBuffer, annotations) {
  let currentBuffer = pdfBuffer;
  
  for (const annotation of annotations) {
    if (annotation.type === 'text' || annotation.type === 'check') {
      currentBuffer = await addTextAnnotation(currentBuffer, {
        ...annotation,
        text: annotation.type === 'check' ? '✓' : annotation.text
      });
    }
    // Add more annotation types as needed
  }
  
  return currentBuffer;
}

module.exports = {
  loadPdf,
  getPdfInfo,
  mergePdfs,
  extractPages,
  addTextAnnotation,
  applyAnnotations
};

