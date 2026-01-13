/**
 * PDF to Markdown Extractor
 * 
 * Converts PDF files to clean Markdown with image placeholders.
 * Part 1 of the PDF extraction pipeline.
 * 
 * RESEARCH-BASED DESIGN DECISIONS:
 * 
 * 1. PDF → PNG Conversion (300 DPI):
 *    Research shows dramatically better OCR results when converting PDFs to
 *    images first, rather than sending PDFs directly. "Direct PDF input yielded
 *    random text blob, not useable, while JPG pages produced near perfect text
 *    extraction with intact format in markdown."
 * 
 * 2. 20 Pages Per Chunk:
 *    Research recommends 20-30 pages per batch for historical/degraded documents.
 *    Larger batches (50+) show quality degradation. We use 20 to be conservative.
 * 
 * 3. Gemini 3.0 Flash for Extraction:
 *    Chosen for OCR/transcription. Research found that "thinking" models can
 *    overthink straightforward transcription tasks.
 * 
 * 4. PDF Page Numbers for File Naming:
 *    Image files use PDF page index (not printed page numbers) for reliable
 *    mapping between temp page files and image references. Printed page markers
 *    (#pageXX) remain in markdown content for human navigation.
 * 
 * 5. Low Temperature (0.1-0.2):
 *    Improves consistency for transcription tasks.
 * 
 * Usage:
 *   node extract-markdown.js
 * 
 * Output:
 *   output/{pdfName}/
 *   ├── {pdfName}_complete.md     # Final combined markdown
 *   ├── chunks/                   # Per-chunk markdown (for resume)
 *   │   ├── chunk_001-020.md
 *   │   └── chunk_021-040.md
 *   └── temp/pages/               # PDF pages as PNG (for image generation)
 *       ├── page_001.png
 *       └── page_002.png
 */

import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ============================================================================
// CONFIG (positional arg)
// ============================================================================

// Fixed marker used in extracted markdown to indicate split points.
// The LLM is instructed to emit this exact line when a new unit/module/lesson starts.
const SPLIT_MARKER = '<<<< SPLIT HERE >>>>';

// Non-PDF-specific defaults belong here (not in the JSON config).
const DEFAULTS = {
  // Gemini settings
  MODEL: 'gemini-3-pro-preview',
  TEMPERATURE: 1.0,
  MAX_OUTPUT_TOKENS: 32768,

  // Processing settings
  PAGES_PER_CHUNK: 20,
  DPI: 300,

  // Rate limiting / retries
  DELAY_BETWEEN_CHUNKS: 10000, // 10 seconds
  MAX_RETRIES: 3,
  RETRY_DELAY_MULTIPLIER: 3000,
  RATE_LIMIT_DELAY_MULTIPLIER: 5000,

  // Resume
  SKIP_EXISTING: true,
};

function parseArgs() {
  const args = process.argv.slice(2);

  const configPath = args[0];
  if (!configPath) {
    console.error('Usage: node pdf-extract/extract-markdown.js <config.json>');
    console.error('');
    console.error('Example:');
    console.error('  node pdf-extract/extract-markdown.js configs/fsi-french/pdf-extract.json');
    process.exit(1);
  }

  return { configPath };
}

function readJsonFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(text);
}

function loadConfig(args) {
  const absoluteConfigPath = path.resolve(args.configPath);
  const configDir = path.dirname(absoluteConfigPath);
  const cfg = readJsonFile(absoluteConfigPath);

  if (!cfg.inputPdf) {
    console.error(`\nERROR: Missing required field "inputPdf" in config: ${absoluteConfigPath}`);
    process.exit(1);
  }
  if (!cfg.outputDir) {
    console.error(`\nERROR: Missing required field "outputDir" in config: ${absoluteConfigPath}`);
    process.exit(1);
  }

  const extraPrompt = typeof cfg.prompt === 'string' ? cfg.prompt : '';

  return {
    // PDF-dependent config
    INPUT_PDF: path.resolve(configDir, cfg.inputPdf),
    OUTPUT_DIR: path.resolve(configDir, cfg.outputDir),
    SPLIT_ENABLED: cfg.splitEnabled === true,
    SPLIT_INSTRUCTIONS: typeof cfg.splitInstructions === 'string' ? cfg.splitInstructions : '',
    EXTRA_PROMPT: extraPrompt,
    SPLIT_OUTPUT_DIR: cfg.splitOutputDir ? path.resolve(configDir, cfg.splitOutputDir) : null,

    // Hard-coded defaults
    ...DEFAULTS,

    // Environment
    API_KEY: process.env.GEMINI_API_KEY || '',
  };
}

const CONFIG = loadConfig(parseArgs());

// ============================================================================
// CONFIGURATION
// ============================================================================

// NOTE: runtime config is loaded above (JSON config, positional arg).

// ============================================================================
// PROMPTS
// ============================================================================

function buildSplitInstructions(splitEnabled, splitInstructions) {
  if (!splitEnabled) return '';
  const rules = (splitInstructions || '').trim();
  return `
SPLIT MARKERS:
- Detect when a NEW top-level unit begins (course-specific definition below).
- When a new unit begins, insert this marker on its own line IMMEDIATELY BEFORE the first content of that unit:
  ${SPLIT_MARKER}
- Do NOT insert split markers for subsections inside a unit.
- If the first page you see in this chunk begins a new unit, include the marker at the very top of this chunk (before any other content on that page).

COURSE-SPECIFIC SPLIT RULES:
${rules}
`;
}

/**
 * Prompt for markdown extraction.
 * 
 * Key elements:
 * - Uses PRINTED page numbers for #pageXX markers (human navigation)
 * - Uses PDF page numbers for image file names (reliable file mapping)
 * - Detailed instructions for language learning textbook content
 */
const EXTRACTION_PROMPT = (pdfPageStart, pdfPageEnd) => `
You are processing PDF pages ${pdfPageStart}-${pdfPageEnd} of a language learning textbook.

TASK: Convert all content to clean Markdown format.

IMAGE REFERENCES:
- For each illustration/drawing, insert a markdown image reference
- Use PDF page numbers (${pdfPageStart}-${pdfPageEnd}) for the filename, NOT printed page numbers
- Format: ![Detailed description](images/page_XXX_YYY.png)
- XXX = PDF page number (zero-padded to 3 digits)
- YYY = image index on that page (001, 002, etc.)
- The description should be detailed and useful, describing:
  * Who/what is shown (people, objects, scene)
  * What action is happening
  * Any text labels or speech bubbles visible in the image
  * Relevant context for language learning
- Example: ![Two men in business suits shaking hands in an office, one says "Nice to meet you" while the other responds "The pleasure is mine"](images/page_005_001.png)
- Example: ![A family of four sitting at a dinner table with plates of food, labels point to: father, mother, son, daughter](images/page_012_001.png)

${buildSplitInstructions(CONFIG.SPLIT_ENABLED, CONFIG.SPLIT_INSTRUCTIONS)}

CONTENT FORMATTING:
- Use proper markdown: # for headings, - for lists, **bold**, *italic*
- For underlines text, use <u>...</u>
- Preserve dialogues with speaker labels
- Maintain exercise numbering and structure
- Follow natural reading order (left-to-right, top-to-bottom)
- Skip footnotes and header/footer content (book title, page numbers, running headers)

TABLE FORMATTING:
- Convert tables to proper Markdown table format
- Use | to separate columns
- Use |---|---|---| for separator rows
- Keep headers in first row
- For merged cells, repeat content across merged columns

IMPORTANT:
- Return ONLY the markdown text content
- Do not generate or include any images in your response
- No explanations or commentary before or after the markdown
- Use PDF page numbers (${pdfPageStart}-${pdfPageEnd}) for image filenames
${CONFIG.EXTRA_PROMPT ? `\n---\n\nADDITIONAL COURSE/BOOK-SPECIFIC INSTRUCTIONS:\n${CONFIG.EXTRA_PROMPT.trim()}\n` : ''}
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

function zeroPad(num, length = 3) {
  return String(num).padStart(length, '0');
}

function sanitizeFilenamePart(s) {
  return String(s || '')
    .trim()
    .replace(/[\s\/\\]+/g, ' ')
    .replace(/[^a-zA-Z0-9 _.-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function getChunkTitle(markdown) {
  const lines = markdown.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (t === '---') continue;
    if (t.startsWith('#page')) continue;
    if (t.startsWith('![')) continue;
    const m = t.match(/^(#{1,6})\s+(.*)$/);
    if (m) return m[2].trim();
  }
  return '';
}

function splitMarkdownByMarker(fullMarkdown) {
  const parts = fullMarkdown.split(new RegExp(`^\\s*${SPLIT_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm'));
  return parts.map(p => p.trim()).filter(p => p.length > 0);
}

// ============================================================================
// PDF to PNG Conversion
// ============================================================================

/**
 * Convert all PDF pages to PNG images using pdftoppm (poppler-utils).
 * 
 * RESEARCH NOTE:
 * Converting PDFs to images before processing yields dramatically better
 * OCR results compared to direct PDF input. We use PNG (lossless) rather
 * than JPEG to preserve quality for downstream image generation.
 * 
 * @param {string} pdfPath - Path to input PDF
 * @param {string} outputDir - Directory to save page images
 * @param {number} dpi - Resolution (300 recommended, 400-600 for small fonts)
 * @returns {Promise<{pageCount: number, pagePaths: string[]}>}
 */
async function convertPdfToPages(pdfPath, outputDir, dpi = CONFIG.DPI) {
  ensureDir(outputDir);
  
  // Get page count first
  const bytes = await fs.promises.readFile(pdfPath);
  const pdfDoc = await PDFDocument.load(bytes);
  const pageCount = pdfDoc.getPageCount();
  
  console.log(`Converting ${pageCount} PDF pages to PNG at ${dpi} DPI...`);
  
  const pagePaths = [];
  
  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const outputPath = path.join(outputDir, `page_${zeroPad(pageNum)}.png`);
    
    // Skip if already converted
    if (fs.existsSync(outputPath)) {
      pagePaths.push(outputPath);
      continue;
    }
    
    try {
      // pdftoppm creates files like: prefix-01.png
      // We use -singlefile to get exact output name
      const tempPrefix = path.join(outputDir, `temp_page_${zeroPad(pageNum)}`);
      const cmd = `pdftoppm -f ${pageNum} -l ${pageNum} -png -r ${dpi} -singlefile "${pdfPath}" "${tempPrefix}"`;
      execSync(cmd, { stdio: 'pipe' });
      
      // Rename to our format
      const generatedPath = `${tempPrefix}.png`;
      if (fs.existsSync(generatedPath)) {
        fs.renameSync(generatedPath, outputPath);
      }
      
      pagePaths.push(outputPath);
      
      if (pageNum % 10 === 0) {
        console.log(`  Converted ${pageNum}/${pageCount} pages...`);
      }
    } catch (error) {
      console.error(`  Error converting page ${pageNum}: ${error.message}`);
      throw error;
    }
  }
  
  console.log(`  Done converting ${pageCount} pages to PNG`);
  return { pageCount, pagePaths };
}

// ============================================================================
// PDF Chunk Processing
// ============================================================================

/**
 * Split PDF into chunks for processing.
 * 
 * RESEARCH NOTE:
 * Processing 20-30 pages per batch provides optimal balance of quality and
 * efficiency. Larger batches show quality degradation ("lost in the middle"
 * phenomenon where content in center of long contexts receives less attention).
 */
async function splitPdfIntoChunks(pdfPath, pagesPerChunk) {
  const bytes = await fs.promises.readFile(pdfPath);
  const pdfDoc = await PDFDocument.load(bytes);
  const totalPages = pdfDoc.getPageCount();
  
  const dir = path.dirname(pdfPath);
  const baseName = path.basename(pdfPath, path.extname(pdfPath));
  const chunkPaths = [];
  const pageRanges = [];
  
  for (let start = 0; start < totalPages; start += pagesPerChunk) {
    const end = Math.min(start + pagesPerChunk, totalPages);
    const newPdf = await PDFDocument.create();
    const pages = await newPdf.copyPages(
      pdfDoc,
      Array.from({ length: end - start }, (_, i) => i + start)
    );
    pages.forEach((pg) => newPdf.addPage(pg));
    const chunkBytes = await newPdf.save();
    
    const chunkPath = path.join(dir, `${baseName}_chunk_${start + 1}-${end}.pdf`);
    await fs.promises.writeFile(chunkPath, chunkBytes);
    chunkPaths.push(chunkPath);
    pageRanges.push({ start: start + 1, end });  // 1-indexed
  }
  
  return { chunkPaths, pageRanges, totalPages };
}

// ============================================================================
// Gemini API Wrapper
// ============================================================================

class MarkdownExtractor {
  constructor(apiKey) {
    this.genai = new GoogleGenAI({ apiKey });
  }
  
  /**
   * Upload file to Gemini with retry logic
   */
  async uploadFileWithRetry(filePath, maxRetries) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`  Upload attempt ${attempt}/${maxRetries}...`);
        
        const uploadResult = await this.genai.files.upload({
          file: filePath,
          config: {
            displayName: `pdf_${Date.now()}_${path.basename(filePath)}`,
            mimeType: 'application/pdf',
          },
        });
        
        const processedFile = await this.waitForFileProcessing(uploadResult.name);
        return processedFile;
      } catch (error) {
        console.error(`  Upload attempt ${attempt} failed:`, error.message || error);
        
        if (attempt === maxRetries) {
          throw new Error(`Upload failed after ${maxRetries} attempts: ${error}`);
        }
        
        const delay = Math.pow(2, attempt) * CONFIG.RETRY_DELAY_MULTIPLIER;
        console.log(`  Retrying in ${delay / 1000} seconds...`);
        await sleep(delay);
      }
    }
    throw new Error('Upload failed');
  }
  
  /**
   * Wait for file to finish processing
   */
  async waitForFileProcessing(fileName) {
    let file = await this.genai.files.get({ name: fileName });
    let attempts = 0;
    const maxAttempts = 60;
    
    while (file.state === 'PROCESSING' && attempts < maxAttempts) {
      await sleep(5000);
      file = await this.genai.files.get({ name: fileName });
      attempts++;
      
      if (attempts % 6 === 0) {
        console.log(`  Still processing... (${attempts * 5}s elapsed)`);
      }
    }
    
    if (file.state !== 'ACTIVE') {
      throw new Error(`File processing failed. State: ${file.state}`);
    }
    
    return file;
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
   * Extract markdown from a PDF chunk
   */
  async extractMarkdown(file, pdfPageStart, pdfPageEnd) {
    const prompt = EXTRACTION_PROMPT(pdfPageStart, pdfPageEnd);
    
    const response = await this.callWith429Retry(
      () => this.genai.models.generateContent({
        model: CONFIG.MODEL,
        contents: [
          {
            parts: [
              { text: prompt },
              { fileData: { mimeType: file.mimeType, fileUri: file.uri } },
            ],
          },
        ],
        config: {
          // Research: low temperature improves consistency for transcription
          temperature: CONFIG.TEMPERATURE,
          maxOutputTokens: CONFIG.MAX_OUTPUT_TOKENS,
        },
      }),
      CONFIG.MAX_RETRIES
    );
    
    // Debug: log response structure to see non-text parts
    if (response.candidates?.[0]?.content?.parts) {
      const parts = response.candidates[0].content.parts;
      const nonTextParts = parts.filter(p => !p.text);
      if (nonTextParts.length > 0) {
        console.log(`  [Debug] Response has ${parts.length} parts, ${nonTextParts.length} non-text:`);
        nonTextParts.forEach((p, i) => {
          console.log(`    Part ${i}: ${JSON.stringify(Object.keys(p))}`);
        });
      }
    }
    
    return response.text || '';
  }
  
  /**
   * Clean up uploaded file from Gemini
   */
  async cleanupFile(fileName) {
    try {
      await this.genai.files.delete({ name: fileName });
    } catch (error) {
      console.warn(`  Failed to cleanup file ${fileName}`);
    }
  }
}

// ============================================================================
// Main Extraction Pipeline
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('PDF to Markdown Extractor');
  console.log('='.repeat(60));
  console.log(`\nInput:  ${CONFIG.INPUT_PDF}`);
  console.log(`Output: ${CONFIG.OUTPUT_DIR}`);
  console.log(`Model:  ${CONFIG.MODEL}`);
  console.log(`Pages per chunk: ${CONFIG.PAGES_PER_CHUNK}`);
  console.log(`DPI: ${CONFIG.DPI}`);
  
  if (!CONFIG.API_KEY) {
    console.error('\nERROR: GEMINI_API_KEY not set!');
    console.error('Set it as: export GEMINI_API_KEY="your-key-here"');
    process.exit(1);
  }
  
  const pdfBaseName = path.basename(CONFIG.INPUT_PDF, '.pdf');
  // Keep per-PDF subfolder for resume + generate-images compatibility.
  const outputDir = path.join(CONFIG.OUTPUT_DIR, pdfBaseName);
  const chunksDir = path.join(outputDir, 'chunks');
  const pagesDir = path.join(outputDir, 'temp', 'pages');
  const imagesDir = path.join(outputDir, 'images');
  
  ensureDir(outputDir);
  ensureDir(chunksDir);
  ensureDir(pagesDir);
  ensureDir(imagesDir);
  
  // Step 1: Convert PDF pages to PNG
  // This is used by generate-images.js later
  console.log('\n[Step 1] Converting PDF pages to PNG...');
  const { pageCount, pagePaths } = await convertPdfToPages(
    CONFIG.INPUT_PDF, 
    pagesDir, 
    CONFIG.DPI
  );
  
  // Step 2: Split PDF into chunks
  console.log('\n[Step 2] Splitting PDF into chunks...');
  const { chunkPaths, pageRanges, totalPages } = await splitPdfIntoChunks(
    CONFIG.INPUT_PDF,
    CONFIG.PAGES_PER_CHUNK
  );
  console.log(`  Created ${chunkPaths.length} chunks from ${totalPages} pages`);
  
  // Step 3: Process each chunk
  console.log('\n[Step 3] Extracting markdown from chunks...');
  const extractor = new MarkdownExtractor(CONFIG.API_KEY);
  
  let combinedMarkdown = `# ${pdfBaseName}\n\nExtracted from PDF with ${totalPages} pages.\n\n---\n\n`;
  
  for (let i = 0; i < chunkPaths.length; i++) {
    const chunkPath = chunkPaths[i];
    const { start, end } = pageRanges[i];
    const chunkMdPath = path.join(chunksDir, `chunk_${zeroPad(start)}-${zeroPad(end)}.md`);
    
    console.log(`\n[Chunk ${i + 1}/${chunkPaths.length}] Pages ${start}-${end}`);
    
    // Resume: skip if already processed
    if (CONFIG.SKIP_EXISTING && fs.existsSync(chunkMdPath)) {
      console.log(`  ⊙ Already processed, loading from disk...`);
      const existingMd = await fs.promises.readFile(chunkMdPath, 'utf8');
      combinedMarkdown += existingMd + '\n\n---\n\n';
      
      // Clean up chunk PDF
      if (chunkPath !== CONFIG.INPUT_PDF && fs.existsSync(chunkPath)) {
        await fs.promises.unlink(chunkPath).catch(() => {});
      }
      continue;
    }
    
    try {
      // Upload chunk
      const uploadedFile = await extractor.uploadFileWithRetry(chunkPath, CONFIG.MAX_RETRIES);
      
      // Extract markdown
      console.log(`  Extracting markdown...`);
      const markdown = await extractor.extractMarkdown(uploadedFile, start, end);
      console.log(`  ✓ Extracted ${markdown.length} chars`);
      
      // Save chunk markdown
      await fs.promises.writeFile(chunkMdPath, markdown, 'utf8');
      combinedMarkdown += markdown + '\n\n---\n\n';
      
      // Clean up
      await extractor.cleanupFile(uploadedFile.name);
      
    } catch (error) {
      console.error(`  ✗ Error: ${error.message}`);
    }
    
    // Clean up chunk PDF
    if (chunkPath !== CONFIG.INPUT_PDF && fs.existsSync(chunkPath)) {
      await fs.promises.unlink(chunkPath).catch(() => {});
    }
    
    // Delay between chunks
    if (i < chunkPaths.length - 1) {
      console.log(`  Waiting ${CONFIG.DELAY_BETWEEN_CHUNKS / 1000}s...`);
      await sleep(CONFIG.DELAY_BETWEEN_CHUNKS);
    }
  }
  
  // Step 4: Save combined markdown
  const completeMdPath = path.join(outputDir, `${pdfBaseName}_complete.md`);
  await fs.promises.writeFile(completeMdPath, combinedMarkdown, 'utf8');

  // Step 5 (optional): Split combined markdown into per-unit files for module-convert
  if (CONFIG.SPLIT_ENABLED && CONFIG.SPLIT_OUTPUT_DIR) {
    console.log('\n[Step 5] Splitting combined markdown into per-unit files...');
    ensureDir(CONFIG.SPLIT_OUTPUT_DIR);

    const chunks = splitMarkdownByMarker(combinedMarkdown);
    console.log(`  Found ${chunks.length} section(s) to write`);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const title = getChunkTitle(chunk);
      const slug = sanitizeFilenamePart(title);
      const fileBase = `${String(i + 1).padStart(3, '0')}${slug ? ` - ${slug}` : ''}.md`;
      const outPath = path.join(CONFIG.SPLIT_OUTPUT_DIR, fileBase);

      // Resume behavior: do not overwrite existing files (protect manual edits)
      if (fs.existsSync(outPath)) {
        continue;
      }

      await fs.promises.writeFile(outPath, chunk.trim() + '\n', 'utf8');
    }

    console.log(`  Wrote split markdown to: ${CONFIG.SPLIT_OUTPUT_DIR}`);
    console.log(`  (Marker line is fixed: ${SPLIT_MARKER})`);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Extraction Complete!');
  console.log('='.repeat(60));
  console.log(`\nMarkdown: ${completeMdPath}`);
  console.log(`Pages:    ${pagesDir}`);
  console.log(`\nNext step: Generate improved images (optional):`);
  console.log(`  node pdf-extract/generate-images.js --input "${outputDir}"`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

