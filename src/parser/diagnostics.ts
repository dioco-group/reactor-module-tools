export type Severity = "error" | "warning";

export type Diagnostic = {
  severity: Severity;
  line: number; // 1-based
  message: string;
  code?: string;
};

type ActivityKind = "DIALOGUE" | "GRAMMAR" | "SELECT" | "PRODUCE" | "CHAT" | null;

import { ebnfSpec } from "./ebnfSpec";

const sectionNames = new Set(ebnfSpec.markers);
const flagNames = new Set(ebnfSpec.flags);

const idNoSpacesRe = /^[A-Za-z][A-Za-z0-9_]*$/;

// Valid Gemini TTS voices (case-insensitive per the format spec).
const VALID_GEMINI_VOICES = new Set([
  "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede",
  "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba",
  "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar",
  "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi",
  "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat",
]);
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

  let pendingSelectPrompt: { line: number } | null = null;
  let pendingProduceStimulus: { line: number } | null = null;
  let pendingExample: { line: number } | null = null;

  const push = (severity: Severity, line: number, message: string, code?: string) => {
    diags.push({ severity, line, message, code });
  };

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i];
    const trimmedEnd = raw.trimEnd();
    const trimmed = trimmedEnd.trim();

    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;

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

      if (/^\$(LESSON|DIALOGUE|GRAMMAR|SELECT|PRODUCE|CHAT)\s*:/.test(trimmedEnd)) {
        push("error", lineNo, "Section markers must not use a colon (use `$LESSON Title`, not `$LESSON: Title`).", "section-colon");
      }

      const m = trimmedEnd.match(/^\$(\w+)(?:\s+(.*))?$/);
      if (!m) {
        push("warning", lineNo, "Unrecognized section marker format.", "section-format");
        continue;
      }
      const marker = m[1];
      if (!sectionNames.has(marker)) {
        push("warning", lineNo, `Unknown section marker: $${marker}`, "section-unknown");
      }

      if (marker === "MODULE") {
        sawModuleMarker = true;
        inHeader = true;
        currentActivity = null;
      } else if (marker === "LESSON") {
        inHeader = false;
        currentActivity = null;
        currentLessonLine = lineNo;
      } else if (marker === "DIALOGUE" || marker === "GRAMMAR" || marker === "SELECT" || marker === "PRODUCE" || marker === "CHAT") {
        inHeader = false;
        currentActivity = marker as ActivityKind;
        if (!currentLessonLine) {
          push("warning", lineNo, `Found $${marker} before any $LESSON; parser will create a "Default Lesson".`, "implicit-lesson");
        }
        pendingSelectPrompt = null;
        pendingProduceStimulus = null;
        pendingExample = null;
      }

      continue;
    }

    // Flags (no colon)
    if (flagNames.has(trimmed)) {
      if (trimmed === "REPEAT" && currentActivity !== "DIALOGUE") {
        push("warning", lineNo, "REPEAT is only meaningful inside $DIALOGUE.", "repeat-outside-dialogue");
      }
      if (trimmed === "MULTI" && currentActivity !== "SELECT") {
        push("warning", lineNo, "MULTI is only meaningful inside $SELECT.", "flag-outside-select");
      }
      if (trimmed === "AUDIO_ONLY" && currentActivity !== "SELECT" && currentActivity !== "PRODUCE") {
        push("warning", lineNo, "AUDIO_ONLY is only meaningful inside $SELECT or $PRODUCE.", "flag-outside-audio-only");
      }
      continue;
    }

    // EXAMPLE marker
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

      if (inHeader && !currentLessonLine && !currentActivity) {
        if (!headerFields.has(field)) {
          push("warning", lineNo, `Unknown header field: ${field}`, "unknown-header-field");
        } else if (field !== "VOICE_SPEAKER" && field !== "VOICE") {
          if (seenHeader[field]) push("warning", lineNo, `Duplicate header field: ${field}`, "dup-header-field");
          seenHeader[field] = lineNo;
        }
        validateVoiceField(field, value, lineNo, push, seenVoiceSpeaker);
      } else if (currentActivity) {
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

        if (currentActivity === "SELECT") {
          if (field === "PROMPT") {
            pendingSelectPrompt = { line: lineNo };
            if (value === "") push("warning", lineNo, "PROMPT is empty.", "empty-prompt");
            if (pendingExample) pendingExample = null;
          }
          if (field === "ANSWER") {
            if (!pendingSelectPrompt) push("warning", lineNo, "ANSWER appears before PROMPT.", "answer-before-prompt");
            if (value === "") push("warning", lineNo, "ANSWER is empty (list correct option id(s)).", "empty-answer");
            pendingSelectPrompt = null;
          }
          if (field === "OPTION" || field === "OPTION_IMAGE") {
            if (!/^[^|]+\|/.test(value)) push("warning", lineNo, `${field} must be \`${field}: <id> | <value>\`.`, "option-format");
          }
        } else if (currentActivity === "PRODUCE") {
          if (field === "INPUT" && value && !PRODUCE_INPUTS.has(value.toLowerCase()))
            push("warning", lineNo, "INPUT must be one of: type, speak, either.", "input-invalid");
          if (field === "CHECK" && value && !PRODUCE_CHECKS.has(value.toLowerCase()))
            push("warning", lineNo, "CHECK must be one of: reveal, exact, llm.", "check-invalid");
          if (field === "PROMPT" || field === "TEMPLATE") {
            pendingProduceStimulus = { line: lineNo };
            if (pendingExample) pendingExample = null;
          }
          if (field === "RESPONSE") {
            if (!pendingProduceStimulus) push("warning", lineNo, "RESPONSE appears before a PROMPT or TEMPLATE.", "response-before-stimulus");
            if (value === "") push("warning", lineNo, "RESPONSE is empty.", "empty-response");
            pendingProduceStimulus = null;
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

    // Raw content line
    if (currentActivity === "GRAMMAR") {
      // ok (markdown)
    } else if (currentActivity === "DIALOGUE" || currentActivity === "SELECT" || currentActivity === "PRODUCE" || currentActivity === "CHAT") {
      push("warning", lineNo, `Unstructured content line inside $${currentActivity}. Did you forget a FIELD: prefix?`, "raw-content");
    } else {
      push("warning", lineNo, "Content line appears outside any activity; it will be ignored.", "content-outside");
    }
  }

  if (pendingExample) {
    push("warning", pendingExample.line, "EXAMPLE marker must be followed by an item (PROMPT / TEMPLATE...).", "example-not-applied");
  }

  if (!sawAnySectionMarker) {
    push("error", 1, "No section markers found. A .module should contain at least `$MODULE` and `$LESSON`/activities.", "no-sections");
  }
  if (!sawModuleMarker) {
    push("error", 1, "Missing `$MODULE` header.", "missing-module");
  }
  if (sawModuleMarker) {
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
    const parts = value.split("|").map((s) => s.trim());
    if (parts.length < 2) {
      push("error", lineNo, "VOICE must be `VOICE: SpeakerId | VoiceName | Optional prompt`.", "voice-format");
      return;
    }
    const speakerId = parts[0];
    const voiceName = parts[1];
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
