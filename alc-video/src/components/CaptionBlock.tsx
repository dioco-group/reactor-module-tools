import React from "react";
import { theme } from "../theme";
import type { Segment } from "../manifest";
import { CheckIcon } from "./icons";

export const CaptionBlock: React.FC<{
  segment: Segment | null;
  t: number; // seconds, relative to the figure audio
  isAnswer?: boolean;
}> = ({ segment, t, isAnswer }) => {
  if (!segment) return null;

  // Always display the CORRECTED English (segment.en). Karaoke timing comes from
  // whisper words when token counts line up, otherwise we distribute the segment
  // duration evenly across the corrected tokens.
  const tokens = segment.en.split(/\s+/).filter(Boolean);
  const ww = segment.words;
  let words: { word: string; start: number; end: number }[];
  if (ww.length === tokens.length && ww.length > 0) {
    words = tokens.map((tok, i) => ({ word: tok, start: ww[i].start, end: ww[i].end }));
  } else {
    const t0 = ww.length ? ww[0].start : segment.start;
    const t1 = ww.length ? ww[ww.length - 1].end : segment.end;
    const step = tokens.length > 0 ? (t1 - t0) / tokens.length : 0;
    words = tokens.map((tok, i) => ({
      word: tok,
      start: t0 + i * step,
      end: t0 + (i + 1) * step,
    }));
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        padding: "26px 60px",
        borderRadius: 24,
        background: isAnswer ? "rgba(34,197,94,0.14)" : "transparent",
        border: isAnswer ? "2px solid rgba(74,222,128,0.5)" : "none",
        maxWidth: 1640,
      }}
    >
      {isAnswer ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontFamily: theme.fontStack,
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: 2,
            color: theme.good,
            textTransform: "uppercase",
          }}
        >
          <CheckIcon size={26} color={theme.good} /> Ответ · Answer
        </div>
      ) : null}

      <div
        style={{
          fontFamily: theme.fontStack,
          fontSize: 66,
          fontWeight: 800,
          lineHeight: 1.15,
          textAlign: "center",
          color: "#f8fafc",
          textShadow: "0 2px 18px rgba(0,0,0,0.55)",
        }}
      >
        {words.map((w, i) => {
          const active = t >= w.start && t < w.end && w.end > w.start;
          const spoken = w.end > 0 && t >= w.end;
          return (
            <span
              key={i}
              style={{
                color: active
                  ? theme.accent
                  : spoken
                  ? "#f8fafc"
                  : "rgba(248,250,252,0.55)",
              }}
            >
              {w.word + " "}
            </span>
          );
        })}
      </div>

      {segment.ru ? (
        <div
          style={{
            fontFamily: theme.fontStack,
            fontSize: 46,
            fontWeight: 600,
            lineHeight: 1.2,
            textAlign: "center",
            color: theme.ru,
            textShadow: "0 2px 14px rgba(0,0,0,0.55)",
          }}
        >
          {segment.ru}
        </div>
      ) : null}
    </div>
  );
};
