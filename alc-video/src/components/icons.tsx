import React from "react";

type IconProps = { size?: number; color?: string; strokeWidth?: number };

const base = (size: number): React.CSSProperties => ({
  width: size,
  height: size,
  display: "block",
});

export const RepeatIcon: React.FC<IconProps> = ({ size = 32, color = "currentColor", strokeWidth = 2.2 }) => (
  <svg viewBox="0 0 24 24" style={base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 2l4 4-4 4" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <path d="M7 22l-4-4 4-4" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

export const HeadphonesIcon: React.FC<IconProps> = ({ size = 32, color = "currentColor", strokeWidth = 2 }) => (
  <svg viewBox="0 0 24 24" style={base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
    <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z" fill={color} />
    <path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" fill={color} />
  </svg>
);

export const PencilIcon: React.FC<IconProps> = ({ size = 32, color = "currentColor", strokeWidth = 2 }) => (
  <svg viewBox="0 0 24 24" style={base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
);

export const SpeakerIcon: React.FC<IconProps> = ({ size = 32, color = "currentColor", strokeWidth = 2 }) => (
  <svg viewBox="0 0 24 24" style={base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 5L6 9H2v6h4l5 4z" fill={color} />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    <path d="M19 5a9 9 0 0 1 0 14" />
  </svg>
);

export const DialogIcon: React.FC<IconProps> = ({ size = 32, color = "currentColor", strokeWidth = 2 }) => (
  <svg viewBox="0 0 24 24" style={base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 21 11.5z" />
  </svg>
);

export const CheckIcon: React.FC<IconProps> = ({ size = 32, color = "currentColor", strokeWidth = 3 }) => (
  <svg viewBox="0 0 24 24" style={base(size)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

export const PlayIcon: React.FC<IconProps> = ({ size = 32, color = "currentColor" }) => (
  <svg viewBox="0 0 24 24" style={base(size)} fill={color}>
    <path d="M6 4l14 8-14 8z" />
  </svg>
);

export const ICONS: Record<string, React.FC<IconProps>> = {
  repeat: RepeatIcon,
  headphones: HeadphonesIcon,
  pencil: PencilIcon,
  speaker: SpeakerIcon,
  dialog: DialogIcon,
  check: CheckIcon,
  play: PlayIcon,
};

export const Icon: React.FC<{ name: string } & IconProps> = ({ name, ...rest }) => {
  const C = ICONS[name] || PlayIcon;
  return <C {...rest} />;
};
