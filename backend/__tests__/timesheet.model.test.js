/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Timesheet Model Tests
 * 
 * Tests the daily crew time tracking model including:
 * - Schema validation
 * - Compound unique index (jobId + date)
 * - Crew member entries with time entries
 * - Status workflow
 */

const Timesheet = require('../models/Timesheet');
const Company = require('../models/Company');
const Job = require('../models/Job');

describe('Timesheet Model', () => {
  let company, job;

  beforeEach(async () => {
    company = await Company.create({ name: 'Test Co' });
    job = await Job.create({
      title: 'Test Job',
      pmNumber: `PM-${Date.now()}`,
      companyId: company._id,
    });
  });

  const validTimesheetData = () => ({
    jobId: job._id,
    companyId: company._id,
    date: new Date('2026-02-10'),
    crewMembers: [{
      name: 'John Doe',
      classification: 'Journeyman',
      employeeId: 'EMP-001',
      entries: [{
        clockIn: new Date('2026-02-10T07:00:00'),
        clockOut: new Date('2026-02-10T15:30:00'),
        breakMinutes: 30,
        workType: 'regular',
      }],
    }],
    totalHours: 8,
  });

  describe('Schema Validation', () => {
    it('should create a timesheet with valid data', async () => {
      const ts = await Timesheet.create(validTimesheetData());
      expect(ts._id).toBeDefined();
      expect(ts.status).toBe('draft');
      expect(ts.crewMembers).toHaveLength(1);
    });

    it('should require jobId', async () => {
      const data = validTimesheetData();
      delete data.jobId;
      await expect(Timesheet.create(data)).rejects.toThrow();
    });

    it('should require companyId', async () => {
      const data = validTimesheetData();
      delete data.companyId;
      await expect(Timesheet.create(data)).rejects.toThrow();
    });

    it('should require date', async () => {
      const data = validTimesheetData();
      delete data.date;
      await expect(Timesheet.create(data)).rejects.toThrow();
    });

    it('should default status to draft', async () => {
      const ts = await Timesheet.create(validTimesheetData());
      expect(ts.status).toBe('draft');
    });

    it('should only accept valid status values', async () => {
      const data = validTimesheetData();
      data.status = 'invalid';
      await expect(Timesheet.create(data)).rejects.toThrow();
    });

    it('should accept all valid status values', async () => {
      for (const status of ['draft', 'submitted', 'approved', 'rejected']) {
        const data = validTimesheetData();
        data.status = status;
        data.date = new Date(`2026-02-${10 + ['draft', 'submitted', 'approved', 'rejected'].indexOf(status)}`);
        const ts = await Timesheet.create(data);
        expect(ts.status).toBe(status);
      }
    });

    it('should accept valid workType values', async () => {
      for (const workType of ['regular', 'overtime', 'double', 'travel', 'standby']) {
        const data = validTimesheetData();
        data.crewMembers[0].entries[0].workType = workType;
        data.date = new Date(Date.now() + Math.random() * 10000000);
        const ts = await Timesheet.create(data);
        expect(ts.crewMembers[0].entries[0].workType).toBe(workType);
      }
    });

    it('should default breakMinutes to 30', async () => {
      const data = validTimesheetData();
      delete data.crewMembers[0].entries[0].breakMinutes;
      const ts = await Timesheet.create(data);
      expect(ts.crewMembers[0].entries[0].breakMinutes).toBe(30);
    });
  });

  describe('Compound Unique Index', () => {
    it('should enforce unique job+date constraint', async () => {
      await Timesheet.create(validTimesheetData());
      await expect(Timesheet.create(validTimesheetData())).rejects.toThrow();
    });

    it('should allow same job on different dates', async () => {
      await Timesheet.create(validTimesheetData());
      const data = validTimesheetData();
      data.date = new Date('2026-02-11');
      const ts = await Timesheet.create(data);
      expect(ts._id).toBeDefined();
    });
  });

  describe('Crew Members', () => {
    it('should require crew member name', async () => {
      const data = validTimesheetData();
      data.crewMembers[0].name = '';
      await expect(Timesheet.create(data)).rejects.toThrow();
    });

    it('should support multiple crew members', async () => {
      const data = validTimesheetData();
      data.crewMembers.push({
        name: 'Jane Smith',
        classification: 'Apprentice',
        entries: [{
          clockIn: new Date('2026-02-10T08:00:00'),
          clockOut: new Date('2026-02-10T16:00:00'),
          workType: 'regular',
        }],
      });
      const ts = await Timesheet.create(data);
      expect(ts.crewMembers).toHaveLength(2);
    });

    it('should support GPS location on time entries', async () => {
      const data = validTimesheetData();
      data.crewMembers[0].entries[0].gpsLocation = {
        latitude: 37.7749,
        longitude: -122.4194,
      };
      const ts = await Timesheet.create(data);
      expect(ts.crewMembers[0].entries[0].gpsLocation.latitude).toBe(37.7749);
    });
  });
});

