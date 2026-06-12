import React from "react";
import { Composition } from "remotion";
import { manifest } from "./manifest";
import { Lesson, figureDurationInFrames } from "./Lesson";
import { moduleManifest } from "./module/manifest";
import { ModuleLesson, lessonFrames } from "./module/ModuleLesson";

const FPS = manifest.fps || 30;
const MOD_FPS = moduleManifest.fps || 30;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* FORMAT v2 module-driven videos (scripts/build-module-manifest.mjs) */}
      {moduleManifest.lessons.map((lesson) => (
        <Composition
          key={`module-${lesson.id}`}
          id={`Module-${lesson.id}`}
          component={ModuleLesson}
          durationInFrames={lessonFrames(lesson, MOD_FPS)}
          fps={MOD_FPS}
          width={moduleManifest.width || 1280}
          height={moduleManifest.height || 720}
          defaultProps={{ lesson, fps: MOD_FPS }}
        />
      ))}

      {/* Legacy markdown/whisper pipeline (Book 1) */}
      {manifest.lessons.map((lesson) => {
        const totalFrames = lesson.figures.reduce(
          (sum, f) => sum + figureDurationInFrames(f.durationSec, FPS),
          0
        );
        return (
          <Composition
            key={lesson.id}
            id={`Lesson-${lesson.id}`}
            component={Lesson}
            durationInFrames={Math.max(1, totalFrames)}
            fps={FPS}
            width={manifest.width || 1920}
            height={manifest.height || 1080}
            defaultProps={{ lessonId: lesson.id }}
          />
        );
      })}
    </>
  );
};
