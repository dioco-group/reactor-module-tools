/**
 * Stage C — slice audio clips and finalize a .module.
 *
 * Reads a `<name>.module.draft` whose content lines carry an inline timed clip:
 *     LINE: George plays baseball on weekends. {bk04-l3a-f1-03.mp3@118.0-120.1}
 *     OPTION: b | John doesn't like football games. {bk04-l1a-f3-02.mp3@71.2-74.8}
 * For each, it resolves the source figure mp3 from the filename pattern
 * (bk<book>-l<lesson>-f<fig>-NN.mp3), cuts [start,end] with ffmpeg into the
 * module's asset folder, and rewrites the clip to a plain `{<file>}`
 * (played in full). Writes the finalized `<name>.module`.
 *
 * Usage:
 *   node module-convert/slice-clips.js --config configs/alc-lla-4/module-convert.json [LESSON]
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const args = process.argv.slice(2);
  const ci = args.indexOf('--config');
  if (ci === -1 || !args[ci + 1]) {
    console.error('Usage: node module-convert/slice-clips.js --config <config.json> [LESSON]');
    process.exit(1);
  }
  const lesson = args.find((a) => /^\d+[A-D]$/i.test(a)) || null;
  return { configPath: args[ci + 1], lesson };
}

function loadConfig(configPath) {
  const abs = path.isAbsolute(configPath) ? configPath : path.resolve(process.cwd(), configPath);
  const dir = path.dirname(abs);
  const c = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const inputDir = path.resolve(dir, c.inputDir);
  const dataDir = path.dirname(inputDir);
  return {
    outputDir: path.resolve(dir, c.outputDir),
    audioDir: c.audioDir ? path.resolve(dir, c.audioDir) : path.join(dataDir, 'audio'),
    imagesDir: c.imagesDir
      ? path.resolve(dir, c.imagesDir)
      : path.join(dataDir, 'pdf-extract', 'source', 'images'),
  };
}

// Resolve an image basename against imagesDir, tolerating jpg/png.
function resolveImage(imagesDir, ref) {
  const base = ref.split('/').pop().trim();
  const cands = [base, base.replace(/\.jpg$/i, '.png'), base.replace(/\.png$/i, '.jpg')];
  for (const c of cands) {
    const p = path.join(imagesDir, c);
    if (fs.existsSync(p)) return { src: p, base: c };
  }
  return { src: null, base };
}

const pad2 = (n) => String(n).padStart(2, '0');

// bk04-l3a-f3-<label>.mp3 -> { lesson:"3A", fig:3 }. The <label> after the figure
// is just a unique tag (numeric or semantic like "q1-r"); only lesson+fig matter
// for resolving the source figure mp3.
function parseClipName(file) {
  const m = file.match(/^bk\w+-l(\d+[a-d])-f(\d+)-.+\.mp3$/i);
  if (!m) return null;
  return { lesson: m[1].toUpperCase(), fig: parseInt(m[2], 10) };
}

function findFigureMp3(audioDir, lesson, fig) {
  const candidates = [
    path.join(audioDir, `Lesson ${lesson}`, `Figure ${pad2(fig)}.mp3`),
    path.join(audioDir, `Lesson ${lesson}`, `Lesson ${lesson}`, `Figure ${pad2(fig)}.mp3`),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

// Inline timed audio in a draft: "{<file>@<start>-<end>}" on a content line.
// The slicer cuts [start,end] and rewrites it to "{<file>}". Matched anywhere
// on the line (canonical order is image first, audio last, but be tolerant).
const INLINE_AUDIO = /\{\s*([^{}@]+?)\s*@\s*([\d.]+)\s*-\s*([\d.]+)\s*\}/g;
// Inline image reference: "{page_XXX_YYY.jpg}" — copied into the asset folder
// and rewritten to its bare basename.
const INLINE_IMAGE = /\{\s*([^{}@]+?\.(?:jpe?g|png|gif|webp|svg))\s*\}/gi;

function sliceModule(draftPath, cfg) {
  const name = path.basename(draftPath).replace(/\.module\.draft$/, '');
  const assetsDir = path.join(cfg.outputDir, name);
  fs.mkdirSync(assetsDir, { recursive: true });

  const lines = fs.readFileSync(draftPath, 'utf8').split(/\r?\n/);
  let cut = 0, miss = 0, bad = 0, imgCopied = 0, imgMiss = 0;

  // Cut [start,end] of the source figure mp3 into the assets folder. Best-effort:
  // updates counters and warns; the line is rewritten to a bare filename regardless.
  const cutClip = (file, start, end) => {
    const info = parseClipName(file);
    if (!info) { console.warn(`  ? unparseable clip name: ${file}`); return; }
    if (!(end > start)) { bad++; console.warn(`  ! bad timing ${file}: ${start}-${end}`); return; }
    const src = findFigureMp3(cfg.audioDir, info.lesson, info.fig);
    if (!src) { miss++; console.warn(`  ! source mp3 not found for ${file} (Lesson ${info.lesson} Fig ${info.fig})`); return; }
    try {
      const ss = Math.max(0, start - 0.2);
      // Compress internal pauses: the tape leaves long repeat-after-me gaps
      // mid-clip (e.g. 4s between two sentences of one line); shorten any
      // silence over 1s down to ~0.4s. Edges are already tight (word-snapped).
      const silence = 'silenceremove=stop_periods=-1:stop_duration=1.0:stop_silence=0.4:stop_threshold=-35dB';
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(ss), '-to', String(end + 0.2),
        '-i', src, '-af', silence, '-ac', '1', path.join(assetsDir, file)], { stdio: 'pipe' });
      cut++;
    } catch (e) {
      console.warn(`  ! ffmpeg failed for ${file}: ${e.message}`);
    }
  };

  const copyImage = (ref) => {
    const { src, base } = resolveImage(cfg.imagesDir, ref);
    if (src) { fs.copyFileSync(src, path.join(assetsDir, base)); imgCopied++; }
    else { imgMiss++; console.warn(`  ! image not found: ${ref}`); }
    return base;
  };

  const out = lines.map((line) => {
    // Activity-level / header image field: `IMAGE: <ref>` -> copy + bare filename.
    const im = line.match(/^IMAGE:\s*(\S.*?)\s*$/);
    if (im) return `IMAGE: ${copyImage(im[1])}`;

    // Inline images: "... {page_XXX_YYY.jpg} ..." -> copy + rewrite to bare basename.
    let res = line.replace(INLINE_IMAGE, (_, ref) => `{${copyImage(ref)}}`);

    // Inline timed clips: "... {<file>@<start>-<end>}" -> cut + "... {<file>}"
    res = res.replace(INLINE_AUDIO, (_, file, startS, endS) => {
      cutClip(file.trim(), parseFloat(startS), parseFloat(endS));
      return `{${file.trim()}}`;
    });
    return res;
  });

  const finalText = out.join('\n');
  const finalPath = path.join(cfg.outputDir, `${name}.module`);
  fs.writeFileSync(finalPath, finalText);

  // Lightweight v2 validation.
  const warn = [];
  for (const f of ['TITLE:', 'TARGET_LANG_G:', 'HOME_LANG_G:']) {
    if (!new RegExp(`^${f}`, 'm').test(finalText)) warn.push(`missing ${f}`);
  }
  // Leftover timing = an inline {clip@...} that wasn't cut.
  if (/\{[^{}]*@[\d.]/.test(finalText)) warn.push('leftover timing annotation');
  // Every referenced asset present in the folder: IMAGE fields + inline {file.ext}
  // tokens (a dot+ext distinguishes an asset from a grammar {phrase}).
  const refs = [];
  for (const m of finalText.matchAll(/^IMAGE:\s*(\S+)\s*$/gm)) refs.push(m[1]);
  for (const m of finalText.matchAll(/\{\s*([^{}@\s]+\.[A-Za-z0-9]+)\s*\}/g)) refs.push(m[1]);
  let assetMiss = 0;
  for (const fn of refs) {
    if (fn && !fs.existsSync(path.join(assetsDir, fn))) assetMiss++;
  }
  if (assetMiss) warn.push(`${assetMiss} referenced asset(s) missing on disk`);

  console.log(
    `  ${name}: ${cut} clips${miss ? `, ${miss} miss-src` : ''}${bad ? `, ${bad} bad-timing` : ''}; ` +
    `${imgCopied} images${imgMiss ? `, ${imgMiss} miss-img` : ''} -> ${path.basename(finalPath)}` +
    (warn.length ? `  ⚠ ${warn.join('; ')}` : '  ✓')
  );
}

function main() {
  const { configPath, lesson } = parseArgs();
  const cfg = loadConfig(configPath);
  let drafts = fs.readdirSync(cfg.outputDir).filter((f) => f.endsWith('.module.draft'));
  if (lesson) drafts = drafts.filter((f) => new RegExp(`-${lesson}\\.module\\.draft$`, 'i').test(f));
  if (!drafts.length) { console.error('No .module.draft files found.'); process.exit(1); }
  console.log(`Slicing ${drafts.length} draft(s); audio: ${cfg.audioDir}`);
  for (const d of drafts) sliceModule(path.join(cfg.outputDir, d), cfg);
  console.log('Done.');
}

main();
