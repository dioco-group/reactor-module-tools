import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
export const DATA_ROOT = path.resolve(PROJECT_ROOT, "..", "data", "alc-english");

export const AUDIO_SRC = path.join(DATA_ROOT, "audio", "AUDIO");
export const MD_SRC = path.join(DATA_ROOT, "md");
export const IMAGES_SRC = path.join(
  DATA_ROOT,
  "pdf-extract",
  "source",
  "images"
);

export const TRANSCRIPTS_DIR = path.join(PROJECT_ROOT, "data", "transcripts");
export const MANIFEST_PATH = path.join(PROJECT_ROOT, "data", "manifest.json");

export const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");
export const PUBLIC_IMAGES = path.join(PUBLIC_DIR, "images");
export const PUBLIC_AUDIO = path.join(PUBLIC_DIR, "audio");

export const WHISPER_HOSTS = Array.from(
  { length: 8 },
  (_, i) => `http://192.168.200.212:${12000 + i}`
);

// Two-digit figure id -> "Figure 01" style filename stem.
export function figureStem(n) {
  return `Figure ${String(n).padStart(2, "0")}`;
}
