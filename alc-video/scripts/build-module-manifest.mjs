// Build a video manifest directly from FORMAT v2 .module files.
//
// This replaces the old markdown/whisper pipeline: v2 modules already carry
// per-line cassette clips (sliced), per-line images, and machine-readable
// activity structure (DIALOGUE / SELECT / PRODUCE), so the video is driven by
// the same source of truth as the app.
//
// Pipeline per lesson:
//   1. Parse the .module with the CANONICAL parser (module-parser/, bundled on the fly).
//   2. Walk activities -> timed video segments (clip durations via ffprobe).
//   3. Translate all on-screen English to Russian via Gemini (cached in data/ru-cache.json).
//   4. Copy the lesson's asset folder into public/modules/<id>/.
//   5. Write data/module-manifest.json (consumed by src/module/).
//
// Usage:
//   node scripts/build-module-manifest.mjs 1A 2A      # specific lessons
//   node scripts/build-module-manifest.mjs --all      # every lesson in the module dir

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { build } from "esbuild";
import { GoogleGenAI } from "@google/genai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REPO = path.resolve(ROOT, "..");

await import("dotenv").then((d) => d.config({ path: path.join(REPO, ".env") }));

const MODULE_DIR = process.env.MODULE_DIR || path.join(REPO, "data/alc-lla-4/module");
const PARSER_TS = path.join(REPO, "module-parser/module_parser.ts");
const OUT_MANIFEST = path.join(ROOT, "data/module-manifest.json");
const RU_CACHE = path.join(ROOT, "data/ru-cache.json");
const PUBLIC_MODULES = path.join(ROOT, "public/modules");

// Story Edition (--story): one module file with several $LESSONs, fully
// TTS-voiced (no cassette clips). Assets come from the staged repo clone.
const STORY_MODULE = path.join(REPO, "data/alc-english/book-4-lesson-1-story.module");
const STORY_ASSETS = "/tmp/alc-english/book-4-lesson-1-story";

const FPS = 30;
const WIDTH = 1280;
const HEIGHT = 720;
const MODEL = process.env.TRANSLATE_MODEL || "gemini-3.5-flash";

// ---------------------------------------------------------------------------
// Timing constants (seconds)
// ---------------------------------------------------------------------------
const T = {
  title: 4.5,
  lessonEnd: 4.5,
  preRoll: 0.8,            // silence before a clip starts
  vocabPerWord: 1.4,       // extra pre-roll per vocab chip (read + register)
  afterLine: 1.0,          // hold after a dialogue line
  repeatGap: 0.6,          // pause before the repeat window
  think: 3.2,              // SELECT thinking window
  revealGap: 0.4,          // pause between reveal and the answer clip
  feedbackMin: 2.4,
  afterReveal: 1.4,
  produceThinkMin: 2.6,
  produceTail: 1.2,
};

const clamp = (lo, x, hi) => Math.max(lo, Math.min(x, hi));
const readTime = (s) => clamp(2.2, 1.2 + String(s || "").split(/\s+/).filter(Boolean).length * 0.32, 8);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ffprobeDuration(p) {
  try {
    const out = execFileSync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      p,
    ]).toString().trim();
    const d = parseFloat(out);
    return Number.isFinite(d) ? d : null;
  } catch {
    return null;
  }
}

async function loadParser() {
  const r = await build({
    entryPoints: [PARSER_TS],
    bundle: true,
    format: "esm",
    write: false,
    platform: "node",
    logLevel: "silent",
  });
  return import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
}

// ---------------------------------------------------------------------------
// Segment builders
// ---------------------------------------------------------------------------

function buildLessonSegments(lesson, lessonAssets, titleInfo) {
  const segs = [];
  const clipDur = (file) => {
    if (!file) return null;
    const d = ffprobeDuration(path.join(lessonAssets, file));
    if (d == null) console.warn(`  ! missing clip: ${file}`);
    return d;
  };

  const activities = lesson.activities.filter((a) => a.type !== "GRAMMAR" && a.type !== "CHAT");
  const skipped = lesson.activities.length - activities.length;
  if (skipped) console.log(`  (skipping ${skipped} GRAMMAR/CHAT activities)`);

  segs.push({ kind: "TITLE", durationSec: T.title, title: titleInfo.title, subtitle: titleInfo.subtitle });

  activities.forEach((act, actIdx) => {
    const actMeta = { actType: act.type, actTitle: act.title, actIndex: actIdx + 1, actCount: activities.length };

    segs.push({
      kind: "ACTIVITY_INTRO",
      ...actMeta,
      introEn: act.intro || null,
      instructionEn: act.instruction ?? null,
      durationSec: clamp(4, 2.5 + ((act.intro || "").length + (act.instruction || "").length) * 0.05, 13),
    });

    if (act.type === "DIALOGUE") {
      act.lines.forEach((line, i) => {
        const cDur = clipDur(line.audio);
        const vocab = (line.vocab || []).map((v) => ({ en: v.word }));
        const clipAt = T.preRoll + vocab.length * T.vocabPerWord;
        const body = cDur != null ? cDur : readTime(line.text);
        const repeat = !!act.repeat;
        const repeatAt = clipAt + body + T.repeatGap;
        const durationSec = repeat ? repeatAt + body + 0.5 : clipAt + body + T.afterLine;
        segs.push({
          kind: "DIALOGUE_LINE",
          ...actMeta,
          itemNo: i + 1,
          itemCount: act.lines.length,
          speaker: line.speaker,
          en: line.text,
          image: line.image || act.image,
          vocab,
          clip: line.audio,
          clipDur: cDur,
          clipAt,
          repeat,
          repeatAt: repeat ? repeatAt : null,
          repeatDur: repeat ? body : null,
          durationSec,
        });
      });
    } else if (act.type === "SELECT") {
      act.items.forEach((item, i) => {
        const options = (item.options && item.options.length ? item.options : act.options).map((o) => ({
          id: o.id,
          textEn: o.text,
          image: o.image,
          clip: o.audio,
          clipDur: clipDur(o.audio),
        }));
        const cDur = clipDur(item.audio);
        const clipAt = T.preRoll;
        const promptDur = cDur != null ? cDur : readTime(item.prompt || item.template);
        // EXAMPLE items demonstrate themselves (like the app's auto-answer):
        // no thinking window, the answer reveals right after the prompt.
        const revealAt = clipAt + promptDur + (item.isExample ? 0.9 : T.think);
        const answerOpt = options.find((o) => item.answer.includes(o.id));
        const answerClipDur = answerOpt?.clipDur || 0;
        const answerClipAt = revealAt + T.revealGap;
        const tail = item.feedback ? Math.max(T.feedbackMin, readTime(item.feedback)) : T.afterReveal;
        segs.push({
          kind: "SELECT_ITEM",
          ...actMeta,
          itemNo: i + 1,
          itemCount: act.items.length,
          promptEn: item.prompt,
          templateEn: item.template,
          // Hidden-prompt default applies only when a clip carries the content
          // (a clip-less hidden prompt would leave the card empty).
          audioOnly: !act.showPrompt && item.audio != null,
          image: item.promptImage || act.image,
          clip: item.audio,
          clipDur: cDur,
          clipAt,
          options,
          answer: item.answer,
          revealAt,
          answerClipAt: answerClipDur ? answerClipAt : null,
          feedbackEn: item.feedback,
          isExample: !!item.isExample,
          durationSec: answerClipAt + answerClipDur + tail,
        });
      });
    } else if (act.type === "PRODUCE") {
      act.items.forEach((item, i) => {
        const cDur = clipDur(item.audio);
        const rDur = clipDur(item.responseAudio);
        // Give the learner time to READ the template before the prompt audio
        // starts (and before the example's prompt text appears).
        const clipAt = T.preRoll + (item.template ? readTime(item.template) : 0);
        const promptDur = cDur != null ? cDur : readTime(item.prompt || item.template);
        const think = item.isExample ? 0.9 : Math.max(T.produceThinkMin, rDur || 0);
        const revealAt = clipAt + promptDur + think;
        const responseClipAt = revealAt + T.revealGap;
        const responseDur = item.response != null ? (rDur != null ? rDur : readTime(item.response)) : 0;
        segs.push({
          kind: "PRODUCE_ITEM",
          ...actMeta,
          itemNo: i + 1,
          itemCount: act.items.length,
          templateEn: item.template,
          promptEn: item.prompt,
          // Same hidden-prompt default as SELECT (dictation etc.): the spoken
          // stimulus stays "listen only" until the reveal.
          audioOnly: !act.showPrompt && item.audio != null,
          image: item.promptImage || act.image,
          clip: item.audio,
          clipDur: cDur,
          clipAt,
          responseEn: item.response,
          responseClip: item.responseAudio,
          responseClipDur: rDur,
          revealAt,
          responseClipAt: item.response != null ? responseClipAt : null,
          isExample: !!item.isExample,
          durationSec: revealAt + T.revealGap + responseDur + T.produceTail,
        });
      });
    }
  });

  segs.push({ kind: "LESSON_END", durationSec: T.lessonEnd, title: titleInfo.title });
  return segs;
}

// ---------------------------------------------------------------------------
// Translation (RU) — cached by English string
// ---------------------------------------------------------------------------

const SYSTEM = `You translate on-screen text from an English language course (the American Language Course) into Russian, for Russian-speaking learners following along in a video.
Rules:
- Translate the MEANING into natural, idiomatic Russian.
- Keep instructional tone (imperatives stay imperative).
- Preserve numbers and proper nouns (transliterate names commonly: John -> Джон).
- Keep cloze gaps "____" exactly as-is.
- Single vocabulary words get their dictionary translation.
- Return ONLY a JSON array of strings, same length and order as the input array.`;

async function translateAll(lessons) {
  // Collect every EN string used on screen.
  const fields = [
    ["title"], ["subtitle"], ["actTitle"], ["introEn", "introRu"], ["instructionEn", "instructionRu"],
    ["en", "ru"], ["promptEn", "promptRu"], ["templateEn", "templateRu"],
    ["responseEn", "responseRu"], ["feedbackEn", "feedbackRu"],
  ];
  const cache = fs.existsSync(RU_CACHE) ? JSON.parse(fs.readFileSync(RU_CACHE, "utf8")) : {};
  const needed = new Set();

  const collect = (s) => {
    if (s && typeof s === "string" && !cache[s]) needed.add(s);
  };
  for (const lesson of lessons) {
    for (const seg of lesson.segments) {
      collect(seg.title); collect(seg.actTitle); collect(seg.introEn); collect(seg.instructionEn);
      collect(seg.en); collect(seg.promptEn); collect(seg.templateEn);
      collect(seg.responseEn); collect(seg.feedbackEn);
      for (const v of seg.vocab || []) collect(v.en);
      for (const o of seg.options || []) collect(o.textEn);
    }
  }

  const todo = [...needed];
  if (todo.length) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not set");
    const genai = new GoogleGenAI({ apiKey });
    console.log(`Translating ${todo.length} strings via ${MODEL}...`);
    const BATCH = 40;
    for (let i = 0; i < todo.length; i += BATCH) {
      const slice = todo.slice(i, i + BATCH);
      let ru;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const resp = await genai.models.generateContent({
            model: MODEL,
            contents: [{ parts: [{ text: `${SYSTEM}\n\nInput JSON array:\n${JSON.stringify(slice)}` }] }],
            config: { responseMimeType: "application/json", temperature: 0.2 },
          });
          const text = resp.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
          const arr = JSON.parse(text);
          if (!Array.isArray(arr) || arr.length !== slice.length) throw new Error("length mismatch");
          ru = arr.map(String);
          break;
        } catch (err) {
          console.warn(`  batch attempt ${attempt} failed: ${err.message}`);
          if (attempt === 3) throw err;
          await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
      }
      slice.forEach((en, j) => (cache[en] = ru[j]));
      console.log(`  ${Math.min(i + BATCH, todo.length)}/${todo.length}`);
    }
    fs.mkdirSync(path.dirname(RU_CACHE), { recursive: true });
    fs.writeFileSync(RU_CACHE, JSON.stringify(cache, null, 2));
  } else {
    console.log("All strings already in ru-cache.");
  }

  // Fill ru fields.
  const ru = (s) => (s ? cache[s] || null : null);
  for (const lesson of lessons) {
    for (const seg of lesson.segments) {
      seg.titleRu = ru(seg.title) ?? undefined;
      seg.actTitleRu = ru(seg.actTitle);
      seg.introRu = ru(seg.introEn);
      seg.instructionRu = ru(seg.instructionEn);
      seg.ru = ru(seg.en);
      seg.promptRu = ru(seg.promptEn);
      seg.templateRu = ru(seg.templateEn);
      seg.responseRu = ru(seg.responseEn);
      seg.feedbackRu = ru(seg.feedbackEn);
      for (const v of seg.vocab || []) v.ru = ru(v.en);
      for (const o of seg.options || []) o.textRu = ru(o.textEn);
    }
  }
}

// ---------------------------------------------------------------------------
// Intro TTS (Gemini) — voice the activity INTRO lines, cached by text hash
// ---------------------------------------------------------------------------

const TTS_CACHE_DIR = path.join(ROOT, "data/tts-cache");
const TTS_MODEL = "gemini-3.1-flash-tts-preview";
const TTS_VOICE = "aoede";
const DEFAULT_TTS_STYLE = "Read the text in a clear, friendly narrator voice, at a calm teaching pace.";

async function ttsToMp3(genai, text, outPath, voice = TTS_VOICE, style = DEFAULT_TTS_STYLE) {
  const resp = await genai.models.generateContent({
    model: TTS_MODEL,
    systemInstruction: { parts: [{ text: style }] },
    contents: [{ role: "user", parts: [{ text }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: { languageCode: "en-US", voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  });
  const parts = resp?.candidates?.[0]?.content?.parts ?? [];
  const inline = parts.find((p) => (p.inlineData?.mimeType || "").startsWith("audio/"))?.inlineData;
  if (!inline) throw new Error("TTS response missing audio");
  const pcm = Buffer.from(inline.data, "base64");
  const rate = /rate=(\d+)/.exec(inline.mimeType || "")?.[1] || "24000";
  const tmp = outPath + ".pcm";
  fs.writeFileSync(tmp, pcm);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "s16le", "-ar", rate, "-ac", "1", "-i", tmp, outPath], { stdio: "pipe" });
  fs.unlinkSync(tmp);
}

// ---------------------------------------------------------------------------
// Content TTS (--story): voice every clip-less line / prompt / response with
// the module's VOICE config (per-speaker voices + style prompts), cached by
// (voice|style|text) hash. Mutates the parsed activities so the generated
// files flow through the normal clip plumbing (ffprobe timings, tick, etc.).
// ---------------------------------------------------------------------------

async function generateContentTTS(genai, mod, lesson, destDir) {
  const vc = mod.voiceConfig || { default: null, prompt: null, response: null, speakers: {} };
  const speakerOf = (name) => {
    if (!name) return null;
    const s = vc.speakers || {};
    return s[name] ?? Object.entries(s).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1] ?? null;
  };
  const styleFor = (spec, fallback) =>
    spec?.prompt ? `Speak as: ${spec.prompt}. Natural pace for a language course; speak ONLY the given text.` : fallback;

  let made = 0, cached = 0, failed = 0;
  const voiceText = async (text, spec, { required = true } = {}) => {
    if (!text || !text.trim()) return null;
    const voice = spec?.voice || vc.default?.voice || TTS_VOICE;
    const style = styleFor(spec ?? vc.default, DEFAULT_TTS_STYLE);
    const hash = crypto.createHash("sha1").update(`${voice}|${style}|${text}`).digest("hex").slice(0, 12);
    const cacheFile = path.join(TTS_CACHE_DIR, `${hash}.mp3`);
    if (!fs.existsSync(cacheFile)) {
      try {
        await ttsToMp3(genai, text, cacheFile, voice, style);
        made++;
      } catch (e) {
        if (required) failed++;
        console.warn(`  ! TTS ${required ? "failed" : "skipped"} (${voice}): ${String(text).slice(0, 40)}… — ${e.message}`);
        return null;
      }
    } else {
      cached++;
    }
    const file = `tts-${hash}.mp3`;
    fs.copyFileSync(cacheFile, path.join(destDir, file));
    return file;
  };

  fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });
  for (const act of lesson.activities) {
    if (act.type === "DIALOGUE") {
      for (const line of act.lines) {
        if (!line.audio) line.audio = await voiceText(line.text, speakerOf(line.speaker) ?? vc.default);
      }
    } else if (act.type === "SELECT") {
      for (const item of act.items) {
        if (!item.audio && item.prompt) item.audio = await voiceText(item.prompt, vc.prompt ?? vc.default);
        // Voice the correct option (the video plays it after the reveal,
        // like the app's tap-TTS). Optional: phonetic labels like "/d/ sound"
        // can legitimately fail.
        const options = item.options && item.options.length ? item.options : act.options;
        for (const o of options) {
          if (!o.audio && o.text && item.answer.includes(o.id)) o.audio = await voiceText(o.text, vc.response ?? vc.default, { required: false });
        }
      }
    } else if (act.type === "PRODUCE") {
      for (const item of act.items) {
        if (!item.audio && item.prompt) item.audio = await voiceText(item.prompt, vc.prompt ?? vc.default);
        if (!item.responseAudio && item.response) item.responseAudio = await voiceText(item.response, vc.response ?? vc.default);
      }
    }
  }
  console.log(`  content TTS: ${made} generated, ${cached} cached${failed ? `, ${failed} FAILED` : ""}`);
  if (failed) throw new Error(`${failed} TTS generations failed — rerun to retry (successes are cached)`);
}

async function generateIntroTTS(genai, lessons) {
  fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });
  let made = 0, cached = 0;
  for (const lesson of lessons) {
    for (const seg of lesson.segments) {
      if (seg.kind !== "ACTIVITY_INTRO" || !seg.introEn) continue;
      const hash = crypto.createHash("sha1").update(`${TTS_VOICE}|${seg.introEn}`).digest("hex").slice(0, 12);
      const cacheFile = path.join(TTS_CACHE_DIR, `${hash}.mp3`);
      if (!fs.existsSync(cacheFile)) {
        try {
          await ttsToMp3(genai, seg.introEn, cacheFile);
          made++;
        } catch (e) {
          console.warn(`  ! intro TTS failed (${seg.actTitle}): ${e.message}`);
          continue;
        }
      } else {
        cached++;
      }
      const file = `tts-intro-${hash}.mp3`;
      fs.copyFileSync(cacheFile, path.join(PUBLIC_MODULES, lesson.id, file));
      const dur = ffprobeDuration(cacheFile);
      seg.introClip = file;
      seg.introClipDur = dur;
      // The intro card must stay up while the narrator speaks.
      if (dur != null) seg.durationSec = Math.max(seg.durationSec, 0.6 + dur + 1.2);
    }
    lesson.durationSec = lesson.segments.reduce((s, x) => s + x.durationSec, 0);
  }
  console.log(`Intro TTS: ${made} generated, ${cached} cached`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const storyMode = args.includes("--story");
  let codes;
  if (args.includes("--all")) {
    codes = fs.readdirSync(MODULE_DIR).filter((f) => f.endsWith(".module")).map((f) => f.match(/lesson-(\w+)\.module/)?.[1]).filter(Boolean);
  } else {
    codes = args.filter((a) => /^\d+[A-D]$/i.test(a)).map((s) => s.toUpperCase());
  }
  if (!codes.length && !storyMode) {
    console.error("Usage: node scripts/build-module-manifest.mjs <1A> [2A ...] | --all | --story");
    process.exit(1);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  const genai = new GoogleGenAI({ apiKey });

  const parser = await loadParser();
  const lessons = [];

  if (storyMode) {
    // One module file, several $LESSONs, no cassette clips — everything is
    // voiced here with the module's VOICE config.
    const mod = parser.parseModuleFile(fs.readFileSync(STORY_MODULE, "utf8"));
    for (const lesson of mod.lessons) {
      const code = "S" + (lesson.title.match(/^(\d+[A-Z])/)?.[1] || String(mod.lessons.indexOf(lesson) + 1));
      console.log(`\n=== Story ${code} — ${lesson.title} ===`);

      // Assets first (images from the staged repo clone), then TTS into the
      // same folder so the normal clip plumbing measures it.
      const dest = path.join(PUBLIC_MODULES, code);
      fs.mkdirSync(dest, { recursive: true });
      let copied = 0;
      for (const f of fs.readdirSync(STORY_ASSETS)) {
        fs.copyFileSync(path.join(STORY_ASSETS, f), path.join(dest, f));
        copied++;
      }
      console.log(`  copied ${copied} assets -> public/modules/${code}/`);

      await generateContentTTS(genai, mod, lesson, dest);

      const segments = buildLessonSegments(lesson, dest, { title: lesson.title, subtitle: mod.title });
      const durationSec = segments.reduce((s, x) => s + x.durationSec, 0);
      console.log(`  ${segments.length} segments, ${(durationSec / 60).toFixed(1)} min`);
      lessons.push({ id: code, title: lesson.title, durationSec, segments });
    }
  }

  for (const code of codes) {
    const file = path.join(MODULE_DIR, `lesson-${code}.module`);
    if (!fs.existsSync(file)) {
      console.warn(`skip ${code}: ${file} not found`);
      continue;
    }
    console.log(`\n=== Lesson ${code} ===`);
    const mod = parser.parseModuleFile(fs.readFileSync(file, "utf8"));
    const assetsDir = path.join(MODULE_DIR, `lesson-${code}`);
    const segments = buildLessonSegments(mod.lessons[0], assetsDir, { title: mod.title, subtitle: mod.description || "American Language Course" });
    const durationSec = segments.reduce((s, x) => s + x.durationSec, 0);
    console.log(`  ${segments.length} segments, ${(durationSec / 60).toFixed(1)} min`);
    lessons.push({ id: code, title: mod.title, durationSec, segments });

    // Copy assets to public/modules/<code>/
    const dest = path.join(PUBLIC_MODULES, code);
    fs.mkdirSync(dest, { recursive: true });
    let copied = 0;
    if (fs.existsSync(assetsDir)) {
      for (const f of fs.readdirSync(assetsDir)) {
        fs.copyFileSync(path.join(assetsDir, f), path.join(dest, f));
        copied++;
      }
    }
    console.log(`  copied ${copied} assets -> public/modules/${code}/`);
  }

  await translateAll(lessons);

  await generateIntroTTS(genai, lessons);

  const manifest = { generatedAt: new Date().toISOString(), fps: FPS, width: WIDTH, height: HEIGHT, lessons };
  fs.writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`\nWrote ${OUT_MANIFEST}`);
  for (const l of lessons) console.log(`  Module-${l.id}: ${(l.durationSec / 60).toFixed(1)} min`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
