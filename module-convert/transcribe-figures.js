/**
 * Figure transcription v2: Gemini (text) + Qwen forced aligner (word timings).
 *
 * Replaces the whisper transcription step. Whisper silently DROPS quiet single
 * items on these cassettes (five manual recoveries in lessons 1A-1D) and makes
 * homophone errors; Gemini transcribes the same audio essentially perfectly
 * but provides no usable timestamps. So: Gemini produces the text, and the
 * Qwen forced aligner (complete text <-> complete audio, its design case)
 * produces the word-level timings.
 *
 * Output matches the whisper JSON shape the pipeline already consumes:
 *   FigureNN.txt   — one utterance per line
 *   FigureNN.json  — { segments: [{start,end,text,words:[{start,end,word}]}], info }
 * One segment per transcript line.
 *
 * Usage:
 *   node module-convert/transcribe-figures.js --config configs/alc-lla-4/module-convert.json [LESSON ...] [--force]
 *
 * Env: ALIGN_URL (default http://192.168.200.210:13000), GEMINI_API_KEY.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { GoogleGenAI } from '@google/genai';

const ALIGN_URL = process.env.ALIGN_URL || 'http://192.168.200.210:13000';
const GEMINI_MODEL = 'gemini-3.5-flash';
const ALIGN_TIMEOUT_MS = 420_000;

function parseArgs() {
  const args = process.argv.slice(2);
  const ci = args.indexOf('--config');
  if (ci === -1 || !args[ci + 1]) {
    console.error('Usage: node module-convert/transcribe-figures.js --config <config.json> [LESSON ...] [--force]');
    process.exit(1);
  }
  const lessons = args.filter((a) => /^\d+[A-D]$/i.test(a)).map((a) => a.toUpperCase());
  return { configPath: args[ci + 1], lessons, force: args.includes('--force') };
}

function loadConfig(configPath) {
  const abs = path.isAbsolute(configPath) ? configPath : path.resolve(process.cwd(), configPath);
  const dir = path.dirname(abs);
  const c = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const inputDir = path.resolve(dir, c.inputDir);
  const dataDir = path.dirname(inputDir);
  return {
    audioDir: c.audioDir ? path.resolve(dir, c.audioDir) : path.join(dataDir, 'audio'),
    transcriptsDir: c.transcriptsDir ? path.resolve(dir, c.transcriptsDir) : path.join(dataDir, 'transcripts'),
  };
}

// ----------------------------------------------------------------------------
// Gemini transcription
// ----------------------------------------------------------------------------

const TRANSCRIBE_PROMPT = `Transcribe this language-learning cassette audio EXACTLY, word for word.
- One utterance (sentence or spoken cue) per line.
- Include EVERYTHING spoken: counting cues ("Number one."), instructions, repeated readings, answer keys.
- Do not add commentary, headings, or timestamps — output only the transcript lines.`;

async function geminiTranscribe(genai, mp3Path) {
  const data = fs.readFileSync(mp3Path).toString('base64');
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await genai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ parts: [{ text: TRANSCRIBE_PROMPT }, { inlineData: { mimeType: 'audio/mpeg', data } }] }],
      });
      const text = (resp.text || '').replace(/```[a-z]*\n?|```/g, '').trim();
      if (text) return text;
      console.warn(`    empty Gemini response (attempt ${attempt})`);
    } catch (e) {
      console.warn(`    Gemini error (attempt ${attempt}): ${e.message}`);
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
  throw new Error('Gemini transcription failed after retries');
}

// ----------------------------------------------------------------------------
// Qwen forced alignment
// ----------------------------------------------------------------------------

async function qwenAlign(wavPath, text) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ALIGN_TIMEOUT_MS);
  try {
    const resp = await fetch(`${ALIGN_URL}/align?text=${encodeURIComponent(text)}&lang=en`, {
      method: 'POST',
      body: fs.readFileSync(wavPath),
      headers: { 'Content-Type': 'application/octet-stream' },
      signal: controller.signal,
    });
    const j = await resp.json();
    if (j.status !== 'success' || !j.data?.words) throw new Error(`aligner: ${JSON.stringify(j).slice(0, 200)}`);
    return j.data.words; // [{start, end, word}]
  } finally {
    clearTimeout(timer);
  }
}

// ----------------------------------------------------------------------------
// Token <-> word pairing
// ----------------------------------------------------------------------------

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9']/g, '');

/**
 * Pair the transcript's whitespace tokens with the aligner's word entries.
 * Ideally 1:1; on count mismatch, LCS over normalized strings, with unmatched
 * tokens interpolated between their matched neighbors.
 * Returns per-token {start, end} (same length as tokens).
 */
function pairTokens(tokens, words) {
  if (tokens.length === words.length) {
    return words.map((w) => ({ start: w.start, end: w.end }));
  }
  const a = tokens.map(norm);
  const b = words.map((w) => norm(w.word));
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = new Array(n).fill(null);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out[i] = { start: words[j].start, end: words[j].end }; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  // Interpolate unmatched tokens between matched neighbors.
  for (let k = 0; k < n; k++) {
    if (out[k]) continue;
    let prev = k - 1; while (prev >= 0 && !out[prev]) prev--;
    let next = k + 1; while (next < n && !out[next]) next++;
    const ps = prev >= 0 ? out[prev].end : (out[next] ? out[next].start : 0);
    const ns = next < n ? out[next].start : ps;
    out[k] = { start: ps, end: ns };
  }
  return out;
}

// ----------------------------------------------------------------------------
// Per-figure processing
// ----------------------------------------------------------------------------

async function processFigure(genai, mp3Path, outBase) {
  // 1. Transcribe
  const text = await geminiTranscribe(genai, mp3Path);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // 2. Align full text
  const wavPath = '/tmp/transcribe-fig.wav';
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp3Path, '-ar', '16000', '-ac', '1', wavPath], { stdio: 'pipe' });
  const fullText = lines.join(' ');
  const alignedWords = await qwenAlign(wavPath, fullText);

  // 3. Pair tokens with aligned words, then group into one segment per line.
  const tokens = fullText.split(/\s+/);
  const timings = pairTokens(tokens, alignedWords);
  const mismatch = tokens.length !== alignedWords.length;

  const segments = [];
  let tok = 0;
  for (const line of lines) {
    const lineTokens = line.split(/\s+/);
    const words = lineTokens.map((w, k) => ({
      start: timings[tok + k].start,
      end: timings[tok + k].end,
      word: ` ${w}`,
    }));
    tok += lineTokens.length;
    segments.push({
      id: segments.length,
      start: words[0].start,
      end: words[words.length - 1].end,
      text: ` ${line}`,
      words,
    });
  }

  fs.writeFileSync(`${outBase}.txt`, lines.join('\n') + '\n');
  fs.writeFileSync(`${outBase}.json`, JSON.stringify({
    segments,
    info: { source: 'gemini+qwen-align', model: GEMINI_MODEL, mismatchedTokens: mismatch },
  }, null, 1));
  return { lines: lines.length, words: alignedWords.length, mismatch };
}

async function main() {
  const { configPath, lessons, force } = parseArgs();
  const cfg = loadConfig(configPath);
  if (!process.env.GEMINI_API_KEY) { console.error('GEMINI_API_KEY not set'); process.exit(1); }
  const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  let lessonDirs = fs.readdirSync(cfg.audioDir).filter((d) => /^Lesson \d+[A-D]$/.test(d)).sort();
  if (lessons.length) lessonDirs = lessonDirs.filter((d) => lessons.includes(d.replace('Lesson ', '')));

  for (const dir of lessonDirs) {
    const audioLessonDir = path.join(cfg.audioDir, dir);
    const outDir = path.join(cfg.transcriptsDir, dir);
    fs.mkdirSync(outDir, { recursive: true });
    const figs = fs.readdirSync(audioLessonDir).filter((f) => /^Figure \d+\.mp3$/.test(f)).sort();
    console.log(`\n=== ${dir} (${figs.length} figures)`);

    for (const f of figs) {
      const num = f.match(/(\d+)/)[1].padStart(2, '0');
      const outBase = path.join(outDir, `Figure${num}`);
      if (!force && fs.existsSync(`${outBase}.json`)) {
        try {
          const j = JSON.parse(fs.readFileSync(`${outBase}.json`, 'utf8'));
          if (j.info?.source === 'gemini+qwen-align') { console.log(`  ${f}: done, skip`); continue; }
        } catch {}
      }
      try {
        const t0 = Date.now();
        const r = await processFigure(genai, path.join(audioLessonDir, f), outBase);
        console.log(`  ${f}: ${r.lines} lines, ${r.words} words${r.mismatch ? ' (token mismatch, LCS-paired)' : ''} [${((Date.now() - t0) / 1000).toFixed(0)}s]`);
      } catch (e) {
        console.error(`  ${f}: FAILED — ${e.message}`);
      }
    }
  }
  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
