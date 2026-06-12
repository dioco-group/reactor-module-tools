// Build manifest.json by merging whisper transcripts (timing + text) with the
// lesson activity markdown (illustrations + figure structure).
//
// Usage:
//   node scripts/build-manifest.mjs            # all lessons with transcripts
//   node scripts/build-manifest.mjs 1A

import fs from "node:fs/promises";
import path from "node:path";
import {
  TRANSCRIPTS_DIR,
  MANIFEST_PATH,
  AUDIO_SRC,
} from "./lib/paths.mjs";
import { parseLessonMd } from "./lib/parse-lesson-md.mjs";

// Audio source path for a figure, used later by copy-assets.
async function findFigureMp3(lessonId, figure) {
  const stem = `Figure ${String(figure).padStart(2, "0")}.mp3`;
  const candidates = [
    path.join(AUDIO_SRC, `Lesson ${lessonId}`, `Lesson ${lessonId}`, stem),
    path.join(AUDIO_SRC, `Lesson ${lessonId}`, stem),
  ];
  for (const c of candidates) {
    try {
      await fs.access(c);
      return c;
    } catch {}
  }
  return null;
}

const NUM_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, "twenty-one": 21, "twenty-two": 22, "twenty-three": 23,
  "twenty-four": 24,
};

// Whisper renders item labels as "Number four, ..." (spelled out) or "Number 4".
function detectItemNumber(text) {
  const m = text.match(/^\s*Number\s+([\w-]+)\b/i);
  if (!m) return null;
  const tok = m[1].toLowerCase();
  if (/^\d+$/.test(tok)) return parseInt(tok, 10);
  return NUM_WORDS[tok] ?? null;
}

function cleanText(t) {
  return t.replace(/\s+/g, " ").trim();
}

async function readTranscript(lessonId, figure) {
  const p = path.join(
    TRANSCRIPTS_DIR,
    lessonId,
    `Figure${String(figure).padStart(2, "0")}.json`
  );
  try {
    const data = JSON.parse(await fs.readFile(p, "utf8"));
    return data;
  } catch {
    return null;
  }
}

async function listTranscribedLessons() {
  try {
    const entries = await fs.readdir(TRANSCRIPTS_DIR, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function buildLesson(lessonId) {
  const md = await parseLessonMd(lessonId);
  const imagesByFigure = new Map();
  if (md) {
    for (const fig of md.figures) {
      const byIndex = new Map();
      for (const img of fig.images) byIndex.set(img.index, img);
      imagesByFigure.set(fig.n, { instruction: fig.instruction, byIndex });
    }
  }

  const dir = path.join(TRANSCRIPTS_DIR, lessonId);
  let figFiles = [];
  try {
    figFiles = (await fs.readdir(dir)).filter((f) => /^Figure\d+\.json$/.test(f));
  } catch {
    return null;
  }
  figFiles.sort();

  const figures = [];
  for (const f of figFiles) {
    const figure = parseInt(f.match(/Figure(\d+)/)[1], 10);
    const data = await readTranscript(lessonId, figure);
    if (!data) continue;
    const mp3 = await findFigureMp3(lessonId, figure);
    const figMeta = imagesByFigure.get(figure);

    const segments = (data.segments || []).map((s) => {
      const text = cleanText(s.text);
      const itemNumber = detectItemNumber(text);
      const image =
        itemNumber != null && figMeta && figMeta.byIndex.has(itemNumber)
          ? figMeta.byIndex.get(itemNumber)
          : null;
      return {
        start: s.start,
        end: s.end,
        en: text,
        ru: "",
        itemNumber,
        image: image
          ? { path: image.path, caption: image.caption, panel: image.panel }
          : null,
        words: (s.words || []).map((w) => ({
          start: w.start,
          end: w.end,
          word: w.word.trim(),
        })),
      };
    });

    const images = figMeta
      ? [...figMeta.byIndex.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([index, img]) => ({
            index,
            panel: img.panel,
            path: img.path,
            caption: img.caption,
          }))
      : [];

    figures.push({
      n: figure,
      instruction: figMeta?.instruction ?? null,
      instructionRu: null,
      activityType: null,
      audioSrc: mp3, // absolute source path; copy-assets rewrites to public ref
      audioPublic: `audio/${lessonId}/Figure${String(figure).padStart(2, "0")}.mp3`,
      durationSec: data.info?.duration ?? null,
      images,
      segments,
    });
  }

  return {
    id: lessonId,
    title: `Lesson ${lessonId}`,
    figures,
  };
}

async function main() {
  const wanted = process.argv.slice(2).map((s) => s.toUpperCase());
  const lessonIds = wanted.length ? wanted : await listTranscribedLessons();
  lessonIds.sort();

  const lessons = [];
  for (const id of lessonIds) {
    const lesson = await buildLesson(id);
    if (lesson && lesson.figures.length) {
      lessons.push(lesson);
      console.log(
        `  ${id}: ${lesson.figures.length} figures, ${lesson.figures.reduce(
          (a, f) => a + f.segments.length,
          0
        )} segments`
      );
    } else {
      console.warn(`  ${id}: no transcripts found, skipped`);
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    fps: 30,
    width: 1920,
    height: 1080,
    lessons,
  };
  await fs.mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${MANIFEST_PATH} (${lessons.length} lessons)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
