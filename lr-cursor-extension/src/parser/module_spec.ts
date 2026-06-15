// AUTO-SYNCED COPY — DO NOT EDIT.
// Canonical source: reactor-module-tools/module-parser/module_spec.ts
// To update: edit the canonical file, then run `node module-parser/sync.mjs`.

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
  // NOTE: the module TITLE and cover IMAGE are NOT header fields — they ride the
  // `$MODULE <title> {cover.jpg}` marker line (consistent with every other marker).
  headerFields: [
    "DESCRIPTION",
    "DIOCO_DOC_ID",
    "FORMAT",
    "HOME_LANG_G",
    "TARGET_LANG_G",
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
  // Speakers are screenplay-style (`Jim: text`); images/audio ride content lines
  // inline ({page.jpg} / {clip.mp3}); the activity-wide image rides the marker
  // title line (`$DIALOGUE Title {page.jpg}`) — so no SPEAKER / IMAGE / *_IMAGE fields.
  dialogueFields: [
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
    "INSTRUCTION",
    "INTRO",
    "OPTION",
    "PROMPT",
    "TEMPLATE",
  ],
  produceFields: [
    "ACCEPT",
    "CHECK",
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
