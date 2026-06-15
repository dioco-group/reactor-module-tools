/**
 * Validate and stage an ALC master-lesson module into the alc-english repo clone.
 *
 * Per module file (data/alc-english/<name>.module):
 *   - lints + parses,
 *   - CLIP-TEXT IDENTITY: every clip-bearing line must be byte-identical to a
 *     line in one of the verified LLA source modules (catches assembly drift
 *     that would detach cassette audio from its text),
 *   - stages module + all referenced assets (LLA clips/images from the source
 *     module folders; `st-page_*` images from the ST images dir per the
 *     collision rule) into the staging clone.
 *
 * Usage: node module-convert/stage-master.mjs <name> [--staging /tmp/alc-english]
 *   e.g. node module-convert/stage-master.mjs book-4-lesson-1
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const name = process.argv[2];
if (!name || name.startsWith('--')) {
  console.error('Usage: node module-convert/stage-master.mjs <module-name> [--staging <dir>]');
  process.exit(1);
}
const stagingArg = process.argv.indexOf('--staging');
const STAGING = stagingArg !== -1 ? process.argv[stagingArg + 1] : '/tmp/alc-english';

const MODULE_PATH = path.join(ROOT, 'data/alc-english', `${name}.module`);
const LLA_MODULE_DIR = path.join(ROOT, 'data/alc-lla-4/module');
const ST_IMAGES_DIR = path.join(ROOT, 'data/alc-st-4/pdf-extract/source/images');

const text = fs.readFileSync(MODULE_PATH, 'utf8');

// --- Parse + lint ------------------------------------------------------------

await build({ entryPoints: [path.join(ROOT, 'module-parser/module_parser.ts')], bundle: true, format: 'esm', outfile: '/tmp/stage-mp.mjs', logLevel: 'silent' });
await build({ entryPoints: [path.join(ROOT, 'module-parser/module_diagnostics.ts')], bundle: true, format: 'esm', outfile: '/tmp/stage-md.mjs', logLevel: 'silent' });
const { parseModuleFile } = await import('/tmp/stage-mp.mjs');
const { lintModuleText } = await import('/tmp/stage-md.mjs');

const mod = parseModuleFile(text); // throws on failure
const diags = lintModuleText(text).filter((d) => d.code !== 'missing-dioco-doc-id');
if (diags.length) {
  console.error('Lint problems:');
  for (const d of diags) console.error(`  [${d.severity}] line ${d.line}: ${d.message}`);
  process.exit(1);
}

// --- Clip-text identity ------------------------------------------------------

const sourceLines = new Set();
for (const f of fs.readdirSync(LLA_MODULE_DIR).filter((f) => f.endsWith('.module'))) {
  for (const line of fs.readFileSync(path.join(LLA_MODULE_DIR, f), 'utf8').split('\n')) {
    if (/\{[^{}]*\.mp3\s*\}/.test(line)) sourceLines.add(line.trim());
  }
}
let clipLines = 0;
const drift = [];
for (const line of text.split('\n')) {
  if (!/\{[^{}]*\.mp3\s*\}/.test(line)) continue;
  clipLines++;
  if (!sourceLines.has(line.trim())) drift.push(line.trim());
}
if (drift.length) {
  console.error(`CLIP-TEXT DRIFT — ${drift.length} clip line(s) don't match any source module:`);
  for (const l of drift.slice(0, 10)) console.error(`  ${l}`);
  process.exit(1);
}

// --- Stage module + assets ---------------------------------------------------

const assetsDir = path.join(STAGING, name);
fs.rmSync(assetsDir, { recursive: true, force: true });
fs.mkdirSync(assetsDir, { recursive: true });

// Inline {file.ext} tokens — incl. the block image on a marker title line.
const refs = new Set();
for (const m of text.matchAll(/\{\s*([^{}@\s]+\.[A-Za-z0-9]+)\s*\}/g)) refs.add(m[1]);

const llaDirs = fs
  .readdirSync(LLA_MODULE_DIR)
  .filter((d) => fs.statSync(path.join(LLA_MODULE_DIR, d)).isDirectory())
  .map((d) => path.join(LLA_MODULE_DIR, d));

let copied = 0;
const missing = [];
for (const ref of refs) {
  const stMatch = ref.match(/^st-(page_\d+_\d+\.\w+)$/);
  const src = stMatch
    ? path.join(ST_IMAGES_DIR, stMatch[1])
    : llaDirs.map((d) => path.join(d, ref)).find((p) => fs.existsSync(p));
  if (src && fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(assetsDir, ref));
    copied++;
  } else {
    missing.push(ref);
  }
}
if (missing.length) {
  console.error(`MISSING ASSETS (${missing.length}): ${missing.join(', ')}`);
  process.exit(1);
}

fs.copyFileSync(MODULE_PATH, path.join(STAGING, `${name}.module`));

const activities = mod.lessons.reduce((n, l) => n + l.activities.length, 0);
console.log(`OK: ${name}.module — ${mod.lessons.length} lessons, ${activities} activities`);
console.log(`    ${clipLines} clip lines verified, ${copied} assets staged -> ${STAGING}`);
