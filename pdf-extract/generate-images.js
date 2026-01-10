/**
 * Image Generator from Markdown
 * 
 * Parses markdown for image references and generates improved 1:1 images.
 * Part 2 of the PDF extraction pipeline.
 * 
 * RESEARCH-BASED DESIGN DECISIONS:
 * 
 * 1. Minimal Context During Generation:
 *    Research shows "attention dilution" - as context grows, the model's
 *    attention spreads thin and style fidelity drops. We load ONLY the
 *    specific page containing the image, not the full PDF or many pages.
 *    "More reference images = attention dilution = worse output quality"
 * 
 * 2. Separate Extraction from Generation:
 *    The extraction phase (many pages) and generation phase (minimal context)
 *    have different optimal context sizes. We separate them into two scripts.
 * 
 * 3. 1:1 Aspect Ratio:
 *    Square images work well for mobile language learning apps. We request
 *    1:1 directly from the model rather than resizing afterward.
 * 
 * 4. Resume by File Existence:
 *    Simple and robust - if the image file exists on disk, skip it.
 *    No need for separate tracking JSON.
 * 
 * 5. PDF Page Numbers for File Mapping:
 *    Image filenames use PDF page index (page_005_001.png) which maps directly
 *    to temp page files (temp/pages/page_005.png). This avoids the complexity
 *    of tracking printed page number to PDF page number mappings.
 * 
 * Future Improvements (not implemented yet):
 * - Style reference images (1-3 exemplars for consistent style)
 * - Textual style guidelines ("line weight: thin black outlines...")
 * - Colorization mode
 * 
 * Usage:
 *   node generate-images.js
 * 
 * Input (from extract-markdown.js):
 *   output/{pdfName}/
 *   ├── {pdfName}_complete.md     # Markdown with image references
 *   └── temp/pages/               # PDF pages as PNG
 * 
 * Output:
 *   output/{pdfName}/
 *   └── images/                   # Generated 1:1 images
 *       ├── page_005_001.png
 *       └── page_005_002.png
 */

import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

// ============================================================================
// CLI ARGUMENTS
// ============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const getArg = (name) => {
    const idx = args.indexOf(name);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
  };
  
  const inputDir = getArg('--input');
  
  if (!inputDir) {
    console.error('Usage: node generate-images.js --input <extracted-dir>');
    console.error('');
    console.error('Options:');
    console.error('  --input   Path to extracted output directory (from extract-markdown.js)');
    console.error('');
    console.error('Example:');
    console.error('  node generate-images.js --input ./output/textbook');
    process.exit(1);
  }
  
  return { inputDir };
}

const ARGS = parseArgs();

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Input directory (from CLI - output from extract-markdown.js)
  INPUT_DIR: path.resolve(ARGS.inputDir),
  
  // Gemini settings
  MODEL: 'gemini-3-pro-image-preview',
  API_KEY: process.env.GEMINI_API_KEY || '',
  
  // Image settings
  IMAGE_SIZE: 1024,  // Request 1:1 at this size
  
  // Rate limiting
  DELAY_BETWEEN_IMAGES: 5000,  // 5 seconds between image generations
  MAX_RETRIES: 3,
  RETRY_DELAY_MULTIPLIER: 3000,
  RATE_LIMIT_DELAY_MULTIPLIER: 5000,
};

// ============================================================================
// PROMPTS
// ============================================================================

/**
 * Prompt for image generation.
 * 
 * RESEARCH NOTE:
 * We provide up to 3 pages as context (prev, current, next) - all pages that
 * have images on them. This gives the model style examples while keeping
 * context minimal (research shows more images = attention dilution).
 * 
 * The first image is always the TARGET page. Additional images are STYLE
 * REFERENCE pages from nearby in the document.
 */
const IMAGE_GENERATION_PROMPT = (description, hasStylePages) => `
${hasStylePages ? 'I am showing you several pages from a language learning textbook. The FIRST image is the TARGET page containing the illustration to recreate. The other images are STYLE REFERENCE pages showing the illustration style used in this book.' : 'Look at this page from a language learning textbook.'}

Find the illustration on the TARGET page that matches this description: "${description}"

Generate a FAITHFUL REPRODUCTION of this illustration with improved quality:

CRITICAL - PRESERVE THE ORIGINAL STYLE:
- Keep the SAME artistic style as the original (line weight, shading technique, character proportions)
- Do NOT modernize or change the illustration style
- The goal is a cleaner, higher quality version of the SAME illustration - not a reinterpretation

REQUIREMENTS:
1. Square format (1:1 aspect ratio)
2. Faithful to the original style and composition
3. Improve ONLY: scan quality, line clarity, and any artifacts from the original scan
4. Keep the same subject matter, poses, and visual elements
5. Size: approximately ${CONFIG.IMAGE_SIZE}x${CONFIG.IMAGE_SIZE} pixels
6. Include any text labels that are part of the illustration

Generate the image now.
`;

// ============================================================================
// Utility Functions
// ============================================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// ============================================================================
// Markdown Parser
// ============================================================================

/**
 * Parse markdown to extract image references.
 * 
 * Expected format: ![description](images/page_XXX_YYY.png)
 * 
 * @param {string} markdown - Markdown content
 * @returns {Array<{description: string, filename: string, pageNum: number, imageIndex: number}>}
 */
function parseImageReferences(markdown) {
  // Match: ![any description](images/page_XXX_YYY.png)
  const regex = /!\[([^\]]*)\]\(images\/(page_(\d+)_(\d+)\.png)\)/g;
  const images = [];
  let match;
  
  while ((match = regex.exec(markdown)) !== null) {
    images.push({
      description: match[1],
      filename: match[2],
      pageNum: parseInt(match[3], 10),
      imageIndex: parseInt(match[4], 10),
    });
  }
  
  return images;
}

/**
 * Get unique page numbers that have images, sorted.
 */
function getPagesWithImages(images) {
  const pages = [...new Set(images.map(img => img.pageNum))];
  return pages.sort((a, b) => a - b);
}

/**
 * Find neighboring pages with images for style context.
 * Returns up to 2 additional pages (before and after) that have images.
 * 
 * @param {number} targetPage - The page we're generating an image for
 * @param {number[]} pagesWithImages - Sorted list of pages that have images
 * @returns {number[]} - Array of page numbers to use as style context (excluding target)
 */
function getStyleContextPages(targetPage, pagesWithImages) {
  const targetIndex = pagesWithImages.indexOf(targetPage);
  const contextPages = [];
  
  // Get previous page with images
  if (targetIndex > 0) {
    contextPages.push(pagesWithImages[targetIndex - 1]);
  }
  
  // Get next page with images
  if (targetIndex < pagesWithImages.length - 1) {
    contextPages.push(pagesWithImages[targetIndex + 1]);
  }
  
  return contextPages;
}

// ============================================================================
// Gemini Image Generator
// ============================================================================

class ImageGenerator {
  constructor(apiKey) {
    this.genai = new GoogleGenAI({ apiKey });
  }
  
  /**
   * Call Gemini API with 429 (rate limit) retry handling
   */
  async callWith429Retry(fn, maxAttempts) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        const is429 = err?.status === 429 || err?.code === 429 || 
                      err?.message?.includes('RESOURCE_EXHAUSTED');
        if (!is429 || attempt === maxAttempts) throw err;
        
        const delay = Math.pow(2, attempt) * CONFIG.RATE_LIMIT_DELAY_MULTIPLIER;
        console.warn(`  Hit 429 – retrying in ${delay / 1000}s (attempt ${attempt}/${maxAttempts})`);
        await sleep(delay);
      }
    }
    throw new Error('Exceeded retries');
  }
  
  /**
   * Generate an improved image based on page(s) and description.
   * 
   * RESEARCH NOTE:
   * We send the target page plus up to 2 style reference pages (neighboring
   * pages that also have images). This provides style context while keeping
   * the total to 3 pages max - still minimal enough to avoid attention dilution.
   * 
   * @param {string} targetPagePath - Path to the target page PNG (contains the image to recreate)
   * @param {string[]} stylePagePaths - Paths to style reference pages (optional, 0-2 pages)
   * @param {string} description - Description of the image to generate
   * @returns {Promise<Buffer|null>} - Generated image data or null if failed
   */
  async generateImage(targetPagePath, stylePagePaths, description) {
    const hasStylePages = stylePagePaths.length > 0;
    const prompt = IMAGE_GENERATION_PROMPT(description, hasStylePages);
    
    // Build parts array: prompt + target page + style pages
    const parts = [{ text: prompt }];
    
    // Helper to add image part
    const addImagePart = async (imagePath) => {
      const imageData = await fs.promises.readFile(imagePath);
      const base64Image = imageData.toString('base64');
      const ext = path.extname(imagePath).toLowerCase();
      const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
      parts.push({
        inlineData: {
          mimeType: mimeType,
          data: base64Image
        }
      });
    };
    
    // Add target page FIRST (most important)
    await addImagePart(targetPagePath);
    
    // Add style reference pages
    for (const stylePath of stylePagePaths) {
      await addImagePart(stylePath);
    }
    
    const response = await this.callWith429Retry(
      () => this.genai.models.generateContent({
        model: CONFIG.MODEL,
        contents: [{ parts }],
        config: {
          responseModalities: ['IMAGE'],
          temperature: 0.4,
        },
      }),
      CONFIG.MAX_RETRIES
    );
    
    // Extract image from response
    let imageData = null;
    
    const extractImage = (parts) => {
      for (const part of parts) {
        if (part.inlineData) {
          return Buffer.from(part.inlineData.data, 'base64');
        }
      }
      return null;
    };
    
    if (response.candidates?.[0]?.content?.parts) {
      imageData = extractImage(response.candidates[0].content.parts);
    }
    if (!imageData && response.parts) {
      imageData = extractImage(response.parts);
    }
    
    return imageData;
  }
}

// ============================================================================
// Main Generation Pipeline
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('Image Generator from Markdown');
  console.log('='.repeat(60));
  console.log(`\nInput:  ${CONFIG.INPUT_DIR}`);
  console.log(`Model:  ${CONFIG.MODEL}`);
  console.log(`Size:   ${CONFIG.IMAGE_SIZE}x${CONFIG.IMAGE_SIZE}`);
  
  if (!CONFIG.API_KEY) {
    console.error('\nERROR: GEMINI_API_KEY not set!');
    console.error('Set it as: export GEMINI_API_KEY="your-key-here"');
    process.exit(1);
  }
  
  // Find the markdown file
  const dirName = path.basename(CONFIG.INPUT_DIR);
  const markdownPath = path.join(CONFIG.INPUT_DIR, `${dirName}_complete.md`);
  const pagesDir = path.join(CONFIG.INPUT_DIR, 'temp', 'pages');
  const imagesDir = path.join(CONFIG.INPUT_DIR, 'images');
  
  if (!fs.existsSync(markdownPath)) {
    console.error(`\nERROR: Markdown file not found: ${markdownPath}`);
    console.error('Run extract-markdown.js first.');
    process.exit(1);
  }
  
  if (!fs.existsSync(pagesDir)) {
    console.error(`\nERROR: Pages directory not found: ${pagesDir}`);
    console.error('Run extract-markdown.js first.');
    process.exit(1);
  }
  
  ensureDir(imagesDir);
  
  // Step 1: Parse markdown for image references
  console.log('\n[Step 1] Parsing markdown for image references...');
  const markdown = await fs.promises.readFile(markdownPath, 'utf8');
  const images = parseImageReferences(markdown);
  console.log(`  Found ${images.length} image reference(s)`);
  
  if (images.length === 0) {
    console.log('\nNo images to generate. Done!');
    return;
  }
  
  // Get list of pages that have images (for style context)
  const pagesWithImages = getPagesWithImages(images);
  console.log(`  Images spread across ${pagesWithImages.length} pages`);
  
  // Step 2: Generate each image
  console.log('\n[Step 2] Generating images with style context...');
  const generator = new ImageGenerator(CONFIG.API_KEY);
  
  let generated = 0;
  let skipped = 0;
  let failed = 0;
  
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const outputPath = path.join(imagesDir, img.filename);
    const targetPagePath = path.join(pagesDir, `page_${String(img.pageNum).padStart(3, '0')}.png`);
    
    console.log(`\n[${i + 1}/${images.length}] ${img.filename}`);
    console.log(`  Description: ${img.description.substring(0, 60)}${img.description.length > 60 ? '...' : ''}`);
    
    // Resume: skip if already exists
    if (fs.existsSync(outputPath)) {
      console.log(`  ⊙ Already exists, skipping`);
      skipped++;
      continue;
    }
    
    // Check target page image exists
    if (!fs.existsSync(targetPagePath)) {
      console.log(`  ✗ Page image not found: ${targetPagePath}`);
      failed++;
      continue;
    }
    
    // Get style context pages (neighboring pages with images)
    const contextPageNums = getStyleContextPages(img.pageNum, pagesWithImages);
    const stylePagePaths = contextPageNums
      .map(pageNum => path.join(pagesDir, `page_${String(pageNum).padStart(3, '0')}.png`))
      .filter(p => fs.existsSync(p));  // Only include pages that exist
    
    if (stylePagePaths.length > 0) {
      console.log(`  Style context: ${contextPageNums.length} nearby page(s) with images`);
    }
    
    try {
      const imageData = await generator.generateImage(targetPagePath, stylePagePaths, img.description);
      
      if (imageData) {
        await fs.promises.writeFile(outputPath, imageData);
        console.log(`  ✓ Generated: ${img.filename}`);
        generated++;
      } else {
        console.log(`  ✗ No image data returned`);
        failed++;
      }
    } catch (error) {
      console.log(`  ✗ Error: ${error.message}`);
      failed++;
    }
    
    // Delay between images
    if (i < images.length - 1) {
      await sleep(CONFIG.DELAY_BETWEEN_IMAGES);
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Generation Complete!');
  console.log('='.repeat(60));
  console.log(`\nGenerated: ${generated}`);
  console.log(`Skipped:   ${skipped}`);
  console.log(`Failed:    ${failed}`);
  console.log(`\nOutput: ${imagesDir}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

