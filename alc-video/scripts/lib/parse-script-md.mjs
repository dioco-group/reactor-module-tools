// Extract the canonical tape-script text for a lesson from the book markdown,
// split into per-figure blocks. This is the authoritative wording (whisper is
// only used for timing).

import fs from "node:fs/promises";
import path from "node:path";
import { MD_SRC } from "./paths.mjs";

// Candidate files that contain "AUDIO SCRIPT" sections.
const SCRIPT_FILES = [
  "008 - SCRIPTS.md",
  "009.md",
  "010 - AUDIO SCRIPT.md",
  "011 - AUDIO SCRIPT.md",
  "012 - AUDIO SCRIPT.md",
];

// Pull the script body for one lesson: from its "Lesson <id>" heading (the one
// followed by AUDIO TRACK content) up to the "END OF LESSON <id>" marker or the
// next lesson heading.
async function extractLessonBody(lessonId) {
  for (const fname of SCRIPT_FILES) {
    let raw;
    try {
      raw = await fs.readFile(path.join(MD_SRC, fname), "utf8");
    } catch {
      continue;
    }
    const headingRe = new RegExp(
      `^#{1,4}\\s*Lesson\\s*${lessonId}\\b.*$`,
      "im"
    );
    const m = headingRe.exec(raw);
    if (!m) continue;
    const startIdx = m.index;
    // Must be a script section (AUDIO TRACK appears soon after).
    const after = raw.slice(startIdx, startIdx + 600);
    if (!/AUDIO TRACK/i.test(after)) continue;

    const endRe = new RegExp(`END OF LESSON\\s*${lessonId}\\b`, "i");
    const endM = endRe.exec(raw.slice(startIdx));
    let body;
    if (endM) {
      body = raw.slice(startIdx, startIdx + endM.index);
    } else {
      // up to next lesson heading
      const nextRe = /^#{1,4}\s*Lesson\s*\d[A-D]\b/im;
      nextRe.lastIndex = 0;
      const rest = raw.slice(startIdx + m[0].length);
      const nm = nextRe.exec(rest);
      body = nm ? raw.slice(startIdx, startIdx + m[0].length + nm.index) : raw.slice(startIdx);
    }
    return { file: fname, body };
  }
  return null;
}

// Split a lesson body into figure blocks keyed by figure number.
// Strategy: split on AUDIO TRACK boundaries; assign each track block to the
// figure number it references ("Figure N"). Consecutive blocks with no new
// figure reference are appended to the current figure.
export async function getFigureScripts(lessonId) {
  const res = await extractLessonBody(lessonId);
  if (!res) return null;
  const { body } = res;

  const trackBlocks = body
    .split(/^#{0,4}\s*\**AUDIO TRACK\b.*$/im)
    .map((s) => s.trim())
    .filter(Boolean);

  const figures = new Map(); // n -> text[]
  let currentFig = null;
  for (const block of trackBlocks) {
    const figMatch = block.match(/Figure\s*(\d+)/i);
    if (figMatch) currentFig = parseInt(figMatch[1], 10);
    if (currentFig == null) continue; // intro text before first figure
    if (!figures.has(currentFig)) figures.set(currentFig, []);
    figures.get(currentFig).push(block);
  }

  const out = new Map();
  for (const [n, parts] of figures) out.set(n, parts.join("\n\n"));
  return out;
}
