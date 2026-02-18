/**
 * FieldLedger - One-Time Migration: Strip URL prefixes from stored file references
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 *
 * Ghost Ship Audit Fix #1 — "Zero Public URL" architecture.
 *
 * Problem: MongoDB documents store `url` fields like `/api/files/jobs/abc/doc.pdf`
 * or `https://worker.dev/jobs/abc/doc.pdf`. These point to the now-deleted
 * unauthenticated streaming endpoint. The database should store only the raw
 * R2 key (e.g. `jobs/abc/doc.pdf`).
 *
 * This script:
 *   1. Scans all Job documents for embedded document URLs in folders/subfolders
 *   2. Strips `/api/files/` prefix and any R2_PUBLIC_URL domain
 *   3. Sets `url = r2Key` where r2Key exists (r2Key is always the canonical value)
 *   4. Logs every change for audit trail
 *
 * Safe to run multiple times (idempotent).
 *
 * Usage:
 *   MONGO_URI=mongodb+srv://... node scripts/migrateFileUrls.js
 *   MONGO_URI=mongodb+srv://... node scripts/migrateFileUrls.js --dry-run
 */

require('dotenv').config();
const mongoose = require('mongoose');

const DRY_RUN = process.argv.includes('--dry-run');
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('FATAL: Set MONGODB_URI or MONGO_URI');
  process.exit(1);
}

// Prefixes to strip from stored URLs
const STRIP_PATTERNS = [
  /^\/api\/files\//,
  /^https?:\/\/[^/]+\/api\/files\//,   // full domain + /api/files/
  /^https?:\/\/[^/]+\//,               // any R2_PUBLIC_URL domain prefix
];

/**
 * Strip known URL prefixes, returning the bare R2 key.
 * If the value is already a bare key, returns it unchanged.
 */
function extractR2Key(urlOrKey) {
  if (!urlOrKey || typeof urlOrKey !== 'string') return urlOrKey;
  // Already a bare key (no slash prefix, no protocol)
  if (!urlOrKey.startsWith('/') && !urlOrKey.startsWith('http')) return urlOrKey;

  let cleaned = urlOrKey;
  for (const pattern of STRIP_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  return cleaned;
}

/**
 * Process a single document object (photo, drawing, etc.) inside a folder.
 * Returns true if modified.
 */
function processDoc(doc, jobId, path) {
  let modified = false;

  // If r2Key exists, it's authoritative — set url to match
  if (doc.r2Key) {
    if (doc.url !== doc.r2Key) {
      console.log(`  [FIX] ${path} url: "${doc.url}" → "${doc.r2Key}"`);
      doc.url = doc.r2Key;
      modified = true;
    }
  } else if (doc.url) {
    // No r2Key but has url — strip prefix and set both
    const cleanKey = extractR2Key(doc.url);
    if (cleanKey !== doc.url) {
      console.log(`  [FIX] ${path} url: "${doc.url}" → "${cleanKey}" (derived r2Key)`);
      doc.url = cleanKey;
      doc.r2Key = cleanKey;
      modified = true;
    }
  }

  return modified;
}

/**
 * Recursively process folders and subfolders in a job.
 */
function processFolders(folders, jobId, parentPath = '') {
  let modified = false;

  for (const folder of (folders || [])) {
    const folderPath = parentPath ? `${parentPath}/${folder.name}` : folder.name;

    for (const doc of (folder.documents || [])) {
      if (processDoc(doc, jobId, `${folderPath}/${doc.name || doc._id}`)) {
        modified = true;
      }
    }

    if (folder.subfolders?.length) {
      if (processFolders(folder.subfolders, jobId, folderPath)) {
        modified = true;
      }
    }
  }

  return modified;
}

async function migrate() {
  console.log(`\n=== File URL Migration ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`);

  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB\n');

  const Job = mongoose.model('Job', new mongoose.Schema({}, { strict: false, collection: 'jobs' }));

  const jobs = await Job.find({}).lean(false);
  console.log(`Found ${jobs.length} jobs to scan\n`);

  let totalFixed = 0;
  let jobsModified = 0;

  for (const job of jobs) {
    const jobLabel = `Job ${job.pmNumber || job.woNumber || job._id}`;
    let jobModified = false;

    // Process all folders
    if (processFolders(job.folders, job._id, jobLabel)) {
      jobModified = true;
    }

    // Process aiExtractedAssets array if present
    for (const asset of (job.aiExtractedAssets || [])) {
      if (processDoc(asset, job._id, `${jobLabel}/aiAsset`)) {
        jobModified = true;
      }
    }

    // Process constructionSketches array
    for (const sketch of (job.constructionSketches || [])) {
      if (processDoc(sketch, job._id, `${jobLabel}/sketch/${sketch.name || sketch._id}`)) {
        jobModified = true;
      }
    }

    if (jobModified) {
      jobsModified++;
      if (!DRY_RUN) {
        job.markModified('folders');
        job.markModified('aiExtractedAssets');
        job.markModified('constructionSketches');
        await job.save();
      }
      totalFixed++;
    }
  }

  // Also clean UnitEntry photo URLs
  let unitPhotosCleaned = 0;
  try {
    const UnitEntry = mongoose.model('UnitEntry',
      new mongoose.Schema({}, { strict: false, collection: 'unitentries' }));
    const units = await UnitEntry.find({ 'photos.url': { $regex: /^\/api\/files\// } }).lean(false);

    for (const unit of units) {
      let unitModified = false;
      for (const photo of (unit.photos || [])) {
        if (photo.r2Key && photo.url !== photo.r2Key) {
          photo.url = photo.r2Key;
          unitModified = true;
          unitPhotosCleaned++;
        } else if (photo.url) {
          const cleanKey = extractR2Key(photo.url);
          if (cleanKey !== photo.url) {
            photo.url = cleanKey;
            if (!photo.r2Key) photo.r2Key = cleanKey;
            unitModified = true;
            unitPhotosCleaned++;
          }
        }
      }
      if (unitModified && !DRY_RUN) {
        unit.markModified('photos');
        await unit.save();
      }
    }
  } catch (err) {
    console.log(`UnitEntry scan skipped: ${err.message}`);
  }

  console.log(`\n=== Results ===`);
  console.log(`Jobs scanned:     ${jobs.length}`);
  console.log(`Jobs modified:    ${jobsModified}`);
  console.log(`Unit photos:      ${unitPhotosCleaned}`);
  console.log(`Mode:             ${DRY_RUN ? 'DRY RUN (no changes saved)' : 'LIVE'}`);

  await mongoose.disconnect();
  console.log('\nDone.\n');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

