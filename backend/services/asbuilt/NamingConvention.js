/**
 * FieldLedger - SAP Naming Convention Service
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * Generates file names per utility-specific SAP naming conventions.
 * Patterns come from UtilityAsBuiltConfig.namingConventions.
 * 
 * PG&E uses patterns from TD-9100P-15 Attachment 1 ("DMS Document Naming
 * Cross Reference Table"). Other utilities follow similar SAP DMS conventions.
 * 
 * Supported placeholders:
 *   {PM}       - PM/Order number
 *   {NOTIF}    - Notification number
 *   {DOC_TYPE} - Document type code
 *   {REV}      - Revision (R0, R1, etc.)
 *   {DATE}     - Date in YYYYMMDD format
 *   {SEQ}      - Sequence number (001, 002, etc.)
 *   {LOC}      - Location number (for multi-location jobs)
 */

class NamingConvention {
  /**
   * Generate a filename from a naming pattern and context
   * 
   * @param {string} pattern - Pattern with placeholders (e.g., '{PM}_ASBUILT_{DATE}')
   * @param {Object} context - Values for placeholders
   * @param {string} [context.pmNumber] - PM/Order number
   * @param {string} [context.notificationNumber] - Notification number
   * @param {string} [context.documentType] - Document type code
   * @param {number} [context.revision] - Revision number (default 0)
   * @param {Date}   [context.date] - Date (default today)
   * @param {number} [context.sequence] - Sequence number
   * @param {number} [context.location] - Location number
   * @returns {string} Generated filename (without extension)
   */
  generate(pattern, context = {}) {
    if (!pattern) return this._fallbackName(context);

    const date = context.date || new Date();
    const dateStr = this._formatDate(date);

    let name = pattern
      .replace(/\{PM\}/g, this._sanitize(context.pmNumber || 'UNKNOWN'))
      .replace(/\{NOTIF\}/g, this._sanitize(context.notificationNumber || ''))
      .replace(/\{DOC_TYPE\}/g, this._sanitize(context.documentType || 'DOC'))
      .replace(/\{REV\}/g, `R${context.revision || 0}`)
      .replace(/\{DATE\}/g, dateStr)
      .replace(/\{SEQ\}/g, String(context.sequence || 1).padStart(3, '0'))
      .replace(/\{LOC\}/g, String(context.location || 1));

    // Remove trailing underscores from empty replacements
    name = name.replace(/_+/g, '_').replace(/^_|_$/g, '');

    return name;
  }

  /**
   * Generate names for all documents in an as-built package
   * 
   * @param {Array} namingConventions - From UtilityAsBuiltConfig.namingConventions
   * @param {Object} context - Job context (pmNumber, notificationNumber, etc.)
   * @returns {Object} Map of documentType → generated filename
   */
  generatePackageNames(namingConventions, context = {}) {
    const names = {};
    
    for (const convention of namingConventions || []) {
      names[convention.documentType] = this.generate(convention.pattern, {
        ...context,
        documentType: convention.documentType,
      });
    }

    return names;
  }

  /**
   * Generate the name for a specific document type
   * 
   * @param {Array} namingConventions - From UtilityAsBuiltConfig
   * @param {string} documentType - The document type to name
   * @param {Object} context - Job context
   * @returns {string} Generated filename
   */
  generateForType(namingConventions, documentType, context = {}) {
    const convention = (namingConventions || []).find(nc => nc.documentType === documentType);
    if (!convention) {
      return this._fallbackName({ ...context, documentType });
    }
    return this.generate(convention.pattern, { ...context, documentType });
  }

  /**
   * Sanitize a string for use in a filename
   * Removes special characters, keeps alphanumeric, hyphens, underscores
   */
  _sanitize(str) {
    if (!str) return '';
    return String(str).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50);
  }

  /**
   * Format date as YYYYMMDD
   */
  _formatDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  /**
   * Fallback name when no pattern is configured
   */
  _fallbackName(context) {
    const pm = this._sanitize(context.pmNumber || 'UNKNOWN');
    const type = this._sanitize(context.documentType || 'DOC');
    const date = this._formatDate(context.date || new Date());
    return `${pm}_${type}_${date}`;
  }
}

module.exports = new NamingConvention();

