/**
 * ALC Conversion Pipeline — Stage A (assemble) + Stage B (LLM convert).
 *
 * For each lesson it fuses the BOOK markdown (figures = scaffold) with the TAPE
 * transcript (the actual drill content), passes the tape's word/segment TIMINGS
 * to the model, and asks for a v2 `.module`. Audio-bearing lines are emitted as
 *     AUDIO: <clip-filename> | <start_s> | <end_s>
 * (a transient build annotation). A later slice step (slice-clips.js) cuts those
 * clips and rewrites each line to a plain `AUDIO: <clip-filename>`.
 *
 * This repo never calls the (private) whisper backend; it only consumes the
 * transcripts already in data/<course>/transcripts/.
 *
 * Usage: node module-convert/convert-alc.js --config configs/alc-lla-4/module-convert.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { callGemini, stripMarkdownCodeBlocks, isRateLimitError } from '../lib/gemini-api.js';
import { sleep } from '../lib/progress.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const args = process.argv.slice(2);
  const ci = args.indexOf('--config');
  if (ci === -1 || !args[ci + 1]) {
    console.error('Usage: node module-convert/convert-alc.js --config <config.json> [LESSON]');
    process.exit(1);
  }
  const lessonFilter = args.find((a) => /^\d+[A-D]$/i.test(a)) || null;
  return { configPath: args[ci + 1], lessonFilter };
}

function loadConfig(configPath) {
  const abs = path.isAbsolute(configPath) ? configPath : path.resolve(process.cwd(), configPath);
  const dir = path.dirname(abs);
  const c = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const inputDir = path.resolve(dir, c.inputDir);
  // Derive sibling dirs from the md dir unless overridden.
  const dataDir = path.dirname(inputDir);
  return {
    courseName: c.courseName,
    inputDir,
    outputDir: path.resolve(dir, c.outputDir),
    transcriptsDir: c.transcriptsDir ? path.resolve(dir, c.transcriptsDir) : path.join(dataDir, 'transcripts'),
    model: c.model || 'gemini-3-pro-preview',
    maxTokens: c.maxTokens || 32000,
    temperature: c.temperature ?? 1.0,
    thinkingBudget: typeof c.thinkingBudget === 'number' ? c.thinkingBudget : 4096,
    delayBetweenRequests: c.delayBetweenRequests || 3000,
    bookId: c.bookId || 'NN',
  };
}

function readMaybe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

// ----------------------------------------------------------------------------
// Stage A: assemble per-lesson bundles (book figures + tape transcript+timings)
// ----------------------------------------------------------------------------

// Strict single-line running banner, e.g. "LANGUAGE LABORATORY ACTIVITIES BOOK 1 LESSON 1B".
const LESSON_HEADER_RE = /LANGUAGE LABORATORY ACTIVITIES.*?LESSON\s+(\d+[A-D])/i;
// Fallback: a markdown HEADING line carrying the lesson code even when OCR
// dropped/relocated the banner, e.g. "### BOOK 1, LESSON 1A" or "### LESSON 2D".
// Heading-anchored so dotted TOC entries ("**LESSON 1A** ...... 1") never match.
const LESSON_HEADING_RE = /^#{1,6}\s+.*?\bLESSON\s+(\d+[A-D])\b/i;
// Back-matter section banners (tapescripts / answer keys — present in 2012+ ALC
// editions). Once crossed, STOP assigning lines to lessons so per-lesson script
// subheadings ("## Lesson 2D") aren't mistaken for content and the whole back
// matter isn't dumped into the last lesson. Matches ONLY a heading that IS the
// banner (whole line) — so a normal lesson heading like "### Answer the
// questions" does NOT trip it.
const BACKMATTER_RE = /^#{1,6}\s*(AUDIO\s*SCRIPTS?|TAPESCRIPTS?|SCRIPTS|ANSWER\s*KEYS?|ANSWERS)\s*:?\s*$/i;

// Split all book markdown into { lessonCode -> bookText }, in document order.
function splitBookByLesson(inputDir) {
  const files = fs.readdirSync(inputDir).filter((f) => /\.md$/.test(f) && !f.includes('Zone.Identifier')).sort();
  const lessons = new Map();
  let current = null;
  let inBackMatter = false;
  for (const f of files) {
    const text = fs.readFileSync(path.join(inputDir, f), 'utf8');
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      if (!inBackMatter && BACKMATTER_RE.test(line)) { inBackMatter = true; current = null; }
      if (!inBackMatter) {
        const m = line.match(LESSON_HEADER_RE) || line.match(LESSON_HEADING_RE);
        if (m) {
          current = m[1].toUpperCase();
          if (!lessons.has(current)) lessons.set(current, []);
        }
      }
      if (current) lessons.get(current).push(line);
    }
  }
  const out = new Map();
  for (const [code, arr] of lessons) out.set(code, arr.join('\n').trim());
  return out;
}

// Compact per-figure tape view: clean text + segment timings (start–end: text).
function gatherTape(transcriptsDir, lessonCode, bookId) {
  const dir = path.join(transcriptsDir, `Lesson ${lessonCode}`);
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return null; }
  const figs = entries.filter((f) => /^Figure\d+\.txt$/.test(f)).sort();
  const blocks = [];
  for (const txt of figs) {
    const figNum = parseInt(txt.match(/Figure(\d+)/)[1], 10);
    const plain = (readMaybe(path.join(dir, txt)) || '').trim();
    let timings = '';
    const jsonRaw = readMaybe(path.join(dir, txt.replace('.txt', '.json')));
    if (jsonRaw) {
      try {
        const segs = JSON.parse(jsonRaw).segments || [];
        timings = segs
          .map((s) => `  [${s.start.toFixed(2)}-${s.end.toFixed(2)}] ${(s.text || '').trim()}`)
          .join('\n');
      } catch {}
    }
    blocks.push(
      `#### TAPE — Figure ${figNum} (clip filenames start: ${clipBase(bookId, lessonCode, figNum)}-NN.mp3)\n` +
      `Transcript (clean text):\n${plain}\n\n` +
      `Segment timings (seconds):\n${timings}`
    );
  }
  return blocks.join('\n\n');
}

function clipBase(bookId, lessonCode, figNum) {
  return `bk${bookId}-l${lessonCode.toLowerCase()}-f${figNum}`;
}

// ----------------------------------------------------------------------------
// Stage B: LLM convert
// ----------------------------------------------------------------------------

// The worked example is a FULL input->output pair: the gold is LLA Book 4
// Lesson 1A, so we present that lesson's BOOK + TAPE exactly as the model
// receives a real lesson (same splitBookByLesson / gatherTape formatting),
// followed by the correct .module. Showing the transformation — not just the
// target shape — is a far stronger few-shot signal. Falls back to output-only
// if the Book 4 source data isn't on disk.
function buildWorkedExample() {
  const gold = readMaybe(path.resolve(__dirname, 'format-comparison/lesson-1A.gold.module')) || '';
  if (!gold) return '';
  try {
    const book = splitBookByLesson(path.resolve(__dirname, '../data/alc-lla-4/md'));
    const bookText = book.get('1A');
    const tapeText = gatherTape(path.resolve(__dirname, '../data/alc-lla-4/transcripts'), '1A', '04');
    if (bookText && tapeText) {
      return `## EXAMPLE INPUT — BOOK (figures — the printed scaffold)\n\n${bookText}\n\n` +
        `## EXAMPLE INPUT — TAPE (the cassette — the real drill content + timings)\n\n${tapeText}\n\n` +
        `## EXAMPLE OUTPUT — the correct .module produced from the BOOK + TAPE above\n\n${gold}`;
    }
  } catch { /* fall through to output-only */ }
  return gold;
}

function buildSystemPrompt(courseName) {
  const spec = readMaybe(path.resolve(__dirname, 'shared/module_format_v2_proposal.md')) || '';
  const notes = readMaybe(path.resolve(__dirname, 'shared/alc_conversion_notes.md')) || '';
  const example = buildWorkedExample();
  return `You convert ${courseName} into the v2 module format below, for Russian-speaking learners. The module is authored in English and is monolingual (TARGET_LANG_G: en, HOME_LANG_G: en); Russian translations are added automatically downstream.

${spec}

---

# ALC Conversion Notes (follow these)

${notes}

---

# WORKED EXAMPLE — a complete conversion of LLA Book 4 Lesson 1A, shown as the
# INPUT you receive (BOOK + TAPE) and the correct OUTPUT (.module) it produces.
# Study how each figure's book scaffold + tape content maps to an activity type,
# how INTRO/INSTRUCTION are written, and how clips/images/options are attached.
# Convert the lesson you are ACTUALLY given below — do not copy this content.
${example}

---

# LANGUAGE (this run)

Output is **English only**. Do NOT emit any translation fields — no VOCAB_T,
LINE_T, PROMPT_T, RESPONSE_T, or ANSWER_T. Russian translations are added by a
later downstream step; produce the English module only.

# HEADER & VOICES (this run)

Start the file exactly like this (the title rides the $MODULE line):
  $MODULE Lesson <NX>: <short descriptive topic>   (e.g. "$MODULE Lesson 1C: Past Tense Questions and Short Answers" — NEVER a bare "Lesson 1C")
  FORMAT: 2
  DESCRIPTION: <one line>
  TARGET_LANG_G: en
  HOME_LANG_G: en
There is NO TITLE: field — the module title goes on the $MODULE line. Then voice config:
  VOICE_DEFAULT: aoede | Clear, friendly American English narrator
Use ONLY these voice names: aoede, achernar, achird, schedar, gacrux. For dialog
speakers, map a **no-spaces, not-ALL-CAPS** speaker id to a voice, e.g.:
  VOICE: Collins | achernar | Male officer
Dialogue lines are written screenplay-style with that id as the prefix:
  Collins: Good morning, sergeant. {bk04-l2a-f1-01.mp3@5.20-7.10}
A bare LINE: continues the SAME speaker; use LINE: (or Narrator:) for narration.
There is NO SPEAKER: field. Never use Azure-style names like "en-US-*-Neural".

# INLINE ASSETS (this run)

Images and audio ride the content line itself, in trailing curly braces, routed
by file extension — image FIRST, audio LAST:
  <text> {<image.jpg>} {<clip-filename>@<start_s>-<end_s>}
The slicer cuts [start,end] from the figure mp3 and strips the timing to "{<clip>}".
Allowed on dialogue lines, PROMPT, RESPONSE ($PRODUCE model answer), and OPTION. Examples:
  Narrator: This is Linda. {page_012_001.jpg} {bk04-l1a-f8-01.mp3@21.50-23.10}
  PROMPT: John, do you like football games? — No, I don't. {bk04-l1a-f3-01-q.mp3@10.50-14.20}
  OPTION: e | soccer {page_008_005.jpg}
  OPTION: b | John doesn't like football games. {bk04-l1a-f3-01-a.mp3@71.22-74.84}
  RESPONSE: The children like to play ball in the afternoon. {bk04-l1a-f4-01-a.mp3@8.10-11.40}
There are NO OPTION_IMAGE / PROMPT_IMAGE / IMAGE: fields. An activity-wide shared
reference image (e.g. one map for all items in $SELECT) and the module cover ride
the END of the marker title line: `$SELECT Title {page_XXX.jpg}` / `$MODULE … {cover.jpg}`.

# CLIP RULES (this run)

- **At most ONE audio clip per line — never two.** When the tape has a question
  AND a model answer, the question clip goes on the PROMPT and the answer clip
  goes on the RESPONSE line (or on the correct OPTION in $SELECT). Never stack
  both on the PROMPT.
- A clip must come from the figure the item belongs to. NEVER attach clips from
  the next figure's tape to the last item of the current activity.
- Pick start/end from the figure's "Segment timings" so the clip covers ONLY that text (you may merge adjacent segments). Exclude vocab-word readings and spoken apparatus: "Number N" counting cues, "Repeat,"/"Listen" lead-ins, and "The answer to number N is ..." framing — even when they sit inside the same segment as the content (a word-level refinement pass will trim them, but start from the tightest range you can).
- <clip-filename> pattern: bk<book>-l<lesson>-f<fig>-<NN>.mp3; use a -q/-a style suffix when one item needs question + answer clips.
- Do NOT attach a clip to text NOT spoken on the tape (TEMPLATE context, restructured prompts, $GRAMMAR). Do not invent timings.
- A cloze stimulus with ____ gaps must be a TEMPLATE (display-only), never a PROMPT — a clip-less PROMPT gets TTS, which would read the gaps aloud. TEMPLATE works in both $SELECT and $PRODUCE items; an item needs a PROMPT and/or a TEMPLATE. Example:
  TEMPLATE: Linda works ____.
  OPTION: a | all night long
  OPTION: b | all week long {bk04-l1a-f8-16.mp3@541.20-543.80}
  ANSWER: b
- Separate items with a blank line.
Output ONLY the .module text.`;
}

async function convertLesson(config, lessonCode, bookText, tapeText) {
  const system = buildSystemPrompt(config.courseName);
  const user =
    `Convert LESSON ${lessonCode} into one .module.\n\n` +
    `## BOOK (figures — the printed scaffold)\n\n${bookText}\n\n` +
    `## TAPE (the cassette — the real drill content + timings)\n\n${tapeText}\n`;
  const resp = await callGemini(user, {
    model: config.model,
    systemPrompt: system,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    thinkingBudget: config.thinkingBudget,
  });
  return stripMarkdownCodeBlocks(resp);
}

async function main() {
  const { configPath, lessonFilter } = parseArgs();
  const config = loadConfig(configPath);
  fs.mkdirSync(config.outputDir, { recursive: true });

  console.log(`=== ALC Convert === ${config.courseName}`);
  console.log(`book: ${config.inputDir}`);
  console.log(`tape: ${config.transcriptsDir}\n`);

  const book = splitBookByLesson(config.inputDir);

  // Cross-check against the tape transcripts (the authoritative list of lessons
  // that actually exist). A lesson with audio but no book text almost always
  // means its OCR'd header lost the "LANGUAGE LABORATORY ACTIVITIES ... LESSON
  // NX" banner. Flag loudly with the fix rather than silently dropping it.
  try {
    const tapeLessons = fs.readdirSync(config.transcriptsDir)
      .map((d) => (d.match(/^Lesson (\d+[A-D])$/) || [])[1]).filter(Boolean);
    const missing = tapeLessons.filter((c) => !book.has(c)).sort();
    if (missing.length) {
      console.warn(`\n⚠  Lessons with audio but NO book markdown: ${missing.join(', ')}`);
      console.warn(`   Their lesson header was likely dropped/garbled by OCR. In each lesson's`);
      console.warn(`   .md (in ${config.inputDir}), add a top line like:`);
      console.warn(`     ## LANGUAGE LABORATORY ACTIVITIES — BOOK ${config.bookId || 'N'}, LESSON <NX>`);
      console.warn(`   then re-run. (Back matter is auto-excluded; no need to move it.)\n`);
    }
  } catch { /* transcripts dir optional */ }

  let codes = [...book.keys()].sort();
  if (lessonFilter) codes = codes.filter((c) => c === lessonFilter.toUpperCase());
  if (!codes.length) { console.error('No lessons matched.'); process.exit(1); }

  for (const code of codes) {
    const draftPath = path.join(config.outputDir, `lesson-${code}.module.draft`);
    if (fs.existsSync(draftPath)) { console.log(`  ${code}: draft exists, skip`); continue; }
    const tapeText = gatherTape(config.transcriptsDir, code, config.bookId);
    if (!tapeText) { console.warn(`  ${code}: no transcripts, skip`); continue; }
    try {
      console.log(`  ${code}: converting...`);
      const md = await convertLesson(config, code, book.get(code), tapeText);
      fs.writeFileSync(draftPath, md);
      const acts = (md.match(/^\$(DIALOGUE|GRAMMAR|SELECT|PRODUCE|CHAT)/gm) || []).length;
      const auds = (md.match(/\{[^{}]+@[\d.]+\s*-\s*[\d.]+\}/g) || []).length;
      console.log(`    -> ${path.basename(draftPath)} (${acts} activities, ${auds} timed inline clips)`);
    } catch (e) {
      console.error(`    ! ${code}: ${e.message}`);
      if (isRateLimitError(e)) await sleep(30000);
    }
    await sleep(config.delayBetweenRequests);
  }
  console.log('\nStage A+B done. Next: slice-clips.js to cut audio and finalize.');
}

main().catch((e) => { console.error(e); process.exit(1); });
