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

// =============================================================================
// ACTIVITIES (format v2)
// =============================================================================

export type ActivityType = "DIALOGUE" | "GRAMMAR" | "SELECT" | "PRODUCE" | "CHAT";

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
  intro?: string | null;
}

// DIALOGUE -------------------------------------------------------------------

export interface DialogueActivity extends ActivityBase {
  type: "DIALOGUE";
  instruction: string | null;
  ttsPrompt: string | null;
  repeat: boolean;
  lines: DialogueLine[];
}

export interface DialogueLine {
  speaker: string | null;
  text: string;
  translation: string | null;
  notes: string | null;
  image: string | null;
  vocab: { word: string; definition: string | null }[] | null;
  audio: string | null;
}

// GRAMMAR --------------------------------------------------------------------

export interface GrammarActivity extends ActivityBase {
  type: "GRAMMAR";
  content: string;
}

// SELECT ---------------------------------------------------------------------

export interface SelectActivity extends ActivityBase {
  type: "SELECT";
  instruction: string | null;
  audioOnly: boolean;
  multi: boolean;
  image: string | null;
  options: SelectOption[];
  items: SelectItem[];
}

export interface SelectOption {
  id: string;
  text: string | null;
  translation: string | null;
  image: string | null;
}

export interface SelectItem {
  prompt: string;
  promptTranslation: string | null;
  promptImage: string | null;
  options: SelectOption[] | null;
  answer: string[];
  feedback: string | null;
  feedbackTranslation: string | null;
  audio: string | null;
  isExample: boolean;
}

// PRODUCE --------------------------------------------------------------------

export type ProduceInput = "type" | "speak" | "either";
export type ProduceCheck = "reveal" | "exact" | "llm";

export interface ProduceActivity extends ActivityBase {
  type: "PRODUCE";
  instruction: string | null;
  ttsPrompt: string | null;
  input: ProduceInput;
  check: ProduceCheck;
  audioOnly: boolean;
  items: ProduceItem[];
}

export interface ProduceItem {
  prompt: string | null;
  promptTranslation: string | null;
  promptImage: string | null;
  template: string | null;
  audio: string | null;
  response: string | null;
  responseTranslation: string | null;
  responseAudio: string | null;
  accept: string[] | null;
  rubric: string | null;
  isExample: boolean;
}

// CHAT -----------------------------------------------------------------------

export interface ChatActivity extends ActivityBase {
  type: "CHAT";
  scenario: string;
  initialPrompt: string;
}
