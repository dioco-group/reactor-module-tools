/**
 * Minimal subset of `dioco-shared/src/types/lc_types.ts` used by `lc_parser.ts`
 * for the module preview tool.
 *
 * We keep runtime fields aligned with the real shapes, but omit backend-only NLP/TTS
 * types to avoid dragging in the full dioco-shared dependency graph.
 */

import { langCode_G_t } from './lang';

// -----------------------------------------------------------------------------
// COURSE
// -----------------------------------------------------------------------------

export interface Course {
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
    diocoDocId: string;
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
    /** Optional human-readable speaker label (used for 3+ speaker single-voice fallback) */
    displayName?: string | null;
}

/**
 * NOTE: This matches the newer `lc_parser.ts` behavior (VOICE_* can carry `{voice, prompt}`),
 * but we keep unions for backwards compatibility with any older modules/tools.
 */
export interface ModuleVoiceConfig {
    default: string | VoiceSpec | null;
    prompt: string | VoiceSpec | null;
    response: string | VoiceSpec | null;
    introVoice?: string | VoiceSpec | null;
    speakers: { [speakerName: string]: string | VoiceSpec };
}

export interface Module {
    diocoDocId: string;
    title: string;
    description: string | null;
    image: string | null;
    targetLang_G: langCode_G_t;
    homeLang_G: langCode_G_t;
    voiceConfig: ModuleVoiceConfig;
    ttsPrompt: string | null;
    lessons: LessonContent[];
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

export type Activity = DialogueActivity | GrammarActivity | ExerciseActivity | ChatActivity;

export interface ActivityBase {
    type: 'DIALOGUE' | 'GRAMMAR' | 'EXERCISE' | 'CHAT';
    id: string;
    title: string;
    /** Spoken introduction for the activity (transition/context) */
    intro?: string | null;
}

export interface DialogueActivity extends ActivityBase {
    type: 'DIALOGUE';
    instruction: string | null;
    ttsPrompt: string | null;
    lines: DialogueLine[];
}

export interface DialogueLine {
    speaker: string | null;
    text: string;
    translation: string;
    notes: string | null;
    vocab: { word: string; definition: string }[] | null;
    // Backend-populated:
    nlp: unknown | null;
    ttsDataURL: string | null;
}

export interface GrammarActivity extends ActivityBase {
    type: 'GRAMMAR';
    image: string | null;
    content: string;
    // Backend-populated in app (not in this parser):
    phrases: unknown[];
}

export interface ExerciseActivity extends ActivityBase {
    type: 'EXERCISE';
    instruction: string | null;
    ttsPrompt: string | null;
    items: ExerciseItem[];
}

export interface ExerciseItem {
    prompt: string;
    promptTranslation: string | null;
    response: string;
    responseTranslation: string | null;
    isExample: boolean;
    // Backend-populated:
    promptNlp: unknown | null;
    responseNlp: unknown | null;
    promptTtsDataURL: string | null;
    responseTtsDataURL: string | null;
}

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
        diocoDocId: module.diocoDocId,
        title: module.title,
        description: module.description,
        image: module.image,
        homeLang_G: module.homeLang_G,
        lessonCount: module.lessons.length,
        activityCount,
    };
}


