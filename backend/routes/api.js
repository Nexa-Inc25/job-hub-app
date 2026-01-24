const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const Job = require('../models/Job');
const OpenAI = require('openai');
const r2Storage = require('../utils/storage');

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
const upload = multer({ storage });

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
      const jsonMatch = typeof result.extractedInfo === 'string'
        ? result.extractedInfo.match(/```json\s*([\s\S]*?)```/i) || result.extractedInfo.match(/\{[\s\S]*\}/)
        : null;
      if (jsonMatch) {
        structured = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      }
    } catch (parseErr) {
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
    // Verify user owns this job
    const job = await Job.findOne({ _id: req.params.jobId, userId: req.userId });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    if (job.folders[0].documents?.[0]) {
      const doc = job.folders[0].documents[0];
      let pdfBuffer;
      
      // If file is in R2, fetch it; otherwise read from local path
      if (doc.r2Key && r2Storage.isR2Configured()) {
        // Fetch from R2
        const fileData = await r2Storage.getFileStream(doc.r2Key);
        if (!fileData) {
          return res.status(404).json({ error: 'Document not found in storage' });
        }
        // Convert stream to buffer
        const chunks = [];
        for await (const chunk of fileData.stream) {
          chunks.push(chunk);
        }
        pdfBuffer = Buffer.concat(chunks);
      } else if (doc.path && fs.existsSync(doc.path)) {
        // Read from local file
        pdfBuffer = fs.readFileSync(doc.path);
      } else {
        return res.status(404).json({ error: 'Document file not accessible' });
      }
      
      const text = await getPdfUtils().getPdfTextFromBuffer(pdfBuffer);
      const chunks = getPdfUtils().getTextChunks(text);
      const store = await getPdfUtils().getVectorStore(chunks);
      const chain = getPdfUtils().getConversationalChain(store);
      const answer = await chain.ask(query);
      res.json({ answer });
    } else {
      res.json({ answer: 'No documents' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST - Extract images, drawings, and maps from job package PDF
router.post('/jobs/:jobId/extract-assets', upload.single('pdf'), async (req, res) => {
  try {
    const { jobId } = req.params;
    // Verify user owns this job
    const job = await Job.findOne({ _id: jobId, userId: req.userId });
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Get the PDF path - either from upload or from existing job document
    let pdfPath = req.file?.path;
    
    if (!pdfPath && req.body.documentUrl) {
      // Use existing document
      pdfPath = path.join(__dirname, '..', req.body.documentUrl.replace(/^\//, ''));
    }
    
    if (!pdfPath || !fs.existsSync(pdfPath)) {
      return res.status(400).json({ error: 'No PDF file provided or file not found' });
    }
    
    console.log('Extracting assets from:', pdfPath);
    
    // Create output directories for extracted assets
    const jobUploadsDir = path.join(__dirname, '..', 'uploads', `job_${jobId}`);
    const photosDir = path.join(jobUploadsDir, 'photos');
    const drawingsDir = path.join(jobUploadsDir, 'drawings');
    const mapsDir = path.join(jobUploadsDir, 'maps');
    
    [photosDir, drawingsDir, mapsDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
    
    const extractedAssets = {
      photos: [],
      drawings: [],
      maps: []
    };
    
    // 1. Analyze PDF pages by content (position-independent)
    console.log('Analyzing PDF pages by content...');
    const pageAnalysis = await getPdfImageExtractor().analyzePagesByContent(pdfPath);
    console.log('Page analysis result:', pageAnalysis);
    
    // Helper to upload extracted images to R2
    async function uploadExtractedImages(images, folder) {
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
          } catch (uploadErr) {
            console.error(`Failed to upload ${img.name}:`, uploadErr.message);
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
    
    // 2. Convert identified drawings to images
    if (pageAnalysis.drawings?.length > 0) {
      console.log('Converting drawing pages:', pageAnalysis.drawings);
      const drawings = await getPdfImageExtractor().convertPagesToImages(
        pdfPath, 
        pageAnalysis.drawings, 
        drawingsDir, 
        'drawing'
      );
      extractedAssets.drawings = await uploadExtractedImages(drawings, 'drawings');
    }
    
    // 3. Convert identified maps to images
    if (pageAnalysis.maps?.length > 0) {
      console.log('Converting map pages:', pageAnalysis.maps);
      const maps = await getPdfImageExtractor().convertPagesToImages(
        pdfPath, 
        pageAnalysis.maps, 
        mapsDir, 
        'map'
      );
      extractedAssets.maps = await uploadExtractedImages(maps, 'maps');
    }
    
    // 4. Convert identified photos to images
    if (pageAnalysis.photos?.length > 0) {
      console.log('Converting photo pages:', pageAnalysis.photos);
      const photos = await getPdfImageExtractor().convertPagesToImages(
        pdfPath, 
        pageAnalysis.photos, 
        photosDir, 
        'photo'
      );
      extractedAssets.photos = await uploadExtractedImages(photos, 'photos');
    }
    
    // 4. Update job with extracted assets
    const aciFolder = job.folders.find(f => f.name === 'ACI');
    if (aciFolder) {
      const preFieldFolder = aciFolder.subfolders.find(sf => sf.name === 'Pre-Field Documents');
      if (preFieldFolder) {
        // Ensure nested subfolders exist
        if (!preFieldFolder.subfolders) preFieldFolder.subfolders = [];
        
        // Find or create Job Photos subfolder
        let jobPhotosFolder = preFieldFolder.subfolders.find(sf => sf.name === 'Job Photos');
        if (!jobPhotosFolder) {
          jobPhotosFolder = { name: 'Job Photos', documents: [], subfolders: [] };
          preFieldFolder.subfolders.push(jobPhotosFolder);
        }
        
        // Find or create Construction Sketches subfolder
        let drawingsFolder = preFieldFolder.subfolders.find(sf => sf.name === 'Construction Sketches');
        if (!drawingsFolder) {
          drawingsFolder = { name: 'Construction Sketches', documents: [], subfolders: [] };
          preFieldFolder.subfolders.push(drawingsFolder);
        }
        
        // Find or create Circuit Maps subfolder
        let mapsFolder = preFieldFolder.subfolders.find(sf => sf.name === 'Circuit Maps');
        if (!mapsFolder) {
          mapsFolder = { name: 'Circuit Maps', documents: [], subfolders: [] };
          preFieldFolder.subfolders.push(mapsFolder);
        }
        
        // Add extracted photos
        extractedAssets.photos.forEach(photo => {
          jobPhotosFolder.documents.push({
            name: photo.name,
            path: photo.path,
            url: photo.url,
            type: 'image',
            extractedFrom: path.basename(pdfPath),
            uploadDate: new Date()
          });
        });
        
        // Add extracted drawings
        extractedAssets.drawings.forEach(drawing => {
          drawingsFolder.documents.push({
            name: drawing.name,
            path: drawing.path,
            url: drawing.url,
            type: 'drawing',
            pageNumber: drawing.pageNumber,
            extractedFrom: path.basename(pdfPath),
            uploadDate: new Date()
          });
        });
        
        // Add extracted maps
        extractedAssets.maps.forEach(map => {
          mapsFolder.documents.push({
            name: map.name,
            path: map.path,
            url: map.url,
            type: 'map',
            pageNumber: map.pageNumber,
            extractedFrom: path.basename(pdfPath),
            uploadDate: new Date()
          });
        });
      }
    }
    
    job.aiExtractionComplete = true;
    job.aiExtractedAssets = [
      ...extractedAssets.photos.map(p => ({ type: 'photo', name: p.name, url: p.url, extractedAt: new Date() })),
      ...extractedAssets.drawings.map(d => ({ type: 'drawing', name: d.name, url: d.url, extractedAt: new Date() })),
      ...extractedAssets.maps.map(m => ({ type: 'map', name: m.name, url: m.url, extractedAt: new Date() }))
    ];
    
    await job.save();
    
    console.log('Asset extraction complete:', {
      photos: extractedAssets.photos.length,
      drawings: extractedAssets.drawings.length,
      maps: extractedAssets.maps.length
    });
    
    res.json({
      success: true,
      message: 'Assets extracted successfully',
      extractedAssets,
      summary: {
        photosCount: extractedAssets.photos.length,
        drawingsCount: extractedAssets.drawings.length,
        mapsCount: extractedAssets.maps.length
      }
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
    // Verify user owns this job
    const job = await Job.findOne({ _id: jobId, userId: req.userId });
    
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