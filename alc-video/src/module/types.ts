// Types for data/module-manifest.json (built by scripts/build-module-manifest.mjs
// directly from FORMAT v2 .module files).

export type ActType = "DIALOGUE" | "SELECT" | "PRODUCE";

type ActMeta = {
  actType: ActType;
  actTitle: string;
  actTitleRu?: string | null;
  actIndex: number;
  actCount: number;
};

export type TitleSeg = {
  kind: "TITLE";
  durationSec: number;
  title: string;
  titleRu?: string;
  subtitle: string;
};

export type ActivityIntroSeg = ActMeta & {
  kind: "ACTIVITY_INTRO";
  durationSec: number;
  introEn: string | null;
  introRu: string | null;
  instructionEn: string | null;
  instructionRu: string | null;
  /** Generated narrator TTS for the intro text (scripts/build-module-manifest.mjs). */
  introClip?: string | null;
  introClipDur?: number | null;
};

export type VocabChip = { en: string; ru: string | null };

export type DialogueLineSeg = ActMeta & {
  kind: "DIALOGUE_LINE";
  durationSec: number;
  itemNo: number;
  itemCount: number;
  speaker: string | null;
  en: string;
  ru: string | null;
  image: string | null;
  vocab: VocabChip[];
  clip: string | null;
  clipDur: number | null;
  clipAt: number;
  repeat: boolean;
  repeatAt: number | null;
  repeatDur: number | null;
};

export type SelectOptionSeg = {
  id: string;
  textEn: string | null;
  textRu: string | null;
  image: string | null;
  clip: string | null;
  clipDur: number | null;
};

export type SelectItemSeg = ActMeta & {
  kind: "SELECT_ITEM";
  durationSec: number;
  itemNo: number;
  itemCount: number;
  promptEn: string | null;
  promptRu: string | null;
  templateEn: string | null;
  templateRu: string | null;
  audioOnly: boolean;
  image: string | null;
  clip: string | null;
  clipDur: number | null;
  clipAt: number;
  options: SelectOptionSeg[];
  answer: string[];
  revealAt: number;
  answerClipAt: number | null;
  feedbackEn: string | null;
  feedbackRu: string | null;
  isExample: boolean;
};

export type ProduceItemSeg = ActMeta & {
  kind: "PRODUCE_ITEM";
  durationSec: number;
  itemNo: number;
  itemCount: number;
  templateEn: string | null;
  templateRu: string | null;
  promptEn: string | null;
  promptRu: string | null;
  /** Hidden-prompt default: text stays "listen only" until the reveal. */
  audioOnly: boolean;
  image: string | null;
  clip: string | null;
  clipDur: number | null;
  clipAt: number;
  responseEn: string | null;
  responseRu: string | null;
  responseClip: string | null;
  responseClipDur: number | null;
  revealAt: number;
  responseClipAt: number | null;
  isExample: boolean;
};

export type LessonEndSeg = {
  kind: "LESSON_END";
  durationSec: number;
  title: string;
};

export type ModuleSeg =
  | TitleSeg
  | ActivityIntroSeg
  | DialogueLineSeg
  | SelectItemSeg
  | ProduceItemSeg
  | LessonEndSeg;

export type ModuleLessonData = {
  id: string;
  title: string;
  durationSec: number;
  segments: ModuleSeg[];
};

export type ModuleManifest = {
  generatedAt: string;
  fps: number;
  width: number;
  height: number;
  lessons: ModuleLessonData[];
};
