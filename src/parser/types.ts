import { langCode_G_t } from "./lang";

export interface Course {
  diocoDocId: string;
  diocoPlaylistId: string;
  title: string;
  description: string;
  image: string | null;
  targetLang_G: langCode_G_t;
  homeLang_G: langCode_G_t;
}

export interface VoiceSpec {
  voice: string;
  prompt: string | null;
  displayName?: string | null;
}

export interface ModuleVoiceConfig {
  default: string | VoiceSpec | null;
  prompt: string | VoiceSpec | null;
  response: string | VoiceSpec | null;
  introVoice?: string | VoiceSpec | null;
  speakers: { [speakerName: string]: string | VoiceSpec };
}

export interface Module {
  moduleKey: string;
  title: string;
  description: string | null;
  image: string | null;
  targetLang_G: langCode_G_t;
  homeLang_G: langCode_G_t;
  voiceConfig: ModuleVoiceConfig;
  ttsPrompt: string | null;
  lessons: LessonContent[];
}

export interface LessonContent {
  id: string;
  title: string;
  activities: Activity[];
}

export type Activity =
  | DialogueActivity
  | GrammarActivity
  | ExerciseActivity
  | ChatActivity;

export interface ActivityBase {
  type: "DIALOGUE" | "GRAMMAR" | "EXERCISE" | "CHAT";
  id: string;
  title: string;
  intro?: string | null;
}

export interface DialogueActivity extends ActivityBase {
  type: "DIALOGUE";
  instruction: string | null;
  ttsPrompt: string | null;
  lines: DialogueLine[];
}

export interface DialogueLine {
  speaker: string | null;
  text: string;
  translation: string;
  notes: string | null;
  image: string | null;
  vocab: { word: string; definition: string }[] | null;
}

export interface GrammarActivity extends ActivityBase {
  type: "GRAMMAR";
  content: string;
}

export interface ExerciseActivity extends ActivityBase {
  type: "EXERCISE";
  instruction: string | null;
  ttsPrompt: string | null;
  items: ExerciseItem[];
}

export interface ExerciseItem {
  prompt: string;
  promptTranslation: string | null;
  promptImage: string | null;
  response: string;
  responseTranslation: string | null;
  responseImage: string | null;
  isExample: boolean;
}

export interface ChatActivity extends ActivityBase {
  type: "CHAT";
  scenario: string;
  initialPrompt: string;
}
