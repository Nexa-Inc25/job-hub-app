/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 *
 * AsBuiltRouter orchestration tests.
 * Uses mock adapters to test the routing pipeline without real API calls.
 */

// Mock all models and adapters
jest.mock('../models/AsBuiltSubmission');
jest.mock('../models/RoutingRule');

const AsBuiltSubmission = require('../models/AsBuiltSubmission');

describe('AsBuiltRouter', () => {
  describe('getDefaultDestination', () => {
    const router = require('../services/asbuilt/AsBuiltRouter');

    test('routes construction sketch to GIS', () => {
      expect(router.getDefaultDestination('construction_sketch')).toBe('gis_esri');
    });

    test('routes face sheet to Oracle PPM', () => {
      expect(router.getDefaultDestination('face_sheet')).toBe('oracle_ppm');
    });

    test('routes billing form to Oracle Payables', () => {
      expect(router.getDefaultDestination('billing_form')).toBe('oracle_payables');
    });

    test('routes CCSC to regulatory portal', () => {
      expect(router.getDefaultDestination('ccsc')).toBe('regulatory_portal');
    });

    test('routes permits to SharePoint', () => {
      expect(router.getDefaultDestination('permits')).toBe('sharepoint_permits');
    });

    test('routes unknown section type to archive', () => {
      expect(router.getDefaultDestination('unknown_type')).toBe('archive');
    });

    test('routes crew instructions to estimating email', () => {
      expect(router.getDefaultDestination('crew_instructions')).toBe('email_estimating');
    });

    test('routes photos to Oracle EAM', () => {
      expect(router.getDefaultDestination('photos')).toBe('oracle_eam');
    });
  });

  describe('mapRuleToDestination', () => {
    const router = require('../services/asbuilt/AsBuiltRouter');

    test('maps oracle_api PPM rule to oracle_ppm', () => {
      const rule = { destination: { type: 'oracle_api', oracle: { module: 'ppm' } } };
      expect(router.mapRuleToDestination(rule)).toBe('oracle_ppm');
    });

    test('maps oracle_api EAM rule to oracle_eam', () => {
      const rule = { destination: { type: 'oracle_api', oracle: { module: 'eam' } } };
      expect(router.mapRuleToDestination(rule)).toBe('oracle_eam');
    });

    test('maps oracle_api payables rule to oracle_payables', () => {
      const rule = { destination: { type: 'oracle_api', oracle: { module: 'payables' } } };
      expect(router.mapRuleToDestination(rule)).toBe('oracle_payables');
    });

    test('maps sharepoint rule to sharepoint_do', () => {
      const rule = { destination: { type: 'sharepoint' } };
      expect(router.mapRuleToDestination(rule)).toBe('sharepoint_do');
    });

    test('maps gis_api rule to gis_esri', () => {
      const rule = { destination: { type: 'gis_api' } };
      expect(router.mapRuleToDestination(rule)).toBe('gis_esri');
    });

    test('maps email rule to email_mapping', () => {
      const rule = { destination: { type: 'email' } };
      expect(router.mapRuleToDestination(rule)).toBe('email_mapping');
    });

    test('defaults unknown types to archive', () => {
      const rule = { destination: { type: 'ftp' } };
      expect(router.mapRuleToDestination(rule)).toBe('archive');
    });
  });

  describe('getAdapter', () => {
    const router = require('../services/asbuilt/AsBuiltRouter');

    // Clear cached adapters before each test
    beforeEach(() => {
      router.adapters = {};
    });

    test('returns OracleAdapter for oracle_ppm', async () => {
      const adapter = await router.getAdapter('oracle_ppm');
      expect(adapter).toBeDefined();
      expect(adapter.constructor.name).toBe('OracleAdapter');
    });

    test('returns GISAdapter for gis_esri', async () => {
      const adapter = await router.getAdapter('gis_esri');
      expect(adapter).toBeDefined();
      expect(adapter.constructor.name).toBe('GISAdapter');
    });

    test('returns EmailAdapter for email_mapping', async () => {
      const adapter = await router.getAdapter('email_mapping');
      expect(adapter).toBeDefined();
      expect(adapter.constructor.name).toBe('EmailAdapter');
    });

    test('returns SharePointAdapter for sharepoint_do', async () => {
      const adapter = await router.getAdapter('sharepoint_do');
      expect(adapter).toBeDefined();
      expect(adapter.constructor.name).toBe('SharePointAdapter');
    });

    test('returns RegulatoryAdapter for regulatory_portal', async () => {
      const adapter = await router.getAdapter('regulatory_portal');
      expect(adapter).toBeDefined();
      expect(adapter.constructor.name).toBe('RegulatoryAdapter');
    });

    test('returns ArchiveAdapter for unknown destinations', async () => {
      const adapter = await router.getAdapter('unknown_dest');
      expect(adapter).toBeDefined();
      expect(adapter.constructor.name).toBe('ArchiveAdapter');
    });

    test('caches adapters on repeated calls', async () => {
      const adapter1 = await router.getAdapter('oracle_ppm');
      const adapter2 = await router.getAdapter('oracle_ppm');
      expect(adapter1).toBe(adapter2);
    });
  });

  describe('getSubmissionStatus', () => {
    const router = require('../services/asbuilt/AsBuiltRouter');

    test('returns null for non-existent submission', async () => {
      AsBuiltSubmission.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue(null),
          }),
        }),
      });

      const status = await router.getSubmissionStatus('nonexistent');
      expect(status).toBeNull();
    });

    test('returns formatted status for existing submission', async () => {
      const mockSubmission = {
        submissionId: 'ASB-202602-00001',
        status: 'delivered',
        pmNumber: '35589054',
        submittedAt: new Date(),
        submittedBy: { name: 'John Doe' },
        processingDuration: 5000,
        routingSummary: { totalSections: 5, deliveredSections: 5 },
        sections: [
          {
            sectionType: 'face_sheet',
            pageStart: 1,
            pageEnd: 3,
            destination: 'oracle_ppm',
            deliveryStatus: 'delivered',
            deliveredAt: new Date(),
            externalReferenceId: 'ORA-123',
            deliveryError: null,
          },
        ],
        utilityAcknowledged: false,
        auditLog: [],
      };

      AsBuiltSubmission.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue(mockSubmission),
          }),
        }),
      });

      const status = await router.getSubmissionStatus('test-id');
      expect(status).toBeDefined();
      expect(status.submissionId).toBe('ASB-202602-00001');
      expect(status.status).toBe('delivered');
      expect(status.sections).toHaveLength(1);
      expect(status.sections[0].type).toBe('face_sheet');
      expect(status.sections[0].destination).toBe('oracle_ppm');
    });
  });
});
