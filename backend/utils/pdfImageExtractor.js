const fs = require('fs');
const path = require('path');

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
      if (canvasAndContext && canvasAndContext.canvas) {
        canvasAndContext.canvas.width = 0;
        canvasAndContext.canvas.height = 0;
      }
      if (canvasAndContext) {
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

/**
 * Render a specific PDF page to an image file
 */
async function renderPageToImage(pdf, pageNum, outputPath, scale = 2.0) {
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

/**
 * Analyze each page of the PDF to determine its content type
 * POSITION-INDEPENDENT: Works regardless of page order in the job package
 * Returns categorized page numbers based on actual content analysis
 */
async function analyzePagesByContent(pdfPath) {
  const result = {
    drawings: [],      // Pages with actual drawings (pole sheets, plan views)
    maps: [],          // Pages with circuit/location maps
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
        for (let i = 0; i < ops.fnArray.length; i++) {
          if (ops.fnArray[i] === 85 || ops.fnArray[i] === 82 || ops.fnArray[i] === 83) {
            imageCount++;
          }
        }
        
        pageData.push({
          pageNum,
          text: textLower,
          textLength,
          imageCount
        });
      } catch (pageErr) {
        // Skip pages that can't be analyzed
      }
    }
    
    // Second pass: categorize each page based on content ONLY (not position)
    for (const page of pageData) {
      const { pageNum, text, textLength, imageCount } = page;
      
      // === FORM DETECTION (EXCLUDE these pages) ===
      // Forms have specific headers/titles - these are data sheets, not visual content
      const isFormPage = /face sheet|crew material|equipment information|checklist|feedback to estimating|tag sheet|totals as of|crew instruction|sign.?off|billing|progress billing|paving form|environmental release|best management|job package checklist|utility standard|contractor work checklist|no parking sign|tree trimming|usa ticket/i.test(text);
      
      if (isFormPage) {
        result.forms.push(pageNum);
        continue;
      }
      
      // === DRAWING DETECTION ===
      // Drawings have specific keywords indicating technical drawings
      const hasDrawingKeywords = /pole sheet drawing|plan view|construction drawing|schematic|diagram|top view.*services|include services with addresses/i.test(text);
      
      // === MAP DETECTION ===
      // Maps have specific map-related keywords
      const hasMapKeywords = /circuit map|distribution map|location map|area map|cirmap|vicinity map|site map|google map|street map|aerial|satellite|bird.?s?.?eye|overhead view|project location|job location|work location|map view|gis|parcel map|plat map|survey map|topographic|topo map/i.test(text);
      
      // === PHOTO DETECTION ===
      // Photos have picture-related keywords or are in field notes sections
      const hasPhotoKeywords = /picture|full pole|photos:|field photo|pictures:/i.test(text);
      const hasFieldNotes = /field notes|field date|oh field notes|confidential.*field/i.test(text);
      
      // === CATEGORIZE BASED ON CONTENT ===
      const hasImages = imageCount > 0;
      const isImageOnly = imageCount > 0 && textLength < 50;  // Pure image, almost no text
      const isImageHeavy = imageCount > 0 && textLength < 150; // Image with minimal text
      const hasMultipleImages = imageCount > 5; // Photo collage (multiple images on one page)
      const isConfidentialOnly = textLength < 20 && /confidential/i.test(text); // Just "Confidential" watermark
      
      // === ADDITIONAL MAP INDICATORS ===
      // Pages with street/location references and images are likely maps
      const hasLocationIndicators = /street|road|ave|avenue|blvd|boulevard|highway|hwy|interstate|freeway|county|city of|state of|latitude|longitude|coordinates|north|south|east|west|scale:|feet|meters|miles/i.test(text);
      const looksLikeMap = hasImages && hasLocationIndicators && textLength < 500 && !hasPhotoKeywords && !hasFieldNotes;
      
      // Priority 1: Explicit keywords ONLY for drawings/maps (most reliable)
      // Only pages with EXPLICIT drawing keywords are drawings
      if (hasDrawingKeywords) {
        result.drawings.push(pageNum);
      } else if (hasMapKeywords || looksLikeMap) {
        result.maps.push(pageNum);
      }
      // Priority 2: Everything else with images = PHOTOS
      // This includes: photo keywords, field notes, confidential watermarks,
      // image-only pages, and image-heavy pages
      else if (hasPhotoKeywords || hasFieldNotes || isConfidentialOnly) {
        result.photos.push(pageNum);
      }
      // All other image pages without explicit drawing keywords = PHOTOS
      else if (hasImages && (isImageOnly || isImageHeavy || textLength === 0)) {
        result.photos.push(pageNum);
      }
    }
    
    // Remove duplicates and sort
    result.drawings = [...new Set(result.drawings)].sort((a, b) => a - b);
    result.maps = [...new Set(result.maps)].sort((a, b) => a - b);
    result.photos = [...new Set(result.photos)].sort((a, b) => a - b);
    
    console.log('Page analysis complete:', {
      drawings: result.drawings.length,
      maps: result.maps.length,
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
    
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    for (const pageNum of pageNumbers) {
      if (pageNum < 1 || pageNum > pdf.numPages) {
        continue;
      }
      
      const filename = `${prefix}_page_${pageNum}.jpg`;
      const outputPath = path.join(outputDir, filename);
      
      const success = await renderPageToImage(pdf, pageNum, outputPath, 2.0);
      
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
    
    // Create directories
    [photosDir, drawingsDir, mapsDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
    
    // Analyze pages by their actual content
    const pageAnalysis = await analyzePagesByContent(pdfPath);
    
    console.log('Found pages:');
    console.log('  Drawings:', pageAnalysis.drawings.slice(0, 10).join(', ') + (pageAnalysis.drawings.length > 10 ? '...' : ''));
    console.log('  Maps:', pageAnalysis.maps.join(', '));
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
    
    // Convert photo pages (limit to first 15)
    const photoPages = pageAnalysis.photos.slice(0, 15);
    if (photoPages.length > 0) {
      result.photos = await convertPagesToImages(pdfPath, photoPages, photosDir, 'photo');
    }
    
    result.summary = `Extracted ${result.drawings.length} drawings, ${result.maps.length} maps, ${result.photos.length} photos from ${pageAnalysis.totalPages} pages`;
    
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
