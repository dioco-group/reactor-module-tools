import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { theme } from "../theme";
import { RepeatIcon } from "./icons";

// Pulsing "your turn to repeat" cue shown during the lab's repeat pauses.
export const RepeatCue: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = 0.7 + 0.3 * Math.sin((frame / 14) * Math.PI);
  const grow = interpolate(Math.sin((frame / 14) * Math.PI), [-1, 1], [0.98, 1.04]);
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 16,
        background: "rgba(34,197,94,0.16)",
        border: "2px solid rgba(74,222,128,0.55)",
        borderRadius: 999,
        padding: "12px 30px",
        opacity: pulse,
        transform: `scale(${grow})`,
        fontFamily: theme.fontStack,
        fontSize: 34,
        fontWeight: 800,
        color: "#bbf7d0",
      }}
    >
      <RepeatIcon size={32} color="#86efac" /> Повторите · Your turn
    </div>
  );
};
