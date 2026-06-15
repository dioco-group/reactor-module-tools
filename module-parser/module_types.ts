/**
 * CANONICAL module-format v2 types (single source of truth).
 *
 * This file is synced verbatim to:
 *   - reactor-module-tools/module-preview/src/module_types.ts
 *   - lr-cursor-extension/src/parser/module_types.ts
 *   - dioco-base/src/modules/module_types.ts
 * Edit it HERE and run `node module-parser/sync.mjs`.
 *
 * Shapes are kept structurally assignable to dioco-shared's lc_types_v2 (the
 * backend authority): enrichment-only fields (nlp/tts/translations) exist here
 * typed as `null` / `string | null` — the parser always emits null for them.
 * If the shapes drift, dioco-base's lc_parser_v2.ts wrapper fails to compile.
 */

/** Language code. Validated strictly in dioco-shared; a plain string here. */
export type langCode_G_t = string;

// -----------------------------------------------------------------------------
// COURSE
// -----------------------------------------------------------------------------

export interface Course {
    diocoDocId: string;
    diocoPlaylistId: string;
    title: string;
    description: string;
    image: string | null;
    targetLang_G: langCode_G_t;
    homeLang_G: langCode_G_t;
}

// -----------------------------------------------------------------------------
// MODULE
// -----------------------------------------------------------------------------

export interface ModuleListItem {
    moduleKey: string;
    title: string;
    description: string | null;
    image: string | null;
    homeLang_G: langCode_G_t;
    lessonCount: number;
    activityCount: number;
}

export interface VoiceSpec {
    voice: string;
    prompt: string | null;
    displayName?: string | null;
}

export interface ModuleVoiceConfig {
    default: VoiceSpec | null;
    prompt: VoiceSpec | null;
    response: VoiceSpec | null;
    introVoice: VoiceSpec | null;
    speakers: { [speakerId: string]: VoiceSpec };
}

export interface Module {
    moduleKey: string;
    title: string;
    description: string | null;
    image: string | null;
    targetLang_G: langCode_G_t;
    /** Language the module's own text is written in (modules are monolingual). */
    homeLang_G: langCode_G_t;
    voiceConfig: ModuleVoiceConfig;
    ttsPrompt: string | null;
    lessons: LessonContent[];
    /** Declared by the `FORMAT: 2` header field. */
    formatVersion: 2;
}

// -----------------------------------------------------------------------------
// LESSON
// -----------------------------------------------------------------------------

export interface LessonContent {
    id: string;
    title: string;
    activities: Activity[];
}

// -----------------------------------------------------------------------------
// ACTIVITIES
// -----------------------------------------------------------------------------

export type ActivityType = 'DIALOGUE' | 'GRAMMAR' | 'SELECT' | 'PRODUCE' | 'CHAT';

export type Activity =
    | DialogueActivity
    | GrammarActivity
    | SelectActivity
    | ProduceActivity
    | ChatActivity;

export interface ActivityBase {
    type: ActivityType;
    id: string;
    title: string;
    intro: string | null;
    /** Enrichment-only (backend TTS); always null at parse time. */
    introTtsDataURL: string | null;
}

// DIALOGUE -------------------------------------------------------------------

export interface DialogueActivity extends ActivityBase {
    type: 'DIALOGUE';
    instruction: string | null;
    ttsPrompt: string | null;
    /** REPEAT flag: after listening, the learner repeats each line aloud. */
    repeat: boolean;
    /** Activity-level shared reference image (map/scene) shown for ALL lines. */
    image: string | null;
    lines: DialogueLine[];
}

export interface DialogueLine {
    speaker: string | null;
    text: string;
    /** Enrichment-only; null at parse time. */
    translation: string | null;
    notes: string | null;
    image: string | null;
    vocab: VocabItem[] | null;
    /** Inline cassette clip filename ({clip.mp3}); played in full. */
    audio: string | null;
    /** Enrichment-only; always null at parse time. */
    nlp: null;
    ttsDataURL: string | null;
}

export interface VocabItem {
    word: string;
    definition: string | null;
    ttsDataURL: string | null;
}

// GRAMMAR --------------------------------------------------------------------

export interface GrammarActivity extends ActivityBase {
    type: 'GRAMMAR';
    content: string;
    /** Extracted {phrases}; filled by enrichment, empty at parse time. */
    phrases: GrammarPhrase[];
}

export interface GrammarPhrase {
    text: string;
    nlp: null;
    ttsDataURL: string | null;
}

// SELECT ---------------------------------------------------------------------

export interface SelectActivity extends ActivityBase {
    type: 'SELECT';
    instruction: string | null;
    /**
     * SHOW_PROMPT flag: show the spoken PROMPT text from the start (the book
     * printed the stimulus). DEFAULT (false) = prompt text is hidden until
     * answered/revealed — a spoken PROMPT is normally tape-only.
     */
    showPrompt: boolean;
    /** MULTI flag: more than one option may be correct. */
    multi: boolean;
    /**
     * REPEAT flag: after the answer is revealed, the learner repeats the model
     * answer aloud (the tape's "Repeat." reinforcement beat). Player replays the
     * answer audio and prompts a say-it-back; not assessed.
     */
    repeat: boolean;
    /** Activity-level shared reference image. */
    image: string | null;
    /** Shared option pool (used when items don't declare their own options). */
    options: SelectOption[];
    items: SelectItem[];
}

export interface SelectOption {
    id: string;
    text: string | null;
    translation: string | null;
    image: string | null;
    /** Inline clip on the OPTION text; played after the learner taps it. */
    audio: string | null;
    ttsDataURL: string | null;
}

export interface SelectItem {
    /** Spoken/read stimulus. May be null when the item is template-only (cloze). */
    prompt: string | null;
    promptTranslation: string | null;
    promptImage: string | null;
    /** On-screen stimulus shown but never read aloud (cloze gap / read-only context). */
    template: string | null;
    /** Per-item options; if null, the activity's shared pool is used. */
    options: SelectOption[] | null;
    /** Correct option id(s). */
    answer: string[];
    feedback: string | null;
    feedbackTranslation: string | null;
    /** Inline clip on the PROMPT; played in full. */
    audio: string | null;
    isExample: boolean;
    promptNlp: null;
    promptTtsDataURL: string | null;
}

// PRODUCE --------------------------------------------------------------------

export type ProduceInput = 'type' | 'speak';
export type ProduceCheck = 'reveal' | 'exact' | 'llm';

export interface ProduceActivity extends ActivityBase {
    type: 'PRODUCE';
    instruction: string | null;
    ttsPrompt: string | null;
    input: ProduceInput;
    check: ProduceCheck;
    /**
     * SHOW_PROMPT flag: show the spoken PROMPT text from the start (the book
     * printed the stimulus). DEFAULT (false) = prompt text is blurred until
     * revealed — the classic drill flow.
     */
    showPrompt: boolean;
    /**
     * REPEAT flag: after the answer is revealed, the learner repeats the model
     * answer aloud (the tape's "Repeat." reinforcement beat). Player replays the
     * answer audio and prompts a say-it-back; not assessed.
     */
    repeat: boolean;
    /** Activity-level shared grounding image (e.g. one picture for all items). */
    image: string | null;
    items: ProduceItem[];
}

export interface ProduceItem {
    /** Spoken/read stimulus. May be null for pure cloze (template-only). */
    prompt: string | null;
    promptTranslation: string | null;
    promptImage: string | null;
    /** On-screen text shown but never read aloud (cloze gap / read-only context). */
    template: string | null;
    /** Inline clip on the PROMPT. */
    audio: string | null;
    /** Model / expected answer; null for open-ended items (check: 'llm'). */
    response: string | null;
    responseTranslation: string | null;
    /** Inline clip on the RESPONSE. */
    responseAudio: string | null;
    accept: string[] | null;
    rubric: string | null;
    isExample: boolean;
    promptNlp: null;
    responseNlp: null;
    promptTtsDataURL: string | null;
    responseTtsDataURL: string | null;
}

// CHAT -----------------------------------------------------------------------

export interface ChatActivity extends ActivityBase {
    type: 'CHAT';
    scenario: string;
    initialPrompt: string;
}

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------

export function getModuleListItem(module: Module): ModuleListItem {
    const activityCount = module.lessons.reduce((sum, lesson) => sum + lesson.activities.length, 0);
    return {
        moduleKey: module.moduleKey,
        title: module.title,
        description: module.description,
        image: module.image,
        homeLang_G: module.homeLang_G,
        lessonCount: module.lessons.length,
        activityCount,
    };
}
