/**
 * Chunk-length / temperature study (throwaway experiment).
 *
 * Goal: figure out why image descriptions got "confused" during extraction
 * (e.g. the open-book / close-book panels on PDF page 11 had their direction
 * descriptions swapped) and pick sensible extraction settings before re-running
 * the whole book.
 *
 * Method:
 *  - PDF page 11 is a 12-panel "Repeat the words and sentences" action grid with
 *    objectively checkable directions (door open/close, book open/close,
 *    window up/down). We use it as ground truth.
 *  - For each (pagesPerChunk, temperature) condition we cut the SAME chunk the
 *    real pipeline would cut (chunking from page 1 in steps of N, then taking the
 *    chunk that contains page 11), send it to the model with the real extraction
 *    prompt, and save the markdown.
 *  - We then auto-score the page-11 panels for directional correctness and also
 *    save the raw markdown for manual inspection.
 *
 * Usage: node pdf-extract/chunk-study.js
 */

import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

const SOURCE_PDF = path.resolve('data/alc-english/source.pdf');
const OUT_DIR = path.resolve('data/_chunk-study');
const MODEL = 'gemini-3.1-pro-preview';
const FOCUS_PAGE = 11; // 1-indexed PDF page with the 12-panel action grid

// Conditions to compare. Each: { model, n (pagesPerChunk), temp }.
// Gemini 3.5 Flash no longer takes a temperature, so leave temp undefined there.
const CONDITIONS = [
  { model: 'gemini-3.5-flash', n: 20 }, // flash, same chunk as the pro baseline
  { model: 'gemini-3.5-flash', n: 1 },  // flash, page 11 alone
];

// Ground truth for page 11 panels that have a checkable direction.
// Each entry: panel number -> { must: [...required keywords], mustNot: [...] }
const GROUND_TRUTH = {
  7: { label: 'door OPENING', must: ['open'], mustNot: ['clos'] },
  8: { label: 'book CLOSING', must: ['clos'], mustNot: ['open'] },
  9: { label: 'window OPENING (up)', must: ['open', 'up'], mustNot: ['clos', 'down'] },
  10: { label: 'door CLOSING', must: ['clos'], mustNot: ['open'] },
  11: { label: 'window CLOSING (down)', must: ['clos', 'down'], mustNot: ['open', 'up'] },
  12: { label: 'book OPENING', must: ['open'], mustNot: ['clos'] },
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

// Faithful copy of the IMAGE/CONTENT sections of the real extraction prompt
// (pdf-extract/extract-markdown.js), including the new #N panel-number marker.
function extractionPrompt(pdfPageStart, pdfPageEnd) {
  return `
You are processing PDF pages ${pdfPageStart}-${pdfPageEnd} of a language learning textbook.

TASK: Convert all content to clean Markdown format.

IMAGE REFERENCES:
- For each illustration/drawing, insert a markdown image reference
- Use PDF page numbers (${pdfPageStart}-${pdfPageEnd}) for the filename, NOT printed page numbers
- Format: ![Detailed description](images/page_XXX_YYY.png)
- XXX = PDF page number (zero-padded to 3 digits)
- YYY = image index on that page (001, 002, etc.)
- PRINTED PANEL NUMBER: If the illustration has a visible printed number or label next to it
  (e.g. a numbered panel "8." in an exercise grid), begin the description with that number
  using the form "#N " (a hash, the number, then a space).
- The description should be detailed and useful, describing who/what is shown, what action is
  happening (including the DIRECTION of any arrows or motion), any text labels, and relevant
  context for language learning.
- Example (numbered panel): ![#8 An open book viewed from the side with two arrows pointing inward toward it, indicating the action of closing the book](images/page_011_008.png)

CONTENT FORMATTING:
- Use proper markdown: # for headings, - for lists, **bold**, *italic*
- For underlined text, use <u>...</u>.
- Preserve dialogues with speaker labels
- Maintain exercise numbering and structure
- Follow natural reading order (left-to-right, top-to-bottom)
- Skip footnotes and header/footer content (book title, page numbers, running headers)

TABLE FORMATTING:
- Convert tables to proper Markdown table format using | separators and |---| header rows.

IMPORTANT:
- Return ONLY the markdown text content.
- Do not generate any images in your response, only image references.
- No explanations or commentary before or after the markdown.
- Use PDF page numbers (${pdfPageStart}-${pdfPageEnd}) for image filenames.
`;
}

// Mirror the real pipeline's chunking: cut from page 1 in steps of n, then take
// the chunk that contains FOCUS_PAGE. Returns { startLabel, endLabel } (1-indexed).
function chunkRangeContaining(focusPage, n, totalPages) {
  const idx = Math.floor((focusPage - 1) / n);
  const start0 = idx * n;
  const end0 = Math.min(start0 + n, totalPages);
  return { start0, end0, startLabel: start0 + 1, endLabel: end0 };
}

async function buildChunkPdf(srcDoc, start0, end0) {
  const out = await PDFDocument.create();
  const pages = await out.copyPages(srcDoc, Array.from({ length: end0 - start0 }, (_, i) => i + start0));
  pages.forEach(p => out.addPage(p));
  return Buffer.from(await out.save());
}

function parsePageImages(markdown, pageNum) {
  const tag = `page_${String(pageNum).padStart(3, '0')}_`;
  const regex = /!\[([^\]]*)\]\(images\/(page_\d+_\d+\.png)\)/g;
  const out = [];
  let m;
  while ((m = regex.exec(markdown)) !== null) {
    if (m[2].includes(tag)) out.push({ description: m[1], filename: m[2] });
  }
  return out;
}

function scorePage11(markdown) {
  const imgs = parsePageImages(markdown, FOCUS_PAGE);
  const byPanel = {};
  for (const img of imgs) {
    const nm = img.description.match(/^#(\d{1,3})\b/);
    if (nm) byPanel[parseInt(nm[1], 10)] = img.description;
  }
  let correct = 0;
  const total = Object.keys(GROUND_TRUTH).length;
  const details = [];
  for (const [panel, gt] of Object.entries(GROUND_TRUTH)) {
    const desc = (byPanel[panel] || '').toLowerCase();
    let ok = desc.length > 0;
    if (ok) {
      for (const w of gt.must) if (!desc.includes(w)) ok = false;
      for (const w of gt.mustNot) if (desc.includes(w)) ok = false;
    }
    if (ok) correct++;
    details.push(`    panel ${panel} (${gt.label}): ${ok ? 'OK' : 'WRONG'}${byPanel[panel] ? '' : ' [no #N marker found]'}`);
  }
  return { imageCount: imgs.length, numbered: Object.keys(byPanel).length, correct, total, details };
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY not set');
    process.exit(1);
  }
  ensureDir(OUT_DIR);

  const srcBytes = await fs.promises.readFile(SOURCE_PDF);
  const srcDoc = await PDFDocument.load(srcBytes);
  const totalPages = srcDoc.getPageCount();
  const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  console.log(`Chunk study on PDF page ${FOCUS_PAGE} (of ${totalPages}), model ${MODEL}\n`);

  const summary = [];

  for (const cond of CONDITIONS) {
    const model = cond.model || MODEL;
    const modelShort = model.replace(/^gemini-/, '').replace(/[^a-z0-9.]/gi, '');
    const { start0, end0, startLabel, endLabel } = chunkRangeContaining(FOCUS_PAGE, cond.n, totalPages);
    const tag = `${modelShort}_n${cond.n}${cond.temp != null ? `_t${cond.temp}` : ''}`;
    console.log(`[${tag}] model=${model} chunk pages ${startLabel}-${endLabel} (page ${FOCUS_PAGE} at position ${FOCUS_PAGE - startLabel + 1}/${endLabel - startLabel + 1})`);

    const chunkBytes = await buildChunkPdf(srcDoc, start0, end0);
    const tmpPdf = path.join(OUT_DIR, `${tag}.pdf`);
    await fs.promises.writeFile(tmpPdf, chunkBytes);

    let markdown = '';
    try {
      const uploaded = await genai.files.upload({
        file: tmpPdf,
        config: { displayName: `study_${tag}`, mimeType: 'application/pdf' },
      });
      // wait for processing
      let f = await genai.files.get({ name: uploaded.name });
      while (f.state === 'PROCESSING') { await sleep(3000); f = await genai.files.get({ name: uploaded.name }); }

      const genConfig = { maxOutputTokens: 32768 };
      if (cond.temp != null) genConfig.temperature = cond.temp;
      const resp = await genai.models.generateContent({
        model,
        contents: [{ parts: [
          { text: extractionPrompt(startLabel, endLabel) },
          { fileData: { mimeType: f.mimeType, fileUri: f.uri } },
        ] }],
        config: genConfig,
      });
      markdown = resp.text || '';
      await genai.files.delete({ name: uploaded.name }).catch(() => {});
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
    } finally {
      await fs.promises.unlink(tmpPdf).catch(() => {});
    }

    await fs.promises.writeFile(path.join(OUT_DIR, `${tag}.md`), markdown, 'utf8');
    const score = scorePage11(markdown);
    console.log(`  page-11 images: ${score.imageCount}, numbered: ${score.numbered}, directional score: ${score.correct}/${score.total}`);
    score.details.forEach(d => console.log(d));
    console.log('');
    summary.push({ tag, model, n: cond.n, temp: cond.temp ?? null, ...score });
  }

  console.log('\n================ SUMMARY ================');
  for (const s of summary) {
    console.log(`${s.tag.padEnd(22)} model=${s.model.padEnd(20)} pages/chunk=${String(s.n).padEnd(3)} temp=${String(s.temp ?? '-').padEnd(4)} -> directional ${s.correct}/${s.total}, ${s.imageCount} imgs, ${s.numbered} numbered`);
  }
  await fs.promises.writeFile(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(`\nMarkdown + summary written to ${OUT_DIR}`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
