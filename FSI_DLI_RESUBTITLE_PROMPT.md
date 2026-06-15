# Task: Re-transcribe & correct FSI/DLI "DRILLS" course subtitles (Soniox ASR + book correction + LLM language tagging)

You are an agent working in the **`reactor-module-tools`** repo. Your job is to
produce **higher-quality subtitles** for the legacy FSI/DLI/Cortina "drills"
audio courses that are currently served by the `dioco-base` backend on **pg-2**.

This is a standalone task spec — everything you need is below. Work
**incrementally and non-destructively**, piloting ONE course end-to-end and
getting it reviewed before batch-processing the rest.

---

## 1. Background: what exists today

These are classic tape-based language courses (FSI, DLI, Cortina, etc.). Each
course has scanned **PDF books** and **audio tapes**, plus **subtitle JSON**
that was produced by **Whisper ASR with NO post-processing**. The Whisper output
has two quality problems we want to fix:

1. **Transcription errors**, especially in the target language — e.g. an actual
   served French file contains `"Je désir parler français."` (should be
   *désire*) and `"Il désire parlé français."` (should be *parler*). The book
   contains the correct text; the ASR does not use it.
2. **Language tagging.** Each subtitle line carries a `lang_G` (e.g. the English
   narrator's instructions vs. the target-language content). Today this is done
   with **fasttext**, which is weak on short lines and code-switching. An LLM,
   given the whole tape + book context, can label lines far more reliably.

### Where the data lives (on pg-2)

Served from `dioco-base`; files on disk at `pg-2.dioco.io:/pg/data_prod/drills/`.
One folder per course, named `yolik_<course>` (e.g. `yolik_cortina_french`,
`yolik_dli-french`, `yolik_fsi-french-revised`). Inside each course folder:

- `manifest.json` — catalogue metadata (`dirName`, `audioFiles[]`, `pdfFiles[]`,
  `metadata.id`, `metadata.lang_G`). **Read it to map audio↔subs↔pdf.**
- The scanned book PDF(s) (filenames use `%` where the original had `/`).
- Audio: `<...>.mp3.mp3` (one per tape/lesson).
- Subtitles: `<...>.mp3.json` — **bare JSON array** of subtitle objects, one per
  audio file, sitting next to the matching `.mp3.mp3`.

### Exact on-disk subtitle format (VERIFY before writing!)

```json
[
  { "begin": 0,    "end": 2320, "text": "Je désire.",                 "lang_G": "fr" },
  { "begin": 2620, "end": 5000, "text": "Que désirez-vous, monsieur?", "lang_G": "fr" }
]
```

- `begin`/`end` are **milliseconds** from the start of the file.
- `text` is the line.
- `lang_G` is a Google-style language code (`fr`, `en`, `de`, `iw` for Hebrew,
  `zh-CN`/`zh-TW`, etc. — match whatever the manifest's `metadata.lang_G` uses
  for the target, and `en` for English narration).
- The file is a **bare array** (no wrapper object). **Before overwriting any
  course, read one of its real `.json` files and confirm the exact shape** —
  do not assume; match it byte-for-structure.

The type, for reference, is `sub_t` in `dioco-shared/src/types/subs_types.ts`:
`{ begin: ms, end: ms, text: string, lang_G?: langCode_G_t }`.

---

## 2. Goal

For each course, regenerate the per-tape subtitle JSON so that:

- **Timings** come from **Soniox** ASR (word-level, accurate) — replacing Whisper.
- **Text** is **corrected against the book** (the PDF → markdown), fixing ASR
  spelling/word errors in the target language. The book is ground truth for any
  content that appears in it; spoken English instructions that aren't in the
  book stay as cleanly-transcribed ASR.
- **`lang_G` per line** is assigned by an **LLM** (target language vs. English
  narration vs. other), not fasttext.
- Output matches the **exact existing on-disk format** so `dioco-base` serves it
  with no backend changes.

Keep the existing Whisper `.json` as a backup (e.g. `*.json.whisper.bak`) so the
change is reversible.

---

## 3. Reuse what already exists in this repo

Read `module-convert/AGENT_GUIDE.md` and `module-convert/README.md` first. The
relevant existing tools:

- **`pdf-extract/extract-markdown.js`** — PDF → markdown via Gemini. Driven by a
  per-course `configs/<course>/pdf-extract.json` (see existing
  `configs/fsi-french/pdf-extract.json` and `configs/alc-lla-1/pdf-extract.json`
  as templates). Renders pages to PNG, OCRs in 6-page chunks, resumable.
- **`module-convert/transcribe-soniox.js`** — Soniox async STT → Whisper-shaped
  JSON (`{segments:[{id,start,end,text,words:[{start,end,word}]}], info}`,
  **seconds**, leading-space text). Needs `SONIOX_API_KEY` in `.env`.
  - ⚠ **It currently assumes the ALC layout** (`audioDir/Lesson NX/Figure NN.mp3`
    → `transcripts/Lesson NX/FigureNN.json`). FSI/DLI tapes are flat per-tape
    MP3s with arbitrary names. You will need a **thin variant or a generalization**
    that transcribes an arbitrary list of mp3 files to sibling JSONs. Keep the
    same Soniox call + token→word→segment logic; just change file discovery and
    output naming. Factor the shared Soniox code rather than copy-paste if clean.
- **Config pattern**: `configs/<course>/` holds JSON configs (paths resolve
  relative to the config file). Create `configs/drills-<course>/` per course.
- `.env` already holds `GEMINI_API_KEY` and `SONIOX_API_KEY`. Never commit it.

Prereqs (verify): Node 18+, `pdftoppm` (poppler-utils), `ffmpeg`, `npm install`.

---

## 4. Pipeline (per course)

### Step 0 — Pull the course locally (don't process over the network)
`rsync` the course folder from pg-2 into the repo's `data/`, e.g.
`data/drills-<course>/` containing the PDF(s), the `.mp3.mp3` files, the existing
`.mp3.json` subs, and `manifest.json`. Audio can be large; pull once.

### Step 1 — PDF → markdown (the correction reference)
Create `configs/drills-<course>/pdf-extract.json` (copy a template, fix paths,
set `splitInstructions` appropriate to the book's lesson/unit structure). Run
`extract-markdown.js`. Result: `data/drills-<course>/md/` with the book text
(dialogues, vocab, drills) that will anchor the corrections.

### Step 2 — Soniox ASR per tape (timings + first-pass text)
Run the (generalized) Soniox transcriber over every `.mp3.mp3` in the course.
- These tapes are **bilingual** (English instructions + target language). Pass
  Soniox `language_hints` with BOTH codes (e.g. `["fr","en"]`); do not force a
  single language.
- Output: one Whisper-shaped JSON per tape (seconds), with word timings.
- Soniox async handles long files; cost ≈ $0.10/audio-hour.

### Step 3 — Correct text + tag language with an LLM (the new core step)
Write a new script (e.g. `module-convert/correct-drill-subs.js`). For each tape,
feed an LLM (Gemini, `gemini-3.1-pro-preview` or current) THREE things:
1. The relevant **book markdown** for that tape/lesson (use the manifest +
   filenames to pick the right lesson section; if unsure, pass the whole book or
   the best-matching unit).
2. The **Soniox segments** (text + per-segment start/end).
3. Clear instructions:
   - **Correct each segment's `text`** using the book as ground truth for any
     content that appears there (fix target-language spelling/words/accents).
     Leave spoken English apparatus ("Listen and repeat", "Now repeat") as
     cleanly transcribed — it usually isn't in the book; do not invent.
   - **Do NOT change segment boundaries or timings.** One corrected line per
     input segment, same order, same count. (If a merge/split is unavoidable,
     keep it rare and preserve covering start/end.)
   - **Assign `lang_G`** per line: the course target language for target-language
     lines, `en` for English narration, and the correct code for any third
     language. Use the book + surrounding context to decide — this is where the
     LLM beats fasttext.
   - Return strict JSON.
- Convert seconds → **milliseconds**, drop the leading space, and emit the
  **bare `sub_t[]` array** matching Step "exact on-disk format".

### Step 4 — Write back in the exact on-disk format
For each tape, back up the existing `<name>.mp3.json` → `<name>.mp3.json.whisper.bak`,
then write the corrected array to `<name>.mp3.json`. **Match the existing file's
structure exactly** (bare array, same key names/order, ms integers). Do this in
the local `data/drills-<course>/` copy first.

### Step 5 — Validate, then sync back to pg-2
- Validate: every output file is a JSON array; `begin < end`; times monotonic
  and within the audio duration (`ffprobe`); line count sane vs. the Whisper
  original; `lang_G` is a valid code; no empty `text`.
- Spot-check a few tapes by eye/ear (does corrected text match what's said and
  what's in the book?).
- Only after review: `rsync` the corrected `.mp3.json` files back to
  `pg-2.dioco.io:/pg/data_prod/drills/<course>/`. The backend reads them live
  (`media_drills.ts` → `getDrillSubs_5`), so no deploy is needed — but the
  manifest/filenames must stay identical so references don't break.

---

## 5. Constraints & gotchas

- **Non-destructive**: keep `*.whisper.bak`; never delete originals; pilot one
  course and get sign-off before batch runs.
- **Filenames are load-bearing**: `manifest.json` and the frontend reference subs
  by exact filename (`%`-encoded). Never rename `.mp3.json` files.
- **Timings are sacred**: the saved-item / clip features slice audio by these
  ms offsets (`DRILLS_reference_5_t`). Correct text & language only; don't shift
  timings.
- **Don't over-correct**: the book is ground truth only for content that's in it.
  Drills often have permutations/substitutions not printed verbatim — correct
  obvious ASR errors, don't force every line to a book sentence.
- **Bilingual reality**: expect English framing around target-language drills.
  Tag accordingly; this is the main `lang_G` signal.
- **Cost/scale**: there are many courses/tapes. Estimate Soniox + Gemini cost on
  the pilot, report it, and parallelize carefully (Soniox async tolerates
  concurrency; Gemini has rate limits — reuse the retry/backoff patterns already
  in the repo's scripts).
- **Language codes**: match `dioco-base` conventions (`detectLang.ts` mapping:
  Hebrew `iw`, Chinese `zh-CN`/`zh-TW`, etc.). Use the manifest's
  `metadata.lang_G` as the canonical target code.

## 6. Suggested first move

Pilot **`yolik_cortina_french`** (small, clearly bilingual, has obvious ASR
errors to validate against). Pull it, OCR the PDF, Soniox-transcribe 1–2 tapes,
build the correction+tagging script, produce corrected subs for those tapes,
diff against the `.whisper.bak`, and present the before/after for review BEFORE
doing the whole course or other courses.

## 7. Deliverables

1. A generalized Soniox transcriber (or a flag on `transcribe-soniox.js`) for
   flat per-file audio.
2. `module-convert/correct-drill-subs.js` (LLM correction + language tagging).
3. `configs/drills-<course>/` for the piloted course.
4. Corrected `.mp3.json` subs for the pilot, with `.whisper.bak` backups and a
   short before/after report (sample diffs, counts, cost).
5. A note in `module-convert/README.md` documenting the drills re-subtitle flow.
