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

// Mirrors module-convert/shared/module_format.ebnf (format v2).
export const ebnfSpec: EbnfSpec = {
  markers: ["CHAT", "DIALOGUE", "GRAMMAR", "LESSON", "MODULE", "PRODUCE", "SELECT"],
  headerFields: [
    "DESCRIPTION",
    "DIOCO_DOC_ID",
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
  dialogueFields: [
    "AUDIO",
    "IMAGE",
    "INSTRUCTION",
    "INTRO",
    "LINE",
    "NOTES",
    "SPEAKER",
    "TTS_PROMPT",
    "VOCAB",
  ],
  selectFields: [
    "ANSWER",
    "AUDIO",
    "FEEDBACK",
    "IMAGE",
    "INSTRUCTION",
    "INTRO",
    "OPTION",
    "OPTION_IMAGE",
    "PROMPT",
    "PROMPT_IMAGE",
  ],
  produceFields: [
    "ACCEPT",
    "AUDIO",
    "CHECK",
    "IMAGE",
    "INPUT",
    "INSTRUCTION",
    "INTRO",
    "PROMPT",
    "PROMPT_IMAGE",
    "RESPONSE",
    "RESPONSE_AUDIO",
    "RUBRIC",
    "TEMPLATE",
    "TTS_PROMPT",
  ],
  grammarFields: ["INTRO"],
  chatFields: ["INITIAL_PROMPT", "INTRO", "SCENARIO"],
  flags: ["AUDIO_ONLY", "MULTI", "REPEAT"],
  exampleMarker: "EXAMPLE",
};
