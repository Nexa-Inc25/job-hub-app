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

  describe('Field Validation Rules', () => {
    it('should store validation rules on fields', async () => {
      const data = validTemplateData();
      data.fields[0].validation = {
        required: true,
        requiredMessage: 'Contractor name is required',
        minLength: 2,
        maxLength: 100,
      };
      const tpl = await FormTemplate.create(data);
      expect(tpl.fields[0].validation.required).toBe(true);
      expect(tpl.fields[0].validation.minLength).toBe(2);
      expect(tpl.fields[0].validation.maxLength).toBe(100);
    });

    it('should default validation to empty object', async () => {
      const tpl = await FormTemplate.create(validTemplateData());
      expect(tpl.fields[0].validation).toBeDefined();
      expect(tpl.fields[0].validation.required).toBe(false);
    });

    it('should store format preset', async () => {
      const data = validTemplateData();
      data.fields[0].validation = { formatPreset: 'phone' };
      const tpl = await FormTemplate.create(data);
      expect(tpl.fields[0].validation.formatPreset).toBe('phone');
    });

    it('should reject invalid format preset', async () => {
      const data = validTemplateData();
      data.fields[0].validation = { formatPreset: 'invalid_preset' };
      await expect(FormTemplate.create(data)).rejects.toThrow();
    });

    it('should store cross-field rules', async () => {
      const data = validTemplateData();
      data.fields.push({
        id: 'field_2', name: 'end_date', page: 1, type: 'date',
        bounds: { x: 100, y: 600, width: 200, height: 20 },
        validation: {
          crossFieldRules: [{
            field: 'contractor_name',
            operator: 'neq',
            message: 'End date must differ from contractor name',
          }],
        },
      });
      const tpl = await FormTemplate.create(data);
      expect(tpl.fields[1].validation.crossFieldRules).toHaveLength(1);
      expect(tpl.fields[1].validation.crossFieldRules[0].operator).toBe('neq');
    });

    it('should reject invalid cross-field operator', async () => {
      const data = validTemplateData();
      data.fields[0].validation = {
        crossFieldRules: [{ field: 'other', operator: 'invalid_op' }],
      };
      await expect(FormTemplate.create(data)).rejects.toThrow();
    });
  });

  describe('validateFieldValues method', () => {
    it('should pass valid values', async () => {
      const data = validTemplateData();
      data.fields[0].validation = { required: true, minLength: 2 };
      const tpl = await FormTemplate.create(data);
      const result = tpl.validateFieldValues({ contractor_name: 'Alvah Electric' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail required empty field', async () => {
      const data = validTemplateData();
      data.fields[0].validation = { required: true };
      const tpl = await FormTemplate.create(data);
      const result = tpl.validateFieldValues({ contractor_name: '' });
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('contractor_name');
    });

    it('should fail minLength violation', async () => {
      const data = validTemplateData();
      data.fields[0].validation = { minLength: 5 };
      const tpl = await FormTemplate.create(data);
      const result = tpl.validateFieldValues({ contractor_name: 'AB' });
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('Minimum length');
    });

    it('should fail maxLength violation', async () => {
      const data = validTemplateData();
      data.fields[0].validation = { maxLength: 5 };
      const tpl = await FormTemplate.create(data);
      const result = tpl.validateFieldValues({ contractor_name: 'Very Long Name' });
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('Maximum length');
    });

    it('should validate phone format preset', async () => {
      const data = validTemplateData();
      data.fields[0].type = 'text';
      data.fields[0].validation = { formatPreset: 'phone' };
      const tpl = await FormTemplate.create(data);

      const valid = tpl.validateFieldValues({ contractor_name: '(555) 123-4567' });
      expect(valid.valid).toBe(true);

      const invalid = tpl.validateFieldValues({ contractor_name: 'not a phone' });
      expect(invalid.valid).toBe(false);
    });

    it('should validate email format preset', async () => {
      const data = validTemplateData();
      data.fields[0].validation = { formatPreset: 'email' };
      const tpl = await FormTemplate.create(data);

      expect(tpl.validateFieldValues({ contractor_name: 'test@example.com' }).valid).toBe(true);
      expect(tpl.validateFieldValues({ contractor_name: 'not-email' }).valid).toBe(false);
    });

    it('should validate custom pattern', async () => {
      const data = validTemplateData();
      data.fields[0].validation = { pattern: '^[A-Z]{2}-\\d{4}$', patternMessage: 'Must be XX-0000 format' };
      const tpl = await FormTemplate.create(data);

      expect(tpl.validateFieldValues({ contractor_name: 'PM-1234' }).valid).toBe(true);
      expect(tpl.validateFieldValues({ contractor_name: 'invalid' }).valid).toBe(false);
    });

    it('should validate numeric range', async () => {
      const data = validTemplateData();
      data.fields[0].type = 'number';
      data.fields[0].validation = { min: 0, max: 100 };
      const tpl = await FormTemplate.create(data);

      expect(tpl.validateFieldValues({ contractor_name: '50' }).valid).toBe(true);
      expect(tpl.validateFieldValues({ contractor_name: '-5' }).valid).toBe(false);
      expect(tpl.validateFieldValues({ contractor_name: '150' }).valid).toBe(false);
    });

    it('should validate cross-field rules (gt)', async () => {
      const data = validTemplateData();
      data.fields.push({
        id: 'field_end', name: 'end_value', page: 1, type: 'number',
        bounds: { x: 0, y: 0, width: 100, height: 20 },
        validation: {
          crossFieldRules: [{
            field: 'contractor_name',
            operator: 'gt',
            message: 'End must be greater than start',
          }],
        },
      });
      const tpl = await FormTemplate.create(data);

      const valid = tpl.validateFieldValues({ contractor_name: '10', end_value: '20' });
      expect(valid.valid).toBe(true);

      const invalid = tpl.validateFieldValues({ contractor_name: '20', end_value: '10' });
      expect(invalid.valid).toBe(false);
      expect(invalid.errors[0].message).toBe('End must be greater than start');
    });

    it('should skip validation for empty non-required fields', async () => {
      const data = validTemplateData();
      data.fields[0].validation = { minLength: 5, formatPreset: 'email' };
      const tpl = await FormTemplate.create(data);
      const result = tpl.validateFieldValues({ contractor_name: '' });
      expect(result.valid).toBe(true);
    });
  });
});

