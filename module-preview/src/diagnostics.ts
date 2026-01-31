export type Severity = "error" | "warning";

export type Diagnostic = {
  severity: Severity;
  line: number; // 1-based
  message: string;
  code?: string;
};

type ActivityKind = "DIALOGUE" | "EXERCISE" | "GRAMMAR" | "CHAT" | null;

import { ebnfSpec } from "./spec_from_ebnf";

const sectionNames = new Set(ebnfSpec.markers);

// Per module_format.ebnf: voice_name and speaker_name are alnum/underscore only, no spaces.
const idNoSpacesRe = /^[A-Za-z][A-Za-z0-9_]*$/;

// Valid Gemini TTS voices (from dioco-base/src/modules/tts_gemini.ts)
const VALID_GEMINI_VOICES = new Set([
  "Zephyr",
  "Puck",
  "Charon",
  "Kore",
  "Fenrir",
  "Leda",
  "Orus",
  "Aoede",
  "Callirrhoe",
  "Autonoe",
  "Enceladus",
  "Iapetus",
  "Umbriel",
  "Algieba",
  "Despina",
  "Erinome",
  "Algenib",
  "Rasalgethi",
  "Laomedeia",
  "Achernar",
  "Alnilam",
  "Schedar",
  "Gacrux",
  "Pulcherrima",
  "Achird",
  "Zubenelgenubi",
  "Vindemiatrix",
  "Sadachbia",
  "Sadaltager",
  "Sulafat",
]);

const headerFields = new Set([
  ...ebnfSpec.headerFields,
  ...ebnfSpec.voiceFields,
]);
const voiceFields = new Set(ebnfSpec.voiceFields);
const dialogueFields = new Set(ebnfSpec.dialogueFields);
const exerciseFields = new Set(ebnfSpec.exerciseFields);
const chatFields = new Set(ebnfSpec.chatFields);
const grammarFields = new Set(ebnfSpec.grammarFields);

export function lintModuleText(text: string): Diagnostic[] {
  const diags: Diagnostic[] = [];
  const lines = String(text ?? "").split("\n");

  let sawModuleMarker = false;
  let sawAnySectionMarker = false;
  let inHeader = true;
  let currentActivity: ActivityKind = null;
  let currentLessonLine: number | null = null;

  const seenHeader: Partial<Record<string, number>> = {};
  const seenVoiceSpeaker: Map<string, { line: number; original: string }> =
    new Map(); // lower -> first seen

  // State for simple structural validation inside activities
  let lastDialogueHadLine = false;
  let pendingVocabWord: { line: number } | null = null;
  let pendingExercisePrompt: { line: number } | null = null;
  let pendingExerciseExample: { line: number } | null = null;

  const push = (
    severity: Severity,
    line: number,
    message: string,
    code?: string,
  ) => {
    diags.push({ severity, line, message, code });
  };

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i];
    const trimmedEnd = raw.trimEnd();
    const trimmed = trimmedEnd.trim();

    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;

    // EBNF note: section markers and field names must start at column 0
    const startsWithWs = raw.length > 0 && (raw[0] === " " || raw[0] === "\t");
    if (startsWithWs) {
      const t = raw.trimStart();
      if (t.startsWith("$")) {
        push(
          "error",
          lineNo,
          "Section marker must start at column 0 (no leading whitespace).",
          "section-indent",
        );
      } else if (/^[A-Z_]+:/.test(t)) {
        push(
          "error",
          lineNo,
          "Field must start at column 0 (no leading whitespace).",
          "field-indent",
        );
      }
    }

    // Section markers
    if (trimmedEnd.startsWith("$")) {
      sawAnySectionMarker = true;

      if (/^\$(LESSON|DIALOGUE|EXERCISE|GRAMMAR|CHAT)\s*:/.test(trimmedEnd)) {
        push(
          "error",
          lineNo,
          "Section markers must not use a colon (use `$LESSON Title`, not `$LESSON: Title`).",
          "section-colon",
        );
      }

      const m = trimmedEnd.match(/^\$(\w+)(?:\s+(.*))?$/);
      if (!m) {
        push(
          "warning",
          lineNo,
          "Unrecognized section marker format.",
          "section-format",
        );
        continue;
      }
      const marker = m[1];
      if (!sectionNames.has(marker)) {
        push(
          "warning",
          lineNo,
          `Unknown section marker: $${marker}`,
          "section-unknown",
        );
      }

      // If a vocab entry was started but not completed before a new section marker, warn.
      if (pendingVocabWord) {
        push(
          "warning",
          pendingVocabWord.line,
          "VOCAB must be followed immediately by VOCAB_T (pair).",
          "vocab-missing-vocab_t",
        );
        pendingVocabWord = null;
      }

      if (marker === "MODULE") {
        sawModuleMarker = true;
        inHeader = true;
        currentActivity = null;
      } else if (marker === "LESSON") {
        inHeader = false;
        currentActivity = null;
        currentLessonLine = lineNo;
      } else if (
        marker === "DIALOGUE" ||
        marker === "EXERCISE" ||
        marker === "GRAMMAR" ||
        marker === "CHAT"
      ) {
        inHeader = false;
        currentActivity = marker as ActivityKind;
        if (!currentLessonLine) {
          push(
            "warning",
            lineNo,
            `Found $${marker} before any $LESSON; parser will create a "Default Lesson".`,
            "implicit-lesson",
          );
        }
        // Reset per-activity state
        lastDialogueHadLine = false;
        pendingVocabWord = null;
        pendingExercisePrompt = null;
        pendingExerciseExample = null;
      }

      continue;
    }

    // EXAMPLE marker (exercise)
    if (ebnfSpec.exampleMarker && trimmed === ebnfSpec.exampleMarker) {
      if (currentActivity !== "EXERCISE") {
        push(
          "warning",
          lineNo,
          "EXAMPLE marker is only meaningful inside $EXERCISE.",
          "example-outside-exercise",
        );
      } else {
        // EBNF note: example marker applies to immediately following item.
        pendingExerciseExample = { line: lineNo };
      }
      continue;
    }

    // Field lines
    const fm = trimmedEnd.match(/^([A-Z_]+):\s*(.*)?$/);
    if (fm) {
      const field = fm[1];
      const value = (fm[2] ?? "").trim();

      // Header vs activity validation
      if (inHeader && !currentLessonLine && !currentActivity) {
        if (!headerFields.has(field)) {
          push(
            "warning",
            lineNo,
            `Unknown header field: ${field}`,
            "unknown-header-field",
          );
        } else {
          // Per formal spec, VOICE_SPEAKER (legacy) and VOICE are repeatable; don't mark as duplicate.
          if (field !== "VOICE_SPEAKER" && field !== "VOICE") {
            if (seenHeader[field])
              push(
                "warning",
                lineNo,
                `Duplicate header field: ${field}`,
                "dup-header-field",
              );
            seenHeader[field] = lineNo;
          }
        }

        // Voice config validation (EBNF rules)
        if (field === "VOICE_SPEAKER") {
          push(
            "warning",
            lineNo,
            "VOICE_SPEAKER is deprecated; use VOICE: SpeakerId | Display Name | VoiceName | Optional prompt.",
            "voice_speaker-deprecated",
          );
          // Format: VOICE_SPEAKER: Speaker = VoiceName | optional prompt
          const m = value.match(/^(.+?)\s*=\s*([^|]+)(?:\s*\|\s*(.*))?$/);
          if (!m) {
            push(
              "error",
              lineNo,
              "VOICE_SPEAKER must be `VOICE_SPEAKER: SpeakerName = VoiceName | Optional prompt`.",
              "voice_speaker-format",
            );
          } else {
            const speakerName = m[1].trim();
            const voiceName = m[2].trim();
            if (!idNoSpacesRe.test(speakerName))
              push(
                "warning",
                lineNo,
                `VOICE_SPEAKER label must be alnum only (no spaces): "${speakerName}"`,
                "voice_speaker-label",
              );
            if (!idNoSpacesRe.test(voiceName))
              push(
                "warning",
                lineNo,
                `Voice name must be alnum only (no spaces): "${voiceName}"`,
                "voice_name",
              );
            if (!VALID_GEMINI_VOICES.has(voiceName))
              push(
                "error",
                lineNo,
                `Unknown Gemini voice: "${voiceName}". Valid voices: ${[...VALID_GEMINI_VOICES].slice(0, 5).join(", ")}...`,
                "voice-invalid",
              );

            // Duplicate speaker mapping checks (case-insensitive).
            const key = speakerName.toLowerCase();
            const prev = seenVoiceSpeaker.get(key);
            if (prev) {
              push(
                "warning",
                lineNo,
                `Duplicate VOICE_SPEAKER mapping for "${prev.original}" (previous at L${prev.line}).`,
                "voice_speaker-dup",
              );
            } else {
              seenVoiceSpeaker.set(key, {
                line: lineNo,
                original: speakerName,
              });
            }

            // Casing consistency check (labels are case-insensitive; prefer consistent casing).
            if (prev && prev.original !== speakerName) {
              push(
                "warning",
                lineNo,
                `VOICE_SPEAKER label casing differs ("${prev.original}" vs "${speakerName}"). Use consistent casing.`,
                "voice_speaker-case",
              );
            }
          }
        }
        if (field === "VOICE") {
          // Format: VOICE: SpeakerId | Display Name | VoiceName | optional prompt
          const parts = value.split("|").map((s) => s.trim());
          if (parts.length < 3) {
            push(
              "error",
              lineNo,
              "VOICE must be `VOICE: SpeakerId | Display Name | VoiceName | Optional prompt`.",
              "voice-format",
            );
          } else {
            const speakerId = parts[0];
            const displayName = parts[1];
            const voiceName = parts[2];
            if (!idNoSpacesRe.test(speakerId))
              push(
                "warning",
                lineNo,
                `VOICE speakerId must be alnum/_ only (no spaces): "${speakerId}"`,
                "voice-speaker-id",
              );
            if (!displayName)
              push(
                "warning",
                lineNo,
                "VOICE display name is empty; provide a display name for readable speaker labels.",
                "voice-display-empty",
              );
            if (!idNoSpacesRe.test(voiceName))
              push(
                "warning",
                lineNo,
                `Voice name must be alnum/_ only (no spaces): "${voiceName}"`,
                "voice_name",
              );
            if (!VALID_GEMINI_VOICES.has(voiceName))
              push(
                "error",
                lineNo,
                `Unknown Gemini voice: "${voiceName}". Valid voices: ${[...VALID_GEMINI_VOICES].slice(0, 5).join(", ")}...`,
                "voice-invalid",
              );
          }
        }
        if (
          voiceFields.has(field) &&
          field !== "VOICE_SPEAKER" &&
          field !== "VOICE"
        ) {
          const m = value.match(/^([^|]+)(?:\s*\|\s*(.*))?$/);
          if (m) {
            const voiceName = m[1].trim();
            if (!idNoSpacesRe.test(voiceName))
              push(
                "warning",
                lineNo,
                `Voice name must be alnum only (no spaces): "${voiceName}"`,
                "voice_name",
              );
            if (!VALID_GEMINI_VOICES.has(voiceName))
              push(
                "error",
                lineNo,
                `Unknown Gemini voice: "${voiceName}". Valid voices: ${[...VALID_GEMINI_VOICES].slice(0, 5).join(", ")}...`,
                "voice-invalid",
              );
          }
        }
      } else if (currentActivity) {
        const allowed =
          currentActivity === "DIALOGUE"
            ? dialogueFields
            : currentActivity === "EXERCISE"
              ? exerciseFields
              : currentActivity === "CHAT"
                ? chatFields
                : currentActivity === "GRAMMAR"
                  ? grammarFields
                  : null;

        if (allowed && !allowed.has(field)) {
          // Special-case: IMAGE inside GRAMMAR is not in EBNF and is ignored by lc_parser.
          if (currentActivity === "GRAMMAR" && field === "IMAGE") {
            push(
              "warning",
              lineNo,
              "IMAGE inside $GRAMMAR is not in the formal grammar and is ignored by lc_parser. Use markdown image syntax `![alt](file.png)`.",
              "grammar-image-ignored",
            );
          } else {
            push(
              "warning",
              lineNo,
              `Field ${field} is not expected inside $${currentActivity}.`,
              "field-unexpected",
            );
          }
        }

        // EBNF note: in GRAMMAR, markdown lines should not look like FIELD: lines (parser may swallow them).
        if (currentActivity === "GRAMMAR" && field !== "INTRO") {
          push(
            "warning",
            lineNo,
            `Line looks like a field (${field}:) inside $GRAMMAR. lc_parser will likely NOT include it in markdown content.`,
            "grammar-field-swallowed",
          );
        }
      } else {
        // field line outside of a known activity: could still be header-ish if $MODULE omitted
        if (!sawModuleMarker && headerFields.has(field)) {
          push(
            "warning",
            lineNo,
            `Header field ${field} appears before $MODULE. Add a $MODULE header.`,
            "header-before-module",
          );
        } else {
          push(
            "warning",
            lineNo,
            `Field ${field} appears outside an activity; it will likely be ignored.`,
            "field-outside-activity",
          );
        }
      }

      // Structural checks
      if (currentActivity === "DIALOGUE") {
        if (field === "LINE") lastDialogueHadLine = true;
        if (field === "LINE_T" && !lastDialogueHadLine) {
          push(
            "warning",
            lineNo,
            "LINE_T appears without a preceding LINE in the current dialogue context.",
            "line_t-without-line",
          );
        }
        // EBNF: vocab_entry = VOCAB then VOCAB_T immediately.
        if (field === "VOCAB") {
          if (pendingVocabWord) {
            push(
              "warning",
              pendingVocabWord.line,
              "VOCAB must be followed immediately by VOCAB_T (pair).",
              "vocab-missing-vocab_t",
            );
          }
          pendingVocabWord = { line: lineNo };
        }
        if (field === "VOCAB_T" && !pendingVocabWord) {
          push(
            "warning",
            lineNo,
            "VOCAB_T appears without a preceding VOCAB.",
            "vocab_t-without-vocab",
          );
        }
        if (field === "VOCAB_T") pendingVocabWord = null;

        // If we hit a LINE/SPEAKER while vocab is pending, warn (pair broken).
        if ((field === "SPEAKER" || field === "LINE") && pendingVocabWord) {
          push(
            "warning",
            pendingVocabWord.line,
            "VOCAB must be followed immediately by VOCAB_T (pair).",
            "vocab-missing-vocab_t",
          );
          pendingVocabWord = null;
        }
      } else if (currentActivity === "EXERCISE") {
        if (field === "PROMPT") pendingExercisePrompt = { line: lineNo };
        if (field === "RESPONSE" && !pendingExercisePrompt) {
          push(
            "warning",
            lineNo,
            "RESPONSE appears before PROMPT.",
            "response-before-prompt",
          );
        }
        if (field === "PROMPT" && value === "")
          push("warning", lineNo, "PROMPT is empty.", "empty-prompt");
        if (field === "RESPONSE" && value === "")
          push("warning", lineNo, "RESPONSE is empty.", "empty-response");
        if (field === "RESPONSE") pendingExercisePrompt = null;

        // If EXAMPLE marker was seen but no PROMPT followed, warn.
        if (field === "PROMPT" && pendingExerciseExample) {
          pendingExerciseExample = null; // consumed
        }
      }

      continue;
    }

    // Raw content line
    if (currentActivity === "GRAMMAR") {
      // ok (markdown)
    } else if (
      currentActivity === "DIALOGUE" ||
      currentActivity === "EXERCISE" ||
      currentActivity === "CHAT"
    ) {
      // Parser treats these as buffer content; for dialogue/exercise we expect mostly structured fields
      push(
        "warning",
        lineNo,
        `Unstructured content line inside $${currentActivity}. Did you forget a FIELD: prefix?`,
        "raw-content",
      );
    } else {
      push(
        "warning",
        lineNo,
        "Content line appears outside any activity; it will be ignored.",
        "content-outside",
      );
    }
  }

  // End-of-file: pending pairs/state
  if (pendingVocabWord) {
    push(
      "warning",
      pendingVocabWord.line,
      "VOCAB must be followed immediately by VOCAB_T (pair).",
      "vocab-missing-vocab_t",
    );
  }
  if (pendingExerciseExample) {
    push(
      "warning",
      pendingExerciseExample.line,
      "EXAMPLE marker must be immediately followed by an exercise item (PROMPT...).",
      "example-not-applied",
    );
  }

  // Required header fields
  if (!sawAnySectionMarker) {
    push(
      "error",
      1,
      "No section markers found. A .module should contain at least `$MODULE` and `$LESSON`/activities.",
      "no-sections",
    );
  }
  if (!sawModuleMarker) {
    push("error", 1, "Missing `$MODULE` header.", "missing-module");
  }
  if (sawModuleMarker) {
    if (!seenHeader.DIOCO_DOC_ID)
      push(
        "error",
        1,
        "Missing required header field: DIOCO_DOC_ID",
        "missing-dioco-doc-id",
      );
    if (!seenHeader.TITLE)
      push("error", 1, "Missing required header field: TITLE", "missing-title");
    if (!seenHeader.TARGET_LANG_G)
      push(
        "error",
        1,
        "Missing required header field: TARGET_LANG_G",
        "missing-target-lang",
      );
    if (!seenHeader.HOME_LANG_G && !seenHeader.USER_LANG_G)
      push(
        "error",
        1,
        "Missing required header field: HOME_LANG_G (or legacy USER_LANG_G)",
        "missing-home-lang",
      );
  }

  return diags.sort((a, b) =>
    a.severity === b.severity
      ? a.line - b.line
      : a.severity === "error"
        ? -1
        : 1,
  );
}
