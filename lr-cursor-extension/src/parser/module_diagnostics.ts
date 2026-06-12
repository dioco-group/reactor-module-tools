// AUTO-SYNCED COPY — DO NOT EDIT.
// Canonical source: reactor-module-tools/module-parser/module_diagnostics.ts
// To update: edit the canonical file, then run `node module-parser/sync.mjs`.

/**
 * CANONICAL linter for .module text — FORMAT v2.
 *
 * This file is synced verbatim to:
 *   - reactor-module-tools/module-preview/src/module_diagnostics.ts
 *   - lr-cursor-extension/src/parser/module_diagnostics.ts
 * Edit it HERE and run `node module-parser/sync.mjs`.
 */

import { ebnfSpec } from "./module_spec";

export type Severity = "error" | "warning";

export type Diagnostic = {
  severity: Severity;
  line: number; // 1-based
  message: string;
  code?: string;
};

type ActivityKind = "DIALOGUE" | "GRAMMAR" | "SELECT" | "PRODUCE" | "CHAT" | null;

const sectionNames = new Set(ebnfSpec.markers);
const flagNames = new Set(ebnfSpec.flags);

// Per module_format.ebnf: voice_name and speaker_name are alnum/underscore only, no spaces.
const idNoSpacesRe = /^[A-Za-z][A-Za-z0-9_]*$/;

// Valid Gemini TTS voices (from dioco-base/src/modules/tts_gemini.ts)
const VALID_GEMINI_VOICES = new Set([
  "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede",
  "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba",
  "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar",
  "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi",
  "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat",
]);
// Voice names are case-insensitive per the spec.
const VALID_GEMINI_VOICES_LC = new Set([...VALID_GEMINI_VOICES].map((v) => v.toLowerCase()));
const isValidVoice = (v: string) => VALID_GEMINI_VOICES_LC.has(v.toLowerCase());

const headerFields = new Set([...ebnfSpec.headerFields, ...ebnfSpec.voiceFields]);
const voiceFields = new Set(ebnfSpec.voiceFields);
const dialogueFields = new Set(ebnfSpec.dialogueFields);
const selectFields = new Set(ebnfSpec.selectFields);
const produceFields = new Set(ebnfSpec.produceFields);
const chatFields = new Set(ebnfSpec.chatFields);
const grammarFields = new Set(ebnfSpec.grammarFields);

const PRODUCE_INPUTS = new Set(["type", "speak", "either"]);
const PRODUCE_CHECKS = new Set(["reveal", "exact", "llm"]);

// ---------------------------------------------------------------------------
// Inline assets: trailing {file} tokens on content lines, routed by extension.
// ---------------------------------------------------------------------------

const AUDIO_EXT_RE = /\.(?:mp3|wav|ogg|opus|m4a)$/i;
const IMAGE_EXT_RE = /\.(?:jpe?g|png|gif|webp|svg)$/i;
const ASSET_TOKEN_RE = /\{\s*([^{}]+?)\s*\}/g;

const isAudioFile = (s: string) => AUDIO_EXT_RE.test(s.split("@")[0].trim());
const isImageFile = (s: string) => IMAGE_EXT_RE.test(s.split("@")[0].trim());

// Fields whose value may carry trailing inline assets.
const ASSET_FIELDS = new Set(["LINE", "PROMPT", "RESPONSE", "OPTION", "TEMPLATE"]);

type AssetFacts = { total: number; trailing: number; audio: number; image: number };

function analyzeInlineAssets(value: string): AssetFacts {
  let total = 0;
  for (const m of value.matchAll(ASSET_TOKEN_RE)) {
    if (isAudioFile(m[1]) || isImageFile(m[1])) total++;
  }
  // Count the trailing token run (what the parser will actually extract/flag).
  let rest = value.trimEnd();
  let trailing = 0, audio = 0, image = 0;
  for (;;) {
    const m = rest.match(/^(.*?)\s*\{\s*([^{}]+?)\s*\}$/);
    if (!m) break;
    if (isAudioFile(m[2])) audio++;
    else if (isImageFile(m[2])) image++;
    else break;
    trailing++;
    rest = m[1].trimEnd();
  }
  return { total, trailing, audio, image };
}

// Screenplay speaker line: `Jim: Hello.` — id must contain a lowercase letter
// (ALL-CAPS identifiers are reserved for field names).
const SPEAKER_LINE_RE = /^([A-Za-z][A-Za-z0-9_]*):\s*(.*)$/;
function matchSpeakerLine(s: string): { speaker: string; rest: string } | null {
  const m = s.match(SPEAKER_LINE_RE);
  if (m && /[a-z]/.test(m[1])) return { speaker: m[1], rest: m[2] };
  return null;
}

function generateId(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function lintModuleText(text: string): Diagnostic[] {
  const diags: Diagnostic[] = [];
  const lines = String(text ?? "").split("\n");

  let sawModuleMarker = false;
  let sawAnySectionMarker = false;
  let inHeader = true;
  let currentActivity: ActivityKind = null;
  let currentLessonLine: number | null = null;

  const seenHeader: Partial<Record<string, number>> = {};
  const seenVoiceSpeaker: Map<string, { line: number; original: string }> = new Map();
  // Speaker ids declared via VOICE: / VOICE_SPEAKER: (lowercased).
  const declaredSpeakers = new Set<string>();
  const warnedSpeakers = new Set<string>();
  // Activity ids per lesson (parser slugs) — duplicates collide downstream.
  let lessonActivityIds = new Map<string, number>();

  // Per-activity structural state mirroring the parser's item delimitation,
  // so we can flag missing ANSWERs and missing blank lines between items.
  let selItem: { stimulusLine: number; hasPrompt: boolean; hasTemplate: boolean; answered: boolean } | null = null;
  let prodItem: { stimulusLine: number; hasPrompt: boolean; hasTemplate: boolean; hasResponse: boolean } | null = null;
  // Activity-level IMAGE in $DIALOGUE must precede the first dialogue line.
  let dialogueContentStarted = false;
  let pendingExample: { line: number } | null = null;
  // Blank-line tracking for the item-separation style rule.
  let hadBlankBefore = true;

  const push = (severity: Severity, line: number, message: string, code?: string) => {
    diags.push({ severity, line, message, code });
  };

  // Called when a SELECT/PRODUCE activity ends (new marker or EOF).
  const closeItems = () => {
    if (selItem && !selItem.answered) {
      push("warning", selItem.stimulusLine, "SELECT item has no ANSWER.", "select-missing-answer");
    }
    selItem = null;
    prodItem = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i];
    const trimmedEnd = raw.trimEnd();
    const trimmed = trimmedEnd.trim();

    if (!trimmed) {
      hadBlankBefore = true;
      continue;
    }
    if (trimmed.startsWith("#")) continue; // comments are transparent

    // EBNF note: section markers and field names must start at column 0
    const startsWithWs = raw.length > 0 && (raw[0] === " " || raw[0] === "\t");
    if (startsWithWs) {
      const t = raw.trimStart();
      if (t.startsWith("$")) {
        push("error", lineNo, "Section marker must start at column 0 (no leading whitespace).", "section-indent");
      } else if (/^[A-Z_]+:/.test(t)) {
        push("error", lineNo, "Field must start at column 0 (no leading whitespace).", "field-indent");
      }
    }

    // Section markers
    if (trimmedEnd.startsWith("$")) {
      sawAnySectionMarker = true;
      hadBlankBefore = true; // a marker is a natural separator

      if (/^\$(LESSON|DIALOGUE|GRAMMAR|SELECT|PRODUCE|CHAT)\s*:/.test(trimmedEnd)) {
        push("error", lineNo, "Section markers must not use a colon (use `$LESSON Title`, not `$LESSON: Title`).", "section-colon");
      }

      const m = trimmedEnd.match(/^\$(\w+)(?:\s+(.*))?$/);
      if (!m) {
        push("warning", lineNo, "Unrecognized section marker format.", "section-format");
        continue;
      }
      const marker = m[1];
      const title = (m[2] ?? "").trim();
      if (!sectionNames.has(marker)) {
        push("warning", lineNo, `Unknown section marker: $${marker}`, "section-unknown");
      }

      if (marker === "MODULE") {
        sawModuleMarker = true;
        inHeader = true;
        currentActivity = null;
      } else if (marker === "LESSON") {
        closeItems();
        inHeader = false;
        currentActivity = null;
        currentLessonLine = lineNo;
        lessonActivityIds = new Map();
      } else if (marker === "DIALOGUE" || marker === "GRAMMAR" || marker === "SELECT" || marker === "PRODUCE" || marker === "CHAT") {
        closeItems();
        inHeader = false;
        currentActivity = marker as ActivityKind;
        dialogueContentStarted = false;
        if (!currentLessonLine) {
          push("warning", lineNo, `Found $${marker} before any $LESSON; parser will create a "Default Lesson".`, "implicit-lesson");
        }
        pendingExample = null;

        // Duplicate activity ids collide in caches/links downstream.
        const id = generateId(`${marker}-${title || marker.toLowerCase()}`);
        const prev = lessonActivityIds.get(id);
        if (prev) {
          push("warning", lineNo, `Activity id collides with the $${marker} at L${prev} (same type + title). Make the title unique.`, "dup-activity-id");
        } else {
          lessonActivityIds.set(id, lineNo);
        }
      }

      continue;
    }

    // Flag lines (no colon, no value): REPEAT / MULTI / AUDIO_ONLY
    if (flagNames.has(trimmed)) {
      if (trimmed === "REPEAT" && currentActivity !== "DIALOGUE") {
        push("warning", lineNo, "REPEAT is only meaningful inside $DIALOGUE.", "repeat-outside-dialogue");
      }
      if (trimmed === "MULTI" && currentActivity !== "SELECT") {
        push("warning", lineNo, "MULTI is only meaningful inside $SELECT.", "flag-outside-select");
      }
      if (trimmed === "SHOW_PROMPT" && currentActivity !== "SELECT" && currentActivity !== "PRODUCE") {
        push("warning", lineNo, "SHOW_PROMPT is only meaningful inside $SELECT or $PRODUCE.", "flag-outside-show-prompt");
      }
      hadBlankBefore = false;
      continue;
    }

    // Legacy flag from the inverted default: hidden prompts are now the norm.
    if (trimmed === "AUDIO_ONLY") {
      push("error", lineNo, "AUDIO_ONLY was removed — hidden PROMPT text is now the DEFAULT. Use SHOW_PROMPT when the book printed the stimulus.", "legacy-audio-only");
      hadBlankBefore = false;
      continue;
    }

    // EXAMPLE marker (select/produce) — belongs to the upcoming item, so it
    // does not consume the blank-line separator.
    if (ebnfSpec.exampleMarker && trimmed === ebnfSpec.exampleMarker) {
      if (currentActivity !== "SELECT" && currentActivity !== "PRODUCE") {
        push("warning", lineNo, "EXAMPLE marker is only meaningful inside $SELECT or $PRODUCE.", "example-outside-item");
      } else {
        pendingExample = { line: lineNo };
      }
      continue;
    }

    // Field lines
    const fm = trimmedEnd.match(/^([A-Z_]+):\s*(.*)?$/);
    if (fm) {
      const field = fm[1];
      const value = (fm[2] ?? "").trim();
      const blankBefore = hadBlankBefore;
      hadBlankBefore = false;

      // Inline-asset checks on content fields.
      if (currentActivity && ASSET_FIELDS.has(field)) {
        const a = analyzeInlineAssets(value);
        if (a.total > a.trailing) {
          push("warning", lineNo, "Inline {assets} must sit at the END of the line to be attached.", "asset-not-trailing");
        }
        if (field === "TEMPLATE" && a.audio > 0) {
          push("warning", lineNo, "TEMPLATE is display-only and never read aloud; an inline {clip} here is NOT attached.", "template-with-clip");
        } else if (a.audio > 1) {
          push("warning", lineNo, "Multiple inline clips on one line; only ONE audio clip is attached.", "multiple-inline-clips");
        }
        if (a.image > 1) {
          push("warning", lineNo, "Multiple inline images on one line; only ONE image is attached.", "multiple-inline-images");
        }
        if (field === "RESPONSE" && a.image > 0) {
          push("warning", lineNo, "Images are not supported on RESPONSE; put the image on the PROMPT/TEMPLATE.", "response-with-image");
        }
      }

      if (inHeader && !currentLessonLine && !currentActivity) {
        if (!headerFields.has(field)) {
          push("warning", lineNo, `Unknown header field: ${field}`, "unknown-header-field");
        } else if (field !== "VOICE_SPEAKER" && field !== "VOICE") {
          if (seenHeader[field]) push("warning", lineNo, `Duplicate header field: ${field}`, "dup-header-field");
          seenHeader[field] = lineNo;
        }

        if (field === "FORMAT" && value !== "2") {
          push("error", lineNo, `FORMAT must be 2 (got "${value}"). This toolchain parses format v2 only.`, "format-invalid");
        }

        validateVoiceField(field, value, lineNo, push, seenVoiceSpeaker, declaredSpeakers);
      } else if (currentActivity) {
        // Legacy fields removed by the inline-assets / screenplay-speaker redesign.
        if (field === "SPEAKER") {
          push("error", lineNo, "SPEAKER was removed — write screenplay style instead: `Jim: line text`.", "legacy-speaker-field");
          continue;
        }
        if (field === "OPTION_IMAGE" || field === "PROMPT_IMAGE") {
          push("error", lineNo, `${field} was removed — attach the image inline at the end of the ${field === "OPTION_IMAGE" ? "OPTION" : "PROMPT"} text: \`{page.jpg}\`.`, "legacy-image-field");
          continue;
        }
        if (field === "IMAGE" && currentActivity === "DIALOGUE" && dialogueContentStarted) {
          push("warning", lineNo, "IMAGE after dialogue lines is ignored — place the activity-wide IMAGE before the first line, or attach a per-line image inline: `{page.jpg}`.", "image-after-lines");
          continue;
        }
        if (field === "LINE" && currentActivity === "DIALOGUE") {
          dialogueContentStarted = true;
        }
        if (field === "IMAGE" && ((currentActivity === "SELECT" && selItem) || (currentActivity === "PRODUCE" && prodItem))) {
          push("warning", lineNo, `IMAGE inside a $${currentActivity} item is ignored — activity-level only. Attach per-item images inline on the PROMPT/TEMPLATE.`, "image-inside-item");
          continue;
        }

        const allowed =
          currentActivity === "DIALOGUE" ? dialogueFields
          : currentActivity === "SELECT" ? selectFields
          : currentActivity === "PRODUCE" ? produceFields
          : currentActivity === "CHAT" ? chatFields
          : currentActivity === "GRAMMAR" ? grammarFields
          : null;

        if (allowed && !allowed.has(field)) {
          if (currentActivity === "GRAMMAR" && field === "IMAGE") {
            push("warning", lineNo, "IMAGE inside $GRAMMAR is not in the formal grammar and is ignored. Use markdown image syntax `![alt](file.png)`.", "grammar-image-ignored");
          } else {
            push("warning", lineNo, `Field ${field} is not expected inside $${currentActivity}.`, "field-unexpected");
          }
        }

        if (currentActivity === "GRAMMAR" && field !== "INTRO") {
          push("warning", lineNo, `Line looks like a field (${field}:) inside $GRAMMAR; it will NOT be included in markdown content.`, "grammar-field-swallowed");
        }

        // Structural checks
        if (currentActivity === "SELECT") {
          if (field === "PROMPT" || field === "TEMPLATE") {
            if (value === "") push("warning", lineNo, `${field} is empty.`, "empty-prompt");
            const kind = field === "PROMPT" ? "hasPrompt" : "hasTemplate";
            // Mirror the parser: a new stimulus starts a NEW item when the open
            // item is answered or already has a stimulus of the same kind.
            if (selItem && (selItem.answered || selItem[kind as "hasPrompt" | "hasTemplate"])) {
              if (!selItem.answered) {
                push("warning", selItem.stimulusLine, "SELECT item has no ANSWER.", "select-missing-answer");
              }
              if (!blankBefore) {
                push("warning", lineNo, "New item should start after a blank line (keeps item boundaries unambiguous).", "item-needs-blank-line");
              }
              selItem = null;
            }
            if (!selItem) selItem = { stimulusLine: lineNo, hasPrompt: false, hasTemplate: false, answered: false };
            if (field === "PROMPT") selItem.hasPrompt = true;
            else selItem.hasTemplate = true;
            if (pendingExample) pendingExample = null;
          }
          if (field === "ANSWER") {
            if (!selItem) push("warning", lineNo, "ANSWER appears before a PROMPT or TEMPLATE.", "answer-before-prompt");
            else selItem.answered = true;
            if (value === "") push("warning", lineNo, "ANSWER is empty (list correct option id(s)).", "empty-answer");
          }
          if (field === "OPTION") {
            if (!/^[^|]+\|/.test(value)) push("warning", lineNo, `OPTION must be \`OPTION: <id> | <value>\`.`, "option-format");
          }
        } else if (currentActivity === "PRODUCE") {
          if (field === "INPUT" && value && !PRODUCE_INPUTS.has(value.toLowerCase()))
            push("warning", lineNo, `INPUT must be one of: type, speak, either.`, "input-invalid");
          if (field === "CHECK" && value && !PRODUCE_CHECKS.has(value.toLowerCase()))
            push("warning", lineNo, `CHECK must be one of: reveal, exact, llm.`, "check-invalid");
          if (field === "PROMPT" || field === "TEMPLATE") {
            const kind = field === "PROMPT" ? "hasPrompt" : "hasTemplate";
            if (prodItem && (prodItem.hasResponse || prodItem[kind as "hasPrompt" | "hasTemplate"])) {
              if (!blankBefore) {
                push("warning", lineNo, "New item should start after a blank line (keeps item boundaries unambiguous).", "item-needs-blank-line");
              }
              prodItem = null;
            }
            if (!prodItem) prodItem = { stimulusLine: lineNo, hasPrompt: false, hasTemplate: false, hasResponse: false };
            if (field === "PROMPT") prodItem.hasPrompt = true;
            else prodItem.hasTemplate = true;
            if (pendingExample) pendingExample = null;
          }
          if (field === "RESPONSE") {
            if (!prodItem) push("warning", lineNo, "RESPONSE appears before a PROMPT or TEMPLATE.", "response-before-stimulus");
            else prodItem.hasResponse = true;
            if (value === "") push("warning", lineNo, "RESPONSE is empty.", "empty-response");
          }
        }
      } else {
        if (!sawModuleMarker && headerFields.has(field)) {
          push("warning", lineNo, `Header field ${field} appears before $MODULE. Add a $MODULE header.`, "header-before-module");
        } else {
          push("warning", lineNo, `Field ${field} appears outside an activity; it will likely be ignored.`, "field-outside-activity");
        }
      }

      continue;
    }

    // Non-field content line.
    hadBlankBefore = false;

    // Screenplay speaker line inside $DIALOGUE: `Jim: Hello.`
    if (currentActivity === "DIALOGUE") {
      const sp = matchSpeakerLine(trimmedEnd);
      if (sp) {
        dialogueContentStarted = true;
        const a = analyzeInlineAssets(sp.rest);
        if (a.total > a.trailing) push("warning", lineNo, "Inline {assets} must sit at the END of the line to be attached.", "asset-not-trailing");
        if (a.audio > 1) push("warning", lineNo, "Multiple inline clips on one line; only ONE audio clip is attached.", "multiple-inline-clips");
        if (a.image > 1) push("warning", lineNo, "Multiple inline images on one line; only ONE image is attached.", "multiple-inline-images");
        if (!sp.rest.trim()) push("warning", lineNo, `Speaker line for "${sp.speaker}" has no text.`, "speaker-empty-line");
        // "Narrator" is conventional and falls back to VOICE_DEFAULT / VOICE_INTRO.
        if (declaredSpeakers.size > 0 && sp.speaker.toLowerCase() !== "narrator" && !declaredSpeakers.has(sp.speaker.toLowerCase()) && !warnedSpeakers.has(sp.speaker.toLowerCase())) {
          warnedSpeakers.add(sp.speaker.toLowerCase());
          push("warning", lineNo, `Speaker "${sp.speaker}" has no VOICE declaration (typo? or add \`VOICE: ${sp.speaker} | <VoiceName>\`).`, "speaker-undeclared");
        }
        continue;
      }
    }

    // Raw content line
    if (currentActivity === "GRAMMAR") {
      // ok (markdown)
    } else if (currentActivity === "DIALOGUE" || currentActivity === "SELECT" || currentActivity === "PRODUCE" || currentActivity === "CHAT") {
      push("warning", lineNo, `Unstructured content line inside $${currentActivity}. Did you forget a FIELD: prefix${currentActivity === "DIALOGUE" ? " or `Speaker:` name" : ""}?`, "raw-content");
    } else {
      push("warning", lineNo, "Content line appears outside any activity; it will be ignored.", "content-outside");
    }
  }

  // End-of-file pending state
  closeItems();
  if (pendingExample) {
    push("warning", pendingExample.line, "EXAMPLE marker must be followed by an item (PROMPT / TEMPLATE...).", "example-not-applied");
  }

  // Required header fields
  if (!sawAnySectionMarker) {
    push("error", 1, "No section markers found. A .module should contain at least `$MODULE` and `$LESSON`/activities.", "no-sections");
  }
  if (!sawModuleMarker) {
    push("error", 1, "Missing `$MODULE` header.", "missing-module");
  }
  if (sawModuleMarker) {
    if (!seenHeader.FORMAT)
      push("warning", 1, "Missing header field: FORMAT: 2 (declares the module format version)", "missing-format");
    if (!seenHeader.DIOCO_DOC_ID)
      push("warning", 1, "Missing header field: DIOCO_DOC_ID (optional, moduleKey is derived from filename)", "missing-dioco-doc-id");
    if (!seenHeader.TITLE) push("error", 1, "Missing required header field: TITLE", "missing-title");
    if (!seenHeader.TARGET_LANG_G) push("error", 1, "Missing required header field: TARGET_LANG_G", "missing-target-lang");
    if (!seenHeader.HOME_LANG_G && !seenHeader.USER_LANG_G)
      push("error", 1, "Missing required header field: HOME_LANG_G (or legacy USER_LANG_G)", "missing-home-lang");
  }

  return diags.sort((a, b) =>
    a.severity === b.severity ? a.line - b.line : a.severity === "error" ? -1 : 1,
  );
}

function validateVoiceField(
  field: string,
  value: string,
  lineNo: number,
  push: (s: Severity, l: number, m: string, c?: string) => void,
  seenVoiceSpeaker: Map<string, { line: number; original: string }>,
  declaredSpeakers: Set<string>,
): void {
  if (field === "VOICE_SPEAKER") {
    push("warning", lineNo, "VOICE_SPEAKER is legacy; prefer VOICE: SpeakerId | VoiceName | Optional prompt.", "voice_speaker-deprecated");
    const m = value.match(/^(.+?)\s*=\s*([^|]+)(?:\s*\|\s*(.*))?$/);
    if (!m) {
      push("error", lineNo, "VOICE_SPEAKER must be `VOICE_SPEAKER: SpeakerName = VoiceName | Optional prompt`.", "voice_speaker-format");
      return;
    }
    const speakerName = m[1].trim();
    const voiceName = m[2].trim();
    declaredSpeakers.add(speakerName.toLowerCase());
    if (!idNoSpacesRe.test(speakerName)) push("warning", lineNo, `VOICE_SPEAKER label must be alnum only (no spaces): "${speakerName}"`, "voice_speaker-label");
    if (!idNoSpacesRe.test(voiceName)) push("warning", lineNo, `Voice name must be alnum only (no spaces): "${voiceName}"`, "voice_name");
    if (!isValidVoice(voiceName)) push("error", lineNo, `Unknown Gemini voice: "${voiceName}".`, "voice-invalid");

    const key = speakerName.toLowerCase();
    const prev = seenVoiceSpeaker.get(key);
    if (prev) push("warning", lineNo, `Duplicate VOICE_SPEAKER mapping for "${prev.original}" (previous at L${prev.line}).`, "voice_speaker-dup");
    else seenVoiceSpeaker.set(key, { line: lineNo, original: speakerName });
    if (prev && prev.original !== speakerName) push("warning", lineNo, `VOICE_SPEAKER label casing differs ("${prev.original}" vs "${speakerName}").`, "voice_speaker-case");
    return;
  }

  if (field === "VOICE") {
    // VOICE: SpeakerId | VoiceName | optional prompt
    const parts = value.split("|").map((s) => s.trim());
    if (parts.length < 2) {
      push("error", lineNo, "VOICE must be `VOICE: SpeakerId | VoiceName | Optional prompt`.", "voice-format");
      return;
    }
    const speakerId = parts[0];
    const voiceName = parts[1];
    declaredSpeakers.add(speakerId.toLowerCase());
    if (!idNoSpacesRe.test(speakerId)) push("warning", lineNo, `VOICE speakerId must be alnum/_ only (no spaces): "${speakerId}"`, "voice-speaker-id");
    if (!idNoSpacesRe.test(voiceName)) push("warning", lineNo, `Voice name must be alnum/_ only (no spaces): "${voiceName}"`, "voice_name");
    if (!isValidVoice(voiceName)) push("error", lineNo, `Unknown Gemini voice: "${voiceName}".`, "voice-invalid");
    return;
  }

  if (voiceFields.has(field)) {
    const m = value.match(/^([^|]+)(?:\s*\|\s*(.*))?$/);
    if (m) {
      const voiceName = m[1].trim();
      if (!idNoSpacesRe.test(voiceName)) push("warning", lineNo, `Voice name must be alnum only (no spaces): "${voiceName}"`, "voice_name");
      if (!isValidVoice(voiceName)) push("error", lineNo, `Unknown Gemini voice: "${voiceName}".`, "voice-invalid");
    }
  }
}
