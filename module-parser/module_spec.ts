/**
 * CANONICAL format-v2 spec tables (mirrors module-convert/shared/module_format.ebnf).
 *
 * This file is synced verbatim to:
 *   - reactor-module-tools/module-preview/src/module_spec.ts
 *   - lr-cursor-extension/src/parser/module_spec.ts
 * Edit it HERE and run `node module-parser/sync.mjs`.
 */

export type EbnfSpec = {
  markers: string[];
  headerFields: string[];
  voiceFields: string[];
  dialogueFields: string[];
  selectFields: string[];
  produceFields: string[];
  grammarFields: string[];
  chatFields: string[];
  flags: string[];
  exampleMarker: string | null;
};

export const ebnfSpec: EbnfSpec = {
  markers: ["CHAT", "DIALOGUE", "GRAMMAR", "LESSON", "MODULE", "PRODUCE", "SELECT"],
  headerFields: [
    "DESCRIPTION",
    "DIOCO_DOC_ID",
    "FORMAT",
    "HOME_LANG_G",
    "IMAGE",
    "TARGET_LANG_G",
    "TITLE",
    "TTS_PROMPT",
    "USER_LANG_G",
  ],
  voiceFields: [
    "VOICE",
    "VOICE_DEFAULT",
    "VOICE_INTRO",
    "VOICE_PROMPT",
    "VOICE_RESPONSE",
    "VOICE_SPEAKER",
  ],
  // Speakers are screenplay-style (`Jim: text`), images/audio ride content
  // lines inline ({page.jpg} / {clip.mp3}) — so no SPEAKER / *_IMAGE fields.
  dialogueFields: [
    "IMAGE", // activity-level shared reference image only (before the first line)
    "INSTRUCTION",
    "INTRO",
    "LINE",
    "NOTES",
    "TTS_PROMPT",
    "VOCAB",
  ],
  selectFields: [
    "ANSWER",
    "FEEDBACK",
    "IMAGE", // activity-level shared reference image only
    "INSTRUCTION",
    "INTRO",
    "OPTION",
    "PROMPT",
    "TEMPLATE",
  ],
  produceFields: [
    "ACCEPT",
    "CHECK",
    "IMAGE", // activity-level shared grounding image only
    "INPUT",
    "INSTRUCTION",
    "INTRO",
    "PROMPT",
    "RESPONSE",
    "RUBRIC",
    "TEMPLATE",
    "TTS_PROMPT",
  ],
  grammarFields: ["INTRO"],
  chatFields: ["INITIAL_PROMPT", "INTRO", "SCENARIO"],
  flags: ["MULTI", "REPEAT", "SHOW_PROMPT"],
  exampleMarker: "EXAMPLE",
};
