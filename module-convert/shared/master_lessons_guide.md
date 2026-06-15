# ALC English — Master Lessons Guide

How to recreate ALC Book lessons as **master lessons**: the Student Text (ST)
and Language Laboratory Activities (LLA) material for one source lesson,
reorganized into a clean, pedagogically sequenced unit.

## Course structure

```
COURSE  "ALC English"                 (repo: alc-english, course.course)
└── MODULE per source lesson          (book-4-lesson-1.module, book-4-lesson-2.module, …)
    └── LESSON per part               ($LESSON 1A: Sports and Games … 1E)
```

- **One module file per source lesson** — no combining, no include machinery.
  `book-4-lesson-1.module` holds the ~5 `$LESSON`s (1A…1E) built from ST
  Lesson 1 + LLA 1A–1D. Books exist as the filename/title prefix
  ("Book 4 · Lesson 1: …"), which also makes the module list sort correctly.
- Each module has its own asset folder (`book-4-lesson-1/`), per the standard
  module-folder convention.
- **Lesson ids** like "1A" here are the *recreated* parts — NOT the same thing
  as source LLA 1A. Inside this repo, "1A" always means "Lesson 1, part A".

## The hard rule: no bleeding between source lessons

Material from ST Lesson N and LLA NA–ND may be reorganized freely **within
unit N**, but never moved into another unit. The unit file boundary enforces
this — when writing unit-2, only ST Lesson 2 and LLA 2A–2D are sources.

## The ~5-part template (adapt per unit)

| Part | Theme | Content |
|---|---|---|
| A | Core vocabulary | vocab presentations (cassette versions preferred), recognition selects, early dialogs, a CHAT if the unit has a conversational function |
| B | Secondary vocabulary / topic | second vocab cluster, comprehension selects, reading + LLM questions |
| C | Grammar core | talk-through `$GRAMMAR` + mechanical drills (typed cloze, word repeats, sound selects) |
| D | Grammar extensions | negatives/questions/etc.: `$GRAMMAR` + transformation and Q&A drills |
| E | Stories & conversations | narrations + comprehension, listen-and-fill, dialogs, dictation, free-form LLM items |

Aim for **~10 activities per lesson** (grammar references count). Order within
a lesson: vocabulary → recognition → mechanical → communicative/free-form.

## Selection & dedupe policy

- **Same content + same modality = duplicate** → keep ONE, preferring the
  version with real cassette audio (LLA) over TTS (ST).
- **Same content, different modality** (repeat list vs discrimination select,
  recognize vs produce) → keep both, receptive before productive.
- Clip-backed activities are copied **verbatim** from the verified source
  modules — any text change detaches the cassette audio. Editing freedom
  (rewording, merging, trimming items) exists only for TTS-only content.
- Drop: instructor-led items, alphabetizing, contents tables, third copies of
  pronunciation lists.
- **Pronunciation drills are scattered**: roughly one short "sound break" per
  lesson, placed mid-lesson between mechanical blocks.
- Bias item selection toward **recycling earlier vocabulary** (callbacks) over
  novelty when trimming.

## Grammar style (talk-through, not tables)

3–5 short paragraphs: name the pattern in plain words → show it with a
before/after example → note the trap. Keep the reference table if it earns its
space. Tappable {phrases} on the key forms. Example register:

> In English, when something happened **yesterday** — and it's finished — the
> verb changes: you add **-ed**.
>
> *We walk to class every day.* → *We **walked** to class **yesterday**.*
>
> That's the whole trick for regular verbs: {play} → {played}. If the verb
> already ends in *-e*, just add *-d*: {close} → {closed}.

Each drill's INTRO echoes its grammar point in one clause ("Remember: did +
base form"), so the learner never needs to swipe back.

## Conventions

- Header per unit file: `FORMAT: 2`, descriptive TITLE per lesson part
  (`$LESSON 1A: Sports and Games`), `TARGET_LANG_G: en`, `HOME_LANG_G: en`.
- Voices: `VOICE_DEFAULT: aoede`, `VOICE_PROMPT: gacrux`,
  `VOICE_RESPONSE: schedar`, plus one `VOICE:` per dialog speaker (match the
  CASSETTE voice gender, not the book's printed name).
- INTRO tone: one warm, brief teacher voice everywhere; standalone sentences
  (no "look at the figure below"); statements, not questions.
- INPUT/CHECK policy: mechanical cloze → `type`/`exact`; oral transformation →
  `speak`/`reveal`; open comprehension → `speak`/`llm` (or `type`/`llm` if the
  book has the learner write) (+ `SHOW_PROMPT` when the book prints the questions).
- Provenance: every activity gets a `# Source:` comment (e.g.
  `# Source: LLA 1B Figure 2`). The master is a fork — source edits don't
  auto-propagate, so provenance is how you find your way back.

## Assets

- One asset folder per served module (`book-4/…`), populated by the build step
  from the source module folders (`data/alc-lla-4/module/lesson-*/`) and ST
  images (`data/alc-st-4/pdf-extract/source/images/`).
- **Collision rule**: LLA clip names are already namespaced
  (`bk04-l<lesson>-f<fig>-…`). LLA images keep their `page_XXX_YYY.jpg` names;
  **ST images are referenced and copied as `st-page_XXX_YYY.jpg`** (the page
  numbering overlaps the LLA book's).
- All images at the 512px recomposed standard. Regenerate any old 1024
  strict-style images before use (`RECOMPOSE=1 MAX_SIZE=512 PAGES=…`).

## Build & validation

1. Author/modify `data/alc-english/book-<B>-lesson-<N>.module`.
2. `node module-convert/stage-master.mjs book-<B>-lesson-<N>` — validates and
   stages in one step (all must pass; the script refuses to stage otherwise):
   - linter clean + parser round-trip,
   - **clip-text identity check**: every clip-bearing line is byte-identical
     to a line in its LLA source module (this is what catches hand-assembly
     drift that would detach cassette audio from its text),
   - every referenced asset found and staged (LLA from the source module
     folders, `st-page_*` from the ST images dir).
3. Commit + push the staging clone (`/tmp/alc-english`) to the `alc-english`
   repo. Asset URLs are commit-pinned by the backend, so no cache concerns.
