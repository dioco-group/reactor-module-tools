/**
 * Faithful crop POC (page 11 only, throwaway).
 *
 * Instead of regenerating illustrations (which drifts in style and flips arrows),
 * crop the REAL artwork out of the 300-DPI page scan:
 *   1. Ask a vision model for each panel's DRAWING bounding box (excluding the
 *      panel frame border and the printed panel number).
 *   2. Crop that box straight out of the source PDF page with pdftoppm.
 *
 * Output: data/_crop-study/page_011_0NN.png (faithful original art).
 *
 * Usage: node pdf-extract/crop-study.js
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
const OUT_DIR = path.resolve('data/_crop-study');
const MODEL = 'gemini-3.5-flash';
const DPI = 300;
const FOCUS_PAGE = 11;

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

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
This is one page from a language learning textbook. It contains ${panels.length} numbered
illustration panels.

For EACH panel listed below, return the tight bounding box of the DRAWING/ARTWORK only:
- INCLUDE the whole illustration and any arrows that are part of it.
- EXCLUDE the rectangular panel border/frame box.
- EXCLUDE the small printed panel number (e.g. "8.").

Panels (by printed number and description):
${panels.map(p => `- #${p.panel}: ${p.description.replace(/^#\d+\s*/, '')}`).join('\n')}

Return ONLY JSON: an array of objects {"panel": <number>, "box": [ymin, xmin, ymax, xmax]}
where coordinates are normalized integers 0-1000 (top-left origin). One object per panel.
`;

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  return JSON.parse(raw.slice(start, end + 1));
}

async function main() {
  if (!process.env.GEMINI_API_KEY) { console.error('GEMINI_API_KEY not set'); process.exit(1); }
  ensureDir(OUT_DIR);
  const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const panels = parsePagePanels(FOCUS_PAGE);
  const pagePng = path.join(PAGES_DIR, `page_${String(FOCUS_PAGE).padStart(3, '0')}.png`);
  const { width, height } = pngSize(pagePng);
  console.log(`Page ${FOCUS_PAGE}: ${panels.length} panels, scan ${width}x${height}px @ ${DPI}dpi`);

  const imgData = fs.readFileSync(pagePng).toString('base64');
  const resp = await genai.models.generateContent({
    model: MODEL,
    contents: [{ parts: [
      { text: BBOX_PROMPT(panels) },
      { inlineData: { mimeType: 'image/png', data: imgData } },
    ] }],
    config: { thinkingConfig: { thinkingLevel: 'LOW' }, responseMimeType: 'application/json' },
  });

  const boxes = extractJson(resp.text || '');
  const byPanel = {};
  for (const b of boxes) byPanel[b.panel] = b.box;

  for (const p of panels) {
    const box = byPanel[p.panel];
    if (!box) { console.log(`  panel ${p.panel}: no box`); continue; }
    const [ymin, xmin, ymax, xmax] = box;
    const x = Math.round((xmin / 1000) * width);
    const y = Math.round((ymin / 1000) * height);
    const w = Math.round(((xmax - xmin) / 1000) * width);
    const h = Math.round(((ymax - ymin) / 1000) * height);
    const prefix = path.join(OUT_DIR, p.filename.replace(/\.png$/, ''));
    const cmd = `pdftoppm -png -r ${DPI} -f ${FOCUS_PAGE} -l ${FOCUS_PAGE} -x ${x} -y ${y} -W ${w} -H ${h} -singlefile "${SOURCE_PDF}" "${prefix}"`;
    execSync(cmd, { stdio: 'pipe' });
    console.log(`  panel ${p.panel} -> ${p.filename}  crop ${w}x${h} at (${x},${y})`);
  }

  console.log(`\nCrops written to ${OUT_DIR}`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
