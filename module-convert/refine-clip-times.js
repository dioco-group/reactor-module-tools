/**
 * Refine inline clip timings in .module.draft files using WORD-LEVEL ASR data.
 *
 * The converter LLM picks rough [start,end] from SEGMENT timings, which often
 * include the tape's counting cues ("Number one.") and instruction lead-ins
 * ("Repeat, ...") because they live inside the same segment. This script
 * re-times every clip ONE AT A TIME, deterministically:
 *
 *   1. Take the text the clip rides (the line content, minus field prefix,
 *      speaker id, and inline {assets}).
 *   2. Take the figure's word-level timestamps (transcripts/.../FigureNN.json).
 *   3. TRUST the rough range as the region (no global search — that wanders to
 *      similar text elsewhere, e.g. the question instead of the answer), and
 *      only TRIM it: strip unmatched cue words ("Number one,", "Repeat,",
 *      "The answer to number two is") from the edges.
 *   4. When the line text covers most of the remaining range (a spoken prompt),
 *      additionally snap to the first/last matched words. When it's a small
 *      subset (a cloze option like "cleans" riding the full model sentence),
 *      keep the whole cue-stripped range — the tape's full sentence is the clip.
 *
 * Low-confidence matches are left unchanged and reported for review.
 *
 * Usage:
 *   node module-convert/refine-clip-times.js --config configs/alc-lla-4/module-convert.json [LESSON]
 */

import fs from 'fs';
import path from 'path';

function parseArgs() {
  const args = process.argv.slice(2);
  const ci = args.indexOf('--config');
  if (ci === -1 || !args[ci + 1]) {
    console.error('Usage: node module-convert/refine-clip-times.js --config <config.json> [LESSON]');
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
    transcriptsDir: c.transcriptsDir ? path.resolve(dir, c.transcriptsDir) : path.join(dataDir, 'transcripts'),
  };
}

// ----------------------------------------------------------------------------
// Text normalization
// ----------------------------------------------------------------------------

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function numToWords(n) {
  if (n < 20) return [ONES[n]];
  const t = Math.floor(n / 10), o = n % 10;
  return o ? [TENS[t], ONES[o]] : [TENS[t]];
}

// Lowercase, expand digits/times to words, strip punctuation -> token array.
function normTokens(text) {
  let s = String(text).toLowerCase();
  const timeWords = (h, m) => {
    const hh = numToWords(parseInt(h, 10)).join(' ');
    const mm = parseInt(m, 10) === 0 ? "o'clock" : numToWords(parseInt(m, 10)).join(' ');
    return `${hh} ${mm}`;
  };
  s = s.replace(/(\d{1,2}):(\d{2})/g, (_, h, m) => timeWords(h, m));
  // ASR often writes clock times without the colon ("630." for "six thirty").
  s = s.replace(/\b(\d{1,2})([0-5]\d)\b/g, (_, h, m) => timeWords(h, m));
  s = s.replace(/\b(\d{1,2})\b/g, (_, d) => numToWords(parseInt(d, 10)).join(' '));
  return s
    .replace(/[^a-z'\s]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter(Boolean);
}

// LCS over token arrays; returns matched index pairs [[ai,bi],...] in order.
function lcsPairs(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { pairs.push([i, j]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

// ----------------------------------------------------------------------------
// Clip text extraction from a draft line
// ----------------------------------------------------------------------------

const INLINE_AUDIO = /\{\s*([^{}@]+?)\s*@\s*([\d.]+)\s*-\s*([\d.]+)\s*\}/;

// The spoken text a clip rides: strip inline {assets}, then the field prefix
// (LINE:/PROMPT:/RESPONSE:/Speaker:) or OPTION id.
function clipText(line) {
  let t = line.replace(/\{[^{}]*\}/g, ' ').trim();
  const opt = t.match(/^OPTION:\s*[^|]+\|\s*(.*)$/);
  if (opt) return opt[1].trim();
  const field = t.match(/^[A-Za-z][A-Za-z0-9_]*:\s*(.*)$/);
  if (field) return field[1].trim();
  return t;
}

function parseClipName(file) {
  const m = file.match(/^bk\w+-l(\d+[a-d])-f(\d+)-.+\.mp3$/i);
  if (!m) return null;
  return { lesson: m[1].toUpperCase(), fig: parseInt(m[2], 10) };
}

// ----------------------------------------------------------------------------
// Alignment
// ----------------------------------------------------------------------------

// Flat word list {start,end,tok} for a figure. Words can normalize to multiple
// tokens ("6:30"); we keep one entry per ASR word using its FIRST token, plus
// extra entries for the rest (same timing) so counts roughly line up.
function loadFigureWords(transcriptsDir, lesson, fig) {
  const p = path.join(transcriptsDir, `Lesson ${lesson}`, `Figure${String(fig).padStart(2, '0')}.json`);
  if (!fs.existsSync(p)) return null;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const words = [];
  for (const seg of j.segments || []) {
    for (const w of seg.words || []) {
      for (const tok of normTokens(w.word)) {
        words.push({ start: w.start, end: w.end, tok });
      }
    }
  }
  return words;
}

// Leading cue patterns the tape inserts before the real content. Matched
// greedily at the START of the rough range (token-wise, already normalized).
const LEAD_CUES = [
  /^(number|item) (one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/,
  /^repeat\b/,
  /^(and )?the answers? to number \w+ (is|are)\b/,
  /^listen to the examples?\b/,
  /^listen\b/,
];

/**
 * Refine the rough [s,e] range for `tokens`. The rough range is TRUSTED as the
 * region; we only trim cue lead-ins and (for full-coverage lines) snap to the
 * matched words. Returns { start, end, score } or null.
 */
function align(words, tokens, s, e) {
  if (!tokens.length || !words.length) return null;
  // Words OVERLAPPING the rough range (with a small tolerance for boundary
  // slop) — containment would drop a final word whose tail crosses the
  // boundary (ASR word ends often overshoot a segment end slightly).
  const slop = 0.4;
  const win = [];
  for (let i = 0; i < words.length; i++) {
    if (words[i].end > s - slop && words[i].start < e + slop) win.push(i);
  }
  if (!win.length) return null;
  let lo = win[0], hi = win[win.length - 1];

  // 1. Strip leading cue phrases ("Number one,", "Repeat,", "The answer to
  //    number two is") — but only when the cue words are NOT part of the line
  //    text itself (e.g. a PROMPT that genuinely starts with "Repeat").
  const winText = () => words.slice(lo, hi + 1).map((w) => w.tok).join(' ');
  const lineStart = tokens.slice(0, 4).join(' ');
  for (let pass = 0; pass < 3; pass++) {
    let stripped = false;
    for (const re of LEAD_CUES) {
      const m = winText().match(re);
      if (m && !re.test(lineStart)) {
        const cueLen = m[0].split(' ').length;
        lo += cueLen;
        stripped = true;
        break;
      }
    }
    if (!stripped || lo > hi) break;
  }
  if (lo > hi) return null;

  // 2. Match the line tokens against the remaining window.
  const winToks = words.slice(lo, hi + 1).map((w) => w.tok);
  const pairs = lcsPairs(tokens, winToks);
  if (!pairs.length) return null;
  const matched = pairs.length;
  const score = matched / tokens.length; // how much of the line was found

  // 3. The line covers (nearly) the whole remaining window -> snap to the
  //    matched words. The line is only a fragment of it (cloze option riding
  //    the full model sentence) -> keep the whole cue-stripped window.
  const firstW = lo + pairs[0][1];
  const lastW = lo + pairs[pairs.length - 1][1];
  const coverage = (lastW - firstW + 1) / (hi - lo + 1);
  const [a, b] = coverage >= 0.7 ? [firstW, lastW] : [lo, hi];
  return { ...padClamp(words, a, b), score };
}

// The slicer pads every cut by ±PAD into "what's around it". Pre-compensate the
// emitted timings so the padded cut can never bleed into the NEIGHBORING words'
// audio (e.g. the tail of a "Repeat," lead-in 150ms before the answer): the
// emitted start is pushed so that (start - PAD) >= previous word's end, and the
// emitted end so that (end + PAD) <= next word's start.
const SLICER_PAD = 0.2;
function padClamp(words, a, b) {
  let start = words[a].start;
  let end = words[b].end;
  const prev = words[a - 1];
  const next = words[b + 1];
  if (prev && start - SLICER_PAD < prev.end) start = Math.min(prev.end + SLICER_PAD, /* never cut into our own word */ start + SLICER_PAD);
  if (next && end + SLICER_PAD > next.start) end = Math.max(next.start - SLICER_PAD, end - SLICER_PAD);
  return { start, end };
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

const MIN_SCORE = 0.6;

function refineDraft(draftPath, cfg) {
  const name = path.basename(draftPath);
  const lines = fs.readFileSync(draftPath, 'utf8').split(/\r?\n/);
  const figureCache = new Map();
  let refined = 0, kept = 0, flagged = [];

  const out = lines.map((line, idx) => {
    const m = line.match(INLINE_AUDIO);
    if (!m) return line;
    const [token, file, sS, eS] = m;
    const s = parseFloat(sS), e = parseFloat(eS);
    const info = parseClipName(file);
    if (!info) { flagged.push(`${file}: unparseable clip name (line ${idx + 1})`); return line; }

    const cacheKey = `${info.lesson}/${info.fig}`;
    if (!figureCache.has(cacheKey)) figureCache.set(cacheKey, loadFigureWords(cfg.transcriptsDir, info.lesson, info.fig));
    const words = figureCache.get(cacheKey);
    if (!words) { flagged.push(`${file}: no transcript JSON for Lesson ${info.lesson} Figure ${info.fig}`); return line; }

    const tokens = normTokens(clipText(line));
    const res = align(words, tokens, s, e);
    if (!res || res.score < MIN_SCORE) {
      kept++;
      flagged.push(`${file}: low confidence (score ${(res?.score ?? 0).toFixed(2)}) — kept ${s}-${e} (line ${idx + 1})`);
      return line;
    }

    const ns = Math.round(res.start * 100) / 100;
    const ne = Math.round(res.end * 100) / 100;
    const changed = Math.abs(ns - s) > 0.05 || Math.abs(ne - e) > 0.05;
    if (changed) refined++; else kept++;
    console.log(`  ${file}: ${s}-${e} -> ${ns}-${ne}${changed ? '' : ' (unchanged)'}  [score ${res.score.toFixed(2)}]`);
    return line.replace(token, `{${file}@${ns}-${ne}}`);
  });

  fs.writeFileSync(draftPath, out.join('\n'));
  console.log(`\n${name}: ${refined} refined, ${kept} kept`);
  if (flagged.length) {
    console.log(`\nNeeds review (${flagged.length}):`);
    for (const f of flagged) console.log(`  ! ${f}`);
  }
}

function main() {
  const { configPath, lesson } = parseArgs();
  const cfg = loadConfig(configPath);
  let drafts = fs.readdirSync(cfg.outputDir).filter((f) => f.endsWith('.module.draft'));
  if (lesson) drafts = drafts.filter((f) => new RegExp(`-${lesson}\\.module\\.draft$`, 'i').test(f));
  if (!drafts.length) { console.error('No .module.draft files found.'); process.exit(1); }
  for (const d of drafts) {
    console.log(`\n=== ${d} ===`);
    refineDraft(path.join(cfg.outputDir, d), cfg);
  }
}

main();
