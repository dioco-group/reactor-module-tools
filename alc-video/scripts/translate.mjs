// Fill in Russian translations for every caption segment in manifest.json
// using Gemini. Idempotent: only translates segments whose `ru` is empty
// (unless FORCE=1). Identical English strings are translated once.
//
// Usage:
//   node scripts/translate.mjs          # translate empty segments
//   FORCE=1 node scripts/translate.mjs  # retranslate everything

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";
import { MANIFEST_PATH } from "./lib/paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load GEMINI_API_KEY from the parent reactor-module-tools/.env
await import("dotenv").then((d) =>
  d.config({ path: path.resolve(__dirname, "..", "..", ".env") })
);

const FORCE = process.env.FORCE === "1";
const MODEL = process.env.TRANSLATE_MODEL || "gemini-3.5-flash";
const BATCH = 40;

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY not set (check reactor-module-tools/.env)");
  process.exit(1);
}
const genai = new GoogleGenAI({ apiKey });

const SYSTEM = `You translate lines from an English language-learning audio course (the American Language Course) into Russian, for Russian-speaking learners following along.
Rules:
- Translate the MEANING into natural, idiomatic Russian.
- Keep instructional tone (e.g. imperatives stay imperative).
- Preserve numbers and proper nouns.
- For a bare item label like "Number 7: Open the door." translate the whole line: "Номер 7: Откройте дверь."
- Spelling drills like "h-e-r, her." should be rendered naturally, keeping the English letters: "h-e-r, her (её)".
- Return ONLY a JSON array of strings, same length and order as the input array.`;

async function translateBatch(strings) {
  const prompt = `${SYSTEM}\n\nInput JSON array:\n${JSON.stringify(strings)}`;
  const resp = await genai.models.generateContent({
    model: MODEL,
    contents: [{ parts: [{ text: prompt }] }],
    config: { responseMimeType: "application/json", temperature: 0.2 },
  });
  let text = resp.text.trim();
  // Strip code fences if present.
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const arr = JSON.parse(text);
  if (!Array.isArray(arr) || arr.length !== strings.length) {
    throw new Error(
      `translation length mismatch: got ${arr.length}, expected ${strings.length}`
    );
  }
  return arr.map((s) => String(s));
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));

  // Collect all segments needing translation, deduped by English text.
  const needed = new Map(); // en -> ru (filled later)
  for (const lesson of manifest.lessons) {
    for (const fig of lesson.figures) {
      for (const seg of fig.segments) {
        if (!seg.en) continue;
        if (!FORCE && seg.ru) continue;
        if (!needed.has(seg.en)) needed.set(seg.en, null);
      }
    }
  }

  const uniqueEn = [...needed.keys()];
  if (!uniqueEn.length) {
    console.log("Nothing to translate. Use FORCE=1 to retranslate.");
    return;
  }
  console.log(`Translating ${uniqueEn.length} unique strings via ${MODEL}...`);

  for (let i = 0; i < uniqueEn.length; i += BATCH) {
    const slice = uniqueEn.slice(i, i + BATCH);
    let ru;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        ru = await translateBatch(slice);
        break;
      } catch (err) {
        console.warn(`  batch ${i / BATCH} attempt ${attempt} failed: ${err.message}`);
        if (attempt === 3) throw err;
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
    slice.forEach((en, j) => needed.set(en, ru[j]));
    console.log(`  ${Math.min(i + BATCH, uniqueEn.length)}/${uniqueEn.length}`);
  }

  // Write back.
  for (const lesson of manifest.lessons) {
    for (const fig of lesson.figures) {
      for (const seg of fig.segments) {
        if (seg.en && needed.get(seg.en)) seg.ru = needed.get(seg.en);
      }
    }
  }

  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`Updated ${MANIFEST_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
