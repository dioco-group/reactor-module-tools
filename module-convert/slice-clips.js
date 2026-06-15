/**
 * Stage C — slice audio clips and finalize a .module.
 *
 * Reads a `<name>.module.draft` whose content lines carry an inline timed clip:
 *     LINE: George plays baseball on weekends. {bk04-l3a-f1-03.mp3@118.0-120.1}
 *     OPTION: b | John doesn't like football games. {bk04-l1a-f3-02.mp3@71.2-74.8}
 * For each, it resolves the source figure mp3 from the filename pattern
 * (bk<book>-l<lesson>-f<fig>-NN.mp3), then cuts it into the module's asset folder
 * and rewrites the clip to a plain `{<file>}` (played in full). Writes the
 * finalized `<name>.module`.
 *
 * The cut is NOT the literal [start,end]: `speechEdges` first refines the edges
 * by silence detection (the ASR start often drops a leading consonant; ends are
 * unreliable — see refine-clip-times / transcribe-soniox), and a `silenceremove`
 * pass then compresses long internal repeat-after-me gaps.
 *
 * Usage:
 *   node module-convert/slice-clips.js --config configs/alc-lla-4/module-convert.json [LESSON]
 */

import fs from 'fs';
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Refine a clip's OUTER edges by silence detection. The ASR word start often
// lands a beat late and drops a leading consonant (a spoken "B" cut tight plays
// as "ee" -> "E"); a too-tight end can clip the final sound. We widen the
// window, find the silence gap just BEFORE `start` and just AFTER `end`, and
// snap the edges to the speech there — anchored on [start,end] so a sentence's
// INTERNAL pauses are never used as edges. Falls back to modest fixed pads.
function speechEdges(src, start, end) {
  const HEAD = 0.6, TAIL = 0.5, NEAR = 0.2, PAD = 0.04;
  const ws = Math.max(0, start - HEAD), we = end + TAIL;
  // d=0.3: only real boundary gaps register, not mid-word micro-pauses.
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-ss', String(ws), '-to', String(we),
    '-i', src, '-af', 'silencedetect=noise=-30dB:d=0.3', '-f', 'null', '-'], { encoding: 'utf8' });
  const log = (r.stderr || '');
  const starts = [...log.matchAll(/silence_start:\s*([\d.]+)/g)].map((m) => parseFloat(m[1]));
  const ends = [...log.matchAll(/silence_end:\s*([\d.]+)/g)].map((m) => parseFloat(m[1]));
  const aStart = start - ws, aEnd = end - ws;
  // `end` is the LAST word's START (refine anchors it there; Soniox word ENDS
  // are unreliable). So:
  //  - onset = where speech resumes just before the first word (silence_end),
  //    pulling the start back over a dropped leading consonant.
  //  - offset = where speech next STOPS after the last word's start (silence_start),
  //    i.e. the real trailing gap. Internal pauses (before aEnd) are inside the
  //    span, so a multi-part item ("Capital A. Small a.") keeps every part, while
  //    a single item ends at its own gap (no dead air / next-item bleed).
  const leading = ends.filter((e) => e <= aStart + NEAR);
  const onsetRel = leading.length ? Math.max(...leading) : Math.max(0, aStart - 0.35);
  const trailing = starts.filter((s) => s > aEnd - 0.05);
  const offsetRel = trailing.length ? Math.min(...trailing) : (we - ws);
  let ns = ws + onsetRel - PAD, ne = ws + offsetRel + PAD;
  if (!(ne > ns)) { ns = Math.max(0, start - 0.3); ne = end + 0.3; } // safety
  return [Math.max(0, ns), ne];
}

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
      // Silence-aware outer edges: recover a dropped leading consonant and trim
      // dead air, without using a sentence's internal pauses as edges.
      const [ss, ee] = speechEdges(src, start, end);
      // Compress internal pauses: the tape leaves long repeat-after-me gaps
      // mid-clip (e.g. 4s between two sentences of one line); shorten any
      // silence over 1s down to ~0.4s.
      const silence = 'silenceremove=stop_periods=-1:stop_duration=1.0:stop_silence=0.4:stop_threshold=-35dB';
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(ss), '-to', String(ee),
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
    // Inline images anywhere on the line — including the block image that rides a
    // marker title line (`$DIALOGUE Title {page.jpg}` / `$MODULE … {cover.jpg}`):
    // copy into the asset folder + rewrite to the bare basename.
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
  if (!/^\$MODULE\s+\S/m.test(finalText)) warn.push('missing $MODULE title');
  for (const f of ['TARGET_LANG_G:', 'HOME_LANG_G:']) {
    if (!new RegExp(`^${f}`, 'm').test(finalText)) warn.push(`missing ${f}`);
  }
  // Leftover timing = an inline {clip@...} that wasn't cut.
  if (/\{[^{}]*@[\d.]/.test(finalText)) warn.push('leftover timing annotation');
  // Every referenced asset present in the folder: inline {file.ext} tokens
  // (a dot+ext distinguishes an asset from a grammar {phrase}); this also covers
  // the block image that rides a marker title line.
  const refs = [];
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
