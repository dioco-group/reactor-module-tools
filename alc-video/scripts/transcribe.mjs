// Transcribe ALC lesson figure audio with the in-house faster-whisper service.
// Produces word-level timestamps used to drive synced captions.
//
// Usage:
//   node scripts/transcribe.mjs            # all lessons found under AUDIO/
//   node scripts/transcribe.mjs 1A 1B      # only the given lessons
//   FORCE=1 node scripts/transcribe.mjs 1A # ignore cache

import fs from "node:fs/promises";
import path from "node:path";
import { AUDIO_SRC, TRANSCRIPTS_DIR, WHISPER_HOSTS } from "./lib/paths.mjs";

const FORCE = process.env.FORCE === "1";

async function listLessons() {
  const entries = await fs.readdir(AUDIO_SRC, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && /^Lesson /.test(e.name))
    .map((e) => e.name);
}

// Audio files live at "Lesson 1A/Lesson 1A/Figure 01.mp3" (double nested) in
// most lessons; fall back to a recursive search to be safe.
async function findFigureMp3s(lessonDir) {
  const out = [];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (/^Figure\s*\d+\.mp3$/i.test(e.name)) out.push(full);
    }
  }
  await walk(lessonDir);
  return out.sort();
}

function figureNumberFromFile(file) {
  const m = path.basename(file).match(/Figure\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

async function transcribeFile(host, mp3Path) {
  const buf = await fs.readFile(mp3Path);
  const url = `${host}/asr_whisper_l_batch?lang_G=en&turbo=false`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: buf,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${host}`);
  const json = await res.json();
  if (json.status !== "success") {
    throw new Error(`whisper failure: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return json.data;
}

// Simple worker pool: each whisper host handles one file at a time.
async function runPool(tasks) {
  const queue = [...tasks];
  let done = 0;
  const total = queue.length;
  await Promise.all(
    WHISPER_HOSTS.map(async (host) => {
      while (queue.length) {
        const task = queue.shift();
        if (!task) break;
        try {
          const data = await transcribeFile(host, task.mp3Path);
          await fs.mkdir(path.dirname(task.outPath), { recursive: true });
          await fs.writeFile(task.outPath, JSON.stringify(data, null, 2));
          done++;
          console.log(
            `[${done}/${total}] ${task.lesson} fig${task.figure} -> ${path.basename(
              task.outPath
            )} (${data.segments?.length ?? 0} segs)`
          );
        } catch (err) {
          console.error(
            `  ! ${task.lesson} fig${task.figure} on ${host}: ${err.message}`
          );
          queue.push(task); // requeue once at the back
        }
      }
    })
  );
}

async function main() {
  const wanted = process.argv.slice(2).map((s) => s.toUpperCase());
  const allLessons = await listLessons();
  const lessons = wanted.length
    ? allLessons.filter((l) =>
        wanted.includes(l.replace(/^Lesson\s*/i, "").toUpperCase())
      )
    : allLessons;

  if (!lessons.length) {
    console.error("No matching lessons found in", AUDIO_SRC);
    process.exit(1);
  }

  const tasks = [];
  for (const lesson of lessons) {
    const lessonId = lesson.replace(/^Lesson\s*/i, "");
    const mp3s = await findFigureMp3s(path.join(AUDIO_SRC, lesson));
    for (const mp3 of mp3s) {
      const figure = figureNumberFromFile(mp3);
      if (figure == null) continue;
      const outPath = path.join(
        TRANSCRIPTS_DIR,
        lessonId,
        `Figure${String(figure).padStart(2, "0")}.json`
      );
      if (!FORCE) {
        try {
          await fs.access(outPath);
          continue; // cached
        } catch {}
      }
      tasks.push({ lesson: lessonId, figure, mp3Path: mp3, outPath });
    }
  }

  if (!tasks.length) {
    console.log("Nothing to transcribe (all cached). Use FORCE=1 to redo.");
    return;
  }
  console.log(`Transcribing ${tasks.length} figure(s) across ${WHISPER_HOSTS.length} workers...`);
  await runPool(tasks);
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
