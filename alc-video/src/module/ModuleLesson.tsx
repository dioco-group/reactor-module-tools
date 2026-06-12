// Module-driven lesson video: a Series of timed segments built straight from
// a FORMAT v2 .module file (see scripts/build-module-manifest.mjs).
import React, { useMemo } from "react";
import { Series, staticFile } from "remotion";
import { ModuleLessonData, ModuleSeg } from "./types";
import {
  ActivityIntroSegView,
  DialogueLineSegView,
  LessonEndSegView,
  ProduceItemSegView,
  SelectItemSegView,
  TitleSegView,
} from "./segments";
import { BrandFooter, Breadcrumb, BreadcrumbSpan } from "./ui";

export function segFrames(seg: ModuleSeg, fps: number): number {
  return Math.max(1, Math.round(seg.durationSec * fps));
}

export function lessonFrames(lesson: ModuleLessonData, fps: number): number {
  return lesson.segments.reduce((sum, s) => sum + segFrames(s, fps), 0);
}

/** One breadcrumb span per activity (contiguous segments sharing actIndex). */
function breadcrumbSpans(lesson: ModuleLessonData): BreadcrumbSpan[] {
  const spans: BreadcrumbSpan[] = [];
  let t = 0;
  for (const seg of lesson.segments) {
    const s = seg as any;
    if (s.actIndex != null) {
      const last = spans[spans.length - 1] as (BreadcrumbSpan & { actIndex?: number }) | undefined;
      if (last && (last as any).actIndex === s.actIndex) {
        last.endSec = t + seg.durationSec;
      } else {
        spans.push(Object.assign({ actType: s.actType, startSec: t, endSec: t + seg.durationSec }, { actIndex: s.actIndex }));
      }
    }
    t += seg.durationSec;
  }
  return spans;
}

export const ModuleLesson: React.FC<{ lesson: ModuleLessonData; fps: number }> = ({ lesson, fps }) => {
  const spans = useMemo(() => breadcrumbSpans(lesson), [lesson]);
  return (
    <>
      <Series>
        {lesson.segments.map((seg, i) => (
          <Series.Sequence key={i} durationInFrames={segFrames(seg, fps)}>
            {seg.kind === "TITLE" && <TitleSegView seg={seg} lessonId={lesson.id} lessonTitle={lesson.title} />}
            {seg.kind === "ACTIVITY_INTRO" && <ActivityIntroSegView seg={seg} lessonId={lesson.id} lessonTitle={lesson.title} />}
            {seg.kind === "DIALOGUE_LINE" && <DialogueLineSegView seg={seg} lessonId={lesson.id} lessonTitle={lesson.title} />}
            {seg.kind === "SELECT_ITEM" && <SelectItemSegView seg={seg} lessonId={lesson.id} lessonTitle={lesson.title} />}
            {seg.kind === "PRODUCE_ITEM" && <ProduceItemSegView seg={seg} lessonId={lesson.id} lessonTitle={lesson.title} />}
            {seg.kind === "LESSON_END" && <LessonEndSegView seg={seg} lessonId={lesson.id} lessonTitle={lesson.title} />}
          </Series.Sequence>
        ))}
      </Series>
      {/* Persistent overlays: activity breadcrumb (top edge) + brand (bottom-left). */}
      <Breadcrumb spans={spans} />
      <BrandFooter logoSrc={staticFile("lr-logo.png")} />
    </>
  );
};
