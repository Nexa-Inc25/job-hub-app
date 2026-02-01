/**
 * Job Package Export Utilities
 * 
 * Formats job completion data (timesheets, tailboards, units) for utility systems:
 * - Oracle EBS (FBDI CSV)
 * - SAP (IDoc XML / CSV)
 * - Generic JSON/CSV
 * 
 * These exports accompany the job package submission to PG&E, SCE, etc.
 */

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

/**
 * Format timesheet data for Oracle EBS Time & Labor import
 * 
 * Maps to: HXC_BATCH_IMPORT interface
 * Reference: Oracle Time and Labor Implementation Guide
 */
function formatTimesheetForOracle(timesheet, job) {
  const batchId = `TS_${job.woNumber || job.pmNumber}_${new Date().getTime()}`;
  
  // Header columns for HXC_TIME_BUILDING_BLOCKS
  const headerColumns = [
    'BATCH_ID',
    'TIME_BUILDING_BLOCK_ID',
    'TYPE',
    'MEASURE',
    'UNIT_OF_MEASURE',
    'START_TIME',
    'STOP_TIME',
    'RESOURCE_ID',
    'RESOURCE_TYPE',
    'COMMENT_TEXT',
    'APPROVAL_STATUS',
    'DATE_FROM',
    'DATE_TO',
    'PROJECT_ID',
    'TASK_ID',
    'EXPENDITURE_TYPE',
    'ATTRIBUTE1', // WO Number
    'ATTRIBUTE2', // PM Number
    'ATTRIBUTE3', // Work Type
    'ATTRIBUTE4', // Classification
  ];

  const rows = [];
  let blockId = 1;

  for (const member of timesheet.crewMembers || []) {
    for (const entry of member.entries || []) {
      if (!entry.clockIn) continue;

      const hours = entry.clockOut 
        ? ((new Date(entry.clockOut) - new Date(entry.clockIn)) / 3600000) - ((entry.breakMinutes || 0) / 60)
        : 0;

      rows.push([
        batchId,
        `${batchId}_${blockId++}`,
        'RANGE',
        hours.toFixed(2),
        'HOURS',
        entry.clockIn ? new Date(entry.clockIn).toISOString() : '',
        entry.clockOut ? new Date(entry.clockOut).toISOString() : '',
        member.employeeId || member.name.replace(/\s+/g, '_').toUpperCase(),
        'PERSON',
        entry.notes || '',
        'SUBMITTED',
        timesheet.date ? new Date(timesheet.date).toISOString().split('T')[0] : '',
        timesheet.date ? new Date(timesheet.date).toISOString().split('T')[0] : '',
        job.projectId || job.pmNumber || '',
        job.taskId || job.woNumber || '',
        mapWorkTypeToOracle(entry.workType),
        job.woNumber || '',
        job.pmNumber || '',
        entry.workType || 'regular',
        member.classification || 'Field Worker',
      ]);
    }
  }

  return {
    format: 'oracle_hxc',
    batchId,
    headerColumns,
    rows,
    metadata: {
      jobNumber: job.woNumber || job.pmNumber,
      date: timesheet.date,
      totalHours: timesheet.totalHours,
      crewSize: timesheet.crewMembers?.length || 0,
    }
  };
}

/**
 * Format timesheet data for SAP CATS (Cross-Application Time Sheet)
 * 
 * Maps to: CATS_TIME_SHEET IDoc
 */
function formatTimesheetForSAP(timesheet, job) {
  const entries = [];

  for (const member of timesheet.crewMembers || []) {
    for (const entry of member.entries || []) {
      if (!entry.clockIn) continue;

      const hours = entry.clockOut 
        ? ((new Date(entry.clockOut) - new Date(entry.clockIn)) / 3600000) - ((entry.breakMinutes || 0) / 60)
        : 0;

      entries.push({
        PERNR: member.employeeId || '', // Personnel Number
        WORKDATE: formatSAPDate(timesheet.date),
        BEGUZ: entry.clockIn ? formatSAPTime(entry.clockIn) : '',
        ENDUZ: entry.clockOut ? formatSAPTime(entry.clockOut) : '',
        CATSHOURS: hours.toFixed(2),
        AWART: mapWorkTypeToSAP(entry.workType), // Attendance Type
        AUFNR: job.woNumber || '', // Order Number
        POSID: job.pmNumber || '', // WBS Element
        LTXA1: `${job.address || ''} - ${member.classification || 'Field Work'}`,
        LONGTEXT: entry.notes || '',
        STATUS: '10', // Released
      });
    }
  }

  return {
    format: 'sap_cats',
    idocType: 'CATS_TIME_SHEET',
    controlRecord: {
      DOCNUM: `TS${Date.now()}`,
      MESTYP: 'CATS_TIME',
      MESCOD: 'TIMESHEET',
      SNDPRN: 'FIELDLEDGER',
      RCVPRN: 'SAP_PROD',
    },
    entries,
    metadata: {
      jobNumber: job.woNumber || job.pmNumber,
      date: timesheet.date,
    }
  };
}

/**
 * Format tailboard/JHA data for utility safety systems
 * 
 * Creates structured data for:
 * - Oracle EHS (Environment, Health & Safety)
 * - SAP EHS
 * - Generic safety compliance systems
 */
function formatTailboardForOracle(tailboard, job) {
  const documentId = `TB_${job.woNumber || job.pmNumber}_${new Date(tailboard.date || Date.now()).toISOString().split('T')[0]}`;

  return {
    format: 'oracle_ehs',
    documentId,
    header: {
      INCIDENT_ID: documentId,
      INCIDENT_TYPE: 'JOB_HAZARD_ANALYSIS',
      INCIDENT_DATE: tailboard.date ? new Date(tailboard.date).toISOString() : new Date().toISOString(),
      LOCATION: job.address || '',
      WORK_ORDER: job.woNumber || '',
      PROJECT: job.pmNumber || '',
      DESCRIPTION: `Daily Tailboard - ${job.projectName || job.woNumber}`,
      STATUS: tailboard.status === 'completed' ? 'CLOSED' : 'OPEN',
      CREATED_BY: tailboard.createdBy?.name || tailboard.foremanName || '',
      CREW_SIZE: tailboard.crewMembers?.length || 0,
    },
    crewMembers: (tailboard.crewMembers || []).map(m => ({
      PERSON_NAME: m.name,
      PERSON_ID: m.employeeId || '',
      CLASSIFICATION: m.classification || m.role || '',
      SIGNATURE_DATE: m.signedAt ? new Date(m.signedAt).toISOString() : '',
      HAS_SIGNATURE: !!m.signature,
    })),
    hazards: (tailboard.hazards || []).map((h, idx) => ({
      HAZARD_ID: `${documentId}_H${idx + 1}`,
      CATEGORY: h.category || 'general',
      DESCRIPTION: h.description || h.hazard || '',
      RISK_LEVEL: h.riskLevel || 'medium',
      CONTROLS: Array.isArray(h.controls) ? h.controls.join('; ') : (h.controls || ''),
    })),
    safetyChecks: (tailboard.safetyChecks || tailboard.checklist || []).map((c, idx) => ({
      CHECK_ID: `${documentId}_C${idx + 1}`,
      CHECK_TYPE: c.category || c.type || 'general',
      DESCRIPTION: c.item || c.description || '',
      RESULT: c.checked ? 'PASS' : 'FAIL',
      COMMENTS: c.notes || '',
    })),
    metadata: {
      weatherConditions: tailboard.weather || {},
      emergencyInfo: tailboard.emergencyInfo || {},
      completedAt: tailboard.completedAt,
    }
  };
}

/**
 * Format tailboard for SAP EHS
 */
function formatTailboardForSAP(tailboard, job) {
  const documentId = `TB${Date.now()}`;

  return {
    format: 'sap_ehs',
    idocType: 'EHS_INCIDENT',
    header: {
      DOCNUM: documentId,
      INCTYPE: 'JHA',
      INCDATE: formatSAPDate(tailboard.date || new Date()),
      LOCATION: job.address || '',
      AUFNR: job.woNumber || '',
      POSID: job.pmNumber || '',
      DESCRIPTION: `Daily Tailboard Safety Briefing`,
      STATUS: tailboard.status === 'completed' ? 'COMP' : 'OPEN',
    },
    participants: (tailboard.crewMembers || []).map(m => ({
      NAME: m.name,
      ROLE: m.classification || m.role || 'CREW',
      SIGNED: m.signature ? 'X' : '',
    })),
    hazardAssessment: (tailboard.hazards || []).map(h => ({
      CATEGORY: h.category?.toUpperCase() || 'GENERAL',
      HAZARD: h.description || h.hazard || '',
      CONTROL: Array.isArray(h.controls) ? h.controls.join('; ') : (h.controls || ''),
      RISK: mapRiskLevelToSAP(h.riskLevel),
    })),
  };
}

/**
 * Generate a complete job package export for utility submission
 * 
 * Combines all job data into the required format
 */
function generateJobPackageExport(job, options = {}) {
  const { 
    format = 'oracle', // 'oracle', 'sap', 'json', 'csv'
    includeTimesheet = true,
    includeTailboard = true,
    includeUnits = true,
    timesheet = null,
    tailboard = null,
    units = [],
  } = options;

  const packageId = `PKG_${job.woNumber || job.pmNumber}_${Date.now()}`;

  const result = {
    packageId,
    format,
    job: {
      woNumber: job.woNumber,
      pmNumber: job.pmNumber,
      notificationNumber: job.notificationNumber,
      address: job.address,
      city: job.city,
      client: job.client,
      projectName: job.projectName,
      division: job.division,
      status: job.status,
      completedAt: job.completedAt || job.gfReviewDate,
    },
    components: {},
    exportedAt: new Date().toISOString(),
  };

  // Add timesheet data
  if (includeTimesheet && timesheet) {
    result.components.timesheet = format === 'sap' 
      ? formatTimesheetForSAP(timesheet, job)
      : formatTimesheetForOracle(timesheet, job);
  }

  // Add tailboard data
  if (includeTailboard && tailboard) {
    result.components.tailboard = format === 'sap'
      ? formatTailboardForSAP(tailboard, job)
      : formatTailboardForOracle(tailboard, job);
  }

  // Add unit entries (already have Oracle format from billing)
  if (includeUnits && units.length > 0) {
    result.components.units = {
      format: format === 'sap' ? 'sap_po' : 'oracle_ap',
      count: units.length,
      totalAmount: units.reduce((sum, u) => sum + (u.totalAmount || 0), 0),
      entries: units.map(u => ({
        itemCode: u.itemCode,
        description: u.description,
        quantity: u.quantity,
        unitPrice: u.unitPrice,
        totalAmount: u.totalAmount,
        status: u.status,
        capturedAt: u.createdAt,
      })),
    };
  }

  return result;
}

/**
 * Generate job package as downloadable CSV files
 */
function generateJobPackageCSV(exportData) {
  const files = {};

  // Timesheet CSV
  if (exportData.components.timesheet) {
    const ts = exportData.components.timesheet;
    if (ts.headerColumns && ts.rows) {
      files['timesheet.csv'] = [
        ts.headerColumns.join(','),
        ...ts.rows.map(row => row.map(v => 
          typeof v === 'string' && (v.includes(',') || v.includes('"')) 
            ? `"${v.replace(/"/g, '""')}"` 
            : v
        ).join(','))
      ].join('\n');
    }
  }

  // Tailboard CSV
  if (exportData.components.tailboard) {
    const tb = exportData.components.tailboard;
    
    // Crew members
    files['tailboard_crew.csv'] = [
      'PERSON_NAME,PERSON_ID,CLASSIFICATION,SIGNATURE_DATE,HAS_SIGNATURE',
      ...(tb.crewMembers || []).map(m => 
        `"${m.PERSON_NAME || ''}","${m.PERSON_ID || ''}","${m.CLASSIFICATION || ''}","${m.SIGNATURE_DATE || ''}",${m.HAS_SIGNATURE ? 'Y' : 'N'}`
      )
    ].join('\n');

    // Hazards
    files['tailboard_hazards.csv'] = [
      'HAZARD_ID,CATEGORY,DESCRIPTION,RISK_LEVEL,CONTROLS',
      ...(tb.hazards || []).map(h =>
        `"${h.HAZARD_ID || ''}","${h.CATEGORY || ''}","${h.DESCRIPTION || ''}","${h.RISK_LEVEL || ''}","${h.CONTROLS || ''}"`
      )
    ].join('\n');
  }

  // Units CSV
  if (exportData.components.units) {
    const units = exportData.components.units;
    files['units.csv'] = [
      'ITEM_CODE,DESCRIPTION,QUANTITY,UNIT_PRICE,TOTAL_AMOUNT,STATUS,CAPTURED_AT',
      ...(units.entries || []).map(u =>
        `"${u.itemCode || ''}","${u.description || ''}",${u.quantity || 0},${u.unitPrice || 0},${u.totalAmount || 0},"${u.status || ''}","${u.capturedAt || ''}"`
      )
    ].join('\n');
  }

  return files;
}

/**
 * Generate a combined PDF for the job package
 */
async function generateJobPackagePDF(exportData, options = {}) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Cover page
  const coverPage = pdfDoc.addPage([612, 792]);
  let y = 720;
  
  coverPage.drawText('JOB PACKAGE EXPORT', { x: 200, y, size: 24, font: boldFont });
  y -= 40;
  coverPage.drawText(`WO#: ${exportData.job.woNumber || 'N/A'}`, { x: 60, y, size: 14, font });
  y -= 20;
  coverPage.drawText(`PM#: ${exportData.job.pmNumber || 'N/A'}`, { x: 60, y, size: 14, font });
  y -= 20;
  coverPage.drawText(`Location: ${exportData.job.address || 'N/A'}, ${exportData.job.city || ''}`, { x: 60, y, size: 12, font });
  y -= 20;
  coverPage.drawText(`Export Date: ${new Date().toLocaleDateString()}`, { x: 60, y, size: 12, font });
  y -= 40;
  
  coverPage.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 1 });
  y -= 30;

  // Contents summary
  coverPage.drawText('PACKAGE CONTENTS:', { x: 60, y, size: 14, font: boldFont });
  y -= 25;

  const components = exportData.components;
  if (components.timesheet) {
    coverPage.drawText(`✓ Timesheet - ${components.timesheet.metadata?.totalHours || 0} total hours`, { x: 80, y, size: 12, font });
    y -= 20;
  }
  if (components.tailboard) {
    coverPage.drawText(`✓ Tailboard/JHA - ${components.tailboard.crewMembers?.length || 0} crew members`, { x: 80, y, size: 12, font });
    y -= 20;
  }
  if (components.units) {
    coverPage.drawText(`✓ Unit Entries - ${components.units.count} units, $${components.units.totalAmount?.toFixed(2) || '0.00'} total`, { x: 80, y, size: 12, font });
    y -= 20;
  }

  // Timesheet page
  if (components.timesheet) {
    const tsPage = pdfDoc.addPage([612, 792]);
    y = 720;
    tsPage.drawText('TIMESHEET', { x: 250, y, size: 20, font: boldFont });
    y -= 30;
    tsPage.drawText(`Date: ${components.timesheet.metadata?.date || 'N/A'}`, { x: 60, y, size: 12, font });
    y -= 40;

    // Table header
    tsPage.drawText('Name', { x: 60, y, size: 10, font: boldFont });
    tsPage.drawText('Classification', { x: 180, y, size: 10, font: boldFont });
    tsPage.drawText('Work Type', { x: 300, y, size: 10, font: boldFont });
    tsPage.drawText('Hours', { x: 420, y, size: 10, font: boldFont });
    y -= 15;
    tsPage.drawLine({ start: { x: 50, y: y + 5 }, end: { x: 562, y: y + 5 }, thickness: 0.5 });

    for (const row of components.timesheet.rows || []) {
      if (y < 50) break; // Page overflow protection
      y -= 18;
      tsPage.drawText(String(row[7] || '').slice(0, 20), { x: 60, y, size: 9, font }); // Resource ID
      tsPage.drawText(String(row[19] || '').slice(0, 20), { x: 180, y, size: 9, font }); // Classification
      tsPage.drawText(String(row[18] || '').slice(0, 15), { x: 300, y, size: 9, font }); // Work Type
      tsPage.drawText(String(row[3] || '0'), { x: 420, y, size: 9, font }); // Hours
    }
  }

  // Tailboard page
  if (components.tailboard) {
    const tbPage = pdfDoc.addPage([612, 792]);
    y = 720;
    tbPage.drawText('TAILBOARD / JHA', { x: 220, y, size: 20, font: boldFont });
    y -= 30;
    tbPage.drawText(`Status: ${components.tailboard.header?.STATUS || 'N/A'}`, { x: 60, y, size: 12, font });
    y -= 40;

    // Crew section
    tbPage.drawText('CREW MEMBERS:', { x: 60, y, size: 12, font: boldFont });
    y -= 20;
    for (const m of components.tailboard.crewMembers || []) {
      if (y < 100) break;
      tbPage.drawText(`• ${m.PERSON_NAME} (${m.CLASSIFICATION}) ${m.HAS_SIGNATURE ? '✓ Signed' : ''}`, { x: 80, y, size: 10, font });
      y -= 15;
    }

    y -= 20;
    tbPage.drawText('HAZARDS IDENTIFIED:', { x: 60, y, size: 12, font: boldFont });
    y -= 20;
    for (const h of components.tailboard.hazards || []) {
      if (y < 50) break;
      tbPage.drawText(`• [${h.CATEGORY}] ${h.DESCRIPTION}`, { x: 80, y, size: 10, font });
      y -= 12;
      tbPage.drawText(`  Controls: ${h.CONTROLS}`, { x: 90, y, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
      y -= 15;
    }
  }

  return await pdfDoc.save();
}

// Helper functions
function mapWorkTypeToOracle(workType) {
  const mapping = {
    'regular': 'REGULAR',
    'overtime': 'OVERTIME',
    'double': 'DOUBLETIME',
    'travel': 'TRAVEL',
    'standby': 'STANDBY',
  };
  return mapping[workType] || 'REGULAR';
}

function mapWorkTypeToSAP(workType) {
  const mapping = {
    'regular': '1001',
    'overtime': '1510',
    'double': '1520',
    'travel': '1200',
    'standby': '1300',
  };
  return mapping[workType] || '1001';
}

function mapRiskLevelToSAP(level) {
  const mapping = {
    'low': '1',
    'medium': '2',
    'high': '3',
    'critical': '4',
  };
  return mapping[level?.toLowerCase()] || '2';
}

function formatSAPDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toISOString().split('T')[0].replace(/-/g, '');
}

function formatSAPTime(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toISOString().split('T')[1].slice(0, 8).replace(/:/g, '');
}

module.exports = {
  formatTimesheetForOracle,
  formatTimesheetForSAP,
  formatTailboardForOracle,
  formatTailboardForSAP,
  generateJobPackageExport,
  generateJobPackageCSV,
  generateJobPackagePDF,
};

