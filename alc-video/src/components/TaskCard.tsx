import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { ActivityBadge } from "./ActivityBadge";
import type { Badge } from "../activity";

// Centered card shown while the teacher gives an instruction. Doubles as the
// figure intro / task explanation (Russian-forward).
export const TaskCard: React.FC<{
  badge: Badge;
  ru: string;
  en: string;
  figureLabel: string;
}> = ({ badge, ru, en, figureLabel }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 14 });

  return (
    <div
      style={{
        transform: `scale(${0.96 + s * 0.04})`,
        opacity: s,
        background: "rgba(15,23,42,0.55)",
        border: "1px solid rgba(148,163,184,0.25)",
        borderRadius: 28,
        padding: "56px 72px",
        maxWidth: 1400,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 28,
        boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div
          style={{
            fontFamily: theme.fontStack,
            fontSize: 28,
            fontWeight: 800,
            color: theme.accent,
            letterSpacing: 1,
          }}
        >
          {figureLabel}
        </div>
        <ActivityBadge badge={badge} />
      </div>

      <div
        style={{
          fontFamily: theme.fontStack,
          fontSize: 56,
          fontWeight: 800,
          color: "#f8fafc",
          textAlign: "center",
          lineHeight: 1.2,
        }}
      >
        {ru}
      </div>
      {en ? (
        <div
          style={{
            fontFamily: theme.fontStack,
            fontSize: 34,
            fontWeight: 500,
            color: "#94a3b8",
            textAlign: "center",
          }}
        >
          {en}
        </div>
      ) : null}
    </div>
  );
};
