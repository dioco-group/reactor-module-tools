import type { Figure, Segment } from "./manifest";

export type DisplayMode = "readAlong" | "listen";

export type Badge = { icon: string; label: string };

const BADGES: Record<string, Badge> = {
  repeat_vocab: { icon: "repeat", label: "Повторяйте" },
  repeat_sentence: { icon: "repeat", label: "Повторяйте" },
  repeat_list: { icon: "repeat", label: "Повторяйте" },
  listen_circle: { icon: "headphones", label: "Слушайте и обведите" },
  dictation: { icon: "pencil", label: "Слушайте и пишите" },
  same_different: { icon: "speaker", label: "Одинаково / по-разному" },
  dialog: { icon: "dialog", label: "Диалог" },
  other: { icon: "play", label: "" },
};

export function hasImages(figure: Figure): boolean {
  return (figure.images?.length ?? 0) > 0;
}

// Figure 1 etc. are tagged repeat_sentence but carry illustrations -> vocab.
export function effectiveActivity(figure: Figure): string {
  if (hasImages(figure)) return "repeat_vocab";
  return figure.activityType || "other";
}

export function badgeFor(figure: Figure): Badge {
  return BADGES[effectiveActivity(figure)] || BADGES.other;
}

export function displayMode(figure: Figure): DisplayMode {
  const a = effectiveActivity(figure);
  return a === "listen_circle" || a === "dictation" ? "listen" : "readAlong";
}

const STIMULUS_ROLES = new Set(["prompt", "letters", "numbers"]);

// In listen activities, a stimulus is hidden until it has finished playing,
// so the learner answers first and then sees the confirmation.
export function captionState(
  figure: Figure,
  seg: Segment | null,
  t: number
): {
  show: boolean;
  revealed: boolean; // text confirmed after listening
  isAnswer: boolean;
} {
  if (!seg) return { show: false, revealed: false, isAnswer: false };
  const isAnswer = seg.role === "answer";
  if (seg.role === "instruction") return { show: false, revealed: true, isAnswer };
  if (displayMode(figure) === "listen" && STIMULUS_ROLES.has(seg.role)) {
    const revealed = t >= seg.end - 0.05;
    return { show: revealed, revealed, isAnswer };
  }
  return { show: true, revealed: true, isAnswer };
}

// True when the audio is in a pause after the active segment (used to cue the
// learner to repeat aloud).
export function inRepeatPause(
  figure: Figure,
  segments: Segment[],
  idx: number,
  t: number
): boolean {
  if (displayMode(figure) !== "readAlong") return false;
  if (idx < 0) return false;
  const seg = segments[idx];
  if (seg.role === "instruction") return false;
  const gapStart = seg.end + 0.5;
  const next = segments[idx + 1];
  const gapEnd = next ? next.start - 0.2 : Infinity;
  return t >= gapStart && t < gapEnd && (next ? next.start - seg.end > 1.2 : true);
}
