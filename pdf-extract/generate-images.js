/**
 * Image Generator from Markdown (crop + re-render hybrid)
 *
 * Part 2 of the PDF extraction pipeline. Produces one clean illustration per
 * image reference in the extracted markdown.
 *
 * WHY THIS DESIGN (crop + re-render, not full-page generation):
 *   Asking an image model to "find illustration X on this whole page and redraw
 *   it" is unreliable on dense pages: it picks the wrong panel, flips arrow
 *   directions, and drifts in style. Instead we:
 *     1. Detect each illustration's bounding box on the page (one vision call
 *        per page, using the markdown descriptions + printed #N panel numbers).
 *     2. Expand the box by a margin and CROP that region straight out of the
 *        300-DPI source-PDF scan (pdftoppm) -> a tight, unambiguous reference of
 *        the ONE correct illustration.
 *     3. Re-render from that crop. The model only ever sees the single correct
 *        illustration, so panel-selection and arrow-direction errors are
 *        structurally eliminated; it just cleans up the line art.
 *
 * Resume: skips images whose output file already exists.
 *
 * Input (from extract-markdown.js):
 *   <outputDir>/<pdfName>/
 *   ├── <pdfName>_complete.md     # markdown with ![#N desc](images/page_XXX_YYY.png)
 *   └── temp/pages/page_XXX.png   # full page scans (300 DPI)
 * Output:
 *   <outputDir>/<pdfName>/images/page_XXX_YYY.png
 */

import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ============================================================================
// CONFIG (positional arg)
// ============================================================================

function parseArgs() {
  const configPath = process.argv[2];
  if (!configPath) {
    console.error('Usage: node pdf-extract/generate-images.js <pdf-extract-config.json>');
    console.error('Example:');
    console.error('  node pdf-extract/generate-images.js configs/fsi-french/pdf-extract.json');
    process.exit(1);
  }
  return { configPath };
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadConfig(configPath) {
  const absoluteConfigPath = path.resolve(configPath);
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

  const sourcePdf = path.resolve(configDir, cfg.inputPdf);
  const outputDirAbs = path.resolve(configDir, cfg.outputDir);
  const pdfBaseName = path.basename(sourcePdf, '.pdf');

  return {
    // extract-markdown.js writes to: <outputDir>/<pdfBaseName>/...
    INPUT_DIR: path.join(outputDirAbs, pdfBaseName),
    SOURCE_PDF: sourcePdf,

    // Models
    IMAGE_MODEL: typeof cfg.imageModel === 'string' && cfg.imageModel.trim() ? cfg.imageModel.trim() : 'gemini-3-pro-image',
    BBOX_MODEL: typeof cfg.bboxModel === 'string' && cfg.bboxModel.trim() ? cfg.bboxModel.trim() : 'gemini-3.5-flash',

    // Crop settings
    DPI: 300, // must match the DPI used to render temp/pages in extract-markdown.js
    EXPAND: typeof cfg.imageExpand === 'number' ? cfg.imageExpand : 0.25, // grow bbox by this fraction (margin)

    // Rate limiting / retries
    API_KEY: process.env.GEMINI_API_KEY || '',
    DELAY_BETWEEN_IMAGES: 3000,
    MAX_RETRIES: 3,
    RETRY_DELAY_MULTIPLIER: 3000,
    RATE_LIMIT_DELAY_MULTIPLIER: 5000,
  };
}

const CONFIG = loadConfig(parseArgs().configPath);

// ============================================================================
// PROMPTS
// ============================================================================

const BBOX_PROMPT = (images) => `
This is one page from a language learning textbook containing ${images.length} illustration(s).

For EACH illustration listed below, return the tight bounding box of the DRAWING/ARTWORK only:
- INCLUDE the whole illustration and any arrows that are part of it.
- EXCLUDE the rectangular panel border/frame box (if any).
- EXCLUDE any small printed panel number (e.g. "8.").

Illustrations (id, printed panel number if any, description):
${images.map(im => `- id ${im.imageIndex}${im.panelNumber != null ? ` (panel #${im.panelNumber})` : ''}: ${im.cleanDescription}`).join('\n')}

Return ONLY JSON: an array of {"id": <id>, "box": [ymin, xmin, ymax, xmax]} with coordinates
normalized to integers 0-1000 (top-left origin). One object per illustration id above.
`;

const RERENDER_PROMPT = (description) => `
You are given a SINGLE illustration cropped from a black-and-white language-learning textbook.
The crop has some surrounding margin and may show small fragments of neighbouring illustrations
at the very edges.

Target illustration: "${description}"

Recreate the MAIN, CENTRAL illustration as a clean, faithful, higher-quality reproduction:
- Reproduce it EXACTLY: same composition, poses, objects, and the SAME ARROW DIRECTIONS.
  Do NOT mirror, rotate, or change any direction of motion or arrows.
- Keep the original black-and-white line-art style (line weight, shading, proportions).
- EXCLUDE: any panel frame/border, the printed panel number, and any partial neighbouring
  illustrations near the edges.
- Output ONLY the central illustration on a plain white background, square 1:1 aspect ratio.
Generate the image now.
`;

// ============================================================================
// Utilities
// ============================================================================

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function extractJsonArray(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('No JSON array in response');
  return JSON.parse(raw.slice(start, end + 1));
}

/**
 * Parse markdown image references.
 * The extractor may begin a description with a "#N" marker (printed panel number).
 * We keep the raw description, expose the parsed panelNumber, and a cleanDescription
 * (without the marker) for prompts.
 */
function parseImageReferences(markdown) {
  const regex = /!\[([^\]]*)\]\(images\/(page_(\d+)_(\d+)\.png)\)/g;
  const images = [];
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    const description = match[1];
    const numMatch = description.match(/^#(\d{1,3})\b/);
    images.push({
      description,
      cleanDescription: description.replace(/^#\d+\s*/, ''),
      filename: match[2],
      pageNum: parseInt(match[3], 10),
      imageIndex: parseInt(match[4], 10),
      panelNumber: numMatch ? parseInt(numMatch[1], 10) : null,
    });
  }
  return images;
}

function groupByPage(images) {
  const byPage = new Map();
  for (const img of images) {
    if (!byPage.has(img.pageNum)) byPage.set(img.pageNum, []);
    byPage.get(img.pageNum).push(img);
  }
  return byPage;
}

// ============================================================================
// Gemini wrappers
// ============================================================================

class ImagePipeline {
  constructor(apiKey) {
    this.genai = new GoogleGenAI({ apiKey });
  }

  async callWith429Retry(fn, maxAttempts) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        const is429 = err?.status === 429 || err?.code === 429 || err?.message?.includes('RESOURCE_EXHAUSTED');
        if (!is429 || attempt === maxAttempts) throw err;
        const delay = Math.pow(2, attempt) * CONFIG.RATE_LIMIT_DELAY_MULTIPLIER;
        console.warn(`  Hit 429 - retrying in ${delay / 1000}s (attempt ${attempt}/${maxAttempts})`);
        await sleep(delay);
      }
    }
    throw new Error('Exceeded retries');
  }

  /** Detect bounding boxes for all illustrations on a page. Returns { id: [ymin,xmin,ymax,xmax] }. */
  async detectBoxes(pagePngPath, images) {
    const data = fs.readFileSync(pagePngPath).toString('base64');
    const resp = await this.callWith429Retry(
      () => this.genai.models.generateContent({
        model: CONFIG.BBOX_MODEL,
        contents: [{ parts: [
          { text: BBOX_PROMPT(images) },
          { inlineData: { mimeType: 'image/png', data } },
        ] }],
        config: { thinkingConfig: { thinkingLevel: 'LOW' }, responseMimeType: 'application/json' },
      }),
      CONFIG.MAX_RETRIES
    );
    const boxes = {};
    for (const b of extractJsonArray(resp.text || '')) {
      if (b && typeof b.id !== 'undefined' && Array.isArray(b.box)) boxes[b.id] = b.box;
    }
    return boxes;
  }

  /** Re-render a single-illustration crop into a clean image. Returns a Buffer or null. */
  async rerender(refPngPath, description) {
    const data = fs.readFileSync(refPngPath).toString('base64');
    for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
      const resp = await this.callWith429Retry(
        () => this.genai.models.generateContent({
          model: CONFIG.IMAGE_MODEL,
          contents: [{ parts: [
            { text: RERENDER_PROMPT(description) },
            { inlineData: { mimeType: 'image/png', data } },
          ] }],
          config: { responseModalities: ['IMAGE'] },
        }),
        CONFIG.MAX_RETRIES
      );
      for (const part of (resp.candidates?.[0]?.content?.parts || [])) {
        if (part.inlineData) return Buffer.from(part.inlineData.data, 'base64');
      }
      console.warn(`  No image returned - attempt ${attempt}/${CONFIG.MAX_RETRIES}`);
      if (attempt < CONFIG.MAX_RETRIES) await sleep(CONFIG.RETRY_DELAY_MULTIPLIER * attempt);
    }
    return null;
  }
}

/** Crop an expanded region from the source PDF page using pdftoppm. */
function cropRegion(pageNum, box, pageW, pageH, outPrefix) {
  let [ymin, xmin, ymax, xmax] = box;
  const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
  const w = (xmax - xmin) * (1 + CONFIG.EXPAND);
  const h = (ymax - ymin) * (1 + CONFIG.EXPAND);
  xmin = clamp(cx - w / 2, 0, 1000); xmax = clamp(cx + w / 2, 0, 1000);
  ymin = clamp(cy - h / 2, 0, 1000); ymax = clamp(cy + h / 2, 0, 1000);
  const px = Math.round((xmin / 1000) * pageW);
  const py = Math.round((ymin / 1000) * pageH);
  const pw = Math.round(((xmax - xmin) / 1000) * pageW);
  const ph = Math.round(((ymax - ymin) / 1000) * pageH);
  if (pw <= 0 || ph <= 0) return null;
  execSync(
    `pdftoppm -png -r ${CONFIG.DPI} -f ${pageNum} -l ${pageNum} -x ${px} -y ${py} -W ${pw} -H ${ph} -singlefile "${CONFIG.SOURCE_PDF}" "${outPrefix}"`,
    { stdio: 'pipe' }
  );
  return `${outPrefix}.png`;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('Image Generator (crop + re-render)');
  console.log('='.repeat(60));
  console.log(`\nInput:       ${CONFIG.INPUT_DIR}`);
  console.log(`Source PDF:  ${CONFIG.SOURCE_PDF}`);
  console.log(`BBox model:  ${CONFIG.BBOX_MODEL}`);
  console.log(`Image model: ${CONFIG.IMAGE_MODEL}`);
  console.log(`Expand:      ${Math.round(CONFIG.EXPAND * 100)}%`);

  if (!CONFIG.API_KEY) {
    console.error('\nERROR: GEMINI_API_KEY not set!');
    process.exit(1);
  }

  const dirName = path.basename(CONFIG.INPUT_DIR);
  const markdownPath = path.join(CONFIG.INPUT_DIR, `${dirName}_complete.md`);
  const pagesDir = path.join(CONFIG.INPUT_DIR, 'temp', 'pages');
  const imagesDir = path.join(CONFIG.INPUT_DIR, 'images');
  const refDir = path.join(CONFIG.INPUT_DIR, 'temp', 'crops');

  if (!fs.existsSync(markdownPath)) { console.error(`\nERROR: Markdown not found: ${markdownPath}`); process.exit(1); }
  if (!fs.existsSync(pagesDir)) { console.error(`\nERROR: Pages dir not found: ${pagesDir}`); process.exit(1); }
  ensureDir(imagesDir);
  ensureDir(refDir);

  console.log('\n[Step 1] Parsing markdown for image references...');
  const markdown = await fs.promises.readFile(markdownPath, 'utf8');
  const images = parseImageReferences(markdown);
  const byPage = groupByPage(images);
  console.log(`  Found ${images.length} image reference(s) across ${byPage.size} page(s)`);
  if (images.length === 0) { console.log('\nNo images to generate. Done!'); return; }

  const pipeline = new ImagePipeline(CONFIG.API_KEY);
  let generated = 0, skipped = 0, failed = 0, done = 0;

  console.log('\n[Step 2] Detecting boxes, cropping, and re-rendering...');
  const pageNums = [...byPage.keys()].sort((a, b) => a - b);

  for (const pageNum of pageNums) {
    const pageImages = byPage.get(pageNum);
    const pending = pageImages.filter(im => !fs.existsSync(path.join(imagesDir, im.filename)));
    skipped += pageImages.length - pending.length;
    done += pageImages.length;
    if (pending.length === 0) continue;

    const pagePng = path.join(pagesDir, `page_${String(pageNum).padStart(3, '0')}.png`);
    if (!fs.existsSync(pagePng)) {
      console.log(`\n[page ${pageNum}] page scan missing (${pagePng}) - skipping ${pending.length}`);
      failed += pending.length;
      continue;
    }

    console.log(`\n[page ${pageNum}] ${pending.length} pending of ${pageImages.length}`);
    const { width, height } = pngSize(pagePng);

    let boxes = {};
    try {
      boxes = await pipeline.detectBoxes(pagePng, pending);
    } catch (e) {
      console.log(`  bbox detection failed: ${e.message} - skipping page`);
      failed += pending.length;
      continue;
    }

    for (const img of pending) {
      const box = boxes[img.imageIndex];
      if (!box || !Array.isArray(box) || box.length !== 4) {
        console.log(`  ${img.filename}: no bbox - skipped`);
        failed++;
        continue;
      }
      const refPng = cropRegion(pageNum, box, width, height, path.join(refDir, img.filename.replace(/\.png$/, '')));
      if (!refPng || !fs.existsSync(refPng)) {
        console.log(`  ${img.filename}: crop failed - skipped`);
        failed++;
        continue;
      }
      try {
        const imageData = await pipeline.rerender(refPng, img.cleanDescription);
        if (imageData) {
          await fs.promises.writeFile(path.join(imagesDir, img.filename), imageData);
          console.log(`  ${img.filename}: OK`);
          generated++;
        } else {
          console.log(`  ${img.filename}: no image returned - skipped`);
          failed++;
        }
      } catch (e) {
        console.log(`  ${img.filename}: re-render error ${e.message}`);
        failed++;
      }
      await sleep(CONFIG.DELAY_BETWEEN_IMAGES);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Generation Complete!');
  console.log('='.repeat(60));
  console.log(`\nGenerated: ${generated}`);
  console.log(`Skipped:   ${skipped} (already existed)`);
  console.log(`Failed:    ${failed}`);
  console.log(`\nOutput: ${imagesDir}`);
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
