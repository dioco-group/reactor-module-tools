# ALC Conversion Pipeline — Operator's Handbook

End-to-end knowledge for converting ALC books (PDF) into v2 `.module` files and
then into the recreated **master lessons**. Companion docs:

- `AGENT_GUIDE.md` — **start here if you just need to run the pipeline** on a
  book: self-contained, storage-server-agnostic, the commands + the gotchas.

- `shared/alc_common.md` — track-agnostic ALC conversion core (5 types & how to
  choose, presentation+task split, convert-every-item, INTRO/INSTRUCTION, images,
  SKIP/DEFER, naming, output). Embedded in **both** converter prompts.
- `shared/alc_conversion_notes.md` — **LLA delta**: cassette-audio rules (clip
  timing, two-pass tapes, worked tape examples). Embedded in the LLA prompt only.
- `shared/st_notes.md` — **ST delta**: no-tape rules + ST section mapping. Shared
  by ALL ST books via each `configs/alc-st-*/module-convert.json` `sharedNotes`.
- `shared/master_lessons_guide.md` — modules → recreated master lessons.
- `shared/module_format.md` / `module_format.ebnf` — the format itself (the one
  canonical spec, embedded in both converter prompts).
- `../pdf-extract/EXTRACTION_PIPELINE.md` — PDF → markdown details.

## The two source books per ALC lesson

| Book | Audio? | Converter |
|---|---|---|
| **LLA** (Language Laboratory Activities) | YES — cassette per figure | `convert-alc.js` (book md + tape transcript → draft with clip timings) |
| **ST** (Student Text) | NO — TTS only | `convert-course.js` (book md → module; never emits `{clip}` tokens) |

The LLA book is a scaffold; the tape is the content. The ST is self-contained
except its Listening-Skill blocks (stimuli live in the instructor manual → SKIP).

## LLA pipeline (per lesson, e.g. 2A)

```
1. PDF → markdown        node pdf-extract/extract-markdown.js configs/alc-lla-4/pdf-extract.json
                         (resume = per-chunk; to redo a page range, delete its
                          chunks/chunk_XXX-YYY.md and rerun. Book-specific image
                          splitting rules: configs/alc-lla-4/markup-notes.md —
                          multi-panel strips MUST be split there or they arrive
                          as one image.)

2. Images                RECOMPOSE=1 MAX_SIZE=512 PAGES=7,8,10 \
                         node pdf-extract/generate-images.js configs/alc-lla-4/pdf-extract.json
                         (512px recomposed is the standard; delete/move an image
                          to regenerate it — resume skips existing. Re-roll
                          individual bad images the same way; check label text
                          like shop signs survived.)

3. Transcripts           node module-convert/transcribe-soniox.js --config configs/alc-lla-4/module-convert.json 2A
                         (PREFERRED: Soniox async STT returns transcript + word
                          timings + per-word confidence in ONE call — no VPN hop
                          to the aligner, ~$0.006/figure. On the corpus's hard
                          cases it matched/beat the old path: nailed every /ʌ/
                          minimal pair, got sun where gemini+qwen mis-spelled
                          "son"; the only misses are TRUE homophones
                          (week/weak, meat/meet) which no STT can spell from
                          audio and which don't matter — word SPELLING always
                          comes from the BOOK, the ASR is used only for TIMING.
                          Needs SONIOX_API_KEY. Output keeps the whisper JSON
                          shape: segments[].words, seconds, info.source=soniox.)

                         FALLBACK: node module-convert/transcribe-figures.js ... 2A
                         (Gemini text + Qwen FORCED ALIGNER word timings — the
                          prior method. Both replaced whisper, which silently
                          DROPPED quiet items ~5 times in 1A-1D and made
                          homophone errors. info.source=gemini+qwen-align.)

4. Convert               node module-convert/convert-alc.js --config configs/alc-lla-4/module-convert.json 2A
                         → lesson-2A.module.draft with {clip@start-end} timings
                          picked from SEGMENT-level transcript timings.

                         LESSON HEADERS (2012+ editions): convert-alc splits the
                          book md by lesson banner. OCR renders that banner
                          inconsistently — the splitter now also accepts any
                          markdown heading carrying "LESSON NX", and STOPS at the
                          back-matter banner (SCRIPTS / AUDIO SCRIPT / ANSWERS)
                          so tapescripts+answer keys don't bloat the last lesson.
                          If a lesson page has NO banner at all (happens), the
                          run prints "⚠ Lessons with audio but NO book markdown:
                          <NX>" — add a line like
                          "## LANGUAGE LABORATORY ACTIVITIES — BOOK N, LESSON NX"
                          atop that lesson's .md and re-run. (The check compares
                          book lessons against the transcript lesson dirs.)

5. Refine timings        node module-convert/refine-clip-times.js --config ... 2A
                         (Deterministic, word-level: TRUSTS the LLM's rough
                          range and only TRIMS it — strips "Number N", "Repeat,",
                          "Example", "The answer is...", "Listen..." cue words off
                          the edges, then snaps to matched words. A single short
                          item (letter/number) whose rough range spans neighbors
                          snaps to its own transcript SEGMENT, isolating it.
                          KEY: it emits the clip end as the LAST word's START, not
                          its end — Soniox word STARTS are reliable but ENDS are
                          not (point-like, or the next item's onset); slice-clips
                          finds the true end. LOW-CONFIDENCE clips are FLAGGED, not
                          auto-fixed. Homophones (sun/son) flag at score 0 by
                          design: do NOT add fuzzy matching — it would wreck the
                          minimal-pair figures (cop/cup).)

6. Slice + finalize      node module-convert/slice-clips.js --config ... 2A
                         (Cuts each clip with SILENCE-AWARE edges — `speechEdges`
                          widens the window and uses ffmpeg silencedetect to find
                          where speech resumes before the first word (recovering a
                          dropped leading consonant: a tight "B" plays as "ee"→"E")
                          and where it next stops after the last word (the real
                          trailing gap). Anchored on word STARTS, so multi-part
                          items ("Capital A. Small a.") keep every part while a
                          single item ends at its own gap (no dead air / next-item
                          bleed). Then COMPRESSES internal silences >1s to ~0.4s,
                          copies images, rewrites draft → lesson-2A.module + asset
                          folder. NOTE: it regenerates the .module from the
                          .draft — keep ALL content edits in the DRAFT, and
                          keep draft/module in sync.)

7. REVIEW (manual — this is where the real bugs are; see checklist below)

8. Push                  staging clone /tmp/alc-english-book-4 (LLA course) —
                         copy module + asset dir, commit, push.
```

## Review checklist (every lesson; each item has burned us)

- **Compare the draft against BOTH the book markdown and the tape transcript**,
  figure by figure. The converter LLM is good but misses structure.
- **Item counts**: count items against the book AND against the tape's
  check-your-answers pass ("Number 3 is B" proves item 3 exists even when the
  transcript dropped its question). Recover missing audio via Gemini
  transcription of the silent region (silence bursts locate it).
- **Answer keys**: verify every ANSWER against the tape's spoken key or the
  book's printed key (printed key wins).
- **Check-pass answer leaks**: clips must never include "is A, repeat" speech.
- **Two-pass tapes**: clips from ONE pass consistently; other pass only for
  items the chosen pass skips.
- **Speaker genders**: the book's dialog names regularly contradict the tape's
  voice casting. Pitch-check each speaker's clips (autocorrelation F0: female
  ~200-250Hz, male ~90-130Hz) and rename speakers/voices to match what the
  learner HEARS (book "Jim" became "Kim").
- **Reference info on screen**: any table/map the items quiz must be IN the
  module (TEMPLATE on every item, or an activity-wide image on the marker title line).
- **Listen-and-fill vs cue-based cloze**: clip on the PROMPT (hidden) when the
  answer exists only on tape; clip on the RESPONSE when the book prints a cue.
- **Lint**: bundle `module-parser/module_diagnostics.ts` with esbuild and run
  `lintModuleText`; only `missing-dioco-doc-id` is acceptable.
- **Grouped word lists**: never one LINE with a 20s multi-word clip — one word
  per LINE (see notes J2).

## ST pipeline (per lesson)

```
node module-convert/convert-course.js --config configs/alc-st-4/module-convert.json "SPORTS AND GAMES"
```
(positional arg = filename substring filter). Review against the book; usual
fixes seen: stray item numbers in lines, multi-line TEMPLATEs, paragraph-blob
lines, missed SHOW_PROMPT on printed questions. ST modules use TTS only — the
backend voices them with the module's VOICE config (per-speaker dialogue
voices, VOICE_PROMPT/VOICE_RESPONSE for drills), so declare distinct voices.

## Modules → master lessons

See `shared/master_lessons_guide.md`. Validate + stage with:
```
node module-convert/stage-master.mjs book-4-lesson-1
```
Clip-bearing lines must be byte-identical to the source modules (the script
enforces this); editing freedom exists only for TTS-only content.

## Infrastructure notes

- **Canonical parser** lives in `module-parser/` and is synced verbatim to
  module-preview, lr-cursor-extension (now in this repo), and dioco-base via
  `node module-parser/sync.mjs`. NEVER edit the copies.
- **Gitea** (courses.languagereactor.com): course repos under `david/`
  (`alc-english-book-4` = per-source modules; `alc-english` = master lessons).
  Admin token: see `GITEA_ADMIN_TOKEN` in dioco-base `src/modules/gitea.ts`
  (push as `https://david:<token>@courses.languagereactor.com/...`). Repo
  creation under david: POST `/api/v1/admin/users/david/repos`.
- **Asset URLs are commit-pinned** by the backend (`/raw/commit/<sha>/`), so
  pushed content updates are never browser-cache-stale. (Before this, reused
  filenames with changed content caused maddening "out of sync" bugs.)
- **Backend coupling**: new format features (activity-wide dialogue image,
  CHECK: llm grading, voice-aware TTS) need dioco-base/dioco-shared deployed on
  pg-2. If something renders/voices wrong in the app but the data looks right,
  check whether pg-2 has the latest backend first.
- **Services** (LAN, also via VPN at 10.66.66.x): Qwen forced aligner
  `http://192.168.200.210:13000/align` (POST audio bytes, `?text=&lang=en` —
  full-text↔full-audio is its design case; windowed partial-text alignment is
  UNRELIABLE for clip starts, we measured it). ASR endpoints on that box are
  disabled (aligner-only mode); use Gemini for transcription.
- **Gemini models**: conversion `gemini-3.1-pro-preview` (3-pro is retired),
  extraction/transcription `gemini-3.5-flash`, images `gemini-3.1-flash-image`.
- **Keep `temperature: 1.0` for the Gemini 3.x conversion model — do NOT lower it.**
  Google's Gemini 3 docs warn that temperatures below the 1.0 default cause
  looping, degraded reasoning, and even null structured outputs (its reasoning is
  tuned for the default). Lowering temp does NOT improve list completeness — that
  is governed by the conversion notes' "convert EVERY item" rule (A3), not temp.
