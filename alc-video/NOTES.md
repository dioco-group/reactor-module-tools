# ALC Module Videos — design & pipeline notes

Remotion videos generated **directly from FORMAT v2 `.module` files** (the same
data the app player consumes). Target audience: Russian speakers — all on-screen
guidance is RU, content is EN with RU translations.

## Pipeline

```
data/alc-lla-4/module/lesson-<X>.module      (final module + sliced clips/images)
        │
        ▼
scripts/build-module-manifest.mjs <1A> [...] | --all
        │   • parses the module with the canonical v2 parser
        │   • builds timed segments (TITLE / ACTIVITY_INTRO / DIALOGUE_LINE /
        │     SELECT_ITEM / PRODUCE_ITEM / LESSON_END)
        │   • measures every clip with ffprobe → exact timings
        │   • translates on-screen strings to RU (Gemini, cached: data/ru-cache.json)
        │   • voices each activity INTRO with Gemini TTS (aoede, cached by text
        │     hash: data/tts-cache/) → tts-intro-<hash>.mp3 in the assets
        │   • copies lesson assets → public/modules/<X>/
        │   ▼
data/module-manifest.json
        │
        ▼
npx remotion render Module-<X> out/Module-<X>.mp4     (~10 min for an 11-min lesson)
```

GRAMMAR and CHAT activities are skipped (no sensible non-interactive rendering).

## Behavior conventions (mirror the app player)

- **Hidden-prompt default** (`SHOW_PROMPT` semantics): a spoken PROMPT with a
  clip shows "Слушайте…" until the reveal — in both SELECT and PRODUCE.
  Clip-less prompts always show their text (nothing else carries the content).
- **Dictation items** (`RESPONSE === PROMPT`): the prompt line stays hidden even
  after the reveal; the green answer box alone carries the sentence.
- **EXAMPLE items demonstrate themselves** (like the app's auto-answer): no
  "Выберите ответ" cue, reveal comes 0.9 s after the prompt instead of the full
  think window.
- **Template-first pacing**: when an item has a TEMPLATE, the prompt audio (and
  the example's prompt text) waits until the template's read-time
  (`readTime()`, scaled to word count) has passed.
- **Clip-end tick**: a subtle 950 Hz marker (`public/sfx/tick.mp3`, generated
  with ffmpeg) plays 150 ms after every cassette clip — same cue the app uses.
- **Repeat windows**: REPEAT dialogue lines play the clip, pause
  (`Повторите!` cue), then play it again.

## Layout rules — NO JUMPING LAYOUTS

Hard rule from review: nothing on a card may shift when audio starts/stops or a
cue appears/ends.

- `AudioPulse` (the ♪ glyph) always occupies its 34 px slot; playing state is
  opacity-only.
- `Countdown` cues always occupy their row (`minHeight`), fading in/out via
  opacity. They are mounted unconditionally — never gated on `frame >= t`.
- The cue itself is **calm**: a label + three softly breathing dots. No
  draining/shrinking progress bar (reviewed as "5-4-3-2-1 stress").

## Chrome (persistent overlays, rendered in ModuleLesson, not per-segment)

- **Breadcrumb** (top edge): one slim span per activity, colored by activity
  type (`ACT_COLORS`), filling left-to-right with lesson progress.
- **Brand footer** (bottom-left): `public/lr-logo.png` (from web-tools) +
  "Language Reactor — American Language Course", small/muted.
- **Item counter** (bottom-right): `2 / 5`, moved out of the header.

## Visual conventions

- `TemplateBlock` = quote-style reading block (left accent bar in the activity
  color, no box) — matches the app; must not look like a tappable option.
- SELECT picture options: **3-across grid** (like the app's desktop view),
  image height scaled by row count (2 rows → 185 px).
- Images are the 512 px recomposed renders; the manifest just references
  whatever the module references.
- Dialogue line images: per-line inline image, else the activity-wide image on
  the `$DIALOGUE` title line — no carry-over between lines (matches format semantics).

## Gotchas

- `build-module-manifest.mjs` needs `GEMINI_API_KEY` (translations + intro TTS)
  and the Qwen-aligned transcripts only indirectly (clips are already sliced).
- The intro TTS step extends ACTIVITY_INTRO durations — lesson durations are
  recomputed after it; don't reorder it after manifest serialization.
- Emoji/unicode: DejaVu-safe glyphs only (tofu boxes otherwise).
- Renders that take hours = the machine slept; normal is ≈ real-time.
