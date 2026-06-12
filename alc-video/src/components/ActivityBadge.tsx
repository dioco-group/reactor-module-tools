import React from "react";
import { theme } from "../theme";
import type { Badge } from "../activity";
import { Icon } from "./icons";

export const ActivityBadge: React.FC<{ badge: Badge }> = ({ badge }) => {
  if (!badge.label) return null;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 14,
        background: "rgba(37,99,235,0.18)",
        border: "2px solid rgba(96,165,250,0.5)",
        color: "#bfdbfe",
        fontFamily: theme.fontStack,
        fontSize: 30,
        fontWeight: 700,
        padding: "10px 24px",
        borderRadius: 999,
      }}
    >
      <Icon name={badge.icon} size={30} color="#93c5fd" />
      {badge.label}
    </div>
  );
};
