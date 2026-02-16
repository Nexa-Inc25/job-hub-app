/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying prohibited.
 */
/**
 * Onboarding Routes - Contractor MSA upload and rate management.
 *
 * Admin uploads MSA PDF → system extracts rates → admin reviews → rates saved.
 * Rates then feed into LME totals, field ticket T&M, and PriceBook.
 *
 * @module routes/onboarding
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ContractRates = require('../models/ContractRates');
const User = require('../models/User');
const { extractRatesFromMSA } = require('../services/RateExtractor');
const r2Storage = require('../utils/storage');
const PriceBook = require('../models/PriceBook');
const { sanitizeObjectId, sanitizeString } = require('../utils/sanitize');

// Multer for MSA PDF upload
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (_req, file, cb) => {
    cb(file.mimetype === 'application/pdf' ? null : new Error('Only PDF files allowed'), file.mimetype === 'application/pdf');
  },
});

/**
 * POST /upload-msa
 * Upload MSA PDF, extract rates, return parsed preview.
 * Admin reviews before saving.
 */
router.post('/upload-msa', upload.single('msa'), async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const companyId = sanitizeObjectId(req.body.companyId) || user.companyId;
    const utilityCode = sanitizeString(req.body.utilityCode)?.toUpperCase() || 'PGE';

    // Read the uploaded PDF
    const pdfBuffer = fs.readFileSync(req.file.path);

    // Upload to R2 for permanent storage
    let r2Key = null;
    if (r2Storage.isR2Configured()) {
      try {
        r2Key = `onboarding/${companyId}/msa_${Date.now()}.pdf`;
        await r2Storage.uploadBuffer(pdfBuffer, r2Key, 'application/pdf');
      } catch (r2Err) {
        console.warn('[Onboarding] R2 upload failed:', r2Err.message);
      }
    }

    // Extract rates
    const extracted = await extractRatesFromMSA(pdfBuffer);

    // Clean up temp file
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    // Create draft ContractRates record
    const contractRates = new ContractRates({
      companyId,
      utilityCode,
      contractNumber: extracted.contractNumber,
      effectiveDate: extracted.effectiveDate || new Date(),
      expirationDate: extracted.expirationDate,
      unitRates: extracted.unitRates,
      laborRates: extracted.laborRates,
      crewRates: extracted.crewRates,
      equipmentRates: extracted.equipmentRates,
      sourceFile: {
        r2Key,
        fileName: req.file.originalname,
        uploadedAt: new Date(),
      },
      uploadedBy: req.userId,
      parsedAt: new Date(),
      status: 'draft',
    });

    await contractRates.save();

    res.status(201).json({
      success: true,
      ratesId: contractRates._id,
      summary: {
        contractNumber: extracted.contractNumber,
        unitRates: extracted.unitRates.length,
        laborRates: extracted.laborRates.length,
        crewRates: extracted.crewRates.length,
        equipmentRates: extracted.equipmentRates.length,
      },
      rates: contractRates,
    });
  } catch (err) {
    // Clean up temp file on error
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('[Onboarding] MSA upload error:', err);
    res.status(500).json({ error: 'Failed to process MSA', details: err.message });
  }
});

/**
 * PUT /rates/:id
 * Admin reviews/corrects extracted rates and activates them.
 */
router.put('/rates/:id', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const ratesId = sanitizeObjectId(req.params.id);
    if (!ratesId) return res.status(400).json({ error: 'Invalid rates ID' });

    const contractRates = await ContractRates.findById(ratesId);
    if (!contractRates) {
      return res.status(404).json({ error: 'Contract rates not found' });
    }

    const { unitRates, laborRates, crewRates, equipmentRates, status, contractNumber, effectiveDate, expirationDate } = req.body;

    // Update editable fields
    if (unitRates) contractRates.unitRates = unitRates;
    if (laborRates) contractRates.laborRates = laborRates;
    if (crewRates) contractRates.crewRates = crewRates;
    if (equipmentRates) contractRates.equipmentRates = equipmentRates;
    if (contractNumber) contractRates.contractNumber = sanitizeString(contractNumber);
    if (effectiveDate) contractRates.effectiveDate = new Date(effectiveDate);
    if (expirationDate) contractRates.expirationDate = new Date(expirationDate);

    // Handle status transitions
    if (status === 'active') {
      // Deactivate any existing active rates for this company+utility
      await ContractRates.updateMany(
        { companyId: contractRates.companyId, utilityCode: contractRates.utilityCode, isActive: true, _id: { $ne: ratesId } },
        { $set: { isActive: false, status: 'superseded' } }
      );
      contractRates.status = 'active';
      contractRates.isActive = true;
      contractRates.reviewedBy = req.userId;
      contractRates.reviewedAt = new Date();
    } else if (status === 'reviewed') {
      contractRates.status = 'reviewed';
      contractRates.reviewedBy = req.userId;
      contractRates.reviewedAt = new Date();
    }

    await contractRates.save();

    // Auto-populate PriceBook when rates are activated
    if (status === 'active' && contractRates.unitRates?.length) {
      try {
        // Find the utility for this company
        const Company = require('../models/Company');
        const company = await Company.findById(contractRates.companyId).select('defaultUtility utilities').lean();
        const utilityId = company?.defaultUtility || company?.utilities?.[0];

        if (utilityId) {
          // Build PriceBook items from MSA unit rates
          const items = [];
          for (const unitRate of contractRates.unitRates) {
            // Use the first region rate as the default (admin can change division later)
            const defaultRate = unitRate.regionRates?.[0]?.rate || 0;
            if (defaultRate === 0) continue;

            // Map work type to category
            let category = 'electrical';
            if (unitRate.workType?.toLowerCase().includes('ug') || unitRate.workType?.toLowerCase().includes('underground')) category = 'underground';
            else if (unitRate.workType?.toLowerCase().includes('oh') || unitRate.workType?.toLowerCase().includes('overhead')) category = 'overhead';
            else if (unitRate.workType?.toLowerCase().includes('tree') || unitRate.workType?.toLowerCase().includes('veg')) category = 'vegetation';

            items.push({
              itemCode: unitRate.refCode,
              description: unitRate.unitDescription,
              shortDescription: unitRate.unitDescription.substring(0, 40),
              category,
              subcategory: unitRate.workType,
              workType: unitRate.workType,
              unit: unitRate.unitOfMeasure === 'Each' ? 'EA' : unitRate.unitOfMeasure === 'Foot' ? 'LF' : unitRate.unitOfMeasure === 'Hourly' ? 'HR' : 'EA',
              unitPrice: defaultRate,
              laborRate: Math.round(defaultRate * (unitRate.laborPercent || 0.79) * 100) / 100,
              materialRate: Math.round(defaultRate * (1 - (unitRate.laborPercent || 0.79)) * 100) / 100,
              isActive: true,
              effectiveDate: contractRates.effectiveDate,
              expirationDate: contractRates.expirationDate,
            });
          }

          if (items.length > 0) {
            // Upsert PriceBook
            const pbName = `${contractRates.utilityCode} MSA Rates ${new Date().getFullYear()}`;
            await PriceBook.findOneAndUpdate(
              { companyId: contractRates.companyId, utilityId, contractNumber: contractRates.contractNumber },
              {
                $set: {
                  name: pbName,
                  description: `Auto-populated from MSA ${contractRates.contractNumber}`,
                  contractNumber: contractRates.contractNumber,
                  items,
                  status: 'active',
                  effectiveDate: contractRates.effectiveDate,
                  expirationDate: contractRates.expirationDate,
                },
                $setOnInsert: {
                  companyId: contractRates.companyId,
                  utilityId,
                },
              },
              { upsert: true, new: true }
            );
            console.log(`[Onboarding] PriceBook populated with ${items.length} items from MSA`);
          }
        }
      } catch (pbErr) {
        console.warn('[Onboarding] PriceBook population failed (non-fatal):', pbErr.message);
      }
    }

    res.json({ success: true, rates: contractRates });
  } catch (err) {
    console.error('[Onboarding] Rate update error:', err);
    res.status(500).json({ error: 'Failed to update rates' });
  }
});

/**
 * GET /rates/me
 * Get active contract rates for the current user's company.
 * Used by frontend components to auto-fill labor/equipment rates.
 */
router.get('/rates/me', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const activeOnly = req.query.active === 'true';
    const query = { companyId: user.companyId };
    if (activeOnly) {
      query.isActive = true;
      query.status = 'active';
    }

    const rates = await ContractRates.find(query).sort({ createdAt: -1 }).lean();
    res.json(rates);
  } catch (err) {
    console.error('[Onboarding] Get my rates error:', err);
    res.status(500).json({ error: 'Failed to get rates' });
  }
});

/**
 * GET /rates/:companyId
 * Get all contract rates for a company (or just active).
 */
router.get('/rates/:companyId', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.companyId) {
      return res.status(400).json({ error: 'User not associated with a company' });
    }

    const companyId = sanitizeObjectId(req.params.companyId) || user.companyId;
    const activeOnly = req.query.active === 'true';

    const query = { companyId };
    if (activeOnly) {
      query.isActive = true;
      query.status = 'active';
    }

    const rates = await ContractRates.find(query).sort({ createdAt: -1 }).lean();
    res.json(rates);
  } catch (err) {
    console.error('[Onboarding] Get rates error:', err);
    res.status(500).json({ error: 'Failed to get rates' });
  }
});

/**
 * GET /rates/:companyId/labor/:classification
 * Get a specific labor rate for auto-fill in LME/field tickets.
 */
router.get('/rates/:companyId/labor/:classification', async (req, res) => {
  try {
    const companyId = sanitizeObjectId(req.params.companyId);
    const classification = decodeURIComponent(req.params.classification);

    const rates = await ContractRates.getActiveRates(companyId);
    if (!rates) {
      return res.status(404).json({ error: 'No active contract rates found' });
    }

    const laborRate = rates.laborRates?.find(
      r => r.classification.toLowerCase() === classification.toLowerCase()
    );

    if (!laborRate) {
      return res.status(404).json({ error: `No rate found for classification: ${classification}` });
    }

    res.json(laborRate);
  } catch (err) {
    console.error('[Onboarding] Get labor rate error:', err);
    res.status(500).json({ error: 'Failed to get labor rate' });
  }
});

/**
 * GET /rates/:companyId/equipment
 * Get all equipment rates for auto-fill.
 */
router.get('/rates/:companyId/equipment', async (req, res) => {
  try {
    const companyId = sanitizeObjectId(req.params.companyId);
    const rates = await ContractRates.getActiveRates(companyId);
    if (!rates) {
      return res.status(404).json({ error: 'No active contract rates found' });
    }
    res.json(rates.equipmentRates || []);
  } catch (err) {
    console.error('[Onboarding] Get equipment rates error:', err);
    res.status(500).json({ error: 'Failed to get equipment rates' });
  }
});

module.exports = router;
