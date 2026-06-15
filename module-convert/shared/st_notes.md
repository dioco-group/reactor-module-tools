# ALC Student Text — Conversion Rules (ST track)

Convert one ALC **Student Text** lesson (markdown) into ONE v2 `.module`.
The Student Text is the classroom book: vocabulary presentations, dialogs,
reading passages, grammar boxes, and drills. These rules are shared across **all**
ST books (1, 4, 24, …).

**Read `alc_common.md` first** — it has the track-agnostic core (the 5 types and
how to choose, presentation+task split, convert-every-item, INTRO/INSTRUCTION,
images, SKIP/DEFER, titles/naming, output rules). This file is only the **ST
delta**: what differs because the Student Text has **no tape**.

## No tape (the defining ST difference)

There is **NO cassette audio** for the Student Text. Never emit inline `{clip.mp3}`
tokens or `@start-end` timings — all audio is generated TTS downstream. (The
Language Laboratory Activities book is converted separately and HAS audio.)

Consequences vs the common core:
- **Do NOT fabricate `INTRO:` narration.** The ST has no tape, so there is no
  source intro to carry over. Omit `INTRO:` unless the book itself prints lead-in
  text for that activity. (`INSTRUCTION:` still belongs — see below.)
- **Instructions DO belong here**, because they need adapting from book to
  software (`circle` → `tap`, `write` → `type`). Put the adapted direction in
  `INSTRUCTION:`.
- **Grammar boxes: reproduce, don't explain.** Convert the book's tables and the
  exact phrases it prints. Do NOT add explanatory prose the book doesn't have
  (`"This" is for something close…`). Expansion happens at the combination stage.

## Header

```
$MODULE Lesson <N>: <short descriptive topic>   (title rides the $MODULE line — e.g. "$MODULE Lesson 1: Sports and Games" — NEVER a bare "Lesson 1")
FORMAT: 2
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

## VOCAB is underline-driven and applies EVERYWHERE — including dialogs

Wherever the book underlines a word or phrase (a dialog turn, a sentence list, a
numbered presentation), emit it as a `VOCAB:` line immediately **before** the
`LINE:` or speaker line that contains it. This is how the underlined function
phrases in a greeting dialog (`How are you?`, `Fine, thanks.`, `See you later.`,
`Okay`, `Goodbye`) become dictionary units. One dictionary unit per `VOCAB` line;
split multi-phrase underline spans (`Okay. Goodbye.` → `VOCAB: Okay` +
`VOCAB: Goodbye`). Never drop the underlined items, and never reproduce the
underline markup in text.

**Placement matters — each `VOCAB` attaches to the NEXT line, so it must sit
directly above the line that actually contains it.** NEVER cluster all of an
activity's `VOCAB` lines at the top (they would all attach to the first line and
render there). Correct:
```
Bill: Good morning.
VOCAB: How are you?
Bob: Good morning. How are you?
VOCAB: Fine, thanks.
Bill: Fine, thanks. How are you?
```
not all six `VOCAB` lines stacked before `Bill: Good morning.`.

## Section mapping (ST source → activity)

- **Vocabulary presentations** ("Repeat and read these new words and sentences",
  numbered words with pictures) → `$DIALOGUE REPEAT`, one `LINE` per sentence,
  `VOCAB:` for the underlined word(s) before their line — **one word/phrase per
  `VOCAB` line** — the picture inline on its line (`{page_005_001.jpg}`).
  - **Headword + example layout.** When a numbered item shows a **headword AND an
    example sentence** (both often underlined — e.g. `listen (to)` /
    `Listen to the teacher.`), the headword is the `VOCAB:` and the example
    sentence is the `LINE:` (with its picture). Emit exactly ONE `VOCAB` (the
    headword) and ONE `LINE` (the example sentence) per item. Do **NOT** emit a
    `LINE:` that merely repeats the headword, and do **NOT** turn the example
    sentence into its own `VOCAB:`. So:
    ```
    VOCAB: listen (to)
    LINE: Listen to the teacher. {page_015_001.jpg}
    ```
    not `VOCAB: listen (to)` / `LINE: listen (to)` / `VOCAB: Listen to the teacher.` / `LINE: …`.
- **Sentence lists / "Repeat the sentences"** → `$DIALOGUE REPEAT`, one LINE per
  sentence (split multi-sentence items).
- **Dialogs** ("Repeat and read the dialog") → `$DIALOGUE REPEAT` with screenplay
  speakers. Keep each underlined function phrase as a `VOCAB:` line just before the
  speaker line that says it.
- **Reading paragraphs** → `$DIALOGUE` (no REPEAT), `Narrator:`/`LINE:`,
  **ONE sentence per LINE** (two only when both are very short) — NEVER a whole
  paragraph on one line; keep any picture inline on the line it illustrates
  (repeat the same image on every line of its span — there is no carry-over).
  A complex visual every line refers to (a map, a calendar) goes activity-wide on
  the marker title line: `$DIALOGUE Title {page_XXX_YYY.jpg}`.
- **"Answer these questions about the paragraphs"** → `$PRODUCE` with
  `INPUT: type` + `CHECK: llm` and `SHOW_PROMPT` (the book prints the
  questions — they must be readable, not blurred): `PROMPT` = the question,
  `RESPONSE` = a full model answer composed from the passage (any phrasing with
  the right meaning passes the LLM grader).
- **Speaking Skill word lists** (minimal pairs, pronunciation lists — the words
  ARE printed) → `$DIALOGUE REPEAT`, ONE WORD (or word pair) per LINE.
- **Grammar boxes** → `$GRAMMAR` with clean markdown (tables fine), reproducing the
  book's content faithfully (no invented explanatory prose). Put taught phrases in
  {curly braces} sparingly for tappable audio.
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
  the options ONCE at the activity level when they repeat across items (shared pool).
- **Cued Q&A drills** ("Ted/work/late/last week") → `$PRODUCE` (speak/reveal):
  `TEMPLATE` = the cue, `RESPONSE` = question + short answer as the model.
- **Picture Q&A** (pictures + cue words → write Q and A) → `$PRODUCE`:
  picture inline on the `TEMPLATE` (cue text), `RESPONSE` = model question +
  answer.
- **Partner/classmate dialog completion** ("Work with a classmate...") → `$CHAT`
  with a `SCENARIO` capturing the communicative goal and an `INITIAL_PROMPT`.

## SKIP (ST-specific additions to the common SKIP list)

- **Listening Skills** (same/different, sound selection, "listen and write",
  DICTATION) — the spoken stimuli exist only in the instructor manual; there is
  no audio to play. Do NOT fabricate them as TTS items.
- **Alphabetizing**, timed reading, contents/outline tables, printed page
  numbers, "ST Page" tables.
- Teacher-led items that need a teacher ("Answer your teacher's questions").

## ST formatting notes (extending the common image/layout rules)

- **HTML layouts.** The ST markdown often uses flex/side-by-side `<div>` layouts
  and HTML tables (calendars). Flatten them; a complex visual (a calendar, a map)
  becomes an **image**, not a transcribed table.
- **Grammar tables: no empty leading cells.** When a source cell stacks variants
  with `<br>` (`It's | a book.<br>a pen.<br>a pencil.`), expand it into clean
  repeated rows (`| It's | a book. |` / `| It's | a pen. |` / `| It's | a pencil. |`),
  carrying the leading word into every row — never leave the first column blank.
- Reference info the learner answers FROM (tables, maps) must be on screen:
  repeat it in a compact `TEMPLATE` on every item, or use an activity-wide image
  on the marker title line (`$PRODUCE Title {page.jpg}`).
