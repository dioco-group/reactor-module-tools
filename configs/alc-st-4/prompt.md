# ALC Student Text (Book 4) — Conversion Rules

Convert one ALC **Student Text** lesson (markdown) into ONE v2 `.module`.
The Student Text is the classroom book: vocabulary presentations, dialogs,
reading passages, grammar boxes, and drills.

## No tape

There is **NO cassette audio** for the Student Text. Never emit inline `{clip.mp3}`
tokens or `@start-end` timings — all audio is generated TTS downstream. (The
Language Laboratory Activities book is converted separately and HAS audio.)

## Header

```
$MODULE
FORMAT: 2
TITLE: Lesson <N>: <short descriptive topic>   (e.g. "Lesson 1: Sports and Games" — NEVER a bare "Lesson 1")
DESCRIPTION: <one line>
TARGET_LANG_G: en
HOME_LANG_G: en
VOICE_DEFAULT: aoede | Clear, friendly American English narrator
```

Use ONLY these voice names: aoede, achernar, achird, schedar, gacrux. Declare a
voice per dialog speaker (`VOICE: David | achernar | Male student`); speaker ids
are alnum, not ALL-CAPS, and prefix screenplay-style lines (`David: Hi, Robert.`).
Also declare distinct drill voices so questions and model answers don't sound
like the narrator:
```
VOICE_PROMPT: achird | Questions and cues, read clearly
VOICE_RESPONSE: schedar | Model answers, warm and clear
```

One `$LESSON` for the whole ST lesson. Preserve the book's section order.

## Two principles (same as the LLA conversions)

- **A book section is presentation + task — split it into single-purpose
  activities.** A section that presents a passage and then asks questions is
  TWO activities: a `$DIALOGUE` (the passage) followed by a `$PRODUCE`/`$SELECT`
  (the questions). Never bloat one activity with both.
- **Choose `$SELECT` vs `$PRODUCE` by what the learner DOES, not by the printed
  heading.** "Answer the questions" where the learner picks among printed
  statements → `$SELECT`; only when they must produce the words (say/type)
  → `$PRODUCE`.

## Section mapping

- **Vocabulary presentations** ("Repeat and read these new words and sentences",
  numbered words with pictures) → `$DIALOGUE REPEAT`, one `LINE` per sentence,
  `VOCAB:` for the underlined word(s) before their line — **one word/phrase per
  `VOCAB` line** (repeatable; each is a dictionary unit) — the picture inline on
  its line (`{page_005_001.jpg}`). Underlines mark the taught word — use them for
  `VOCAB`, do not reproduce underline markup in text.
- **Sentence lists / "Repeat the sentences"** → `$DIALOGUE REPEAT`, one LINE per
  sentence (split multi-sentence items).
- **Dialogs** ("Repeat and read the dialog") → `$DIALOGUE REPEAT` with screenplay
  speakers.
- **Reading paragraphs** → `$DIALOGUE` (no REPEAT), `Narrator:`/`LINE:`,
  **ONE sentence per LINE** (two only when both are very short) — NEVER a whole
  paragraph on one line; keep any picture inline on the line it illustrates
  (repeat the same image on every line of its span — there is no carry-over).
  A complex visual every line refers to (a map, a calendar) goes activity-wide:
  `IMAGE: page_XXX_YYY.jpg` before the first line.
- **"Answer these questions about the paragraphs"** → `$PRODUCE` with
  `INPUT: either` + `CHECK: llm` and `SHOW_PROMPT` (the book prints the
  questions — they must be readable, not blurred): `PROMPT` = the question,
  `RESPONSE` = a full model answer composed from the passage (any phrasing with
  the right meaning passes the LLM grader).
- **Speaking Skill word lists** (minimal pairs, pronunciation lists — the words
  ARE printed) → `$DIALOGUE REPEAT`, ONE WORD (or word pair) per LINE.
- **Grammar boxes** → `$GRAMMAR` with clean markdown (tables fine). Put taught
  phrases in {curly braces} sparingly for tappable audio.
- **Transformation drills** ("Change the sentences to simple past") →
  `$PRODUCE` (speak/reveal): `TEMPLATE` = the source sentence with its `(cue)`,
  `RESPONSE` = the transformed sentence. The book's EXAMPLE becomes an `EXAMPLE`
  item with the same TEMPLATE scaffolding as regular items.
- **Written one-answer cloze** ("Write the word on the line", a single correct
  form) → `$PRODUCE` with `INPUT: type` + `CHECK: exact`: `TEMPLATE` = the
  gapped sentence, `RESPONSE` = the **full completed sentence** (what's shown
  and TTS-read at reveal), `ACCEPT` = the bare word(s) the learner actually
  types (`ACCEPT: visited`, multiple alternates `|`-separated).
- **Completion drills** ("Complete the sentences. Use the word again.") →
  `$PRODUCE` (speak/reveal): `TEMPLATE` = context sentence + the gapped line
  **joined on ONE line** (` — ` between them; a TEMPLATE is always a single
  line), `RESPONSE` = the completed sentence.
- **Multiple choice / matching / true-false** (if present) → `$SELECT`; declare
  the options ONCE at the activity level when they repeat across items (shared
  pool); say "Tap", never "Circle".
- **Cued Q&A drills** ("Ted/work/late/last week") → `$PRODUCE` (speak/reveal):
  `TEMPLATE` = the cue, `RESPONSE` = question + short answer as the model.
- **Picture Q&A** (pictures + cue words → write Q and A) → `$PRODUCE`:
  picture inline on the `TEMPLATE` (cue text), `RESPONSE` = model question +
  answer.
- **Partner/classmate dialog completion** ("Work with a classmate...") → `$CHAT`
  with a `SCENARIO` capturing the communicative goal and an `INITIAL_PROMPT`.

## SKIP entirely

- **Listening Skills** (same/different, sound selection, "listen and write",
  DICTATION) — the spoken stimuli exist only in the instructor manual; there is
  no audio to play. Do NOT fabricate them as TTS items.
- **Alphabetizing**, timed reading, contents/outline tables, printed page
  numbers, "ST Page" tables.
- Teacher-led items that need a teacher ("Answer your teacher's questions").

## Conventions (same as the LLA conversions)

- Monolingual: no `*_T` fields; translations are generated downstream.
- Prompts are STATEMENTS of what to do, never questions to the learner.
- An instruction is never a spoken `PROMPT`; instructions go in `INTRO:` (spoken
  once, 1–3 sentences, standalone — no "look at the picture below" deixis) and
  `INSTRUCTION:` (short on-screen text).
- **Map print verbs to app interactions**: "circle the letter" → "tap", "write
  on the line" → "type". Never reference the book, pages, circling, or printed
  letters in INTRO/INSTRUCTION text.
- **Strip the book's item numbers** from content: never `LINE: 1. The boys…` —
  TTS would read "one." aloud. Numbering is print apparatus, like page numbers.
- `TEMPLATE` is display-only and never read aloud; cloze gaps use `____`; a
  cloze stimulus must be a `TEMPLATE`, never a `PROMPT` (a clip-less PROMPT is
  TTS-read, which would voice the gaps).
- EXAMPLE items carry the same TEMPLATE scaffolding as their regular items.
- Reference info the learner answers FROM (tables, maps) must be on screen:
  repeat it in a compact `TEMPLATE` on every item, or use an activity-wide
  `IMAGE:`.
- **No raw HTML** — the ST markdown contains flex/side-by-side `<div>` layouts
  and HTML tables (calendars): flatten to linear content; a complex visual (a
  calendar, a map) belongs as an **image**, not a transcribed table.
- Don't emit printed page numbers or "ST Page" artifacts as content.
- Separate items with a blank line. Output ONLY the .module text.
