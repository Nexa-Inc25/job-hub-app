/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Generate a Bid Sheet PDF template with job info pre-filled
 */
async function generateBidSheet(jobData) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Letter size
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  const { woNumber, pmNumber, notificationNumber, address, city, client, projectName } = jobData;
  
  // Header
  page.drawText('BID SHEET', { x: 250, y: 750, size: 20, font: boldFont });
  page.drawText('General Foreman Pre-Field Document', { x: 200, y: 730, size: 12, font });
  
  // Line
  page.drawLine({ start: { x: 50, y: 715 }, end: { x: 562, y: 715 }, thickness: 1 });
  
  // Job Info Section (Pre-filled)
  let y = 690;
  const leftX = 60;
  const valueX = 200;
  
  page.drawText('JOB INFORMATION', { x: leftX, y, size: 14, font: boldFont });
  y -= 25;
  
  page.drawText('WO Number:', { x: leftX, y, size: 11, font: boldFont });
  page.drawText(woNumber || '________________', { x: valueX, y, size: 11, font });
  y -= 20;
  
  page.drawText('PM Number:', { x: leftX, y, size: 11, font: boldFont });
  page.drawText(pmNumber || '________________', { x: valueX, y, size: 11, font });
  y -= 20;
  
  page.drawText('Notification #:', { x: leftX, y, size: 11, font: boldFont });
  page.drawText(notificationNumber || '________________', { x: valueX, y, size: 11, font });
  y -= 20;
  
  page.drawText('Address:', { x: leftX, y, size: 11, font: boldFont });
  page.drawText(address || '________________', { x: valueX, y, size: 11, font });
  y -= 20;
  
  page.drawText('City:', { x: leftX, y, size: 11, font: boldFont });
  page.drawText(city || '________________', { x: valueX, y, size: 11, font });
  y -= 20;
  
  page.drawText('Client:', { x: leftX, y, size: 11, font: boldFont });
  page.drawText(client || '________________', { x: valueX, y, size: 11, font });
  y -= 20;
  
  page.drawText('Project:', { x: leftX, y, size: 11, font: boldFont });
  page.drawText(projectName || '________________', { x: valueX, y, size: 11, font });
  
  // Bid Section (To be filled by GF)
  y -= 40;
  page.drawLine({ start: { x: 50, y: y + 10 }, end: { x: 562, y: y + 10 }, thickness: 1 });
  
  page.drawText('BID DETAILS (To be completed by General Foreman)', { x: leftX, y, size: 14, font: boldFont });
  y -= 30;
  
  page.drawText('Estimated Labor Hours:', { x: leftX, y, size: 11, font });
  page.drawText('________________', { x: valueX + 50, y, size: 11, font });
  y -= 25;
  
  page.drawText('Crew Size Required:', { x: leftX, y, size: 11, font });
  page.drawText('________________', { x: valueX + 50, y, size: 11, font });
  y -= 25;
  
  page.drawText('Equipment Needed:', { x: leftX, y, size: 11, font });
  y -= 20;
  page.drawText('[ ] Bucket Truck   [ ] Digger   [ ] Crane   [ ] Other: ________', { x: leftX + 20, y, size: 10, font });
  y -= 25;
  
  page.drawText('Material Estimate:', { x: leftX, y, size: 11, font });
  page.drawText('$________________', { x: valueX + 50, y, size: 11, font });
  y -= 25;
  
  page.drawText('Labor Estimate:', { x: leftX, y, size: 11, font });
  page.drawText('$________________', { x: valueX + 50, y, size: 11, font });
  y -= 25;
  
  page.drawText('Total Bid Amount:', { x: leftX, y, size: 11, font: boldFont });
  page.drawText('$________________', { x: valueX + 50, y, size: 11, font: boldFont });
  
  // Notes Section
  y -= 40;
  page.drawLine({ start: { x: 50, y: y + 10 }, end: { x: 562, y: y + 10 }, thickness: 1 });
  
  page.drawText('NOTES / SPECIAL REQUIREMENTS:', { x: leftX, y, size: 14, font: boldFont });
  y -= 25;
  
  // Draw lines for notes
  for (let i = 0; i < 5; i++) {
    page.drawLine({ start: { x: leftX, y }, end: { x: 550, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
    y -= 25;
  }
  
  // Signature Section
  y -= 20;
  page.drawLine({ start: { x: 50, y: y + 10 }, end: { x: 562, y: y + 10 }, thickness: 1 });
  
  page.drawText('GF Signature: ________________________', { x: leftX, y, size: 11, font });
  page.drawText('Date: ____________', { x: 380, y, size: 11, font });
  
  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

/**
 * Generate a Crew Schedule template
 */
async function generateCrewSchedule(jobData) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  const { woNumber, pmNumber, address, city } = jobData;
  
  // Header
  page.drawText('CREW SCHEDULE', { x: 230, y: 750, size: 20, font: boldFont });
  page.drawText(`WO#: ${woNumber || 'N/A'} | PM#: ${pmNumber || 'N/A'}`, { x: 200, y: 730, size: 12, font });
  page.drawText(`Location: ${address || ''}, ${city || ''}`, { x: 150, y: 710, size: 11, font });
  
  page.drawLine({ start: { x: 50, y: 695 }, end: { x: 562, y: 695 }, thickness: 1 });
  
  let y = 670;
  
  // Crew Table Header
  page.drawText('CREW ASSIGNMENT', { x: 60, y, size: 14, font: boldFont });
  y -= 25;
  
  // Table headers
  page.drawText('Name', { x: 60, y, size: 10, font: boldFont });
  page.drawText('Role', { x: 180, y, size: 10, font: boldFont });
  page.drawText('Start Time', { x: 280, y, size: 10, font: boldFont });
  page.drawText('End Time', { x: 380, y, size: 10, font: boldFont });
  page.drawText('Notes', { x: 470, y, size: 10, font: boldFont });
  
  y -= 5;
  page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 0.5 });
  y -= 20;
  
  // Empty rows for crew members
  for (let i = 0; i < 10; i++) {
    page.drawText('________________', { x: 60, y, size: 10, font });
    page.drawText('____________', { x: 180, y, size: 10, font });
    page.drawText('__________', { x: 280, y, size: 10, font });
    page.drawText('__________', { x: 380, y, size: 10, font });
    page.drawText('________', { x: 470, y, size: 10, font });
    y -= 25;
  }
  
  // Schedule Section
  y -= 20;
  page.drawLine({ start: { x: 50, y: y + 10 }, end: { x: 562, y: y + 10 }, thickness: 1 });
  
  page.drawText('SCHEDULE DETAILS', { x: 60, y, size: 14, font: boldFont });
  y -= 25;
  
  page.drawText('Scheduled Date: ________________', { x: 60, y, size: 11, font });
  page.drawText('Report Time: ________________', { x: 320, y, size: 11, font });
  y -= 25;
  
  page.drawText('Estimated Duration: ________________ hours', { x: 60, y, size: 11, font });
  
  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

/**
 * Generate a Site Survey Form
 */
async function generateSiteSurvey(jobData) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  const { woNumber, pmNumber, address, city, client } = jobData;
  
  // Header
  page.drawText('SITE SURVEY FORM', { x: 220, y: 750, size: 20, font: boldFont });
  
  let y = 720;
  page.drawText(`WO#: ${woNumber || 'N/A'}`, { x: 60, y, size: 11, font });
  page.drawText(`PM#: ${pmNumber || 'N/A'}`, { x: 200, y, size: 11, font });
  page.drawText(`Client: ${client || 'N/A'}`, { x: 340, y, size: 11, font });
  y -= 20;
  page.drawText(`Address: ${address || ''}, ${city || ''}`, { x: 60, y, size: 11, font });
  
  page.drawLine({ start: { x: 50, y: y - 10 }, end: { x: 562, y: y - 10 }, thickness: 1 });
  y -= 35;
  
  // Site Conditions
  page.drawText('SITE CONDITIONS', { x: 60, y, size: 14, font: boldFont });
  y -= 25;
  
  const checkboxItems = [
    'Access: [ ] Easy  [ ] Moderate  [ ] Difficult',
    'Traffic Control Required: [ ] Yes  [ ] No',
    'Permits Required: [ ] Yes  [ ] No',
    'Underground Utilities Marked: [ ] Yes  [ ] No  [ ] N/A',
    'Overhead Hazards: [ ] Yes  [ ] No',
    'Customer Notification Required: [ ] Yes  [ ] No'
  ];
  
  for (const item of checkboxItems) {
    page.drawText(item, { x: 70, y, size: 10, font });
    y -= 22;
  }
  
  // Equipment Assessment
  y -= 15;
  page.drawLine({ start: { x: 50, y: y + 10 }, end: { x: 562, y: y + 10 }, thickness: 1 });
  page.drawText('EQUIPMENT ASSESSMENT', { x: 60, y, size: 14, font: boldFont });
  y -= 25;
  
  page.drawText('Equipment Condition:', { x: 60, y, size: 11, font });
  y -= 20;
  for (let i = 0; i < 3; i++) {
    page.drawLine({ start: { x: 70, y }, end: { x: 550, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
    y -= 20;
  }
  
  // Safety Concerns
  y -= 10;
  page.drawText('SAFETY CONCERNS', { x: 60, y, size: 14, font: boldFont });
  y -= 25;
  
  for (let i = 0; i < 4; i++) {
    page.drawLine({ start: { x: 70, y }, end: { x: 550, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
    y -= 20;
  }
  
  // Photos Required
  y -= 10;
  page.drawText('PHOTOS REQUIRED:', { x: 60, y, size: 14, font: boldFont });
  y -= 20;
  page.drawText('[ ] Site Overview  [ ] Equipment  [ ] Access Route  [ ] Hazards  [ ] Other', { x: 70, y, size: 10, font });
  
  // Signature
  y -= 40;
  page.drawLine({ start: { x: 50, y: y + 10 }, end: { x: 562, y: y + 10 }, thickness: 1 });
  page.drawText('Surveyor: ________________________', { x: 60, y, size: 11, font });
  page.drawText('Date: ____________', { x: 380, y, size: 11, font });
  
  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

/**
 * Generate a Safety Checklist
 */
async function generateSafetyChecklist(jobData) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  const { woNumber, pmNumber, address, city } = jobData;
  
  // Header
  page.drawText('SAFETY CHECKLIST', { x: 220, y: 750, size: 20, font: boldFont });
  page.drawText(`WO#: ${woNumber || 'N/A'} | PM#: ${pmNumber || 'N/A'}`, { x: 200, y: 730, size: 12, font });
  page.drawText(`Location: ${address || ''}, ${city || ''}`, { x: 150, y: 710, size: 11, font });
  
  page.drawLine({ start: { x: 50, y: 695 }, end: { x: 562, y: 695 }, thickness: 1 });
  
  let y = 670;
  
  // PPE Section
  page.drawText('PERSONAL PROTECTIVE EQUIPMENT (PPE)', { x: 60, y, size: 12, font: boldFont });
  y -= 22;
  
  const ppeItems = [
    '[ ] Hard Hat', '[ ] Safety Glasses', '[ ] High-Vis Vest',
    '[ ] Steel-Toe Boots', '[ ] Gloves', '[ ] Hearing Protection',
    '[ ] FR Clothing', '[ ] Fall Protection'
  ];
  
  for (const item of ppeItems) {
    page.drawText(item, { x: 70, y, size: 10, font });
    y -= 18;
  }
  
  // Hazard Assessment
  y -= 10;
  page.drawLine({ start: { x: 50, y: y + 5 }, end: { x: 562, y: y + 5 }, thickness: 0.5 });
  page.drawText('HAZARD ASSESSMENT', { x: 60, y, size: 12, font: boldFont });
  y -= 22;
  
  const hazardItems = [
    '[ ] Electrical Hazards Identified', '[ ] Fall Hazards Identified',
    '[ ] Traffic Hazards Identified', '[ ] Underground Utilities Located',
    '[ ] Overhead Hazards Identified', '[ ] Weather Conditions Checked'
  ];
  
  for (const item of hazardItems) {
    page.drawText(item, { x: 70, y, size: 10, font });
    y -= 18;
  }
  
  // Pre-Work Meeting
  y -= 10;
  page.drawLine({ start: { x: 50, y: y + 5 }, end: { x: 562, y: y + 5 }, thickness: 0.5 });
  page.drawText('PRE-WORK SAFETY MEETING', { x: 60, y, size: 12, font: boldFont });
  y -= 22;
  
  page.drawText('[ ] Tailboard/Safety Meeting Conducted', { x: 70, y, size: 10, font });
  y -= 18;
  page.drawText('[ ] All Crew Members Present and Signed', { x: 70, y, size: 10, font });
  y -= 18;
  page.drawText('[ ] Emergency Procedures Reviewed', { x: 70, y, size: 10, font });
  y -= 18;
  page.drawText('[ ] First Aid Kit Available', { x: 70, y, size: 10, font });
  y -= 18;
  page.drawText('[ ] Fire Extinguisher Available', { x: 70, y, size: 10, font });
  
  // Crew Sign-off
  y -= 25;
  page.drawLine({ start: { x: 50, y: y + 5 }, end: { x: 562, y: y + 5 }, thickness: 0.5 });
  page.drawText('CREW SIGN-OFF', { x: 60, y, size: 12, font: boldFont });
  y -= 22;
  
  for (let i = 0; i < 6; i++) {
    page.drawText(`${i + 1}. Name: ____________________  Signature: ____________________`, { x: 70, y, size: 10, font });
    y -= 22;
  }
  
  // Foreman Approval
  y -= 15;
  page.drawLine({ start: { x: 50, y: y + 5 }, end: { x: 562, y: y + 5 }, thickness: 1 });
  page.drawText('Foreman Signature: ________________________', { x: 60, y, size: 11, font: boldFont });
  page.drawText('Date: ____________', { x: 380, y, size: 11, font });
  
  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

/**
 * Generate all templates for a job and save them
 */
async function generateJobTemplates(jobData, templatesDir) {
  const templates = [];
  
  // Ensure templates directory exists
  if (!fs.existsSync(templatesDir)) {
    fs.mkdirSync(templatesDir, { recursive: true });
  }
  
  const jobId = jobData._id || jobData.pmNumber || Date.now();
  
  // Generate Bid Sheet
  const bidSheetBytes = await generateBidSheet(jobData);
  const bidSheetPath = path.join(templatesDir, `${jobId}_bid_sheet.pdf`);
  fs.writeFileSync(bidSheetPath, bidSheetBytes);
  templates.push({ name: 'Bid Sheet.pdf', path: bidSheetPath, type: 'template' });
  
  // Generate Crew Schedule
  const crewScheduleBytes = await generateCrewSchedule(jobData);
  const crewSchedulePath = path.join(templatesDir, `${jobId}_crew_schedule.pdf`);
  fs.writeFileSync(crewSchedulePath, crewScheduleBytes);
  templates.push({ name: 'Crew Schedule.pdf', path: crewSchedulePath, type: 'template' });
  
  // Generate Site Survey
  const siteSurveyBytes = await generateSiteSurvey(jobData);
  const siteSurveyPath = path.join(templatesDir, `${jobId}_site_survey.pdf`);
  fs.writeFileSync(siteSurveyPath, siteSurveyBytes);
  templates.push({ name: 'Site Survey Form.pdf', path: siteSurveyPath, type: 'template' });
  
  // Generate Safety Checklist
  const safetyChecklistBytes = await generateSafetyChecklist(jobData);
  const safetyChecklistPath = path.join(templatesDir, `${jobId}_safety_checklist.pdf`);
  fs.writeFileSync(safetyChecklistPath, safetyChecklistBytes);
  templates.push({ name: 'Safety Checklist.pdf', path: safetyChecklistPath, type: 'template' });
  
  return templates;
}

module.exports = {
  generateBidSheet,
  generateCrewSchedule,
  generateSiteSurvey,
  generateSafetyChecklist,
  generateJobTemplates
};
