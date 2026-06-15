/**
 * Figure transcription v3: Soniox async STT (text + word timings in one call).
 *
 * Replaces the two-step Gemini-text + Qwen-align pipeline (transcribe-figures.js)
 * with a single Soniox call that returns the transcript AND word-level
 * timestamps together. Soniox matched or beat the old path on the ALC corpus's
 * hard cases (nailed every /ʌ/ minimal pair in 1C-f3; the only misses are TRUE
 * homophones — week/weak, meat/meet — which no STT can spell from audio alone,
 * and which don't matter here because the word SPELLING always comes from the
 * book, never the ASR; the ASR is used only for TIMING).
 *
 * Advantages over gemini+qwen: one API call, no VPN hop to the aligner, per-word
 * confidence scores, ~$0.006/figure.
 *
 * Output is byte-compatible with the whisper/gemini JSON the rest of the
 * pipeline consumes:
 *   FigureNN.txt   — one utterance per line
 *   FigureNN.json  — { segments:[{id,start,end,text,words:[{start,end,word}]}], info }
 * Timings are in SECONDS. `text` and `word` carry a leading space (legacy shape).
 *
 * Usage:
 *   node module-convert/transcribe-soniox.js --config configs/alc-lla-1/module-convert.json [LESSON ...] [--force]
 *
 * Env: SONIOX_API_KEY.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';

const API = 'https://api.soniox.com';
const MODEL = 'stt-async-v4';
const POLL_INTERVAL_MS = 3000;
const POLL_MAX = 200; // ~10 min ceiling per figure
// Force a new utterance/segment when the silent gap between words exceeds this
// (seconds). Sentence-final punctuation also ends a segment.
const GAP_SPLIT_S = 1.5;

function parseArgs() {
  const args = process.argv.slice(2);
  const ci = args.indexOf('--config');
  if (ci === -1 || !args[ci + 1]) {
    console.error('Usage: node module-convert/transcribe-soniox.js --config <config.json> [LESSON ...] [--force]');
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
// Soniox API
// ----------------------------------------------------------------------------

function authHeaders(key) {
  return { Authorization: `Bearer ${key}` };
}

async function sonioxFetch(key, urlPath, opts = {}) {
  const resp = await fetch(`${API}${urlPath}`, {
    ...opts,
    headers: { ...authHeaders(key), ...(opts.headers || {}) },
  });
  const text = await resp.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { _raw: text }; }
  if (!resp.ok) throw new Error(`${urlPath} -> HTTP ${resp.status}: ${text.slice(0, 200)}`);
  return json;
}

async function uploadFile(key, filePath) {
  const buf = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('file', new Blob([buf]), path.basename(filePath));
  const json = await sonioxFetch(key, '/v1/files', { method: 'POST', body: form });
  return json.id;
}

async function createTranscription(key, fileId) {
  const json = await sonioxFetch(key, '/v1/transcriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, file_id: fileId, language_hints: ['en'] }),
  });
  return json.id;
}

async function waitForTranscription(key, id) {
  for (let i = 0; i < POLL_MAX; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const j = await sonioxFetch(key, `/v1/transcriptions/${id}`);
    if (j.status === 'completed') return;
    if (j.status === 'error') throw new Error(`soniox: ${j.error_type || ''} ${j.error_message || ''}`.trim());
  }
  throw new Error('soniox: transcription timed out');
}

async function getTokens(key, id) {
  const j = await sonioxFetch(key, `/v1/transcriptions/${id}/transcript`);
  return j.tokens || [];
}

// Best-effort cleanup so we don't accumulate files/jobs in the Soniox account.
async function cleanup(key, fileId, transcriptionId) {
  for (const [p] of [
    [`/v1/transcriptions/${transcriptionId}`, transcriptionId],
    [`/v1/files/${fileId}`, fileId],
  ]) {
    if (!p.endsWith('/undefined') && !p.endsWith('/')) {
      try { await sonioxFetch(key, p, { method: 'DELETE' }); } catch { /* non-fatal */ }
    }
  }
}

// ----------------------------------------------------------------------------
// Token -> word -> segment assembly
// ----------------------------------------------------------------------------

/**
 * Soniox returns SentencePiece-style subword tokens; a leading space marks the
 * start of a new word. Reassemble into words with start = first subword start,
 * end = last subword end, converted from ms to seconds.
 */
function tokensToWords(tokens) {
  const words = [];
  for (const t of tokens) {
    const tx = t.text ?? '';
    if (!tx.trim()) continue; // skip pure-whitespace/markers
    const startsWord = tx.startsWith(' ') || words.length === 0;
    if (startsWord) {
      words.push({ raw: tx.trim(), start: t.start_ms / 1000, end: t.end_ms / 1000 });
    } else {
      const w = words[words.length - 1];
      w.raw += tx; // punctuation / subword continuation
      w.end = t.end_ms / 1000;
    }
  }
  // NOTE on timing reliability (measured against ffmpeg silencedetect on this
  // corpus): Soniox word STARTS are accurate, but word ENDS are NOT. For an
  // isolated short utterance the end is either point-like (~60ms after the start)
  // or runs all the way to the NEXT item's onset (e.g. "10."=[52.0-54.7] while
  // "ten" is really 51.6-52.3). So we do NOT trust or patch ends here. Everything
  // downstream anchors on word STARTS; refine-clip-times sets a clip's end to the
  // LAST word's START, and slice-clips' silence-aware `speechEdges` finds the real
  // boundaries (and recovers the late start that would drop a leading consonant).
  return words;
}

/** Group words into utterances: break after sentence-final punctuation or a long gap. */
function wordsToSegments(words) {
  const segments = [];
  let cur = [];
  const flush = () => {
    if (!cur.length) return;
    const text = cur.map((w) => w.raw).join(' ');
    segments.push({
      id: segments.length,
      start: cur[0].start,
      end: cur[cur.length - 1].end,
      text: ` ${text}`,
      words: cur.map((w) => ({ start: w.start, end: w.end, word: ` ${w.raw}` })),
    });
    cur = [];
  };
  for (let i = 0; i < words.length; i++) {
    cur.push(words[i]);
    const endsSentence = /[.!?]$/.test(words[i].raw);
    const next = words[i + 1];
    const bigGap = next && next.start - words[i].end > GAP_SPLIT_S;
    if (endsSentence || bigGap) flush();
  }
  flush();
  return segments;
}

async function processFigure(key, mp3Path, outBase) {
  let fileId, tid;
  try {
    fileId = await uploadFile(key, mp3Path);
    tid = await createTranscription(key, fileId);
    await waitForTranscription(key, tid);
    const tokens = await getTokens(key, tid);
    const words = tokensToWords(tokens);
    if (!words.length) throw new Error('empty transcript');
    const segments = wordsToSegments(words);
    const lines = segments.map((s) => s.text.trim());

    fs.writeFileSync(`${outBase}.txt`, lines.join('\n') + '\n');
    fs.writeFileSync(`${outBase}.json`, JSON.stringify({
      segments,
      info: { source: 'soniox', model: MODEL },
    }, null, 1));
    return { lines: lines.length, words: words.length };
  } finally {
    if (fileId) await cleanup(key, fileId, tid);
  }
}

async function main() {
  const { configPath, lessons, force } = parseArgs();
  const cfg = loadConfig(configPath);
  const key = process.env.SONIOX_API_KEY;
  if (!key) { console.error('SONIOX_API_KEY not set'); process.exit(1); }

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
          if (j.info?.source === 'soniox') { console.log(`  ${f}: done, skip`); continue; }
        } catch { /* re-do on parse error */ }
      }
      try {
        const t0 = Date.now();
        const r = await processFigure(key, path.join(audioLessonDir, f), outBase);
        console.log(`  ${f}: ${r.lines} lines, ${r.words} words [${((Date.now() - t0) / 1000).toFixed(0)}s]`);
      } catch (e) {
        console.error(`  ${f}: FAILED — ${e.message}`);
      }
    }
  }
  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
