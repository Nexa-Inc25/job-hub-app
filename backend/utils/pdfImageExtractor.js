const fs = require('node:fs');
const path = require('node:path');
const OpenAI = require('openai');

// Helper to sanitize directory paths (prevent path traversal)
function sanitizePath(dirPath, baseDir) {
  // Resolve the full path and ensure it's within the expected base directory
  const resolvedPath = path.resolve(dirPath);
  const resolvedBase = path.resolve(baseDir || process.cwd());
  
  if (!resolvedPath.startsWith(resolvedBase)) {
    throw new Error('Invalid path: attempted path traversal');
  }
  return resolvedPath;
}

// API Usage tracking for owner dashboard
let APIUsage = null;
try {
  APIUsage = require('../models/APIUsage');
} catch {
  // APIUsage model not available - usage tracking disabled
}

// Helper to log OpenAI usage
async function logOpenAIUsage(response, operation, jobId, userId, startTime) {
  if (!APIUsage || !response?.usage) return;
  
  try {
    await APIUsage.logOpenAIUsage({
      operation,
      model: response.model || 'gpt-4o-mini',
      promptTokens: response.usage.prompt_tokens || 0,
      completionTokens: response.usage.completion_tokens || 0,
      success: true,
      responseTimeMs: Date.now() - startTime,
      jobId,
      userId,
      metadata: { operation }
    });
  } catch (err) {
    console.warn('Failed to log OpenAI usage:', err.message);
  }
}

// Try to load canvas and pdfjs - these may fail on some platforms
let canvasModule = null;
let createCanvas = null;
let pdfjsLib = null;
let pdfExtractionAvailable = false;
let NodeCanvasFactory = null;

try {
  canvasModule = require('canvas');
  createCanvas = canvasModule.createCanvas;
  pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '';
  
  // Canvas factory for pdfjs-dist compatibility with node-canvas
  // Must be defined after createCanvas is available
  // This factory must provide create, reset, and destroy methods
  NodeCanvasFactory = class {
    create(width, height) {
      if (!createCanvas) {
        throw new Error('createCanvas not available');
      }
      const canvas = createCanvas(width, height);
      const context = canvas.getContext('2d');
      return { canvas, context };
    }
    
    reset(canvasAndContext, width, height) {
      canvasAndContext.canvas.width = width;
      canvasAndContext.canvas.height = height;
      // Re-get the context after resizing (important for pdfjs-dist)
      canvasAndContext.context = canvasAndContext.canvas.getContext('2d');
    }
    
    destroy(canvasAndContext) {
      if (canvasAndContext?.canvas) {
        canvasAndContext.canvas.width = 0;
        canvasAndContext.canvas.height = 0;
        canvasAndContext.canvas = null;
        canvasAndContext.context = null;
      }
    }
  };
  
  pdfExtractionAvailable = true;
  console.log('PDF extraction libraries loaded successfully');
} catch (err) {
  console.warn('PDF extraction libraries not available:', err.message);
  console.warn('PDF image extraction will be disabled');
}

/**
 * Check if PDF extraction is available
 */
function isExtractionAvailable() {
  return pdfExtractionAvailable;
}

// Helper to delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Batch categorize multiple pages with vision in a single API call
 * Returns: Map of pageNum -> category
 */
async function categorizePagesWithVisionBatch(pagesWithImages, retryCount = 0, jobId = null) {
  const results = new Map();
  
  if (!process.env.OPENAI_API_KEY || pagesWithImages.length === 0) {
    return results;
  }
  
  const pageNums = pagesWithImages.map(p => p.pageNum);
  console.log(`  Vision batch analyzing pages: [${pageNums.join(', ')}]`);
  
  const startTime = Date.now();
  
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    const prompt = `Categorize ${pagesWithImages.length} PG&E utility PDF pages. BE VERY STRICT - most pages are FORM.

FORM (default - use when unsure): ANY page with text labels, tables, checkboxes, headers, signatures, permits, checklists, USA tickets, forms, data entry fields. When in doubt = FORM.

MAP: ONLY Circuit Map Change Sheet (CMCS) or ADHOC with "ILS Event No.", "GIS Tag No.", pink triangles, pole schematics. Utility service area maps. Very rare.

TCP_MAP: Traffic Control Plan MAPS ONLY - bird's eye view of road/intersection showing cone placement, sign placement, arrow boards, lane closures, detour routes. Has road layout with symbols for cones/signs. NOT the text forms or permit pages.

SKETCH: ONLY hand-drawn construction drawings with "TRENCH DETAIL", pole dimensions, "Clear Fields". As-built drawings. NOT traffic control. Very rare.

PHOTO: ONLY real camera photographs of physical job sites/equipment. NOT diagrams or documents.

JSON only: [{"page":1,"category":"FORM"}...]`;

    // Build message with all images
    const imageContents = pagesWithImages.map(p => ({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${p.base64}`, detail: 'low' } // low detail to reduce tokens
    }));

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            ...imageContents
          ]
        }
      ],
      max_tokens: 300
    });
    
    // Log API usage for owner dashboard
    await logOpenAIUsage(response, 'pdf-page-categorization', jobId, null, startTime);
    
    // Parse JSON response
    const responseText = response.choices[0].message.content.trim();
    try {
      // Extract JSON array from response using safe string operations (no regex backtracking)
      const firstBracket = responseText.indexOf('[');
      const lastBracket = responseText.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket > firstBracket) {
        const parsed = JSON.parse(responseText.slice(firstBracket, lastBracket + 1));
        parsed.forEach(item => {
          const idx = item.page - 1; // Convert 1-based to 0-based
          if (idx >= 0 && idx < pagesWithImages.length) {
            const actualPageNum = pagesWithImages[idx].pageNum;
            const category = (item.category || '').toUpperCase();
            results.set(actualPageNum, category);
            console.log(`  Vision: page ${actualPageNum} -> ${category}`);
          }
        });
      }
    } catch {
      // Failed to parse vision response, results may be incomplete
      console.error('  Failed to parse vision response:', responseText);
    }
    
    return results;
  } catch (err) {
    // Handle rate limit with exponential backoff (base 2s + jitter)
    if (err.message?.includes('429') && retryCount < 5) {
      const backoffMs = Math.min(2000 * Math.pow(2, retryCount), 60000) + Math.random() * 2000;
      console.log(`  Rate limited, waiting ${(backoffMs/1000).toFixed(1)}s and retrying (attempt ${retryCount + 1}/5)...`);
      await delay(backoffMs);
      return categorizePagesWithVisionBatch(pagesWithImages, retryCount + 1, jobId);
    }
    console.error(`  Vision batch error:`, err.message);
    return results;
  }
}

/**
 * Render a page to base64 JPEG for vision analysis
 * Uses low resolution and quality to minimize tokens
 */
async function renderPageToBase64(pdf, pageNum, scale = 0.5) {
  if (!pdfExtractionAvailable || !createCanvas || !NodeCanvasFactory) {
    return null;
  }
  
  try {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    
    const canvasFactory = new NodeCanvasFactory();
    const canvasAndContext = canvasFactory.create(viewport.width, viewport.height);
    
    await page.render({
      canvasContext: canvasAndContext.context,
      viewport,
      canvasFactory
    }).promise;
    
    // Low quality to reduce base64 size and token usage
    const buffer = canvasAndContext.canvas.toBuffer('image/jpeg', { quality: 0.5 }); // NOSONAR - 0.5 is intentional
    canvasFactory.destroy(canvasAndContext);
    
    return buffer.toString('base64');
  } catch (err) {
    console.error(`Error rendering page ${pageNum} to base64:`, err.message);
    return null;
  }
}

/**
 * Render a specific PDF page to an image file
 */
async function renderPageToImage(pdf, pageNum, outputPath, scale = 2) {
  if (!pdfExtractionAvailable) {
    console.warn('PDF extraction not available - skipping page render for page', pageNum);
    return false;
  }
  
  if (!createCanvas || !NodeCanvasFactory) {
    console.error('createCanvas or NodeCanvasFactory is not available');
    return false;
  }
  
  try {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    
    // Create canvas using the factory for pdfjs-dist compatibility
    const canvasFactory = new NodeCanvasFactory();
    const { canvas, context } = canvasFactory.create(
      Math.floor(viewport.width), 
      Math.floor(viewport.height)
    );
    
    // Fill with white background
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Render the page - MUST pass canvasFactory in renderContext for pdfjs-dist Node.js
    const renderContext = {
      canvasContext: context,
      viewport: viewport,
      canvasFactory: canvasFactory
    };
    
    await page.render(renderContext).promise;
    
    // Save as JPEG
    const buffer = canvas.toBuffer('image/jpeg', { quality: 0.85 });
    fs.writeFileSync(outputPath, buffer);
    
    console.log(`  Rendered page ${pageNum} to ${outputPath}`);
    return true;
  } catch (err) {
    console.error(`Error rendering page ${pageNum}:`, err.message);
    return false;
  }
}

// === PAGE DETECTION HELPERS (extracted to reduce complexity) ===

// Form detection patterns (split for maintainability)
const FORM_PATTERNS = [
  'face sheet', 'crew material', 'equipment information', 'checklist',
  'feedback to estimating', 'tag sheet', 'totals as of', 'crew instruction',
  'sign.?off', 'billing', 'progress billing', 'paving form',
  'environmental release', 'best management', 'job package checklist',
  'utility standard', 'contractor work checklist', 'no parking sign', 'tree trimming'
];
const USA_PATTERNS = ['usa ticket', 'usa north', 'underground service alert', 'dig alert', 'call before you dig', 'one call', '811', 'excavation notice', 'locate request', 'utility locate'];
const TCP_FORM_PATTERNS = ['traffic control', 'traffic plan', 'tcp', 'lane closure', 'road closure', 'detour', 'flagging', 'barricade'];

// Check if page is a form (not visual content)
function isFormPage(text) {
  const allPatterns = [...FORM_PATTERNS, ...USA_PATTERNS, ...TCP_FORM_PATTERNS];
  const regex = new RegExp(allPatterns.join('|'), 'i');
  return regex.test(text);
}

// Check if page has drawing keywords
function hasDrawingKeywords(text, textLength) {
  const drawingMatch = /construction sketch|pole sheet drawing|plan view drawing/i.test(text);
  if (!drawingMatch) return false;
  if (text.includes('checklist')) return false;
  if (/pole sheet drawing\s*:/i.test(text)) return false;
  return textLength < 500;
}

// Check if page has map keywords  
function hasMapKeywords(text) {
  if (/cmcs|circuit map change sheet|adhoc|cirmap/i.test(text)) return true;
  return /circuit map/i.test(text) && !/circuit map:/i.test(text);
}

// Check if page has TCP map keywords
function hasTcpMapKeywords(text, textLength) {
  const hasTcp = /traffic control plan.*map|tcp.*diagram|lane closure.*map|detour.*route|cone.*placement|sign.*placement/i.test(text);
  return hasTcp && textLength < 500;
}

// Categorize a single page based on its content
function categorizePage(page, result) {
  const { pageNum, text, textLength, imageCount } = page;
  
  if (isFormPage(text)) {
    result.forms.push(pageNum);
    return 'form';
  }
  
  if (hasDrawingKeywords(text, textLength)) {
    result.drawings.push(pageNum);
    return 'drawing';
  }
  
  if (hasTcpMapKeywords(text, textLength)) {
    result.tcpMaps.push(pageNum);
    return 'tcp_map';
  }
  
  if (hasMapKeywords(text)) {
    result.maps.push(pageNum);
    return 'map';
  }
  
  if (imageCount > 0) {
    page.needsVision = true;
    return 'needs_vision';
  }
  
  return 'skipped';
}

/**
 * Apply vision categorization result to the result object
 */
function applyVisionCategory(category, pageNum, result) {
  switch (category) {
    case 'SKETCH':
      result.drawings.push(pageNum);
      break;
    case 'MAP':
      result.maps.push(pageNum);
      break;
    case 'TCP_MAP':
      result.tcpMaps.push(pageNum);
      break;
    case 'PHOTO':
      result.photos.push(pageNum);
      break;
    case 'FORM':
      result.forms.push(pageNum);
      console.log(`  Skipping FORM page ${pageNum}`);
      break;
    default:
      console.log(`  Unknown category "${category}" for page ${pageNum}, defaulting to photo`);
      result.photos.push(pageNum);
  }
}

/**
 * Process a batch of pages with vision and apply results
 */
async function processVisionBatch(batch, batchIndex, jobId, result) {
  if (batchIndex > 0) {
    const totalBatches = Math.ceil(batch.length / 8);
    console.log(`  Waiting 3s before next batch (${batchIndex + 1}/${totalBatches})...`);
    await delay(3000);
  }
  
  const batchResults = await categorizePagesWithVisionBatch(batch, 0, jobId);
  
  for (const page of batch) {
    const category = batchResults.get(page.pageNum);
    applyVisionCategory(category, page.pageNum, result);
  }
}

/**
 * Analyze each page of the PDF to determine its content type
 * POSITION-INDEPENDENT: Works regardless of page order in the job package
 * Returns categorized page numbers based on actual content analysis
 */
async function analyzePagesByContent(pdfPath, jobId = null) {
  const result = {
    drawings: [],      // Pages with actual drawings (pole sheets, plan views)
    maps: [],          // Pages with circuit/location maps
    tcpMaps: [],       // Pages with traffic control plan maps (cone/sign placement)
    photos: [],        // Pages with photos/pictures
    forms: [],         // Pages with forms/data sheets
    totalPages: 0
  };
  
  // Collect page data first, then categorize
  const pageData = [];
  
  try {
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const loadingOptions = { 
      data, 
      useSystemFonts: true,
      verbosity: 0  // Suppress warnings
    };
    if (NodeCanvasFactory) {
      loadingOptions.canvasFactory = new NodeCanvasFactory();
    }
    const pdf = await pdfjsLib.getDocument(loadingOptions).promise;
    result.totalPages = pdf.numPages;
    
    console.log(`Analyzing ${pdf.numPages} pages for content types (position-independent)...`);
    
    // First pass: collect data about each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const text = textContent.items.map(item => item.str).join(' ');
        const textLower = text.toLowerCase();
        const textLength = text.length;
        
        const ops = await page.getOperatorList();
        
        // Count image operations
        let imageCount = 0;
        for (const fnCode of ops.fnArray) {
          if (fnCode === 85 || fnCode === 82 || fnCode === 83) {
            imageCount++;
          }
        }
        
        pageData.push({
          pageNum,
          text: textLower,
          textLength,
          imageCount
        });
      } catch {
        // Skip pages that can't be analyzed
      }
    }
    
    // Second pass: categorize each page using extracted helper functions
    for (const page of pageData) {
      const category = categorizePage(page, result);
      console.log(`  Page ${page.pageNum}: images=${page.imageCount}, textLen=${page.textLength} -> ${category}`);
    }
    
    // Vision pass: Use AI to categorize image-heavy pages without text clues
    // Process in batches of 5 to reduce API calls and avoid rate limits
    const visionCandidates = pageData.filter(p => p.needsVision);
    if (visionCandidates.length > 0 && process.env.OPENAI_API_KEY) {
      const pageNums = visionCandidates.map(p => p.pageNum);
      console.log(`Using vision to categorize ${visionCandidates.length} image-heavy pages: [${pageNums.join(', ')}]`);
      
      // Render all pages to base64 first
      const pagesWithImages = await Promise.all(
        visionCandidates.map(async (page) => {
          const base64 = await renderPageToBase64(pdf, page.pageNum, 0.8);
          return base64 ? { pageNum: page.pageNum, base64 } : null;
        })
      );
      
      // Add failed renders to photos, filter successful ones
      const validPages = pagesWithImages.filter(p => {
        if (p === null) return false;
        return true;
      });
      const failedCount = pagesWithImages.length - validPages.length;
      if (failedCount > 0) {
        visionCandidates.slice(0, failedCount).forEach(p => result.photos.push(p.pageNum));
      }
      
      // Process in batches of 8 pages per API call
      const BATCH_SIZE = 8;
      for (let i = 0; i < validPages.length; i += BATCH_SIZE) {
        const batch = validPages.slice(i, i + BATCH_SIZE);
        await processVisionBatch(batch, Math.floor(i / BATCH_SIZE), jobId, result);
      }
    } else if (visionCandidates.length > 0) {
      // No OpenAI key, default all to photos
      console.log(`No OpenAI key for vision, defaulting ${visionCandidates.length} pages to photos`);
      visionCandidates.forEach(page => result.photos.push(page.pageNum));
    }
    
    // Remove duplicates and sort
    result.drawings = [...new Set(result.drawings)].sort((a, b) => a - b);
    result.maps = [...new Set(result.maps)].sort((a, b) => a - b);
    result.tcpMaps = [...new Set(result.tcpMaps)].sort((a, b) => a - b);
    result.photos = [...new Set(result.photos)].sort((a, b) => a - b);
    
    console.log('Page analysis complete:', {
      drawings: result.drawings.length,
      maps: result.maps.length,
      tcpMaps: result.tcpMaps.length,
      photos: result.photos.length,
      forms: result.forms.length
    });
    
  } catch (err) {
    console.error('Error analyzing pages:', err.message);
  }
  
  return result;
}

/**
 * Convert specific PDF pages to images using canvas
 */
async function convertPagesToImages(pdfPath, pageNumbers, outputDir, prefix = 'page') {
  const convertedImages = [];
  
  if (!pageNumbers || pageNumbers.length === 0) {
    return convertedImages;
  }
  
  try {
    console.log(`Converting ${pageNumbers.length} pages to images (${prefix})...`);
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const loadingOptions = { 
      data, 
      useSystemFonts: true,
      verbosity: 0
    };
    if (NodeCanvasFactory) {
      loadingOptions.canvasFactory = new NodeCanvasFactory();
    }
    const pdf = await pdfjsLib.getDocument(loadingOptions).promise;
    
    // Ensure output directory exists (validate path to prevent traversal)
    const safeOutputDir = sanitizePath(outputDir, path.join(__dirname, '..'));
    if (!fs.existsSync(safeOutputDir)) {
      fs.mkdirSync(safeOutputDir, { recursive: true });
    }
    
    for (const pageNum of pageNumbers) {
      if (pageNum < 1 || pageNum > pdf.numPages) {
        continue;
      }
      
      const filename = `${prefix}_page_${pageNum}.jpg`;
      const outputPath = path.join(outputDir, filename);
      
      const success = await renderPageToImage(pdf, pageNum, outputPath, 2);
      
      if (success) {
        convertedImages.push({
          name: filename,
          path: outputPath,
          pageNumber: pageNum,
          type: prefix
        });
        console.log(`  Converted page ${pageNum} -> ${filename}`);
      }
    }
  } catch (err) {
    console.error('Error converting pages:', err.message);
  }
  
  return convertedImages;
}

/**
 * Extract all assets from a PDF - photos, drawings, and maps
 * Uses direct page content analysis instead of text pattern matching
 */
async function extractAllAssets(pdfPath, jobId, uploadsDir, openai) {
  const result = {
    photos: [],
    drawings: [],
    maps: [],
    tcpMaps: [],      // Traffic control plan maps -> UTCS/TCP/TCP Maps
    summary: ''
  };
  
  // Check if extraction libraries are available
  if (!pdfExtractionAvailable) {
    console.warn('PDF extraction not available - canvas/pdfjs not loaded');
    result.summary = 'PDF extraction unavailable on this server';
    return result;
  }
  
  try {
    console.log('=== Starting asset extraction ===');
    console.log('PDF:', pdfPath);
    console.log('Job ID:', jobId);
    
    const jobDir = path.join(uploadsDir, `job_${jobId}`);
    const photosDir = path.join(jobDir, 'photos');
    const drawingsDir = path.join(jobDir, 'drawings');
    const mapsDir = path.join(jobDir, 'maps');
    const tcpMapsDir = path.join(jobDir, 'tcp_maps');  // For UTCS/TCP/TCP Maps
    
    // Create directories
    [photosDir, drawingsDir, mapsDir, tcpMapsDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
    
    // Analyze pages by their actual content
    const pageAnalysis = await analyzePagesByContent(pdfPath, jobId);
    
    console.log('Found pages:');
    console.log('  Drawings:', pageAnalysis.drawings.slice(0, 10).join(', ') + (pageAnalysis.drawings.length > 10 ? '...' : ''));
    console.log('  Maps:', pageAnalysis.maps.join(', '));
    console.log('  TCP Maps:', pageAnalysis.tcpMaps.join(', '));
    console.log('  Photos:', pageAnalysis.photos.slice(0, 10).join(', ') + (pageAnalysis.photos.length > 10 ? '...' : ''));
    
    // Convert drawing pages (limit to first 5)
    const drawingPages = pageAnalysis.drawings.slice(0, 5);
    if (drawingPages.length > 0) {
      result.drawings = await convertPagesToImages(pdfPath, drawingPages, drawingsDir, 'drawing');
    }
    
    // Convert map pages (limit to first 3)
    const mapPages = pageAnalysis.maps.slice(0, 3);
    if (mapPages.length > 0) {
      result.maps = await convertPagesToImages(pdfPath, mapPages, mapsDir, 'map');
    }
    
    // Convert TCP map pages (limit to first 5)
    const tcpMapPages = pageAnalysis.tcpMaps.slice(0, 5);
    if (tcpMapPages.length > 0) {
      result.tcpMaps = await convertPagesToImages(pdfPath, tcpMapPages, tcpMapsDir, 'tcp_map');
    }
    
    // Convert photo pages (limit to first 15)
    const photoPages = pageAnalysis.photos.slice(0, 15);
    if (photoPages.length > 0) {
      result.photos = await convertPagesToImages(pdfPath, photoPages, photosDir, 'photo');
    }
    
    result.summary = `Extracted ${result.drawings.length} drawings, ${result.maps.length} maps, ${result.tcpMaps.length} TCP maps, ${result.photos.length} photos from ${pageAnalysis.totalPages} pages`;
    
    console.log('=== Extraction complete ===');
    console.log(result.summary);
    
  } catch (err) {
    console.error('Error in extractAllAssets:', err);
    result.summary = `Error: ${err.message}`;
  }
  
  return result;
}

// Legacy exports for compatibility
async function extractImagesFromPdf(pdfPath, outputDir) {
  const pageAnalysis = await analyzePagesByContent(pdfPath);
  return convertPagesToImages(pdfPath, pageAnalysis.photos.slice(0, 15), outputDir, 'photo');
}

async function identifyDrawingsAndMaps(pdfText, openai, totalPages) {
  // This is now handled by analyzePagesByContent
  return {
    constructionDrawings: [],
    circuitMaps: [],
    photos: [],
    summary: "Use analyzePagesByContent instead"
  };
}

module.exports = {
  isExtractionAvailable,
  extractImagesFromPdf,
  identifyDrawingsAndMaps,
  convertPagesToImages,
  extractAllAssets,
  analyzePagesByContent
};
