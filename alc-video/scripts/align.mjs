// Reconcile whisper output with the canonical book tape-script using an LLM.
//
// For each figure we send (a) the authoritative book script and (b) the ordered
// whisper segments (text only). The model returns, for each segment IN THE SAME
// ORDER AND COUNT: corrected English (book wording for what is actually spoken
// in that segment), a Russian translation, a pedagogical role, and the item
// number it belongs to. It also classifies the figure's activity type and
// translates the instruction.
//
// Whisper timing (start/end/words) is preserved untouched.
//
// Usage:
//   node scripts/align.mjs            # all lessons in manifest
//   node scripts/align.mjs 1A
//   FORCE=1 node scripts/align.mjs 1A

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";
import { MANIFEST_PATH } from "./lib/paths.mjs";
import { getFigureScripts } from "./lib/parse-script-md.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
await import("dotenv").then((d) =>
  d.config({ path: path.resolve(__dirname, "..", "..", ".env") })
);

const FORCE = process.env.FORCE === "1";
const MODEL = process.env.ALIGN_MODEL || "gemini-3.5-flash";
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY not set (check reactor-module-tools/.env)");
  process.exit(1);
}
const genai = new GoogleGenAI({ apiKey });

const ROLES = [
  "instruction", // teacher direction: "Look at Figure 1. Listen and repeat."
  "model", // a word/sentence to imitate (repeat activities)
  "prompt", // an exercise stimulus the learner must respond to (listen & choose)
  "answer", // the revealed correct answer / "listen and check"
  "example", // a worked example
  "dialog", // conversational line
  "letters", // a string of letters being read
  "numbers", // a string of numbers being read
  "other",
];
const ACTIVITY_TYPES = [
  "repeat_vocab", // imitate words that have illustrations
  "repeat_sentence", // imitate sentences
  "repeat_list", // imitate a list (letters / numbers)
  "listen_circle", // hear a stimulus and circle the matching option
  "dictation", // hear and write
  "same_different", // judge if two words are same/different
  "dialog", // listen to / repeat a conversation
  "other",
];

function buildPrompt(figure, script, segTexts) {
  return `You are preparing bilingual (English + Russian) subtitles for a video of an American Language Course (ALC) language-lab lesson, aimed at Russian-speaking learners.

You are given:
1. The CANONICAL BOOK SCRIPT for this figure (authoritative wording, includes teacher instructions, numbered items, examples, pauses, and answer keys).
2. The WHISPER SEGMENTS: an ordered list of what an ASR model heard. The text has errors but the SEGMENTATION and ORDER reflect the real audio timing.

Your job, for EACH whisper segment (keep exact same count and order):
- "en": the corrected English text for what is actually spoken in that segment, using the canonical book wording. Fix ASR errors, punctuation, capitalization, spelled-out numbers -> "Number 7:" style where appropriate. If a segment is an echo/repetition of the previous line, keep the repeated text. Do NOT merge or drop segments.
- "ru": a natural, idiomatic Russian translation of that line (preserve numbers, letters, proper nouns; keep imperative tone for instructions).
- "role": one of ${JSON.stringify(ROLES)}.
- "itemNumber": the integer item/number this segment belongs to (e.g. "Number 7: ..." -> 7), else null.

Also classify the whole figure:
- "activityType": one of ${JSON.stringify(ACTIVITY_TYPES)}.
- "instructionEn": a one-line English summary of what the learner does in this figure.
- "instructionRu": that instruction in natural Russian (this is shown as a task card).

CANONICAL BOOK SCRIPT:
"""
${script}
"""

WHISPER SEGMENTS (${segTexts.length} total):
${segTexts.map((t, i) => `${i}: ${t}`).join("\n")}

Return ONLY a JSON object of this exact shape:
{
  "activityType": "...",
  "instructionEn": "...",
  "instructionRu": "...",
  "segments": [ { "en": "...", "ru": "...", "role": "...", "itemNumber": null }, ... ]
}
The "segments" array MUST have exactly ${segTexts.length} elements in the same order as the input.`;
}

async function callModel(prompt) {
  const resp = await genai.models.generateContent({
    model: MODEL,
    contents: [{ parts: [{ text: prompt }] }],
    config: { responseMimeType: "application/json", temperature: 0.2 },
  });
  let text = resp.text.trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  return JSON.parse(text);
}

function relinkImages(figure) {
  const byIndex = new Map((figure.images || []).map((im) => [im.index, im]));
  for (const seg of figure.segments) {
    if (seg.itemNumber != null && byIndex.has(seg.itemNumber)) {
      const im = byIndex.get(seg.itemNumber);
      seg.image = { path: im.path, caption: im.caption, panel: im.panel };
    } else if (seg.role !== "model" && seg.role !== "prompt") {
      // keep no image for pure instructions/answers unless already vocab
    }
  }
}

async function alignFigure(lessonId, figure, scripts) {
  const script = scripts?.get(figure.n);
  if (!script) {
    console.warn(`    Figure ${figure.n}: no canonical script, skipping`);
    return false;
  }
  const segTexts = figure.segments.map((s) => s.en);
  const prompt = buildPrompt(figure, script, segTexts);

  let result;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      result = await callModel(prompt);
      if (
        !result?.segments ||
        result.segments.length !== figure.segments.length
      ) {
        throw new Error(
          `segment count mismatch: got ${result?.segments?.length}, expected ${figure.segments.length}`
        );
      }
      break;
    } catch (err) {
      console.warn(`    Figure ${figure.n} attempt ${attempt}: ${err.message}`);
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }

  figure.activityType = result.activityType || "other";
  figure.instructionEn = result.instructionEn || figure.instruction || null;
  figure.instructionRu = result.instructionRu || null;
  figure.segments.forEach((seg, i) => {
    const r = result.segments[i];
    seg.en = r.en ?? seg.en;
    seg.ru = r.ru ?? "";
    seg.role = r.role ?? "other";
    seg.itemNumber = r.itemNumber ?? null;
  });
  relinkImages(figure);
  return true;
}

async function main() {
  const wanted = process.argv.slice(2).map((s) => s.toUpperCase());
  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
  const lessons = wanted.length
    ? manifest.lessons.filter((l) => wanted.includes(l.id))
    : manifest.lessons;

  for (const lesson of lessons) {
    console.log(`Lesson ${lesson.id}:`);
    const scripts = await getFigureScripts(lesson.id);
    for (const figure of lesson.figures) {
      const done = figure.segments.every((s) => s.role) && !FORCE;
      if (done) {
        console.log(`    Figure ${figure.n}: already aligned, skip`);
        continue;
      }
      const ok = await alignFigure(lesson.id, figure, scripts);
      if (ok) {
        console.log(
          `    Figure ${figure.n}: ${figure.activityType}, ${figure.segments.length} segs aligned`
        );
      }
      await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
    }
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
