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

// Helper to delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Batch categorize multiple pages with vision in a single API call
 * Returns: Map of pageNum -> category
 */
async function categorizePagesWithVisionBatch(pagesWithImages, retryCount = 0) {
  const results = new Map();
  
  if (!process.env.OPENAI_API_KEY || pagesWithImages.length === 0) {
    return results;
  }
  
  const pageNums = pagesWithImages.map(p => p.pageNum);
  console.log(`  Vision batch analyzing pages: [${pageNums.join(', ')}]`);
  
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    const prompt = `Categorize ${pagesWithImages.length} PG&E utility PDF pages:

MAP: Circuit Map Change Sheet, ADHOC - "ILS Event No.", "GIS Tag No.", pink INSTALL/REMOVE triangles, pole schematics, demand kVA
SKETCH: Construction drawings - TRENCH DETAIL, pole layouts, dimensions, "Clear Fields", CAD diagrams
PHOTO: Real photographs of poles, equipment, job sites, field conditions
FORM: Checklists (CWC), permits, USA tickets - checkboxes, fillable fields, signature lines, tables

Respond JSON only: [{"page":1,"category":"MAP"},{"page":2,"category":"PHOTO"}...]
Page numbers = image order (1=first, 2=second, etc.)`;

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
      max_tokens: 200
    });
    
    // Parse JSON response
    const responseText = response.choices[0].message.content.trim();
    try {
      // Extract JSON array from response (might have markdown)
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
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
    } catch (parseErr) {
      console.error('  Failed to parse vision response:', responseText);
    }
    
    return results;
  } catch (err) {
    // Handle rate limit with exponential backoff (base 2s + jitter)
    if (err.message?.includes('429') && retryCount < 5) {
      const backoffMs = Math.min(2000 * Math.pow(2, retryCount), 60000) + Math.random() * 2000;
      console.log(`  Rate limited, waiting ${(backoffMs/1000).toFixed(1)}s and retrying (attempt ${retryCount + 1}/5)...`);
      await delay(backoffMs);
      return categorizePagesWithVisionBatch(pagesWithImages, retryCount + 1);
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
    const buffer = canvasAndContext.canvas.toBuffer('image/jpeg', { quality: 0.5 });
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
      // Only detect pages that ARE drawings (not forms that reference drawings)
      // Exclude if text ends with ":" (it's a form label) or contains "checklist"
      const drawingMatch = text.match(/construction sketch|pole sheet drawing|plan view drawing/i);
      const hasDrawingKeywords = drawingMatch && 
                                 !text.includes('checklist') && 
                                 !text.match(/pole sheet drawing\s*:/i) && // Exclude form labels like "Pole Sheet Drawing:"
                                 textLength < 500; // Actual drawings have minimal text
      
      // === MAP DETECTION ===
      // Detect CMCS and circuit map pages - check full text for these specific patterns
      const hasMapKeywords = /cmcs|circuit map change sheet|adhoc|cirmap/i.test(text) || 
                             (/circuit map/i.test(text) && !/circuit map:/i.test(text));
      
      // Debug: Log pages that have potential map/sketch indicators
      if (hasMapKeywords || hasDrawingKeywords) {
        console.log(`  Page ${pageNum}: hasMap=${hasMapKeywords}, hasDrawing=${hasDrawingKeywords}, textLen=${textLength}, snippet="${text.substring(0, 100).replace(/\n/g, ' ')}"`);
      }
      
      // === PHOTO DETECTION ===
      // Photos have picture-related keywords or are in field notes sections
      const hasPhotoKeywords = /picture|full pole|photos:|field photo|pictures:/i.test(text);
      const hasFieldNotes = /field notes|field date|oh field notes|confidential.*field/i.test(text);
      
      // === CATEGORIZE BASED ON CONTENT ===
      const hasImages = imageCount > 0;
      const isImageOnly = imageCount > 0 && textLength < 50;  // Pure image, almost no text
      const isImageHeavy = imageCount > 0 && textLength < 2000; // Increased threshold - CMCS pages can have 500-1500 chars
      const isConfidentialOnly = textLength < 20 && /confidential/i.test(text); // Just "Confidential" watermark
      
      // Debug: log every page's categorization decision
      console.log(`  Page ${pageNum}: images=${imageCount}, textLen=${textLength}, isForm=${isFormPage}`);
      
      // Priority 1: Explicit keywords for drawings/maps (these are reliable)
      if (hasDrawingKeywords) {
        console.log(`    -> DRAWING (text match)`);
        result.drawings.push(pageNum);
      } else if (hasMapKeywords) {
        const matchedKeyword = text.match(/cmcs|circuit map change sheet|adhoc|circuit map|cirmap/i)?.[0];
        console.log(`    -> MAP (text match: "${matchedKeyword}")`);
        result.maps.push(pageNum);
      }
      // Priority 2: Any page with images needs vision analysis to verify category
      // Photo keywords like "photos:" or "pictures:" can appear in FORMS as labels
      // Even "confidential only" pages need vision check if they have images
      else if (hasImages) {
        // Store for vision analysis
        page.needsVision = true;
        console.log(`    -> Queued for vision (${imageCount} images, ${textLength} chars)`);
      }
      // No images and no keywords = skip this page (likely a text-only form or blank)
      else {
        console.log(`    -> Skipped (no images, no keywords)`);
      }
    }
    
    // Vision pass: Use AI to categorize image-heavy pages without text clues
    // Process in batches of 5 to reduce API calls and avoid rate limits
    const visionCandidates = pageData.filter(p => p.needsVision);
    if (visionCandidates.length > 0 && process.env.OPENAI_API_KEY) {
      const pageNums = visionCandidates.map(p => p.pageNum);
      console.log(`Using vision to categorize ${visionCandidates.length} image-heavy pages: [${pageNums.join(', ')}]`);
      
      // Render all pages to base64 first
      const pagesWithImages = [];
      for (const page of visionCandidates) {
        const base64 = await renderPageToBase64(pdf, page.pageNum, 0.8); // Lower scale to reduce tokens
        if (base64) {
          pagesWithImages.push({ pageNum: page.pageNum, base64 });
        } else {
          // Fallback to photo if render fails
          result.photos.push(page.pageNum);
        }
      }
      
      // Process in batches of 8 pages per API call (larger batches = fewer calls = less rate limiting)
      const BATCH_SIZE = 8;
      for (let i = 0; i < pagesWithImages.length; i += BATCH_SIZE) {
        const batch = pagesWithImages.slice(i, i + BATCH_SIZE);
        
        // Add delay between batches to avoid rate limits (3 seconds)
        if (i > 0) {
          console.log(`  Waiting 3s before next batch (${Math.floor(i/BATCH_SIZE)+1}/${Math.ceil(pagesWithImages.length/BATCH_SIZE)})...`);
          await delay(3000);
        }
        
        const batchResults = await categorizePagesWithVisionBatch(batch);
        
        // Process results
        for (const page of batch) {
          const category = batchResults.get(page.pageNum);
          if (category === 'SKETCH') {
            result.drawings.push(page.pageNum);
          } else if (category === 'MAP') {
            result.maps.push(page.pageNum);
          } else if (category === 'PHOTO') {
            result.photos.push(page.pageNum);
          } else if (category === 'FORM') {
            // FORM pages are excluded - don't add to any extraction list
            result.forms.push(page.pageNum);
            console.log(`  Skipping FORM page ${page.pageNum}`);
          } else {
            // Only default to photo if we got no category at all
            console.log(`  Unknown category "${category}" for page ${page.pageNum}, defaulting to photo`);
            result.photos.push(page.pageNum);
          }
        }
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
