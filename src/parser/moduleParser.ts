/**
 * Parser for .module and .course files (format v2).
 *
 * Markers: $MODULE $LESSON $DIALOGUE $GRAMMAR $SELECT $PRODUCE $CHAT
 * Flags (no colon): REPEAT, AUDIO_ONLY, MULTI, EXAMPLE
 * Modules are monolingual (no *_T fields); translations are added downstream.
 *
 * Note: HOME_LANG_G (preferred) and USER_LANG_G (legacy) are both supported.
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
} from "./types";
import { langCode_G_t } from "./lang";

const log = {
  e: (...args: any[]) => console.error("[LC_PARSER]", ...args),
  w: (...args: any[]) => console.warn("[LC_PARSER]", ...args),
  d: (..._args: any[]) => {},
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

  if (!result.diocoPlaylistId)
    throw new Error("Missing DIOCO_PLAYLIST_ID in .course file");
  if (!result.title) throw new Error("Missing TITLE in .course file");
  if (!result.targetLang_G)
    throw new Error("Missing TARGET_LANG_G in .course file");
  if (!result.homeLang_G)
    throw new Error("Missing HOME_LANG_G in .course file");

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

const FLAGS = new Set(["REPEAT", "AUDIO_ONLY", "MULTI", "EXAMPLE"]);

export function parseModuleFile(content: string): Module {
  const lines = content.split("\n");
  const state: ParserState = {
    module: { lessons: [] },
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
      log.e("Parse error at line %d: %s", lineNum, e);
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
  };
}

function processLine(line: string, state: ParserState): void {
  const trimmed = line.trimEnd();
  const t = trimmed.trimStart();

  if (t.startsWith("#")) return;
  if (t === "") {
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
  if (flag === "REPEAT" && a.type === "DIALOGUE") (a as DialogueActivity).repeat = true;
  else if (flag === "AUDIO_ONLY" && (a.type === "SELECT" || a.type === "PRODUCE"))
    (a as SelectActivity | ProduceActivity).audioOnly = true;
  else if (flag === "MULTI" && a.type === "SELECT") (a as SelectActivity).multi = true;
  else if (flag === "EXAMPLE") state.buffer.push("EXAMPLE");
}

function handleSectionMarker(line: string, state: ParserState): void {
  const match = line.match(/^\$(\w+)(?:\s+(.*))?$/);
  if (!match) return;
  const [, marker, title] = match;

  switch (marker) {
    case "MODULE":
      break;
    case "LESSON":
      finalizeActivity(state);
      finalizeLesson(state);
      state.currentLesson = {
        id: generateLessonId(title || "Untitled"),
        title: title || "Untitled Lesson",
        activities: [],
      };
      break;
    case "DIALOGUE":
      startActivity(state, "DIALOGUE", title || "Dialogue");
      break;
    case "GRAMMAR":
      startActivity(state, "GRAMMAR", title || "Grammar");
      break;
    case "SELECT":
      startActivity(state, "SELECT", title || "Select");
      break;
    case "PRODUCE":
      startActivity(state, "PRODUCE", title || "Produce");
      break;
    case "CHAT":
      startActivity(state, "CHAT", title || "Chat");
      break;
    default:
      log.w("Unknown section marker: $%s", marker);
  }
}

function parseVoiceSpec(value: string): { voice: string; prompt: string | null } | null {
  const m = value.match(/^([^|]+)(?:\s*\|\s*(.*))?$/);
  return m ? { voice: m[1].trim(), prompt: m[2] ? m[2].trim() : null } : null;
}

function handleField(field: string, value: string, state: ParserState): void {
  if (!state.currentActivity && !state.currentLesson) {
    switch (field) {
      case "DIOCO_DOC_ID":
        (state.module as any).diocoDocId = value;
        return;
      case "TITLE":
        state.module.title = value;
        return;
      case "DESCRIPTION":
        state.module.description = value;
        return;
      case "IMAGE":
        state.module.image = value;
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
  return x === "type" || x === "either" ? (x as ProduceInput) : "speak";
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
  const base = { type, id: generateActivityId(type, title), title, intro: null };
  switch (type) {
    case "DIALOGUE":
      state.currentActivity = { ...base, instruction: null, ttsPrompt: null, repeat: false, lines: [] } as Partial<DialogueActivity>;
      break;
    case "GRAMMAR":
      state.currentActivity = { ...base, content: "" } as Partial<GrammarActivity>;
      break;
    case "SELECT":
      state.currentActivity = { ...base, instruction: null, audioOnly: false, multi: false, image: null, options: [], items: [] } as Partial<SelectActivity>;
      break;
    case "PRODUCE":
      state.currentActivity = { ...base, instruction: null, ttsPrompt: null, input: "speak", check: "reveal", audioOnly: false, items: [] } as Partial<ProduceActivity>;
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
    case "DIALOGUE":
      (a as DialogueActivity).lines = parseDialogueLines(buf);
      break;
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
    case "PRODUCE":
      (a as ProduceActivity).items = parseProduce(buf);
      break;
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

// Audio values are bare filenames; defensively strip any leaked timing suffix.
function audioName(v: string): string {
  return v.split("|")[0].trim();
}

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
  });
}

function parseDialogueLines(buffer: string[]): DialogueLine[] {
  const lines: DialogueLine[] = [];
  let cur: Partial<DialogueLine> = {};
  let pendingVocab: { word: string; definition: string | null }[] = [];

  const attachVocab = () => {
    if (pendingVocab.length) {
      cur.vocab = pendingVocab;
      pendingVocab = [];
    }
  };

  for (const item of buffer) {
    if (item.startsWith("VOCAB:")) {
      pendingVocab.push({ word: item.slice(6).trim(), definition: null });
    } else if (item.startsWith("IMAGE:")) {
      cur.image = item.slice(6).trim();
    } else if (item.startsWith("AUDIO:")) {
      cur.audio = audioName(item.slice(6));
    } else if (item.startsWith("NOTES:")) {
      cur.notes = item.slice(6).trim();
    } else if (item.startsWith("SPEAKER:")) {
      if (cur.text) {
        pushDialogueLine(lines, cur);
        cur = {};
      }
      cur.speaker = item.slice(8).trim();
      attachVocab();
    } else if (item.startsWith("LINE:")) {
      if (cur.text) {
        pushDialogueLine(lines, cur);
        cur = { speaker: cur.speaker };
      }
      cur.text = item.slice(5).trim();
      attachVocab();
    }
  }
  pushDialogueLine(lines, cur);
  return lines;
}

function parseOption(line: string, isImage: boolean): SelectOption | null {
  const body = line.slice(line.indexOf(":") + 1);
  const parts = body.split("|").map((s) => s.trim());
  if (parts.length < 2) return null;
  const id = parts[0];
  const val = parts.slice(1).join(" | ");
  return isImage
    ? { id, text: null, translation: null, image: val }
    : { id, text: val, translation: null, image: null };
}

function pushSelectItem(items: SelectItem[], cur: Partial<SelectItem>): void {
  if (cur.prompt == null) return;
  items.push({
    prompt: cur.prompt,
    promptTranslation: null,
    promptImage: cur.promptImage || null,
    options: cur.options && cur.options.length ? cur.options : null,
    answer: cur.answer || [],
    feedback: cur.feedback || null,
    feedbackTranslation: null,
    audio: cur.audio || null,
    isExample: cur.isExample || false,
  });
}

function parseSelect(buffer: string[]): { image: string | null; options: SelectOption[]; items: SelectItem[] } {
  const pool: SelectOption[] = [];
  const items: SelectItem[] = [];
  let cur: Partial<SelectItem> | null = null;
  let activityImage: string | null = null;
  let isExample = false;

  for (const item of buffer) {
    if (item === "EXAMPLE") {
      isExample = true;
    } else if (item.startsWith("OPTION_IMAGE:") || item.startsWith("OPTION:")) {
      const opt = parseOption(item, item.startsWith("OPTION_IMAGE:"));
      if (!opt) continue;
      if (!cur) pool.push(opt);
      else (cur.options = cur.options || []).push(opt);
    } else if (item.startsWith("IMAGE:")) {
      const v = item.slice(6).trim();
      if (!cur) activityImage = v;
      else cur.promptImage = v;
    } else if (item.startsWith("PROMPT_IMAGE:")) {
      if (cur) cur.promptImage = item.slice(13).trim();
    } else if (item.startsWith("PROMPT:")) {
      if (cur) pushSelectItem(items, cur);
      cur = { prompt: item.slice(7).trim(), options: [], answer: [], isExample };
      isExample = false;
    } else if (item.startsWith("AUDIO:")) {
      if (cur) cur.audio = audioName(item.slice(6));
    } else if (item.startsWith("ANSWER:")) {
      if (cur) cur.answer = item.slice(7).split(",").map((s) => s.trim()).filter(Boolean);
    } else if (item.startsWith("FEEDBACK:")) {
      if (cur) cur.feedback = item.slice(9).trim();
    }
  }
  if (cur) pushSelectItem(items, cur);
  return { image: activityImage, options: pool, items };
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
  });
}

function parseProduce(buffer: string[]): ProduceItem[] {
  const items: ProduceItem[] = [];
  let cur: Partial<ProduceItem> | null = null;
  let isExample = false;

  for (const item of buffer) {
    if (item === "EXAMPLE") {
      isExample = true;
      continue;
    }
    if (item.startsWith("PROMPT:") || item.startsWith("TEMPLATE:")) {
      const kind = item.startsWith("PROMPT:") ? "prompt" : "template";
      const val = item.slice(item.indexOf(":") + 1).trim();
      if (cur && (cur.response != null || (cur as any)[kind] != null)) {
        pushProduceItem(items, cur);
        cur = null;
      }
      if (!cur) {
        cur = { isExample };
        isExample = false;
      }
      (cur as any)[kind] = val;
      continue;
    }

    if (!cur) continue;
    if (item.startsWith("PROMPT_IMAGE:")) cur.promptImage = item.slice(13).trim();
    else if (item.startsWith("IMAGE:")) cur.promptImage = item.slice(6).trim();
    else if (item.startsWith("RESPONSE_AUDIO:")) cur.responseAudio = audioName(item.slice(15));
    else if (item.startsWith("RESPONSE:")) cur.response = item.slice(9).trim();
    else if (item.startsWith("AUDIO:")) cur.audio = audioName(item.slice(6));
    else if (item.startsWith("ACCEPT:")) cur.accept = item.slice(7).split("|").map((s) => s.trim()).filter(Boolean);
    else if (item.startsWith("RUBRIC:")) cur.rubric = item.slice(7).trim();
  }
  if (cur) pushProduceItem(items, cur);
  return items;
}

// =============================================================================
// HELPERS
// =============================================================================

function generateLessonId(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function generateActivityId(type: string, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${type}-${slug}`;
}
