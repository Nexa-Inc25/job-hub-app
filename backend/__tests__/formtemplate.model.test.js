/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * FormTemplate Model Tests (SmartForms)
 */

const FormTemplate = require('../models/FormTemplate');
const Company = require('../models/Company');

describe('FormTemplate Model', () => {
  let company;

  beforeEach(async () => {
    company = await Company.create({ name: 'Test Co' });
  });

  const validTemplateData = () => ({
    companyId: company._id,
    name: 'PG&E CWC Form',
    description: 'Construction Work Clearance template',
    category: 'safety',
    sourceFile: {
      r2Key: 'templates/cwc-form.pdf',
      originalName: 'cwc-form.pdf',
      pageCount: 3,
    },
    fields: [{
      id: 'field_1',
      name: 'contractor_name',
      label: 'Contractor Name',
      page: 1,
      type: 'text',
      bounds: { x: 100, y: 700, width: 200, height: 20 },
    }],
  });

  describe('Schema Validation', () => {
    it('should create a template with valid data', async () => {
      const tpl = await FormTemplate.create(validTemplateData());
      expect(tpl._id).toBeDefined();
      expect(tpl.status).toBe('draft');
      expect(tpl.version).toBe(1);
      expect(tpl.fillCount).toBe(0);
    });

    it('should require companyId', async () => {
      const data = validTemplateData();
      delete data.companyId;
      await expect(FormTemplate.create(data)).rejects.toThrow();
    });

    it('should require name', async () => {
      const data = validTemplateData();
      delete data.name;
      await expect(FormTemplate.create(data)).rejects.toThrow();
    });

    it('should require sourceFile.r2Key', async () => {
      const data = validTemplateData();
      delete data.sourceFile.r2Key;
      await expect(FormTemplate.create(data)).rejects.toThrow();
    });

    it('should only accept valid category values', async () => {
      const data = validTemplateData();
      data.category = 'invalid';
      await expect(FormTemplate.create(data)).rejects.toThrow();
    });

    it('should accept all valid categories', async () => {
      for (const cat of ['permits', 'compliance', 'billing', 'safety', 'utility', 'other']) {
        const data = validTemplateData();
        data.category = cat;
        data.name = `Template-${cat}`;
        const tpl = await FormTemplate.create(data);
        expect(tpl.category).toBe(cat);
      }
    });

    it('should only accept valid status values', async () => {
      const data = validTemplateData();
      data.status = 'invalid';
      await expect(FormTemplate.create(data)).rejects.toThrow();
    });

    it('should accept all valid field types', async () => {
      for (const type of ['text', 'date', 'checkbox', 'signature', 'number']) {
        const data = validTemplateData();
        data.fields[0].type = type;
        data.fields[0].id = `field_${type}`;
        data.name = `Template-${type}`;
        const tpl = await FormTemplate.create(data);
        expect(tpl.fields[0].type).toBe(type);
      }
    });
  });

  describe('Pre-save Validation', () => {
    it('should reject duplicate field IDs within template', async () => {
      const data = validTemplateData();
      data.fields.push({
        id: 'field_1', // duplicate
        name: 'another_field',
        page: 1,
        bounds: { x: 100, y: 600, width: 200, height: 20 },
      });
      await expect(FormTemplate.create(data)).rejects.toThrow('Field IDs must be unique');
    });

    it('should allow unique field IDs', async () => {
      const data = validTemplateData();
      data.fields.push({
        id: 'field_2',
        name: 'job_address',
        page: 1,
        bounds: { x: 100, y: 600, width: 200, height: 20 },
      });
      const tpl = await FormTemplate.create(data);
      expect(tpl.fields).toHaveLength(2);
    });
  });

  describe('Virtual Properties', () => {
    it('should return correct fieldCount', async () => {
      const data = validTemplateData();
      data.fields.push({
        id: 'field_2', name: 'addr', page: 1,
        bounds: { x: 10, y: 10, width: 100, height: 20 },
      });
      const tpl = await FormTemplate.create(data);
      expect(tpl.fieldCount).toBe(2);
    });

    it('should return 0 fieldCount for no fields', async () => {
      const data = validTemplateData();
      data.fields = [];
      const tpl = await FormTemplate.create(data);
      expect(tpl.fieldCount).toBe(0);
    });
  });

  describe('Instance Methods', () => {
    it('recordFill should increment fillCount and set lastFilledAt', async () => {
      const tpl = await FormTemplate.create(validTemplateData());
      expect(tpl.fillCount).toBe(0);
      await tpl.recordFill();
      const updated = await FormTemplate.findById(tpl._id);
      expect(updated.fillCount).toBe(1);
      expect(updated.lastFilledAt).toBeDefined();
    });
  });

  describe('Static Methods', () => {
    it('findActiveForCompany should return only active templates', async () => {
      await FormTemplate.create({ ...validTemplateData(), status: 'active', name: 'Active' });
      await FormTemplate.create({ ...validTemplateData(), status: 'draft', name: 'Draft' });
      await FormTemplate.create({ ...validTemplateData(), status: 'archived', name: 'Archived' });

      const active = await FormTemplate.findActiveForCompany(company._id);
      expect(active).toHaveLength(1);
      expect(active[0].name).toBe('Active');
    });

    it('findActiveForCompany should sort by name', async () => {
      await FormTemplate.create({ ...validTemplateData(), status: 'active', name: 'Zebra Form' });
      await FormTemplate.create({ ...validTemplateData(), status: 'active', name: 'Alpha Form' });

      const active = await FormTemplate.findActiveForCompany(company._id);
      expect(active[0].name).toBe('Alpha Form');
      expect(active[1].name).toBe('Zebra Form');
    });
  });

  describe('Data Mappings', () => {
    it('should store and retrieve data mappings', async () => {
      const data = validTemplateData();
      data.dataMappings = {
        contractor_name: 'company.name',
        job_address: 'job.address',
      };
      const tpl = await FormTemplate.create(data);
      expect(tpl.dataMappings.get('contractor_name')).toBe('company.name');
      expect(tpl.dataMappings.get('job_address')).toBe('job.address');
    });
  });
});

