const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

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
 * Use OpenAI Vision to categorize a page image
 * Returns: 'SKETCH', 'MAP', 'PHOTO', 'FORM', or 'OTHER'
 */
async function categorizePageWithVision(imageBase64, pageNum) {
  if (!process.env.OPENAI_API_KEY) {
    console.log(`  Vision fallback skipped for page ${pageNum}: No OpenAI key`);
    return null;
  }
  
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    const prompt = `Categorize this PDF page from a utility/construction job package. Look at the VISUAL content:

- SKETCH: Construction sketches, pole diagrams, before/after layouts, hand-drawn or CAD drawings with dimensions, technical diagrams
- MAP: Circuit maps, distribution maps, location maps, ADHOC maps, circuit map change sheets, overhead view maps with utility lines
- PHOTO: Real-world photographs of poles, equipment, job sites, field conditions
- FORM: Checklists, text documents, data sheets, tables, permits, tickets

Respond with ONLY one word: SKETCH, MAP, PHOTO, or FORM`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Cost-effective vision model
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
          ]
        }
      ],
      max_tokens: 10
    });
    
    const category = response.choices[0].message.content.trim().toUpperCase();
    console.log(`  Vision categorized page ${pageNum} as: ${category}`);
    return category;
  } catch (err) {
    console.error(`  Vision error for page ${pageNum}:`, err.message);
    return null;
  }
}

/**
 * Render a page to base64 JPEG for vision analysis
 */
async function renderPageToBase64(pdf, pageNum, scale = 1.5) {
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
    
    const buffer = canvasAndContext.canvas.toBuffer('image/jpeg', { quality: 0.7 });
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
      // USA dig/ticket documents have addresses but are NOT maps
      const isFormPage = /face sheet|crew material|equipment information|checklist|feedback to estimating|tag sheet|totals as of|crew instruction|sign.?off|billing|progress billing|paving form|environmental release|best management|job package checklist|utility standard|contractor work checklist|no parking sign|tree trimming|usa ticket|usa north|underground service alert|dig alert|call before you dig|one call|811|excavation notice|locate request|utility locate/i.test(text);
      
      if (isFormPage) {
        result.forms.push(pageNum);
        continue;
      }
      
      // === DRAWING DETECTION ===
      // Only detect pages with these EXACT document type labels
      const hasDrawingKeywords = /construction sketch|pole sheet drawing|plan view drawing/i.test(text);
      
      // === MAP DETECTION ===
      // Only detect pages with these EXACT document type labels
      // Must appear near start of page (first 200 chars) to be a title, not just a reference
      const first200Chars = text.substring(0, 200).toLowerCase();
      const hasMapKeywords = /adhoc|circuit map change sheet|cirmap/.test(first200Chars) || 
                             (first200Chars.includes('circuit map') && !first200Chars.includes('circuit map:'));
      
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
      
      // Priority 1: Explicit keywords ONLY for drawings/maps (most reliable)
      // Only pages with EXPLICIT drawing/map keywords are categorized as such
      if (hasDrawingKeywords) {
        console.log(`  Page ${pageNum} -> DRAWING (text match)`);
        result.drawings.push(pageNum);
      } else if (hasMapKeywords) {
        const matchedKeyword = first200Chars.match(/adhoc|circuit map change sheet|circuit map|cirmap/)?.[0];
        console.log(`  Page ${pageNum} -> MAP (text match: "${matchedKeyword}")`);
        result.maps.push(pageNum);
      }
      // Priority 2: Photo keywords or field notes
      else if (hasPhotoKeywords || hasFieldNotes || isConfidentialOnly) {
        result.photos.push(pageNum);
      }
      // Priority 3: Image-heavy pages need vision analysis
      // Mark for vision check instead of defaulting to photos
      else if (hasImages && (isImageOnly || isImageHeavy || textLength === 0)) {
        // Store for vision analysis
        page.needsVision = true;
      }
    }
    
    // Vision pass: Use AI to categorize image-heavy pages without text clues
    const visionCandidates = pageData.filter(p => p.needsVision);
    if (visionCandidates.length > 0 && process.env.OPENAI_API_KEY) {
      console.log(`Using vision to categorize ${visionCandidates.length} image-heavy pages...`);
      
      // Limit vision calls to save costs (max 10 pages)
      const toAnalyze = visionCandidates.slice(0, 10);
      
      for (const page of toAnalyze) {
        const base64 = await renderPageToBase64(pdf, page.pageNum, 1.0);
        if (base64) {
          const category = await categorizePageWithVision(base64, page.pageNum);
          if (category === 'SKETCH') {
            result.drawings.push(page.pageNum);
          } else if (category === 'MAP') {
            result.maps.push(page.pageNum);
          } else if (category === 'PHOTO') {
            result.photos.push(page.pageNum);
          }
          // FORM and OTHER are ignored
        } else {
          // Fallback to photo if vision fails
          result.photos.push(page.pageNum);
        }
      }
      
      // Any remaining candidates beyond limit go to photos
      for (const page of visionCandidates.slice(10)) {
        result.photos.push(page.pageNum);
      }
    } else if (visionCandidates.length > 0) {
      // No OpenAI key, default all to photos
      console.log(`No OpenAI key for vision, defaulting ${visionCandidates.length} pages to photos`);
      for (const page of visionCandidates) {
        result.photos.push(page.pageNum);
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
