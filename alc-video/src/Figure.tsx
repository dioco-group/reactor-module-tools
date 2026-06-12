import React from "react";
import {
  AbsoluteFill,
  Audio,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { theme } from "./theme";
import type { Figure as FigureT, Segment } from "./manifest";
import {
  badgeFor,
  captionState,
  displayMode,
  effectiveActivity,
  inRepeatPause,
} from "./activity";
import { ActivityBadge } from "./components/ActivityBadge";
import { TaskCard } from "./components/TaskCard";
import { CaptionBlock } from "./components/CaptionBlock";
import { RepeatCue } from "./components/RepeatCue";
import { ImageCard, ListenIndicator, Watermark } from "./components/Stage";

function activeSegmentIndex(segments: Segment[], t: number): number {
  let idx = -1;
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].start <= t) idx = i;
    else break;
  }
  return idx;
}

function currentImage(segments: Segment[], idx: number) {
  for (let i = idx; i >= 0; i--) {
    if (segments[i].image) return segments[i].image;
    if (segments[i].role === "instruction") break; // reset between instructions
  }
  return null;
}

export const Figure: React.FC<{ figure: FigureT; lessonTitle: string }> = ({
  figure,
  lessonTitle,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const idx = activeSegmentIndex(figure.segments, t);
  const seg = idx >= 0 ? figure.segments[idx] : null;
  const badge = badgeFor(figure);
  const mode = displayMode(figure);
  const figureLabel = `${lessonTitle} · Figure ${figure.n}`;

  const cap = captionState(figure, seg, t);
  const image = seg && seg.role !== "instruction" ? currentImage(figure.segments, idx) : null;
  const repeatPause = inRepeatPause(figure, figure.segments, idx, t);

  const isInstruction = !seg || seg.role === "instruction";
  const showListen = mode === "listen" && seg != null && !cap.revealed && !cap.show;

  const fadeIn = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
      <Audio src={staticFile(figure.audioPublic)} />

      {/* Header (hidden during the centered instruction card to avoid clutter) */}
      {!isInstruction ? (
        <div
          style={{
            position: "absolute",
            top: 44,
            left: 72,
            right: 72,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontFamily: theme.fontStack,
          }}
        >
          <div style={{ fontSize: 34, fontWeight: 800, color: "#e2e8f0" }}>
            {lessonTitle}
            <span style={{ color: theme.accent }}> · Figure {figure.n}</span>
          </div>
          <ActivityBadge badge={badge} />
        </div>
      ) : null}

      {/* Center stage */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          paddingTop: 20,
          paddingBottom: cap.show ? 320 : 60,
        }}
      >
        {isInstruction ? (
          <TaskCard
            badge={badge}
            ru={seg?.ru || figure.instructionRu || ""}
            en={seg?.en || figure.instructionEn || ""}
            figureLabel={figureLabel}
          />
        ) : image ? (
          <ImageCard image={image} />
        ) : showListen ? (
          <ListenIndicator hint={figure.instructionRu || "Слушайте…"} />
        ) : (
          <Watermark n={figure.n} />
        )}
      </AbsoluteFill>

      {/* Bottom caption */}
      {cap.show ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 64,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <CaptionBlock segment={seg} t={t} isAnswer={cap.isAnswer} />
        </div>
      ) : null}

      {/* Repeat cue during pauses (sits above the caption) */}
      {repeatPause ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: cap.show ? 300 : 120,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <RepeatCue />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
