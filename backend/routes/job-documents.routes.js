/**
 * FieldLedger - Job Document Routes
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 * 
 * All file upload/download operations for jobs: folder uploads, photo uploads,
 * document management (approve/reject/delete/update), folder CRUD,
 * export packages. Mounted at /api/jobs with auth middleware.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const Job = require('../models/Job');
const User = require('../models/User');
const r2Storage = require('../utils/storage');
const { logDocument, logExport } = require('../middleware/auditLogger');
const mongoose = require('mongoose');
const { classifyPages } = require('../services/asbuilt/PageClassifier');
const UtilityAsBuiltConfig = require('../models/UtilityAsBuiltConfig');

/**
 * Auto-classify a job package PDF in the background after upload.
 * Only runs if the PDF has 5+ pages (likely a job package, not a single form).
 * Non-blocking — errors are logged but don't affect the upload.
 */
async function tryAutoClassifyJobPackage(jobId, pdfR2Key) {
  try {
    if (!r2Storage.isR2Configured() || !pdfR2Key) return;

    // Load PDF from R2
    const fileData = await r2Storage.getFileStream(pdfR2Key);
    if (!fileData?.stream) return;

    const chunks = [];
    for await (const chunk of fileData.stream) {
      chunks.push(chunk);
    }
    const pdfBuffer = Buffer.concat(chunks);

    // Quick page count check — skip small PDFs (single forms, not job packages)
    const { PDFDocument } = require('pdf-lib');
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    if (pdfDoc.getPageCount() < 5) return;

    // Load utility config (default to PG&E for now)
    const job = await Job.findById(jobId).select('utilityId companyId').lean();
    if (!job) return;

    // Try to find the utility config — fall back to PGE
    const config = await UtilityAsBuiltConfig.findOne({ isActive: true }).lean();
    if (!config?.pageRanges?.length) return;

    // Run classification
    const classification = await classifyPages(pdfBuffer, config.pageRanges);

    // Save to job (atomic update to avoid version conflicts with concurrent saves)
    await Job.findByIdAndUpdate(jobId, {
      $set: {
        packageClassification: classification,
        packageClassifiedAt: new Date(),
        packagePdfKey: pdfR2Key,
      },
    });

    const classifiedCount = classification.filter(c => c.sectionType !== 'other').length;
    console.log(`[AutoClassify] Job ${jobId}: ${classifiedCount}/${classification.length} pages classified`);
  } catch (err) {
    console.warn('[AutoClassify] Failed:', err.message);
  }
}
const { validateUrl } = require('../utils/urlValidator');

// Optional dependencies (may not be installed)
let heicConvert, sharp;
try { heicConvert = require('heic-convert'); } catch { heicConvert = null; }
try { sharp = require('sharp'); } catch { sharp = null; }

// Reuse uploads directory
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

router.post('/:id/folders/:folderName/upload', upload.array('files', 10), async (req, res) => {
  try {
    const { id, folderName } = req.params;
    const { subfolder } = req.body; // Optional subfolder name
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const currentUser = await User.findById(req.userId).select('companyId');

    // Allow file upload if user has access to this job (IN THEIR COMPANY)
    const query = { _id: id };
    if (currentUser?.companyId) {
      query.companyId = currentUser.companyId;
    }
    
    let job;
    if (req.isAdmin || req.userRole === 'pm' || req.userRole === 'admin') {
      job = await Job.findOne(query);
    } else {
      query.$or = [
        { userId: req.userId },
        { assignedTo: req.userId },
        { assignedToGF: req.userId }
      ];
      job = await Job.findOne(query);
    }
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found or you do not have access' });
    }
    
    // Find the folder
    const folder = job.folders.find(f => f.name === folderName);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    // Determine where to add documents
    // Supports nested subfolders with path like "Pre-Field Documents/Job Photos"
    let targetDocuments;
    if (subfolder) {
      const subfolderParts = subfolder.split('/');
      let currentFolder = folder;
      
      for (const part of subfolderParts) {
        const subfolderObj = currentFolder.subfolders?.find(sf => sf.name === part);
        if (!subfolderObj) {
          return res.status(404).json({ error: `Subfolder not found: ${part}` });
        }
        currentFolder = subfolderObj;
      }
      targetDocuments = currentFolder.documents;
    } else {
      targetDocuments = folder.documents;
    }
    
    // Upload files to R2 and create document records
    const uploadedDocs = [];
    for (const file of req.files) {
      let docUrl = `/uploads/${path.basename(file.path)}`;
      let r2Key = null;
      let finalName = file.originalname;
      let fileToUpload = file.path;
      let tempConvertedFile = null;
      
      // Convert HEIC to JPEG (iPhone photos)
      const isHeic = file.originalname.toLowerCase().endsWith('.heic') || 
                     file.originalname.toLowerCase().endsWith('.heif') ||
                     file.mimetype === 'image/heic' || 
                     file.mimetype === 'image/heif';
      
      if (isHeic) {
        try {
          console.log('Converting HEIC to JPEG:', file.originalname);
          tempConvertedFile = file.path + '.jpg';
          const inputBuffer = fs.readFileSync(file.path);
          const outputBuffer = await heicConvert({
            buffer: inputBuffer,
            format: 'JPEG',
            quality: 0.9
          });
          fs.writeFileSync(tempConvertedFile, Buffer.from(outputBuffer));
          fileToUpload = tempConvertedFile;
          // Update filename to .jpg
          finalName = file.originalname.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg');
          // Update docUrl for local storage (Bug fix: was pointing to original HEIC file)
          docUrl = `/uploads/${path.basename(tempConvertedFile)}`;
          console.log('HEIC converted successfully:', finalName);
        } catch (convertErr) {
          console.error('Failed to convert HEIC:', convertErr.message);
          // Continue with original file
        }
      }
      
      if (r2Storage.isR2Configured()) {
        try {
          const folderPath = subfolder ? `${folderName}/${subfolder}` : folderName;
          const result = await r2Storage.uploadJobFile(fileToUpload, id, folderPath, finalName);
          docUrl = r2Storage.getPublicUrl(result.key);
          r2Key = result.key;
        } catch (uploadErr) {
          console.error('Failed to upload to R2:', uploadErr.message);
        }
      }
      
      // Clean up local files (always, regardless of R2 configuration)
      try {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
        if (tempConvertedFile && fs.existsSync(tempConvertedFile)) {
          fs.unlinkSync(tempConvertedFile);
        }
      } catch (cleanupErr) {
        console.error('Failed to clean up temp files:', cleanupErr.message);
      }
      
      uploadedDocs.push({
        name: finalName,
        url: docUrl,
        r2Key: r2Key,
        type: file.mimetype.includes('pdf') ? 'pdf' : file.mimetype.includes('image') || isHeic ? 'image' : 'other',
        uploadDate: new Date(),
        uploadedBy: req.userId
      });
    }
    
    targetDocuments.push(...uploadedDocs);
    
    // Retry save with version conflict handling
    let retries = 3;
    while (retries > 0) {
      try {
        job.markModified('folders'); // Ensure Mongoose detects nested changes
    await job.save();
        break; // Success
      } catch (saveErr) {
        if (saveErr.name === 'VersionError' && retries > 1) {
          console.log(`Version conflict saving job ${job._id}, retrying... (${retries - 1} left)`);
          // Reload the job and re-apply the documents
          const freshJob = await Job.findById(job._id);
          if (freshJob) {
            // Re-find the target folder/subfolder
            const freshFolder = freshJob.folders.find(f => f.name === folderName);
            if (freshFolder) {
              let freshTarget = freshFolder.documents;
              if (subfolder) {
                const parts = subfolder.split('/');
                let curr = freshFolder;
                for (const part of parts) {
                  curr = curr.subfolders?.find(sf => sf.name === part);
                  if (!curr) break;
                }
                if (curr) freshTarget = curr.documents;
              }
              // Only add docs that aren't already there (by r2Key or name)
              for (const doc of uploadedDocs) {
                const exists = freshTarget.some(d => d.r2Key === doc.r2Key || d.name === doc.name);
                if (!exists) {
                  freshTarget.push(doc);
                }
              }
              job = freshJob;
            }
          }
          retries--;
        } else if (saveErr.name === 'VersionError') {
          // Last retry - use atomic update as fallback (consistent with extraction endpoint)
          console.log('Final retry failed, using atomic update for file upload');
          
          // Build the path to the target array
          let arrayPath = `folders.$[folder].documents`;
          const arrayFilters = [{ 'folder.name': folderName }];
          
          if (subfolder) {
            const parts = subfolder.split('/');
            if (parts.length === 1) {
              arrayPath = `folders.$[folder].subfolders.$[sub].documents`;
              arrayFilters.push({ 'sub.name': parts[0] });
            } else if (parts.length === 2) {
              arrayPath = `folders.$[folder].subfolders.$[sub].subfolders.$[nested].documents`;
              arrayFilters.push({ 'sub.name': parts[0] }, { 'nested.name': parts[1] });
            }
          }
          
          // Use $push with $each for atomic document addition
          await Job.findByIdAndUpdate(
            job._id,
            { $push: { [arrayPath]: { $each: uploadedDocs } } },
            { arrayFilters }
          );
          break;
        } else {
          throw saveErr;
        }
      }
    }
    
    res.json({ message: 'Files uploaded successfully', documents: uploadedDocs });

    // Auto-classify if a multi-page PDF was uploaded (likely a job package)
    const pdfDocs = uploadedDocs.filter(d => d.type === 'pdf' && d.r2Key);
    if (pdfDocs.length > 0) {
      // Fire async — don't block the upload response
      tryAutoClassifyJobPackage(job._id, pdfDocs[0].r2Key).catch(err => {
        console.warn('[AutoClassify] Background classification failed:', err.message);
      });
    }
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

// ==================== GENERIC FILE UPLOAD ====================
// Used by ForemanCloseOut and other components to upload files to a job folder
// Supports: folder, subfolder, file (single file upload)
router.post('/:id/upload', upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    const { folder = 'ACI', subfolder = 'GF Audit', photoType, latitude, longitude } = req.body;
    
    const currentUser = await User.findById(req.userId).select('companyId');
    
    // Build query with company filter
    const query = { _id: id };
    if (currentUser?.companyId) {
      query.companyId = currentUser.companyId;
    }
    
    // Allow access for admin/PM or assigned users
    if (!(req.isAdmin || req.userRole === 'pm' || req.userRole === 'admin')) {
      query.$or = [
        { userId: req.userId },
        { assignedTo: req.userId },
        { assignedToGF: req.userId }
      ];
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found or access denied' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const file = req.file;
    let ext = path.extname(file.originalname).toLowerCase();
    const isHeic = ext === '.heic' || ext === '.heif' || file.mimetype === 'image/heic' || file.mimetype === 'image/heif';
    const isPhoto = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'].includes(ext);
    const timestamp = Date.now();

    // Convert HEIC to JPEG (iPhone photos can't be displayed in browsers)
    let fileToUpload = file.path;
    if (isHeic && heicConvert) {
      try {
        console.log('Converting HEIC to JPEG:', file.originalname);
        const inputBuffer = fs.readFileSync(file.path);
        const outputBuffer = await heicConvert({
          buffer: inputBuffer,
          format: 'JPEG',
          quality: 0.9,
        });
        const jpegPath = file.path.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg');
        fs.writeFileSync(jpegPath, Buffer.from(outputBuffer));
        fileToUpload = jpegPath;
        ext = '.jpg';
        console.log('HEIC converted successfully');
      } catch (convertErr) {
        console.error('Failed to convert HEIC:', convertErr.message);
        // Fall through — upload as-is
      }
    }
    
    // Generate filename
    const pmNumber = job.pmNumber || 'NOPM';
    const notifNumber = job.notificationNumber || '';
    const matCode = job.matCode || '';
    let newFilename;
    
    if (isPhoto) {
      newFilename = `${job.division || 'DA'}_${pmNumber}_${notifNumber}_${matCode}_Photo_${timestamp}${ext}`;
    } else {
      const baseName = file.originalname.replace(/[^a-zA-Z0-9\-_.]/g, '_');
      newFilename = `${pmNumber}_${baseName}_${timestamp}${ext}`;
    }
    
    // Upload to R2 or save locally
    let docUrl = `/uploads/${newFilename}`;
    let r2Key = null;
    
    if (r2Storage.isR2Configured()) {
      try {
        const folderPath = subfolder ? `${folder}/${subfolder}` : folder;
        const result = await r2Storage.uploadJobFile(fileToUpload, id, folderPath, newFilename);
        docUrl = r2Storage.getPublicUrl(result.key);
        r2Key = result.key;
        // Clean up temp files
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        if (fileToUpload !== file.path && fs.existsSync(fileToUpload)) fs.unlinkSync(fileToUpload);
      } catch (uploadErr) {
        console.error('R2 upload failed:', uploadErr.message);
      }
    } else {
      const destPath = path.join(__dirname, 'uploads', newFilename);
      fs.renameSync(fileToUpload, destPath);
    }
    
    // Ensure folder/subfolder structure exists before atomic push
    const targetFolder = job.folders.find(f => f.name === folder);
    if (!targetFolder) {
      job.folders.push({ name: folder, documents: [], subfolders: subfolder ? [{ name: subfolder, documents: [], subfolders: [] }] : [] });
      job.markModified('folders');
      await job.save();
    } else if (subfolder) {
      if (!targetFolder.subfolders) targetFolder.subfolders = [];
      if (!targetFolder.subfolders.find(sf => sf.name === subfolder)) {
        targetFolder.subfolders.push({ name: subfolder, documents: [], subfolders: [] });
        job.markModified('folders');
        await job.save();
      }
    }
    
    // Add document to folder
    const newDoc = {
      name: newFilename,
      url: docUrl,
      r2Key: r2Key,
      type: isPhoto ? 'photo' : 'document',
      photoType: photoType || null,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      uploadDate: new Date(),
      uploadedBy: req.userId,
    };
    // Use atomic $push to avoid VersionError on concurrent uploads
    const arrayPath = subfolder
      ? `folders.$[folder].subfolders.$[sub].documents`
      : `folders.$[folder].documents`;
    const arrayFilters = [{ 'folder.name': folder }];
    if (subfolder) arrayFilters.push({ 'sub.name': subfolder });

    await Job.findByIdAndUpdate(
      id,
      { $push: { [arrayPath]: newDoc } },
      { arrayFilters }
    );
    
    console.log(`File uploaded: ${newFilename} to ${folder}/${subfolder || ''}`);
    res.status(201).json({ 
      message: 'File uploaded successfully', 
      document: newDoc 
    });
  } catch (err) {
    console.error('File upload error:', err);
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

// Alias for /api/jobs/:id/files (used by ForemanCloseOut PDF save)
// Accepts: file, folder, subfolder - same as /api/jobs/:id/upload
router.post('/:id/files', upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    const { folder = 'ACI', subfolder = 'Completed Forms' } = req.body;
    
    const currentUser = await User.findById(req.userId).select('companyId');
    
    const query = { _id: id };
    if (currentUser?.companyId) {
      query.companyId = currentUser.companyId;
    }
    
    if (!(req.isAdmin || req.userRole === 'pm' || req.userRole === 'admin')) {
      query.$or = [
        { userId: req.userId },
        { assignedTo: req.userId },
        { assignedToGF: req.userId }
      ];
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found or access denied' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const file = req.file;
    const ext = path.extname(file.originalname).toLowerCase();
    const isPdf = ext === '.pdf';
    const timestamp = Date.now();
    
    const pmNumber = job.pmNumber || 'NOPM';
    const baseName = file.originalname.replace(/[^a-zA-Z0-9\-_.]/g, '_');
    const newFilename = isPdf ? file.originalname : `${pmNumber}_${baseName}_${timestamp}${ext}`;
    
    let docUrl = `/uploads/${newFilename}`;
    let r2Key = null;
    
    if (r2Storage.isR2Configured()) {
      try {
        const folderPath = subfolder ? `${folder}/${subfolder}` : folder;
        const result = await r2Storage.uploadJobFile(file.path, id, folderPath, newFilename);
        docUrl = r2Storage.getPublicUrl(result.key);
        r2Key = result.key;
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      } catch (uploadErr) {
        console.error('R2 upload failed:', uploadErr.message);
      }
    } else {
      const destPath = path.join(__dirname, 'uploads', newFilename);
      fs.renameSync(file.path, destPath);
    }
    
    // Find target folder and subfolder
    let targetFolder = job.folders.find(f => f.name === folder);
    if (!targetFolder) {
      targetFolder = { name: folder, documents: [], subfolders: [] };
      job.folders.push(targetFolder);
    }
    
    let targetDocs = targetFolder.documents;
    if (subfolder) {
      if (!targetFolder.subfolders) targetFolder.subfolders = [];
      let subfolderObj = targetFolder.subfolders.find(sf => sf.name === subfolder);
      if (!subfolderObj) {
        subfolderObj = { name: subfolder, documents: [], subfolders: [] };
        targetFolder.subfolders.push(subfolderObj);
      }
      if (!subfolderObj.documents) subfolderObj.documents = [];
      targetDocs = subfolderObj.documents;
    }
    
    const newDoc = {
      name: newFilename,
      url: docUrl,
      r2Key: r2Key,
      type: isPdf ? 'filled_pdf' : 'other',
      uploadDate: new Date(),
      uploadedBy: req.userId,
    };

    // Ensure folder/subfolder exist, then use atomic $push to avoid VersionError
    // First ensure the folder structure exists
    await Job.findByIdAndUpdate(id, {
      $addToSet: { folders: { $each: [] } },
    });

    const arrayPath = subfolder
      ? `folders.$[folder].subfolders.$[sub].documents`
      : `folders.$[folder].documents`;
    const arrayFilters = [{ 'folder.name': folder }];
    if (subfolder) arrayFilters.push({ 'sub.name': subfolder });

    try {
      await Job.findByIdAndUpdate(
        id,
        { $push: { [arrayPath]: newDoc } },
        { arrayFilters }
      );
    } catch (_atomicErr) {
      // Fallback: if folder structure doesn't exist yet, use the loaded job
      targetDocs.push(newDoc);
      job.markModified('folders');
      await job.save();
    }
    
    console.log(`File saved: ${newFilename} to ${folder}/${subfolder || ''}`);
    res.status(201).json({ 
      message: 'File saved successfully', 
      document: newDoc 
    });
  } catch (err) {
    console.error('File save error:', err);
    res.status(500).json({ error: 'Save failed', details: err.message });
  }
});

// ==================== GENERIC DOCUMENT UPLOAD (for offline sync) ====================
// Used by offline sync to upload documents/photos to a job
// Supports: folderName, subfolderName, document (file)
router.post('/:id/documents', upload.single('document'), async (req, res) => {
  try {
    const { id } = req.params;
    const { folderName = 'ACI', subfolderName = 'GF Audit' } = req.body;
    
    const currentUser = await User.findById(req.userId).select('companyId');
    
    // Build query with company filter
    const query = { _id: id };
    if (currentUser?.companyId) {
      query.companyId = currentUser.companyId;
    }
    
    // Allow access for admin/PM or assigned users
    if (!(req.isAdmin || req.userRole === 'pm' || req.userRole === 'admin')) {
      query.$or = [
        { userId: req.userId },
        { assignedTo: req.userId },
        { assignedToGF: req.userId }
      ];
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found or access denied' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Determine file type and generate appropriate name
    const file = req.file;
    const ext = path.extname(file.originalname).toLowerCase();
    const isPhoto = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'].includes(ext);
    const timestamp = Date.now();
    
    // Generate filename
    const pmNumber = job.pmNumber || 'NOPM';
    const notifNumber = job.notificationNumber || '';
    const matCode = job.matCode || '';
    let newFilename;
    
    if (isPhoto) {
      newFilename = `${job.division || 'DA'}_${pmNumber}_${notifNumber}_${matCode}_Photo_${timestamp}${ext}`;
    } else {
      const baseName = file.originalname.replace(/[^a-zA-Z0-9\-_.]/g, '_');
      newFilename = `${pmNumber}_${baseName}`;
    }
    
    // Upload to R2 or save locally
    let docUrl = `/uploads/${newFilename}`;
    let r2Key = null;
    
    if (r2Storage.isR2Configured()) {
      try {
        const folderPath = subfolderName ? `${folderName}/${subfolderName}` : folderName;
        const result = await r2Storage.uploadJobFile(file.path, id, folderPath, newFilename);
        docUrl = r2Storage.getPublicUrl(result.key);
        r2Key = result.key;
        // Clean up local temp file
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      } catch (uploadErr) {
        console.error('R2 upload failed, using local storage:', uploadErr.message);
        // Keep local file as fallback
      }
    } else {
      // Move to uploads folder
      const destPath = path.join(__dirname, 'uploads', newFilename);
      fs.renameSync(file.path, destPath);
    }
    
    // Find target folder and subfolder
    let folder = job.folders.find(f => f.name === folderName);
    if (!folder) {
      folder = { name: folderName, documents: [], subfolders: [] };
      job.folders.push(folder);
    }
    
    let targetDocs = folder.documents;
    if (subfolderName) {
      if (!folder.subfolders) folder.subfolders = [];
      let subfolder = folder.subfolders.find(sf => sf.name === subfolderName);
      if (!subfolder) {
        subfolder = { name: subfolderName, documents: [], subfolders: [] };
        folder.subfolders.push(subfolder);
      }
      if (!subfolder.documents) subfolder.documents = [];
      targetDocs = subfolder.documents;
    }
    
    // Add document to folder
    const newDoc = {
      name: newFilename,
      url: docUrl,
      r2Key: r2Key,
      type: isPhoto ? 'photo' : 'document',
      uploadDate: new Date(),
      uploadedBy: req.userId,
    };
    targetDocs.push(newDoc);
    
    await job.save();
    
    console.log(`Document uploaded: ${newFilename} to ${folderName}/${subfolderName || ''}`);
    res.status(201).json({ 
      message: 'Document uploaded successfully', 
      document: newDoc 
    });
  } catch (err) {
    console.error('Document upload error:', err);
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

// Upload photos specifically (for foreman job completion photos)
// Photos are named: DA_PM#_Notification#_MAT_Photo_timestamp.ext
router.post('/:id/photos', upload.array('photos', 20), async (req, res) => {
  try {
    const { id } = req.params;
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const currentUser = await User.findById(req.userId).select('companyId');
    
    console.log('Photo upload request:', {
      jobId: id,
      userId: req.userId,
      userRole: req.userRole,
      isAdmin: req.isAdmin,
      companyId: currentUser?.companyId,
      filesCount: req.files?.length
    });
    
    // Build base query with company filter
    const query = { _id: id };
    if (currentUser?.companyId) {
      query.companyId = currentUser.companyId;
    }
    
    // Allow photo upload if user is:
    // - Admin/PM (can access any job IN THEIR COMPANY)
    // - Owner of the job (userId)
    // - Assigned to the job (assignedTo)
    // - GF assigned to the job (assignedToGF)
    let job;
    if (req.isAdmin || req.userRole === 'pm' || req.userRole === 'admin') {
      console.log('Admin/PM access - finding job by ID in company');
      job = await Job.findOne(query);
    } else {
      console.log('Non-admin access - checking assignment in company');
      query.$or = [
        { userId: req.userId },
        { assignedTo: req.userId },
        { assignedToGF: req.userId }
      ];
      job = await Job.findOne(query);
    }
    
    if (!job) {
      console.log('Photo upload denied - job not found or no access');
      return res.status(404).json({ error: 'Job not found or you do not have access' });
    }
    
    console.log('Photo upload authorized for job:', job.pmNumber);
    
    // Get target folder from request body (defaults to ACI > Photos for backwards compatibility)
    const targetFolderName = req.body.folder || 'ACI';
    const targetSubfolderName = req.body.subfolder || 'Photos';
    
    console.log('Target folder path:', targetFolderName, '>', targetSubfolderName);
    
    // Find the target folder
    const parentFolder = job.folders.find(f => f.name === targetFolderName);
    if (!parentFolder) {
      return res.status(404).json({ error: `${targetFolderName} folder not found` });
    }
    
    // Find or create the subfolder
    let photosFolder = parentFolder.subfolders.find(sf => sf.name === targetSubfolderName);
    if (!photosFolder) {
      // Create subfolder if it doesn't exist
      photosFolder = { name: targetSubfolderName, documents: [], subfolders: [] };
      parentFolder.subfolders.push(photosFolder);
      console.log('Created new subfolder:', targetSubfolderName);
    }
    
    // Generate proper filenames and upload to R2 IN PARALLEL for speed
    const baseTimestamp = Date.now();
    const r2SubfolderPath = targetSubfolderName.toLowerCase().replace(/\s+/g, '_');
    const division = job.division || 'DA';
    const pmNumber = job.pmNumber || 'NOPM';
    const notification = job.notificationNumber || 'NONOTIF';
    const matCode = job.matCode || '2AA';
    
    console.log(`Processing ${req.files.length} photos in parallel, R2 configured:`, r2Storage.isR2Configured());
    
    // Process all photos in parallel for much faster uploads
    const uploadPromises = req.files.map(async (file, i) => {
      let ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      const uniqueTimestamp = `${baseTimestamp}_${i.toString().padStart(3, '0')}`;
      
      let fileToUpload = file.path;
      let tempProcessedFile = null;
      
      try {
        // Use sharp to compress and convert ALL images to optimized JPEG
        // This handles HEIC, PNG, large JPEGs, etc. - much faster than heic-convert
        const isImage = ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.tiff'].includes(ext);
        
        if (isImage) {
          tempProcessedFile = file.path + '_optimized.jpg';
          await sharp(file.path)
            .rotate() // Auto-rotate based on EXIF
            .resize(2048, 2048, { // Max 2048px on longest side (good for field photos)
              fit: 'inside',
              withoutEnlargement: true
            })
            .jpeg({ 
              quality: 80, // Good balance of quality vs size
              mozjpeg: true // Better compression
            })
            .toFile(tempProcessedFile);
          
          fileToUpload = tempProcessedFile;
          ext = '.jpg';
        }
      } catch (sharpErr) {
        console.error('Sharp processing failed, trying heic-convert fallback:', sharpErr.message);
        // Fallback for HEIC if sharp fails (some edge cases)
        if (ext === '.heic' || ext === '.heif') {
          try {
            tempProcessedFile = file.path + '.jpg';
            const inputBuffer = fs.readFileSync(file.path);
            const outputBuffer = await heicConvert({
              buffer: inputBuffer,
              format: 'JPEG',
              quality: 0.8
            });
            fs.writeFileSync(tempProcessedFile, Buffer.from(outputBuffer));
            fileToUpload = tempProcessedFile;
            ext = '.jpg';
          } catch (convertErr) {
            console.error('HEIC fallback also failed:', convertErr.message);
          }
        }
      }
      
      const newFilename = `${division}_${pmNumber}_${notification}_${matCode}_Photo_${uniqueTimestamp}${ext}`;
      
      let docUrl = `/uploads/${newFilename}`;
      let r2Key = null;
      
      // Upload to R2 if configured
      if (r2Storage.isR2Configured()) {
        try {
          const result = await r2Storage.uploadJobFile(fileToUpload, id, r2SubfolderPath, newFilename);
          docUrl = r2Storage.getPublicUrl(result.key);
          r2Key = result.key;
          // Clean up local files
          if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
          if (tempProcessedFile && fs.existsSync(tempProcessedFile)) fs.unlinkSync(tempProcessedFile);
        } catch (uploadErr) {
          console.error('Failed to upload photo to R2:', uploadErr.message);
          // Fallback to local
          const newPath = path.join(__dirname, 'uploads', newFilename);
          fs.renameSync(fileToUpload, newPath);
          // Cleanup temp files - both original and any processed file that wasn't used
          if (tempProcessedFile && tempProcessedFile !== fileToUpload && fs.existsSync(tempProcessedFile)) {
            fs.unlinkSync(tempProcessedFile);
          }
          // Cleanup original file if we used a processed version
          if (file.path !== fileToUpload && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        }
      } else {
        const newPath = path.join(__dirname, 'uploads', newFilename);
        fs.renameSync(fileToUpload, newPath);
        // Cleanup original if we used processed file
        if (tempProcessedFile && file.path !== fileToUpload && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }
      
      return {
        name: newFilename,
        url: docUrl,
        r2Key: r2Key,
        type: 'image',
        uploadDate: new Date(),
        uploadedBy: req.userId
      };
    });
    
    // Wait for all uploads to complete in parallel
    const uploadedPhotos = await Promise.all(uploadPromises);
    console.log(`All ${uploadedPhotos.length} photos uploaded successfully`);
    
    // Use retry loop with reload to handle concurrent uploads
    let retries = 5;
    let saved = false;
    while (retries > 0 && !saved) {
      try {
        // Reload job fresh to get latest version
        const freshJob = await Job.findById(job._id);
        if (!freshJob) throw new Error('Job not found');
        
        // Find the target folder
        const freshParentFolder = freshJob.folders?.find(f => f.name === targetFolderName);
        if (!freshParentFolder) throw new Error(`${targetFolderName} folder not found`);
        
        let targetFolder;
        if (targetSubfolderName) {
          targetFolder = freshParentFolder.subfolders?.find(sf => sf.name === targetSubfolderName);
          if (!targetFolder) {
            // Create subfolder if missing
            targetFolder = { name: targetSubfolderName, documents: [], subfolders: [] };
            if (!freshParentFolder.subfolders) freshParentFolder.subfolders = [];
            freshParentFolder.subfolders.push(targetFolder);
          }
        } else {
          targetFolder = freshParentFolder;
        }
        
        if (!targetFolder.documents) targetFolder.documents = [];
        targetFolder.documents.push(...uploadedPhotos);
        freshJob.markModified('folders');
        await freshJob.save();
        saved = true;
      } catch (saveErr) {
        if (saveErr.name === 'VersionError' && retries > 1) {
          retries--;
          console.log(`Version conflict saving photos for job ${job._id}, retrying... (${retries} left)`);
          // NOSONAR: Math.random() for retry jitter timing is safe - not security-sensitive
          await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100)); // NOSONAR
        } else {
          throw saveErr;
        }
      }
    }
    
    if (!saved) {
      throw new Error('Failed to save photos after retries');
    }
    
    console.log('Photos uploaded:', uploadedPhotos.map(p => p.name));
    res.json({ message: 'Photos uploaded successfully', photos: uploadedPhotos });
  } catch (err) {
    console.error('Photo upload error:', err);
    res.status(500).json({ error: 'Photo upload failed', details: err.message });
  }
});

// ==================== EXPORT FOLDER TO EMAIL ====================
// Export folder contents (photos) as a ZIP file for emailing to Project Coordinator
// GF Audit workflow: GF takes prefield photos, uploads to GF Audit folder, exports to email PC
router.get('/:id/folders/:folderName/export', async (req, res) => {
  try {
    const { id, folderName } = req.params;
    const { subfolder } = req.query; // Optional subfolder path
    
    // Fetch job with company security
    const currentUser = await User.findById(req.userId).select('companyId role');
    const query = { _id: id };
    if (currentUser?.companyId) {
      query.companyId = currentUser.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Find the folder
    const folder = job.folders.find(f => f.name === folderName);
    if (!folder) {
      return res.status(404).json({ error: `Folder "${folderName}" not found` });
    }
    
    // Get documents from folder or subfolder
    let documents = [];
    let exportFolderName = folderName;
    
    if (subfolder) {
      // Navigate to subfolder
      const subfolderParts = subfolder.split('/');
      let currentFolder = folder;
      
      for (const part of subfolderParts) {
        const nextFolder = currentFolder.subfolders?.find(sf => sf.name === part);
        if (!nextFolder) {
          return res.status(404).json({ error: `Subfolder "${part}" not found` });
        }
        currentFolder = nextFolder;
      }
      
      documents = currentFolder.documents || [];
      exportFolderName = subfolderParts[subfolderParts.length - 1];
    } else {
      documents = folder.documents || [];
    }
    
    if (documents.length === 0) {
      return res.status(400).json({ error: 'No documents to export in this folder' });
    }
    
    const zipFilename = `${job.pmNumber || job.woNumber || 'Job'}_${exportFolderName}_${Date.now()}.zip`;
    
    // First, fetch all files into memory
    const filesToZip = [];
    for (const doc of documents) {
      try {
        let fileBuffer = null;
        
        // Get file from R2 or local storage
        if (doc.r2Key && r2Storage.isR2Configured()) {
          // Fetch from R2 using getFileStream
          const r2Response = await r2Storage.getFileStream(doc.r2Key);
          if (r2Response?.stream) {
            const chunks = [];
            for await (const chunk of r2Response.stream) {
              chunks.push(chunk);
            }
            fileBuffer = Buffer.concat(chunks);
          }
        } else if (doc.url) {
          // Try to get from URL (could be external or local)
          if (doc.url.startsWith('http://') || doc.url.startsWith('https://')) {
            // External URL - validate before fetching (SSRF protection)
            const urlValidation = await validateUrl(doc.url, { 
              allowHttp: false,  // Only HTTPS
              requireAllowlist: true,  // Only trusted domains
              resolveDNS: true  // Check resolved IPs
            });
            
            if (urlValidation.valid) {
              const fetch = (await import('node-fetch')).default;
              const response = await fetch(urlValidation.url.href);
              if (response.ok) {
                fileBuffer = Buffer.from(await response.arrayBuffer());
              }
            } else {
              console.warn(`[SSRF Protection] Blocked fetch to: ${doc.url} - ${urlValidation.error}`);
            }
          } else if (doc.url.startsWith('/uploads/')) {
            // Local file
            const localPath = path.join(__dirname, doc.url);
            if (fs.existsSync(localPath)) {
              fileBuffer = fs.readFileSync(localPath);
            }
          }
        }
        
        if (fileBuffer) {
          filesToZip.push({ name: doc.name, buffer: fileBuffer });
          console.log(`Prepared for ZIP: ${doc.name}`);
        } else {
          console.warn(`Could not fetch file: ${doc.name}`);
        }
      } catch (docErr) {
        console.error(`Error fetching ${doc.name}:`, docErr.message);
      }
    }
    
    if (filesToZip.length === 0) {
      return res.status(400).json({ error: 'Could not fetch any files to export' });
    }
    
    // Create ZIP archive in memory first to ensure it's valid
    const archive = archiver('zip', { zlib: { level: 5 } });
    const zipChunks = [];
    
    // Set up promise to wait for end event BEFORE finalizing (avoid race condition)
    const archiveEndPromise = new Promise((resolve, reject) => {
      archive.on('end', resolve);
      archive.on('error', reject);
    });
    
    // Collect ZIP data into memory
    archive.on('data', (chunk) => zipChunks.push(chunk));
    archive.on('warning', (err) => console.warn('Archive warning:', err.message));
    
    // Track filenames to avoid duplicates (which can corrupt ZIP extraction)
    const usedNames = new Set();
    
    // Add all files to archive with unique names
    for (const file of filesToZip) {
      let fileName = file.name;
      
      // If duplicate, add counter suffix
      if (usedNames.has(fileName)) {
        const ext = path.extname(fileName);
        const base = path.basename(fileName, ext);
        let counter = 2;
        while (usedNames.has(`${base}_${counter}${ext}`)) {
          counter++;
        }
        fileName = `${base}_${counter}${ext}`;
      }
      
      usedNames.add(fileName);
      archive.append(file.buffer, { name: fileName });
    }
    
    // Finalize and wait for all data to be collected
    archive.finalize();
    await archiveEndPromise;
    
    // Combine all chunks into final ZIP buffer
    const zipBuffer = Buffer.concat(zipChunks);
    
    // Audit log: Bulk download/export
    logExport.bulkDownload(req, id, filesToZip.length);
    
    // Send the complete, valid ZIP
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
    res.setHeader('Content-Length', zipBuffer.length);
    res.send(zipBuffer);
    
    console.log(`ZIP export complete: ${zipFilename} with ${filesToZip.length} files, size: ${zipBuffer.length} bytes`);
    
  } catch (err) {
    console.error('Export folder error:', err);
    res.status(500).json({ error: 'Failed to export folder', details: err.message });
  }
});

// ==================== JOB PACKAGE EXPORT FOR UTILITY SUBMISSION ====================
// Export complete job package (timesheet + tailboard + units) in Oracle/SAP format
// This accompanies the job package submission to PG&E, SCE, etc.
router.get('/:id/export-package', async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'oracle', output = 'json' } = req.query; // format: oracle|sap, output: json|csv|pdf

    const user = await User.findById(req.userId).select('companyId role');
    const job = await Job.findOne({ _id: id, companyId: user?.companyId });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Load related data
    const Timesheet = require('./models/Timesheet');
    const Tailboard = mongoose.models.Tailboard; // May not exist yet
    const UnitEntry = require('./models/UnitEntry');

    // Get latest timesheet for this job
    const timesheet = await Timesheet.findOne({ jobId: id })
      .sort({ date: -1 })
      .lean();

    // Get tailboard (stored in job or separate collection)
    let tailboard = null;
    if (Tailboard) {
      tailboard = await Tailboard.findOne({ jobId: id })
        .sort({ date: -1 })
        .lean();
    } else if (job.tailboard) {
      tailboard = job.tailboard;
    }

    // Get all approved/submitted units
    const units = await UnitEntry.find({
      jobId: id,
      status: { $in: ['approved', 'submitted', 'pending'] }
    }).lean();

    // Generate export
    const { 
      generateJobPackageExport, 
      generateJobPackageCSV,
      generateJobPackagePDF
    } = require('./utils/jobPackageExport');

    const exportData = generateJobPackageExport(job, {
      format,
      timesheet,
      tailboard,
      units,
    });

    // Return based on output format
    if (output === 'csv') {
      const csvFiles = generateJobPackageCSV(exportData);
      
      // If multiple files, zip them
      const fileCount = Object.keys(csvFiles).length;
      if (fileCount > 1) {
        const archive = archiver('zip', { zlib: { level: 5 } });
        const chunks = [];
        
        archive.on('data', chunk => chunks.push(chunk));
        
        for (const [filename, content] of Object.entries(csvFiles)) {
          archive.append(content, { name: filename });
        }
        
        await archive.finalize();
        const zipBuffer = Buffer.concat(chunks);
        
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${job.woNumber || job.pmNumber}_package.zip"`);
        return res.send(zipBuffer);
      } else {
        // Single file, return directly
        const [filename, content] = Object.entries(csvFiles)[0] || ['export.csv', ''];
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(content);
      }
    } else if (output === 'pdf') {
      const pdfBuffer = await generateJobPackagePDF(exportData);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${job.woNumber || job.pmNumber}_package.pdf"`);
      return res.send(Buffer.from(pdfBuffer));
    } else {
      // Default: JSON
      res.json(exportData);
    }

  } catch (err) {
    console.error('Job package export error:', err);
    res.status(500).json({ error: 'Failed to export job package', details: err.message });
  }
});

// Helper function to recursively find and remove a document from nested folders
function findAndRemoveDocument(folders, docId) {
  for (const folder of folders) {
    // Check folder documents
    const folderDocIndex = folder.documents?.findIndex(doc => doc._id?.toString() === docId);
    if (folderDocIndex !== undefined && folderDocIndex !== -1) {
      const removedDoc = folder.documents[folderDocIndex];
      folder.documents.splice(folderDocIndex, 1);
      return removedDoc;
    }
    
    // Recursively check subfolders
    if (folder.subfolders && folder.subfolders.length > 0) {
      const result = findAndRemoveDocument(folder.subfolders, docId);
      if (result) return result;
    }
  }
  return null;
}

// Delete a document from a job folder
router.delete('/:id/documents/:docId', async (req, res) => {
  try {
    const { id, docId } = req.params;
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const user = await User.findById(req.userId).select('companyId isAdmin role');
    const query = { _id: id };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    // Non-admins need ownership/assignment check
    if (!user?.isAdmin && !['pm', 'admin'].includes(user?.role)) {
      query.$or = [
        { userId: req.userId },
        { assignedTo: req.userId },
        { assignedToGF: req.userId }
      ];
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Find and remove the document (searches all nested levels)
    const removedDoc = findAndRemoveDocument(job.folders, docId);
    
    if (!removedDoc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Try to delete the actual file from disk (if it's in uploads folder)
    if (removedDoc && removedDoc.url && removedDoc.url.startsWith('/uploads/')) {
      const filename = removedDoc.url.replace('/uploads/', '');
      const filePath = path.join(__dirname, 'uploads', filename);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log('File deleted from disk:', filePath);
        }
      } catch (fileErr) {
        console.warn('Could not delete file from disk:', fileErr.message);
        // Don't fail the request if file deletion fails
      }
    }
    
    await job.save();
    
    // Audit log: Document deleted
    logDocument.delete(req, { _id: docId, name: removedDoc?.name || docId }, id);
    
    console.log('Document removed from job:', docId);
    res.json({ message: 'Document deleted successfully', documentId: docId });
  } catch (err) {
    console.error('Error deleting document:', err);
    res.status(500).json({ error: 'Failed to delete document', details: err.message });
  }
});

// Admin: Create a new folder in a job's file structure
router.post('/:id/folders', async (req, res) => {
  try {
    const { id } = req.params;
    const { folderName, parentFolder, isSubfolder } = req.body;
    
    // Check if user is admin
    const user = await User.findById(req.userId);
    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required to create folders' });
    }
    
    if (!folderName || folderName.trim().length === 0) {
      return res.status(400).json({ error: 'Folder name is required' });
    }
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // Admins can access any job IN THEIR COMPANY
    // ============================================
    const query = { _id: id };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const cleanFolderName = folderName.trim();
    
    if (isSubfolder && parentFolder) {
      // Create subfolder under an existing parent folder
      const parent = job.folders.find(f => f.name === parentFolder);
      if (!parent) {
        return res.status(404).json({ error: 'Parent folder not found' });
      }
      
      // Check if subfolder already exists
      if (parent.subfolders.some(sf => sf.name === cleanFolderName)) {
        return res.status(400).json({ error: 'Subfolder already exists' });
      }
      
      parent.subfolders.push({
        name: cleanFolderName,
        documents: []
      });
    } else {
      // Create top-level folder
      if (job.folders.some(f => f.name === cleanFolderName)) {
        return res.status(400).json({ error: 'Folder already exists' });
      }
      
      job.folders.push({
        name: cleanFolderName,
        documents: [],
        subfolders: []
      });
    }
    
    await job.save();
    
    console.log('Folder created:', cleanFolderName, isSubfolder ? `under ${parentFolder}` : '(top-level)');
    res.json({ message: 'Folder created successfully', job });
  } catch (err) {
    console.error('Error creating folder:', err);
    res.status(500).json({ error: 'Failed to create folder', details: err.message });
  }
});

// Admin: Delete a folder from a job's file structure
router.delete('/:id/folders/:folderName', async (req, res) => {
  try {
    const { id, folderName } = req.params;
    const { parentFolder } = req.body;
    
    // Check if user is admin
    const user = await User.findById(req.userId);
    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required to delete folders' });
    }
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // Admins can access any job IN THEIR COMPANY
    // ============================================
    const query = { _id: id };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    if (parentFolder) {
      // Delete subfolder
      const parent = job.folders.find(f => f.name === parentFolder);
      if (!parent) {
        return res.status(404).json({ error: 'Parent folder not found' });
      }
      
      const subfolderIndex = parent.subfolders.findIndex(sf => sf.name === folderName);
      if (subfolderIndex === -1) {
        return res.status(404).json({ error: 'Subfolder not found' });
      }
      
      parent.subfolders.splice(subfolderIndex, 1);
    } else {
      // Delete top-level folder
      const folderIndex = job.folders.findIndex(f => f.name === folderName);
      if (folderIndex === -1) {
        return res.status(404).json({ error: 'Folder not found' });
      }
      
      job.folders.splice(folderIndex, 1);
    }
    
    await job.save();
    
    console.log('Folder deleted:', folderName);
    res.json({ message: 'Folder deleted successfully', job });
  } catch (err) {
    console.error('Error deleting folder:', err);
    res.status(500).json({ error: 'Failed to delete folder', details: err.message });
  }
});

// Admin: Get current user info (including admin status)
router.get('/user/me', async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error('Error getting user:', err);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// Helper function to recursively find a document in nested folders
function findDocumentRecursive(folders, docId) {
  for (const folder of folders) {
    // Check folder documents
    for (const doc of folder.documents || []) {
      if (doc._id?.toString() === docId) {
        return doc;
      }
    }
    
    // Recursively check subfolders
    if (folder.subfolders && folder.subfolders.length > 0) {
      const result = findDocumentRecursive(folder.subfolders, docId);
      if (result) return result;
    }
  }
  return null;
}

// Update document (mark as completed, save edited PDF)
router.put('/:id/documents/:docId', async (req, res) => {
  try {
    const { id, docId } = req.params;
    const { isCompleted, pdfData } = req.body;
    
    // ============================================
    // MULTI-TENANT SECURITY: Filter by company
    // ============================================
    const user = await User.findById(req.userId).select('companyId');
    const query = { _id: id };
    if (user?.companyId) {
      query.companyId = user.companyId;
    }
    // Also check ownership/assignment
    query.$or = [
      { userId: req.userId },
      { assignedTo: req.userId },
      { assignedToGF: req.userId }
    ];
    
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Find the document in any folder/subfolder (searches all nested levels)
    const foundDoc = findDocumentRecursive(job.folders, docId);
    
    if (!foundDoc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Update document
    if (isCompleted !== undefined) {
      foundDoc.isCompleted = isCompleted;
      foundDoc.completedDate = isCompleted ? new Date() : null;
      foundDoc.completedBy = isCompleted ? req.userId : null;
    }
    
    // If PDF data is provided, save the edited PDF
    if (pdfData) {
      const pdfBuffer = Buffer.from(pdfData, 'base64');
      // Use timestamp + docId + random suffix to prevent filename collisions
      const randomSuffix = crypto.randomBytes(4).toString('hex');
      const filename = `edited_${docId}_${Date.now()}_${randomSuffix}.pdf`;
      const newPath = path.join(__dirname, 'uploads', filename);
      fs.writeFileSync(newPath, pdfBuffer);
      foundDoc.path = newPath;
      foundDoc.url = `/uploads/${filename}`;
    }
    
    await job.save();
    res.json({ message: 'Document updated', document: foundDoc });
  } catch (err) {
    console.error('Document update error:', err);
    res.status(500).json({ error: 'Update failed', details: err.message });
  }
});

// ============================================
// Socket.IO Authentication & Connection Handling

module.exports = router;
