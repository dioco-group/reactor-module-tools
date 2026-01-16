/**
 * AUTO-GENERATED (and overwritten) by `module-preview/build.mjs` from:
 * `module-convert/shared/module_format.ebnf`
 *
 * Do not hand-edit.
 */

export type EbnfSpec = {
  markers: string[];
  headerFields: string[];
  voiceFields: string[];
  dialogueFields: string[];
  exerciseFields: string[];
  grammarFields: string[];
  chatFields: string[];
  exampleMarker: string | null;
};

export const ebnfSpec: EbnfSpec = {
  "markers": [
    "CHAT",
    "DIALOGUE",
    "EXERCISE",
    "GRAMMAR",
    "LESSON",
    "MODULE"
  ],
  "headerFields": [
    "DESCRIPTION",
    "DIOCO_DOC_ID",
    "HOME_LANG_G",
    "IMAGE",
    "TARGET_LANG_G",
    "TITLE",
    "USER_LANG_G"
  ],
  "voiceFields": [
    "VOICE_DEFAULT",
    "VOICE_INTRO",
    "VOICE_PROMPT",
    "VOICE_RESPONSE",
    "VOICE_SPEAKER"
  ],
  "dialogueFields": [
    "INSTRUCTION",
    "INTRO",
    "LINE",
    "LINE_T",
    "NOTES",
    "SPEAKER",
    "VOCAB",
    "VOCAB_T"
  ],
  "exerciseFields": [
    "INSTRUCTION",
    "INTRO",
    "PROMPT",
    "PROMPT_T",
    "RESPONSE",
    "RESPONSE_T"
  ],
  "grammarFields": [
    "INTRO"
  ],
  "chatFields": [
    "INITIAL_PROMPT",
    "INTRO",
    "SCENARIO"
  ],
  "exampleMarker": "EXAMPLE"
};
