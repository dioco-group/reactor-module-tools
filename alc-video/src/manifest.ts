import manifestJson from "../data/manifest.json";

export type Word = { start: number; end: number; word: string };

export type SegImage = {
  path: string;
  publicPath?: string;
  caption: string;
  panel: number | null;
};

export type Role =
  | "instruction"
  | "model"
  | "prompt"
  | "answer"
  | "example"
  | "dialog"
  | "letters"
  | "numbers"
  | "other";

export type Segment = {
  start: number;
  end: number;
  en: string;
  ru: string;
  role: Role;
  itemNumber: number | null;
  image: SegImage | null;
  words: Word[];
};

export type FigureImage = {
  index: number;
  panel: number | null;
  path: string;
  caption: string;
};

export type Figure = {
  n: number;
  instruction: string | null;
  instructionEn?: string | null;
  instructionRu: string | null;
  activityType: string | null;
  audioSrc: string;
  audioPublic: string;
  durationSec: number | null;
  images: FigureImage[];
  segments: Segment[];
};

export type Lesson = {
  id: string;
  title: string;
  figures: Figure[];
};

export type Manifest = {
  generatedAt: string;
  fps: number;
  width: number;
  height: number;
  lessons: Lesson[];
};

export const manifest = manifestJson as unknown as Manifest;

export function getLesson(id: string): Lesson | undefined {
  return manifest.lessons.find((l) => l.id === id);
}
