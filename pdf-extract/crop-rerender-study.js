/**
 * Hybrid crop + re-render POC (page 11 only, throwaway).
 *
 * 1. Detect each panel's drawing bbox (one vision call).
 * 2. Expand the box ~25% (margin) and crop that region from the 300-DPI scan.
 * 3. Feed ONLY that single-illustration crop (not the whole page) to the image
 *    model, with the description, to re-render a clean faithful version.
 *
 * Because the model only sees the one correct illustration, it cannot pick the
 * wrong panel or flip arrows from a neighbor.
 *
 * Output:
 *   data/_crop-rerender-study/ref/page_011_0NN.png       (expanded raw crop)
 *   data/_crop-rerender-study/rerender/page_011_0NN.png  (model re-render)
 *
 * Usage: node pdf-extract/crop-rerender-study.js
 */

import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const SOURCE_PDF = path.resolve('data/alc-english/source.pdf');
const SOURCE_DIR = path.resolve('data/alc-english/pdf-extract/source');
const COMPLETE_MD = path.join(SOURCE_DIR, 'source_complete.md');
const PAGES_DIR = path.join(SOURCE_DIR, 'temp', 'pages');
const OUT_DIR = path.resolve('data/_crop-rerender-study');
const BBOX_MODEL = 'gemini-3.5-flash';
const IMAGE_MODEL = 'gemini-3.1-flash-image';
const DPI = 300;
const FOCUS_PAGE = 11;
const EXPAND = 0.25; // expand bbox by 25% total (margin around the drawing)

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function pngSize(file) { const b = fs.readFileSync(file); return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }; }

function parsePagePanels(pageNum) {
  const md = fs.readFileSync(COMPLETE_MD, 'utf8');
  const tag = `page_${String(pageNum).padStart(3, '0')}_`;
  const regex = /!\[([^\]]*)\]\(images\/(page_\d+_\d+\.png)\)/g;
  const panels = [];
  let m;
  while ((m = regex.exec(md)) !== null) {
    if (!m[2].includes(tag)) continue;
    const nm = m[1].match(/^#(\d{1,3})\b/);
    panels.push({ panel: nm ? parseInt(nm[1], 10) : null, description: m[1], filename: m[2] });
  }
  return panels;
}

const BBOX_PROMPT = (panels) => `
This is one page from a language learning textbook with ${panels.length} numbered illustration panels.
For EACH panel, return the tight bounding box of the DRAWING/ARTWORK only (include arrows that are
part of it; exclude the panel border and the printed panel number).

Panels:
${panels.map(p => `- #${p.panel}: ${p.description.replace(/^#\d+\s*/, '')}`).join('\n')}

Return ONLY JSON: [{"panel": <number>, "box": [ymin, xmin, ymax, xmax]}] with coords normalized 0-1000.
`;

const RERENDER_PROMPT = (description) => `
You are given a SINGLE illustration cropped from a black-and-white language-learning textbook.
The crop has some surrounding margin and may show small fragments of neighbouring panels at the edges.

Target illustration: "${description}"

Recreate the MAIN, CENTRAL illustration as a clean, faithful, higher-quality reproduction:
- Reproduce it EXACTLY: same composition, poses, objects, and the SAME ARROW DIRECTIONS. Do NOT
  mirror, rotate, or change any direction of motion/arrows.
- Keep the original black-and-white line-art style (line weight, proportions).
- EXCLUDE: any panel frame/border, the printed panel number, and any partial neighbouring
  illustrations near the edges.
- Output ONLY the central illustration on a plain white background, square 1:1.
Generate the image now.
`;

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  return JSON.parse(raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1));
}

async function main() {
  if (!process.env.GEMINI_API_KEY) { console.error('GEMINI_API_KEY not set'); process.exit(1); }
  const refDir = path.join(OUT_DIR, 'ref');
  const rrDir = path.join(OUT_DIR, 'rerender');
  ensureDir(refDir); ensureDir(rrDir);
  const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const panels = parsePagePanels(FOCUS_PAGE);
  const pagePng = path.join(PAGES_DIR, `page_${String(FOCUS_PAGE).padStart(3, '0')}.png`);
  const { width, height } = pngSize(pagePng);
  console.log(`Page ${FOCUS_PAGE}: ${panels.length} panels, scan ${width}x${height}px`);

  // Step 1: bounding boxes
  const bboxResp = await genai.models.generateContent({
    model: BBOX_MODEL,
    contents: [{ parts: [
      { text: BBOX_PROMPT(panels) },
      { inlineData: { mimeType: 'image/png', data: fs.readFileSync(pagePng).toString('base64') } },
    ] }],
    config: { thinkingConfig: { thinkingLevel: 'LOW' }, responseMimeType: 'application/json' },
  });
  const boxes = {};
  for (const b of extractJson(bboxResp.text || '')) boxes[b.panel] = b.box;

  // Step 2+3: expand, crop, re-render
  for (const p of panels) {
    const box = boxes[p.panel];
    if (!box) { console.log(`  panel ${p.panel}: no box`); continue; }
    let [ymin, xmin, ymax, xmax] = box;
    const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
    const w = (xmax - xmin) * (1 + EXPAND), h = (ymax - ymin) * (1 + EXPAND);
    xmin = clamp(cx - w / 2, 0, 1000); xmax = clamp(cx + w / 2, 0, 1000);
    ymin = clamp(cy - h / 2, 0, 1000); ymax = clamp(cy + h / 2, 0, 1000);
    const px = Math.round((xmin / 1000) * width), py = Math.round((ymin / 1000) * height);
    const pw = Math.round(((xmax - xmin) / 1000) * width), ph = Math.round(((ymax - ymin) / 1000) * height);

    const refPrefix = path.join(refDir, p.filename.replace(/\.png$/, ''));
    execSync(`pdftoppm -png -r ${DPI} -f ${FOCUS_PAGE} -l ${FOCUS_PAGE} -x ${px} -y ${py} -W ${pw} -H ${ph} -singlefile "${SOURCE_PDF}" "${refPrefix}"`, { stdio: 'pipe' });
    const refPng = `${refPrefix}.png`;

    try {
      const resp = await genai.models.generateContent({
        model: IMAGE_MODEL,
        contents: [{ parts: [
          { text: RERENDER_PROMPT(p.description.replace(/^#\d+\s*/, '')) },
          { inlineData: { mimeType: 'image/png', data: fs.readFileSync(refPng).toString('base64') } },
        ] }],
        config: { responseModalities: ['IMAGE'] },
      });
      let img = null;
      for (const part of (resp.candidates?.[0]?.content?.parts || [])) if (part.inlineData) { img = Buffer.from(part.inlineData.data, 'base64'); break; }
      if (img) { fs.writeFileSync(path.join(rrDir, p.filename), img); console.log(`  panel ${p.panel} -> ref ${pw}x${ph} + re-render OK`); }
      else console.log(`  panel ${p.panel}: re-render NO IMAGE`);
    } catch (e) { console.log(`  panel ${p.panel}: re-render ERROR ${e.message}`); }
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log(`\nRef crops:  ${refDir}\nRe-renders: ${rrDir}`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
