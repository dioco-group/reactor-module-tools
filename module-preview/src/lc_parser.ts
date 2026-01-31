/**
 * Parser for .module and .course files
 *
 * .course file format:
 * ```
 * $COURSE
 * DIOCO_PLAYLIST_ID: lc_fsi_spanish_basic
 * TITLE: FSI Spanish Basic Course
 * DESCRIPTION: ...
 * IMAGE: cover.jpg
 * TARGET_LANG_G: es
 * HOME_LANG_G: en
 * ```
 *
 * .module file format: See samples/example.module
 *
 * Note: HOME_LANG_G (preferred) and USER_LANG_G (legacy) are both supported.
 */

import {
  Course,
  Module,
  ModuleListItem,
  ModuleVoiceConfig,
  LessonContent,
  Activity,
  DialogueActivity,
  GrammarActivity,
  ExerciseActivity,
  ChatActivity,
  DialogueLine,
  ExerciseItem,
  getModuleListItem,
} from "./lc_types";
import { langCode_G_t } from "./lang";
import { diocoLogger } from "../utils/logs";

const log = diocoLogger("LC_PARSER");

// =============================================================================
// COURSE PARSER
// =============================================================================

export function parseCourseFile(content: string): Course {
  const lines = content.split("\n");
  const result: Partial<Course> = {};

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Skip $COURSE marker
    if (trimmed === "$COURSE") continue;

    // Parse field: value pairs
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
        case "USER_LANG_G": // Legacy support
          result.homeLang_G = value as langCode_G_t;
          break;
      }
    }
  }

  // Validate required fields
  if (!result.diocoPlaylistId)
    throw new Error("Missing DIOCO_PLAYLIST_ID in .course file");
  if (!result.title) throw new Error("Missing TITLE in .course file");
  if (!result.targetLang_G)
    throw new Error("Missing TARGET_LANG_G in .course file");
  if (!result.homeLang_G)
    throw new Error("Missing HOME_LANG_G in .course file");

  return {
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
  activityContentBuffer: string[];
}

/**
 * Parse a .module file into a Module object
 */
export function parseModuleFile(content: string): Module {
  const lines = content.split("\n");
  const state: ParserState = {
    module: {
      lessons: [],
    },
    voiceConfig: {
      default: null,
      prompt: null,
      response: null,
      introVoice: null,
      speakers: {},
    },
    currentLesson: null,
    currentActivity: null,
    activityContentBuffer: [],
  };

  let lineNum = 0;
  for (const line of lines) {
    lineNum++;
    try {
      processLine(line, state, lineNum);
    } catch (e) {
      log.e("Parse error at line %d: %s", lineNum, e);
      throw new Error(`Parse error at line ${lineNum}: ${e}`);
    }
  }

  // Finalize any pending activity/lesson
  finalizeActivity(state);
  finalizeLesson(state);

  // Validate module
  const mod = state.module;
  if (!mod.diocoDocId) throw new Error("Missing DIOCO_DOC_ID in .module file");
  if (!mod.title) throw new Error("Missing TITLE in .module file");
  if (!mod.targetLang_G)
    throw new Error("Missing TARGET_LANG_G in .module file");
  if (!mod.homeLang_G) throw new Error("Missing HOME_LANG_G in .module file");

  return {
    diocoDocId: mod.diocoDocId,
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

function processLine(line: string, state: ParserState, lineNum: number): void {
  const trimmed = line.trimEnd();

  // Skip comments
  if (trimmed.trimStart().startsWith("#")) return;

  // Handle section markers (must be at start of line)
  if (trimmed.startsWith("$")) {
    handleSectionMarker(trimmed, state);
    return;
  }

  // Handle EXAMPLE marker (no colon, no value)
  if (trimmed === "EXAMPLE" && state.currentActivity?.type === "EXERCISE") {
    state.activityContentBuffer.push("EXAMPLE:");
    return;
  }

  // Handle field: value pairs at start of line
  const fieldMatch = trimmed.match(/^([A-Z_]+):\s*(.*)?$/);
  if (fieldMatch) {
    handleField(fieldMatch[1], fieldMatch[2] || "", state);
    return;
  }

  // Otherwise, it's content for the current activity
  if (state.currentActivity) {
    state.activityContentBuffer.push(line);
  }
}

function handleSectionMarker(line: string, state: ParserState): void {
  // Match patterns like "$MODULE", "$LESSON Title", "$DIALOGUE Title"
  const match = line.match(/^\$(\w+)(?:\s+(.*))?$/);
  if (!match) return;

  const [, marker, title] = match;

  switch (marker) {
    case "MODULE":
      // Module header - nothing to do, fields follow
      break;

    case "LESSON":
      // Start a new lesson
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

    case "EXERCISE":
      startActivity(state, "EXERCISE", title || "Exercise");
      break;

    case "CHAT":
      startActivity(state, "CHAT", title || "Chat");
      break;

    default:
      log.w("Unknown section marker: $%s", marker);
  }
}

function handleField(field: string, value: string, state: ParserState): void {
  // Module-level fields (only when no activity is active, or for certain fields)
  if (!state.currentActivity && !state.currentLesson) {
    switch (field) {
      case "DIOCO_DOC_ID":
        state.module.diocoDocId = value;
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
      case "USER_LANG_G": // Legacy support
        state.module.homeLang_G = value as langCode_G_t;
        return;
      case "TTS_PROMPT":
        (state.module as any).ttsPrompt = value;
        return;
      case "VOICE_DEFAULT": {
        const match = value.match(/^([^|]+)(?:\s*\|\s*(.*))?$/);
        if (match) {
          state.voiceConfig.default = {
            voice: match[1].trim(),
            prompt: match[2] ? match[2].trim() : null,
          };
        }
        return;
      }
      case "VOICE_PROMPT": {
        const match = value.match(/^([^|]+)(?:\s*\|\s*(.*))?$/);
        if (match) {
          state.voiceConfig.prompt = {
            voice: match[1].trim(),
            prompt: match[2] ? match[2].trim() : null,
          };
        }
        return;
      }
      case "VOICE_RESPONSE": {
        const match = value.match(/^([^|]+)(?:\s*\|\s*(.*))?$/);
        if (match) {
          state.voiceConfig.response = {
            voice: match[1].trim(),
            prompt: match[2] ? match[2].trim() : null,
          };
        }
        return;
      }
      case "VOICE_INTRO": {
        const match = value.match(/^([^|]+)(?:\s*\|\s*(.*))?$/);
        if (match) {
          state.voiceConfig.introVoice = {
            voice: match[1].trim(),
            prompt: match[2] ? match[2].trim() : null,
          };
        }
        return;
      }
      case "VOICE_SPEAKER":
        // Format: "SpeakerName = voice-name" or "SpeakerName = voice-name | Optional Prompt"
        // e.g. "Narrator = Aoede" or "Carlos = Achernar | Speak with a Texan accent"
        const speakerMatch = value.match(
          /^(.+?)\s*=\s*([^|]+)(?:\s*\|\s*(.*))?$/,
        );
        if (speakerMatch) {
          const [, speakerName, voiceName, prompt] = speakerMatch;
          state.voiceConfig.speakers[speakerName.trim()] = {
            voice: voiceName.trim(),
            prompt: prompt ? prompt.trim() : null,
          };
        }
        return;

      case "VOICE": {
        // Speaker mapping format:
        // VOICE: <speakerId> | <voiceName> | <optionalPrompt>
        // Example:
        // VOICE: M_Dupre | Achernar | Speak warmly
        const parts = value.split("|").map((s) => s.trim());
        if (parts.length >= 2) {
          const speakerId = parts[0];
          const voiceName = parts[1];
          const prompt = parts.slice(2).join(" | ") || null;
          state.voiceConfig.speakers[speakerId] = {
            voice: voiceName,
            prompt,
            displayName: null,
          };
        }
        return;
      }
    }
  }

  // Activity-level fields
  if (state.currentActivity) {
    const activity = state.currentActivity;

    switch (field) {
      case "TTS_PROMPT":
        if (activity.type === "DIALOGUE" || activity.type === "EXERCISE") {
          (activity as any).ttsPrompt = value;
        }
        return;
      case "INSTRUCTION":
        if (activity.type === "DIALOGUE" || activity.type === "EXERCISE") {
          (activity as DialogueActivity | ExerciseActivity).instruction = value;
        }
        return;

      case "INTRO":
        // Spoken introduction for the activity
        activity.intro = value;
        return;

      case "SCENARIO":
        if (activity.type === "CHAT") {
          (activity as ChatActivity).scenario = value;
        }
        return;

      case "INITIAL_PROMPT":
        if (activity.type === "CHAT") {
          (activity as ChatActivity).initialPrompt = value;
        }
        return;

      // Dialogue fields
      case "SPEAKER":
        state.activityContentBuffer.push(`SPEAKER:${value}`);
        return;

      case "LINE":
        state.activityContentBuffer.push(`LINE:${value}`);
        return;

      case "LINE_T":
        state.activityContentBuffer.push(`LINE_T:${value}`);
        return;

      case "NOTES":
        state.activityContentBuffer.push(`NOTES:${value}`);
        return;

      case "VOCAB":
        state.activityContentBuffer.push(`VOCAB:${value}`);
        return;

      case "VOCAB_T":
        state.activityContentBuffer.push(`VOCAB_T:${value}`);
        return;

      case "PROMPT":
        state.activityContentBuffer.push(`PROMPT:${value}`);
        return;

      case "PROMPT_T":
        state.activityContentBuffer.push(`PROMPT_T:${value}`);
        return;

      case "RESPONSE":
        state.activityContentBuffer.push(`RESPONSE:${value}`);
        return;

      case "RESPONSE_T":
        state.activityContentBuffer.push(`RESPONSE_T:${value}`);
        return;
    }
  }
}

function startActivity(
  state: ParserState,
  type: Activity["type"],
  title: string,
): void {
  // Finalize previous activity
  finalizeActivity(state);

  // Ensure we have a lesson
  if (!state.currentLesson) {
    state.currentLesson = {
      id: "default-lesson",
      title: "Default Lesson",
      activities: [],
    };
  }

  // Initialize activity with type-specific defaults
  const baseActivity = {
    type,
    id: generateActivityId(type, title),
    title,
    intro: null,
  };

  if (type === "DIALOGUE") {
    state.currentActivity = {
      ...baseActivity,
      instruction: null,
      ttsPrompt: null,
      lines: [],
    } as Partial<DialogueActivity>;
  } else if (type === "EXERCISE") {
    state.currentActivity = {
      ...baseActivity,
      instruction: null,
      ttsPrompt: null,
      items: [],
    } as Partial<ExerciseActivity>;
  } else if (type === "GRAMMAR") {
    state.currentActivity = {
      ...baseActivity,
      content: "",
    } as Partial<GrammarActivity>;
  } else if (type === "CHAT") {
    state.currentActivity = {
      ...baseActivity,
      scenario: "",
      initialPrompt: "",
    } as Partial<ChatActivity>;
  } else {
    state.currentActivity = baseActivity;
  }

  state.activityContentBuffer = [];
}

function finalizeActivity(state: ParserState): void {
  if (!state.currentActivity || !state.currentLesson) return;

  const activity = state.currentActivity;
  const buffer = state.activityContentBuffer;

  switch (activity.type) {
    case "DIALOGUE":
      (activity as DialogueActivity).lines = parseDialogueLines(buffer);
      break;

    case "GRAMMAR":
      (activity as GrammarActivity).content = parseGrammarContent(buffer);
      break;

    case "EXERCISE":
      (activity as ExerciseActivity).items = parseExerciseItems(buffer);
      break;

    case "CHAT":
      // Chat activities get their content from fields (SCENARIO, INITIAL_PROMPT)
      // No additional content parsing needed
      break;
  }

  state.currentLesson.activities.push(activity as Activity);
  state.currentActivity = null;
  state.activityContentBuffer = [];
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

function parseDialogueLines(buffer: string[]): DialogueLine[] {
  const lines: DialogueLine[] = [];
  let currentLine: Partial<DialogueLine> = {};
  let pendingVocab: { word: string; definition: string }[] = [];
  // For VOCAB_T that may arrive before VOCAB (order matters for vocab pairing)
  let pendingVocabDefinition: string | null = null;

  for (const item of buffer) {
    if (item.startsWith("VOCAB:")) {
      // Start a new vocab item
      const word = item.slice(6).trim();
      // If we have a pending definition from an earlier VOCAB_T, use it
      pendingVocab.push({ word, definition: pendingVocabDefinition || "" });
      pendingVocabDefinition = null;
    } else if (item.startsWith("VOCAB_T:")) {
      const definition = item.slice(8).trim();
      // Add definition to the last vocab item, or store for next VOCAB
      if (pendingVocab.length > 0) {
        pendingVocab[pendingVocab.length - 1].definition = definition;
      } else {
        // VOCAB_T came before VOCAB - store for later
        pendingVocabDefinition = definition;
      }
    } else if (item.startsWith("LINE_T:")) {
      // Accumulate - order within item block doesn't matter
      currentLine.translation = item.slice(7).trim();
    } else if (item.startsWith("NOTES:")) {
      // Accumulate - order within item block doesn't matter
      currentLine.notes = item.slice(6).trim();
    } else if (item.startsWith("SPEAKER:")) {
      // If we have a pending line, save it
      if (currentLine.text) {
        lines.push({
          speaker: currentLine.speaker || null,
          text: currentLine.text,
          translation: currentLine.translation || "",
          notes: currentLine.notes || null,
          vocab: currentLine.vocab || null,
          nlp: null, // Added by backend
          ttsDataURL: null, // Added by backend
        });
        currentLine = {};
      }
      currentLine.speaker = item.slice(8).trim();
      // Attach pending vocab to this line's context
      if (pendingVocab.length > 0) {
        currentLine.vocab = pendingVocab;
        pendingVocab = [];
      }
    } else if (item.startsWith("LINE:")) {
      if (currentLine.text) {
        // Save previous line
        lines.push({
          speaker: currentLine.speaker || null,
          text: currentLine.text,
          translation: currentLine.translation || "",
          notes: currentLine.notes || null,
          vocab: currentLine.vocab || null,
          nlp: null, // Added by backend
          ttsDataURL: null, // Added by backend
        });
        currentLine = { speaker: currentLine.speaker }; // Keep speaker for subsequent lines
      }
      currentLine.text = item.slice(5).trim();
      // Attach pending vocab to this line
      if (pendingVocab.length > 0) {
        currentLine.vocab = pendingVocab;
        pendingVocab = [];
      }
    }
  }

  // Don't forget the last line
  if (currentLine.text) {
    lines.push({
      speaker: currentLine.speaker || null,
      text: currentLine.text,
      translation: currentLine.translation || "",
      notes: currentLine.notes || null,
      vocab: currentLine.vocab || null,
      nlp: null, // Added by backend
      ttsDataURL: null, // Added by backend
    });
  }

  return lines;
}

function parseGrammarContent(buffer: string[]): string {
  // Join all lines as markdown content (images should be in markdown format)
  return buffer.join("\n").trim();
}

function parseExerciseItems(buffer: string[]): ExerciseItem[] {
  const items: ExerciseItem[] = [];
  let currentItem: Partial<ExerciseItem> = {};
  let isExample = false; // Tracks if current/next item is an example

  for (const item of buffer) {
    if (item.startsWith("EXAMPLE:")) {
      // Mark the next item(s) as examples
      isExample = true;
    } else if (item.startsWith("PROMPT:")) {
      // If we have a pending item, save it
      if (currentItem.prompt && currentItem.response) {
        items.push({
          prompt: currentItem.prompt,
          promptTranslation: currentItem.promptTranslation || null,
          response: currentItem.response,
          responseTranslation: currentItem.responseTranslation || null,
          isExample: currentItem.isExample || false,
          promptNlp: null, // Added by backend
          responseNlp: null, // Added by backend
          promptTtsDataURL: null, // Added by backend
          responseTtsDataURL: null, // Added by backend
        });
      }
      currentItem = {
        prompt: item.slice(7).trim(),
        isExample: isExample,
      };
      // Reset example flag after applying to an item
      // (each EXAMPLE marker applies to the immediately following PROMPT)
      isExample = false;
    } else if (item.startsWith("PROMPT_T:")) {
      // Accumulate - order within item block doesn't matter
      currentItem.promptTranslation = item.slice(9).trim();
    } else if (item.startsWith("RESPONSE:")) {
      currentItem.response = item.slice(9).trim();
    } else if (item.startsWith("RESPONSE_T:")) {
      // Accumulate - order within item block doesn't matter
      currentItem.responseTranslation = item.slice(11).trim();
    }
  }

  // Don't forget the last item
  if (currentItem.prompt && currentItem.response) {
    items.push({
      prompt: currentItem.prompt,
      promptTranslation: currentItem.promptTranslation || null,
      response: currentItem.response,
      responseTranslation: currentItem.responseTranslation || null,
      isExample: currentItem.isExample || false,
      promptNlp: null, // Added by backend
      responseNlp: null, // Added by backend
      promptTtsDataURL: null, // Added by backend
      responseTtsDataURL: null, // Added by backend
    });
  }

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

// Re-export the helper for backwards compatibility
export { getModuleListItem };

// =============================================================================
// TEST
// =============================================================================

/**
 * Test the parser with sample content.
 * Run with: npx ts-node -e "require('./src/modules/lc_parser').test_lc_parser()"
 */
export function test_lc_parser(): void {
  const sampleModuleContent = `
DIOCO_DOC_ID: lc_test_module
TITLE: Test Module
DESCRIPTION: A test module for parser validation
TARGET_LANG_G: es
HOME_LANG_G: en
VOICE_DEFAULT: aoede | Speak naturally
VOICE_SPEAKER: Ana = aoede | Speak warmly
VOICE_SPEAKER: Carlos = achernar | Speak casually

$LESSON Lesson 1: Greetings

$DIALOGUE Basic Greetings
INTRO: In this dialogue, Ana and Carlos greet each other in the morning.
INSTRUCTION: Listen and repeat.

VOCAB: buenos días
VOCAB_T: good morning

SPEAKER: Ana
LINE: Hola, buenos días.
LINE_T: Hello, good morning.
NOTES: "Buenos días" is used until noon.

SPEAKER: Carlos
LINE: ¿Cómo estás?
LINE_T: How are you?

$GRAMMAR Formal vs Informal

In Spanish, we use different forms of "you":
- **tú** - informal, with friends
- **usted** - formal, with strangers

![Formal vs Informal](formal_informal.png)

$EXERCISE Practice
INTRO: Now practice translating some basic greetings.
INSTRUCTION: Translate the following.

EXAMPLE
PROMPT: Good morning
RESPONSE: Buenos días
RESPONSE_T: Good morning

PROMPT: How are you? (formal)
RESPONSE: ¿Cómo está usted?

$LESSON Lesson 2: Farewells

$CHAT Practice Saying Goodbye
SCENARIO: You are leaving a shop after making a purchase.
INITIAL_PROMPT: You are a friendly shop owner. Say goodbye to the customer warmly.
`;

  const sampleCourseContent = `
DIOCO_PLAYLIST_ID: lc_test_course
TITLE: Test Spanish Course
DESCRIPTION: A test course for parser validation
TARGET_LANG_G: es
HOME_LANG_G: en
IMAGE: test_course.png
`;

  console.log("=== Testing Module Parser ===\n");

  try {
    const module = parseModuleFile(sampleModuleContent);
    console.log("✓ Module parsed successfully");
    console.log("  - diocoDocId:", module.diocoDocId);
    console.log("  - title:", module.title);
    console.log("  - targetLang_G:", module.targetLang_G);
    console.log("  - homeLang_G:", module.homeLang_G);
    console.log("  - lessons:", module.lessons.length);

    module.lessons.forEach((lesson, i) => {
      console.log(`\n  Lesson ${i + 1}: "${lesson.title}"`);
      console.log(`    - activities: ${lesson.activities.length}`);
      lesson.activities.forEach((act) => {
        console.log(`      - [${act.type}] ${act.title}`);
        if (act.type === "DIALOGUE") {
          console.log(`        lines: ${act.lines.length}`);
          act.lines.forEach((line) => {
            console.log(
              `          ${line.speaker || "?"}: "${line.text.substring(0, 30)}..."`,
            );
            if (line.notes) console.log(`            notes: ${line.notes}`);
            if (line.vocab?.length)
              console.log(
                `            vocab: ${line.vocab.map((v) => v.word).join(", ")}`,
              );
          });
        } else if (act.type === "EXERCISE") {
          console.log(`        items: ${act.items.length}`);
          const examples = act.items.filter((i) => i.isExample).length;
          if (examples > 0) console.log(`        examples: ${examples}`);
        } else if (act.type === "GRAMMAR") {
          console.log(`        content: ${act.content.substring(0, 50)}...`);
        } else if (act.type === "CHAT") {
          console.log(`        scenario: ${act.scenario.substring(0, 50)}...`);
        }
      });
    });
  } catch (e) {
    console.error("✗ Module parsing failed:", e);
  }

  console.log("\n=== Testing Course Parser ===\n");

  try {
    const course = parseCourseFile(sampleCourseContent);
    console.log("✓ Course parsed successfully");
    console.log("  - diocoPlaylistId:", course.diocoPlaylistId);
    console.log("  - title:", course.title);
    console.log("  - description:", course.description);
    console.log("  - targetLang_G:", course.targetLang_G);
    console.log("  - homeLang_G:", course.homeLang_G);
    console.log("  - image:", course.image);
  } catch (e) {
    console.error("✗ Course parsing failed:", e);
  }

  console.log("\n=== Parser Test Complete ===");
}

// Uncomment to run test when file is executed directly:
// test_lc_parser();
