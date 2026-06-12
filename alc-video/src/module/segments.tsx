// Segment renderers for the module-driven video.
import React from "react";
import { Audio, Img, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import {
  ActivityIntroSeg,
  DialogueLineSeg,
  LessonEndSeg,
  ProduceItemSeg,
  SelectItemSeg,
  TitleSeg,
} from "./types";
import { ACT_COLORS, AudioPulse, Bg, CornerCounter, Countdown, EnText, FadeIn, Header, PALETTE, Panel, RuText, TemplateBlock } from "./ui";

const asset = (lessonId: string, file: string) => staticFile(`modules/${lessonId}/${file}`);

type P<S> = { seg: S; lessonId: string; lessonTitle: string };

/** Subtle "clip finished" marker (mirrors the app's end-of-audio tick). */
const ClipEndTick: React.FC<{ atSec: number }> = ({ atSec }) => {
  const { fps } = useVideoConfig();
  return (
    <Sequence from={Math.round(atSec * fps)}>
      <Audio src={staticFile("sfx/tick.mp3")} volume={0.35} />
    </Sequence>
  );
};

// ---------------------------------------------------------------------------

export const TitleSegView: React.FC<P<TitleSeg>> = ({ seg }) => (
  <Bg>
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22 }}>
      <FadeIn>
        <div style={{ color: "#94a3b8", fontSize: 28, letterSpacing: 6, fontWeight: 700 }}>AMERICAN LANGUAGE COURSE</div>
      </FadeIn>
      <FadeIn at={0.25}>
        <div style={{ color: "white", fontSize: 76, fontWeight: 800 }}>{seg.title}</div>
      </FadeIn>
      {seg.titleRu && (
        <FadeIn at={0.5}>
          <div style={{ color: "#fcd34d", fontSize: 38 }}>{seg.titleRu}</div>
        </FadeIn>
      )}
      <FadeIn at={0.75}>
        <div style={{ color: "#64748b", fontSize: 26 }}>{seg.subtitle}</div>
      </FadeIn>
    </div>
  </Bg>
);

export const LessonEndSegView: React.FC<P<LessonEndSeg>> = ({ seg }) => (
  <Bg>
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24 }}>
      <FadeIn>
        <div style={{ fontSize: 90 }}>★</div>
      </FadeIn>
      <FadeIn at={0.3}>
        <div style={{ color: "white", fontSize: 60, fontWeight: 800 }}>Урок завершён!</div>
      </FadeIn>
      <FadeIn at={0.55}>
        <div style={{ color: "#94a3b8", fontSize: 30 }}>{seg.title}</div>
      </FadeIn>
    </div>
  </Bg>
);

// ---------------------------------------------------------------------------

export const ActivityIntroSegView: React.FC<P<ActivityIntroSeg>> = ({ seg, lessonId, lessonTitle }) => {
  const { fps } = useVideoConfig();
  const c = ACT_COLORS[seg.actType];
  return (
    <Bg>
      <Header lessonTitle={lessonTitle} />
      {seg.introClip && (
        <Sequence from={Math.round(0.6 * fps)}>
          <Audio src={asset(lessonId, seg.introClip)} />
        </Sequence>
      )}
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 160px", gap: 18 }}>
        <FadeIn>
          <div style={{ background: c.main, color: "white", borderRadius: 999, padding: "8px 30px", fontSize: 26, fontWeight: 800, letterSpacing: 2 }}>
            {c.labelRu} · {seg.actIndex}/{seg.actCount}
          </div>
        </FadeIn>
        <FadeIn at={0.2}>
          <div style={{ color: "white", fontSize: 52, fontWeight: 800, textAlign: "center" }}>{seg.actTitle}</div>
        </FadeIn>
        {seg.actTitleRu && seg.actTitleRu !== seg.actTitle && (
          <FadeIn at={0.35}>
            <div style={{ color: "#fcd34d", fontSize: 30, textAlign: "center" }}>{seg.actTitleRu}</div>
          </FadeIn>
        )}
        {seg.introEn && (
          <FadeIn at={0.55} style={{ marginTop: 18 }}>
            <div style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 18, padding: "22px 34px", maxWidth: 900 }}>
              <div style={{ color: "#e2e8f0", fontSize: 30, lineHeight: 1.45, textAlign: "center" }}>{seg.introEn}</div>
              {seg.introRu && <div style={{ color: "#fcd34d", fontSize: 25, lineHeight: 1.45, textAlign: "center", marginTop: 12 }}>{seg.introRu}</div>}
            </div>
          </FadeIn>
        )}
      </div>
    </Bg>
  );
};

// ---------------------------------------------------------------------------

export const DialogueLineSegView: React.FC<P<DialogueLineSeg>> = ({ seg, lessonId, lessonTitle }) => {
  const { fps } = useVideoConfig();
  const c = ACT_COLORS.DIALOGUE;
  const hasImage = !!seg.image;
  const clipEnd = seg.clipAt + (seg.clipDur ?? 0);

  return (
    <Bg>
      <Header lessonTitle={lessonTitle} actType="DIALOGUE" actTitle={seg.actTitle} />
      {seg.clip && (
        <Sequence from={Math.round(seg.clipAt * fps)}>
          <Audio src={asset(lessonId, seg.clip)} />
        </Sequence>
      )}
      {seg.clip && seg.clipDur != null && <ClipEndTick atSec={clipEnd + 0.15} />}
      <Panel wide={hasImage}>
        <div style={{ display: "flex", gap: 36, flex: 1, minHeight: 0 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            {seg.vocab.length > 0 && (
              <FadeIn>
                <div style={{ marginBottom: 26 }}>
                  <div style={{ fontSize: 17, letterSpacing: 2, color: PALETTE.muted, fontWeight: 700, marginBottom: 10 }}>★ НОВЫЕ СЛОВА</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                    {seg.vocab.map((v, i) => (
                      <FadeIn key={i} at={0.2 + i * 0.25}>
                        <div style={{ background: c.soft, border: `2px solid ${c.main}`, borderRadius: 12, padding: "8px 18px" }}>
                          <span style={{ fontSize: 28, fontWeight: 800, color: PALETTE.ink }}>{v.en}</span>
                          {v.ru && <span style={{ fontSize: 23, color: PALETTE.ruText, marginLeft: 12 }}>{v.ru}</span>}
                        </div>
                      </FadeIn>
                    ))}
                  </div>
                </div>
              </FadeIn>
            )}
            {seg.speaker && (
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                <div style={{ background: c.main, color: "white", borderRadius: 999, padding: "3px 16px", fontSize: 21, fontWeight: 700 }}>{seg.speaker}</div>
                <AudioPulse activeFrom={seg.clipAt} activeTo={clipEnd} color={c.main} />
              </div>
            )}
            {!seg.speaker && (
              <div style={{ marginBottom: 10 }}>
                <AudioPulse activeFrom={seg.clipAt} activeTo={clipEnd} color={c.main} />
              </div>
            )}
            <FadeIn at={Math.max(0, seg.clipAt - 0.4)}>
              <EnText size={hasImage ? 40 : 46}>{seg.en}</EnText>
              {seg.ru && <RuText size={hasImage ? 27 : 30}>{seg.ru}</RuText>}
            </FadeIn>
            {seg.repeat && seg.repeatAt != null && (
              <Countdown t0={seg.repeatAt} t1={seg.repeatAt + (seg.repeatDur ?? 2)} color={c.main} label="Повторите!" />
            )}
          </div>
          {hasImage && (
            <div style={{ width: 420, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Img src={asset(lessonId, seg.image!)} style={{ maxWidth: "100%", maxHeight: 460, borderRadius: 16, border: `1px solid ${PALETTE.border}` }} />
            </div>
          )}
        </div>
      </Panel>
      <CornerCounter itemNo={seg.itemNo} itemCount={seg.itemCount} />
    </Bg>
  );
};

// ---------------------------------------------------------------------------

export const SelectItemSegView: React.FC<P<SelectItemSeg>> = ({ seg, lessonId, lessonTitle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const c = ACT_COLORS.SELECT;
  const revealed = frame >= seg.revealAt * fps;
  const clipEnd = seg.clipAt + (seg.clipDur ?? 0);
  const hasOptionImages = seg.options.some((o) => o.image);
  const promptHidden = seg.audioOnly && !revealed;
  const answerOpt = seg.options.find((o) => seg.answer.includes(o.id));

  return (
    <Bg>
      <Header lessonTitle={lessonTitle} actType="SELECT" actTitle={seg.actTitle} />
      {seg.clip && (
        <Sequence from={Math.round(seg.clipAt * fps)}>
          <Audio src={asset(lessonId, seg.clip)} />
        </Sequence>
      )}
      {seg.answerClipAt != null && answerOpt?.clip && (
        <Sequence from={Math.round(seg.answerClipAt * fps)}>
          <Audio src={asset(lessonId, answerOpt.clip)} />
        </Sequence>
      )}
      {seg.clip && seg.clipDur != null && <ClipEndTick atSec={clipEnd + 0.15} />}
      <Panel wide>
        <div style={{ display: "flex", gap: 32, flex: 1, minHeight: 0 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}>
            {seg.isExample && (
              <div style={{ fontSize: 19, fontWeight: 800, color: "#b45309", letterSpacing: 2, marginBottom: 10 }}>★ ПРИМЕР</div>
            )}
            {seg.templateEn && <TemplateBlock en={seg.templateEn} ru={seg.templateRu} accent={c.main} />}
            {seg.promptEn != null && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <AudioPulse activeFrom={seg.clipAt} activeTo={clipEnd} color={c.main} />
                  {promptHidden ? (
                    <div style={{ fontSize: 36, fontWeight: 700, color: PALETTE.muted }}>Слушайте…</div>
                  ) : (
                    <div>
                      <EnText size={36}>{seg.promptEn}</EnText>
                      {seg.promptRu && <RuText size={26}>{seg.promptRu}</RuText>}
                    </div>
                  )}
                </div>
              </div>
            )}
            {seg.image && (
              <div style={{ marginTop: 8 }}>
                <Img src={asset(lessonId, seg.image)} style={{ maxWidth: "100%", maxHeight: 280, borderRadius: 14, border: `1px solid ${PALETTE.border}` }} />
              </div>
            )}
            {/* EXAMPLE items demonstrate themselves — no answer countdown. */}
            {!seg.isExample && <Countdown t0={seg.clipAt + (seg.clipDur ?? 1)} t1={seg.revealAt} color={c.main} label="Выберите ответ" />}
            {revealed && seg.feedbackEn && (
              <FadeIn at={seg.revealAt + 0.3}>
                <div style={{ marginTop: 16, background: PALETTE.goodSoft, borderLeft: `6px solid ${PALETTE.good}`, borderRadius: 10, padding: "12px 18px" }}>
                  <div style={{ fontSize: 26, color: PALETTE.ink, fontWeight: 600 }}>{seg.feedbackEn}</div>
                  {seg.feedbackRu && <div style={{ fontSize: 21, color: PALETTE.ruText, marginTop: 4 }}>{seg.feedbackRu}</div>}
                </div>
              </FadeIn>
            )}
          </div>
          <div style={{ flex: hasOptionImages ? 1.7 : 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 14, minHeight: 0 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: hasOptionImages ? "repeat(3, 1fr)" : "1fr",
                gap: 10,
              }}
            >
              {seg.options.map((o) => {
                const isAnswer = seg.answer.includes(o.id);
                const highlight = revealed && isAnswer;
                const dim = revealed && !isAnswer;
                // 3-across like the desktop player; keep rows fitting the panel.
                const rows = hasOptionImages ? Math.ceil(seg.options.length / 3) : seg.options.length;
                const imgH = rows >= 3 ? 110 : rows === 2 ? 185 : 240;
                return (
                  <div
                    key={o.id}
                    style={{
                      border: `3px solid ${highlight ? PALETTE.good : PALETTE.border}`,
                      background: highlight ? PALETTE.goodSoft : "white",
                      opacity: dim ? 0.38 : 1,
                      borderRadius: 12,
                      padding: hasOptionImages ? 8 : "12px 18px",
                      display: "flex",
                      flexDirection: hasOptionImages ? "column" : "row",
                      alignItems: "center",
                      gap: 8,
                      transition: "all 0.2s",
                      minHeight: 0,
                    }}
                  >
                    {!hasOptionImages && (
                      <div
                        style={{
                          minWidth: 36,
                          height: 36,
                          borderRadius: 999,
                          background: highlight ? PALETTE.good : "#f1f5f9",
                          color: highlight ? "white" : PALETTE.muted,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 21,
                          fontWeight: 800,
                        }}
                      >
                        {highlight ? "✓" : o.id}
                      </div>
                    )}
                    {o.image && <Img src={asset(lessonId, o.image)} style={{ width: "100%", maxHeight: imgH, objectFit: "contain" }} />}
                    {o.textEn && (
                      <div style={{ textAlign: hasOptionImages ? "center" : "left", display: "flex", alignItems: "baseline", gap: 8, justifyContent: "center" }}>
                        {hasOptionImages && highlight && <span style={{ color: PALETTE.good, fontWeight: 800, fontSize: 20 }}>✓</span>}
                        <span style={{ fontSize: hasOptionImages ? 21 : 29, fontWeight: 700, color: highlight ? PALETTE.good : PALETTE.ink }}>{o.textEn}</span>
                        {revealed && isAnswer && o.textRu && (
                          <span style={{ fontSize: hasOptionImages ? 17 : 22, color: PALETTE.ruText }}>{o.textRu}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Panel>
      <CornerCounter itemNo={seg.itemNo} itemCount={seg.itemCount} />
    </Bg>
  );
};

// ---------------------------------------------------------------------------

export const ProduceItemSegView: React.FC<P<ProduceItemSeg>> = ({ seg, lessonId, lessonTitle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const c = ACT_COLORS.PRODUCE;
  const revealed = frame >= seg.revealAt * fps;
  const clipEnd = seg.clipAt + (seg.clipDur ?? 0);
  const thinkStart = seg.clipAt + (seg.clipDur ?? (seg.promptEn ? 2 : 1));
  // Hidden-prompt default ("listen only" until reveal). For dictation-style
  // items the response repeats the prompt — the reveal box carries the
  // sentence, so the prompt line stays hidden even after the reveal.
  const promptIsResponse = seg.responseEn != null && seg.responseEn === seg.promptEn;
  const promptHidden = seg.audioOnly && !seg.isExample && (promptIsResponse || !revealed);

  return (
    <Bg>
      <Header lessonTitle={lessonTitle} actType="PRODUCE" actTitle={seg.actTitle} />
      {seg.clip && (
        <Sequence from={Math.round(seg.clipAt * fps)}>
          <Audio src={asset(lessonId, seg.clip)} />
        </Sequence>
      )}
      {seg.responseClipAt != null && seg.responseClip && (
        <Sequence from={Math.round(seg.responseClipAt * fps)}>
          <Audio src={asset(lessonId, seg.responseClip)} />
        </Sequence>
      )}
      {seg.clip && seg.clipDur != null && <ClipEndTick atSec={clipEnd + 0.15} />}
      <Panel wide={!!seg.image}>
        <div style={{ display: "flex", gap: 36, flex: 1, minHeight: 0 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}>
            {seg.isExample && (
              <div style={{ fontSize: 19, fontWeight: 800, color: "#b45309", letterSpacing: 2, marginBottom: 10 }}>★ ПРИМЕР</div>
            )}
            {seg.templateEn && <TemplateBlock en={seg.templateEn} ru={seg.templateRu} accent={c.main} />}
            {seg.promptEn != null && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <AudioPulse activeFrom={seg.clipAt} activeTo={clipEnd} color={c.main} />
                {promptHidden ? (
                  <div style={{ fontSize: 34, fontWeight: 700, color: PALETTE.muted }}>Слушайте…</div>
                ) : (
                  <FadeIn at={Math.max(0, seg.clipAt - 0.35)}>
                    <EnText size={38}>{seg.promptEn}</EnText>
                    {seg.promptRu && <RuText size={26}>{seg.promptRu}</RuText>}
                  </FadeIn>
                )}
              </div>
            )}
            {!seg.isExample && <Countdown t0={thinkStart} t1={seg.revealAt} color={c.main} label="Ваш ответ…" />}
            {seg.responseEn != null && revealed && (
              <FadeIn at={seg.revealAt}>
                <div style={{ marginTop: 18, background: PALETTE.goodSoft, border: `3px solid ${PALETTE.good}`, borderRadius: 16, padding: "18px 26px" }}>
                  <div style={{ fontSize: 17, letterSpacing: 2, color: PALETTE.good, fontWeight: 800, marginBottom: 6 }}>✓ ОТВЕТ</div>
                  <div style={{ fontSize: 36, fontWeight: 700, color: PALETTE.ink, lineHeight: 1.3 }}>{seg.responseEn}</div>
                  {seg.responseRu && <div style={{ fontSize: 25, color: PALETTE.ruText, marginTop: 8 }}>{seg.responseRu}</div>}
                </div>
              </FadeIn>
            )}
          </div>
          {seg.image && (
            <div style={{ width: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Img src={asset(lessonId, seg.image)} style={{ maxWidth: "100%", maxHeight: 440, borderRadius: 16, border: `1px solid ${PALETTE.border}` }} />
            </div>
          )}
        </div>
      </Panel>
      <CornerCounter itemNo={seg.itemNo} itemCount={seg.itemCount} />
    </Bg>
  );
};
