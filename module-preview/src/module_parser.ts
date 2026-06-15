// AUTO-SYNCED COPY — DO NOT EDIT.
// Canonical source: reactor-module-tools/module-parser/module_parser.ts
// To update: edit the canonical file, then run `node module-parser/sync.mjs`.

/**
 * CANONICAL parser for .module and .course files — FORMAT v2.
 *
 * This file is synced verbatim to:
 *   - reactor-module-tools/module-preview/src/module_parser.ts
 *   - lr-cursor-extension/src/parser/module_parser.ts
 *   - dioco-base/src/modules/module_parser.ts
 * Edit it HERE and run `node module-parser/sync.mjs`.
 *
 * Markers: $MODULE $LESSON $DIALOGUE $GRAMMAR $SELECT $PRODUCE $CHAT
 * Flags (no colon): REPEAT, SHOW_PROMPT, MULTI, EXAMPLE
 * Spoken PROMPT text is hidden until answered/revealed by DEFAULT (a PROMPT is
 * normally tape-only); SHOW_PROMPT shows it from the start (book printed it).
 * Assets: inline trailing `{file}` tokens on content lines, routed by extension —
 *   image ({page.jpg}) and audio ({clip.mp3}, drafts: {clip.mp3@start-end}).
 *   Convention: image first, audio LAST on the line.
 * Dialogue speakers are screenplay-style: `Jim: Hello.` (id must contain a
 * lowercase letter — ALL-CAPS identifiers are reserved for fields). A bare
 * `LINE:` continues the current speaker.
 * Modules are monolingual (no *_T fields); translations are added downstream.
 * Header: FORMAT: 2 declares the format version (HOME_LANG_G preferred,
 * USER_LANG_G legacy).
 */

import {
  Course,
  Module,
  ModuleVoiceConfig,
  LessonContent,
  Activity,
  DialogueActivity,
  DialogueLine,
  GrammarActivity,
  SelectActivity,
  SelectOption,
  SelectItem,
  ProduceActivity,
  ProduceItem,
  ProduceInput,
  ProduceCheck,
  ChatActivity,
  VocabItem,
  langCode_G_t,
} from "./module_types";

const log = {
  e: (...args: unknown[]) => console.error("[MODULE_PARSER]", ...args),
  w: (...args: unknown[]) => console.warn("[MODULE_PARSER]", ...args),
};

// =============================================================================
// COURSE PARSER
// =============================================================================

export function parseCourseFile(content: string): Course {
  const lines = content.split("\n");
  const result: Partial<Course> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed === "$COURSE") continue;

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex > 0) {
      const field = trimmed.slice(0, colonIndex).trim();
      const value = trimmed.slice(colonIndex + 1).trim();
      switch (field) {
        case "DIOCO_PLAYLIST_ID":
          result.diocoPlaylistId = value;
          break;
        case "TITLE":
          result.title = value;
          break;
        case "DESCRIPTION":
          result.description = value;
          break;
        case "IMAGE":
          result.image = value;
          break;
        case "TARGET_LANG_G":
          result.targetLang_G = value as langCode_G_t;
          break;
        case "HOME_LANG_G":
        case "USER_LANG_G":
          result.homeLang_G = value as langCode_G_t;
          break;
      }
    }
  }

  if (!result.diocoPlaylistId) throw new Error("Missing DIOCO_PLAYLIST_ID in .course file");
  if (!result.title) throw new Error("Missing TITLE in .course file");
  if (!result.targetLang_G) throw new Error("Missing TARGET_LANG_G in .course file");
  if (!result.homeLang_G) throw new Error("Missing HOME_LANG_G in .course file");

  return {
    diocoDocId: "",
    diocoPlaylistId: result.diocoPlaylistId,
    title: result.title,
    description: result.description || "",
    image: result.image || null,
    targetLang_G: result.targetLang_G,
    homeLang_G: result.homeLang_G,
  };
}

// =============================================================================
// MODULE PARSER
// =============================================================================

interface ParserState {
  module: Partial<Module>;
  voiceConfig: ModuleVoiceConfig;
  currentLesson: LessonContent | null;
  currentActivity: Partial<Activity> | null;
  buffer: string[];
}

const FLAGS = new Set(["REPEAT", "SHOW_PROMPT", "MULTI", "EXAMPLE"]);

export function parseModuleFile(content: string): Module {
  const lines = content.split("\n");
  const state: ParserState = {
    module: { lessons: [], formatVersion: 2 },
    voiceConfig: { default: null, prompt: null, response: null, introVoice: null, speakers: {} },
    currentLesson: null,
    currentActivity: null,
    buffer: [],
  };

  let lineNum = 0;
  for (const line of lines) {
    lineNum++;
    try {
      processLine(line, state);
    } catch (e) {
      log.e(`Parse error at line ${lineNum}:`, e);
      throw new Error(`Parse error at line ${lineNum}: ${e}`);
    }
  }

  finalizeActivity(state);
  finalizeLesson(state);

  const mod = state.module;
  if (!mod.title) throw new Error("Missing TITLE in .module file");
  if (!mod.targetLang_G) throw new Error("Missing TARGET_LANG_G in .module file");
  if (!mod.homeLang_G) throw new Error("Missing HOME_LANG_G in .module file");

  return {
    moduleKey: (mod as any).diocoDocId || (mod as any).moduleKey || "",
    title: mod.title,
    description: mod.description || null,
    image: mod.image || null,
    targetLang_G: mod.targetLang_G,
    homeLang_G: mod.homeLang_G,
    voiceConfig: state.voiceConfig,
    ttsPrompt: (mod as any).ttsPrompt ?? null,
    lessons: mod.lessons || [],
    formatVersion: 2,
  };
}

function processLine(line: string, state: ParserState): void {
  const trimmed = line.trimEnd();
  const t = trimmed.trimStart();

  if (t.startsWith("#")) return; // comment
  if (t === "") {
    // Preserve blank lines only inside GRAMMAR content
    if (state.currentActivity?.type === "GRAMMAR") state.buffer.push("");
    return;
  }
  if (trimmed.startsWith("$")) {
    handleSectionMarker(trimmed, state);
    return;
  }
  if (FLAGS.has(t)) {
    handleFlag(t, state);
    return;
  }
  const fieldMatch = trimmed.match(/^([A-Z_]+):\s*(.*)?$/);
  if (fieldMatch) {
    handleField(fieldMatch[1], fieldMatch[2] || "", state);
    return;
  }
  if (state.currentActivity) state.buffer.push(line);
}

function handleFlag(flag: string, state: ParserState): void {
  const a = state.currentActivity;
  if (!a) return;
  if (flag === "REPEAT" && (a.type === "DIALOGUE" || a.type === "SELECT" || a.type === "PRODUCE")) {
    (a as DialogueActivity | SelectActivity | ProduceActivity).repeat = true;
  } else if (flag === "SHOW_PROMPT" && (a.type === "SELECT" || a.type === "PRODUCE")) (a as SelectActivity | ProduceActivity).showPrompt = true;
  else if (flag === "MULTI" && a.type === "SELECT") (a as SelectActivity).multi = true;
  else if (flag === "EXAMPLE") state.buffer.push("EXAMPLE");
}

function handleSectionMarker(line: string, state: ParserState): void {
  const match = line.match(/^\$(\w+)(?:\s+(.*))?$/);
  if (!match) return;
  const [, marker, rawTitle] = match;
  // A trailing `{image}` on a marker's title line is the block-scoped image
  // (the module cover, or an activity-wide reference image). Titles never carry
  // audio, so only the image token is peeled off; the rest is the title text.
  const { text: title, image } = extractInlineAssets(rawTitle ?? "", { audio: false });

  switch (marker) {
    case "MODULE":
      if (title) state.module.title = title;
      if (image) state.module.image = image;
      break;
    case "LESSON":
      finalizeActivity(state);
      finalizeLesson(state);
      state.currentLesson = {
        id: generateId(title || "Untitled"),
        title: title || "Untitled Lesson",
        activities: [],
      };
      break;
    case "DIALOGUE":
      startActivity(state, "DIALOGUE", title || "Dialogue");
      if (image) (state.currentActivity as Partial<DialogueActivity>).image = image;
      break;
    case "GRAMMAR":
      startActivity(state, "GRAMMAR", title || "Grammar");
      break;
    case "SELECT":
      startActivity(state, "SELECT", title || "Select");
      if (image) (state.currentActivity as Partial<SelectActivity>).image = image;
      break;
    case "PRODUCE":
      startActivity(state, "PRODUCE", title || "Produce");
      if (image) (state.currentActivity as Partial<ProduceActivity>).image = image;
      break;
    case "CHAT":
      startActivity(state, "CHAT", title || "Chat");
      break;
    default:
      log.w(`Unknown section marker: $${marker}`);
  }
}

function parseVoiceSpec(value: string): { voice: string; prompt: string | null } | null {
  const m = value.match(/^([^|]+)(?:\s*\|\s*(.*))?$/);
  return m ? { voice: m[1].trim(), prompt: m[2] ? m[2].trim() : null } : null;
}

function handleField(field: string, value: string, state: ParserState): void {
  if (!state.currentActivity && !state.currentLesson) {
    switch (field) {
      case "FORMAT":
        // Declarative format-version marker (FORMAT: 2). The value is
        // validated by the linter; the parser itself is v2-only.
        return;
      case "DIOCO_DOC_ID":
        (state.module as any).diocoDocId = value;
        return;
      case "DESCRIPTION":
        state.module.description = value;
        return;
      case "TARGET_LANG_G":
        state.module.targetLang_G = value as langCode_G_t;
        return;
      case "HOME_LANG_G":
      case "USER_LANG_G":
        state.module.homeLang_G = value as langCode_G_t;
        return;
      case "TTS_PROMPT":
        (state.module as any).ttsPrompt = value;
        return;
      case "VOICE_DEFAULT":
        state.voiceConfig.default = parseVoiceSpec(value);
        return;
      case "VOICE_PROMPT":
        state.voiceConfig.prompt = parseVoiceSpec(value);
        return;
      case "VOICE_RESPONSE":
        state.voiceConfig.response = parseVoiceSpec(value);
        return;
      case "VOICE_INTRO":
        state.voiceConfig.introVoice = parseVoiceSpec(value);
        return;
      case "VOICE_SPEAKER": {
        const m = value.match(/^(.+?)\s*=\s*([^|]+)(?:\s*\|\s*(.*))?$/);
        if (m) {
          state.voiceConfig.speakers[m[1].trim()] = {
            voice: m[2].trim(),
            prompt: m[3] ? m[3].trim() : null,
          };
        }
        return;
      }
      case "VOICE": {
        const parts = value.split("|").map((s) => s.trim());
        if (parts.length >= 2) {
          state.voiceConfig.speakers[parts[0]] = {
            voice: parts[1],
            prompt: parts.slice(2).join(" | ") || null,
            displayName: null,
          };
        }
        return;
      }
    }
  }

  const a = state.currentActivity;
  if (!a) return;

  switch (field) {
    case "INTRO":
      a.intro = value;
      return;
    case "INSTRUCTION":
      if (a.type === "DIALOGUE" || a.type === "SELECT" || a.type === "PRODUCE")
        (a as any).instruction = value;
      return;
    case "TTS_PROMPT":
      if (a.type === "DIALOGUE" || a.type === "PRODUCE") (a as any).ttsPrompt = value;
      return;
    case "INPUT":
      if (a.type === "PRODUCE") (a as ProduceActivity).input = normalizeInput(value);
      return;
    case "CHECK":
      if (a.type === "PRODUCE") (a as ProduceActivity).check = normalizeCheck(value);
      return;
    case "SCENARIO":
      if (a.type === "CHAT") (a as ChatActivity).scenario = value;
      return;
    case "INITIAL_PROMPT":
      if (a.type === "CHAT") (a as ChatActivity).initialPrompt = value;
      return;
    default:
      state.buffer.push(`${field}:${value}`);
      return;
  }
}

function normalizeInput(v: string): ProduceInput {
  const x = v.trim().toLowerCase();
  return x === "type" ? "type" : "speak";
}
function normalizeCheck(v: string): ProduceCheck {
  const x = v.trim().toLowerCase();
  return x === "exact" || x === "llm" ? (x as ProduceCheck) : "reveal";
}

function startActivity(state: ParserState, type: Activity["type"], title: string): void {
  finalizeActivity(state);
  if (!state.currentLesson) {
    state.currentLesson = { id: "default-lesson", title: "Default Lesson", activities: [] };
  }
  const base = { type, id: generateId(`${type}-${title}`), title, intro: null, introTtsDataURL: null };
  switch (type) {
    case "DIALOGUE":
      state.currentActivity = { ...base, instruction: null, ttsPrompt: null, repeat: false, image: null, lines: [] } as Partial<DialogueActivity>;
      break;
    case "GRAMMAR":
      state.currentActivity = { ...base, content: "", phrases: [] } as Partial<GrammarActivity>;
      break;
    case "SELECT":
      state.currentActivity = { ...base, instruction: null, showPrompt: false, multi: false, repeat: false, image: null, options: [], items: [] } as Partial<SelectActivity>;
      break;
    case "PRODUCE":
      state.currentActivity = { ...base, instruction: null, ttsPrompt: null, input: "speak", check: "reveal", showPrompt: false, repeat: false, image: null, items: [] } as Partial<ProduceActivity>;
      break;
    case "CHAT":
      state.currentActivity = { ...base, scenario: "", initialPrompt: "" } as Partial<ChatActivity>;
      break;
  }
  state.buffer = [];
}

function finalizeActivity(state: ParserState): void {
  if (!state.currentActivity || !state.currentLesson) return;
  const a = state.currentActivity;
  const buf = state.buffer;

  switch (a.type) {
    case "DIALOGUE": {
      const { image, lines } = parseDialogueLines(buf);
      const da = a as DialogueActivity;
      if (image && !da.image) da.image = image;
      da.lines = lines;
      break;
    }
    case "GRAMMAR":
      (a as GrammarActivity).content = buf.join("\n").trim();
      break;
    case "SELECT": {
      const { image, options, items } = parseSelect(buf);
      const sa = a as SelectActivity;
      if (image && !sa.image) sa.image = image;
      sa.options = options;
      sa.items = items;
      break;
    }
    case "PRODUCE": {
      const { image, items } = parseProduce(buf);
      const pa = a as ProduceActivity;
      if (image && !pa.image) pa.image = image;
      pa.items = items;
      break;
    }
    case "CHAT":
      break;
  }
  state.currentLesson.activities.push(a as Activity);
  state.currentActivity = null;
  state.buffer = [];
}

function finalizeLesson(state: ParserState): void {
  if (!state.currentLesson) return;
  state.module.lessons = state.module.lessons || [];
  state.module.lessons.push(state.currentLesson);
  state.currentLesson = null;
}

// =============================================================================
// CONTENT PARSERS
// =============================================================================

function pushDialogueLine(lines: DialogueLine[], cur: Partial<DialogueLine>): void {
  if (!cur.text) return;
  lines.push({
    speaker: cur.speaker || null,
    text: cur.text,
    translation: null,
    notes: cur.notes || null,
    image: cur.image || null,
    vocab: cur.vocab || null,
    audio: cur.audio || null,
    nlp: null,
    ttsDataURL: null,
  });
}

// Screenplay speaker line: `Jim: Hello.` — the id must contain a lowercase
// letter (ALL-CAPS identifiers are reserved for field names).
const SPEAKER_LINE_RE = /^([A-Za-z][A-Za-z0-9_]*):\s*(.*)$/;
function matchSpeakerLine(item: string): { speaker: string; rest: string } | null {
  const m = item.match(SPEAKER_LINE_RE);
  if (m && /[a-z]/.test(m[1])) return { speaker: m[1], rest: m[2] };
  return null;
}

function parseDialogueLines(buffer: string[]): { image: string | null; lines: DialogueLine[] } {
  const lines: DialogueLine[] = [];
  let cur: Partial<DialogueLine> = {};
  let pendingVocab: VocabItem[] = [];

  const attachVocab = () => {
    if (pendingVocab.length) {
      cur.vocab = pendingVocab;
      pendingVocab = [];
    }
  };

  const setLine = (raw: string) => {
    const { text, audio, image } = extractInlineAssets(raw);
    cur.text = text;
    cur.audio = audio;
    if (image) cur.image = image;
    attachVocab();
  };

  for (const item of buffer) {
    if (item.startsWith("VOCAB:")) {
      pendingVocab.push({ word: item.slice(6).trim(), definition: null, ttsDataURL: null });
    } else if (item.startsWith("NOTES:")) {
      cur.notes = item.slice(6).trim();
    } else if (item.startsWith("LINE:")) {
      // Bare LINE continues the current speaker.
      if (cur.text) {
        pushDialogueLine(lines, cur);
        cur = { speaker: cur.speaker };
      }
      setLine(item.slice(5));
    } else {
      const sp = matchSpeakerLine(item);
      if (sp) {
        if (cur.text) {
          pushDialogueLine(lines, cur);
          cur = {};
        }
        cur.speaker = sp.speaker;
        setLine(sp.rest);
      }
    }
  }
  pushDialogueLine(lines, cur);
  return { image: null, lines };
}

// "OPTION: a | text {page.jpg} {clip.mp3}" — text and/or inline image + audio.
function parseOption(line: string): SelectOption | null {
  const colon = line.indexOf(":");
  const parts = line.slice(colon + 1).split("|").map((s) => s.trim());
  if (parts.length < 2) return null;
  const id = parts[0];
  const val = parts.slice(1).join(" | ");
  const { text, audio, image } = extractInlineAssets(val);
  return { id, text: text || null, translation: null, image, audio, ttsDataURL: null };
}

// Merge options sharing an id (text + image + audio).
function upsertOption(list: SelectOption[], opt: SelectOption): void {
  const existing = list.find((o) => o.id === opt.id);
  if (!existing) {
    list.push(opt);
    return;
  }
  if (opt.text != null) existing.text = opt.text;
  if (opt.image != null) existing.image = opt.image;
  if (opt.audio != null) existing.audio = opt.audio;
}

function pushSelectItem(items: SelectItem[], cur: Partial<SelectItem>): void {
  if (cur.prompt == null && cur.template == null) return;
  items.push({
    prompt: cur.prompt ?? null,
    promptTranslation: null,
    promptImage: cur.promptImage || null,
    template: cur.template ?? null,
    options: cur.options && cur.options.length ? cur.options : null,
    answer: cur.answer || [],
    feedback: cur.feedback || null,
    feedbackTranslation: null,
    audio: cur.audio || null,
    isExample: cur.isExample || false,
    promptNlp: null,
    promptTtsDataURL: null,
  });
}

function parseSelect(buffer: string[]): { image: string | null; options: SelectOption[]; items: SelectItem[] } {
  const pool: SelectOption[] = [];
  const items: SelectItem[] = [];
  let cur: Partial<SelectItem> | null = null;
  let isExample = false;

  for (const item of buffer) {
    if (item === "EXAMPLE") {
      isExample = true;
    } else if (item.startsWith("OPTION:")) {
      const opt = parseOption(item);
      if (!opt) continue;
      if (!cur) upsertOption(pool, opt);
      else upsertOption((cur.options = cur.options || []), opt);
    } else if (item.startsWith("PROMPT:") || item.startsWith("TEMPLATE:")) {
      // A new stimulus starts a new item when the current one is closed (has
      // its ANSWER) or already has a stimulus of the same kind — this allows
      // PROMPT + TEMPLATE to coexist in one item.
      const kind = item.startsWith("PROMPT:") ? "prompt" : "template";
      const raw = item.slice(item.indexOf(":") + 1);
      if (cur && ((cur.answer && cur.answer.length) || (cur as any)[kind] != null)) {
        pushSelectItem(items, cur);
        cur = null;
      }
      if (!cur) {
        cur = { prompt: null, template: null, options: [], answer: [], isExample };
        isExample = false;
      }
      if (kind === "prompt") {
        const { text, audio, image } = extractInlineAssets(raw);
        cur.prompt = text;
        cur.audio = audio;
        if (image) cur.promptImage = image;
      } else {
        // TEMPLATE is display-only — it may carry an image but never audio.
        const { text, image } = extractInlineAssets(raw, { audio: false });
        cur.template = text;
        if (image && !cur.promptImage) cur.promptImage = image;
      }
    } else if (item.startsWith("ANSWER:")) {
      if (cur) cur.answer = item.slice(7).split(",").map((s) => s.trim()).filter(Boolean);
    } else if (item.startsWith("FEEDBACK:")) {
      if (cur) cur.feedback = item.slice(9).trim();
    }
  }
  if (cur) pushSelectItem(items, cur);
  return { image: null, options: pool, items };
}

function pushProduceItem(items: ProduceItem[], cur: Partial<ProduceItem>): void {
  if (cur.prompt == null && cur.template == null) return;
  items.push({
    prompt: cur.prompt ?? null,
    promptTranslation: null,
    promptImage: cur.promptImage || null,
    template: cur.template ?? null,
    audio: cur.audio || null,
    response: cur.response ?? null,
    responseTranslation: null,
    responseAudio: cur.responseAudio || null,
    accept: cur.accept || null,
    rubric: cur.rubric || null,
    isExample: cur.isExample || false,
    promptNlp: null,
    responseNlp: null,
    promptTtsDataURL: null,
    responseTtsDataURL: null,
  });
}

function parseProduce(buffer: string[]): { image: string | null; items: ProduceItem[] } {
  const items: ProduceItem[] = [];
  let cur: Partial<ProduceItem> | null = null;
  let isExample = false;

  for (const item of buffer) {
    if (item === "EXAMPLE") {
      isExample = true;
      continue;
    }
    // A new stimulus starts a new item when the current item is already
    // "closed" (has a response) or already has a stimulus of the same kind.
    // This supports consecutive open-ended items AND prompt+template in one item.
    if (item.startsWith("PROMPT:") || item.startsWith("TEMPLATE:")) {
      const kind = item.startsWith("PROMPT:") ? "prompt" : "template";
      const raw = item.slice(item.indexOf(":") + 1);
      if (cur && (cur.response != null || (cur as any)[kind] != null)) {
        pushProduceItem(items, cur);
        cur = null;
      }
      if (!cur) {
        cur = { isExample };
        isExample = false;
      }
      if (kind === "prompt") {
        const { text, audio, image } = extractInlineAssets(raw);
        cur.prompt = text;
        if (audio) cur.audio = audio;
        if (image) cur.promptImage = image;
      } else {
        // TEMPLATE is display-only — it may carry an image but never audio.
        const { text, image } = extractInlineAssets(raw, { audio: false });
        cur.template = text;
        if (image && !cur.promptImage) cur.promptImage = image;
      }
      continue;
    }

    if (!cur) continue;
    if (item.startsWith("RESPONSE:")) {
      const { text, audio } = extractInlineAssets(item.slice(9), { image: false });
      cur.response = text;
      if (audio) cur.responseAudio = audio;
    } else if (item.startsWith("ACCEPT:")) cur.accept = item.slice(7).split("|").map((s) => s.trim()).filter(Boolean);
    else if (item.startsWith("RUBRIC:")) cur.rubric = item.slice(7).trim();
  }
  if (cur) pushProduceItem(items, cur);
  return { image: null, items };
}

// =============================================================================
// HELPERS
// =============================================================================

function generateId(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Inline assets: trailing `{file}` tokens on a content line, routed by file
// extension — `{page.jpg}` = image, `{clip.mp3}` = audio (drafts carry
// `{clip.mp3@start-end}` timing). Tokens are peeled off the END of the line;
// at most one of each kind (duplicates stay in the text — the linter flags them).
export const AUDIO_EXT_RE = /\.(?:mp3|wav|ogg|opus|m4a)$/i;
export const IMAGE_EXT_RE = /\.(?:jpe?g|png|gif|webp|svg)$/i;

export interface InlineAssets {
  text: string;
  audio: string | null;
  image: string | null;
}

export function extractInlineAssets(value: string, allow: { audio?: boolean; image?: boolean } = {}): InlineAssets {
  const allowAudio = allow.audio !== false;
  const allowImage = allow.image !== false;
  let text = value.trim();
  let audio: string | null = null;
  let image: string | null = null;
  for (;;) {
    const m = text.match(/^(.*?)\s*\{\s*([^{}]+?)\s*\}$/);
    if (!m) break;
    const file = m[2].split("@")[0].trim(); // drop any @start-end timing
    if (allowAudio && audio === null && AUDIO_EXT_RE.test(file)) {
      audio = file;
      text = m[1].trim();
      continue;
    }
    if (allowImage && image === null && IMAGE_EXT_RE.test(file)) {
      image = file;
      text = m[1].trim();
      continue;
    }
    break; // unknown kind, disallowed kind, or duplicate — leave in text
  }
  return { text, audio, image };
}
