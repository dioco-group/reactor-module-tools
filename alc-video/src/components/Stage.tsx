import React from "react";
import { Img, staticFile, useCurrentFrame } from "remotion";
import { theme } from "../theme";
import type { SegImage } from "../manifest";
import { HeadphonesIcon } from "./icons";

function imgSrc(p: SegImage) {
  const rel = p.publicPath || `images/${p.path.split("/").pop()}`;
  return staticFile(rel);
}

export const ImageCard: React.FC<{ image: SegImage }> = ({ image }) => (
  <div
    style={{
      background: theme.panel,
      borderRadius: 28,
      padding: 26,
      boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
    }}
  >
    <Img
      src={imgSrc(image)}
      style={{ width: 440, height: 440, objectFit: "contain", borderRadius: 14 }}
    />
  </div>
);

// Shown during a listening exercise while the stimulus is playing: the learner
// should listen and answer before the text is revealed.
export const ListenIndicator: React.FC<{ hint: string }> = ({ hint }) => {
  const frame = useCurrentFrame();
  const bars = [0, 1, 2, 3, 4];
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 34,
      }}
    >
      <HeadphonesIcon size={140} color="#60a5fa" strokeWidth={1.6} />
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 60 }}>
        {bars.map((b) => {
          const h = 18 + 34 * Math.abs(Math.sin((frame / 9) + b * 0.7));
          return (
            <div
              key={b}
              style={{
                width: 12,
                height: h,
                borderRadius: 6,
                background: "#60a5fa",
                opacity: 0.85,
              }}
            />
          );
        })}
      </div>
      <div
        style={{
          fontFamily: theme.fontStack,
          fontSize: 44,
          fontWeight: 700,
          color: "#cbd5e1",
          textAlign: "center",
          maxWidth: 1200,
        }}
      >
        {hint}
      </div>
    </div>
  );
};

export const Watermark: React.FC<{ n: number }> = ({ n }) => (
  <div
    style={{
      fontFamily: theme.fontStack,
      fontSize: 240,
      fontWeight: 900,
      color: "rgba(148,163,184,0.10)",
      lineHeight: 1,
    }}
  >
    {n}
  </div>
);
