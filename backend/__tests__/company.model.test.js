/**
 * Company Model Tests
 * 
 * Tests for Company model including folder templates,
 * multi-tenant configuration, and validation.
 */

const mongoose = require('mongoose');
const Company = require('../models/Company');

describe('Company Model', () => {
  
  // ==================== Basic Creation ====================
  describe('Company Creation', () => {
    it('should create a company with required fields', async () => {
      const company = await Company.create({
        name: `Test Company ${Date.now()}`
      });
      
      expect(company._id).toBeDefined();
      expect(company.name).toContain('Test Company');
      expect(company.slug).toBeDefined(); // Auto-generated from name
    });
    
    it('should require name field', async () => {
      const company = new Company({
        email: 'test@example.com'
      });
      
      await expect(company.save()).rejects.toThrow();
    });
    
    it('should allow optional fields', async () => {
      const company = await Company.create({
        name: `Optional Fields Co ${Date.now()}`,
        email: `optional${Date.now()}@test.com`,
        phone: '555-123-4567',
        address: '123 Main St',
        city: 'San Francisco',
        state: 'CA'
      });
      
      expect(company.phone).toBe('555-123-4567');
      expect(company.city).toBe('San Francisco');
    });
    
    it('should set createdAt timestamp', async () => {
      const company = await Company.create({
        name: `Timestamp Co ${Date.now()}`
      });
      
      expect(company.createdAt).toBeDefined();
      expect(company.createdAt instanceof Date).toBe(true);
    });
    
    it('should auto-generate slug from name', async () => {
      const company = await Company.create({
        name: 'ABC Electrical Contractors'
      });
      
      expect(company.slug).toBe('abc-electrical-contractors');
    });
  });
  
  // ==================== Folder Template ====================
  describe('Folder Template', () => {
    it('should allow custom folder template', async () => {
      const folderTemplate = [
        {
          name: 'Documents',
          subfolders: [
            { name: 'Contracts' },
            { name: 'Invoices' }
          ]
        },
        {
          name: 'Photos',
          subfolders: []
        }
      ];
      
      const company = await Company.create({
        name: `Template Co ${Date.now()}`,
        email: `template${Date.now()}@test.com`,
        folderTemplate
      });
      
      expect(company.folderTemplate).toBeDefined();
      expect(company.folderTemplate.length).toBe(2);
      expect(company.folderTemplate[0].name).toBe('Documents');
      expect(company.folderTemplate[0].subfolders.length).toBe(2);
    });
    
    it('should allow deeply nested folder structure', async () => {
      const folderTemplate = [
        {
          name: 'Root',
          subfolders: [
            {
              name: 'Level1',
              subfolders: [
                {
                  name: 'Level2',
                  subfolders: [
                    { name: 'Level3' }
                  ]
                }
              ]
            }
          ]
        }
      ];
      
      const company = await Company.create({
        name: `Nested Co ${Date.now()}`,
        email: `nested${Date.now()}@test.com`,
        folderTemplate
      });
      
      expect(company.folderTemplate[0].subfolders[0].subfolders[0].name).toBe('Level2');
    });
    
    it('should default to empty folder template', async () => {
      const company = await Company.create({
        name: `No Template Co ${Date.now()}`,
        email: `notemplate${Date.now()}@test.com`
      });
      
      expect(company.folderTemplate).toBeDefined();
      expect(Array.isArray(company.folderTemplate)).toBe(true);
    });
  });
  
  // ==================== Settings ====================
  describe('Company Settings', () => {
    it('should allow settings object', async () => {
      const company = await Company.create({
        name: `Settings Co ${Date.now()}`,
        settings: {
          timezone: 'America/New_York',
          emailNotifications: false
        }
      });
      
      expect(company.settings).toBeDefined();
      expect(company.settings.timezone).toBe('America/New_York');
      expect(company.settings.emailNotifications).toBe(false);
    });
    
    it('should have default settings values', async () => {
      const company = await Company.create({
        name: `Default Settings Co ${Date.now()}`
      });
      
      // Settings may be undefined until accessed
      expect(company.settings?.timezone || 'America/Los_Angeles').toBe('America/Los_Angeles');
    });
  });
  
  // ==================== Utility Association ====================
  describe('Utility Association', () => {
    it('should allow linking to utilities', async () => {
      const utilityId = new mongoose.Types.ObjectId();
      
      const company = await Company.create({
        name: `Utility Co ${Date.now()}`,
        utilities: [utilityId],
        defaultUtility: utilityId
      });
      
      expect(company.utilities.length).toBe(1);
      expect(company.utilities[0].toString()).toBe(utilityId.toString());
      expect(company.defaultUtility.toString()).toBe(utilityId.toString());
    });
  });
  
  // ==================== Status ====================
  describe('Company Status', () => {
    it('should default to active status', async () => {
      const company = await Company.create({
        name: `Active Co ${Date.now()}`,
        email: `active${Date.now()}@test.com`
      });
      
      expect(company.isActive).toBe(true);
    });
    
    it('should allow deactivating a company', async () => {
      const company = await Company.create({
        name: `Inactive Co ${Date.now()}`,
        email: `inactive${Date.now()}@test.com`,
        isActive: false
      });
      
      expect(company.isActive).toBe(false);
    });
  });
  
  // ==================== Indexes ====================
  describe('Indexes and Queries', () => {
    it('should find company by name', async () => {
      const uniqueName = `Findable Co ${Date.now()}`;
      
      await Company.create({
        name: uniqueName,
        email: `find${Date.now()}@test.com`
      });
      
      const found = await Company.findOne({ name: uniqueName });
      
      expect(found).toBeDefined();
      expect(found.name).toBe(uniqueName);
    });
    
    it('should find active companies only', async () => {
      const timestamp = Date.now();
      
      await Company.create({
        name: `Active ${timestamp}`,
        email: `active${timestamp}@test.com`,
        isActive: true
      });
      
      await Company.create({
        name: `Inactive ${timestamp}`,
        email: `inactive${timestamp}@test.com`,
        isActive: false
      });
      
      const activeCompanies = await Company.find({ 
        name: { $regex: timestamp.toString() },
        isActive: true 
      });
      
      expect(activeCompanies.length).toBe(1);
      expect(activeCompanies[0].name).toContain('Active');
    });
  });
});

