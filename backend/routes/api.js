const express = require('express');
const multer = require('multer');
const path = require('node:path');
const fs = require('node:fs');
const mongoose = require('mongoose');
const router = express.Router();
const Job = require('../models/Job');
const OpenAI = require('openai');
const r2Storage = require('../utils/storage');

// Helper to validate MongoDB ObjectId
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;
}

// Helper to sanitize path components (prevent path traversal)
function sanitizePathComponent(component) {
  if (!component || typeof component !== 'string') return '';
  // Remove any path traversal attempts and special characters
  return component.replaceAll('..', '').replaceAll(/[/\\]/g, '_').trim();
}

// Helper to upload extracted images to R2 or use local path
async function uploadExtractedImages(images, folder, jobId) {
  const uploaded = [];
  for (const img of images) {
    if (r2Storage.isR2Configured() && fs.existsSync(img.path)) {
      try {
        const result = await r2Storage.uploadJobFile(
          img.path, 
          jobId.toString(), 
          folder, 
          img.name
        );
        uploaded.push({
          ...img,
          url: `/api/files/${result.key}`,
          r2Key: result.key
        });
        // Clean up local file after upload
        fs.unlinkSync(img.path);
      } catch (error_) {
        console.error(`Failed to upload ${img.name}:`, error_.message);
        uploaded.push({
          ...img,
          url: `/uploads/job_${jobId}/${folder}/${img.name}`
        });
      }
    } else {
      uploaded.push({
        ...img,
        url: `/uploads/job_${jobId}/${folder}/${img.name}`
      });
    }
  }
  return uploaded;
}

// Helper to convert and upload assets for a category
async function convertAndUploadAssets(pageNumbers, pdfPath, outputDir, prefix, folder, jobId) {
  if (!pageNumbers?.length) return [];
  
  console.log(`Converting ${prefix} pages:`, pageNumbers);
  const images = await getPdfImageExtractor().convertPagesToImages(pdfPath, pageNumbers, outputDir, prefix);
  return uploadExtractedImages(images, folder, jobId);
}

// Helper to find or create a subfolder
function findOrCreateSubfolder(parentFolder, name) {
  if (!parentFolder.subfolders) parentFolder.subfolders = [];
  let folder = parentFolder.subfolders.find(sf => sf.name === name);
  if (!folder) {
    folder = { name, documents: [], subfolders: [] };
    parentFolder.subfolders.push(folder);
  }
  return folder;
}

// Helper to setup asset folders in job structure
function setupAssetFolders(job) {
  const aciFolder = job.folders.find(f => f.name === 'ACI');
  if (!aciFolder) return null;
  
  const preFieldFolder = aciFolder.subfolders?.find(sf => sf.name === 'Pre-Field Documents');
  if (!preFieldFolder) return null;
  
  return {
    jobPhotosFolder: findOrCreateSubfolder(preFieldFolder, 'Job Photos'),
    drawingsFolder: findOrCreateSubfolder(preFieldFolder, 'Construction Sketches'),
    mapsFolder: findOrCreateSubfolder(preFieldFolder, 'Circuit Maps')
  };
}

// Helper to resolve PDF path from request
function resolvePdfPath(req) {
  if (req.file?.path) return req.file.path;
  if (req.body.documentUrl) {
    return path.join(__dirname, '..', req.body.documentUrl.replace(/^\//, ''));
  }
  return null;
}

// Helper to setup extraction directories
function setupExtractionDirs(jobId) {
  const safeJobId = sanitizePathComponent(jobId);
  const jobUploadsDir = path.join(__dirname, '..', 'uploads', `job_${safeJobId}`);
  const dirs = {
    photos: path.join(jobUploadsDir, 'photos'),
    drawings: path.join(jobUploadsDir, 'drawings'),
    maps: path.join(jobUploadsDir, 'maps')
  };
  Object.values(dirs).forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
  return dirs;
}

// Helper to build extracted assets summary
function buildAssetsSummary(extractedAssets) {
  return {
    aiExtractedAssets: [
      ...extractedAssets.photos.map(p => ({ type: 'photo', name: p.name, url: p.url, extractedAt: new Date() })),
      ...extractedAssets.drawings.map(d => ({ type: 'drawing', name: d.name, url: d.url, extractedAt: new Date() })),
      ...extractedAssets.maps.map(m => ({ type: 'map', name: m.name, url: m.url, extractedAt: new Date() }))
    ],
    summary: {
      photosCount: extractedAssets.photos.length,
      drawingsCount: extractedAssets.drawings.length,
      mapsCount: extractedAssets.maps.length
    }
  };
}

// Helper to add documents to asset folders
function addDocsToAssetFolders(assetFolders, extractedAssets, pdfBasename) {
  if (!assetFolders) return;
  
  const addDocs = (folder, assets, type, includePageNumber = false) => {
    assets.forEach(asset => {
      const doc = {
        name: asset.name, path: asset.path, url: asset.url,
        type, extractedFrom: pdfBasename, uploadDate: new Date()
      };
      if (includePageNumber) doc.pageNumber = asset.pageNumber;
      folder.documents.push(doc);
    });
  };
  
  addDocs(assetFolders.jobPhotosFolder, extractedAssets.photos, 'image');
  addDocs(assetFolders.drawingsFolder, extractedAssets.drawings, 'drawing', true);
  addDocs(assetFolders.mapsFolder, extractedAssets.maps, 'map', true);
}

// Lazy load heavy PDF modules to prevent startup crashes (canvas requires native binaries)
let pdfUtils = null;
let pdfImageExtractor = null;
function getPdfUtils() {
  if (!pdfUtils) {
    pdfUtils = require('../utils/pdfUtils');
  }
  return pdfUtils;
}
function getPdfImageExtractor() {
  if (!pdfImageExtractor) {
    pdfImageExtractor = require('../utils/pdfImageExtractor');
  }
  return pdfImageExtractor;
}

// Helper to fetch PDF buffer from R2 or local storage
async function getPdfBufferFromDocument(doc) {
  if (doc.r2Key && r2Storage.isR2Configured()) {
    const fileData = await r2Storage.getFileStream(doc.r2Key);
    if (!fileData) return null;
    const chunks = [];
    for await (const chunk of fileData.stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  if (doc.path && fs.existsSync(doc.path)) {
    return fs.readFileSync(doc.path);
  }
  return null;
}

// Ensure uploads directory exists (use absolute path relative to backend folder)
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

// File filter to only accept PDFs
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf' || file.originalname.endsWith('.pdf')) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed'), false);
  }
};

const upload = multer({ 
  storage,
  limits: {
    fileSize: 150 * 1024 * 1024,  // 150MB max file size
  },
  fileFilter
});

// POST AI extract
router.post('/ai/extract', upload.single('pdf'), async (req, res) => {
  try {
    console.log('=== AI Extract Request ===');
    console.log('Uploads directory:', uploadsDir);
    console.log('Uploads dir exists:', fs.existsSync(uploadsDir));
    console.log('File info:', req.file);
    console.log('File path:', req.file?.path);
    console.log('User authenticated:', Boolean(req.userId));
    console.log('OpenAI key available:', Boolean(process.env.OPENAI_API_KEY));
    console.log('OpenAI key prefix:', process.env.OPENAI_API_KEY?.substring(0, 10) + '...');

    if (!req.file) {
      console.log('No file uploaded');
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Verify file exists
    if (!fs.existsSync(req.file.path)) {
      console.error('Uploaded file does not exist at path:', req.file.path);
      return res.status(500).json({ error: 'File upload failed - file not found' });
    }
    console.log('File exists, size:', fs.statSync(req.file.path).size);

    const prompt = req.body.prompt || `You are an expert at extracting work order information from PG&E and utility maintenance documents.

REQUIRED EXTRACTION (return as JSON object):
- pmNumber: PM Order Number (e.g., "35611981" from "PM Order Number:35611981")
- notificationNumber: Notification number (e.g., "126940062")
- woNumber: Work order number (often same as PM number, or separate WO#)
- address: Street address (e.g., "2PN/O 105 HIGHLAND AV")
- city: City name (e.g., "LOS GATOS")
- client: Company name (e.g., "PG&E")
- projectName: Project name (e.g., "STS-+TRAN_CORR_REPL")
- orderType: Order type code (e.g., "E460")

LOOK FOR THESE PATTERNS:
- "PM Order Number:" followed by digits
- "Notification:" followed by digits
- "Address:" followed by street
- "City:" followed by city name
- "Project name:" followed by project description
- "Order Type:" followed by code
- Look in "Face Sheet" or header sections

VALIDATION RULES:
- Extract numbers without leading zeros if present
- Keep address as street only, city separate
- Use empty string "" for any missing fields
- Return ONLY valid JSON, no markdown or explanation

EXAMPLE OUTPUT:
{"pmNumber":"35611981","notificationNumber":"126940062","address":"2PN/O 105 HIGHLAND AV","city":"LOS GATOS","client":"PG&E","projectName":"STS-+TRAN_CORR_REPL","orderType":"E460","woNumber":"35611981"}`;

    const result = await getPdfUtils().extractWithAI(req.file.path, prompt);
    console.log('AI extraction completed successfully');

    let structured = null;
    try {
      if (typeof result.extractedInfo === 'string') {
        let jsonStr = result.extractedInfo;
        // Remove markdown code fences if present (safe string operations, no regex backtracking)
        const codeBlockStart = jsonStr.indexOf('```json');
        if (codeBlockStart !== -1) {
          const contentStart = jsonStr.indexOf('\n', codeBlockStart) + 1;
          const codeBlockEnd = jsonStr.indexOf('```', contentStart);
          if (codeBlockEnd !== -1) {
            jsonStr = jsonStr.slice(contentStart, codeBlockEnd).trim();
          }
        }
        // Find first { and last } for object extraction
        const firstBrace = jsonStr.indexOf('{');
        const lastBrace = jsonStr.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          structured = JSON.parse(jsonStr.slice(firstBrace, lastBrace + 1));
        }
      }
    } catch {
      // JSON parsing failed, structured remains null
      structured = null;
    }

    res.json({
      success: true,
      extractedData: result.extractedInfo,
      structured,
      rawText: result.rawText,
      usage: result.usage,
      model: result.model
    });
  } catch (err) {
    console.error('AI extract error:', err);
    console.error('Error stack:', err.stack);
    console.error('Error message:', err.message);
    res.status(500).json({
      error: 'AI extraction failed',
      details: err.message,
      success: false
    });
  }
});

// GET query docs
router.get('/jobs/:jobId/ask', async (req, res) => {
  try {
    const { query } = req.query;
    const { jobId } = req.params;
    
    if (!isValidObjectId(jobId)) {
      return res.status(400).json({ error: 'Invalid job ID format' });
    }
    
    const job = await Job.findOne({ _id: new mongoose.Types.ObjectId(jobId), userId: req.userId });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const doc = job.folders[0]?.documents?.[0];
    if (!doc) {
      return res.json({ answer: 'No documents' });
    }
    
    const pdfBuffer = await getPdfBufferFromDocument(doc);
    if (!pdfBuffer) {
      return res.status(404).json({ error: 'Document file not accessible' });
    }
    
    const text = await getPdfUtils().getPdfTextFromBuffer(pdfBuffer);
    const textChunks = getPdfUtils().getTextChunks(text);
    const store = await getPdfUtils().getVectorStore(textChunks);
    const chain = getPdfUtils().getConversationalChain(store);
    const answer = await chain.ask(query);
    res.json({ answer });
  } catch (error_) {
    console.error('Query docs error:', error_.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST - Extract images, drawings, and maps from job package PDF
router.post('/jobs/:jobId/extract-assets', upload.single('pdf'), async (req, res) => {
  try {
    const { jobId } = req.params;
    
    // Validate ObjectId to prevent injection
    if (!isValidObjectId(jobId)) {
      return res.status(400).json({ error: 'Invalid job ID format' });
    }
    
    // Verify user owns this job
    const job = await Job.findOne({ _id: new mongoose.Types.ObjectId(jobId), userId: req.userId });
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Get the PDF path - either from upload or from existing job document
    const pdfPath = resolvePdfPath(req);
    if (!pdfPath || !fs.existsSync(pdfPath)) {
      return res.status(400).json({ error: 'No PDF file provided or file not found' });
    }
    
    console.log('Extracting assets from:', pdfPath);
    
    // Create output directories for extracted assets
    const dirs = setupExtractionDirs(jobId);
    const extractedAssets = { photos: [], drawings: [], maps: [] };
    
    // 1. Analyze PDF pages by content (position-independent)
    console.log('Analyzing PDF pages by content...');
    const pageAnalysis = await getPdfImageExtractor().analyzePagesByContent(pdfPath);
    console.log('Page analysis result:', pageAnalysis);
    
    // 2-4. Convert and upload all asset types in parallel
    const [drawings, maps, photos] = await Promise.all([
      convertAndUploadAssets(pageAnalysis.drawings, pdfPath, dirs.drawings, 'drawing', 'drawings', jobId),
      convertAndUploadAssets(pageAnalysis.maps, pdfPath, dirs.maps, 'map', 'maps', jobId),
      convertAndUploadAssets(pageAnalysis.photos, pdfPath, dirs.photos, 'photo', 'photos', jobId)
    ]);
    
    extractedAssets.drawings = drawings;
    extractedAssets.maps = maps;
    extractedAssets.photos = photos;
    
    // 4. Update job with extracted assets
    const assetFolders = setupAssetFolders(job);
    addDocsToAssetFolders(assetFolders, extractedAssets, path.basename(pdfPath));
    
    const assetsSummary = buildAssetsSummary(extractedAssets);
    job.aiExtractionComplete = true;
    job.aiExtractedAssets = assetsSummary.aiExtractedAssets;
    await job.save();
    
    console.log('Asset extraction complete:', assetsSummary.summary);
    
    res.json({
      success: true,
      message: 'Assets extracted successfully',
      extractedAssets,
      summary: assetsSummary.summary
    });
    
  } catch (err) {
    console.error('Asset extraction error:', err);
    res.status(500).json({ error: 'Asset extraction failed', details: err.message });
  }
});

// POST - Upload photos to Pre-Field Documents/Job Photos
router.post('/jobs/:jobId/prefield-photos', upload.array('photos', 20), async (req, res) => {
  try {
    const { jobId } = req.params;
    
    // Validate ObjectId to prevent injection
    if (!isValidObjectId(jobId)) {
      return res.status(400).json({ error: 'Invalid job ID format' });
    }
    
    // Verify user owns this job
    const job = await Job.findOne({ _id: new mongoose.Types.ObjectId(jobId), userId: req.userId });
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No photos uploaded' });
    }
    
    const uploadedPhotos = [];
    const aciFolder = job.folders.find(f => f.name === 'ACI');
    
    if (aciFolder) {
      const preFieldFolder = aciFolder.subfolders.find(sf => sf.name === 'Pre-Field Documents');
      if (preFieldFolder) {
        // Ensure Job Photos subfolder exists
        if (!preFieldFolder.subfolders) preFieldFolder.subfolders = [];
        let jobPhotosFolder = preFieldFolder.subfolders.find(sf => sf.name === 'Job Photos');
        if (!jobPhotosFolder) {
          jobPhotosFolder = { name: 'Job Photos', documents: [], subfolders: [] };
          preFieldFolder.subfolders.push(jobPhotosFolder);
        }
        
        const baseTimestamp = Date.now();
        req.files.forEach((file, index) => {
          const photoDoc = {
            name: file.originalname || `photo_${baseTimestamp}_${index}.jpg`,
            path: file.path,
            url: `/uploads/${path.basename(file.path)}`,
            type: 'image',
            uploadDate: new Date(),
            uploadedBy: req.userId
          };
          jobPhotosFolder.documents.push(photoDoc);
          uploadedPhotos.push(photoDoc);
        });
      }
    }
    
    await job.save();
    
    res.json({
      success: true,
      message: `${uploadedPhotos.length} photos uploaded to Pre-Field Documents`,
      photos: uploadedPhotos
    });
    
  } catch (err) {
    console.error('Pre-field photo upload error:', err);
    res.status(500).json({ error: 'Photo upload failed', details: err.message });
  }
});

module.exports = router;