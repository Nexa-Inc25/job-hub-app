/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
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

/**
 * Generate a tailboard/JHA PDF document
 * 
 * @param {Object} tailboard - Tailboard document data
 * @param {Object} options - PDF generation options
 * @returns {Promise<Buffer>} Generated PDF buffer
 */
async function generateTailboardPdf(tailboard, options = {}) {
  const { rgb, StandardFonts } = require('pdf-lib');
  
  const pdfDoc = await PDFDocument.create();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  // Create first page
  let page = pdfDoc.addPage([612, 792]); // Letter size
  const { width, height } = page.getSize();
  
  let yPos = height - 50;
  const leftMargin = 50;
  const rightMargin = width - 50;
  const contentWidth = rightMargin - leftMargin;
  
  // Helper function to add text
  const drawText = (text, x, y, options = {}) => {
    page.drawText(text, {
      x,
      y,
      size: options.size || 10,
      font: options.bold ? helveticaBold : helvetica,
      color: options.color || rgb(0, 0, 0)
    });
  };
  
  // Helper to draw a line
  const drawLine = (x1, y1, x2, y2) => {
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7)
    });
  };
  
  // Helper to check if we need a new page
  const checkNewPage = (needed = 100) => {
    if (yPos < needed) {
      page = pdfDoc.addPage([612, 792]);
      yPos = height - 50;
    }
  };
  
  // === HEADER ===
  drawText('DAILY TAILBOARD / JHA', leftMargin, yPos, { size: 18, bold: true });
  yPos -= 25;
  
  // Date and WO info
  const dateStr = new Date(tailboard.date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  drawText(`Date: ${dateStr}`, leftMargin, yPos, { size: 11 });
  drawText(`Time: ${tailboard.startTime || 'N/A'}`, leftMargin + 300, yPos, { size: 11 });
  yPos -= 15;
  
  // WO# and PM#
  drawText(`WO#: ${tailboard.woNumber || 'N/A'}`, leftMargin, yPos, { size: 11 });
  if (tailboard.pmNumber) {
    drawText(`PM#: ${tailboard.pmNumber}`, leftMargin + 200, yPos, { size: 11 });
  }
  if (tailboard.circuit) {
    drawText(`Circuit: ${tailboard.circuit}`, leftMargin + 350, yPos, { size: 11 });
  }
  yPos -= 15;
  
  drawText(`Location: ${tailboard.jobLocation || tailboard.jobAddress || 'N/A'}`, leftMargin, yPos, { size: 11 });
  yPos -= 15;
  
  drawText(`Foreman: ${tailboard.foremanName || 'N/A'}`, leftMargin, yPos, { size: 11 });
  if (tailboard.generalForemanName) {
    drawText(`General Foreman: ${tailboard.generalForemanName}`, leftMargin + 250, yPos, { size: 11 });
  }
  yPos -= 15;
  
  // EIC info
  if (tailboard.eicName) {
    drawText(`EIC: ${tailboard.eicName}`, leftMargin, yPos, { size: 11 });
    if (tailboard.eicPhone) {
      drawText(`Phone: ${tailboard.eicPhone}`, leftMargin + 200, yPos, { size: 11 });
    }
    yPos -= 15;
  }
  
  if (tailboard.weatherConditions) {
    drawText(`Weather: ${tailboard.weatherConditions}`, leftMargin, yPos, { size: 11 });
    yPos -= 15;
  }
  
  drawLine(leftMargin, yPos, rightMargin, yPos);
  yPos -= 20;
  
  // Helper function to wrap and draw text
  const drawWrappedText = (text, startY) => {
    const textWords = (text || '').split(' ');
    let textLine = '';
    let currentY = startY;
    
    for (const word of textWords) {
      const testLine = textLine + (textLine ? ' ' : '') + word;
      const testWidth = helvetica.widthOfTextAtSize(testLine, 10);
      
      if (testWidth > contentWidth && textLine) {
        drawText(textLine, leftMargin, currentY);
        currentY -= 12;
        textLine = word;
        checkNewPage();
      } else {
        textLine = testLine;
      }
    }
    if (textLine) {
      drawText(textLine, leftMargin, currentY);
      currentY -= 12;
    }
    return currentY;
  };

  // === JOB STEPS / WORK DESCRIPTION ===
  drawText('SUMMARY OF WORK - JOB STEPS', leftMargin, yPos, { size: 12, bold: true });
  yPos -= 15;
  
  const jobStepsText = tailboard.jobSteps || tailboard.taskDescription || 'No description provided';
  yPos = drawWrappedText(jobStepsText, yPos);
  yPos -= 10;
  
  // === HAZARDS DESCRIPTION ===
  if (tailboard.hazardsDescription) {
    checkNewPage(60);
    drawText('HAZARDS ASSOCIATED WITH WORK', leftMargin, yPos, { size: 12, bold: true });
    yPos -= 15;
    yPos = drawWrappedText(tailboard.hazardsDescription, yPos);
    yPos -= 10;
  }
  
  // === MITIGATION DESCRIPTION ===
  if (tailboard.mitigationDescription) {
    checkNewPage(60);
    drawText('MITIGATION MEASURES', leftMargin, yPos, { size: 12, bold: true });
    yPos -= 15;
    yPos = drawWrappedText(tailboard.mitigationDescription, yPos);
    yPos -= 10;
  }
  
  drawLine(leftMargin, yPos, rightMargin, yPos);
  yPos -= 20;
  
  // === HAZARD ANALYSIS ===
  drawText('HAZARD ANALYSIS', leftMargin, yPos, { size: 12, bold: true });
  yPos -= 20;
  
  // Hazard category labels
  const hazardLabels = {
    electrical: 'Electrical',
    fall: 'Fall Protection',
    traffic: 'Traffic Control',
    excavation: 'Excavation',
    overhead: 'Overhead Work',
    rigging: 'Rigging',
    environmental: 'Environmental',
    confined_space: 'Confined Space',
    chemical: 'Chemical/Materials',
    ergonomic: 'Ergonomic',
    backing: 'Backing/Vehicles',
    third_party: '3rd Party Contractors',
    other: 'Other'
  };
  
  if (tailboard.hazards && tailboard.hazards.length > 0) {
    for (const hazard of tailboard.hazards) {
      checkNewPage(80);
      
      const categoryLabel = hazardLabels[hazard.category] || hazard.category;
      const riskColor = hazard.riskLevel === 'high' ? rgb(0.8, 0, 0) : 
                        hazard.riskLevel === 'medium' ? rgb(0.8, 0.5, 0) : 
                        rgb(0, 0.6, 0);
      
      drawText(`[${hazard.riskLevel?.toUpperCase() || 'MEDIUM'}]`, leftMargin, yPos, { size: 9, color: riskColor, bold: true });
      drawText(`${categoryLabel}: ${hazard.description}`, leftMargin + 60, yPos, { size: 10, bold: true });
      yPos -= 15;
      
      // Controls
      if (hazard.controls && hazard.controls.length > 0) {
        drawText('Controls:', leftMargin + 20, yPos, { size: 9, color: rgb(0.3, 0.3, 0.3) });
        yPos -= 12;
        
        for (const control of hazard.controls) {
          checkNewPage(20);
          drawText(`• ${control}`, leftMargin + 30, yPos, { size: 9 });
          yPos -= 12;
        }
      }
      yPos -= 5;
    }
  } else {
    drawText('No hazards identified', leftMargin, yPos, { size: 10, color: rgb(0.5, 0.5, 0.5) });
    yPos -= 15;
  }
  
  yPos -= 10;
  drawLine(leftMargin, yPos, rightMargin, yPos);
  yPos -= 20;
  
  // === PPE REQUIREMENTS ===
  checkNewPage(100);
  drawText('PPE REQUIREMENTS', leftMargin, yPos, { size: 12, bold: true });
  yPos -= 15;
  
  if (tailboard.ppeRequired && tailboard.ppeRequired.length > 0) {
    const checkedPPE = tailboard.ppeRequired.filter(p => p.checked);
    
    if (checkedPPE.length > 0) {
      let ppeX = leftMargin;
      let ppeCount = 0;
      
      for (const ppe of checkedPPE) {
        if (ppeCount > 0 && ppeCount % 3 === 0) {
          yPos -= 15;
          ppeX = leftMargin;
          checkNewPage(20);
        }
        
        drawText(`☑ ${ppe.item}`, ppeX, yPos, { size: 9 });
        ppeX += 170;
        ppeCount++;
      }
      yPos -= 20;
    } else {
      drawText('No PPE selected', leftMargin, yPos, { size: 10, color: rgb(0.5, 0.5, 0.5) });
      yPos -= 15;
    }
  }
  
  yPos -= 10;
  drawLine(leftMargin, yPos, rightMargin, yPos);
  yPos -= 20;
  
  // === SPECIAL MITIGATION MEASURES ===
  if (tailboard.specialMitigations && tailboard.specialMitigations.length > 0) {
    const answeredMitigations = tailboard.specialMitigations.filter(m => m.value);
    if (answeredMitigations.length > 0) {
      checkNewPage(100);
      drawText('SPECIAL MITIGATION MEASURES', leftMargin, yPos, { size: 12, bold: true });
      yPos -= 15;
      
      const mitigationLabels = {
        liveLineWork: 'Live-Line Work',
        rubberGloving: 'Rubber Gloving',
        backfeedDiscussed: 'Back-feed Discussed',
        groundingPerTitle8: 'Grounding per Title 8 §2941',
        madDiscussed: 'MAD Discussed',
        ppeDiscussed: 'PPE Discussed',
        publicPedestrianSafety: 'Public/Pedestrian Safety',
        rotationDiscussed: 'Rotation Discussed',
        phaseMarkingDiscussed: 'Phase Marking Discussed',
        voltageTesting: 'Voltage Testing',
        switchLog: 'Switch Log',
        dielectricInspection: 'Di-Electric Inspection',
        adequateCover: 'Adequate Cover'
      };
      
      let mitX = leftMargin;
      let mitCount = 0;
      
      for (const mit of answeredMitigations) {
        if (mitCount > 0 && mitCount % 2 === 0) {
          yPos -= 15;
          mitX = leftMargin;
          checkNewPage(20);
        }
        
        const label = mitigationLabels[mit.item] || mit.item;
        const valueStr = mit.value === 'yes' ? '✓ Yes' : mit.value === 'no' ? '✗ No' : 'N/A';
        const color = mit.value === 'yes' ? rgb(0, 0.5, 0) : mit.value === 'no' ? rgb(0.8, 0, 0) : rgb(0.5, 0.5, 0.5);
        
        drawText(`${label}: `, mitX, yPos, { size: 9 });
        drawText(valueStr, mitX + 150, yPos, { size: 9, color });
        mitX += 250;
        mitCount++;
      }
      yPos -= 20;
      drawLine(leftMargin, yPos, rightMargin, yPos);
      yPos -= 20;
    }
  }
  
  // === GROUNDING INFORMATION ===
  if (tailboard.grounding && tailboard.grounding.needed) {
    checkNewPage(80);
    drawText('GROUNDING (Per Title 8, §2941)', leftMargin, yPos, { size: 12, bold: true });
    yPos -= 15;
    
    const groundNeededStr = tailboard.grounding.needed === 'yes' ? 'Yes' : 'No';
    drawText(`Grounding Needed: ${groundNeededStr}`, leftMargin, yPos, { size: 10 });
    
    if (tailboard.grounding.accountedFor) {
      const accountedStr = tailboard.grounding.accountedFor === 'yes' ? 'Yes' : 'No';
      drawText(`Accounted by Foreman: ${accountedStr}`, leftMargin + 200, yPos, { size: 10 });
    }
    yPos -= 15;
    
    if (tailboard.grounding.locations && tailboard.grounding.locations.length > 0) {
      drawText('Grounding Locations:', leftMargin, yPos, { size: 9, bold: true });
      yPos -= 12;
      for (const loc of tailboard.grounding.locations) {
        checkNewPage(15);
        const status = [];
        if (loc.installed) status.push('Installed');
        if (loc.removed) status.push('Removed');
        drawText(`• ${loc.location} ${status.length ? `(${status.join(', ')})` : ''}`, leftMargin + 10, yPos, { size: 9 });
        yPos -= 12;
      }
    }
    yPos -= 10;
    drawLine(leftMargin, yPos, rightMargin, yPos);
    yPos -= 20;
  }
  
  // === EMERGENCY INFORMATION ===
  checkNewPage(60);
  drawText('EMERGENCY INFORMATION', leftMargin, yPos, { size: 12, bold: true });
  yPos -= 15;
  
  drawText(`Emergency Contact: ${tailboard.emergencyContact || '911'}`, leftMargin, yPos, { size: 10 });
  yPos -= 12;
  
  if (tailboard.nearestHospital) {
    drawText(`Nearest Hospital: ${tailboard.nearestHospital}`, leftMargin, yPos, { size: 10 });
    yPos -= 12;
  }
  
  yPos -= 10;
  drawLine(leftMargin, yPos, rightMargin, yPos);
  yPos -= 20;
  
  // === UG WORK CHECKLIST ===
  if (tailboard.ugChecklist && tailboard.ugChecklist.length > 0) {
    const answeredItems = tailboard.ugChecklist.filter(c => c.value);
    if (answeredItems.length > 0) {
      checkNewPage(150);
      drawText('UG WORK COMPLETED CHECKLIST', leftMargin, yPos, { size: 12, bold: true });
      yPos -= 15;
      
      const ugLabels = {
        elbowsSeated: 'Elbows Fully Seated',
        deadbreakBails: '200A Deadbreak Bails On',
        groundsMadeUp: 'Grounds Made Up',
        bleedersInstalled: 'Bleeders Installed',
        tagsInstalledNewWork: 'Tags Installed on New Work',
        tagsUpdatedAdjacent: 'Tags Updated on Adjacent Equipment',
        voltagePhaseTagsApplied: 'Voltage & Phase Tags Applied',
        primaryNeutralIdentified: 'Primary Neutral Identified',
        spareDuctsPlugged: 'Spare Ducts Plugged',
        equipmentNumbersInstalled: 'Equipment Numbers Installed',
        lidsFramesBonded: 'Lids/Frames Bonded',
        allBoltsInstalled: 'All Bolts Installed',
        equipmentBoltedDown: 'Equipment Bolted Down'
      };
      
      for (const item of answeredItems) {
        checkNewPage(15);
        const label = ugLabels[item.item] || item.item;
        let valueStr, color;
        if (item.value === 'yes') {
          valueStr = '✓ Yes';
          color = rgb(0, 0.5, 0);
        } else if (item.value === 'no') {
          valueStr = '✗ No';
          color = rgb(0.8, 0, 0);
        } else {
          valueStr = 'N/A';
          color = rgb(0.5, 0.5, 0.5);
        }
        
        drawText(`${label}: `, leftMargin, yPos, { size: 9 });
        drawText(valueStr, leftMargin + 200, yPos, { size: 9, color });
        yPos -= 12;
      }
      yPos -= 10;
      drawLine(leftMargin, yPos, rightMargin, yPos);
      yPos -= 20;
    }
  }
  
  // === CREW ACKNOWLEDGMENT ===
  checkNewPage(150);
  drawText('CREW ACKNOWLEDGMENT', leftMargin, yPos, { size: 12, bold: true });
  yPos -= 5;
  drawText('By signing below, each crew member acknowledges participation in this tailboard meeting', leftMargin, yPos, { size: 8, color: rgb(0.4, 0.4, 0.4) });
  yPos -= 5;
  drawText('and understanding of the identified hazards and required controls.', leftMargin, yPos, { size: 8, color: rgb(0.4, 0.4, 0.4) });
  yPos -= 20;
  
  if (tailboard.crewMembers && tailboard.crewMembers.length > 0) {
    // Table header
    drawText('Name', leftMargin, yPos, { size: 9, bold: true });
    drawText('Role', leftMargin + 150, yPos, { size: 9, bold: true });
    drawText('Signature', leftMargin + 250, yPos, { size: 9, bold: true });
    drawText('Time', leftMargin + 420, yPos, { size: 9, bold: true });
    yPos -= 5;
    drawLine(leftMargin, yPos, rightMargin, yPos);
    yPos -= 15;
    
    for (const member of tailboard.crewMembers) {
      checkNewPage(50);
      
      drawText(member.name || 'Unknown', leftMargin, yPos, { size: 10 });
      drawText(member.role || 'Crew', leftMargin + 150, yPos, { size: 10 });
      
      // Signature placeholder or indicator
      if (member.signatureData) {
        drawText('[Signed]', leftMargin + 250, yPos, { size: 10, color: rgb(0, 0.5, 0) });
        
        // Embed signature image if possible
        try {
          if (member.signatureData.startsWith('data:image/png')) {
            const base64Data = member.signatureData.split(',')[1];
            const sigImage = await pdfDoc.embedPng(Buffer.from(base64Data, 'base64'));
            const sigDims = sigImage.scale(0.3);
            page.drawImage(sigImage, {
              x: leftMargin + 300,
              y: yPos - 10,
              width: Math.min(sigDims.width, 100),
              height: Math.min(sigDims.height, 25)
            });
          }
        } catch {
          // If embedding fails, just show [Signed]
        }
      } else {
        drawText('________________', leftMargin + 250, yPos, { size: 10 });
      }
      
      const signedTime = member.signedAt ? 
        new Date(member.signedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 
        'N/A';
      drawText(signedTime, leftMargin + 420, yPos, { size: 10 });
      
      yPos -= 35;
    }
  } else {
    drawText('No crew signatures recorded', leftMargin, yPos, { size: 10, color: rgb(0.5, 0.5, 0.5) });
    yPos -= 15;
  }
  
  // === FOOTER ===
  const footerY = 30;
  drawText(`Generated: ${new Date().toLocaleString()}`, leftMargin, footerY, { size: 8, color: rgb(0.5, 0.5, 0.5) });
  drawText('FieldLedger - Tailboard/JHA', rightMargin - 120, footerY, { size: 8, color: rgb(0.5, 0.5, 0.5) });
  
  return Buffer.from(await pdfDoc.save());
}

module.exports = {
  loadPdf,
  getPdfInfo,
  mergePdfs,
  extractPages,
  addTextAnnotation,
  applyAnnotations,
  generateTailboardPdf
};

