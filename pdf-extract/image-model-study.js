/**
 * Image-model A/B study (throwaway experiment).
 *
 * Compares image-generation models on a representative subset of PDF page 11
 * (people + directional objects) using the SAME prompt + style-context as the
 * real generate-images.js pipeline. Saves outputs per model and reports timing.
 *
 * Usage: node pdf-extract/image-model-study.js
 */

import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

const SOURCE_DIR = path.resolve('data/alc-english/pdf-extract/source');
const COMPLETE_MD = path.join(SOURCE_DIR, 'source_complete.md');
const PAGES_DIR = path.join(SOURCE_DIR, 'temp', 'pages');
const OUT_DIR = path.resolve('data/_image-study');
const IMAGE_SIZE = 1024;

const MODELS = ['gemini-3-pro-image', 'gemini-3.1-flash-image'];
const FOCUS_PAGE = 11;
const PANELS = [1, 6, 7, 8, 9, 12]; // people (1,6) + directional objects (7 door,8 book,9 window,12 book)

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

const PROMPT = (description, hasStylePages) => `
${hasStylePages ? 'I am showing you several pages from a language learning textbook. The FIRST image is the TARGET page containing the illustration to recreate. The other images are STYLE REFERENCE pages showing the illustration style used in this book.' : 'Look at this page from a language learning textbook.'}

Find the illustration on the TARGET page that matches this description: "${description}"
- If the description begins with a "#N" marker (e.g. "#8"), N is the number printed on that
  panel in the textbook. Use that printed number as the PRIMARY way to locate the correct
  illustration on the page; the rest of the description is a secondary hint.

Generate a FAITHFUL REPRODUCTION of this illustration with improved quality:

CRITICAL - PRESERVE THE ORIGINAL STYLE:
- Keep the SAME artistic style as the original (line weight, shading, character proportions)
- Do NOT modernize or reinterpret. Cleaner version of the SAME illustration.

FRAMING - ALWAYS EXCLUDE PANEL CHROME:
- Do NOT draw the rectangular panel border / frame box.
- Do NOT include the printed panel number (e.g. "8.") or any caption/index number.
- Reproduce ONLY the illustration artwork, centered on a plain white background.
- Keep words drawn INSIDE the artwork (speech bubbles, arrows-with-words); drop the panel number/box.

REQUIREMENTS:
1. Square format (1:1), approx ${IMAGE_SIZE}x${IMAGE_SIZE}px.
2. Faithful to original style and composition.
Generate the image now.
`;

function parsePage11Panels() {
  const md = fs.readFileSync(COMPLETE_MD, 'utf8');
  const tag = `page_${String(FOCUS_PAGE).padStart(3, '0')}_`;
  const regex = /!\[([^\]]*)\]\(images\/(page_\d+_\d+\.png)\)/g;
  const byPanel = {};
  let m;
  while ((m = regex.exec(md)) !== null) {
    if (!m[2].includes(tag)) continue;
    const nm = m[1].match(/^#(\d{1,3})\b/);
    if (nm) byPanel[parseInt(nm[1], 10)] = { description: m[1], filename: m[2] };
  }
  // Style-context: nearest pages before/after 11 that also have images.
  const pageRegex = /images\/page_(\d+)_\d+\.png/g;
  const pagesSet = new Set();
  let pm;
  while ((pm = pageRegex.exec(md)) !== null) pagesSet.add(parseInt(pm[1], 10));
  const pages = [...pagesSet].sort((a, b) => a - b);
  const idx = pages.indexOf(FOCUS_PAGE);
  const stylePages = [];
  if (idx > 0) stylePages.push(pages[idx - 1]);
  if (idx >= 0 && idx < pages.length - 1) stylePages.push(pages[idx + 1]);
  return { byPanel, stylePages };
}

async function imagePart(p) {
  const data = await fs.promises.readFile(p);
  return { inlineData: { mimeType: 'image/png', data: data.toString('base64') } };
}

async function main() {
  if (!process.env.GEMINI_API_KEY) { console.error('GEMINI_API_KEY not set'); process.exit(1); }
  ensureDir(OUT_DIR);
  const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const { byPanel, stylePages } = parsePage11Panels();
  const targetPath = path.join(PAGES_DIR, `page_${String(FOCUS_PAGE).padStart(3, '0')}.png`);
  const stylePaths = stylePages.map(n => path.join(PAGES_DIR, `page_${String(n).padStart(3, '0')}.png`)).filter(fs.existsSync);

  console.log(`Target page ${FOCUS_PAGE}, style pages ${stylePages.join(',')}, panels ${PANELS.join(',')}\n`);

  const timings = {};
  for (const model of MODELS) {
    const modelDir = path.join(OUT_DIR, model.replace(/[^a-z0-9.]/gi, '_'));
    ensureDir(modelDir);
    let total = 0, ok = 0;
    console.log(`=== ${model} ===`);
    for (const panel of PANELS) {
      const ref = byPanel[panel];
      if (!ref) { console.log(`  panel ${panel}: no ref`); continue; }
      const parts = [{ text: PROMPT(ref.description, stylePaths.length > 0) }, await imagePart(targetPath)];
      for (const sp of stylePaths) parts.push(await imagePart(sp));
      const t0 = Date.now();
      try {
        const resp = await genai.models.generateContent({
          model,
          contents: [{ parts }],
          config: { responseModalities: ['IMAGE'] },
        });
        const dt = Date.now() - t0;
        total += dt;
        let img = null;
        const cand = resp.candidates?.[0]?.content?.parts || [];
        for (const p of cand) if (p.inlineData) { img = Buffer.from(p.inlineData.data, 'base64'); break; }
        if (img) {
          await fs.promises.writeFile(path.join(modelDir, ref.filename), img);
          ok++;
          console.log(`  panel ${panel} (${ref.filename}): ${dt}ms OK`);
        } else {
          console.log(`  panel ${panel}: ${dt}ms NO IMAGE`);
        }
      } catch (e) {
        console.log(`  panel ${panel}: ERROR ${e.message}`);
      }
      await new Promise(r => setTimeout(r, 3000));
    }
    timings[model] = { totalMs: total, ok, avgMs: ok ? Math.round(total / ok) : 0 };
    console.log(`  -> ${ok}/${PANELS.length} ok, avg ${timings[model].avgMs}ms/img\n`);
  }

  console.log('================ SUMMARY ================');
  for (const model of MODELS) {
    console.log(`${model.padEnd(26)} avg ${String(timings[model].avgMs).padEnd(6)}ms/img  (${timings[model].ok}/${PANELS.length} ok)`);
  }
  console.log(`\nImages written under ${OUT_DIR}/<model>/`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
