import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { theme } from "./theme";
import { getLesson } from "./manifest";
import { Figure } from "./Figure";

export const figureDurationInFrames = (durationSec: number | null, fps: number) =>
  Math.max(1, Math.round((durationSec ?? 0) * fps));

export const Lesson: React.FC<{ lessonId: string }> = ({ lessonId }) => {
  const { fps } = useVideoConfig();
  const lesson = getLesson(lessonId);

  if (!lesson) {
    return (
      <AbsoluteFill
        style={{
          background: theme.bgBottom,
          color: "#fff",
          fontFamily: theme.fontStack,
          fontSize: 48,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        Unknown lesson: {lessonId}
      </AbsoluteFill>
    );
  }

  let offset = 0;
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${theme.bgTop} 0%, ${theme.bgBottom} 100%)`,
      }}
    >
      {lesson.figures.map((fig) => {
        const dur = figureDurationInFrames(fig.durationSec, fps);
        const from = offset;
        offset += dur;
        return (
          <Sequence key={fig.n} from={from} durationInFrames={dur} name={`Figure ${fig.n}`}>
            <Figure figure={fig} lessonTitle={lesson.title} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
