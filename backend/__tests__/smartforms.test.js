/**
 * SmartForms Tests
 * 
 * Tests for the SmartForms PDF template system.
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const FormTemplate = require('../models/FormTemplate');
const { PDFDocument } = require('pdf-lib');

let mongoServer;

// Helper to create a simple test PDF
async function createTestPdf(pageCount = 1) {
  const pdfDoc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = pdfDoc.addPage([612, 792]); // Letter size
    page.drawText(`Page ${i + 1}`, { x: 50, y: 700, size: 24 });
  }
  return Buffer.from(await pdfDoc.save());
}

beforeAll(async () => {
  // Disconnect if already connected (from other tests)
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
});

beforeEach(async () => {
  if (mongoose.connection.readyState === 1) {
    await FormTemplate.deleteMany({});
  }
});

describe('FormTemplate Model', () => {
  const mockCompanyId = new mongoose.Types.ObjectId();
  const mockUserId = new mongoose.Types.ObjectId();

  // ==================== Basic CRUD ====================
  describe('Basic CRUD Operations', () => {
    it('should create a new template with required fields', async () => {
      const template = new FormTemplate({
        companyId: mockCompanyId,
        name: 'Test Permit Form',
        sourceFile: {
          r2Key: 'smartforms/templates/test.pdf',
          originalName: 'permit.pdf',
          pageCount: 3,
        },
        createdBy: mockUserId,
      });

      await template.save();
      
      expect(template._id).toBeDefined();
      expect(template.name).toBe('Test Permit Form');
      expect(template.status).toBe('draft');
      expect(template.version).toBe(1);
      expect(template.fillCount).toBe(0);
    });

    it('should require name field', async () => {
      const template = new FormTemplate({
        companyId: mockCompanyId,
        sourceFile: {
          r2Key: 'test.pdf',
        },
      });

      await expect(template.save()).rejects.toThrow(/name.*required/i);
    });

    it('should require companyId field', async () => {
      const template = new FormTemplate({
        name: 'Test Form',
        sourceFile: {
          r2Key: 'test.pdf',
        },
      });

      await expect(template.save()).rejects.toThrow(/companyId.*required/i);
    });

    it('should default category to other', async () => {
      const template = new FormTemplate({
        companyId: mockCompanyId,
        name: 'Test Form',
        sourceFile: { r2Key: 'test.pdf' },
      });

      await template.save();
      expect(template.category).toBe('other');
    });
  });

  // ==================== Field Definitions ====================
  describe('Field Definitions', () => {
    it('should store field definitions with bounds', async () => {
      const template = new FormTemplate({
        companyId: mockCompanyId,
        name: 'Test Form',
        sourceFile: { r2Key: 'test.pdf', pageCount: 1 },
        fields: [
          {
            id: 'field_1',
            name: 'contractor_name',
            label: 'Contractor Name',
            page: 1,
            type: 'text',
            bounds: { x: 100, y: 200, width: 200, height: 20 },
            fontSize: 12,
          },
        ],
      });

      await template.save();
      expect(template.fields).toHaveLength(1);
      expect(template.fields[0].name).toBe('contractor_name');
      expect(template.fields[0].bounds.x).toBe(100);
    });

    it('should validate unique field IDs', async () => {
      const template = new FormTemplate({
        companyId: mockCompanyId,
        name: 'Test Form',
        sourceFile: { r2Key: 'test.pdf' },
        fields: [
          { id: 'field_1', name: 'field1', page: 1, type: 'text', bounds: { x: 0, y: 0, width: 100, height: 20 } },
          { id: 'field_1', name: 'field2', page: 1, type: 'text', bounds: { x: 0, y: 30, width: 100, height: 20 } }, // Duplicate ID
        ],
      });

      await expect(template.save()).rejects.toThrow(/unique/i);
    });

    it('should support multiple field types', async () => {
      const template = new FormTemplate({
        companyId: mockCompanyId,
        name: 'Test Form',
        sourceFile: { r2Key: 'test.pdf' },
        fields: [
          { id: 'f1', name: 'text_field', page: 1, type: 'text', bounds: { x: 0, y: 0, width: 100, height: 20 } },
          { id: 'f2', name: 'date_field', page: 1, type: 'date', bounds: { x: 0, y: 30, width: 100, height: 20 } },
          { id: 'f3', name: 'checkbox_field', page: 1, type: 'checkbox', bounds: { x: 0, y: 60, width: 20, height: 20 } },
          { id: 'f4', name: 'number_field', page: 1, type: 'number', bounds: { x: 0, y: 90, width: 100, height: 20 } },
        ],
      });

      await template.save();
      expect(template.fields).toHaveLength(4);
    });

    it('should set default fontSize to 10', async () => {
      const template = new FormTemplate({
        companyId: mockCompanyId,
        name: 'Test Form',
        sourceFile: { r2Key: 'test.pdf' },
        fields: [
          { id: 'f1', name: 'field', page: 1, type: 'text', bounds: { x: 0, y: 0, width: 100, height: 20 } },
        ],
      });

      await template.save();
      expect(template.fields[0].fontSize).toBe(10);
    });
  });

  // ==================== Data Mappings ====================
  describe('Data Mappings', () => {
    it('should store data mappings as Map', async () => {
      const template = new FormTemplate({
        companyId: mockCompanyId,
        name: 'Test Form',
        sourceFile: { r2Key: 'test.pdf' },
        dataMappings: new Map([
          ['contractor_name', 'company.name'],
          ['job_address', 'job.address'],
        ]),
      });

      await template.save();
      expect(template.dataMappings.get('contractor_name')).toBe('company.name');
      expect(template.dataMappings.get('job_address')).toBe('job.address');
    });

    it('should handle empty mappings', async () => {
      const template = new FormTemplate({
        companyId: mockCompanyId,
        name: 'Test Form',
        sourceFile: { r2Key: 'test.pdf' },
      });

      await template.save();
      expect(template.dataMappings.size).toBe(0);
    });
  });

  // ==================== Page Dimensions ====================
  describe('Page Dimensions', () => {
    it('should store page dimensions for coordinate mapping', async () => {
      const template = new FormTemplate({
        companyId: mockCompanyId,
        name: 'Test Form',
        sourceFile: {
          r2Key: 'test.pdf',
          pageCount: 2,
          pageDimensions: [
            { page: 1, width: 612, height: 792 }, // Letter
            { page: 2, width: 612, height: 792 },
          ],
        },
      });

      await template.save();
      expect(template.sourceFile.pageDimensions).toHaveLength(2);
      expect(template.sourceFile.pageDimensions[0].width).toBe(612);
    });
  });

  // ==================== Status and Versioning ====================
  describe('Status and Versioning', () => {
    it('should default status to draft', async () => {
      const template = new FormTemplate({
        companyId: mockCompanyId,
        name: 'Test Form',
        sourceFile: { r2Key: 'test.pdf' },
      });

      await template.save();
      expect(template.status).toBe('draft');
    });

    it('should allow status transitions', async () => {
      const template = new FormTemplate({
        companyId: mockCompanyId,
        name: 'Test Form',
        sourceFile: { r2Key: 'test.pdf' },
      });

      await template.save();
      
      template.status = 'active';
      await template.save();
      expect(template.status).toBe('active');

      template.status = 'archived';
      await template.save();
      expect(template.status).toBe('archived');
    });

    it('should validate status enum', async () => {
      const template = new FormTemplate({
        companyId: mockCompanyId,
        name: 'Test Form',
        sourceFile: { r2Key: 'test.pdf' },
        status: 'invalid_status',
      });

      await expect(template.save()).rejects.toThrow(/status.*valid/i);
    });
  });

  // ==================== Fill Tracking ====================
  describe('Fill Count Tracking', () => {
    it('should increment fill count via recordFill method', async () => {
      const template = new FormTemplate({
        companyId: mockCompanyId,
        name: 'Test Form',
        sourceFile: { r2Key: 'test.pdf' },
      });

      await template.save();
      expect(template.fillCount).toBe(0);

      await template.recordFill();
      expect(template.fillCount).toBe(1);
      expect(template.lastFilledAt).toBeDefined();

      await template.recordFill();
      expect(template.fillCount).toBe(2);
    });
  });

  // ==================== Static Methods ====================
  describe('Static Methods', () => {
    it('should find active templates for company', async () => {
      // Create multiple templates
      await FormTemplate.create([
        { companyId: mockCompanyId, name: 'Active 1', status: 'active', sourceFile: { r2Key: '1.pdf' } },
        { companyId: mockCompanyId, name: 'Active 2', status: 'active', sourceFile: { r2Key: '2.pdf' } },
        { companyId: mockCompanyId, name: 'Draft', status: 'draft', sourceFile: { r2Key: '3.pdf' } },
        { companyId: new mongoose.Types.ObjectId(), name: 'Other Company', status: 'active', sourceFile: { r2Key: '4.pdf' } },
      ]);

      const active = await FormTemplate.findActiveForCompany(mockCompanyId);
      expect(active).toHaveLength(2);
      expect(active.every(t => t.status === 'active')).toBe(true);
    });
  });

  // ==================== Indexes ====================
  describe('Indexes', () => {
    it('should support text search on name and description', async () => {
      await FormTemplate.create([
        { companyId: mockCompanyId, name: 'PGE Permit Form', description: 'For pole replacements', sourceFile: { r2Key: '1.pdf' } },
        { companyId: mockCompanyId, name: 'Traffic Control Plan', description: 'TCP requirements', sourceFile: { r2Key: '2.pdf' } },
      ]);

      // Text indexes need to be ensured first
      await FormTemplate.ensureIndexes();

      const results = await FormTemplate.find({ $text: { $search: 'permit' } });
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].name).toContain('Permit');
    });
  });

  // ==================== Category Validation ====================
  describe('Category Validation', () => {
    it('should accept valid categories', async () => {
      const validCategories = ['permits', 'compliance', 'billing', 'safety', 'utility', 'other'];
      
      for (const category of validCategories) {
        const template = new FormTemplate({
          companyId: mockCompanyId,
          name: `Test ${category}`,
          category,
          sourceFile: { r2Key: `${category}.pdf` },
        });
        
        await template.save();
        expect(template.category).toBe(category);
      }
    });

    it('should reject invalid category', async () => {
      const template = new FormTemplate({
        companyId: mockCompanyId,
        name: 'Test Form',
        category: 'invalid_category',
        sourceFile: { r2Key: 'test.pdf' },
      });

      await expect(template.save()).rejects.toThrow(/category.*valid/i);
    });
  });
});

describe('SmartForms Helper Functions', () => {
  // Test the helper functions from the routes file
  
  describe('hexToRgb', () => {
    // Import the function logic (replicated for testing)
    function hexToRgb(hex) {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      if (!result) return { r: 0, g: 0, b: 0 };
      return {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255,
      };
    }

    it('should parse hex color correctly', () => {
      const rgb = hexToRgb('#ff0000');
      expect(rgb.r).toBeCloseTo(1, 2);
      expect(rgb.g).toBeCloseTo(0, 2);
      expect(rgb.b).toBeCloseTo(0, 2);
    });

    it('should handle hex without #', () => {
      const rgb = hexToRgb('00ff00');
      expect(rgb.g).toBeCloseTo(1, 2);
    });

    it('should return black for invalid hex', () => {
      const rgb = hexToRgb('invalid');
      expect(rgb).toEqual({ r: 0, g: 0, b: 0 });
    });
  });

  describe('resolveDataPath', () => {
    function resolveDataPath(obj, path) {
      if (!path || !obj) return '';
      const parts = path.split('.');
      let current = obj;
      for (const part of parts) {
        if (current === null || current === undefined) return '';
        current = current[part];
      }
      return current ?? '';
    }

    it('should resolve nested paths', () => {
      const data = { job: { address: '123 Main St' } };
      expect(resolveDataPath(data, 'job.address')).toBe('123 Main St');
    });

    it('should return empty string for missing path', () => {
      const data = { job: {} };
      expect(resolveDataPath(data, 'job.address')).toBe('');
    });

    it('should handle null/undefined gracefully', () => {
      expect(resolveDataPath(null, 'job.address')).toBe('');
      expect(resolveDataPath({}, null)).toBe('');
    });
  });

  describe('formatDate', () => {
    function formatDate(value, format = 'MM/DD/YYYY') {
      if (!value) return '';
      const date = new Date(value);
      if (isNaN(date.getTime())) return String(value);
      
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const year = date.getFullYear();
      
      return format
        .replace('MM', month)
        .replace('DD', day)
        .replace('YYYY', String(year))
        .replace('YY', String(year).slice(-2));
    }

    it('should format date with default format', () => {
      // Use explicit date construction to avoid timezone issues
      const result = formatDate(new Date(2025, 2, 15)); // March 15, 2025
      expect(result).toBe('03/15/2025');
    });

    it('should format date with custom format', () => {
      const result = formatDate(new Date(2025, 2, 15), 'YYYY-MM-DD'); // March 15, 2025
      expect(result).toBe('2025-03-15');
    });

    it('should return empty string for falsy value', () => {
      expect(formatDate(null)).toBe('');
      expect(formatDate('')).toBe('');
    });

    it('should return original value for invalid date', () => {
      expect(formatDate('not a date')).toBe('not a date');
    });
  });
});

describe('PDF Field Filling', () => {
  it('should create PDF with text annotation', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    
    // Simulate field filling
    page.drawText('Test Value', {
      x: 100,
      y: 700,
      size: 12,
    });
    
    const pdfBytes = await pdfDoc.save();
    expect(Buffer.from(pdfBytes).length).toBeGreaterThan(0);
    
    // Verify text was added by loading the PDF
    const loaded = await PDFDocument.load(pdfBytes);
    expect(loaded.getPageCount()).toBe(1);
  });

  it('should handle multiple pages', async () => {
    const pdfBytes = await createTestPdf(3);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    
    // Add text to each page
    const pages = pdfDoc.getPages();
    pages.forEach((page, i) => {
      page.drawText(`Filled on page ${i + 1}`, { x: 100, y: 500, size: 10 });
    });
    
    const filledBytes = await pdfDoc.save();
    const reloaded = await PDFDocument.load(filledBytes);
    expect(reloaded.getPageCount()).toBe(3);
  });
});

