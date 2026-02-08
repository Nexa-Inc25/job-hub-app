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
// In production with R2 storage, this is only used as a temp buffer
const uploadsDir = path.join(__dirname, '..', 'uploads');
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
} catch (err) {
  // In containerized environments with R2 storage, this may fail
  // Use /tmp as fallback for temporary file storage
  console.warn('Could not create uploads dir, using /tmp:', err.message);
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
- pmNumber: PM Order Number (e.g., "35653821")
- notificationNumber: Notification number (e.g., "131388398", "119127590")
- woNumber: Work order number
- address: Street address (e.g., "21621 COLUMBUS AVE")
- city: City name (e.g., "CUPERTINO")
- client: Company name (e.g., "PG&E")
- projectName: Project name
- orderType: Order type code (e.g., "E460")
- matCode: MAT Codes value (e.g., "161")
- sapId: SAP Equipment ID (e.g., "101272791")
- sapFuncLocation: SAP Functional Location (e.g., "ED.95-N300000000.STRU.POLE")

JOB SCOPE:
- jobScope.summary: 1-2 sentence work description
- jobScope.workType: Type of work (New Service, Pole Replacement, Tree Trim, etc.)
- jobScope.equipment: Array of simplified equipment names for quick reference (e.g., ["Transformers", "Poles", "Cable 4/0A"])
- jobScope.footage: Total footage if mentioned
- jobScope.voltage: Voltage level (e.g., "600V")
- jobScope.phases: Number of phases (1-phase, 3-phase)

CREW MATERIALS (extract from "Crew Materials" page if present):
Look for a table with columns: Quantity, Unit, M-Code, Description
- crewMaterials: Array of material items, each with:
  - quantity: Number (e.g., 139)
  - unit: Unit code string (e.g., "FT", "EA", "CO", "AY")
  - mCode: PG&E M-Code (e.g., "M294371")
  - description: Full description (e.g., "CABLE ELEC INSUL AL 600V 4/0 AWG XLP")

PRE-FIELD LABELS (for crew planning):
- preFieldLabels.roadAccess: One of "accessible", "limited", "non-accessible", "backyard", "easement" based on location description
- preFieldLabels.accessNotes: Details about access (e.g., "150ft from road", "locked gate", "steep terrain")
- preFieldLabels.craneRequired: true if pole set/change in backyard, limited access, or crane mentioned
- preFieldLabels.craneType: Type needed if applicable (e.g., "Digger Derrick", "Crane Truck")
- preFieldLabels.constructionType: "overhead", "underground", or "both" based on work described
- preFieldLabels.poleWork: "set" (new pole), "change-out" (replace), "removal", "transfer", or null

EC TAG / PROGRAM INFO (from "Electric Overhead Tag" or similar tag documents):
- ecTag.tagType: PG&E tag classification - "A", "B", "C", "D", "E", or "emergency" (look for "Priority:" field)
- ecTag.tagDueDate: Due date / Date Required from EC tag (ISO format YYYY-MM-DD)
- ecTag.dateIdentified: Date Identified from tag (ISO format YYYY-MM-DD)
- ecTag.dateRequired: Date Required from tag (ISO format YYYY-MM-DD)
- ecTag.programType: One of "new-business", "capacity", "reliability", "maintenance", "tag-work", "pole-replacement", "underground-conversion", "tree-trim"
- ecTag.programCode: Program code like "NB", "CAP", "REL", "A-TAG", "E-TAG"
- ecTag.isUrgent: true if A-tag, E-tag, emergency, or due within 30 days
- ecTag.commentsSummary: Summarize the "Comments" section from page 2 of EC tag - include key issues, rejections, reason codes, and any important history (2-4 sentences max)

LOOK FOR THESE PATTERNS:
- "PM Order Number:" or "PM#" or "PM Order #:"
- "Notification:" or "Notification #:" 
- "MAT Codes:" value
- "SAP Equipment:" or "SAP Func. Location:"
- "Crew Materials" page with M-Code table
- "Electric Overhead Tag" or "Electric Underground Tag" documents
- "Priority: E" or "Priority: A" for tag classification
- "Date Identified:", "Date Required:"
- "Comments" section on page 2 of EC tags with history and rejections
- "Notification Returned", "Reason Code:", rejection reasons
- "Backyard", "easement", "off-road", "limited access"
- "Crane", "digger", "pole set", "pole change"
- "OH" or "Overhead", "UG" or "Underground"

VALIDATION:
- Use null for missing optional fields
- Dates in ISO format (YYYY-MM-DD)
- Return ONLY valid JSON

EXAMPLE OUTPUT:
{"pmNumber":"46357356","notificationNumber":"119127590","address":"2626 RAILROAD FLAT RD","city":"Mokelumne Hill","client":"PG&E","matCode":"161","sapId":"101272791","sapFuncLocation":"ED.95-N300000000.STRU.POLE","jobScope":{"summary":"Tree clearance trim at pole location","workType":"Tree Trim"},"crewMaterials":[],"preFieldLabels":{"roadAccess":"accessible","constructionType":"overhead"},"ecTag":{"tagType":"E","dateIdentified":"2020-06-09","dateRequired":"2025-06-09","programType":"tag-work","isUrgent":true,"commentsSummary":"Pole has split top mitigated by hardware framing, needs vis strips. Previously returned twice - R02 (wrong location/photos don't match map) and R05 (missing required photos). SAP ID matches map but photos showed different structure."}}`;

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
    
    // 5. Store construction sketches for quick access in job details
    const pdfBasename = path.basename(pdfPath);
    job.constructionSketches = drawings.map(drawing => ({
      pageNumber: drawing.pageNumber,
      url: drawing.url,
      r2Key: drawing.r2Key || null,
      name: drawing.name,
      extractedFrom: pdfBasename,
      extractedAt: new Date()
    }));
    
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