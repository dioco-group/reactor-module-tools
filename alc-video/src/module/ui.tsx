// Shared visual building blocks for the module-driven video.
import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT_STACK } from "../theme";
import { ActType } from "./types";

export const PALETTE = {
  bgTop: "#0f172a",
  bgBottom: "#1e293b",
  panel: "#ffffff",
  ink: "#0f172a",
  muted: "#64748b",
  border: "#e2e8f0",
  ruText: "#b45309", // amber-700 on white
  good: "#16a34a",
  goodSoft: "#dcfce7",
  dim: "#94a3b8",
};

export const ACT_COLORS: Record<ActType, { main: string; soft: string; label: string; labelRu: string }> = {
  DIALOGUE: { main: "#16a34a", soft: "#dcfce7", label: "DIALOGUE", labelRu: "Диалог" },
  SELECT: { main: "#d97706", soft: "#fef3c7", label: "CHOOSE", labelRu: "Выберите" },
  PRODUCE: { main: "#7c3aed", soft: "#ede9fe", label: "PRACTICE", labelRu: "Практика" },
};

export const Bg: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      background: `linear-gradient(180deg, ${PALETTE.bgTop} 0%, ${PALETTE.bgBottom} 100%)`,
      fontFamily: FONT_STACK,
    }}
  >
    {children}
  </div>
);

export const FadeIn: React.FC<{ at?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ at = 0, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [at * fps, at * fps + 0.35 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(frame, [at * fps, at * fps + 0.35 * fps], [14, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return <div style={{ opacity, transform: `translateY(${y}px)`, ...style }}>{children}</div>;
};

/** Top bar: lesson title left, activity badge + item counter right. */
export const Header: React.FC<{
  lessonTitle: string;
  actType?: ActType;
  actTitle?: string;
  itemNo?: number;
  itemCount?: number;
}> = ({ lessonTitle, actType, actTitle, itemNo, itemCount }) => {
  const c = actType ? ACT_COLORS[actType] : null;
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 64,
        display: "flex",
        alignItems: "center",
        padding: "0 36px",
        color: "#cbd5e1",
        fontSize: 22,
        gap: 16,
      }}
    >
      <div style={{ fontWeight: 700, color: "#e2e8f0" }}>{lessonTitle}</div>
      <div style={{ flex: 1 }} />
      {c && (
        <div
          style={{
            background: c.main,
            color: "white",
            borderRadius: 999,
            padding: "4px 18px",
            fontSize: 19,
            fontWeight: 700,
            letterSpacing: 1,
          }}
        >
          {c.labelRu}
        </div>
      )}
      {actTitle && <div style={{ fontSize: 20, color: "#94a3b8", maxWidth: 420, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{actTitle}</div>}
      {/* Item counter moved to the bottom-right corner (CornerCounter). */}
    </div>
  );
};

/** Central white panel. */
export const Panel: React.FC<{ children: React.ReactNode; wide?: boolean }> = ({ children, wide }) => (
  <div
    style={{
      position: "absolute",
      top: 84,
      bottom: 56,
      left: "50%",
      transform: "translateX(-50%)",
      width: wide ? 1160 : 980,
      background: PALETTE.panel,
      borderRadius: 24,
      boxShadow: "0 24px 70px rgba(0,0,0,0.45)",
      padding: "36px 48px",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

/**
 * Pulsing speaker glyph shown while a clip is playing. ALWAYS occupies its
 * space (hidden via opacity) so the line layout never jumps when audio starts.
 */
export const AudioPulse: React.FC<{ activeFrom: number; activeTo: number; color: string }> = ({ activeFrom, activeTo, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const active = frame >= activeFrom * fps && frame <= activeTo * fps;
  const pulse = active ? 0.75 + 0.25 * Math.sin((frame / fps) * Math.PI * 4) : 0;
  return (
    <div style={{ fontSize: 30, width: 34, opacity: pulse, color, fontWeight: 800 }} aria-hidden>
      ♪
    </div>
  );
};

/**
 * Calm "your turn" cue between t0..t1 (seconds): a label with three softly
 * breathing dots — no draining bar, no 5-4-3-2-1 stress.
 */
export const Countdown: React.FC<{ t0: number; t1: number; color: string; label: string }> = ({ t0, t1, color, label }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // ALWAYS occupies its space — fading in/out via opacity only, so the layout
  // never jumps when the cue appears or ends.
  const active = frame >= t0 * fps && frame <= t1 * fps;
  const fade = interpolate(frame, [t0 * fps, t0 * fps + 0.25 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const t = frame / fps - t0;
  return (
    <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 14, opacity: active ? fade : 0, minHeight: 30 }}>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{label}</div>
      <div style={{ display: "flex", gap: 7 }}>
        {[0, 1, 2].map((i) => {
          const phase = Math.sin(Math.PI * (t * 1.1 - i * 0.28));
          const o = 0.25 + 0.55 * Math.max(0, phase);
          return <div key={i} style={{ width: 11, height: 11, borderRadius: 999, background: color, opacity: o }} />;
        })}
      </div>
    </div>
  );
};

/**
 * Slim breadcrumb along the very top edge: one span per activity (colored by
 * type), filling left-to-right as the lesson progresses.
 */
export type BreadcrumbSpan = { actType: ActType; startSec: number; endSec: number };
export const Breadcrumb: React.FC<{ spans: BreadcrumbSpan[] }> = ({ spans }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 5, display: "flex", gap: 3, padding: "0 3px" }}>
      {spans.map((s, i) => {
        const p = Math.max(0, Math.min(1, (t - s.startSec) / Math.max(0.001, s.endSec - s.startSec)));
        const c = ACT_COLORS[s.actType].main;
        return (
          <div key={i} style={{ flex: s.endSec - s.startSec, background: "rgba(255,255,255,0.14)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ width: `${p * 100}%`, height: "100%", background: c, opacity: 0.9 }} />
          </div>
        );
      })}
    </div>
  );
};

/** Bottom-left brand mark, persistent across the whole video. */
export const BrandFooter: React.FC<{ logoSrc: string }> = ({ logoSrc }) => (
  <div style={{ position: "absolute", left: 22, bottom: 14, display: "flex", alignItems: "center", gap: 10, opacity: 0.8 }}>
    <img src={logoSrc} style={{ width: 24, height: 24, borderRadius: 6 }} />
    <div style={{ color: "#94a3b8", fontSize: 17, fontWeight: 600, letterSpacing: 0.3 }}>
      Language Reactor — American Language Course
    </div>
  </div>
);

/** Small item counter, bottom-right corner of the screen. */
export const CornerCounter: React.FC<{ itemNo?: number; itemCount?: number }> = ({ itemNo, itemCount }) => {
  if (itemNo == null || itemCount == null || itemCount <= 1) return null;
  return (
    <div style={{ position: "absolute", right: 24, bottom: 14, color: "#94a3b8", fontSize: 19, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
      {itemNo} / {itemCount}
    </div>
  );
};

export const EnText: React.FC<{ children: React.ReactNode; size?: number }> = ({ children, size = 44 }) => (
  <div style={{ fontSize: size, fontWeight: 700, color: PALETTE.ink, lineHeight: 1.3 }}>{children}</div>
);

export const RuText: React.FC<{ children: React.ReactNode; size?: number }> = ({ children, size = 30 }) => (
  <div style={{ fontSize: size, color: PALETTE.ruText, lineHeight: 1.35, marginTop: 10 }}>{children}</div>
);

/**
 * Display-only TEMPLATE text (cloze gap / reading context) — never spoken.
 * Quote-style block (left accent bar, no box) matching the app player, so it
 * can't be mistaken for a tappable option or the spoken prompt.
 */
export const TemplateBlock: React.FC<{ en: string; ru?: string | null; accent?: string }> = ({ en, ru, accent }) => (
  <div
    style={{
      borderLeft: `6px solid ${accent ?? PALETTE.border}`,
      padding: "6px 0 6px 22px",
      marginBottom: 20,
    }}
  >
    <div style={{ fontSize: 16, letterSpacing: 2, color: PALETTE.muted, fontWeight: 700, marginBottom: 6 }}>ПРОЧИТАЙТЕ</div>
    <div style={{ fontSize: 34, fontWeight: 600, color: PALETTE.ink, lineHeight: 1.35 }}>{en}</div>
    {ru && <div style={{ fontSize: 24, color: PALETTE.ruText, marginTop: 6 }}>{ru}</div>}
  </div>
);
